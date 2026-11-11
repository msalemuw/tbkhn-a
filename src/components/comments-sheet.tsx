import { router } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Modal, Pressable, StyleSheet, type TextInput as RNTextInput, useWindowDimensions, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import MaterialIcons from '@expo/vector-icons/MaterialIcons';

import { Text, TextInput } from '@/components/text';
import { GrabHandle } from '@/components/grab-handle';
import { Alert } from '@/lib/alert';
import { FlipIcon } from '@/components/flip-icon';
import { Avatar } from '@/components/avatar';
import { useKeyboardHeight } from '@/components/form';
import { colors, fonts } from '@/constants/theme';
import { ActionSheet, type SheetAction } from '@/components/action-sheet';
import { ReportSheet, type ReportTarget } from '@/components/report-sheet';
import { confirmBlock } from '@/lib/blocks';
import { addComment, type Comment, deleteComment, fetchComments } from '@/lib/feed';
import { fmtAgo } from '@/lib/format';
import { personName } from '@/lib/posts';

type Row = { kind: 'comment'; c: Comment; reply: boolean } | { kind: 'toggle'; parent: Comment; count: number; open: boolean };

/** "Comments · 18" bottom sheet from the design: the thread, and a box to add yours. Replies sit under their comment, one level deep, like Instagram. */
export function CommentsSheet({
  postId,
  me,
  onClose,
  onAdded,
  onRemoved,
}: {
  postId: string | null;
  me: string | null;
  onClose: () => void;
  onAdded: (postId: string) => void;
  onRemoved?: (postId: string) => void;
}) {
  return (
    <Modal visible={postId !== null} transparent animationType="slide" onRequestClose={onClose}>
      {postId ? <Thread key={postId} postId={postId} me={me} onClose={onClose} onAdded={onAdded} onRemoved={onRemoved} /> : null}
    </Modal>
  );
}

function Thread({ postId, me, onClose, onAdded, onRemoved }: { postId: string; me: string | null; onClose: () => void; onAdded: (postId: string) => void; onRemoved?: (postId: string) => void }) {
  const [items, setItems] = useState<Comment[] | null>(null);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // The comment being answered, and which comments have their replies showing.
  const [replyTo, setReplyTo] = useState<Comment | null>(null);
  const [expanded, setExpanded] = useState<string[]>([]);
  const inputRef = useRef<RNTextInput>(null);
  const [menu, setMenu] = useState<{ title: string; actions: SheetAction[] } | null>(null);
  const [report, setReport] = useState<ReportTarget | null>(null);
  const keyboard = useKeyboardHeight();
  const { height: screenH } = useWindowDimensions();

  const load = useCallback(() => {
    fetchComments(postId).then(setItems, () => setItems([]));
  }, [postId]);

  useEffect(load, [load]);

  // Top-level comments in order, each followed by a "View n replies" line and, when open, its replies.
  const rows = useMemo<Row[]>(() => {
    const replies = new Map<string, Comment[]>();
    const tops: Comment[] = [];
    for (const c of items ?? []) {
      if (c.parent_id) replies.set(c.parent_id, [...(replies.get(c.parent_id) ?? []), c]);
      else tops.push(c);
    }
    return tops.flatMap<Row>((t) => {
      const rs = replies.get(t.id) ?? [];
      const open = expanded.includes(t.id);
      return [{ kind: 'comment', c: t, reply: false }, ...(rs.length ? [{ kind: 'toggle' as const, parent: t, count: rs.length, open }] : []), ...(open ? rs.map((c) => ({ kind: 'comment' as const, c, reply: true })) : [])];
    });
  }, [items, expanded]);

  function startReply(c: Comment) {
    if (!me) {
      onClose();
      return router.push('/sign-up');
    }
    setReplyTo(c);
    setTimeout(() => inputRef.current?.focus(), 50);
  }

  function remove(c: Comment) {
    const replies = (items ?? []).filter((x) => x.parent_id === c.id).length;
    Alert.alert('Delete your comment?', replies ? 'It and its replies will disappear for everyone.' : 'It will disappear for everyone.', [
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () =>
          deleteComment(c.id).then(
            () => {
              setItems((l) => (l ?? []).filter((x) => x.id !== c.id && x.parent_id !== c.id));
              if (replyTo && (replyTo.id === c.id || replyTo.parent_id === c.id)) setReplyTo(null);
              onRemoved?.(postId);
            },
            () => Alert.alert('We couldn’t delete your comment', 'Check your connection and try again.'),
          ),
      },
      { text: 'Cancel', style: 'cancel' },
    ]);
  }

  // Meta-style "…" on someone else's comment: Report (pick a reason) or Block.
  function more(c: Comment) {
    if (!me || !c.author) return;
    const who = c.author;
    const name = personName(who);
    setMenu({
      title: name,
      actions: [
        { label: 'Report comment', destructive: true, onPress: () => setTimeout(() => setReport({ me, name, profileId: who.id, quote: c.body }), 350) },
        { label: `Block ${name}`, destructive: true, onPress: () => confirmBlock(name, who.id, () => setItems((l) => (l ?? []).filter((x) => x.author?.id !== who.id))) },
      ],
    });
  }

  async function send() {
    if (!me) {
      onClose();
      return router.push('/sign-up');
    }
    if (!draft.trim() || busy) return;
    setBusy(true);
    setError(null);
    try {
      await addComment(me, postId, draft, replyTo ? { parentId: replyTo.parent_id ?? replyTo.id, replyToId: replyTo.id } : undefined);
      // Show the new reply: open the thread it went into.
      const thread = replyTo ? (replyTo.parent_id ?? replyTo.id) : null;
      if (thread) setExpanded((e) => (e.includes(thread) ? e : [...e, thread]));
      setReplyTo(null);
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
            <GrabHandle onClose={onClose} />
            <Text style={styles.title}>Comments{items ? ` · ${items.length}` : ''}</Text>
            {items === null ? (
              <ActivityIndicator color={colors.teal} style={{ marginTop: 30 }} />
            ) : (
              <FlatList
                data={rows}
                keyExtractor={(r) => (r.kind === 'comment' ? r.c.id : `more-${r.parent.id}`)}
                keyboardShouldPersistTaps="handled"
                ListEmptyComponent={<Text style={styles.empty}>No comments yet. Be the first.</Text>}
                renderItem={({ item: r }) => {
                  if (r.kind === 'toggle') {
                    return (
                      <Pressable
                        style={styles.toggle}
                        onPress={() => setExpanded((e) => (r.open ? e.filter((x) => x !== r.parent.id) : [...e, r.parent.id]))}
                        accessibilityRole="button">
                        <View style={styles.toggleLine} />
                        <Text style={styles.toggleText}>{r.open ? 'Hide replies' : `View ${r.count} ${r.count === 1 ? 'reply' : 'replies'}`}</Text>
                      </Pressable>
                    );
                  }
                  const item = r.c;
                  // A reply to another reply says who it answers; a reply straight under its comment does not need to.
                  const answered = r.reply && item.reply_to_id && item.reply_to_id !== item.parent_id ? (items ?? []).find((x) => x.id === item.reply_to_id) : null;
                  return (
                    <View style={[styles.row, r.reply && styles.replyRow]}>
                      <Avatar person={item.author} size={r.reply ? 26 : 32} />
                      <View style={{ flex: 1 }}>
                        <Text style={styles.line}>
                          <Text style={styles.name}>{personName(item.author)}</Text>
                          <Text style={styles.when}>  {fmtAgo(Date.parse(item.created_at))}</Text>
                        </Text>
                        {answered ? <Text style={styles.answering}>{`Replying to ${personName(answered.author)}`}</Text> : null}
                        <Text verbatim style={styles.body}>{item.body}</Text>
                        <Pressable onPress={() => startReply(item)} hitSlop={8} accessibilityRole="button" accessibilityLabel={`Reply to ${personName(item.author)}`} style={styles.replyBtn}>
                          <Text style={styles.replyText}>Reply</Text>
                        </Pressable>
                      </View>
                      {me && item.author?.id === me ? (
                        <Pressable onPress={() => remove(item)} hitSlop={10} accessibilityRole="button" accessibilityLabel="Delete your comment">
                          <MaterialIcons name="delete-outline" size={20} color={colors.muted} />
                        </Pressable>
                      ) : me && item.author ? (
                        <Pressable onPress={() => more(item)} hitSlop={10} accessibilityRole="button" accessibilityLabel="More">
                          <MaterialIcons name="more-horiz" size={22} color={colors.muted} />
                        </Pressable>
                      ) : null}
                    </View>
                  );
                }}
              />
            )}
            {error ? <Text style={styles.error}>{error}</Text> : null}
            {replyTo ? (
              <View style={styles.replyBar}>
                <Text style={styles.replyBarText} numberOfLines={1}>{`Replying to ${personName(replyTo.author)}`}</Text>
                <Pressable onPress={() => setReplyTo(null)} hitSlop={10} accessibilityRole="button" accessibilityLabel="Cancel reply">
                  <MaterialIcons name="close" size={18} color={colors.muted} />
                </Pressable>
              </View>
            ) : null}
            <View style={styles.inputRow}>
              <TextInput
                ref={inputRef}
                value={draft}
                onChangeText={setDraft}
                placeholder={me ? (replyTo ? `Reply to ${personName(replyTo.author)}…` : 'Add a comment…') : 'Sign up to comment'}
                placeholderTextColor={colors.faint}
                maxLength={500}
                style={styles.input}
                accessibilityLabel="Add a comment"
              />
              <Pressable onPress={send} disabled={busy || (!draft.trim() && !!me)} hitSlop={8} accessibilityLabel="Send comment">
                {busy ? <ActivityIndicator color={colors.teal} /> : <FlipIcon name="send" size={22} color={draft.trim() || !me ? colors.ink : colors.faint} />}
              </Pressable>
            </View>
          </SafeAreaView>
        </View>
      </View>
      <ActionSheet title={menu?.title ?? null} actions={menu?.actions ?? []} onClose={() => setMenu(null)} />
      <ReportSheet target={report} onClose={() => setReport(null)} />
    </>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: 'flex-end' },
  scrim: { backgroundColor: 'rgba(40,48,58,.5)' },
  sheet: { backgroundColor: colors.paper, borderTopLeftRadius: 26, borderTopRightRadius: 26, paddingHorizontal: 22 },
  title: { fontFamily: fonts.extraBold, fontSize: 16, color: colors.ink, marginBottom: 8 },
  empty: { fontFamily: fonts.semiBold, fontSize: 14, color: colors.muted, textAlign: 'center', marginTop: 30 },
  row: { flexDirection: 'row', gap: 10, paddingVertical: 9 },
  replyRow: { marginLeft: 42 },
  replyBtn: { alignSelf: 'flex-start', paddingTop: 4 },
  replyText: { fontFamily: fonts.bold, fontSize: 12, color: colors.muted },
  answering: { fontFamily: fonts.medium, fontSize: 12, color: colors.muted, marginTop: 1 },
  toggle: { flexDirection: 'row', alignItems: 'center', gap: 10, marginLeft: 42, paddingVertical: 4 },
  toggleLine: { width: 24, height: 1, backgroundColor: colors.line },
  toggleText: { fontFamily: fonts.bold, fontSize: 12, color: colors.muted },
  replyBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, backgroundColor: colors.cream, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 7, marginTop: 4 },
  replyBarText: { flex: 1, fontFamily: fonts.semiBold, fontSize: 12.5, color: colors.muted },
  line: { fontSize: 13 },
  name: { fontFamily: fonts.bold, fontSize: 13, color: colors.ink },
  when: { fontFamily: fonts.medium, fontSize: 12, color: colors.muted },
  body: { fontFamily: fonts.regular, fontSize: 14, lineHeight: 19, color: colors.ink, marginTop: 1 },
  error: { fontFamily: fonts.bold, fontSize: 12.5, color: colors.navy, backgroundColor: colors.yellow, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 6, overflow: 'hidden', marginBottom: 6 },
  inputRow: { flexDirection: 'row', alignItems: 'center', gap: 12, borderTopWidth: 1, borderTopColor: colors.line, paddingVertical: 10 },
  input: { flex: 1, fontFamily: fonts.semiBold, fontSize: 15, color: colors.ink, borderWidth: 1, borderColor: colors.line, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 9 },
});
