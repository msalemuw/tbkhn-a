import type { Session } from '@supabase/supabase-js';
import { createContext, type ReactNode, useCallback, useContext, useEffect, useState } from 'react';

import { supabase, supabaseConfigured } from '@/lib/supabase';

/** The signed-in member's own profile, including private columns (from my_profile()). */
export type MyProfile = {
  id: string;
  username: string | null;
  username_changed_at: string | null;
  display_name: string | null;
  avatar_path: string | null;
  bio: string | null;
  governorate: string | null;
  area: string | null;
  instapay_handle: string | null;
  instagram_url: string | null;
  facebook_url: string | null;
  tiktok_url: string | null;
  lang: 'en' | 'ar';
};

type SessionState = {
  loading: boolean;
  session: Session | null;
  profile: MyProfile | null;
  /** Signed in but the sign-up is not finished: no username yet (step 1) or no area yet (step 2). */
  needsProfile: boolean;
  refreshProfile: () => Promise<void>;
};

const SessionContext = createContext<SessionState | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [loading, setLoading] = useState(supabaseConfigured);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<MyProfile | null>(null);

  const loadProfile = useCallback(async (s: Session | null) => {
    if (!s) {
      setProfile(null);
      return;
    }
    const { data } = await supabase.rpc('my_profile');
    setProfile((data as MyProfile | null) ?? null);
  }, []);

  useEffect(() => {
    if (!supabaseConfigured) return;
    supabase.auth.getSession().then(async ({ data }) => {
      setSession(data.session);
      await loadProfile(data.session);
      setLoading(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
      // Supabase advises not awaiting other calls inside this callback.
      setTimeout(() => loadProfile(s), 0);
    });
    return () => sub.subscription.unsubscribe();
  }, [loadProfile]);

  const refreshProfile = useCallback(() => loadProfile(session), [loadProfile, session]);

  const value: SessionState = {
    loading,
    session,
    profile,
    needsProfile: Boolean(session && profile && (!profile.username || !profile.area)),
    refreshProfile,
  };
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession() {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error('useSession must be used inside SessionProvider');
  return ctx;
}
