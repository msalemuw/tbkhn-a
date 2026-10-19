import { StyleSheet, View } from 'react-native';

const STEPS = 40;

const mix = (from: [number, number, number], to: [number, number, number], t: number) =>
  `rgb(${from.map((c, i) => Math.round(c + (to[i] - c) * t)).join(',')})`;

/**
 * Fills its parent with a soft top-to-bottom fade between two colours, drawn as thin bands so it needs no native module
 * (works in an over-the-air update). Place it first inside a relatively positioned parent.
 */
export function FadeBg({ from, to }: { from: [number, number, number]; to: [number, number, number] }) {
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {Array.from({ length: STEPS }, (_, i) => (
        <View key={i} style={{ flex: 1, backgroundColor: mix(from, to, i / (STEPS - 1)) }} />
      ))}
    </View>
  );
}
