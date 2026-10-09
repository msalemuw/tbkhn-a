import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Modal, Pressable, StyleSheet, Text, TextInput, useWindowDimensions, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Avatar } from '@/components/avatar';
import { useKeyboardHeight } from '@/components/form';
import { colors, fonts } from '@/constants/theme';
import { addComment, type Comment, fetchComments } from '@/lib/feed';
import { fmtAgo } from '@/lib/format';
import { personName } from '@/lib/posts';

/** "Comments · 18" bottom sheet from the design: the thread, and a box to add yours. */
export function CommentsSheet({
  postId,
  me,
  onClose,
  onAdded,
}: {
  postId: string | null;
  me: string | null;
  onClose: () => void;
  onAdded: (postId: string) => void;
}) {
  return (
    <Modal visible={postId !== null} transparent animationType="slide" onRequestClose={onClose}>
      {postId ? <Thread key={postId} postId={postId} me={me} onClose={onClose} onAdded={onAdded} /> : null}
    </Modal>
  );
}

function Thread({ postId, me, onClose, onAdded }: { postId: string; me: string | null; onClose: () => void; onAdded: (postId: string) => void }) {
  const [items, setItems] = useState<Comment[] | null>(null);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const keyboard = useKeyboardHeight();
  const { height: screenH } = useWindowDimensions();

  const load = useCallback(() => {
    fetchComments(postId).then(setItems, () => setItems([]));
  }, [postId]);

  useEffect(load, [load]);

  async function send() {
    if (!me) {
      onClose();
      return router.push('/sign-up');
    }
    if (!draft.trim() || busy) return;
    setBusy(true);
    setError(null);
    try {
      await addComment(me, postId, draft);
      setDraft('');
      onAdded(postId);
      load();
    } catch {
      setError('We couldn’t send your comment. Try again.');
    }
    setBusy(false);
  }

  return (
    <>
      <View style={styles.root}>
        <Pressable style={[StyleSheet.absoluteFill, styles.scrim]} onPress={onClose} />
        <View style={{ paddingBottom: keyboard }}>
          <SafeAreaView edges={keyboard ? [] : ['bottom']} style={[styles.sheet, { height: Math.min(Math.round(screenH * 0.7), screenH - keyboard - 60) }]}>
            <View style={styles.grab} />
            <Text style={styles.title}>Comments{items ? ` · ${items.length}` : ''}</Text>
            {items === null ? (
              <ActivityIndicator color={colors.teal} style={{ marginTop: 30 }} />
            ) : (
              <FlatList
                data={items}
                keyExtractor={(c) => c.id}
                keyboardShouldPersistTaps="handled"
                ListEmptyComponent={<Text style={styles.empty}>No comments yet. Be the first.</Text>}
                renderItem={({ item }) => (
                  <View style={styles.row}>
                    <Avatar person={item.author} size={32} />
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
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: 'flex-end' },
  scrim: { backgroundColor: 'rgba(40,48,58,.5)' },
  sheet: { backgroundColor: colors.paper, borderTopLeftRadius: 26, borderTopRightRadius: 26, paddingHorizontal: 22 },
  grab: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: colors.line, marginVertical: 12 },
  title: { fontFamily: fonts.extraBold, fontSize: 16, color: colors.ink, marginBottom: 8 },
  empty: { fontFamily: fonts.semiBold, fontSize: 14, color: colors.muted, textAlign: 'center', marginTop: 30 },
  row: { flexDirection: 'row', gap: 10, paddingVertical: 9 },
  line: { fontSize: 13 },
  name: { fontFamily: fonts.bold, fontSize: 13, color: colors.ink },
  when: { fontFamily: fonts.medium, fontSize: 12, color: colors.muted },
  body: { fontFamily: fonts.regular, fontSize: 14, lineHeight: 19, color: colors.ink, marginTop: 1 },
  error: { fontFamily: fonts.bold, fontSize: 12.5, color: colors.navy, backgroundColor: colors.yellow, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 6, overflow: 'hidden', marginBottom: 6 },
  inputRow: { flexDirection: 'row', alignItems: 'center', gap: 12, borderTopWidth: 1, borderTopColor: colors.line, paddingVertical: 10 },
  input: { flex: 1, fontFamily: fonts.semiBold, fontSize: 15, color: colors.ink, borderWidth: 1, borderColor: colors.line, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 9 },
});
