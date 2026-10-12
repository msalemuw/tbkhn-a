import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Animated, Keyboard, KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import MapView, { type Region } from 'react-native-maps';
import { SafeAreaView } from 'react-native-safe-area-context';

import { colors, fonts } from '@/constants/theme';
import { distanceMeters, type LatLng } from '@/lib/format';
import { getMyLocation, placeDetails, searchPlaces, usePlace } from '@/lib/location';
import { addPickupPoint, fetchMyPickupPoints, rememberPickupPoint } from '@/lib/posts';
import { useSession } from '@/lib/session';

// Location picker laid out like Talabat's (familiar to everyone): round back arrow and a search pill on top,
// a map you drag under a fixed pin that lifts while you drag, a tooltip over the pin, a round locate-me button,
// and a bottom sheet with the area name, street and city, and a full-width Confirm. Pickup only, no delivery words.
// The default is central Cairo until a position is known.
// With ?for=pickup it picks a cook's pickup point instead: it starts at the spot already picked (?at=lat,lng) or the
// home location, and Confirm saves it under the area name (reusing a saved spot within 25 m); home stays as it is.
const CAIRO = { latitude: 30.0444, longitude: 31.2357 };
const DELTA = 0.01;

type Hit = LatLng & { name: string; line2: string };

export default function LocationPicker() {
  const { place, setPlace } = usePlace();
  const { for: purpose, at } = useLocalSearchParams<{ for?: string; at?: string }>();
  const pickup = purpose === 'pickup';
  const { session } = useSession();
  const [saving, setSaving] = useState(false);
  const map = useRef<MapView>(null);
  const [atLat, atLng] = (at ?? '').split(',').map(Number);
  const start = Number.isFinite(atLat) && Number.isFinite(atLng) && at ? { latitude: atLat, longitude: atLng } : place ? { latitude: place.lat, longitude: place.lng } : CAIRO;
  const [searchOpen, setSearchOpen] = useState(false);
  const [center, setCenter] = useState(start);
  const [area, setArea] = useState(at ? '' : (place?.label ?? ''));
  const [line2, setLine2] = useState('');
  const [finding, setFinding] = useState(false);
  const [sheetH, setSheetH] = useState(190);
  const [text, setText] = useState('');
  const [found, setFound] = useState<{ q: string; list: Hit[] } | null>(null);
  const [lift] = useState(() => new Animated.Value(0));

  // Name the spot under the pin once the map stops moving.
  useEffect(() => {
    let live = true;
    const t = setTimeout(async () => {
      const d = await placeDetails({ lat: center.latitude, lng: center.longitude });
      if (live) {
        setArea(d.area);
        setLine2(d.line2);
      }
    }, 350);
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [center]);

  // Search suggestions as the member types.
  const q = text.trim();
  useEffect(() => {
    if (q.length < 3) return;
    let live = true;
    const t = setTimeout(() => {
      searchPlaces(q).then((list) => live && setFound({ q, list }));
    }, 450);
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [q]);
  const searching = q.length >= 3 && found?.q !== q;
  const hits = q.length >= 3 && found?.q === q ? found.list : null;

  const setLifted = (up: boolean) => Animated.timing(lift, { toValue: up ? -14 : 0, duration: 140, useNativeDriver: true }).start();

  async function goToMe() {
    setFinding(true);
    const gps = await getMyLocation();
    setFinding(false);
    if (!gps) {
      Alert.alert('Location is off', 'Allow location for tabkheen A in Settings, or drag the map to your spot.');
      return;
    }
    map.current?.animateToRegion({ latitude: gps.lat, longitude: gps.lng, latitudeDelta: DELTA, longitudeDelta: DELTA }, 400);
  }

  function pick(h: Hit) {
    Keyboard.dismiss();
    setText('');
    map.current?.animateToRegion({ latitude: h.lat, longitude: h.lng, latitudeDelta: DELTA, longitudeDelta: DELTA }, 400);
    setSearchOpen(false);
  }

  async function confirm() {
    if (!pickup) {
      setPlace({ lat: center.latitude, lng: center.longitude, label: area });
      router.back();
      return;
    }
    const uid = session?.user.id;
    if (!uid) return;
    setSaving(true);
    try {
      const here = { lat: center.latitude, lng: center.longitude };
      const saved = await fetchMyPickupPoints(uid);
      const same = saved.find((p) => distanceMeters(here, p) < 25);
      if (same) rememberPickupPoint(same.id);
      else await addPickupPoint(uid, (area || line2 || 'My pickup spot').slice(0, 80), here.lat, here.lng);
      router.back();
    } catch {
      setSaving(false);
      Alert.alert('Not saved', 'We couldn’t save the pickup point. Check your connection and try again.');
    }
  }

  const onRegion = (r: Region) => {
    setCenter({ latitude: r.latitude, longitude: r.longitude });
    setLifted(false);
  };

  return (
    <View style={styles.screen}>
      <MapView
        ref={map}
        style={StyleSheet.absoluteFill}
        initialRegion={{ ...start, latitudeDelta: DELTA, longitudeDelta: DELTA }}
        onPanDrag={() => setLifted(true)}
        onRegionChangeComplete={onRegion}
        showsUserLocation
        showsMyLocationButton={false}
      />
      <View pointerEvents="none" style={styles.pinWrap}>
        <Animated.View style={{ alignItems: 'center', transform: [{ translateY: lift }], marginBottom: 48 }}>
          <View style={styles.tip}>
            <Text style={styles.tipTitle}>{pickup ? 'Pickup point here' : 'Pick up near here'}</Text>
            <Text style={styles.tipSub}>{pickup ? 'Move the map to where buyers collect' : 'Move the map to set your location'}</Text>
          </View>
          <View style={styles.tipArrow} />
          <MaterialIcons name="location-on" size={48} color={colors.teal} />
        </Animated.View>
      </View>

      <SafeAreaView edges={['top']} style={styles.top} pointerEvents="box-none">
        <View style={styles.bar}>
          <Pressable onPress={() => router.back()} hitSlop={12} accessibilityRole="button" accessibilityLabel="Close" style={styles.round}>
            <MaterialIcons name="close" size={22} color={colors.ink} />
          </Pressable>
          <View style={styles.titleWrap}>
            <Text style={styles.title} numberOfLines={1}>{pickup ? 'Pickup point' : 'Your location'}</Text>
          </View>
          <Pressable onPress={() => setSearchOpen((o) => !o)} hitSlop={12} accessibilityRole="button" accessibilityLabel="Search for a place" style={styles.round}>
            <MaterialIcons name={searchOpen ? 'expand-less' : 'search'} size={22} color={colors.ink} />
          </Pressable>
        </View>
        {searchOpen ? (
          <View style={[styles.search, { marginTop: 8, flex: 0 }]}>
            <MaterialIcons name="search" size={20} color={colors.muted} />
            <TextInput
              style={styles.input}
              value={text}
              onChangeText={setText}
              placeholder="Search for area, street name…"
              placeholderTextColor={colors.muted}
              autoCorrect={false}
              autoFocus
              returnKeyType="search"
              accessibilityLabel="Search for area or street name"
            />
            {searching ? <ActivityIndicator color={colors.muted} size="small" /> : text ? (
              <Pressable onPress={() => setText('')} hitSlop={10} accessibilityRole="button" accessibilityLabel="Clear search">
                <MaterialIcons name="close" size={18} color={colors.muted} />
              </Pressable>
            ) : null}
          </View>
        ) : null}
        {searchOpen && hits ? (
          <View style={styles.hits}>
            {hits.length ? (
              hits.map((h, i) => (
                <Pressable key={`${h.lat},${h.lng},${i}`} style={styles.hit} onPress={() => pick(h)} accessibilityRole="button">
                  <MaterialIcons name="place" size={20} color={colors.ink} />
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={styles.hitName} numberOfLines={1}>{h.name}</Text>
                    {h.line2 ? <Text style={styles.hitSub} numberOfLines={1}>{h.line2}</Text> : null}
                  </View>
                </Pressable>
              ))
            ) : (
              <Text style={styles.noHit}>No place found. Try another name.</Text>
            )}
          </View>
        ) : null}
      </SafeAreaView>

      <Pressable onPress={goToMe} style={[styles.locate, { bottom: sheetH + 14 }]} accessibilityRole="button" accessibilityLabel="Use my current location">
        {finding ? <ActivityIndicator color={colors.ink} /> : <MaterialIcons name="my-location" size={22} color={colors.ink} />}
      </Pressable>

      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.sheetWrap} pointerEvents="box-none">
      <SafeAreaView edges={['bottom']} style={styles.sheet} onLayout={(e) => setSheetH(e.nativeEvent.layout.height)}>
        <View style={styles.where}>
          <MaterialIcons name="location-on" size={26} color={colors.teal} />
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={styles.area} numberOfLines={1}>{area || 'Move the map to set your location'}</Text>
            {line2 ? <Text style={styles.line2} numberOfLines={1}>{line2}</Text> : null}
          </View>
        </View>
        <Pressable onPress={saving ? undefined : confirm} style={[styles.confirm, saving && { opacity: 0.6 }]} accessibilityRole="button">
          {saving ? <ActivityIndicator color={colors.navy} /> : <Text style={styles.confirmText}>{pickup ? 'Confirm pickup point' : 'Confirm location'}</Text>}
        </Pressable>
      </SafeAreaView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.lightBlue },
  pinWrap: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' },
  tip: { backgroundColor: colors.navy, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 7, alignItems: 'center' },
  tipTitle: { fontFamily: fonts.extraBold, fontSize: 13, color: colors.white },
  tipSub: { fontFamily: fonts.medium, fontSize: 11, color: colors.white, opacity: 0.85, marginTop: 1 },
  tipArrow: { width: 0, height: 0, borderLeftWidth: 7, borderRightWidth: 7, borderTopWidth: 8, borderLeftColor: 'transparent', borderRightColor: 'transparent', borderTopColor: colors.navy, marginBottom: -2 },
  top: { position: 'absolute', top: 0, left: 0, right: 0, paddingHorizontal: 16 },
  bar: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, paddingHorizontal: 16, marginHorizontal: -16, backgroundColor: colors.white, shadowColor: colors.navy, shadowOpacity: 0.12, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 4 },
  titleWrap: { flex: 1 },
  title: { fontFamily: fonts.extraBold, fontSize: 18, color: colors.ink },
  round: { width: 42, height: 42, borderRadius: 21, backgroundColor: colors.white, alignItems: 'center', justifyContent: 'center', shadowColor: colors.navy, shadowOpacity: 0.18, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 3 },
  search: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: colors.white, borderRadius: 999, paddingHorizontal: 14, height: 42, shadowColor: colors.navy, shadowOpacity: 0.18, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 3 },
  input: { flex: 1, minWidth: 0, fontFamily: fonts.medium, fontSize: 14.5, color: colors.ink, padding: 0 },
  hits: { backgroundColor: colors.white, borderRadius: 16, marginTop: 8, paddingVertical: 4, elevation: 3, shadowColor: colors.navy, shadowOpacity: 0.18, shadowRadius: 6, shadowOffset: { width: 0, height: 2 } },
  hit: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 11 },
  hitName: { fontFamily: fonts.bold, fontSize: 14.5, color: colors.ink },
  hitSub: { fontFamily: fonts.medium, fontSize: 12.5, color: colors.muted, marginTop: 1 },
  noHit: { fontFamily: fonts.semiBold, fontSize: 13, color: colors.muted, padding: 14 },
  locate: { position: 'absolute', right: 16, width: 46, height: 46, borderRadius: 23, backgroundColor: colors.white, alignItems: 'center', justifyContent: 'center', shadowColor: colors.navy, shadowOpacity: 0.2, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 4 },
  sheetWrap: { position: 'absolute', left: 0, right: 0, bottom: 0 },
  sheet: { backgroundColor: colors.white, borderTopLeftRadius: 22, borderTopRightRadius: 22, paddingHorizontal: 20, paddingTop: 18, gap: 16 },
  where: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  area: { fontFamily: fonts.extraBold, fontSize: 18, color: colors.ink },
  line2: { fontFamily: fonts.medium, fontSize: 13.5, color: colors.muted, marginTop: 2 },
  confirm: { backgroundColor: colors.teal, borderRadius: 14, paddingVertical: 16, alignItems: 'center', marginBottom: 12 },
  confirmText: { fontFamily: fonts.extraBold, fontSize: 16, color: colors.navy },
});
