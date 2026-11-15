import { supabase } from '@/lib/supabase';

export type Country = { code: string; name: string };
export type Region = { name: string };

/** Countries members can sign up from; edit the `countries` table to add or hide one. */
export async function fetchCountries(): Promise<Country[]> {
  const { data, error } = await supabase.from('countries').select('code, name').eq('enabled', true).order('sort').order('name');
  if (error) throw error;
  return data ?? [];
}

/** Governorates or states of a country. Empty when none are listed; members then type their own region. */
export async function fetchRegions(countryCode: string): Promise<Region[]> {
  const { data, error } = await supabase.from('regions').select('name').eq('country_code', countryCode).eq('enabled', true).order('sort').order('name');
  if (error) throw error;
  return data ?? [];
}

const TOP = ['Cairo', 'Giza', 'Alexandria'];

/** Governorates with Cairo, Giza and Alexandria first, the rest in their given order. */
export function topFirst<T extends string>(names: T[]): T[] {
  const top = TOP.filter((n) => names.includes(n as T)) as T[];
  return [...top, ...names.filter((n) => !TOP.includes(n))];
}

const PINNED_AREAS = ['Sheikh Zayed'];
const isPinned = (name: string) => PINNED_AREAS.some((p) => name === p || name.startsWith(`${p} `));

/** Areas with Sheikh Zayed first, so nobody mistakes the next entry (6th of October) for it. The rest keep their order. */
export function pinAreasFirst<T extends { name: string }>(areas: T[]): T[] {
  return [...areas.filter((a) => isPinned(a.name)), ...areas.filter((a) => !isPinned(a.name))];
}
