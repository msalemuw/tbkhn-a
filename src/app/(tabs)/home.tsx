import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { router, useFocusEffect } from 'expo-router';
import { setStatusBarStyle } from 'expo-status-bar';
import { useCallback, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { DishList } from '@/components/dish-list';
import { Logo } from '@/components/logo';
import { colors, fonts } from '@/constants/theme';
import { unreadMessageCount } from '@/lib/chat';
import { usePlace } from '@/lib/location';
import { unreadNotificationCount } from '@/lib/notifications';
import { useSession } from '@/lib/session';

// Screen s6: Home feed of the communities you follow. Navy header with the logo, as in the design.
const NAVY = colors.navy;

export default function Home() {
  const { session } = useSession();
  const { place } = usePlace();
  const [unread, setUnread] = useState(0);
  // Light status bar text over the navy header, back to dark when another tab shows.
  useFocusEffect(
    useCallback(() => {
      setStatusBarStyle('light');
      if (session) Promise.all([unreadMessageCount(), unreadNotificationCount()]).then(([m, n]) => setUnread(m + n), () => null);
      return () => setStatusBarStyle('dark');
    }, [session]),
  );

  return (
    <View style={styles.screen}>
      <SafeAreaView edges={['top']} style={{ backgroundColor: NAVY }}>
        <View style={styles.header}>
          <Logo on="dark" height={28} />
          <View style={styles.headerRight}>
            <Pressable style={styles.locPill} accessibilityLabel="Choose your location" onPress={() => router.push('/location')}>
              <MaterialIcons name="location-on" size={16} color={colors.white} />
              <Text style={styles.locText} numberOfLines={1}>
                {place?.label || 'Location'}
              </Text>
            </Pressable>
            <Pressable accessibilityLabel="Orders" onPress={() => router.push('/orders')} hitSlop={8}>
              <MaterialIcons name="receipt-long" size={24} color={colors.white} />
            </Pressable>
            <Pressable accessibilityLabel={unread ? `Inbox, ${unread} new` : 'Inbox'} onPress={() => router.push('/inbox')} hitSlop={8}>
              <MaterialIcons name="chat-bubble-outline" size={24} color={colors.white} />
              {unread > 0 ? <Text style={styles.badge}>{unread > 9 ? '9+' : unread}</Text> : null}
            </Pressable>
          </View>
        </View>
      </SafeAreaView>
      {/* Stories and the full post feed come next; for now Home shows today's dishes. */}
      <DishList header={<Text style={styles.feedTitle}>Cooking today near you</Text>} />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.paper },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 8, paddingBottom: 10 },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  locPill: { maxWidth: 150, flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: 'rgba(255,255,255,.12)', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5 },
  locText: { fontFamily: fonts.bold, fontSize: 13, color: colors.white },
  badge: { position: 'absolute', top: -6, right: -8, minWidth: 18, textAlign: 'center', fontFamily: fonts.extraBold, fontSize: 10.5, color: colors.navy, backgroundColor: colors.yellow, borderRadius: 999, paddingHorizontal: 4, paddingVertical: 1, overflow: 'hidden' },
  feedTitle: { fontFamily: fonts.extraBold, fontSize: 18, color: colors.ink },
});
