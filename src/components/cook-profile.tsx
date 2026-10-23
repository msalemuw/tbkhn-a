import FontAwesome5 from '@expo/vector-icons/FontAwesome5';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { type ReactNode, useCallback, useState } from 'react';
import { ActivityIndicator, Linking, Pressable, ScrollView, Share, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Text } from '@/components/text';
import { SOCIALS } from '@/lib/social';
import { Alert } from '@/lib/alert';
import { FlipIcon } from '@/components/flip-icon';
import { ActionSheet, type SheetAction } from '@/components/action-sheet';
import { Avatar } from '@/components/avatar';
import { DishCard } from '@/components/dish-card';
import { RankBadge } from '@/components/rank-badge';
import { colors, fonts } from '@/constants/theme';
import {
  type CookProfile,
  type CookStats,
  fetchCookDishes,
  fetchCookProfile,
  fetchCookStats,
  fetchReviews,
  fetchSignatures,
  isFollowing,
  type Review,
  setFollowing,
  type Signature,
} from '@/lib/cooks';
import { confirmBlock, isBlocked, reportMember, unblockMember } from '@/lib/blocks';
import { useMyLocation } from '@/lib/location';
import { type Dish, mediaUrl, personName } from '@/lib/posts';
import { type Badge, fetchBadges } from '@/lib/rankings';
import { useSession } from '@/lib/session';
import { useLive } from '@/lib/live';
import { VerifiedTick } from '@/lib/verified';
import { tr } from '@/lib/i18n';

type Tab = 'posts' | 'today' | 'reviews';

const TABS: { key: Tab; label: string }[] = [
  { key: 'posts', label: 'Posts' },
  { key: 'today', label: "Today's menu" },
  { key: 'reviews', label: 'Reviews' },
];

/**
 * Profile from the design (flow 12): handle bar, photo, name, rating, bio, Follow and Message,
 * Communities / Followers / Following, then the tabs Posts (photo grid), Today's menu and Reviews.
 * Used for other cooks (with a back arrow) and for my own Profile tab (with my actions and a footer).
 * The rank line ("#1 in Mohandeseen") comes with the Masters, which is not in the launch build.
 */
export function CookProfileView({ id, onBack, actions, footer, barRight }: { id: string; onBack?: () => void; actions?: ReactNode; footer?: ReactNode; barRight?: ReactNode}) {
  const { session } = useSession();
  const here = useMyLocation();
  const [cook, setCook] = useState<CookProfile | null | undefined>(undefined);
  const [stats, setStats] = useState<CookStats | null>(null);
  const [tab, setTab] = useState<Tab>('posts');
  const [dishes, setDishes] = useState<Dish[] | null>(null);
  const [posts, setPosts] = useState<Signature[] | null>(null);
  const [reviews, setReviews] = useState<Review[] | null>(null);
  const [badges, setBadges] = useState<Badge[]>([]);
  const [following, setFollowingState] = useState(false);
  const [busy, setBusy] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const [menu, setMenu] = useState<{ title: string; actions: SheetAction[] } | null>(null);

  const me = session?.user.id ?? null;
  const mine = me === id;

  const load = useCallback(() => {
    fetchCookProfile(id).then(setCook, () => setCook(null));
    fetchCookStats(id).then(setStats, () => setStats(null));
    fetchCookDishes(id).then(setDishes, () => setDishes([]));
    fetchSignatures(id).then(setPosts, () => setPosts([]));
    fetchReviews(id).then(setReviews, () => setReviews([]));
    fetchBadges([id]).then((m) => setBadges(m.get(id) ?? []), () => {});
    if (me && !mine) {
      isFollowing(me, id).then(setFollowingState, () => {});
      isBlocked(id).then(setBlocked, () => {});
    }
  }, [id, me, mine]);

  // Counts, posts and reviews reload when anything changes in the app (a follow, an order, a review...) and when this screen comes back into view.
  useLive(load);

  async function onFollow() {
    if (!me) return router.push('/sign-up');
    const next = !following;
    setBusy(true);
    setFollowingState(next);
    setStats((s) => (s ? { ...s, followers: Math.max(0, s.followers + (next ? 1 : -1)) } : s));
    try {
      await setFollowing(me, id, next);
    } catch {
      setFollowingState(!next);
      fetchCookStats(id).then(setStats, () => {});
    } finally {
      setBusy(false);
    }
  }

  if (cook === undefined) {
    return (
      <SafeAreaView style={[styles.screen, styles.center]}>
        <ActivityIndicator color={colors.teal} />
      </SafeAreaView>
    );
  }
  if (!cook) {
    return (
      <SafeAreaView style={styles.screen}>
        <View style={styles.bar}>
          {onBack ? <BarIcon name="arrow-back" label="Back" onPress={onBack} /> : <View style={styles.barSlot} />}
        </View>
        <Text style={[styles.muted, { marginTop: 30, textAlign: 'center' }]}>We couldn’t find this profile.</Text>
      </SafeAreaView>
    );
  }

  const handle = cook.username ? `@${cook.username}` : personName(cook);

  // Block / unblock and report this member, from the "…" on their profile.
  function openMore() {
    if (!cook) return;
    const name = personName(cook);
    setMenu({
      title: name,
      actions: [
        blocked
          ? { label: `Unblock ${name}`, onPress: () => unblockMember(id).then(() => setBlocked(false), () => Alert.alert('We couldn’t unblock this person', 'Check your connection and try again.')) }
          : { label: `Block ${name}`, destructive: true, onPress: () => confirmBlock(name, id, () => setBlocked(true)) },
        {
          label: 'Report this member',
          destructive: true,
          onPress: () => (me ? reportMember(me, id).then(() => Alert.alert('Thanks', 'Our team will take a look.'), () => Alert.alert('We couldn’t send your report', 'Check your connection and try again.')) : undefined),
        },
      ],
    });
  }

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <View style={styles.bar}>
        {onBack ? <BarIcon name="arrow-back" label="Back" onPress={onBack} /> : <View style={styles.barSlot} />}
        <Text style={styles.handle}>{handle}</Text>
        {barRight ?? (
          <View style={styles.barRightRow}>
            <BarIcon name="ios-share" label="Share profile" onPress={() => Share.share({ message: tr(`${personName(cook)} on tabkheen A (${handle})`) }).catch(() => {})} />
            {me && !mine ? <BarIcon name="more-horiz" label="More" onPress={openMore} /> : null}
          </View>
        )}
      </View>
      <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
        <View style={styles.top}>
          <Avatar person={cook} size={86} />
          <View style={{ flex: 1, minWidth: 0 }}>
            <View style={styles.row}>
              <Text style={styles.name} numberOfLines={1}>{personName(cook)}</Text>
              <VerifiedTick id={cook.id} size={19} />
            </View>
            {badges.length ? <View style={styles.badges}>{badges.map((b) => <RankBadge key={b.kind} badge={b} />)}</View> : null}
            {cook.area && !mine ? <Text style={styles.area} numberOfLines={1}>{cook.area}</Text> : null}
            {stats?.rating != null ? (
              <Text style={styles.rating}>
                <Text style={{ color: colors.yellow }}>★</Text> {stats.rating.toFixed(1)} <Text style={styles.muted}>({stats.reviews})</Text>
              </Text>
            ) : null}
          </View>
        </View>
        {cook.bio ? <Text verbatim style={styles.bio}>{cook.bio}</Text> : null}
        {SOCIALS.some((x) => cook[x.column]) ? (
          <View style={styles.socials}>
            {SOCIALS.filter((x) => cook[x.column]).map((x) => (
              <Pressable key={x.kind} style={styles.social} onPress={() => Linking.openURL(cook[x.column]!).catch(() => null)} accessibilityRole="link" accessibilityLabel={x.label}>
                <FontAwesome5 name={x.kind} size={18} color={colors.navy} />
              </Pressable>
            ))}
          </View>
        ) : null}

        {mine ? (
          actions ? <View style={styles.btns}>{actions}</View> : null
        ) : (
          <View style={styles.btns}>
            <Pressable
              style={[styles.btn, { flex: 1, backgroundColor: following ? colors.white : colors.teal, borderWidth: 1, borderColor: following ? colors.line : colors.teal }]}
              onPress={onFollow}
              disabled={busy}
              accessibilityRole="button">
              <Text style={styles.btnText}>{following ? 'Following' : 'Follow'}</Text>
            </Pressable>
            <Pressable
              style={[styles.btn, { flex: 1, backgroundColor: colors.white, borderWidth: 1, borderColor: colors.line }]}
              onPress={() => (me ? router.push({ pathname: '/chat/[id]', params: { id } }) : router.push('/sign-up'))}
              accessibilityRole="button">
              <Text style={styles.btnText}>Message</Text>
            </Pressable>
          </View>
        )}

        <View style={styles.stats}>
          <Stat value={stats ? String(stats.communities) : '–'} label="Communities" onPress={() => router.push({ pathname: '/communities-of/[id]', params: { id } })} />
          <Stat value={stats ? String(stats.followers) : '–'} label="Followers" middle onPress={() => router.push({ pathname: '/people/[id]', params: { id, kind: 'followers' } })} />
          <Stat value={stats ? String(stats.following) : '–'} label="Following" onPress={() => router.push({ pathname: '/people/[id]', params: { id, kind: 'following' } })} />
        </View>

        <View style={styles.tabs}>
          {TABS.map((t) => (
            <Pressable key={t.key} style={[styles.tab, tab === t.key && styles.tabOn]} onPress={() => setTab(t.key)} accessibilityRole="button" accessibilityState={{ selected: tab === t.key }}>
              <Text style={[styles.tabText, tab === t.key && styles.tabTextOn]}>{t.label}</Text>
            </Pressable>
          ))}
        </View>

        {tab === 'posts' ? (
          posts === null ? (
            <ActivityIndicator color={colors.teal} style={{ marginTop: 20 }} />
          ) : posts.length ? (
            <View style={styles.grid}>
              {posts.map((p) => {
                const uri = mediaUrl(p.media_path);
                return (
                  <Pressable key={p.id} style={styles.cell} onPress={() => router.push({ pathname: '/post/[id]', params: { id: p.id, by: id } })} accessibilityRole="button" accessibilityLabel={p.caption ?? 'Signature dish'}>
                    {uri ? <Image source={{ uri }} style={StyleSheet.absoluteFill} contentFit="cover" /> : <Text verbatim style={styles.cellText} numberOfLines={5}>{p.caption}</Text>}
                  </Pressable>
                );
              })}
            </View>
          ) : (
            <Text style={styles.empty}>{mine ? 'Share your first signature dish from the Post tab.' : 'No posts yet.'}</Text>
          )
        ) : null}

        {tab === 'today' ? (
          <View style={styles.list}>
            {dishes === null ? (
              <ActivityIndicator color={colors.teal} />
            ) : dishes.length ? (
              dishes.map((d) => <DishCard key={d.id} dish={d} here={here} onPress={() => router.push({ pathname: '/dish/[id]', params: { id: d.id } })} />)
            ) : (
              <Text style={styles.empty}>Nothing on today’s menu.</Text>
            )}
          </View>
        ) : null}

        {tab === 'reviews' ? (
          <View style={styles.list}>
            {reviews === null ? (
              <ActivityIndicator color={colors.teal} />
            ) : reviews.length ? (
              reviews.map((r) => (
                <View key={r.id} style={styles.review}>
                  <View style={styles.row}>
                    <Avatar person={r.reviewer} size={32} />
                    <Text style={styles.reviewer}>{personName(r.reviewer)}</Text>
                    <View style={[styles.row, { marginLeft: 'auto' }]}>
                      <MaterialIcons name="star" size={16} color={colors.yellow} />
                      <Text style={styles.reviewer}>{r.rating}</Text>
                    </View>
                  </View>
                  {r.body ? <Text verbatim style={styles.reviewBody}>{r.body}</Text> : null}
                </View>
              ))
            ) : (
              <Text style={styles.empty}>No reviews yet.</Text>
            )}
          </View>
        ) : null}

        {footer}
      </ScrollView>
      <ActionSheet title={menu?.title ?? null} actions={menu?.actions ?? []} onClose={() => setMenu(null)} />
    </SafeAreaView>
  );
}

function BarIcon({ name, label, onPress }: { name: 'arrow-back' | 'ios-share' | 'more-horiz'; label: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} hitSlop={10} style={styles.barSlot} accessibilityRole="button" accessibilityLabel={label}>
      {name === 'arrow-back' ? <FlipIcon name={name} size={28} color={colors.ink} /> : <MaterialIcons name={name} size={28} color={colors.ink} />}
    </Pressable>
  );
}

function Stat({ value, label, middle, onPress }: { value: string; label: string; middle?: boolean; onPress: () => void }) {
  return (
    <Pressable style={[styles.stat, middle && styles.statMiddle]} onPress={onPress} accessibilityRole="button" accessibilityLabel={`${value} ${label}`}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.paper },
  center: { alignItems: 'center', justifyContent: 'center' },
  bar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 18, paddingTop: 16, paddingBottom: 6 },
  barRightRow: { flexDirection: 'row', alignItems: 'center' },
  barSlot: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  handle: { fontFamily: fonts.extraBold, fontSize: 22, color: colors.ink },
  top: { flexDirection: 'row', alignItems: 'center', gap: 16, paddingHorizontal: 22, paddingTop: 14 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  name: { fontFamily: fonts.extraBold, fontSize: 21, color: colors.ink, flexShrink: 1 },
  badges: { gap: 5, marginTop: 4 },
  area: { fontFamily: fonts.semiBold, fontSize: 13.5, color: colors.muted, marginTop: 2 },
  rating: { fontFamily: fonts.bold, fontSize: 13.5, color: colors.ink, marginTop: 3 },
  muted: { fontFamily: fonts.semiBold, fontSize: 13, color: colors.muted },
  socials: { flexDirection: 'row', gap: 10, paddingHorizontal: 22, paddingTop: 10 },
  social: { width: 38, height: 38, borderRadius: 19, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.white, alignItems: 'center', justifyContent: 'center' },
  bio: { fontFamily: fonts.medium, fontSize: 13.5, lineHeight: 19, color: colors.ink, paddingHorizontal: 22, paddingTop: 12 },
  btns: { flexDirection: 'row', gap: 8, paddingHorizontal: 22, paddingTop: 14 },
  btn: { borderRadius: 12, paddingVertical: 11, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 6 },
  btnText: { fontFamily: fonts.extraBold, fontSize: 14, color: colors.ink },
  stats: { flexDirection: 'row', marginHorizontal: 22, marginTop: 16 },
  stat: { flex: 1, alignItems: 'center' },
  statMiddle: { borderLeftWidth: 1, borderRightWidth: 1, borderColor: colors.line },
  statValue: { fontFamily: fonts.extraBold, fontSize: 17, color: colors.ink },
  statLabel: { fontFamily: fonts.semiBold, fontSize: 12.5, color: colors.muted },
  tabs: { flexDirection: 'row', marginTop: 14, borderBottomWidth: 1, borderBottomColor: colors.line },
  tab: { flex: 1, alignItems: 'center', paddingTop: 11, paddingBottom: 10, borderBottomWidth: 2, borderBottomColor: 'transparent' },
  tabOn: { borderBottomColor: colors.ink },
  tabText: { fontFamily: fonts.semiBold, fontSize: 14, color: colors.muted },
  tabTextOn: { fontFamily: fonts.extraBold, color: colors.ink },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingHorizontal: 22, paddingTop: 12, paddingBottom: 20 },
  cell: { width: '48.5%', aspectRatio: 1, borderRadius: 12, overflow: 'hidden', backgroundColor: colors.cream, padding: 10, justifyContent: 'center' },
  cellText: { fontFamily: fonts.medium, fontSize: 13, color: colors.ink },
  list: { gap: 12, paddingHorizontal: 22, paddingTop: 14 },
  empty: { fontFamily: fonts.semiBold, fontSize: 13, color: colors.muted, textAlign: 'center', paddingTop: 22, paddingHorizontal: 22 },
  review: { backgroundColor: colors.white, borderRadius: 16, borderWidth: 1, borderColor: colors.line, padding: 12, gap: 6 },
  reviewer: { fontFamily: fonts.bold, fontSize: 13.5, color: colors.ink },
  reviewBody: { fontFamily: fonts.medium, fontSize: 14, color: colors.ink },
});
