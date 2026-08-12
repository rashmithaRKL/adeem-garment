interface AppEnv {
  supabaseUrl: string;
  supabaseAnonKey: string;
}

/**
 * Vite inlines these at build time, so a Cloudflare Pages build that ran without
 * them produces a bundle that can never connect — and the values cannot be fixed
 * by editing anything at runtime, only by rebuilding.
 *
 * Resolution therefore does not throw: main.tsx renders a setup screen naming the
 * missing variables instead of failing during module evaluation, which would leave
 * a blank white page and an error only visible in the browser console.
 */
export const MISSING_ENV: string[] = [];

function read(name: string, value: string | undefined): string {
  const trimmed = (value ?? '').trim();
  if (!trimmed) {
    MISSING_ENV.push(name);
    return '';
  }
  return trimmed;
}

export const env: AppEnv = {
  supabaseUrl: read('VITE_SUPABASE_URL', import.meta.env.VITE_SUPABASE_URL),
  supabaseAnonKey: read('VITE_SUPABASE_ANON_KEY', import.meta.env.VITE_SUPABASE_ANON_KEY)
};

export const isConfigured = (): boolean => MISSING_ENV.length === 0;

export const STORAGE_BUCKET = 'garment-excel-files';
export const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;
export const EFFICIENCY_THRESHOLD = 80;
