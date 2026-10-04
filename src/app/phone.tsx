import { useLocalSearchParams } from 'expo-router';

import { PhoneEntry } from '@/components/phone-entry';

// Phone code sign-in, reached from "Continue with phone" once EXPO_PUBLIC_PHONE_SIGNIN is on.
export default function Phone() {
  const { mode } = useLocalSearchParams<{ mode?: string }>();
  return <PhoneEntry mode={mode === 'login' ? 'login' : 'signup'} />;
}
