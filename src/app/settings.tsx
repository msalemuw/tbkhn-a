import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Text } from '@/components/text';
import { Alert } from '@/lib/alert';
import { lang, setLanguage, t } from '@/lib/i18n';
import { FlipIcon } from '@/components/flip-icon';
import { useFetchedStaffRole } from '@/components/admin-ui';
import { PrimaryButton } from '@/components/form';
import { colors, fonts } from '@/constants/theme';
import { AlertHealthNotice } from '@/components/request-alerts';
import { deleteMyAccount } from '@/lib/account';
import { sendTestAlert } from '@/lib/orders';
import { checkAlerts } from '@/lib/push';
import { useSession } from '@/lib/session';
import { supabase } from '@/lib/supabase';

// Settings, opened from the gear on my profile: orders, payment handle, admin (staff), log out, delete my account.
export default function Settings() {
  const { profile } = useSession();
  const staffRole = useFetchedStaffRole();
  const [deleting, setDeleting] = useState(false);

  // Required by Apple and Google: delete the account from inside the app, after one clear confirmation.
  function confirmDelete() {
    Alert.alert(
      t('Delete your account?'),
      t('This permanently removes your profile, photos, posts, comments, messages and orders. You can’t undo it.'),
      [
        { text: t('Keep my account'), style: 'cancel' },
        {
          text: t('Delete my account'),
          style: 'destructive',
          onPress: async () => {
            if (!profile) return;
            setDeleting(true);
            const failure = await deleteMyAccount(profile.id);
            setDeleting(false);
            if (failure) return Alert.alert(t('We couldn’t delete your account'), failure);
            router.replace('/');
          },
        },
      ],
    );
  }
  // A cook checks, in one tap, that a new request will reach this phone with the long ring.
  async function testAlerts() {
    if ((await checkAlerts()) === 'off') {
      return Alert.alert(t('Alerts are off'), t('Turn on notifications for tabkheen A in your phone settings, then test again.'));
    }
    try {
      await sendTestAlert();
      Alert.alert(
        t('Test alert sent'),
        t('You should hear the long ring in a few seconds. If you do not: switch the phone off silent, turn off Do Not Disturb, and allow tabkheen A in your Focus settings.'),
      );
    } catch (e) {
      Alert.alert(t('We couldn’t send the test'), e instanceof Error ? e.message : t('Try again.'));
    }
  }
  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.head}>
        <Pressable onPress={() => (router.canGoBack() ? router.back() : router.replace('/profile'))} hitSlop={10} accessibilityRole="button" accessibilityLabel={t('Back')}>
          <FlipIcon name="arrow-back" size={28} color={colors.ink} />
        </Pressable>
        <Text style={styles.title}>{t('Settings')}</Text>
      </View>
      <AlertHealthNotice />
      <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
        <Row icon="receipt-long" label={t('My orders')} onPress={() => router.push('/orders')} />
        <Row icon="edit" label={t('Edit profile')} onPress={() => router.push('/edit-profile')} />
        <Row icon="translate" label={lang === 'ar' ? 'English' : 'العربية'} onPress={() => setLanguage(lang === 'ar' ? 'en' : 'ar')} />
        <Row icon="place" label={t('My pickup spots')} onPress={() => router.push('/pickup-spots')} />
        <Row icon="block" label={t('Blocked accounts')} onPress={() => router.push('/blocked')} />
        <Row icon="notifications-active" label={t('Test my alerts')} onPress={testAlerts} />
        <Row icon="help-outline" label={t('Help & support')} onPress={() => router.push('/support')} />
        <Row icon="privacy-tip" label={t('Privacy policy')} onPress={() => router.push({ pathname: '/legal/[slug]', params: { slug: 'privacy' } })} />
        <Row icon="description" label={t('Terms of use')} onPress={() => router.push({ pathname: '/legal/[slug]', params: { slug: 'terms' } })} />
        <Text style={styles.insta}>{profile?.instapay_handle ? t('InstaPay: {h}', { h: profile.instapay_handle }) : t('Add your InstaPay handle so buyers can pay you. Tap Edit profile.')}</Text>
        {staffRole ? <PrimaryButton label={t('Admin')} onPress={() => router.push('/admin')} style={{ marginBottom: 10 }} /> : null}
        <PrimaryButton
          label={t('Log out')}
          onPress={async () => {
            await supabase.auth.signOut();
            router.replace('/');
          }}
        />
        <Pressable onPress={confirmDelete} disabled={deleting} style={styles.delete} accessibilityRole="button" accessibilityLabel={t('Delete my account')}>
          <Text style={styles.deleteText}>{deleting ? t('Deleting…') : t('Delete my account')}</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

function Row({ icon, label, onPress }: { icon: React.ComponentProps<typeof MaterialIcons>['name']; label: string; onPress: () => void }) {
  return (
    <Pressable style={styles.row} onPress={onPress} accessibilityRole="button">
      <MaterialIcons name={icon} size={22} color={colors.ink} />
      <Text style={styles.rowText}>{label}</Text>
      <FlipIcon name="chevron-right" size={22} color={colors.muted} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.paper },
  head: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 22, paddingTop: 16 },
  title: { fontFamily: fonts.extraBold, fontSize: 22, color: colors.ink },
  body: { padding: 22, paddingBottom: 48 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 15, borderBottomWidth: 1, borderBottomColor: colors.line },
  rowText: { flex: 1, fontFamily: fonts.bold, fontSize: 15, color: colors.ink },
  delete: { alignItems: 'center', paddingVertical: 14, marginTop: 14, borderWidth: 1.5, borderColor: colors.ink, borderRadius: 14 },
  deleteText: { fontFamily: fonts.bold, fontSize: 15, color: colors.ink },
  insta: { fontFamily: fonts.semiBold, fontSize: 13, color: colors.muted, marginVertical: 18 },
});
