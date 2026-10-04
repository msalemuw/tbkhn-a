import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { FlatList, RefreshControl, Text, View } from 'react-native';

import { AdminScreen, adminStyles, Card, ErrorLine, ReasonModal, SmallButton, useStaffRole } from '@/components/admin-ui';
import { colors } from '@/constants/theme';
import { canAct, type CommunityRequest, fetchCommunityRequests, reviewCommunity } from '@/lib/admin';
import { fmtAgo } from '@/lib/format';

// Requests from "Request a new community" (flow 7). The app promises a review in 1 to 2 days.
export default function CommunityRequests() {
  const role = useStaffRole();
  const [items, setItems] = useState<CommunityRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [ask, setAsk] = useState<Parameters<typeof ReasonModal>[0]['ask']>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setItems(await fetchCommunityRequests());
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

  const approve = async (c: CommunityRequest) => {
    try {
      await reviewCommunity(c.id, 'approved');
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not approve');
    }
  };

  return (
    <AdminScreen title="Community requests">
      <FlatList
        data={items}
        keyExtractor={(c) => c.id}
        contentContainerStyle={adminStyles.list}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={load} tintColor={colors.teal} />}
        ListHeaderComponent={<ErrorLine text={error} />}
        ListEmptyComponent={loading ? null : <Text style={adminStyles.empty}>No requests waiting.</Text>}
        renderItem={({ item }) => (
          <Card>
            <Text style={adminStyles.title}>{item.name}</Text>
            <Text style={adminStyles.muted}>
              {[item.kind, item.area, item.governorate].filter(Boolean).join(' · ')}
            </Text>
            <Text style={adminStyles.muted}>
              Asked by {item.requester_name ?? item.requester_username ?? 'a member'} · {fmtAgo(Date.parse(item.created_at))}
            </Text>
            {canAct(role) ? (
              <View style={adminStyles.row}>
                <SmallButton label="Approve" strong onPress={() => approve(item)} />
                <SmallButton
                  label="Reject"
                  onPress={() =>
                    setAsk({
                      title: `Reject “${item.name}”?`,
                      action: 'Reject request',
                      run: async (reason) => {
                        await reviewCommunity(item.id, 'rejected', reason);
                        await load();
                      },
                    })
                  }
                />
              </View>
            ) : null}
          </Card>
        )}
      />
      <ReasonModal ask={ask} onClose={() => setAsk(null)} />
    </AdminScreen>
  );
}
