import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Animated, Easing, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Avatar } from '@/components/avatar';
import { useKeyboardHeight } from '@/components/form';
import { colors, fonts } from '@/constants/theme';
import { sendMessage } from '@/lib/chat';
import { setLiked } from '@/lib/feed';
import { fmtAgo, fmtReady } from '@/lib/format';
import { mediaUrl, personName } from '@/lib/posts';
import { useSession } from '@/lib/session';
import { fetchStories, markSeen, type StoryGroup } from '@/lib/stories';

const STORY_MS = 5000;

// Story viewer (design flows 4 and 17): tap to move on, progress bars on top, reply and heart below.
// A "Taking orders" story carries the dish, its price and a Reserve button.
export default function StoryViewer() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { session } = useSession();
  const me = session?.user.id ?? null;
  const [groups, setGroups] = useState<StoryGroup[] | null>(null);
  const [gi, setGi] = useState(0);
  const [ii, setIi] = useState(0);

  useEffect(() => {
    fetchStories(me).then(
      (g) => {
        setGroups(g);
        setGi(Math.max(0, g.findIndex((x) => x.author.id === id)));
      },
      () => setGroups([]),
    );
  }, [me, id]);

  if (groups === null) {
    return (
      <View style={[styles.screen, styles.center]}>
        <ActivityIndicator color={colors.white} />
      </View>
    );
  }
  const group = groups[gi];
  if (!group) {
    return (
      <SafeAreaView style={[styles.screen, styles.center]}>
        <Text style={styles.empty}>This story has ended.</Text>
        <Pressable onPress={() => router.back()} style={styles.closeBtn}>
          <Text style={styles.closeText}>Close</Text>
        </Pressable>
      </SafeAreaView>
    );
  }
  // One viewer per story: the key restarts the timer and the reply box each time.
  return (
    <Viewer
      key={`${group.author.id}-${ii}`}
      group={group}
      index={Math.min(ii, group.items.length - 1)}
      me={me}
      onNext={() => {
        if (ii < group.items.length - 1) setIi(ii + 1);
        else if (gi < groups.length - 1) {
          setGi(gi + 1);
          setIi(0);
        } else router.back();
      }}
      onPrev={() => {
        if (ii > 0) setIi(ii - 1);
        else if (gi > 0) {
          setGi(gi - 1);
          setIi(0);
        }
      }}
    />
  );
}

function Viewer({ group, index, me, onNext, onPrev }: { group: StoryGroup; index: number; me: string | null; onNext: () => void; onPrev: () => void }) {
  const item = group.items[index];
  const mine = group.author.id === me;
  const keyboard = useKeyboardHeight();
  const [progress] = useState(() => new Animated.Value(0));
  const [paused, setPaused] = useState(false);
  const [draft, setDraft] = useState('');
  const [liked, setLikedState] = useState(item.liked);
  const [sent, setSent] = useState(false);
  const photo = mediaUrl(item.media_path);
  const order = item.kind === 'cooking_today';

  useEffect(() => {
    markSeen([item.id]);
  }, [item.id]);

  useEffect(() => {
    if (paused) return;
    const anim = Animated.timing(progress, { toValue: 1, duration: STORY_MS, easing: Easing.linear, useNativeDriver: false });
    progress.setValue(0);
    anim.start(({ finished }) => finished && onNext());
    return () => anim.stop();
  }, [paused, progress, onNext]);

  const toggleLike = useCallback(async () => {
    if (!me) return router.push('/sign-up');
    const next = !liked;
    setLikedState(next);
    try {
      await setLiked(me, item.id, next);
    } catch {
      setLikedState(!next);
    }
  }, [liked, me, item.id]);

  async function reply() {
    if (!me) return router.push('/sign-up');
    if (!draft.trim()) return;
    try {
      await sendMessage(me, group.author.id, `Replying to your story: ${draft}`, null);
      setDraft('');
      setSent(true);
      setPaused(false);
    } catch {}
  }

  return (
    <View style={styles.screen}>
      {photo ? <Image source={{ uri: photo }} style={StyleSheet.absoluteFill} contentFit="cover" /> : <View style={[StyleSheet.absoluteFill, styles.plain]} />}
      <View style={[StyleSheet.absoluteFill, styles.shade]} pointerEvents="none" />
      <View style={StyleSheet.absoluteFill}>
        <Pressable style={styles.tapPrev} onPress={onPrev} accessibilityLabel="Previous" />
        <Pressable style={styles.tapNext} onPress={onNext} accessibilityLabel="Next" />
      </View>
      <SafeAreaView style={styles.top} edges={['top']} pointerEvents="box-none">
        <View style={styles.bars}>
          {group.items.map((it, i) => (
            <View key={it.id} style={styles.bar}>
              <Animated.View
                style={[styles.fill, { width: i < index ? '100%' : i === index ? progress.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }) : '0%' }]}
              />
            </View>
          ))}
        </View>
        <View style={styles.head}>
          <Pressable style={styles.who} onPress={() => router.replace({ pathname: '/cook/[id]', params: { id: group.author.id } })}>
            <Avatar person={group.author} size={36} />
            <View>
              <Text style={styles.whoName}>{mine ? 'Your story' : personName(group.author)}</Text>
              <Text style={styles.whoWhen}>{fmtAgo(Date.parse(item.created_at))}</Text>
            </View>
          </Pressable>
          <Pressable onPress={() => router.back()} hitSlop={12} accessibilityLabel="Close">
            <MaterialIcons name="close" size={26} color={colors.white} />
          </Pressable>
        </View>
      </SafeAreaView>
      <SafeAreaView style={[styles.bottom, { paddingBottom: keyboard ? keyboard + 8 : undefined }]} edges={keyboard ? [] : ['bottom']} pointerEvents="box-none">
        {order ? (
          <View style={styles.tagRow}>
            <Text style={styles.tag}>TAKING ORDERS</Text>
          </View>
        ) : null}
        {order && item.dish_name ? (
          <>
            <Text style={styles.caption}>{item.dish_name}</Text>
            <Text style={styles.sub}>
              EGP {Number(item.price_egp)} · {item.ready_at ? fmtReady(Date.parse(item.ready_at)) : ''} · {item.portions_left ?? 0} left
              {item.community ? ` · ${item.community.name}` : ''}
            </Text>
          </>
        ) : null}
        {item.caption ? <Text style={[styles.caption, order && { fontSize: 15, marginTop: 2 }]}>{item.caption}</Text> : null}
        {mine ? (
          <View style={styles.mineRow}>
            <MaterialIcons name="favorite" size={16} color={colors.white} />
            <Text style={styles.mineText}>{item.likes} {item.likes === 1 ? 'like' : 'likes'}</Text>
            <Text style={[styles.mineText, { marginLeft: 'auto' }]}>{order ? 'Ends at midnight' : 'Stays 24 hours'}</Text>
          </View>
        ) : (
          <View style={styles.replyRow}>
            <TextInput
              value={draft}
              onChangeText={setDraft}
              onFocus={() => setPaused(true)}
              onBlur={() => setPaused(false)}
              onSubmitEditing={reply}
              returnKeyType="send"
              placeholder={sent ? 'Sent' : `Reply to ${personName(group.author).split(' ')[0]}…`}
              placeholderTextColor="rgba(255,255,255,.7)"
              style={styles.input}
              accessibilityLabel="Reply to story"
            />
            <Pressable onPress={toggleLike} style={styles.round} accessibilityRole="button" accessibilityLabel={liked ? 'Unlike' : 'Like'}>
              <MaterialIcons name={liked ? 'favorite' : 'favorite-border'} size={22} color={colors.white} />
            </Pressable>
            {order ? (
              <Pressable style={styles.reserve} onPress={() => router.replace({ pathname: '/dish/[id]', params: { id: item.id } })} accessibilityRole="button">
                <MaterialIcons name="soup-kitchen" size={18} color={colors.navy} />
                <Text style={styles.reserveText}>Reserve</Text>
              </Pressable>
            ) : null}
          </View>
        )}
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.navy },
  center: { alignItems: 'center', justifyContent: 'center' },
  plain: { backgroundColor: colors.navy },
  shade: { backgroundColor: 'rgba(40,48,58,.28)' },
  empty: { fontFamily: fonts.bold, fontSize: 16, color: colors.white },
  closeBtn: { marginTop: 16, backgroundColor: colors.teal, borderRadius: 14, paddingHorizontal: 22, paddingVertical: 12 },
  closeText: { fontFamily: fonts.extraBold, fontSize: 15, color: colors.navy },
  tapPrev: { position: 'absolute', left: 0, top: 0, bottom: 0, width: '30%' },
  tapNext: { position: 'absolute', right: 0, top: 0, bottom: 0, width: '70%' },
  top: { position: 'absolute', top: 0, left: 0, right: 0, paddingHorizontal: 14, gap: 10 },
  bars: { flexDirection: 'row', gap: 4, marginTop: 6 },
  bar: { flex: 1, height: 3, borderRadius: 2, backgroundColor: 'rgba(255,255,255,.3)', overflow: 'hidden' },
  fill: { height: '100%', backgroundColor: colors.white, borderRadius: 2 },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  who: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  whoName: { fontFamily: fonts.extraBold, fontSize: 14, color: colors.white },
  whoWhen: { fontFamily: fonts.medium, fontSize: 12, color: 'rgba(255,255,255,.8)' },
  bottom: { position: 'absolute', bottom: 0, left: 0, right: 0, paddingHorizontal: 16, paddingBottom: 12, gap: 6 },
  tagRow: { flexDirection: 'row' },
  tag: { fontFamily: fonts.extraBold, fontSize: 11, letterSpacing: 0.8, color: colors.navy, backgroundColor: colors.yellow, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3, overflow: 'hidden' },
  caption: { fontFamily: fonts.extraBold, fontSize: 20, lineHeight: 26, color: colors.white },
  sub: { fontFamily: fonts.bold, fontSize: 14, color: colors.white },
  replyRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 8 },
  input: { flex: 1, fontFamily: fonts.semiBold, fontSize: 15, color: colors.white, borderWidth: 1.5, borderColor: 'rgba(255,255,255,.6)', borderRadius: 999, paddingHorizontal: 16, paddingVertical: 10, backgroundColor: 'rgba(40,48,58,.35)' },
  round: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(40,48,58,.35)' },
  reserve: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: colors.teal, borderRadius: 999, paddingHorizontal: 16, paddingVertical: 12 },
  reserveText: { fontFamily: fonts.extraBold, fontSize: 14, color: colors.navy },
  mineRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8 },
  mineText: { fontFamily: fonts.bold, fontSize: 13, color: colors.white },
});
