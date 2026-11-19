import { Modal, Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Text } from '@/components/text';
import { GrabHandle } from '@/components/grab-handle';
import { fonts, ui } from '@/constants/theme';
import { isRTL } from '@/lib/i18n';

export type SheetAction = { label: string; destructive?: boolean; onPress: () => void };

/** A bottom sheet of actions (View profile, Report, Block…). Alert.alert can't be used: Android shows at most three buttons. */
export function ActionSheet({ title, actions, onClose }: { title: string | null; actions: SheetAction[]; onClose: () => void }) {
  return (
    <Modal visible={title !== null} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.root}>
        <Pressable style={[StyleSheet.absoluteFill, styles.scrim]} onPress={onClose} accessibilityLabel="Close" />
        <SafeAreaView edges={['bottom']} style={styles.sheet}>
          <GrabHandle onClose={onClose} color={ui.border} />
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
              <Text style={styles.rowText} numberOfLines={1}>{a.label}</Text>
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
  // Every line starts on the same side: the right in Arabic, the left in English (a name typed in English no longer pulls its line left).
  title: { fontFamily: fonts.extraBold, fontSize: 16, color: ui.deep, marginBottom: 6, textAlign: isRTL ? 'right' : 'left' },
  row: { paddingVertical: 15, borderBottomWidth: 1, borderBottomColor: ui.border },
  rowText: { fontFamily: fonts.bold, fontSize: 16, color: ui.deep, textAlign: isRTL ? 'right' : 'left' },
  cancel: { borderBottomWidth: 0 },
});
