import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { CameraView, type FlashMode, useCameraPermissions } from 'expo-camera';
import { Image } from 'expo-image';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import * as MediaLibrary from 'expo-media-library';
import { router, useLocalSearchParams } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Linking, PixelRatio, Platform, Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated, { useAnimatedStyle, useSharedValue } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Text } from '@/components/text';
import { colors, fonts } from '@/constants/theme';
import { finishPhoto, type PhotoKind, type PickedPhoto, systemPick } from '@/lib/photo-flow';

// The add-photo screen for stories, posts and menu dishes: a grid of recent photos with the camera as its first tile
// (iPhone), and a camera that fills the screen. The final look is drawn while choosing: stories fill the screen,
// posts (square) and menu dishes (4:3) show a frame of that shape inside it. Phones on an older build never reach this screen (see photo-flow).
const DIM = 'rgba(40,48,58,0.78)';
const MAX_SIDE = 1440;

type Mode = 'grid' | 'camera';
type Shot = { uri: string; width: number; height: number };

// What gets saved: stories and menu dishes are full screen (9:16) and posts are square. A menu dish also shows a 4:3 guide
// inside the full screen photo: that middle part is what the dish card in the Menu shows, and the whole photo is the story.
const FRAME_ASPECT: Record<PhotoKind, number> = { story: 9 / 16, post: 1, menu: 9 / 16 };
const MENU_CARD_ASPECT = 4 / 3;

// Turns whatever the camera or library gave us into an upright JPEG of a sensible size, and reports its real width and height.
async function normalize(uri: string, width: number, height: number): Promise<Shot> {
  const ctx = ImageManipulator.manipulate(uri);
  if (Math.max(width, height) > MAX_SIDE) ctx.resize(width >= height ? { width: MAX_SIDE } : { height: MAX_SIDE });
  const rendered = await ctx.renderAsync();
  const out = await rendered.saveAsync({ format: SaveFormat.JPEG, compress: 0.85 });
  return { uri: out.uri, width: out.width, height: out.height };
}
type Tile = { id: string; asset: MediaLibrary.Asset } | { id: 'camera' };

const TITLES: Record<PhotoKind, string> = { story: 'Add to story', post: 'Add to post', menu: 'Add to menu' };

export default function AddPhoto() {
  const params = useLocalSearchParams<{ kind?: string; mode?: string }>();
  const kind: PhotoKind = params.kind === 'story' || params.kind === 'post' ? params.kind : 'menu';
  const [mode, setMode] = useState<Mode>(params.mode === 'grid' && Platform.OS !== 'android' ? 'grid' : 'camera');
  const done = useRef(false);
  // A photo picked from the grid opens in the adjust step: move and zoom it inside the final frame, then Done.
  const [adjusting, setAdjusting] = useState<Shot | null>(null);

  // Closing the screen any other way (swipe down, back) tells the form that nothing was chosen.
  useEffect(
    () => () => {
      if (!done.current) finishPhoto(null);
    },
    [],
  );

  const finish = useCallback((photo: PickedPhoto | null) => {
    done.current = true;
    finishPhoto(photo);
    router.back();
  }, []);

  if (adjusting) {
    return (
      <>
        <StatusBar style="light" />
        <Adjust kind={kind} photo={adjusting} onBack={() => setAdjusting(null)} onDone={finish} />
      </>
    );
  }

  return (
    <>
      <StatusBar style="light" />
      {mode === 'grid' ? (
        <Grid kind={kind} onCamera={() => setMode('camera')} onPick={setAdjusting} onDone={finish} />
      ) : (
        <Camera kind={kind} onGrid={Platform.OS !== 'android' ? () => setMode('grid') : undefined} onCaptured={setAdjusting} onDone={finish} />
      )}
    </>
  );
}

// ---------- Camera ----------

function Camera({ kind, onGrid, onCaptured, onDone }: { kind: PhotoKind; onGrid?: () => void; onCaptured: (p: Shot) => void; onDone: (p: PickedPhoto | null) => void }) {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [permission, requestPermission] = useCameraPermissions();
  const camera = useRef<CameraView>(null);
  const [facing, setFacing] = useState<'back' | 'front'>('back');
  const [flash, setFlash] = useState<FlashMode>('off');
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);

  // Stories and menu dishes fill the whole screen (no frame); posts show their square in the middle.
  const full = kind !== 'post';
  const frameH = full ? height : Math.min(width, height - insets.top - insets.bottom - 200);
  const frameW = full ? width : frameH;
  const frameTop = Math.round((height - frameH) / 2);
  const frameLeft = Math.round((width - frameW) / 2);
  // A menu dish also shows the 4:3 part the Menu card will show.
  const cardH = Math.round(width / MENU_CARD_ASPECT);
  const cardTop = Math.round((height - cardH) / 2);

  async function shoot() {
    if (!camera.current || busy || !ready) return;
    setBusy(true);
    try {
      const pic = await camera.current.takePictureAsync({ quality: 0.6, exif: false });
      // The photo opens in the same Move and zoom step as a photo from the grid, so it can be adjusted before it is used.
      onCaptured(await normalize(pic.uri, pic.width, pic.height));
    } catch {
      setBusy(false);
    }
  }

  // Android: the phone's own photo picker (it asks for no broad photo access). Staying here if they close it.
  async function androidGallery() {
    const photo = await systemPick(kind, false);
    if (photo) onDone(photo);
  }

  if (!permission) return <View style={styles.screen} />;
  if (!permission.granted) {
    return (
      <View style={[styles.screen, styles.center, { paddingTop: insets.top }]}>
        <IconButton name="close" onPress={() => onDone(null)} style={{ position: 'absolute', top: insets.top + 8, left: 12 }} label="Close" />
        <MaterialIcons name="photo-camera" size={44} color={colors.teal} />
        <Text style={styles.noteTitle}>Allow the camera</Text>
        <Text style={styles.note}>So you can take a picture of your dish right here.</Text>
        <Pressable style={styles.cta} onPress={() => (permission.canAskAgain ? requestPermission() : Linking.openSettings())}>
          <Text style={styles.ctaText}>{permission.canAskAgain ? 'Allow camera' : 'Open settings'}</Text>
        </Pressable>
        {onGrid ? (
          <Pressable style={styles.link} onPress={onGrid}>
            <Text style={styles.linkText}>Choose from photos instead</Text>
          </Pressable>
        ) : (
          <Pressable style={styles.link} onPress={androidGallery}>
            <Text style={styles.linkText}>Choose from gallery instead</Text>
          </Pressable>
        )}
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <CameraView ref={camera} style={StyleSheet.absoluteFill} facing={facing} flash={flash} onCameraReady={() => setReady(true)} />
      {/* The dimmed area outside the frame, and a thin line around the frame itself. */}
      {kind === 'post' ? (
        <>
          <View pointerEvents="none" style={[styles.dim, { top: 0, left: 0, right: 0, height: frameTop }]} />
          <View pointerEvents="none" style={[styles.dim, { top: frameTop + frameH, left: 0, right: 0, bottom: 0 }]} />
          <View pointerEvents="none" style={[styles.dim, { top: frameTop, left: 0, width: frameLeft, height: frameH }]} />
          <View pointerEvents="none" style={[styles.dim, { top: frameTop, left: frameLeft + frameW, right: 0, height: frameH }]} />
          <View pointerEvents="none" style={[styles.frameLine, { top: frameTop, left: frameLeft, width: frameW, height: frameH }]} />
        </>
      ) : null}
      {kind === 'menu' ? <MenuGuide top={cardTop} height={cardH} width={width} screenH={height} /> : null}

      <View style={[styles.camTop, { top: insets.top + 8 }]}>
        <IconButton name="close" onPress={() => onDone(null)} label="Close" />
        <IconButton name={flash === 'off' ? 'flash-off' : 'flash-on'} onPress={() => setFlash((f) => (f === 'off' ? 'on' : 'off'))} label="Flash" />
      </View>

      <View style={[styles.camBottom, { bottom: insets.bottom + 22 }]}>
        <IconButton name="photo-library" size={30} onPress={onGrid ?? androidGallery} label="Photos" />
        <Pressable onPress={shoot} disabled={!ready || busy} accessibilityRole="button" accessibilityLabel="Take photo" style={styles.shutterRing}>
          <View style={[styles.shutter, (!ready || busy) && { opacity: 0.5 }]} />
        </Pressable>
        <IconButton name="flip-camera-ios" size={30} onPress={() => setFacing((f) => (f === 'back' ? 'front' : 'back'))} label="Switch camera" />
      </View>
      {busy ? (
        <View style={styles.busy}>
          <ActivityIndicator color={colors.white} />
        </View>
      ) : null}
    </View>
  );
}



// The 4:3 part of a menu dish photo that the dish card in the Menu shows. Everything else only shows in the story.
function MenuGuide({ top, height, width, screenH }: { top: number; height: number; width: number; screenH: number }) {
  return (
    <>
      <View pointerEvents="none" style={[styles.guideDim, { top: 0, left: 0, width, height: top }]} />
      <View pointerEvents="none" style={[styles.guideDim, { top: top + height, left: 0, width, height: Math.max(0, screenH - top - height) }]} />
      <View pointerEvents="none" style={[styles.frameLine, { top, left: 0, width, height }]} />
      <View pointerEvents="none" style={[styles.guideTag, { top: top + 8, left: 10 }]}>
        <Text style={styles.guideTagText}>Menu card</Text>
      </View>
    </>
  );
}

// ---------- Adjust: move and zoom the photo inside the final frame ----------

function Adjust({ kind, photo, onBack, onDone }: { kind: PhotoKind; photo: Shot; onBack: () => void; onDone: (p: PickedPhoto | null) => void }) {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [busy, setBusy] = useState(false);
  const aspect = FRAME_ASPECT[kind];
  // The frame is as big as the screen allows (a story fills the width), centered in the space under the top bar.
  const room = height - insets.top - insets.bottom - 70;
  const frameH = Math.min(width / aspect, room);
  const frameW = frameH * aspect;
  // At zoom 1 the photo just covers the frame; pinching zooms in, dragging moves it, and it can never leave a gap.
  const base = Math.max(frameW / photo.width, frameH / photo.height);

  const zoom = useSharedValue(1);
  const startZoom = useSharedValue(1);
  const tx = useSharedValue(0);
  const ty = useSharedValue(0);
  const startX = useSharedValue(0);
  const startY = useSharedValue(0);

  const pan = Gesture.Pan()
    .onStart(() => {
      startX.value = tx.value;
      startY.value = ty.value;
    })
    .onUpdate((e) => {
      const maxX = Math.max(0, (photo.width * base * zoom.value - frameW) / 2);
      const maxY = Math.max(0, (photo.height * base * zoom.value - frameH) / 2);
      tx.value = Math.min(maxX, Math.max(-maxX, startX.value + e.translationX));
      ty.value = Math.min(maxY, Math.max(-maxY, startY.value + e.translationY));
    });
  const pinch = Gesture.Pinch()
    .onStart(() => {
      startZoom.value = zoom.value;
    })
    .onUpdate((e) => {
      zoom.value = Math.min(5, Math.max(1, startZoom.value * e.scale));
      const maxX = Math.max(0, (photo.width * base * zoom.value - frameW) / 2);
      const maxY = Math.max(0, (photo.height * base * zoom.value - frameH) / 2);
      tx.value = Math.min(maxX, Math.max(-maxX, tx.value));
      ty.value = Math.min(maxY, Math.max(-maxY, ty.value));
    });
  const gesture = Gesture.Simultaneous(pan, pinch);

  const imageStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: tx.value }, { translateY: ty.value }, { scale: zoom.value }],
  }));

  async function confirm() {
    setBusy(true);
    try {
      const S = base * zoom.value;
      const cropW = Math.min(photo.width, Math.round(frameW / S));
      const cropH = Math.min(photo.height, Math.round(frameH / S));
      const x = Math.round((photo.width * S / 2 - frameW / 2 - tx.value) / S);
      const y = Math.round((photo.height * S / 2 - frameH / 2 - ty.value) / S);
      const originX = Math.min(photo.width - cropW, Math.max(0, x));
      const originY = Math.min(photo.height - cropH, Math.max(0, y));
      const ctx = ImageManipulator.manipulate(photo.uri).crop({ originX, originY, width: cropW, height: cropH });
      if (Math.max(cropW, cropH) > MAX_SIDE) ctx.resize(cropW >= cropH ? { width: MAX_SIDE } : { height: MAX_SIDE });
      const rendered = await ctx.renderAsync();
      const out = await rendered.saveAsync({ format: SaveFormat.JPEG, compress: 0.8 });
      onDone({ uri: out.uri, mimeType: 'image/jpeg' });
    } catch {
      setBusy(false);
    }
  }

  return (
    <GestureHandlerRootView style={[styles.screen, { paddingTop: insets.top }]}>
      <View style={styles.gridTop}>
        <IconButton name="arrow-back" onPress={onBack} label="Back" />
        <Text style={styles.gridTitle}>Move and zoom</Text>
        <Pressable disabled={busy} onPress={confirm} hitSlop={10} style={styles.next}>
          <Text style={[styles.nextText, busy && { opacity: 0.4 }]}>Done</Text>
        </Pressable>
      </View>
      <View style={styles.adjustArea}>
        <GestureDetector gesture={gesture}>
          <View style={{ width: frameW, height: frameH, overflow: 'hidden', backgroundColor: colors.navy }}>
            <Animated.View style={[{ width: frameW, height: frameH, alignItems: 'center', justifyContent: 'center' }, imageStyle]}>
              <Image source={{ uri: photo.uri }} style={{ width: photo.width * base, height: photo.height * base }} contentFit="fill" />
            </Animated.View>
            {kind === 'menu' ? <MenuGuide top={Math.round((frameH - frameW / MENU_CARD_ASPECT) / 2)} height={Math.round(frameW / MENU_CARD_ASPECT)} width={frameW} screenH={frameH} /> : null}
          </View>
        </GestureDetector>
      </View>
      {busy ? (
        <View style={styles.busy}>
          <ActivityIndicator color={colors.white} />
        </View>
      ) : null}
    </GestureHandlerRootView>
  );
}

// ---------- Photo grid (iPhone) ----------

function Grid({ kind, onCamera, onPick, onDone }: { kind: PhotoKind; onCamera: () => void; onPick: (p: Shot) => void; onDone: (p: PickedPhoto | null) => void }) {
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [permission, requestPermission] = MediaLibrary.usePermissions();
  const [assets, setAssets] = useState<MediaLibrary.Asset[]>([]);
  const [busy, setBusy] = useState(false);
  const loading = useRef(false);
  const end = useRef(false);
  const asked = useRef(false);
  const square = kind !== 'story';
  const size = Math.floor((width - 4) / 3);

  const loadMore = useCallback(async (offset: number) => {
    if (loading.current || end.current) return;
    loading.current = true;
    try {
      const page = await new MediaLibrary.Query()
        .eq(MediaLibrary.AssetField.MEDIA_TYPE, MediaLibrary.MediaType.IMAGE)
        .orderBy({ key: MediaLibrary.AssetField.CREATION_TIME, ascending: false })
        .limit(30)
        .offset(offset)
        .exe();
      if (page.length < 30) end.current = true;
      setAssets((cur) => (offset === 0 ? page : [...cur, ...page]));
    } finally {
      loading.current = false;
    }
  }, []);

  useEffect(() => {
    if (!permission) return;
    if (permission.granted) {
      loadMore(0);
    } else if (permission.canAskAgain && !asked.current) {
      asked.current = true;
      requestPermission();
    }
  }, [permission, requestPermission, loadMore]);

  async function onTile(item: Tile) {
    if (item.id === 'camera') return onCamera();
    const asset = (item as { asset: MediaLibrary.Asset }).asset;
    setBusy(true);
    try {
      const info = await asset.getInfo();
      onPick(await normalize(info.uri, info.width, info.height));
    } catch {
      // stay on the grid
    }
    setBusy(false);
  }

  if (permission && !permission.granted && !permission.canAskAgain) {
    return (
      <View style={[styles.screen, styles.center, { paddingTop: insets.top }]}>
        <IconButton name="close" onPress={() => onDone(null)} style={{ position: 'absolute', top: insets.top + 8, left: 12 }} label="Close" />
        <MaterialIcons name="photo-library" size={44} color={colors.teal} />
        <Text style={styles.noteTitle}>Allow your photos</Text>
        <Text style={styles.note}>So you can pick a picture of your dish from your phone.</Text>
        <Pressable style={styles.cta} onPress={() => Linking.openSettings()}>
          <Text style={styles.ctaText}>Open settings</Text>
        </Pressable>
        <Pressable style={styles.link} onPress={onCamera}>
          <Text style={styles.linkText}>Take a photo instead</Text>
        </Pressable>
      </View>
    );
  }

  const data: Tile[] = [{ id: 'camera' }, ...assets.map((a) => ({ id: a.id, asset: a }))];

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <View style={styles.gridTop}>
        <IconButton name="close" onPress={() => onDone(null)} label="Close" />
        <Text style={styles.gridTitle}>{TITLES[kind]}</Text>
        <View style={styles.next} />
      </View>

      <View style={styles.recentsRow}>
        <Text style={styles.recents}>Recents</Text>
        {permission?.accessPrivileges === 'limited' ? (
          <Pressable onPress={() => MediaLibrary.presentPermissionsPicker(['photo']).catch(() => null)} hitSlop={8}>
            <Text style={styles.manage}>Manage</Text>
          </Pressable>
        ) : null}
      </View>

      <FlatList
        data={data}
        numColumns={3}
        keyExtractor={(t) => t.id}
        columnWrapperStyle={{ gap: 2 }}
        contentContainerStyle={{ gap: 2, paddingBottom: insets.bottom + 12 }}
        onEndReached={() => loadMore(assets.length)}
        onEndReachedThreshold={1.5}
        initialNumToRender={15}
        windowSize={7}
        removeClippedSubviews
        renderItem={({ item }) => (
          <Pressable onPress={() => onTile(item)} style={{ width: size, height: size * (square ? 1 : 1.5) }} accessibilityRole="button" accessibilityLabel={item.id === 'camera' ? 'Take a photo' : 'Photo'}>
            {item.id === 'camera' ? (
              <View style={styles.cameraTile}>
                <MaterialIcons name="photo-camera" size={34} color={colors.white} />
              </View>
            ) : (
              <>
                <TileImage asset={(item as { asset: MediaLibrary.Asset }).asset} style={{ width: size, height: size * (square ? 1 : 1.5) }} />
              </>
            )}
          </Pressable>
        )}
      />
      {busy ? (
        <View style={styles.busy}>
          <ActivityIndicator color={colors.white} />
        </View>
      ) : null}
    </View>
  );
}

// One photo of the grid. The address is looked up when the tile appears.
function TileImage({ asset, style, fit }: { asset: MediaLibrary.Asset; style: { width: number; height: number }; fit?: boolean }) {
  const [uri, setUri] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    asset.getUri().then((u) => live && setUri(u), () => null);
    return () => {
      live = false;
    };
  }, [asset]);
  // The size hint makes the phone decode a small copy for the tile instead of the full photo, which is what made the grid slow.
  const px = Math.round(Math.max(style.width, style.height) * PixelRatio.get());
  return uri ? <Image source={{ uri, width: px, height: px }} style={style} contentFit="cover" recyclingKey={asset.id} transition={fit ? 0 : 60} /> : <View style={[style, { backgroundColor: 'rgba(255,255,255,0.08)' }]} />;
}

function IconButton({ name, onPress, label, size = 26, style }: { name: React.ComponentProps<typeof MaterialIcons>['name']; onPress: () => void; label: string; size?: number; style?: object }) {
  return (
    <Pressable onPress={onPress} hitSlop={10} accessibilityRole="button" accessibilityLabel={label} style={[styles.iconBtn, style]}>
      <MaterialIcons name={name} size={size} color={colors.white} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.navy },
  center: { alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32, gap: 10 },
  dim: { position: 'absolute', backgroundColor: DIM },
  frameLine: { position: 'absolute', borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.85)' },
  camTop: { position: 'absolute', left: 12, right: 12, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  camBottom: { position: 'absolute', left: 24, right: 24, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  iconBtn: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(40,48,58,0.55)' },
  shutterRing: { width: 82, height: 82, borderRadius: 41, borderWidth: 4, borderColor: colors.white, alignItems: 'center', justifyContent: 'center' },
  shutter: { width: 64, height: 64, borderRadius: 32, backgroundColor: colors.white },
  guideDim: { position: 'absolute', backgroundColor: 'rgba(40,48,58,0.45)' },
  guideTag: { position: 'absolute', backgroundColor: 'rgba(40,48,58,0.7)', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  guideTagText: { fontFamily: fonts.bold, fontSize: 12, color: colors.white },
  adjustArea: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  busy: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(40,48,58,0.55)', alignItems: 'center', justifyContent: 'center' },
  gridTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 12, paddingBottom: 10 },
  gridTitle: { fontFamily: fonts.extraBold, fontSize: 18, color: colors.white },
  next: { minWidth: 48, alignItems: 'flex-end' },
  nextText: { fontFamily: fonts.extraBold, fontSize: 17, color: colors.teal },
  recentsRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 14, paddingVertical: 10 },
  recents: { fontFamily: fonts.extraBold, fontSize: 16, color: colors.white },
  manage: { fontFamily: fonts.bold, fontSize: 14, color: colors.teal },
  cameraTile: { flex: 1, backgroundColor: 'rgba(255,255,255,0.1)', alignItems: 'center', justifyContent: 'center' },
  noteTitle: { fontFamily: fonts.extraBold, fontSize: 20, color: colors.white, marginTop: 8, textAlign: 'center' },
  note: { fontFamily: fonts.medium, fontSize: 15, color: 'rgba(255,255,255,0.75)', textAlign: 'center' },
  cta: { marginTop: 14, backgroundColor: colors.teal, borderRadius: 999, paddingHorizontal: 26, paddingVertical: 13 },
  ctaText: { fontFamily: fonts.extraBold, fontSize: 16, color: colors.navy },
  link: { marginTop: 10, padding: 8 },
  linkText: { fontFamily: fonts.bold, fontSize: 14, color: colors.white },
});
