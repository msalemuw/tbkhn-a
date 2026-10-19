import { ReactNode, useCallback, useEffect, useState } from 'react';
import { AppState, Pressable, StyleSheet, View } from 'react-native';

import { Text } from '@/components/text';
import { colors, fonts } from '@/constants/theme';
import { AppStatus, blockReason, fetchAppStatus } from '@/lib/app-status';

/** Shows a "back soon" or "please update" screen instead of the app when staff switch maintenance on or raise the minimum version. */
export function AppGate({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AppStatus | null>(null);
  const check = useCallback(() => { fetchAppStatus().then(setStatus); }, []);

  useEffect(() => {
    check();
    const sub = AppState.addEventListener('change', (s) => { if (s === 'active') check(); });
    return () => sub.remove();
  }, [check]);

  const block = blockReason(status);
  if (!block) return <>{children}</>;
  return (
    <View style={styles.wrap}>
      <Text style={styles.title}>{block.title}</Text>
      <Text style={styles.text}>{block.text}</Text>
      <Pressable style={styles.btn} onPress={check} accessibilityRole="button">
        <Text style={styles.btnText}>Try again</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 12, backgroundColor: colors.paper },
  title: { fontFamily: fonts.extraBold, fontSize: 24, color: colors.ink },
  text: { fontFamily: fonts.medium, fontSize: 15, color: colors.muted, textAlign: 'center', lineHeight: 22 },
  btn: { marginTop: 8, backgroundColor: colors.teal, borderRadius: 999, paddingHorizontal: 24, paddingVertical: 12 },
  btnText: { fontFamily: fonts.bold, fontSize: 15, color: colors.navy },
});
