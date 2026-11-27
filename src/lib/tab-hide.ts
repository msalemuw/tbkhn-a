import { useSyncExternalStore } from 'react';

// The full-screen post pager hides the bottom bar while it is open (like Instagram's reels); the tab layout reads this.
let hidden = false;
const listeners = new Set<() => void>();
export function setTabBarHidden(v: boolean) {
  if (hidden === v) return;
  hidden = v;
  listeners.forEach((l) => l());
}
export function useTabBarHidden(): boolean {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => hidden,
    () => false,
  );
}
