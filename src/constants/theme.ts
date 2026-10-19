import { isRTL } from '@/lib/i18n';

// The TBKHN A palette (founder, 2026-10-04): only these five colors, plus see-through tints of navy and white.
// Text is navy (or white on navy). Teal and yellow are fills, icons and highlights, never small text on white.
const navy = '#28303a';
const yellow = '#ffc107';
const white = '#ffffff';
const lightBlue = '#cae7f1';
const teal = '#00c2a8';

export const colors = {
  navy,
  yellow,
  white,
  lightBlue,
  teal,
  // Roles, all taken from the palette above.
  paper: white,
  cream: lightBlue,
  ink: navy,
  muted: 'rgba(40,48,58,0.68)',
  faint: 'rgba(40,48,58,0.4)',
  line: lightBlue,
  tealSoft: lightBlue,
} as const;

// The newer Home and Menu design (founder, 2026-10-19): warm page, white cards, deep teal. Used by those two tabs and the tab bar.
export const ui = {
  page: '#f6f2ec',
  card: '#ffffff',
  deep: '#01313e',
  deepTeal: '#016c71',
  mint: '#e1f7ed',
  bubble: '#05aaa5',
  border: 'rgba(1,49,62,0.08)',
} as const;

// Hanken Grotesk and Instrument Serif have no Arabic letters, so Arabic uses IBM Plex Sans Arabic for every weight.
const latinFonts = {
  regular: 'HankenGrotesk_400Regular',
  medium: 'HankenGrotesk_500Medium',
  semiBold: 'HankenGrotesk_600SemiBold',
  bold: 'HankenGrotesk_700Bold',
  extraBold: 'HankenGrotesk_800ExtraBold',
  serif: 'InstrumentSerif_400Regular',
  serifItalic: 'InstrumentSerif_400Regular_Italic',
};
const arabicFonts: typeof latinFonts = {
  regular: 'IBMPlexSansArabic_400Regular',
  medium: 'IBMPlexSansArabic_500Medium',
  semiBold: 'IBMPlexSansArabic_600SemiBold',
  bold: 'IBMPlexSansArabic_700Bold',
  extraBold: 'IBMPlexSansArabic_700Bold',
  serif: 'IBMPlexSansArabic_700Bold',
  serifItalic: 'IBMPlexSansArabic_700Bold',
};
export const fonts = isRTL ? arabicFonts : latinFonts;
