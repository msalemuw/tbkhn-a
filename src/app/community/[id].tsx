import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Avatar } from '@/components/avatar';
import { BackHeader } from '@/components/form';
import { colors, fonts } from '@/constants/theme';
import { setMembership } from '@/lib/cooks';
import { fetchCommunityPeople } from '@/lib/community';
import { fetchMyCommunities, type Person, personName } from '@/lib/posts';
import { fetchTop, type TopCook } from '@/lib/rankings';
import { useSession } from '@/lib/session';
import { supabase } from '@/lib/supabase';

type Info = { id: string; name: string; kind: string; governorate: string; area: string | null; members: number };
type Top = { service: TopCook[]; likes: TopCook[]; people: Map<string, Person> };

const KIND_LABEL: Record<string, string> = { area: 'Area', compound: 'Compound', club: 'Club', sahel: 'Sahel', school: 'School', work: 'Workplace', other: 'Community' };

// Community page: who is in it and its top 3 cooks, ranked automatically two ways.
export default function CommunityScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { session } = useSession();
  const me = session?.user.id ?? null;
  const [info, setInfo] = useState<Info | null | undefined>(undefined);
  const [top, setTop] = useState<Top | null>(null);
  const [joined, setJoined] = useState(false);

  useEffect(() => {
    (async () => {
      const [c, members] = await Promise.all([
        supabase.from('communities').select('id, name, kind, governorate, area').eq('id', id).eq('status', 'approved').maybeSingle(),
        supabase.from('community_members').select('user_id', { count: 'exact', head: true }).eq('community_id', id),
      ]);
      setInfo(c.data ? { ...c.data, members: members.count ?? 0 } : null);
    })().catch(() => setInfo(null));
    (async () => {
      const t = await fetchTop(id);
      const people = await fetchCommunityPeople([...t.service, ...t.likes].map((r) => r.cook_id));
      setTop({ ...t, people });
    })().catch(() => setTop({ service: [], likes: [], people: new Map() }));
  }, [id]);

  useEffect(() => {
    if (me) fetchMyCommunities(me).then((c) => setJoined(c.some((x) => x.id === id)), () => {});
  }, [me, id]);

  async function onJoin() {
    if (!me) return router.push('/sign-up');
    const next = !joined;
    setJoined(next);
    setInfo((i) => (i ? { ...i, members: Math.max(0, i.members + (next ? 1 : -1)) } : i));
    await setMembership(me, id, next).catch(() => {
      setJoined(!next);
      setInfo((i) => (i ? { ...i, members: Math.max(0, i.members + (next ? -1 : 1)) } : i));
    });
  }

  if (info === undefined) {
    return (
      <SafeAreaView style={[styles.screen, { alignItems: 'center', justifyContent: 'center' }]}>
        <ActivityIndicator color={colors.teal} />
      </SafeAreaView>
    );
  }
  if (!info) {
    return (
      <SafeAreaView style={styles.screen}>
        <View style={styles.pad}>
          <BackHeader />
          <Text style={[styles.sub, { marginTop: 30 }]}>We couldn’t find this community.</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.screen}>
      <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
        <View style={styles.pad}>
          <BackHeader />
          <Text style={styles.name}>{info.name}</Text>
          <Text style={styles.sub}>
            {[KIND_LABEL[info.kind] ?? 'Community', info.area && info.area !== info.name ? info.area : info.governorate, `${info.members} ${info.members === 1 ? 'member' : 'members'}`].filter(Boolean).join(' · ')}
          </Text>
          <Pressable style={[styles.join, { backgroundColor: joined ? colors.white : colors.teal, borderColor: joined ? colors.line : colors.teal }]} onPress={onJoin} accessibilityRole="button">
            <Text style={styles.joinText}>{joined ? 'Joined' : 'Join'}</Text>
          </Pressable>
        </View>

        <Section title="Top cooks" note="Average rating × orders picked up" rows={top?.service} people={top?.people} loading={!top} kind="service" />
        <Section title="Most liked" note="Likes on signature dishes" rows={top?.likes} people={top?.people} loading={!top} kind="likes" />
      </ScrollView>
    </SafeAreaView>
  );
}

function Section({ title, note, rows, people, loading, kind }: { title: string; note: string; rows?: TopCook[]; people?: Map<string, Person>; loading: boolean; kind: 'service' | 'likes' }) {
  return (
    <View style={[styles.pad, { marginTop: 22 }]}>
      <Text style={styles.head}>{title}</Text>
      <Text style={styles.note}>{note}</Text>
      {loading ? <ActivityIndicator color={colors.teal} style={{ marginTop: 14 }} /> : null}
      {!loading && !rows?.length ? <Text style={styles.empty}>No ranking yet. It fills in as cooks here get orders, reviews and likes.</Text> : null}
      {rows?.map((r) => {
        const person = people?.get(r.cook_id) ?? { id: r.cook_id, username: null, display_name: null, avatar_path: null };
        return (
          <Pressable key={r.cook_id} style={styles.row} onPress={() => router.push({ pathname: '/cook/[id]', params: { id: r.cook_id } })} accessibilityRole="button">
            <View style={[styles.medal, r.rank === 1 && { backgroundColor: colors.yellow }]}>
              <Text style={styles.medalText}>{r.rank}</Text>
            </View>
            <Avatar person={person} size={44} />
            <View style={{ flex: 1, minWidth: 0 }}>
              <View style={styles.nameRow}>
                <Text style={styles.rowName} numberOfLines={1}>{personName(person)}</Text>
                <MaterialIcons name="verified" size={15} color={colors.teal} />
              </View>
              <Text style={styles.rowSub} numberOfLines={1}>
                {kind === 'service' ? `★ ${r.rating?.toFixed(1) ?? '–'} · ${r.orders} ${r.orders === 1 ? 'order' : 'orders'}` : `${r.likes} ${r.likes === 1 ? 'like' : 'likes'}`}
              </Text>
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.paper },
  pad: { paddingHorizontal: 22 },
  name: { fontFamily: fonts.extraBold, fontSize: 24, color: colors.ink, marginTop: 8 },
  sub: { fontFamily: fonts.semiBold, fontSize: 13.5, color: colors.muted, marginTop: 3 },
  join: { alignSelf: 'flex-start', borderWidth: 1, borderRadius: 12, paddingHorizontal: 22, paddingVertical: 10, marginTop: 14 },
  joinText: { fontFamily: fonts.extraBold, fontSize: 14, color: colors.ink },
  head: { fontFamily: fonts.extraBold, fontSize: 16, color: colors.ink },
  note: { fontFamily: fonts.semiBold, fontSize: 12.5, color: colors.muted, marginTop: 1 },
  empty: { fontFamily: fonts.semiBold, fontSize: 13, color: colors.muted, marginTop: 12 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 9, marginTop: 4 },
  medal: { width: 26, height: 26, borderRadius: 13, backgroundColor: colors.lightBlue, alignItems: 'center', justifyContent: 'center' },
  medalText: { fontFamily: fonts.extraBold, fontSize: 13, color: colors.ink },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  rowName: { fontFamily: fonts.bold, fontSize: 15, color: colors.ink, flexShrink: 1 },
  rowSub: { fontFamily: fonts.semiBold, fontSize: 12.5, color: colors.muted, marginTop: 1 },
});
