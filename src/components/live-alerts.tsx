import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { router, usePathname } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Animated, Pressable, StyleSheet } from 'react-native';

import { Text } from '@/components/text';
import { colors, fonts } from '@/constants/theme';
import { fetchPeople } from '@/lib/chat';
import { useOverlayInsets } from '@/lib/insets';
import { dataChanged } from '@/lib/live';
import { describe, notificationPath, type Notification } from '@/lib/notifications';
import { personName } from '@/lib/posts';
import { useSession } from '@/lib/session';
import { supabase } from '@/lib/supabase';

type Banner = { title: string; sub?: string; icon: React.ComponentProps<typeof MaterialIcons>['name']; to: string };

/**
 * Listens for new notifications and messages while the app is open: shows a banner at the top and tells every screen to refresh its numbers.
 * (A banner while the app is closed needs push notifications, which come from the phone's notification service.)
 */
export function LiveAlerts() {
  const { session } = useSession();
  const me = session?.user.id ?? null;
  const insets = useOverlayInsets();
  const path = usePathname();
  const inChat = path.startsWith('/chat/');
  const [banner, setBanner] = useState<Banner | null>(null);
  const [y] = useState(() => new Animated.Value(-160));
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const show = useCallback(
    (b: Banner) => {
      setBanner(b);
      if (timer.current) clearTimeout(timer.current);
      Animated.timing(y, { toValue: 0, duration: 220, useNativeDriver: true }).start();
      timer.current = setTimeout(() => {
        Animated.timing(y, { toValue: -160, duration: 220, useNativeDriver: true }).start(() => setBanner(null));
      }, 4500);
    },
    [y],
  );

  useEffect(() => {
    if (!me) return;
    const channel = supabase
      .channel(`alerts-${me}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${me}` }, async (p) => {
        const n = p.new as Notification;
        const from = n.payload?.from;
        const people = from ? await fetchPeople([from]).catch(() => new Map()) : new Map();
        const d = describe(n, personName(from ? people.get(from) : null) || 'Someone');
        show({ ...d, to: notificationPath(n) });
        dataChanged();
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `recipient_id=eq.${me}` }, async (p) => {
        const m = p.new as { sender_id: string; body: string };
        dataChanged();
        if (inChat) return;
        const people = await fetchPeople([m.sender_id]).catch(() => new Map());
        show({ title: personName(people.get(m.sender_id)) || 'New message', sub: m.body, icon: 'chat-bubble', to: `/chat/${m.sender_id}` });
      })
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [me, show, inChat]);

  if (!banner) return null;
  return (
    <Animated.View style={[styles.wrap, { top: insets.top + 6, transform: [{ translateY: y }] }]}>
      <Pressable
        style={styles.card}
        onPress={() => {
          setBanner(null);
          router.push(banner.to as never);
        }}
        accessibilityRole="button"
        accessibilityLabel={banner.title}>
        <MaterialIcons name={banner.icon} size={24} color={colors.teal} />
        <Animated.View style={{ flex: 1 }}>
          <Text style={styles.title} numberOfLines={2}>{banner.title}</Text>
          {banner.sub ? <Text style={styles.sub} numberOfLines={1}>{banner.sub}</Text> : null}
        </Animated.View>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: 12, right: 12, zIndex: 50 },
  card: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.navy, borderRadius: 16, paddingHorizontal: 16, paddingVertical: 14, shadowColor: '#000', shadowOpacity: 0.25, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: 8 },
  title: { fontFamily: fonts.extraBold, fontSize: 15, color: colors.white },
  sub: { fontFamily: fonts.medium, fontSize: 13, color: 'rgba(255,255,255,.8)', marginTop: 2 },
});
