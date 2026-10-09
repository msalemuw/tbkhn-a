import { router, useLocalSearchParams } from 'expo-router';

import { CookProfileView } from '@/components/cook-profile';

// Flow 12: another member's profile. The layout lives in CookProfileView, shared with the Profile tab.
export default function CookScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <CookProfileView id={id} onBack={() => (router.canGoBack() ? router.back() : router.replace('/home'))} />;
}
