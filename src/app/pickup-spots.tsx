import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useCallback, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Text } from '@/components/text';
import { Alert } from '@/lib/alert';
import { BackHeader } from '@/components/form';
import { colors, fonts } from '@/constants/theme';
import { fetchMyPickupPoints, type PickupPoint, removePickupPoint } from '@/lib/posts';
import { useSession } from '@/lib/session';

/** Settings > My pickup spots: the spots the cook saved, each with a Delete button. */
export default function PickupSpots() {
  const { session } = useSession();
  const uid = session?.user.id;
  const [spots, setSpots] = useState<PickupPoint[] | null>(null);
  const [failed, setFailed] = useState(false);

  useFocusEffect(
    useCallback(() => {
      if (!uid) return;
      fetchMyPickupPoints(uid).then(
        (p) => {
          setSpots(p);
          setFailed(false);
        },
        () => {
          setSpots([]);
          setFailed(true);
        },
      );
    }, [uid]),
  );

  function remove(p: PickupPoint) {
    Alert.alert('Delete this pickup spot?', 'Dishes you already posted keep it. You can add it again later from the map.', [
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () =>
          removePickupPoint(p.id).then(
            () => setSpots((l) => (l ?? []).filter((x) => x.id !== p.id)),
            () => Alert.alert('We couldn’t delete it', 'Check your connection and try again.'),
          ),
      },
      { text: 'Cancel', style: 'cancel' },
    ]);
  }

  return (
    <SafeAreaView style={styles.screen}>
      <BackHeader title="My pickup spots" />
      {spots === null ? (
        <ActivityIndicator color={colors.teal} style={{ marginTop: 40 }} />
      ) : (
        <FlatList
          data={spots}
          keyExtractor={(p) => p.id}
          contentContainerStyle={styles.list}
          ListEmptyComponent={<Text style={styles.empty}>{failed ? 'We couldn’t load this list. Try again later.' : 'No saved pickup spots yet. They appear here when you post a dish.'}</Text>}
          renderItem={({ item }) => (
            <View style={styles.row}>
              <MaterialIcons name="location-on" size={22} color={colors.teal} />
              <Text style={styles.name} numberOfLines={2}>{item.label}</Text>
              <Pressable style={styles.btn} onPress={() => remove(item)} accessibilityRole="button" accessibilityLabel={`Delete ${item.label}`}>
                <Text style={styles.btnText}>Delete</Text>
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
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12 },
  name: { flex: 1, fontFamily: fonts.bold, fontSize: 15, color: colors.ink },
  btn: { borderWidth: 1.5, borderColor: colors.navy, borderRadius: 999, paddingHorizontal: 16, paddingVertical: 8 },
  btnText: { fontFamily: fonts.bold, fontSize: 14, color: colors.navy },
  empty: { fontFamily: fonts.semiBold, fontSize: 14, color: colors.muted, textAlign: 'center', marginTop: 40 },
});
