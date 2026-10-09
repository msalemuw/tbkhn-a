import { supabase } from '@/lib/supabase';

// Automated rankings, top 3 per community (see 0009_rankings.sql):
//   service = average rating x picked-up orders, likes = likes on signature dishes.
export type RankKind = 'service' | 'likes';

export type Badge = { kind: RankKind; rank: number; communityId: string; community: string };

export type TopCook = {
  community_id: string;
  community_name: string;
  cook_id: string;
  rank: number;
  score: number;
  orders: number;
  rating: number | null;
  likes: number;
};

async function ranking(kind: RankKind, communityIds: string[]): Promise<TopCook[]> {
  if (!communityIds.length) return [];
  const { data, error } = await supabase.rpc('community_ranking', { p_kind: kind, p_communities: communityIds });
  if (error) throw error;
  return ((data ?? []) as TopCook[]).map((r) => ({ ...r, score: Number(r.score), rating: r.rating == null ? null : Number(r.rating) }));
}

/** The top 3 of one community, for both kinds. */
export async function fetchTop(communityId: string): Promise<{ service: TopCook[]; likes: TopCook[] }> {
  const [service, likes] = await Promise.all([ranking('service', [communityId]), ranking('likes', [communityId])]);
  return { service, likes };
}

/** For each cook, their best rank of each kind across the communities they belong to (only ranks 1 to 3 exist). */
export async function fetchBadges(cookIds: string[]): Promise<Map<string, Badge[]>> {
  const out = new Map<string, Badge[]>();
  const ids = [...new Set(cookIds)];
  if (!ids.length) return out;
  const { data, error } = await supabase.from('community_members').select('community_id').in('user_id', ids);
  if (error) throw error;
  const communities = [...new Set((data ?? []).map((r) => r.community_id as string))];
  const [service, likes] = await Promise.all([ranking('service', communities), ranking('likes', communities)]);
  const want = new Set(ids);
  const best = new Map<string, Badge>();
  for (const [kind, rows] of [['service', service], ['likes', likes]] as const) {
    for (const r of rows) {
      if (!want.has(r.cook_id)) continue;
      const key = `${r.cook_id}:${kind}`;
      const cur = best.get(key);
      if (!cur || r.rank < cur.rank) best.set(key, { kind, rank: r.rank, communityId: r.community_id, community: r.community_name });
    }
  }
  for (const [key, badge] of best) {
    const id = key.split(':')[0];
    out.set(id, [...(out.get(id) ?? []), badge].sort((a) => (a.kind === 'service' ? -1 : 1)));
  }
  return out;
}
