import { HankenGrotesk_400Regular, HankenGrotesk_500Medium, HankenGrotesk_600SemiBold, HankenGrotesk_700Bold, HankenGrotesk_800ExtraBold } from '@expo-google-fonts/hanken-grotesk';
import { InstrumentSerif_400Regular, InstrumentSerif_400Regular_Italic } from '@expo-google-fonts/instrument-serif';
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';

import { LiveAlerts } from '@/components/live-alerts';
import { colors } from '@/constants/theme';
import { applyUpdateNow } from '@/lib/auto-update';
import { LocationProvider } from '@/lib/location';
import { SessionProvider } from '@/lib/session';

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const [loaded, error] = useFonts({
    HankenGrotesk_400Regular,
    HankenGrotesk_500Medium,
    HankenGrotesk_600SemiBold,
    HankenGrotesk_700Bold,
    HankenGrotesk_800ExtraBold,
    InstrumentSerif_400Regular,
    InstrumentSerif_400Regular_Italic,
  });

  // Check for a new version while the splash screen is still showing.
  const [updateChecked, setUpdateChecked] = useState(false);
  useEffect(() => {
    applyUpdateNow().then(() => setUpdateChecked(true));
  }, []);

  const ready = (loaded || !!error) && updateChecked;
  useEffect(() => {
    if (ready) SplashScreen.hideAsync();
  }, [ready]);

  if (!ready) return null;

  return (
    <SessionProvider>
      <LocationProvider>
      <StatusBar style="dark" />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.paper } }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="sign-up/index" />
        <Stack.Screen name="log-in" />
        <Stack.Screen name="how-it-works" />
        <Stack.Screen name="phone" />
        <Stack.Screen name="verify" />
        <Stack.Screen name="sign-up/profile" options={{ gestureEnabled: false }} />
        <Stack.Screen name="compose/today" options={{ presentation: 'modal' }} />
        <Stack.Screen name="compose/signature" options={{ presentation: 'modal' }} />
        <Stack.Screen name="compose/story" options={{ presentation: 'modal' }} />
        <Stack.Screen name="story/[id]" options={{ presentation: 'fullScreenModal', animation: 'fade' }} />
        <Stack.Screen name="dish/[id]" />
        <Stack.Screen name="order/[id]" />
        <Stack.Screen name="orders" />
        <Stack.Screen name="location" options={{ presentation: 'modal' }} />
        <Stack.Screen name="cook/[id]" />
        <Stack.Screen name="community/[id]" />
        <Stack.Screen name="community-today/[id]" />
        <Stack.Screen name="people/[id]" />
        <Stack.Screen name="communities-of/[id]" />
        <Stack.Screen name="edit-profile" />
        <Stack.Screen name="settings" />
        <Stack.Screen name="inbox" />
        <Stack.Screen name="chat/[id]" />
      </Stack>
      <LiveAlerts />
      </LocationProvider>
    </SessionProvider>
  );
}
