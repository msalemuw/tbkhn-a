import Constants from 'expo-constants';
import * as Updates from 'expo-updates';
import { StyleSheet, Text } from 'react-native';

import { colors, fonts } from '@/constants/theme';

// One small line that tells us which build is installed and which update it runs, so "the app did not change" can be diagnosed from a screenshot.
export function BuildInfo({ onDark }: { onDark?: boolean }) {
  const update = Updates.isEmbeddedLaunch ? 'built-in code' : `update ${Updates.updateId?.slice(0, 8) ?? '?'}`;
  const label = `Build ${Constants.expoConfig?.version ?? '?'} · ${Updates.channel ?? 'no channel'} · ${update}`;
  return <Text style={[styles.text, onDark && styles.dark]}>{label}</Text>;
}

const styles = StyleSheet.create({
  text: { fontFamily: fonts.medium, fontSize: 11, color: colors.muted, textAlign: 'center', marginTop: 16 },
  dark: { color: 'rgba(255,255,255,0.6)' },
});
