import { useRef } from 'react';
import { View } from 'react-native';

import { colors } from '@/constants/theme';

/**
 * The small bar at the top of a bottom sheet. Like Instagram, swiping it down closes the sheet.
 * The touch area is a full-width strip, so it is easy to hit. A plain tap does nothing.
 */
export function GrabHandle({ onClose, color = colors.line }: { onClose: () => void; color?: string }) {
  const startY = useRef<number | null>(null);
  return (
    <View
      style={{ alignSelf: 'stretch', alignItems: 'center', paddingVertical: 12 }}
      onTouchStart={(e) => {
        startY.current = e.nativeEvent.pageY;
      }}
      onTouchEnd={(e) => {
        const from = startY.current;
        startY.current = null;
        if (from !== null && e.nativeEvent.pageY - from > 40) onClose();
      }}
      accessible={false}>
      <View style={{ width: 40, height: 4, borderRadius: 2, backgroundColor: color }} />
    </View>
  );
}
