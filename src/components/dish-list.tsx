import { router, useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { FlatList, RefreshControl, StyleSheet, Text, TextInput, View } from 'react-native';

import { Chip } from '@/components/chip';
import { DishCard } from '@/components/dish-card';
import { colors, fonts } from '@/constants/theme';
import { distanceMeters } from '@/lib/format';
import { useMyLocation } from '@/lib/location';
import { CUISINES, type Dish, fetchMyCommunities, fetchTodaysDishes, type MyCommunity } from '@/lib/posts';
import { useSession } from '@/lib/session';
import { supabaseConfigured } from '@/lib/supabase';

/**
 * Today's menu (s53): every dish neighbors are cooking today, narrowed by community, cuisine or search.
 * Signed-in members start on their own communities; guests see everything.
 */
export function DishList({ header, filters = true }: { header?: React.ReactElement; filters?: boolean }) {
  const { session } = useSession();
  const here = useMyLocation();
  const [dishes, setDishes] = useState<Dish[]>([]);
  const [mine, setMine] = useState<MyCommunity[]>([]);
  const [community, setCommunity] = useState<string>('mine');
  const [cuisine, setCuisine] = useState<string | null>(null);
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
    const needle = q.trim().toLowerCase();
    const list = dishes.filter(
      (d) =>
        (community === 'all' || !session || (community === 'mine' ? mineIds.has(d.community_id ?? '') : d.community_id === community)) &&
        (!cuisine || d.cuisine === cuisine) &&
        (!needle || `${d.dish_name} ${d.author.display_name ?? ''} ${d.author.username ?? ''}`.toLowerCase().includes(needle)),
    );
    // Nearest first once we know where the member is; otherwise newest first.
    if (here) {
      const dist = (d: Dish) => (d.pickup_point ? distanceMeters(here, d.pickup_point) : Infinity);
      return [...list].sort((a, b) => dist(a) - dist(b));
    }
    return list;
  }, [dishes, mine, community, cuisine, q, here, session]);

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
              <TextInput value={q} onChangeText={setQ} placeholder="Search dishes or cooks" placeholderTextColor="#9aa39f" style={styles.search} accessibilityLabel="Search dishes or cooks" />
              {session ? (
                <>
                  <Text style={styles.label}>COMMUNITY</Text>
                  <View style={styles.chips}>
                    <Chip label="My communities" on={community === 'mine'} onPress={() => setCommunity('mine')} />
                    {mine.map((c) => (
                      <Chip key={c.id} label={c.name} on={community === c.id} onPress={() => setCommunity(c.id)} />
                    ))}
                    <Chip label="All" on={community === 'all'} onPress={() => setCommunity('all')} />
                  </View>
                </>
              ) : null}
              <Text style={styles.label}>CUISINE</Text>
              <View style={styles.chips}>
                <Chip label="Any" on={!cuisine} onPress={() => setCuisine(null)} />
                {CUISINES.filter((c) => dishes.some((d) => d.cuisine === c)).map((c) => (
                  <Chip key={c} label={c} on={cuisine === c} onPress={() => setCuisine(c)} />
                ))}
              </View>
            </>
          ) : null}
        </View>
      }
      ListEmptyComponent={empty ? <Text style={styles.empty}>{empty}</Text> : null}
    />
  );
}

const styles = StyleSheet.create({
  list: { padding: 16, gap: 12 },
  search: { fontFamily: fonts.semiBold, fontSize: 15, color: colors.ink, backgroundColor: colors.white, borderWidth: 1, borderColor: colors.line, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 11 },
  label: { fontFamily: fonts.extraBold, fontSize: 10.5, letterSpacing: 0.6, color: colors.muted, marginTop: 4 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  empty: { fontFamily: fonts.semiBold, fontSize: 14, color: colors.muted, textAlign: 'center', marginTop: 40, paddingHorizontal: 20, lineHeight: 20 },
});
