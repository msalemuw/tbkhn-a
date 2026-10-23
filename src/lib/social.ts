// Instagram, Facebook and TikTok links on a profile. Members type a handle or paste a link; we store a clean https link.

export type SocialKind = 'instagram' | 'facebook' | 'tiktok';

export const SOCIALS: { kind: SocialKind; label: string; host: string; column: 'instagram_url' | 'facebook_url' | 'tiktok_url'; base: string }[] = [
  { kind: 'instagram', label: 'Instagram', host: 'instagram.com', column: 'instagram_url', base: 'https://instagram.com/' },
  { kind: 'facebook', label: 'Facebook', host: 'facebook.com', column: 'facebook_url', base: 'https://facebook.com/' },
  { kind: 'tiktok', label: 'TikTok', host: 'tiktok.com', column: 'tiktok_url', base: 'https://tiktok.com/@' },
];

/** Empty input gives null (nothing to save); an unusable link gives undefined so the form can say so. */
export function normalizeSocial(kind: SocialKind, input: string): string | null | undefined {
  const s = SOCIALS.find((x) => x.kind === kind)!;
  const v = input.trim();
  if (!v) return null;
  if (/^https?:\/\//i.test(v) || v.toLowerCase().includes(s.host)) {
    const url = /^https?:\/\//i.test(v) ? v : `https://${v}`;
    const host = url.replace(/^https?:\/\//i, '').split(/[/?#]/)[0].toLowerCase();
    if (host !== s.host && !host.endsWith(`.${s.host}`)) return undefined;
    return url.length <= 200 ? url : undefined;
  }
  const handle = v.replace(/^@/, '');
  return /^[A-Za-z0-9._-]{1,60}$/.test(handle) ? `${s.base}${handle}` : undefined;
}
