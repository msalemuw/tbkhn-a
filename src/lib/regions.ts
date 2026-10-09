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
