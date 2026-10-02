import { SafeAreaView } from 'react-native-safe-area-context';

import { ScreenPlaceholder } from '@/components/screen-placeholder';
import { colors } from '@/constants/theme';

export default function Menu() {
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.paper }} edges={['top']}>
      <ScreenPlaceholder title="Today’s menu" note="Every dish neighbors are cooking today, filtered by community, cuisine or search." />
    </SafeAreaView>
  );
}
