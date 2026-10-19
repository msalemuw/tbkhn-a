import { useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { lang as appLang, t } from '@/lib/i18n';
import { BackHeader } from '@/components/form';
import { colors, fonts } from '@/constants/theme';
import { fetchLegalPage, type LegalPage, type LegalSlug, parseLegal } from '@/lib/legal';

/** Privacy policy and Terms of use, in English or Arabic. Reachable from Settings and from the Welcome screen (signed out too). */
export default function Legal() {
  const { slug, lang: startLang } = useLocalSearchParams<{ slug: string; lang?: string }>();
  const [lang, setLang] = useState<'en' | 'ar'>(startLang === 'ar' || startLang === 'en' ? startLang : appLang);
  const [page, setPage] = useState<LegalPage | null>(null);
  const [failed, setFailed] = useState(false);

  // Bumping `tries` fetches again; the state resets happen in the retry handler, not inside the effect.
  const [tries, setTries] = useState(0);

  useEffect(() => {
    let live = true;
    fetchLegalPage((slug === 'terms' ? 'terms' : 'privacy') as LegalSlug).then(
      (p) => live && setPage(p),
      () => live && setFailed(true),
    );
    return () => {
      live = false;
    };
  }, [slug, tries]);

  const retry = () => {
    setFailed(false);
    setPage(null);
    setTries((n) => n + 1);
  };

  const rtl = lang === 'ar';
  const blocks = page ? parseLegal(rtl ? page.body_ar : page.body_en) : [];

  return (
    <SafeAreaView style={styles.screen}>
      <BackHeader title={page ? (rtl ? page.title_ar : page.title_en) : slug === 'terms' ? t('Terms of use') : t('Privacy policy')} />
      <View style={styles.langRow}>
        {(['en', 'ar'] as const).map((l) => (
          <Pressable key={l} onPress={() => setLang(l)} accessibilityRole="button" accessibilityLabel={l === 'en' ? 'English' : 'العربية'} style={[styles.langBtn, lang === l && styles.langOn]}>
            <Text style={[styles.langText, lang === l && styles.langTextOn]}>{l === 'en' ? 'EN' : 'ع'}</Text>
          </Pressable>
        ))}
      </View>
      {failed ? (
        <View style={styles.center}>
          <Text style={styles.muted}>{t('We couldn’t load this page. Check your connection and try again.')}</Text>
          <Pressable onPress={retry} style={styles.retry} accessibilityRole="button">
            <Text style={styles.retryText}>{t('Try again')}</Text>
          </Pressable>
        </View>
      ) : !page ? (
        <ActivityIndicator color={colors.teal} style={{ marginTop: 40 }} />
      ) : (
        <ScrollView contentContainerStyle={styles.body}>
          {blocks.map((b, i) =>
            b.kind === 'heading' ? (
              <Text key={i} style={[styles.h, rtl && styles.rtl]}>{b.text}</Text>
            ) : b.kind === 'bullet' ? (
              <View key={i} style={[styles.bulletRow, rtl && { flexDirection: 'row-reverse' }]}>
                <Text style={styles.dot}>•</Text>
                <Text style={[styles.p, styles.flex, rtl && styles.rtl]}>{b.text}</Text>
              </View>
            ) : (
              <Text key={i} style={[styles.p, rtl && styles.rtl]}>{b.text}</Text>
            ),
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.paper },
  langRow: { flexDirection: 'row', alignSelf: 'flex-start', marginLeft: 22, marginBottom: 6, borderRadius: 999, backgroundColor: colors.cream, padding: 3 },
  langBtn: { minWidth: 48, alignItems: 'center', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999 },
  langOn: { backgroundColor: colors.navy },
  langText: { fontFamily: fonts.bold, fontSize: 14, color: colors.ink },
  langTextOn: { color: colors.white },
  body: { paddingHorizontal: 22, paddingBottom: 48, gap: 6 },
  h: { fontFamily: fonts.extraBold, fontSize: 17, color: colors.ink, marginTop: 18 },
  p: { fontFamily: fonts.regular, fontSize: 15, lineHeight: 23, color: colors.ink, marginTop: 4 },
  rtl: { textAlign: 'right', writingDirection: 'rtl' },
  flex: { flex: 1 },
  bulletRow: { flexDirection: 'row', gap: 8, alignItems: 'flex-start' },
  dot: { fontFamily: fonts.bold, fontSize: 15, lineHeight: 27, color: colors.ink },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 14 },
  muted: { fontFamily: fonts.semiBold, fontSize: 14, color: colors.muted, textAlign: 'center', lineHeight: 20 },
  retry: { backgroundColor: colors.navy, borderRadius: 999, paddingHorizontal: 22, paddingVertical: 11 },
  retryText: { fontFamily: fonts.bold, fontSize: 14, color: colors.white },
});
