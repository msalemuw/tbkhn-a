import { router } from 'expo-router';
import { useState } from 'react';

import { t } from '@/lib/i18n';
import { logFunnel } from '@/lib/funnel';
import { type OAuthMethod, type OAuthResult, routeAfterSignIn, signInWithApple, signInWithGoogle } from '@/lib/oauth';
import { supabaseConfigured } from '@/lib/supabase';

/**
 * One Google or Apple tap, from wherever the button sits (the welcome screen or the sign-in choice screen). The same
 * button creates the account the first time and logs in after that; the member then lands on the screen they still need.
 */
export function useOAuthFlow(mode: string) {
  const [busy, setBusy] = useState<OAuthMethod | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function go(method: OAuthMethod) {
    if (busy) return;
    if (!supabaseConfigured) {
      setError(t('The app isn’t connected to the server yet.'));
      return;
    }
    setBusy(method);
    setError(null);
    logFunnel('signup_method_chosen', { method, mode });
    const res: OAuthResult = await (method === 'google' ? signInWithGoogle() : signInWithApple());
    if (!res.ok) {
      setBusy(null);
      if (!res.cancelled) setError(res.message);
      return;
    }
    const next = await routeAfterSignIn();
    setBusy(null);
    router.replace(next);
  }

  return { busy, error, go };
}
