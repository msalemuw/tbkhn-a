import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useFetchedStaffRole } from '@/components/admin-ui';
import { CookProfileView } from '@/components/cook-profile';
import { PrimaryButton } from '@/components/form';
import { ScreenPlaceholder } from '@/components/screen-placeholder';
import { colors, fonts } from '@/constants/theme';
import { useSession } from '@/lib/session';
import { supabase } from '@/lib/supabase';

// My profile: the same layout other members see (flow 12), plus my own actions underneath.
export default function Profile() {
  const { session, profile } = useSession();
  // Staff get an Admin entry; everyone else never sees it.
  const staffRole = useFetchedStaffRole();

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

  return (
    <CookProfileView
      id={session.user.id}
      actions={
        <>
          <Pressable style={[styles.btn, { backgroundColor: colors.teal, borderColor: colors.teal }]} onPress={() => router.push('/edit-profile')} accessibilityRole="button">
            <Text style={styles.btnText}>Edit profile</Text>
          </Pressable>
          <Pressable style={[styles.btn, { backgroundColor: colors.white, borderColor: colors.line }]} onPress={() => router.push('/orders')} accessibilityRole="button">
            <Text style={styles.btnText}>Orders</Text>
          </Pressable>
        </>
      }
      footer={
        <View style={styles.pad}>
          <Text style={styles.insta}>{profile?.instapay_handle ? `InstaPay: ${profile.instapay_handle}` : 'Add your InstaPay handle so buyers can pay you. Tap Edit profile.'}</Text>
          {staffRole ? <PrimaryButton label="Admin" onPress={() => router.push('/admin')} style={{ marginBottom: 10 }} /> : null}
          <PrimaryButton
            label="Log out"
            onPress={async () => {
              await supabase.auth.signOut();
              router.replace('/');
            }}
          />
        </View>
      }
    />
  );
}

const styles = StyleSheet.create({
  pad: { padding: 22 },
  btn: { flex: 1, borderRadius: 12, borderWidth: 1, paddingVertical: 11, alignItems: 'center' },
  btnText: { fontFamily: fonts.extraBold, fontSize: 14, color: colors.ink },
  insta: { fontFamily: fonts.semiBold, fontSize: 13, color: colors.muted, marginBottom: 14 },
});
