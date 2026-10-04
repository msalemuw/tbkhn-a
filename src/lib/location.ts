import * as Location from 'expo-location';
import { useEffect, useState } from 'react';

import type { LatLng } from '@/lib/format';

/** Current position, asking for permission once. Null when denied or unavailable. */
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

/** For distance labels: the screen renders without distances until (or unless) a position arrives. */
export function useMyLocation(): LatLng | null {
  const [here, setHere] = useState<LatLng | null>(null);
  useEffect(() => {
    let live = true;
    getMyLocation().then((p) => live && setHere(p));
    return () => {
      live = false;
    };
  }, []);
  return here;
}
