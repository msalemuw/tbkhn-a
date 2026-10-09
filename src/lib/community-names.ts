// Keeps community data clean: the same key the database uses to refuse duplicates, plus "did you mean" matching.

/** Case, spaces, punctuation and Arabic letter variants removed (mirrors communities.name_key in 0006). */
export function nameKey(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]/gu, '')
    .replace(/[أإآ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/ى/g, 'ي');
}

function distance(a: string, b: string): number {
  const row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let prev = row[0];
    row[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = row[j];
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = tmp;
    }
  }
  return row[b.length];
}

/** Existing communities that look like what was typed: same, one inside the other, or a typo or two away. */
export function similarNames<T extends { name: string }>(typed: string, existing: T[]): { exact: T | null; close: T[] } {
  const key = nameKey(typed);
  if (key.length < 2) return { exact: null, close: [] };
  let exact: T | null = null;
  const close: T[] = [];
  for (const c of existing) {
    const k = nameKey(c.name);
    if (k === key) exact = c;
    else if ((key.length >= 3 && (k.includes(key) || key.includes(k))) || distance(k, key) <= (key.length >= 8 ? 2 : 1)) close.push(c);
  }
  return { exact, close: close.slice(0, 3) };
}
