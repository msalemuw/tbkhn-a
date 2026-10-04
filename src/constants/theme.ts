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

export const fonts = {
  regular: 'HankenGrotesk_400Regular',
  medium: 'HankenGrotesk_500Medium',
  semiBold: 'HankenGrotesk_600SemiBold',
  bold: 'HankenGrotesk_700Bold',
  extraBold: 'HankenGrotesk_800ExtraBold',
  serif: 'InstrumentSerif_400Regular',
  serifItalic: 'InstrumentSerif_400Regular_Italic',
} as const;
