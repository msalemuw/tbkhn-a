import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { type Href, router, useFocusEffect } from 'expo-router';
import { type ComponentProps, useCallback, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Text } from '@/components/text';
import { FlipIcon } from '@/components/flip-icon';
import { colors, fonts } from '@/constants/theme';
import { fetchAppStatus } from '@/lib/app-status';
import { choosePhoto, setPendingPhoto } from '@/lib/photo-flow';

type IconName = ComponentProps<typeof MaterialIcons>['name'];

// Post sheet: "What do you want to share?" The first cooking-today post makes a member an eCook.
// Story and signature post come in a later step.
const OPTIONS: { title: string; note: string; icon: IconName; href?: Href; kind?: 'menu' | 'story' | 'post' }[] = [
  { title: 'Today’s menu', note: 'Neighbors can order it · a story is created automatically', icon: 'soup-kitchen', href: '/compose/today', kind: 'menu' },
  { title: 'Story', note: 'Just a moment · no price, no orders · stays 24 hours', icon: 'history-toggle-off', href: '/compose/story', kind: 'story' },
  { title: 'Post', note: 'Signature dish on your profile · not for ordering', icon: 'grid-view', href: '/compose/signature', kind: 'post' },
];

export default function Post() {
  // While staff have the Menu switched off, "Today's menu" is greyed out and can't be tapped (a failed check leaves it available).
  const [menuOff, setMenuOff] = useState(false);
  useFocusEffect(
    useCallback(() => {
      fetchAppStatus().then((s) => setMenuOff(!!s && s.menu_enabled === false));
    }, []),
  );
  // Like Instagram: the photo picker opens first, and the form opens with the photo already chosen.
  // Closing the picker without a photo leaves you here.
  const [opening, setOpening] = useState(false);
  async function open(o: (typeof OPTIONS)[number]) {
    if (!o.href || opening) return;
    if (!o.kind) return router.push(o.href);
    setOpening(true);
    try {
      const photo = await choosePhoto(o.kind, 'auto');
      if (photo) {
        setPendingPhoto(photo);
        router.push(o.href);
      }
    } finally {
      setOpening(false);
    }
  }
  const off = (o: (typeof OPTIONS)[number]) => menuOff && o.href === '/compose/today';
  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <Text style={styles.title}>What do you want to share?</Text>
      <View style={styles.list}>
        {OPTIONS.map((o) => (
          <Pressable key={o.title} style={[styles.row, (!o.href || off(o)) && { opacity: 0.5 }]} disabled={!o.href || off(o)} onPress={() => open(o)}>
            <View style={styles.icon}>
              <MaterialIcons name={o.icon} size={22} color={colors.teal} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.rowTitle}>{o.title}</Text>
              <Text style={styles.rowNote}>{o.note}</Text>
            </View>
            <FlipIcon name="chevron-right" size={22} color={colors.muted} />
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
