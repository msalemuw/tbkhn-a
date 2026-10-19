// Arabic for text with numbers or names inside, tried in order when ar.ts has no exact match.
// [pattern for the whole English text, Arabic with $1 $2 for the captured parts, or a function making it].
import { ar } from '@/lib/ar';

type To = string | ((...m: string[]) => string);

const NOUN: Record<string, string> = {
  area: 'منطقة',
  club: 'نادي',
  school: 'مدرسة',
  workplace: 'شغل',
  work: 'شغل',
  'Sahel community': 'مجتمع الساحل',
  community: 'مجتمع',
};
// A place or community name in Arabic when we have it, else as typed.
const arByLower = new Map(Object.entries(ar).map(([k, v]) => [k.toLowerCase(), v]));
const nm = (x: string) => arByLower.get(x.toLowerCase()) ?? x;
const noun = (n: string) => NOUN[n] ?? n;
const NEW: Record<string, string> = { area: 'منطقة جديدة', club: 'نادي جديد', school: 'مدرسة جديدة', workplace: 'مكان شغل جديد', work: 'مكان شغل جديد', 'Sahel community': 'مجتمع ساحل جديد', community: 'مجتمع جديد' };

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTHS_AR = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const DAYS_AR = ['الأحد', 'الاتنين', 'التلات', 'الأربع', 'الخميس', 'الجمعة', 'السبت'];

export const arPatterns: [RegExp, To][] = [
  // Time and distance (format.ts)
  [/^(\d+)m$/, '$1د'],
  [/^(\d+)h$/, '$1س'],
  [/^(\d+) (Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)$/, (_, d, m) => `${d} ${MONTHS_AR[MONTHS.indexOf(m)]}`],
  [/^(Sun|Mon|Tue|Wed|Thu|Fri|Sat)$/, (_, d) => DAYS_AR[DAYS.indexOf(d)]],
  [/^(\d+) km away$/, '$1 كم بعيد'],
  [/^(\d+(?:\.\d)?) km$/, '$1 كم'],
  [/^(\d+) m$/, '$1 م'],
  [/^(\d+) left$/, 'فاضل $1'],
  [/^1 plate$/, 'طبق واحد'],
  [/^(\d+) plates$/, '$1 أطباق'],
  [/^(\d+) stars?$/, '$1 نجوم'],
  [/^1 like$/, 'لايك واحد'],
  [/^(\d+) likes$/, '$1 لايك'],

  [/^EGP ([\d.,]+)$/, '$1 جنيه'],
  [/^Payment sent · EGP ([\d.,]+) by InstaPay$/, 'الدفع اتبعت · $1 جنيه بإنستاباي'],
  [/^Payment received · EGP ([\d.,]+)$/, 'الدفع وصل · $1 جنيه'],

  [/^(.+) away$/, '$1 بعيد'],
  [/^See all (\d+) cooks$/, 'شوف كل الـ $1 طباخ'],
  [/^Nothing on today’s menu in (.+) yet\.$/, (_, c) => `مفيش حاجة في قائمة النهاردة في ${nm(c)} لسه.`],
  [/^Today’s menu in (.+)$/, (_, c) => `قائمة النهاردة في ${nm(c)}`],
  [/^We got your message and will answer on (.+)\.$/, 'وصلتنا رسالتك وهنرد عليك على $1.'],
  [/^Tell us what happened and we will answer here\.$/, 'قولنا حصل إيه وهنرد عليك هنا.'],
  [/^Tell us what happened and we will answer here, on the email or phone you leave\.$/, 'قولنا حصل إيه وهنرد عليك على الإيميل أو الموبايل اللي هتسيبه.'],
  [/^NOTE FROM (.+)$/, (_, n) => (n === 'YOU' ? 'ملاحظة منك' : `ملاحظة من ${n}`)],
  [/^Cancellation is closed once the cook confirms\. If something changed, contact (.+)\.$/, 'الإلغاء بيتقفل لما الطباخ يأكد. لو حاجة اتغيّرت، كلّم $1.'],
  [/^How was (.+)’s meal\?$/, 'أكل $1 كان عامل إزاي؟'],
  [/^Resend code in (\d+:\d\d)$/, 'ابعت الكود تاني بعد $1'],
  [/^Pay (.+) by InstaPay after (.+) accepts\. Nothing is charged in the app\.$/, 'ادفع لـ $1 بإنستاباي بعد ما $2 يقبل. مفيش أي مبلغ بيتخصم من التطبيق.'],
  [/^Say hello to (.+)\. Ask about the dish or agree on pickup here\.$/, 'قول أهلاً لـ $1. اسأل عن الأكلة أو اتفق على الاستلام هنا.'],
  [/^(?:In (.+)\. )?Our team reviews every request\. You can keep going now, and you join as soon as it is approved\.$/, (_, w) => `${w ? `في ${w}. ` : ''}فريقنا بيراجع كل طلب. تقدر تكمّل دلوقتي، وهتنضم أول ما يتوافق عليه.`],

  // Counts
  [/^Comments · (\d+)$/, 'التعليقات · $1'],
  [/^Likes · (\d+)$/, 'اللايكات · $1'],
  [/^Inbox, (\d+) new$/, 'الرسايل، $1 جديدة'],
  [/^(\d+) likes\. See who liked$/, '$1 لايك. شوف مين عمل لايك'],
  [/^#(\d+) in (.+) · Likes$/, (_, r, c) => `#${r} في ${nm(c)} · لايكات`],
  [/^#(\d+) in (.+)$/, (_, r, c) => `#${r} في ${nm(c)}`],
  [/^TOP COOKS IN (.+)$/i, (_, c) => `أفضل الطباخين في ${nm(c)}`],
  [/^MOST LIKED IN (.+)$/i, (_, c) => `الأكثر لايكات في ${nm(c)}`],
  [/^(.+) · (\d+) likes?$/, (_, h, n) => `${h} · ${n} لايك`],

  // People and blocking
  [/^Block (.+)\?$/, 'تحظر $1؟'],
  [/^Block (.+)$/, 'حظر $1'],
  [/^Unblock (.+)$/, 'إلغاء حظر $1'],
  [/^Message (.+)…$/, 'ابعت لـ $1…'],
  [/^Message (.+)$/, 'ابعت لـ $1'],
  [/^Reply to (.+)…$/, 'رد على $1…'],
  [/^Replying to your story: (.+)$/, 'رد على الستوري بتاعتك: $1'],
  [/^(.+) on tabkheen A: (.+)$/, '$1 على tabkheen A: $2'],
  [/^(.+) on tabkheen A (.+)$/, '$1 على tabkheen A $2'],
  [/^(.+) on tabkheen A$/, (_, c) => `${nm(c)} على tabkheen A`],
  [/^(.+)’s signature dish on tabkheen A$/, 'أكلة $1 المميزة على tabkheen A'],
  [/^Thanks! “(.+)” is waiting for approval\.$/, 'شكرًا! «$1» مستني الموافقة.'],

  // Dish and order
  [/^Pickup spot: (.+)\. Show on map$/, 'مكان الاستلام: $1. اعرضه على الخريطة'],
  [/^Order a plate of (.+)$/, 'احجز طبق $1'],
  [/^Pickup (.+)$/, 'الاستلام $1'],
  [/^Ready now$/, 'جاهز دلوقتي'],
  [/^Ready now \(earliest\)$/, 'جاهز دلوقتي (الأبكر)'],
  [/^(.+) \(earliest\)$/, '$1 (الأبكر)'],
  [/^Ready (.+)$/, 'جاهز $1'],
  [/^Pick up now today$/, 'استلم دلوقتي'],
  [/^Pick up at (.+) today$/, 'استلم الساعة $1 النهاردة'],
  [/^Note for (.+) \(optional\), e\.g\. less spicy$/, 'ملاحظة لـ $1 (اختياري)، مثلًا: حرّ أقل'],
  [/^Sign up to reserve from (.+)$/, 'سجّل عشان تحجز من $1'],
  [/^Send order to (.+)$/, 'ابعت الحجز لـ $1'],
  [/^(\d+) × (.+) · EGP (\d+)(.*)$/, (_, n, d, p, rest) => `${n} × ${d} · ${p} جنيه${rest.replace(/ · Pickup /, ' · الاستلام ')}`],
  [/^(\d+) × (.+)$/, '$1 × $2'],
  [/^(.+) hasn’t confirmed, so nothing is owed\.$/, '$1 لسه ما أكدش، فمفيش حاجة مستحقة.'],
  [/^(.+) hasn’t marked the payment as sent yet\.$/, '$1 لسه ما علّمش إن الدفع اتبعت.'],
  [/^(.+) says the payment is sent\. Check your InstaPay and confirm\.$/, '$1 بيقول إن الدفع اتبعت. بص على إنستاباي وأكّد.'],
  [/^(.+) says the payment is sent\. Check your InstaPay\.$/, '$1 بيقول إن الدفع اتبعت. بص على إنستاباي.'],
  [/^Waiting for (.+) to confirm it arrived\.$/, 'مستني $1 يأكد إنه وصل.'],
  [/^Waiting for (.+) to confirm the payment$/, 'مستني $1 يأكد الدفع'],
  [/^Waiting for (.+) to pay by InstaPay$/, 'مستني $1 يدفع بإنستاباي'],
  [/^Waiting for (.+) to confirm$/, 'مستني $1 يأكد'],
  [/^(.+) confirmed the payment\. Thank you!$/, '$1 أكّد الدفع. شكرًا ليك!'],
  [/^Send EGP (.+) to (.+) by InstaPay$/, 'ابعت $1 جنيه لـ $2 بإنستاباي'],
  [/^New order from (.+)$/, 'طلب جديد من $1'],
  [/^Tap Mark as ready when it’s done, and (.+) is told right away\.$/, 'دوس «علّم إنه جاهز» لما يخلص، و$1 هيتبلّغ على طول.'],
  [/^Tap Picked up when (.+) collects it\.$/, 'دوس «اتستلم» لما $1 يستلمه.'],
  [/^(.+) cancelled$/, '$1 لغى'],
  [/^You can cancel for free until (.+) confirms\.$/, 'تقدر تلغي ببلاش لحد ما $1 يأكد.'],
  [/^Order confirmed by (.+)$/, '$1 أكّد الطلب'],
  [/^(.+) just finished cooking\. Hot and ready for your family’s table\.$/, '$1 لسه خالص طبخ. سخن وجاهز لسفرة عيلتك.'],
  [/^(.+) couldn’t take this order$/, '$1 مقدرش ياخد الطلب ده'],

  // Sign-up and communities
  [/^@(.+) is already taken\. Try one of these:$/, '@$1 مأخوذ. جرّب واحد من دول:'],
  [/^@(.+) is available$/, '@$1 متاح'],
  [/^(.+) \(pending approval\)$/, '$1 (مستني الموافقة)'],
  [/^Choose your (region|governorate) first, then request your (.+)\.$/, (_, r, n) => `اختار ${r === 'region' ? 'المنطقة' : 'المحافظة'} الأول، وبعدين اطلب ${noun(n)}.`],
  [/^Choose a (region|governorate) first$/, (_, r) => `اختار ${r === 'region' ? 'المنطقة' : 'المحافظة'} الأول`],
  [/^Can’t find your (.+)\? Request it$/, (_, n) => `مش لاقي ${noun(n)}؟ اطلبه`],
  [/^Request a new (.+)$/, (_, n) => `اطلب ${NEW[n] ?? noun(n)}`],
  [/^example: (Sheikh Zayed)$/, 'مثلًا: الشيخ زايد'],
  [/^example: (Shooting Club)$/, 'مثلًا: نادي الصيد'],
  [/^Add the (.+)\.$/, 'ضيف $1.'],
  [/^We added you to (.+)$/, 'ضفناك في $1'],
  [/^Your request “(.+)” was matched$/, 'طلبك «$1» اتطابق'],
  [/^Your community “(.+)” was approved$/, 'مجتمعك «$1» اتوافق عليه'],
  [/^Your community request “(.+)” wasn’t approved$/, 'طلب مجتمعك «$1» ما اتوافقش عليه'],
  [/^The pin is still where the map opened\. Search for “(.+)” or move the map to the exact spot\.$/, 'الدبوس لسه في مكانه لما الخريطة اتفتحت. ابحث عن «$1» أو حرّك الخريطة للمكان بالظبط.'],
  [/^We couldn’t upload your photo \((.+)\)\. Check your connection and try again\.$/, 'معرفناش نرفع صورتك ($1). اتأكد من النت وجرّب تاني.'],
  [/^We couldn’t share your post(.*)\. Check your connection and try again\.$/, 'معرفناش ننشر بوستك$1. اتأكد من النت وجرّب تاني.'],
  [/^Search (.+)$/, 'ابحث في $1'],

  // Notifications (notifications.ts)
  [/^(.+) ordered (\d+) × (.+)$/, '$1 حجز $2 × $3'],
  [/^(.+) accepted your order$/, '$1 قبل طلبك'],
  [/^(.+) declined your order$/, '$1 رفض طلبك'],
  [/^Your order from (.+) is ready$/, 'طلبك من $1 جاهز'],
  [/^(.+) · ready for pickup$/, '$1 · جاهز للاستلام'],
  [/^(.+) · confirm it arrived$/, '$1 · أكّد إنه وصل'],
  [/^(.+) cancelled their order$/, '$1 لغى طلبه'],
  [/^How was your order from (.+)\?$/, 'طلبك من $1 كان عامل إزاي؟'],
  [/^(.+) sent the InstaPay payment$/, '$1 بعت الدفع بإنستاباي'],
  [/^(.+) confirmed your payment$/, '$1 أكّد دفعك'],
  [/^(.+) added to today’s menu$/, '$1 ضاف لقائمة النهاردة'],
  [/^(.+) liked your post$/, '$1 عمل لايك لبوستك'],
  [/^(.+) commented on your post$/, '$1 علّق على بوستك'],
  [/^(.+) started following you$/, '$1 بدأ يتابعك'],
  [/^tabkheen A updated your order of (.+)$/, 'tabkheen A حدّث طلبك من $1'],
  [/^(Accepted|Cancelled|Declined|Updated): (.+)$/, (_, s, n) => `${{ Accepted: 'اتقبل', Cancelled: 'اتلغى', Declined: 'اترفض', Updated: 'اتحدّث' }[s]}: ${n}`],
  [/^This version of tabkheen A \((.+)\) is no longer supported\. Update the app from the App Store or Google Play to continue\.$/, 'النسخة دي من tabkheen A ($1) مبقتش مدعومة. حدّث التطبيق من App Store أو Google Play عشان تكمّل.'],
];

// Units and AM/PM inside any text: "3:30 PM" -> "3:30 م", "350 m" -> "350 م".
export function localizeUnits(text: string): string {
  return text
    .replace(/(\d) AM\b/g, '$1 ص')
    .replace(/(\d) PM\b/g, '$1 م')
    .replace(/(\d) km\b/g, '$1 كم')
    .replace(/(\d) m\b/g, '$1 م');
}
