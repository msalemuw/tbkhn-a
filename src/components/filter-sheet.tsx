import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { Modal, Pressable, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Text } from '@/components/text';
import { GrabHandle } from '@/components/grab-handle';
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
  onSelectAll,
  onClearAll,
  applyLabel,
}: {
  visible: boolean;
  title: string;
  sub: string;
  sections: FilterSection[];
  onClose: () => void;
  /** When given, a "Select all" / "Clear all" link sits above the list. */
  onSelectAll?: () => void;
  onClearAll?: () => void;
  /** The Apply button's words; with a result count it reads like "Show 12 posts". */
  applyLabel?: string;
}) {
  const { height } = useWindowDimensions();
  const rows = sections.flatMap((s) => s.rows);
  const allOn = rows.length > 0 && rows.every((r) => r.on);
  const noneOn = rows.length > 0 && rows.every((r) => !r.on);
  const bulk = allOn ? onClearAll : onSelectAll;
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.root}>
        <Pressable style={[StyleSheet.absoluteFill, styles.scrim]} onPress={onClose} />
        <SafeAreaView edges={['bottom']} style={styles.sheet}>
          <GrabHandle onClose={onClose} />
          <View style={styles.head}>
            <Text style={styles.title}>{title}</Text>
            {onSelectAll && onClearAll ? (
              <Pressable onPress={bulk} accessibilityRole="button" hitSlop={10}>
                <Text style={styles.bulkText}>{allOn ? 'Clear all' : 'Select all'}</Text>
              </Pressable>
            ) : null}
          </View>
          {sub ? <Text style={styles.sub}>{sub}</Text> : null}
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
          {noneOn && onSelectAll ? <Text style={styles.hint}>Tick at least one to see posts.</Text> : null}
          <PrimaryButton label={applyLabel ?? 'Apply'} onPress={onClose} disabled={noneOn && !!onSelectAll} style={{ marginTop: 16, marginBottom: 12 }} />
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
  title: { fontFamily: fonts.extraBold, fontSize: 17, color: colors.ink },
  sub: { fontFamily: fonts.regular, fontSize: 13, color: colors.muted, marginBottom: 6 },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 },
  bulkText: { fontFamily: fonts.bold, fontSize: 14, color: colors.teal },
  hint: { fontFamily: fonts.regular, fontSize: 13, color: colors.muted, textAlign: 'center', marginTop: 10 },
  label: { fontFamily: fonts.extraBold, fontSize: 10.5, letterSpacing: 0.6, color: colors.muted, marginTop: 14 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: colors.line },
  rowText: { flex: 1, fontFamily: fonts.bold, fontSize: 15.5, color: colors.ink },
  box: { width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  boxOn: { backgroundColor: colors.teal },
  boxOff: { borderWidth: 1.5, borderColor: colors.line },
});
