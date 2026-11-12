import { Share } from 'react-native';

import { tr } from '@/lib/i18n';

// What gets shared: a few words and a link. The link opens the tabkheen A page on the website, which opens the app
// if it is installed (or shows the sign-up if not). Sent as one message so WhatsApp and every other app gets a real link.
const SITE = 'https://tabkheen-a.com';

export type ShareKind = 'post' | 'cook' | 'community';

// A post opens inside its author's posts, so a post link carries the author too (`by`).
export function shareLink(kind: ShareKind, id: string, text: string, by?: string) {
  const message = `${tr(text)}\n${SITE}/${kind}/${id}${by ? `?by=${by}` : ''}`;
  return Share.share({ message }).catch(() => null);
}
