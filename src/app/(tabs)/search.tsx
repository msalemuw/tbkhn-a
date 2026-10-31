import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Image, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Text, TextInput } from '@/components/text';
import { Avatar } from '@/components/avatar';
import { PickerSheet, type SheetItem } from '@/components/form';
import { RankBadge } from '@/components/rank-badge';
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
import { usePlace } from '@/lib/location';
import { fetchCommunityLogos } from '@/lib/community';
import { fetchMyCommunities, mediaUrl, personName } from '@/lib/posts';
import { type Badge, fetchBadges } from '@/lib/rankings';
import { t } from '@/lib/i18n';
import { useSession } from '@/lib/session';
import { supabase } from '@/lib/supabase';
import { VerifiedTick } from '@/lib/verified';

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
  const { place } = usePlace();
  const [text, setText] = useState('');
  const [found, setFound] = useState<Found | null>(null);
  const [logos, setLogos] = useState<Map<string, string>>(new Map());
  const [failed, setFailed] = useState(false);
  const [followed, setFollowed] = useState<Set<string>>(new Set());
  const [badges, setBadges] = useState<Map<string, Badge[]>>(new Map());
  const [joined, setJoined] = useState<Set<string>>(new Set());
  const [kindSheet, setKindSheet] = useState(false);
  const [request, setRequest] = useState<{ kind: string; noun: string } | null>(null);
  const [requestBusy, setRequestBusy] = useState(false);
  const [requestError, setRequestError] = useState<string | null>(null);
  const [requested, setRequested] = useState<string | null>(null);
  const [prefill, setPrefill] = useState('');

  // Refetched whenever the tab is focused again, so a logo changed on the community page shows here.
  useFocusEffect(
    useCallback(() => {
      const ids = found?.communities.map((c) => c.id) ?? [];
      fetchCommunityLogos(ids).then(setLogos, () => {});
    }, [found]),
  );
  useEffect(() => {
    if (me) fetchMyCommunities(me).then((c) => setJoined(new Set(c.map((x) => x.id))), () => {});
  }, [me]);

  useEffect(() => {
    let live = true;
    const t = setTimeout(
      () => {
        Promise.all([searchCooks(text, me, place), searchCommunities(text)])
          .then(async ([people, communities]) => {
            const f = me ? await fetchFollowedAmong(me, people.map((p) => p.id)).catch(() => new Set<string>()) : new Set<string>();
            if (!live) return;
            setFailed(false);
            setFollowed((prev) => new Set([...prev, ...f]));
            // With nothing typed, the screen is half cooks and half communities: five of each, communities nearest the member first.
            const mine = profile?.governorate;
            const suggested = text
              ? communities
              : [...communities].sort((a, b) => Number(b.governorate === mine) - Number(a.governorate === mine)).slice(0, 5);
            setFound({ q: text, people: text ? people : people.slice(0, 5), communities: suggested });
            fetchBadges(people.map((p) => p.id)).then((b) => live && setBadges(b), () => {});
          })
          .catch(() => live && setFailed(true));
      },
      text ? 250 : 0,
    );
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [text, me, place, profile?.governorate]);

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

  function openRequest(name = '') {
    if (!me) return router.push('/sign-up');
    setPrefill(name);
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
      <ScrollView contentContainerStyle={{ paddingBottom: 24 }} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag">
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
                  <VerifiedTick id={p.id} size={15} />
                </View>
                <Text style={styles.sub} numberOfLines={1}>{[p.username ? `@${p.username}` : null, p.area].filter(Boolean).join(' · ')}</Text>
                {badges.get(p.id)?.[0] ? <RankBadge badge={badges.get(p.id)![0]} /> : null}
              </View>
              <Pill label={followed.has(p.id) ? 'Following' : 'Follow'} on={!followed.has(p.id)} onPress={() => toggleFollow(p.id)} />
            </Pressable>
          ))}
        </View>

        <Text style={[styles.head, styles.pad, { marginTop: 14 }]}>Communities you can join</Text>
        <View style={styles.pad}>
          {found?.communities.length === 0 && !loading && !text ? <Text style={styles.emptyLeft}>No communities to show yet.</Text> : null}
          {found?.communities.length === 0 && !loading && text ? (
            <View style={styles.none}>
              <View style={styles.noneIcon}>
                <MaterialIcons name="help-outline" size={30} color={colors.ink} />
              </View>
              <Text style={styles.noneTitle}>{t('No community named “{n}” yet', { n: text.trim() })}</Text>
              <Text style={styles.noneSub}>Be the first. We will review it and tell you when it is open to join.</Text>
              <Pressable style={styles.noneBtn} onPress={() => openRequest(text.trim())} accessibilityRole="button">
                <Text style={styles.noneBtnText}>{t('Add “{n}”', { n: text.trim() })}</Text>
              </Pressable>
            </View>
          ) : null}
          {found?.communities.map((c) => (
            <Pressable key={c.id} style={styles.row} onPress={() => router.push({ pathname: '/community/[id]', params: { id: c.id } })} accessibilityRole="button">
              <View style={styles.commIcon}>
                {logos.get(c.id) ? (
                  <Image source={{ uri: mediaUrl(logos.get(c.id)!) ?? undefined }} style={StyleSheet.absoluteFill} resizeMode="cover" />
                ) : (
                  <MaterialIcons name={KIND_ICON[c.kind] ?? 'groups'} size={22} color={colors.teal} />
                )}
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={styles.name} numberOfLines={1}>{c.name}</Text>
                <Text style={styles.sub} numberOfLines={1}>{[KIND_LABEL[c.kind] ?? 'Community', c.area && c.area !== c.name ? c.area : c.governorate].filter(Boolean).join(' · ')}</Text>
              </View>
              <Pill label={joined.has(c.id) ? 'Joined' : 'Join'} on={!joined.has(c.id)} onPress={() => toggleJoin(c.id)} />
            </Pressable>
          ))}
        </View>

      </ScrollView>

      <View style={styles.dock}>
        <Pressable style={styles.request} onPress={() => openRequest()} accessibilityRole="button" accessibilityLabel="Add a new community">
          <View style={styles.requestIcon}>
            <MaterialIcons name="add" size={26} color={colors.ink} />
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={styles.requestTitle}>Can’t find your community?</Text>
            <Text style={styles.requestText}>{requested ? `Thanks! “${requested}” is waiting for approval.` : 'Add your compound, club, school or work.'}</Text>
          </View>
          <View style={styles.requestAdd}>
            <Text style={styles.requestAddText}>Add</Text>
          </View>
        </Pressable>
      </View>

      <PickerSheet title="What kind of community?" items={kindSheet ? kindItems : null} onClose={() => setKindSheet(false)} />
      <RequestCommunitySheet
        key={request ? 'open' : 'closed'}
        visible={request !== null}
        initialName={prefill}
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
  commIcon: { width: 46, height: 46, borderRadius: 14, backgroundColor: colors.lightBlue, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  pill: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 7 },
  pillText: { fontFamily: fonts.extraBold, fontSize: 12.5, color: colors.ink },
  dock: { paddingHorizontal: 22, paddingTop: 8, paddingBottom: 12, backgroundColor: colors.paper },
  request: { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 18, padding: 14, backgroundColor: colors.navy },
  requestIcon: { width: 46, height: 46, borderRadius: 14, backgroundColor: colors.yellow, alignItems: 'center', justifyContent: 'center' },
  requestTitle: { fontFamily: fonts.extraBold, fontSize: 15, color: colors.white },
  requestText: { fontFamily: fonts.semiBold, fontSize: 12.5, color: colors.white, marginTop: 2 },
  requestAdd: { backgroundColor: colors.yellow, borderRadius: 14, paddingHorizontal: 16, paddingVertical: 8 },
  requestAddText: { fontFamily: fonts.extraBold, fontSize: 13.5, color: colors.ink },
  none: { alignItems: 'center', paddingVertical: 18 },
  noneIcon: { width: 64, height: 64, borderRadius: 20, backgroundColor: colors.lightBlue, alignItems: 'center', justifyContent: 'center' },
  noneTitle: { fontFamily: fonts.extraBold, fontSize: 16, color: colors.ink, textAlign: 'center', marginTop: 14 },
  noneSub: { fontFamily: fonts.semiBold, fontSize: 13, color: colors.muted, textAlign: 'center', marginTop: 6, marginBottom: 16, paddingHorizontal: 12 },
  noneBtn: { alignSelf: 'stretch', backgroundColor: colors.yellow, borderRadius: 16, paddingVertical: 14, alignItems: 'center' },
  noneBtnText: { fontFamily: fonts.extraBold, fontSize: 15, color: colors.ink },
  empty: { fontFamily: fonts.semiBold, fontSize: 13, color: colors.muted, textAlign: 'center', padding: 22 },
  emptyLeft: { fontFamily: fonts.semiBold, fontSize: 13, color: colors.muted, paddingVertical: 8 },
});
