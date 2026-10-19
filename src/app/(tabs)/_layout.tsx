import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { Redirect, Tabs } from 'expo-router';
import type { ComponentProps } from 'react';
import { StyleSheet, View } from 'react-native';

import { t as tr } from '@/lib/i18n';
import { colors, fonts, ui } from '@/constants/theme';
import { useSession } from '@/lib/session';

type IconName = ComponentProps<typeof MaterialIcons>['name'];

// Bottom bar from the design: Home · Menu · Post · Search · Profile. Messages live in the Home header.
const TABS: { name: string; title: string; icon: IconName }[] = [
  { name: 'home', title: 'Home', icon: 'home' },
  { name: 'menu', title: 'Menu', icon: 'restaurant-menu' },
  { name: 'post', title: 'Post', icon: 'add-box' },
  { name: 'search', title: 'Search', icon: 'search' },
  { name: 'profile', title: 'Profile', icon: 'person' },
];

export default function TabLayout() {
  const { loading, session } = useSession();
  // Members only: anyone not signed in goes back to the welcome screen.
  if (!loading && !session) return <Redirect href="/" />;
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: ui.deepTeal,
        tabBarInactiveTintColor: colors.muted,
        tabBarLabelStyle: { fontFamily: fonts.semiBold, fontSize: 11 },
        tabBarStyle: styles.bar,
      }}>
      {TABS.map((t) => (
        <Tabs.Screen
          key={t.name}
          name={t.name}
          options={{
            title: tr(t.title),
            tabBarIcon: ({ color, size, focused }) =>
              // The bubble from the design: the open tab's icon sits in a raised teal circle; Post is always a small teal circle.
              focused || t.name === 'post' ? (
                <View style={[styles.bubble, !focused && styles.postDot]}>
                  <MaterialIcons name={t.icon} color={colors.white} size={focused ? size : 20} />
                </View>
              ) : (
                <MaterialIcons name={t.icon} color={color} size={size} />
              ),
          }}
        />
      ))}
    </Tabs>
  );
}

const styles = StyleSheet.create({
  bar: {
    backgroundColor: ui.card,
    borderTopWidth: 0,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    shadowColor: ui.deep,
    shadowOpacity: 0.08,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: -3 },
    elevation: 12,
  },
  bubble: {
    width: 50,
    height: 50,
    borderRadius: 25,
    marginTop: -14,
    backgroundColor: ui.bubble,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    borderColor: ui.card,
  },
  // Small enough to sit inside the bar with a clear gap above it and above its label.
  postDot: { width: 32, height: 32, borderRadius: 16, marginTop: 2, borderWidth: 0, backgroundColor: ui.deepTeal },
});
