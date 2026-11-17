import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Location from 'expo-location';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AppState } from 'react-native';

import { distanceMeters, type LatLng } from '@/lib/format';
import { useSession } from '@/lib/session';
import { supabase } from '@/lib/supabase';

/**
 * Where the member is looking from: GPS, or a spot they picked on the map. Every distance is computed from it.
 * `manual` is set when they placed the pin somewhere other than where they are; without it the place follows the GPS.
 * A hand-picked spot is temporary: it lasts for the rest of the visit (up to PIN_HOURS) and never survives closing the app,
 * so the app always starts from the live location.
 */
export type Place = LatLng & { label: string; manual?: boolean; manualAt?: number };

const PIN_HOURS = 3;
/** True while a hand-picked spot is still being honoured. */
function pinned(p: Place | null | undefined): boolean {
  return !!p?.manual && Date.now() - (p.manualAt ?? 0) < PIN_HOURS * 3_600_000;
}

const KEY = 'tabkheen.place';

type Ctx = {
  place: Place | null;
  ready: boolean;
  setPlace: (p: Place) => void;
};

/** A moved phone shorter than this is GPS noise, not a new place. */
const FOLLOW_METERS = 300;

const PlaceContext = createContext<Ctx>({ place: null, ready: false, setPlace: () => {} });

/** Current GPS position, asking for permission once. Null when denied or unavailable. `prompt: false` only uses a permission already given, so background callers never open a system dialog. */
export async function getMyLocation({ prompt = true }: { prompt?: boolean } = {}): Promise<LatLng | null> {
  try {
    const { granted } = prompt ? await Location.requestForegroundPermissionsAsync() : await Location.getForegroundPermissionsAsync();
    if (!granted) return null;
    const last = await Location.getLastKnownPositionAsync({ maxAge: 5 * 60_000 });
    const pos = last ?? (await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }));
    return { lat: pos.coords.latitude, lng: pos.coords.longitude };
  } catch {
    return null;
  }
}

let lastReport = 0;

/**
 * The member's current GPS position, also saved as their last known position (at most every 2 minutes) so other
 * members' feeds can show a live distance. Null when permission is denied or the position is unavailable.
 */
export async function reportMyPosition(opts: { prompt?: boolean } = {}): Promise<LatLng | null> {
  const pos = await getMyLocation(opts);
  if (pos && Date.now() - lastReport > 120_000) {
    const { data } = await supabase.auth.getSession();
    const id = data.session?.user.id;
    if (id) {
      lastReport = Date.now();
      // report_position stamps "when" on every call, so a phone that has not moved still counts as live.
      const { error } = await supabase.rpc('report_position', { p_lat: pos.lat, p_lng: pos.lng });
      if (error) {
        // Older database without report_position: plain update (stamps only when the point changed).
        const { error: e2 } = await supabase.from('profiles').update({ last_lat: pos.lat, last_lng: pos.lng }).eq('id', id);
        if (e2) lastReport = 0;
      }
    }
  }
  return pos;
}

/** A short place name for a point ("Sheikh Zayed"), or null when the geocoder has none. */
export async function placeName(at: LatLng): Promise<string | null> {
  try {
    const [r] = await Location.reverseGeocodeAsync({ latitude: at.lat, longitude: at.lng });
    if (!r) return null;
    return r.district || r.subregion || r.city || r.street || r.name || null;
  } catch {
    return null;
  }
}

/** The area name (bold line) and "street, city" (second line) for a point; both empty when the geocoder has nothing. `country` is the ISO code ("EG"). */
export async function placeDetails(at: LatLng): Promise<{ area: string; line2: string; country: string }> {
  try {
    const [r] = await Location.reverseGeocodeAsync({ latitude: at.lat, longitude: at.lng });
    if (!r) return { area: '', line2: '', country: '' };
    const area = r.district || r.subregion || r.city || r.street || r.name || '';
    const line2 = [r.street && r.street !== area ? r.street : null, r.city && r.city !== area ? r.city : r.region && r.region !== area ? r.region : null].filter(Boolean).join(', ');
    return { area, line2, country: r.isoCountryCode ?? '' };
  } catch {
    return { area: '', line2: '', country: '' };
  }
}

export type PlaceHit = { name: string; line2: string; id?: string; lat?: number; lng?: number };

/** A random id that groups one typing-and-picking run, so the places service bills it as one session. */
export function newSearchSession(): string {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 12)}${Math.random().toString(36).slice(2, 12)}`;
}

/**
 * Places matching what the member typed ("Zamalek", "Lebanon Square"), Egypt only, closest to `near` first.
 * Uses Google Places through the `places` function; if that is not reachable, falls back to the phone's own lookup.
 */
export async function searchPlaces(text: string, near: LatLng | null, session: string): Promise<PlaceHit[]> {
  try {
    const { data, error } = await supabase.functions.invoke('places', { body: { action: 'search', q: text, lat: near?.lat, lng: near?.lng, session } });
    if (!error && Array.isArray(data?.hits)) return data.hits as PlaceHit[];
  } catch {
    // fall through to the phone's lookup
  }
  return searchPlacesOnPhone(text);
}

/** The point of a chosen suggestion (suggestions from the places service only carry an id until picked). */
export async function resolvePlace(hit: PlaceHit, session: string): Promise<LatLng | null> {
  if (hit.lat != null && hit.lng != null) return { lat: hit.lat, lng: hit.lng };
  if (!hit.id) return null;
  try {
    const { data, error } = await supabase.functions.invoke('places', { body: { action: 'pick', id: hit.id, session } });
    if (!error && Number.isFinite(data?.lat) && Number.isFinite(data?.lng)) return { lat: data.lat, lng: data.lng };
  } catch {
    // no point
  }
  return null;
}

/** The phone's own lookup: few suggestions, but needs no service. Egypt only: tabkheen A is pickup in Egypt. */
async function searchPlacesOnPhone(text: string): Promise<PlaceHit[]> {
  try {
    const found = await Location.geocodeAsync(`${text}, Egypt`);
    const named = await Promise.all(
      found.slice(0, 8).map(async (f) => {
        const d = await placeDetails({ lat: f.latitude, lng: f.longitude });
        return { lat: f.latitude, lng: f.longitude, name: d.area || text, line2: d.line2, country: d.country };
      }),
    );
    return named.filter((h) => h.country === 'EG').slice(0, 5);
  } catch {
    return [];
  }
}

export function LocationProvider({ children }: { children: React.ReactNode }) {
  const [place, setPlaceState] = useState<Place | null>(null);
  const [ready, setReady] = useState(false);
  // Read by the GPS follower, which outlives renders.
  const placeRef = useRef<Place | null>(null);
  // The system permission dialog is asked once per launch, and only once sign-up is finished: on Android a dialog
  // over the sign-up form closes the keyboard, and asking again every time the app comes back loops the dialog.
  const { profile } = useSession();
  const signedUp = !!profile?.username;
  const mayAsk = useRef(false);
  const asked = useRef(false);

  const apply = useCallback((p: Place) => {
    if (p.manual && !p.manualAt) p = { ...p, manualAt: Date.now() };
    placeRef.current = p;
    setPlaceState(p);
    AsyncStorage.setItem(KEY, JSON.stringify(p)).catch(() => {});
  }, []);

  /** Moves the place to where the phone is now, unless the member pinned a spot by hand a short while ago. */
  const followGps = useCallback(async () => {
    if (pinned(placeRef.current)) return;
    const prompt = mayAsk.current && !asked.current;
    if (prompt) asked.current = true;
    const gps = await getMyLocation({ prompt });
    const cur = placeRef.current;
    if (!gps || pinned(cur)) return;
    // An expired pin always gives way to the GPS, however near it is.
    if (cur && !cur.manual && distanceMeters(cur, gps) < FOLLOW_METERS) return;
    const label = (await placeName(gps)) ?? (cur?.manual ? '' : cur?.label) ?? '';
    if (!pinned(placeRef.current)) apply({ ...gps, label });
  }, [apply]);

  // Start from the saved place; with none saved, from the phone's GPS. Then keep following the phone.
  useEffect(() => {
    let live = true;
    (async () => {
      try {
        const saved = await AsyncStorage.getItem(KEY);
        const last = saved ? (JSON.parse(saved) as Place) : null;
        // The last live place is shown until the GPS answers; a hand-picked spot from an earlier visit is dropped.
        if (last && !last.manual && live) {
          placeRef.current = last;
          setPlaceState(last);
        }
      } catch {}
      if (live) setReady(true);
      await followGps();
    })().catch(() => {});
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') followGps().catch(() => {});
    });
    return () => {
      live = false;
      sub.remove();
    };
  }, [followGps]);

  // Sign-up just finished: now it is fine to ask.
  useEffect(() => {
    mayAsk.current = signedUp;
    if (signedUp) followGps().catch(() => {});
  }, [signedUp, followGps]);

  const setPlace = useCallback((p: Place) => {
    apply(p);
    // The member's last known position, for the server (see docs/DYNAMIC-DATA.md); best effort.
    supabase.auth.getSession().then(({ data }) => {
      const id = data.session?.user.id;
      if (id) supabase.from('profiles').update({ last_lat: p.lat, last_lng: p.lng }).eq('id', id).then(() => {}, () => {});
    });
  }, [apply]);

  const value = useMemo(() => ({ place, ready, setPlace }), [place, ready, setPlace]);
  return <PlaceContext.Provider value={value}>{children}</PlaceContext.Provider>;
}

export function usePlace(): Ctx {
  return useContext(PlaceContext);
}

/** For distance labels: the screens render without distances until (or unless) a position is known. */
export function useMyLocation(): LatLng | null {
  const { place } = usePlace();
  return place ? { lat: place.lat, lng: place.lng } : null;
}
