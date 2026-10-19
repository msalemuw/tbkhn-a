import Ionicons from '@expo/vector-icons/Ionicons';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Avatar } from '@/components/avatar';
import { RankBadge } from '@/components/rank-badge';
import { colors, fonts, ui } from '@/constants/theme';
import type { FeedPost } from '@/lib/feed';
import { fmtAgo, fmtLive } from '@/lib/format';
import { mediaUrl, personName } from '@/lib/posts';
import type { Badge } from '@/lib/rankings';
import { VerifiedTick } from '@/lib/verified';

/** One signature-dish post in the Home feed (design s6): cook line, photo, caption, likes, comments, share. */
export function PostCard({
  post,
  badges,
  meters,
  onLike,
  onLikes,
  onComments,
  onShare,
  onMore,
}: {
  post: FeedPost;
  badges?: Badge[];
  /** Live distance to the cook in metres, when both positions are known. */
  meters: number | null;
  onLike: () => void;
  /** Opens the list of who liked the post (tap the count, like Instagram). */
  onLikes: () => void;
  onComments: () => void;
  onShare: () => void;
  onMore: () => void;
}) {
  const [open, setOpen] = useState(false);
  const photo = mediaUrl(post.media_path);
  const meta = ['Signature dish', meters != null ? fmtLive(meters) : fmtAgo(Date.parse(post.created_at))].join(' · ');
  const long = (post.caption?.length ?? 0) > 90;

  return (
    <View style={styles.post}>
      <View style={styles.head}>
        <Pressable onPress={() => router.push({ pathname: '/cook/[id]', params: { id: post.author_id } })} accessibilityRole="button" accessibilityLabel={`${personName(post.author)}'s profile`}>
          <Avatar person={post.author} size={42} />
        </Pressable>
        <View style={styles.nameCol}>
          <Pressable style={styles.nameRow} onPress={() => router.push({ pathname: '/cook/[id]', params: { id: post.author_id } })} accessibilityRole="link" accessibilityLabel={`${personName(post.author)}'s profile`}>
            <Text style={styles.name} numberOfLines={1}>{personName(post.author)}</Text>
            <VerifiedTick id={post.author_id} size={16} />
          </Pressable>
          {badges?.map((b) => <RankBadge key={b.kind} badge={b} />)}
          <Text style={styles.meta} numberOfLines={1}>
            {post.rating != null ? `★ ${post.rating.toFixed(1)} · ` : ''}
            {meta}
          </Text>
          {post.cookingDishId ? (
            <Pressable
              style={styles.cooking}
              onPress={() => router.push({ pathname: '/dish/[id]', params: { id: post.cookingDishId! } })}
              accessibilityRole="link">
              <MaterialIcons name="soup-kitchen" size={15} color={ui.deep} />
              <Text style={styles.cookingText}>See today’s menu</Text>
              <MaterialIcons name="chevron-right" size={16} color={ui.deep} />
            </Pressable>
          ) : null}
        </View>
        <Pressable onPress={onMore} hitSlop={10} accessibilityLabel="More">
          <MaterialIcons name="more-horiz" size={22} color={colors.muted} />
        </Pressable>
      </View>
      {photo ? <Image source={{ uri: photo }} style={styles.photo} contentFit="cover" /> : null}
      {post.caption ? (
        <Text style={styles.caption} numberOfLines={open ? undefined : 2}>
          {post.caption}
          {long && !open ? <Text style={styles.more} onPress={() => setOpen(true)}>  more</Text> : null}
        </Text>
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
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  // A white rounded card on the warm page, with the photo inside it (design s6).
  post: { backgroundColor: ui.card, borderRadius: 22, borderWidth: 1, borderColor: ui.border, marginHorizontal: 14, marginTop: 12, padding: 14 },
  head: { flexDirection: 'row', alignItems: 'flex-start', gap: 11 },
  nameCol: { flex: 1, minWidth: 0, gap: 2 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  name: { flexShrink: 1, fontFamily: fonts.bold, fontSize: 15, color: ui.deep },
  meta: { fontFamily: fonts.medium, fontSize: 12.5, color: colors.muted },
  cooking: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 3, alignSelf: 'flex-start' },
  cookingText: { fontFamily: fonts.extraBold, fontSize: 13, color: ui.deep },
  photo: { width: '100%', height: 270, marginTop: 12, borderRadius: 16, backgroundColor: colors.cream },
  caption: { fontFamily: fonts.regular, fontSize: 14.5, lineHeight: 20, color: ui.deep, paddingTop: 12 },
  more: { fontFamily: fonts.bold, color: colors.muted },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 28, paddingTop: 12 },
  act: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  n: { fontFamily: fonts.semiBold, fontSize: 16, color: ui.deep },
});
