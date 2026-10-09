import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { Modal, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { PrimaryButton } from '@/components/form';
import { colors, fonts } from '@/constants/theme';

export type FilterRow = { key: string; icon: React.ComponentProps<typeof MaterialIcons>['name']; label: string; on: boolean; onPress: () => void };
export type FilterSection = { label: string; rows: FilterRow[] };

/** Checklist sheet used by the Home feed filter and the Menu filter: sections of checkable rows and an Apply button. */
export function FilterSheet({
  visible,
  title,
  sub,
  sections,
  onClose,
}: {
  visible: boolean;
  title: string;
  sub: string;
  sections: FilterSection[];
  onClose: () => void;
}) {
  const { height } = useWindowDimensions();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.root}>
        <Pressable style={[StyleSheet.absoluteFill, styles.scrim]} onPress={onClose} />
        <SafeAreaView edges={['bottom']} style={styles.sheet}>
          <View style={styles.grab} />
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.sub}>{sub}</Text>
          <ScrollView style={{ maxHeight: Math.round(height * 0.6) }} showsVerticalScrollIndicator>
            {sections.map((s) => (
              <View key={s.label}>
                <Text style={styles.label}>{s.label}</Text>
                {s.rows.map((r) => (
                  <Row key={r.key} row={r} />
                ))}
              </View>
            ))}
          </ScrollView>
          <PrimaryButton label="Apply" onPress={onClose} style={{ marginTop: 16, marginBottom: 12 }} />
        </SafeAreaView>
      </View>
    </Modal>
  );
}

function Row({ row }: { row: FilterRow }) {
  return (
    <Pressable style={styles.row} onPress={row.onPress} accessibilityRole="checkbox" accessibilityState={{ checked: row.on }}>
      <MaterialIcons name={row.icon} size={22} color={colors.teal} />
      <Text style={styles.rowText}>{row.label}</Text>
      <View style={[styles.box, row.on ? styles.boxOn : styles.boxOff]}>{row.on ? <MaterialIcons name="check" size={16} color={colors.navy} /> : null}</View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: 'flex-end' },
  scrim: { backgroundColor: 'rgba(40,48,58,.5)' },
  sheet: { backgroundColor: colors.paper, borderTopLeftRadius: 26, borderTopRightRadius: 26, paddingHorizontal: 22 },
  grab: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: colors.line, marginVertical: 12 },
  title: { fontFamily: fonts.extraBold, fontSize: 17, color: colors.ink },
  sub: { fontFamily: fonts.regular, fontSize: 13, color: colors.muted, marginBottom: 6 },
  label: { fontFamily: fonts.extraBold, fontSize: 10.5, letterSpacing: 0.6, color: colors.muted, marginTop: 14 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: colors.line },
  rowText: { flex: 1, fontFamily: fonts.bold, fontSize: 15.5, color: colors.ink },
  box: { width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  boxOn: { backgroundColor: colors.teal },
  boxOff: { borderWidth: 1.5, borderColor: colors.line },
});
