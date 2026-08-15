import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '@/features/auth/AuthProvider';
import type { UserRole } from '@/types/domain';
import { FullPageSpinner } from '@/components/FullPageSpinner';
import { ProfileUnavailablePage } from '@/features/auth/ProfileUnavailablePage';

/**
 * Nothing sensitive renders until the role is known. This avoids the flash where
 * an employee briefly sees admin chrome before being redirected.
 */
export function RequireAuth() {
  const { session, profile, loading, profileError } = useAuth();
  const location = useLocation();

  if (loading) return <FullPageSpinner label="Checking your session" />;
  if (!session) return <Navigate to="/login" replace state={{ from: location.pathname }} />;

  // A session without a profile used to bounce to /login, which bounced straight
  // back here because the session was still valid — an endless redirect. Say what
  // is wrong instead and offer the two ways out.
  if (!profile) return <ProfileUnavailablePage reason={profileError} />;
  if (profile.status === 'disabled') return <Navigate to="/unauthorized" replace />;

  return <Outlet />;
}

/**
 * Takes a role or a set of them, because the management side is now two roles
 * wide. /admin/* admits both; the handful of screens inside it that are the
 * administrator's alone name only 'admin'.
 */
export function RequireRole({ role }: { role: UserRole | UserRole[] }) {
  const { profile, loading, profileError } = useAuth();
  const allowed = Array.isArray(role) ? role : [role];

  if (loading) return <FullPageSpinner label="Checking your access" />;
  if (!profile) return <ProfileUnavailablePage reason={profileError} />;
  if (!allowed.includes(profile.role)) {
    // Typing /admin/employees as an employee lands here. The Edge Functions and
    // RLS would refuse the data anyway; this is only the first of four gates.
    return <Navigate to="/unauthorized" replace />;
  }
  return <Outlet />;
}

/** Where a role lands when it arrives at "/". */
export const homeFor = (role: UserRole): string =>
  role === 'employee' ? '/employee/dashboard' : '/admin/dashboard';

export function RedirectByRole() {
  const { profile, loading, profileError } = useAuth();
  if (loading) return <FullPageSpinner label="Loading" />;
  if (!profile) return <ProfileUnavailablePage reason={profileError} />;
  return <Navigate to={homeFor(profile.role)} replace />;
}
