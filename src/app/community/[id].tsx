import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Share, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Avatar } from '@/components/avatar';
import { DishCard } from '@/components/dish-card';
import { colors, fonts } from '@/constants/theme';
import { type CommunityOverview, fetchCommunityOverview, fetchCommunityPeople, KIND_LABEL } from '@/lib/community';
import { setMembership } from '@/lib/cooks';
import { useMyLocation } from '@/lib/location';
import { fetchMyCommunities, type Person, personName } from '@/lib/posts';
import { fetchTop, type TopCook } from '@/lib/rankings';
import { useSession } from '@/lib/session';

type Top = { service: TopCook[]; likes: TopCook[]; people: Map<string, Person> };

const KIND_ICON: Record<string, React.ComponentProps<typeof MaterialIcons>['name']> = {
  area: 'location-city',
  compound: 'apartment',
  club: 'flag',
  sahel: 'beach-access',
  school: 'school',
  work: 'work',
  other: 'groups',
};

// Community page (design s19): cover, icon tile, name, Members / Cooks / Cooking today, Join and share,
// top cooks, what is cooking today. The design has one top list; we have two automatic rankings, so two lists.
export default function CommunityScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { session } = useSession();
  const me = session?.user.id ?? null;
  const here = useMyLocation();
  const [data, setData] = useState<CommunityOverview | null | undefined>(undefined);
  const [top, setTop] = useState<Top | null>(null);
  const [joined, setJoined] = useState(false);
  const [members, setMembers] = useState(0);

  useEffect(() => {
    fetchCommunityOverview(id).then(
      (d) => {
        setData(d);
        setMembers(d?.members ?? 0);
      },
      () => setData(null),
    );
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
    setMembers((n) => Math.max(0, n + (next ? 1 : -1)));
    await setMembership(me, id, next).catch(() => {
      setJoined(!next);
      setMembers((n) => Math.max(0, n + (next ? -1 : 1)));
    });
  }

  const back = () => (router.canGoBack() ? router.back() : router.replace('/home'));

  if (data === undefined) {
    return (
      <SafeAreaView style={[styles.screen, { alignItems: 'center', justifyContent: 'center' }]}>
        <ActivityIndicator color={colors.teal} />
      </SafeAreaView>
    );
  }
  if (!data) {
    return (
      <SafeAreaView style={styles.screen}>
        <Pressable onPress={back} hitSlop={10} style={{ padding: 18 }} accessibilityRole="button" accessibilityLabel="Back">
          <MaterialIcons name="arrow-back" size={24} color={colors.ink} />
        </Pressable>
        <Text style={[styles.sub, { marginTop: 10, textAlign: 'center' }]}>We couldn’t find this community.</Text>
      </SafeAreaView>
    );
  }

  const { info } = data;
  const sub = [KIND_LABEL[info.kind] ?? 'Community', info.area && info.area !== info.name ? info.area : info.governorate].filter(Boolean).join(' · ');

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
        <View style={styles.cover}>
          <MaterialIcons name={KIND_ICON[info.kind] ?? 'groups'} size={120} color="rgba(255,255,255,0.08)" style={styles.coverIcon} />
          <SafeAreaView edges={['top']}>
            <Pressable onPress={back} hitSlop={10} style={styles.backBtn} accessibilityRole="button" accessibilityLabel="Back">
              <MaterialIcons name="arrow-back" size={24} color={colors.white} />
            </Pressable>
          </SafeAreaView>
        </View>
        <View style={styles.tile}>
          <MaterialIcons name={KIND_ICON[info.kind] ?? 'groups'} size={34} color={colors.teal} />
        </View>
        <View style={{ alignItems: 'center', marginTop: 10, paddingHorizontal: 22 }}>
          <Text style={styles.name}>{info.name}</Text>
          <Text style={styles.sub}>{sub}</Text>
        </View>

        <View style={styles.stats}>
          <Stat n={members} label="Members" />
          <Stat n={data.cookIds.length} label="Cooks" />
          <Stat n={data.today.length} label="Cooking today" />
        </View>

        <View style={styles.btns}>
          <Pressable style={[styles.btn, { flex: 1, backgroundColor: joined ? colors.white : colors.teal, borderColor: joined ? colors.line : colors.teal }]} onPress={onJoin} accessibilityRole="button">
            <MaterialIcons name={joined ? 'check' : 'add'} size={17} color={colors.ink} />
            <Text style={styles.btnText}>{joined ? 'Joined' : 'Join'}</Text>
          </Pressable>
          <Pressable
            style={[styles.btn, { backgroundColor: colors.lightBlue, borderColor: colors.lightBlue, paddingHorizontal: 16 }]}
            onPress={() => Share.share({ message: `${info.name} on tabkheen A` }).catch(() => {})}
            accessibilityRole="button"
            accessibilityLabel="Share community">
            <MaterialIcons name="ios-share" size={20} color={colors.ink} />
          </Pressable>
        </View>

        <TopList title={`TOP COOKS IN ${info.name.toUpperCase()}`} rows={top?.service} people={top?.people} loading={!top} kind="service" />
        <TopList title={`MOST LIKED IN ${info.name.toUpperCase()}`} rows={top?.likes} people={top?.people} loading={!top} kind="likes" />
        {data.cookIds.length ? (
          <Pressable style={styles.seeAll} onPress={() => router.push({ pathname: '/community-cooks/[id]', params: { id } })} accessibilityRole="button">
            <Text style={styles.seeAllText}>See all {data.cookIds.length} cooks</Text>
            <MaterialIcons name="chevron-right" size={20} color={colors.ink} />
          </Pressable>
        ) : null}

        <View style={[styles.pad, styles.todayHead]}>
          <Text style={styles.section}>COOKING TODAY</Text>
          <Text style={styles.gone}>Gone at midnight</Text>
        </View>
        <View style={[styles.pad, { gap: 12, marginTop: 9 }]}>
          {data.today.length ? (
            data.today.map((d) => <DishCard key={d.id} dish={d} here={here} onPress={() => router.push({ pathname: '/dish/[id]', params: { id: d.id } })} />)
          ) : (
            <Text style={styles.empty}>No one in {info.name} is cooking today yet.</Text>
          )}
        </View>
      </ScrollView>
    </View>
  );
}

function Stat({ n, label }: { n: number; label: string }) {
  return (
    <View style={{ alignItems: 'center' }}>
      <Text style={styles.statN}>{n}</Text>
      <Text style={styles.statL}>{label}</Text>
    </View>
  );
}

function TopList({ title, rows, people, loading, kind }: { title: string; rows?: TopCook[]; people?: Map<string, Person>; loading: boolean; kind: 'service' | 'likes' }) {
  return (
    <View style={[styles.pad, { marginTop: 20 }]}>
      <Text style={styles.section}>{title}</Text>
      {loading ? <ActivityIndicator color={colors.teal} style={{ marginTop: 14 }} /> : null}
      {!loading && !rows?.length ? <Text style={styles.empty}>No ranking yet. It fills in as cooks here get orders, reviews and likes.</Text> : null}
      {rows?.map((r, i) => {
        const person = people?.get(r.cook_id) ?? { id: r.cook_id, username: null, display_name: null, avatar_path: null };
        const handle = person.username ? `@${person.username}` : '';
        return (
          <Pressable key={r.cook_id} style={[styles.row, i === rows.length - 1 && { borderBottomWidth: 0 }]} onPress={() => router.push({ pathname: '/cook/[id]', params: { id: r.cook_id } })} accessibilityRole="button">
            <Avatar person={person} size={46} />
            <View style={{ flex: 1, minWidth: 0 }}>
              <View style={styles.nameRow}>
                <Text style={styles.rowName} numberOfLines={1}>{personName(person)}</Text>
                <MaterialIcons name="verified" size={15} color={colors.teal} />
              </View>
              <Text style={styles.rowSub} numberOfLines={1}>
                {kind === 'service' ? (
                  <>{handle ? `${handle} · ` : ''}<Text style={{ color: colors.yellow }}>★</Text>{r.rating?.toFixed(1) ?? '–'}</>
                ) : (
                  `${handle ? `${handle} · ` : ''}${r.likes} ${r.likes === 1 ? 'like' : 'likes'}`
                )}
              </Text>
            </View>
            <View style={styles.trust}>
              <MaterialIcons name={kind === 'likes' ? 'favorite' : r.rank === 1 ? 'workspace-premium' : 'military-tech'} size={13} color={colors.ink} />
              <Text style={styles.trustText}>#{r.rank}</Text>
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
  cover: { height: 170, backgroundColor: colors.navy, overflow: 'hidden' },
  coverIcon: { position: 'absolute', right: 24, bottom: 18 },
  backBtn: { padding: 18, alignSelf: 'flex-start' },
  tile: { width: 76, height: 76, borderRadius: 22, backgroundColor: colors.lightBlue, borderWidth: 3, borderColor: colors.paper, alignItems: 'center', justifyContent: 'center', alignSelf: 'center', marginTop: -38 },
  name: { fontFamily: fonts.extraBold, fontSize: 20, color: colors.ink, textAlign: 'center' },
  sub: { fontFamily: fonts.semiBold, fontSize: 12.5, color: colors.muted, marginTop: 2 },
  stats: { flexDirection: 'row', justifyContent: 'center', gap: 26, marginTop: 14 },
  statN: { fontFamily: fonts.extraBold, fontSize: 17, color: colors.ink },
  statL: { fontFamily: fonts.semiBold, fontSize: 11, color: colors.muted, marginTop: 1 },
  btns: { flexDirection: 'row', gap: 10, marginTop: 16, paddingHorizontal: 22 },
  btn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, borderWidth: 1, borderRadius: 12, paddingVertical: 11 },
  btnText: { fontFamily: fonts.bold, fontSize: 14, color: colors.ink },
  section: { fontFamily: fonts.bold, fontSize: 12, letterSpacing: 0.5, color: colors.muted },
  empty: { fontFamily: fonts.semiBold, fontSize: 13, color: colors.muted, marginTop: 12 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 13, borderBottomWidth: 1, borderBottomColor: colors.line },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  rowName: { fontFamily: fonts.bold, fontSize: 15, color: colors.ink, flexShrink: 1 },
  rowSub: { fontFamily: fonts.semiBold, fontSize: 12.5, color: colors.muted, marginTop: 1 },
  trust: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: colors.lightBlue, borderRadius: 999, paddingHorizontal: 9, paddingVertical: 3 },
  trustText: { fontFamily: fonts.bold, fontSize: 11, color: colors.ink },
  seeAll: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, paddingVertical: 10 },
  seeAllText: { fontFamily: fonts.bold, fontSize: 13.5, color: colors.ink },
  todayHead: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', marginTop: 18 },
  gone: { fontFamily: fonts.semiBold, fontSize: 11.5, color: colors.muted },
});
