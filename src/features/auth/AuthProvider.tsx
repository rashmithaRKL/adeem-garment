import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import { MANAGEMENT_ROLES, type Profile } from '@/types/domain';

interface AuthState {
  session: Session | null;
  profile: Profile | null;
  /** True until the role has been resolved from the database. */
  loading: boolean;
  /** Set when a session exists but its profile row could not be read. */
  profileError: string;
  reloadProfile: () => Promise<void>;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

interface ProfileLookup {
  profile: Profile | null;
  error: string;
}

async function loadProfile(authUserId: string): Promise<ProfileLookup> {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, auth_user_id, full_name, employee_id, email, role, status')
    .eq('auth_user_id', authUserId)
    .maybeSingle();

  if (error) return { profile: null, error: error.message };
  if (!data) {
    return {
      profile: null,
      error: 'This account has no profile record yet. Ask an administrator to finish setting it up.'
    };
  }

  return {
    profile: {
      id: data.id,
      authUserId: data.auth_user_id,
      fullName: data.full_name,
      employeeId: data.employee_id,
      email: data.email,
      role: data.role,
      status: data.status
    },
    error: ''
  };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [profileError, setProfileError] = useState('');

  /** The user whose profile is currently held, so refreshes are not re-resolved. */
  const resolvedFor = useRef<string | null>(null);

  const applySession = useCallback(async (next: Session | null) => {
    setSession(next);

    if (!next) {
      resolvedFor.current = null;
      setProfile(null);
      setProfileError('');
      setLoading(false);
      return;
    }

    // A token refresh fires roughly hourly and on every tab focus. Re-reading the
    // profile there would blank the whole app behind the loading spinner, so the
    // lookup only runs when the signed-in user actually changes.
    if (resolvedFor.current === next.user.id) {
      setLoading(false);
      return;
    }

    setLoading(true);
    const { profile: found, error } = await loadProfile(next.user.id);
    resolvedFor.current = found ? next.user.id : null;
    setProfile(found);
    setProfileError(error);
    setLoading(false);
  }, []);

  useEffect(() => {
    let active = true;
    const guard = (next: Session | null) => { if (active) void applySession(next); };

    void supabase.auth.getSession().then(({ data }) => guard(data.session));

    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => {
      // supabase-js holds an internal lock while this callback runs; querying the
      // database from inside it can deadlock, so the work is pushed to the next tick.
      setTimeout(() => guard(next), 0);
    });

    return () => { active = false; sub.subscription.unsubscribe(); };
  }, [applySession]);

  const reloadProfile = useCallback(async () => {
    if (!session) return;
    resolvedFor.current = null;
    await applySession(session);
  }, [session, applySession]);

  const value = useMemo<AuthState>(() => ({
    session,
    profile,
    loading,
    profileError,
    reloadProfile,
    signIn: async (email, password) => {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
    },
    signOut: async () => {
      resolvedFor.current = null;
      await supabase.auth.signOut();
    }
  }), [session, profile, loading, profileError, reloadProfile]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}

/**
 * True for the management side — admin or manager. Nearly every screen that used
 * to ask "is this an admin?" meant this: may this person edit the factory's data,
 * and do they see everyone's uploads or only their own. Only accounts, roles and
 * the audit trail ask for `admin` specifically.
 */
export function useIsManager(): boolean {
  const { profile } = useAuth();
  return profile != null && MANAGEMENT_ROLES.includes(profile.role);
}
