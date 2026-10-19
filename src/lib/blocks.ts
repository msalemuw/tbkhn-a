import { Alert } from '@/lib/alert';

import { dataChanged } from '@/lib/live';
import { type Person } from '@/lib/posts';
import { supabase } from '@/lib/supabase';

// Blocking, as the App Store and Google Play expect for apps with member content. Someone you block disappears from your
// feed, stories, today's menu, comments, search and inbox, and the database already refuses their messages, comments and
// likes toward you. Blocks live in public.blocks (one row per block, visible to admin in Data).

let cache: { me: string; ids: Set<string> } | null = null;

async function myId(): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  return data.session?.user.id ?? null;
}

/** Ids the signed-in member has blocked. A failed read hides nothing rather than breaking the screen. */
export async function blockedIds(): Promise<Set<string>> {
  const me = await myId();
  if (!me) return new Set();
  if (cache?.me === me) return cache.ids;
  const { data, error } = await supabase.from('blocks').select('blocked_id').eq('blocker_id', me).limit(1000);
  if (error) return new Set();
  cache = { me, ids: new Set((data ?? []).map((r) => r.blocked_id as string)) };
  return cache.ids;
}

/** Drops anything written by someone the member has blocked. */
export async function withoutBlocked<T>(rows: T[], authorOf: (row: T) => string | null | undefined): Promise<T[]> {
  const ids = await blockedIds();
  if (!ids.size) return rows;
  return rows.filter((r) => !ids.has(authorOf(r) ?? ''));
}

export async function isBlocked(id: string): Promise<boolean> {
  return (await blockedIds()).has(id);
}

export async function blockMember(id: string): Promise<void> {
  const me = await myId();
  if (!me) throw new Error('not signed in');
  const { error } = await supabase.from('blocks').upsert({ blocker_id: me, blocked_id: id }, { onConflict: 'blocker_id,blocked_id', ignoreDuplicates: true });
  if (error) throw error;
  // You stop following them; their follow of you is theirs to remove, but the blocks stop their alerts to you.
  await supabase.from('follows').delete().eq('follower_id', me).eq('followee_id', id);
  (await blockedIds()).add(id);
  dataChanged();
}

export async function unblockMember(id: string): Promise<void> {
  const me = await myId();
  if (!me) throw new Error('not signed in');
  const { error } = await supabase.from('blocks').delete().eq('blocker_id', me).eq('blocked_id', id);
  if (error) throw error;
  (await blockedIds()).delete(id);
  dataChanged();
}

/** People the member has blocked, newest block first (Settings > Blocked accounts). */
export async function fetchBlockedPeople(): Promise<Person[]> {
  const me = await myId();
  if (!me) return [];
  const { data, error } = await supabase
    .from('blocks')
    .select('created_at, person:profiles!blocked_id(id, username, display_name, avatar_path)')
    .eq('blocker_id', me)
    .order('created_at', { ascending: false })
    .limit(500);
  if (error) throw error;
  return ((data ?? []) as unknown as { person: Person | null }[]).map((r) => r.person).filter((p): p is Person => p != null);
}

/** "Block <name>?" with one clear confirmation; calls `done` after it worked. */
export function confirmBlock(name: string, id: string, done?: () => void) {
  Alert.alert(`Block ${name}?`, 'You will no longer see their posts, stories or dishes, and they can’t message you or comment on your posts. You can unblock them any time in Settings > Blocked accounts.', [
    { text: 'Cancel', style: 'cancel' },
    {
      text: 'Block',
      style: 'destructive',
      onPress: () =>
        blockMember(id).then(
          () => done?.(),
          () => Alert.alert('We couldn’t block this person', 'Check your connection and try again.'),
        ),
    },
  ]);
}

export async function reportMember(me: string, profileId: string): Promise<void> {
  const { error } = await supabase.from('reports').insert({ reporter_id: me, profile_id: profileId });
  if (error) throw error;
}
