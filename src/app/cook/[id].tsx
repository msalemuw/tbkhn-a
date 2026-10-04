import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Avatar } from '@/components/avatar';
import { Chip } from '@/components/chip';
import { DishCard } from '@/components/dish-card';
import { BackHeader, formStyles, PrimaryButton } from '@/components/form';
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

// Flow 12: cook profile. Photo, name, area, bio, Follow, stats and the tabs Posts, What's cooking today, Reviews.
// The rank badge ("#1 in Mohandeseen") comes with the Masters, which is not in the launch build.
export default function CookScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { session } = useSession();
  const here = useMyLocation();
  const [cook, setCook] = useState<CookProfile | null | undefined>(undefined);
  const [stats, setStats] = useState<CookStats | null>(null);
  const [tab, setTab] = useState<Tab>('today');
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
        <View style={styles.pad}>
          <BackHeader />
          <Text style={[formStyles.sub, { marginTop: 30 }]}>We couldn’t find this cook.</Text>
        </View>
      </SafeAreaView>
    );
  }

  const where = [cook.area, cook.governorate].filter(Boolean).join(', ');

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
        <View style={styles.pad}>
          <BackHeader />
          <View style={styles.head}>
            <Avatar person={cook} size={84} />
            <Text style={styles.name}>{personName(cook)}</Text>
            {cook.username ? <Text style={styles.muted}>@{cook.username}</Text> : null}
            {where ? (
              <View style={styles.row}>
                <MaterialIcons name="location-on" size={14} color={colors.muted} />
                <Text style={styles.muted}>{where}</Text>
              </View>
            ) : null}
            {cook.bio ? <Text style={styles.bio}>{cook.bio}</Text> : null}
          </View>

          <View style={styles.stats}>
            <Stat value={stats ? String(stats.followers) : '–'} label="Followers" />
            <Stat value={stats?.rating != null ? stats.rating.toFixed(1) : '–'} label="Rating" star />
            <Stat value={stats ? String(stats.reviews) : '–'} label="Reviews" />
          </View>

          {mine ? null : <PrimaryButton label={following ? 'Following' : 'Follow'} onPress={onFollow} busy={busy} />}

          <View style={styles.tabs}>
            <Chip label="Posts" on={tab === 'posts'} onPress={() => setTab('posts')} />
            <Chip label="What’s cooking today" on={tab === 'today'} onPress={() => setTab('today')} />
            <Chip label="Reviews" on={tab === 'reviews'} onPress={() => setTab('reviews')} />
          </View>

          {tab === 'today' ? (
            <List loading={dishes === null} empty="Nothing cooking today.">
              {dishes?.map((d) => (
                <DishCard key={d.id} dish={d} here={here} onPress={() => router.push({ pathname: '/dish/[id]', params: { id: d.id } })} />
              ))}
            </List>
          ) : null}

          {tab === 'posts' ? (
            <List loading={posts === null} empty="No posts yet.">
              {posts?.map((p) => {
                const uri = mediaUrl(p.media_path);
                return (
                  <View key={p.id} style={styles.post}>
                    {uri ? <Image source={{ uri }} style={styles.postPhoto} contentFit="cover" /> : null}
                    {p.caption ? <Text style={styles.postText}>{p.caption}</Text> : null}
                  </View>
                );
              })}
            </List>
          ) : null}

          {tab === 'reviews' ? (
            <List loading={reviews === null} empty="No reviews yet.">
              {reviews?.map((r) => (
                <View key={r.id} style={styles.review}>
                  <View style={styles.row}>
                    <Avatar person={r.reviewer} size={32} />
                    <Text style={styles.reviewer}>{personName(r.reviewer)}</Text>
                    <View style={[styles.row, { marginLeft: 'auto' }]}>
                      <MaterialIcons name="star" size={16} color={colors.yellow} />
                      <Text style={styles.reviewer}>{r.rating}</Text>
                    </View>
                  </View>
                  {r.body ? <Text style={styles.postText}>{r.body}</Text> : null}
                </View>
              ))}
            </List>
          ) : null}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function Stat({ value, label, star }: { value: string; label: string; star?: boolean }) {
  return (
    <View style={styles.stat}>
      <View style={styles.row}>
        {star ? <MaterialIcons name="star" size={18} color={colors.yellow} /> : null}
        <Text style={styles.statValue}>{value}</Text>
      </View>
      <Text style={styles.muted}>{label}</Text>
    </View>
  );
}

function List({ loading, empty, children }: { loading: boolean; empty: string; children: React.ReactNode }) {
  const items = Array.isArray(children) ? children.filter(Boolean) : children ? [children] : [];
  return (
    <View style={{ gap: 12, marginTop: 14 }}>
      {loading ? <ActivityIndicator color={colors.teal} /> : items.length ? children : <Text style={[styles.muted, { textAlign: 'center' }]}>{empty}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.paper },
  center: { alignItems: 'center', justifyContent: 'center' },
  pad: { paddingHorizontal: 22 },
  head: { alignItems: 'center', gap: 4, paddingVertical: 12 },
  name: { fontFamily: fonts.extraBold, fontSize: 22, color: colors.ink, marginTop: 8 },
  muted: { fontFamily: fonts.semiBold, fontSize: 13, color: colors.muted },
  bio: { fontFamily: fonts.medium, fontSize: 14.5, color: colors.ink, textAlign: 'center', marginTop: 6 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  stats: { flexDirection: 'row', justifyContent: 'space-around', paddingVertical: 14 },
  stat: { alignItems: 'center', gap: 2 },
  statValue: { fontFamily: fonts.extraBold, fontSize: 18, color: colors.ink },
  tabs: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 18 },
  post: { backgroundColor: colors.white, borderRadius: 18, borderWidth: 1, borderColor: colors.line, overflow: 'hidden' },
  postPhoto: { width: '100%', aspectRatio: 1.4, backgroundColor: colors.cream },
  postText: { fontFamily: fonts.medium, fontSize: 14, color: colors.ink, padding: 12 },
  review: { backgroundColor: colors.white, borderRadius: 18, borderWidth: 1, borderColor: colors.line, padding: 12, gap: 6 },
  reviewer: { fontFamily: fonts.bold, fontSize: 13.5, color: colors.ink },
});
