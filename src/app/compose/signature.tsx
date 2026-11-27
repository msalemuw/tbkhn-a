import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { Image } from 'expo-image';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated, { runOnJS, useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { KeyboardAvoidingView } from '@/components/keyboard-view';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Text, TextInput } from '@/components/text';
import { danger, Field, formStyles, PickerSheet, PrimaryButton, SelectField, type SheetItem } from '@/components/form';
import { colors, fonts } from '@/constants/theme';
import { postSignature } from '@/lib/feed';
import { fetchMyCommunities, type MyCommunity, shareErrorMessage, uploadPhoto } from '@/lib/posts';
import { choosePhoto, MAX_POST_PHOTOS, peekPendingPhoto, setPendingPhoto, type PhotoStart, type PickedPhoto } from '@/lib/photo-flow';
import { peekRecipeDraft, type Recipe, setRecipeDraft } from '@/lib/recipe';
import { useSession } from '@/lib/session';

// A signature dish: a photo and a few words that stay on your profile and show in the Home feed. Not for ordering.
export default function ComposeSignature() {
  const { session } = useSession();
  const uid = session?.user.id;
  // Up to 10 photos: the first is the cover, the rest follow in order (a carousel post).
  const [photos, setPhotos] = useState<PickedPhoto[]>(() => {
    const first = peekPendingPhoto();
    return first ? [{ uri: first.uri, mimeType: first.mimeType, focus: first.focus, aspect: first.aspect }, ...(first.more ?? [])] : [];
  });
  const photo = photos[0] ?? null;
  // The photo was handed over once; later visits start empty.
  useEffect(() => setPendingPhoto(null), []);
  const [caption, setCaption] = useState('');
  // The optional recipe, written on its own screen and handed back through the draft.
  const [recipe, setRecipe] = useState<Recipe | null>(null);
  useEffect(() => setRecipeDraft(null), []);
  useFocusEffect(useCallback(() => setRecipe(peekRecipeDraft()), []));
  const [communities, setCommunities] = useState<MyCommunity[]>([]);
  const [communityId, setCommunityId] = useState<string | null>(null);
  const [sheet, setSheet] = useState<SheetItem[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (uid) fetchMyCommunities(uid).then(setCommunities, () => null);
  }, [uid]);

  const flat = (res: PickedPhoto): PickedPhoto[] => [{ uri: res.uri, mimeType: res.mimeType, focus: res.focus, aspect: res.aspect }, ...(res.more ?? [])];

  async function pickPhoto(start: PhotoStart) {
    const res = await choosePhoto('post', start, MAX_POST_PHOTOS);
    if (res) {
      setPhotos(flat(res));
    }
  }

  // "Add" in the photo strip: the same gallery picker, numbered in the order tapped, for the places that are left.
  async function addMore() {
    const room = MAX_POST_PHOTOS - photos.length;
    if (room <= 0) return;
    const res = await choosePhoto('post', 'gallery', room);
    if (res) setPhotos((l) => [...l, ...flat(res)].slice(0, MAX_POST_PHOTOS));
  }

  async function onPost() {
    if (!uid) return;
    if (!photo) return setError('Add a photo of your dish.');
    setBusy(true);
    setError(null);
    try {
      const path = await uploadPhoto(uid, photo.uri, photo.mimeType ?? 'image/jpeg');
      const morePaths: string[] = [];
      for (const m of photos.slice(1)) morePaths.push(await uploadPhoto(uid, m.uri, m.mimeType ?? 'image/jpeg'));
      await postSignature(uid, caption, path, communityId, morePaths, photos[0]?.aspect ?? null, recipe, photos.map((p) => p.focus ?? { x: 0.5, y: 0.5 }));
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
              <Image source={{ uri: photo.uri }} style={styles.photo} contentFit="cover" contentPosition={at(photo)} />
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
          {photo ? <PhotoStrip photos={photos} onChange={setPhotos} onAdd={addMore} /> : null}
          <View style={styles.group}>
            <Field label="CAPTION">
              <TextInput value={caption} onChangeText={setCaption} placeholder="Tell neighbors about this dish" placeholderTextColor={colors.faint} multiline maxLength={500} style={[formStyles.input, { minHeight: 60 }]} accessibilityLabel="Caption" />
            </Field>
            <Pressable style={styles.recipeRow} onPress={() => router.push('/compose/recipe')} accessibilityRole="button" accessibilityLabel="Add recipe">
              <MaterialIcons name="menu-book" size={22} color={colors.teal} />
              <Text style={styles.recipeText}>{recipe ? `Recipe added · ${recipe.ingredients.length} ${recipe.ingredients.length === 1 ? 'ingredient' : 'ingredients'}, ${recipe.steps.length} ${recipe.steps.length === 1 ? 'step' : 'steps'}` : 'Add recipe (optional)'}</Text>
              <MaterialIcons name="chevron-right" size={22} color={colors.muted} />
            </Pressable>
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

// The square part of a photo the feed shows (centred when none was chosen).
const at = (p: PickedPhoto) => ({ left: `${Math.round((p.focus?.x ?? 0.5) * 100)}%` as const, top: `${Math.round((p.focus?.y ?? 0.5) * 100)}%` as const });

const THUMB = 64;
const GAP = 8;
const STEP = THUMB + GAP;

// The photos in this post as a row of thumbnails: press and hold one, then drag it left or right to reorder (like Instagram). The first is the cover.
function PhotoStrip({ photos, onChange, onAdd }: { photos: PickedPhoto[]; onChange: (p: PickedPhoto[]) => void; onAdd: () => void }) {
  function move(from: number, to: number) {
    const target = Math.max(0, Math.min(photos.length - 1, to));
    if (target === from) return;
    const next = [...photos];
    const [it] = next.splice(from, 1);
    next.splice(target, 0, it);
    onChange(next);
  }
  return (
    <GestureHandlerRootView style={styles.moreRow}>
      {photos.map((m, i) => (
        <Thumb key={m.uri} photo={m} index={i} cover={i === 0} onMove={move} onRemove={() => onChange(photos.filter((_, j) => j !== i))} />
      ))}
      {photos.length < MAX_POST_PHOTOS ? (
        <Pressable style={styles.addMore} onPress={onAdd} accessibilityRole="button" accessibilityLabel="Add more photos">
          <MaterialIcons name="add-photo-alternate" size={24} color={colors.teal} />
          <Text style={styles.addMoreText}>{photos.length > 1 ? 'Add' : 'Add more photos'}</Text>
        </Pressable>
      ) : null}
    </GestureHandlerRootView>
  );
}

function Thumb({ photo, index, cover, onMove, onRemove }: { photo: PickedPhoto; index: number; cover: boolean; onMove: (from: number, to: number) => void; onRemove: () => void }) {
  const x = useSharedValue(0);
  const lift = useSharedValue(0);
  const drag = Gesture.Pan()
    .activateAfterLongPress(250)
    .onStart(() => {
      lift.value = withSpring(1);
    })
    .onUpdate((e) => {
      x.value = e.translationX;
    })
    .onEnd((e) => {
      const to = index + Math.round(e.translationX / STEP);
      x.value = withSpring(0);
      lift.value = withSpring(0);
      if (to !== index) runOnJS(onMove)(index, to);
    });
  const style = useAnimatedStyle(() => ({ transform: [{ translateX: x.value }, { scale: 1 + lift.value * 0.12 }], zIndex: lift.value > 0.01 ? 10 : 0 }));
  return (
    <GestureDetector gesture={drag}>
      <Animated.View style={[styles.thumbWrap, style]}>
        <Image source={{ uri: photo.uri }} style={styles.thumb} contentFit="cover" contentPosition={at(photo)} />
        {cover ? (
          <View style={styles.coverTag}>
            <Text style={styles.coverTagText}>Cover</Text>
          </View>
        ) : null}
        <Pressable style={styles.thumbX} hitSlop={6} onPress={onRemove} accessibilityLabel="Remove photo">
          <MaterialIcons name="close" size={14} color={colors.white} />
        </Pressable>
      </Animated.View>
    </GestureDetector>
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
  coverTag: { position: 'absolute', left: 4, bottom: 4, backgroundColor: 'rgba(40,48,58,.75)', borderRadius: 999, paddingHorizontal: 6, paddingVertical: 1 },
  coverTagText: { fontFamily: fonts.bold, fontSize: 10, color: colors.white },
  addMore: { minWidth: 64, height: 64, borderRadius: 10, borderWidth: 1, borderStyle: 'dashed', borderColor: colors.teal, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 10, gap: 2 },
  addMoreText: { fontFamily: fonts.bold, fontSize: 12, color: colors.ink },
  group: { gap: 12, marginTop: 14 },
  recipeRow: { flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderStyle: 'dashed', borderColor: colors.teal, borderRadius: 12, backgroundColor: colors.white, paddingHorizontal: 14, height: 50 },
  recipeText: { flex: 1, fontFamily: fonts.bold, fontSize: 14, color: colors.ink },
});
