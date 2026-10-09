import type { Person } from '@/lib/posts';
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
