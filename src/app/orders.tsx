import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, RefreshControl, SectionList, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BackHeader } from '@/components/form';
import { colors, fonts } from '@/constants/theme';
import { fmtAgo, fmtClock } from '@/lib/format';
import { ACTIVE, fetchOrders, type Order, type OrderStatus } from '@/lib/orders';
import { personName } from '@/lib/posts';
import { useSession } from '@/lib/session';

// Flow 16, screen s45: active and past orders. Cooks also see orders placed with them.
type Tab = 'buyer' | 'cook';

const BADGE: Record<OrderStatus, { label: string; bg: string; fg: string }> = {
  pending: { label: 'WAITING', bg: colors.cream, fg: colors.amber },
  accepted: { label: 'COOKING', bg: colors.tealSoft, fg: colors.teal },
  ready: { label: 'READY', bg: colors.teal, fg: colors.white },
  picked_up: { label: 'PICKED UP', bg: colors.line, fg: colors.muted },
  declined: { label: 'DECLINED', bg: colors.coralSoft, fg: colors.coral },
  cancelled: { label: 'CANCELLED', bg: colors.coralSoft, fg: colors.coral },
};

function line(o: Order, tab: Tab): string {
  const who = tab === 'buyer' ? personName(o.cook) : personName(o.buyer);
  const when = o.pickup_at ? `Pickup ${fmtClock(Date.parse(o.pickup_at))}` : '';
  return [who, `${o.plates} ${o.plates === 1 ? 'plate' : 'plates'}`, when].filter(Boolean).join(' · ');
}

export default function Orders() {
  const params = useLocalSearchParams<{ tab?: Tab }>();
  const { session } = useSession();
  const [tab, setTab] = useState<Tab>(params.tab === 'cook' ? 'cook' : 'buyer');
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!session) return;
    setLoading(true);
    try {
      setOrders(await fetchOrders(tab, session.user.id));
    } catch {
      setOrders([]);
    }
    setLoading(false);
  }, [session, tab]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const active = orders.filter((o) => ACTIVE.includes(o.status));
  const past = orders.filter((o) => !ACTIVE.includes(o.status));
  const sections = [
    { title: 'ACTIVE ORDERS', data: active },
    { title: 'PAST ORDERS', data: past },
  ].filter((s) => s.data.length);

  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.pad}>
        <BackHeader title="Orders" />
        <View style={styles.tabs}>
          {(['buyer', 'cook'] as const).map((t) => (
            <Pressable key={t} onPress={() => setTab(t)} style={[styles.tab, tab === t && styles.tabOn]} accessibilityRole="tab" accessibilityState={{ selected: tab === t }}>
              <Text style={[styles.tabText, tab === t && styles.tabTextOn]}>{t === 'buyer' ? 'My orders' : 'Orders for you'}</Text>
            </Pressable>
          ))}
        </View>
      </View>
      <SectionList
        sections={sections}
        keyExtractor={(o) => o.id}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={load} tintColor={colors.teal} />}
        renderSectionHeader={({ section }) => <Text style={styles.section}>{section.title}</Text>}
        renderItem={({ item }) => {
          const b = BADGE[item.status];
          return (
            <Pressable style={styles.row} onPress={() => router.push({ pathname: '/order/[id]', params: { id: item.id } })}>
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={styles.dish} numberOfLines={1}>{item.post?.dish_name ?? 'Dish'}</Text>
                <Text style={styles.muted} numberOfLines={1}>{line(item, tab)}</Text>
                <Text style={styles.muted}>{fmtAgo(Date.parse(item.created_at))}</Text>
              </View>
              <Text style={[styles.badge, { backgroundColor: b.bg, color: b.fg }]}>{b.label}</Text>
            </Pressable>
          );
        }}
        ListEmptyComponent={
          loading ? null : (
            <Text style={styles.empty}>
              {!session ? 'Sign up to reserve plates from neighbors.' : tab === 'buyer' ? 'No orders yet. Find something in Today’s menu.' : 'No orders yet. Post what you’re cooking today and neighbors can reserve plates.'}
            </Text>
          )
        }
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.paper },
  pad: { paddingHorizontal: 20 },
  tabs: { flexDirection: 'row', backgroundColor: colors.cream, borderRadius: 999, padding: 3, marginTop: 16 },
  tab: { flex: 1, alignItems: 'center', paddingVertical: 9, borderRadius: 999 },
  tabOn: { backgroundColor: colors.white },
  tabText: { fontFamily: fonts.bold, fontSize: 13.5, color: colors.muted },
  tabTextOn: { color: colors.ink },
  list: { paddingHorizontal: 20, paddingBottom: 30, gap: 10 },
  section: { fontFamily: fonts.extraBold, fontSize: 11, letterSpacing: 0.6, color: colors.muted, marginTop: 18, marginBottom: 2, backgroundColor: colors.paper },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.white, borderRadius: 16, borderWidth: 1, borderColor: colors.line, padding: 14 },
  dish: { fontFamily: fonts.extraBold, fontSize: 15.5, color: colors.ink },
  muted: { fontFamily: fonts.semiBold, fontSize: 12.5, color: colors.muted },
  badge: { fontFamily: fonts.extraBold, fontSize: 10.5, letterSpacing: 0.5, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5, overflow: 'hidden' },
  empty: { fontFamily: fonts.semiBold, fontSize: 14, color: colors.muted, textAlign: 'center', marginTop: 40, lineHeight: 20, paddingHorizontal: 10 },
});
