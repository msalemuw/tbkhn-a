import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, TextInput, View } from 'react-native';

import { AdminScreen, adminStyles, Card, ErrorLine } from '@/components/admin-ui';
import { Chip } from '@/components/chip';
import { Field, formStyles } from '@/components/form';
import { colors, fonts } from '@/constants/theme';
import { type AdminOrder, fetchOrderTimeline, findOrders, ORDER_EVENT_LABEL, orderCode, type OrderEvent, type OrderState } from '@/lib/admin';
import { fmtAgo, fmtClock } from '@/lib/format';

// Read-only order viewer for support: find an order, then see each step with who did it and why.
const STATES: { label: string; value: OrderState | null }[] = [
  { label: 'All', value: null },
  { label: 'Open', value: 'open' },
  { label: 'Picked up', value: 'done' },
  { label: 'Cancelled', value: 'cancelled' },
];

const STATUS_LABEL: Record<AdminOrder['status'], string> = {
  pending: 'WAITING FOR COOK',
  accepted: 'ACCEPTED',
  ready: 'READY',
  picked_up: 'PICKED UP',
  declined: 'DECLINED',
  cancelled: 'CANCELLED',
};

const PAYMENT_LABEL: Record<AdminOrder['payment_status'], string> = {
  none: 'No InstaPay marked yet',
  sent: 'Buyer marked InstaPay sent',
  received: 'Cook marked InstaPay received',
};

const when = (iso: string) => {
  const at = Date.parse(iso);
  return `${fmtAgo(at)}, ${fmtClock(at)}`;
};

const who = (username: string | null, name: string | null) => (username ? `@${username}` : name ?? 'No name yet');

export default function Orders() {
  const [query, setQuery] = useState('');
  const [state, setState] = useState<OrderState | null>(null);
  const [items, setItems] = useState<AdminOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<{ id: string; events: OrderEvent[] | null } | null>(null);

  const load = useCallback(async (q: string, s: OrderState | null) => {
    setLoading(true);
    try {
      setItems(await findOrders(q.trim(), s));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load');
    }
    setLoading(false);
  }, []);

  useFocusEffect(
    useCallback(() => {
      load(query, state);
      // Reload on focus only; searching and the filter chips load on their own.
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [load]),
  );

  const pickState = (s: OrderState | null) => {
    setState(s);
    load(query, s);
  };

  const toggle = async (id: string) => {
    if (open?.id === id) return setOpen(null);
    setOpen({ id, events: null });
    try {
      const events = await fetchOrderTimeline(id);
      setOpen((o) => (o?.id === id ? { id, events } : o));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load the order history');
    }
  };

  return (
    <AdminScreen title="Orders">
      <View style={styles.top}>
        <Field label="BUYER, COOK, DISH OR ORDER CODE">
          <TextInput
            value={query}
            onChangeText={setQuery}
            onSubmitEditing={() => load(query, state)}
            returnKeyType="search"
            autoCapitalize="none"
            autoCorrect={false}
            style={formStyles.input}
          />
        </Field>
        <View style={styles.chips}>
          {STATES.map((s) => (
            <Chip key={s.label} label={s.label} on={state === s.value} onPress={() => pickState(s.value)} />
          ))}
        </View>
        <ErrorLine text={error} />
      </View>
      <FlatList
        data={items}
        keyExtractor={(o) => o.id}
        contentContainerStyle={adminStyles.list}
        keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={loading} onRefresh={() => load(query, state)} tintColor={colors.teal} />}
        ListEmptyComponent={loading ? null : <Text style={adminStyles.empty}>No orders match.</Text>}
        renderItem={({ item }) => {
          const total = item.price_egp !== null ? ` · ${Number(item.price_egp) * item.plates} EGP` : '';
          const expanded = open?.id === item.id;
          return (
            <Pressable onPress={() => toggle(item.id)} accessibilityRole="button" accessibilityState={{ expanded }}>
              <Card>
                <View style={styles.head}>
                  <Text style={[adminStyles.title, { flex: 1 }]}>
                    {item.dish_name ?? 'Dish'} × {item.plates}
                    {total}
                  </Text>
                  <Text style={adminStyles.tag}>{STATUS_LABEL[item.status]}</Text>
                </View>
                <Text style={adminStyles.body}>
                  {who(item.buyer_username, item.buyer_name)} ordered from {who(item.cook_username, item.cook_name)}
                </Text>
                <Text style={adminStyles.muted}>
                  Order {orderCode(item.id)} · {when(item.created_at)}
                  {item.community_name ? ` · ${item.community_name}` : ''}
                </Text>
                {item.pickup_at ? <Text style={adminStyles.muted}>Pickup {fmtClock(Date.parse(item.pickup_at))}</Text> : null}
                <Text style={adminStyles.muted}>{PAYMENT_LABEL[item.payment_status]}</Text>
                {item.note ? <Text style={adminStyles.body}>Note: “{item.note}”</Text> : null}
                {item.cancel_reason ? <Text style={adminStyles.body}>Reason: “{item.cancel_reason}”</Text> : null}
                {expanded ? <Timeline events={open.events} /> : <Text style={styles.more}>Show history</Text>}
              </Card>
            </Pressable>
          );
        }}
      />
    </AdminScreen>
  );
}

function Timeline({ events }: { events: OrderEvent[] | null }) {
  if (!events) return <Text style={styles.more}>Loading history…</Text>;
  return (
    <View style={styles.timeline}>
      {events.map((e, i) => (
        <View key={i} style={styles.step}>
          <View style={styles.dot} />
          <View style={{ flex: 1 }}>
            <Text style={styles.stepTitle}>{ORDER_EVENT_LABEL[e.event] ?? e.event}</Text>
            <Text style={adminStyles.muted}>
              {when(e.created_at)}
              {e.actor_username || e.actor_name ? ` · ${who(e.actor_username, e.actor_name)}` : ''}
            </Text>
            {e.note ? <Text style={adminStyles.body}>“{e.note}”</Text> : null}
          </View>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  top: { paddingHorizontal: 22, paddingBottom: 12 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 },
  head: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginBottom: 4 },
  more: { fontFamily: fonts.extraBold, fontSize: 13, color: colors.teal, marginTop: 10 },
  timeline: { marginTop: 12, paddingTop: 10, borderTopWidth: 1, borderTopColor: colors.line, gap: 10 },
  step: { flexDirection: 'row', gap: 10 },
  dot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.teal, marginTop: 5 },
  stepTitle: { fontFamily: fonts.bold, fontSize: 14, color: colors.ink },
});
