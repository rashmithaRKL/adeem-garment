import { useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from './AuthProvider';
import { friendlyError } from '@/lib/errors';

export function LoginPage() {
  const { session, loading, signIn } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  if (session && !loading) return <Navigate to="/" replace />;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await signIn(email, password);
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ minHeight: '100vh', display: 'grid', gridTemplateColumns: 'minmax(0,1.05fr) minmax(0,.95fr)' }}>
      <aside style={{
        padding: '56px 60px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
        color: '#fff', background: 'linear-gradient(160deg,#1e3a8a 0%,#2563eb 55%,#0891b2 100%)'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ width: 38, height: 38, borderRadius: 9, background: '#fff', color: 'var(--blue-500)', display: 'grid', placeItems: 'center', font: '700 18px var(--font-heading)' }}>AG</span>
          <span style={{ font: '600 19px/1 var(--font-heading)', letterSpacing: '.06em', textTransform: 'uppercase' }}>
            Adeem Garment · PMS
          </span>
        </div>
        <div>
          <h1 style={{ font: '600 54px/1.02 var(--font-heading)', margin: '0 0 18px', maxWidth: '11ch' }}>
            Five lines. One source of truth.
          </h1>
          <p style={{ margin: 0, maxWidth: '44ch', fontSize: 16, lineHeight: 1.6, opacity: .85 }}>
            Upload the daily production sheet — the system scans, validates, versions and stores it,
            then updates every line, order and delivery figure automatically.
          </p>
        </div>
        <p style={{ margin: 0, fontSize: 12.5, opacity: .7 }}>
          Your role is resolved from the database after authentication, never from the browser.
        </p>
      </aside>

      <main style={{ display: 'grid', placeItems: 'center', padding: 40 }}>
        <form onSubmit={submit} style={{ width: '100%', maxWidth: 400, display: 'flex', flexDirection: 'column', gap: 14 }}>
          <h2 style={{ fontSize: 32, margin: 0 }}>Sign in</h2>
          {error && <p className="banner banner--error" style={{ margin: 0 }}>{error}</p>}
          <div className="field">
            <label htmlFor="email">Email</label>
            <input id="email" className="input" type="email" required autoComplete="email"
              value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="password">Password</label>
            <input id="password" className="input" type="password" required autoComplete="current-password"
              value={password} onChange={(e) => setPassword(e.target.value)} />
          </div>
          <button className="btn btn--primary" type="submit" disabled={busy}>
            {busy ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
      </main>
    </div>
  );
}
