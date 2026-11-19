import { Modal, Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Text } from '@/components/text';
import { GrabHandle } from '@/components/grab-handle';
import { fonts, ui } from '@/constants/theme';
import { isRTL } from '@/lib/i18n';

export type SheetAction = { label: string; destructive?: boolean; onPress: () => void };

/** A bottom sheet of actions (View profile, Report, Block…). `title` opens the sheet (null = closed); it is shown only when `showTitle` is set (a question like "Why are you reporting this?"), not for a person's name, which is already on screen. Alert.alert can't be used: Android shows at most three buttons. */
export function ActionSheet({ title, actions, onClose, showTitle }: { title: string | null; actions: SheetAction[]; onClose: () => void; showTitle?: boolean }) {
  return (
    <Modal visible={title !== null} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.root}>
        <Pressable style={[StyleSheet.absoluteFill, styles.scrim]} onPress={onClose} accessibilityLabel="Close" />
        <SafeAreaView edges={['bottom']} style={styles.sheet}>
          <GrabHandle onClose={onClose} color={ui.border} />
          {showTitle && title ? <Text style={styles.title}>{title}</Text> : null}
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

// 'left' is the start edge: React Native swaps it on a right-to-left phone, so Arabic lands on the right.
const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: 'flex-end' },
  scrim: { backgroundColor: 'rgba(1,49,62,.5)' },
  sheet: { backgroundColor: ui.card, borderTopLeftRadius: 26, borderTopRightRadius: 26, paddingHorizontal: 22, paddingBottom: 8 },
  // Every line starts on the same side: the right in Arabic, the left in English.
  title: { fontFamily: fonts.extraBold, fontSize: 16, color: ui.deep, marginBottom: 6, textAlign: 'left' },
  row: { paddingVertical: 15, borderBottomWidth: 1, borderBottomColor: ui.border },
  rowText: { fontFamily: fonts.bold, fontSize: 16, color: ui.deep, textAlign: 'left' },
  cancel: { borderBottomWidth: 0 },
});
