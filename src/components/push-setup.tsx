import { useEffect } from 'react';

import { registerForPush } from '@/lib/push';
import { useSession } from '@/lib/session';

/** Registers this phone for alerts once someone is signed in. */
export function PushSetup() {
  const { session } = useSession();
  const me = session?.user.id ?? null;
  useEffect(() => {
    if (me) registerForPush();
  }, [me]);
  return null;
}
