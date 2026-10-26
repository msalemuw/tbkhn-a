import { distanceMeters, type LatLng } from '@/lib/format';
import { dataChanged } from '@/lib/live';
import { type Dish, fetchDishesBy, type Person } from '@/lib/posts';
import { withoutBlocked } from '@/lib/blocks';
import { supabase } from '@/lib/supabase';

// Cook profile (design flow 12): who they are, follow, signature dishes, today's menu, reviews.

export type CookProfile = Person & {
  bio: string | null;
  area: string | null;
  instagram_url: string | null;
  facebook_url: string | null;
  tiktok_url: string | null;
};

export type Review = {
  id: string;
  rating: number;
  body: string | null;
  created_at: string;
  reviewer: Person;
};

export type Signature = { id: string; caption: string | null; media_path: string | null; created_at: string };

export type CookStats = { followers: number; following: number; communities: number; reviews: number; rating: number | null };

export async function fetchCookProfile(id: string): Promise<CookProfile | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, username, display_name, avatar_path, bio, area, instagram_url, facebook_url, tiktok_url')
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function fetchCookStats(id: string): Promise<CookStats> {
  const count = (q: PromiseLike<{ count: number | null; error: unknown }>) =>
    q.then(({ count: n, error }) => {
      if (error) throw error;
      return n ?? 0;
    });
  const [followers, following, communities, reviews] = await Promise.all([
    count(supabase.from('follows').select('follower_id', { count: 'exact', head: true }).eq('followee_id', id)),
    count(supabase.from('follows').select('followee_id', { count: 'exact', head: true }).eq('follower_id', id)),
    count(supabase.from('community_members').select('community_id', { count: 'exact', head: true }).eq('user_id', id)),
    supabase.from('reviews').select('rating').eq('cook_id', id),
  ]);
  if (reviews.error) throw reviews.error;
  const ratings = (reviews.data ?? []).map((r) => r.rating as number);
  const rating = ratings.length ? ratings.reduce((a, b) => a + b, 0) / ratings.length : null;
  return { followers, following, communities, reviews: ratings.length, rating };
}

export async function fetchReviews(cookId: string): Promise<Review[]> {
  const { data, error } = await supabase
    .from('reviews')
    .select('id, rating, body, created_at, reviewer:profiles!reviewer_id(id, username, display_name, avatar_path)')
    .eq('cook_id', cookId)
    .order('created_at', { ascending: false })
    .limit(50);
  if (error) throw error;
  return (data ?? []) as unknown as Review[];
}

export async function fetchSignatures(cookId: string): Promise<Signature[]> {
  const { data, error } = await supabase
    .from('posts')
    .select('id, caption, media_path, created_at')
    .eq('author_id', cookId)
    .eq('kind', 'signature')
    .order('created_at', { ascending: false })
    .limit(50);
  if (error) throw error;
  return data ?? [];
}

export async function fetchCookDishes(cookId: string): Promise<Dish[]> {
  return fetchDishesBy(cookId);
}

export async function isFollowing(me: string, cookId: string): Promise<boolean> {
  const { data, error } = await supabase.from('follows').select('follower_id').eq('follower_id', me).eq('followee_id', cookId).maybeSingle();
  if (error) throw error;
  return !!data;
}

export async function setFollowing(me: string, cookId: string, follow: boolean): Promise<void> {
  const q = follow
    ? supabase.from('follows').insert({ follower_id: me, followee_id: cookId })
    : supabase.from('follows').delete().eq('follower_id', me).eq('followee_id', cookId);
  const { error } = await q;
  if (error) throw error;
  dataChanged();
}

export type FoundCook = Person & { area: string | null };

/** People search: by name or @handle. With no text: nearest first, then sellers, signature posters, newest members. */
export async function searchCooks(text: string, me: string | null, here: LatLng | null = null): Promise<FoundCook[]> {
  return withoutBlocked(await searchCooksAll(text, me, here), (c) => c.id);
}

async function searchCooksAll(text: string, me: string | null, here: LatLng | null): Promise<FoundCook[]> {
  const q = text.trim().replace(/^@/, '').replace(/[%,()*]/g, ' ').trim();
  const cols = 'id, username, display_name, avatar_path, area';
  if (q) {
    const { data, error } = await supabase
      .from('profiles')
      .select(cols)
      .or(`display_name.ilike.%${q}%,username.ilike.%${q}%`)
      .not('username', 'is', null)
      .limit(20);
    if (error) throw error;
    return (data ?? []).filter((p) => p.id !== me);
  }
  // No search text: nearest cooks first (2 km bands), then sellers, signature posters and the newest members.
  const [today, sig, newest] = await Promise.all([
    supabase.from('posts').select('author_id').eq('kind', 'cooking_today').order('created_at', { ascending: false }).limit(60),
    supabase.from('posts').select('author_id').eq('kind', 'signature').order('created_at', { ascending: false }).limit(60),
    supabase.from('profiles').select(cols).not('username', 'is', null).order('created_at', { ascending: false }).limit(40),
  ]);
  if (today.error) throw today.error;
  if (sig.error) throw sig.error;
  if (newest.error) throw newest.error;
  const sellers = new Set((today.data ?? []).map((r) => r.author_id as string));
  const posters = new Set((sig.data ?? []).map((r) => r.author_id as string));
  const ids = [...new Set([...sellers, ...posters, ...(newest.data ?? []).map((p) => p.id as string)])].filter((id) => id !== me);
  if (!ids.length) return [];
  const [profiles, points] = await Promise.all([
    supabase.from('profiles').select(cols).not('username', 'is', null).in('id', ids),
    here ? supabase.from('pickup_points').select('owner_id, lat, lng').in('owner_id', ids) : Promise.resolve({ data: [], error: null }),
  ]);
  if (profiles.error) throw profiles.error;
  if (points.error) throw points.error;
  const near = new Map<string, number>();
  for (const pt of points.data ?? []) {
    const d = distanceMeters(here!, { lat: pt.lat as number, lng: pt.lng as number });
    near.set(pt.owner_id as string, Math.min(near.get(pt.owner_id as string) ?? Infinity, d));
  }
  const rank = (id: string) => {
    const band = near.has(id) ? Math.floor(near.get(id)! / 2000) : Infinity;
    const tier = sellers.has(id) ? 0 : posters.has(id) ? 1 : 2;
    return [band, tier, near.get(id) ?? Infinity];
  };
  return (profiles.data ?? [])
    .sort((x, y) => {
      const a = rank(x.id as string);
      const b = rank(y.id as string);
      return (a[0] === b[0] ? 0 : a[0] < b[0] ? -1 : 1) || a[1] - b[1] || (a[2] === b[2] ? 0 : a[2] < b[2] ? -1 : 1);
    })
    .slice(0, 20);
}

export async function fetchFollowedAmong(me: string, ids: string[]): Promise<Set<string>> {
  if (!ids.length) return new Set();
  const { data, error } = await supabase.from('follows').select('followee_id').eq('follower_id', me).in('followee_id', ids);
  if (error) throw error;
  return new Set((data ?? []).map((r) => r.followee_id as string));
}

export type FoundCommunity = { id: string; name: string; kind: string; governorate: string; area: string | null };

export async function searchCommunities(text: string): Promise<FoundCommunity[]> {
  const q = text.trim().replace(/[%,()*]/g, ' ').trim();
  let query = supabase.from('communities').select('id, name, kind, governorate, area').eq('status', 'approved').order('name').limit(30);
  if (q) query = query.ilike('name', `%${q}%`);
  const { data, error } = await query;
  if (error) throw error;
  return data ?? [];
}

export async function setMembership(me: string, communityId: string, join: boolean): Promise<void> {
  const q = join
    ? supabase.from('community_members').upsert({ community_id: communityId, user_id: me }, { ignoreDuplicates: true })
    : supabase.from('community_members').delete().eq('community_id', communityId).eq('user_id', me);
  const { error } = await q;
  if (error) throw error;
  dataChanged();
}

/** People who follow `id` ("followers") or whom `id` follows ("following"). */
export async function fetchPeopleList(id: string, kind: 'followers' | 'following'): Promise<FoundCook[]> {
  const [from, other] = kind === 'followers' ? (['followee_id', 'follower_id'] as const) : (['follower_id', 'followee_id'] as const);
  const { data, error } = await supabase.from('follows').select(other).eq(from, id).limit(500);
  if (error) throw error;
  const ids = (data ?? []).map((r) => (r as Record<string, string>)[other]);
  if (!ids.length) return [];
  const { data: people, error: pe } = await supabase.from('profiles').select('id, username, display_name, avatar_path, area').in('id', ids);
  if (pe) throw pe;
  return withoutBlocked(people ?? [], (p) => p.id);
}

/** Approved communities `id` belongs to. */
export async function fetchCommunitiesOf(id: string): Promise<FoundCommunity[]> {
  const { data, error } = await supabase
    .from('community_members')
    .select('community:communities(id, name, kind, governorate, area, status)')
    .eq('user_id', id);
  if (error) throw error;
  return ((data ?? []) as unknown as { community: (FoundCommunity & { status: string }) | null }[])
    .flatMap((r) => (r.community && r.community.status === 'approved' ? [r.community] : []))
    .sort((a, b) => a.name.localeCompare(b.name));
}
