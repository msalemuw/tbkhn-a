import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { FlatList, RefreshControl, Text } from 'react-native';

import { AdminScreen, adminStyles, Card, ErrorLine } from '@/components/admin-ui';
import { colors } from '@/constants/theme';
import { ACTION_LABEL, type AdminAction, fetchRecentActions } from '@/lib/admin';
import { fmtAgo } from '@/lib/format';

// Every admin action, newest first: who did what, to what, and why.
function what(a: AdminAction): string {
  const d = a.details;
  const name = typeof d.name === 'string' ? d.name : typeof d.title === 'string' ? d.title : typeof d.dish === 'string' ? d.dish : null;
  const role = a.action === 'staff_role_set' ? ` to ${d.role ?? 'no role'}` : '';
  return `${ACTION_LABEL[a.action] ?? a.action}${name ? `: ${name}` : ''}${role}`;
}

export default function ActionLog() {
  const [items, setItems] = useState<AdminAction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setItems(await fetchRecentActions());
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

  return (
    <AdminScreen title="Action log">
      <FlatList
        data={items}
        keyExtractor={(a) => String(a.id)}
        contentContainerStyle={adminStyles.list}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={load} tintColor={colors.teal} />}
        ListHeaderComponent={<ErrorLine text={error} />}
        ListEmptyComponent={loading ? null : <Text style={adminStyles.empty}>Nothing yet.</Text>}
        renderItem={({ item }) => (
          <Card>
            <Text style={adminStyles.title}>{what(item)}</Text>
            {item.reason ? <Text style={adminStyles.body}>“{item.reason}”</Text> : null}
            <Text style={adminStyles.muted}>
              {item.actor_username ? `@${item.actor_username}` : 'Staff'} · {fmtAgo(Date.parse(item.created_at))}
            </Text>
          </Card>
        )}
      />
    </AdminScreen>
  );
}
