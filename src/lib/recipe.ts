/** An optional recipe on a post (0074_post_recipe.sql). Stored as JSON on the post; empty lines are dropped. */
export type Recipe = { servings: string; minutes: string; ingredients: string[]; steps: string[] };

export const emptyRecipe = (): Recipe => ({ servings: '', minutes: '', ingredients: [''], steps: [''] });

/** Trim everything; a recipe with no ingredients and no steps is no recipe (null). */
export function cleanRecipe(r: Recipe | null | undefined): Recipe | null {
  if (!r) return null;
  const ingredients = r.ingredients.map((s) => s.trim()).filter(Boolean);
  const steps = r.steps.map((s) => s.trim()).filter(Boolean);
  if (!ingredients.length && !steps.length) return null;
  return { servings: r.servings.trim(), minutes: r.minutes.trim(), ingredients, steps };
}

/** Reads what the database returned; anything unexpected is no recipe. */
export function parseRecipe(v: unknown): Recipe | null {
  if (!v || typeof v !== 'object') return null;
  const o = v as Record<string, unknown>;
  const list = (x: unknown) => (Array.isArray(x) ? x.filter((s): s is string => typeof s === 'string') : []);
  return cleanRecipe({ servings: typeof o.servings === 'string' ? o.servings : '', minutes: typeof o.minutes === 'string' ? o.minutes : '', ingredients: list(o.ingredients), steps: list(o.steps) });
}

// The recipe being written, handed between the post screen and the recipe screen.
let draft: Recipe | null = null;
export const peekRecipeDraft = () => draft;
export const setRecipeDraft = (r: Recipe | null) => {
  draft = r;
};
