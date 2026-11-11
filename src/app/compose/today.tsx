import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { Image } from 'expo-image';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { KeyboardAvoidingView, Pressable, ScrollView, StyleSheet, Switch, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Text, TextInput } from '@/components/text';
import { Field, formStyles, PickerSheet, PrimaryButton, SelectField, type SheetItem } from '@/components/form';
import { Chip } from '@/components/chip';
import { colors, fonts } from '@/constants/theme';
import { fmtClock } from '@/lib/format';
import {
  CUISINES,
  fetchMyCommunities,
  fetchMyPickupPoints,
  INGREDIENTS,
  type MyCommunity,
  type PickupPoint,
  postCookingToday,
  shareErrorMessage,
  takeNewPickupPoint,
  uploadPhoto,
} from '@/lib/posts';
import { useOpenPickerOnce } from '@/lib/open-picker';
import { choosePhoto, type PhotoStart, type PickedPhoto } from '@/lib/photo-flow';
import { useSession } from '@/lib/session';
import { endOfToday, readySlots } from '@/lib/slots';

// Flow 9, screen s16: Today's menu. One post carries dish, price, portions and pickup point;
// it shows as a "On today's menu" story until midnight.
export default function ComposeToday() {
  const { session } = useSession();
  const uid = session?.user.id;
  const [photo, setPhoto] = useState<PickedPhoto | null>(null);
  const [dish, setDish] = useState('');
  const [price, setPrice] = useState('');
  const [portions, setPortions] = useState('');
  const [communities, setCommunities] = useState<MyCommunity[]>([]);
  const [chosen, setChosen] = useState<string[]>([]);
  const [points, setPoints] = useState<PickupPoint[]>([]);
  const [pointId, setPointId] = useState<string | null>(null);
  const [cuisine, setCuisine] = useState<string | null>(null);
  const [ingredients, setIngredients] = useState<string[]>([]);
  const [slots] = useState(() => readySlots());
  const [readyAt, setReadyAt] = useState<number | null>(() => slots[2] ?? slots[0] ?? null);
  const [notify, setNotify] = useState(true);
  const [sheet, setSheet] = useState<{ title: string; items: SheetItem[] } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Every community the member joined starts selected; they can untick any, or all of them to post publicly.
  useEffect(() => {
    if (!uid) return;
    fetchMyCommunities(uid).then((c) => {
      setCommunities(c);
      setChosen(c.map((x) => x.id));
    });
  }, [uid]);

  // Saved pickup points, by name. Nothing is preselected: the map opens at the member's Home location, and coming back selects the spot just saved.
  useFocusEffect(
    useCallback(() => {
      if (!uid) return;
      fetchMyPickupPoints(uid).then((p) => {
        setPoints(p);
        const fresh = takeNewPickupPoint();
        setPointId((cur) => fresh ?? (cur && p.some((x) => x.id === cur) ? cur : null));
      });
    }, [uid]),
  );

  useOpenPickerOnce(() => {
    if (uid) pickPhoto('auto');
  });

  if (!uid) {
    return (
      <SafeAreaView style={styles.screen}>
        <View style={styles.center}>
          <Text style={formStyles.sub}>Sign up to share today’s menu.</Text>
          <PrimaryButton label="Sign up" onPress={() => router.replace('/sign-up')} style={{ marginTop: 16, alignSelf: 'stretch' }} />
        </View>
      </SafeAreaView>
    );
  }

  async function pickPhoto(start: PhotoStart) {
    const res = await choosePhoto('menu', start);
    if (res) setPhoto(res);
  }

  const priceNum = Number(price);
  const portionsNum = Number(portions);
  const missing = [
    !dish.trim() && 'dish name',
    !(priceNum > 0) && 'price',
    !(portionsNum >= 1 && portionsNum <= 200) && 'portions',
    !pointId && 'pickup point',
    !readyAt && 'ready-by time',
  ].filter(Boolean) as string[];

  async function onPost() {
    if (missing.length) {
      setError(`Add the ${missing.join(', ')}.`);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const mediaPath = photo ? await uploadPhoto(uid!, photo.uri, photo.mimeType ?? 'image/jpeg') : null;
      const id = await postCookingToday(uid!, {
        caption: dish.trim(),
        mediaPath,
        dishName: dish,
        priceEgp: priceNum,
        portions: Math.floor(portionsNum),
        communityIds: chosen,
        pickupPointId: pointId!,
        cuisine,
        ingredients,
        readyAt: readyAt!,
        expiresAt: endOfToday(),
        notifyFollowers: notify,
      });
      router.replace({ pathname: '/dish/[id]', params: { id, posted: '1' } });
    } catch (e) {
      setError(shareErrorMessage(e));
      setBusy(false);
    }
  }

  const allOn = communities.length > 0 && chosen.length === communities.length;
  const toggle = (id: string) => setChosen((x) => (x.includes(id) ? x.filter((c) => c !== id) : [...x, id]));
  // Tapping the pickup point opens the map, starting at the spot already picked (if any).
  const addSpot = () => router.push({ pathname: '/location', params: point ? { for: 'pickup', at: `${point.lat},${point.lng}` } : { for: 'pickup' } });
  const point = points.find((p) => p.id === pointId);

  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.top}>
        <Pressable hitSlop={12} onPress={() => router.back()} accessibilityLabel="Close" style={styles.closeHit}>
          <MaterialIcons name="close" size={28} color={colors.ink} />
        </Pressable>
        <Text style={styles.topTitle}>Today’s menu</Text>
        <View style={styles.closeHit} />
      </View>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding">
        <ScrollView contentContainerStyle={styles.pad} keyboardShouldPersistTaps="handled">
          {photo ? (
            <View>
              <View style={styles.previews}>
                <View style={{ flex: 62 }}>
                  <Image source={{ uri: photo.uri }} style={styles.photo} contentFit="cover" />
                  <Text style={styles.previewLabel}>Your post (square)</Text>
                </View>
                <View style={{ flex: 34 }}>
                  <Image source={{ uri: photo.uri }} style={styles.storyPhoto} contentFit="cover" />
                  <Text style={styles.previewLabel}>Your story (full screen)</Text>
                </View>
              </View>
              <Pressable style={styles.retake} onPress={() => pickPhoto('gallery')}>
                <MaterialIcons name="photo-camera" size={16} color={colors.white} />
                <Text style={styles.retakeText}>Retake</Text>
              </Pressable>
            </View>
          ) : (
            <View style={styles.photoEmpty}>
              <Pressable style={styles.photoBtn} onPress={() => pickPhoto('camera')}>
                <MaterialIcons name="photo-camera" size={22} color={colors.teal} />
                <Text style={styles.photoBtnText}>Take a photo</Text>
              </Pressable>
              <Pressable style={styles.photoBtn} onPress={() => pickPhoto('gallery')}>
                <MaterialIcons name="photo-library" size={22} color={colors.teal} />
                <Text style={styles.photoBtnText}>From gallery</Text>
              </Pressable>
            </View>
          )}

          <View style={styles.group}>
            <Field label="DISH NAME" required>
              <TextInput value={dish} onChangeText={setDish} maxLength={80} placeholder="example: Molokhia & Rice" placeholderTextColor={colors.faint} style={formStyles.input} />
            </Field>
            <View style={styles.row2}>
              <Field label="PRICE PER PLATE" required style={{ flex: 1 }}>
                <View style={styles.inline}>
                  <Text style={[formStyles.input, { color: colors.muted }]}>EGP </Text>
                  <TextInput value={price} onChangeText={(v) => setPrice(v.replace(/[^\d.]/g, '').slice(0, 7))} keyboardType="decimal-pad" placeholder="85" placeholderTextColor={colors.faint} style={[formStyles.input, { flex: 1 }]} />
                </View>
              </Field>
              <Field label="PORTIONS" required style={{ flex: 1 }}>
                <View style={styles.inline}>
                  <TextInput value={portions} onChangeText={(v) => setPortions(v.replace(/\D/g, '').slice(0, 3))} keyboardType="number-pad" placeholder="6" placeholderTextColor={colors.faint} style={[formStyles.input, { flex: 1 }]} />
                  <Text style={[formStyles.input, { color: colors.muted }]}>plates</Text>
                </View>
              </Field>
            </View>
          </View>

          <Text style={styles.section}>SERVING COMMUNITIES</Text>
          <Text style={styles.sectionSub}>
            {communities.length
              ? chosen.length
                ? 'Members of the communities you pick see it. Tap to add or remove.'
                : 'No community picked: it’s public, anyone nearby can see it.'
              : 'You haven’t joined a community yet, so it’s public: anyone nearby can see it.'}
          </Text>
          {communities.length ? (
            <View style={styles.chips}>
              {communities.length > 1 ? <Chip label="All my communities" on={allOn} onPress={() => setChosen(allOn ? [] : communities.map((c) => c.id))} /> : null}
              {communities.map((c) => (
                <Chip key={c.id} label={c.name} on={chosen.includes(c.id)} onPress={() => toggle(c.id)} />
              ))}
            </View>
          ) : null}

          <Text style={styles.section}>PICKUP POINT</Text>
          <View style={styles.group}>
            <SelectField
              label="PICKUP POINT"
              required
              value={point?.label ?? 'Choose on the map'}
              onPress={addSpot}
            />
            <Text style={[formStyles.hint, { color: colors.muted, marginTop: 0 }]}>Buyers see this before they reserve. Tap to set it on the map; it can differ from your home location.</Text>
          </View>

          <Text style={styles.section}>CUISINE TYPE</Text>
          <View style={styles.chips}>
            {CUISINES.map((c) => (
              <Chip key={c} label={c} on={cuisine === c} onPress={() => setCuisine(cuisine === c ? null : c)} />
            ))}
          </View>

          <Text style={styles.section}>MAIN INGREDIENTS</Text>
          <View style={styles.chips}>
            {INGREDIENTS.map((c) => (
              <Chip key={c} label={c} on={ingredients.includes(c)} onPress={() => setIngredients((x) => (x.includes(c) ? x.filter((i) => i !== c) : [...x, c]))} />
            ))}
          </View>

          <View style={[styles.group, { marginTop: 24 }]}>
            {slots.length ? (
              <SelectField
                label="READY-BY TIME"
                required
                value={readyAt ? fmtClock(readyAt) : 'Choose'}
                onPress={() => setSheet({ title: 'Ready by', items: slots.map((t) => ({ label: fmtClock(t), selected: t === readyAt, onPress: () => setReadyAt(t) })) })}
              />
            ) : (
              <Text style={formStyles.error}>It’s too late to post for today. Try again tomorrow.</Text>
            )}
            <View style={styles.switchRow}>
              <Text style={styles.switchLabel}>Auto-notify followers</Text>
              <Switch value={notify} onValueChange={setNotify} trackColor={{ true: colors.teal, false: colors.line }} thumbColor={colors.white} />
            </View>
          </View>

          <View style={styles.note}>
            <MaterialIcons name="history-toggle-off" size={19} color={colors.teal} />
            <Text style={styles.noteText}>An “On today’s menu” story is created for you automatically and links to this post, so pickup and portions stay in one place. It ends at midnight.</Text>
          </View>

          {error ? <Text style={formStyles.error}>{error}</Text> : null}
          <PrimaryButton label="Share post & story" onPress={onPost} busy={busy} disabled={!slots.length} style={{ marginTop: 18 }} />
        </ScrollView>
      </KeyboardAvoidingView>
      <PickerSheet title={sheet?.title ?? ''} items={sheet?.items ?? null} onClose={() => setSheet(null)} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.paper },
  center: { flex: 1, justifyContent: 'center', padding: 22 },
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 18, paddingTop: 16, paddingBottom: 12 },
  topTitle: { fontFamily: fonts.extraBold, fontSize: 22, color: colors.ink },
  closeHit: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', marginLeft: -8 },
  pad: { paddingHorizontal: 18, paddingBottom: 30 },
  photo: { width: '100%', aspectRatio: 4 / 3, borderRadius: 18, backgroundColor: colors.cream },
  previews: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  storyPhoto: { width: '100%', aspectRatio: 9 / 16, borderRadius: 14, backgroundColor: colors.cream },
  previewLabel: { fontFamily: fonts.medium, fontSize: 12, color: colors.muted, marginTop: 6 },
  photoEmpty: { flexDirection: 'row', gap: 12, aspectRatio: 2.2, borderRadius: 18, backgroundColor: colors.cream, alignItems: 'center', justifyContent: 'center' },
  photoBtn: { alignItems: 'center', gap: 6, backgroundColor: colors.white, borderRadius: 14, paddingHorizontal: 16, paddingVertical: 12 },
  photoBtnText: { fontFamily: fonts.bold, fontSize: 13, color: colors.ink },
  retake: { position: 'absolute', left: 10, top: 10, flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: 'rgba(40,48,58,.6)', borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6 },
  retakeText: { fontFamily: fonts.bold, fontSize: 13, color: colors.white },
  group: { gap: 12, marginTop: 14 },
  row2: { flexDirection: 'row', gap: 12 },
  inline: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  section: { fontFamily: fonts.extraBold, fontSize: 12, letterSpacing: 0.6, color: colors.ink, marginTop: 24 },
  sectionSub: { fontFamily: fonts.medium, fontSize: 13, color: colors.muted, marginTop: 4 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 },
  switchRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 4 },
  switchLabel: { fontFamily: fonts.bold, fontSize: 15, color: colors.ink },
  note: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: colors.tealSoft, borderRadius: 14, padding: 14, marginTop: 20 },
  noteText: { flex: 1, fontFamily: fonts.semiBold, fontSize: 12.5, lineHeight: 18, color: colors.ink },
});
