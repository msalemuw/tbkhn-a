-- Privacy policy and Terms of use shown inside the app (Settings, and the links on the Welcome screen).
-- The text lives here so the owner can edit it from the admin website (Legal pages tab) without a new app release,
-- for example once the lawyer has reviewed it. Plain text: "## " starts a heading, "- " a bullet, a blank line a new paragraph.

create table public.app_pages (
  slug text primary key check (slug in ('privacy', 'terms')),
  title_en text not null,
  title_ar text not null,
  body_en text not null,
  body_ar text not null,
  updated_by uuid references public.profiles (id) on delete set null,
  updated_at timestamptz not null default now()
);
alter table public.app_pages enable row level security;
create policy "pages readable" on public.app_pages for select using (true);
grant select on public.app_pages to anon, authenticated;

-- Owner only; the previous text is kept in the action log.
create function public.admin_set_page(p_slug text, p_title_en text, p_title_ar text, p_body_en text, p_body_ar text)
returns void
language plpgsql security definer set search_path = '' as $$
declare v_old public.app_pages;
begin
  perform public.require_staff(array['owner']);
  if btrim(coalesce(p_title_en, '')) = '' or btrim(coalesce(p_title_ar, '')) = '' or btrim(coalesce(p_body_en, '')) = '' or btrim(coalesce(p_body_ar, '')) = '' then
    raise exception 'fill in the title and text in both English and Arabic';
  end if;
  select * into v_old from public.app_pages where slug = p_slug;
  if not found then raise exception 'unknown page'; end if;
  update public.app_pages
     set title_en = btrim(p_title_en), title_ar = btrim(p_title_ar), body_en = p_body_en, body_ar = p_body_ar, updated_by = auth.uid(), updated_at = now()
   where slug = p_slug;
  perform public.log_admin_action('page_changed', 'page', p_slug, null, jsonb_build_object('previous_title_en', v_old.title_en, 'previous_body_en', v_old.body_en, 'previous_body_ar', v_old.body_ar));
end;
$$;
revoke execute on function public.admin_set_page(text, text, text, text, text) from public, anon;
grant execute on function public.admin_set_page(text, text, text, text, text) to authenticated;

-- What the admin website's Legal pages tab shows (any staff role may read).
create function public.admin_get_pages()
returns setof public.app_pages
language plpgsql stable security definer set search_path = '' as $$
begin
  perform public.require_staff(array['owner', 'moderator', 'support']);
  return query select * from public.app_pages order by slug;
end;
$$;
revoke execute on function public.admin_get_pages() from public, anon;
grant execute on function public.admin_get_pages() to authenticated;

-- Draft text, to be reviewed by the lawyer. Replace it from the admin website.
insert into public.app_pages (slug, title_en, title_ar, body_en, body_ar) values
('privacy', 'Privacy policy', 'سياسة الخصوصية',
$en$Last updated 19 October 2026. Draft pending legal review.

tabkheen A is a neighbourhood home-cooking app in Egypt. Neighbours share what they cook, and other neighbours reserve a plate and pick it up. This policy explains what we collect, why, and your choices.

## What we collect
- Your name and email from your Google or Apple account, and the username, photo, short bio, area and communities you choose.
- Your InstaPay handle and phone or WhatsApp number, if you add them.
- What you post and do in the app: posts, stories, comments, likes, messages, orders and reviews.
- Your location while the app is open, to show how far pickup points are and to set your own pickup point. Neighbours only see an approximate distance, never your exact position.
- Photos you choose or take, only when you add them.
- A device token so we can send you alerts about orders, messages and likes. You can turn alerts off in your phone settings.
- Basic technical information, such as app version and crash reports.

## Why we use it
- To run your account, show your profile and posts, and let people order and pick up.
- To send the alerts you ask for.
- To keep the community safe: handle reports, remove harmful content and stop abuse.
- To understand which areas and communities to open first. We never sell your data and never give advertisers your name, email or number.

## Who can see it
- Your name, username, photo, bio, area, communities, posts and rating are public to other members.
- Your email, phone and WhatsApp number are seen only by the tabkheen A team. Your InstaPay handle is shown to a buyer only when you cook for them.
- Our team can see reports and orders when needed to resolve a problem.
- We store data with our database provider, Supabase, and use Expo and Google or Apple to deliver the app and sign-in.

## How long we keep it
For as long as you keep your account. When you delete your account, we remove your sign-in, profile, photos, posts, comments, messages and orders.

## Your choices
- Edit your profile at any time.
- Block or report any member or post.
- Delete your account in the app: Profile, the gear, then Delete my account.
- To ask for a copy of your data or any other request, write to help@tabkheen-a.com.

## Children
tabkheen A is not for children under 16.

## Changes
If we change this policy we will update this page and tell you in the app when the change is important.

## Contact
help@tabkheen-a.com$en$,
$ar$آخر تحديث ١٩ أكتوبر ٢٠٢٦. مسودة في انتظار المراجعة القانونية.

تطبيق tabkheen A هو تطبيق للطبخ المنزلي بين الجيران في مصر. الجيران بيشاركوا اللي بيطبخوه، وجيرانهم بيحجزوا طبق ويستلموه بنفسهم. توضح هذه السياسة ما نجمعه ولماذا وما هي خياراتك.

## ما الذي نجمعه
- اسمك وبريدك الإلكتروني من حساب جوجل أو أبل، واسم المستخدم والصورة والنبذة والمنطقة والمجتمعات التي تختارها.
- حساب إنستاباي ورقم الهاتف أو الواتساب إذا أضفتهم.
- ما تنشره وتفعله في التطبيق: المنشورات والقصص والتعليقات والإعجابات والرسائل والطلبات والتقييمات.
- موقعك أثناء فتح التطبيق، لعرض بُعد نقاط الاستلام وتحديد نقطة الاستلام الخاصة بك. الجيران يرون مسافة تقريبية فقط، ولا يرون موقعك بالتحديد أبداً.
- الصور التي تختارها أو تلتقطها، فقط عندما تضيفها.
- رمز الجهاز لنرسل لك تنبيهات الطلبات والرسائل والإعجابات. يمكنك إيقاف التنبيهات من إعدادات هاتفك.
- معلومات تقنية بسيطة مثل إصدار التطبيق وتقارير الأعطال.

## لماذا نستخدمها
- لتشغيل حسابك وعرض ملفك ومنشوراتك والسماح بالطلب والاستلام.
- لإرسال التنبيهات التي تطلبها.
- للحفاظ على أمان المجتمع: معالجة البلاغات وحذف المحتوى الضار ومنع الإساءة.
- لمعرفة المناطق والمجتمعات التي سنفتحها أولاً. لا نبيع بياناتك أبداً ولا نعطي المعلنين اسمك أو بريدك أو رقمك.

## من يستطيع رؤيتها
- اسمك واسم المستخدم والصورة والنبذة والمنطقة والمجتمعات والمنشورات والتقييم ظاهرة لباقي الأعضاء.
- بريدك الإلكتروني ورقم هاتفك أو واتسابك يراها فريق tabkheen A فقط. حساب إنستاباي يظهر للمشتري فقط عندما تطبخ له.
- فريقنا يستطيع رؤية البلاغات والطلبات عند الحاجة لحل مشكلة.
- نخزّن البيانات لدى مزوّد قواعد البيانات Supabase، ونستخدم Expo وجوجل أو أبل لتوصيل التطبيق وتسجيل الدخول.

## مدة الاحتفاظ
طالما حسابك موجود. عند حذف حسابك نحذف تسجيل دخولك وملفك وصورك ومنشوراتك وتعليقاتك ورسائلك وطلباتك.

## خياراتك
- عدّل ملفك الشخصي في أي وقت.
- احظر أي عضو أو بلّغ عنه أو عن أي منشور.
- احذف حسابك من التطبيق: الملف الشخصي ثم الترس ثم حذف حسابي.
- لطلب نسخة من بياناتك أو أي طلب آخر، راسلنا على help@tabkheen-a.com.

## الأطفال
تطبيق tabkheen A ليس للأطفال دون ١٦ سنة.

## التغييرات
إذا غيّرنا هذه السياسة سنحدّث هذه الصفحة ونخبرك داخل التطبيق عند التغييرات المهمة.

## التواصل
help@tabkheen-a.com$ar$),
('terms', 'Terms of use', 'شروط الاستخدام',
$en$Last updated 19 October 2026. Draft pending legal review.

By creating an account or using tabkheen A you agree to these terms and to our Privacy policy.

## What tabkheen A is
tabkheen A connects neighbours in Egypt. Home cooks share what they cook, and neighbours reserve a plate and pick it up in person. Pickup only: there is no delivery. tabkheen A is a platform; it does not cook, sell or hand over food.

## Your account
- You must be at least 16 years old.
- Use your own account and keep your sign-in safe. One person, one account.
- Give true information about yourself.

## Cooks
- You are responsible for the food you cook: its ingredients, hygiene, safe storage and how it is described, including allergens.
- Only offer food you made yourself, and only portions you can really prepare.
- Say clearly where and when it can be picked up.

## Buyers
- Reserve only what you intend to collect, and collect it on time.
- Pay the cook directly by InstaPay or as agreed at pickup. tabkheen A does not take payment and is not a party to the sale.
- Check the food and its description before you eat it, especially if you have allergies.

## Content and behaviour
You may not post or send anything that is illegal, hateful, harassing, sexual, violent, misleading or that infringes other people's rights, and you may not impersonate others, spam, or try to cheat likes, reviews, rankings or competitions. There is no tolerance for abusive content or abusive members.
You can block any member and report any member or post from the app. We review reports, normally within 24 hours, and may remove content or suspend or ban accounts that break these terms.

## Your content
You keep ownership of what you post. You give tabkheen A permission to show it in the app, and in material that promotes the app, in order to run and promote the service.

## Competitions and prizes
Any competition has its own rules, which we publish before it starts. We may disqualify entries that cheat.

## Availability
We try to keep the app running, but we may change, pause or stop features. We are not responsible for losses caused by things outside our control.

## Liability
To the extent the law allows, tabkheen A is not responsible for the food, for the actions of members, or for disputes between members. Nothing here limits rights you have under Egyptian law.

## Ending your account
You can delete your account at any time in the app. We may suspend or end accounts that break these terms.

## Changes and law
We may update these terms and will tell you in the app about important changes. These terms follow Egyptian law.

## Contact
help@tabkheen-a.com$en$,
$ar$آخر تحديث ١٩ أكتوبر ٢٠٢٦. مسودة في انتظار المراجعة القانونية.

بإنشاء حساب أو استخدام tabkheen A فإنك توافق على هذه الشروط وعلى سياسة الخصوصية.

## ما هو tabkheen A
تطبيق يربط الجيران في مصر. الطهاة المنزليون يشاركون ما يطبخونه، والجيران يحجزون طبقاً ويستلمونه بأنفسهم. الاستلام فقط: لا يوجد توصيل. tabkheen A منصة، ولا يطبخ ولا يبيع ولا يسلّم الطعام.

## حسابك
- يجب أن يكون عمرك ١٦ سنة على الأقل.
- استخدم حسابك الخاص وحافظ على تسجيل دخولك. شخص واحد، حساب واحد.
- قدّم معلومات صحيحة عن نفسك.

## الطهاة
- أنت مسؤول عن الطعام الذي تطبخه: مكوّناته ونظافته وحفظه بشكل آمن ووصفه، بما في ذلك مسببات الحساسية.
- قدّم فقط طعاماً أعددته بنفسك، وكميات تستطيع إعدادها فعلاً.
- وضّح مكان الاستلام وموعده.

## المشترون
- احجز فقط ما تنوي استلامه، واستلمه في الموعد.
- ادفع للطاهي مباشرة بإنستاباي أو كما اتفقتما عند الاستلام. tabkheen A لا يأخذ المدفوعات وليس طرفاً في البيع.
- تأكد من الطعام ووصفه قبل أن تأكله، خاصة إن كان لديك حساسية.

## المحتوى والسلوك
يُمنع نشر أو إرسال أي شيء غير قانوني أو يحض على الكراهية أو التحرش أو جنسي أو عنيف أو مضلل أو ينتهك حقوق الآخرين، ويُمنع انتحال شخصية الغير أو الإزعاج أو محاولة التلاعب بالإعجابات أو التقييمات أو الترتيب أو المسابقات. لا تسامح مع المحتوى المسيء أو الأعضاء المسيئين.
يمكنك حظر أي عضو والإبلاغ عن أي عضو أو منشور من التطبيق. نراجع البلاغات عادة خلال ٢٤ ساعة، وقد نحذف المحتوى أو نوقف الحسابات المخالفة أو نحظرها.

## محتواك
تحتفظ بملكية ما تنشره. وتمنح tabkheen A الإذن بعرضه داخل التطبيق وفي مواد الترويج للتطبيق من أجل تشغيل الخدمة والترويج لها.

## المسابقات والجوائز
لكل مسابقة قواعدها الخاصة التي ننشرها قبل بدايتها. قد نستبعد المشاركات التي فيها تلاعب.

## توفر الخدمة
نحاول إبقاء التطبيق يعمل، لكن قد نغيّر الخدمات أو نوقفها مؤقتاً أو نلغيها. لسنا مسؤولين عن الخسائر الناتجة عن أمور خارج سيطرتنا.

## المسؤولية
بالقدر الذي يسمح به القانون، لا يتحمل tabkheen A مسؤولية الطعام أو تصرفات الأعضاء أو الخلافات بينهم. لا شيء هنا ينتقص من حقوقك بموجب القانون المصري.

## إنهاء حسابك
يمكنك حذف حسابك في أي وقت من التطبيق. وقد نوقف أو ننهي الحسابات التي تخالف هذه الشروط.

## التغييرات والقانون
قد نحدّث هذه الشروط ونخبرك داخل التطبيق بالتغييرات المهمة. تخضع هذه الشروط للقانون المصري.

## التواصل
help@tabkheen-a.com$ar$);
