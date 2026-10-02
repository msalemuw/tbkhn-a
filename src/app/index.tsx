import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { colors, fonts } from '@/constants/theme';
import { type Lang, welcomeCopy } from '@/lib/welcome-copy';

// Flow 1/2, screen s1: Welcome.
export default function Welcome() {
  const [lang, setLang] = useState<Lang>('en');
  const t = welcomeCopy[lang];
  const align = t.dir === 'rtl' ? 'right' : 'left';

  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.langRow}>
        {(['en', 'ar'] as const).map((l) => (
          <Pressable key={l} onPress={() => setLang(l)} style={[styles.langBtn, lang === l && styles.langOn]}>
            <Text style={[styles.langText, lang === l && styles.langTextOn]}>{l === 'en' ? 'EN' : 'ع'}</Text>
          </Pressable>
        ))}
      </View>

      <View style={styles.body}>
        <Text style={styles.logo}>TBKHN A</Text>
        <Text style={[styles.title, { textAlign: align }]}>{t.t1}</Text>
        <Text style={[styles.title, styles.titleAccent, { textAlign: align }]}>{t.t2}</Text>
        <Text style={[styles.sub, { textAlign: align }]}>{t.sub}</Text>
        <Text style={[styles.cta, { textAlign: align }]}>{t.cta}</Text>
      </View>

      <View style={styles.actions}>
        <Pressable style={styles.primary} onPress={() => router.push('/log-in')}>
          <Text style={styles.primaryText}>{t.login}</Text>
        </Pressable>
        <Pressable style={styles.secondary} onPress={() => router.replace('/home')}>
          <Text style={styles.secondaryText}>{t.browse}</Text>
        </Pressable>
        <Text style={styles.newq}>
          {t.newq}{' '}
          <Text style={styles.link} onPress={() => router.push('/sign-up')}>
            {t.signup}
          </Text>
        </Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.teal, paddingHorizontal: 24 },
  langRow: { flexDirection: 'row', alignSelf: 'flex-end', marginTop: 8, borderRadius: 999, borderWidth: 1, borderColor: 'rgba(255,255,255,.5)', padding: 2 },
  langBtn: { paddingHorizontal: 12, paddingVertical: 4, borderRadius: 999 },
  langOn: { backgroundColor: colors.white },
  langText: { fontFamily: fonts.bold, color: colors.white, fontSize: 13 },
  langTextOn: { color: colors.ink },
  body: { flex: 1, justifyContent: 'center', gap: 14 },
  logo: { fontFamily: fonts.serif, fontSize: 44, color: colors.white, marginBottom: 12 },
  title: { fontFamily: fonts.extraBold, fontSize: 28, lineHeight: 34, color: colors.white },
  titleAccent: { color: colors.cream },
  sub: { fontFamily: fonts.medium, fontSize: 15, lineHeight: 22, color: 'rgba(255,255,255,.88)' },
  cta: { fontFamily: fonts.semiBold, fontSize: 15, lineHeight: 22, color: colors.white },
  actions: { gap: 12, paddingBottom: 16 },
  primary: { backgroundColor: colors.white, borderRadius: 14, paddingVertical: 16, alignItems: 'center' },
  primaryText: { fontFamily: fonts.extraBold, fontSize: 16, color: colors.ink },
  secondary: { borderRadius: 14, paddingVertical: 14, alignItems: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,.6)' },
  secondaryText: { fontFamily: fonts.bold, fontSize: 15, color: colors.white },
  newq: { fontFamily: fonts.medium, fontSize: 14, color: 'rgba(255,255,255,.88)', textAlign: 'center' },
  link: { fontFamily: fonts.extraBold, color: colors.white, textDecorationLine: 'underline' },
});
