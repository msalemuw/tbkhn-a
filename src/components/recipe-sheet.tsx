import { Modal, Pressable, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { GrabHandle } from '@/components/grab-handle';
import { Text } from '@/components/text';
import { colors, fonts, ui } from '@/constants/theme';
import type { Recipe } from '@/lib/recipe';

/** The recipe of a post as a bottom sheet: servings and time, ingredients, then numbered steps. */
export function RecipeSheet({ recipe, visible, onClose }: { recipe: Recipe; visible: boolean; onClose: () => void }) {
  const { height } = useWindowDimensions();
  const facts = [recipe.servings, recipe.minutes].filter(Boolean).join(' · ');
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.root}>
        <Pressable style={[StyleSheet.absoluteFill, styles.scrim]} onPress={onClose} accessibilityLabel="Close" />
        <SafeAreaView edges={['bottom']} style={[styles.sheet, { height: Math.round(height * 0.7) }]}>
          <GrabHandle onClose={onClose} color={ui.border} />
          <Text style={styles.title}>Recipe</Text>
          {facts ? <Text verbatim style={styles.facts}>{facts}</Text> : null}
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 20 }}>
            {recipe.ingredients.length ? <Text style={styles.label}>INGREDIENTS</Text> : null}
            {recipe.ingredients.map((x, i) => (
              <View key={i} style={styles.row}>
                <View style={styles.bullet} />
                <Text verbatim style={styles.body}>{x}</Text>
              </View>
            ))}
            {recipe.steps.length ? <Text style={styles.label}>STEPS</Text> : null}
            {recipe.steps.map((x, i) => (
              <View key={i} style={styles.row}>
                <View style={styles.num}>
                  <Text style={styles.numText}>{i + 1}</Text>
                </View>
                <Text verbatim style={styles.body}>{x}</Text>
              </View>
            ))}
          </ScrollView>
        </SafeAreaView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: 'flex-end' },
  scrim: { backgroundColor: 'rgba(1,49,62,.5)' },
  sheet: { backgroundColor: ui.card, borderTopLeftRadius: 26, borderTopRightRadius: 26, paddingHorizontal: 22 },
  title: { fontFamily: fonts.extraBold, fontSize: 18, color: ui.deep },
  facts: { fontFamily: fonts.semiBold, fontSize: 13, color: colors.muted, marginTop: 2 },
  label: { fontFamily: fonts.bold, fontSize: 12, letterSpacing: 0.6, color: colors.muted, marginTop: 16, marginBottom: 6 },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, paddingVertical: 5 },
  bullet: { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.teal, marginTop: 7 },
  num: { width: 22, height: 22, borderRadius: 11, backgroundColor: colors.teal, alignItems: 'center', justifyContent: 'center', marginTop: 1 },
  numText: { fontFamily: fonts.bold, fontSize: 12, color: colors.white },
  body: { flex: 1, fontFamily: fonts.regular, fontSize: 15, lineHeight: 21, color: ui.deep },
});
