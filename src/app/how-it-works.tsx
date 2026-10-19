import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { router, useLocalSearchParams } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Text as T } from '@/components/text';
import { isRTL } from '@/lib/i18n';
import { colors, fonts } from '@/constants/theme';

// Opened from the welcome screen. Text from the design file; Arabic wording is a draft.
const COPY = {
  en: {
    dir: 'ltr',
    title: 'How it works',
    head: 'Dishes from your community, made by people you trust',
    intro: 'Cooks in your community (compound, club or office) share what they’re making. You reserve a plate and pick it up nearby.',
    steps: [
      ['groups', 'Join your communities', 'Pick your compound, club, school or workplace. You only see cooks who serve them.'],
      ['restaurant', 'See today’s menu', 'Open the Menu tab to see today’s dishes from cooks in your communities. Each dish shows its price, the time it’s ready and where to pick it up.'],
      ['event-available', 'Reserve a plate', 'Tap a dish, reserve, and message the cook if you have questions.'],
      ['location-on', 'Pick up and enjoy', 'Collect at the community’s meeting point, then leave a review.'],
    ],
    cookHead: 'Want to cook?',
    cook: 'Share today’s menu so neighbors can reserve plates, and post your signature dishes on your profile.',
    ok: 'Got it',
  },
  ar: {
    dir: 'rtl',
    title: 'إزاي يشتغل',
    head: 'أطباق من مجتمعك، من ناس تثق فيهم',
    intro: 'الطباخين في مجتمعك (الكومباوند أو النادي أو الشغل) بيشاركوا اللي بيطبخوه. بتحجز طبقك وتاخده من مكان قريب.',
    steps: [
      ['groups', 'انضم لمجتمعاتك', 'اختار الكومباوند أو النادي أو المدرسة أو مكان الشغل. هتشوف بس الطباخين اللي بيخدموهم.'],
      ['restaurant', 'شوف مين بيطبخ النهارده', 'افتح قائمة اليوم وشوف أطباق الطباخين في مجتمعاتك. كل طبق عليه سعره وميعاد جهوزيته ومكان الاستلام.'],
      ['event-available', 'احجز طبقك', 'اضغط على الطبق واحجز، وابعت للطباخ لو عندك أي سؤال.'],
      ['location-on', 'استلم واستمتع', 'استلم من نقطة تجمع المجتمع، وبعدها سيب تقييمك.'],
    ],
    cookHead: 'عايز تطبخ؟',
    cook: 'شارك اللي بتطبخه النهارده عشان جيرانك يطلبوا، وانشر أطباقك المميزة على بروفايلك.',
    ok: 'تمام',
  },
} as const;

export default function HowItWorks() {
  const { lang } = useLocalSearchParams<{ lang?: string }>();
  const t = COPY[lang === 'ar' ? 'ar' : 'en'];
  const rtl = t.dir === 'rtl';
  // Rows already run right-to-left when the app itself is Arabic; only a page language that differs from the app flips them.
  const dir = rtl !== isRTL ? ('row-reverse' as const) : ('row' as const);
  const align = rtl === isRTL ? ('auto' as const) : rtl ? ('right' as const) : ('left' as const);

  return (
    <SafeAreaView style={styles.screen}>
      <View style={[styles.bar, { flexDirection: dir }]}>
        <Pressable onPress={() => router.back()} hitSlop={12} accessibilityRole="button" accessibilityLabel="Back">
          <MaterialIcons name={rtl ? 'arrow-forward' : 'arrow-back'} size={28} color={colors.ink} />
        </Pressable>
        <T verbatim style={styles.barTitle}>{t.title}</T>
      </View>
      <ScrollView contentContainerStyle={styles.body}>
        <T verbatim style={[styles.head, { textAlign: align }]}>{t.head}</T>
        <T verbatim style={[styles.intro, { textAlign: align }]}>{t.intro}</T>
        {t.steps.map(([icon, title, text], i) => (
          <View key={title} style={[styles.step, { flexDirection: dir }]}>
            <View style={styles.badge}>
              <MaterialIcons name={icon} size={22} color={colors.navy} />
            </View>
            <View style={styles.stepBody}>
              <T verbatim style={[styles.stepTitle, { textAlign: align }]}>
                {i + 1}. {title}
              </T>
              <T verbatim style={[styles.stepText, { textAlign: align }]}>{text}</T>
            </View>
          </View>
        ))}
        <View style={styles.cook}>
          <T verbatim style={[styles.stepTitle, { textAlign: align }]}>{t.cookHead}</T>
          <T verbatim style={[styles.stepText, { textAlign: align }]}>{t.cook}</T>
        </View>
      </ScrollView>
      <Pressable style={styles.ok} onPress={() => router.back()}>
        <T verbatim style={styles.okText}>{t.ok}</T>
      </Pressable>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.paper, paddingHorizontal: 20 },
  bar: { alignItems: 'center', gap: 12, paddingTop: 16, paddingBottom: 10 },
  barTitle: { fontFamily: fonts.extraBold, fontSize: 22, color: colors.ink },
  body: { gap: 16, paddingBottom: 16 },
  head: { fontFamily: fonts.serif, fontSize: 30, lineHeight: 33, color: colors.ink },
  intro: { fontFamily: fonts.medium, fontSize: 14, lineHeight: 21, color: colors.muted },
  step: { gap: 12, alignItems: 'flex-start' },
  badge: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.lightBlue, alignItems: 'center', justifyContent: 'center' },
  stepBody: { flex: 1, gap: 2 },
  stepTitle: { fontFamily: fonts.bold, fontSize: 16, color: colors.ink },
  stepText: { fontFamily: fonts.medium, fontSize: 14, lineHeight: 20, color: colors.muted },
  cook: { backgroundColor: colors.lightBlue, borderRadius: 14, padding: 16, gap: 4 },
  ok: { backgroundColor: colors.teal, borderRadius: 14, paddingVertical: 16, alignItems: 'center', marginBottom: 12 },
  okText: { fontFamily: fonts.extraBold, fontSize: 16, color: colors.navy },
});
