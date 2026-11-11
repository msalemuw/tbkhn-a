import { requireOptionalNativeModule } from 'expo';
import { Platform } from 'react-native';

// Copying needs a little native code. A phone on an older build does not have it yet: check first, because a failed
// require() cannot be caught. On those phones the Copy button is simply not shown (the text can still be selected).
export function canCopy(): boolean {
  return Platform.OS === 'web' || !!requireOptionalNativeModule('ExpoClipboard');
}

/** Puts `text` on the phone's clipboard. Resolves false when it could not. */
export async function copyText(text: string): Promise<boolean> {
  try {
    if (Platform.OS === 'web') {
      await navigator.clipboard.writeText(text);
      return true;
    }
    if (!canCopy()) return false;
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    await require('expo-clipboard').setStringAsync(text);
    return true;
  } catch {
    return false;
  }
}
