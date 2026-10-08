import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BackHeader, danger, Field, formStyles, PrimaryButton } from '@/components/form';
import { colors, fonts } from '@/constants/theme';
import { logFunnel } from '@/lib/funnel';
import { type AuthMode, sendCode } from '@/lib/otp';
import { cleanPhoneInput, isValidPhone, toE164 } from '@/lib/phone';
import { supabase, supabaseConfigured } from '@/lib/supabase';

// Screens s61 (Create your account) and s10 (Welcome back). Phone only at launch; Google and email come later.
const copy = {
  signup: {
    title: 'Create your account',
    sub: 'With your mobile number, we’ll send you a code to confirm it.',
    help: 'Trouble signing in?',
    switchQ: 'Already have an account?',
    switchLink: 'Log in',
    switchTo: '/log-in',
    conflict: 'This number is already registered to an account.',
  },
  login: {
    title: 'Welcome back',
    sub: 'Enter your mobile number and we’ll send you a code to log in.',
    help: 'Can’t log in?',
    switchQ: 'New to tabkheen A?',
    switchLink: 'Sign up',
    switchTo: '/sign-up',
    conflict: 'No account found with this number.',
  },
} as const;

const defaultHint = 'Start with 1, not 01. Exactly 10 digits.';

export function PhoneEntry({ mode }: { mode: AuthMode }) {
  const t = copy[mode];
  const [digits, setDigits] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ msg: string; link?: string } | null>(null);
  const attempts = useRef(0);

  useEffect(() => {
    logFunnel('signup_method_chosen', { method: 'phone', mode });
  }, [mode]);

  const valid = isValidPhone(digits);
  
  async function onSend() {
    attempts.current += 1;
    logFunnel('phone_entered', { valid, attempts: attempts.current, mode });
    if (!valid) {
      setError({ msg: 'Enter a valid Egyptian mobile number: 10 digits starting with 10, 11, 12 or 15.' });
      return;
    }
    if (!supabaseConfigured) {
      setError({ msg: 'The app isn’t connected to the server yet.' });
      return;
    }
    setBusy(true);
    setError(null);
    const { data: registered, error: checkError } = await supabase.rpc('phone_registered', { p_phone: toE164(digits) });
    if (checkError) {
      setBusy(false);
      setError({ msg: 'We couldn’t reach the server. Check your connection and try again.' });
      return;
    }
    if ((mode === 'signup' && registered) || (mode === 'login' && !registered)) {
      setBusy(false);
      if (mode === 'signup') logFunnel('identifier_conflict', { type: 'phone' });
      setError({ msg: t.conflict, link: t.switchLink });
      return;
    }
    const res = await sendCode(digits, mode);
    setBusy(false);
    if (!res.ok) {
      setError({ msg: res.message });
      return;
    }
    router.push({ pathname: '/verify', params: { phone: digits, mode } });
  }

  function onHelp() {
    logFunnel('help_opened', { from: mode === 'signup' ? 'phone_signup' : 'phone_login' });
    Alert.alert('Contact us', 'Support by chat, phone and WhatsApp is coming soon.');
  }

  return (
    <SafeAreaView style={styles.screen}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.pad} keyboardShouldPersistTaps="handled">
          <BackHeader />
          <View style={{ marginTop: 22 }}>
            <Text style={formStyles.title}>{t.title}</Text>
            <Text style={formStyles.sub}>{t.sub}</Text>
          </View>

          <View style={{ marginTop: 28 }}>
            <Field borderColor={error ? danger : valid ? colors.teal : undefined} style={styles.phoneField}>
              <View style={styles.phoneRow}>
                <View style={styles.code}>
                  <Text style={styles.codeLabel}>CODE</Text>
                  <Text style={styles.codeValue}>+20</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.codeLabel}>MOBILE NUMBER</Text>
                  <TextInput
                    value={digits}
                    onChangeText={(v) => {
                      setDigits(cleanPhoneInput(v));
                      setError(null);
                    }}
                    placeholder="example: 1234567890"
                    placeholderTextColor={colors.faint}
                    keyboardType="number-pad"
                    textContentType="telephoneNumber"
                    autoComplete="tel"
                    maxLength={13}
                    style={[formStyles.input, styles.phoneInput]}
                    accessibilityLabel="Mobile number"
                  />
                </View>
                <Text style={styles.count}>{digits.length}/10</Text>
              </View>
            </Field>
            <Text style={error ? formStyles.error : [formStyles.hint, { color: colors.muted }]}>
              {error?.msg ?? defaultHint}{' '}
              {error?.link ? (
                <Text style={formStyles.link} onPress={() => router.replace(t.switchTo)}>
                  {error.link}
                </Text>
              ) : null}
            </Text>
          </View>

          <PrimaryButton label="Send code" onPress={onSend} busy={busy} disabled={digits.length < 10} style={{ marginTop: 22 }} />

          <View style={{ flex: 1 }} />
          <Text style={[formStyles.small, { marginTop: 28 }]}>
            {t.help}{' '}
            <Text style={formStyles.link} onPress={onHelp}>
              Contact us
            </Text>
          </Text>
          <Text style={[formStyles.small, { marginTop: 10 }]}>
            {t.switchQ}{' '}
            <Text style={formStyles.link} onPress={() => router.replace(t.switchTo)}>
              {t.switchLink}
            </Text>
          </Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.paper },
  pad: { flexGrow: 1, paddingHorizontal: 22, paddingBottom: 26 },
  phoneField: { paddingVertical: 10 },
  phoneRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  code: { paddingRight: 12, borderRightWidth: 1, borderRightColor: colors.line },
  codeLabel: { fontFamily: fonts.extraBold, fontSize: 10.5, letterSpacing: 0.6, color: colors.muted },
  codeValue: { fontFamily: fonts.bold, fontSize: 17, color: colors.ink, paddingVertical: 4 },
  phoneInput: { letterSpacing: 0.4 },
  count: { fontFamily: fonts.bold, fontSize: 12, color: colors.muted },
});
