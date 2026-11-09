// A starting username from the member's name: first.last, never from the email (which would show part of it on the
// public profile). Arabic names are written in Latin letters (Egyptian sounds, no vowels guessed) so those members get a
// suggestion too; they can change it. The website has the same rules (website/index.html, nameToUsername).
const AR: Record<string, string> = {
  'ا': 'a', 'أ': 'a', 'إ': 'e', 'آ': 'a', 'ب': 'b', 'ت': 't', 'ث': 'th', 'ج': 'g', 'ح': 'h', 'خ': 'kh', 'د': 'd', 'ذ': 'z',
  'ر': 'r', 'ز': 'z', 'س': 's', 'ش': 'sh', 'ص': 's', 'ض': 'd', 'ط': 't', 'ظ': 'z', 'ع': 'a', 'غ': 'gh', 'ف': 'f', 'ق': 'q',
  'ك': 'k', 'ل': 'l', 'م': 'm', 'ن': 'n', 'ه': 'h', 'و': 'w', 'ي': 'y', 'ى': 'a', 'ة': 'a', 'ئ': 'e', 'ؤ': 'o',
};

export function nameToUsername(full: string): string {
  const words = full
    .normalize('NFKD')
    .replace(/[̀-ًͯ-ٟ]/g, '')
    .replace(/[؀-ۿ]/g, (c) => AR[c] ?? '')
    .toLowerCase()
    .split(/\s+/)
    .map((w) => w.replace(/[^a-z0-9]/g, ''))
    .filter(Boolean);
  if (!words.length) return '';
  const u = (words.length > 1 ? `${words[0]}.${words[words.length - 1]}` : words[0]).slice(0, 20);
  return u.length >= 3 ? u : '';
}
