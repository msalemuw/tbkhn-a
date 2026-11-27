-- An optional recipe on a post: {servings, minutes, ingredients: [text], steps: [text]}. Null = no recipe.
alter table public.posts add column if not exists recipe jsonb;
