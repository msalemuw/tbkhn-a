import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Field, formStyles, PickerSheet, PrimaryButton, SelectField, type SheetItem } from '@/components/form';
import { Chip } from '@/components/chip';
import { colors, fonts } from '@/constants/theme';
import { fmtClock } from '@/lib/format';
import { getMyLocation } from '@/lib/location';
import {
  addPickupPoint,
  CUISINES,
  fetchMyCommunities,
  fetchMyPickupPoints,
  INGREDIENTS,
  type MyCommunity,
  type PickupPoint,
  postCookingToday,
  uploadPhoto,
} from '@/lib/posts';
import { useSession } from '@/lib/session';
import { endOfToday, readySlots } from '@/lib/slots';

// Flow 9, screen s16: Today's cooking. One post carries dish, price, portions and pickup point;
// it shows as a "taking orders" story until midnight.
export default function ComposeToday() {
  const { session } = useSession();
  const uid = session?.user.id;
  const [photo, setPhoto] = useState<ImagePicker.ImagePickerAsset | null>(null);
  const [caption, setCaption] = useState('');
  const [dish, setDish] = useState('');
  const [price, setPrice] = useState('');
  const [portions, setPortions] = useState('');
  const [communities, setCommunities] = useState<MyCommunity[]>([]);
  const [communityId, setCommunityId] = useState<string | null>(null);
  const [points, setPoints] = useState<PickupPoint[]>([]);
  const [pointId, setPointId] = useState<string | null>(null);
  const [newPointLabel, setNewPointLabel] = useState('');
  const [addingPoint, setAddingPoint] = useState(false);
  const [cuisine, setCuisine] = useState<string | null>(null);
  const [ingredients, setIngredients] = useState<string[]>([]);
  const [slots] = useState(() => readySlots());
  const [readyAt, setReadyAt] = useState<number | null>(() => slots[2] ?? slots[0] ?? null);
  const [notify, setNotify] = useState(true);
  const [sheet, setSheet] = useState<{ title: string; items: SheetItem[] } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!uid) return;
    fetchMyCommunities(uid).then((c) => {
      setCommunities(c);
      if (c.length === 1) setCommunityId(c[0].id);
    });
    fetchMyPickupPoints(uid).then((p) => {
      setPoints(p);
      if (p.length) setPointId(p[p.length - 1].id);
    });
  }, [uid]);

  if (!uid) {
    return (
      <SafeAreaView style={styles.screen}>
        <View style={styles.center}>
          <Text style={formStyles.sub}>Sign up to post what you’re cooking today.</Text>
          <PrimaryButton label="Sign up" onPress={() => router.replace('/sign-up')} style={{ marginTop: 16, alignSelf: 'stretch' }} />
        </View>
      </SafeAreaView>
    );
  }

  async function pickPhoto(camera: boolean) {
    const opts: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], quality: 0.7, allowsEditing: true, aspect: [4, 3] };
    if (camera) {
      const perm = await ImagePicker.requestCameraPermissionsAsync();
      if (!perm.granted) return;
    }
    const res = camera ? await ImagePicker.launchCameraAsync(opts) : await ImagePicker.launchImageLibraryAsync(opts);
    if (!res.canceled && res.assets[0]) setPhoto(res.assets[0]);
  }

  async function saveNewPoint() {
    if (!newPointLabel.trim()) return;
    setAddingPoint(true);
    const here = await getMyLocation();
    if (!here) {
      setAddingPoint(false);
      Alert.alert('Location needed', 'Allow location so neighbors can see how far your pickup point is. Stand at the pickup spot when you add it.');
      return;
    }
    try {
      const p = await addPickupPoint(uid!, newPointLabel.trim(), here.lat, here.lng);
      setPoints((x) => [...x, p]);
      setPointId(p.id);
      setNewPointLabel('');
    } catch {
      setError('We couldn’t save the pickup point. Try again.');
    }
    setAddingPoint(false);
  }

  const priceNum = Number(price);
  const portionsNum = Number(portions);
  const missing = [
    !dish.trim() && 'dish name',
    !(priceNum > 0) && 'price',
    !(portionsNum >= 1 && portionsNum <= 200) && 'portions',
    !communityId && 'community',
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
        caption,
        mediaPath,
        dishName: dish,
        priceEgp: priceNum,
        portions: Math.floor(portionsNum),
        communityId: communityId!,
        pickupPointId: pointId!,
        cuisine,
        ingredients,
        readyAt: readyAt!,
        expiresAt: endOfToday(),
        notifyFollowers: notify,
      });
      router.replace({ pathname: '/dish/[id]', params: { id, posted: '1' } });
    } catch {
      setError('We couldn’t share your post. Check your connection and try again.');
      setBusy(false);
    }
  }

  const community = communities.find((c) => c.id === communityId);
  const point = points.find((p) => p.id === pointId);

  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.top}>
        <Pressable hitSlop={12} onPress={() => router.back()} accessibilityLabel="Close">
          <MaterialIcons name="close" size={26} color={colors.ink} />
        </Pressable>
        <Text style={styles.topTitle}>Today’s cooking</Text>
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
                <MaterialIcons name="photo-camera" size={16} color={colors.white} />
                <Text style={styles.retakeText}>Retake</Text>
              </Pressable>
            </View>
          ) : (
            <View style={styles.photoEmpty}>
              <Pressable style={styles.photoBtn} onPress={() => pickPhoto(true)}>
                <MaterialIcons name="photo-camera" size={22} color={colors.teal} />
                <Text style={styles.photoBtnText}>Take a photo</Text>
              </Pressable>
              <Pressable style={styles.photoBtn} onPress={() => pickPhoto(false)}>
                <MaterialIcons name="photo-library" size={22} color={colors.teal} />
                <Text style={styles.photoBtnText}>From gallery</Text>
              </Pressable>
            </View>
          )}

          <View style={styles.group}>
            <Field label="CAPTION">
              <TextInput value={caption} onChangeText={setCaption} multiline maxLength={500} placeholder="example: Molokhia and rice today, enough for 6 plates." placeholderTextColor={colors.faint} style={[formStyles.input, { minHeight: 44 }]} />
            </Field>
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

          <Text style={styles.section}>SERVING COMMUNITY</Text>
          <Text style={styles.sectionSub}>Pick the one community this batch is for.</Text>
          <View style={styles.group}>
            {communities.length ? (
              <SelectField
                label="COMMUNITY"
                required
                value={community?.name ?? 'Choose'}
                onPress={() => setSheet({ title: 'Serving community', items: communities.map((c) => ({ label: c.name, selected: c.id === communityId, onPress: () => setCommunityId(c.id) })) })}
              />
            ) : (
              <Text style={[formStyles.hint, { color: colors.muted }]}>Join a community from your profile first.</Text>
            )}
          </View>

          <Text style={styles.section}>PICKUP POINT</Text>
          <View style={styles.group}>
            {points.length ? (
              <SelectField
                label="PICKUP POINT"
                required
                value={point?.label ?? 'Choose'}
                onPress={() => setSheet({ title: 'Pickup point', items: points.map((p) => ({ label: p.label, selected: p.id === pointId, onPress: () => setPointId(p.id) })) })}
              />
            ) : null}
            <Field label={points.length ? 'OR ADD A NEW ONE' : 'ADD YOUR PICKUP POINT'}>
              <View style={styles.inline}>
                <TextInput value={newPointLabel} onChangeText={setNewPointLabel} maxLength={80} placeholder="example: Building 12 gate" placeholderTextColor={colors.faint} style={[formStyles.input, { flex: 1 }]} />
                <Text style={[formStyles.link, !newPointLabel.trim() && { opacity: 0.4 }]} onPress={saveNewPoint}>
                  {addingPoint ? 'Saving…' : 'Use my location'}
                </Text>
              </View>
            </Field>
            <Text style={[formStyles.hint, { color: colors.muted, marginTop: 0 }]}>
              Buyers see this before they reserve. Only members of this community see the post. Add it while standing at the spot.
            </Text>
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
            <Text style={styles.noteText}>A “taking orders” story is created for you automatically and links to this post, so pickup and portions stay in one place. It ends at midnight.</Text>
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
