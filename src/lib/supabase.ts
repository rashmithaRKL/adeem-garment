import { createClient, FunctionsHttpError } from '@supabase/supabase-js';
import type { Database } from '@/types/database';
import { env } from './env';

/**
 * The anon key is public by design. Every table is protected by RLS, so this
 * client can only ever read rows the signed-in user is entitled to.
 */
export const supabase = createClient<Database>(env.supabaseUrl, env.supabaseAnonKey, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
});

/**
 * Calls an Edge Function with the caller's session attached.
 *
 * On a non-2xx reply supabase-js throws a FunctionsHttpError whose message is
 * always the same generic sentence, so the JSON body is unwrapped here — that is
 * where the Edge Functions put the message a supervisor can actually act on.
 */
export async function invokeFunction<T>(name: string, body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke<T>(name, { body });
  if (error) throw await unwrapFunctionError(error);
  return data as T;
}

async function unwrapFunctionError(error: unknown): Promise<Error> {
  if (error instanceof FunctionsHttpError) {
    try {
      const payload = (await error.context.json()) as { error?: unknown };
      if (typeof payload?.error === 'string') return new Error(payload.error);
    } catch {
      // The function replied with something that was not JSON; fall through.
    }
  }
  return error instanceof Error ? error : new Error(String(error));
}
