import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { router } from 'expo-router';
import { type ReactNode, useEffect, useState } from 'react';
import { ActivityIndicator, Keyboard, LayoutAnimation, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, useWindowDimensions, View, type ViewStyle } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { colors, fonts } from '@/constants/theme';

// Errors: navy text on yellow, since the palette has no red.
export const danger = colors.yellow;

/** Height of the on-screen keyboard (0 when hidden). Sheets lift by this much; unlike KeyboardAvoidingView it cannot get stuck inside a Modal. */
export function useKeyboardHeight() {
  const [height, setHeight] = useState(0);
  useEffect(() => {
    const ios = Platform.OS === 'ios';
    const show = Keyboard.addListener(ios ? 'keyboardWillShow' : 'keyboardDidShow', (e) => setHeight(e.endCoordinates.height));
    const hide = Keyboard.addListener(ios ? 'keyboardWillHide' : 'keyboardDidHide', () => setHeight(0));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);
  return height;
}

/** Back arrow row; with a title it is the small bold header from the design (s5). */
export function BackHeader({ title, onBack }: { title?: string; onBack?: () => void }) {
  return (
    <View style={styles.header}>
      <Pressable hitSlop={12} onPress={onBack ?? (() => (router.canGoBack() ? router.back() : router.replace('/')))}>
        <MaterialIcons name="arrow-back" size={24} color={colors.ink} />
      </Pressable>
      {title ? <Text style={styles.headerTitle}>{title}</Text> : null}
    </View>
  );
}

export function PrimaryButton({
  label,
  onPress,
  disabled,
  busy,
  style,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  busy?: boolean;
  style?: ViewStyle;
}) {
  const off = disabled || busy;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: off, busy }}
      onPress={off ? undefined : onPress}
      style={[styles.primary, off && styles.primaryOff, style]}>
      {busy ? <ActivityIndicator color={colors.navy} /> : <Text style={styles.primaryText}>{label}</Text>}
    </Pressable>
  );
}

/** The design's field2: a rounded box with a small uppercase label. */
export function Field({
  label,
  required,
  borderColor,
  children,
  style,
}: {
  label?: string;
  required?: boolean;
  borderColor?: string;
  children: ReactNode;
  style?: ViewStyle;
}) {
  return (
    <View style={[styles.field, borderColor ? { borderColor } : null, style]}>
      {label ? (
        <Text style={styles.label}>
          {label}
          {required ? <Text style={{ color: colors.muted }}> *</Text> : null}
        </Text>
      ) : null}
      {children}
    </View>
  );
}

export function SelectField({
  label,
  value,
  required,
  onPress,
}: {
  label: string;
  value: string;
  required?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={`${label}: ${value}`}>
      <Field label={label} required={required}>
        <View style={styles.selectRow}>
          <Text style={[styles.value, value === 'None' && { color: colors.muted }]}>{value}</Text>
          <MaterialIcons name="expand-more" size={22} color={colors.muted} />
        </View>
      </Field>
    </Pressable>
  );
}

export type SheetItem = { label: string; selected: boolean; onPress: () => void };

/**
 * Bottom sheet list used by every picker in the design (governorate, area, club...).
 * `searchable` adds a type-to-filter box; `footer` adds a last row such as "Can't find it? Request it".
 */
export function PickerSheet({
  title,
  items,
  onClose,
  searchable,
  footer,
}: {
  title: string;
  items: SheetItem[] | null;
  onClose: () => void;
  searchable?: boolean;
  footer?: { label: string; onPress: () => void };
}) {
  const [q, setQ] = useState('');
  const [expanded, setExpanded] = useState(false);
  const { height: screenH } = useWindowDimensions();
  const keyboard = useKeyboardHeight();
  const open = items !== null;
  // Close the form's keyboard first, or the sheet would sit above it with the form showing underneath.
  useEffect(() => {
    if (open) Keyboard.dismiss();
  }, [open]);
  const close = () => {
    setQ('');
    setExpanded(false);
    onClose();
  };
  // Swiping the handle: down closes (or shrinks an expanded list), up opens the list to nearly full height.
  const [touchY, setTouchY] = useState<number | null>(null);
  const onSwipeEnd = (endY: number) => {
    if (touchY === null) return;
    const dy = endY - touchY;
    setTouchY(null);
    if (dy > 40) {
      if (expanded) {
        LayoutAnimation.easeInEaseOut();
        setExpanded(false);
      } else close();
    } else if (dy < -40) {
      LayoutAnimation.easeInEaseOut();
      setExpanded(true);
    }
  };
  const needle = q.trim().toLowerCase();
  const shown = (items ?? []).filter((it) => !needle || it.label.toLowerCase().includes(needle));
  const sheetHeight = Math.round(screenH * (expanded ? 0.92 : 0.75));
  return (
    <Modal visible={open} transparent animationType="slide" onRequestClose={close}>
      <View style={styles.modalRoot}>
        <Pressable style={[StyleSheet.absoluteFill, styles.scrimFill]} onPress={close} />
        <View style={{ paddingBottom: keyboard }}>
          <SafeAreaView edges={keyboard ? [] : ['bottom']} style={[styles.sheet, searchable && { height: Math.min(sheetHeight, screenH - keyboard - 60) }]}>
            <View style={styles.grabArea} onTouchStart={(e) => setTouchY(e.nativeEvent.pageY)} onTouchEnd={(e) => onSwipeEnd(e.nativeEvent.pageY)}>
              <View style={styles.grab} />
            </View>
          <Text style={styles.sheetTitle}>{title}</Text>
          {searchable ? (
            <View style={styles.search}>
              <MaterialIcons name="search" size={20} color={colors.muted} />
              <TextInput
                value={q}
                onChangeText={setQ}
                placeholder="Search"
                placeholderTextColor={colors.faint}
                autoCorrect={false}
                style={styles.searchInput}
                accessibilityLabel={`Search ${title}`}
              />
            </View>
          ) : null}
          <ScrollView keyboardShouldPersistTaps="handled">
            {shown.map((it) => (
              <Pressable
                key={it.label}
                style={styles.sheetRow}
                onPress={() => {
                  it.onPress();
                  close();
                }}>
                <Text style={[styles.sheetLabel, it.selected && { fontFamily: fonts.extraBold }]}>{it.label}</Text>
                {it.selected ? <MaterialIcons name="check" size={20} color={colors.teal} /> : null}
              </Pressable>
            ))}
            {!shown.length ? <Text style={styles.none}>No matches</Text> : null}
          </ScrollView>
          {footer ? (
            <Pressable
              style={[styles.sheetRow, styles.footerRow]}
              onPress={() => {
                footer.onPress();
                close();
              }}>
              <Text style={[styles.sheetLabel, { color: colors.ink }]}>{footer.label}</Text>
              <MaterialIcons name="add-circle-outline" size={22} color={colors.teal} />
            </Pressable>
          ) : null}
          </SafeAreaView>
        </View>
      </View>
    </Modal>
  );
}

export const formStyles = StyleSheet.create({
  title: { fontFamily: fonts.serif, fontSize: 34, lineHeight: 36, color: colors.ink },
  sub: { fontFamily: fonts.medium, fontSize: 14, color: colors.muted, lineHeight: 21, marginTop: 8 },
  hint: { fontFamily: fonts.bold, fontSize: 12.5, lineHeight: 18, marginTop: 7, paddingHorizontal: 4 },
  error: { fontFamily: fonts.bold, fontSize: 12.5, lineHeight: 18, marginTop: 8, color: colors.navy, backgroundColor: colors.yellow, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 6, overflow: 'hidden' },
  link: { fontFamily: fonts.extraBold, color: colors.ink, textDecorationLine: 'underline' },
  input: { fontFamily: fonts.bold, fontSize: 17, color: colors.ink, paddingVertical: 4 },
  small: { fontFamily: fonts.semiBold, fontSize: 13, color: colors.muted, textAlign: 'center' },
});

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingTop: 6 },
  headerTitle: { fontFamily: fonts.extraBold, fontSize: 18, color: colors.ink },
  primary: { backgroundColor: colors.teal, borderRadius: 14, paddingVertical: 15, alignItems: 'center' },
  primaryOff: { opacity: 0.45 },
  primaryText: { fontFamily: fonts.extraBold, fontSize: 15.5, color: colors.navy },
  field: { borderWidth: 1.5, borderColor: colors.line, borderRadius: 14, backgroundColor: colors.white, paddingHorizontal: 14, paddingVertical: 9 },
  label: { fontFamily: fonts.extraBold, fontSize: 10.5, letterSpacing: 0.6, color: colors.muted, marginBottom: 2 },
  value: { fontFamily: fonts.bold, fontSize: 15.5, color: colors.ink },
  selectRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 2 },
  modalRoot: { flex: 1, justifyContent: 'flex-end' },
  scrimFill: { backgroundColor: 'rgba(40,48,58,.35)' },
  sheet: { backgroundColor: colors.paper, borderTopLeftRadius: 22, borderTopRightRadius: 22, paddingHorizontal: 20, maxHeight: '75%' },
  footerRow: { borderTopWidth: 1, borderTopColor: colors.line },
  search: { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1.5, borderColor: colors.line, borderRadius: 12, paddingHorizontal: 12, marginBottom: 4 },
  searchInput: { flex: 1, fontFamily: fonts.semiBold, fontSize: 16, color: colors.ink, paddingVertical: 10 },
  none: { fontFamily: fonts.semiBold, fontSize: 14, color: colors.muted, paddingVertical: 14 },
  grabArea: { paddingVertical: 14, alignItems: 'center' },
  grab: { width: 40, height: 4, borderRadius: 2, backgroundColor: colors.line },
  sheetTitle: { fontFamily: fonts.extraBold, fontSize: 17, color: colors.ink, marginBottom: 6 },
  sheetRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: colors.line },
  sheetLabel: { fontFamily: fonts.bold, fontSize: 15.5, color: colors.ink },
});
