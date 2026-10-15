import * as Updates from 'expo-updates';

/**
 * Applies a published update during the splash screen, so a new version shows on the same open (no "open twice").
 * Gives up after a few seconds on a slow connection; the update then downloads in the background as before.
 * Returns true when the app is reloading into the new version.
 */
export async function applyUpdateNow(timeoutMs = 5000): Promise<boolean> {
  if (__DEV__ || !Updates.isEnabled) return false;
  let gaveUp = false;
  try {
    const run = (async () => {
      const check = await Updates.checkForUpdateAsync();
      if (!check.isAvailable) return false;
      await Updates.fetchUpdateAsync();
      if (gaveUp) return false; // the app is already in use; the update applies on the next open
      await Updates.reloadAsync();
      return true;
    })();
    const timeout = new Promise<boolean>((resolve) => setTimeout(() => {
      gaveUp = true;
      resolve(false);
    }, timeoutMs));
    return await Promise.race([run, timeout]);
  } catch {
    return false;
  }
}
