import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, TextInput, View } from 'react-native';

import { DishCard } from '@/components/dish-card';
import { FilterSheet } from '@/components/filter-sheet';
import { colors, fonts } from '@/constants/theme';
import { distanceMeters } from '@/lib/format';
import { useMyLocation } from '@/lib/location';
import { CUISINES, type Dish, fetchMyCommunities, fetchTodaysDishes, type MyCommunity } from '@/lib/posts';
import { useSession } from '@/lib/session';
import { supabaseConfigured } from '@/lib/supabase';

/**
 * Today's menu (s53): every dish neighbors are cooking today, narrowed by community, cuisine or search.
 * Starts showing everything; the "Menu filter" sheet (same format as the Home feed filter) narrows by community and cuisine.
 */
export function DishList({ header, filters = true }: { header?: React.ReactElement; filters?: boolean }) {
  const { session } = useSession();
  const here = useMyLocation();
  const [dishes, setDishes] = useState<Dish[]>([]);
  const [mine, setMine] = useState<MyCommunity[]>([]);
  // null = nothing chosen yet, which means everything shows. Once chosen, the sets are what the member ticked.
  const [communities, setCommunities] = useState<string[] | null>(null);
  const [others, setOthers] = useState(true);
  const [cuisines, setCuisines] = useState<string[] | null>(null);
  const [filterOpen, setFilterOpen] = useState(false);
  const [q, setQ] = useState('');
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  const load = useCallback(async () => {
    if (!supabaseConfigured) return setLoading(false);
    setLoading(true);
    try {
      setDishes(await fetchTodaysDishes());
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
    const mineIds = new Set(mine.map((c) => c.id));
    const chosen = new Set(communities ?? mine.map((c) => c.id));
    const needle = q.trim().toLowerCase();
    const list = dishes.filter(
      (d) =>
        (!session || (mineIds.has(d.community_id ?? '') ? chosen.has(d.community_id ?? '') : others)) &&
        (!cuisines || (d.cuisine != null && cuisines.includes(d.cuisine))) &&
        (!needle || `${d.dish_name} ${d.author.display_name ?? ''} ${d.author.username ?? ''}`.toLowerCase().includes(needle)),
    );
    // Nearest first once we know where the member is; otherwise newest first.
    if (here) {
      const dist = (d: Dish) => (d.pickup_point ? distanceMeters(here, d.pickup_point) : Infinity);
      return [...list].sort((a, b) => dist(a) - dist(b));
    }
    return list;
  }, [dishes, mine, communities, others, cuisines, q, here, session]);

  const cuisineOptions = CUISINES.filter((c) => dishes.some((d) => d.cuisine === c));
  const allShown = !cuisines && (!session || (others && (communities === null || mine.every((c) => communities.includes(c.id)))));
  const toggleIn = (list: string[] | null, all: string[], id: string) => {
    const cur = list ?? all;
    return cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id];
  };
  const sections = [
    ...(session
      ? [
          {
            label: 'COMMUNITIES',
            rows: [
              ...mine.map((c) => ({
                key: c.id,
                icon: (c.kind === 'club' ? 'flag' : 'groups') as 'flag' | 'groups',
                label: c.name,
                on: (communities ?? mine.map((m) => m.id)).includes(c.id),
                onPress: () => setCommunities(toggleIn(communities, mine.map((m) => m.id), c.id)),
              })),
              { key: 'others', icon: 'public' as const, label: 'Other communities', on: others, onPress: () => setOthers(!others) },
            ],
          },
        ]
      : []),
    {
      label: 'CUISINE',
      rows: cuisineOptions.map((c) => ({
        key: c,
        icon: 'restaurant' as const,
        label: c,
        on: (cuisines ?? cuisineOptions).includes(c),
        onPress: () => {
          const next = toggleIn(cuisines, cuisineOptions, c);
          setCuisines(next.length === cuisineOptions.length ? null : next);
        },
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
          ? 'Nothing matches today. Try another community or cuisine.'
          : 'No one has posted what they’re cooking today yet.';

  return (
    <>
    <FlatList
      data={shown}
      keyExtractor={(d) => d.id}
      renderItem={({ item }) => <DishCard dish={item} here={here} onPress={() => router.push({ pathname: '/dish/[id]', params: { id: item.id } })} />}
      contentContainerStyle={styles.list}
      refreshControl={<RefreshControl refreshing={loading} onRefresh={load} tintColor={colors.teal} />}
      ListHeaderComponent={
        <View style={{ gap: 10 }}>
          {header}
          {filters ? (
            <>
              <TextInput value={q} onChangeText={setQ} placeholder="Search dishes or cooks" placeholderTextColor={colors.faint} style={styles.search} accessibilityLabel="Search dishes or cooks" />
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
      <FilterSheet visible={filterOpen} title="Menu filter" sub="Choose which dishes show on today’s menu." sections={sections} onClose={() => setFilterOpen(false)} />
    </>
  );
}

const styles = StyleSheet.create({
  list: { padding: 16, gap: 12 },
  search: { fontFamily: fonts.semiBold, fontSize: 15, color: colors.ink, backgroundColor: colors.white, borderWidth: 1, borderColor: colors.line, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 11 },
  filter: { flexDirection: 'row', alignItems: 'center', gap: 7, alignSelf: 'flex-start', backgroundColor: colors.navy, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 9 },
  filterText: { fontFamily: fonts.bold, fontSize: 14, color: colors.white },
  empty: { fontFamily: fonts.semiBold, fontSize: 14, color: colors.muted, textAlign: 'center', marginTop: 40, paddingHorizontal: 20, lineHeight: 20 },
});
