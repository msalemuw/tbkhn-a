import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Modal, Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Text } from '@/components/text';
import { Avatar } from '@/components/avatar';
import { fonts, ui } from '@/constants/theme';
import { fetchLikers } from '@/lib/feed';
import { personName, type Person } from '@/lib/posts';
import { VerifiedTick } from '@/lib/verified';

/** "Likes · 247" bottom sheet, like Instagram: everyone who liked the post; tap a name to open their profile. */
export function LikesSheet({ postId, onClose }: { postId: string | null; onClose: () => void }) {
  return (
    <Modal visible={postId !== null} transparent animationType="slide" onRequestClose={onClose}>
      {postId ? <Likers key={postId} postId={postId} onClose={onClose} /> : null}
    </Modal>
  );
}

function Likers({ postId, onClose }: { postId: string; onClose: () => void }) {
  const [people, setPeople] = useState<Person[] | null>(null);
  const [failed, setFailed] = useState(false);
  const { height: screenH } = useWindowDimensions();

  useEffect(() => {
    fetchLikers(postId).then(setPeople, () => {
      setFailed(true);
      setPeople([]);
    });
  }, [postId]);

  return (
    <View style={styles.root}>
      <Pressable style={[StyleSheet.absoluteFill, styles.scrim]} onPress={onClose} accessibilityLabel="Close" />
      <SafeAreaView edges={['bottom']} style={[styles.sheet, { height: Math.round(screenH * 0.6) }]}>
        <View style={styles.grab} />
        <Text style={styles.title}>Likes{people && !failed ? ` · ${people.length}` : ''}</Text>
        {people === null ? (
          <ActivityIndicator color={ui.deepTeal} style={{ marginTop: 30 }} />
        ) : (
          <FlatList
            data={people}
            keyExtractor={(u) => u.id}
            ListEmptyComponent={<Text style={styles.empty}>{failed ? 'We couldn’t load the likes. Try again.' : 'No likes yet. Be the first.'}</Text>}
            renderItem={({ item }) => (
              <Pressable
                style={styles.row}
                onPress={() => {
                  onClose();
                  router.push({ pathname: '/cook/[id]', params: { id: item.id } });
                }}
                accessibilityRole="link"
                accessibilityLabel={`${personName(item)}'s profile`}>
                <Avatar person={item} size={44} />
                <Text style={styles.name} numberOfLines={1}>{personName(item)}</Text>
                <VerifiedTick id={item.id} size={16} />
              </Pressable>
            )}
          />
        )}
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: 'flex-end' },
  scrim: { backgroundColor: 'rgba(1,49,62,.5)' },
  sheet: { backgroundColor: ui.card, borderTopLeftRadius: 26, borderTopRightRadius: 26, paddingHorizontal: 22 },
  grab: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: ui.border, marginVertical: 12 },
  title: { fontFamily: fonts.extraBold, fontSize: 16, color: ui.deep, marginBottom: 8 },
  empty: { fontFamily: fonts.semiBold, fontSize: 14, color: ui.deep, opacity: 0.6, textAlign: 'center', marginTop: 30 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 9 },
  name: { flexShrink: 1, fontFamily: fonts.bold, fontSize: 15, color: ui.deep },
});
