import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { FlatList, RefreshControl, Text, View } from 'react-native';

import { AdminScreen, adminStyles, Card, ErrorLine, ReasonModal, SmallButton, useStaffRole } from '@/components/admin-ui';
import { colors } from '@/constants/theme';
import { canAct, dismissReports, fetchOpenReports, removePost, type ReportGroup, setSuspended } from '@/lib/admin';
import { fmtAgo } from '@/lib/format';

// Reports from "Report post" and a profile's "Report", grouped by post or member, most reported first.
const KIND_LABEL: Record<string, string> = { cooking_today: 'Cooking today', story: 'Story', signature: 'Signature dish' };

export default function Reports() {
  const role = useStaffRole();
  const [items, setItems] = useState<ReportGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [ask, setAsk] = useState<Parameters<typeof ReasonModal>[0]['ask']>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setItems(await fetchOpenReports());
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load');
    }
    setLoading(false);
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const after = (run: (reason: string) => Promise<unknown>) => async (reason: string) => {
    await run(reason);
    await load();
  };

  return (
    <AdminScreen title="Reports">
      <FlatList
        data={items}
        keyExtractor={(g) => g.report_ids[0]}
        contentContainerStyle={adminStyles.list}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={load} tintColor={colors.teal} />}
        ListHeaderComponent={<ErrorLine text={error} />}
        ListEmptyComponent={loading ? null : <Text style={adminStyles.empty}>No open reports.</Text>}
        renderItem={({ item }) => {
          const owner = item.owner_name ?? (item.owner_username ? `@${item.owner_username}` : 'A member');
          const isPost = Boolean(item.post_id);
          return (
            <Card>
              <Text style={adminStyles.tag}>
                {item.reports} {item.reports === 1 ? 'REPORT' : 'REPORTS'}
              </Text>
              <Text style={[adminStyles.title, { marginTop: 8 }]}>
                {isPost ? `${KIND_LABEL[item.post_kind ?? ''] ?? 'Post'} by ${owner}` : `Profile: ${owner}`}
              </Text>
              {isPost && (item.post_dish || item.post_caption) ? (
                <Text style={adminStyles.body} numberOfLines={3}>
                  {[item.post_dish, item.post_caption].filter(Boolean).join(' · ')}
                </Text>
              ) : null}
              {item.reasons.map((r, i) => (
                <Text key={i} style={adminStyles.muted}>
                  “{r}”
                </Text>
              ))}
              <Text style={adminStyles.muted}>First reported {fmtAgo(Date.parse(item.first_at))}</Text>
              {item.post_removed ? <Text style={adminStyles.muted}>Post already removed</Text> : null}
              {item.owner_suspended ? <Text style={adminStyles.muted}>Member already suspended</Text> : null}
              <View style={adminStyles.row}>
                {item.owner_id ? (
                  <SmallButton label="Open profile" onPress={() => router.push({ pathname: '/cook/[id]', params: { id: item.owner_id! } })} />
                ) : null}
                {canAct(role) && isPost && !item.post_removed ? (
                  <SmallButton
                    label="Remove post"
                    strong
                    onPress={() => setAsk({ title: 'Remove this post?', action: 'Remove post', run: after((r) => removePost(item.post_id!, r)) })}
                  />
                ) : null}
                {canAct(role) && item.owner_id && !item.owner_suspended ? (
                  <SmallButton
                    label="Suspend member"
                    onPress={() => setAsk({ title: `Suspend ${owner}?`, action: 'Suspend', run: after((r) => setSuspended(item.owner_id!, true, r)) })}
                  />
                ) : null}
                {canAct(role) ? (
                  <SmallButton
                    label="Dismiss"
                    onPress={() => setAsk({ title: 'Dismiss these reports?', action: 'Dismiss', optional: true, run: after((r) => dismissReports(item, r)) })}
                  />
                ) : null}
              </View>
            </Card>
          );
        }}
      />
      <ReasonModal ask={ask} onClose={() => setAsk(null)} />
    </AdminScreen>
  );
}
