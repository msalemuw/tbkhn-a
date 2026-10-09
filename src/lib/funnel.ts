import Constants from 'expo-constants';
import { Platform } from 'react-native';

import { supabase, supabaseConfigured } from '@/lib/supabase';

// Sign-up funnel events (docs/SIGNUP-FUNNEL.md). Fire and forget: logging never blocks or breaks a screen.

export type FunnelStep =
  | 'welcome_viewed'
  | 'signup_method_chosen'
  | 'phone_entered'
  | 'code_sent'
  | 'code_entered'
  | 'profile_started'
  | 'profile_field_error'
  | 'communities_selected'
  | 'community_requested'
  | 'signup_completed'
  | 'identifier_conflict'
  | 'help_opened';

const sessionId = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

type Extra = { latencyMs?: number; errorCode?: string; userRef?: string };

export function logFunnel(step: FunnelStep, props: Record<string, unknown> = {}, extra: Extra = {}) {
  if (!supabaseConfigured) return;
  supabase
    .from('signup_events')
    .insert({
      session_id: sessionId,
      user_ref: extra.userRef ?? null,
      step,
      props,
      app_version: Constants.expoConfig?.version ?? null,
      os: `${Platform.OS} ${Platform.Version ?? ''}`.trim(),
      locale: Intl.DateTimeFormat().resolvedOptions().locale,
      latency_ms: extra.latencyMs ?? null,
      error_code: extra.errorCode ?? null,
    })
    .then(({ error }) => {
      if (error && __DEV__) console.warn('funnel log failed', step, error.message);
    });
}
