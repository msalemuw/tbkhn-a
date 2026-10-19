import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Image } from 'expo-image';
import { StatusBar } from 'expo-status-bar';
import { StyleSheet, useWindowDimensions, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { Text } from '@/components/text';
import { DishList } from '@/components/dish-list';
import { Logo } from '@/components/logo';
import { colors, fonts, ui } from '@/constants/theme';
import { fetchAppStatus, MENU_CLOSED_FALLBACK } from '@/lib/app-status';

const ART = require('@/assets/images/menu-header-art.png');

// Flow 14, screen s53: Today's menu. Staff can switch it off from the admin website (Controls): then the tab shows a "coming soon" message.
export default function Menu() {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  // undefined = not checked yet; a failed check (null status) leaves the menu open so nobody is locked out by a bad connection.
  const [closed, setClosed] = useState<{ message: string } | null | undefined>(undefined);
  useFocusEffect(
    useCallback(() => {
      fetchAppStatus().then((s) => setClosed(s && s.menu_enabled === false ? { message: s.menu_message || MENU_CLOSED_FALLBACK } : null));
    }, []),
  );
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: ui.page }} edges={['top']}>
      <StatusBar style="dark" />
      {closed === undefined ? null : closed ? (
        <View style={styles.soon}>
          <MaterialIcons name="restaurant-menu" size={44} color={ui.deepTeal} />
          <Text style={styles.soonTitle}>Menu coming soon</Text>
          <Text style={styles.soonText}>{closed.message}</Text>
        </View>
      ) : (
        <DishList
          header={
            <View style={styles.header}>
              {/* The founder's artwork (sparkle strokes and the teal blob over light blue), placed like the design: about 83% of the screen width, flush with the top-right. */}
              <Image source={ART} style={[styles.art, { top: 28 - (insets.top + 14), left: width * 0.23 - 14, width: width * 0.83 }]} contentFit="contain" pointerEvents="none" accessible={false} />
              <Logo on="light" height={28} />
              <View style={styles.titleRow}>
                <Text style={styles.title}>Today’s menu</Text>
              </View>
            </View>
          }
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  header: { gap: 4, paddingTop: 4 },
  art: { position: 'absolute', aspectRatio: 1448 / 1086 },
  titleRow: { flexDirection: 'row', alignItems: 'flex-start', alignSelf: 'flex-start', marginTop: 12 },
  title: { fontFamily: fonts.serif, fontSize: 34, lineHeight: 42, color: ui.deep },
  soon: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 12 },
  soonTitle: { fontFamily: fonts.serif, fontSize: 32, color: ui.deep, textAlign: 'center' },
  soonText: { fontFamily: fonts.medium, fontSize: 15.5, color: colors.muted, textAlign: 'center', lineHeight: 23 },
});
