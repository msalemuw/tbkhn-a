import { useEffect, useState } from 'react';
import { Pressable, StyleSheet } from 'react-native';

import { Text } from '@/components/text';
import { colors, fonts } from '@/constants/theme';
import { setFollowing } from '@/lib/cooks';
import { fetchFollowing } from '@/lib/feed';
import { useSession } from '@/lib/session';

// A small "Follow" next to a cook's name on posts and menu dishes, like Instagram, so nobody forgets to follow. It shows only
// while you are not following that person, and goes away the moment you tap it. The list of who you follow is loaded once
// and shared by every button on screen.
let owner: string | null = null;
let followed: Set<string> | null = null;
let loading: Promise<void> | null = null;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());

function load(me: string) {
  if (loading) return;
  loading = fetchFollowing(me)
    .then((ids) => {
      owner = me;
      followed = new Set(ids);
      notify();
    })
    // A failed read is not remembered as "you follow nobody": no buttons show until it loads.
    .catch(() => {})
    .finally(() => {
      loading = null;
    });
}

/** Keeps the shared list in step when someone is followed or unfollowed somewhere else (the profile button). */
export function markFollowed(me: string, id: string, isFollowing: boolean) {
  if (owner !== me || !followed) return;
  followed = new Set(followed);
  if (isFollowing) followed.add(id);
  else followed.delete(id);
  notify();
}

export function FollowButton({ id }: { id: string }) {
  const { session } = useSession();
  const me = session?.user.id ?? null;
  const [, bump] = useState(0);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const l = () => bump((n) => n + 1);
    listeners.add(l);
    if (me && (owner !== me || !followed)) load(me);
    return () => {
      listeners.delete(l);
    };
  }, [me]);

  if (!me || id === me || owner !== me || !followed || followed.has(id)) return null;

  async function onPress() {
    if (!me || busy) return;
    setBusy(true);
    markFollowed(me, id, true);
    try {
      await setFollowing(me, id, true);
    } catch {
      markFollowed(me, id, false);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Pressable onPress={onPress} hitSlop={8} style={styles.btn} accessibilityRole="button" accessibilityLabel="Follow">
      <Text style={styles.text}>Follow</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  btn: { borderRadius: 999, borderWidth: 1.5, borderColor: colors.teal, paddingHorizontal: 11, paddingVertical: 3 },
  text: { fontFamily: fonts.extraBold, fontSize: 12.5, color: colors.navy },
});
