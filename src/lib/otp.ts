import { logFunnel } from '@/lib/funnel';
import { toE164 } from '@/lib/phone';
import { supabase } from '@/lib/supabase';

export type Channel = 'whatsapp' | 'sms';
export type AuthMode = 'signup' | 'login';

type SendResult = { ok: true; channel: Channel } | { ok: false; message: string };

async function sendOnce(digits: string, mode: AuthMode, channel: Channel) {
  const started = Date.now();
  const { error } = await supabase.auth.signInWithOtp({
    phone: toE164(digits),
    options: { channel, shouldCreateUser: mode === 'signup' },
  });
  logFunnel(
    'code_sent',
    { channel, provider_status: error ? (error.code ?? error.status ?? 'error') : 'sent', mode },
    { latencyMs: Date.now() - started, errorCode: error?.code },
  );
  return error;
}

/** WhatsApp first; if that fails, SMS (section 13). `only` forces one channel, e.g. "Send by SMS instead". */
export async function sendCode(digits: string, mode: AuthMode, only?: Channel): Promise<SendResult> {
  const order: Channel[] = only ? [only] : ['whatsapp', 'sms'];
  let last: Awaited<ReturnType<typeof sendOnce>> = null;
  for (const channel of order) {
    last = await sendOnce(digits, mode, channel);
    if (!last) return { ok: true, channel };
    // Too many requests is not a channel problem; trying SMS would hit the same limit.
    if (last.status === 429) break;
  }
  const message =
    last?.status === 429
      ? 'Too many codes requested. Please wait a minute and try again.'
      : 'We couldn’t send the code. Check your connection and try again.';
  return { ok: false, message };
}

export type VerifyResult = { ok: true; userId: string } | { ok: false; message: string };

export async function verifyCode(digits: string, code: string): Promise<VerifyResult> {
  const started = Date.now();
  // Codes sent by WhatsApp are confirmed the same way as SMS codes.
  const { data, error } = await supabase.auth.verifyOtp({ phone: toE164(digits), token: code, type: 'sms' });
  const ok = !error && data.user;
  logFunnel(
    'code_entered',
    { result: ok ? 'ok' : error?.code === 'otp_expired' ? 'wrong_or_expired' : 'error' },
    { latencyMs: Date.now() - started, errorCode: error?.code, userRef: data.user?.id },
  );
  if (ok) return { ok: true, userId: data.user!.id };
  return {
    ok: false,
    message:
      error?.code === 'otp_expired'
        ? 'That code is wrong or has expired. Check it, or send a new one.'
        : 'We couldn’t check the code. Check your connection and try again.',
  };
}
