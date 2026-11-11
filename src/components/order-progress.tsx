import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { StyleSheet, View } from 'react-native';

import { Text } from '@/components/text';
import { colors, fonts } from '@/constants/theme';
import type { OrderStatus } from '@/lib/orders';

// Like the progress bar on Talabat's tracking screen: where the order is, at a glance. Pickup only, so the last step is pickup.
const STEPS = ['Waiting', 'Cooking', 'Ready', 'Picked up'] as const;
const AT: Partial<Record<OrderStatus, number>> = { pending: 0, accepted: 1, ready: 2, picked_up: 3 };

/** Whether an order has a position on the bar (declined, cancelled and not-picked-up orders do not). */
export function hasProgress(status: OrderStatus): boolean {
  return AT[status] != null;
}

export function OrderProgress({ status }: { status: OrderStatus }) {
  const at = AT[status];
  if (at == null) return null;
  return (
    <View style={styles.wrap} accessible accessibilityLabel={`Order progress: ${STEPS[at]}`}>
      <View style={styles.row}>
        {STEPS.map((label, i) => {
          const done = i < at || status === 'picked_up';
          const current = i === at && !done;
          return (
            <View key={label} style={styles.cell}>
              <View style={styles.dotRow}>
                <View style={[styles.line, i === 0 && styles.hidden, i <= at && styles.lineOn]} />
                <View style={[styles.dot, done && styles.dotDone, current && styles.dotNow]}>
                  {done ? <MaterialIcons name="check" size={15} color={colors.navy} /> : current ? <View style={styles.dotCore} /> : null}
                </View>
                <View style={[styles.line, i === STEPS.length - 1 && styles.hidden, i < at && styles.lineOn]} />
              </View>
              <Text style={[styles.label, (done || current) && styles.labelOn]} numberOfLines={1} maxFontSizeMultiplier={1.15}>{label}</Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginTop: 22 },
  row: { flexDirection: 'row' },
  cell: { flex: 1, alignItems: 'center', gap: 6 },
  dotRow: { flexDirection: 'row', alignItems: 'center', width: '100%' },
  line: { flex: 1, height: 3, backgroundColor: colors.line },
  lineOn: { backgroundColor: colors.teal },
  hidden: { opacity: 0 },
  dot: { width: 26, height: 26, borderRadius: 13, borderWidth: 2, borderColor: colors.line, backgroundColor: colors.white, alignItems: 'center', justifyContent: 'center' },
  dotDone: { backgroundColor: colors.teal, borderColor: colors.teal },
  dotNow: { borderColor: colors.teal, borderWidth: 3 },
  dotCore: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.teal },
  label: { fontFamily: fonts.semiBold, fontSize: 12, color: colors.muted },
  labelOn: { fontFamily: fonts.extraBold, color: colors.ink },
});
