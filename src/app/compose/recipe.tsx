import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { KeyboardAvoidingView } from '@/components/keyboard-view';
import { Field, formStyles, PrimaryButton } from '@/components/form';
import { Text, TextInput } from '@/components/text';
import { colors, fonts } from '@/constants/theme';
import { cleanRecipe, emptyRecipe, fetchBrandSuggestions, matchBrands, peekRecipeDraft, type Recipe, setRecipeDraft } from '@/lib/recipe';

// The optional recipe on a post: servings and time, ingredients one per line, numbered steps. "Done" hands it back to the post screen.
export default function ComposeRecipe() {
  const [r, setR] = useState<Recipe>(() => {
    const d = peekRecipeDraft();
    return d ? { ...d, ingredients: [...d.ingredients, ''], brands: [...d.ingredients.map((_, i) => d.brands[i] ?? ''), ''], steps: [...d.steps, ''] } : emptyRecipe();
  });
  // Brands other cooks already typed, offered while you type a brand.
  const [known, setKnown] = useState<string[]>([]);
  const [brandFocus, setBrandFocus] = useState<number | null>(null);
  useEffect(() => {
    fetchBrandSuggestions().then(setKnown);
  }, []);
  const setBrand = (i: number, v: string) => setR((x) => ({ ...x, brands: x.ingredients.map((_, j) => (j === i ? v : x.brands[j] ?? '')) }));

  const setLine = (key: 'ingredients' | 'steps', i: number, v: string) => setR((x) => ({ ...x, [key]: x[key].map((s, j) => (j === i ? v : s)) }));
  const addLine = (key: 'ingredients' | 'steps') => setR((x) => ({ ...x, [key]: [...x[key], ''], ...(key === 'ingredients' ? { brands: [...x.ingredients.map((_, i) => x.brands[i] ?? ''), ''] } : {}) }));
  const removeLine = (key: 'ingredients' | 'steps', i: number) =>
    setR((x) => ({
      ...x,
      [key]: x[key].length > 1 ? x[key].filter((_, j) => j !== i) : [''],
      ...(key === 'ingredients' ? { brands: x.ingredients.length > 1 ? x.ingredients.map((_, j) => x.brands[j] ?? '').filter((_, j) => j !== i) : [''] } : {}),
    }));

  function done() {
    setRecipeDraft(cleanRecipe(r));
    router.back();
  }

  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.top}>
        <Pressable hitSlop={12} onPress={() => router.back()} accessibilityLabel="Close" style={styles.closeHit}>
          <MaterialIcons name="arrow-back" size={28} color={colors.ink} />
        </Pressable>
        <Text style={styles.topTitle}>Recipe</Text>
        <View style={styles.closeHit} />
      </View>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding">
        <ScrollView contentContainerStyle={styles.pad} keyboardShouldPersistTaps="handled">
          <View style={styles.two}>
            <View style={{ flex: 1 }}>
              <Field label="SERVINGS">
                <TextInput value={r.servings} onChangeText={(v) => setR((x) => ({ ...x, servings: v }))} placeholder="e.g. 4 people" placeholderTextColor={colors.faint} maxLength={30} style={formStyles.input} accessibilityLabel="Servings" />
              </Field>
            </View>
            <View style={{ flex: 1 }}>
              <Field label="COOKING TIME">
                <TextInput value={r.minutes} onChangeText={(v) => setR((x) => ({ ...x, minutes: v }))} placeholder="e.g. 45 min" placeholderTextColor={colors.faint} maxLength={30} style={formStyles.input} accessibilityLabel="Cooking time" />
              </Field>
            </View>
          </View>

          <Text style={styles.label}>INGREDIENTS</Text>
          {r.ingredients.map((line, i) => (
            <View key={i} style={styles.ingredient}>
              <View style={styles.line}>
                <TextInput value={line} onChangeText={(v) => setLine('ingredients', i, v)} placeholder="e.g. 500 g chicken" placeholderTextColor={colors.faint} maxLength={120} style={[formStyles.input, styles.lineInput]} accessibilityLabel={`Ingredient ${i + 1}`} />
                <Pressable hitSlop={8} onPress={() => removeLine('ingredients', i)} accessibilityLabel="Remove ingredient">
                  <MaterialIcons name="close" size={20} color={colors.muted} />
                </Pressable>
              </View>
              <TextInput
                value={r.brands[i] ?? ''}
                onChangeText={(v) => setBrand(i, v)}
                onFocus={() => setBrandFocus(i)}
                onBlur={() => setBrandFocus((f) => (f === i ? null : f))}
                placeholder="Brand (optional)"
                placeholderTextColor={colors.faint}
                maxLength={40}
                style={[formStyles.input, styles.brandInput]}
                accessibilityLabel={`Brand for ingredient ${i + 1}`}
              />
              {brandFocus === i ? (
                <View style={styles.chips}>
                  {matchBrands(known, r.brands[i] ?? '').map((b) => (
                    <Pressable key={b} style={styles.chip} onPress={() => setBrand(i, b)} accessibilityRole="button" accessibilityLabel={`Use ${b}`}>
                      <Text verbatim style={styles.chipText}>{b}</Text>
                    </Pressable>
                  ))}
                </View>
              ) : null}
            </View>
          ))}
          <Pressable style={styles.add} onPress={() => addLine('ingredients')} accessibilityRole="button">
            <MaterialIcons name="add" size={20} color={colors.teal} />
            <Text style={styles.addText}>Add ingredient</Text>
          </Pressable>

          <Text style={styles.label}>STEPS</Text>
          {r.steps.map((line, i) => (
            <View key={i} style={styles.line}>
              <View style={styles.num}>
                <Text style={styles.numText}>{i + 1}</Text>
              </View>
              <TextInput value={line} onChangeText={(v) => setLine('steps', i, v)} placeholder="Describe this step" placeholderTextColor={colors.faint} multiline maxLength={400} style={[formStyles.input, styles.lineInput]} accessibilityLabel={`Step ${i + 1}`} />
              <Pressable hitSlop={8} onPress={() => removeLine('steps', i)} accessibilityLabel="Remove step">
                <MaterialIcons name="close" size={20} color={colors.muted} />
              </Pressable>
            </View>
          ))}
          <Pressable style={styles.add} onPress={() => addLine('steps')} accessibilityRole="button">
            <MaterialIcons name="add" size={20} color={colors.teal} />
            <Text style={styles.addText}>Add step</Text>
          </Pressable>

          <PrimaryButton label="Done" onPress={done} style={{ marginTop: 22 }} />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.paper },
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 18, paddingTop: 16, paddingBottom: 12 },
  topTitle: { fontFamily: fonts.extraBold, fontSize: 22, color: colors.ink },
  closeHit: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', marginLeft: -8 },
  pad: { paddingHorizontal: 18, paddingBottom: 30 },
  two: { flexDirection: 'row', gap: 12 },
  label: { fontFamily: fonts.bold, fontSize: 12, letterSpacing: 0.6, color: colors.muted, marginTop: 18, marginBottom: 8 },
  line: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8 },
  lineInput: { flex: 1 },
  ingredient: { marginBottom: 8 },
  brandInput: { marginTop: 0, marginBottom: 2, fontSize: 14, paddingVertical: 8, marginLeft: 0 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 6 },
  chip: { paddingHorizontal: 12, height: 30, borderRadius: 15, backgroundColor: colors.lightBlue, alignItems: 'center', justifyContent: 'center' },
  chipText: { fontFamily: fonts.semiBold, fontSize: 13, color: colors.ink },
  num: { width: 24, height: 24, borderRadius: 12, backgroundColor: colors.teal, alignItems: 'center', justifyContent: 'center' },
  numText: { fontFamily: fonts.bold, fontSize: 12, color: colors.white },
  add: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', paddingVertical: 6 },
  addText: { fontFamily: fonts.bold, fontSize: 14, color: colors.ink },
});
