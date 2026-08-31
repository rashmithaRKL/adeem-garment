-- 0013_rejection.sql
-- The factory files a rejection report: how many pieces each sewing line threw
-- out, style by style, day by day. It has nowhere to live.
--
-- production_records answers "how much did this line make against its target",
-- and a reject is not a negative production figure -- the pieces were made, then
-- discarded. Bending them into actual_quantity would have meant a line that
-- rejected 6 of 623 reading as a line that produced 6, which is what the
-- importer very nearly did before the column guard stopped it. So rejection gets
-- its own tables, the way quality did, rather than a column bolted onto a table
-- that means something else.
--
-- The shape follows quality_uploads / quality_inspections exactly: one upload row
-- per workbook, child rows cascading off it, and RLS that lets an employee write
-- only under an upload they own. Two importers behaving identically is worth more
-- than either one being individually clever.

-- ---------------------------------------------------------------------------
-- 1. Tables
-- ---------------------------------------------------------------------------
create table if not exists rejection_uploads (
  id                uuid primary key default gen_random_uuid(),
  uploaded_by       uuid not null references profiles (id) on delete cascade,
  original_filename text not null,
  file_hash         text not null,
  sheet_names       text[] not null default '{}',
  -- the window the workbook covers, so a screen can pick the latest report
  period_start      date,
  period_end        date,
  record_count      int not null default 0,
  created_at        timestamptz not null default now()
);

-- One row per (line, date, style) the report names.
--
-- The workbook is banded -- one five-column block per line, side by side under a
-- merged "Line 01" heading -- so the line is read from that heading rather than
-- from a column, and the sheet is unpivoted on the way in. Stored long, like
-- quality_inspections: the factory adds a line by adding a block, and a wide
-- table would need a migration every time it did.
create table if not exists rejection_records (
  id              uuid primary key default gen_random_uuid(),
  upload_id       uuid not null references rejection_uploads (id) on delete cascade,

  line_no         int  not null,
  -- as the sheet wrote it ("Line 01"), kept so the import can be reconciled
  -- against the source without reopening the workbook
  line_label      text,

  production_date date not null,
  style_number    text,

  -- The order this style was rejected out of. Nullable because the report states
  -- the order quantity as context for the percentage, not as a figure of its own,
  -- and a blank cell is a missing note rather than a zero-piece order.
  order_qty       int,
  reject_qty      int  not null default 0,

  -- Rejects per hundred pieces ordered.
  --
  -- Derived on import, never read from the sheet's own "%" column: that column
  -- holds a percentage typed as a plain number (0.963 meaning 0.963%, 10 meaning
  -- 10%), while every other percent-formatted cell in this system arrives as a
  -- fraction. One of those two readings is wrong for any given cell and the sheet
  -- does not say which, so the figure is computed from the two counts beside it
  -- and therefore always agrees with them.
  reject_pct      numeric(6,2),

  created_at      timestamptz not null default now(),

  constraint rejection_records_qty_sane check (reject_qty >= 0),
  constraint rejection_records_order_sane check (order_qty is null or order_qty >= 0)
);

-- ---------------------------------------------------------------------------
-- 2. Indexes -- every column a screen will filter or group on
-- ---------------------------------------------------------------------------
create index if not exists rejection_uploads_owner_idx
  on rejection_uploads (uploaded_by, created_at desc);
create index if not exists rejection_uploads_hash_idx
  on rejection_uploads (file_hash);

create index if not exists rejection_records_date_idx
  on rejection_records (production_date desc);
create index if not exists rejection_records_line_date_idx
  on rejection_records (line_no, production_date desc);
create index if not exists rejection_records_style_idx
  on rejection_records (style_number);
create index if not exists rejection_records_upload_idx
  on rejection_records (upload_id);

-- ---------------------------------------------------------------------------
-- 3. Row level security
-- ---------------------------------------------------------------------------
alter table rejection_uploads enable row level security;
alter table rejection_records enable row level security;

-- An upload row may only be created in your own name. It is the anchor the child
-- policy hangs off, so forging it is the only way in -- and current_profile_id()
-- reads from the JWT, which the browser cannot fake.
drop policy if exists rej_uploads_insert on rejection_uploads;
create policy rej_uploads_insert on rejection_uploads
  for insert with check (uploaded_by = current_profile_id());

drop policy if exists rej_uploads_read on rejection_uploads;
create policy rej_uploads_read on rejection_uploads
  for select using (uploaded_by = current_profile_id() or is_manager());

drop policy if exists rej_uploads_manage on rejection_uploads;
create policy rej_uploads_manage on rejection_uploads
  for all using (is_manager()) with check (is_manager());

-- A failed import deletes its own upload row so a half-written report never shows
-- as a successful one, and that has to work for the employee who created it --
-- hence delete on your own upload, not only on a manager's.
drop policy if exists rej_uploads_delete_own on rejection_uploads;
create policy rej_uploads_delete_own on rejection_uploads
  for delete using (uploaded_by = current_profile_id());

-- Child rows: insert only under an upload you own. Reads are open to any
-- signed-in user, as they are for quality -- factory-wide rejection is not a
-- per-employee secret, and the dashboards are read by everyone on the floor.
drop policy if exists rej_records_insert on rejection_records;
create policy rej_records_insert on rejection_records
  for insert with check (exists (
    select 1 from rejection_uploads u
    where u.id = rejection_records.upload_id
      and u.uploaded_by = current_profile_id()
  ));

drop policy if exists rej_records_read on rejection_records;
create policy rej_records_read on rejection_records
  for select using (auth.uid() is not null);

drop policy if exists rej_records_manage on rejection_records;
create policy rej_records_manage on rejection_records
  for all using (is_manager()) with check (is_manager());

-- ---------------------------------------------------------------------------
-- 4. Realtime -- an upload refreshes any screen already open
-- ---------------------------------------------------------------------------
do $$ begin
  alter publication supabase_realtime add table rejection_records;
exception when duplicate_object then null; end $$;

do $$ begin
  alter publication supabase_realtime add table rejection_uploads;
exception when duplicate_object then null; end $$;
