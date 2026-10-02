// Egyptian mobile numbers as the design asks for them: 10 digits starting with 1 (no leading 0), shown after +20.

/** Keeps digits only, drops a leading 0 or 20 country code, and caps at 10 digits. */
export function cleanPhoneInput(raw: string): string {
  let d = raw.replace(/\D/g, '');
  if (d.startsWith('20') && d.length > 10) d = d.slice(2);
  if (d.startsWith('0')) d = d.slice(1);
  return d.slice(0, 10);
}

/** Vodafone 10, Etisalat 11, Orange 12, WE 15. */
export function isValidPhone(digits: string): boolean {
  return /^1[0125]\d{8}$/.test(digits);
}

/** The stored, unique form: +20 followed by the 10 digits. */
export function toE164(digits: string): string {
  return `+20${digits}`;
}

/** "+20 100 234 5678" */
export function formatPhone(digits: string): string {
  return `+20 ${digits.slice(0, 3)} ${digits.slice(3, 6)} ${digits.slice(6)}`.trim();
}
