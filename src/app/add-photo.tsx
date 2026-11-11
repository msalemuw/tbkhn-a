import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { CameraView, type FlashMode, useCameraPermissions } from 'expo-camera';
import { Image } from 'expo-image';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import * as MediaLibrary from 'expo-media-library';
import { router, useLocalSearchParams } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Linking, Platform, Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Text } from '@/components/text';
import { colors, fonts } from '@/constants/theme';
import { FRAME_ASPECT, finishPhoto, type PhotoKind, type PickedPhoto, systemPick } from '@/lib/photo-flow';

// The add-photo screen for stories, posts and menu dishes: a grid of recent photos with the camera as its first tile
// (iPhone), and a camera that fills the screen. The final look is drawn while choosing: stories fill the screen,
// posts and menu dishes show a square frame inside it. Phones on an older build never reach this screen (see photo-flow).
const DIM = 'rgba(40,48,58,0.78)';
const MAX_SIDE = 1440;

type Mode = 'grid' | 'camera';
type Tile = { id: string; asset: MediaLibrary.Asset } | { id: 'camera' };

const TITLES: Record<PhotoKind, string> = { story: 'Add to story', post: 'Add to post', menu: 'Add to menu' };

// Cuts a photo to the final frame (centered), shrinks it and saves it as a JPEG. Everything uploaded looks the same this way.
async function cutToFrame(uri: string, width: number, height: number, aspect: number): Promise<PickedPhoto> {
  let w = width;
  let h = height;
  let x = 0;
  let y = 0;
  if (width / height > aspect) {
    w = Math.round(height * aspect);
    x = Math.round((width - w) / 2);
  } else {
    h = Math.round(width / aspect);
    y = Math.round((height - h) / 2);
  }
  const ctx = ImageManipulator.manipulate(uri).crop({ originX: x, originY: y, width: w, height: h });
  if (Math.max(w, h) > MAX_SIDE) ctx.resize(w >= h ? { width: MAX_SIDE } : { height: MAX_SIDE });
  const rendered = await ctx.renderAsync();
  const out = await rendered.saveAsync({ format: SaveFormat.JPEG, compress: 0.8 });
  return { uri: out.uri, mimeType: 'image/jpeg' };
}

export default function AddPhoto() {
  const params = useLocalSearchParams<{ kind?: string; mode?: string }>();
  const kind: PhotoKind = params.kind === 'story' || params.kind === 'post' ? params.kind : 'menu';
  const [mode, setMode] = useState<Mode>(params.mode === 'grid' && Platform.OS !== 'android' ? 'grid' : 'camera');
  const done = useRef(false);

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

  return (
    <>
      <StatusBar style="light" />
      {mode === 'grid' ? (
    <Grid kind={kind} onCamera={() => setMode('camera')} onDone={finish} />
      ) : (
        <Camera kind={kind} onGrid={Platform.OS !== 'android' ? () => setMode('grid') : undefined} onDone={finish} />
      )}
    </>
  );
}

// ---------- Camera ----------

function Camera({ kind, onGrid, onDone }: { kind: PhotoKind; onGrid?: () => void; onDone: (p: PickedPhoto | null) => void }) {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [permission, requestPermission] = useCameraPermissions();
  const camera = useRef<CameraView>(null);
  const [facing, setFacing] = useState<'back' | 'front'>('back');
  const [flash, setFlash] = useState<FlashMode>('off');
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);

  // The final frame: full width, as tall as the kind needs, centered on the screen.
  const aspect = FRAME_ASPECT[kind];
  const frameH = Math.min(width / aspect, height - insets.top - insets.bottom - 200);
  const frameW = frameH * aspect;
  const frameTop = Math.round((height - frameH) / 2);
  const frameLeft = Math.round((width - frameW) / 2);

  async function shoot() {
    if (!camera.current || busy || !ready) return;
    setBusy(true);
    try {
      const pic = await camera.current.takePictureAsync({ quality: 0.9 });
      // What the person saw through the frame is what gets kept: the screen shows the camera filling it, so cut the same part.
      const screenAspect = width / height;
      const picAspect = pic.width / pic.height;
      // The preview fills the screen (cover). Work out which part of the picture the frame covers.
      let visW = pic.width;
      let visH = pic.height;
      let visX = 0;
      let visY = 0;
      if (picAspect > screenAspect) {
        visW = pic.height * screenAspect;
        visX = (pic.width - visW) / 2;
      } else {
        visH = pic.width / screenAspect;
        visY = (pic.height - visH) / 2;
      }
      const scale = visW / width;
      const cropX = Math.round(visX + frameLeft * scale);
      const cropY = Math.round(visY + frameTop * scale);
      const cropW = Math.round(frameW * scale);
      const cropH = Math.round(frameH * scale);
      const ctx = ImageManipulator.manipulate(pic.uri).crop({ originX: Math.max(0, cropX), originY: Math.max(0, cropY), width: Math.min(cropW, pic.width - cropX), height: Math.min(cropH, pic.height - cropY) });
      if (Math.max(cropW, cropH) > MAX_SIDE) ctx.resize(cropW >= cropH ? { width: MAX_SIDE } : { height: MAX_SIDE });
      const rendered = await ctx.renderAsync();
      const out = await rendered.saveAsync({ format: SaveFormat.JPEG, compress: 0.8 });
      onDone({ uri: out.uri, mimeType: 'image/jpeg' });
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
      <View pointerEvents="none" style={[styles.dim, { top: 0, left: 0, right: 0, height: frameTop }]} />
      <View pointerEvents="none" style={[styles.dim, { top: frameTop + frameH, left: 0, right: 0, bottom: 0 }]} />
      <View pointerEvents="none" style={[styles.dim, { top: frameTop, left: 0, width: frameLeft, height: frameH }]} />
      <View pointerEvents="none" style={[styles.dim, { top: frameTop, left: frameLeft + frameW, right: 0, height: frameH }]} />
      <View pointerEvents="none" style={[styles.frameLine, { top: frameTop, left: frameLeft, width: frameW, height: frameH }]} />

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

// ---------- Photo grid (iPhone) ----------

function Grid({ kind, onCamera, onDone }: { kind: PhotoKind; onCamera: () => void; onDone: (p: PickedPhoto | null) => void }) {
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [permission, requestPermission] = MediaLibrary.usePermissions();
  const [assets, setAssets] = useState<MediaLibrary.Asset[]>([]);
  const [selected, setSelected] = useState<MediaLibrary.Asset | null>(null);
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
        .limit(60)
        .offset(offset)
        .exe();
      if (page.length < 60) end.current = true;
      setAssets((cur) => (offset === 0 ? page : [...cur, ...page]));
      if (offset === 0 && page[0]) setSelected((cur) => cur ?? page[0]);
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

  async function confirm(asset: MediaLibrary.Asset) {
    setBusy(true);
    try {
      const info = await asset.getInfo();
      onDone(await cutToFrame(info.uri, info.width, info.height, FRAME_ASPECT[kind]));
    } catch {
      setBusy(false);
    }
  }

  function onTile(item: Tile) {
    if (item.id === 'camera') return onCamera();
    const asset = (item as { asset: MediaLibrary.Asset }).asset;
    // Stories go straight on; posts and menu dishes show the square first, then "Next".
    if (square) setSelected(asset);
    else confirm(asset);
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
        {square ? (
          <Pressable disabled={!selected || busy} onPress={() => selected && confirm(selected)} hitSlop={10} style={styles.next}>
            <Text style={[styles.nextText, (!selected || busy) && { opacity: 0.4 }]}>Next</Text>
          </Pressable>
        ) : (
          <View style={styles.next} />
        )}
      </View>

      {square ? (
        // The final look of a post or menu dish: a square, cut from the middle of the photo.
        <View style={{ width, height: width, backgroundColor: colors.navy }}>{selected ? <TileImage asset={selected} style={{ width, height: width }} fit /> : null}</View>
      ) : null}

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
        onEndReachedThreshold={0.6}
        renderItem={({ item }) => (
          <Pressable onPress={() => onTile(item)} style={{ width: size, height: size * (square ? 1 : 1.5) }} accessibilityRole="button" accessibilityLabel={item.id === 'camera' ? 'Take a photo' : 'Photo'}>
            {item.id === 'camera' ? (
              <View style={styles.cameraTile}>
                <MaterialIcons name="photo-camera" size={34} color={colors.white} />
              </View>
            ) : (
              <>
                <TileImage asset={(item as { asset: MediaLibrary.Asset }).asset} style={{ width: size, height: size * (square ? 1 : 1.5) }} />
                {selected?.id === item.id && square ? <View style={styles.picked} /> : null}
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
  return uri ? <Image source={{ uri }} style={style} contentFit="cover" recyclingKey={asset.id} transition={fit ? 0 : 80} /> : <View style={[style, { backgroundColor: 'rgba(255,255,255,0.08)' }]} />;
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
  busy: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(40,48,58,0.55)', alignItems: 'center', justifyContent: 'center' },
  gridTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 12, paddingBottom: 10 },
  gridTitle: { fontFamily: fonts.extraBold, fontSize: 18, color: colors.white },
  next: { minWidth: 48, alignItems: 'flex-end' },
  nextText: { fontFamily: fonts.extraBold, fontSize: 17, color: colors.teal },
  recentsRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 14, paddingVertical: 10 },
  recents: { fontFamily: fonts.extraBold, fontSize: 16, color: colors.white },
  manage: { fontFamily: fonts.bold, fontSize: 14, color: colors.teal },
  cameraTile: { flex: 1, backgroundColor: 'rgba(255,255,255,0.1)', alignItems: 'center', justifyContent: 'center' },
  picked: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(255,255,255,0.55)' },
  noteTitle: { fontFamily: fonts.extraBold, fontSize: 20, color: colors.white, marginTop: 8, textAlign: 'center' },
  note: { fontFamily: fonts.medium, fontSize: 15, color: 'rgba(255,255,255,0.75)', textAlign: 'center' },
  cta: { marginTop: 14, backgroundColor: colors.teal, borderRadius: 999, paddingHorizontal: 26, paddingVertical: 13 },
  ctaText: { fontFamily: fonts.extraBold, fontSize: 16, color: colors.navy },
  link: { marginTop: 10, padding: 8 },
  linkText: { fontFamily: fonts.bold, fontSize: 14, color: colors.white },
});
