import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BackHeader, formStyles, PickerSheet, PrimaryButton, type SheetItem } from '@/components/form';
import { colors, fonts } from '@/constants/theme';
import { distanceMeters, fmtClock, fmtDist, fmtReady } from '@/lib/format';
import { useMyLocation } from '@/lib/location';
import { placeOrder } from '@/lib/orders';
import { type Dish, fetchDish, mediaUrl, personName } from '@/lib/posts';
import { useSession } from '@/lib/session';
import { pickupSlots } from '@/lib/slots';

// Flows 3 and 4, screen s57: Your order. Pick plates and pickup time, then send it to the cook.
// Payment is InstaPay, person to person, after the cook accepts (section 13); no delivery.
export default function DishScreen() {
  const { id, posted } = useLocalSearchParams<{ id: string; posted?: string }>();
  const { session } = useSession();
  const here = useMyLocation();
  const [dish, setDish] = useState<Dish | null | undefined>(undefined);
  const [plates, setPlates] = useState(1);
  const [pickupAt, setPickupAt] = useState<number | null>(null);
  const [note, setNote] = useState('');
  const [sheet, setSheet] = useState<SheetItem[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    fetchDish(id).then(setDish, () => setDish(null));
  }, [id]);

  // Pickup choices and "Ready now" move with the clock.
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);

  if (dish === undefined) {
    return (
      <SafeAreaView style={[styles.screen, styles.center]}>
        <ActivityIndicator color={colors.teal} />
      </SafeAreaView>
    );
  }
  if (!dish) {
    return (
      <SafeAreaView style={styles.screen}>
        <View style={styles.pad}>
          <BackHeader />
          <Text style={[formStyles.sub, { marginTop: 30 }]}>This dish is no longer available today.</Text>
        </View>
      </SafeAreaView>
    );
  }

  const cook = personName(dish.author);
  const first = cook; // full name: first words like "Um" or "Abu" don't stand alone
  const mine = session?.user.id === dish.author_id;
  const price = Number(dish.price_egp);
  const slots = pickupSlots(Date.parse(dish.ready_at), Date.parse(dish.expires_at), now);
  const chosen = pickupAt ?? slots[0] ?? null;
  const pp = dish.pickup_point;
  const photo = mediaUrl(dish.media_path);
  const soldOut = dish.portions_left === 0;
  const closed = slots.length === 0;

  async function onSend() {
    if (!session) return router.push('/sign-up');
    if (!chosen) return;
    setBusy(true);
    setError(null);
    try {
      const order = await placeOrder(dish!.id, plates, chosen, note);
      router.replace({ pathname: '/order/[id]', params: { id: order.id } });
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }

  return (
    <SafeAreaView style={styles.screen}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.pad} keyboardShouldPersistTaps="handled">
          <BackHeader title={mine ? 'Your dish' : 'Your order'} />
          <View style={styles.cookRow}>
            <Text style={styles.cook}>{cook}</Text>
            <MaterialIcons name="verified" size={16} color={colors.teal} />
          </View>
          <Text style={styles.sub}>Cooking today{dish.community ? ` · ${dish.community.name}` : ''}</Text>

          {posted ? (
            <View style={styles.note}>
              <MaterialIcons name="check-circle" size={19} color={colors.teal} />
              <Text style={styles.noteText}>Your dish is live in Today’s menu, with a story until midnight. Orders show under Orders for you.</Text>
            </View>
          ) : null}

          {photo ? <Image source={{ uri: photo }} style={styles.photo} contentFit="cover" /> : null}
          {dish.caption ? <Text style={styles.caption}>{dish.caption}</Text> : null}

          <Text style={styles.section}>{mine ? 'YOUR OFFERING' : 'WHAT WOULD YOU LIKE?'}</Text>
          <View style={styles.dishRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.dishName}>{dish.dish_name}</Text>
              <Text style={styles.muted}>
                {[dish.cuisine, ...dish.main_ingredients].filter(Boolean).join(' · ') || 'Home cooked'} · {soldOut ? 'Sold out' : `${dish.portions_left} left`}
              </Text>
              <Text style={styles.price}>EGP {price}</Text>
            </View>
            {!mine && !soldOut ? (
              <View style={styles.stepper}>
                <Pressable hitSlop={8} onPress={() => setPlates((p) => Math.max(1, p - 1))} accessibilityLabel="One plate fewer">
                  <MaterialIcons name="remove" size={20} color={plates > 1 ? colors.ink : colors.line} />
                </Pressable>
                <Text style={styles.qty}>{plates}</Text>
                <Pressable hitSlop={8} onPress={() => setPlates((p) => Math.min(dish.portions_left, p + 1))} accessibilityLabel="One plate more">
                  <MaterialIcons name="add" size={20} color={plates < dish.portions_left ? colors.ink : colors.line} />
                </Pressable>
              </View>
            ) : null}
          </View>

          <Text style={styles.section}>PICKUP</Text>
          <View style={styles.box}>
            <View style={styles.line}>
              <MaterialIcons name="location-on" size={19} color={colors.teal} />
              <Text style={styles.lineText}>
                {pp?.label ?? 'Ask the cook'}
                {here && pp ? <Text style={styles.muted}> · {fmtDist(distanceMeters(here, pp))} away</Text> : null}
              </Text>
            </View>
            <Pressable
              style={styles.line}
              disabled={mine || closed}
              onPress={() => setSheet(slots.map((t) => ({ label: t === slots[0] ? `${fmtReady(t, now)} (earliest)` : fmtClock(t), selected: t === chosen, onPress: () => setPickupAt(t) })))}>
              <MaterialIcons name="schedule" size={19} color={colors.teal} />
              <Text style={styles.lineText}>
                {closed ? 'Pickup has closed for today' : mine ? `Ready ${fmtReady(Date.parse(dish.ready_at), now).replace('Ready now', 'now')}` : `Pick up ${chosen && chosen <= now ? 'now' : `at ${fmtClock(chosen!)}`} today`}
              </Text>
              {!mine && !closed ? <MaterialIcons name="expand-more" size={20} color={colors.muted} /> : null}
            </Pressable>
            {!mine ? (
              <>
                <View style={styles.line}>
                  <MaterialIcons name="payments" size={19} color={colors.teal} />
                  <Text style={styles.lineText}>Pay {first} by InstaPay after {first} accepts. Nothing is charged in the app.</Text>
                </View>
                <View style={styles.line}>
                  <MaterialIcons name="directions-walk" size={19} color={colors.teal} />
                  <Text style={styles.lineText}>A short walk away · no delivery fee, no rider to wait for</Text>
                </View>
              </>
            ) : null}
          </View>

          {!mine ? (
            <TextInput
              value={note}
              onChangeText={setNote}
              maxLength={200}
              placeholder={`Note for ${first} (optional), e.g. less spicy`}
              placeholderTextColor={colors.faint}
              style={styles.noteInput}
            />
          ) : null}

          {error ? <Text style={formStyles.error}>{error}</Text> : null}

          {mine ? (
            <PrimaryButton label="See orders for you" onPress={() => router.push({ pathname: '/orders', params: { tab: 'cook' } })} style={{ marginTop: 20 }} />
          ) : (
            <>
              <View style={styles.totalRow}>
                <Text style={styles.muted}>{plates} {plates === 1 ? 'plate' : 'plates'}</Text>
                <Text style={styles.total}>EGP {price * plates}</Text>
              </View>
              <PrimaryButton
                label={!session ? `Sign up to reserve from ${first}` : soldOut ? 'Sold out' : closed ? 'Closed for today' : `Send order to ${first}`}
                onPress={onSend}
                busy={busy}
                disabled={Boolean(session) && (soldOut || closed)}
              />
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
      <PickerSheet title="Pickup time" items={sheet} onClose={() => setSheet(null)} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.paper },
  center: { alignItems: 'center', justifyContent: 'center' },
  pad: { paddingHorizontal: 20, paddingBottom: 30 },
  cookRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 16 },
  cook: { fontFamily: fonts.extraBold, fontSize: 20, color: colors.ink },
  sub: { fontFamily: fonts.semiBold, fontSize: 13, color: colors.muted, marginTop: 2 },
  photo: { width: '100%', aspectRatio: 4 / 3, borderRadius: 18, marginTop: 16, backgroundColor: colors.cream },
  caption: { fontFamily: fonts.medium, fontSize: 14.5, color: colors.ink, lineHeight: 21, marginTop: 12 },
  section: { fontFamily: fonts.extraBold, fontSize: 11, letterSpacing: 0.6, color: colors.muted, marginTop: 22, marginBottom: 8 },
  dishRow: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.white, borderRadius: 16, borderWidth: 1, borderColor: colors.line, padding: 14 },
  dishName: { fontFamily: fonts.extraBold, fontSize: 16, color: colors.ink },
  muted: { fontFamily: fonts.semiBold, fontSize: 12.5, color: colors.muted, marginTop: 2 },
  price: { fontFamily: fonts.extraBold, fontSize: 15, color: colors.ink, marginTop: 4 },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 1.5, borderColor: colors.line, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 6 },
  qty: { fontFamily: fonts.extraBold, fontSize: 16, color: colors.ink, minWidth: 18, textAlign: 'center' },
  box: { backgroundColor: colors.white, borderRadius: 16, borderWidth: 1, borderColor: colors.line, paddingHorizontal: 14 },
  line: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.line },
  lineText: { flex: 1, fontFamily: fonts.semiBold, fontSize: 13.5, color: colors.ink, lineHeight: 19 },
  noteInput: { fontFamily: fonts.semiBold, fontSize: 14, color: colors.ink, backgroundColor: colors.white, borderWidth: 1, borderColor: colors.line, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 12, marginTop: 14 },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 20, marginBottom: 10 },
  total: { fontFamily: fonts.extraBold, fontSize: 18, color: colors.ink },
  note: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: colors.tealSoft, borderRadius: 14, padding: 14, marginTop: 14 },
  noteText: { flex: 1, fontFamily: fonts.semiBold, fontSize: 12.5, lineHeight: 18, color: colors.ink },
});
