import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '@/features/auth/AuthProvider';
// Imported rather than referenced from adeemuniform.com: the CSP in public/_headers
// sets img-src to 'self' data: blob:, so a remote logo would be blocked outright.
// Importing also lets Vite fingerprint the file, so a new logo can never be cached.
import logoUrl from '@/assets/adeem-logo.png';

export interface NavItem {
  to: string;
  label: string;
  /** An emoji. Colour comes from the system emoji font, so no token applies. */
  icon: string;
  badge?: number;
}

interface AppShellProps {
  group: string;
  items: NavItem[];
  titles: Record<string, { title: string; sub: string }>;
}

export function AppShell({ group, items, titles }: AppShellProps) {
  const { profile, signOut } = useAuth();
  const { pathname } = useLocation();
  const meta = titles[pathname] ?? { title: 'Adeem Garment', sub: '' };
  const initials = (profile?.fullName ?? '')
    .split(' ').map((p) => p[0]).join('').slice(0, 2);

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="sidebar__brand">
          {/* The logo already reads "ADEEM UNIFORM", so repeating it in text beside
              the mark would say the same thing twice. Only the system name follows. */}
          <img src={logoUrl} alt="Adeem Uniform" className="sidebar__logo" />
          <span className="sidebar__brand-sub">Production Management</span>
        </div>

        <nav className="sidebar__nav" aria-label={group}>
          <p className="sidebar__group">{group}</p>
          {items.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) => 'navlink' + (isActive ? ' navlink--active' : '')}
            >
              {/* Decorative: the label beside it names the destination, so a screen
                  reader announcing "house emoji Dashboard" would only add noise. */}
              <span className="navlink__icon" aria-hidden>{item.icon}</span>
              <span>{item.label}</span>
              {item.badge ? <span className="navlink__badge">{item.badge}</span> : null}
            </NavLink>
          ))}
        </nav>

        <div style={{ padding: 12, borderTop: '1px solid var(--border-soft)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 6px' }}>
            <span style={{
              width: 32, height: 32, borderRadius: '50%', background: 'var(--blue-500)',
              color: '#fff', display: 'grid', placeItems: 'center', font: '600 13px var(--font-body)'
            }} aria-hidden>{initials}</span>
            <span className="sidebar__footer-text" style={{ minWidth: 0, flex: 1 }}>
              <span style={{ display: 'block', font: '600 13px/1.2 var(--font-body)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {profile?.fullName}
              </span>
              <span style={{ fontSize: 11, color: 'var(--text-faint)', textTransform: 'capitalize' }}>
                {profile?.role} · {profile?.employeeId}
              </span>
            </span>
            <button type="button" className="btn btn--secondary btn--small" onClick={() => void signOut()} title="Sign out">
              Sign out
            </button>
          </div>
        </div>
      </aside>

      <div className="main">
        <header className="topbar">
          <div style={{ flex: 1, minWidth: 0 }}>
            <h1 className="topbar__title">{meta.title}</h1>
            <p className="topbar__sub" style={{ margin: 0 }}>{meta.sub}</p>
          </div>
          <span className="live-pill"><span className="live-pill__dot" aria-hidden />Live</span>
        </header>
        <main className="content"><Outlet /></main>
      </div>
    </div>
  );
}
