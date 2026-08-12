import { MISSING_ENV } from '@/lib/env';

/**
 * The screen a misconfigured deployment shows instead of a blank page. Vite bakes
 * these values into the bundle, so the fix is always: set them, then rebuild.
 */
export function SetupRequiredPage() {
  return (
    <div className="state" style={{ minHeight: '100vh', padding: 24 }}>
      <span style={{
        width: 64, height: 64, borderRadius: 16, background: 'var(--amber-50)',
        color: 'var(--amber-500)', display: 'grid', placeItems: 'center', fontSize: 28
      }} aria-hidden>⚙</span>

      <h1 style={{ fontSize: 30, margin: 0 }}>Configuration required</h1>

      <p style={{ margin: 0, maxWidth: '56ch', fontSize: 14.5, lineHeight: 1.6 }}>
        This build has no Supabase credentials, so it cannot reach the database.
        {' '}The following build-time variable{MISSING_ENV.length > 1 ? 's are' : ' is'} missing:
      </p>

      <ul className="mono" style={{
        margin: 0, listStyle: 'none', padding: '12px 16px', textAlign: 'left',
        background: 'var(--surface-muted)', borderRadius: 10, fontSize: 13
      }}>
        {MISSING_ENV.map((name) => <li key={name}>{name}</li>)}
      </ul>

      <div style={{ maxWidth: '60ch', textAlign: 'left', fontSize: 13.5, lineHeight: 1.7, color: 'var(--text-muted)' }}>
        <p style={{ margin: '0 0 8px' }}><strong>On Cloudflare Pages</strong></p>
        <p style={{ margin: '0 0 14px' }}>
          Settings → Environment variables → add them for both Production and Preview,
          then re-run the deployment. Values are read when the bundle is built, so an
          existing deployment will not pick them up without a rebuild.
        </p>
        <p style={{ margin: '0 0 8px' }}><strong>Locally</strong></p>
        <p style={{ margin: 0 }}>
          Copy <span className="mono">.env.example</span> to <span className="mono">.env.local</span>,
          fill in your project URL and anon key, then restart the dev server.
        </p>
      </div>
    </div>
  );
}
