import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BackHeader, danger, formStyles, PrimaryButton } from '@/components/form';
import { colors, fonts } from '@/constants/theme';
import { logFunnel } from '@/lib/funnel';
import { type AuthMode, type Channel, sendCode, verifyCode } from '@/lib/otp';
import { formatPhone } from '@/lib/phone';
import { supabase } from '@/lib/supabase';

// Flows 1 and 2, screen s4: Enter the code.
const CODE_LENGTH = 6;
const RESEND_AFTER_S = 60; // Supabase allows one code per number per minute by default.

export default function Verify() {
  const params = useLocalSearchParams<{ phone: string; mode: AuthMode; channel: Channel }>();
  const digits = params.phone ?? '';
  const mode: AuthMode = params.mode === 'login' ? 'login' : 'signup';
  const [channel, setChannel] = useState<Channel>(params.channel === 'sms' ? 'sms' : 'whatsapp');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sentAt, setSentAt] = useState(() => Date.now());
  const [now, setNow] = useState(() => Date.now());
  const input = useRef<TextInput>(null);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const wait = Math.max(0, RESEND_AFTER_S - Math.floor((now - sentAt) / 1000));

  async function onVerify(value = code) {
    if (value.length !== CODE_LENGTH || busy) return;
    setBusy(true);
    setError(null);
    const res = await verifyCode(digits, value);
    if (!res.ok) {
      setBusy(false);
      setError(res.message);
      return;
    }
    const { data: profile } = await supabase.rpc('my_profile');
    setBusy(false);
    const done = Boolean((profile as { username: string | null } | null)?.username);
    router.replace(done ? '/home' : '/sign-up/profile');
  }

  async function resend(only?: Channel) {
    setError(null);
    const res = await sendCode(digits, mode, only);
    if (!res.ok) {
      setError(res.message);
      return;
    }
    setChannel(res.channel);
    setSentAt(Date.now());
    setCode('');
  }

  function onHelp() {
    logFunnel('help_opened', { from: 'verify_code' });
    Alert.alert('Contact us', 'Support by chat, phone and WhatsApp is coming soon.');
  }

  return (
    <SafeAreaView style={styles.screen}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.pad} keyboardShouldPersistTaps="handled">
          <BackHeader />
          <View style={{ marginTop: 22 }}>
            <Text style={formStyles.title}>Enter the code</Text>
            <Text style={formStyles.sub}>
              We sent a 6-digit code by {channel === 'whatsapp' ? 'WhatsApp' : 'SMS'} to{' '}
              <Text style={{ fontFamily: fonts.extraBold, color: colors.ink }}>{formatPhone(digits)}</Text>
            </Text>
          </View>

          <Pressable style={styles.boxes} onPress={() => input.current?.focus()} accessibilityLabel="Verification code">
            {Array.from({ length: CODE_LENGTH }, (_, i) => (
              <View key={i} style={[styles.box, i === code.length && styles.boxActive, error ? { borderColor: danger } : null]}>
                <Text style={styles.boxText}>{code[i] ?? ''}</Text>
              </View>
            ))}
          </Pressable>
          <TextInput
            ref={input}
            value={code}
            onChangeText={(v) => {
              const clean = v.replace(/\D/g, '').slice(0, CODE_LENGTH);
              setCode(clean);
              setError(null);
              if (clean.length === CODE_LENGTH) onVerify(clean);
            }}
            keyboardType="number-pad"
            textContentType="oneTimeCode"
            autoComplete={Platform.OS === 'android' ? 'sms-otp' : 'one-time-code'}
            autoFocus
            maxLength={CODE_LENGTH}
            style={styles.hidden}
          />

          {error ? <Text style={[formStyles.hint, { color: danger, textAlign: 'center' }]}>{error}</Text> : null}

          <View style={{ marginTop: 18, alignItems: 'center', gap: 10 }}>
            {wait > 0 ? (
              <Text style={formStyles.small}>Resend code in 0:{String(wait).padStart(2, '0')}</Text>
            ) : (
              <>
                <Text style={formStyles.link} onPress={() => resend(channel)}>
                  Resend code
                </Text>
                {channel === 'whatsapp' ? (
                  <Text style={formStyles.link} onPress={() => resend('sms')}>
                    Send by SMS instead
                  </Text>
                ) : null}
              </>
            )}
            <Text style={formStyles.small}>
              Didn’t get it?{' '}
              <Text style={formStyles.link} onPress={onHelp}>
                Contact us
              </Text>
            </Text>
          </View>

          <View style={{ flex: 1 }} />
          <View style={styles.note}>
            <MaterialIcons name="lock" size={19} color={colors.teal} />
            <Text style={styles.noteText}>Your number is only used to verify you and confirm orders.</Text>
          </View>
          <PrimaryButton label="Verify & continue" onPress={() => onVerify()} busy={busy} disabled={code.length !== CODE_LENGTH} style={{ marginTop: 16 }} />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.paper },
  pad: { flexGrow: 1, paddingHorizontal: 22, paddingBottom: 26 },
  boxes: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 30, gap: 8 },
  box: { flex: 1, aspectRatio: 0.85, maxWidth: 54, borderRadius: 14, borderWidth: 1.5, borderColor: colors.line, backgroundColor: colors.white, alignItems: 'center', justifyContent: 'center' },
  boxActive: { borderColor: colors.teal },
  boxText: { fontFamily: fonts.extraBold, fontSize: 24, color: colors.ink },
  hidden: { position: 'absolute', opacity: 0, height: 1, width: 1 },
  note: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: colors.tealSoft, borderRadius: 14, padding: 14 },
  noteText: { flex: 1, fontFamily: fonts.semiBold, fontSize: 12.5, lineHeight: 18, color: '#33403b' },
});
