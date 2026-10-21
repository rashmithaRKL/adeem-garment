-- 0014_final_verdict.sql
-- The final inspection report is filed one tab per month, one row per style: the
-- date, the sample pulled, the major defects found in it, the line that sewed it,
-- and a PASS or FAIL against AQL 2.5. Only the Summary tab used to be imported,
-- so the line-by-line final inspection was built from the FINAL columns of the
-- KPI sheets instead -- which the floor leaves at zero failures -- and every line
-- read "Passed" in a month where nine styles had failed.
--
-- The month tabs are now imported, and each style keeps the verdict it was given.
-- That verdict is the figure the factory reports on (its "1st time pass rate" is
-- passed styles over styles inspected), and it cannot be rebuilt from the piece
-- counts beside it: a style fails on its major defects against the sample size,
-- not on any one percentage. So it is stored as written.

-- ---------------------------------------------------------------------------
-- 1. The verdict, on the rows that carry one
-- ---------------------------------------------------------------------------
-- Null on every row that is not a style off a month tab, which is every row
-- imported before this migration and every row from the other four reports.
alter table quality_inspections
  add column if not exists verdict text;

do $$ begin
  alter table quality_inspections
    add constraint quality_inspections_verdict_check
    check (verdict is null or verdict in ('pass', 'fail'));
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------------
-- 2. Styles inspected for more than one line
-- ---------------------------------------------------------------------------
-- The tabs sometimes credit one style to two lines ("1 & 4"). line_no keeps the
-- first, so every existing per-line read still works; the rest are listed here.
-- One row per style rather than one per line, so the factory total counts the
-- style once -- as the Summary does -- while each line it names counts it too.
alter table quality_inspections
  add column if not exists shared_lines int[];

-- ---------------------------------------------------------------------------
-- 3. Index for the verdict read
-- ---------------------------------------------------------------------------
create index if not exists quality_inspections_verdict_month_idx
  on quality_inspections (period_month, inspection_date)
  where verdict is not null;
