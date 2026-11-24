import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Text } from '@/components/text';
import { colors, fonts } from '@/constants/theme';
import { mediaUrl } from '@/lib/posts';

// Full-screen photo (like Instagram): the whole picture on black, swipe sideways through a carousel, pinch to zoom on iPhone, X to close.
export default function PhotoViewer() {
  const { paths, index } = useLocalSearchParams<{ paths: string; index?: string }>();
  const urls = (paths ?? '').split('|').map((p) => mediaUrl(p)).filter((u): u is string => !!u);
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const start = Math.min(Math.max(Number(index) || 0, 0), Math.max(urls.length - 1, 0));
  const [slide, setSlide] = useState(start);

  return (
    <View style={styles.screen}>
      <ScrollView
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        contentOffset={{ x: start * width, y: 0 }}
        onMomentumScrollEnd={(e) => setSlide(Math.round(e.nativeEvent.contentOffset.x / width))}>
        {urls.map((uri) => (
          <ScrollView key={uri} style={{ width, height }} contentContainerStyle={{ width, height, justifyContent: 'center' }} maximumZoomScale={4} minimumZoomScale={1} showsHorizontalScrollIndicator={false} showsVerticalScrollIndicator={false} centerContent bouncesZoom>
            <Image source={{ uri }} style={{ width, height }} contentFit="contain" />
          </ScrollView>
        ))}
      </ScrollView>
      <Pressable hitSlop={12} onPress={() => router.back()} accessibilityLabel="Close" style={[styles.close, { top: insets.top + 8 }]}>
        <MaterialIcons name="close" size={28} color={colors.white} />
      </Pressable>
      {urls.length > 1 ? (
        <View pointerEvents="none" style={[styles.counter, { top: insets.top + 16 }]}>
          <Text style={styles.counterText}>{slide + 1}/{urls.length}</Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#000' },
  close: { position: 'absolute', left: 12, width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(0,0,0,.45)', alignItems: 'center', justifyContent: 'center' },
  counter: { position: 'absolute', alignSelf: 'center', backgroundColor: 'rgba(0,0,0,.45)', borderRadius: 999, paddingHorizontal: 12, paddingVertical: 4 },
  counterText: { fontFamily: fonts.bold, fontSize: 13, color: colors.white },
});
