import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated, { runOnJS, useAnimatedStyle, useSharedValue, withDelay, withSpring, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Text } from '@/components/text';
import { colors, fonts, ui } from '@/constants/theme';
import { mediaUrl } from '@/lib/posts';

// Full-screen photo: the whole picture on the app's cream page. Swipe down (only down) anywhere to close (the page fades and the photo
// shrinks as you drag), or tap it. A handle pill and a short "Swipe down to close" hint show how. Swipe sideways for more photos.
export default function PhotoViewer() {
  const { paths, index } = useLocalSearchParams<{ paths: string; index?: string }>();
  const urls = (paths ?? '').split('|').map((p) => mediaUrl(p)).filter((u): u is string => !!u);
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const start = Math.min(Math.max(Number(index) || 0, 0), Math.max(urls.length - 1, 0));
  const [slide, setSlide] = useState(start);

  const ty = useSharedValue(0);
  const hint = useSharedValue(1);
  useEffect(() => {
    hint.value = withDelay(2600, withTiming(0, { duration: 500 }));
  }, [hint]);

  const close = () => router.back();
  const drag = Gesture.Pan()
    .activeOffsetY([-12, 12])
    .failOffsetX([-24, 24])
    .onUpdate((e) => {
      ty.value = Math.max(0, e.translationY);
    })
    .onEnd((e) => {
      if (e.translationY > 110 || e.velocityY > 900) {
        runOnJS(close)();
      } else {
        ty.value = withSpring(0);
      }
    });

  const pageStyle = useAnimatedStyle(() => ({ opacity: 1 - Math.min(1, Math.abs(ty.value) / 320) }));
  const photoStyle = useAnimatedStyle(() => ({ transform: [{ translateY: ty.value }, { scale: 1 - Math.min(0.15, Math.abs(ty.value) / 1800) }] }));
  const hintStyle = useAnimatedStyle(() => ({ opacity: hint.value * (1 - Math.min(1, Math.abs(ty.value) / 40)) }));

  return (
    <GestureHandlerRootView style={styles.root}>
      <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.page, pageStyle]} />
      <GestureDetector gesture={drag}>
        <Animated.View style={[styles.fill, photoStyle]}>
          <ScrollView
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            contentOffset={{ x: start * width, y: 0 }}
            onMomentumScrollEnd={(e) => setSlide(Math.round(e.nativeEvent.contentOffset.x / width))}>
            {urls.map((uri) => (
              <ScrollView key={uri} style={{ width, height }} contentContainerStyle={{ width, height, justifyContent: 'center' }} maximumZoomScale={4} minimumZoomScale={1} showsHorizontalScrollIndicator={false} showsVerticalScrollIndicator={false} centerContent bouncesZoom>
                <Pressable onPress={close} accessibilityRole="button" accessibilityLabel="Close photo">
                  <Image source={{ uri }} style={{ width, height: height - insets.top - insets.bottom - 80 }} contentFit="contain" />
                </Pressable>
              </ScrollView>
            ))}
          </ScrollView>
        </Animated.View>
      </GestureDetector>

      <View pointerEvents="none" style={[styles.top, { top: insets.top + 8 }]}>
        <View style={styles.handle} />
        <Animated.View style={[styles.hint, hintStyle]}>
          <MaterialIcons name="keyboard-arrow-down" size={18} color={colors.white} />
          <Text style={styles.hintText}>Swipe down to close</Text>
        </Animated.View>
      </View>

      {urls.length > 1 ? (
        <View pointerEvents="none" style={[styles.dots, { bottom: insets.bottom + 18 }]}>
          {urls.map((u, i) => (
            <View key={u} style={[styles.dot, i === slide && styles.dotOn]} />
          ))}
        </View>
      ) : null}
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: 'transparent' },
  page: { backgroundColor: ui.page },
  fill: { flex: 1 },
  top: { position: 'absolute', left: 0, right: 0, alignItems: 'center', gap: 10 },
  handle: { width: 52, height: 5, borderRadius: 3, backgroundColor: 'rgba(40,48,58,.4)' },
  hint: { flexDirection: 'row', alignItems: 'center', gap: 2, backgroundColor: ui.deep, borderRadius: 999, paddingLeft: 8, paddingRight: 14, height: 32 },
  hintText: { fontFamily: fonts.bold, fontSize: 13, color: colors.white },
  dots: { position: 'absolute', left: 0, right: 0, flexDirection: 'row', justifyContent: 'center', gap: 6 },
  dot: { width: 7, height: 7, borderRadius: 4, backgroundColor: 'rgba(40,48,58,.25)' },
  dotOn: { backgroundColor: colors.teal },
});
