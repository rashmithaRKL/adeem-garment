-- 0008_hr_loading_plan.sql
-- Two subjects the database had no room for, both asked for by name on the
-- client's specification: HR (how many people the factory carries and how many
-- of them turned up) and the loading plan (which style each line takes next,
-- and the dates it has to hit on the way there).
--
-- Neither fits the existing tables. production_records compares produced against
-- target and quality_inspections counts pieces checked; headcount and a planned
-- style are facts about people and about the future, not about output.
--
-- Writes come from the browser under RLS, as with the quality tables: these are
-- typed in by an administrator rather than imported, so an Edge Function would
-- add a deployment step without adding a guarantee RLS does not already give.

-- ---------------------------------------------------------------------------
-- 1. HR -- one row per working day per department
-- ---------------------------------------------------------------------------
-- "Carder" is the factory's own word for sanctioned headcount. Direct carder is
-- the people on the line producing garments; indirect carder is everyone who
-- keeps that possible -- mechanics, stores, quality, supervision. The two are
-- kept apart because the ratio between them is the number HR is actually
-- managing, and summing them at import time would throw it away.
create table if not exists hr_attendance (
  id              uuid primary key default gen_random_uuid(),
  work_date       date not null,
  -- Free text, not a foreign key: the split HR reports on ("Sewing", "Cutting",
  -- "Finishing", "Factory") does not line up with production_lines, and forcing
  -- it to would mean inventing lines that do not exist.
  department      text not null default 'Factory',

  direct_carder   int  not null default 0 check (direct_carder   >= 0),
  indirect_carder int  not null default 0 check (indirect_carder >= 0),
  present         int  not null default 0 check (present >= 0),
  absent          int  not null default 0 check (absent  >= 0),
  on_leave        int  not null default 0 check (on_leave >= 0),
  remarks         text,

  recorded_by     uuid references profiles (id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  -- One figure per department per day. A second entry is a correction to the
  -- first, not an extra department's worth of people.
  unique (work_date, department)
);

-- ---------------------------------------------------------------------------
-- 2. Loading plan -- the styles queued behind what a line is running now
-- ---------------------------------------------------------------------------
-- The date columns are the garment industry's standard milestones, and they are
-- stored separately rather than as one "due date" because the whole point of the
-- screen is to see which of them is about to be missed:
--   pp_date  pre-production meeting
--   pcd      planned cut date
--   psd      planned sewing (start) date
--   ped      planned end date
create table if not exists loading_plan (
  id            uuid primary key default gen_random_uuid(),
  -- Matched against production_lines.line_number rather than referencing its id,
  -- for the same reason the quality tables do: a plan is often entered for a line
  -- before that line has been registered.
  line_no       int  not null check (line_no > 0),

  style_number  text not null,
  order_number  text,
  -- This factory makes school uniforms; the buyer is a school, and the sheets
  -- name that column "school name".
  school_name   text,
  order_qty     int  not null default 0 check (order_qty >= 0),

  pp_date       date,
  pcd           date,
  psd           date,
  ped           date,

  status        text not null default 'upcoming'
                check (status in ('upcoming', 'in_progress', 'completed', 'hold')),
  -- Position in that line's queue. The next style is the lowest sequence still
  -- open, so re-ordering the queue never means retyping the dates.
  sequence      int  not null default 1,
  remarks       text,

  created_by    uuid references profiles (id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- 3. Indexes -- the columns these screens sort and filter on
-- ---------------------------------------------------------------------------
create index if not exists hr_attendance_date_idx on hr_attendance (work_date desc);
create index if not exists hr_attendance_dept_idx on hr_attendance (department, work_date desc);

create index if not exists loading_plan_line_idx   on loading_plan (line_no, sequence);
create index if not exists loading_plan_status_idx on loading_plan (status);
create index if not exists loading_plan_psd_idx    on loading_plan (psd);

-- ---------------------------------------------------------------------------
-- 4. updated_at
-- ---------------------------------------------------------------------------
drop trigger if exists hr_attendance_touch on hr_attendance;
create trigger hr_attendance_touch before update on hr_attendance
  for each row execute function touch_updated_at();

drop trigger if exists loading_plan_touch on loading_plan;
create trigger loading_plan_touch before update on loading_plan
  for each row execute function touch_updated_at();

-- ---------------------------------------------------------------------------
-- 5. Row level security
-- ---------------------------------------------------------------------------
-- Read for anyone signed in -- the dashboard charts manpower and the loading
-- plan for everyone, and a supervisor needs to know what their line takes next.
-- Write for administrators only: these are entered by hand, and a wrong carder
-- figure silently rewrites every absenteeism percentage on the system.
alter table hr_attendance enable row level security;
alter table loading_plan  enable row level security;

drop policy if exists hr_read on hr_attendance;
create policy hr_read on hr_attendance
  for select using (auth.uid() is not null);

drop policy if exists hr_admin on hr_attendance;
create policy hr_admin on hr_attendance
  for all using (is_admin()) with check (is_admin());

drop policy if exists lp_read on loading_plan;
create policy lp_read on loading_plan
  for select using (auth.uid() is not null);

drop policy if exists lp_admin on loading_plan;
create policy lp_admin on loading_plan
  for all using (is_admin()) with check (is_admin());

-- ---------------------------------------------------------------------------
-- 6. Realtime -- an entry made on one screen lands on the dashboards already open
-- ---------------------------------------------------------------------------
do $$ begin
  alter publication supabase_realtime add table hr_attendance;
exception when duplicate_object then null; end $$;

do $$ begin
  alter publication supabase_realtime add table loading_plan;
exception when duplicate_object then null; end $$;
