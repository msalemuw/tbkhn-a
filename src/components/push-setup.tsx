import { useEffect } from 'react';

import { registerForPush } from '@/lib/push';
import { useSession } from '@/lib/session';

/** Registers this phone for alerts once someone is signed in. */
export function PushSetup() {
  const { session, profile } = useSession();
  // Wait until the sign-up form is finished: a system permission dialog on top of it closes the keyboard on Android.
  const me = session && profile?.username ? session.user.id : null;
  useEffect(() => {
    if (me) registerForPush();
  }, [me]);
  return null;
}
