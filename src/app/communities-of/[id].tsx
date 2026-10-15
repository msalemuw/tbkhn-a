import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Pill } from '@/components/pill';
import { colors, fonts } from '@/constants/theme';
import { fetchMemberCounts } from '@/lib/community';
import { fetchCommunitiesOf, type FoundCommunity, setMembership } from '@/lib/cooks';
import { fetchMyCommunities } from '@/lib/posts';
import { useSession } from '@/lib/session';

const KIND_LABEL: Record<string, string> = { area: 'Area', compound: 'Compound', club: 'Club', sahel: 'Sahel', school: 'School', work: 'Workplace', other: 'Community' };
const KIND_ICON: Record<string, React.ComponentProps<typeof MaterialIcons>['name']> = {
  area: 'location-city',
  compound: 'apartment',
  club: 'flag',
  sahel: 'beach-access',
  school: 'school',
  work: 'work',
  other: 'groups',
};

// Communities of one person (opened from the Communities count on a profile): rows like Search, with Join / Joined.
export default function CommunitiesOf() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { session } = useSession();
  const me = session?.user.id ?? null;
  const [list, setList] = useState<FoundCommunity[] | null>(null);
  const [joined, setJoined] = useState<Set<string>>(new Set());
  const [counts, setCounts] = useState<Map<string, number>>(new Map());
  const [q, setQ] = useState('');
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    fetchCommunitiesOf(id).then(
      (l) => {
        setList(l);
        fetchMemberCounts(l.map((c) => c.id)).then(setCounts, () => {});
      },
      () => setFailed(true),
    );
  }, [id]);
  useEffect(() => {
    if (me) fetchMyCommunities(me).then((c) => setJoined(new Set(c.map((x) => x.id))), () => {});
  }, [me]);

  async function toggle(cid: string) {
    if (!me) return router.push('/sign-up');
    const next = !joined.has(cid);
    const flip = (on: boolean) =>
      setJoined((s) => {
        const n = new Set(s);
        if (on) n.add(cid);
        else n.delete(cid);
        return n;
      });
    flip(next);
    await setMembership(me, cid, next).catch(() => flip(!next));
  }

  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.head}>
        <Pressable onPress={() => (router.canGoBack() ? router.back() : router.replace('/home'))} hitSlop={10} accessibilityRole="button" accessibilityLabel="Back">
          <MaterialIcons name="arrow-back" size={28} color={colors.ink} />
        </Pressable>
        <Text style={styles.title}>Communities</Text>
      </View>
      <View style={styles.search}>
        <MaterialIcons name="search" size={21} color={colors.ink} />
        <TextInput style={styles.input} value={q} onChangeText={setQ} placeholder="Search communities" placeholderTextColor={colors.muted} autoCapitalize="none" autoCorrect={false} accessibilityLabel="Search communities" />
      </View>
      {failed ? (
        <Text style={styles.empty}>We couldn’t load this list. Check your connection and try again.</Text>
      ) : list === null ? (
        <ActivityIndicator color={colors.teal} style={{ marginTop: 20 }} />
      ) : (
        <FlatList
          data={list.filter((c) => !q.trim() || c.name.toLowerCase().includes(q.trim().toLowerCase()))}
          keyExtractor={(c) => c.id}
          contentContainerStyle={{ paddingHorizontal: 22, paddingBottom: 30, paddingTop: 8 }}
          ListEmptyComponent={<Text style={styles.empty}>{q.trim() ? 'No community found.' : 'No communities yet.'}</Text>}
          renderItem={({ item: c }) => (
            <Pressable style={styles.row} onPress={() => router.push({ pathname: '/community/[id]', params: { id: c.id } })} accessibilityRole="button">
              <View style={styles.icon}>
                <MaterialIcons name={KIND_ICON[c.kind] ?? 'groups'} size={22} color={colors.teal} />
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={styles.name} numberOfLines={1}>{c.name}</Text>
                <Text style={styles.sub} numberOfLines={1}>{[KIND_LABEL[c.kind] ?? 'Community', c.area && c.area !== c.name ? c.area : c.governorate, counts.has(c.id) ? `${counts.get(c.id)} ${counts.get(c.id) === 1 ? 'member' : 'members'}` : null].filter(Boolean).join(' · ')}</Text>
              </View>
              <Pill label={joined.has(c.id) ? 'Joined' : 'Join'} on={!joined.has(c.id)} onPress={() => toggle(c.id)} />
            </Pressable>
          )}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.paper },
  head: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 22, paddingTop: 16 },
  title: { fontFamily: fonts.extraBold, fontSize: 22, color: colors.ink },
  search: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: colors.white, borderWidth: 1, borderColor: colors.line, borderRadius: 16, paddingHorizontal: 15, paddingVertical: 11, marginHorizontal: 22, marginTop: 12 },
  input: { flex: 1, minWidth: 0, fontFamily: fonts.medium, fontSize: 15, color: colors.ink, padding: 0 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 9 },
  icon: { width: 46, height: 46, borderRadius: 14, backgroundColor: colors.lightBlue, alignItems: 'center', justifyContent: 'center' },
  name: { fontFamily: fonts.bold, fontSize: 15, color: colors.ink, flexShrink: 1 },
  sub: { fontFamily: fonts.semiBold, fontSize: 12.5, color: colors.muted, marginTop: 1 },
  empty: { fontFamily: fonts.semiBold, fontSize: 13, color: colors.muted, textAlign: 'center', padding: 22 },
});
