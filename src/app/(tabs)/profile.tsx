import { router } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useFetchedStaffRole } from '@/components/admin-ui';
import { PrimaryButton } from '@/components/form';
import { ScreenPlaceholder } from '@/components/screen-placeholder';
import { colors, fonts } from '@/constants/theme';
import { useSession } from '@/lib/session';
import { supabase } from '@/lib/supabase';

export default function Profile() {
  const { session, profile } = useSession();
  // Staff get an Admin entry; everyone else never sees it.
  const staffRole = useFetchedStaffRole();

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.paper }} edges={['top']}>
      {session && profile ? (
        <View style={styles.me}>
          <Text style={styles.name}>{profile.display_name}</Text>
          <Text style={styles.handle}>@{profile.username}</Text>
          {profile.area ? <Text style={styles.handle}>{profile.area}, {profile.governorate}</Text> : null}
        </View>
      ) : null}
      <ScreenPlaceholder title="Your profile" note="Posts, What’s cooking today and reviews, like a cook’s profile." />
      <View style={styles.actions}>
        {session ? <PrimaryButton label="My cook profile" onPress={() => router.push({ pathname: '/cook/[id]', params: { id: session.user.id } })} style={{ marginBottom: 10 }} /> : null}
        {session ? <PrimaryButton label="Orders" onPress={() => router.push('/orders')} style={{ marginBottom: 10 }} /> : null}
        {staffRole ? <PrimaryButton label="Admin" onPress={() => router.push('/admin')} style={{ marginBottom: 10 }} /> : null}
        {session ? (
          <PrimaryButton
            label="Log out"
            onPress={async () => {
              await supabase.auth.signOut();
              router.replace('/');
            }}
          />
        ) : (
          <PrimaryButton label="Sign up or log in" onPress={() => router.push('/sign-up')} />
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  me: { alignItems: 'center', paddingTop: 32, gap: 4 },
  name: { fontFamily: fonts.extraBold, fontSize: 22, color: colors.ink },
  handle: { fontFamily: fonts.semiBold, fontSize: 14, color: colors.muted },
  actions: { padding: 22 },
});
