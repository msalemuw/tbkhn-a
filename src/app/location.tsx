import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import MapView, { type Region } from 'react-native-maps';
import { SafeAreaView } from 'react-native-safe-area-context';

import { colors, fonts } from '@/constants/theme';
import { getMyLocation, placeName, usePlace } from '@/lib/location';

// Talabat-style picker: drag the map under a fixed pin, or jump to the phone's GPS.
// The default is central Cairo until a position is known.
const CAIRO = { latitude: 30.0444, longitude: 31.2357 };
const DELTA = 0.01;

export default function LocationPicker() {
  const { place, setPlace } = usePlace();
  const map = useRef<MapView>(null);
  const start = place ? { latitude: place.lat, longitude: place.lng } : CAIRO;
  const [center, setCenter] = useState(start);
  const [label, setLabel] = useState(place?.label ?? '');
  const [finding, setFinding] = useState(false);

  // Name the spot under the pin once the map stops moving.
  useEffect(() => {
    let live = true;
    const t = setTimeout(async () => {
      const name = await placeName({ lat: center.latitude, lng: center.longitude });
      if (live) setLabel(name ?? '');
    }, 350);
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [center]);

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

  function confirm() {
    setPlace({ lat: center.latitude, lng: center.longitude, label });
    router.back();
  }

  const onRegion = (r: Region) => setCenter({ latitude: r.latitude, longitude: r.longitude });

  return (
    <View style={styles.screen}>
      <MapView
        ref={map}
        style={StyleSheet.absoluteFill}
        initialRegion={{ ...start, latitudeDelta: DELTA, longitudeDelta: DELTA }}
        onRegionChangeComplete={onRegion}
        showsUserLocation
        showsMyLocationButton={false}
      />
      <View pointerEvents="none" style={styles.pinWrap}>
        <MaterialIcons name="location-on" size={48} color={colors.teal} style={styles.pin} />
      </View>

      <SafeAreaView edges={['top']} style={styles.top} pointerEvents="box-none">
        <View style={styles.bar}>
          <Pressable onPress={() => router.back()} hitSlop={12} accessibilityRole="button" accessibilityLabel="Close" style={styles.round}>
            <MaterialIcons name="close" size={22} color={colors.ink} />
          </Pressable>
          <Text style={styles.title}>Location</Text>
          <View style={styles.round} />
        </View>
      </SafeAreaView>

      <SafeAreaView edges={['bottom']} style={styles.sheet}>
        <Pressable onPress={goToMe} style={styles.current} accessibilityRole="button">
          {finding ? <ActivityIndicator color={colors.ink} /> : <MaterialIcons name="my-location" size={20} color={colors.ink} />}
          <Text style={styles.currentText}>Use current location</Text>
        </Pressable>
        <Text style={styles.label} numberOfLines={2}>
          {label || 'Move the map to set your location'}
        </Text>
        <Pressable onPress={confirm} style={styles.confirm} accessibilityRole="button">
          <Text style={styles.confirmText}>Confirm location</Text>
        </Pressable>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.lightBlue },
  pinWrap: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' },
  pin: { marginBottom: 48 },
  top: { position: 'absolute', top: 0, left: 0, right: 0, paddingHorizontal: 16 },
  bar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: 8 },
  round: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.white, alignItems: 'center', justifyContent: 'center' },
  title: { fontFamily: fonts.extraBold, fontSize: 17, color: colors.ink, backgroundColor: colors.white, paddingHorizontal: 16, paddingVertical: 9, borderRadius: 999, overflow: 'hidden' },
  sheet: { position: 'absolute', left: 0, right: 0, bottom: 0, backgroundColor: colors.white, borderTopLeftRadius: 22, borderTopRightRadius: 22, paddingHorizontal: 20, paddingTop: 18, gap: 14 },
  current: { flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1.5, borderColor: colors.lightBlue, borderRadius: 14, paddingVertical: 13, paddingHorizontal: 14 },
  currentText: { fontFamily: fonts.bold, fontSize: 15, color: colors.ink },
  label: { fontFamily: fonts.semiBold, fontSize: 16, color: colors.ink, minHeight: 22 },
  confirm: { backgroundColor: colors.teal, borderRadius: 14, paddingVertical: 16, alignItems: 'center', marginBottom: 12 },
  confirmText: { fontFamily: fonts.extraBold, fontSize: 16, color: colors.navy },
});
