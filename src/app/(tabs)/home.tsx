import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { router, useFocusEffect } from 'expo-router';
import { setStatusBarStyle } from 'expo-status-bar';
import { useCallback, useMemo, useState } from 'react';
import { Alert, FlatList, Pressable, RefreshControl, Share, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { CommentsSheet } from '@/components/comments-sheet';
import { LikesSheet } from '@/components/likes-sheet';
import { Logo } from '@/components/logo';
import { PostCard } from '@/components/post-card';
import { type Badge, fetchBadges } from '@/lib/rankings';
import { FadeBg } from '@/components/fade-bg';
import { StoriesRow } from '@/components/stories-row';
import { type Watching, WatchingSheet } from '@/components/watching-sheet';
import { colors, fonts, ui } from '@/constants/theme';
import { deletePost, type FeedPost, fetchFeed, fetchFollowing, fetchLiveDistances, reportPost, setLiked } from '@/lib/feed';
import { distanceMeters } from '@/lib/format';
import { useDataVersion } from '@/lib/live';
import { reportMyPosition, useMyLocation, usePlace } from '@/lib/location';
import { unreadMessageCount } from '@/lib/chat';
import { unreadNotificationCount } from '@/lib/notifications';
import { fetchMyCommunities, type MyCommunity, personName } from '@/lib/posts';
import { useSession } from '@/lib/session';
import { fetchStories, loadSeen, type StoryGroup } from '@/lib/stories';
import { supabaseConfigured } from '@/lib/supabase';

// Screen s6: Home is the social feed (design flow 15): signature dishes from the communities and cooks you watch.
// Today’s menu and ordering live on the Menu tab.

export default function Home() {
  const { session } = useSession();
  const me = session?.user.id ?? null;
  const { place } = usePlace();
  const here = useMyLocation();
  const [unread, setUnread] = useState(0);
  const [posts, setPosts] = useState<FeedPost[]>([]);
  const [stories, setStories] = useState<StoryGroup[]>([]);
  const [seen, setSeen] = useState<string[]>([]);
  const [mine, setMine] = useState<MyCommunity[]>([]);
  const [following, setFollowing] = useState<string[]>([]);
  const [watching, setWatching] = useState<Watching | null>(null);
  const [watchOpen, setWatchOpen] = useState(false);
  const [commentsFor, setCommentsFor] = useState<string | null>(null);
  const [likesFor, setLikesFor] = useState<string | null>(null);
  const [meters, setMeters] = useState<Map<string, number>>(new Map());
  const [badges, setBadges] = useState<Map<string, Badge[]>>(new Map());
  const [loading, setLoading] = useState(true);
  // Only a pull-down shows the spinner. Showing it for the automatic loads pushes the whole list down and leaves a blank gap.
  const [pulling, setPulling] = useState(false);
  const [failed, setFailed] = useState(false);

  const dataVersion = useDataVersion();
  const load = useCallback(async () => {
    if (!supabaseConfigured) return setLoading(false);
    setLoading(true);
    try {
      const [feed, communities, follows, groups, seenIds] = await Promise.all([
        fetchFeed(me),
        me ? fetchMyCommunities(me) : Promise.resolve([]),
        me ? fetchFollowing(me) : Promise.resolve([]),
        fetchStories(me).catch(() => [] as StoryGroup[]),
        loadSeen(),
      ]);
      setPosts(feed);
      // Rank badges are a nicety: the feed shows without them if they fail to load.
      fetchBadges(feed.map((p) => p.author_id)).then(setBadges, () => {});
      // Live distance to each cook: my GPS now against their last known position. A nicety too.
      reportMyPosition()
        .then((pos) => (pos ? fetchLiveDistances(feed.map((p) => p.author_id), pos) : new Map<string, number>()))
        .then(setMeters, () => {});
      setStories(groups);
      setSeen(seenIds);
      setMine(communities);
      setFollowing(follows);
      // Start by watching everything; the member's choice is kept while the screen stays mounted.
      setWatching((w) => w ?? { communities: communities.map((c) => c.id), nearby: true, following: true });
      setFailed(false);
    } catch {
      setFailed(true);
    }
    setLoading(false);
  }, [me]);

  useFocusEffect(
    useCallback(() => {
      setStatusBarStyle('dark');
      load();
    }, [load]),
  );

  // The unread dot follows new messages and notifications as they arrive.
  useFocusEffect(
    useCallback(() => {
      if (me) Promise.all([unreadMessageCount(), unreadNotificationCount()]).then(([m, n]) => setUnread(m + n), () => null);
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [me, dataVersion]),
  );

  const all = !watching || (watching.nearby && watching.following && mine.every((c) => watching.communities.includes(c.id)));
  const shown = useMemo(() => {
    if (!watching) return posts.filter((p) => p.author_id !== me);
    // Home is for other cooks' posts; the member's own live on their Profile.
    const list = posts.filter(
      (p) =>
        p.author_id !== me &&
        ((p.community_ids.length ? p.community_ids.some((c) => watching.communities.includes(c)) : watching.nearby) ||
          (watching.following && following.includes(p.author_id))),
    );
    // Nearby: public posts come after the community and followed posts, closest cooks first, farther ones at the end.
    // Posts with no known pickup spot (or no known location for me) go last, so no public post is ever lost.
    if (!watching.nearby || !here) return list;
    const isPublic = (p: FeedPost) => !p.community_ids.length && p.author_id !== me && !(watching.following && following.includes(p.author_id));
    const dist = (p: FeedPost) => meters.get(p.author_id) ?? (p.spot ? distanceMeters(here, p.spot) : Infinity);
    return [...list.filter((p) => !isPublic(p)), ...list.filter(isPublic).sort((a, b) => dist(a) - dist(b))];
  }, [posts, watching, following, me, here, meters]);

  const patch = (id: string, f: (p: FeedPost) => FeedPost) => setPosts((list) => list.map((p) => (p.id === id ? f(p) : p)));

  async function onLike(p: FeedPost) {
    if (!me) return router.push('/sign-up');
    const next = !p.liked;
    patch(p.id, (x) => ({ ...x, liked: next, likes: Math.max(0, x.likes + (next ? 1 : -1)) }));
    try {
      await setLiked(me, p.id, next);
    } catch {
      patch(p.id, (x) => ({ ...x, liked: !next, likes: Math.max(0, x.likes + (next ? -1 : 1)) }));
    }
  }

  function onShare(p: FeedPost) {
    const text = p.caption ? `${personName(p.author)} on tabkheen A: ${p.caption}` : `${personName(p.author)}’s signature dish on tabkheen A`;
    Share.share({ message: text }).catch(() => null);
  }

  function onMore(p: FeedPost) {
    const buttons = [
      { text: 'View profile', onPress: () => router.push({ pathname: '/cook/[id]', params: { id: p.author_id } }) },
      p.author_id === me
        ? {
            text: 'Delete post',
            style: 'destructive' as const,
            onPress: () =>
              deletePost(p.id).then(
                () => setPosts((l) => l.filter((x) => x.id !== p.id)),
                () => Alert.alert('We couldn’t delete the post', 'Check your connection and try again.'),
              ),
          }
        : {
            text: 'Report post',
            style: 'destructive' as const,
            onPress: () => (me ? reportPost(me, p.id).then(() => Alert.alert('Thanks', 'Our team will take a look.'), () => null) : router.push('/sign-up')),
          },
      { text: 'Cancel', style: 'cancel' as const },
    ];
    Alert.alert(personName(p.author), undefined, buttons);
  }

  const empty = !supabaseConfigured
    ? 'The app isn’t connected to the server yet.'
    : failed
      ? 'We couldn’t load the feed. Pull down to try again.'
      : loading
        ? ''
        : posts.length
          ? 'No posts match your feed filter. Change “Feed filter” to see more.'
          : 'No posts yet. Share your signature dish from the Post tab, or follow cooks near you.';

  return (
    <View style={styles.screen}>
      <SafeAreaView edges={['top']} style={{ backgroundColor: ui.card }}>
        <View style={styles.header}>
          <Logo on="light" height={28} />
          <Pressable accessibilityLabel={unread ? `Inbox, ${unread} new` : 'Inbox'} onPress={() => router.push('/inbox')} hitSlop={8}>
            <MaterialIcons name="mail-outline" size={26} color={ui.deep} />
            {unread > 0 ? <View style={styles.dot} /> : null}
          </Pressable>
        </View>
      </SafeAreaView>
      <FlatList
        data={shown}
        keyExtractor={(p) => p.id}
        renderItem={({ item }) => (
          <PostCard
            post={item}
            badges={badges.get(item.author_id)}
            meters={meters.get(item.author_id) ?? null}
            onLike={() => onLike(item)}
            onLikes={() => setLikesFor(item.id)}
            onComments={() => setCommentsFor(item.id)}
            onShare={() => onShare(item)}
            onMore={() => onMore(item)}
          />
        )}
        refreshControl={<RefreshControl refreshing={pulling} onRefresh={() => { setPulling(true); load().finally(() => setPulling(false)); }} tintColor={colors.teal} />}
        ListHeaderComponent={
          // White at the top (like the header) fading to the cream page by the time the first post starts.
          <View>
            <FadeBg from={[255, 255, 255]} to={PAGE_RGB} />
            <StoriesRow groups={stories} seen={seen} me={me} onOpen={(id) => router.push({ pathname: '/story/[id]', params: { id } })} onAdd={() => router.push('/compose/story')} />
            <View style={styles.bar}>
              <Pressable style={styles.loc} onPress={() => router.push('/location')} accessibilityLabel="Choose your location">
                <MaterialIcons name="location-on" size={18} color={colors.teal} />
                <Text style={styles.locText} numberOfLines={1}>{place?.label || 'Location'}</Text>
                <MaterialIcons name="expand-more" size={20} color={colors.muted} />
              </Pressable>
              <Pressable style={styles.watch} onPress={() => setWatchOpen(true)} accessibilityRole="button" accessibilityLabel="Filter the feed">
                <MaterialIcons name="tune" size={18} color={colors.white} />
                <Text style={styles.watchText}>Feed filter: {all ? 'Everyone' : 'Custom'}</Text>
                <MaterialIcons name="expand-more" size={18} color={colors.white} />
              </Pressable>
            </View>
          </View>
        }
        ListEmptyComponent={empty ? <Text style={styles.empty}>{empty}</Text> : null}
        contentContainerStyle={{ flexGrow: 1, backgroundColor: ui.page, paddingBottom: 20 }}
      />
      {watching ? <WatchingSheet visible={watchOpen} mine={mine} value={watching} onChange={setWatching} onClose={() => setWatchOpen(false)} /> : null}
      <LikesSheet postId={likesFor} onClose={() => setLikesFor(null)} />
      <CommentsSheet postId={commentsFor} me={me} onClose={() => setCommentsFor(null)} onAdded={(id) => patch(id, (x) => ({ ...x, comments: x.comments + 1 }))} />
    </View>
  );
}

const PAGE_RGB: [number, number, number] = [246, 242, 236]; // ui.page (#f6f2ec)

const styles = StyleSheet.create({
  // White behind the list so pulling down reveals white (the header's colour), not cream; the cream lives on the list content.
  screen: { flex: 1, backgroundColor: ui.card },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 18, paddingTop: 8, paddingBottom: 12, backgroundColor: ui.card },
  dot: { position: 'absolute', top: -1, right: -2, width: 10, height: 10, borderRadius: 5, backgroundColor: colors.yellow, borderWidth: 1.5, borderColor: ui.card },
  // Location and Feed filter share one soft white card above the posts, as in the design.
  bar: { paddingHorizontal: 18, paddingTop: 6, paddingBottom: 12, gap: 12, alignItems: 'flex-start' },
  loc: { flexDirection: 'row', alignItems: 'center', gap: 4, maxWidth: '100%' },
  locText: { flexShrink: 1, fontFamily: fonts.extraBold, fontSize: 17, color: ui.deep },
  watch: { flexDirection: 'row', alignItems: 'center', gap: 7, backgroundColor: ui.deep, borderRadius: 999, paddingHorizontal: 16, paddingVertical: 11 },
  watchText: { fontFamily: fonts.bold, fontSize: 14, color: colors.white },
  empty: { fontFamily: fonts.semiBold, fontSize: 14, color: colors.muted, textAlign: 'center', marginTop: 40, paddingHorizontal: 30, lineHeight: 20 },
});
