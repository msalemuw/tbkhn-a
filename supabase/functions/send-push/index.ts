// Sends a phone alert (lock-screen push) for every new notification and chat message.
//
// Runs as a Supabase Edge Function (Deno), called by two Database Webhooks (Database > Webhooks):
//   notifications  INSERT  ->  this function
//   messages       INSERT  ->  this function
// The webhook body is { type: 'INSERT', table, record }. Delivery goes through Expo's push service
// (https://exp.host/--/api/v2/push/send), which talks to Apple and Google.
// Needs no extra secrets: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are provided by Supabase.
import { createClient } from 'npm:@supabase/supabase-js@2';

type Row = Record<string, any>;

const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

async function nameOf(id?: string): Promise<string> {
  if (!id) return 'Someone';
  const { data } = await admin.from('profiles').select('display_name, username').eq('id', id).maybeSingle();
  return data?.display_name || data?.username || 'Someone';
}

// Same wording as the in-app list (src/lib/notifications.ts).
function wording(n: Row, who: string): { title: string; body?: string; url: string } {
  const p = n.payload ?? {};
  const dish = p.dish ?? 'your dish';
  const url = p.reservation_id ? `/order/${p.reservation_id}` : '/inbox';
  switch (n.kind) {
    case 'order_new': return { title: `${who} ordered ${p.plates ?? 1} × ${dish}`, body: 'Accept or decline it', url };
    case 'order_accepted': return { title: `${who} accepted your order`, body: dish, url };
    case 'order_declined': return { title: `${who} declined your order`, body: dish, url };
    case 'order_ready': return { title: `Your order from ${who} is ready`, body: `${dish} · ready for pickup`, url };
    case 'order_cancelled': return { title: `${who} cancelled their order`, body: dish, url };
    case 'review_request': return { title: `How was your order from ${who}?`, body: 'Tap to leave a review', url };
    case 'payment_sent': return { title: `${who} sent the InstaPay payment`, body: `${dish} · confirm it arrived`, url };
    case 'payment_received': return { title: `${who} confirmed your payment`, body: dish, url };
    case 'cooking_today': return { title: `${who} added to today’s menu`, body: dish, url: p.post_id ? `/dish/${p.post_id}` : '/inbox' };
    default: return { title: 'Update from tabkheen A', url };
  }
}

async function send(userId: string, msg: { title: string; body?: string; url: string }) {
  const { data: tokens, error } = await admin.from('push_tokens').select('token').eq('user_id', userId);
  if (error) console.log('could not read push_tokens:', JSON.stringify(error));
  if (!tokens?.length) {
    console.log('no phone registered for', userId);
    return;
  }
  const res = await fetch('https://exp.host/--/api/v2/push/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(tokens.map((t) => ({ to: t.token, title: msg.title, body: msg.body, sound: 'default', data: { url: msg.url } }))),
  });
  const json = await res.json().catch(() => null);
  // Visible in Edge Functions > send-push > Logs: what Expo answered, and later what Apple answered.
  console.log('tickets', userId, JSON.stringify(json));
  const ids = (json?.data ?? []).map((r: Row) => r?.id).filter(Boolean);
  if (ids.length) {
    // Apple's answer only exists a few seconds later, so it is fetched after the reply has been sent.
    (globalThis as any).EdgeRuntime?.waitUntil(
      (async () => {
        await new Promise((r) => setTimeout(r, 15000));
        const rr = await fetch('https://exp.host/--/api/v2/push/getReceipts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify({ ids }),
        });
        console.log('receipts', JSON.stringify(await rr.json().catch(() => null)));
      })(),
    );
  }
  // Forget phones that no longer have the app.
  const dead = (json?.data ?? [])
    .map((r: Row, i: number) => (r?.details?.error === 'DeviceNotRegistered' ? tokens[i].token : null))
    .filter(Boolean);
  if (dead.length) await admin.from('push_tokens').delete().in('token', dead);
}

Deno.serve(async (req) => {
  try {
    const { type, table, record } = await req.json();
    if (type !== 'INSERT' || !record) return new Response('ignored');

    if (table === 'notifications') {
      // Claim the row so a repeated webhook never sends twice.
      const { data: claimed } = await admin
        .from('notifications').update({ pushed_at: new Date().toISOString() })
        .eq('id', record.id).is('pushed_at', null).select('id').maybeSingle();
      if (!claimed) return new Response('already sent');
      await send(record.user_id, wording(record, await nameOf(record.payload?.from)));
    } else if (table === 'messages') {
      await send(record.recipient_id, {
        title: await nameOf(record.sender_id),
        body: String(record.body ?? '').slice(0, 140),
        url: `/chat/${record.sender_id}`,
      });
    }
    return new Response('ok');
  } catch (e) {
    return new Response(String(e), { status: 500 });
  }
});
