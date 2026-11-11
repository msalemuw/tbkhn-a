import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { router } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { FlipIcon } from '@/components/flip-icon';
import { Text } from '@/components/text';
import { colors, fonts } from '@/constants/theme';
import { fmtClock } from '@/lib/format';
import { useLive } from '@/lib/live';
import { ACTIVE, fetchOrders, type Order, type OrderStatus } from '@/lib/orders';
import { personName } from '@/lib/posts';
import { useSession } from '@/lib/session';

const STATUS: Partial<Record<OrderStatus, string>> = { pending: 'Waiting', accepted: 'Cooking', ready: 'Ready' };

/** Like Talabat's "your order" strip: when you have an order in progress, one tap from Home or Menu opens it. Nothing shows otherwise. */
export function ActiveOrderBanner() {
  const { session } = useSession();
  const me = session?.user.id;
  const [orders, setOrders] = useState<Order[]>([]);
  const load = useCallback(() => {
    if (!me) return setOrders([]);
    fetchOrders('buyer', me).then((l) => setOrders(l.filter((o) => ACTIVE.includes(o.status))), () => {});
  }, [me]);
  useLive(load);

  if (!orders.length) return null;
  const one = orders.length === 1 ? orders[0] : null;
  const first = orders[0];
  const title = one ? `Your order from ${personName(one.cook)}` : `${orders.length} orders in progress`;
  const sub = one ? [STATUS[one.status], one.status === 'ready' ? null : one.pickup_at ? `Pickup ${fmtClock(Date.parse(one.pickup_at))}` : null].filter(Boolean).join(' · ') : 'Tap to see them';
  const ready = first.status === 'ready';
  return (
    <Pressable
      style={styles.banner}
      onPress={() => (one ? router.push({ pathname: '/order/[id]', params: { id: one.id } }) : router.push('/orders'))}
      accessibilityRole="button"
      accessibilityLabel={`${title}. ${sub}`}>
      <View style={[styles.icon, { backgroundColor: ready && one ? colors.teal : colors.yellow }]}>
        <MaterialIcons name={ready && one ? 'restaurant' : 'hourglass-top'} size={20} color={colors.navy} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.title} numberOfLines={1}>{title}</Text>
        <Text style={styles.sub} numberOfLines={1}>{sub}</Text>
      </View>
      <FlipIcon name="chevron-right" size={22} color={colors.muted} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  banner: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.white, borderRadius: 16, borderWidth: 1, borderColor: colors.line, paddingVertical: 10, paddingHorizontal: 12, marginHorizontal: 14, marginTop: 10, marginBottom: 6 },
  icon: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  title: { fontFamily: fonts.extraBold, fontSize: 14.5, color: colors.ink },
  sub: { fontFamily: fonts.semiBold, fontSize: 12.5, color: colors.muted },
});
