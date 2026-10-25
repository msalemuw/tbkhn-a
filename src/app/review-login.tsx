import { router } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Text, TextInput } from '@/components/text';
import { BackHeader, Field, formStyles, PrimaryButton } from '@/components/form';
import { colors } from '@/constants/theme';
import { routeAfterSignIn, signInWithEmail } from '@/lib/oauth';
import { supabaseConfigured } from '@/lib/supabase';

/** Demo sign-in for the App Store and Google Play reviewers (listed in their review notes). Not for members. */
export default function ReviewLogin() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function go() {
    if (busy) return;
    if (!supabaseConfigured) return setError('The app isn’t connected to the server yet.');
    setBusy(true);
    setError(null);
    const res = await signInWithEmail(email, password);
    if (!res.ok) {
      setBusy(false);
      return setError(res.message);
    }
    const next = await routeAfterSignIn();
    setBusy(false);
    router.replace(next);
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.paper }}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding">
        <ScrollView contentContainerStyle={{ paddingHorizontal: 22, paddingBottom: 26 }} keyboardShouldPersistTaps="handled">
          <BackHeader />
          <View style={{ marginTop: 22 }}>
            <Text style={formStyles.title}>App review sign-in</Text>
            <Text style={formStyles.sub}>For the App Store and Google Play review teams. Members sign in with Google or Apple.</Text>
          </View>
          <View style={{ marginTop: 28, gap: 12 }}>
            <Field label="EMAIL">
              <TextInput value={email} onChangeText={setEmail} autoCapitalize="none" autoCorrect={false} keyboardType="email-address" autoComplete="email" textContentType="username" style={formStyles.input} accessibilityLabel="Email" />
            </Field>
            <Field label="PASSWORD">
              <TextInput value={password} onChangeText={setPassword} secureTextEntry autoCapitalize="none" autoCorrect={false} autoComplete="current-password" textContentType="password" style={formStyles.input} accessibilityLabel="Password" onSubmitEditing={go} />
            </Field>
            {error ? <Text style={[formStyles.error, { textAlign: 'center' }]}>{error}</Text> : null}
            <PrimaryButton label="Sign in" onPress={go} busy={busy} disabled={!email.trim() || !password} />
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
