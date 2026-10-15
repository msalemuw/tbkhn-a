import { Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

/**
 * Safe-area insets for full-screen overlays (story viewer). On iPhones with a notch, full-screen modals can report 0 insets
 * for their first frames, which puts the header under the notch and the footer on the home bar. A top inset of 0 on iOS
 * is never real (even the oldest iPhone has a 20pt status bar), so fall back to notch-phone values.
 */
export function useOverlayInsets() {
  const insets = useSafeAreaInsets();
  const unknown = Platform.OS === 'ios' && insets.top === 0;
  return { top: unknown ? 47 : insets.top, bottom: unknown ? 34 : insets.bottom };
}
