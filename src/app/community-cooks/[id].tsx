import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Avatar } from '@/components/avatar';
import { colors, fonts } from '@/constants/theme';
import { fetchCommunityOverview, fetchCommunityPeople } from '@/lib/community';
import { type Person, personName } from '@/lib/posts';

// "Cooks in <community>" (design s60): everyone who has posted a dish for the community, with a search box.
export default function CommunityCooks() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [name, setName] = useState('');
  const [people, setPeople] = useState<Person[] | null>(null);
  const [today, setToday] = useState(0);
  const [q, setQ] = useState('');

  useEffect(() => {
    (async () => {
      const d = await fetchCommunityOverview(id);
      if (!d) return setPeople([]);
      setName(d.info.name);
      setToday(d.today.length);
      const map = await fetchCommunityPeople(d.cookIds);
      setPeople([...map.values()].sort((a, b) => personName(a).localeCompare(personName(b))));
    })().catch(() => setPeople([]));
  }, [id]);

  const needle = q.trim().toLowerCase().replace(/^@/, '');
  const shown = (people ?? []).filter((p) => !needle || `${p.display_name ?? ''} ${p.username ?? ''}`.toLowerCase().includes(needle));

  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.head}>
        <Pressable onPress={() => (router.canGoBack() ? router.back() : router.replace('/home'))} hitSlop={10} accessibilityRole="button" accessibilityLabel="Back">
          <MaterialIcons name="arrow-back" size={24} color={colors.ink} />
        </Pressable>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={styles.title} numberOfLines={1}>Cooks in {name}</Text>
          <Text style={styles.sub}>{people?.length ?? 0} cooks · {today} cooking today</Text>
        </View>
      </View>
      <View style={styles.search}>
        <MaterialIcons name="search" size={21} color={colors.ink} />
        <TextInput style={styles.input} value={q} onChangeText={setQ} placeholder="Search cooks" placeholderTextColor={colors.muted} autoCapitalize="none" autoCorrect={false} accessibilityLabel="Search cooks" />
      </View>
      {people === null ? (
        <ActivityIndicator color={colors.teal} style={{ marginTop: 20 }} />
      ) : (
        <FlatList
          data={shown}
          keyExtractor={(p) => p.id}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ paddingHorizontal: 22, paddingBottom: 30 }}
          ListEmptyComponent={<Text style={styles.empty}>No cooks found.</Text>}
          renderItem={({ item }) => (
            <Pressable style={styles.row} onPress={() => router.push({ pathname: '/cook/[id]', params: { id: item.id } })} accessibilityRole="button">
              <Avatar person={item} size={46} />
              <View style={{ flex: 1, minWidth: 0 }}>
                <View style={styles.nameRow}>
                  <Text style={styles.name} numberOfLines={1}>{personName(item)}</Text>
                  <MaterialIcons name="verified" size={15} color={colors.teal} />
                </View>
                {item.username ? <Text style={styles.rowSub}>@{item.username}</Text> : null}
              </View>
              <MaterialIcons name="chevron-right" size={22} color={colors.muted} />
            </Pressable>
          )}
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
  search: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: colors.white, borderWidth: 1, borderColor: colors.line, borderRadius: 16, paddingHorizontal: 15, paddingVertical: 11, marginHorizontal: 22, marginVertical: 12 },
  input: { flex: 1, minWidth: 0, fontFamily: fonts.medium, fontSize: 15, color: colors.ink, padding: 0 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 13, borderBottomWidth: 1, borderBottomColor: colors.line },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  name: { fontFamily: fonts.bold, fontSize: 15, color: colors.ink, flexShrink: 1 },
  rowSub: { fontFamily: fonts.semiBold, fontSize: 12.5, color: colors.muted, marginTop: 1 },
  empty: { fontFamily: fonts.semiBold, fontSize: 13, color: colors.muted, textAlign: 'center', marginTop: 24 },
});
