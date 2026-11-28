import { supabase } from '@/lib/supabase';

/** An optional recipe on a post (0074_post_recipe.sql). Stored as JSON on the post; empty lines are dropped. */
export type Recipe = { servings: string; minutes: string; ingredients: string[]; /** The brand the cook uses for each ingredient (same order as `ingredients`; '' = none). Optional, so older recipes have none. */ brands: string[]; steps: string[] };

export const emptyRecipe = (): Recipe => ({ servings: '', minutes: '', ingredients: [''], brands: [''], steps: [''] });

/** Trim everything; a recipe with no ingredients and no steps is no recipe (null). */
export function cleanRecipe(r: Recipe | null | undefined): Recipe | null {
  if (!r) return null;
  // Keep each brand with its ingredient when blank lines are dropped.
  const pairs = r.ingredients.map((s, i) => [s.trim(), (r.brands[i] ?? '').trim()] as const).filter(([s]) => s);
  const ingredients = pairs.map(([s]) => s);
  const brands = pairs.map(([, b]) => b);
  const steps = r.steps.map((s) => s.trim()).filter(Boolean);
  if (!ingredients.length && !steps.length) return null;
  return { servings: r.servings.trim(), minutes: r.minutes.trim(), ingredients, brands, steps };
}

/** Reads what the database returned; anything unexpected is no recipe. */
export function parseRecipe(v: unknown): Recipe | null {
  if (!v || typeof v !== 'object') return null;
  const o = v as Record<string, unknown>;
  const list = (x: unknown) => (Array.isArray(x) ? x.filter((s): s is string => typeof s === 'string') : []);
  // Brands line up with ingredients by position, so a bad entry becomes '' instead of being dropped.
  const brands = Array.isArray(o.brands) ? o.brands.map((b) => (typeof b === 'string' ? b : '')) : [];
  return cleanRecipe({ servings: typeof o.servings === 'string' ? o.servings : '', minutes: typeof o.minutes === 'string' ? o.minutes : '', ingredients: list(o.ingredients), brands, steps: list(o.steps) });
}

let brandCache: string[] | null = null;
/** Brands other cooks already typed in recipes, most used first, so "Afia" and "afia" don't become two brands. Best effort: [] on any problem. */
export async function fetchBrandSuggestions(): Promise<string[]> {
  if (brandCache) return brandCache;
  try {
    const { data } = await supabase.from('posts').select('recipe').not('recipe', 'is', null).limit(400);
    const count = new Map<string, { name: string; n: number }>();
    for (const row of data ?? []) {
      const r = parseRecipe((row as { recipe: unknown }).recipe);
      for (const b of r?.brands ?? []) {
        if (!b) continue;
        const k = b.toLowerCase();
        const e = count.get(k);
        if (e) e.n += 1;
        else count.set(k, { name: b, n: 1 });
      }
    }
    brandCache = [...count.values()].sort((a, b) => b.n - a.n).map((e) => e.name).slice(0, 60);
  } catch {
    brandCache = [];
  }
  return brandCache;
}

/** Suggestions that start with what is typed (all of them when nothing is typed), at most five, never the exact word already typed. */
export const matchBrands = (all: string[], typed: string) => {
  const t = typed.trim().toLowerCase();
  return all.filter((b) => b.toLowerCase().startsWith(t) && b.toLowerCase() !== t).slice(0, 5);
};

// The recipe being written, handed between the post screen and the recipe screen.
let draft: Recipe | null = null;
export const peekRecipeDraft = () => draft;
export const setRecipeDraft = (r: Recipe | null) => {
  draft = r;
};
