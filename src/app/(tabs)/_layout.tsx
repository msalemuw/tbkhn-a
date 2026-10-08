import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { Redirect, Tabs } from 'expo-router';
import type { ComponentProps } from 'react';

import { colors, fonts } from '@/constants/theme';
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
        tabBarActiveTintColor: colors.ink,
        tabBarInactiveTintColor: colors.muted,
        tabBarLabelStyle: { fontFamily: fonts.semiBold, fontSize: 11 },
        tabBarStyle: { backgroundColor: colors.white, borderTopColor: colors.line },
      }}>
      {TABS.map((t) => (
        <Tabs.Screen
          key={t.name}
          name={t.name}
          options={{ title: t.title, tabBarIcon: ({ color, size }) => <MaterialIcons name={t.icon} color={color} size={size} /> }}
        />
      ))}
    </Tabs>
  );
}
