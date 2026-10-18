import { supabase } from '@/lib/supabase';

// Help & support: a member (signed in or not) writes to the team; staff answer from the web admin.
// Replies come back as a notification and show in the conversation here.

export type SupportTicket = {
  id: string;
  subject: string;
  status: 'open' | 'pending' | 'closed';
  updated_at: string;
  last_body: string | null;
  last_sender: 'member' | 'staff' | null;
};

export type SupportMessage = { sender: 'member' | 'staff'; body: string; created_at: string };

function friendly(message: string): string {
  // The database writes short sentences meant for people; anything else is a connection problem.
  const known = ['write your message', 'add a short subject', 'leave an email', 'please wait', 'support is busy', 'conversation not found'];
  return known.some((k) => message.includes(k)) ? message : 'Check your connection and try again.';
}

/** Starts a conversation (subject and contact), or adds to one (ticketId). Returns the ticket id, or an error sentence. */
export async function sendSupport(args: { body: string; subject?: string; contact?: string; ticketId?: string }): Promise<{ id: string } | { error: string }> {
  const { data, error } = await supabase.rpc('support_submit', {
    p_subject: args.subject ?? null,
    p_body: args.body,
    p_contact: args.contact ?? null,
    p_ticket: args.ticketId ?? null,
    p_source: 'app',
  });
  if (error) return { error: friendly(error.message) };
  return { id: data as string };
}

export async function fetchMySupportTickets(): Promise<SupportTicket[]> {
  const { data, error } = await supabase.rpc('support_my_tickets');
  if (error) throw error;
  return (data ?? []) as SupportTicket[];
}

export async function fetchSupportThread(id: string): Promise<SupportMessage[]> {
  const { data, error } = await supabase.rpc('support_ticket_thread', { p_id: id });
  if (error) throw error;
  return (data ?? []) as SupportMessage[];
}
