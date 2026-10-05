import { createContext, type ReactNode, useContext, useEffect, useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, StyleSheet, Text, TextInput, View, type ViewStyle } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BackHeader, formStyles, PrimaryButton } from '@/components/form';
import { colors, fonts } from '@/constants/theme';
import { fetchStaffRole, type StaffRole } from '@/lib/admin';
import { useSession } from '@/lib/session';

export const StaffRoleContext = createContext<StaffRole | null>(null);
export const useStaffRole = () => useContext(StaffRoleContext);

/** The signed-in member's staff role: undefined while loading, null for members who are not staff. */
export function useFetchedStaffRole(): StaffRole | null | undefined {
  const { session } = useSession();
  const uid = session?.user.id ?? null;
  const [result, setResult] = useState<{ uid: string; role: StaffRole | null } | null>(null);

  useEffect(() => {
    if (!uid) return;
    let live = true;
    fetchStaffRole()
      .then((role) => live && setResult({ uid, role }))
      .catch(() => live && setResult({ uid, role: null }));
    return () => {
      live = false;
    };
  }, [uid]);

  if (!uid) return null;
  return result?.uid === uid ? result.role : undefined;
}

/** Screen frame for every admin page: back arrow, title, then the content. */
export function AdminScreen({ title, children }: { title: string; children: ReactNode }) {
  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.pad}>
        <BackHeader title={title} />
      </View>
      {children}
    </SafeAreaView>
  );
}

export function Card({ children, style }: { children: ReactNode; style?: ViewStyle }) {
  return <View style={[styles.card, style]}>{children}</View>;
}

/** Small outlined action; "strong" fills it teal for the main choice on a card. */
export function SmallButton({ label, onPress, strong, disabled }: { label: string; onPress: () => void; strong?: boolean; disabled?: boolean }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      onPress={disabled ? undefined : onPress}
      style={[styles.small, strong && styles.smallStrong, disabled && { opacity: 0.45 }]}>
      <Text style={styles.smallText}>{label}</Text>
    </Pressable>
  );
}

export function ErrorLine({ text }: { text: string | null }) {
  return text ? <Text style={formStyles.error}>{text}</Text> : null;
}

/**
 * Asks for the reason before an action that affects a member (reject, remove, suspend).
 * The reason is kept in the action log and, where it applies, sent to the member.
 */
export function ReasonModal({
  ask,
  onClose,
}: {
  ask: { title: string; action: string; optional?: boolean; run: (reason: string) => Promise<void> } | null;
  onClose: () => void;
}) {
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const close = () => {
    setReason('');
    setError(null);
    onClose();
  };

  const submit = async () => {
    if (!ask) return;
    setBusy(true);
    setError(null);
    try {
      await ask.run(reason.trim());
      close();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong');
    }
    setBusy(false);
  };

  return (
    <Modal visible={ask !== null} transparent animationType="slide" onRequestClose={close}>
      <Pressable style={styles.scrim} onPress={close} />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <SafeAreaView edges={['bottom']} style={styles.sheet}>
          <Text style={styles.sheetTitle}>{ask?.title}</Text>
          <TextInput
            value={reason}
            onChangeText={setReason}
            placeholder={ask?.optional ? 'Note (optional)' : 'Reason (required, kept in the log)'}
            placeholderTextColor={colors.faint}
            multiline
            maxLength={500}
            style={styles.reason}
          />
          <ErrorLine text={error} />
          <PrimaryButton label={ask?.action ?? 'Confirm'} onPress={submit} busy={busy} disabled={!ask?.optional && !reason.trim()} style={{ marginTop: 14 }} />
        </SafeAreaView>
      </KeyboardAvoidingView>
    </Modal>
  );
}

export const adminStyles = StyleSheet.create({
  list: { paddingHorizontal: 22, paddingBottom: 40, gap: 12 },
  title: { fontFamily: fonts.extraBold, fontSize: 16, color: colors.ink },
  body: { fontFamily: fonts.medium, fontSize: 14, color: colors.ink, lineHeight: 20 },
  muted: { fontFamily: fonts.semiBold, fontSize: 13, color: colors.muted },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 },
  empty: { fontFamily: fonts.semiBold, fontSize: 14, color: colors.muted, textAlign: 'center', marginTop: 40 },
  tag: { fontFamily: fonts.extraBold, fontSize: 10.5, letterSpacing: 0.6, color: colors.navy, backgroundColor: colors.yellow, borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2, overflow: 'hidden', alignSelf: 'flex-start' },
});

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.paper },
  pad: { paddingHorizontal: 22, paddingBottom: 12 },
  card: { borderWidth: 1.5, borderColor: colors.line, borderRadius: 16, backgroundColor: colors.white, padding: 14 },
  small: { borderWidth: 1.5, borderColor: colors.lightBlue, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 8, backgroundColor: colors.white },
  smallStrong: { backgroundColor: colors.teal, borderColor: colors.teal },
  smallText: { fontFamily: fonts.extraBold, fontSize: 13, color: colors.navy },
  scrim: { flex: 1, backgroundColor: 'rgba(40,48,58,.35)' },
  sheet: { backgroundColor: colors.paper, borderTopLeftRadius: 22, borderTopRightRadius: 22, padding: 20 },
  sheetTitle: { fontFamily: fonts.extraBold, fontSize: 17, color: colors.ink, marginBottom: 10 },
  reason: { minHeight: 90, borderWidth: 1.5, borderColor: colors.line, borderRadius: 14, backgroundColor: colors.white, padding: 12, fontFamily: fonts.medium, fontSize: 15, color: colors.ink, textAlignVertical: 'top' },
});
