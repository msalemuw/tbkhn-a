import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, Share, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { CookProfileView } from '@/components/cook-profile';
import { PrimaryButton } from '@/components/form';
import { ScreenPlaceholder } from '@/components/screen-placeholder';
import { colors, fonts } from '@/constants/theme';
import { setMembership } from '@/lib/cooks';
import { fetchMyCommunities, type MyCommunity } from '@/lib/posts';
import { useSession } from '@/lib/session';

// My profile (design): gear for settings, photo with a "+", Edit profile and Share profile,
// "Your communities" chips (tap the minus to leave, "+ Add" opens Search), then the usual tabs.
export default function Profile() {
  const { session, profile } = useSession();
  const me = session?.user.id ?? null;
  const [mine, setMine] = useState<MyCommunity[]>([]);

  useEffect(() => {
    if (me) fetchMyCommunities(me).then(setMine, () => {});
  }, [me]);

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

  async function leave(c: MyCommunity) {
    setMine((l) => l.filter((x) => x.id !== c.id));
    await setMembership(session!.user.id, c.id, false).catch(() => setMine((l) => [...l, c]));
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
      onAvatarPlus={() => router.push('/edit-profile')}
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
      belowStats={
        <View style={{ paddingTop: 16 }}>
          <Text style={styles.label}>YOUR COMMUNITIES</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
            {mine.map((c) => (
              <Pressable key={c.id} style={styles.chip} onPress={() => router.push({ pathname: '/community/[id]', params: { id: c.id } })} accessibilityRole="button">
                <Text style={styles.chipText}>{c.name}</Text>
                <Pressable onPress={() => leave(c)} hitSlop={8} accessibilityRole="button" accessibilityLabel={`Leave ${c.name}`}>
                  <MaterialIcons name="remove-circle-outline" size={20} color={colors.white} />
                </Pressable>
              </Pressable>
            ))}
            <Pressable style={styles.add} onPress={() => router.push('/search')} accessibilityRole="button">
              <Text style={styles.addText}>+ Add</Text>
            </Pressable>
          </ScrollView>
        </View>
      }
    />
  );
}

const styles = StyleSheet.create({
  pad: { padding: 22 },
  gear: { width: 28, height: 28, alignItems: 'center', justifyContent: 'center' },
  btn: { flex: 1, borderRadius: 12, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.white, paddingVertical: 11, alignItems: 'center' },
  btnText: { fontFamily: fonts.extraBold, fontSize: 14, color: colors.ink },
  label: { fontFamily: fonts.bold, fontSize: 12, letterSpacing: 0.5, color: colors.muted, paddingHorizontal: 22 },
  chips: { gap: 10, paddingHorizontal: 22, paddingTop: 10 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: colors.navy, borderRadius: 999, paddingHorizontal: 16, paddingVertical: 10 },
  chipText: { fontFamily: fonts.bold, fontSize: 14, color: colors.white },
  add: { borderRadius: 999, borderWidth: 1, borderColor: colors.line, paddingHorizontal: 16, paddingVertical: 10, justifyContent: 'center' },
  addText: { fontFamily: fonts.semiBold, fontSize: 14, color: colors.ink },
});
