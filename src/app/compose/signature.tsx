import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { KeyboardAvoidingView } from '@/components/keyboard-view';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Text, TextInput } from '@/components/text';
import { danger, Field, formStyles, PickerSheet, PrimaryButton, SelectField, type SheetItem } from '@/components/form';
import { colors, fonts } from '@/constants/theme';
import { postSignature } from '@/lib/feed';
import { fetchMyCommunities, type MyCommunity, shareErrorMessage, uploadPhoto } from '@/lib/posts';
import { choosePhoto, peekPendingPhoto, setPendingPhoto, type PhotoStart, type PickedPhoto } from '@/lib/photo-flow';
import { useSession } from '@/lib/session';

const MAX_MORE = 9;

// A signature dish: a photo and a few words that stay on your profile and show in the Home feed. Not for ordering.
export default function ComposeSignature() {
  const { session } = useSession();
  const uid = session?.user.id;
  const [photo, setPhoto] = useState<PickedPhoto | null>(() => peekPendingPhoto());
  // The photo was handed over once; later visits start empty.
  useEffect(() => setPendingPhoto(null), []);
  // Up to 9 more photos after the first (a carousel post).
  const [more, setMore] = useState<PickedPhoto[]>([]);
  const [caption, setCaption] = useState('');
  const [communities, setCommunities] = useState<MyCommunity[]>([]);
  const [communityId, setCommunityId] = useState<string | null>(null);
  const [sheet, setSheet] = useState<SheetItem[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (uid) fetchMyCommunities(uid).then(setCommunities, () => null);
  }, [uid]);

  async function pickPhoto(start: PhotoStart) {
    const res = await choosePhoto('post', start);
    if (res) setPhoto(res);
  }


  async function addMore() {
    const room = MAX_MORE - more.length;
    if (room <= 0) return;
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsMultipleSelection: true, orderedSelection: true, selectionLimit: room, quality: 0.8 });
    if (res.canceled) return;
    setMore((m) => [...m, ...res.assets.map((a) => ({ uri: a.uri, mimeType: a.mimeType ?? 'image/jpeg' }))].slice(0, MAX_MORE));
  }

  async function onPost() {
    if (!uid) return;
    if (!photo) return setError('Add a photo of your dish.');
    setBusy(true);
    setError(null);
    try {
      const path = await uploadPhoto(uid, photo.uri, photo.mimeType ?? 'image/jpeg');
      const morePaths: string[] = [];
      for (const m of more) morePaths.push(await uploadPhoto(uid, m.uri, m.mimeType ?? 'image/jpeg'));
      await postSignature(uid, caption, path, communityId, morePaths);
      router.dismissTo('/home');
    } catch (e) {
      setError(shareErrorMessage(e));
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
        <Pressable hitSlop={12} onPress={() => router.back()} accessibilityLabel="Close" style={styles.closeHit}>
          <MaterialIcons name="close" size={28} color={colors.ink} />
        </Pressable>
        <Text style={styles.topTitle}>Signature dish</Text>
        <View style={styles.closeHit} />
      </View>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding">
        <ScrollView contentContainerStyle={styles.pad} keyboardShouldPersistTaps="handled">
          {photo ? (
            <View>
              <Image source={{ uri: photo.uri }} style={styles.photo} contentFit="cover" />
              <Pressable style={styles.retake} onPress={() => pickPhoto('gallery')}>
                <MaterialIcons name="autorenew" size={16} color={colors.white} />
                <Text style={styles.retakeText}>Change</Text>
              </Pressable>
            </View>
          ) : (
            <View style={styles.photoEmpty}>
              <Pressable style={styles.photoBtn} onPress={() => pickPhoto('camera')}>
                <MaterialIcons name="photo-camera" size={26} color={colors.teal} />
                <Text style={styles.photoBtnText}>Take a photo</Text>
              </Pressable>
              <Pressable style={styles.photoBtn} onPress={() => pickPhoto('gallery')}>
                <MaterialIcons name="photo-library" size={26} color={colors.teal} />
                <Text style={styles.photoBtnText}>From gallery</Text>
              </Pressable>
            </View>
          )}
          {photo ? (
            <View style={styles.moreRow}>
              {more.map((m, i) => (
                <View key={m.uri} style={styles.thumbWrap}>
                  <Image source={{ uri: m.uri }} style={styles.thumb} contentFit="cover" />
                  <Pressable style={styles.thumbX} hitSlop={6} onPress={() => setMore((l) => l.filter((_, j) => j !== i))} accessibilityLabel="Remove photo">
                    <MaterialIcons name="close" size={14} color={colors.white} />
                  </Pressable>
                </View>
              ))}
              {more.length < MAX_MORE ? (
                <Pressable style={styles.addMore} onPress={addMore} accessibilityRole="button" accessibilityLabel="Add more photos">
                  <MaterialIcons name="add-photo-alternate" size={24} color={colors.teal} />
                  <Text style={styles.addMoreText}>{more.length ? 'Add' : 'Add more photos'}</Text>
                </Pressable>
              ) : null}
            </View>
          ) : null}
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
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 18, paddingTop: 16, paddingBottom: 12 },
  topTitle: { fontFamily: fonts.extraBold, fontSize: 22, color: colors.ink },
  closeHit: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', marginLeft: -8 },
  pad: { paddingHorizontal: 18, paddingBottom: 30 },
  photo: { width: '100%', aspectRatio: 1, borderRadius: 18, backgroundColor: colors.cream },
  photoEmpty: { flexDirection: 'row', gap: 12, aspectRatio: 2.2, borderRadius: 18, backgroundColor: colors.cream, alignItems: 'center', justifyContent: 'center' },
  photoBtn: { alignItems: 'center', gap: 6, backgroundColor: colors.white, borderRadius: 14, paddingHorizontal: 16, paddingVertical: 12 },
  photoBtnText: { fontFamily: fonts.bold, fontSize: 13, color: colors.ink },
  retake: { position: 'absolute', right: 12, bottom: 12, flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: 'rgba(40,48,58,.6)', borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6 },
  retakeText: { fontFamily: fonts.bold, fontSize: 13, color: colors.white },
  moreRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 },
  thumbWrap: { width: 64, height: 64 },
  thumb: { width: 64, height: 64, borderRadius: 10, backgroundColor: colors.cream },
  thumbX: { position: 'absolute', top: -6, right: -6, width: 20, height: 20, borderRadius: 10, backgroundColor: 'rgba(40,48,58,.85)', alignItems: 'center', justifyContent: 'center' },
  addMore: { minWidth: 64, height: 64, borderRadius: 10, borderWidth: 1, borderStyle: 'dashed', borderColor: colors.teal, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 10, gap: 2 },
  addMoreText: { fontFamily: fonts.bold, fontSize: 12, color: colors.ink },
  group: { gap: 12, marginTop: 14 },
});
