import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import type { ComponentProps } from 'react';

import { isRTL } from '@/lib/i18n';

/** An icon that points along the reading direction (back arrows, chevrons): mirrored in right-to-left. */
export function FlipIcon({ style, ...rest }: ComponentProps<typeof MaterialIcons>) {
  return <MaterialIcons {...rest} style={[style, isRTL && { transform: [{ scaleX: -1 }] }]} />;
}
