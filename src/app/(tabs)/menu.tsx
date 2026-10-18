import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { DishList } from '@/components/dish-list';
import { colors, fonts } from '@/constants/theme';
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
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.paper }} edges={['top']}>
      {closed === undefined ? null : closed ? (
        <View style={styles.soon}>
          <MaterialIcons name="restaurant-menu" size={44} color={colors.teal} />
          <Text style={styles.soonTitle}>Menu coming soon</Text>
          <Text style={styles.soonText}>{closed.message}</Text>
        </View>
      ) : (
        <DishList header={<Text style={styles.title}>Today’s menu</Text>} />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  title: { fontFamily: fonts.serif, fontSize: 32, color: colors.ink },
  soon: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 12 },
  soonTitle: { fontFamily: fonts.serif, fontSize: 32, color: colors.ink, textAlign: 'center' },
  soonText: { fontFamily: fonts.medium, fontSize: 15.5, color: colors.muted, textAlign: 'center', lineHeight: 23 },
});
