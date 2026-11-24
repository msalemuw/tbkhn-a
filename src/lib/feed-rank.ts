import AsyncStorage from '@react-native-async-storage/async-storage';

import type { FeedPost } from '@/lib/feed';

// Home feed order. Not "newest first with the followed on top": every post gets a score from how close the cook is, whether the
// member follows them or shares a community, how fresh and liked the post is, and whether the member already saw it. A little
// random jitter, fixed per load, reshuffles close calls each time Home loads, so the feed does not repeat itself.
// The weights are first guesses to tune once there is real usage.

const SEEN_KEY = 'tabkheen.seenPosts';
const SEEN_CAP = 400;

export async function loadSeenPosts(): Promise<Set<string>> {
  try {
    const raw = await AsyncStorage.getItem(SEEN_KEY);
    return new Set(raw ? (JSON.parse(raw) as string[]) : []);
  } catch {
    return new Set();
  }
}

export async function markPostsSeen(ids: string[]): Promise<void> {
  try {
    const raw = await AsyncStorage.getItem(SEEN_KEY);
    const list = raw ? (JSON.parse(raw) as string[]) : [];
    const next = [...list.filter((id) => !ids.includes(id)), ...ids].slice(-SEEN_CAP);
    await AsyncStorage.setItem(SEEN_KEY, JSON.stringify(next));
  } catch {
    // Seen marks are a nicety.
  }
}

/** A number in [0, 1) from a post id and the load's seed, so a post keeps its jitter while the list re-renders. */
function jitter(id: string, seed: number): number {
  let h = seed | 0;
  for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 2654435761);
  h ^= h >>> 15;
  return ((h >>> 0) % 10000) / 10000;
}

export type RankContext = {
  /** Metres from the member to a post's cook, or Infinity when unknown. */
  distance: (p: FeedPost) => number;
  useDistance: boolean;
  following: Set<string>;
  /** True when the post, or its cook, belongs to a community the member watches. */
  inCommunity: (p: FeedPost) => boolean;
  seen: Set<string>;
  seed: number;
  now?: number;
};

export function scorePost(p: FeedPost, c: RankContext): number {
  const now = c.now ?? Date.now();
  const km = c.distance(p) / 1000;
  const near = c.useDistance ? (Number.isFinite(km) ? 1 / (1 + km / 2) : 0.15) : 0;
  const rel = (c.following.has(p.author_id) ? 0.5 : 0) + (c.inCommunity(p) ? 0.3 : 0);
  const ageH = Math.max(0, (now - new Date(p.created_at).getTime()) / 3_600_000);
  const fresh = 0.6 * Math.exp(-ageH / 36);
  const liked = 0.15 * (Math.min(p.likes, 20) / 20);
  const seen = c.seen.has(p.id) ? -0.6 : 0;
  return near + rel + fresh + liked + seen + (jitter(p.id, c.seed) - 0.5) * 0.5;
}

export function rankFeed(list: FeedPost[], c: RankContext): FeedPost[] {
  const now = c.now ?? Date.now();
  return list
    .map((p) => ({ p, s: scorePost(p, { ...c, now }) }))
    .sort((a, b) => b.s - a.s)
    .map((x) => x.p);
}
