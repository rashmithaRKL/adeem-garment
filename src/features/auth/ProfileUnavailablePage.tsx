import { useState } from 'react';
import { useAuth } from './AuthProvider';

/**
 * Shown when authentication succeeded but `profiles` had nothing to say about the
 * user — a dropped connection, RLS refusing the row, or a sign-up whose profile
 * trigger never ran. All three are recoverable, so this offers a retry rather
 * than throwing the user back at a login screen they have already passed.
 */
export function ProfileUnavailablePage({ reason }: { reason?: string }) {
  const { session, reloadProfile, signOut } = useAuth();
  const [busy, setBusy] = useState(false);

  async function retry() {
    setBusy(true);
    try {
      await reloadProfile();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="state" style={{ minHeight: '100vh' }}>
      <span style={{
        width: 64, height: 64, borderRadius: 16, background: 'var(--amber-50)',
        color: 'var(--amber-500)', display: 'grid', placeItems: 'center', fontSize: 28
      }} aria-hidden>⚠</span>

      <h1 style={{ fontSize: 30, margin: 0 }}>We could not load your profile</h1>

      <p style={{ margin: 0, maxWidth: '54ch', fontSize: 14.5, lineHeight: 1.6 }}>
        You are signed in as <strong>{session?.user.email}</strong>, but your role could not be
        read from the database, so nothing can be shown safely.
      </p>

      {reason && (
        <p className="banner banner--error" style={{ maxWidth: '54ch', margin: 0 }}>{reason}</p>
      )}

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', justifyContent: 'center' }}>
        <button type="button" className="btn btn--primary" disabled={busy} onClick={() => void retry()}>
          {busy ? 'Retrying…' : 'Try again'}
        </button>
        <button type="button" className="btn btn--secondary" onClick={() => void signOut()}>
          Sign out
        </button>
      </div>
    </div>
  );
}
