import { SafeAreaView } from 'react-native-safe-area-context';

import { ScreenPlaceholder } from '@/components/screen-placeholder';
import { colors } from '@/constants/theme';

export default function SignUp() {
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.paper }}>
      <ScreenPlaceholder title="Create account" note="Pick Google, email or your 10-digit mobile number. Every new member verifies a phone number." />
    </SafeAreaView>
  );
}
