import { dataChanged } from '@/lib/live';
import type { LatLng } from '@/lib/format';
import { withoutBlocked } from '@/lib/blocks';
import type { Person } from '@/lib/posts';
import { parseRecipe, type Recipe } from '@/lib/recipe';
import { supabase } from '@/lib/supabase';

// Home feed (design flow 15): signature dishes from the cooks and communities a member watches.
// Orders and today's dishes live on Menu, not here.

export type FeedPost = {
  id: string;
  author_id: string;
  caption: string | null;
  media_path: string | null;
  community_id: string | null;
  community_ids: string[];
  created_at: string;
  author: Person;
  community: { name: string } | null;
  likes: number;
  comments: number;
  liked: boolean;
  /** Saved by the viewer (private bookmark). */
  saved: boolean;
  rating: number | null;
  /** The cook's live today's menu dish, if any: the small "See today's menu" notice. */
  cookingDishId: string | null;
  /** One of the cook's pickup points, for the distance line. */
  spot: LatLng | null;
  /** The photos after the first, in order (a carousel post). Empty for a single-photo post. */
  extra_media: string[];
  /** Width / height of the post's photos (0073_post_photo_shape.sql). Null = square, as every older post. */
  media_aspect: number | null;
  /** Which part of each photo the square feed frame shows, in photo order (0075_post_photo_focus.sql). Null = centred. */
  media_focus: { x: number; y: number }[] | null;
  /** The optional recipe (0074_post_recipe.sql). */
  recipe: Recipe | null;
};

const POST_SELECT =
  'id, author_id, caption, media_path, community_id, community_ids, created_at,' +
  ' author:profiles!author_id(id, username, display_name, avatar_path),' +
  ' community:communities(name), likes(count), comments(count)';

type Row = Omit<FeedPost, 'likes' | 'comments' | 'liked' | 'saved' | 'rating' | 'cookingDishId' | 'spot' | 'extra_media' | 'media_aspect' | 'recipe' | 'media_focus'> & {
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
  return enrich(await withoutBlocked((data ?? []) as unknown as Row[], (r) => r.author_id), me);
}

/** One cook's signature posts, newest first (the post screen opened from a profile). */
export async function fetchPostsBy(me: string | null, authorId: string): Promise<FeedPost[]> {
  const { data, error } = await supabase
    .from('posts')
    .select(POST_SELECT)
    .eq('kind', 'signature')
    .eq('author_id', authorId)
    .order('created_at', { ascending: false })
    .limit(50);
  if (error) throw error;
  return enrich((data ?? []) as unknown as Row[], me);
}

async function enrich(rows: Row[], me: string | null): Promise<FeedPost[]> {
  if (!rows.length) return [];
  const ids = rows.map((r) => r.id);
  const authors = [...new Set(rows.map((r) => r.author_id))];
  const [mine, savedMine, reviews, live, spots, media, shapes, focuses, recipes] = await Promise.all([
    me ? supabase.from('likes').select('post_id').eq('user_id', me).in('post_id', ids) : Promise.resolve({ data: [] as { post_id: string }[] }),
    me ? supabase.from('saved_posts').select('post_id').eq('user_id', me).in('post_id', ids) : Promise.resolve({ data: [] as { post_id: string }[] }),
    supabase.from('reviews').select('cook_id, rating').in('cook_id', authors),
    supabase.from('posts').select('id, author_id').eq('kind', 'cooking_today').gt('expires_at', new Date().toISOString()).in('author_id', authors),
    supabase.from('pickup_points').select('owner_id, area_lat, area_lng').in('owner_id', authors),
    // Carousel photos (0072_post_media.sql). Before the database has it, every post simply shows its first photo.
    supabase.from('post_media').select('post_id, position, path').in('post_id', ids).order('position'),
    // The photos' shape, read apart so a missing column never hides the feed.
    supabase.from('posts').select('id, media_aspect').in('id', ids),
    // Where the feed frame sits on each photo (0075), also read apart.
    supabase.from('posts').select('id, media_focus').in('id', ids),
    // The recipe, also read apart so a missing column never hides the feed.
    supabase.from('posts').select('id, recipe').in('id', ids),
  ]);
  const focusBy = new Map<string, { x: number; y: number }[]>();
  for (const a of (focuses.error ? [] : focuses.data ?? []) as { id: string; media_focus: unknown }[]) {
    if (!Array.isArray(a.media_focus)) continue;
    const list = a.media_focus.map((f) => {
      const o = (f ?? {}) as { x?: unknown; y?: unknown };
      return { x: typeof o.x === 'number' ? Math.min(1, Math.max(0, o.x)) : 0.5, y: typeof o.y === 'number' ? Math.min(1, Math.max(0, o.y)) : 0.5 };
    });
    if (list.length) focusBy.set(a.id, list);
  }
  const recipeBy = new Map<string, Recipe>();
  for (const a of (recipes.error ? [] : recipes.data ?? []) as { id: string; recipe: unknown }[]) {
    const r = parseRecipe(a.recipe);
    if (r) recipeBy.set(a.id, r);
  }
  const aspectBy = new Map<string, number>();
  for (const a of (shapes.error ? [] : shapes.data ?? []) as { id: string; media_aspect: number | null }[]) if (a.media_aspect) aspectBy.set(a.id, a.media_aspect);
  const extraBy = new Map<string, string[]>();
  for (const m of (media.error ? [] : media.data ?? []) as { post_id: string; path: string }[]) extraBy.set(m.post_id, [...(extraBy.get(m.post_id) ?? []), m.path]);
  const likedSet = new Set((mine.data ?? []).map((l) => l.post_id));
  const savedSet = new Set((savedMine.data ?? []).map((l) => l.post_id));
  const sums = new Map<string, { sum: number; n: number }>();
  for (const r of reviews.data ?? []) {
    const s = sums.get(r.cook_id) ?? { sum: 0, n: 0 };
    sums.set(r.cook_id, { sum: s.sum + r.rating, n: s.n + 1 });
  }
  const liveBy = new Map<string, string>();
  for (const p of live.data ?? []) if (!liveBy.has(p.author_id)) liveBy.set(p.author_id, p.id);
  const spotBy = new Map<string, LatLng>();
  for (const p of spots.data ?? []) if (!spotBy.has(p.owner_id)) spotBy.set(p.owner_id, { lat: p.area_lat, lng: p.area_lng });
  return rows.map((r) => {
    const s = sums.get(r.author_id);
    return {
      ...r,
      likes: r.likes?.[0]?.count ?? 0,
      comments: r.comments?.[0]?.count ?? 0,
      liked: likedSet.has(r.id),
      saved: savedSet.has(r.id),
      rating: s ? s.sum / s.n : null,
      cookingDishId: liveBy.get(r.author_id) ?? null,
      spot: spotBy.get(r.author_id) ?? null,
      extra_media: extraBy.get(r.id) ?? [],
      media_aspect: aspectBy.get(r.id) ?? null,
      media_focus: focusBy.get(r.id) ?? null,
      recipe: recipeBy.get(r.id) ?? null,
    };
  });
}

export async function fetchLiveDistances(ids: string[], from: LatLng): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  if (!ids.length) return out;
  const { data, error } = await supabase.rpc('people_distance', { p_ids: [...new Set(ids)], p_lat: from.lat, p_lng: from.lng });
  if (error) throw error;
  for (const r of (data ?? []) as { id: string; meters: number }[]) out.set(r.id, r.meters);
  return out;
}

/** The member's saved posts, most recently saved first. Posts since deleted or hidden by a block drop out. */
export async function fetchSaved(me: string): Promise<FeedPost[]> {
  const { data: saves, error } = await supabase.from('saved_posts').select('post_id').eq('user_id', me).order('created_at', { ascending: false }).limit(100);
  if (error) throw error;
  const ids = (saves ?? []).map((s) => s.post_id);
  if (!ids.length) return [];
  const { data, error: postsError } = await supabase.from('posts').select(POST_SELECT).eq('kind', 'signature').in('id', ids);
  if (postsError) throw postsError;
  const rows = await withoutBlocked((data ?? []) as unknown as Row[], (r) => r.author_id);
  const order = new Map(ids.map((id, i) => [id, i]));
  rows.sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
  return enrich(rows, me);
}

export async function setSaved(me: string, postId: string, saved: boolean): Promise<void> {
  const q = saved
    ? supabase.from('saved_posts').insert({ post_id: postId, user_id: me })
    : supabase.from('saved_posts').delete().eq('post_id', postId).eq('user_id', me);
  const { error } = await q;
  if (error && error.code !== '23505') throw error;
}

export async function setLiked(me: string, postId: string, liked: boolean): Promise<void> {
  const q = liked
    ? supabase.from('likes').insert({ post_id: postId, user_id: me })
    : supabase.from('likes').delete().eq('post_id', postId).eq('user_id', me);
  const { error } = await q;
  if (error && error.code !== '23505') throw error;
  dataChanged();
}

/** `parent_id` is the top-level comment a reply sits under; `reply_to_id` is the exact comment it answers (null for a top-level comment). */
export type Comment = { id: string; body: string; created_at: string; author: Person; parent_id: string | null; reply_to_id: string | null; likes: number; liked: boolean };

export async function fetchComments(postId: string, me: string | null): Promise<Comment[]> {
  const { data, error } = await supabase
    .from('comments')
    .select('id, body, created_at, parent_id, reply_to_id, author:profiles!author_id(id, username, display_name, avatar_path)')
    .eq('post_id', postId)
    .order('created_at', { ascending: true })
    .limit(200);
  if (error) throw error;
  const rows = await withoutBlocked((data ?? []) as unknown as Omit<Comment, 'likes' | 'liked'>[], (c) => c.author?.id);
  if (!rows.length) return [];
  // One read for every like in the thread: the count per comment, and which ones are the member's own.
  // If the likes cannot be read (for example before the database is updated) the comments still show, with no hearts.
  const { data: likes } = await supabase.from('comment_likes').select('comment_id, user_id').in('comment_id', rows.map((c) => c.id)).limit(5000);
  const count = new Map<string, number>();
  const mine = new Set<string>();
  for (const l of likes ?? []) {
    count.set(l.comment_id, (count.get(l.comment_id) ?? 0) + 1);
    if (me && l.user_id === me) mine.add(l.comment_id);
  }
  return rows.map((c) => ({ ...c, likes: count.get(c.id) ?? 0, liked: mine.has(c.id) }));
}

export async function setCommentLiked(me: string, commentId: string, liked: boolean): Promise<void> {
  const q = liked
    ? supabase.from('comment_likes').insert({ comment_id: commentId, user_id: me })
    : supabase.from('comment_likes').delete().eq('comment_id', commentId).eq('user_id', me);
  const { error } = await q;
  if (error && error.code !== '23505') throw error;
}

/** Who liked a post, newest like first (likes are readable by everyone, like on Instagram). */
export async function fetchLikers(postId: string): Promise<Person[]> {
  const { data, error } = await supabase
    .from('likes')
    .select('user:profiles!user_id(id, username, display_name, avatar_path)')
    .eq('post_id', postId)
    .order('created_at', { ascending: false })
    .limit(200);
  if (error) throw error;
  return ((data ?? []) as unknown as { user: Person | null }[]).map((r) => r.user).filter((u): u is Person => u != null);
}

export async function addComment(me: string, postId: string, body: string, reply?: { parentId: string; replyToId: string }): Promise<void> {
  const { error } = await supabase.from('comments').insert({ post_id: postId, author_id: me, body: body.trim(), ...(reply ? { parent_id: reply.parentId, reply_to_id: reply.replyToId } : {}) });
  if (error) throw error;
  dataChanged();
}

export async function deleteComment(id: string): Promise<void> {
  const { error } = await supabase.from('comments').delete().eq('id', id);
  if (error) throw error;
  dataChanged();
}

/** A signature dish: a photo and caption that stay on the cook's profile. */
export async function postSignature(me: string, caption: string, mediaPath: string, communityId: string | null, morePaths: string[] = [], aspect: number | null = null, recipe: Recipe | null = null, focus: { x: number; y: number }[] = []): Promise<string> {
  const row: Record<string, unknown> = { author_id: me, kind: 'signature', caption: caption.trim() || null, media_path: mediaPath, community_id: communityId };
  const shaped = aspect && Math.abs(aspect - 1) > 0.01;
  const extra: Record<string, unknown> = {};
  if (shaped) extra.media_aspect = Math.min(2, Math.max(0.5, aspect));
  if (focus.length) extra.media_focus = focus;
  if (recipe) extra.recipe = recipe;
  let res = await supabase.from('posts').insert({ ...row, ...extra }).select('id').single();
  // Before 0073 / 0074 / 0075 are run the columns do not exist: post anyway (square photo, no recipe).
  if (res.error && Object.keys(extra).length) res = await supabase.from('posts').insert(row).select('id').single();
  const { data, error } = res;
  if (error) throw error;
  if (morePaths.length) {
    const { error: mediaError } = await supabase.from('post_media').insert(morePaths.map((path, i) => ({ post_id: data.id, position: i + 1, path })));
    if (mediaError) {
      // Never leave a half-posted carousel: take the post back down and say so.
      await supabase.from('posts').delete().eq('id', data.id);
      throw mediaError;
    }
  }
  dataChanged();
  return data.id;
}

export async function fetchFollowing(me: string): Promise<string[]> {
  const { data, error } = await supabase.from('follows').select('followee_id').eq('follower_id', me);
  if (error) throw error;
  return (data ?? []).map((f) => f.followee_id);
}

export async function reportPost(me: string, postId: string, reason?: string): Promise<void> {
  const { error } = await supabase.from('reports').insert({ reporter_id: me, post_id: postId, reason: reason ? reason.slice(0, 500) : null });
  if (error) throw error;
}

export async function updateCaption(postId: string, caption: string): Promise<void> {
  const { error } = await supabase.from('posts').update({ caption: caption.trim() || null }).eq('id', postId);
  if (error) throw error;
  dataChanged();
}

/** Add, change or remove (null) the recipe on one of my own posts. */
export async function updateRecipe(postId: string, recipe: Recipe | null): Promise<void> {
  const { error } = await supabase.from('posts').update({ recipe }).eq('id', postId);
  if (error) throw error;
  dataChanged();
}

/**
 * Take a "Today's menu" dish off the menu and end its story. A dish nobody ordered is deleted outright; one with orders can't be
 * deleted (the orders still point at it), so it is ended now instead: it leaves the menu and stories, the orders stay.
 */
export async function removeDish(postId: string): Promise<void> {
  const { error } = await supabase.from('posts').delete().eq('id', postId);
  if (error) {
    if (error.code !== '23503') throw error;
    const { error: e2 } = await supabase.from('posts').update({ expires_at: new Date().toISOString() }).eq('id', postId);
    if (e2) throw e2;
  }
  dataChanged();
}

export async function deletePost(postId: string): Promise<void> {
  const { error } = await supabase.from('posts').delete().eq('id', postId);
  if (error) throw error;
  dataChanged();
}
