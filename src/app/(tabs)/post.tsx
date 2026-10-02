import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import type { ComponentProps } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { colors, fonts } from '@/constants/theme';

type IconName = ComponentProps<typeof MaterialIcons>['name'];

// Post sheet: "What do you want to share?" The first cooking-today post makes a member an eCook.
const OPTIONS: { title: string; note: string; icon: IconName }[] = [
  { title: 'What you’re cooking today', note: 'Neighbors can order it · a story is created automatically', icon: 'soup-kitchen' },
  { title: 'Story', note: 'Just a moment · no price, no orders · stays 24 hours', icon: 'history-toggle-off' },
  { title: 'Post', note: 'Signature dish on your profile · not for ordering', icon: 'grid-view' },
];

export default function Post() {
  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <Text style={styles.title}>What do you want to share?</Text>
      <View style={styles.list}>
        {OPTIONS.map((o) => (
          <Pressable key={o.title} style={styles.row}>
            <View style={styles.icon}>
              <MaterialIcons name={o.icon} size={22} color={colors.teal} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.rowTitle}>{o.title}</Text>
              <Text style={styles.rowNote}>{o.note}</Text>
            </View>
            <MaterialIcons name="chevron-right" size={22} color={colors.muted} />
          </Pressable>
        ))}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.paper, paddingHorizontal: 16 },
  title: { fontFamily: fonts.extraBold, fontSize: 22, color: colors.ink, marginTop: 16, marginBottom: 16 },
  list: { gap: 10 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.white, borderRadius: 16, borderWidth: 1, borderColor: colors.line, padding: 14 },
  icon: { width: 40, height: 40, borderRadius: 12, backgroundColor: colors.tealSoft, alignItems: 'center', justifyContent: 'center' },
  rowTitle: { fontFamily: fonts.bold, fontSize: 15, color: colors.ink },
  rowNote: { fontFamily: fonts.medium, fontSize: 13, color: colors.muted, marginTop: 2 },
});
