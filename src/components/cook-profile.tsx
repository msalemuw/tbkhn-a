import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { type ReactNode, useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Share, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Avatar } from '@/components/avatar';
import { DishCard } from '@/components/dish-card';
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
import { useMyLocation } from '@/lib/location';
import { type Dish, mediaUrl, personName } from '@/lib/posts';
import { useSession } from '@/lib/session';

type Tab = 'posts' | 'today' | 'reviews';

const TABS: { key: Tab; label: string }[] = [
  { key: 'posts', label: 'Posts' },
  { key: 'today', label: 'Cooking today' },
  { key: 'reviews', label: 'Reviews' },
];

/**
 * Profile from the design (flow 12): handle bar, photo, name, rating, bio, Follow and Message,
 * Communities / Followers / Following, then the tabs Posts (photo grid), Cooking today and Reviews.
 * Used for other cooks (with a back arrow) and for my own Profile tab (with my actions and a footer).
 * The rank line ("#1 in Mohandeseen") comes with the Masters, which is not in the launch build.
 */
export function CookProfileView({ id, onBack, actions, footer }: { id: string; onBack?: () => void; actions?: ReactNode; footer?: ReactNode }) {
  const { session } = useSession();
  const here = useMyLocation();
  const [cook, setCook] = useState<CookProfile | null | undefined>(undefined);
  const [stats, setStats] = useState<CookStats | null>(null);
  const [tab, setTab] = useState<Tab>('posts');
  const [dishes, setDishes] = useState<Dish[] | null>(null);
  const [posts, setPosts] = useState<Signature[] | null>(null);
  const [reviews, setReviews] = useState<Review[] | null>(null);
  const [following, setFollowingState] = useState(false);
  const [busy, setBusy] = useState(false);

  const me = session?.user.id ?? null;
  const mine = me === id;

  const load = useCallback(() => {
    fetchCookProfile(id).then(setCook, () => setCook(null));
    fetchCookStats(id).then(setStats, () => setStats(null));
    fetchCookDishes(id).then(setDishes, () => setDishes([]));
    fetchSignatures(id).then(setPosts, () => setPosts([]));
    fetchReviews(id).then(setReviews, () => setReviews([]));
  }, [id]);

  useEffect(load, [load]);
  useEffect(() => {
    if (me && !mine) isFollowing(me, id).then(setFollowingState, () => {});
  }, [me, mine, id]);

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

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <View style={styles.bar}>
        {onBack ? <BarIcon name="arrow-back" label="Back" onPress={onBack} /> : <View style={styles.barSlot} />}
        <Text style={styles.handle}>{handle}</Text>
        <BarIcon name="ios-share" label="Share profile" onPress={() => Share.share({ message: `${personName(cook)} on tabkheen A (${handle})` }).catch(() => {})} />
      </View>
      <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
        <View style={styles.top}>
          <Avatar person={cook} size={86} />
          <View style={{ flex: 1, minWidth: 0 }}>
            <View style={styles.row}>
              <Text style={styles.name} numberOfLines={1}>{personName(cook)}</Text>
              <MaterialIcons name="verified" size={19} color={colors.teal} />
            </View>
            {cook.area ? <Text style={styles.area} numberOfLines={1}>{cook.area}</Text> : null}
            {stats?.rating != null ? (
              <Text style={styles.rating}>
                <Text style={{ color: colors.yellow }}>★</Text> {stats.rating.toFixed(1)} <Text style={styles.muted}>({stats.reviews})</Text>
              </Text>
            ) : null}
          </View>
        </View>
        {cook.bio ? <Text style={styles.bio}>{cook.bio}</Text> : null}

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
          <Stat value={stats ? String(stats.communities) : '–'} label="Communities" />
          <Stat value={stats ? String(stats.followers) : '–'} label="Followers" middle />
          <Stat value={stats ? String(stats.following) : '–'} label="Following" />
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
                  <View key={p.id} style={styles.cell}>
                    {uri ? <Image source={{ uri }} style={StyleSheet.absoluteFill} contentFit="cover" accessibilityLabel={p.caption ?? 'Signature dish'} /> : <Text style={styles.cellText} numberOfLines={5}>{p.caption}</Text>}
                  </View>
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
              <Text style={styles.empty}>Nothing cooking today.</Text>
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
                  {r.body ? <Text style={styles.reviewBody}>{r.body}</Text> : null}
                </View>
              ))
            ) : (
              <Text style={styles.empty}>No reviews yet.</Text>
            )}
          </View>
        ) : null}

        {footer}
      </ScrollView>
    </SafeAreaView>
  );
}

function BarIcon({ name, label, onPress }: { name: 'arrow-back' | 'ios-share'; label: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} hitSlop={10} style={styles.barSlot} accessibilityRole="button" accessibilityLabel={label}>
      <MaterialIcons name={name} size={24} color={colors.ink} />
    </Pressable>
  );
}

function Stat({ value, label, middle }: { value: string; label: string; middle?: boolean }) {
  return (
    <View style={[styles.stat, middle && styles.statMiddle]}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.paper },
  center: { alignItems: 'center', justifyContent: 'center' },
  bar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 18, paddingTop: 4, paddingBottom: 2 },
  barSlot: { width: 28, height: 28, alignItems: 'center', justifyContent: 'center' },
  handle: { fontFamily: fonts.bold, fontSize: 14, color: colors.ink },
  top: { flexDirection: 'row', alignItems: 'center', gap: 16, paddingHorizontal: 22, paddingTop: 14 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  name: { fontFamily: fonts.extraBold, fontSize: 21, color: colors.ink, flexShrink: 1 },
  area: { fontFamily: fonts.semiBold, fontSize: 13.5, color: colors.muted, marginTop: 2 },
  rating: { fontFamily: fonts.bold, fontSize: 13.5, color: colors.ink, marginTop: 3 },
  muted: { fontFamily: fonts.semiBold, fontSize: 13, color: colors.muted },
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
