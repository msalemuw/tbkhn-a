import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Avatar } from '@/components/avatar';
import { PickerSheet, type SheetItem } from '@/components/form';
import { RequestCommunitySheet } from '@/components/request-community';
import { colors, fonts } from '@/constants/theme';
import {
  fetchFollowedAmong,
  type FoundCommunity,
  type FoundCook,
  searchCommunities,
  searchCooks,
  setFollowing,
  setMembership,
} from '@/lib/cooks';
import { fetchMyCommunities, personName } from '@/lib/posts';
import { useSession } from '@/lib/session';
import { supabase } from '@/lib/supabase';

type Found = { q: string; people: FoundCook[]; communities: FoundCommunity[] };

const KINDS: { kind: string; label: string; noun: string }[] = [
  { kind: 'area', label: 'Area or neighborhood', noun: 'area' },
  { kind: 'compound', label: 'Compound', noun: 'compound' },
  { kind: 'club', label: 'Club', noun: 'club' },
  { kind: 'sahel', label: 'Sahel community', noun: 'Sahel community' },
  { kind: 'school', label: 'School', noun: 'school' },
  { kind: 'work', label: 'Workplace', noun: 'workplace' },
];
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

// Flow 17: "Find cooks & communities". Search by name, @handle or community, then Follow or Join.
export default function Search() {
  const { session, profile } = useSession();
  const me = session?.user.id ?? null;
  const [text, setText] = useState('');
  const [found, setFound] = useState<Found | null>(null);
  const [failed, setFailed] = useState(false);
  const [followed, setFollowed] = useState<Set<string>>(new Set());
  const [joined, setJoined] = useState<Set<string>>(new Set());
  const [kindSheet, setKindSheet] = useState(false);
  const [request, setRequest] = useState<{ kind: string; noun: string } | null>(null);
  const [requestBusy, setRequestBusy] = useState(false);
  const [requestError, setRequestError] = useState<string | null>(null);
  const [requested, setRequested] = useState<string | null>(null);

  useEffect(() => {
    if (me) fetchMyCommunities(me).then((c) => setJoined(new Set(c.map((x) => x.id))), () => {});
  }, [me]);

  useEffect(() => {
    let live = true;
    const t = setTimeout(
      () => {
        Promise.all([searchCooks(text, me), searchCommunities(text)])
          .then(async ([people, communities]) => {
            const f = me ? await fetchFollowedAmong(me, people.map((p) => p.id)).catch(() => new Set<string>()) : new Set<string>();
            if (!live) return;
            setFailed(false);
            setFollowed((prev) => new Set([...prev, ...f]));
            setFound({ q: text, people, communities });
          })
          .catch(() => live && setFailed(true));
      },
      text ? 250 : 0,
    );
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [text, me]);

  const loading = !failed && found?.q !== text;

  async function toggleFollow(id: string) {
    if (!me) return router.push('/sign-up');
    const next = !followed.has(id);
    setFollowed((s) => {
      const n = new Set(s);
      if (next) n.add(id);
      else n.delete(id);
      return n;
    });
    await setFollowing(me, id, next).catch(() =>
      setFollowed((s) => {
        const n = new Set(s);
        if (next) n.delete(id);
        else n.add(id);
        return n;
      }),
    );
  }

  async function toggleJoin(id: string) {
    if (!me) return router.push('/sign-up');
    const next = !joined.has(id);
    setJoined((s) => {
      const n = new Set(s);
      if (next) n.add(id);
      else n.delete(id);
      return n;
    });
    await setMembership(me, id, next).catch(() =>
      setJoined((s) => {
        const n = new Set(s);
        if (next) n.delete(id);
        else n.add(id);
        return n;
      }),
    );
  }

  async function sendRequest(name: string) {
    if (!me || !request || !profile?.governorate) return;
    setRequestBusy(true);
    setRequestError(null);
    const area = request.kind === 'area' ? name : profile.area;
    const { error } = await supabase
      .from('communities')
      .insert({ name, kind: request.kind, governorate: profile.governorate, area, requested_by: me, status: 'pending' });
    setRequestBusy(false);
    if (error?.code === '23505') return setRequestError('That community already exists or is waiting for approval. Search for it above.');
    if (error) return setRequestError('We couldn’t send your request. Check your connection and try again.');
    setRequested(name);
    setRequest(null);
  }

  function openRequest() {
    if (!me) return router.push('/sign-up');
    setKindSheet(true);
  }

  const kindItems: SheetItem[] = KINDS.map((k) => ({
    label: k.label,
    selected: false,
    onPress: () => {
      setRequestError(null);
      setRequest({ kind: k.kind, noun: k.noun });
    },
  }));

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <ScrollView contentContainerStyle={{ paddingBottom: 40 }} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag">
        <Text style={styles.title}>Find cooks & communities</Text>
        <View style={styles.pad}>
          <View style={styles.search}>
            <MaterialIcons name="search" size={21} color={colors.ink} />
            <TextInput
              style={styles.input}
              value={text}
              onChangeText={setText}
              placeholder="Search cooks, @handles, communities"
              placeholderTextColor={colors.muted}
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="search"
              accessibilityLabel="Search cooks, handles and communities"
            />
            {text ? (
              <Pressable onPress={() => setText('')} hitSlop={10} accessibilityRole="button" accessibilityLabel="Clear search">
                <MaterialIcons name="close" size={20} color={colors.muted} />
              </Pressable>
            ) : null}
          </View>
        </View>

        {failed ? <Text style={styles.empty}>We couldn’t load results. Check your connection and try again.</Text> : null}

        <Text style={[styles.head, styles.pad]}>{text ? 'People' : 'Cooks to follow'}</Text>
        <View style={styles.pad}>
          {loading && !found ? <ActivityIndicator color={colors.teal} style={{ marginTop: 10 }} /> : null}
          {found?.people.length === 0 && !loading ? <Text style={styles.emptyLeft}>{text ? 'No one found by that name or @handle.' : 'No cooks to show yet.'}</Text> : null}
          {found?.people.map((p) => (
            <Pressable key={p.id} style={styles.row} onPress={() => router.push({ pathname: '/cook/[id]', params: { id: p.id } })} accessibilityRole="button">
              <Avatar person={p} size={46} />
              <View style={{ flex: 1, minWidth: 0 }}>
                <View style={styles.nameRow}>
                  <Text style={styles.name} numberOfLines={1}>{personName(p)}</Text>
                  <MaterialIcons name="verified" size={15} color={colors.teal} />
                </View>
                <Text style={styles.sub} numberOfLines={1}>{[p.username ? `@${p.username}` : null, p.area].filter(Boolean).join(' · ')}</Text>
              </View>
              <Pill label={followed.has(p.id) ? 'Following' : 'Follow'} on={!followed.has(p.id)} onPress={() => toggleFollow(p.id)} />
            </Pressable>
          ))}
        </View>

        <Text style={[styles.head, styles.pad, { marginTop: 14 }]}>Communities you can join</Text>
        <View style={styles.pad}>
          {found?.communities.length === 0 && !loading ? <Text style={styles.emptyLeft}>No community found. You can request it below.</Text> : null}
          {found?.communities.map((c) => (
            <View key={c.id} style={styles.row}>
              <View style={styles.commIcon}>
                <MaterialIcons name={KIND_ICON[c.kind] ?? 'groups'} size={22} color={colors.teal} />
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={styles.name} numberOfLines={1}>{c.name}</Text>
                <Text style={styles.sub} numberOfLines={1}>{[KIND_LABEL[c.kind] ?? 'Community', c.area && c.area !== c.name ? c.area : c.governorate].filter(Boolean).join(' · ')}</Text>
              </View>
              <Pill label={joined.has(c.id) ? 'Joined' : 'Join'} on={!joined.has(c.id)} onPress={() => toggleJoin(c.id)} />
            </View>
          ))}
        </View>

        <View style={[styles.pad, { marginTop: 8 }]}>
          <Pressable style={styles.request} onPress={openRequest} accessibilityRole="button">
            <MaterialIcons name="add-circle" size={20} color={colors.ink} />
            <Text style={styles.requestText}>Request a new community</Text>
          </Pressable>
          <Text style={styles.hint}>{requested ? `Thanks! “${requested}” is waiting for approval.` : 'Can’t find your compound, club or school?'}</Text>
        </View>
      </ScrollView>

      <PickerSheet title="What kind of community?" items={kindSheet ? kindItems : null} onClose={() => setKindSheet(false)} />
      <RequestCommunitySheet
        key={request ? 'open' : 'closed'}
        visible={request !== null}
        existing={request ? (found?.communities ?? []).filter((c) => c.kind === request.kind && c.governorate === profile?.governorate) : []}
        onUseExisting={(id) => {
          setRequest(null);
          const c = found?.communities.find((x) => x.id === id);
          if (c) setText(c.name);
        }}
        kindLabel={request?.noun ?? ''}
        where={profile?.governorate ?? ''}
        busy={requestBusy}
        error={requestError}
        onSubmit={sendRequest}
        onClose={() => setRequest(null)}
      />
    </SafeAreaView>
  );
}

function Pill({ label, on, onPress }: { label: string; on: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={[styles.pill, on ? { backgroundColor: colors.teal, borderColor: colors.teal } : { backgroundColor: colors.white, borderColor: colors.line }]}>
      <Text style={styles.pillText}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.paper },
  pad: { paddingHorizontal: 22 },
  title: { fontFamily: fonts.extraBold, fontSize: 18, color: colors.ink, paddingHorizontal: 22, paddingTop: 10, paddingBottom: 12 },
  search: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: colors.white, borderWidth: 1, borderColor: colors.line, borderRadius: 16, paddingHorizontal: 15, paddingVertical: 11 },
  input: { flex: 1, minWidth: 0, fontFamily: fonts.medium, fontSize: 15, color: colors.ink, padding: 0 },
  head: { fontFamily: fonts.extraBold, fontSize: 15, color: colors.ink, marginTop: 16 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 9 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  name: { fontFamily: fonts.bold, fontSize: 15, color: colors.ink, flexShrink: 1 },
  sub: { fontFamily: fonts.semiBold, fontSize: 12.5, color: colors.muted, marginTop: 1 },
  commIcon: { width: 46, height: 46, borderRadius: 14, backgroundColor: colors.lightBlue, alignItems: 'center', justifyContent: 'center' },
  pill: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 7 },
  pillText: { fontFamily: fonts.extraBold, fontSize: 12.5, color: colors.ink },
  request: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderWidth: 1.5, borderStyle: 'dashed', borderColor: colors.teal, borderRadius: 14, paddingVertical: 13, backgroundColor: colors.lightBlue },
  requestText: { fontFamily: fonts.extraBold, fontSize: 14, color: colors.ink },
  hint: { fontFamily: fonts.semiBold, fontSize: 12, color: colors.muted, textAlign: 'center', marginTop: 8 },
  empty: { fontFamily: fonts.semiBold, fontSize: 13, color: colors.muted, textAlign: 'center', padding: 22 },
  emptyLeft: { fontFamily: fonts.semiBold, fontSize: 13, color: colors.muted, paddingVertical: 8 },
});
