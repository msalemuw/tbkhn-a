import { useEffect } from 'react';
import { AppState } from 'react-native';

import { reportMyPosition } from '@/lib/location';
import { useSession } from '@/lib/session';

/**
 * Keeps the member's last known position fresh for the live distance on other members' feeds: when the app opens and
 * every time it comes back to the front, not only when Home is on screen. Renders nothing.
 */
export function PositionReporter() {
  const { session } = useSession();
  const signedIn = !!session;

  useEffect(() => {
    if (!signedIn) return;
    reportMyPosition().catch(() => {});
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') reportMyPosition().catch(() => {});
    });
    return () => sub.remove();
  }, [signedIn]);

  return null;
}
