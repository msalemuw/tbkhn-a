// Welcome screen copy: final design (English) and Egyptian Arabic.
// The Arabic tagline is a draft until the founder confirms it.
export const welcomeCopy = {
  en: {
    dir: 'ltr',
    tagA: 'Good food brings us ',
    tagB: 'closer',
    google: 'Continue with Google',
    apple: 'Continue with Apple',
    other: 'More sign-in options',
    how: 'How the app works',
    agree: 'By continuing you agree to our ',
    terms: 'Terms of use',
    and: ' and ',
    privacy: 'Privacy policy',
  },
  ar: {
    dir: 'rtl',
    tagA: 'الأكل الحلو بيقرّبنا ',
    tagB: 'أكتر',
    google: 'كمّل بحساب Google',
    apple: 'كمّل بحساب Apple',
    other: 'طرق دخول تانية',
    how: 'إزاي التطبيق بيشتغل',
    agree: 'بالمتابعة أنت توافق على ',
    terms: 'شروط الاستخدام',
    and: ' و',
    privacy: 'سياسة الخصوصية',
  },
} as const;

export type Lang = keyof typeof welcomeCopy;
