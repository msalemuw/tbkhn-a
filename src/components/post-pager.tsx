import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useEffect, useRef, useState } from 'react';
import { BackHandler, FlatList, PanResponder, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Text } from '@/components/text';
import { colors, fonts, ui } from '@/constants/theme';

// Reels-style full screen (the bottom bar stays, as on Instagram): one post per page, swipe up for the next post and down for the previous one. Each page is the normal
// post card (so like, comment, share, save and follow all work), the photo shown in its own shape. Only these close it: the Back pill,
// a swipe from the left edge, the phone's back button, or a tap on the bottom bar. The list never changes while it is open.
export function PostPager<T extends { id: string }>({ data, start, renderCard, onClose }: { data: T[]; start: number; renderCard: (item: T, maxPhotoHeight: number) => React.ReactNode; onClose: () => void }) {
  const insets = useSafeAreaInsets();
  const [h, setH] = useState(0);
  const listRef = useRef<FlatList<T>>(null);
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      onClose();
      return true;
    });
    return () => sub.remove();
  }, [onClose]);

  // A narrow strip along the left edge: drag it to the right to go back.
  const [edge] = useState(() => {
    let close = onClose;
    const pan = PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderRelease: (_e, g) => {
        if (g.dx > 50 || g.vx > 0.6) close();
      },
    });
    return { pan, set: (f: () => void) => (close = f) };
  });
  useEffect(() => edge.set(onClose), [edge, onClose]);

  return (
    <View style={styles.root} onLayout={(e) => setH(e.nativeEvent.layout.height)}>
      {h > 0 ? (
        <FlatList
          ref={listRef}
          data={data}
          keyExtractor={(p) => p.id}
          pagingEnabled
          showsVerticalScrollIndicator={false}
          decelerationRate="fast"
          initialScrollIndex={Math.min(start, Math.max(data.length - 1, 0))}
          getItemLayout={(_d, i) => ({ length: h, offset: h * i, index: i })}
          windowSize={3}
          renderItem={({ item }) => <View style={{ height: h, justifyContent: 'center', paddingTop: insets.top + 44, paddingBottom: 8 }}>{renderCard(item, Math.max(160, h - (insets.top + 44) - 8 - 230))}</View>}
        />
      ) : null}
      <Pressable style={[styles.back, { top: insets.top + 8 }]} onPress={onClose} hitSlop={8} accessibilityRole="button" accessibilityLabel="Back to the feed">
        <MaterialIcons name="arrow-back" size={20} color={colors.white} />
        <Text style={styles.backText}>Back</Text>
      </Pressable>
      <View style={styles.edge} {...edge.pan.panHandlers} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, backgroundColor: ui.page, zIndex: 20 },
  back: { position: 'absolute', left: 14, flexDirection: 'row', alignItems: 'center', gap: 4, height: 36, paddingLeft: 10, paddingRight: 16, borderRadius: 999, backgroundColor: ui.deep },
  backText: { fontFamily: fonts.bold, fontSize: 14, color: colors.white },
  edge: { position: 'absolute', left: 0, top: 90, bottom: 0, width: 22 },
});
