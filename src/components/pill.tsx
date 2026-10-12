import { Pressable, StyleSheet, Text } from 'react-native';

import { colors, fonts } from '@/constants/theme';

/** Follow / Following and Join / Joined button used in lists (teal when it offers the action). */
export function Pill({ label, on, onPress }: { label: string; on: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={[styles.pill, on ? { backgroundColor: colors.teal, borderColor: colors.teal } : { backgroundColor: colors.white, borderColor: colors.line }]}>
      <Text style={styles.text}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pill: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 7 },
  text: { fontFamily: fonts.extraBold, fontSize: 12.5, color: colors.ink },
});
