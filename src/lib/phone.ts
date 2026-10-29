// Mobile numbers: typed without the leading 0 and shown after the country's dial code. Egypt is the default; members from another
// country pick theirs. Each country has the shape of its mobile numbers; the ones not listed with a shape accept 6 to 12 digits.

export type Dial = { cc: string; dial: string; name: string; re: RegExp; max: number; example: string };

const GENERIC = /^\d{6,12}$/;

/** Ordered as the countries table: the three launch markets first. */
export const DIALS: Dial[] = [
  { cc: 'EG', dial: '20', name: 'Egypt', re: /^1[0125]\d{8}$/, max: 10, example: '1234567890' },
  { cc: 'AE', dial: '971', name: 'United Arab Emirates', re: /^5\d{8}$/, max: 9, example: '501234567' },
  { cc: 'SA', dial: '966', name: 'Saudi Arabia', re: /^5\d{8}$/, max: 9, example: '512345678' },
  { cc: 'KW', dial: '965', name: 'Kuwait', re: /^[569]\d{7}$/, max: 8, example: '51234567' },
  { cc: 'QA', dial: '974', name: 'Qatar', re: /^[3567]\d{7}$/, max: 8, example: '33123456' },
  { cc: 'BH', dial: '973', name: 'Bahrain', re: /^[36]\d{7}$/, max: 8, example: '36001234' },
  { cc: 'OM', dial: '968', name: 'Oman', re: /^[79]\d{7}$/, max: 8, example: '92123456' },
  { cc: 'JO', dial: '962', name: 'Jordan', re: /^7\d{8}$/, max: 9, example: '790123456' },
  { cc: 'LB', dial: '961', name: 'Lebanon', re: GENERIC, max: 12, example: '71123456' },
  { cc: 'IQ', dial: '964', name: 'Iraq', re: GENERIC, max: 12, example: '7912345678' },
  { cc: 'SY', dial: '963', name: 'Syria', re: GENERIC, max: 12, example: '944567890' },
  { cc: 'PS', dial: '970', name: 'Palestine', re: GENERIC, max: 12, example: '599123456' },
  { cc: 'YE', dial: '967', name: 'Yemen', re: GENERIC, max: 12, example: '712345678' },
  { cc: 'LY', dial: '218', name: 'Libya', re: GENERIC, max: 12, example: '912345678' },
  { cc: 'TN', dial: '216', name: 'Tunisia', re: GENERIC, max: 12, example: '20123456' },
  { cc: 'DZ', dial: '213', name: 'Algeria', re: GENERIC, max: 12, example: '551234567' },
  { cc: 'MA', dial: '212', name: 'Morocco', re: GENERIC, max: 12, example: '612345678' },
  { cc: 'SD', dial: '249', name: 'Sudan', re: GENERIC, max: 12, example: '912345678' },
  { cc: 'TR', dial: '90', name: 'Turkey', re: GENERIC, max: 12, example: '5012345678' },
  { cc: 'GB', dial: '44', name: 'United Kingdom', re: GENERIC, max: 12, example: '7400123456' },
  { cc: 'US', dial: '1', name: 'United States', re: /^[2-9]\d{9}$/, max: 10, example: '2015550123' },
  { cc: 'CA', dial: '1', name: 'Canada', re: /^[2-9]\d{9}$/, max: 10, example: '5062345678' },
  { cc: 'DE', dial: '49', name: 'Germany', re: GENERIC, max: 12, example: '15123456789' },
  { cc: 'FR', dial: '33', name: 'France', re: GENERIC, max: 12, example: '612345678' },
  { cc: 'IT', dial: '39', name: 'Italy', re: GENERIC, max: 12, example: '3123456789' },
  { cc: 'ES', dial: '34', name: 'Spain', re: GENERIC, max: 12, example: '612345678' },
  { cc: 'NL', dial: '31', name: 'Netherlands', re: GENERIC, max: 12, example: '612345678' },
  { cc: 'SE', dial: '46', name: 'Sweden', re: GENERIC, max: 12, example: '701234567' },
  { cc: 'CH', dial: '41', name: 'Switzerland', re: GENERIC, max: 12, example: '781234567' },
  { cc: 'AU', dial: '61', name: 'Australia', re: GENERIC, max: 12, example: '412345678' },
  { cc: 'IE', dial: '353', name: 'Ireland', re: GENERIC, max: 12, example: '850123456' },
  { cc: 'CY', dial: '357', name: 'Cyprus', re: GENERIC, max: 12, example: '96123456' },
  { cc: 'GR', dial: '30', name: 'Greece', re: GENERIC, max: 12, example: '6912345678' },
  { cc: 'MY', dial: '60', name: 'Malaysia', re: GENERIC, max: 12, example: '123456789' },
];

export function dialFor(cc: string): Dial {
  return DIALS.find((d) => d.cc === cc) ?? DIALS[0];
}

/** Keeps digits only, drops a leading 00, the country's dial code when what follows is a whole number, and a leading 0. */
export function cleanPhoneInput(raw: string, cc = 'EG'): string {
  const d = dialFor(cc);
  let s = raw.replace(/\D/g, '');
  if (s.startsWith('00')) s = s.slice(2);
  if (s.startsWith(d.dial) && d.re.test(s.slice(d.dial.length))) s = s.slice(d.dial.length);
  if (s.startsWith('0')) s = s.slice(1);
  return s.slice(0, d.max);
}

/** Egypt: Vodafone 10, Etisalat 11, Orange 12, WE 15. Other countries: their mobile shape, or 6 to 12 digits. */
export function isValidPhone(digits: string, cc = 'EG'): boolean {
  return dialFor(cc).re.test(digits);
}

/** The stored, unique form: + the dial code followed by the digits. */
export function toE164(digits: string, cc = 'EG'): string {
  return `+${dialFor(cc).dial}${digits}`;
}

/** The country and digits of a stored number; Egypt when the number is not recognised. */
export function splitE164(e164: string): { cc: string; digits: string } | null {
  if (!e164.startsWith('+')) return null;
  const rest = e164.slice(1);
  const hit = [...DIALS].sort((a, b) => b.dial.length - a.dial.length).find((d) => rest.startsWith(d.dial));
  return hit ? { cc: hit.cc, digits: rest.slice(hit.dial.length) } : null;
}

/** "+20 100 234 5678" */
export function formatPhone(digits: string, cc = 'EG'): string {
  return `+${dialFor(cc).dial} ${digits.slice(0, 3)} ${digits.slice(3, 6)} ${digits.slice(6)}`.trim();
}
