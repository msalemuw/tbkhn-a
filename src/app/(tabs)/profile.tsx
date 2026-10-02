import { SafeAreaView } from 'react-native-safe-area-context';

import { ScreenPlaceholder } from '@/components/screen-placeholder';
import { colors } from '@/constants/theme';

export default function Profile() {
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.paper }} edges={['top']}>
      <ScreenPlaceholder title="Your profile" note="Posts, What’s cooking today and reviews, like a cook’s profile." />
    </SafeAreaView>
  );
}
