import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { router, useFocusEffect } from 'expo-router';
import { setStatusBarStyle } from 'expo-status-bar';
import { useCallback, useMemo, useState } from 'react';
import { Alert, FlatList, Pressable, RefreshControl, Share, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { CommentsSheet } from '@/components/comments-sheet';
import { Logo } from '@/components/logo';
import { PostCard } from '@/components/post-card';
import { type Watching, WatchingSheet } from '@/components/watching-sheet';
import { colors, fonts } from '@/constants/theme';
import { deletePost, type FeedPost, fetchFeed, fetchFollowing, reportPost, setLiked } from '@/lib/feed';
import { useMyLocation, usePlace } from '@/lib/location';
import { unreadMessageCount } from '@/lib/chat';
import { unreadNotificationCount } from '@/lib/notifications';
import { fetchMyCommunities, type MyCommunity, personName } from '@/lib/posts';
import { useSession } from '@/lib/session';
import { supabaseConfigured } from '@/lib/supabase';

// Screen s6: Home is the social feed (design flow 15): signature dishes from the communities and cooks you watch.
// What people are cooking today, and ordering, live on the Menu tab.
const NAVY = colors.navy;

export default function Home() {
  const { session } = useSession();
  const me = session?.user.id ?? null;
  const { place } = usePlace();
  const here = useMyLocation();
  const [unread, setUnread] = useState(0);
  const [posts, setPosts] = useState<FeedPost[]>([]);
  const [mine, setMine] = useState<MyCommunity[]>([]);
  const [following, setFollowing] = useState<string[]>([]);
  const [watching, setWatching] = useState<Watching | null>(null);
  const [watchOpen, setWatchOpen] = useState(false);
  const [commentsFor, setCommentsFor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  const load = useCallback(async () => {
    if (!supabaseConfigured) return setLoading(false);
    setLoading(true);
    try {
      const [feed, communities, follows] = await Promise.all([fetchFeed(me), me ? fetchMyCommunities(me) : Promise.resolve([]), me ? fetchFollowing(me) : Promise.resolve([])]);
      setPosts(feed);
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

  // Light status bar text over the navy header, back to dark when another tab shows.
  useFocusEffect(
    useCallback(() => {
      setStatusBarStyle('light');
      load();
      if (me) Promise.all([unreadMessageCount(), unreadNotificationCount()]).then(([m, n]) => setUnread(m + n), () => null);
      return () => setStatusBarStyle('dark');
    }, [me, load]),
  );

  const all = !watching || (watching.nearby && watching.following && mine.every((c) => watching.communities.includes(c.id)));
  const shown = useMemo(() => {
    if (!watching) return posts;
    return posts.filter(
      (p) =>
        p.author_id === me ||
        (p.community_id ? watching.communities.includes(p.community_id) : watching.nearby) ||
        (watching.following && following.includes(p.author_id)),
    );
  }, [posts, watching, following, me]);

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
          ? 'Nothing here for what you’re watching. Change “Watching” to see more.'
          : 'No posts yet. Share your signature dish from the Post tab, or follow cooks near you.';

  return (
    <View style={styles.screen}>
      <SafeAreaView edges={['top']} style={{ backgroundColor: NAVY }}>
        <View style={styles.header}>
          <Logo on="dark" height={28} />
          <Pressable accessibilityLabel={unread ? `Inbox, ${unread} new` : 'Inbox'} onPress={() => router.push('/inbox')} hitSlop={8}>
            <MaterialIcons name="mail-outline" size={26} color={colors.white} />
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
            here={here}
            onLike={() => onLike(item)}
            onComments={() => setCommentsFor(item.id)}
            onShare={() => onShare(item)}
            onMore={() => onMore(item)}
          />
        )}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={load} tintColor={colors.teal} />}
        ListHeaderComponent={
          <View style={styles.bar}>
            <Pressable style={styles.loc} onPress={() => router.push('/location')} accessibilityLabel="Choose your location">
              <MaterialIcons name="location-on" size={18} color={colors.teal} />
              <Text style={styles.locText} numberOfLines={1}>{place?.label || 'Location'}</Text>
              <MaterialIcons name="expand-more" size={20} color={colors.muted} />
            </Pressable>
            <Pressable style={styles.watch} onPress={() => setWatchOpen(true)} accessibilityRole="button" accessibilityLabel="Choose what you are watching">
              <MaterialIcons name="tune" size={18} color={colors.white} />
              <Text style={styles.watchText}>Watching: {all ? 'All' : 'Custom'}</Text>
              <MaterialIcons name="expand-more" size={18} color={colors.white} />
            </Pressable>
          </View>
        }
        ListEmptyComponent={empty ? <Text style={styles.empty}>{empty}</Text> : null}
        contentContainerStyle={{ paddingBottom: 20 }}
      />
      {watching ? <WatchingSheet visible={watchOpen} mine={mine} value={watching} onChange={setWatching} onClose={() => setWatchOpen(false)} /> : null}
      <CommentsSheet postId={commentsFor} me={me} onClose={() => setCommentsFor(null)} onAdded={(id) => patch(id, (x) => ({ ...x, comments: x.comments + 1 }))} />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.paper },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 18, paddingTop: 8, paddingBottom: 12 },
  dot: { position: 'absolute', top: -1, right: -2, width: 10, height: 10, borderRadius: 5, backgroundColor: colors.yellow, borderWidth: 1.5, borderColor: NAVY },
  bar: { paddingHorizontal: 22, paddingTop: 14, paddingBottom: 12, gap: 10, alignItems: 'flex-start' },
  loc: { flexDirection: 'row', alignItems: 'center', gap: 4, maxWidth: '100%' },
  locText: { flexShrink: 1, fontFamily: fonts.extraBold, fontSize: 15, color: colors.ink },
  watch: { flexDirection: 'row', alignItems: 'center', gap: 7, backgroundColor: NAVY, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 9 },
  watchText: { fontFamily: fonts.bold, fontSize: 14, color: colors.white },
  empty: { fontFamily: fonts.semiBold, fontSize: 14, color: colors.muted, textAlign: 'center', marginTop: 40, paddingHorizontal: 30, lineHeight: 20 },
});
