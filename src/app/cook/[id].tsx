import { router, useLocalSearchParams } from 'expo-router';
import { View } from 'react-native';

import { CookProfileView } from '@/components/cook-profile';
import { TabShortcuts } from '@/components/tab-shortcuts';

// Flow 12: another member's profile. The layout lives in CookProfileView, shared with the Profile tab.
// The bottom bar stays visible here, as on the tabs.
export default function CookScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return (
    <View style={{ flex: 1 }}>
      <View style={{ flex: 1 }}>
        <CookProfileView id={id} onBack={() => (router.canGoBack() ? router.back() : router.replace('/home'))} />
      </View>
      <TabShortcuts />
    </View>
  );
}
