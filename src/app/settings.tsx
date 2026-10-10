import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useFetchedStaffRole } from '@/components/admin-ui';
import { PrimaryButton } from '@/components/form';
import { colors, fonts } from '@/constants/theme';
import { useSession } from '@/lib/session';
import { supabase } from '@/lib/supabase';

// Settings, opened from the gear on my profile: orders, payment handle, admin (staff), log out.
export default function Settings() {
  const { profile } = useSession();
  const staffRole = useFetchedStaffRole();
  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.head}>
        <Pressable onPress={() => (router.canGoBack() ? router.back() : router.replace('/profile'))} hitSlop={10} accessibilityRole="button" accessibilityLabel="Back">
          <MaterialIcons name="arrow-back" size={24} color={colors.ink} />
        </Pressable>
        <Text style={styles.title}>Settings</Text>
      </View>
      <View style={styles.body}>
        <Row icon="receipt-long" label="My orders" onPress={() => router.push('/orders')} />
        <Row icon="edit" label="Edit profile" onPress={() => router.push('/edit-profile')} />
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
    </SafeAreaView>
  );
}

function Row({ icon, label, onPress }: { icon: React.ComponentProps<typeof MaterialIcons>['name']; label: string; onPress: () => void }) {
  return (
    <Pressable style={styles.row} onPress={onPress} accessibilityRole="button">
      <MaterialIcons name={icon} size={22} color={colors.ink} />
      <Text style={styles.rowText}>{label}</Text>
      <MaterialIcons name="chevron-right" size={22} color={colors.muted} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.paper },
  head: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 22, paddingTop: 6 },
  title: { fontFamily: fonts.extraBold, fontSize: 20, color: colors.ink },
  body: { padding: 22 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 15, borderBottomWidth: 1, borderBottomColor: colors.line },
  rowText: { flex: 1, fontFamily: fonts.bold, fontSize: 15, color: colors.ink },
  insta: { fontFamily: fonts.semiBold, fontSize: 13, color: colors.muted, marginVertical: 18 },
});
