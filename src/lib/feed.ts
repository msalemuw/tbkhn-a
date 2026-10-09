import type { LatLng } from '@/lib/format';
import type { Person } from '@/lib/posts';
import { supabase } from '@/lib/supabase';

// Home feed (design flow 15): signature dishes from the cooks and communities a member watches.
// Orders and today's dishes live on Menu, not here.

export type FeedPost = {
  id: string;
  author_id: string;
  caption: string | null;
  media_path: string | null;
  community_id: string | null;
  created_at: string;
  author: Person;
  community: { name: string } | null;
  likes: number;
  comments: number;
  liked: boolean;
  rating: number | null;
  /** The cook's live "cooking today" dish, if any: the small "See what's cooking today" notice. */
  cookingDishId: string | null;
  /** One of the cook's pickup points, for the distance line. */
  spot: LatLng | null;
};

const POST_SELECT =
  'id, author_id, caption, media_path, community_id, created_at,' +
  ' author:profiles!author_id(id, username, display_name, avatar_path),' +
  ' community:communities(name), likes(count), comments(count)';

type Row = Omit<FeedPost, 'likes' | 'comments' | 'liked' | 'rating' | 'cookingDishId' | 'spot'> & {
  likes: { count: number }[];
  comments: { count: number }[];
};

/** Signature posts, newest first, with like and comment counts, the member's own likes, ratings and live dishes. */
export async function fetchFeed(me: string | null): Promise<FeedPost[]> {
  const { data, error } = await supabase
    .from('posts')
    .select(POST_SELECT)
    .eq('kind', 'signature')
    .order('created_at', { ascending: false })
    .limit(60);
  if (error) throw error;
  const rows = (data ?? []) as unknown as Row[];
  if (!rows.length) return [];
  const ids = rows.map((r) => r.id);
  const authors = [...new Set(rows.map((r) => r.author_id))];
  const [mine, reviews, live, spots] = await Promise.all([
    me ? supabase.from('likes').select('post_id').eq('user_id', me).in('post_id', ids) : Promise.resolve({ data: [] as { post_id: string }[] }),
    supabase.from('reviews').select('cook_id, rating').in('cook_id', authors),
    supabase.from('posts').select('id, author_id').eq('kind', 'cooking_today').gt('expires_at', new Date().toISOString()).in('author_id', authors),
    supabase.from('pickup_points').select('owner_id, lat, lng').in('owner_id', authors),
  ]);
  const likedSet = new Set((mine.data ?? []).map((l) => l.post_id));
  const sums = new Map<string, { sum: number; n: number }>();
  for (const r of reviews.data ?? []) {
    const s = sums.get(r.cook_id) ?? { sum: 0, n: 0 };
    sums.set(r.cook_id, { sum: s.sum + r.rating, n: s.n + 1 });
  }
  const liveBy = new Map<string, string>();
  for (const p of live.data ?? []) if (!liveBy.has(p.author_id)) liveBy.set(p.author_id, p.id);
  const spotBy = new Map<string, LatLng>();
  for (const p of spots.data ?? []) if (!spotBy.has(p.owner_id)) spotBy.set(p.owner_id, { lat: p.lat, lng: p.lng });
  return rows.map((r) => {
    const s = sums.get(r.author_id);
    return {
      ...r,
      likes: r.likes?.[0]?.count ?? 0,
      comments: r.comments?.[0]?.count ?? 0,
      liked: likedSet.has(r.id),
      rating: s ? s.sum / s.n : null,
      cookingDishId: liveBy.get(r.author_id) ?? null,
      spot: spotBy.get(r.author_id) ?? null,
    };
  });
}

export async function setLiked(me: string, postId: string, liked: boolean): Promise<void> {
  const q = liked
    ? supabase.from('likes').insert({ post_id: postId, user_id: me })
    : supabase.from('likes').delete().eq('post_id', postId).eq('user_id', me);
  const { error } = await q;
  if (error && error.code !== '23505') throw error;
}

export type Comment = { id: string; body: string; created_at: string; author: Person };

export async function fetchComments(postId: string): Promise<Comment[]> {
  const { data, error } = await supabase
    .from('comments')
    .select('id, body, created_at, author:profiles!author_id(id, username, display_name, avatar_path)')
    .eq('post_id', postId)
    .order('created_at', { ascending: true })
    .limit(200);
  if (error) throw error;
  return (data ?? []) as unknown as Comment[];
}

export async function addComment(me: string, postId: string, body: string): Promise<void> {
  const { error } = await supabase.from('comments').insert({ post_id: postId, author_id: me, body: body.trim() });
  if (error) throw error;
}

/** A signature dish: a photo and caption that stay on the cook's profile. */
export async function postSignature(me: string, caption: string, mediaPath: string, communityId: string | null): Promise<string> {
  const { data, error } = await supabase
    .from('posts')
    .insert({ author_id: me, kind: 'signature', caption: caption.trim() || null, media_path: mediaPath, community_id: communityId })
    .select('id')
    .single();
  if (error) throw error;
  return data.id;
}

export async function fetchFollowing(me: string): Promise<string[]> {
  const { data, error } = await supabase.from('follows').select('followee_id').eq('follower_id', me);
  if (error) throw error;
  return (data ?? []).map((f) => f.followee_id);
}

export async function reportPost(me: string, postId: string): Promise<void> {
  const { error } = await supabase.from('reports').insert({ reporter_id: me, post_id: postId });
  if (error) throw error;
}

export async function deletePost(postId: string): Promise<void> {
  const { error } = await supabase.from('posts').delete().eq('id', postId);
  if (error) throw error;
}
