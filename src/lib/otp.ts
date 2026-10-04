import { logFunnel } from '@/lib/funnel';
import { toE164 } from '@/lib/phone';
import { supabase } from '@/lib/supabase';

export type AuthMode = 'signup' | 'login';

type SendResult = { ok: true } | { ok: false; message: string };

/**
 * Sends the 6-digit code by WhatsApp. Supabase Auth hands it to the send-whatsapp-code hook,
 * which sends it through Meta directly. There is no SMS fallback (section 13, 2026-10-04).
 */
export async function sendCode(digits: string, mode: AuthMode): Promise<SendResult> {
  const started = Date.now();
  const { error } = await supabase.auth.signInWithOtp({
    phone: toE164(digits),
    options: { channel: 'whatsapp', shouldCreateUser: mode === 'signup' },
  });
  logFunnel(
    'code_sent',
    { channel: 'whatsapp', provider_status: error ? (error.code ?? error.status ?? 'error') : 'sent', mode },
    { latencyMs: Date.now() - started, errorCode: error?.code },
  );
  if (!error) return { ok: true };
  return {
    ok: false,
    message:
      error.status === 429
        ? 'Too many codes requested. Please wait a minute and try again.'
        : 'We couldn’t send the code by WhatsApp. Check the number and your connection, then try again.',
  };
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
