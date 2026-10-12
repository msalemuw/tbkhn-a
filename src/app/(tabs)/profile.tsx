import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { router } from 'expo-router';
import { Pressable, Share, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { CookProfileView } from '@/components/cook-profile';
import { PrimaryButton } from '@/components/form';
import { ScreenPlaceholder } from '@/components/screen-placeholder';
import { colors, fonts } from '@/constants/theme';
import { useSession } from '@/lib/session';

// My profile (design): gear for settings, Edit profile and Share profile,
// the tappable Communities / Followers / Following counts, then the usual tabs.
export default function Profile() {
  const { session, profile } = useSession();
  if (!session) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.paper }} edges={['top']}>
        <ScreenPlaceholder title="Your profile" note="Sign up to post, follow cooks and order." />
        <View style={styles.pad}>
          <PrimaryButton label="Sign up or log in" onPress={() => router.push('/sign-up')} />
        </View>
      </SafeAreaView>
    );
  }

  const handle = profile?.username ? `@${profile.username}` : '';

  return (
    <CookProfileView
      id={session.user.id}
      barRight={
        <Pressable onPress={() => router.push('/settings')} hitSlop={10} style={styles.gear} accessibilityRole="button" accessibilityLabel="Settings">
          <MaterialIcons name="settings" size={26} color={colors.ink} />
        </Pressable>
      }
      actions={
        <>
          <Pressable style={styles.btn} onPress={() => router.push('/edit-profile')} accessibilityRole="button">
            <Text style={styles.btnText}>Edit profile</Text>
          </Pressable>
          <Pressable
            style={styles.btn}
            onPress={() => Share.share({ message: `${profile?.display_name ?? 'My profile'} on tabkheen A ${handle}`.trim() }).catch(() => {})}
            accessibilityRole="button">
            <Text style={styles.btnText}>Share profile</Text>
          </Pressable>
        </>
      }
    />
  );
}

const styles = StyleSheet.create({
  pad: { padding: 22 },
  gear: { width: 28, height: 28, alignItems: 'center', justifyContent: 'center' },
  btn: { flex: 1, borderRadius: 12, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.white, paddingVertical: 11, alignItems: 'center' },
  btnText: { fontFamily: fonts.extraBold, fontSize: 14, color: colors.ink },
});
