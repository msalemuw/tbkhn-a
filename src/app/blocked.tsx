import { useCallback, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Text } from '@/components/text';
import { Alert } from '@/lib/alert';
import { Avatar } from '@/components/avatar';
import { BackHeader } from '@/components/form';
import { colors, fonts } from '@/constants/theme';
import { fetchBlockedPeople, unblockMember } from '@/lib/blocks';
import { type Person, personName } from '@/lib/posts';

/** Settings > Blocked accounts: everyone the member has blocked, with an Unblock button. */
export default function Blocked() {
  const [people, setPeople] = useState<Person[] | null>(null);
  const [failed, setFailed] = useState(false);

  useFocusEffect(
    useCallback(() => {
      fetchBlockedPeople().then(
        (p) => {
          setPeople(p);
          setFailed(false);
        },
        () => {
          setPeople([]);
          setFailed(true);
        },
      );
    }, []),
  );

  function unblock(p: Person) {
    unblockMember(p.id).then(
      () => setPeople((l) => (l ?? []).filter((x) => x.id !== p.id)),
      () => Alert.alert('We couldn’t unblock this person', 'Check your connection and try again.'),
    );
  }

  return (
    <SafeAreaView style={styles.screen}>
      <BackHeader title="Blocked accounts" />
      {people === null ? (
        <ActivityIndicator color={colors.teal} style={{ marginTop: 40 }} />
      ) : (
        <FlatList
          data={people}
          keyExtractor={(p) => p.id}
          contentContainerStyle={styles.list}
          ListEmptyComponent={<Text style={styles.empty}>{failed ? 'We couldn’t load this list. Try again later.' : 'You haven’t blocked anyone.'}</Text>}
          renderItem={({ item }) => (
            <View style={styles.row}>
              <Avatar person={item} size={44} />
              <Text style={styles.name} numberOfLines={1}>{personName(item)}</Text>
              <Pressable style={styles.btn} onPress={() => unblock(item)} accessibilityRole="button" accessibilityLabel={`Unblock ${personName(item)}`}>
                <Text style={styles.btnText}>Unblock</Text>
              </Pressable>
            </View>
          )}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.paper },
  list: { paddingHorizontal: 22, paddingBottom: 40 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10 },
  name: { flex: 1, fontFamily: fonts.bold, fontSize: 15, color: colors.ink },
  btn: { borderWidth: 1.5, borderColor: colors.navy, borderRadius: 999, paddingHorizontal: 16, paddingVertical: 8 },
  btnText: { fontFamily: fonts.bold, fontSize: 14, color: colors.navy },
  empty: { fontFamily: fonts.semiBold, fontSize: 14, color: colors.muted, textAlign: 'center', marginTop: 40 },
});
