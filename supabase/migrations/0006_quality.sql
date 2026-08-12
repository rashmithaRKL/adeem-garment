-- 0006_quality.sql
-- The workbooks this factory actually produces measure quality, not output:
-- pieces checked, defects found, pass rates, AQL audits. None of that fits
-- production_records, which compares produced quantity against a target, so
-- quality gets its own tables rather than being bent into the production ones.
--
-- Writes come from the browser here, not from an Edge Function. That is a
-- deliberate departure from the production import: the functions are not
-- deployed on this project, and RLS is expressive enough to bound the damage --
-- an employee may only insert rows that hang off an upload row they own.

-- ---------------------------------------------------------------------------
-- 1. Vocabulary
-- ---------------------------------------------------------------------------
-- The five inspection points on the floor, plus the AQL audit that samples them.
do $$ begin
  create type quality_stage as enum
    ('in_line', 'end_line', 'appearance', 'pre_final', 'final', 'aql');
exception when duplicate_object then null; end $$;

-- One value per workbook layout the importer knows how to read.
do $$ begin
  create type quality_report_kind as enum
    ('line_kpi', 'daily_quality', 'monthly_quality', 'monthly_inspection', 'defect_summary');
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------------
-- 2. Tables
-- ---------------------------------------------------------------------------
create table if not exists quality_uploads (
  id                uuid primary key default gen_random_uuid(),
  uploaded_by       uuid not null references profiles (id) on delete cascade,
  report_kind       quality_report_kind not null,
  original_filename text not null,
  file_hash         text not null,
  sheet_names       text[] not null default '{}',
  -- the window the workbook covers, so the dashboard can pick the latest report
  period_start      date,
  period_end        date,
  inspection_rows   int  not null default 0,
  defect_rows       int  not null default 0,
  created_at        timestamptz not null default now()
);

-- One row per (line, date-or-month, inspection stage). Long, not wide: the
-- sheets bolt on a new stage every few months and a wide table would need a
-- migration each time.
create table if not exists quality_inspections (
  id              uuid primary key default gen_random_uuid(),
  upload_id       uuid not null references quality_uploads (id) on delete cascade,

  -- "Team No" on the daily/monthly sheets, the sheet name on KPI REPORT.
  -- Kept as a plain integer: production_lines may be empty on a fresh database,
  -- and an employee has no RLS rights to create lines.
  line_no         int,
  line_label      text,
  -- the sheets carry a "Factory" roll-up row; it is stored so the numbers can be
  -- reconciled against the source, and excluded from every aggregate.
  is_factory      boolean not null default false,

  style_number    text,
  inspection_date date,   -- daily reports
  period_month    date,   -- monthly reports, always the first of the month

  stage           quality_stage not null,
  checked_qty     int,
  pass_qty        int,
  defect_qty      int,
  pass_pct        numeric(6,2),
  defect_pct      numeric(6,2),

  created_at      timestamptz not null default now(),

  -- a row must be dated one way or the other, or it cannot be charted
  constraint quality_inspections_dated
    check (inspection_date is not null or period_month is not null)
);

-- Defect counts by named category (Uncut Threads, Oil Marks, Sewing, Fabric...).
-- Categories are free text because each report names them differently and the
-- client adds new ones without warning.
create table if not exists quality_defects (
  id              uuid primary key default gen_random_uuid(),
  upload_id       uuid not null references quality_uploads (id) on delete cascade,
  line_no         int,
  line_label      text,
  is_factory      boolean not null default false,
  inspection_date date,
  period_month    date,
  category        text not null,
  qty             int  not null default 0,
  created_at      timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- 3. Indexes -- every column the dashboard filters or groups on
-- ---------------------------------------------------------------------------
create index if not exists quality_uploads_owner_idx
  on quality_uploads (uploaded_by, created_at desc);
create index if not exists quality_uploads_hash_idx
  on quality_uploads (file_hash);

create index if not exists quality_inspections_date_idx
  on quality_inspections (inspection_date desc);
create index if not exists quality_inspections_month_idx
  on quality_inspections (period_month desc);
create index if not exists quality_inspections_line_idx
  on quality_inspections (line_no, inspection_date desc);
create index if not exists quality_inspections_stage_idx
  on quality_inspections (stage);
create index if not exists quality_inspections_upload_idx
  on quality_inspections (upload_id);

create index if not exists quality_defects_category_idx
  on quality_defects (category);
create index if not exists quality_defects_upload_idx
  on quality_defects (upload_id);

-- ---------------------------------------------------------------------------
-- 4. Row level security
-- ---------------------------------------------------------------------------
alter table quality_uploads     enable row level security;
alter table quality_inspections enable row level security;
alter table quality_defects     enable row level security;

-- An upload row may only be created in your own name. This is the anchor the
-- child-row policies below hang off, so forging it is the only way in -- and
-- current_profile_id() reads from the JWT, which the browser cannot fake.
drop policy if exists q_uploads_insert on quality_uploads;
create policy q_uploads_insert on quality_uploads
  for insert with check (uploaded_by = current_profile_id());

drop policy if exists q_uploads_read on quality_uploads;
create policy q_uploads_read on quality_uploads
  for select using (uploaded_by = current_profile_id() or is_admin());

drop policy if exists q_uploads_admin on quality_uploads;
create policy q_uploads_admin on quality_uploads
  for all using (is_admin()) with check (is_admin());

-- Child rows: insert only into an upload you own. Reads are open to any signed-in
-- user because the admin dashboard and the employee production screen both chart
-- factory-wide quality; the figures are not per-employee secrets.
drop policy if exists q_inspections_insert on quality_inspections;
create policy q_inspections_insert on quality_inspections
  for insert with check (exists (
    select 1 from quality_uploads u
    where u.id = quality_inspections.upload_id
      and u.uploaded_by = current_profile_id()
  ));

drop policy if exists q_inspections_read on quality_inspections;
create policy q_inspections_read on quality_inspections
  for select using (auth.uid() is not null);

drop policy if exists q_inspections_admin on quality_inspections;
create policy q_inspections_admin on quality_inspections
  for all using (is_admin()) with check (is_admin());

drop policy if exists q_defects_insert on quality_defects;
create policy q_defects_insert on quality_defects
  for insert with check (exists (
    select 1 from quality_uploads u
    where u.id = quality_defects.upload_id
      and u.uploaded_by = current_profile_id()
  ));

drop policy if exists q_defects_read on quality_defects;
create policy q_defects_read on quality_defects
  for select using (auth.uid() is not null);

drop policy if exists q_defects_admin on quality_defects;
create policy q_defects_admin on quality_defects
  for all using (is_admin()) with check (is_admin());

-- ---------------------------------------------------------------------------
-- 5. Realtime -- the dashboard subscribes so an upload refreshes open screens
-- ---------------------------------------------------------------------------
do $$ begin
  alter publication supabase_realtime add table quality_inspections;
exception when duplicate_object then null; end $$;

do $$ begin
  alter publication supabase_realtime add table quality_uploads;
exception when duplicate_object then null; end $$;
