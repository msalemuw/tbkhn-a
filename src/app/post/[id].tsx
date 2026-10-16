import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Pressable, Share, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Avatar } from '@/components/avatar';
import { useKeyboardHeight } from '@/components/form';
import { PostCard } from '@/components/post-card';
import { colors, fonts } from '@/constants/theme';
import { addComment, type Comment, deletePost, fetchComments, fetchPost, type FeedPost, reportPost, setLiked } from '@/lib/feed';
import { fmtAgo } from '@/lib/format';
import { personName } from '@/lib/posts';
import { useSession } from '@/lib/session';

// A signature post opened from a profile: the post with its likes, and the comments underneath with a box to add yours.
export default function PostScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { session } = useSession();
  const me = session?.user.id ?? null;
  const keyboard = useKeyboardHeight();
  const [post, setPost] = useState<FeedPost | null | undefined>(undefined);
  const [comments, setComments] = useState<Comment[] | null>(null);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    fetchPost(me, id).then(setPost, () => setPost(null));
    fetchComments(id).then(setComments, () => setComments([]));
  }, [id, me]);
  useEffect(load, [load]);

  const back = () => (router.canGoBack() ? router.back() : router.replace('/home'));

  async function onLike() {
    if (!post) return;
    if (!me) return router.push('/sign-up');
    const next = !post.liked;
    const patch = (liked: boolean, delta: number) => setPost((p) => (p ? { ...p, liked, likes: Math.max(0, p.likes + delta) } : p));
    patch(next, next ? 1 : -1);
    try {
      await setLiked(me, post.id, next);
    } catch {
      patch(!next, next ? -1 : 1);
    }
  }

  function onShare() {
    if (!post) return;
    const text = post.caption ? `${personName(post.author)} on tabkheen A: ${post.caption}` : `${personName(post.author)}’s signature dish on tabkheen A`;
    Share.share({ message: text }).catch(() => null);
  }

  function onMore() {
    if (!post) return;
    const mine = post.author_id === me;
    Alert.alert(personName(post.author), undefined, [
      { text: 'View profile', onPress: () => router.push({ pathname: '/cook/[id]', params: { id: post.author_id } }) },
      mine
        ? {
            text: 'Delete post',
            style: 'destructive',
            onPress: () => deletePost(post.id).then(back, () => Alert.alert('We couldn’t delete the post', 'Check your connection and try again.')),
          }
        : {
            text: 'Report post',
            style: 'destructive',
            onPress: () => (me ? reportPost(me, post.id).then(() => Alert.alert('Thanks', 'Our team will take a look.'), () => null) : router.push('/sign-up')),
          },
      { text: 'Cancel', style: 'cancel' },
    ]);
  }

  async function send() {
    if (!me) return router.push('/sign-up');
    if (!draft.trim() || busy) return;
    setBusy(true);
    setError(null);
    try {
      await addComment(me, id, draft);
      setDraft('');
      setPost((p) => (p ? { ...p, comments: p.comments + 1 } : p));
      fetchComments(id).then(setComments, () => {});
    } catch {
      setError('We couldn’t send your comment. Try again.');
    }
    setBusy(false);
  }

  return (
    <View style={styles.screen}>
      <SafeAreaView edges={['top']} style={styles.bar}>
        <Pressable onPress={back} hitSlop={10} accessibilityRole="button" accessibilityLabel="Back">
          <MaterialIcons name="arrow-back" size={24} color={colors.ink} />
        </Pressable>
        <Text style={styles.title}>Post</Text>
      </SafeAreaView>
      {post === undefined ? (
        <ActivityIndicator color={colors.teal} style={{ marginTop: 40 }} />
      ) : post === null ? (
        <Text style={styles.empty}>This post isn’t available any more.</Text>
      ) : (
        <FlatList
          data={comments ?? []}
          keyExtractor={(c) => c.id}
          keyboardShouldPersistTaps="handled"
          ListHeaderComponent={
            <>
              <PostCard post={post} meters={null} onLike={onLike} onComments={() => {}} onShare={onShare} onMore={onMore} />
              <Text style={styles.section}>Comments · {post.comments}</Text>
            </>
          }
          ListEmptyComponent={comments === null ? <ActivityIndicator color={colors.teal} style={{ marginTop: 16 }} /> : <Text style={styles.noComments}>No comments yet. Be the first.</Text>}
          renderItem={({ item }) => (
            <View style={styles.row}>
              <Pressable onPress={() => router.push({ pathname: '/cook/[id]', params: { id: item.author.id } })} accessibilityRole="button" accessibilityLabel={`${personName(item.author)}'s profile`}>
                <Avatar person={item.author} size={32} />
              </Pressable>
              <View style={{ flex: 1 }}>
                <Text style={styles.line}>
                  <Text style={styles.name}>{personName(item.author)}</Text>
                  <Text style={styles.when}>  {fmtAgo(Date.parse(item.created_at))}</Text>
                </Text>
                <Text style={styles.body}>{item.body}</Text>
              </View>
            </View>
          )}
        />
      )}
      {post ? (
        <View style={{ paddingBottom: keyboard }}>
          <SafeAreaView edges={keyboard ? [] : ['bottom']} style={styles.inputWrap}>
            {error ? <Text style={styles.error}>{error}</Text> : null}
            <View style={styles.inputRow}>
              <TextInput
                value={draft}
                onChangeText={setDraft}
                placeholder={me ? 'Add a comment…' : 'Sign up to comment'}
                placeholderTextColor={colors.faint}
                maxLength={500}
                style={styles.input}
                accessibilityLabel="Add a comment"
              />
              <Pressable onPress={send} disabled={busy || (!draft.trim() && !!me)} hitSlop={8} accessibilityLabel="Send comment">
                {busy ? <ActivityIndicator color={colors.teal} /> : <MaterialIcons name="send" size={22} color={draft.trim() || !me ? colors.ink : colors.faint} />}
              </Pressable>
            </View>
          </SafeAreaView>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.paper },
  bar: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 18, paddingBottom: 10, borderBottomWidth: 1, borderBottomColor: colors.line },
  title: { fontFamily: fonts.extraBold, fontSize: 17, color: colors.ink },
  empty: { fontFamily: fonts.semiBold, fontSize: 14, color: colors.muted, textAlign: 'center', marginTop: 40, paddingHorizontal: 20 },
  section: { fontFamily: fonts.extraBold, fontSize: 15, color: colors.ink, paddingHorizontal: 22, paddingTop: 14, paddingBottom: 4 },
  noComments: { fontFamily: fonts.semiBold, fontSize: 14, color: colors.muted, paddingHorizontal: 22, paddingTop: 8, paddingBottom: 20 },
  row: { flexDirection: 'row', gap: 10, paddingVertical: 9, paddingHorizontal: 22 },
  line: { fontSize: 13 },
  name: { fontFamily: fonts.bold, fontSize: 13, color: colors.ink },
  when: { fontFamily: fonts.medium, fontSize: 12, color: colors.muted },
  body: { fontFamily: fonts.regular, fontSize: 14, lineHeight: 19, color: colors.ink, marginTop: 1 },
  inputWrap: { backgroundColor: colors.paper, borderTopWidth: 1, borderTopColor: colors.line, paddingHorizontal: 18 },
  error: { fontFamily: fonts.bold, fontSize: 12.5, color: colors.navy, backgroundColor: colors.yellow, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 6, overflow: 'hidden', marginTop: 8 },
  inputRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10 },
  input: { flex: 1, fontFamily: fonts.semiBold, fontSize: 15, color: colors.ink, borderWidth: 1, borderColor: colors.line, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 9 },
});
