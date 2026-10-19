import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { DishList } from '@/components/dish-list';
import { Logo } from '@/components/logo';
import { colors, fonts, ui } from '@/constants/theme';
import { fetchAppStatus, MENU_CLOSED_FALLBACK } from '@/lib/app-status';

// Flow 14, screen s53: Today's menu. Staff can switch it off from the admin website (Controls): then the tab shows a "coming soon" message.
export default function Menu() {
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
              {/* Art from the design: a teal blob over a light-blue one, bleeding off the top-right edge. */}
              <View style={styles.artBack} pointerEvents="none" />
              <View style={styles.artBlob} pointerEvents="none" />
              <Logo on="light" height={28} />
              <View style={styles.titleRow}>
                <Text style={styles.title}>Today’s menu</Text>
                <View style={styles.sparkle} pointerEvents="none">
                  <View style={[styles.spark, { left: 0, top: 10, transform: [{ rotate: '-18deg' }] }]} />
                  <View style={[styles.spark, { left: 12, top: 2, transform: [{ rotate: '40deg' }] }]} />
                  <View style={[styles.spark, { left: 20, top: 20, transform: [{ rotate: '82deg' }] }]} />
                </View>
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
  artBack: { position: 'absolute', right: -34, top: -46, width: 96, height: 150, borderRadius: 48, backgroundColor: '#cdecf3' },
  artBlob: {
    position: 'absolute',
    right: -34,
    top: 12,
    width: 118,
    height: 84,
    backgroundColor: ui.bubble,
    borderTopLeftRadius: 56,
    borderBottomLeftRadius: 40,
    borderTopRightRadius: 42,
    borderBottomRightRadius: 56,
    transform: [{ rotate: '-14deg' }],
  },
  titleRow: { flexDirection: 'row', alignItems: 'flex-start', alignSelf: 'flex-start', marginTop: 12 },
  title: { fontFamily: fonts.serif, fontSize: 38, lineHeight: 46, color: ui.deep },
  sparkle: { width: 30, height: 34, marginLeft: 4, marginTop: -2 },
  spark: { position: 'absolute', width: 11, height: 2.5, borderRadius: 2, backgroundColor: ui.bubble },
  soon: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 12 },
  soonTitle: { fontFamily: fonts.serif, fontSize: 32, color: ui.deep, textAlign: 'center' },
  soonText: { fontFamily: fonts.medium, fontSize: 15.5, color: colors.muted, textAlign: 'center', lineHeight: 23 },
});
