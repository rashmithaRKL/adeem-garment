-- 0011_manager_role.sql
-- Three roles, not two: admin, manager, employee.
--
-- The line the client drew is between the management side and the floor:
--
--   employee  files workbooks and reads their own history
--   manager   runs the factory -- every screen, every write
--   admin     the same, exactly
--
-- Admin and manager are equal in the database on purpose. The client wants them
-- to differ in one place only, and it is a presentation rule rather than a
-- permission: the Quality screen hides its Rejection figures from an admin, who
-- reports on the factory rather than running it. Enforcing that in RLS would
-- mean withholding rows the same admin can already reach through the pass rate
-- and the defect counts, so it lives in the page and nowhere else.
--
-- is_admin() keeps its old definition, unused by any policy after this file, so
-- that a future rule that really does mean "administrator" has it to hand.

-- ---------------------------------------------------------------------------
-- 1. The role
-- ---------------------------------------------------------------------------
-- Top level and not wrapped in a do-block: ALTER TYPE ... ADD VALUE cannot run
-- inside a subtransaction, and an exception handler is one.
alter type user_role add value if not exists 'manager';

-- ---------------------------------------------------------------------------
-- 2. The gate
-- ---------------------------------------------------------------------------
-- role::text rather than the enum literal, deliberately: a value added by ALTER
-- TYPE may not be referenced by the transaction that added it, and the CLI runs
-- this whole file as one. Comparing as text sidesteps that entirely.
create or replace function is_manager() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from profiles
    where auth_user_id = auth.uid()
      and role::text in ('admin', 'manager')
      and status = 'active'
  );
$$;

-- ---------------------------------------------------------------------------
-- 3. Policies that meant "not an employee"
-- ---------------------------------------------------------------------------
-- profiles: the whole directory, and the Employees screen that writes to it.
drop policy if exists profiles_self_read on profiles;
create policy profiles_self_read on profiles
  for select using (auth_user_id = auth.uid() or is_manager());

drop policy if exists profiles_admin_all on profiles;
create policy profiles_admin_all on profiles
  for all using (is_manager()) with check (is_manager());

-- reference and production data
drop policy if exists lines_admin on production_lines;
create policy lines_admin on production_lines
  for all using (is_manager()) with check (is_manager());

drop policy if exists orders_admin on orders;
create policy orders_admin on orders
  for all using (is_manager()) with check (is_manager());

drop policy if exists records_admin on production_records;
create policy records_admin on production_records
  for all using (is_manager()) with check (is_manager());

-- uploads and their child tables
drop policy if exists uploads_own_read on excel_uploads;
create policy uploads_own_read on excel_uploads
  for select using (uploaded_by = current_profile_id() or is_manager());

drop policy if exists uploads_admin on excel_uploads;
create policy uploads_admin on excel_uploads
  for all using (is_manager()) with check (is_manager());

drop policy if exists versions_read on excel_versions;
create policy versions_read on excel_versions for select using (
  is_manager() or exists (
    select 1 from excel_uploads u
    where u.id = excel_versions.upload_id and u.uploaded_by = current_profile_id()
  )
);

drop policy if exists rows_read on excel_rows;
create policy rows_read on excel_rows for select using (
  is_manager() or exists (
    select 1 from excel_uploads u
    where u.id = excel_rows.upload_id and u.uploaded_by = current_profile_id()
  )
);

drop policy if exists errors_read on import_errors;
create policy errors_read on import_errors for select using (
  is_manager() or exists (
    select 1 from excel_uploads u
    where u.id = import_errors.upload_id and u.uploaded_by = current_profile_id()
  )
);

drop policy if exists warnings_read on import_warnings;
create policy warnings_read on import_warnings for select using (
  is_manager() or exists (
    select 1 from excel_uploads u
    where u.id = import_warnings.upload_id and u.uploaded_by = current_profile_id()
  )
);

-- HR and loading plan
drop policy if exists hr_admin on hr_attendance;
create policy hr_admin on hr_attendance
  for all using (is_manager()) with check (is_manager());

drop policy if exists lp_admin on loading_plan;
create policy lp_admin on loading_plan
  for all using (is_manager()) with check (is_manager());

-- quality
drop policy if exists q_uploads_read on quality_uploads;
create policy q_uploads_read on quality_uploads
  for select using (uploaded_by = current_profile_id() or is_manager());

drop policy if exists q_uploads_admin on quality_uploads;
create policy q_uploads_admin on quality_uploads
  for all using (is_manager()) with check (is_manager());

drop policy if exists q_inspections_admin on quality_inspections;
create policy q_inspections_admin on quality_inspections
  for all using (is_manager()) with check (is_manager());

drop policy if exists q_defects_admin on quality_defects;
create policy q_defects_admin on quality_defects
  for all using (is_manager()) with check (is_manager());

-- the original workbook in storage: a manager downloads it from Excel Uploads
drop policy if exists storage_read_own on storage.objects;
create policy storage_read_own on storage.objects
  for select using (
    bucket_id = 'garment-excel-files'
    and (
      is_manager()
      or exists (
        select 1 from excel_uploads u
        where u.storage_path = storage.objects.name
          and u.uploaded_by = current_profile_id()
      )
    )
  );

-- the security trail
drop policy if exists audit_admin_read on audit_logs;
create policy audit_admin_read on audit_logs
  for select using (is_manager());

-- ---------------------------------------------------------------------------
-- 4. What this leaves
-- ---------------------------------------------------------------------------
-- Every policy on the project now gates on is_manager(). Writes to audit_logs
-- are unchanged and still impossible from a browser: they come from the Edge
-- Functions under the service role, so nobody can forge or erase their own
-- trail regardless of role.
