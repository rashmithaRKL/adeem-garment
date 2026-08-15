-- 0010_drop_pre_final.sql
-- The client does not want the pre final gate reported. The importer no longer
-- reads the PRE FINAL block off the KPI sheets, but every workbook uploaded
-- before that left rows behind, and those rows still count toward pieces
-- checked, defects found and the stage chart. Deleting them is the point of
-- this migration; dropping the enum value is what stops them coming back.

-- ---------------------------------------------------------------------------
-- 1. The rows
-- ---------------------------------------------------------------------------
delete from quality_inspections where stage = 'pre_final';

-- ---------------------------------------------------------------------------
-- 2. The vocabulary
-- ---------------------------------------------------------------------------
-- Postgres cannot remove a value from an enum in place, so the type is rebuilt
-- and the column moved across. The cast goes through text because the old and
-- new types are unrelated to each other as far as the planner is concerned.
-- quality_inspections_stage_idx is rebuilt automatically by the column rewrite.
do $$
begin
  if exists (
    select 1 from pg_enum e
    join pg_type t on t.oid = e.enumtypid
    where t.typname = 'quality_stage' and e.enumlabel = 'pre_final'
  ) then
    alter type quality_stage rename to quality_stage_old;

    create type quality_stage as enum
      ('in_line', 'end_line', 'appearance', 'final', 'aql');

    alter table quality_inspections
      alter column stage type quality_stage using stage::text::quality_stage;

    drop type quality_stage_old;
  end if;
end $$;
