import { dataChanged } from '@/lib/live';
import type { Person } from '@/lib/posts';
import { supabase } from '@/lib/supabase';

// Reservations: pickup only. Orders placed while "Pay through tabkheen A" is on (pay_through_app) are paid to tabkheen A's
// InstaPay and confirmed by staff; older orders are paid person to person. Every change goes through the database functions,
// which enforce who may do what and when.

/** An order nobody collects closes this many hours after its pickup time; a paid no-show is not refunded (database: close_stale_orders). */
export const NO_SHOW_HOURS = 5;

export type OrderStatus = 'pending' | 'accepted' | 'declined' | 'ready' | 'picked_up' | 'cancelled' | 'not_picked_up';
export type PaymentStatus = 'none' | 'sent' | 'received';

export type Order = {
  id: string;
  post_id: string;
  buyer_id: string;
  cook_id: string;
  plates: number;
  status: OrderStatus;
  payment_status: PaymentStatus;
  /** True when the eater pays tabkheen A (not the cook) and the order uses a pickup code. */
  pay_through_app: boolean;
  /** The eater must pay before this time or the order cancels itself (20 minutes after the cook accepts). */
  pay_by: string | null;
  /** The cook must accept or decline before this time or the request cancels itself (45 minutes after it was sent). */
  answer_by: string | null;
  payment_reference: string | null;
  picked_up_at: string | null;
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

export const ORDER_SELECT =
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
  dataChanged();
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

/** How many requests are waiting for this cook to accept or decline. */
export async function fetchWaitingCount(cookId: string): Promise<number> {
  const { count, error } = await supabase
    .from('reservations')
    .select('id', { count: 'exact', head: true })
    .eq('cook_id', cookId)
    .eq('status', 'pending');
  if (error) throw error;
  return count ?? 0;
}

/** The cook asks for one test alert on their own phone, with the long ring. */
export async function sendTestAlert() {
  const { error } = await supabase.rpc('send_test_alert');
  if (error) throw new Error(friendly(error.message));
}

export async function setOrderStatus(id: string, status: OrderStatus, reason?: string) {
  const { error } = await supabase.rpc('set_reservation_status', { p_id: id, p_status: status, p_reason: reason ?? null });
  if (error) throw new Error(friendly(error.message));
  dataChanged();
}

export async function setPayment(id: string, status: 'sent' | 'received') {
  const { error } = await supabase.rpc('set_payment_status', { p_id: id, p_status: status });
  if (error) throw new Error(friendly(error.message));
  dataChanged();
}

/** Where the eater pays and, once payment is confirmed, the pickup code. Only the eater of a pay-through-app order gets it. */
export type PaymentInfo = { instapay: string | null; /** A tappable InstaPay link (opens the InstaPay app with the address filled in); null when the owner has not added one. */ instapay_link: string | null; pay_by: string | null; pickup_code: string | null };

export async function fetchPaymentInfo(orderId: string): Promise<PaymentInfo | null> {
  const { data } = await supabase.rpc('order_payment_info', { p_id: orderId });
  return (data as PaymentInfo | null) ?? null;
}

/** The eater says they paid tabkheen A, with the InstaPay transfer reference. */
export async function submitPayment(id: string, reference: string) {
  const { error } = await supabase.rpc('submit_payment', { p_id: id, p_reference: reference });
  if (error) throw new Error(friendly(error.message));
  dataChanged();
}

/** The cook types the eater's code at pickup. 'locked' after five wrong tries (staff then help). */
export async function confirmPickup(id: string, code: string): Promise<'ok' | 'wrong' | 'locked'> {
  const { data, error } = await supabase.rpc('confirm_pickup', { p_id: id, p_code: code });
  if (error) throw new Error(friendly(error.message));
  dataChanged();
  return data as 'ok' | 'wrong' | 'locked';
}

/** The eater reports a problem within 12 hours of pickup; the cook's payout for the order is held while staff look. */
export async function reportProblem(id: string, reason: string) {
  const { error } = await supabase.rpc('report_order_problem', { p_id: id, p_reason: reason });
  if (error) throw new Error(friendly(error.message));
  dataChanged();
}

/** The cook's InstaPay handle, visible only to the two people on the order (orders paid person to person). */
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
  dataChanged();
}

/** Database messages are written for developers; show members something they can act on. */
function friendly(message: string): string {
  if (/only \d+ plates left/.test(message)) return message.replace('only', 'Only') + '.';
  if (message.includes('no longer available')) return 'This dish is no longer available today.';
  if (message.includes('between the ready time')) return 'Pick a time between the ready time and the end of the day.';
  if (message.includes('cannot reserve your own')) return 'You can’t order your own dish.';
  if (message.includes('cannot change from')) return 'This order has already moved on. Pull down to refresh.';
  if (message.includes('payment not confirmed')) return 'The payment isn’t confirmed yet. You can mark it ready once tabkheen A confirms it.';
  if (message.includes('enter the InstaPay reference')) return 'Enter the InstaPay reference number of your transfer.';
  if (message.includes('not waiting for payment') || message.includes('already sent')) return 'This order has already moved on. Pull down to refresh.';
  if (message.includes('within 12 hours')) return 'Problems can be reported within 12 hours of pickup.';
  if (message.includes('tell us what went wrong')) return 'Tell us what went wrong.';
  if (message.includes('wait a moment')) return 'Wait a few seconds before testing again.';
  if (message.includes('pickup code')) return 'Enter the pickup code the eater sees in their app.';
  return 'Something went wrong. Check your connection and try again.';
}
