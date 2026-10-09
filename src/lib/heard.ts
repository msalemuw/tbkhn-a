// "How did you hear about tabkheen A?": a category, then a detail that says exactly where.
// Categories are stored in profiles.heard_from, the detail in profiles.heard_detail (a platform from
// the lists below, or the name the member typed).

/** Stand-in value for the "Another one" row of a detail list; the member then types the name. */
export const OTHER_DETAIL = '__other';

type Pick = { kind: 'pick'; title: string; options: string[] };
type Text = { kind: 'text'; label: string; placeholder: string };
type Person = { kind: 'person' };

export const HEARD: { value: string; label: string; detail: Pick | Text | Person }[] = [
  { value: 'friend', label: 'A friend', detail: { kind: 'person' } },
  { value: 'family', label: 'Family', detail: { kind: 'person' } },
  {
    value: 'social_media',
    label: 'Social media',
    detail: { kind: 'pick', title: 'Which social media?', options: ['Instagram', 'Facebook', 'TikTok', 'WhatsApp', 'YouTube', 'X (Twitter)', 'Snapchat', 'LinkedIn', 'Telegram'] },
  },
  {
    value: 'ad',
    label: 'An ad',
    detail: { kind: 'pick', title: 'Where did you see the ad?', options: ['Instagram ad', 'Facebook ad', 'TikTok ad', 'YouTube ad', 'Snapchat ad', 'Google ad', 'Street or billboard ad'] },
  },
  {
    value: 'search',
    label: 'Searching online or in a store',
    detail: { kind: 'pick', title: 'Where did you search?', options: ['Google', 'App Store', 'Google Play'] },
  },
  { value: 'community', label: 'A community, club, school or work', detail: { kind: 'text', label: 'WHICH ONE?', placeholder: 'example: Gezira Club' } },
  { value: 'event', label: 'An event or flyer', detail: { kind: 'text', label: 'WHICH EVENT OR WHERE?', placeholder: 'example: Zamalek food fair' } },
  { value: 'media', label: 'News, a blog or a podcast', detail: { kind: 'text', label: 'WHICH ONE?', placeholder: 'example: the name of the site or show' } },
  { value: 'other', label: 'Something else', detail: { kind: 'text', label: 'TELL US MORE', placeholder: 'How did you hear about us?' } },
];

/** Plain label for a stored category, including 'social_media' answers from before details existed. */
export const HEARD_LABEL: Record<string, string> = Object.fromEntries(HEARD.map((h) => [h.value, h.label]));
