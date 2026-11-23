import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BackHeader } from '@/components/form';
import { Text } from '@/components/text';
import { colors, fonts, ui } from '@/constants/theme';
import { fetchMyRanks, type MyRank } from '@/lib/rankings';
import { useSession } from '@/lib/session';

// Your place in every community you belong to, for both rankings (not only the top 3 that get a badge).
// Likes = likes on your most-liked signature post. Service = rating x picked-up orders. No score yet = not ranked yet.
export default function MyRankings() {
  const { session } = useSession();
  const me = session?.user.id ?? null;
  const [rows, setRows] = useState<MyRank[] | null>(null);
  const [failed, setFailed] = useState(false);

  useFocusEffect(
    useCallback(() => {
      if (!me) return;
      fetchMyRanks().then(
        (r) => {
          setRows(r);
          setFailed(false);
        },
        () => {
          setRows([]);
          setFailed(true);
        },
      );
    }, [me]),
  );

  return (
    <SafeAreaView style={styles.screen}>
      <BackHeader title="My rankings" />
      {rows === null ? (
        <ActivityIndicator color={colors.teal} style={{ marginTop: 30 }} />
      ) : rows.length ? (
        <ScrollView contentContainerStyle={styles.body}>
          <Text style={styles.intro}>Where you stand in each community you joined. The top 3 in each community get a badge.</Text>
          {rows.map((r) => (
            <Pressable key={r.community_id} style={styles.card} onPress={() => router.push({ pathname: '/community/[id]', params: { id: r.community_id } })} accessibilityRole="button" accessibilityLabel={r.community_name}>
              <View style={styles.head}>
                <Text verbatim style={styles.name} numberOfLines={1}>{r.community_name}</Text>
                <MaterialIcons name="chevron-right" size={20} color={colors.muted} />
              </View>
              <Line icon="favorite" label="Likes" rank={r.likes_rank} total={r.likes_total} hint="Get likes on your signature dishes to be ranked." />
              <Line icon="military-tech" label="Service" rank={r.service_rank} total={r.service_total} hint="Finish a pickup and get a review to be ranked." />
            </Pressable>
          ))}
        </ScrollView>
      ) : (
        <Text style={styles.empty}>{failed ? 'We couldn’t load your rankings. Please try again in a moment.' : 'Join a community to see where you rank.'}</Text>
      )}
    </SafeAreaView>
  );
}

function Line({ icon, label, rank, total, hint }: { icon: 'favorite' | 'military-tech'; label: string; rank: number | null; total: number; hint: string }) {
  const top = rank != null && rank <= 3;
  return (
    <View style={styles.line}>
      <MaterialIcons name={icon} size={16} color={ui.deepTeal} />
      <Text style={styles.label}>{label}</Text>
      {rank != null ? (
        <Text style={[styles.rank, top && styles.rankTop]}>{`#${rank} of ${total}`}</Text>
      ) : (
        <Text style={styles.none} numberOfLines={2}>{hint}</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.paper },
  body: { paddingHorizontal: 22, paddingTop: 8, paddingBottom: 30, gap: 12 },
  intro: { fontFamily: fonts.semiBold, fontSize: 13.5, lineHeight: 19, color: colors.muted },
  card: { backgroundColor: colors.white, borderRadius: 14, borderWidth: 1, borderColor: colors.line, padding: 14, gap: 8 },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  name: { fontFamily: fonts.extraBold, fontSize: 16, color: colors.ink, flex: 1 },
  line: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  label: { fontFamily: fonts.bold, fontSize: 14, color: colors.ink, width: 64 },
  rank: { fontFamily: fonts.bold, fontSize: 14, color: colors.ink },
  rankTop: { color: ui.deepTeal, fontFamily: fonts.extraBold },
  none: { fontFamily: fonts.medium, fontSize: 12.5, color: colors.muted, flex: 1 },
  empty: { fontFamily: fonts.semiBold, fontSize: 14, color: colors.muted, textAlign: 'center', lineHeight: 21, padding: 32 },
});
