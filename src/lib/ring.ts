import { requireOptionalNativeModule } from 'expo';
import { useSyncExternalStore } from 'react';

// The long ring for a new request while the app is open. It is played by the app itself, so it sounds even when the phone's
// side switch is on silent. (When the app is closed only the phone's own alert sound can play, and silent mutes that.)
// The sound module exists only in builds made after it was added, so it is loaded defensively: older installs skip the ring.
type Audio = typeof import('expo-audio');
type Player = import('expo-audio').AudioPlayer;

const RING_SECONDS = 60;
let player: Player | null = null;
let timer: ReturnType<typeof setTimeout> | null = null;
let ringing = false;
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((l) => l());
}

function audio(): Audio | null {
  // A failed require() reports a fatal error even inside try/catch, so the native part is checked first.
  if (!requireOptionalNativeModule('ExpoAudio')) return null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require('expo-audio') as Audio;
  } catch {
    return null;
  }
}

/** True when this build can ring by itself (the phone's alert sound is then left off while the app is open). */
export function canRing(): boolean {
  return !!requireOptionalNativeModule('ExpoAudio');
}

/** Rings in a loop until stopRing(), the request is answered, or a minute has passed (the server repeats the alert after that). */
export function startRing() {
  if (ringing) return;
  const A = audio();
  if (!A) return;
  try {
    A.setAudioModeAsync({ playsInSilentMode: true, interruptionMode: 'mixWithOthers', shouldPlayInBackground: false }).catch(() => {});
    player = A.createAudioPlayer(require('../../assets/sounds/new-order.wav'));
    player.loop = true;
    player.volume = 1;
    player.play();
    ringing = true;
    timer = setTimeout(stopRing, RING_SECONDS * 1000);
    emit();
  } catch {
    stopRing();
  }
}

export function stopRing() {
  if (timer) clearTimeout(timer);
  timer = null;
  try {
    player?.pause();
    player?.remove();
  } catch {
    // The ring is a bonus; never block the app.
  }
  player = null;
  if (ringing) {
    ringing = false;
    emit();
  }
}

export function useRinging(): boolean {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => {
        listeners.delete(l);
      };
    },
    () => ringing,
  );
}
