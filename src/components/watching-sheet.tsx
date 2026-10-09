import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { PrimaryButton } from '@/components/form';
import { colors, fonts } from '@/constants/theme';
import type { MyCommunity } from '@/lib/posts';

export type Watching = { communities: string[]; nearby: boolean; following: boolean };

/** "Watching" sheet from the design: choose which communities, nearby posts and followed cooks fill the feed. */
export function WatchingSheet({
  visible,
  mine,
  value,
  onChange,
  onClose,
}: {
  visible: boolean;
  mine: MyCommunity[];
  value: Watching;
  onChange: (w: Watching) => void;
  onClose: () => void;
}) {
  const toggle = (id: string) =>
    onChange({ ...value, communities: value.communities.includes(id) ? value.communities.filter((c) => c !== id) : [...value.communities, id] });

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.root}>
        <Pressable style={[StyleSheet.absoluteFill, styles.scrim]} onPress={onClose} />
        <SafeAreaView edges={['bottom']} style={styles.sheet}>
          <View style={styles.grab} />
          <Text style={styles.title}>Feed filter</Text>
          <Text style={styles.sub}>Choose whose posts show on your Home feed.</Text>
          <Text style={styles.label}>COMMUNITIES</Text>
          {mine.map((c) => (
            <Row key={c.id} icon={c.kind === 'club' ? 'flag' : 'groups'} label={c.name} on={value.communities.includes(c.id)} onPress={() => toggle(c.id)} />
          ))}
          <Row icon="place" label="Nearby" on={value.nearby} onPress={() => onChange({ ...value, nearby: !value.nearby })} />
          <Row icon="person" label="Following" on={value.following} onPress={() => onChange({ ...value, following: !value.following })} />
          <PrimaryButton label="Apply" onPress={onClose} style={{ marginTop: 16, marginBottom: 12 }} />
        </SafeAreaView>
      </View>
    </Modal>
  );
}

function Row({ icon, label, on, onPress }: { icon: React.ComponentProps<typeof MaterialIcons>['name']; label: string; on: boolean; onPress: () => void }) {
  return (
    <Pressable style={styles.row} onPress={onPress} accessibilityRole="checkbox" accessibilityState={{ checked: on }}>
      <MaterialIcons name={icon} size={22} color={colors.teal} />
      <Text style={styles.rowText}>{label}</Text>
      <View style={[styles.box, on ? styles.boxOn : styles.boxOff]}>{on ? <MaterialIcons name="check" size={16} color={colors.navy} /> : null}</View>
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
