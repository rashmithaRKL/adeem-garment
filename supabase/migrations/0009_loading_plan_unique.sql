-- 0009_loading_plan_unique.sql
-- The loading plan can now be imported from a workbook rather than typed in, and
-- an import has to be repeatable: a planner corrects Thursday's sheet and uploads
-- it again, and the second upload must update the styles rather than queue a
-- second copy of every one of them.
--
-- That needs a key. One style runs on one line once at a time, so (line_no,
-- style_number) is it — the same rule the entry form already assumed.

-- Any duplicates entered by hand before this constraint existed are collapsed to
-- the most recent row, which is the one a person would have meant to keep.
delete from loading_plan a
using loading_plan b
where a.line_no = b.line_no
  and lower(btrim(a.style_number)) = lower(btrim(b.style_number))
  and (a.created_at, a.id) < (b.created_at, b.id);

create unique index if not exists loading_plan_line_style_idx
  on loading_plan (line_no, style_number);
