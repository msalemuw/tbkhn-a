import { SafeAreaView } from 'react-native-safe-area-context';

import { ScreenPlaceholder } from '@/components/screen-placeholder';
import { colors } from '@/constants/theme';

export default function LogIn() {
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.paper }}>
      <ScreenPlaceholder title="Log in" note="Enter your mobile number and we’ll send a 6-digit code." />
    </SafeAreaView>
  );
}
