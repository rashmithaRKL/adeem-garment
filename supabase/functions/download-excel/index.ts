// Issues a 60-second signed URL for a stored archive, after checking permission.
// Deploy: supabase functions deploy download-excel
import { corsHeaders, json } from '../_shared/cors.ts';
import { requireCaller, isManager, serviceClient, audit } from '../_shared/auth.ts';

const SIGNED_URL_TTL_SECONDS = 60;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const caller = await requireCaller(req);
    const { uploadId } = await req.json() as { uploadId?: string };
    if (!uploadId) return json({ error: 'uploadId is required' }, 400);

    const db = serviceClient();
    const { data: upload, error } = await db
      .from('excel_uploads')
      .select('id, uploaded_by, storage_path, original_filename, upload_version')
      .eq('id', uploadId)
      .single();

    if (error || !upload) return json({ error: 'Upload not found' }, 404);

    // The management side sees every document; everyone else, only their own.
    const permitted = isManager(caller.role) || upload.uploaded_by === caller.profileId;
    if (!permitted) {
      await audit(db, caller.profileId, 'ACCESS_DENIED',
        'Blocked download of upload ' + uploadId, { entity_type: 'excel_upload' });
      return json({ error: 'You do not have access to this document.' }, 403);
    }

    const { data: signed, error: signErr } = await db.storage
      .from('garment-excel-files')
      .createSignedUrl(upload.storage_path, SIGNED_URL_TTL_SECONDS, {
        download: upload.original_filename
      });

    if (signErr || !signed) return json({ error: 'Could not create download link.' }, 500);

    await audit(db, caller.profileId, 'EXCEL_DOWNLOAD',
      'Signed URL issued for ' + upload.original_filename + ' v' + upload.upload_version,
      { entity_type: 'excel_upload', ttl: SIGNED_URL_TTL_SECONDS });

    // The client unzips this archive and saves the original .xlsx unchanged.
    return json({
      signedUrl: signed.signedUrl,
      originalFilename: upload.original_filename,
      expiresInSeconds: SIGNED_URL_TTL_SECONDS
    });
  } catch (e) {
    if (e instanceof Response) return json({ error: await e.text() }, e.status);
    return json({ error: 'Unexpected error' }, 500);
  }
});
