import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { router } from 'expo-router';
import { Pressable, StyleSheet, Text } from 'react-native';

import { colors, fonts } from '@/constants/theme';
import type { Badge } from '@/lib/rankings';

/** Rank pill from the design: "#1 in Mohandeseen" (rating x orders) or "#1 in Mohandeseen · Likes". Tap opens the community. */
export function RankBadge({ badge }: { badge: Badge }) {
  const label = `#${badge.rank} in ${badge.community}${badge.kind === 'likes' ? ' · Likes' : ''}`;
  return (
    <Pressable
      style={styles.pill}
      onPress={() => router.push({ pathname: '/community/[id]', params: { id: badge.communityId } })}
      accessibilityRole="button"
      accessibilityLabel={label}>
      <MaterialIcons name={badge.kind === 'likes' ? 'favorite' : badge.rank === 1 ? 'workspace-premium' : 'military-tech'} size={13} color={colors.ink} />
      <Text style={styles.text} numberOfLines={1}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pill: { flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start', backgroundColor: colors.lightBlue, borderRadius: 999, paddingHorizontal: 9, paddingVertical: 3, maxWidth: '100%' },
  text: { fontFamily: fonts.bold, fontSize: 11, color: colors.ink, flexShrink: 1 },
});
