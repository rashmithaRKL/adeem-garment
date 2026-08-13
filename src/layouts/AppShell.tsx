import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '@/features/auth/AuthProvider';
// Imported rather than referenced from adeemuniform.com: the CSP in public/_headers
// sets img-src to 'self' data: blob:, so a remote logo would be blocked outright.
// Importing also lets Vite fingerprint the file, so a new logo can never be cached.
import logoUrl from '@/assets/adeem-logo.png';
import { useTheme } from '@/lib/theme';

export interface NavItem {
  to: string;
  label: string;
  /** An emoji. Colour comes from the system emoji font, so no token applies. */
  icon: string;
  badge?: number;
}

/** A titled block of links. The rail is grouped so the six screens the factory
 *  is run from are not buried among the import and administration tools. */
export interface NavSection {
  group: string;
  items: NavItem[];
}

interface AppShellProps {
  sections: NavSection[];
  titles: Record<string, { title: string; sub: string }>;
}

/**
 * Rendered twice and shown once. The control belongs at the top of the screen in
 * both layouts, but "the top" is a different element in each: the topbar on a
 * desktop, the sticky brand row on a phone, where the topbar sits below the nav
 * strip and scrolls away. CSS picks the one that applies.
 */
function ThemeToggle({ where }: { where: 'bar' | 'rail' }) {
  const { theme, cycle } = useTheme();
  return (
    <button
      type="button"
      className={`btn btn--secondary btn--small btn--icon theme-toggle theme-toggle--${where}`}
      onClick={cycle}
      title={`Theme: ${theme}. Click to change.`}
      aria-label={`Theme: ${theme}. Click to change.`}
    >
      <span aria-hidden>{theme === 'system' ? '🖥️' : theme === 'dark' ? '🌙' : '☀️'}</span>
    </button>
  );
}

export function AppShell({ sections, titles }: AppShellProps) {
  const { profile, signOut } = useAuth();
  const { pathname } = useLocation();
  const meta = titles[pathname] ?? { title: 'Adeem Uniform (Pvt) Ltd', sub: '' };
  const initials = (profile?.fullName ?? '')
    .split(' ').map((p) => p[0]).join('').slice(0, 2);

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="sidebar__brand">
          {/* The mark carries the wordmark, but the registered company name and
              what this system is are printed underneath it: the rail is the one
              place on screen that says which company's factory this is. */}
          <img src={logoUrl} alt="Adeem Uniform" className="sidebar__logo" />
          <span className="sidebar__brand-name">Adeem Uniform (Pvt) Ltd</span>
          <span className="sidebar__brand-sub">Management System</span>
        </div>

        <nav className="sidebar__nav" aria-label="Main">
          {sections.map((section) => (
            <div key={section.group} className="sidebar__section">
              <p className="sidebar__group">{section.group}</p>
              {section.items.map((item) => (
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
            </div>
          ))}
        </nav>

        <div className="sidebar__footer" style={{ padding: 12, borderTop: '1px solid var(--border-soft)' }}>
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
            <ThemeToggle where="rail" />
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
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 'none' }}>
            <ThemeToggle where="bar" />
            <span className="live-pill"><span className="live-pill__dot" aria-hidden />Live</span>
          </div>
        </header>
        {/* Keyed on the path so React discards the old subtree and the animation
            restarts on every navigation. Without the key the class is already
            applied and the browser has nothing new to animate. */}
        <main className="content page-in" key={pathname}><Outlet /></main>
      </div>
    </div>
  );
}
