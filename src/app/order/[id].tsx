import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { type ComponentProps, useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BackHeader, danger, formStyles, PrimaryButton } from '@/components/form';
import { colors, fonts } from '@/constants/theme';
import { fmtClock } from '@/lib/format';
import { fetchCookInstapay, fetchOrder, type Order, type OrderStatus, setOrderStatus, setPayment, submitReview } from '@/lib/orders';
import { personName } from '@/lib/posts';
import { useSession } from '@/lib/session';

type IconName = ComponentProps<typeof MaterialIcons>['name'];

// Flows 3 and 16: one order, seen by the buyer (s7 waiting, s12 confirmed, s9 ready and review,
// s46-s48 cancel rules) or by the cook (accept or decline, mark ready, picked up).
const REFRESH_MS = 15_000;

export default function OrderScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { session } = useSession();
  const [order, setOrder] = useState<Order | null | undefined>(undefined);
  const [instapay, setInstapay] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setOrder(await fetchOrder(id));
    } catch {
      setOrder((o) => o ?? null);
    }
  }, [id]);

  // Status changes come from the other person, so refresh while the screen is open.
  useFocusEffect(
    useCallback(() => {
      load();
      const t = setInterval(load, REFRESH_MS);
      return () => clearInterval(t);
    }, [load]),
  );

  const status = order?.status;
  useEffect(() => {
    if (status === 'accepted' || status === 'ready' || status === 'picked_up') fetchCookInstapay(id).then(setInstapay);
  }, [id, status]);

  if (order === undefined) {
    return (
      <SafeAreaView style={[styles.screen, { alignItems: 'center', justifyContent: 'center' }]}>
        <ActivityIndicator color={colors.teal} />
      </SafeAreaView>
    );
  }
  if (!order || !session) {
    return (
      <SafeAreaView style={styles.screen}>
        <View style={styles.pad}>
          <BackHeader />
          <Text style={[formStyles.sub, { marginTop: 30 }]}>We couldn’t find this order.</Text>
        </View>
      </SafeAreaView>
    );
  }

  const o = order;
  const isCook = session.user.id === o.cook_id;
  const cook = personName(o.cook);
  const cookFirst = cook; // full name: first words like "Um" or "Abu" don't stand alone
  const buyer = personName(o.buyer);
  const dish = o.post?.dish_name ?? 'Your dish';
  const total = Number(o.post?.price_egp ?? 0) * o.plates;
  const pickup = o.pickup_at ? fmtClock(Date.parse(o.pickup_at)) : null;
  const summary = `${o.plates} × ${dish} · EGP ${total}${pickup ? ` · Pickup ${pickup}` : ''}${o.post?.pickup_point ? `, ${o.post.pickup_point.label}` : ''}`;

  async function run(key: string, fn: () => Promise<void>) {
    setBusy(key);
    setError(null);
    try {
      await fn();
      await load();
    } catch (e) {
      setError((e as Error).message);
    }
    setBusy(null);
  }
  const move = (s: OrderStatus) => run(s, () => setOrderStatus(o.id, s));

  function confirmCancel() {
    Alert.alert('Cancel this order?', `${cookFirst} hasn’t confirmed, so nothing is owed.`, [
      { text: 'Keep order', style: 'cancel' },
      { text: 'Cancel order', style: 'destructive', onPress: () => move('cancelled') },
    ]);
  }

  const head = headline(o.status, isCook, { cook: cookFirst, buyer });

  return (
    <SafeAreaView style={styles.screen}>
      <ScrollView contentContainerStyle={styles.pad} refreshControl={<RefreshControl refreshing={false} onRefresh={load} tintColor={colors.teal} />}>
        <BackHeader title={isCook ? 'Order for you' : 'Your order'} />

        <View style={styles.hero}>
          <View style={[styles.heroIcon, { backgroundColor: head.bg }]}>
            <MaterialIcons name={head.icon} size={30} color={head.fg} />
          </View>
          <Text style={styles.heroTitle}>{head.title}</Text>
          <Text style={styles.summary}>{summary}</Text>
          {head.sub ? <Text style={styles.heroSub}>{head.sub}</Text> : null}
        </View>

        {o.note ? (
          <View style={styles.card}>
            <Text style={styles.label}>NOTE FROM {isCook ? buyer.toUpperCase() : 'YOU'}</Text>
            <Text style={styles.body}>{o.note}</Text>
          </View>
        ) : null}

        {/* InstaPay, person to person, once the cook has accepted (section 13). */}
        {['accepted', 'ready', 'picked_up'].includes(o.status) ? (
          <View style={styles.card}>
            <Text style={styles.label}>PAYMENT · INSTAPAY</Text>
            {isCook ? (
              <Text style={styles.body}>
                {o.payment_status === 'none' ? `${buyer} hasn’t marked the payment as sent yet.` : o.payment_status === 'sent' ? `${buyer} says the payment is sent. Check your InstaPay and confirm.` : 'You confirmed the payment arrived.'}
              </Text>
            ) : (
              <>
                <Text style={styles.body}>
                  Send EGP {total} to {cookFirst}’s InstaPay: <Text selectable style={styles.handle}>{instapay ?? 'not added yet, message the cook'}</Text>
                </Text>
                <Text style={[styles.muted, { marginTop: 6 }]}>
                  {o.payment_status === 'none' ? 'Tap below once you’ve sent it.' : o.payment_status === 'sent' ? `Waiting for ${cookFirst} to confirm it arrived.` : `${cookFirst} confirmed the payment. Thank you!`}
                </Text>
              </>
            )}
            {isCook && o.payment_status === 'sent' ? (
              <PrimaryButton label="Payment received" busy={busy === 'received'} onPress={() => run('received', () => setPayment(o.id, 'received'))} style={{ marginTop: 12 }} />
            ) : null}
            {!isCook && o.payment_status === 'none' ? (
              <PrimaryButton label="Payment sent" busy={busy === 'sent'} onPress={() => run('sent', () => setPayment(o.id, 'sent'))} style={{ marginTop: 12 }} />
            ) : null}
          </View>
        ) : null}

        {!isCook && (o.status === 'accepted' || o.status === 'ready') ? (
          <View style={styles.lock}>
            <MaterialIcons name="lock" size={16} color={colors.muted} />
            <Text style={styles.muted}>Cancellation is closed once the cook confirms. If something changed, contact {cookFirst}.</Text>
          </View>
        ) : null}

        {error ? <Text style={[formStyles.hint, { color: danger }]}>{error}</Text> : null}

        <View style={{ gap: 10, marginTop: 18 }}>
          {isCook && o.status === 'pending' ? (
            <>
              <PrimaryButton label="Accept order" busy={busy === 'accepted'} onPress={() => move('accepted')} />
              <SecondaryButton label="Decline" busy={busy === 'declined'} onPress={() => move('declined')} />
            </>
          ) : null}
          {isCook && o.status === 'accepted' ? <PrimaryButton label="Mark as ready" busy={busy === 'ready'} onPress={() => move('ready')} /> : null}
          {isCook && o.status === 'ready' ? <PrimaryButton label="Picked up" busy={busy === 'picked_up'} onPress={() => move('picked_up')} /> : null}
          {!isCook && o.status === 'pending' ? <SecondaryButton label="Cancel order" busy={busy === 'cancelled'} onPress={confirmCancel} /> : null}
          {!isCook && (o.status === 'declined' || o.status === 'cancelled') ? <PrimaryButton label="See today’s menu" onPress={() => router.replace('/menu')} /> : null}
        </View>

        {!isCook && o.status === 'picked_up' ? (o.review.length ? <Text style={[styles.muted, styles.thanks]}>Thanks for your review!</Text> : <ReviewBox order={o} cook={cookFirst} onDone={load} />) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

function headline(status: OrderStatus, isCook: boolean, n: { cook: string; buyer: string }): { title: string; sub?: string; icon: IconName; bg: string; fg: string } {
  const wait = { icon: 'hourglass-top' as IconName, bg: colors.cream, fg: colors.amber };
  const good = { icon: 'check' as IconName, bg: colors.tealSoft, fg: colors.teal };
  const ready = { icon: 'restaurant' as IconName, bg: colors.tealSoft, fg: colors.teal };
  const off = { icon: 'close' as IconName, bg: colors.coralSoft, fg: colors.coral };
  if (isCook) {
    switch (status) {
      case 'pending': return { ...wait, title: `New order from ${n.buyer}`, sub: 'Accept it if you can cook it in time. They can cancel for free until you do.' };
      case 'accepted': return { ...good, title: 'You accepted this order', sub: `Tap Mark as ready when it’s done, and ${n.buyer} is told right away.` };
      case 'ready': return { ...ready, title: 'Ready for pickup', sub: `Tap Picked up when ${n.buyer} collects it.` };
      case 'picked_up': return { ...good, title: 'Picked up', sub: 'Order complete.' };
      case 'declined': return { ...off, title: 'You declined this order', sub: 'The plates went back on your menu.' };
      case 'cancelled': return { ...off, title: `${n.buyer} cancelled`, sub: 'The plates went back on your menu.' };
    }
  }
  switch (status) {
    case 'pending': return { ...wait, title: `Waiting for ${n.cook} to confirm`, sub: `You can cancel for free until ${n.cook} confirms.` };
    case 'accepted': return { ...good, title: `Order confirmed by ${n.cook}`, sub: 'Preparing. You’ll be told when it’s ready.' };
    case 'ready': return { ...ready, title: 'Your order is ready', sub: `${n.cook} just finished cooking. Hot and ready for your family’s table.` };
    case 'picked_up': return { ...good, title: 'Enjoy your meal' };
    case 'declined': return { ...off, title: `${n.cook} couldn’t take this order`, sub: 'Nothing is owed. Try another dish from today’s menu.' };
    case 'cancelled': return { ...off, title: 'You cancelled this order', sub: 'Nothing is owed.' };
  }
}

/** s9: "How was the meal?" with a Later option instead of blocking the screen. */
function ReviewBox({ order, cook, onDone }: { order: Order; cook: string; onDone: () => void }) {
  const [rating, setRating] = useState(0);
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function send() {
    setBusy(true);
    setError(null);
    try {
      await submitReview(order, rating, body);
      onDone();
    } catch (e) {
      setError((e as Error).message);
    }
    setBusy(false);
  }

  return (
    <View style={[styles.card, { marginTop: 18 }]}>
      <Text style={styles.reviewTitle}>How was {cook}’s meal?</Text>
      <View style={styles.stars}>
        {[1, 2, 3, 4, 5].map((n) => (
          <Pressable key={n} onPress={() => setRating(n)} hitSlop={6} accessibilityLabel={`${n} stars`}>
            <MaterialIcons name={n <= rating ? 'star' : 'star-border'} size={34} color={n <= rating ? colors.amber : colors.muted} />
          </Pressable>
        ))}
      </View>
      <TextInput value={body} onChangeText={setBody} maxLength={500} multiline placeholder="Write a comment for your neighbors…" placeholderTextColor="#9aa39f" style={styles.reviewInput} />
      {error ? <Text style={[formStyles.hint, { color: danger }]}>{error}</Text> : null}
      <PrimaryButton label="Submit review" busy={busy} disabled={!rating} onPress={send} style={{ marginTop: 12 }} />
      <Text style={[formStyles.small, { marginTop: 12 }]} onPress={() => router.back()}>
        <Text style={formStyles.link}>Later</Text>
      </Text>
    </View>
  );
}

function SecondaryButton({ label, onPress, busy }: { label: string; onPress: () => void; busy?: boolean }) {
  return (
    <Pressable onPress={busy ? undefined : onPress} style={styles.secondary} accessibilityRole="button">
      {busy ? <ActivityIndicator color={colors.ink} /> : <Text style={styles.secondaryText}>{label}</Text>}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.paper },
  pad: { paddingHorizontal: 20, paddingBottom: 30 },
  hero: { alignItems: 'center', marginTop: 26, gap: 8 },
  heroIcon: { width: 64, height: 64, borderRadius: 32, alignItems: 'center', justifyContent: 'center' },
  heroTitle: { fontFamily: fonts.serif, fontSize: 30, lineHeight: 34, color: colors.ink, textAlign: 'center' },
  summary: { fontFamily: fonts.bold, fontSize: 13.5, color: colors.ink, textAlign: 'center' },
  heroSub: { fontFamily: fonts.medium, fontSize: 14, color: colors.muted, textAlign: 'center', lineHeight: 20, paddingHorizontal: 10 },
  card: { backgroundColor: colors.white, borderRadius: 16, borderWidth: 1, borderColor: colors.line, padding: 14, marginTop: 16 },
  label: { fontFamily: fonts.extraBold, fontSize: 10.5, letterSpacing: 0.6, color: colors.muted, marginBottom: 6 },
  body: { fontFamily: fonts.semiBold, fontSize: 14, color: colors.ink, lineHeight: 20 },
  handle: { fontFamily: fonts.extraBold, color: colors.teal },
  muted: { flex: 1, fontFamily: fonts.semiBold, fontSize: 12.5, color: colors.muted, lineHeight: 18 },
  lock: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 16 },
  thanks: { textAlign: 'center', marginTop: 20 },
  secondary: { borderWidth: 1.5, borderColor: colors.line, backgroundColor: colors.white, borderRadius: 14, paddingVertical: 14, alignItems: 'center' },
  secondaryText: { fontFamily: fonts.extraBold, fontSize: 15, color: colors.ink },
  reviewTitle: { fontFamily: fonts.extraBold, fontSize: 17, color: colors.ink, textAlign: 'center' },
  stars: { flexDirection: 'row', justifyContent: 'center', gap: 4, marginTop: 10 },
  reviewInput: { fontFamily: fonts.semiBold, fontSize: 14, color: colors.ink, borderWidth: 1, borderColor: colors.line, borderRadius: 12, padding: 12, marginTop: 12, minHeight: 70, textAlignVertical: 'top' },
});
