import { useEffect, useState } from 'react';

import { type Badge, fetchBadges } from '@/lib/rankings';

/** Rank badges for a set of cooks (for dish cards). Badges are a nicety: a failed load just shows none. */
export function useBadges(cookIds: string[]): Map<string, Badge[]> {
  const [badges, setBadges] = useState<Map<string, Badge[]>>(new Map());
  const key = [...new Set(cookIds)].sort().join(',');
  useEffect(() => {
    if (!key) return;
    fetchBadges(key.split(',')).then(setBadges, () => {});
  }, [key]);
  return badges;
}
