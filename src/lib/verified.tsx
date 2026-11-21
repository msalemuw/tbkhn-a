import { MaterialIcons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';

import { colors } from '@/constants/theme';
import { supabase } from '@/lib/supabase';

// The teal tick means an admin has seen the person's ID and confirmed who they are
// (profiles.verified_at, switched on and off in Admin > Members). The set of verified ids is small,
// so it is loaded once and shared by every tick on screen.
let ids: Set<string> | null = null;
let loading: Promise<void> | null = null;
const listeners = new Set<() => void>();

export function refreshVerified(): Promise<void> {
  loading = (async () => {
    const { data, error } = await supabase.from('profiles').select('id').not('verified_at', 'is', null).limit(1000);
    // A failed read (no network yet, session still loading) must not be remembered as "nobody": keep what we had and try again later.
    if (error || !data) return;
    ids = new Set((data as { id: string }[]).map((r) => r.id));
    listeners.forEach((l) => l());
  })()
    .catch(() => {})
    .finally(() => {
      loading = null;
    });
  return loading;
}

export function useIsVerified(id: string | null | undefined): boolean {
  const [, bump] = useState(0);
  useEffect(() => {
    const l = () => bump((n) => n + 1);
    listeners.add(l);
    if (!ids && !loading) void refreshVerified();
    return () => {
      listeners.delete(l);
    };
  }, []);
  return !!id && !!ids?.has(id);
}

export function VerifiedTick({ id, size = 16 }: { id: string | null | undefined; size?: number }) {
  return useIsVerified(id) ? <MaterialIcons name="verified" size={size} color={colors.teal} accessibilityLabel="Verified" /> : null;
}
