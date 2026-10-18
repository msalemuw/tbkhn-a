import type { ComponentProps } from 'react';
import type MaterialIcons from '@expo/vector-icons/MaterialIcons';

import { supabase } from '@/lib/supabase';

// Inbox > Notifications (s20/s27). Rows are written by database triggers; the wording is built here
// from the kind and payload, so it can be translated later.

export type Notification = {
  id: string;
  kind: string;
  payload: { reservation_id?: string; post_id?: string; profile_id?: string; from?: string; dish?: string; plates?: number; text?: string; community_id?: string; redirect_id?: string; added?: string[]; name?: string; note?: string; reason?: string; message?: string; status?: string; ticket_id?: string; subject?: string; preview?: string };
  created_at: string;
  read_at: string | null;
};

type IconName = ComponentProps<typeof MaterialIcons>['name'];

export async function fetchNotifications(): Promise<Notification[]> {
  const { data, error } = await supabase.from('notifications').select('*').order('created_at', { ascending: false }).limit(60);
  if (error) throw error;
  return (data ?? []) as Notification[];
}

export async function unreadNotificationCount(): Promise<number> {
  const { count } = await supabase.from('notifications').select('id', { count: 'exact', head: true }).is('read_at', null);
  return count ?? 0;
}

export async function markNotificationsRead(userId: string) {
  await supabase.from('notifications').update({ read_at: new Date().toISOString() }).eq('user_id', userId).is('read_at', null);
}

/** Title, optional second line and icon for one notification; `who` is the other person's name. */
const STAFF_STATUS: Record<string, string> = {
  pending: 'Waiting for the cook',
  accepted: 'Accepted',
  ready: 'Ready for pickup',
  picked_up: 'Picked up',
  declined: 'Declined',
  cancelled: 'Cancelled',
};

export function describe(n: Notification, who: string): { title: string; sub?: string; icon: IconName } {
  const dish = n.payload.dish ?? 'your dish';
  switch (n.kind) {
    case 'order_new':
      return { title: `${who} ordered ${n.payload.plates ?? 1} × ${dish}`, sub: 'Accept or decline it', icon: 'receipt-long' };
    case 'order_accepted':
      return { title: `${who} accepted your order`, sub: dish, icon: 'check-circle' };
    case 'order_declined':
      return { title: `${who} declined your order`, sub: dish, icon: 'cancel' };
    case 'order_ready':
      return { title: `Your order from ${who} is ready`, sub: `${dish} · ready for pickup`, icon: 'restaurant' };
    case 'order_cancelled':
      return { title: `${who} cancelled their order`, sub: dish, icon: 'cancel' };
    case 'review_request':
      return { title: `How was your order from ${who}?`, sub: 'Tap to leave a review', icon: 'star' };
    case 'payment_sent':
      return { title: `${who} sent the InstaPay payment`, sub: `${dish} · confirm it arrived`, icon: 'payments' };
    case 'payment_received':
      return { title: `${who} confirmed your payment`, sub: dish, icon: 'payments' };
    case 'cooking_today':
      return { title: `${who} added to today’s menu`, sub: dish, icon: 'soup-kitchen' };
    case 'post_liked':
      return { title: `${who} liked your post`, sub: n.payload.dish, icon: 'favorite' };
    case 'post_commented':
      return { title: `${who} commented on your post`, sub: n.payload.text, icon: 'chat-bubble' };
    case 'new_follower':
      return { title: `${who} started following you`, icon: 'person-add' };
    case 'community_approved':
      return { title: `Your community “${n.payload.name ?? 'request'}” was approved`, sub: 'Tap to open it', icon: 'groups' };
    case 'community_rejected':
      // An admin closed the request by adding the member to existing or new communities instead.
      if (n.payload.added?.length) return { title: `We added you to ${n.payload.added.map((c) => `“${c}”`).join(', ')}`, sub: `Your request “${n.payload.name ?? ''}” was matched`, icon: 'groups' };
      return { title: `Your community request “${n.payload.name ?? ''}” wasn’t approved`, sub: n.payload.note, icon: 'groups' };
    case 'order_staff':
      // Staff changed the order's status (a dispute); the reason is in `note`.
      return { title: `tabkheen A updated your order of ${dish}`, sub: `${STAFF_STATUS[n.payload.status ?? ''] ?? 'Updated'}${n.payload.note ? `: ${n.payload.note}` : ''}`, icon: 'receipt-long' };
    case 'staff_warning':
      return { title: 'A warning from tabkheen A', sub: n.payload.message, icon: 'report' };
    case 'support_reply':
      return { title: 'tabkheen A replied to your message', sub: n.payload.preview ?? n.payload.subject, icon: 'support-agent' };
    case 'post_removed':
      return { title: 'One of your posts was removed', sub: n.payload.reason, icon: 'report' };
    default:
      return { title: 'Update from tabkheen A', icon: 'notifications' };
  }
}

/** The Notifications tab of the inbox (the plain `/inbox` opens Messages). */
export const NOTIFICATIONS_PATH = '/inbox?tab=notifications';

/** Where tapping a notification goes: the order, the dish page, the person's profile, or the Notifications list. */
export function notificationPath(n: Notification): string {
  if (n.kind === 'support_reply' && n.payload.ticket_id) return `/support?id=${n.payload.ticket_id}`;
  if (n.kind === 'post_removed' || n.kind.startsWith('community_')) return NOTIFICATIONS_PATH;
  if (n.payload.reservation_id) return `/order/${n.payload.reservation_id}`;
  if (n.payload.post_id) return `/dish/${n.payload.post_id}`;
  if (n.payload.profile_id) return `/cook/${n.payload.profile_id}`;
  return NOTIFICATIONS_PATH;
}
