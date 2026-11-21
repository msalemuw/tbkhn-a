import { MaterialIcons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Text } from '@/components/text';
import { colors, fonts } from '@/constants/theme';
import { supabase } from '@/lib/supabase';

// Critics are food bloggers an admin has approved to taste and rate cooks (profiles.critic_at, switched on and off in
// Admin > Members). The set is small, so it is loaded once and shared by everything on screen, like the verified tick.
let ids: Set<string> | null = null;
let loading: Promise<void> | null = null;
const listeners = new Set<() => void>();

export function refreshCritics(): Promise<void> {
  loading = (async () => {
    const { data, error } = await supabase.from('profiles').select('id').not('critic_at', 'is', null).limit(1000);
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

/** The set of critic ids (null until loaded). Re-renders the caller when it loads. */
export function useCriticIds(): Set<string> | null {
  const [, bump] = useState(0);
  useEffect(() => {
    const l = () => bump((n) => n + 1);
    listeners.add(l);
    if (!ids && !loading) void refreshCritics();
    return () => {
      listeners.delete(l);
    };
  }, []);
  return ids;
}

export function useIsCritic(id: string | null | undefined): boolean {
  const set = useCriticIds();
  return !!id && !!set?.has(id);
}

/** A small "Critic" pill with a medal, shown next to a critic's name. */
export function CriticBadge({ id }: { id: string | null | undefined }) {
  return useIsCritic(id) ? (
    <View style={styles.pill} accessibilityLabel="Critic">
      <MaterialIcons name="workspace-premium" size={13} color={colors.navy} />
      <Text style={styles.text}>Critic</Text>
    </View>
  ) : null;
}

const styles = StyleSheet.create({
  pill: { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: colors.lightBlue, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 },
  text: { fontFamily: fonts.extraBold, fontSize: 11.5, color: colors.navy },
});
