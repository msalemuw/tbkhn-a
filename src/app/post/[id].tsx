import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Modal, Pressable, Share, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { CommentsSheet } from '@/components/comments-sheet';
import { LikesSheet } from '@/components/likes-sheet';
import { useKeyboardHeight } from '@/components/form';
import { PostCard } from '@/components/post-card';
import { colors, fonts, ui } from '@/constants/theme';
import { deletePost, type FeedPost, fetchPostsBy, reportPost, setLiked, updateCaption } from '@/lib/feed';
import { personName } from '@/lib/posts';
import { useSession } from '@/lib/session';

// A cook's signature posts as a feed, opened from their profile and scrolled to the post that was tapped.
// On your own posts the "..." menu can edit the caption or delete the post.
export default function PostScreen() {
  const { id, by } = useLocalSearchParams<{ id: string; by?: string }>();
  const { session } = useSession();
  const me = session?.user.id ?? null;
  const [posts, setPosts] = useState<FeedPost[] | null>(null);
  const [commentsFor, setCommentsFor] = useState<string | null>(null);
  const [likesFor, setLikesFor] = useState<string | null>(null);
  const [editing, setEditing] = useState<FeedPost | null>(null);
  const list = useRef<FlatList<FeedPost>>(null);
  const scrolled = useRef(false);

  const load = useCallback(() => {
    fetchPostsBy(me, by ?? me ?? '').then(setPosts, () => setPosts([]));
  }, [by, me]);
  useEffect(load, [load]);

  // Start at the post that was tapped.
  useEffect(() => {
    if (!posts || scrolled.current) return;
    const index = posts.findIndex((p) => p.id === id);
    if (index > 0) setTimeout(() => list.current?.scrollToIndex({ index, animated: false }), 50);
    scrolled.current = true;
  }, [posts, id]);

  const back = () => (router.canGoBack() ? router.back() : router.replace('/home'));
  const patch = (pid: string, f: (p: FeedPost) => FeedPost) => setPosts((l) => (l ?? []).map((p) => (p.id === pid ? f(p) : p)));

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

  function confirmDelete(p: FeedPost) {
    Alert.alert('Delete this post?', 'It will be removed for everyone, with its likes and comments.', [
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () =>
          deletePost(p.id).then(
            () => {
              const rest = (posts ?? []).filter((x) => x.id !== p.id);
              setPosts(rest);
              if (!rest.length) back();
            },
            () => Alert.alert('We couldn’t delete the post', 'Check your connection and try again.'),
          ),
      },
      { text: 'Cancel', style: 'cancel' },
    ]);
  }

  function onMore(p: FeedPost) {
    const mine = p.author_id === me;
    Alert.alert(personName(p.author), undefined, [
      ...(mine
        ? [
            { text: 'Edit caption', onPress: () => setEditing(p) },
            { text: 'Delete post', style: 'destructive' as const, onPress: () => confirmDelete(p) },
          ]
        : [
            { text: 'View profile', onPress: () => router.push({ pathname: '/cook/[id]', params: { id: p.author_id } }) },
            {
              text: 'Report post',
              style: 'destructive' as const,
              onPress: () => (me ? reportPost(me, p.id).then(() => Alert.alert('Thanks', 'Our team will take a look.'), () => null) : router.push('/sign-up')),
            },
          ]),
      { text: 'Cancel', style: 'cancel' as const },
    ]);
  }

  return (
    <View style={styles.screen}>
      <SafeAreaView edges={['top']} style={styles.bar}>
        <Pressable onPress={back} hitSlop={10} accessibilityRole="button" accessibilityLabel="Back">
          <MaterialIcons name="arrow-back" size={24} color={colors.ink} />
        </Pressable>
        <Text style={styles.title}>Posts</Text>
      </SafeAreaView>
      {posts === null ? (
        <ActivityIndicator color={colors.teal} style={{ marginTop: 40 }} />
      ) : (
        <FlatList
          ref={list}
          data={posts}
          keyExtractor={(p) => p.id}
          initialNumToRender={50}
          onScrollToIndexFailed={(info) => {
            list.current?.scrollToOffset({ offset: info.averageItemLength * info.index, animated: false });
            setTimeout(() => list.current?.scrollToIndex({ index: info.index, animated: false }), 100);
          }}
          renderItem={({ item }) => (
            <PostCard post={item} meters={null} onLike={() => onLike(item)} onLikes={() => setLikesFor(item.id)} onComments={() => setCommentsFor(item.id)} onShare={() => onShare(item)} onMore={() => onMore(item)} />
          )}
          ListEmptyComponent={<Text style={styles.empty}>No posts here any more.</Text>}
        />
      )}
      <LikesSheet postId={likesFor} onClose={() => setLikesFor(null)} />
      <CommentsSheet postId={commentsFor} me={me} onClose={() => setCommentsFor(null)} onAdded={(pid) => patch(pid, (x) => ({ ...x, comments: x.comments + 1 }))} />
      <EditCaption
        post={editing}
        onClose={() => setEditing(null)}
        onSaved={(pid, caption) => {
          patch(pid, (x) => ({ ...x, caption: caption.trim() || null }));
          setEditing(null);
        }}
      />
    </View>
  );
}

function EditCaption({ post, onClose, onSaved }: { post: FeedPost | null; onClose: () => void; onSaved: (id: string, caption: string) => void }) {
  return (
    <Modal visible={post !== null} transparent animationType="slide" onRequestClose={onClose}>
      {post ? <EditBox key={post.id} post={post} onClose={onClose} onSaved={onSaved} /> : null}
    </Modal>
  );
}

function EditBox({ post, onClose, onSaved }: { post: FeedPost; onClose: () => void; onSaved: (id: string, caption: string) => void }) {
  const [text, setText] = useState(post.caption ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const keyboard = useKeyboardHeight();

  async function save() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await updateCaption(post.id, text);
      onSaved(post.id, text);
    } catch {
      setError('We couldn’t save. Check your connection and try again.');
      setBusy(false);
    }
  }

  return (
    <View style={styles.modalRoot}>
      <Pressable style={[StyleSheet.absoluteFill, styles.scrim]} onPress={onClose} />
      <View style={{ paddingBottom: keyboard }}>
        <SafeAreaView edges={keyboard ? [] : ['bottom']} style={styles.sheet}>
          <View style={styles.grab} />
          <Text style={styles.sheetTitle}>Edit caption</Text>
          <TextInput
            value={text}
            onChangeText={setText}
            multiline
            maxLength={500}
            autoFocus
            placeholder="Write a caption…"
            placeholderTextColor={colors.faint}
            style={styles.editInput}
            accessibilityLabel="Caption"
          />
          {error ? <Text style={styles.error}>{error}</Text> : null}
          <View style={styles.sheetRow}>
            <Pressable style={styles.cancel} onPress={onClose} accessibilityRole="button">
              <Text style={styles.cancelText}>Cancel</Text>
            </Pressable>
            <Pressable style={styles.save} onPress={save} disabled={busy} accessibilityRole="button">
              {busy ? <ActivityIndicator color={colors.navy} /> : <Text style={styles.saveText}>Save</Text>}
            </Pressable>
          </View>
        </SafeAreaView>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: ui.page },
  bar: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 18, paddingBottom: 10, borderBottomWidth: 1, borderBottomColor: colors.line },
  title: { fontFamily: fonts.extraBold, fontSize: 17, color: colors.ink },
  empty: { fontFamily: fonts.semiBold, fontSize: 14, color: colors.muted, textAlign: 'center', marginTop: 40, paddingHorizontal: 20 },
  modalRoot: { flex: 1, justifyContent: 'flex-end' },
  scrim: { backgroundColor: 'rgba(40,48,58,.5)' },
  sheet: { backgroundColor: colors.paper, borderTopLeftRadius: 26, borderTopRightRadius: 26, paddingHorizontal: 22, paddingBottom: 12 },
  grab: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: colors.line, marginVertical: 12 },
  sheetTitle: { fontFamily: fonts.extraBold, fontSize: 16, color: colors.ink, marginBottom: 10 },
  editInput: { minHeight: 90, maxHeight: 200, fontFamily: fonts.regular, fontSize: 15, lineHeight: 21, color: colors.ink, borderWidth: 1, borderColor: colors.line, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 10, textAlignVertical: 'top', backgroundColor: colors.white },
  error: { fontFamily: fonts.bold, fontSize: 12.5, color: colors.navy, backgroundColor: colors.yellow, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 6, overflow: 'hidden', marginTop: 8 },
  sheetRow: { flexDirection: 'row', gap: 12, marginTop: 14 },
  cancel: { flex: 1, alignItems: 'center', borderRadius: 14, borderWidth: 1, borderColor: colors.line, paddingVertical: 13 },
  cancelText: { fontFamily: fonts.bold, fontSize: 15, color: colors.ink },
  save: { flex: 1, alignItems: 'center', borderRadius: 14, backgroundColor: colors.teal, paddingVertical: 13 },
  saveText: { fontFamily: fonts.extraBold, fontSize: 15, color: colors.navy },
});
