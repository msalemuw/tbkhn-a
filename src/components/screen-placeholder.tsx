import { StyleSheet, Text, View } from 'react-native';

import { colors, fonts } from '@/constants/theme';

/** Temporary body for screens whose real content lands in later steps. */
export function ScreenPlaceholder({ title, note }: { title: string; note: string }) {
  return (
    <View style={styles.wrap}>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.note}>{note}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 8 },
  title: { fontFamily: fonts.extraBold, fontSize: 20, color: colors.ink },
  note: { fontFamily: fonts.medium, fontSize: 14, color: colors.muted, textAlign: 'center', lineHeight: 20 },
});
