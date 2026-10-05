import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';

import { AdminScreen, adminStyles, Card, ErrorLine } from '@/components/admin-ui';
import { Chip } from '@/components/chip';
import { colors, fonts } from '@/constants/theme';
import { type AdminCommunity, fetchCommunities, fetchInviterNames, fetchReferralTally, HEARD_LABEL, type InviterRow, type ReferralRow } from '@/lib/admin';
import { fmtAgo } from '@/lib/format';

// Referral tally: finished sign-ups by their "How did you hear about tabkheen A?" answer, in total and per week,
// for everyone or one community, plus the names typed under "Who invited you?".
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const WEEKS_SHOWN = 12;

/** "Week of 5 Oct" from the database's YYYY-MM-DD week start (Monday, Cairo time). */
const weekLabel = (d: string) => {
  const [, m, day] = d.split('-').map(Number);
  return `Week of ${day} ${MONTHS[m - 1]}`;
};

const answer = (h: string | null) => (h ? HEARD_LABEL[h] ?? h : 'Skipped the question');

/** Answer → count, biggest first. */
function countBy(rows: ReferralRow[]) {
  const by = new Map<string | null, number>();
  for (const r of rows) by.set(r.heard_from, (by.get(r.heard_from) ?? 0) + r.signups);
  return [...by.entries()].sort((a, b) => b[1] - a[1]);
}

export default function Referrals() {
  const [communities, setCommunities] = useState<AdminCommunity[]>([]);
  const [community, setCommunity] = useState<string | null>(null);
  const [rows, setRows] = useState<ReferralRow[]>([]);
  const [inviters, setInviters] = useState<InviterRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchCommunities()
      .then(setCommunities)
      .catch(() => setCommunities([]));
  }, []);

  const load = useCallback(async (c: string | null) => {
    setLoading(true);
    try {
      const [tally, names] = await Promise.all([fetchReferralTally(c), fetchInviterNames(c)]);
      setRows(tally);
      setInviters(names);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load');
    }
    setLoading(false);
  }, []);

  useFocusEffect(
    useCallback(() => {
      load(community);
      // Reload on focus only; the community chips load on their own.
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [load]),
  );

  const pick = (c: string | null) => {
    setCommunity(c);
    load(c);
  };

  const total = rows.reduce((n, r) => n + r.signups, 0);
  const weeks = [...new Set(rows.map((r) => r.week_start))].slice(0, WEEKS_SHOWN);

  return (
    <AdminScreen title="Referrals">
      <ScrollView contentContainerStyle={adminStyles.list} refreshControl={<RefreshControl refreshing={loading} onRefresh={() => load(community)} tintColor={colors.teal} />}>
        <View style={styles.chips}>
          <Chip label="Everyone" on={community === null} onPress={() => pick(null)} />
          {communities.map((c) => (
            <Chip key={c.id} label={`${c.name} (${c.members})`} on={community === c.id} onPress={() => pick(c.id)} />
          ))}
        </View>
        <ErrorLine text={error} />

        <Card>
          <Text style={adminStyles.title}>All time · {total} sign-ups</Text>
          {countBy(rows).map(([h, n]) => (
            <Line key={h ?? 'none'} label={answer(h)} value={n} of={total} />
          ))}
          {!loading && total === 0 ? <Text style={adminStyles.muted}>No finished sign-ups yet.</Text> : null}
        </Card>

        <Card>
          <Text style={adminStyles.title}>Who invited them</Text>
          <Text style={adminStyles.muted}>Names typed by members who heard from a friend or family.</Text>
          {inviters.map((i) => (
            <View key={i.inviter_name} style={styles.line}>
              <Text style={styles.lineLabel}>{i.inviter_name}</Text>
              <Text style={adminStyles.muted}>last {fmtAgo(Date.parse(i.last_at))}</Text>
              <Text style={styles.lineValue}>{i.signups}</Text>
            </View>
          ))}
          {!loading && inviters.length === 0 ? <Text style={[adminStyles.muted, { marginTop: 8 }]}>No names yet.</Text> : null}
        </Card>

        {weeks.map((w) => {
          const week = rows.filter((r) => r.week_start === w);
          const n = week.reduce((s, r) => s + r.signups, 0);
          return (
            <Card key={w}>
              <Text style={adminStyles.title}>
                {weekLabel(w)} · {n} sign-ups
              </Text>
              {countBy(week).map(([h, c]) => (
                <Line key={h ?? 'none'} label={answer(h)} value={c} of={n} />
              ))}
            </Card>
          );
        })}
      </ScrollView>
    </AdminScreen>
  );
}

function Line({ label, value, of }: { label: string; value: number; of: number }) {
  return (
    <View style={styles.line}>
      <Text style={styles.lineLabel}>{label}</Text>
      <Text style={adminStyles.muted}>{of ? Math.round((value / of) * 100) : 0}%</Text>
      <Text style={styles.lineValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  line: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 7, borderBottomWidth: 1, borderBottomColor: colors.line },
  lineLabel: { flex: 1, fontFamily: fonts.semiBold, fontSize: 14, color: colors.ink },
  lineValue: { minWidth: 32, textAlign: 'right', fontFamily: fonts.extraBold, fontSize: 15, color: colors.navy },
});
