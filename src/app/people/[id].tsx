import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Avatar } from '@/components/avatar';
import { Pill } from '@/components/pill';
import { colors, fonts } from '@/constants/theme';
import { fetchCommunityPeopleList } from '@/lib/community';
import { type FoundCook, fetchFollowedAmong, fetchPeopleList, setFollowing } from '@/lib/cooks';
import { personName } from '@/lib/posts';
import { useSession } from '@/lib/session';

// Followers / Following (counts on a profile) or Members / Cooks (counts on a community page): people rows
// like Search, one list, with the people I follow first (marked Following) and everyone else after (Follow).
const TITLE = { followers: 'Followers', following: 'Following', members: 'Members', cooks: 'Cooks' } as const;
type Mode = keyof typeof TITLE;

export default function PeopleList() {
  const { id, kind } = useLocalSearchParams<{ id: string; kind?: string }>();
  const mode: Mode = kind === 'following' || kind === 'members' || kind === 'cooks' ? kind : 'followers';
  const { session } = useSession();
  const me = session?.user.id ?? null;
  const [people, setPeople] = useState<FoundCook[] | null>(null);
  const [followed, setFollowed] = useState<Set<string>>(new Set());
  const [q, setQ] = useState('');
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    (async () => {
      const list = mode === 'members' || mode === 'cooks' ? await fetchCommunityPeopleList(id, mode) : await fetchPeopleList(id, mode);
      const f = me ? await fetchFollowedAmong(me, list.map((p) => p.id)).catch(() => new Set<string>()) : new Set<string>();
      setFollowed(f);
      setPeople(list.sort((a, b) => Number(f.has(b.id)) - Number(f.has(a.id)) || personName(a).localeCompare(personName(b))));
    })().catch(() => setFailed(true));
  }, [id, mode, me]);

  async function toggle(pid: string) {
    if (!me) return router.push('/sign-up');
    const next = !followed.has(pid);
    const flip = (on: boolean) =>
      setFollowed((s) => {
        const n = new Set(s);
        if (on) n.add(pid);
        else n.delete(pid);
        return n;
      });
    flip(next);
    await setFollowing(me, pid, next).catch(() => flip(!next));
  }

  const needle = q.trim().toLowerCase().replace(/^@/, '');
  const shown = (people ?? []).filter((p) => !needle || `${p.display_name ?? ''} ${p.username ?? ''}`.toLowerCase().includes(needle));

  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.head}>
        <Pressable onPress={() => (router.canGoBack() ? router.back() : router.replace('/home'))} hitSlop={10} accessibilityRole="button" accessibilityLabel="Back">
          <MaterialIcons name="arrow-back" size={24} color={colors.ink} />
        </Pressable>
        <Text style={styles.title}>{TITLE[mode]}</Text>
      </View>
      <View style={styles.search}>
        <MaterialIcons name="search" size={21} color={colors.ink} />
        <TextInput style={styles.input} value={q} onChangeText={setQ} placeholder="Search people" placeholderTextColor={colors.muted} autoCapitalize="none" autoCorrect={false} accessibilityLabel="Search people" />
      </View>
      {failed ? (
        <Text style={styles.empty}>We couldn’t load this list. Check your connection and try again.</Text>
      ) : people === null ? (
        <ActivityIndicator color={colors.teal} style={{ marginTop: 20 }} />
      ) : (
        <FlatList
          data={shown}
          keyExtractor={(p) => p.id}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ paddingHorizontal: 22, paddingBottom: 30 }}
          ListEmptyComponent={<Text style={styles.empty}>{needle ? 'No one found.' : mode === 'following' ? 'Not following anyone yet.' : mode === 'followers' ? 'No followers yet.' : mode === 'members' ? 'No members yet.' : 'No cooks yet.'}</Text>}
          renderItem={({ item }) => (
            <Pressable style={styles.row} onPress={() => router.push({ pathname: '/cook/[id]', params: { id: item.id } })} accessibilityRole="button">
              <Avatar person={item} size={46} />
              <View style={{ flex: 1, minWidth: 0 }}>
                <View style={styles.nameRow}>
                  <Text style={styles.name} numberOfLines={1}>{personName(item)}</Text>
                  <MaterialIcons name="verified" size={15} color={colors.teal} />
                </View>
                <Text style={styles.sub} numberOfLines={1}>{[item.username ? `@${item.username}` : null, item.area].filter(Boolean).join(' · ')}</Text>
              </View>
              {item.id !== me ? <Pill label={followed.has(item.id) ? 'Following' : 'Follow'} on={!followed.has(item.id)} onPress={() => toggle(item.id)} /> : null}
            </Pressable>
          )}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.paper },
  head: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 22, paddingTop: 6 },
  title: { fontFamily: fonts.extraBold, fontSize: 18, color: colors.ink },
  search: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: colors.white, borderWidth: 1, borderColor: colors.line, borderRadius: 16, paddingHorizontal: 15, paddingVertical: 11, marginHorizontal: 22, marginVertical: 12 },
  input: { flex: 1, minWidth: 0, fontFamily: fonts.medium, fontSize: 15, color: colors.ink, padding: 0 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 9 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  name: { fontFamily: fonts.bold, fontSize: 15, color: colors.ink, flexShrink: 1 },
  sub: { fontFamily: fonts.semiBold, fontSize: 12.5, color: colors.muted, marginTop: 1 },
  empty: { fontFamily: fonts.semiBold, fontSize: 13, color: colors.muted, textAlign: 'center', padding: 22 },
});
