// Community and area names are stored with both languages, English first: "City Club نادي سيتي".
// The app shows only the half in the language the member picked, so the screen is not crowded.
const AR = /[؀-ۿ]/;
const LAT = /[A-Za-z]/;

/**
 * The Arabic half (wantArabic) or the English half of a two-language name. Any other text comes back unchanged:
 * one language only, longer text, or more than two language blocks (so a caption or a sentence is never cut).
 */
export function halfName(text: string, wantArabic: boolean): string {
  if (!text || text.length > 90 || !AR.test(text) || !LAT.test(text)) return text;
  const blocks: { arabic: boolean; words: string[] }[] = [];
  const lead: string[] = []; // numbers and signs before the first word are kept with the first block
  for (const w of text.trim().split(/\s+/)) {
    const arabic = AR.test(w);
    if (!arabic && !LAT.test(w)) {
      if (blocks.length) blocks[blocks.length - 1].words.push(w);
      else lead.push(w);
      continue;
    }
    const last = blocks[blocks.length - 1];
    if (last && last.arabic === arabic) last.words.push(w);
    else blocks.push({ arabic, words: blocks.length ? [w] : [...lead, w] });
  }
  if (blocks.length !== 2) return text;
  const pick = blocks.find((b) => b.arabic === wantArabic);
  return pick ? pick.words.join(' ') : text;
}
