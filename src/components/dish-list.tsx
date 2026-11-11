import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useRef, useState } from 'react';
import { FlatList, Pressable, RefreshControl, StyleSheet, View } from 'react-native';

import { Text, TextInput } from '@/components/text';
import { DishCard } from '@/components/dish-card';
import { FilterSheet } from '@/components/filter-sheet';
import { colors, fonts, ui } from '@/constants/theme';
import { distanceMeters } from '@/lib/format';
import { useMyLocation } from '@/lib/location';
import { areaLatLng, CUISINES, type Dish, fetchMyCommunities, fetchTodaysDishes, type MyCommunity } from '@/lib/posts';
import { fetchBadges, type Badge } from '@/lib/rankings';
import { useSession } from '@/lib/session';
import { supabaseConfigured } from '@/lib/supabase';
import { usePullRefresh } from '@/lib/pull-refresh';
import { useRetap } from '@/lib/tab-retap';
import { fetchMemberships } from '@/lib/community';
import { fetchRatings } from '@/lib/cooks';

/**
 * Today's menu (s53): every dish neighbors share on today's menu, narrowed by community, cuisine or search.
 * Starts showing everything; the "Menu filter" sheet (same format as the Home feed filter) narrows by community and cuisine.
 */
const NEARBY = 'nearby';
const NONE = 'none';
/** Search icon and placeholder colour from the design: a soft blue-grey. */
const SLATE = 'rgba(1,49,62,.5)';
/** How close a pickup point must be to the eater to count as "Nearby". */
const NEARBY_METERS = 10_000;
/** The order the list is in. Nearest is the default (newest first while no location is known). */
type Sort = 'nearest' | 'ready' | 'rating' | 'price';
const SORTS: { key: Sort; icon: React.ComponentProps<typeof MaterialIcons>['name']; label: string }[] = [
  { key: 'nearest', icon: 'near-me', label: 'Nearest' },
  { key: 'ready', icon: 'schedule', label: 'Ready soonest' },
  { key: 'rating', icon: 'star', label: 'Top rated' },
  { key: 'price', icon: 'payments', label: 'Lowest price' },
];

export function DishList({
  header,
  belowBar,
  barArt,
  filters = true,
  retapTab,
}: {
  header?: React.ReactElement;
  /** Shown under the search and filter row (the Menu puts the location here). */
  belowBar?: React.ReactElement;
  /** Artwork drawn behind the search and filter row; gets the y of the filter button's top edge inside that row. */
  barArt?: (filterTop: number) => React.ReactElement;
  filters?: boolean;
  retapTab?: string;
}) {
  const { session } = useSession();
  const here = useMyLocation();
  const [dishes, setDishes] = useState<Dish[]>([]);
  const [badges, setBadges] = useState<Map<string, Badge[]>>(new Map());
  const [ratings, setRatings] = useState<Map<string, { avg: number; n: number }>>(new Map());
  const [mine, setMine] = useState<MyCommunity[]>([]);
  // Which communities each cook belongs to, so a community filter also finds cooks who live there.
  const [memberships, setMemberships] = useState<Map<string, string[]>>(new Map());
  // What the member ticked. Nothing ticked in a section means no limit for that section, so one tick is enough.
  // Places: 'nearby' or a community id (a dish shows if it matches any ticked place). Cuisines: any ticked cuisine.
  const [places, setPlaces] = useState<string[]>([]);
  const [cuisines, setCuisines] = useState<string[]>([]);
  const [sort, setSort] = useState<Sort>('nearest');
  const [filterOpen, setFilterOpen] = useState(false);
  const [filterTop, setFilterTop] = useState<number | null>(null);
  const [q, setQ] = useState('');
  const [loading, setLoading] = useState(true);
  // Only a pull-down shows the spinner. Showing it for the automatic loads pushes the whole list down and leaves a blank gap.
  const [failed, setFailed] = useState(false);

  const load = useCallback(async () => {
    if (!supabaseConfigured) return setLoading(false);
    setLoading(true);
    try {
      // Your own dishes live on your profile ("Today's menu" tab); this list is what other members offer.
      const me = session?.user.id;
      const list = (await fetchTodaysDishes()).filter((d) => d.author_id !== me);
      setDishes(list);
      // Rank badges are a nicety: if they fail to load the cards still show.
      fetchBadges(list.map((d) => d.author_id)).then(setBadges, () => {});
      fetchMemberships(list.map((d) => d.author_id)).then(setMemberships, () => {});
      fetchRatings(list.map((d) => d.author_id)).then(setRatings, () => {});
      if (session) setMine(await fetchMyCommunities(session.user.id));
      setFailed(false);
    } catch {
      setFailed(true);
    }
    setLoading(false);
  }, [session]);

  // Reload when the tab comes back into view, e.g. after posting or ordering.
  const pull = usePullRefresh(load);
  const listRef = useRef<FlatList<Dish>>(null);
  // Tapping the tab you are on (Menu): back to the top and refresh, filters untouched.
  useRetap(retapTab ?? '', () => {
    if (!retapTab) return;
    listRef.current?.scrollToOffset({ offset: 0, animated: true });
    pull.reload();
  });
  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    // Nearby is the one place filter based on distance: the dish's pickup point against where the eater is now.
    // Without a known location it can't narrow anything, so it lets every dish through.
    const near = (d: Dish) => !here || (d.pickup_point != null && distanceMeters(here, areaLatLng(d.pickup_point)) <= NEARBY_METERS);
    const list = dishes.filter(
      (d) =>
        (!places.length || places.some((p) => (p === NEARBY ? near(d) : d.community_ids.includes(p) || (memberships.get(d.author_id) ?? []).includes(p)))) &&
        (!cuisines.length || (d.cuisine != null && cuisines.includes(d.cuisine))) &&
        (!needle || d.dish_name.toLowerCase().includes(needle)),
    );
    // Nearest is the default: closest first once we know where the member is, otherwise newest first. Ties keep that order.
    const dist = (d: Dish) => (here && d.pickup_point ? distanceMeters(here, areaLatLng(d.pickup_point)) : Infinity);
    if (sort === 'ready') return [...list].sort((a, b) => Date.parse(a.ready_at) - Date.parse(b.ready_at) || dist(a) - dist(b));
    if (sort === 'rating') return [...list].sort((a, b) => (ratings.get(b.author_id)?.avg ?? -1) - (ratings.get(a.author_id)?.avg ?? -1) || dist(a) - dist(b));
    if (sort === 'price') return [...list].sort((a, b) => a.price_egp - b.price_egp || dist(a) - dist(b));
    return here ? [...list].sort((a, b) => dist(a) - dist(b)) : list;
  }, [dishes, places, cuisines, q, here, memberships, sort, ratings]);

  const cuisineOptions = CUISINES.filter((c) => dishes.some((d) => d.cuisine === c));
  const allShown = !places.length && !cuisines.length && sort === 'nearest';
  // Everything shows ticked at first. Internally "nothing stored" means no limit, so ticking everything is stored as nothing.
  // NONE is the "Clear all" state: it matches nothing until something is ticked.
  const placeKeys = [NEARBY, ...(session ? mine.map((c) => c.id) : [])];
  const placeOn = (k: string) => (places.includes(NONE) ? false : places.length ? places.includes(k) : true);
  const cuisineOn = (k: string) => (cuisines.includes(NONE) ? false : cuisines.length ? cuisines.includes(k) : true);
  const flip = (keys: string[], on: (k: string) => boolean, k: string) => {
    const cur = keys.filter(on);
    const next = on(k) ? cur.filter((x) => x !== k) : [...cur, k];
    return next.length === keys.length ? [] : next.length ? next : [NONE];
  };
  // After "Clear all", ticking one row in a section means "just this, from anywhere" for the other section.
  const pickPlace = (k: string) => {
    setPlaces(flip(placeKeys, placeOn, k));
    if (cuisines.includes(NONE)) setCuisines([]);
  };
  const pickCuisine = (k: string) => {
    setCuisines(flip(cuisineOptions, cuisineOn, k));
    if (places.includes(NONE)) setPlaces([]);
  };
  const noneTicked = !placeKeys.some(placeOn) && !cuisineOptions.some(cuisineOn);
  const selectAll = () => {
    setPlaces([]);
    setCuisines([]);
  };
  // Not the Sort section: Select all and Clear all only touch the ticks.
  const clearAll = () => {
    setPlaces([NONE]);
    setCuisines([NONE]);
  };
  const sections = [
    { label: 'SORT BY', radio: true, rows: SORTS.map((o) => ({ key: o.key, icon: o.icon, label: o.label, on: sort === o.key, onPress: () => setSort(o.key) })) },
    {
      label: 'LOCATION',
      rows: [{ key: NEARBY, icon: 'near-me' as const, label: 'Nearby', on: placeOn(NEARBY), onPress: () => pickPlace(NEARBY) }],
    },
    ...(session && mine.length
      ? [
          {
            label: 'COMMUNITIES',
            rows: mine.map((c) => ({
              key: c.id,
              icon: (c.kind === 'club' ? 'flag' : 'groups') as 'flag' | 'groups',
              label: c.name,
              on: placeOn(c.id),
              onPress: () => pickPlace(c.id),
            })),
          },
        ]
      : []),
    {
      label: 'CUISINE',
      rows: cuisineOptions.map((c) => ({
        key: c,
        icon: 'restaurant' as const,
        label: c,
        on: cuisineOn(c),
        onPress: () => pickCuisine(c),
      })),
    },
  ];

  const empty = !supabaseConfigured
    ? 'The app isn’t connected to the server yet.'
    : failed
      ? 'We couldn’t load today’s menu. Pull down to try again.'
      : loading
        ? ''
        : dishes.length
          ? 'Nothing matches today. Try another place or cuisine.'
          : 'Nothing on today’s menu yet.';

  return (
    <>
    <FlatList
      ref={listRef}
      data={shown}
      keyExtractor={(d) => d.id}
      renderItem={({ item }) => <DishCard dish={item} here={here} badges={badges.get(item.author_id)} rating={ratings.get(item.author_id)} onPress={() => router.push({ pathname: '/dish/[id]', params: { id: item.id } })} />}
      style={{ backgroundColor: ui.page }}
      contentContainerStyle={styles.list}
      refreshControl={<RefreshControl refreshing={pull.refreshing} onRefresh={pull.onRefresh} tintColor={ui.deepTeal} />}
      ListHeaderComponent={
        <View style={{ gap: 14 }}>
          {header}
          {filters ? (
            <View>
              {barArt && filterTop != null ? barArt(filterTop) : null}
              <View style={styles.bar}>
                <View style={styles.searchBox}>
                  <MaterialIcons name="search" size={22} color={SLATE} />
                  <TextInput value={q} onChangeText={setQ} placeholder="Search dishes" placeholderTextColor={SLATE} style={styles.search} accessibilityLabel="Search dishes" />
                </View>
                <Pressable style={styles.filter} onLayout={(e) => setFilterTop(e.nativeEvent.layout.y)} onPress={() => setFilterOpen(true)} accessibilityRole="button" accessibilityLabel="Sort and filter the menu">
                  <MaterialIcons name="tune" size={18} color={colors.white} />
                  <Text style={styles.filterText} maxFontSizeMultiplier={1.15}>{allShown ? 'Everyone' : 'Custom'}</Text>
                  <MaterialIcons name="expand-more" size={18} color={colors.white} />
                </Pressable>
              </View>
            </View>
          ) : null}
          {belowBar}
        </View>
      }
      ListEmptyComponent={empty ? <Text style={styles.empty}>{empty}</Text> : null}
    />
      <FilterSheet visible={filterOpen} title="Menu filter" sub="" sections={sections} onClose={() => { if (noneTicked) selectAll(); setFilterOpen(false); }} onSelectAll={selectAll} onClearAll={clearAll} applyLabel={shown.length ? `Show ${shown.length} ${shown.length === 1 ? 'dish' : 'dishes'}` : 'No dishes match'} />
    </>
  );
}

const styles = StyleSheet.create({
  list: { padding: 14, gap: 14 },
  bar: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  searchBox: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: ui.card, borderWidth: 1, borderColor: colors.lightBlue, borderRadius: 18, paddingHorizontal: 14 },
  search: { flex: 1, fontFamily: fonts.semiBold, fontSize: 15, color: ui.deep, paddingVertical: 10 },
  filter: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: ui.deep, borderRadius: 999, paddingHorizontal: 12, height: 34, flexShrink: 0 },
  filterText: { fontFamily: fonts.bold, fontSize: 13, color: colors.white },
  empty: { fontFamily: fonts.semiBold, fontSize: 14, color: colors.muted, textAlign: 'center', marginTop: 40, paddingHorizontal: 20, lineHeight: 20 },
});
