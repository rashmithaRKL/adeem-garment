-- 0012_final_inspection.sql
-- Final inspection is the gate the buyer sees, and until now the screens could
-- not read it properly. Two things were wrong, and both are data-shaped rather
-- than code-shaped, so they are fixed here.
--
-- 1. The monthly inspection report's defect columns (Fabric, Sewing, Washing,
--    ...) are all counted at the final inspection, but the sheet never writes
--    that down. Every other report names the gate inside the category itself --
--    "Uncut Threads (End Line)" -- which is how the dashboard tells a gate's
--    defects apart. Untagged, these shipping-audit findings were being charted
--    as sewing-floor defects, and the final inspection had no breakdown at all.
--    The importer now tags them on the way in; this backfills the rows that were
--    imported before it did.
--
-- 2. Reading final inspection line by line means grouping on line_no, and there
--    was no index that made stage + line + date cheap.

-- ---------------------------------------------------------------------------
-- 1. Backfill the gate into monthly-inspection defect categories
-- ---------------------------------------------------------------------------
-- Scoped by the upload's report_kind, which is the only record of where a row
-- came from. Rows that already name the gate are left alone, so re-running this
-- migration cannot produce "Fabric (Final) (Final)".
update quality_defects d
   set category = btrim(d.category) || ' (Final)'
  from quality_uploads u
 where u.id = d.upload_id
   and u.report_kind = 'monthly_inspection'
   and d.category !~* '\mfinal\M';

-- ---------------------------------------------------------------------------
-- 2. Indexes for the line-wise final inspection read
-- ---------------------------------------------------------------------------
create index if not exists quality_inspections_stage_line_date_idx
  on quality_inspections (stage, line_no, inspection_date desc);

create index if not exists quality_inspections_stage_month_idx
  on quality_inspections (stage, period_month desc);

create index if not exists quality_defects_date_idx
  on quality_defects (inspection_date desc);

create index if not exists quality_defects_month_idx
  on quality_defects (period_month desc);
