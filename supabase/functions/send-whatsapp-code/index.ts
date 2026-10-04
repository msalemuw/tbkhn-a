// Supabase "Send SMS" auth hook: delivers the 6-digit sign-up / log-in code by WhatsApp, sent
// directly through Meta's WhatsApp Cloud API (no Twilio, no SMS; section 13, 2026-10-04).
//
// Runs as a Supabase Edge Function (Deno). Secrets, set in Edge Functions > Secrets:
//   SEND_SMS_HOOK_SECRET      from Authentication > Hooks > Send SMS hook ("v1,whsec_...")
//   WHATSAPP_TOKEN            Meta system-user access token with whatsapp_business_messaging
//   WHATSAPP_PHONE_NUMBER_ID  the sending number's ID in WhatsApp Manager / the Meta app
//   WHATSAPP_TEMPLATE         optional, approved Authentication template name (default "verification_code")
//   WHATSAPP_TEMPLATE_LANG    optional, that template's language code (default "en")
//   WHATSAPP_GRAPH_VERSION    optional, Graph API version (default "v23.0")
// "Enforce JWT verification" must be off for this function: Supabase Auth signs the call with the
// hook secret instead of a user token.
import { Webhook } from 'npm:standardwebhooks@1.0.0';

type HookPayload = { user?: { phone?: string }; sms?: { otp?: string; phone?: string } };

const env = (name: string, fallback?: string) => {
  const value = Deno.env.get(name) ?? fallback;
  if (!value) throw new Error(`Missing secret ${name}`);
  return value;
};

// Supabase Auth reads { error: { http_code, message } } and shows the message to the app.
const fail = (status: number, message: string) =>
  new Response(JSON.stringify({ error: { http_code: status, message } }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

Deno.serve(async (req) => {
  const raw = await req.text();
  let payload: HookPayload;
  try {
    const secret = env('SEND_SMS_HOOK_SECRET').replace('v1,whsec_', '');
    payload = new Webhook(secret).verify(raw, Object.fromEntries(req.headers)) as HookPayload;
  } catch {
    return fail(401, 'Invalid hook signature');
  }

  const otp = payload.sms?.otp ?? '';
  // Supabase stores numbers without "+"; Meta wants digits only (country code first).
  const to = (payload.sms?.phone || payload.user?.phone || '').replace(/\D/g, '');
  if (!/^\d{6}$/.test(otp) || to.length < 8) return fail(400, 'Missing phone or code');

  try {
    const res = await fetch(
      `https://graph.facebook.com/${env('WHATSAPP_GRAPH_VERSION', 'v23.0')}/${env('WHATSAPP_PHONE_NUMBER_ID')}/messages`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${env('WHATSAPP_TOKEN')}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          recipient_type: 'individual',
          to,
          type: 'template',
          template: {
            name: env('WHATSAPP_TEMPLATE', 'verification_code'),
            language: { code: env('WHATSAPP_TEMPLATE_LANG', 'en') },
            // Authentication templates carry the code in the body and in the "Copy code" button.
            components: [
              { type: 'body', parameters: [{ type: 'text', text: otp }] },
              { type: 'button', sub_type: 'url', index: '0', parameters: [{ type: 'text', text: otp }] },
            ],
          },
        }),
      },
    );
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      const reason = body?.error?.message ?? res.statusText;
      console.error('WhatsApp send failed', res.status, reason, body?.error?.code);
      // 131026 = number has no WhatsApp (or can't receive); the app shows "Contact us".
      return fail(res.status === 429 ? 429 : 502, `WhatsApp code not sent: ${reason}`);
    }
    return new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } });
  } catch (e) {
    console.error('WhatsApp send error', e);
    return fail(500, 'WhatsApp code not sent');
  }
});
