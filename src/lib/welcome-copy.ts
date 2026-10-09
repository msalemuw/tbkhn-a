// Welcome screen copy: final design (English) and Egyptian Arabic.
// The Arabic tagline is a draft until the founder confirms it.
export const welcomeCopy = {
  en: {
    dir: 'ltr',
    tagA: 'Good food brings us ',
    tagB: 'closer',
    create: 'Create account',
    login: 'Log in',
    how: 'How the app works',
  },
  ar: {
    dir: 'rtl',
    tagA: 'الأكل الحلو بيقرّبنا ',
    tagB: 'أكتر',
    create: 'إنشاء حساب',
    login: 'تسجيل الدخول',
    how: 'إزاي التطبيق بيشتغل',
  },
} as const;

export type Lang = keyof typeof welcomeCopy;
