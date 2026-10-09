import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { router, useLocalSearchParams } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

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
      ['restaurant', 'See what’s cooking today', 'Open the Menu tab to see today’s dishes from cooks in your communities. Each dish shows its price, the time it’s ready and where to pick it up.'],
      ['event-available', 'Reserve a plate', 'Tap a dish, reserve, and message the cook if you have questions.'],
      ['location-on', 'Pick up and enjoy', 'Collect at the community’s meeting point, then leave a review.'],
    ],
    cookHead: 'Want to cook?',
    cook: 'Share what you’re cooking today so neighbors can order, and post your signature dishes on your profile.',
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
  const dir = rtl ? ('row-reverse' as const) : ('row' as const);
  const align = rtl ? ('right' as const) : ('left' as const);

  return (
    <SafeAreaView style={styles.screen}>
      <View style={[styles.bar, { flexDirection: dir }]}>
        <Pressable onPress={() => router.back()} hitSlop={12} accessibilityRole="button" accessibilityLabel="Back">
          <MaterialIcons name={rtl ? 'arrow-forward' : 'arrow-back'} size={24} color={colors.ink} />
        </Pressable>
        <Text style={styles.barTitle}>{t.title}</Text>
      </View>
      <ScrollView contentContainerStyle={styles.body}>
        <Text style={[styles.head, { textAlign: align }]}>{t.head}</Text>
        <Text style={[styles.intro, { textAlign: align }]}>{t.intro}</Text>
        {t.steps.map(([icon, title, text], i) => (
          <View key={title} style={[styles.step, { flexDirection: dir }]}>
            <View style={styles.badge}>
              <MaterialIcons name={icon} size={22} color={colors.navy} />
            </View>
            <View style={styles.stepBody}>
              <Text style={[styles.stepTitle, { textAlign: align }]}>
                {i + 1}. {title}
              </Text>
              <Text style={[styles.stepText, { textAlign: align }]}>{text}</Text>
            </View>
          </View>
        ))}
        <View style={styles.cook}>
          <Text style={[styles.stepTitle, { textAlign: align }]}>{t.cookHead}</Text>
          <Text style={[styles.stepText, { textAlign: align }]}>{t.cook}</Text>
        </View>
      </ScrollView>
      <Pressable style={styles.ok} onPress={() => router.back()}>
        <Text style={styles.okText}>{t.ok}</Text>
      </Pressable>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.paper, paddingHorizontal: 20 },
  bar: { alignItems: 'center', gap: 12, paddingVertical: 10 },
  barTitle: { fontFamily: fonts.extraBold, fontSize: 18, color: colors.ink },
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
