import { type Dish, fetchDishesBy, type Person } from '@/lib/posts';
import { supabase } from '@/lib/supabase';

// Cook profile (design flow 12): who they are, follow, signature dishes, what's cooking today, reviews.

export type CookProfile = Person & {
  bio: string | null;
  area: string | null;
  governorate: string | null;
};

export type Review = {
  id: string;
  rating: number;
  body: string | null;
  created_at: string;
  reviewer: Person;
};

export type Signature = { id: string; caption: string | null; media_path: string | null; created_at: string };

export type CookStats = { followers: number; reviews: number; rating: number | null };

export async function fetchCookProfile(id: string): Promise<CookProfile | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, username, display_name, avatar_path, bio, area, governorate')
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function fetchCookStats(id: string): Promise<CookStats> {
  const [followers, reviews] = await Promise.all([
    supabase.from('follows').select('follower_id', { count: 'exact', head: true }).eq('followee_id', id),
    supabase.from('reviews').select('rating').eq('cook_id', id),
  ]);
  if (followers.error) throw followers.error;
  if (reviews.error) throw reviews.error;
  const ratings = (reviews.data ?? []).map((r) => r.rating as number);
  const rating = ratings.length ? ratings.reduce((a, b) => a + b, 0) / ratings.length : null;
  return { followers: followers.count ?? 0, reviews: ratings.length, rating };
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
}
