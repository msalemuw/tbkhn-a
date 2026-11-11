import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Animated, Easing, PanResponder, type PanResponderGestureState, Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Text, TextInput } from '@/components/text';
import { Alert } from '@/lib/alert';
import { ActionSheet, type SheetAction } from '@/components/action-sheet';
import { ReportSheet, type ReportTarget } from '@/components/report-sheet';
import { confirmBlock } from '@/lib/blocks';
import { Avatar } from '@/components/avatar';
import { useKeyboardHeight } from '@/components/form';
import { colors, fonts } from '@/constants/theme';
import { useMenuOff } from '@/lib/app-status';
import { sendMessage } from '@/lib/chat';
import { deletePost, removeDish, setLiked } from '@/lib/feed';
import { distanceMeters, fmtAgo, fmtDist, fmtReady } from '@/lib/format';
import { useMyLocation } from '@/lib/location';
import { useOverlayInsets } from '@/lib/insets';
import { mediaUrl, personName } from '@/lib/posts';
import { useSession } from '@/lib/session';
import { fetchStories, markSeen, type StoryGroup } from '@/lib/stories';

const STORY_MS = 5000;

// Close goes back, or to Home when the story was opened with nothing behind it.
const closeStory = () => (router.canGoBack() ? router.back() : router.replace('/home'));

// Story viewer (design flows 4 and 17): tap to move on, progress bars on top, reply and heart below.
// Like Instagram: tap the sides for the next or previous story, swipe left or right for the next or previous person,
// hold a finger down to pause, swipe down to close.
// An "On today's menu" story carries the dish, its price and a Reserve button.
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
        <Pressable onPress={closeStory} style={styles.closeBtn}>
          <Text style={styles.closeText}>Close</Text>
        </Pressable>
      </SafeAreaView>
    );
  }
  // A deleted story leaves the viewer; when it was the last one, the viewer closes.
  function removeItem(itemId: string) {
    const next = groups!.map((g) => ({ ...g, items: g.items.filter((i) => i.id !== itemId) })).filter((g) => g.items.length);
    if (!next.length) return closeStory();
    setGroups(next);
    const here = next.findIndex((g) => g.author.id === group.author.id);
    if (here === -1) {
      setGi(Math.min(gi, next.length - 1));
      setIi(0);
    } else {
      setGi(here);
      setIi(Math.min(ii, next[here].items.length - 1));
    }
  }
  // One viewer per story: the key restarts the timer and the reply box each time.
  return (
    <Viewer
      key={`${group.author.id}-${ii}`}
      group={group}
      index={Math.min(ii, group.items.length - 1)}
      me={me}
      onDeleted={removeItem}
      onNext={() => {
        if (ii < group.items.length - 1) setIi(ii + 1);
        else if (gi < groups.length - 1) {
          setGi(gi + 1);
          setIi(0);
        } else closeStory();
      }}
      onPrev={() => {
        if (ii > 0) setIi(ii - 1);
        else if (gi > 0) {
          setGi(gi - 1);
          setIi(0);
        }
      }}
      onNextPerson={() => {
        if (gi < groups.length - 1) {
          setGi(gi + 1);
          setIi(0);
        } else closeStory();
      }}
      onPrevPerson={() => {
        if (gi > 0) {
          setGi(gi - 1);
          setIi(0);
        }
      }}
    />
  );
}

function Viewer({
  group,
  index,
  me,
  onNext,
  onPrev,
  onNextPerson,
  onPrevPerson,
  onDeleted,
}: {
  group: StoryGroup;
  index: number;
  me: string | null;
  onNext: () => void;
  onPrev: () => void;
  onNextPerson: () => void;
  onPrevPerson: () => void;
  onDeleted: (id: string) => void;
}) {
  const item = group.items[index];
  const mine = group.author.id === me;
  const here = useMyLocation();
  const keyboard = useKeyboardHeight();
  const insets = useOverlayInsets();
  const [progress] = useState(() => new Animated.Value(0));
  const [paused, setPaused] = useState(false);
  // A finger held on the story pauses it, and letting go carries on from the same spot.
  const [holding, setHolding] = useState(false);
  const stopped = paused || holding;
  const [menu, setMenu] = useState<{ title: string; actions: SheetAction[] } | null>(null);
  const [report, setReport] = useState<ReportTarget | null>(null);
  const [draft, setDraft] = useState('');
  const [liked, setLikedState] = useState(item.liked);
  const [sent, setSent] = useState(false);
  const photo = mediaUrl(item.media_path);
  const order = item.kind === 'cooking_today';
  const menuOff = useMenuOff();

  useEffect(() => {
    markSeen([item.id]);
  }, [item.id]);

  // The bar keeps its place while paused: a resume runs only the time that is left.
  const done = useRef(0);
  useEffect(() => {
    const id = progress.addListener(({ value }) => {
      done.current = value;
    });
    return () => progress.removeListener(id);
  }, [progress]);
  useEffect(() => {
    if (stopped) return;
    const anim = Animated.timing(progress, { toValue: 1, duration: Math.max(1, STORY_MS * (1 - done.current)), easing: Easing.linear, useNativeDriver: false });
    anim.start(({ finished }) => finished && onNext());
    return () => anim.stop();
  }, [stopped, progress, onNext]);

  // Swipes: sideways moves between people, downwards closes. The responder is made once (it keeps the gesture's progress);
  // `latest` carries the current handlers into it.
  const latest = useRef({ next: onNextPerson, prev: onPrevPerson, typing: false });
  useEffect(() => {
    latest.current = { next: onNextPerson, prev: onPrevPerson, typing: keyboard > 0 };
  });
  // Only a real drag takes over from the buttons and tap areas; a tap goes through untouched.
  const capture = useCallback((_: unknown, g: PanResponderGestureState) => !latest.current.typing && (Math.abs(g.dx) > 14 || g.dy > 14) && (Math.abs(g.dx) > Math.abs(g.dy) || g.dy > 0), []);
  const release = useCallback((_: unknown, g: PanResponderGestureState) => {
    if (Math.abs(g.dx) > Math.abs(g.dy)) {
      if (g.dx < -50) latest.current.next();
      else if (g.dx > 50) latest.current.prev();
    } else if (g.dy > 70) closeStory();
  }, []);
  // The handlers only read `latest` while a finger is moving, never while rendering.
  // eslint-disable-next-line react-hooks/refs
  const [pan] = useState(() => PanResponder.create({ onMoveShouldSetPanResponderCapture: capture, onPanResponderRelease: release }));

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

  // Your own stories can be deleted. For a "Today's menu" story that takes the dish off the menu too (it would end at midnight anyway).
  function confirmDelete() {
    setPaused(true);
    Alert.alert(order ? 'Remove this from Today’s menu?' : 'Delete this story?', order ? 'It will leave the menu and this story. Orders already sent stay.' : 'It will disappear for everyone.', [
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () =>
          (order ? removeDish(item.id) : deletePost(item.id)).then(
            () => onDeleted(item.id),
            () => {
              setPaused(false);
              Alert.alert('We couldn’t delete the story', 'Check your connection and try again.');
            },
          ),
      },
      { text: 'Cancel', style: 'cancel', onPress: () => setPaused(false) },
    ]);
  }

  // Meta-style "…" on someone else's story: the story pauses while the sheet is open.
  function openMore() {
    if (!me) return router.push('/sign-up');
    const name = personName(group.author);
    setPaused(true);
    setMenu({
      title: name,
      actions: [
        { label: 'Report story', destructive: true, onPress: () => setTimeout(() => setReport({ me, name, profileId: group.author.id, postId: item.id }), 350) },
        { label: `Block ${name}`, destructive: true, onPress: () => confirmBlock(name, group.author.id, closeStory) },
      ],
    });
  }

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
    <View style={styles.screen} {...pan.panHandlers}>
      {photo ? <Image source={{ uri: photo }} style={StyleSheet.absoluteFill} contentFit="cover" /> : <View style={[StyleSheet.absoluteFill, styles.plain]} />}
      <View style={[StyleSheet.absoluteFill, styles.shade]} pointerEvents="none" />
      <View style={StyleSheet.absoluteFill}>
        <Pressable style={styles.tapPrev} onPress={onPrev} onPressIn={() => setHolding(true)} onPressOut={() => setHolding(false)} onLongPress={() => {}} delayLongPress={250} accessibilityLabel="Previous" />
        <Pressable style={styles.tapNext} onPress={onNext} onPressIn={() => setHolding(true)} onPressOut={() => setHolding(false)} onLongPress={() => {}} delayLongPress={250} accessibilityLabel="Next" />
      </View>
      <View style={[styles.top, { paddingTop: insets.top + 8 }]} pointerEvents="box-none">
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
          <View style={styles.headActions}>
            {mine ? (
              <Pressable onPress={confirmDelete} hitSlop={8} accessibilityRole="button" accessibilityLabel={order ? 'Remove from Today’s menu' : 'Delete story'} style={styles.closeHit}>
                <MaterialIcons name="delete-outline" size={26} color={colors.white} />
              </Pressable>
            ) : (
              <Pressable onPress={openMore} hitSlop={8} accessibilityRole="button" accessibilityLabel="More" style={styles.closeHit}>
                <MaterialIcons name="more-horiz" size={28} color={colors.white} />
              </Pressable>
            )}
            <Pressable onPress={closeStory} hitSlop={8} accessibilityRole="button" accessibilityLabel="Close" style={styles.closeHit}>
              <MaterialIcons name="close" size={28} color={colors.white} />
            </Pressable>
          </View>
        </View>
      </View>
      <View style={[styles.bottom, { paddingBottom: keyboard ? keyboard + 8 : insets.bottom + 16 }]} pointerEvents="box-none">
        {order && !menuOff ? (
          <View style={styles.tagRow}>
            <Text style={styles.tag}>ON TODAY’S MENU</Text>
          </View>
        ) : null}
        {order && item.dish_name ? (
          <>
            <Text style={styles.caption}>{item.dish_name}</Text>
            <Text style={styles.sub}>
              EGP {Number(item.price_egp)} · {item.ready_at ? fmtReady(Date.parse(item.ready_at)) : ''} · {item.portions_left ?? 0} left
              {here && item.pickup_point ? ` · ${fmtDist(distanceMeters(here, { lat: item.pickup_point.area_lat, lng: item.pickup_point.area_lng }))} away` : ''}
            </Text>
          </>
        ) : null}
        {item.caption ? <Text verbatim style={[styles.caption, order && { fontSize: 15, marginTop: 2 }]}>{item.caption}</Text> : null}
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
            {order && !menuOff ? (
              <Pressable style={styles.reserve} onPress={() => router.replace({ pathname: '/dish/[id]', params: { id: item.id } })} accessibilityRole="button">
                <MaterialIcons name="soup-kitchen" size={18} color={colors.navy} />
                <Text style={styles.reserveText}>Reserve</Text>
              </Pressable>
            ) : null}
          </View>
        )}
      </View>
      <ActionSheet title={menu?.title ?? null} actions={menu?.actions ?? []} onClose={() => { setMenu(null); setPaused(false); }} />
      <ReportSheet target={report} onClose={() => setReport(null)} />
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
  headActions: { flexDirection: 'row', alignItems: 'center' },
  closeHit: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', marginRight: -8 },
  who: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  whoName: { fontFamily: fonts.extraBold, fontSize: 14, color: colors.white },
  whoWhen: { fontFamily: fonts.medium, fontSize: 12, color: 'rgba(255,255,255,.8)' },
  bottom: { position: 'absolute', bottom: 0, left: 0, right: 0, paddingHorizontal: 16, gap: 6 },
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
