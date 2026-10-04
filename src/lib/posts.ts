import { supabase } from '@/lib/supabase';

// Cooking-today posts: the dish, price, portions and pickup point in one place (design flow 9).

export const CUISINES = ['Egyptian', 'Mediterranean', 'Indian', 'Italian', 'Desserts', 'Asian', 'Breakfast', 'Bakery', 'Grill', 'Lebanese', 'Mexican'] as const;
export const INGREDIENTS = ['Vegetables', 'Beef', 'Chicken', 'Seafood', 'Dairy'] as const;

export type Person = { id: string; username: string | null; display_name: string | null; avatar_path: string | null };
export type PickupPoint = { id: string; label: string; lat: number; lng: number };

export type Dish = {
  id: string;
  author_id: string;
  caption: string | null;
  media_path: string | null;
  dish_name: string;
  cuisine: string | null;
  main_ingredients: string[];
  price_egp: number;
  portions_total: number;
  portions_left: number;
  ready_at: string;
  expires_at: string;
  created_at: string;
  community_id: string | null;
  author: Person;
  pickup_point: PickupPoint | null;
  community: { name: string } | null;
};

const DISH_SELECT =
  'id, author_id, caption, media_path, dish_name, cuisine, main_ingredients, price_egp, portions_total, portions_left, ready_at, expires_at, created_at, community_id,' +
  ' author:profiles!author_id(id, username, display_name, avatar_path),' +
  ' pickup_point:pickup_points(id, label, lat, lng),' +
  ' community:communities(name)';

/** Everything still being served today, newest first. */
export async function fetchTodaysDishes(): Promise<Dish[]> {
  const { data, error } = await supabase
    .from('posts')
    .select(DISH_SELECT)
    .eq('kind', 'cooking_today')
    .gt('expires_at', new Date().toISOString())
    .order('created_at', { ascending: false })
    .limit(200);
  if (error) throw error;
  return (data ?? []) as unknown as Dish[];
}

/** What one cook is still serving today (their profile's "What's cooking today" tab). */
export async function fetchDishesBy(cookId: string): Promise<Dish[]> {
  const { data, error } = await supabase
    .from('posts')
    .select(DISH_SELECT)
    .eq('kind', 'cooking_today')
    .eq('author_id', cookId)
    .gt('expires_at', new Date().toISOString())
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as unknown as Dish[];
}

export async function fetchDish(id: string): Promise<Dish | null> {
  const { data, error } = await supabase.from('posts').select(DISH_SELECT).eq('id', id).maybeSingle();
  if (error) throw error;
  return data as unknown as Dish | null;
}

export function mediaUrl(path: string | null): string | null {
  return path ? supabase.storage.from('media').getPublicUrl(path).data.publicUrl : null;
}

/** Uploads a picked photo to media/<user id>/..., the only folder the user may write to. */
export async function uploadPhoto(userId: string, uri: string, mimeType = 'image/jpeg'): Promise<string> {
  const ext = mimeType === 'image/png' ? 'png' : 'jpg';
  const path = `${userId}/${Date.now()}.${ext}`;
  const body = await (await fetch(uri)).arrayBuffer();
  const { error } = await supabase.storage.from('media').upload(path, body, { contentType: mimeType });
  if (error) throw error;
  return path;
}

export type MyCommunity = { id: string; name: string; kind: string };

export async function fetchMyCommunities(userId: string): Promise<MyCommunity[]> {
  const { data, error } = await supabase
    .from('community_members')
    .select('community:communities(id, name, kind)')
    .eq('user_id', userId);
  if (error) throw error;
  return ((data ?? []) as unknown as { community: MyCommunity | null }[]).flatMap((r) => (r.community ? [r.community] : []));
}

export async function fetchMyPickupPoints(userId: string): Promise<PickupPoint[]> {
  const { data, error } = await supabase.from('pickup_points').select('id, label, lat, lng').eq('owner_id', userId).order('created_at');
  if (error) throw error;
  return data ?? [];
}

export async function addPickupPoint(userId: string, label: string, lat: number, lng: number): Promise<PickupPoint> {
  const { data, error } = await supabase
    .from('pickup_points')
    .insert({ owner_id: userId, label, lat, lng })
    .select('id, label, lat, lng')
    .single();
  if (error) throw error;
  return data;
}

export type NewDish = {
  caption: string;
  mediaPath: string | null;
  dishName: string;
  priceEgp: number;
  portions: number;
  communityId: string;
  pickupPointId: string;
  cuisine: string | null;
  ingredients: string[];
  readyAt: number;
  expiresAt: number;
  notifyFollowers: boolean;
};

export async function postCookingToday(userId: string, d: NewDish): Promise<string> {
  const { data, error } = await supabase
    .from('posts')
    .insert({
      author_id: userId,
      kind: 'cooking_today',
      caption: d.caption.trim() || null,
      media_path: d.mediaPath,
      dish_name: d.dishName.trim(),
      price_egp: d.priceEgp,
      portions_total: d.portions,
      community_id: d.communityId,
      pickup_point_id: d.pickupPointId,
      cuisine: d.cuisine,
      main_ingredients: d.ingredients,
      ready_at: new Date(d.readyAt).toISOString(),
      expires_at: new Date(d.expiresAt).toISOString(),
      notify_followers: d.notifyFollowers,
    })
    .select('id')
    .single();
  if (error) throw error;
  return data.id;
}

export function personName(p: Person | null | undefined): string {
  return p?.display_name || (p?.username ? `@${p.username}` : 'A neighbor');
}
