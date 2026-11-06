import { useEffect, useRef } from 'react';

/**
 * Tapping the tab you are already on (like Instagram): the screen scrolls to the top and reloads, and leaves its filters alone.
 * The tab bar calls emitRetap('home') and the screen for that tab listens with useRetap('home', handler).
 */
const listeners = new Map<string, Set<() => void>>();

export function emitRetap(tab: string) {
  listeners.get(tab)?.forEach((fn) => fn());
}

export function useRetap(tab: string, handler: () => void) {
  // Always call the latest handler without re-subscribing on every render.
  const latest = useRef(handler);
  useEffect(() => {
    latest.current = handler;
  });
  useEffect(() => {
    const fn = () => latest.current();
    const set = listeners.get(tab) ?? new Set<() => void>();
    set.add(fn);
    listeners.set(tab, set);
    return () => {
      set.delete(fn);
    };
  }, [tab]);
}
