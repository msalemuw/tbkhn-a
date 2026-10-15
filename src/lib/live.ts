import { useFocusEffect } from 'expo-router';
import { useCallback, useSyncExternalStore } from 'react';

// Every screen that shows a count (followers, likes, plates left, members, reviews...) reloads when something changed anywhere
// in the app, and whenever it comes back into view. Actions call dataChanged() once they have succeeded.
let version = 0;
const listeners = new Set<() => void>();

export function dataChanged() {
  version += 1;
  listeners.forEach((l) => l());
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}

export function useDataVersion() {
  return useSyncExternalStore(subscribe, () => version);
}

/** Runs `load` when the screen is shown, each time it regains focus, and each time data changes elsewhere in the app. */
export function useLive(load: () => void) {
  const v = useDataVersion();
  useFocusEffect(
    useCallback(() => {
      load();
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [load, v]),
  );
}
