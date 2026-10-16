import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { router, useLocalSearchParams } from 'expo-router';
import { Linking, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import MapView, { Marker } from 'react-native-maps';
import { SafeAreaView } from 'react-native-safe-area-context';

import { colors, fonts } from '@/constants/theme';
import { distanceMeters, fmtDist } from '@/lib/format';
import { useMyLocation } from '@/lib/location';

// Where a buyer collects: the cook's pickup spot on a map, opened from the dish page before ordering.
// "Open in Maps" hands the point to the phone's own maps app for directions. Distance is computed from the member's location.
const DELTA = 0.006;

export default function PickupMap() {
  const { lat, lng, label } = useLocalSearchParams<{ lat: string; lng: string; label?: string }>();
  const here = useMyLocation();
  const spot = { lat: Number(lat), lng: Number(lng) };
  const valid = Number.isFinite(spot.lat) && Number.isFinite(spot.lng);
  const name = label || 'Pickup spot';

  function openMaps() {
    const q = encodeURIComponent(name);
    const url = Platform.OS === 'ios' ? `http://maps.apple.com/?ll=${spot.lat},${spot.lng}&q=${q}` : `geo:${spot.lat},${spot.lng}?q=${spot.lat},${spot.lng}(${q})`;
    Linking.openURL(url).catch(() => null);
  }

  if (!valid) {
    return (
      <SafeAreaView style={styles.screen}>
        <Text style={styles.empty}>This pickup spot has no map location yet. Message the cook to ask.</Text>
      </SafeAreaView>
    );
  }

  return (
    <View style={styles.screen}>
      <MapView
        style={StyleSheet.absoluteFill}
        initialRegion={{ latitude: spot.lat, longitude: spot.lng, latitudeDelta: DELTA, longitudeDelta: DELTA }}
        showsUserLocation
        showsMyLocationButton={false}>
        <Marker coordinate={{ latitude: spot.lat, longitude: spot.lng }} title={name} pinColor={colors.teal} />
      </MapView>
      <SafeAreaView edges={['top']} style={styles.top} pointerEvents="box-none">
        <Pressable onPress={() => router.back()} hitSlop={12} accessibilityRole="button" accessibilityLabel="Close" style={styles.round}>
          <MaterialIcons name="close" size={22} color={colors.ink} />
        </Pressable>
      </SafeAreaView>
      <SafeAreaView edges={['bottom']} style={styles.sheet}>
        <View style={styles.where}>
          <MaterialIcons name="location-on" size={26} color={colors.teal} />
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={styles.name} numberOfLines={2}>{name}</Text>
            {here ? <Text style={styles.sub}>{fmtDist(distanceMeters(here, spot))} away</Text> : null}
          </View>
        </View>
        <Pressable onPress={openMaps} style={styles.open} accessibilityRole="button">
          <Text style={styles.openText}>Open in Maps</Text>
        </Pressable>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.lightBlue },
  top: { position: 'absolute', top: 0, left: 0, right: 0, paddingHorizontal: 16, paddingTop: 8 },
  round: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.white, alignItems: 'center', justifyContent: 'center', shadowColor: colors.navy, shadowOpacity: 0.18, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 3 },
  sheet: { position: 'absolute', left: 0, right: 0, bottom: 0, backgroundColor: colors.white, borderTopLeftRadius: 22, borderTopRightRadius: 22, paddingHorizontal: 20, paddingTop: 18, gap: 16 },
  where: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  name: { fontFamily: fonts.extraBold, fontSize: 18, color: colors.ink },
  sub: { fontFamily: fonts.medium, fontSize: 13.5, color: colors.muted, marginTop: 2 },
  open: { backgroundColor: colors.teal, borderRadius: 14, paddingVertical: 16, alignItems: 'center', marginBottom: 12 },
  openText: { fontFamily: fonts.extraBold, fontSize: 16, color: colors.navy },
  empty: { fontFamily: fonts.semiBold, fontSize: 14, color: colors.muted, textAlign: 'center', margin: 40, lineHeight: 20 },
});
