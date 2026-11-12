import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { router } from 'expo-router';
import type { ComponentProps } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Text } from '@/components/text';
import { colors, fonts, ui } from '@/constants/theme';
import { t as tr } from '@/lib/i18n';

type IconName = ComponentProps<typeof MaterialIcons>['name'];

// The same five tabs as the bottom bar, for screens that open on top of the tabs (like another cook's profile)
// so the bar does not disappear there. Tapping one goes back to that tab.
const TABS: { href: '/home' | '/menu' | '/post' | '/search' | '/profile'; title: string; icon: IconName }[] = [
  { href: '/home', title: 'Home', icon: 'home' },
  { href: '/menu', title: 'Menu', icon: 'restaurant-menu' },
  { href: '/post', title: 'Post', icon: 'add-box' },
  { href: '/search', title: 'Search', icon: 'search' },
  { href: '/profile', title: 'Profile', icon: 'person' },
];

export function TabShortcuts() {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.bar, { paddingBottom: Math.max(insets.bottom, 8) }]}>
      {TABS.map((t) => (
        <Pressable key={t.href} style={styles.item} onPress={() => router.dismissTo(t.href)} accessibilityRole="button" accessibilityLabel={tr(t.title)}>
          {t.href === '/post' ? (
            <View style={styles.postDot}>
              <MaterialIcons name={t.icon} color={colors.white} size={20} />
            </View>
          ) : (
            <MaterialIcons name={t.icon} color={colors.muted} size={24} />
          )}
          <Text style={styles.label}>{tr(t.title)}</Text>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    backgroundColor: ui.card,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingTop: 8,
    shadowColor: ui.deep,
    shadowOpacity: 0.08,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: -3 },
    elevation: 12,
  },
  item: { flex: 1, alignItems: 'center', gap: 2, paddingVertical: 2 },
  label: { fontFamily: fonts.semiBold, fontSize: 11, color: colors.muted },
  postDot: { width: 32, height: 32, borderRadius: 16, backgroundColor: ui.deepTeal, alignItems: 'center', justifyContent: 'center' },
});
