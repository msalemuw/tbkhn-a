import { requireOptionalNativeModule } from 'expo';
import * as ImagePicker from 'expo-image-picker';
import { type Href, router } from 'expo-router';
import { Platform } from 'react-native';

// Where a photo is going decides the final look: stories are full screen (9:16), menu dishes are 4:3 landscape. A post keeps the whole photo (full screen
// when opened); the person only chooses which square part shows in the feed.
export type PhotoKind = 'story' | 'post' | 'menu';
/** `more` holds the rest of a multi-photo pick (signature posts only), in the order they were chosen. */
export type PickedPhoto = {
  uri: string;
  mimeType: string;
  more?: PickedPhoto[];
  /** Width / height of the whole photo (signature posts keep the full photo; the first photo's shape is the post's shape). */
  aspect?: number;
  /** Which part of the photo the square feed frame shows: 0..1 across and down (0.5 = centre). Signature posts only. */
  focus?: { x: number; y: number };
};

/** Photos in one signature post: the first plus up to 9 more. */
export const MAX_POST_PHOTOS = 10;
export type PhotoStart = 'auto' | 'camera' | 'gallery';

export const FRAME_ASPECT: Record<PhotoKind, number> = { story: 9 / 16, post: 1, menu: 4 / 3 };

/** Instagram's limits for a feed photo: no taller than 4:5, no wider than 1.91:1. */
export const POST_ASPECT_MIN = 4 / 5;
export const POST_ASPECT_MAX = 1.91;
export const clampPostAspect = (ratio: number) => Math.min(POST_ASPECT_MAX, Math.max(POST_ASPECT_MIN, ratio));

// The new camera and photo grid need native code. Phones on an older store build do not have it yet and keep the
// phone's own picker until they update. Check the native side first: a failed require() cannot be caught.
export function addPhotoScreenReady(): boolean {
  if (Platform.OS === 'web') return false;
  const camera = !!requireOptionalNativeModule('ExpoCamera');
  const crop = !!requireOptionalNativeModule('ExpoImageManipulator');
  return camera && crop;
}

// The phone's own picker or camera (the way every phone worked before the new screen).
export async function systemPick(kind: PhotoKind, camera: boolean, limit = MAX_POST_PHOTOS): Promise<PickedPhoto | null> {
  // Signature posts take several photos from the gallery (no crop step in the phone's own picker, so they show centred and square).
  if (kind === 'post' && !camera) {
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.8, allowsMultipleSelection: true, orderedSelection: true, selectionLimit: Math.max(1, limit) });
    if (res.canceled || !res.assets.length) return null;
    const all = res.assets.map((a) => ({ uri: a.uri, mimeType: a.mimeType ?? 'image/jpeg' }));
    return { ...all[0], more: all.slice(1) };
  }
  const opts: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], quality: 0.7, allowsEditing: true, aspect: kind === 'story' ? [9, 16] : kind === 'menu' ? [4, 3] : [1, 1] };
  if (camera) {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) return null;
  }
  const res = camera ? await ImagePicker.launchCameraAsync(opts) : await ImagePicker.launchImageLibraryAsync(opts);
  const asset = !res.canceled ? res.assets[0] : null;
  return asset ? { uri: asset.uri, mimeType: asset.mimeType ?? 'image/jpeg' } : null;
}

let waiting: ((photo: PickedPhoto | null) => void) | null = null;

// Opens the add-photo screen (a full-screen camera with a button for the phone's photo picker) and resolves with the photo, or null if they close it.
export function choosePhoto(kind: PhotoKind, start: PhotoStart = 'auto', limit = MAX_POST_PHOTOS, aspect?: number): Promise<PickedPhoto | null> {
  if (!addPhotoScreenReady()) return systemPick(kind, start === 'camera', limit);
  const mode = start === 'gallery' ? 'gallery' : 'camera';
  return new Promise((resolve) => {
    waiting?.(null);
    waiting = resolve;
    router.push({ pathname: '/add-photo', params: { kind, mode, limit: String(limit), ...(aspect ? { aspect: String(aspect) } : {}) } });
  });
}

// Called by the add-photo screen: a photo, or null when it closes without one.
export function finishPhoto(photo: PickedPhoto | null) {
  const done = waiting;
  waiting = null;
  done?.(photo);
}

// The Post tab opens the picker first, then the compose screen opens with the chosen photo already in it
// (no half-second flash of the empty form before the picker appears).
let pending: PickedPhoto | null = null;
export function setPendingPhoto(photo: PickedPhoto | null) {
  pending = photo;
}
export function peekPendingPhoto(): PickedPhoto | null {
  return pending;
}

// One way in for every place that starts a post: picker first, then the form with the photo already in it.
export async function startCompose(kind: PhotoKind, href: Href): Promise<boolean> {
  const photo = await choosePhoto(kind, 'auto');
  if (!photo) return false;
  setPendingPhoto(photo);
  router.push(href);
  return true;
}
