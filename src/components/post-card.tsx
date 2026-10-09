import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Avatar } from '@/components/avatar';
import { RankBadge } from '@/components/rank-badge';
import { colors, fonts } from '@/constants/theme';
import type { FeedPost } from '@/lib/feed';
import { distanceMeters, fmtAgo, fmtDist, type LatLng } from '@/lib/format';
import { mediaUrl, personName } from '@/lib/posts';
import type { Badge } from '@/lib/rankings';

/** One signature-dish post in the Home feed (design s6): cook line, photo, caption, likes, comments, share. */
export function PostCard({
  post,
  badges,
  here,
  onLike,
  onComments,
  onShare,
  onMore,
}: {
  post: FeedPost;
  badges?: Badge[];
  here: LatLng | null;
  onLike: () => void;
  onComments: () => void;
  onShare: () => void;
  onMore: () => void;
}) {
  const [open, setOpen] = useState(false);
  const photo = mediaUrl(post.media_path);
  const dist = here && post.spot ? fmtDist(distanceMeters(here, post.spot)) : null;
  const meta = ['Signature dish', dist ? `${dist} away` : fmtAgo(Date.parse(post.created_at))].join(' · ');
  const long = (post.caption?.length ?? 0) > 90;

  return (
    <View style={styles.post}>
      <View style={styles.head}>
        <Pressable onPress={() => router.push({ pathname: '/cook/[id]', params: { id: post.author_id } })} accessibilityRole="button" accessibilityLabel={`${personName(post.author)}'s profile`}>
          <Avatar person={post.author} size={42} />
        </Pressable>
        <View style={styles.nameCol}>
          <View style={styles.nameRow}>
            <Text style={styles.name} numberOfLines={1}>{personName(post.author)}</Text>
            <MaterialIcons name="verified" size={16} color={colors.teal} />
          </View>
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
              <MaterialIcons name="soup-kitchen" size={15} color={colors.ink} />
              <Text style={styles.cookingText}>See what’s cooking today</Text>
              <MaterialIcons name="chevron-right" size={16} color={colors.ink} />
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
        <Pressable style={styles.act} onPress={onLike} hitSlop={8} accessibilityRole="button" accessibilityLabel={post.liked ? 'Unlike' : 'Like'}>
          <MaterialIcons name={post.liked ? 'favorite' : 'favorite-border'} size={24} color={colors.ink} />
          <Text style={styles.n}>{post.likes}</Text>
        </Pressable>
        <Pressable style={styles.act} onPress={onComments} hitSlop={8} accessibilityRole="button" accessibilityLabel="Comments">
          <MaterialIcons name="chat-bubble-outline" size={23} color={colors.ink} />
          <Text style={styles.n}>{post.comments}</Text>
        </Pressable>
        <Pressable style={styles.act} onPress={onShare} hitSlop={8} accessibilityRole="button" accessibilityLabel="Share">
          <MaterialIcons name="ios-share" size={23} color={colors.ink} />
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  post: { borderBottomWidth: 1, borderBottomColor: colors.line, paddingVertical: 14 },
  head: { flexDirection: 'row', alignItems: 'flex-start', gap: 11, paddingHorizontal: 22 },
  nameCol: { flex: 1, minWidth: 0, gap: 2 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  name: { flexShrink: 1, fontFamily: fonts.bold, fontSize: 14.5, color: colors.ink },
  meta: { fontFamily: fonts.medium, fontSize: 12, color: colors.muted },
  cooking: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 3, alignSelf: 'flex-start' },
  cookingText: { fontFamily: fonts.extraBold, fontSize: 12.5, color: colors.ink },
  photo: { width: '100%', height: 280, marginTop: 11, backgroundColor: colors.cream },
  caption: { fontFamily: fonts.regular, fontSize: 14, lineHeight: 20, color: colors.ink, paddingHorizontal: 22, paddingTop: 12 },
  more: { fontFamily: fonts.bold, color: colors.muted },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 22, paddingHorizontal: 22, paddingTop: 11 },
  act: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  n: { fontFamily: fonts.bold, fontSize: 12.5, color: colors.ink },
});
