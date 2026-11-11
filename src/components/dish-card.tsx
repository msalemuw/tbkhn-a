import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';

import { Text } from '@/components/text';
import { Avatar } from '@/components/avatar';
import { RankBadge } from '@/components/rank-badge';
import { colors, fonts, ui } from '@/constants/theme';
import { distanceMeters, fmtDist, fmtReady, type LatLng } from '@/lib/format';
import { areaLatLng, type Dish, mediaUrl, personName } from '@/lib/posts';
import type { Badge } from '@/lib/rankings';

/** Secondary text colour from the design: a soft blue-grey. */
const SLATE = 'rgba(1,49,62,.55)';

/**
 * One offering in Today's menu (s53), laid out like the new design: cook line with a "rank badge, the photo beside
 * the dish details, and an "Order a plate" button. The pin line shows the distance to the pickup area (never the exact spot) and opens its map.
 */
export function DishCard({ dish, here, badges, rating, onPress }: { dish: Dish; here: LatLng | null; badges?: Badge[]; rating?: { avg: number; n: number }; onPress: () => void }) {
  const photo = mediaUrl(dish.media_path);
  const pp = dish.pickup_point;
  const dist = here && pp ? fmtDist(distanceMeters(here, areaLatLng(pp))) : null;
  const soldOut = dish.portions_left === 0;
  const openMap = () => pp && router.push({ pathname: '/pickup-map', params: { lat: String(pp.area_lat), lng: String(pp.area_lng), area: '1', who: personName(dish.author) } });
  const openCook = () => router.push({ pathname: '/cook/[id]', params: { id: dish.author_id } });

  return (
    <Pressable style={styles.card} onPress={onPress} accessibilityRole="button" accessibilityLabel={`${dish.dish_name} by ${personName(dish.author)}`}>
      <View>
        {photo ? (
          <Image source={{ uri: photo }} style={styles.photo} contentFit="cover" />
        ) : (
          <View style={[styles.photo, styles.noPhoto]}>
            <MaterialIcons name="soup-kitchen" size={44} color={ui.deepTeal} />
          </View>
        )}
        {/* The cook's circle sits on the photo's top left, so the card has no empty strip of its own. */}
        <Pressable style={styles.avatar} onPress={openCook} accessibilityRole="link" accessibilityLabel={`${personName(dish.author)}'s profile`} hitSlop={6}>
          <Avatar person={dish.author} size={44} />
        </Pressable>
      </View>
      <View style={styles.info}>
        <View style={styles.titleRow}>
          <Text style={styles.dish} numberOfLines={2}>{dish.dish_name}</Text>
          {/* Price with the ready time and plates left under it, so the card needs no separate line for them. */}
          <View style={styles.priceCol}>
            <Text style={styles.price}>EGP {Number(dish.price_egp)}</Text>
            <Text style={[styles.muted, soldOut && { color: ui.deep, fontFamily: fonts.bold }]}>
              {fmtReady(Date.parse(dish.ready_at))} · {soldOut ? 'Sold out' : `${dish.portions_left} left`}
            </Text>
          </View>
        </View>
        {/* One line: who cooks it, their rating, and how far the pickup area is. */}
        <View style={styles.cookRow}>
          <Text style={styles.cook} numberOfLines={1} onPress={openCook} accessibilityRole="link">{personName(dish.author)}</Text>
          {rating ? <Text style={styles.rating}>{`★ ${rating.avg.toFixed(1)} (${rating.n})`}</Text> : null}
          {badges?.map((b) => <RankBadge key={b.kind} badge={b} />)}
          <Pressable style={styles.where} onPress={pp ? openMap : onPress} hitSlop={6} accessibilityRole={pp ? 'link' : undefined} accessibilityLabel={pp ? 'Pickup area. Show on map' : undefined}>
            <MaterialIcons name="location-on" size={17} color={SLATE} />
            <Text style={styles.whereText} numberOfLines={1}>
              {dist ? `${dist} away` : 'Pickup Only'}
            </Text>
          </Pressable>
        </View>
      </View>
      <Pressable style={[styles.order, soldOut && styles.orderOff]} onPress={onPress} accessibilityRole="button" accessibilityLabel={`${soldOut ? 'See' : 'Order a plate of'} ${dish.dish_name}`}>
        <MaterialCommunityIcons name="silverware-fork-knife" size={19} color={colors.white} />
        <Text style={styles.orderText}>{soldOut ? 'See dish' : 'Order a plate'}</Text>
      </Pressable>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: ui.card, borderRadius: 22, borderWidth: 1, borderColor: ui.border, padding: 10, gap: 12 },
  photo: { width: '100%', aspectRatio: 4 / 3, borderRadius: 16, backgroundColor: colors.cream },
  noPhoto: { alignItems: 'center', justifyContent: 'center', backgroundColor: ui.mint },
  avatar: { position: 'absolute', top: 10, left: 10, borderRadius: 999, borderWidth: 2.5, borderColor: colors.white, backgroundColor: colors.white },
  info: { gap: 6, paddingHorizontal: 4 },
  titleRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 },
  dish: { flex: 1, fontFamily: fonts.extraBold, fontSize: 19, lineHeight: 24, color: ui.deep },
  priceCol: { alignItems: 'flex-end', gap: 2 },
  price: { fontFamily: fonts.extraBold, fontSize: 18, lineHeight: 24, color: ui.bubble },
  cookRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', columnGap: 10, rowGap: 4 },
  cook: { flexShrink: 1, fontFamily: fonts.bold, fontSize: 15, color: ui.deep },
  rating: { fontFamily: fonts.semiBold, fontSize: 13, color: SLATE },
  muted: { fontFamily: fonts.medium, fontSize: 13, color: SLATE },
  where: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  whereText: { flexShrink: 1, fontFamily: fonts.medium, fontSize: 14, color: SLATE },
  order: { flexDirection: 'row', alignItems: 'center', gap: 9, justifyContent: 'center', backgroundColor: ui.deepTeal, borderRadius: 999, paddingHorizontal: 20, paddingVertical: 13 },
  orderOff: { backgroundColor: ui.deep, opacity: 0.85 },
  orderText: { fontFamily: fonts.extraBold, fontSize: 15, color: colors.white },
});
