import { Pressable, StyleSheet, Text } from 'react-native';

import { colors, fonts } from '@/constants/theme';

/** Filter and choice chips (cuisine, ingredients, menu filters). */
export function Chip({ label, on, onPress }: { label: string; on: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: on }}
      style={[styles.chip, on && styles.on]}>
      <Text style={[styles.text, on && styles.textOn]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chip: { borderWidth: 1.5, borderColor: colors.line, backgroundColor: colors.white, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 7 },
  on: { backgroundColor: colors.teal, borderColor: colors.teal },
  text: { fontFamily: fonts.bold, fontSize: 13, color: colors.ink },
  textOn: { color: colors.navy },
});
