import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { type ComponentProps, useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Text, TextInput } from '@/components/text';
import { Alert } from '@/lib/alert';
import { BackHeader, formStyles, PrimaryButton } from '@/components/form';
import { colors, fonts } from '@/constants/theme';
import { OrderProgress } from '@/components/order-progress';
import { canCopy, copyText } from '@/lib/copy-text';
import { fmtClock, fmtIn } from '@/lib/format';
import { confirmPickup, fetchCookInstapay, fetchOrder, fetchPaymentInfo, type Order, type OrderStatus, type PaymentInfo, reportProblem, setOrderStatus, setPayment, submitPayment, submitReview } from '@/lib/orders';
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
  const [copied, setCopied] = useState(false);
  const [payInfo, setPayInfo] = useState<PaymentInfo | null>(null);
  const [reference, setReference] = useState('');
  const [code, setCode] = useState('');
  const [now, setNow] = useState(() => Date.now());

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
  const throughApp = order?.pay_through_app === true;
  const payment = order?.payment_status;
  const iAmBuyer = !!order && session?.user.id === order.buyer_id;
  useEffect(() => {
    if (!throughApp && (status === 'accepted' || status === 'ready' || status === 'picked_up')) fetchCookInstapay(id).then(setInstapay);
  }, [id, status, throughApp]);
  // Orders paid to tabkheen A: where to pay and, once paid, the pickup code (only the eater can read it).
  useEffect(() => {
    if (throughApp && iAmBuyer && (status === 'accepted' || status === 'ready' || status === 'picked_up')) fetchPaymentInfo(id).then(setPayInfo);
  }, [id, status, payment, throughApp, iAmBuyer]);
  // Keeps the "pay within" countdown moving.
  useEffect(() => {
    if (!throughApp || status !== 'accepted' || payment !== 'none') return;
    const t = setInterval(() => setNow(Date.now()), 20_000);
    return () => clearInterval(t);
  }, [throughApp, status, payment]);

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
  // The exact pickup spot is only shared once the cook has accepted (the cook always sees their own).
  const spotOpen = isCook || ['accepted', 'ready', 'picked_up'].includes(o.status);
  const spot = o.post?.pickup_point ?? null;
  const summary = `${o.plates} × ${dish} · EGP ${total}${pickup ? ` · Pickup ${pickup}` : ''}${spot && spotOpen ? `, ${spot.label}` : ''}`;

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
    const paid = o.pay_through_app && o.payment_status === 'received';
    Alert.alert('Cancel this order?', paid ? 'You already paid. tabkheen A will refund you.' : o.status === 'accepted' ? `${cookFirst} may already be cooking. Cancel only if you can’t collect it.` : `${cookFirst} hasn’t confirmed, so nothing is owed.`, [
      { text: 'Keep order', style: 'cancel' },
      { text: 'Cancel order', style: 'destructive', onPress: () => move('cancelled') },
    ]);
  }

  const minsLeft = o.pay_by ? Math.max(0, Math.ceil((Date.parse(o.pay_by) - now) / 60000)) : 20;
  const head = (o.pay_through_app && paidHeadline(o, isCook, { cook: cookFirst, buyer }, minsLeft)) || headline(o.status, isCook, { cook: cookFirst, buyer, by: o.answer_by ? fmtClock(Date.parse(o.answer_by)) : '' }, o.cancel_reason);

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

        <OrderProgress status={o.status} />

        {o.pickup_at && ['pending', 'accepted', 'ready'].includes(o.status) ? (
          <View style={[styles.card, styles.timeCard]}>
            <View style={{ flex: 1 }}>
              <Text style={styles.label}>PICKUP TIME</Text>
              <Text style={styles.timeBig}>{o.status === 'ready' ? 'Ready now' : pickup}</Text>
            </View>
            {o.status !== 'ready' ? <Text style={styles.timeIn}>{fmtIn(Date.parse(o.pickup_at))}</Text> : null}
          </View>
        ) : null}

        {o.note ? (
          <View style={styles.card}>
            <Text style={styles.label}>NOTE FROM {isCook ? buyer.toUpperCase() : 'YOU'}</Text>
            <Text verbatim style={styles.body}>{o.note}</Text>
          </View>
        ) : null}

        {spot && ['pending', 'accepted', 'ready'].includes(o.status) ? (
          <View style={styles.card}>
            <Text style={styles.label}>PICKUP SPOT</Text>
            {spotOpen ? (
              <Pressable
                onPress={() => router.push({ pathname: '/pickup-map', params: { lat: String(spot.lat), lng: String(spot.lng), label: spot.label } })}
                accessibilityRole="button"
                accessibilityLabel="Show the pickup spot on the map"
                style={styles.spotRow}>
                <MaterialIcons name="location-on" size={20} color={colors.teal} />
                <Text style={[styles.body, { flex: 1 }]}>{spot.label}</Text>
                <Text style={styles.spotLink}>Map</Text>
              </Pressable>
            ) : (
              <View style={styles.spotRow}>
                <MaterialIcons name="lock-outline" size={20} color={colors.teal} />
                <Text style={[styles.body, { flex: 1 }]}>{`The exact pickup spot is shared once ${cookFirst} accepts.`}</Text>
              </View>
            )}
          </View>
        ) : null}

        {/* Orders paid to tabkheen A: pay, wait for confirmation, then the pickup code. */}
        {o.pay_through_app && ['accepted', 'ready', 'picked_up'].includes(o.status) ? (
          <View style={styles.card}>
            <Text style={styles.label}>PAYMENT · INSTAPAY</Text>
            {isCook ? (
              <Text style={styles.body}>
                {o.payment_status === 'received' ? 'tabkheen A confirmed the payment. You can cook this order.' : o.payment_status === 'sent' ? `${buyer} paid. tabkheen A is checking it. You’ll be told when you can start.` : `Waiting for ${buyer} to pay. Start cooking once the payment is confirmed.`}
              </Text>
            ) : o.payment_status === 'none' && o.status === 'accepted' ? (
              <>
                <Text style={styles.body}>{`Send EGP ${total} to tabkheen A’s InstaPay:`}</Text>
                <Text selectable verbatim style={[styles.handle, { fontSize: 17, marginTop: 4 }]}>{payInfo?.instapay ?? '…'}</Text>
                {payInfo?.instapay && canCopy() ? (
                  <Pressable
                    style={styles.copy}
                    onPress={() => copyText(payInfo.instapay!).then((ok) => { if (ok) { setCopied(true); setTimeout(() => setCopied(false), 2000); } })}
                    accessibilityRole="button"
                    accessibilityLabel="Copy the InstaPay address">
                    <MaterialIcons name={copied ? 'check' : 'content-copy'} size={16} color={colors.navy} />
                    <Text style={styles.copyText}>{copied ? 'Copied' : 'Copy InstaPay address'}</Text>
                  </Pressable>
                ) : null}
                <Text style={[styles.muted, { marginTop: 8 }]}>
                  {minsLeft > 0 ? `Pay within ${minsLeft} minute${minsLeft === 1 ? '' : 's'} or the order is cancelled. Then enter the reference number InstaPay gives you.` : 'Time is up. If you already paid, enter the reference now and tabkheen A will check it.'}
                </Text>
                <TextInput value={reference} onChangeText={setReference} maxLength={80} placeholder="InstaPay reference number" placeholderTextColor={colors.faint} autoCapitalize="characters" style={styles.refInput} />
                <PrimaryButton label="I have paid" busy={busy === 'paid'} disabled={reference.trim().length < 3} onPress={() => run('paid', () => submitPayment(o.id, reference.trim()))} style={{ marginTop: 12 }} />
              </>
            ) : o.payment_status === 'sent' ? (
              <Text style={styles.body}>{`tabkheen A is checking your payment${o.payment_reference ? ` (reference ${o.payment_reference})` : ''}. This usually takes a few minutes. You’ll be told when it’s confirmed.`}</Text>
            ) : (
              <>
                <Text style={styles.body}>Payment confirmed. Thank you!</Text>
                {payInfo?.pickup_code && o.status !== 'picked_up' ? (
                  <View style={styles.codeBox}>
                    <Text style={styles.label}>YOUR PICKUP CODE</Text>
                    <Text style={styles.codeBig} accessibilityLabel={`Pickup code ${payInfo.pickup_code.split('').join(' ')}`}>{payInfo.pickup_code}</Text>
                    <Text style={styles.muted}>{`Tell ${cookFirst} this code when you collect your order.`}</Text>
                  </View>
                ) : null}
              </>
            )}
          </View>
        ) : null}

        {/* InstaPay, person to person, once the cook has accepted (section 13), for orders placed before payments moved to tabkheen A. */}
        {!o.pay_through_app && ['accepted', 'ready', 'picked_up'].includes(o.status) ? (
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
                {instapay && canCopy() ? (
                  <Pressable
                    style={styles.copy}
                    onPress={() => copyText(instapay).then((ok) => { if (ok) { setCopied(true); setTimeout(() => setCopied(false), 2000); } })}
                    accessibilityRole="button"
                    accessibilityLabel="Copy the InstaPay address">
                    <MaterialIcons name={copied ? 'check' : 'content-copy'} size={16} color={colors.navy} />
                    <Text style={styles.copyText}>{copied ? 'Copied' : 'Copy InstaPay address'}</Text>
                  </Pressable>
                ) : null}
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

        {!isCook && o.status === 'ready' ? (
          <View style={styles.lock}>
            <MaterialIcons name="lock" size={16} color={colors.muted} />
            <Text style={styles.muted}>Cancellation is closed once the order is ready. If something changed, contact {cookFirst}.</Text>
          </View>
        ) : null}

        {error ? <Text style={formStyles.error}>{error}</Text> : null}

        <View style={{ gap: 10, marginTop: 18 }}>
          {isCook && o.status === 'pending' ? (
            <>
              <PrimaryButton label="Accept order" busy={busy === 'accepted'} onPress={() => move('accepted')} />
              <SecondaryButton label="Decline" busy={busy === 'declined'} onPress={() => move('declined')} />
            </>
          ) : null}
          {isCook && o.status === 'accepted' ? <PrimaryButton label="Mark as ready" busy={busy === 'ready'} disabled={o.pay_through_app && o.payment_status !== 'received'} onPress={() => move('ready')} /> : null}
          {isCook && o.status === 'ready' && !o.pay_through_app ? <PrimaryButton label="Picked up" busy={busy === 'picked_up'} onPress={() => move('picked_up')} /> : null}
          {isCook && o.status === 'ready' && o.pay_through_app ? (
            <View style={styles.card}>
              <Text style={styles.label}>PICKUP CODE</Text>
              <Text style={styles.body}>{`Ask ${buyer} for the 4-digit code in their app, then enter it here.`}</Text>
              <TextInput value={code} onChangeText={(t) => setCode(t.replace(/\D/g, '').slice(0, 4))} keyboardType="number-pad" maxLength={4} placeholder="0000" placeholderTextColor={colors.faint} style={[styles.refInput, styles.codeInput]} />
              <PrimaryButton
                label="Confirm pickup"
                busy={busy === 'picked_up'}
                disabled={code.length !== 4}
                style={{ marginTop: 12 }}
                onPress={() =>
                  run('picked_up', async () => {
                    const r = await confirmPickup(o.id, code);
                    if (r === 'wrong') throw new Error(`That code isn’t right. Check it with ${buyer}.`);
                    if (r === 'locked') throw new Error('Too many wrong codes. Contact tabkheen A support and we’ll sort it out.');
                    setCode('');
                  })
                }
              />
            </View>
          ) : null}
          {!isCook && (o.status === 'pending' || o.status === 'accepted') ? <SecondaryButton label="Cancel order" busy={busy === 'cancelled'} onPress={confirmCancel} /> : null}
          {!isCook && (o.status === 'declined' || o.status === 'cancelled' || o.status === 'not_picked_up') ? <PrimaryButton label="See today’s menu" onPress={() => router.replace('/menu')} /> : null}
          <SecondaryButton
            label={`Message ${isCook ? buyer : cookFirst}`}
            onPress={() => router.push({ pathname: '/chat/[id]', params: { id: isCook ? o.buyer_id : o.cook_id } })}
          />
        </View>

        {!isCook && o.status === 'picked_up' && o.pay_through_app ? <ProblemBox order={o} now={now} onDone={load} /> : null}

        {!isCook && o.status === 'picked_up' ? (o.review.length ? <Text style={[styles.muted, styles.thanks]}>Thanks for your review!</Text> : <ReviewBox order={o} cook={cookFirst} onDone={load} />) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

/** Headlines for orders paid to tabkheen A, where the payment step comes first. Null leaves the usual wording. */
function paidHeadline(o: Order, isCook: boolean, n: { cook: string; buyer: string }, minsLeft: number): { title: string; sub?: string; icon: IconName; bg: string; fg: string } | null {
  const wait = { icon: 'hourglass-top' as IconName, bg: colors.yellow, fg: colors.navy };
  const good = { icon: 'check' as IconName, bg: colors.teal, fg: colors.navy };
  const off = { icon: 'close' as IconName, bg: colors.navy, fg: colors.white };
  if (o.status === 'accepted') {
    if (o.payment_status === 'none') {
      return isCook
        ? { ...wait, title: `Waiting for ${n.buyer} to pay`, sub: `${n.buyer} has 20 minutes to pay. Start cooking once the payment is confirmed.` }
        : { ...wait, title: 'Pay to confirm your order', sub: `${n.cook} accepted. Pay within ${minsLeft} minute${minsLeft === 1 ? '' : 's'} or the order is cancelled.` };
    }
    if (o.payment_status === 'sent') {
      return isCook
        ? { ...wait, title: 'Payment is being checked', sub: 'tabkheen A is checking the payment. You’ll be told when you can start.' }
        : { ...wait, title: 'Checking your payment', sub: 'tabkheen A is confirming it. This usually takes a few minutes.' };
    }
    return isCook
      ? { ...good, title: 'Payment confirmed', sub: `You can cook this order. Tap Mark as ready when it’s done, and ${n.buyer} is told right away.` }
      : { ...good, title: 'Payment confirmed', sub: `${n.cook} is preparing your order. You’ll be told when it’s ready.` };
  }
  if (o.status === 'cancelled' && o.cancel_reason?.startsWith('No payment')) {
    return isCook
      ? { ...off, title: 'Cancelled: not paid', sub: `${n.buyer} didn’t pay in time. The plates went back on your menu.` }
      : { ...off, title: 'Payment time ran out', sub: 'The order was cancelled and nothing was charged. Try another dish.' };
  }
  return null;
}

/** After pickup the eater has 12 hours to report a problem; the cook's payout for the order is held while staff look. */
function ProblemBox({ order, now, onDone }: { order: Order; now: number; onDone: () => void }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pickedAt = Date.parse(order.picked_up_at ?? order.updated_at);
  if (now - pickedAt > 12 * 3600_000) return null;
  if (sent) return <Text style={[styles.muted, styles.thanks]}>Thanks. We’ll look into it and get back to you.</Text>;
  async function send() {
    setBusy(true);
    setError(null);
    try {
      await reportProblem(order.id, text.trim());
      setSent(true);
      onDone();
    } catch (e) {
      setError((e as Error).message);
    }
    setBusy(false);
  }
  return (
    <View style={styles.card}>
      {open ? (
        <>
          <Text style={styles.label}>WHAT WENT WRONG?</Text>
          <TextInput value={text} onChangeText={setText} maxLength={500} multiline placeholder="Tell us what happened" placeholderTextColor={colors.faint} style={styles.reviewInput} />
          {error ? <Text style={formStyles.error}>{error}</Text> : null}
          <PrimaryButton label="Send report" busy={busy} disabled={text.trim().length < 3} onPress={send} style={{ marginTop: 12 }} />
        </>
      ) : (
        <Pressable onPress={() => setOpen(true)} accessibilityRole="button" style={styles.spotRow}>
          <MaterialIcons name="report-problem" size={20} color={colors.muted} />
          <Text style={[styles.body, { flex: 1 }]}>Something wrong with your order? Report a problem (within 12 hours of pickup).</Text>
        </Pressable>
      )}
    </View>
  );
}

function headline(status: OrderStatus, isCook: boolean, n: { cook: string; buyer: string; by?: string }, reason: string | null = null): { title: string; sub?: string; icon: IconName; bg: string; fg: string } {
  const wait = { icon: 'hourglass-top' as IconName, bg: colors.yellow, fg: colors.navy };
  const good = { icon: 'check' as IconName, bg: colors.teal, fg: colors.navy };
  const ready = { icon: 'restaurant' as IconName, bg: colors.teal, fg: colors.navy };
  const off = { icon: 'close' as IconName, bg: colors.navy, fg: colors.white };
  if (isCook) {
    switch (status) {
      case 'pending': return { ...wait, title: `New order from ${n.buyer}`, sub: `Accept it if you can cook it in time. They can still cancel until you mark it ready. With no answer by ${n.by || 'the deadline'} it cancels itself.` };
      case 'accepted': return { ...good, title: 'You accepted this order', sub: `Tap Mark as ready when it’s done, and ${n.buyer} is told right away.` };
      case 'ready': return { ...ready, title: 'Ready for pickup', sub: `Tap Picked up when ${n.buyer} collects it.` };
      case 'picked_up': return { ...good, title: 'Picked up', sub: 'Order complete.' };
      case 'declined': return { ...off, title: 'You declined this order', sub: 'The plates went back on your menu.' };
      case 'not_picked_up': return { ...off, title: 'Not picked up', sub: `${n.buyer} didn’t collect it within 24 hours, so the order was closed.` };
      case 'cancelled': if (reason?.startsWith('No answer')) return { ...off, title: 'This order timed out', sub: 'You didn’t answer in time. The plates went back on your menu.' };
        return { ...off, title: `${n.buyer} cancelled`, sub: 'The plates went back on your menu.' };
    }
  }
  switch (status) {
    case 'pending': return { ...wait, title: `Waiting for ${n.cook} to confirm`, sub: `You can cancel for free until ${n.cook} confirms. If there’s no answer by ${n.by || 'the deadline'} it cancels itself.` };
    case 'accepted': return { ...good, title: `Order confirmed by ${n.cook}`, sub: 'Preparing. You’ll be told when it’s ready.' };
    case 'ready': return { ...ready, title: 'Your order is ready', sub: `${n.cook} just finished cooking. Hot and ready for your family’s table.` };
    case 'picked_up': return { ...good, title: 'Enjoy your meal' };
    case 'declined': return { ...off, title: `${n.cook} couldn’t take this order`, sub: 'Nothing is owed. Try another dish from today’s menu.' };
    case 'not_picked_up': return { ...off, title: 'Order closed', sub: 'It wasn’t picked up within 24 hours of the pickup time.' };
    case 'cancelled': if (reason?.startsWith('No answer')) return { ...off, title: `${n.cook} didn’t answer in time`, sub: 'The order was cancelled and nothing is owed. Try another dish.' };
      return { ...off, title: 'You cancelled this order', sub: 'Nothing is owed.' };
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
            <MaterialIcons name={n <= rating ? 'star' : 'star-border'} size={34} color={n <= rating ? colors.yellow : colors.muted} />
          </Pressable>
        ))}
      </View>
      <TextInput value={body} onChangeText={setBody} maxLength={500} multiline placeholder="Write a comment for your neighbors…" placeholderTextColor={colors.faint} style={styles.reviewInput} />
      {error ? <Text style={formStyles.error}>{error}</Text> : null}
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
  timeCard: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 22 },
  timeBig: { fontFamily: fonts.serif, fontSize: 32, lineHeight: 36, color: colors.ink },
  timeIn: { fontFamily: fonts.extraBold, fontSize: 14, color: colors.teal },
  body: { fontFamily: fonts.semiBold, fontSize: 14, color: colors.ink, lineHeight: 20 },
  copy: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', backgroundColor: colors.lightBlue, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 8, marginTop: 10 },
  copyText: { fontFamily: fonts.extraBold, fontSize: 13, color: colors.navy },
  handle: { fontFamily: fonts.extraBold, color: colors.ink },
  spotRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  refInput: { fontFamily: fonts.semiBold, fontSize: 15, color: colors.ink, borderWidth: 1, borderColor: colors.line, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 11, marginTop: 12 },
  codeInput: { fontFamily: fonts.extraBold, fontSize: 28, letterSpacing: 8, textAlign: 'center' },
  codeBox: { alignItems: 'center', backgroundColor: colors.lightBlue, borderRadius: 14, padding: 14, marginTop: 12, gap: 4 },
  codeBig: { fontFamily: fonts.serif, fontSize: 44, lineHeight: 50, letterSpacing: 10, color: colors.ink },
  spotLink: { fontFamily: fonts.extraBold, fontSize: 14, color: colors.teal },
  muted: { flex: 1, fontFamily: fonts.semiBold, fontSize: 12.5, color: colors.muted, lineHeight: 18 },
  lock: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 16 },
  thanks: { textAlign: 'center', marginTop: 20 },
  secondary: { borderWidth: 1.5, borderColor: colors.line, backgroundColor: colors.white, borderRadius: 14, paddingVertical: 14, alignItems: 'center' },
  secondaryText: { fontFamily: fonts.extraBold, fontSize: 15, color: colors.ink },
  reviewTitle: { fontFamily: fonts.extraBold, fontSize: 17, color: colors.ink, textAlign: 'center' },
  stars: { flexDirection: 'row', justifyContent: 'center', gap: 4, marginTop: 10 },
  reviewInput: { fontFamily: fonts.semiBold, fontSize: 14, color: colors.ink, borderWidth: 1, borderColor: colors.line, borderRadius: 12, padding: 12, marginTop: 12, minHeight: 70, textAlignVertical: 'top' },
});
