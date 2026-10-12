import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { DishCard } from '@/components/dish-card';
import { colors, fonts } from '@/constants/theme';
import { fetchCommunityOverview } from '@/lib/community';
import { useMyLocation } from '@/lib/location';
import type { Dish } from '@/lib/posts';

// Today’s menu in one community (opened from the "Today’s menu" count), with the same dish cards as the Menu.
export default function CommunityToday() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const here = useMyLocation();
  const [name, setName] = useState('');
  const [dishes, setDishes] = useState<Dish[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    fetchCommunityOverview(id).then(
      (d) => {
        setName(d?.info.name ?? '');
        setDishes(d?.today ?? []);
      },
      () => setFailed(true),
    );
  }, [id]);

  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.head}>
        <Pressable onPress={() => (router.canGoBack() ? router.back() : router.replace('/home'))} hitSlop={10} accessibilityRole="button" accessibilityLabel="Back">
          <MaterialIcons name="arrow-back" size={24} color={colors.ink} />
        </Pressable>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={styles.title} numberOfLines={1}>Today’s menu{name ? ` in ${name}` : ''}</Text>
          <Text style={styles.sub}>Gone at midnight</Text>
        </View>
      </View>
      {failed ? (
        <Text style={styles.empty}>We couldn’t load today’s dishes. Check your connection and try again.</Text>
      ) : dishes === null ? (
        <ActivityIndicator color={colors.teal} style={{ marginTop: 20 }} />
      ) : (
        <FlatList
          data={dishes}
          keyExtractor={(d) => d.id}
          contentContainerStyle={{ paddingHorizontal: 22, paddingBottom: 30, paddingTop: 12, gap: 12 }}
          ListEmptyComponent={<Text style={styles.empty}>Nothing on today’s menu in {name || 'this community'} yet.</Text>}
          renderItem={({ item }) => <DishCard dish={item} here={here} onPress={() => router.push({ pathname: '/dish/[id]', params: { id: item.id } })} />}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.paper },
  head: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 22, paddingTop: 6 },
  title: { fontFamily: fonts.extraBold, fontSize: 18, color: colors.ink },
  sub: { fontFamily: fonts.semiBold, fontSize: 12.5, color: colors.muted, marginTop: 1 },
  empty: { fontFamily: fonts.semiBold, fontSize: 13, color: colors.muted, textAlign: 'center', padding: 22 },
});
