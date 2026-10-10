import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { router } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BackHeader, danger, Field, formStyles, PrimaryButton } from '@/components/form';
import { Avatar } from '@/components/avatar';
import { colors, fonts } from '@/constants/theme';
import { uploadPhoto } from '@/lib/posts';
import { useSession } from '@/lib/session';
import { supabase } from '@/lib/supabase';

// Edit your own profile: name, bio and the InstaPay handle neighbors pay you on.
export default function EditProfile() {
  const { session, profile, refreshProfile } = useSession();
  const [name, setName] = useState(profile?.display_name ?? '');
  const [bio, setBio] = useState(profile?.bio ?? '');
  const [instapay, setInstapay] = useState(profile?.instapay_handle ?? '');
  const [photo, setPhoto] = useState<ImagePicker.ImagePickerAsset | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function pickPhoto() {
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.7, allowsEditing: true, aspect: [1, 1] });
    if (!res.canceled && res.assets[0]) setPhoto(res.assets[0]);
  }

  const ok = name.trim().length >= 1;
  const save = async () => {
    if (!session) return;
    setBusy(true);
    setError(null);
    let avatarPath: string | undefined;
    try {
      if (photo) avatarPath = await uploadPhoto(session.user.id, photo.uri, photo.mimeType ?? 'image/jpeg');
    } catch {
      setBusy(false);
      setError('We couldn’t upload your photo. Check your connection and try again.');
      return;
    }
    const { error: saveError } = await supabase
      .from('profiles')
      .update({ display_name: name.trim(), bio: bio.trim() || null, instapay_handle: instapay.trim() || null, ...(avatarPath ? { avatar_path: avatarPath } : {}) })
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
          <Pressable style={styles.photo} onPress={pickPhoto} accessibilityRole="button" accessibilityLabel="Change photo">
            {photo ? <Image source={{ uri: photo.uri }} style={styles.preview} contentFit="cover" /> : <Avatar person={profile ? { id: profile.id, username: profile.username, display_name: profile.display_name, avatar_path: profile.avatar_path ?? null } : null} size={96} />}
            <Text style={styles.photoText}>Change photo</Text>
          </Pressable>
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
  photo: { alignItems: 'center', gap: 8 },
  preview: { width: 96, height: 96, borderRadius: 48 },
  photoText: { fontFamily: fonts.bold, fontSize: 14, color: colors.ink },
});
