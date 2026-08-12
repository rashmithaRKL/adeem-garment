-- 0002_rls.sql - row level security. The frontend guard is a courtesy; this is the gate.
alter table profiles           enable row level security;
alter table production_lines   enable row level security;
alter table orders             enable row level security;
alter table production_records enable row level security;
alter table excel_uploads      enable row level security;
alter table excel_versions     enable row level security;
alter table excel_rows         enable row level security;
alter table import_errors      enable row level security;
alter table import_warnings    enable row level security;
alter table audit_logs         enable row level security;

-- profiles: you see yourself; admins see and manage everyone.
create policy profiles_self_read on profiles
  for select using (auth_user_id = auth.uid() or is_admin());

create policy profiles_self_update on profiles
  for update using (auth_user_id = auth.uid())
  with check (
    auth_user_id = auth.uid()
    -- an employee may never change their own role or status
    and role   = (select p.role   from profiles p where p.auth_user_id = auth.uid())
    and status = (select p.status from profiles p where p.auth_user_id = auth.uid())
  );

create policy profiles_admin_all on profiles for all using (is_admin()) with check (is_admin());

-- reference and production data: readable by any active signed-in user, writable by admins.
create policy lines_read   on production_lines for select using (auth.uid() is not null);
create policy lines_admin  on production_lines for all    using (is_admin()) with check (is_admin());

create policy orders_read  on orders for select using (auth.uid() is not null);
create policy orders_admin on orders for all    using (is_admin()) with check (is_admin());

create policy records_read  on production_records for select using (auth.uid() is not null);
create policy records_admin on production_records for all    using (is_admin()) with check (is_admin());
-- employees never insert records directly; the Edge Function does it with the service role
-- after validating the workbook, so a forged row cannot enter the table.

-- uploads: an employee sees only their own; admins see everything.
create policy uploads_own_read on excel_uploads
  for select using (uploaded_by = current_profile_id() or is_admin());

create policy uploads_own_insert on excel_uploads
  for insert with check (uploaded_by = current_profile_id());

create policy uploads_admin on excel_uploads for all using (is_admin()) with check (is_admin());

-- child tables inherit their parent upload's visibility
create policy versions_read on excel_versions for select using (
  is_admin() or exists (
    select 1 from excel_uploads u
    where u.id = excel_versions.upload_id and u.uploaded_by = current_profile_id()
  )
);

create policy rows_read on excel_rows for select using (
  is_admin() or exists (
    select 1 from excel_uploads u
    where u.id = excel_rows.upload_id and u.uploaded_by = current_profile_id()
  )
);

create policy errors_read on import_errors for select using (
  is_admin() or exists (
    select 1 from excel_uploads u
    where u.id = import_errors.upload_id and u.uploaded_by = current_profile_id()
  )
);

create policy warnings_read on import_warnings for select using (
  is_admin() or exists (
    select 1 from excel_uploads u
    where u.id = import_warnings.upload_id and u.uploaded_by = current_profile_id()
  )
);

-- audit log: admin-only reads. Writes come from Edge Functions (service role) only,
-- so an employee cannot forge or erase their own trail.
create policy audit_admin_read on audit_logs for select using (is_admin());
