import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';

export type CallerRole = 'admin' | 'manager' | 'employee';

/** Admin and manager are the management side; employee is the floor. */
export const isManager = (role: CallerRole): boolean => role === 'admin' || role === 'manager';

export interface Caller {
  profileId: string;
  role: CallerRole;
  fullName: string;
}

/** Service-role client. Never returned to the browser. */
export function serviceClient(): SupabaseClient {
  return createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { persistSession: false } }
  );
}

/**
 * Resolves the caller from the Authorization header and re-reads the role from
 * the database. A role claim sent by the client is ignored entirely.
 */
export async function requireCaller(req: Request): Promise<Caller> {
  const token = req.headers.get('Authorization')?.replace('Bearer ', '');
  if (!token) throw new Response('Not authenticated', { status: 401 });

  const admin = serviceClient();
  const { data: userData, error: userErr } = await admin.auth.getUser(token);
  if (userErr || !userData.user) throw new Response('Not authenticated', { status: 401 });

  const { data: profile, error } = await admin
    .from('profiles')
    .select('id, role, full_name, status')
    .eq('auth_user_id', userData.user.id)
    .single();

  if (error || !profile) throw new Response('No profile', { status: 403 });
  if (profile.status !== 'active') throw new Response('Account disabled', { status: 403 });

  return { profileId: profile.id, role: profile.role, fullName: profile.full_name };
}

/** Strictly the administrator: accounts, roles and the audit trail. */
export async function requireAdmin(req: Request): Promise<Caller> {
  const caller = await requireCaller(req);
  if (caller.role !== 'admin') throw new Response('Forbidden', { status: 403 });
  return caller;
}

/** The management side — anything a manager is trusted to run. */
export async function requireManager(req: Request): Promise<Caller> {
  const caller = await requireCaller(req);
  if (!isManager(caller.role)) throw new Response('Forbidden', { status: 403 });
  return caller;
}

export async function audit(
  client: SupabaseClient,
  userId: string | null,
  action: string,
  description: string,
  metadata: Record<string, unknown> = {}
): Promise<void> {
  await client.from('audit_logs').insert({
    user_id: userId, action, description, metadata,
    entity_type: metadata.entity_type as string | undefined
  });
}
