import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FlatList, Pressable, RefreshControl, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Text, TextInput } from '@/components/text';
import { Avatar } from '@/components/avatar';
import { BackHeader } from '@/components/form';
import { colors, fonts } from '@/constants/theme';
import { type Conversation, fetchConversations, fetchPeople } from '@/lib/chat';
import { fmtAgo } from '@/lib/format';
import { useLive } from '@/lib/live';
import { describe, fetchNotifications, isPostReaction, markNotificationsRead, type Notification } from '@/lib/notifications';
import { type Person, personName } from '@/lib/posts';
import { useSession } from '@/lib/session';
import { usePullRefresh } from '@/lib/pull-refresh';

// Screen s20: Inbox with Messages and Notifications.
type Tab = 'messages' | 'notifications';

export default function Inbox() {
  const params = useLocalSearchParams<{ tab?: Tab }>();
  const { session } = useSession();
  // The bell on Home opens Notifications, the envelope opens Messages.
  const tab: Tab = params.tab === 'notifications' ? 'notifications' : 'messages';
  const [convos, setConvos] = useState<Conversation[] | null>(null);
  const [notes, setNotes] = useState<Notification[] | null>(null);
  const [people, setPeople] = useState<Map<string, Person>>(new Map());
  const [q, setQ] = useState('');
  const [now, setNow] = useState(() => Date.now());
  const userId = session?.user.id;

  const load = useCallback(async () => {
    if (!userId) return;
    try {
      const [c, n] = await Promise.all([fetchConversations(), fetchNotifications()]);
      setConvos(c);
      setNotes(n);
      setPeople(await fetchPeople(n.map((x) => x.payload.from).filter((x): x is string => Boolean(x))));
    } catch {
      setConvos((c) => c ?? []);
      setNotes((n) => n ?? []);
    }
    setNow(Date.now());
  }, [userId]);

  useLive(load);

  const pull = usePullRefresh(load);

  const unreadNotes = notes?.filter((n) => !n.read_at).length ?? 0;

  // Notifications are seen once the screen is opened; the dots stay until the next visit so the member can spot them.
  const seen = useRef(false);
  useEffect(() => {
    if (tab === 'notifications' && userId && unreadNotes && !seen.current) {
      seen.current = true;
      markNotificationsRead(userId);
    }
  }, [tab, userId, unreadNotes]);

  const shownConvos = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return convos ?? [];
    return (convos ?? []).filter((c) => `${personName(c.partner)} ${c.partner.username ?? ''} ${c.last_body}`.toLowerCase().includes(needle));
  }, [convos, q]);

  if (!session) {
    return (
      <SafeAreaView style={styles.screen}>
        <View style={{ paddingHorizontal: 20 }}>
          <BackHeader title="Inbox" />
          <Text style={styles.empty}>Sign up to message cooks and get order updates.</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.screen}>
      <View style={{ paddingHorizontal: 20 }}>
        <BackHeader title={tab === 'messages' ? 'Messages' : 'Notifications'} />
      </View>

      {tab === 'messages' ? (
        <FlatList
          data={shownConvos}
          keyExtractor={(c) => c.partner.id}
          contentContainerStyle={styles.list}
          refreshControl={<RefreshControl {...pull} tintColor={colors.teal} />}
          ListHeaderComponent={
            <TextInput value={q} onChangeText={setQ} placeholder="Search messages" placeholderTextColor={colors.faint} style={styles.search} accessibilityLabel="Search messages" />
          }
          renderItem={({ item }) => (
            <Pressable style={styles.row} onPress={() => router.push({ pathname: '/chat/[id]', params: { id: item.partner.id } })} accessibilityRole="button">
              <Avatar person={item.partner} />
              <View style={{ flex: 1 }}>
                <Text style={styles.rowTitle} numberOfLines={1}>{personName(item.partner)}</Text>
                <Text style={[styles.rowSub, item.unread > 0 && styles.unreadText]} numberOfLines={1}>
                  {item.last_from_me ? 'You: ' : ''}
                  {item.last_body}
                </Text>
              </View>
              <View style={{ alignItems: 'flex-end', gap: 6 }}>
                <Text style={styles.ago}>{fmtAgo(Date.parse(item.last_at), now)}</Text>
                {item.unread > 0 ? <Text style={styles.badge}>{item.unread}</Text> : null}
              </View>
            </Pressable>
          )}
          ListEmptyComponent={
            convos ? <Text style={styles.empty}>{q ? 'No messages match.' : 'No messages yet. Message a cook from their dish or your order.'}</Text> : null
          }
        />
      ) : (
        <FlatList
          data={notes ?? []}
          keyExtractor={(n) => n.id}
          contentContainerStyle={styles.list}
          refreshControl={<RefreshControl {...pull} tintColor={colors.teal} />}
          renderItem={({ item }) => {
            const d = describe(item, personName(people.get(item.payload.from ?? '')));
            // A rejected request that duplicates an existing community opens that community.
            const target = item.kind === 'community_rejected' && item.payload.redirect_id
              ? { pathname: '/community/[id]' as const, params: { id: item.payload.redirect_id } }
              : item.kind === 'post_removed' || item.kind === 'community_rejected'
              ? null
              : item.kind === 'community_approved' && item.payload.community_id
                ? { pathname: '/community/[id]' as const, params: { id: item.payload.community_id } }
                : item.payload.reservation_id
              ? { pathname: '/order/[id]' as const, params: { id: item.payload.reservation_id } }
              : item.payload.post_id
                ? { pathname: '/dish/[id]' as const, params: { id: item.payload.post_id } }
                : isPostReaction(item)
                  ? { pathname: '/post/[id]' as const, params: { id: item.payload.ref!, by: item.payload.profile_id! } }
                  : item.payload.profile_id
                  ? { pathname: '/cook/[id]' as const, params: { id: item.payload.profile_id } }
                  : null;
            return (
              <Pressable style={styles.row} onPress={target ? () => router.push(target) : undefined} accessibilityRole={target ? 'button' : undefined}>
                <View style={styles.noteIcon}>
                  <MaterialIcons name={d.icon} size={20} color={colors.navy} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.rowTitle, { fontSize: 14 }]}>{d.title}</Text>
                  {d.sub ? <Text style={styles.rowSub} numberOfLines={1}>{d.sub}</Text> : null}
                </View>
                <View style={{ alignItems: 'flex-end', gap: 6 }}>
                  <Text style={styles.ago}>{fmtAgo(Date.parse(item.created_at), now)}</Text>
                  {!item.read_at ? <View style={styles.dot} /> : null}
                </View>
              </Pressable>
            );
          }}
          ListEmptyComponent={notes ? <Text style={styles.empty}>No notifications yet. Order updates and cooks you follow show up here.</Text> : null}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.paper },
  list: { padding: 16, gap: 4, flexGrow: 1 },
  search: { fontFamily: fonts.semiBold, fontSize: 15, color: colors.ink, backgroundColor: colors.white, borderWidth: 1, borderColor: colors.line, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 11, marginBottom: 8 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10 },
  rowTitle: { fontFamily: fonts.extraBold, fontSize: 15, color: colors.ink },
  rowSub: { fontFamily: fonts.semiBold, fontSize: 13, color: colors.muted, marginTop: 2 },
  unreadText: { color: colors.ink, fontFamily: fonts.bold },
  ago: { fontFamily: fonts.semiBold, fontSize: 11.5, color: colors.muted },
  badge: { fontFamily: fonts.extraBold, fontSize: 11, color: colors.navy, backgroundColor: colors.teal, borderRadius: 999, minWidth: 20, textAlign: 'center', paddingHorizontal: 6, paddingVertical: 2, overflow: 'hidden' },
  noteIcon: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.lightBlue, alignItems: 'center', justifyContent: 'center' },
  dot: { width: 9, height: 9, borderRadius: 5, backgroundColor: colors.teal },
  empty: { fontFamily: fonts.semiBold, fontSize: 14, color: colors.muted, textAlign: 'center', marginTop: 40, paddingHorizontal: 20, lineHeight: 20 },
});
