import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { router, useFocusEffect } from 'expo-router';
import { startCompose } from '@/lib/photo-flow';
import { setStatusBarStyle } from 'expo-status-bar';
import { useCallback, useMemo, useRef, useState } from 'react';
import { FlatList, Pressable, RefreshControl, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AlertHealthNotice, WaitingRequestsBar } from '@/components/request-alerts';

import { Text, TextInput } from '@/components/text';
import { Alert } from '@/lib/alert';
import { ActionSheet, type SheetAction } from '@/components/action-sheet';
import { CommentsSheet } from '@/components/comments-sheet';
import { LikesSheet } from '@/components/likes-sheet';
import { Logo } from '@/components/logo';
import { PostCard } from '@/components/post-card';
import { PostPager } from '@/components/post-pager';
import { type Badge, fetchBadges } from '@/lib/rankings';
import { fetchMemberships } from '@/lib/community';
import { FadeBg } from '@/components/fade-bg';
import { StoriesRow } from '@/components/stories-row';
import { type Watching, WatchingSheet } from '@/components/watching-sheet';
import { colors, fonts, ui } from '@/constants/theme';
import { deletePost, type FeedPost, fetchFeed, fetchFollowing, fetchLiveDistances, reportPost, setLiked, setSaved } from '@/lib/feed';
import { refreshCritics, useCriticIds } from '@/lib/critics';
import { refreshVerified } from '@/lib/verified';
import { distanceMeters } from '@/lib/format';
import { loadSeenPosts, markPostsSeen, rankFeed } from '@/lib/feed-rank';
import { useDataVersion } from '@/lib/live';
import { reportMyPosition, useMyLocation } from '@/lib/location';
import { unreadMessageCount } from '@/lib/chat';
import { unreadNotificationCount } from '@/lib/notifications';
import { fetchMyCommunities, type MyCommunity, personName } from '@/lib/posts';
import { useSession } from '@/lib/session';
import { confirmBlock } from '@/lib/blocks';
import { fetchStories, loadSeen, type StoryGroup } from '@/lib/stories';
import { supabaseConfigured } from '@/lib/supabase';
import { shareLink } from '@/lib/share';
import { usePullRefresh } from '@/lib/pull-refresh';
import { useRetap } from '@/lib/tab-retap';

// Screen s6: Home is the social feed (design flow 15): signature dishes from the communities and cooks you watch.
// Today’s menu and ordering live on the Menu tab.

// A post counts as seen once it has been on screen for a moment; it then ranks lower the next time Home loads.
// Module level so the list gets the same function on every render.
function onViewable({ viewableItems }: { viewableItems: { item: FeedPost }[] }) {
  const ids = viewableItems.map((v) => v.item.id);
  if (ids.length) void markPostsSeen(ids);
}
const VIEW_CONFIG = { itemVisiblePercentThreshold: 60, minimumViewTime: 1000 };

export default function Home() {
  const { session } = useSession();
  const me = session?.user.id ?? null;
  const here = useMyLocation();
  const [unreadMsgs, setUnreadMsgs] = useState(0);
  const [unreadNotes, setUnreadNotes] = useState(0);
  const [posts, setPosts] = useState<FeedPost[]>([]);
  // The full-screen pager keeps the posts it opened with (and where it started), so a reload or a re-sort can never move or close it.
  const [pager, setPager] = useState<{ ids: string[]; start: number } | null>(null);
  const [stories, setStories] = useState<StoryGroup[]>([]);
  const [seen, setSeen] = useState<string[]>([]);
  // Posts already seen on this phone, and a seed that changes on every load: they order the feed (see feed-rank.ts).
  const [seenPosts, setSeenPosts] = useState<Set<string>>(new Set());
  const [seed, setSeed] = useState(() => Math.floor(Math.random() * 1e9));
  const [mine, setMine] = useState<MyCommunity[]>([]);
  const [following, setFollowing] = useState<string[]>([]);
  const [watching, setWatching] = useState<Watching | null>(null);
  const criticIds = useCriticIds();
  // Which communities each cook belongs to: a cook shows under a community they live in even when a post was shared publicly.
  const [memberships, setMemberships] = useState<Map<string, string[]>>(new Map());
  const [watchOpen, setWatchOpen] = useState(false);
  const [commentsFor, setCommentsFor] = useState<string | null>(null);
  const [likesFor, setLikesFor] = useState<string | null>(null);
  const [menu, setMenu] = useState<{ title: string; actions: SheetAction[] } | null>(null);
  const [meters, setMeters] = useState<Map<string, number>>(new Map());
  const [badges, setBadges] = useState<Map<string, Badge[]>>(new Map());
  const [loading, setLoading] = useState(true);
  // Only a pull-down shows the spinner. Showing it for the automatic loads pushes the whole list down and leaves a blank gap.
  const [failed, setFailed] = useState(false);

  const dataVersion = useDataVersion();
  const load = useCallback(async () => {
    if (!supabaseConfigured) return setLoading(false);
    setLoading(true);
    // Pull to refresh (and coming back to Home) also picks up newly verified members and critics.
    void refreshVerified();
    void refreshCritics();
    try {
      const [feed, communities, follows, groups, seenIds, seenPostIds] = await Promise.all([
        fetchFeed(me),
        me ? fetchMyCommunities(me) : Promise.resolve([]),
        me ? fetchFollowing(me) : Promise.resolve([]),
        fetchStories(me).catch(() => [] as StoryGroup[]),
        loadSeen(),
        loadSeenPosts(),
      ]);
      setSeenPosts(seenPostIds);
      setSeed(Math.floor(Math.random() * 1e9));
      setPosts(feed);
      // Rank badges are a nicety: the feed shows without them if they fail to load.
      fetchBadges(feed.map((p) => p.author_id)).then(setBadges, () => {});
      fetchMemberships(feed.map((p) => p.author_id)).then(setMemberships, () => {});
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

  const pull = usePullRefresh(load);
  const listRef = useRef<FlatList<FeedPost>>(null);
  // Tapping Home while on Home: back to the top and refresh. The filter and everything else stay as they are.
  useRetap('home', () => {
    // Tapping Home inside the full-screen view goes back to the feed.
    setPager(null);
    listRef.current?.scrollToOffset({ offset: 0, animated: true });
    pull.reload();
  });
  useFocusEffect(
    useCallback(() => {
      setStatusBarStyle('dark');
      load();
    }, [load]),
  );

  // The unread dot follows new messages and notifications as they arrive.
  useFocusEffect(
    useCallback(() => {
      if (me)
        Promise.all([unreadMessageCount(), unreadNotificationCount()]).then(
          ([m, n]) => {
            setUnreadMsgs(m);
            setUnreadNotes(n);
          },
          () => null,
        );
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [me, dataVersion]),
  );

  const all = !watching?.criticsOnly && !watching?.recipesOnly && (!watching || (watching.nearby && watching.following && mine.every((c) => watching.communities.includes(c.id))));
  const rankedAll = useMemo(() => {
    if (!watching) return posts.filter((p) => p.author_id !== me);
    // "Critics near me": only approved critics' posts, closest first (those with no known spot go last).
    if (watching.criticsOnly) {
      const list = posts.filter((p) => p.author_id !== me && !!criticIds?.has(p.author_id));
      if (!here) return list;
      const d = (p: FeedPost) => meters.get(p.author_id) ?? (p.spot ? distanceMeters(here, p.spot) : Infinity);
      return [...list].sort((a, b) => d(a) - d(b));
    }
    // Home is for other cooks' posts; the member's own live on their Profile.
    const list = posts.filter(
      (p) =>
        p.author_id !== me &&
        (p.community_ids.some((c) => watching.communities.includes(c)) ||
          (memberships.get(p.author_id) ?? []).some((c) => watching.communities.includes(c)) ||
          (!p.community_ids.length && watching.nearby) ||
          (watching.following && following.includes(p.author_id))),
    );
    // Ranked by closeness, who I follow, shared communities, freshness and likes, minus posts I already saw, with a little
    // shuffle each load (feed-rank.ts). Posts with no known pickup spot (or no known location for me) just score lower on distance.
    const dist = (p: FeedPost) => (here ? meters.get(p.author_id) ?? (p.spot ? distanceMeters(here, p.spot) : Infinity) : Infinity);
    return rankFeed(list, {
      distance: dist,
      useDistance: watching.nearby,
      following: new Set(watching.following ? following : []),
      inCommunity: (p) => p.community_ids.some((c) => watching.communities.includes(c)) || (memberships.get(p.author_id) ?? []).some((c) => watching.communities.includes(c)),
      seen: seenPosts,
      seed,
    });
  }, [posts, watching, following, me, here, meters, memberships, criticIds, seenPosts, seed]);
  // "Only posts with a recipe" is applied on top of whatever else the filter picked.
  const ranked = useMemo(() => (watching?.recipesOnly ? rankedAll.filter((p) => !!p.recipe) : rankedAll), [rankedAll, watching?.recipesOnly]);
  // Search inside the feed: a dish or any word in the caption, or the cook's name (matches the posts already shown).
  // A cook with a live story gets a ring on their post avatar (bright until you have seen it), like Instagram.
  const storyOf = (authorId: string): 'unseen' | 'seen' | null => {
    const g = stories.find((x) => x.author.id === authorId);
    if (!g || !g.items.length) return null;
    return g.items.some((i) => !seen.includes(i.id)) ? 'unseen' : 'seen';
  };
  const [q, setQ] = useState('');
  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return ranked;
    return ranked.filter((p) => `${p.caption ?? ''} ${personName(p.author)} ${p.author.username ?? ''}`.toLowerCase().includes(needle));
  }, [ranked, q]);

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

  async function onSave(p: FeedPost) {
    if (!me) return router.push('/sign-up');
    const next = !p.saved;
    patch(p.id, (x) => ({ ...x, saved: next }));
    try {
      await setSaved(me, p.id, next);
    } catch {
      patch(p.id, (x) => ({ ...x, saved: !next }));
    }
  }

  function onShare(p: FeedPost) {
    const text = p.caption ? `${personName(p.author)} on tabkheen A: ${p.caption}` : `${personName(p.author)}’s signature dish on tabkheen A`;
    shareLink('post', p.id, text, p.author_id);
  }

  function onMore(p: FeedPost) {
    const name = personName(p.author);
    const mine = p.author_id === me;
    const actions: SheetAction[] = [{ label: 'View profile', onPress: () => router.push({ pathname: '/cook/[id]', params: { id: p.author_id } }) }];
    if (mine) {
      actions.push({
        label: 'Delete post',
        destructive: true,
        onPress: () =>
          deletePost(p.id).then(
            () => setPosts((l) => l.filter((x) => x.id !== p.id)),
            () => Alert.alert('We couldn’t delete the post', 'Check your connection and try again.'),
          ),
      });
    } else {
      actions.push(
        {
          label: 'Report post',
          destructive: true,
          onPress: () => (me ? reportPost(me, p.id).then(() => Alert.alert('Thanks', 'Our team will take a look.'), () => null) : router.push('/sign-up')),
        },
        {
          label: `Block ${name}`,
          destructive: true,
          onPress: () => (me ? confirmBlock(name, p.author_id, () => { setPosts((l) => l.filter((x) => x.author_id !== p.author_id)); load(); }) : router.push('/sign-up')),
        },
      );
    }
    setMenu({ title: name, actions });
  }

  // One post card; the feed shows it square, the full-screen pager in its own shape.
  const card = (item: FeedPost, full: boolean, maxH?: number) => (
    <PostCard
      post={item}
      fullShape={full}
      maxPhotoHeight={maxH}
      onOpen={full ? undefined : () => setPager({ ids: shown.map((p) => p.id), start: Math.max(0, shown.findIndex((p) => p.id === item.id)) })}
      story={storyOf(item.author_id)}
      onStory={() => router.push({ pathname: '/story/[id]', params: { id: item.author_id } })}
      badges={badges.get(item.author_id)}
      meters={meters.get(item.author_id) ?? null}
      onLike={() => onLike(item)}
      onLikes={() => setLikesFor(item.id)}
      onSave={() => onSave(item)}
      onComments={() => setCommentsFor(item.id)}
      onShare={() => onShare(item)}
      onMore={() => onMore(item)}
    />
  );
  // Likes, saves and comments still show live on the pager's posts; a deleted or blocked post drops out.
  const pagerPosts = useMemo(() => {
    if (!pager) return [];
    const byId = new Map(posts.map((p) => [p.id, p]));
    return pager.ids.map((id) => byId.get(id)).filter((p): p is FeedPost => !!p);
  }, [pager, posts]);

  const empty = !supabaseConfigured
    ? 'The app isn’t connected to the server yet.'
    : failed
      ? 'We couldn’t load the feed. Pull down to try again.'
      : loading
        ? ''
        : watching?.recipesOnly
          ? 'No posts with a recipe yet. Change “Feed filter” to see everything.'
          : watching?.criticsOnly
          ? 'No critic has posted yet. Critics near you will show here, closest first.'
          : posts.length
          ? q.trim() ? 'No posts match your search.' : 'No posts match your feed filter. Change “Feed filter” to see more.'
          : 'No posts yet. Share your signature dish from the Post tab, or follow cooks near you.';

  return (
    <View style={styles.screen}>
      <SafeAreaView edges={['top']} style={{ backgroundColor: ui.card }}>
        <View style={styles.header}>
          <Logo on="light" height={28} />
          <View style={styles.headerIcons}>
            <Pressable
              accessibilityLabel={unreadNotes ? `Notifications, ${unreadNotes} new` : 'Notifications'}
              onPress={() => router.push({ pathname: '/inbox', params: { tab: 'notifications' } })}
              hitSlop={8}>
              <MaterialIcons name="notifications-none" size={27} color={ui.deep} />
              {unreadNotes > 0 ? <View style={styles.dot} /> : null}
            </Pressable>
            <Pressable accessibilityLabel={unreadMsgs ? `Messages, ${unreadMsgs} new` : 'Messages'} onPress={() => router.push('/inbox')} hitSlop={8}>
              <MaterialIcons name="mail-outline" size={26} color={ui.deep} />
              {unreadMsgs > 0 ? <View style={styles.dot} /> : null}
            </Pressable>
          </View>
        </View>
      </SafeAreaView>
      <WaitingRequestsBar />
      <AlertHealthNotice />
      <FlatList
        ref={listRef}
        data={shown}
        keyExtractor={(p) => p.id}
        onViewableItemsChanged={onViewable}
        viewabilityConfig={VIEW_CONFIG}
        renderItem={({ item }) => card(item, false)}
        refreshControl={<RefreshControl refreshing={pull.refreshing} onRefresh={pull.onRefresh} tintColor={colors.teal} />}
        ListHeaderComponent={
          // White at the top (like the header) fading to the cream page by the time the first post starts.
          <View>
            <FadeBg from={[255, 255, 255]} to={PAGE_RGB} />
            <StoriesRow groups={stories} seen={seen} me={me} onOpen={(id) => router.push({ pathname: '/story/[id]', params: { id } })} onAdd={() => startCompose('story', '/compose/story')} />
            <View style={styles.bar}>
              <View style={styles.searchBox}>
                <MaterialIcons name="search" size={22} color={SLATE} />
                <TextInput value={q} onChangeText={setQ} placeholder="Search dishes or cooks" placeholderTextColor={SLATE} style={styles.search} returnKeyType="search" autoCorrect={false} accessibilityLabel="Search the feed" clearButtonMode="while-editing" />
              </View>
              <Pressable style={styles.watch} onPress={() => setWatchOpen(true)} accessibilityRole="button" accessibilityLabel="Filter the feed">
                <MaterialIcons name="tune" size={18} color={colors.white} />
                <Text style={styles.watchText} maxFontSizeMultiplier={1.15}>{all ? 'Everyone' : watching?.criticsOnly ? 'Critics' : watching?.recipesOnly ? 'Recipes' : 'Custom'}</Text>
                <MaterialIcons name="expand-more" size={18} color={colors.white} />
              </Pressable>
            </View>
          </View>
        }
        ListEmptyComponent={empty ? <Text style={styles.empty}>{empty}</Text> : null}
        contentContainerStyle={{ flexGrow: 1, backgroundColor: ui.page, paddingBottom: 20 }}
      />
      {pager ? <PostPager data={pagerPosts} start={pager.start} renderCard={(p, maxH) => card(p, true, maxH)} onClose={() => setPager(null)} /> : null}
      {watching ? <WatchingSheet
          visible={watchOpen}
          mine={mine}
          value={watching}
          onChange={setWatching}
          onClose={() => setWatchOpen(false)}
          // "Nearby" needs somewhere to be near: with no saved location, ticking it opens the location picker.
          onNearbyOn={() => {
            if (!here) {
              setWatchOpen(false);
              router.push('/location');
            }
          }}
          applyLabel={shown.length ? `Show ${shown.length} ${shown.length === 1 ? 'post' : 'posts'}` : 'No posts match'}
        /> : null}
      <ActionSheet title={menu?.title ?? null} actions={menu?.actions ?? []} onClose={() => setMenu(null)} />
      <LikesSheet postId={likesFor} onClose={() => setLikesFor(null)} />
      <CommentsSheet postId={commentsFor} me={me} onClose={() => setCommentsFor(null)} onAdded={(id) => patch(id, (x) => ({ ...x, comments: x.comments + 1 }))} onRemoved={(id) => patch(id, (x) => ({ ...x, comments: Math.max(0, x.comments - 1) }))} />
    </View>
  );
}

const PAGE_RGB: [number, number, number] = [246, 242, 236]; // ui.page (#f6f2ec)
const SLATE = 'rgba(1,49,62,.5)'; // same grey-blue as the Menu search

const styles = StyleSheet.create({
  // White behind the list so pulling down reveals white (the header's colour), not cream; the cream lives on the list content.
  screen: { flex: 1, backgroundColor: ui.card },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 18, paddingTop: 8, paddingBottom: 12, backgroundColor: ui.card },
  headerIcons: { flexDirection: 'row', alignItems: 'center', gap: 18 },
  dot: { position: 'absolute', top: -1, right: -2, width: 10, height: 10, borderRadius: 5, backgroundColor: colors.yellow, borderWidth: 1.5, borderColor: ui.card },
  // The feed filter sits above the posts. Location lives on the Menu tab, like Talabat; Home is for social.
  bar: { paddingHorizontal: 18, paddingTop: 10, paddingBottom: 0, flexDirection: 'row', alignItems: 'center', gap: 10 },
  // Same row as the Menu tab: search box on the left, navy filter pill on the right.
  searchBox: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: ui.card, borderWidth: 1, borderColor: colors.lightBlue, borderRadius: 18, paddingHorizontal: 14 },
  watch: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: ui.deep, borderRadius: 999, paddingHorizontal: 12, height: 34, flexShrink: 0 },
  watchText: { fontFamily: fonts.bold, fontSize: 13, color: colors.white },
  search: { flex: 1, fontFamily: fonts.semiBold, fontSize: 15, color: ui.deep, paddingVertical: 10 },
  empty: { fontFamily: fonts.semiBold, fontSize: 14, color: colors.muted, textAlign: 'center', marginTop: 40, paddingHorizontal: 30, lineHeight: 20 },
});
