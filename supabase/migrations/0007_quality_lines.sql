-- 0007_quality_lines.sql
-- The quality reports name the lines they measure -- "LINE 01".."LINE 04" on the
-- KPI sheets, "Team No" 1..4 on the daily and monthly ones -- but the importer had
-- nowhere to put that, so production_lines stayed empty and the Lines screen said
-- there were none. This registers a line the first time a report mentions it.

-- ---------------------------------------------------------------------------
-- 1. Registering a line from an import
-- ---------------------------------------------------------------------------
-- production_lines is admin-only under RLS (lines_admin), and that stays true:
-- widening it so employees could write the table directly would let any employee
-- rename or deactivate a line. Instead this function runs as its owner and does
-- exactly one thing -- create a missing line, never update an existing one --
-- so the privilege it lends out cannot be turned to anything else.
create or replace function register_production_line(p_line_no int, p_name text default null)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  -- Only a real, signed-in profile may register lines.
  if current_profile_id() is null then
    raise exception 'A profile is required to register a production line.';
  end if;

  if p_line_no is null or p_line_no <= 0 then
    return null;
  end if;

  select id into v_id from production_lines where line_number = p_line_no;
  if v_id is not null then
    return v_id;  -- already known; the sheet does not get to rename it
  end if;

  insert into production_lines (line_number, line_name, department, status, active)
  values (
    p_line_no,
    coalesce(nullif(btrim(p_name), ''), 'LINE ' || lpad(p_line_no::text, 2, '0')),
    'Sewing',
    'idle',      -- no production data has been seen for it yet
    true
  )
  on conflict (line_number) do nothing
  returning id into v_id;

  -- Another import may have won the race; fetch whatever is there now.
  if v_id is null then
    select id into v_id from production_lines where line_number = p_line_no;
  end if;

  return v_id;
end $$;

revoke all on function register_production_line(int, text) from public, anon;
grant execute on function register_production_line(int, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 2. Backfill
-- ---------------------------------------------------------------------------
-- Reports imported before this migration existed already carry their line
-- numbers, so the lines they describe are created here rather than requiring
-- every workbook to be uploaded a second time.
-- status is cast explicitly: in INSERT ... SELECT a bare literal is typed as text
-- and will not coerce to the enum on its own, unlike the VALUES form above.
insert into production_lines (line_number, line_name, department, status, active)
select distinct
       qi.line_no,
       'LINE ' || lpad(qi.line_no::text, 2, '0'),
       'Sewing'::text,
       'idle'::line_status,
       true
from quality_inspections qi
where qi.line_no is not null
  and qi.line_no > 0
on conflict (line_number) do nothing;
