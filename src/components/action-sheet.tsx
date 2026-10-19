import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { colors, fonts, ui } from '@/constants/theme';

export type SheetAction = { label: string; destructive?: boolean; onPress: () => void };

/** A bottom sheet of actions (View profile, Report, Block…). Alert.alert can't be used: Android shows at most three buttons. */
export function ActionSheet({ title, actions, onClose }: { title: string | null; actions: SheetAction[]; onClose: () => void }) {
  return (
    <Modal visible={title !== null} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.root}>
        <Pressable style={[StyleSheet.absoluteFill, styles.scrim]} onPress={onClose} accessibilityLabel="Close" />
        <SafeAreaView edges={['bottom']} style={styles.sheet}>
          <View style={styles.grab} />
          {title ? <Text style={styles.title} numberOfLines={1}>{title}</Text> : null}
          {actions.map((a) => (
            <Pressable
              key={a.label}
              style={styles.row}
              onPress={() => {
                onClose();
                a.onPress();
              }}
              accessibilityRole="button">
              <Text style={[styles.rowText, a.destructive && styles.destructive]}>{a.label}</Text>
            </Pressable>
          ))}
          <Pressable style={[styles.row, styles.cancel]} onPress={onClose} accessibilityRole="button">
            <Text style={styles.rowText}>Cancel</Text>
          </Pressable>
        </SafeAreaView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: 'flex-end' },
  scrim: { backgroundColor: 'rgba(1,49,62,.5)' },
  sheet: { backgroundColor: ui.card, borderTopLeftRadius: 26, borderTopRightRadius: 26, paddingHorizontal: 22, paddingBottom: 8 },
  grab: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: ui.border, marginVertical: 12 },
  title: { fontFamily: fonts.extraBold, fontSize: 16, color: ui.deep, marginBottom: 6 },
  row: { paddingVertical: 15, borderBottomWidth: 1, borderBottomColor: ui.border },
  rowText: { fontFamily: fonts.bold, fontSize: 16, color: ui.deep },
  destructive: { color: colors.navy, textDecorationLine: 'underline' },
  cancel: { borderBottomWidth: 0 },
});
