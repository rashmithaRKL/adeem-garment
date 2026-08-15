import { Link } from 'react-router-dom';
import { homeFor } from '@/app/guards';
import { ROLE_LABEL } from '@/types/domain';
import { useAuth } from './AuthProvider';

export function UnauthorizedPage() {
  const { profile } = useAuth();
  const home = profile ? homeFor(profile.role) : '/employee/dashboard';

  return (
    <div className="state" style={{ minHeight: '100vh' }}>
      <span style={{
        width: 64, height: 64, borderRadius: 16, background: 'var(--red-50)',
        color: 'var(--red-500)', display: 'grid', placeItems: 'center', fontSize: 28
      }} aria-hidden>⛔</span>
      <h1 style={{ fontSize: 34, margin: 0 }}>403 — Not authorized</h1>
      <p style={{ margin: 0, maxWidth: '52ch', fontSize: 14.5, lineHeight: 1.6 }}>
        Your profile role is <strong>{profile ? ROLE_LABEL[profile.role] : 'unknown'}</strong>.
        {' '}This route is reserved for a higher role.
      </p>
      <p style={{ margin: 0, maxWidth: '56ch', fontSize: 12.5, color: 'var(--text-faint)', lineHeight: 1.6 }}>
        The check ran before any admin data was requested, and row level security would have refused
        the query regardless. The attempt is recorded in the audit log.
      </p>
      <Link className="btn btn--primary" to={home} style={{ textDecoration: 'none' }}>Back to my dashboard</Link>
    </div>
  );
}
