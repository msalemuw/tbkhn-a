import { router } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BackHeader, danger, Field, formStyles, PrimaryButton } from '@/components/form';
import { colors } from '@/constants/theme';
import { useSession } from '@/lib/session';
import { supabase } from '@/lib/supabase';

// Edit your own profile: name, bio and the InstaPay handle neighbors pay you on.
export default function EditProfile() {
  const { session, profile, refreshProfile } = useSession();
  const [name, setName] = useState(profile?.display_name ?? '');
  const [bio, setBio] = useState(profile?.bio ?? '');
  const [instapay, setInstapay] = useState(profile?.instapay_handle ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const ok = name.trim().length >= 1;
  const save = async () => {
    if (!session) return;
    setBusy(true);
    setError(null);
    const { error: saveError } = await supabase
      .from('profiles')
      .update({ display_name: name.trim(), bio: bio.trim() || null, instapay_handle: instapay.trim() || null })
      .eq('id', session.user.id);
    setBusy(false);
    if (saveError) {
      setError('We couldn’t save your changes. Please try again.');
      return;
    }
    await refreshProfile();
    router.back();
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.paper }}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
          <BackHeader title="Edit profile" />
          <Field label="NAME" required>
            <TextInput value={name} onChangeText={setName} maxLength={60} placeholderTextColor={colors.faint} style={formStyles.input} accessibilityLabel="Name" />
          </Field>
          <Field label="BIO">
            <TextInput value={bio} onChangeText={setBio} maxLength={300} multiline placeholder="Tell neighbors about your cooking" placeholderTextColor={colors.faint} style={[formStyles.input, { minHeight: 70 }]} accessibilityLabel="Bio" />
          </Field>
          <Field label="INSTAPAY HANDLE">
            <TextInput value={instapay} onChangeText={setInstapay} placeholder="example: nour@instapay" placeholderTextColor={colors.faint} autoCapitalize="none" autoCorrect={false} maxLength={60} style={formStyles.input} accessibilityLabel="InstaPay handle" />
          </Field>
          <Text style={[formStyles.hint, { color: colors.muted }]}>Needed when you cook, so neighbors can pay you directly. Only people with an order with you can see it.</Text>
          {error ? <Text style={[formStyles.error, { backgroundColor: danger }]}>{error}</Text> : null}
          <PrimaryButton label="Save" onPress={save} busy={busy} disabled={!ok} style={{ marginTop: 8 }} />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  body: { padding: 22, gap: 14 },
});
