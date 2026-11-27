import Ionicons from '@expo/vector-icons/Ionicons';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Animated, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { Text } from '@/components/text';
import { FlipIcon } from '@/components/flip-icon';
import { Avatar } from '@/components/avatar';
import { FollowButton } from '@/components/follow-button';
import { RankBadge } from '@/components/rank-badge';
import { colors, fonts, ui } from '@/constants/theme';
import { useMenuOff } from '@/lib/app-status';
import type { FeedPost } from '@/lib/feed';
import { fmtAgo, fmtLive } from '@/lib/format';
import { mediaUrl, personName } from '@/lib/posts';
import type { Badge } from '@/lib/rankings';
import { CriticBadge } from '@/lib/critics';
import { VerifiedTick } from '@/lib/verified';

/** One signature-dish post in the Home feed (design s6): cook line, photo, caption, likes, comments, share. */
export function PostCard({
  post,
  badges,
  meters,
  onLike,
  onLikes,
  onSave,
  onComments,
  onShare,
  onMore,
  fullShape = false,
  story = null,
  onStory,
}: {
  post: FeedPost;
  /** The post page shows the photo in its own shape; the feed keeps it square. */
  fullShape?: boolean;
  /** The cook has a live story: a ring on the avatar (bright when not seen yet), and a tap opens it. */
  story?: 'unseen' | 'seen' | null;
  onStory?: () => void;
  badges?: Badge[];
  /** Live distance to the cook in metres, when both positions are known. */
  meters: number | null;
  onLike: () => void;
  /** Opens the list of who liked the post (tap the count, like Instagram). */
  onLikes: () => void;
  onSave: () => void;
  onComments: () => void;
  onShare: () => void;
  onMore: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [cut, setCut] = useState(false);
  const menuOff = useMenuOff();
  // Double-tap the photo to like, like Instagram: a heart pops up on the photo. It only likes; the heart button below is what unlikes.
  const lastTap = useRef(0);
  const [pop] = useState(() => new Animated.Value(0));
  const openTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (openTimer.current) clearTimeout(openTimer.current); }, []);
  // One tap opens the photo full screen (the feed shows it square); two quick taps like it, as on Instagram.
  function onPhotoTap(now: number, at = 0) {
    if (now - lastTap.current > 320) {
      lastTap.current = now;
      openTimer.current = setTimeout(() => router.push({ pathname: '/photo-viewer', params: { paths: [post.media_path, ...(post.extra_media ?? [])].filter(Boolean).join('|'), index: String(at) } }), 330);
      return;
    }
    lastTap.current = 0;
    if (openTimer.current) clearTimeout(openTimer.current);
    if (!post.liked) onLike();
    pop.setValue(0);
    Animated.sequence([
      Animated.spring(pop, { toValue: 1, useNativeDriver: true, friction: 5, tension: 160 }),
      Animated.delay(350),
      Animated.timing(pop, { toValue: 0, duration: 220, useNativeDriver: true }),
    ]).start();
  }
  const photo = mediaUrl(post.media_path);
  // A carousel post: the first photo plus the others, swiped sideways like Instagram.
  const photos = [photo, ...(post.extra_media ?? []).map((m) => mediaUrl(m))].filter((u): u is string => !!u);
  const shape = { aspectRatio: fullShape ? post.media_aspect ?? 1 : 1 };
  const [slide, setSlide] = useState(0);
  const [slideW, setSlideW] = useState(0);
  const meta = meters != null ? fmtLive(meters) : fmtAgo(Date.parse(post.created_at));

  return (
    <View style={styles.post}>
      <View style={styles.head}>
        <Pressable
          onPress={() => (story && onStory ? onStory() : router.push({ pathname: '/cook/[id]', params: { id: post.author_id } }))}
          accessibilityRole="button"
          accessibilityLabel={story ? `${personName(post.author)}'s story` : `${personName(post.author)}'s profile`}>
          {story ? (
            <View style={[styles.storyRing, story === 'unseen' ? styles.storyUnseen : styles.storySeen]}>
              <Avatar person={post.author} size={42} />
            </View>
          ) : (
            <Avatar person={post.author} size={42} />
          )}
        </Pressable>
        <View style={styles.nameCol}>
          <Pressable style={styles.nameRow} onPress={() => router.push({ pathname: '/cook/[id]', params: { id: post.author_id } })} accessibilityRole="link" accessibilityLabel={`${personName(post.author)}'s profile`}>
            <Text style={styles.name} numberOfLines={1}>{personName(post.author)}</Text>
            <VerifiedTick id={post.author_id} size={16} />
            <CriticBadge id={post.author_id} />
          </Pressable>
          {badges?.map((b) => <RankBadge key={b.kind} badge={b} />)}
          <Text style={styles.meta} numberOfLines={1}>
            {post.rating != null ? `★ ${post.rating.toFixed(1)} · ` : ''}
            {meta}
          </Text>
          {post.cookingDishId && !menuOff ? (
            <Pressable
              style={styles.cooking}
              onPress={() => router.push({ pathname: '/dish/[id]', params: { id: post.cookingDishId! } })}
              accessibilityRole="link">
              <MaterialIcons name="soup-kitchen" size={15} color={ui.deep} />
              <Text style={styles.cookingText}>See today’s menu</Text>
              <FlipIcon name="chevron-right" size={16} color={ui.deep} />
            </Pressable>
          ) : null}
        </View>
        <FollowButton id={post.author_id} />
        <Pressable onPress={onMore} hitSlop={10} accessibilityLabel="More">
          <MaterialIcons name="more-horiz" size={22} color={colors.muted} />
        </Pressable>
      </View>
      {photos.length > 1 ? (
        <View style={styles.photoWrap} onLayout={(e) => setSlideW(e.nativeEvent.layout.width)}>
          <ScrollView
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            style={styles.carousel}
            onMomentumScrollEnd={(e) => slideW && setSlide(Math.round(e.nativeEvent.contentOffset.x / slideW))}
            scrollEventThrottle={16}>
            {photos.map((uri, i) => (
              <Pressable key={uri} onPress={(e) => onPhotoTap(e.nativeEvent.timestamp, i)} accessible={false}>
                <Image source={{ uri }} style={[styles.photo, shape, slideW ? { width: slideW } : null]} contentFit="cover" />
              </Pressable>
            ))}
          </ScrollView>
          <View pointerEvents="none" style={styles.counter}>
            <Text style={styles.counterText}>{slide + 1}/{photos.length}</Text>
          </View>
          <View pointerEvents="none" style={styles.dots}>
            {photos.map((_, i) => (
              <View key={i} style={[styles.dot, i === slide && styles.dotOn]} />
            ))}
          </View>
          <Animated.View pointerEvents="none" style={[styles.burst, { opacity: pop, transform: [{ scale: pop.interpolate({ inputRange: [0, 1], outputRange: [0.4, 1.1] }) }] }]}>
            <Ionicons name="heart" size={96} color={colors.white} style={styles.burstHeart} />
          </Animated.View>
        </View>
      ) : photo ? (
        <Pressable onPress={(e) => onPhotoTap(e.nativeEvent.timestamp)} accessible={false} style={styles.photoWrap}>
          <Image source={{ uri: photo }} style={[styles.photo, shape]} contentFit="cover" />
          <Animated.View pointerEvents="none" style={[styles.burst, { opacity: pop, transform: [{ scale: pop.interpolate({ inputRange: [0, 1], outputRange: [0.4, 1.1] }) }] }]}>
            <Ionicons name="heart" size={96} color={colors.white} style={styles.burstHeart} />
          </Animated.View>
        </Pressable>
      ) : null}
      <View style={styles.actions}>
        <View style={styles.act}>
          <Pressable onPress={onLike} hitSlop={8} accessibilityRole="button" accessibilityLabel={post.liked ? 'Unlike' : 'Like'}>
            <Ionicons name={post.liked ? 'heart' : 'heart-outline'} size={27} color={post.liked ? ui.deepTeal : ui.deep} />
          </Pressable>
          <Pressable onPress={onLikes} disabled={post.likes === 0} hitSlop={8} accessibilityRole="button" accessibilityLabel={`${post.likes} likes. See who liked`}>
            <Text style={styles.n}>{post.likes}</Text>
          </Pressable>
        </View>
        <Pressable style={styles.act} onPress={onComments} hitSlop={8} accessibilityRole="button" accessibilityLabel="Comments">
          <Ionicons name="chatbubble-outline" size={25} color={ui.deep} />
          <Text style={styles.n}>{post.comments}</Text>
        </Pressable>
        <Pressable style={styles.act} onPress={onShare} hitSlop={8} accessibilityRole="button" accessibilityLabel="Share">
          <Ionicons name="arrow-redo-outline" size={26} color={ui.deep} />
        </Pressable>
        <Pressable style={[styles.act, { marginLeft: 'auto' }]} onPress={onSave} hitSlop={8} accessibilityRole="button" accessibilityLabel={post.saved ? 'Unsave post' : 'Save post'}>
          <Ionicons name={post.saved ? 'bookmark' : 'bookmark-outline'} size={25} color={post.saved ? ui.deepTeal : ui.deep} />
        </Pressable>
      </View>
      {post.caption ? (
        <Pressable onPress={() => cut && setOpen((o) => !o)} accessibilityRole="button" accessibilityLabel={open ? 'Show less' : 'Show the full description'}>
          {cut && !open ? (
            // Like Instagram: the first line ends with "…" and "more" follows on the same line.
            <View style={styles.firstLine}>
              <Text verbatim style={[styles.caption, styles.firstText]} numberOfLines={1}>
                {post.caption}
              </Text>
              <Text style={[styles.caption, styles.moreInline]}>more</Text>
            </View>
          ) : (
            <Text verbatim style={styles.caption}>
              {post.caption}
            </Text>
          )}
          {/* Invisible full-length copy: the only reliable way to know whether the 1-line version is cut off. */}
          <Text
            verbatim
            style={[styles.caption, styles.measure]}
            pointerEvents="none"
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
            onTextLayout={(e) => setCut(e.nativeEvent.lines.length > 1)}>
            {post.caption}
          </Text>
          {cut && open ? <Text style={styles.more}>less</Text> : null}
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  // A white rounded card on the warm page, with the photo inside it (design s6).
  post: { backgroundColor: ui.card, borderRadius: 22, borderWidth: 1, borderColor: ui.border, marginHorizontal: 14, marginTop: 14, padding: 14 },
  storyRing: { padding: 2, borderRadius: 27, borderWidth: 2.5 },
  storyUnseen: { borderColor: colors.yellow },
  storySeen: { borderColor: 'rgba(1,49,62,.2)' },
  head: { flexDirection: 'row', alignItems: 'flex-start', gap: 11 },
  nameCol: { flex: 1, minWidth: 0, gap: 0 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  name: { flexShrink: 1, fontFamily: fonts.bold, fontSize: 15, color: ui.deep },
  meta: { fontFamily: fonts.medium, fontSize: 12.5, color: colors.muted },
  cooking: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 2, alignSelf: 'flex-start' },
  cookingText: { fontFamily: fonts.extraBold, fontSize: 13, color: ui.deep },
  photoWrap: { marginTop: 10 },
  photo: { width: '100%', aspectRatio: 1, borderRadius: 16, backgroundColor: colors.cream },
  carousel: { borderRadius: 16, overflow: 'hidden' },
  counter: { position: 'absolute', top: 10, right: 10, backgroundColor: 'rgba(40,48,58,.7)', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 3 },
  counterText: { fontFamily: fonts.bold, fontSize: 12, color: colors.white },
  dots: { position: 'absolute', bottom: 10, left: 0, right: 0, flexDirection: 'row', justifyContent: 'center', gap: 5 },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: 'rgba(255,255,255,.55)' },
  dotOn: { backgroundColor: colors.white },
  burst: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' },
  burstHeart: { textShadowColor: 'rgba(0,0,0,.35)', textShadowRadius: 14 },
  caption: { fontFamily: fonts.regular, fontSize: 14.5, lineHeight: 20, color: ui.deep, paddingTop: 8 },
  measure: { position: 'absolute', left: 0, right: 0, top: 0, opacity: 0 },
  firstLine: { flexDirection: 'row', alignItems: 'flex-start', gap: 6 },
  firstText: { flexShrink: 1 },
  moreInline: { fontFamily: fonts.bold, color: colors.muted, flexShrink: 0 },
  more: { fontFamily: fonts.bold, fontSize: 14, color: colors.muted, paddingTop: 4 },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 28, paddingTop: 12 },
  act: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  n: { fontFamily: fonts.semiBold, fontSize: 16, color: ui.deep },
});
