import { SafeAreaView } from 'react-native-safe-area-context';

import { ScreenPlaceholder } from '@/components/screen-placeholder';
import { colors } from '@/constants/theme';

export default function Search() {
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.paper }} edges={['top']}>
      <ScreenPlaceholder title="Find cooks & communities" note="Search by name, @handle or community, then follow or join." />
    </SafeAreaView>
  );
}
