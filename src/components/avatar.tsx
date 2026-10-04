import { Image } from 'expo-image';
import { StyleSheet, Text, View } from 'react-native';

import { colors, fonts } from '@/constants/theme';
import { mediaUrl, type Person, personName } from '@/lib/posts';

/** Profile photo, or the first letter of the name on light blue. */
export function Avatar({ person, size = 44 }: { person: Person | null | undefined; size?: number }) {
  const uri = mediaUrl(person?.avatar_path ?? null);
  const box = { width: size, height: size, borderRadius: size / 2 };
  if (uri) return <Image source={{ uri }} style={[box, styles.bg]} contentFit="cover" />;
  const letter = personName(person).replace('@', '').charAt(0).toUpperCase() || '?';
  return (
    <View style={[box, styles.bg, styles.center]}>
      <Text style={[styles.letter, { fontSize: size * 0.42 }]}>{letter}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  bg: { backgroundColor: colors.lightBlue },
  center: { alignItems: 'center', justifyContent: 'center' },
  letter: { fontFamily: fonts.extraBold, color: colors.navy },
});
