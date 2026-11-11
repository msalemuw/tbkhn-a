import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Image } from 'expo-image';
import { StatusBar } from 'expo-status-bar';
import { Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { Text } from '@/components/text';
import { DishList } from '@/components/dish-list';
import { Logo } from '@/components/logo';
import { colors, fonts, ui } from '@/constants/theme';
import { fetchAppStatus, MENU_CLOSED_FALLBACK } from '@/lib/app-status';
import { usePlace } from '@/lib/location';

const ART = require('@/assets/images/menu-header-art.png');
const ASKED_KEY = 'tabkheen.menu-location-asked';

// Flow 14, screen s53: Today's menu. Staff can switch it off from the admin website (Controls): then the tab shows a "coming soon" message.
export default function Menu() {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const { place, ready } = usePlace();
  // undefined = not checked yet; a failed check (null status) leaves the menu open so nobody is locked out by a bad connection.
  const [closed, setClosed] = useState<{ message: string } | null | undefined>(undefined);
  useFocusEffect(
    useCallback(() => {
      fetchAppStatus().then((s) => setClosed(s && s.menu_enabled === false ? { message: s.menu_message || MENU_CLOSED_FALLBACK } : null));
    }, []),
  );
  // Menu is where the eater's location matters (like Talabat). The first time the tab opens with no location saved, the picker opens once.
  useFocusEffect(
    useCallback(() => {
      if (!ready || place) return;
      // A moment's grace first: the phone's own location usually arrives within a second or two and saves the question.
      const t = setTimeout(() => {
        AsyncStorage.getItem(ASKED_KEY).then((v) => {
          if (v) return;
          AsyncStorage.setItem(ASKED_KEY, '1').catch(() => {});
          router.push('/location');
        }, () => {});
      }, 3000);
      return () => clearTimeout(t);
    }, [ready, place]),
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
          retapTab="menu"
          header={
            <View style={styles.header}>
              {/* The founder's artwork (sparkle strokes and the teal blob over light blue), placed like the design: about 83% of the screen width, flush with the top-right. */}
              <Image source={ART} style={[styles.art, { top: 28 - (insets.top + 14), left: width * 0.23 - 14, width: width * 0.83 }]} contentFit="contain" pointerEvents="none" accessible={false} />
              <Logo on="light" height={28} />
              <View style={styles.titleRow}>
                <Text style={styles.title}>Today’s menu</Text>
              </View>
              <Pressable style={styles.loc} onPress={() => router.push('/location')} accessibilityRole="button" accessibilityLabel="Choose your location">
                <MaterialIcons name="location-on" size={18} color={colors.teal} />
                <Text style={styles.locText} numberOfLines={1} maxFontSizeMultiplier={1.15}>{place?.label || 'Set your location'}</Text>
                <MaterialIcons name="expand-more" size={20} color={colors.muted} />
              </Pressable>
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
  loc: { flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start', maxWidth: '75%', paddingVertical: 4 },
  locText: { flexShrink: 1, fontFamily: fonts.extraBold, fontSize: 16, color: ui.deep },
  soon: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 12 },
  soonTitle: { fontFamily: fonts.serif, fontSize: 32, color: ui.deep, textAlign: 'center' },
  soonText: { fontFamily: fonts.medium, fontSize: 15.5, color: colors.muted, textAlign: 'center', lineHeight: 23 },
});
