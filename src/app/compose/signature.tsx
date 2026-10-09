import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { danger, Field, formStyles, PickerSheet, PrimaryButton, SelectField, type SheetItem } from '@/components/form';
import { colors, fonts } from '@/constants/theme';
import { postSignature } from '@/lib/feed';
import { fetchMyCommunities, type MyCommunity, uploadPhoto } from '@/lib/posts';
import { useSession } from '@/lib/session';

// A signature dish: a photo and a few words that stay on your profile and show in the Home feed. Not for ordering.
export default function ComposeSignature() {
  const { session } = useSession();
  const uid = session?.user.id;
  const [photo, setPhoto] = useState<ImagePicker.ImagePickerAsset | null>(null);
  const [caption, setCaption] = useState('');
  const [communities, setCommunities] = useState<MyCommunity[]>([]);
  const [communityId, setCommunityId] = useState<string | null>(null);
  const [sheet, setSheet] = useState<SheetItem[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (uid) fetchMyCommunities(uid).then(setCommunities, () => null);
  }, [uid]);

  async function pickPhoto(camera: boolean) {
    const opts: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], quality: 0.7, allowsEditing: true, aspect: [4, 3] };
    if (camera) {
      const perm = await ImagePicker.requestCameraPermissionsAsync();
      if (!perm.granted) return;
    }
    const res = camera ? await ImagePicker.launchCameraAsync(opts) : await ImagePicker.launchImageLibraryAsync(opts);
    if (!res.canceled && res.assets[0]) setPhoto(res.assets[0]);
  }

  async function onPost() {
    if (!uid) return;
    if (!photo) return setError('Add a photo of your dish.');
    setBusy(true);
    setError(null);
    try {
      const path = await uploadPhoto(uid, photo.uri, photo.mimeType ?? 'image/jpeg');
      await postSignature(uid, caption, path, communityId);
      router.dismissTo('/home');
    } catch {
      setError('We couldn’t share your post. Check your connection and try again.');
      setBusy(false);
    }
  }

  const community = communities.find((c) => c.id === communityId);
  const items: SheetItem[] = [
    { label: 'Public', selected: communityId === null, onPress: () => setCommunityId(null) },
    ...communities.map((c) => ({ label: c.name, selected: c.id === communityId, onPress: () => setCommunityId(c.id) })),
  ];

  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.top}>
        <Pressable hitSlop={12} onPress={() => router.back()} accessibilityLabel="Close">
          <MaterialIcons name="close" size={26} color={colors.ink} />
        </Pressable>
        <Text style={styles.topTitle}>Signature dish</Text>
        <Text style={[styles.topPost, busy && { opacity: 0.4 }]} onPress={busy ? undefined : onPost}>
          Post
        </Text>
      </View>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.pad} keyboardShouldPersistTaps="handled">
          {photo ? (
            <View>
              <Image source={{ uri: photo.uri }} style={styles.photo} contentFit="cover" />
              <Pressable style={styles.retake} onPress={() => pickPhoto(false)}>
                <MaterialIcons name="autorenew" size={16} color={colors.white} />
                <Text style={styles.retakeText}>Change</Text>
              </Pressable>
            </View>
          ) : (
            <View style={styles.photoEmpty}>
              <Pressable style={styles.photoBtn} onPress={() => pickPhoto(true)}>
                <MaterialIcons name="photo-camera" size={26} color={colors.teal} />
                <Text style={styles.photoBtnText}>Take a photo</Text>
              </Pressable>
              <Pressable style={styles.photoBtn} onPress={() => pickPhoto(false)}>
                <MaterialIcons name="photo-library" size={26} color={colors.teal} />
                <Text style={styles.photoBtnText}>From gallery</Text>
              </Pressable>
            </View>
          )}
          <View style={styles.group}>
            <Field label="CAPTION">
              <TextInput value={caption} onChangeText={setCaption} placeholder="Tell neighbors about this dish" placeholderTextColor={colors.faint} multiline maxLength={500} style={[formStyles.input, { minHeight: 60 }]} accessibilityLabel="Caption" />
            </Field>
            <SelectField label="SHARE WITH" value={community?.name ?? 'Public'} onPress={() => setSheet(items)} />
          </View>
          <Text style={[formStyles.hint, { color: colors.muted }]}>It stays on your profile and shows in the Home feed. People can like and comment, but not order it.</Text>
          {error ? <Text style={[formStyles.error, { backgroundColor: danger }]}>{error}</Text> : null}
          <PrimaryButton label="Share post" onPress={onPost} busy={busy} style={{ marginTop: 18 }} />
        </ScrollView>
      </KeyboardAvoidingView>
      <PickerSheet title="Share with" items={sheet} onClose={() => setSheet(null)} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.paper },
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 18, paddingVertical: 10 },
  topTitle: { fontFamily: fonts.extraBold, fontSize: 17, color: colors.ink },
  topPost: { fontFamily: fonts.extraBold, fontSize: 16, color: colors.ink },
  pad: { paddingHorizontal: 18, paddingBottom: 30 },
  photo: { width: '100%', aspectRatio: 4 / 3, borderRadius: 18, backgroundColor: colors.cream },
  photoEmpty: { flexDirection: 'row', gap: 12, aspectRatio: 2.2, borderRadius: 18, backgroundColor: colors.cream, alignItems: 'center', justifyContent: 'center' },
  photoBtn: { alignItems: 'center', gap: 6, backgroundColor: colors.white, borderRadius: 14, paddingHorizontal: 16, paddingVertical: 12 },
  photoBtnText: { fontFamily: fonts.bold, fontSize: 13, color: colors.ink },
  retake: { position: 'absolute', right: 12, bottom: 12, flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: 'rgba(40,48,58,.6)', borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6 },
  retakeText: { fontFamily: fonts.bold, fontSize: 13, color: colors.white },
  group: { gap: 12, marginTop: 14 },
});
