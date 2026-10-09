import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Location from 'expo-location';
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

import type { LatLng } from '@/lib/format';
import { supabase } from '@/lib/supabase';

/** Where the member is looking from: GPS, or a spot they picked on the map. Every distance is computed from it. */
export type Place = LatLng & { label: string };

const KEY = 'tabkheen.place';

type Ctx = {
  place: Place | null;
  ready: boolean;
  setPlace: (p: Place) => void;
};

const PlaceContext = createContext<Ctx>({ place: null, ready: false, setPlace: () => {} });

/** Current GPS position, asking for permission once. Null when denied or unavailable. */
export async function getMyLocation(): Promise<LatLng | null> {
  try {
    const { granted } = await Location.requestForegroundPermissionsAsync();
    if (!granted) return null;
    const last = await Location.getLastKnownPositionAsync({ maxAge: 5 * 60_000 });
    const pos = last ?? (await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }));
    return { lat: pos.coords.latitude, lng: pos.coords.longitude };
  } catch {
    return null;
  }
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

export function LocationProvider({ children }: { children: React.ReactNode }) {
  const [place, setPlaceState] = useState<Place | null>(null);
  const [ready, setReady] = useState(false);

  // Start from the saved place; with none saved, from the phone's GPS.
  useEffect(() => {
    let live = true;
    (async () => {
      try {
        const saved = await AsyncStorage.getItem(KEY);
        if (saved && live) return setPlaceState(JSON.parse(saved) as Place);
      } catch {}
      const gps = await getMyLocation();
      if (gps && live) setPlaceState({ ...gps, label: (await placeName(gps)) ?? '' });
    })().finally(() => live && setReady(true));
    return () => {
      live = false;
    };
  }, []);

  const setPlace = useCallback((p: Place) => {
    setPlaceState(p);
    AsyncStorage.setItem(KEY, JSON.stringify(p)).catch(() => {});
    // The member's last known position, for the server (see docs/DYNAMIC-DATA.md); best effort.
    supabase.auth.getSession().then(({ data }) => {
      const id = data.session?.user.id;
      if (id) supabase.from('profiles').update({ last_lat: p.lat, last_lng: p.lng }).eq('id', id).then(() => {}, () => {});
    });
  }, []);

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
