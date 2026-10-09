import AsyncStorage from '@react-native-async-storage/async-storage';

import type { Person } from '@/lib/posts';
import { supabase } from '@/lib/supabase';

// Stories (design flows 4 and 17): a photo for 24 hours, plus an automatic "Taking orders" story
// for every dish a cook posts under "What you're cooking today" (it ends at midnight).

export type StoryItem = {
  id: string;
  kind: 'story' | 'cooking_today';
  caption: string | null;
  media_path: string | null;
  created_at: string;
  dish_name: string | null;
  price_egp: number | null;
  portions_left: number | null;
  ready_at: string | null;
  community: { name: string } | null;
  likes: number;
  liked: boolean;
};

export type StoryGroup = { author: Person; items: StoryItem[] };

const SELECT =
  'id, author_id, kind, caption, media_path, created_at, dish_name, price_egp, portions_left, ready_at,' +
  ' author:profiles!author_id(id, username, display_name, avatar_path), community:communities(name), likes(count)';

type Row = Omit<StoryItem, 'likes' | 'liked'> & { author_id: string; author: Person; likes: { count: number }[] };

/** Everyone with a live story or a live dish, grouped by cook; the member's own group first. */
export async function fetchStories(me: string | null): Promise<StoryGroup[]> {
  const { data, error } = await supabase
    .from('posts')
    .select(SELECT)
    .in('kind', ['story', 'cooking_today'])
    .gt('expires_at', new Date().toISOString())
    .order('created_at', { ascending: true })
    .limit(300);
  if (error) throw error;
  const rows = (data ?? []) as unknown as Row[];
  const liked = new Set<string>();
  if (me && rows.length) {
    const { data: mine } = await supabase.from('likes').select('post_id').eq('user_id', me).in('post_id', rows.map((r) => r.id));
    for (const l of mine ?? []) liked.add(l.post_id);
  }
  const groups = new Map<string, StoryGroup>();
  for (const r of rows) {
    const g = groups.get(r.author_id) ?? { author: r.author, items: [] };
    g.items.push({ ...r, likes: r.likes?.[0]?.count ?? 0, liked: liked.has(r.id) });
    groups.set(r.author_id, g);
  }
  const list = [...groups.values()];
  // Newest activity first, with the member's own stories at the front.
  list.sort((a, b) => Date.parse(b.items[b.items.length - 1].created_at) - Date.parse(a.items[a.items.length - 1].created_at));
  return me ? [...list.filter((g) => g.author.id === me), ...list.filter((g) => g.author.id !== me)] : list;
}

export async function postStory(me: string, caption: string, mediaPath: string, communityId: string | null): Promise<string> {
  const { data, error } = await supabase
    .from('posts')
    .insert({ author_id: me, kind: 'story', caption: caption.trim() || null, media_path: mediaPath, community_id: communityId })
    .select('id')
    .single();
  if (error) throw error;
  return data.id;
}

const SEEN_KEY = 'tabkheen.seenStories';

export async function loadSeen(): Promise<string[]> {
  try {
    const raw = await AsyncStorage.getItem(SEEN_KEY);
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch {
    return [];
  }
}

export async function markSeen(ids: string[]): Promise<void> {
  try {
    const now = new Set(await loadSeen());
    for (const id of ids) now.add(id);
    // Stories last at most a day, so a short list is enough.
    await AsyncStorage.setItem(SEEN_KEY, JSON.stringify([...now].slice(-300)));
  } catch {}
}
