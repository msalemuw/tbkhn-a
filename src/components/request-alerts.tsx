import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { router } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Linking, Pressable, StyleSheet, View } from 'react-native';

import { FlipIcon } from '@/components/flip-icon';
import { Text } from '@/components/text';
import { colors, fonts } from '@/constants/theme';
import { t } from '@/lib/i18n';
import { useLive } from '@/lib/live';
import { fetchWaitingCount } from '@/lib/orders';
import { type AlertHealth, checkAlerts, setIconBadge } from '@/lib/push';
import { startRing, stopRing, useRinging } from '@/lib/ring';
import { useSession } from '@/lib/session';

/** How many requests wait for me to accept or decline (-1 until first known). Reloads on focus and whenever anything changes in the app. */
function useWaiting(): number {
  const { session } = useSession();
  const me = session?.user.id;
  const [n, setN] = useState(-1);
  const load = useCallback(() => {
    if (!me) return setN(0);
    fetchWaitingCount(me).then(setN, () => {});
  }, [me]);
  useLive(load);
  return n;
}

/**
 * A yellow bar for a cook while any request waits for an answer. It stays until every request is accepted or declined
 * (or cancelled), so a request is never lost behind another screen. Nothing shows when nothing waits.
 */
export function WaitingRequestsBar({ flush }: { flush?: boolean }) {
  const n = useWaiting();
  const ringing = useRinging();
  if (n < 1) return null;
  const title = n === 1 ? t('1 request is waiting for you') : t('{n} requests are waiting for you', { n });
  return (
    <Pressable
      style={[styles.bar, flush && styles.flush]}
      onPress={() => {
        stopRing();
        router.push({ pathname: '/orders', params: { tab: 'cook' } });
      }}
      accessibilityRole="button"
      accessibilityLabel={title}>
      <View style={styles.icon}>
        <MaterialIcons name="notifications-active" size={22} color={colors.navy} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.title} numberOfLines={1}>{title}</Text>
        <Text style={styles.sub} numberOfLines={1}>{t('Tap to accept or decline')}</Text>
      </View>
      {ringing ? (
        <Pressable style={styles.silence} onPress={stopRing} hitSlop={8} accessibilityRole="button" accessibilityLabel={t('Silence the ring')}>
          <MaterialIcons name="volume-off" size={18} color={colors.white} />
          <Text style={styles.silenceText}>{t('Silence')}</Text>
        </Pressable>
      ) : (
        <FlipIcon name="chevron-right" size={22} color={colors.navy} />
      )}
    </Pressable>
  );
}

/**
 * Keeps the number on the app icon equal to the requests waiting for this cook, and rings (in a loop, even on silent) when a
 * new request arrives while the app is open. Draws nothing. Opening the app with old requests waiting does not ring:
 * the server already repeats the alert for those.
 */
export function WaitingBadgeSync() {
  const n = useWaiting();
  const { session } = useSession();
  const prev = useRef(-1);
  useEffect(() => {
    if (n < 0) return;
    setIconBadge(session ? n : 0);
    if (prev.current >= 0 && n > prev.current && AppState.currentState === 'active') startRing();
    if (n === 0) stopRing();
    prev.current = n;
  }, [n, session]);
  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => {
      if (s !== 'active') stopRing();
    });
    return () => sub.remove();
  }, []);
  return null;
}

/**
 * Tells a cook when their phone will not make a sound for new requests: notifications refused, or sounds turned off.
 * (The silent switch and Do Not Disturb cannot be read by an app, so the test alert in Settings is how to check them.)
 */
export function useAlertHealth(): AlertHealth {
  const [health, setHealth] = useState<AlertHealth>('ok');
  const check = useCallback(() => {
    checkAlerts().then(setHealth, () => {});
  }, []);
  useLive(check);
  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') check();
    });
    return () => sub.remove();
  }, [check]);
  return health;
}

/** True when this phone will not make a sound (or not show anything) for new alerts. The bell in the header shows a slash then. */
export function alertsMuted(h: AlertHealth): boolean {
  return h === 'off' || h === 'silent';
}

/** `calm` = light blue instead of yellow (used inside Notifications, where the bell takes you). */
export function AlertHealthNotice({ calm }: { calm?: boolean }) {
  const health = useAlertHealth();
  if (!alertsMuted(health)) return null;
  const title = health === 'off' ? t('Notifications are off on this phone') : t('Notification sounds are off on this phone');
  const sub = health === 'off' ? t('You will not be told about new requests. Tap to turn them on.') : t('New requests will not ring. Tap to turn sounds on.');
  return (
    <Pressable style={[styles.bar, calm && styles.calm]} onPress={() => Linking.openSettings()} accessibilityRole="button" accessibilityLabel={`${title}. ${sub}`}>
      <View style={styles.icon}>
        <MaterialIcons name="notifications-off" size={22} color={colors.navy} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.sub}>{sub}</Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  bar: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.yellow, borderRadius: 16, paddingVertical: 10, paddingHorizontal: 12, marginHorizontal: 16, marginVertical: 8 },
  flush: { marginHorizontal: 0 },
  calm: { backgroundColor: colors.lightBlue },
  silence: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: colors.navy, borderRadius: 999, paddingVertical: 6, paddingHorizontal: 10 },
  silenceText: { fontFamily: fonts.extraBold, fontSize: 13, color: colors.white },
  icon: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.white },
  title: { fontFamily: fonts.extraBold, fontSize: 14.5, color: colors.navy },
  sub: { fontFamily: fonts.semiBold, fontSize: 12.5, color: colors.navy },
});
