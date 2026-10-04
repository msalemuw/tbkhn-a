import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { Image } from 'expo-image';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, fonts } from '@/constants/theme';
import { distanceMeters, fmtDist, fmtReady, type LatLng } from '@/lib/format';
import { type Dish, mediaUrl, personName } from '@/lib/posts';

/** One offering in Today's menu (s53) and the Home feed. */
export function DishCard({ dish, here, onPress }: { dish: Dish; here: LatLng | null; onPress: () => void }) {
  const photo = mediaUrl(dish.media_path);
  const pp = dish.pickup_point;
  const dist = here && pp ? fmtDist(distanceMeters(here, pp)) : null;
  const soldOut = dish.portions_left === 0;

  return (
    <Pressable style={styles.card} onPress={onPress} accessibilityRole="button" accessibilityLabel={`${dish.dish_name} by ${personName(dish.author)}`}>
      {photo ? (
        <Image source={{ uri: photo }} style={styles.photo} contentFit="cover" />
      ) : (
        <View style={[styles.photo, styles.noPhoto]}>
          <MaterialIcons name="soup-kitchen" size={28} color={colors.teal} />
        </View>
      )}
      <View style={{ flex: 1, gap: 3 }}>
        <Text style={styles.cook} numberOfLines={1}>
          {personName(dish.author)}
          {dist ? <Text style={styles.muted}> · {dist}</Text> : null}
        </Text>
        <Text style={styles.dish} numberOfLines={2}>{dish.dish_name}</Text>
        <Text style={styles.price}>EGP {Number(dish.price_egp)}</Text>
        <Text style={[styles.muted, soldOut && { color: colors.ink, fontFamily: fonts.extraBold }]}>
          {fmtReady(Date.parse(dish.ready_at))} · {soldOut ? 'Sold out' : `${dish.portions_left} left`}
        </Text>
        <View style={styles.where}>
          <MaterialIcons name="location-on" size={13} color={colors.muted} />
          <Text style={styles.muted} numberOfLines={1}>
            {dish.community ? `For ${dish.community.name} · ` : ''}Pickup: {pp?.label ?? 'ask the cook'}
          </Text>
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { flexDirection: 'row', gap: 12, backgroundColor: colors.white, borderRadius: 18, borderWidth: 1, borderColor: colors.line, padding: 10 },
  photo: { width: 96, height: 96, borderRadius: 14, backgroundColor: colors.cream },
  noPhoto: { alignItems: 'center', justifyContent: 'center', backgroundColor: colors.tealSoft },
  cook: { fontFamily: fonts.bold, fontSize: 13, color: colors.ink },
  dish: { fontFamily: fonts.extraBold, fontSize: 16, color: colors.ink },
  price: { fontFamily: fonts.extraBold, fontSize: 14, color: colors.ink },
  muted: { fontFamily: fonts.semiBold, fontSize: 12.5, color: colors.muted },
  where: { flexDirection: 'row', alignItems: 'center', gap: 3, flexShrink: 1 },
});
