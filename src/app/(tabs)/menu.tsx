import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Image } from 'expo-image';
import { StatusBar } from 'expo-status-bar';
import { Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Text } from '@/components/text';
import { DishList } from '@/components/dish-list';
import { colors, fonts, ui } from '@/constants/theme';
import { fetchAppStatus, MENU_CLOSED_FALLBACK } from '@/lib/app-status';
import { isRTL } from '@/lib/i18n';
import { usePlace } from '@/lib/location';

// The founder's artwork, split in two so each half can sit where it belongs: the sparkles by the title, the blobs behind the filter button.
const SPARKS = require('@/assets/images/menu-art-sparkles.png');
const BLOBS = require('@/assets/images/menu-art-blobs.png');
const ART_W = 1448; // size of the original artwork, in its own pixels
const ART_H = 1086;
const BLOBS_X = 0.23; // blobs: left edge as a fraction of the screen width, so they sit flush with the right edge
const TEAL_BOTTOM = 678 / ART_H; // the teal blob's lowest point, as a fraction of the blobs image height
const SPARK = { w: 191, h: 190, tipX: 64, tipY: 124 }; // sparkles crop and the lower-left end of its middle stroke (artwork pixels)
// The middle sparkle stroke starts at the top-right corner of the last letter of the title: just past its right edge, at x-height.
const TITLE_X_HEIGHT = 15; // from the top of the title text box down to the top of the lowercase letters (pt)

const ASKED_KEY = 'tabkheen.menu-location-asked';

// Flow 14, screen s53: Today's menu. Staff can switch it off from the admin website (Controls): then the tab shows a "coming soon" message.
export default function Menu() {
  const { width } = useWindowDimensions();
  const [titleW, setTitleW] = useState<number | null>(null);
  // One artwork pixel in points: the art is drawn at 83% of the screen width, as in the design.
  const k = (width * 0.83) / ART_W;
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
              {/* Like Talabat's "Deliver to": where you are is the first thing on the screen. Pickup only, so it says pickup. */}
              <Pressable style={styles.loc} onPress={() => router.push('/location')} accessibilityRole="button" accessibilityLabel="Choose your location">
                <MaterialIcons name="location-on" size={22} color={colors.teal} />
                <View style={{ flexShrink: 1 }}>
                  <Text style={styles.locLabel} maxFontSizeMultiplier={1.15}>Pickup near</Text>
                  <View style={styles.locLine}>
                    <Text style={styles.locText} numberOfLines={1} maxFontSizeMultiplier={1.15}>{place?.label || 'Set your location'}</Text>
                    <MaterialIcons name="expand-more" size={20} color={colors.muted} />
                  </View>
                </View>
              </Pressable>
              <View style={styles.titleRow}>
                <Text style={styles.title} onLayout={(e) => setTitleW(e.nativeEvent.layout.width)}>Today’s menu</Text>
                {titleW != null ? (
                  <Image
                    source={SPARKS}
                    style={{
                      position: 'absolute',
                      width: SPARK.w * k,
                      height: SPARK.h * k,
                      left: titleW + 3 - SPARK.tipX * k,
                      top: TITLE_X_HEIGHT - 2 - SPARK.tipY * k,
                      transform: isRTL ? [{ scaleX: -1 }] : undefined,
                    }}
                    contentFit="contain"
                    pointerEvents="none"
                    accessible={false}
                  />
                ) : null}
              </View>
            </View>
          }
          // The teal blob's lowest point rests on the top edge of the filter button, wherever the phone puts it.
          barArt={(filterTop) => (
            <Image
              source={BLOBS}
              style={{ position: 'absolute', width: ART_W * k, height: ART_H * k, left: width * BLOBS_X - 14, top: filterTop + 1 - TEAL_BOTTOM * ART_H * k }}
              contentFit="contain"
              pointerEvents="none"
              accessible={false}
            />
          )}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  header: { gap: 4, paddingTop: 4 },
  titleRow: { flexDirection: 'row', alignItems: 'flex-start', alignSelf: 'flex-start', marginTop: 12 },
  title: { fontFamily: fonts.serif, fontSize: 34, lineHeight: 42, color: ui.deep },
  loc: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', maxWidth: '80%', paddingVertical: 2 },
  locLabel: { fontFamily: fonts.semiBold, fontSize: 11.5, color: colors.muted },
  locLine: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  locText: { flexShrink: 1, fontFamily: fonts.extraBold, fontSize: 16, color: ui.deep },
  soon: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 12 },
  soonTitle: { fontFamily: fonts.serif, fontSize: 32, color: ui.deep, textAlign: 'center' },
  soonText: { fontFamily: fonts.medium, fontSize: 15.5, color: colors.muted, textAlign: 'center', lineHeight: 23 },
});
