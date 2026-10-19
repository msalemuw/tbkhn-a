import { HankenGrotesk_400Regular, HankenGrotesk_500Medium, HankenGrotesk_600SemiBold, HankenGrotesk_700Bold, HankenGrotesk_800ExtraBold } from '@expo-google-fonts/hanken-grotesk';
import { InstrumentSerif_400Regular, InstrumentSerif_400Regular_Italic } from '@expo-google-fonts/instrument-serif';
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { Alert } from 'react-native';

import { AppGate } from '@/components/app-gate';
import { LiveAlerts } from '@/components/live-alerts';
import { PositionReporter } from '@/components/position-reporter';
import { PushSetup } from '@/components/push-setup';
import { colors } from '@/constants/theme';
import { applyUpdateNow } from '@/lib/auto-update';
import { LocationProvider } from '@/lib/location';
import { SessionProvider } from '@/lib/session';

SplashScreen.preventAutoHideAsync();

// Safety net: an unexpected error shows its message once instead of silently closing the app, so it can be reported and fixed.
let reported = false;
if (!__DEV__) {
  try {
    ErrorUtils.setGlobalHandler((error, isFatal) => {
      if (reported) return;
      reported = true;
      const text = `${isFatal ? 'FATAL ' : ''}${error?.name ?? 'Error'}: ${error?.message ?? String(error)}\n${(error?.stack ?? '').split('\n').slice(0, 6).join('\n')}`;
      try {
        Alert.alert('Something went wrong', text.slice(0, 900));
      } catch {
        // nothing more to do
      }
    });
  } catch {
    // ignore
  }
}

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
      <AppGate>
      <LocationProvider>
      <StatusBar style="dark" />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.paper } }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="sign-up/index" />
        <Stack.Screen name="log-in" />
        <Stack.Screen name="review-login" />
        <Stack.Screen name="how-it-works" />
        <Stack.Screen name="legal/[slug]" />
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
        <Stack.Screen name="pickup-map" options={{ presentation: 'modal' }} />
        <Stack.Screen name="cook/[id]" />
        <Stack.Screen name="post/[id]" />
        <Stack.Screen name="community/[id]" />
        <Stack.Screen name="community-today/[id]" />
        <Stack.Screen name="people/[id]" />
        <Stack.Screen name="communities-of/[id]" />
        <Stack.Screen name="edit-profile" />
        <Stack.Screen name="settings" />
        <Stack.Screen name="support" />
        <Stack.Screen name="inbox" />
        <Stack.Screen name="chat/[id]" />
      </Stack>
      <LiveAlerts />
      <PushSetup />
      <PositionReporter />
      </LocationProvider>
      </AppGate>
    </SessionProvider>
  );
}
