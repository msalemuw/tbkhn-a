import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, TextInput, View } from 'react-native';

import { DishCard } from '@/components/dish-card';
import { FilterSheet } from '@/components/filter-sheet';
import { colors, fonts, ui } from '@/constants/theme';
import { distanceMeters } from '@/lib/format';
import { useMyLocation } from '@/lib/location';
import { CUISINES, type Dish, fetchMyCommunities, fetchTodaysDishes, type MyCommunity } from '@/lib/posts';
import { useSession } from '@/lib/session';
import { supabaseConfigured } from '@/lib/supabase';

/**
 * Today's menu (s53): every dish neighbors share on today's menu, narrowed by community, cuisine or search.
 * Starts showing everything; the "Menu filter" sheet (same format as the Home feed filter) narrows by community and cuisine.
 */
const NEARBY = 'nearby';
/** Search icon and placeholder colour from the design: a soft blue-grey. */
const SLATE = 'rgba(1,49,62,.5)';
/** How close a pickup point must be to the eater to count as "Nearby". */
const NEARBY_METERS = 10_000;

export function DishList({ header, filters = true }: { header?: React.ReactElement; filters?: boolean }) {
  const { session } = useSession();
  const here = useMyLocation();
  const [dishes, setDishes] = useState<Dish[]>([]);
  const [mine, setMine] = useState<MyCommunity[]>([]);
  // What the member ticked. Nothing ticked in a section means no limit for that section, so one tick is enough.
  // Places: 'nearby' or a community id (a dish shows if it matches any ticked place). Cuisines: any ticked cuisine.
  const [places, setPlaces] = useState<string[]>([]);
  const [cuisines, setCuisines] = useState<string[]>([]);
  const [filterOpen, setFilterOpen] = useState(false);
  const [q, setQ] = useState('');
  const [loading, setLoading] = useState(true);
  // Only a pull-down shows the spinner. Showing it for the automatic loads pushes the whole list down and leaves a blank gap.
  const [pulling, setPulling] = useState(false);
  const [failed, setFailed] = useState(false);

  const load = useCallback(async () => {
    if (!supabaseConfigured) return setLoading(false);
    setLoading(true);
    try {
      // Your own dishes live on your profile ("Today's menu" tab); this list is what other members offer.
      const me = session?.user.id;
      setDishes((await fetchTodaysDishes()).filter((d) => d.author_id !== me));
      if (session) setMine(await fetchMyCommunities(session.user.id));
      setFailed(false);
    } catch {
      setFailed(true);
    }
    setLoading(false);
  }, [session]);

  // Reload when the tab comes back into view, e.g. after posting or ordering.
  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    // Nearby is the one place filter based on distance: the dish's pickup point against where the eater is now.
    // Without a known location it can't narrow anything, so it lets every dish through.
    const near = (d: Dish) => !here || (d.pickup_point != null && distanceMeters(here, d.pickup_point) <= NEARBY_METERS);
    const list = dishes.filter(
      (d) =>
        (!places.length || places.some((p) => (p === NEARBY ? near(d) : d.community_ids.includes(p)))) &&
        (!cuisines.length || (d.cuisine != null && cuisines.includes(d.cuisine))) &&
        (!needle || d.dish_name.toLowerCase().includes(needle)),
    );
    // Nearest first once we know where the member is; otherwise newest first.
    if (here) {
      const dist = (d: Dish) => (d.pickup_point ? distanceMeters(here, d.pickup_point) : Infinity);
      return [...list].sort((a, b) => dist(a) - dist(b));
    }
    return list;
  }, [dishes, places, cuisines, q, here]);

  const cuisineOptions = CUISINES.filter((c) => dishes.some((d) => d.cuisine === c));
  const allShown = !places.length && !cuisines.length;
  const toggleIn = (list: string[], id: string) => (list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);
  const sections = [
    {
      label: 'LOCATION',
      rows: [{ key: NEARBY, icon: 'near-me' as const, label: 'Nearby', on: places.includes(NEARBY), onPress: () => setPlaces(toggleIn(places, NEARBY)) }],
    },
    ...(session && mine.length
      ? [
          {
            label: 'COMMUNITIES',
            rows: mine.map((c) => ({
              key: c.id,
              icon: (c.kind === 'club' ? 'flag' : 'groups') as 'flag' | 'groups',
              label: c.name,
              on: places.includes(c.id),
              onPress: () => setPlaces(toggleIn(places, c.id)),
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
        on: cuisines.includes(c),
        onPress: () => setCuisines(toggleIn(cuisines, c)),
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
      data={shown}
      keyExtractor={(d) => d.id}
      renderItem={({ item }) => <DishCard dish={item} here={here} onPress={() => router.push({ pathname: '/dish/[id]', params: { id: item.id } })} />}
      style={{ backgroundColor: ui.page }}
      contentContainerStyle={styles.list}
      refreshControl={<RefreshControl refreshing={pulling} onRefresh={() => { setPulling(true); load().finally(() => setPulling(false)); }} tintColor={ui.deepTeal} />}
      ListHeaderComponent={
        <View style={{ gap: 14 }}>
          {header}
          {filters ? (
            <>
              <View style={styles.searchBox}>
                <MaterialIcons name="search" size={24} color={SLATE} />
                <TextInput value={q} onChangeText={setQ} placeholder="Search dishes" placeholderTextColor={SLATE} style={styles.search} accessibilityLabel="Search dishes" />
              </View>
              <Pressable style={styles.filter} onPress={() => setFilterOpen(true)} accessibilityRole="button" accessibilityLabel="Filter the menu">
                <MaterialIcons name="tune" size={18} color={colors.white} />
                <Text style={styles.filterText}>Menu filter: {allShown ? 'Everyone' : 'Custom'}</Text>
                <MaterialIcons name="expand-more" size={18} color={colors.white} />
              </Pressable>
            </>
          ) : null}
        </View>
      }
      ListEmptyComponent={empty ? <Text style={styles.empty}>{empty}</Text> : null}
    />
      <FilterSheet visible={filterOpen} title="Menu filter" sub="Tick what you want to see. Nothing ticked shows everything." sections={sections} onClose={() => setFilterOpen(false)} />
    </>
  );
}

const styles = StyleSheet.create({
  list: { padding: 14, gap: 14 },
  searchBox: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: ui.card, borderWidth: 1, borderColor: colors.lightBlue, borderRadius: 18, paddingHorizontal: 14 },
  search: { flex: 1, fontFamily: fonts.semiBold, fontSize: 15, color: ui.deep, paddingVertical: 13 },
  filter: { flexDirection: 'row', alignItems: 'center', gap: 7, alignSelf: 'flex-start', backgroundColor: ui.deep, borderRadius: 999, paddingHorizontal: 16, paddingVertical: 11 },
  filterText: { fontFamily: fonts.bold, fontSize: 14, color: colors.white },
  empty: { fontFamily: fonts.semiBold, fontSize: 14, color: colors.muted, textAlign: 'center', marginTop: 40, paddingHorizontal: 20, lineHeight: 20 },
});
