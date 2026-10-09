import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Avatar } from '@/components/avatar';
import { colors, fonts } from '@/constants/theme';
import { personName } from '@/lib/posts';
import type { StoryGroup } from '@/lib/stories';

/** Stories row from the design: "Add" first, then everyone with a live story or dish. Unseen ones get a bright ring. */
export function StoriesRow({
  groups,
  seen,
  me,
  onOpen,
  onAdd,
}: {
  groups: StoryGroup[];
  seen: string[];
  me: string | null;
  onOpen: (authorId: string) => void;
  onAdd: () => void;
}) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
      <Pressable style={styles.item} onPress={onAdd} accessibilityRole="button" accessibilityLabel="Add a story">
        <View style={[styles.ring, styles.addRing]}>
          <MaterialIcons name="add" size={28} color={colors.teal} />
        </View>
        <Text style={styles.name}>Add</Text>
      </Pressable>
      {groups.map((g) => {
        const unseen = g.items.some((i) => !seen.includes(i.id));
        const own = g.author.id === me;
        return (
          <Pressable key={g.author.id} style={styles.item} onPress={() => onOpen(g.author.id)} accessibilityRole="button" accessibilityLabel={`${personName(g.author)}'s story`}>
            <View style={[styles.ring, unseen ? styles.unseen : styles.seen]}>
              <View style={styles.inner}>
                <Avatar person={g.author} size={52} />
              </View>
            </View>
            <Text style={styles.name} numberOfLines={1}>{own ? 'Your story' : personName(g.author).split(' ')[0]}</Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  row: { paddingHorizontal: 18, gap: 14, paddingBottom: 12 },
  item: { width: 66, alignItems: 'center', gap: 6 },
  ring: { width: 62, height: 62, borderRadius: 31, alignItems: 'center', justifyContent: 'center', borderWidth: 2.5 },
  addRing: { borderColor: colors.teal },
  unseen: { borderColor: colors.yellow },
  seen: { borderColor: 'rgba(255,255,255,.35)' },
  inner: { borderRadius: 27, overflow: 'hidden' },
  name: { fontFamily: fonts.bold, fontSize: 11, color: colors.white, maxWidth: 66, textAlign: 'center' },
});
