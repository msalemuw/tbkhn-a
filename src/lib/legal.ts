import { supabase } from '@/lib/supabase';

export type LegalSlug = 'privacy' | 'terms';
export type LegalPage = { title_en: string; title_ar: string; body_en: string; body_ar: string; updated_at: string };

/** The Privacy policy or Terms of use. The text is edited by the owner on the admin website (Legal pages). */
export async function fetchLegalPage(slug: LegalSlug): Promise<LegalPage> {
  const { data, error } = await supabase.from('app_pages').select('title_en, title_ar, body_en, body_ar, updated_at').eq('slug', slug).single();
  if (error || !data) throw error ?? new Error('missing');
  return data as LegalPage;
}

export type Block = { kind: 'heading' | 'bullet' | 'para'; text: string };

/** Plain-text pages: "## " is a heading, "- " a bullet, anything else a paragraph. */
export function parseLegal(body: string): Block[] {
  return body
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l): Block => (l.startsWith('## ') ? { kind: 'heading', text: l.slice(3) } : l.startsWith('- ') ? { kind: 'bullet', text: l.slice(2) } : { kind: 'para', text: l }));
}
