import { createClient } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import { env } from '@/lib/env';
import type { Database } from '@/types/database';

export type ProfileRow = Database['public']['Tables']['profiles']['Row'] & {
  uploadCount?: number;
};

/** Admin only in practice: RLS returns just the caller's own row for an employee. */
export async function fetchEmployees(): Promise<ProfileRow[]> {
  const [{ data: profiles, error }, { data: uploads }] = await Promise.all([
    supabase.from('profiles').select('*').order('full_name'),
    supabase.from('excel_uploads').select('uploaded_by')
  ]);
  if (error) throw error;

  const counts = new Map<string, number>();
  for (const u of uploads ?? []) {
    counts.set(u.uploaded_by, (counts.get(u.uploaded_by) ?? 0) + 1);
  }
  return (profiles ?? []).map((p) => ({ ...p, uploadCount: counts.get(p.id) ?? 0 }));
}

export async function setEmployeeStatus(id: string, status: 'active' | 'disabled') {
  const { error } = await supabase.from('profiles').update({ status }).eq('id', id);
  if (error) throw error;
}

export async function setEmployeeRole(id: string, role: 'admin' | 'employee') {
  const { error } = await supabase.from('profiles').update({ role }).eq('id', id);
  if (error) throw error;
}

export interface NewEmployee {
  email: string;
  password: string;
  fullName: string;
  employeeId: string;
}

/**
 * Creates the account through the ordinary public sign-up endpoint, which the
 * anon key is allowed to call — no service-role key required, and no new attack
 * surface, since sign-up is already open on this project.
 *
 * The subtlety is the session. supabase.auth.signUp() signs the *new* user in and
 * would replace the admin's own session, silently demoting whoever was filling in
 * the form. So it runs on a throwaway client with persistSession off: the new
 * session exists for the length of this call, is never written to storage, and the
 * admin's session is never touched.
 *
 * full_name and employee_id ride along in user metadata because handle_new_user
 * reads them when it builds the profile row.
 */
export async function createEmployeeAccount(input: NewEmployee): Promise<{ needsConfirmation: boolean }> {
  const isolated = createClient(env.supabaseUrl, env.supabaseAnonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
      // A distinct key stops GoTrue warning about two clients sharing one storage
      // slot. Nothing is written to it — persistSession is off — but the warning
      // fires on construction and reads like a real fault in the console.
      storageKey: 'adeem-admin-create-user'
    }
  });

  const { data, error } = await isolated.auth.signUp({
    email: input.email.trim(),
    password: input.password,
    options: {
      data: {
        full_name: input.fullName.trim(),
        employee_id: input.employeeId.trim()
      }
    }
  });

  if (error) throw new Error(error.message);
  if (!data.user) throw new Error('The account was not created and no reason was given.');

  // A session comes back only when the project auto-confirms. Otherwise the
  // account exists but cannot sign in until the emailed link is clicked.
  return { needsConfirmation: data.session === null };
}

export interface EmployeeEdit {
  full_name: string;
  employee_id: string;
  role: 'admin' | 'employee';
  status: 'active' | 'disabled';
}

/**
 * Email is deliberately absent. It is the identity Supabase Auth signs the user
 * in with, and changing profiles.email alone would leave the two out of step —
 * the profile would say one thing and the login accept another. Changing it for
 * real requires the Auth admin API and a service-role key.
 */
export async function updateEmployee(id: string, patch: EmployeeEdit) {
  const { error } = await supabase
    .from('profiles')
    .update({
      full_name: patch.full_name.trim(),
      employee_id: patch.employee_id.trim(),
      role: patch.role,
      status: patch.status
    })
    .eq('id', id);
  if (error) throw new Error(error.message);
}

/**
 * Removes the profile, which is what every screen in this app reads from. The
 * auth.users row survives, because deleting it needs the service role — so the
 * person can still sign in, and handle_new_user will not fire again for them
 * (it only runs on insert). They would land on the "profile unavailable" screen.
 * Deactivating is the reversible option and is what the UI recommends.
 */
export async function deleteEmployee(id: string) {
  const { error } = await supabase.from('profiles').delete().eq('id', id);
  if (error) throw new Error(error.message);
}
