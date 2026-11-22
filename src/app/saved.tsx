import { Image } from 'expo-image';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BackHeader } from '@/components/form';
import { Text } from '@/components/text';
import { colors, fonts } from '@/constants/theme';
import { type FeedPost, fetchSaved } from '@/lib/feed';
import { mediaUrl } from '@/lib/posts';
import { useSession } from '@/lib/session';

// Posts the member saved with the bookmark under a post. Private: nobody else sees them. Tap one to open it in a feed
// that starts at that post, like the photo grid on a profile.
export default function Saved() {
  const { session } = useSession();
  const me = session?.user.id ?? null;
  const [posts, setPosts] = useState<FeedPost[] | null>(null);
  const { width } = useWindowDimensions();
  const tile = Math.floor((width - 44 - 8) / 2);

  // Reload whenever the screen comes back into view, so a post unsaved inside the feed drops out of the grid.
  useFocusEffect(
    useCallback(() => {
      if (!me) return;
      fetchSaved(me).then(setPosts, () => setPosts([]));
    }, [me]),
  );

  return (
    <SafeAreaView style={styles.screen}>
      <BackHeader title="Saved" />
      {posts === null ? (
        <ActivityIndicator color={colors.teal} style={{ marginTop: 30 }} />
      ) : posts.length ? (
        <ScrollView contentContainerStyle={styles.grid}>
          {posts.map((p) => {
            const uri = mediaUrl(p.media_path);
            return (
              <Pressable key={p.id} style={[styles.cell, { width: tile, height: tile }]} onPress={() => router.push({ pathname: '/post/[id]', params: { id: p.id, by: 'saved' } })} accessibilityRole="button" accessibilityLabel={p.caption ?? 'Signature dish'}>
                {uri ? <Image source={{ uri }} style={StyleSheet.absoluteFill} contentFit="cover" /> : <Text verbatim style={styles.cellText} numberOfLines={5}>{p.caption}</Text>}
              </Pressable>
            );
          })}
        </ScrollView>
      ) : (
        <Text style={styles.empty}>Nothing saved yet. Tap the bookmark under a post to keep it here.</Text>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.paper },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingHorizontal: 22, paddingTop: 12, paddingBottom: 30 },
  cell: { borderRadius: 12, overflow: 'hidden', backgroundColor: colors.cream, padding: 10, justifyContent: 'center' },
  cellText: { fontFamily: fonts.semiBold, fontSize: 13, color: colors.ink },
  empty: { fontFamily: fonts.semiBold, fontSize: 14, color: colors.muted, textAlign: 'center', lineHeight: 21, padding: 32 },
});
