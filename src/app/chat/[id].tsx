import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Avatar } from '@/components/avatar';
import { formStyles, PrimaryButton } from '@/components/form';
import { colors, fonts } from '@/constants/theme';
import { fetchMessages, fetchOrderWith, fetchPerson, markRead, type Message, onMessageToMe, sendMessage } from '@/lib/chat';
import { fmtAgo, fmtClock } from '@/lib/format';
import { type Order, setPayment } from '@/lib/orders';
import { type Person, personName } from '@/lib/posts';
import { useSession } from '@/lib/session';

// Screen s23: a conversation with one member. When the two have an order going, it sits on top
// with the InstaPay step, so "Payment sent" and "Payment received" happen in the chat (section 13).
const REFRESH_MS = 10_000;

const STATUS_LINE: Record<string, string> = {
  pending: 'Waiting for the cook to accept',
  accepted: 'Accepted · cooking',
  ready: 'Ready for pickup',
  picked_up: 'Picked up',
};

export default function ChatScreen() {
  const { id: partnerId } = useLocalSearchParams<{ id: string }>();
  const { session } = useSession();
  const me = session?.user.id ?? '';
  const [partner, setPartner] = useState<Person | null>(null);
  const [messages, setMessages] = useState<Message[] | null>(null);
  const [order, setOrder] = useState<Order | null>(null);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [paying, setPaying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const list = useRef<FlatList<Message>>(null);

  const load = useCallback(async () => {
    if (!me) return;
    try {
      const [msgs, o] = await Promise.all([fetchMessages(me, partnerId), fetchOrderWith(me, partnerId)]);
      setMessages(msgs);
      setOrder(o);
      setNow(Date.now());
      if (msgs.some((m) => m.recipient_id === me && !m.read_at)) markRead(me, partnerId);
    } catch {
      setMessages((m) => m ?? []);
    }
  }, [me, partnerId]);

  useEffect(() => {
    fetchPerson(partnerId).then(setPartner, () => null);
  }, [partnerId]);

  // Live while open, with a slow refresh as a fallback (and for order changes).
  useFocusEffect(
    useCallback(() => {
      load();
      const t = setInterval(load, REFRESH_MS);
      const off = me
        ? onMessageToMe(me, (m) => {
            if (m.sender_id !== partnerId) return;
            setMessages((list) => (list && !list.some((x) => x.id === m.id) ? [...list, m] : list));
            markRead(me, partnerId);
            if (m.kind !== 'text') load();
          })
        : () => {};
      return () => {
        clearInterval(t);
        off();
      };
    }, [load, me, partnerId]),
  );

  if (!session) return null;
  const name = personName(partner);

  async function onSend() {
    const body = draft.trim();
    if (!body || sending) return;
    setSending(true);
    setError(null);
    try {
      const m = await sendMessage(me, partnerId, body, order?.id ?? null);
      setDraft('');
      setMessages((list) => [...(list ?? []), m]);
    } catch (e) {
      setError((e as Error).message);
    }
    setSending(false);
  }

  async function pay(status: 'sent' | 'received') {
    if (!order) return;
    setPaying(true);
    setError(null);
    try {
      await setPayment(order.id, status);
      await load();
    } catch (e) {
      setError((e as Error).message);
    }
    setPaying(false);
  }

  const shown = [...(messages ?? [])].reverse(); // inverted list: newest at the bottom

  return (
    <SafeAreaView style={styles.screen} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <Pressable hitSlop={12} onPress={() => (router.canGoBack() ? router.back() : router.replace('/inbox'))} accessibilityLabel="Back">
          <MaterialIcons name="arrow-back" size={24} color={colors.ink} />
        </Pressable>
        <Avatar person={partner} size={36} />
        <Text style={styles.name} numberOfLines={1}>{name}</Text>
      </View>

      {order ? <OrderCard order={order} me={me} name={name} paying={paying} onPay={pay} /> : null}

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        {messages === null ? (
          <ActivityIndicator color={colors.teal} style={{ marginTop: 40 }} />
        ) : (
          <FlatList
            ref={list}
            data={shown}
            inverted
            keyExtractor={(m) => m.id}
            contentContainerStyle={styles.list}
            renderItem={({ item }) => <Bubble m={item} mine={item.sender_id === me} now={now} />}
            ListEmptyComponent={
              <Text style={[styles.empty, { transform: [{ scaleY: -1 }] }]}>
                Say hello to {name}. Ask about the dish or agree on pickup here.
              </Text>
            }
          />
        )}
        {error ? <Text style={[formStyles.error, { marginHorizontal: 16 }]}>{error}</Text> : null}
        <View style={styles.composer}>
          <TextInput
            value={draft}
            onChangeText={setDraft}
            placeholder={`Message ${name}…`}
            placeholderTextColor={colors.faint}
            style={styles.input}
            multiline
            maxLength={1000}
            accessibilityLabel={`Message ${name}`}
          />
          <Pressable
            onPress={onSend}
            disabled={!draft.trim() || sending}
            style={[styles.send, (!draft.trim() || sending) && { opacity: 0.45 }]}
            accessibilityRole="button"
            accessibilityLabel="Send">
            {sending ? <ActivityIndicator color={colors.navy} /> : <MaterialIcons name="send" size={20} color={colors.navy} />}
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function Bubble({ m, mine, now }: { m: Message; mine: boolean; now: number }) {
  const at = Date.parse(m.created_at);
  const when = now - at < 24 * 3_600_000 ? fmtClock(at) : `${fmtAgo(at, now)} · ${fmtClock(at)}`;
  if (m.kind !== 'text') {
    return (
      <View style={styles.payLine}>
        <MaterialIcons name={m.kind === 'payment_received' ? 'check-circle' : 'payments'} size={16} color={colors.navy} />
        <Text style={styles.payText}>
          {mine ? 'You: ' : ''}
          {m.body}
        </Text>
        <Text style={styles.payTime}>{when}</Text>
      </View>
    );
  }
  return (
    <View style={[styles.bubbleRow, mine && { alignItems: 'flex-end' }]}>
      <View style={[styles.bubble, mine ? styles.mine : styles.theirs]}>
        <Text style={styles.body}>{m.body}</Text>
      </View>
      <Text style={styles.time}>{when}</Text>
    </View>
  );
}

function OrderCard({ order, me, name, paying, onPay }: { order: Order; me: string; name: string; paying: boolean; onPay: (s: 'sent' | 'received') => void }) {
  const isCook = order.cook_id === me;
  const total = Number(order.post?.price_egp ?? 0) * order.plates;
  const canPay = ['accepted', 'ready', 'picked_up'].includes(order.status);
  const payLine = !canPay
    ? 'Pay by InstaPay once the order is accepted'
    : order.payment_status === 'received'
      ? 'Payment received'
      : order.payment_status === 'sent'
        ? isCook
          ? `${name} says the payment is sent. Check your InstaPay.`
          : `Waiting for ${name} to confirm the payment`
        : isCook
          ? `Waiting for ${name} to pay by InstaPay`
          : `Send EGP ${total} to ${name} by InstaPay`;

  return (
    <View style={styles.order}>
      <Pressable style={styles.orderTop} onPress={() => router.push({ pathname: '/order/[id]', params: { id: order.id } })} accessibilityRole="button">
        <View style={{ flex: 1 }}>
          <Text style={styles.orderTitle} numberOfLines={1}>
            {order.plates} × {order.post?.dish_name ?? 'Dish'} · EGP {total}
          </Text>
          <Text style={styles.orderSub}>
            {STATUS_LINE[order.status]} · {payLine}
          </Text>
        </View>
        <MaterialIcons name="chevron-right" size={22} color={colors.muted} />
      </Pressable>
      {canPay && !isCook && order.payment_status === 'none' ? (
        <PrimaryButton label="Payment sent" busy={paying} onPress={() => onPay('sent')} style={styles.orderBtn} />
      ) : null}
      {canPay && isCook && order.payment_status === 'sent' ? (
        <PrimaryButton label="Payment received" busy={paying} onPress={() => onPay('received')} style={styles.orderBtn} />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.paper },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.line },
  name: { flex: 1, fontFamily: fonts.extraBold, fontSize: 17, color: colors.ink },
  order: { margin: 12, marginBottom: 0, borderRadius: 16, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.white, padding: 12 },
  orderTop: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  orderTitle: { fontFamily: fonts.extraBold, fontSize: 14.5, color: colors.ink },
  orderSub: { fontFamily: fonts.semiBold, fontSize: 12.5, color: colors.muted, marginTop: 3, lineHeight: 17 },
  orderBtn: { marginTop: 10, paddingVertical: 11 },
  list: { padding: 16, gap: 10, flexGrow: 1 },
  empty: { fontFamily: fonts.semiBold, fontSize: 14, color: colors.muted, textAlign: 'center', marginTop: 30, paddingHorizontal: 20, lineHeight: 20 },
  bubbleRow: { alignItems: 'flex-start' },
  bubble: { maxWidth: '80%', borderRadius: 18, paddingHorizontal: 14, paddingVertical: 9 },
  mine: { backgroundColor: colors.teal, borderBottomRightRadius: 6 },
  theirs: { backgroundColor: colors.white, borderWidth: 1, borderColor: colors.line, borderBottomLeftRadius: 6 },
  body: { fontFamily: fonts.medium, fontSize: 15, lineHeight: 21, color: colors.navy },
  time: { fontFamily: fonts.semiBold, fontSize: 10.5, color: colors.muted, marginTop: 3, marginHorizontal: 4 },
  payLine: { alignSelf: 'center', flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: colors.yellow, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6, maxWidth: '92%' },
  payText: { fontFamily: fonts.bold, fontSize: 12.5, color: colors.navy },
  payTime: { fontFamily: fonts.semiBold, fontSize: 10.5, color: colors.navy },
  composer: { flexDirection: 'row', alignItems: 'flex-end', gap: 10, paddingHorizontal: 12, paddingTop: 8, paddingBottom: 10, borderTopWidth: 1, borderTopColor: colors.line, backgroundColor: colors.white },
  input: { flex: 1, maxHeight: 120, fontFamily: fonts.medium, fontSize: 15, color: colors.ink, backgroundColor: colors.paper, borderWidth: 1, borderColor: colors.line, borderRadius: 20, paddingHorizontal: 14, paddingTop: 10, paddingBottom: 10 },
  send: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.teal, alignItems: 'center', justifyContent: 'center' },
});
