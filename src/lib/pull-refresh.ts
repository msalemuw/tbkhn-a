import { useCallback, useState } from 'react';

/**
 * Props for a RefreshControl. The spinner shows only while the member is pulling down, never for the quiet reloads that run when a
 * screen regains focus (see useLive), and it always stops: when the load ends, fails, or after 15 seconds at the latest.
 * Use this for every pull-to-refresh instead of binding `refreshing` to a screen's own loading flag.
 */
export function usePullRefresh(load: () => Promise<unknown> | void) {
  const [refreshing, setRefreshing] = useState(false);
  const onRefresh = useCallback(() => {
    setRefreshing(true);
    const timer = setTimeout(() => setRefreshing(false), 15000);
    Promise.resolve(load())
      .catch(() => {})
      .finally(() => {
        clearTimeout(timer);
        setRefreshing(false);
      });
  }, [load]);
  return { refreshing, onRefresh };
}
