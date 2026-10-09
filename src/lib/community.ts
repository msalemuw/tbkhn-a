import { type Dish, fetchTodaysDishes, type Person } from '@/lib/posts';
import { supabase } from '@/lib/supabase';

/** Name and photo for a set of members (profiles are readable by everyone). */
export async function fetchCommunityPeople(ids: string[]): Promise<Map<string, Person>> {
  const out = new Map<string, Person>();
  if (!ids.length) return out;
  const { data, error } = await supabase.from('profiles').select('id, username, display_name, avatar_path').in('id', [...new Set(ids)]);
  if (error) throw error;
  for (const p of data ?? []) out.set(p.id, p);
  return out;
}

export type CommunityInfo = { id: string; name: string; kind: string; governorate: string; area: string | null };
export type CommunityOverview = { info: CommunityInfo; members: number; cookIds: string[]; today: Dish[] };

export const KIND_LABEL: Record<string, string> = { area: 'Area', compound: 'Compound', club: 'Club', sahel: 'Sahel', school: 'School', work: 'Workplace', other: 'Community' };

/** Everything the community page shows: the community, its members, its cooks (who posted a dish or signature dish for it) and what is cooking today. */
export async function fetchCommunityOverview(id: string): Promise<CommunityOverview | null> {
  const [c, members, posts, dishes] = await Promise.all([
    supabase.from('communities').select('id, name, kind, governorate, area').eq('id', id).eq('status', 'approved').maybeSingle(),
    supabase.from('community_members').select('user_id', { count: 'exact', head: true }).eq('community_id', id),
    supabase.from('posts').select('author_id').eq('community_id', id).in('kind', ['cooking_today', 'signature']).limit(500),
    fetchTodaysDishes(),
  ]);
  if (c.error) throw c.error;
  if (!c.data) return null;
  const cookIds = [...new Set((posts.data ?? []).map((p) => p.author_id as string))];
  return { info: c.data, members: members.count ?? 0, cookIds, today: dishes.filter((d) => d.community_id === id) };
}
