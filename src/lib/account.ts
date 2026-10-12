import { supabase } from '@/lib/supabase';

/** Removes the member's own photos from storage, best effort: the files are theirs and the account goes either way. */
async function removeOwnFiles(userId: string) {
  try {
    const { data } = await supabase.storage.from('media').list(userId, { limit: 1000 });
    if (data?.length) await supabase.storage.from('media').remove(data.map((f) => `${userId}/${f.name}`));
  } catch {
    // Ignored: a failed clean-up must not keep someone from deleting their account.
  }
}

/** Deletes the signed-in member's account for good. Returns null when done, or a sentence to show when it could not. */
export async function deleteMyAccount(userId: string): Promise<string | null> {
  // Check first, so the photos are only removed once the account can really go.
  const open = await supabase
    .from('reservations')
    .select('id', { count: 'exact', head: true })
    .or(`buyer_id.eq.${userId},cook_id.eq.${userId}`)
    .in('status', ['pending', 'accepted', 'ready']);
  if (open.count && open.count > 0) return 'You still have an open order. Finish or cancel it first, then try again.';

  await removeOwnFiles(userId);
  const { error } = await supabase.rpc('delete_my_account');
  if (error) {
    if (error.message.includes('open orders')) return 'You still have an open order. Finish or cancel it first, then try again.';
    if (error.message.includes('last owner')) return 'You are the only owner of the admin panel. Add another owner first, then try again.';
    return 'Check your connection and try again. If it keeps failing, write to help@tabkheen-a.com.';
  }
  await supabase.auth.signOut();
  return null;
}
