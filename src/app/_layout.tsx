import { HankenGrotesk_400Regular, HankenGrotesk_500Medium, HankenGrotesk_600SemiBold, HankenGrotesk_700Bold, HankenGrotesk_800ExtraBold } from '@expo-google-fonts/hanken-grotesk';
import { InstrumentSerif_400Regular, InstrumentSerif_400Regular_Italic } from '@expo-google-fonts/instrument-serif';
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';

import { colors } from '@/constants/theme';
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

  useEffect(() => {
    if (loaded || error) SplashScreen.hideAsync();
  }, [loaded, error]);

  if (!loaded && !error) return null;

  return (
    <SessionProvider>
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
        <Stack.Screen name="dish/[id]" />
        <Stack.Screen name="order/[id]" />
        <Stack.Screen name="orders" />
        <Stack.Screen name="cook/[id]" />
        <Stack.Screen name="inbox" />
        <Stack.Screen name="chat/[id]" />
      </Stack>
    </SessionProvider>
  );
}
