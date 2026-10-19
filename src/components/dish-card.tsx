import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';

import { Text } from '@/components/text';
import { Avatar } from '@/components/avatar';
import { colors, fonts, ui } from '@/constants/theme';
import { distanceMeters, fmtDist, fmtReady, type LatLng } from '@/lib/format';
import { type Dish, mediaUrl, personName } from '@/lib/posts';

/** Secondary text colour from the design: a soft blue-grey. */
const SLATE = 'rgba(1,49,62,.55)';

/**
 * One offering in Today's menu (s53), laid out like the new design: cook line with a "Cooking today" chip, the photo beside
 * the dish details, and an "Order a plate" button. The pin line names the pickup spot (not the community) and opens its map.
 */
export function DishCard({ dish, here, onPress }: { dish: Dish; here: LatLng | null; onPress: () => void }) {
  const photo = mediaUrl(dish.media_path);
  const pp = dish.pickup_point;
  const dist = here && pp ? fmtDist(distanceMeters(here, pp)) : null;
  const soldOut = dish.portions_left === 0;
  const openMap = () => pp && router.push({ pathname: '/pickup-map', params: { lat: String(pp.lat), lng: String(pp.lng), label: pp.label } });
  const openCook = () => router.push({ pathname: '/cook/[id]', params: { id: dish.author_id } });

  return (
    <Pressable style={styles.card} onPress={onPress} accessibilityRole="button" accessibilityLabel={`${dish.dish_name} by ${personName(dish.author)}`}>
      <View style={styles.head}>
        <Pressable onPress={openCook} accessibilityRole="link" accessibilityLabel={`${personName(dish.author)}'s profile`} hitSlop={6}>
          <Avatar person={dish.author} size={46} />
        </Pressable>
        <Text style={styles.cook} numberOfLines={1}>
          <Text onPress={openCook} accessibilityRole="link">{personName(dish.author)}</Text>
          {dist ? <Text style={styles.muted}> · {dist}</Text> : null}
        </Text>
        <View style={styles.chip}>
          <MaterialCommunityIcons name="chef-hat" size={17} color={ui.deepTeal} />
          <Text style={styles.chipText}>Cooking today</Text>
        </View>
      </View>
      <View style={styles.body}>
        {photo ? (
          <Image source={{ uri: photo }} style={styles.photo} contentFit="cover" />
        ) : (
          <View style={[styles.photo, styles.noPhoto]}>
            <MaterialIcons name="soup-kitchen" size={30} color={ui.deepTeal} />
          </View>
        )}
        <View style={styles.info}>
          <Text style={styles.dish} numberOfLines={2}>{dish.dish_name}</Text>
          <Text style={styles.price}>EGP {Number(dish.price_egp)}</Text>
          <Pressable style={styles.where} onPress={pp ? openMap : onPress} hitSlop={6} accessibilityRole={pp ? 'link' : undefined} accessibilityLabel={pp ? `Pickup spot: ${pp.label}. Show on map` : undefined}>
            <MaterialIcons name="location-on" size={17} color={SLATE} />
            <Text style={styles.whereText} numberOfLines={1}>
              {pp?.label ?? 'Ask the cook'}
              <Text style={styles.muted}> · Pickup Only</Text>
            </Text>
          </Pressable>
          <Text style={[styles.muted, soldOut && { color: ui.deep, fontFamily: fonts.bold }]}>
            {fmtReady(Date.parse(dish.ready_at))} · {soldOut ? 'Sold out' : `${dish.portions_left} left`}
          </Text>
          <Pressable style={[styles.order, soldOut && styles.orderOff]} onPress={onPress} accessibilityRole="button" accessibilityLabel={`${soldOut ? 'See' : 'Order a plate of'} ${dish.dish_name}`}>
            <MaterialCommunityIcons name="silverware-fork-knife" size={19} color={colors.white} />
            <Text style={styles.orderText}>{soldOut ? 'See dish' : 'Order a plate'}</Text>
          </Pressable>
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: ui.card, borderRadius: 22, borderWidth: 1, borderColor: ui.border, padding: 14, gap: 12 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  cook: { flex: 1, fontFamily: fonts.bold, fontSize: 16, color: ui.deep },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: ui.mint, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 8 },
  chipText: { fontFamily: fonts.bold, fontSize: 12.5, color: ui.deepTeal },
  body: { flexDirection: 'row', gap: 14, alignItems: 'flex-start' },
  photo: { width: 128, height: 118, borderRadius: 16, backgroundColor: colors.cream },
  noPhoto: { alignItems: 'center', justifyContent: 'center', backgroundColor: ui.mint },
  info: { flex: 1, gap: 5 },
  dish: { fontFamily: fonts.extraBold, fontSize: 21, lineHeight: 26, color: ui.deep },
  price: { fontFamily: fonts.extraBold, fontSize: 18, color: ui.bubble },
  muted: { fontFamily: fonts.medium, fontSize: 14, color: SLATE },
  where: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  whereText: { flexShrink: 1, fontFamily: fonts.medium, fontSize: 14, color: SLATE },
  order: { flexDirection: 'row', alignItems: 'center', gap: 9, alignSelf: 'flex-end', marginTop: 6, backgroundColor: ui.deepTeal, borderRadius: 999, paddingHorizontal: 20, paddingVertical: 13 },
  orderOff: { backgroundColor: ui.deep, opacity: 0.85 },
  orderText: { fontFamily: fonts.extraBold, fontSize: 15, color: colors.white },
});
