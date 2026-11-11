import { useEffect, useRef } from 'react';

// Like Instagram: the photo picker opens as soon as the add screen does (after the modal has slid in),
// so people land on their pictures instead of a screen with two buttons.
export function useOpenPickerOnce(open: () => void) {
  const latest = useRef(open);
  useEffect(() => {
    latest.current = open;
  });
  useEffect(() => {
    const t = setTimeout(() => latest.current(), 450);
    return () => clearTimeout(t);
  }, []);
}
