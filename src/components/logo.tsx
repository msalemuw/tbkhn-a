import { Image } from 'expo-image';

// Brand lockup ("tabkheen" wordmark plus icon) from /mnt/project-files/brand. Never set it on a box:
// use the dark-background version on teal or navy and the light-background version on paper.
const SOURCES = {
  dark: require('@/assets/images/brand/logo-dark-bg.png'),
  light: require('@/assets/images/brand/logo-light-bg.png'),
};
const RATIO = 1780 / 394;

export function Logo({ on, height }: { on: 'dark' | 'light'; height: number }) {
  return (
    <Image
      source={SOURCES[on]}
      style={{ height, width: height * RATIO }}
      contentFit="contain"
      accessibilityRole="image"
      accessibilityLabel="tabkheen"
    />
  );
}
