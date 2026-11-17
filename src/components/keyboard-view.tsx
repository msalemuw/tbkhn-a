import { useEffect, useRef, useState, type ComponentProps } from 'react';
import { AppState, Keyboard, KeyboardAvoidingView as RNKeyboardAvoidingView } from 'react-native';

/**
 * KeyboardAvoidingView that survives the app going to the background with the keyboard open.
 * iOS can miss the "keyboard hidden" event then, leaving the form squeezed into a blank white screen on return.
 * So the keyboard is closed when the app leaves the foreground, and (only if it was open) the view is rebuilt when it comes back.
 */
export function KeyboardAvoidingView(props: ComponentProps<typeof RNKeyboardAvoidingView>) {
  const [round, setRound] = useState(0);
  const hadKeyboard = useRef(false);
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        if (hadKeyboard.current) setRound((n) => n + 1);
        hadKeyboard.current = false;
      } else {
        if (Keyboard.isVisible()) hadKeyboard.current = true;
        Keyboard.dismiss();
      }
    });
    return () => sub.remove();
  }, []);
  return <RNKeyboardAvoidingView key={round} {...props} />;
}
