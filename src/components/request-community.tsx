import { useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { danger, Field, formStyles, PrimaryButton } from '@/components/form';
import { colors, fonts } from '@/constants/theme';
import { similarNames } from '@/lib/community-names';

/** "Request a new community": the name goes to admin and shows as pending approval until it is approved. */
export function RequestCommunitySheet({
  visible,
  kindLabel,
  where,
  existing,
  busy,
  error,
  onSubmit,
  onUseExisting,
  onClose,
}: {
  visible: boolean;
  kindLabel: string;
  where: string;
  existing: { id: string; name: string }[];
  busy: boolean;
  error: string | null;
  onSubmit: (name: string) => void;
  onUseExisting: (id: string) => void;
  onClose: () => void;
}) {
  const [name, setName] = useState('');
  const { exact, close } = similarNames(name, existing);
  const ok = name.trim().length >= 2 && !exact;
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.modalRoot}>
      <Pressable style={[StyleSheet.absoluteFill, styles.scrimFill]} onPress={onClose} />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <SafeAreaView edges={['bottom']} style={styles.sheet}>
          <View style={styles.grab} />
          <Text style={styles.title}>Request a new {kindLabel}</Text>
          <Text style={styles.sub}>
            {where ? `In ${where}. ` : ''}Our team reviews every request. You can keep going now, and you join as soon as it is approved.
          </Text>
          <Field label="NAME" required>
            <TextInput value={name} onChangeText={setName} maxLength={80} placeholder={`example: ${kindLabel === 'area' ? 'Sheikh Zayed' : 'Shooting Club'}`} placeholderTextColor={colors.faint} style={formStyles.input} accessibilityLabel="Community name" />
          </Field>
          {exact || close.length ? (
            <View style={styles.similar}>
              <Text style={styles.similarTitle}>{exact ? 'This one already exists:' : 'Is it one of these?'}</Text>
              {(exact ? [exact] : close).map((c) => (
                <Pressable key={c.id} onPress={() => onUseExisting(c.id)} style={styles.similarRow} accessibilityRole="button">
                  <Text style={styles.similarName}>{c.name}</Text>
                  <Text style={styles.similarUse}>Use this</Text>
                </Pressable>
              ))}
            </View>
          ) : null}
          {error ? <Text style={[formStyles.error, { backgroundColor: danger }]}>{error}</Text> : null}
          <PrimaryButton label="Send request" onPress={() => onSubmit(name.trim())} busy={busy} disabled={!ok} style={{ marginTop: 16, marginBottom: 12 }} />
        </SafeAreaView>
      </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalRoot: { flex: 1, justifyContent: 'flex-end' },
  scrimFill: { backgroundColor: 'rgba(40,48,58,.35)' },
  sheet: { backgroundColor: colors.paper, borderTopLeftRadius: 22, borderTopRightRadius: 22, paddingHorizontal: 20 },
  grab: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: colors.line, marginVertical: 10 },
  title: { fontFamily: fonts.extraBold, fontSize: 18, color: colors.ink },
  similar: { backgroundColor: colors.tealSoft, borderRadius: 14, padding: 12, marginTop: 12, gap: 6 },
  similarTitle: { fontFamily: fonts.extraBold, fontSize: 12.5, color: colors.ink },
  similarRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 6 },
  similarName: { fontFamily: fonts.bold, fontSize: 15, color: colors.ink },
  similarUse: { fontFamily: fonts.extraBold, fontSize: 13, color: colors.ink, textDecorationLine: 'underline' },
  sub: { fontFamily: fonts.medium, fontSize: 13.5, lineHeight: 20, color: colors.muted, marginTop: 6, marginBottom: 14 },
});
