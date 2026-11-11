import { requireOptionalNativeModule } from 'expo';
import * as ImagePicker from 'expo-image-picker';
import { router } from 'expo-router';
import { Platform } from 'react-native';

// Where a photo is going decides the final look: stories are full screen (9:16), posts and menu dishes are square.
export type PhotoKind = 'story' | 'post' | 'menu';
export type PickedPhoto = { uri: string; mimeType: string };
export type PhotoStart = 'auto' | 'camera' | 'gallery';

export const FRAME_ASPECT: Record<PhotoKind, number> = { story: 9 / 16, post: 1, menu: 1 };

// The new camera and photo grid need native code. Phones on an older store build do not have it yet and keep the
// phone's own picker until they update. Check the native side first: a failed require() cannot be caught.
export function addPhotoScreenReady(): boolean {
  if (Platform.OS === 'web') return false;
  const camera = !!requireOptionalNativeModule('ExpoCamera');
  const crop = !!requireOptionalNativeModule('ExpoImageManipulator');
  const library = Platform.OS === 'ios' ? !!requireOptionalNativeModule('ExpoMediaLibraryNext') : true;
  return camera && crop && library;
}

// The phone's own picker or camera (the way every phone worked before the new screen).
export async function systemPick(kind: PhotoKind, camera: boolean): Promise<PickedPhoto | null> {
  const opts: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], quality: 0.7, allowsEditing: true, aspect: kind === 'story' ? [9, 16] : [1, 1] };
  if (camera) {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) return null;
  }
  const res = camera ? await ImagePicker.launchCameraAsync(opts) : await ImagePicker.launchImageLibraryAsync(opts);
  const asset = !res.canceled ? res.assets[0] : null;
  return asset ? { uri: asset.uri, mimeType: asset.mimeType ?? 'image/jpeg' } : null;
}

let waiting: ((photo: PickedPhoto | null) => void) | null = null;

// Opens the add-photo screen (grid with a camera tile on iPhone, full-screen camera on Android) and resolves with the photo, or null if they close it.
export function choosePhoto(kind: PhotoKind, start: PhotoStart = 'auto'): Promise<PickedPhoto | null> {
  if (!addPhotoScreenReady()) return systemPick(kind, start === 'camera');
  // Android keeps the system photo picker for the gallery: it needs no broad photo permission.
  if (Platform.OS === 'android' && start === 'gallery') return systemPick(kind, false);
  const mode = start === 'camera' ? 'camera' : start === 'gallery' ? 'grid' : Platform.OS === 'ios' ? 'grid' : 'camera';
  return new Promise((resolve) => {
    waiting?.(null);
    waiting = resolve;
    router.push({ pathname: '/add-photo', params: { kind, mode } });
  });
}

// Called by the add-photo screen: a photo, or null when it closes without one.
export function finishPhoto(photo: PickedPhoto | null) {
  const done = waiting;
  waiting = null;
  done?.(photo);
}
