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
    head: 'The home cooking network of your community',
    intro: 'Follow the cooks in your community (compound, club or office), see what they make, like and comment on their dishes, and watch who ranks first.',
    steps: [
      ['groups', 'Join your communities', 'Pick your compound, club, school or workplace. You see the cooks who belong to them.'],
      ['favorite', 'Follow and like', 'Follow your favorite cooks, like their signature dishes and stories, and leave a comment.'],
      ['restaurant', 'See today’s menu', 'When a cook shares today’s menu, you can reserve a plate and message them with any question.'],
      ['location-on', 'Pick up and review', 'Collect at the community’s meeting point, then leave a review that counts toward the cook’s rank.'],
    ],
    cookHead: 'Want to cook?',
    cook: 'Post your signature dishes, grow your followers in your community, and share today’s menu when you want neighbors to reserve plates.',
    ok: 'Got it',
  },
  ar: {
    dir: 'rtl',
    title: 'إزاي يشتغل',
    head: 'شبكة الأكل البيتي في مجتمعك',
    intro: 'تابع الطباخين في مجتمعك (الكومباوند أو النادي أو الشغل)، شوف بيطبخوا إيه، واعمل لايك وكومنت على أطباقهم، وشوف مين الأول في الترتيب.',
    steps: [
      ['groups', 'انضم لمجتمعاتك', 'اختار الكومباوند أو النادي أو المدرسة أو مكان الشغل. هتشوف الطباخين اللي فيهم.'],
      ['favorite', 'تابع واعمل لايك', 'تابع الطباخين اللي بتحبهم، واعمل لايك على أطباقهم المميزة وستوريهم، واكتب كومنت.'],
      ['restaurant', 'شوف منيو النهاردة', 'لما الطباخ ينزل منيو النهاردة تقدر تحجز طبقك وتبعتله لو عندك أي سؤال.'],
      ['location-on', 'استلم وقيّم', 'استلم من نقطة تجمع المجتمع، وبعدها سيب تقييمك وهو بيدخل في ترتيب الطباخ.'],
    ],
    cookHead: 'عايز تطبخ؟',
    cook: 'انشر أطباقك المميزة، وكبّر متابعينك في مجتمعك، وانزل منيو النهاردة وقت ما تحب جيرانك يحجزوا.',
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
