import type { Person } from '@/lib/posts';
import { supabase } from '@/lib/supabase';

// Reservations: pickup only, paid peer to peer by InstaPay (section 13). Every change goes through
// the database functions, which enforce who may do what and when.

export type OrderStatus = 'pending' | 'accepted' | 'declined' | 'ready' | 'picked_up' | 'cancelled';
export type PaymentStatus = 'none' | 'sent' | 'received';

export type Order = {
  id: string;
  post_id: string;
  buyer_id: string;
  cook_id: string;
  plates: number;
  status: OrderStatus;
  payment_status: PaymentStatus;
  pickup_at: string | null;
  note: string | null;
  cancel_reason: string | null;
  created_at: string;
  updated_at: string;
  buyer: Person;
  cook: Person;
  post: {
    dish_name: string;
    price_egp: number;
    ready_at: string;
    media_path: string | null;
    pickup_point: { label: string; lat: number; lng: number } | null;
    community: { name: string } | null;
  } | null;
  review: { id: string }[];
};

const ORDER_SELECT =
  '*, buyer:profiles!buyer_id(id, username, display_name, avatar_path), cook:profiles!cook_id(id, username, display_name, avatar_path),' +
  ' post:posts(dish_name, price_egp, ready_at, media_path, pickup_point:pickup_points(label, lat, lng), community:communities(name)),' +
  ' review:reviews(id)';

export const ACTIVE: OrderStatus[] = ['pending', 'accepted', 'ready'];

export async function placeOrder(postId: string, plates: number, pickupAt: number, note: string) {
  const { data, error } = await supabase.rpc('reserve_plates', {
    p_post_id: postId,
    p_plates: plates,
    p_pickup_at: new Date(pickupAt).toISOString(),
    p_note: note,
  });
  if (error) throw new Error(friendly(error.message));
  return data as { id: string };
}

export async function fetchOrder(id: string): Promise<Order | null> {
  const { data, error } = await supabase.from('reservations').select(ORDER_SELECT).eq('id', id).maybeSingle();
  if (error) throw error;
  return data as unknown as Order | null;
}

/** Orders I placed (as buyer) or received (as cook), newest first. */
export async function fetchOrders(role: 'buyer' | 'cook', userId: string): Promise<Order[]> {
  const { data, error } = await supabase
    .from('reservations')
    .select(ORDER_SELECT)
    .eq(role === 'buyer' ? 'buyer_id' : 'cook_id', userId)
    .order('created_at', { ascending: false })
    .limit(100);
  if (error) throw error;
  return (data ?? []) as unknown as Order[];
}

export async function setOrderStatus(id: string, status: OrderStatus, reason?: string) {
  const { error } = await supabase.rpc('set_reservation_status', { p_id: id, p_status: status, p_reason: reason ?? null });
  if (error) throw new Error(friendly(error.message));
}

export async function setPayment(id: string, status: 'sent' | 'received') {
  const { error } = await supabase.rpc('set_payment_status', { p_id: id, p_status: status });
  if (error) throw new Error(friendly(error.message));
}

/** The cook's InstaPay handle, visible only to the two people on the order. */
export async function fetchCookInstapay(orderId: string): Promise<string | null> {
  const { data } = await supabase.rpc('reservation_instapay', { p_id: orderId });
  return (data as string | null) ?? null;
}

export async function submitReview(order: Order, rating: number, body: string) {
  const { error } = await supabase.from('reviews').insert({
    reservation_id: order.id,
    reviewer_id: order.buyer_id,
    cook_id: order.cook_id,
    rating,
    body: body.trim() || null,
  });
  if (error) throw new Error(error.code === '23505' ? 'You already reviewed this order.' : 'We couldn’t send your review. Try again.');
}

/** Database messages are written for developers; show members something they can act on. */
function friendly(message: string): string {
  if (/only \d+ plates left/.test(message)) return message.replace('only', 'Only') + '.';
  if (message.includes('no longer available')) return 'This dish is no longer available today.';
  if (message.includes('between the ready time')) return 'Pick a time between the ready time and the end of the day.';
  if (message.includes('cannot reserve your own')) return 'You can’t order your own dish.';
  if (message.includes('cannot change from')) return 'This order has already moved on. Pull down to refresh.';
  return 'Something went wrong. Check your connection and try again.';
}
