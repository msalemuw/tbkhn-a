import { type Order, ORDER_SELECT } from '@/lib/orders';
import type { Person } from '@/lib/posts';
import { supabase } from '@/lib/supabase';

// One-to-one chat (s20 Inbox > Messages, s23 conversation). Payment sent / received lines are
// written by the database when either person confirms the InstaPay payment (section 13).

export type MessageKind = 'text' | 'payment_sent' | 'payment_received';

export type Message = {
  id: string;
  sender_id: string;
  recipient_id: string;
  reservation_id: string | null;
  kind: MessageKind;
  body: string;
  created_at: string;
  read_at: string | null;
};

export type Conversation = {
  partner: Person;
  last_body: string;
  last_kind: MessageKind;
  last_at: string;
  last_from_me: boolean;
  unread: number;
};

const PERSON = 'id, username, display_name, avatar_path';

export async function fetchPeople(ids: string[]): Promise<Map<string, Person>> {
  const unique = [...new Set(ids)];
  if (!unique.length) return new Map();
  const { data, error } = await supabase.from('profiles').select(PERSON).in('id', unique);
  if (error) throw error;
  return new Map((data as Person[]).map((p) => [p.id, p]));
}

export async function fetchPerson(id: string): Promise<Person | null> {
  return (await fetchPeople([id])).get(id) ?? null;
}

/** Inbox rows, newest conversation first. */
export async function fetchConversations(): Promise<Conversation[]> {
  const { data, error } = await supabase.rpc('my_conversations');
  if (error) throw error;
  const rows = (data ?? []) as (Omit<Conversation, 'partner'> & { partner_id: string })[];
  const people = await fetchPeople(rows.map((r) => r.partner_id));
  return rows.map(({ partner_id, ...r }) => ({
    ...r,
    partner: people.get(partner_id) ?? { id: partner_id, username: null, display_name: null, avatar_path: null },
  }));
}

export async function unreadMessageCount(): Promise<number> {
  const { data, error } = await supabase.rpc('my_conversations');
  if (error) return 0;
  return ((data ?? []) as { unread: number }[]).reduce((n, r) => n + r.unread, 0);
}

/** The latest 200 messages with one person, oldest first. */
export async function fetchMessages(me: string, partner: string): Promise<Message[]> {
  const { data, error } = await supabase
    .from('messages')
    .select('*')
    .or(`and(sender_id.eq.${me},recipient_id.eq.${partner}),and(sender_id.eq.${partner},recipient_id.eq.${me})`)
    .order('created_at', { ascending: false })
    .limit(200);
  if (error) throw error;
  return ((data ?? []) as Message[]).reverse();
}

export async function sendMessage(me: string, partner: string, body: string, reservationId: string | null): Promise<Message> {
  const { data, error } = await supabase
    .from('messages')
    .insert({ sender_id: me, recipient_id: partner, body: body.trim(), reservation_id: reservationId })
    .select('*')
    .single();
  if (error) throw new Error(error.code === '42501' ? 'You can’t message this member.' : 'Your message didn’t send. Try again.');
  return data as Message;
}

export async function markRead(me: string, partner: string) {
  await supabase.from('messages').update({ read_at: new Date().toISOString() }).eq('sender_id', partner).eq('recipient_id', me).is('read_at', null);
}

/** The newest order between two people that still needs something (shown at the top of the chat). */
export async function fetchOrderWith(me: string, partner: string): Promise<Order | null> {
  const { data, error } = await supabase
    .from('reservations')
    .select(ORDER_SELECT)
    .or(`and(buyer_id.eq.${me},cook_id.eq.${partner}),and(buyer_id.eq.${partner},cook_id.eq.${me})`)
    .in('status', ['pending', 'accepted', 'ready', 'picked_up'])
    .order('created_at', { ascending: false })
    .limit(5);
  if (error) throw error;
  const orders = (data ?? []) as unknown as Order[];
  return orders.find((o) => o.status !== 'picked_up' || o.payment_status !== 'received') ?? null;
}

/** Live delivery of messages sent to me. Returns an unsubscribe function. */
export function onMessageToMe(me: string, onInsert: (m: Message) => void): () => void {
  const channel = supabase
    .channel(`messages-to-${me}`)
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `recipient_id=eq.${me}` }, (p) => onInsert(p.new as Message))
    .subscribe();
  return () => {
    supabase.removeChannel(channel);
  };
}
