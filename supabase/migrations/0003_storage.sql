-- 0003_storage.sql - private bucket for compressed Excel documents
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('garment-excel-files', 'garment-excel-files', false, 26214400, array['application/zip'])
on conflict (id) do update
  set public = false,
      file_size_limit = 26214400,
      allowed_mime_types = array['application/zip'];

-- No public URLs, ever. Reads happen through short-lived signed URLs issued by the
-- download-excel Edge Function after it has checked the caller's permission.
create policy storage_read_own on storage.objects
  for select using (
    bucket_id = 'garment-excel-files'
    and (
      is_admin()
      or exists (
        select 1 from excel_uploads u
        where u.storage_path = storage.objects.name
          and u.uploaded_by = current_profile_id()
      )
    )
  );

-- Uploads are written by the process-excel Edge Function with the service role,
-- so no client-side write policy is granted at all.
