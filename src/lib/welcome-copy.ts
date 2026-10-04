// Welcome screen copy, verbatim from the design file (English and Egyptian Arabic).
export const welcomeCopy = {
  en: {
    dir: 'ltr',
    t1: 'Cooking daily is a hassle. Delivery is slow and pricey.',
    t2: 'Your community’s dishes are steps away, any time.',
    sub: 'Hygienic, diverse dishes from people you know and trust in your community: your club, office or neighbour.',
    cta: 'Join or create your community, to reserve a plate. No fees, no rider.',
    login: 'Log in',
    browse: 'See what’s cooking near you as a guest',
    newq: 'New to TBKHN A?',
    signup: 'Sign up',
  },
  ar: {
    dir: 'rtl',
    t1: 'الطبخ كل يوم تعب، والدليفري بطيء وغالي.',
    t2: 'أطباق مجتمعك على بُعد خطوات، في أي وقت.',
    sub: 'أطباق نضيفة ومتنوعة من ناس تعرفهم وتثق فيهم في مجتمعك: النادي أو الشغل أو الجيران.',
    cta: 'انضم لمجتمعك أو اعمل مجتمعك، واحجز طبقك. من غير مصاريف توصيل ولا مندوب.',
    login: 'تسجيل الدخول',
    browse: 'شوف مين بيطبخ جنبك كزائر',
    newq: 'جديد على TBKHN A؟',
    signup: 'سجّل الآن',
  },
} as const;

export type Lang = keyof typeof welcomeCopy;
