import type { ComponentProps } from 'react';
import type MaterialIcons from '@expo/vector-icons/MaterialIcons';

import { supabase } from '@/lib/supabase';

// Inbox > Notifications (s20/s27). Rows are written by database triggers; the wording is built here
// from the kind and payload, so it can be translated later.

export type Notification = {
  id: string;
  kind: string;
  payload: { reservation_id?: string; post_id?: string; profile_id?: string; from?: string; dish?: string; plates?: number; text?: string };
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
    default:
      return { title: 'Update from tabkheen A', icon: 'notifications' };
  }
}

/** Where tapping a notification goes: the order, the dish page, or the person's profile. */
export function notificationPath(n: Notification): string {
  if (n.payload.reservation_id) return `/order/${n.payload.reservation_id}`;
  if (n.payload.post_id) return `/dish/${n.payload.post_id}`;
  if (n.payload.profile_id) return `/cook/${n.payload.profile_id}`;
  return '/inbox';
}
