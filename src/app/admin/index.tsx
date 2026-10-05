import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { type Href, router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';

import { AdminScreen, ErrorLine, useStaffRole } from '@/components/admin-ui';
import { colors, fonts } from '@/constants/theme';
import { fetchOverview, type Overview } from '@/lib/admin';

const ROLE_LABEL = { owner: 'Owner', moderator: 'Moderator', support: 'Support' } as const;

export default function AdminHome() {
  const role = useStaffRole();
  const [data, setData] = useState<Overview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setData(await fetchOverview());
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

  const rows: { label: string; count?: number; icon: keyof typeof MaterialIcons.glyphMap; href: Href }[] = [
    { label: 'Community requests', count: data?.pending_communities, icon: 'groups', href: '/admin/communities' },
    { label: 'Reports', count: data?.open_reports, icon: 'flag', href: '/admin/reports' },
    { label: 'Members', icon: 'person-search', href: '/admin/members' },
    { label: 'Send announcement', icon: 'campaign', href: '/admin/announce' },
    { label: 'Action log', icon: 'history', href: '/admin/log' },
  ];

  return (
    <AdminScreen title="Admin">
      <ScrollView contentContainerStyle={styles.body} refreshControl={<RefreshControl refreshing={loading} onRefresh={load} tintColor={colors.teal} />}>
        <Text style={styles.role}>Signed in as {role ? ROLE_LABEL[role] : ''}</Text>
        <ErrorLine text={error} />
        {data ? (
          <View style={styles.stats}>
            <Stat label="Members" value={data.members} />
            <Stat label="New this week" value={data.signups_7d} />
            <Stat label="Suspended" value={data.suspended_members} />
          </View>
        ) : null}
        {rows.map((r) => (
          <Pressable key={r.label} style={styles.row} onPress={() => router.push(r.href)} accessibilityRole="button">
            <MaterialIcons name={r.icon} size={22} color={colors.navy} />
            <Text style={styles.rowLabel}>{r.label}</Text>
            {r.count ? <Text style={styles.count}>{r.count}</Text> : null}
            <MaterialIcons name="chevron-right" size={22} color={colors.muted} />
          </Pressable>
        ))}
      </ScrollView>
    </AdminScreen>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  body: { paddingHorizontal: 22, paddingBottom: 40 },
  role: { fontFamily: fonts.semiBold, fontSize: 13, color: colors.muted, marginBottom: 12 },
  stats: { flexDirection: 'row', gap: 10, marginBottom: 18 },
  stat: { flex: 1, backgroundColor: colors.lightBlue, borderRadius: 14, padding: 12 },
  statValue: { fontFamily: fonts.extraBold, fontSize: 22, color: colors.navy },
  statLabel: { fontFamily: fonts.semiBold, fontSize: 12, color: colors.muted, marginTop: 2 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: colors.line },
  rowLabel: { flex: 1, fontFamily: fonts.bold, fontSize: 16, color: colors.ink },
  count: { fontFamily: fonts.extraBold, fontSize: 12, color: colors.navy, backgroundColor: colors.yellow, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2, overflow: 'hidden' },
});
