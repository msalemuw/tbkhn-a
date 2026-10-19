import { forwardRef, type ReactNode } from 'react';
import { Text as RNText, TextInput as RNTextInput, type TextInputProps, type TextProps } from 'react-native';

import { tr } from '@/lib/i18n';

// Drop-in Text and TextInput that show Arabic when the app is in Arabic: any plain string is looked up in src/lib/ar.ts
// (and src/lib/ar-patterns.ts for strings with numbers or names in them). Unknown text stays as written.
function translate(children: ReactNode): ReactNode {
  if (typeof children === 'string') return tr(children);
  if (!Array.isArray(children)) return children;
  // "Comments · {n}" arrives as pieces: when all of them are text or numbers, translate the sentence as a whole.
  if (children.every((c) => typeof c === 'string' || typeof c === 'number')) return tr(children.join(''));
  return children.map((c) => (typeof c === 'string' ? tr(c) : c));
}

// verbatim: show the text as written (what members type, and pages that have their own language switch).
export function Text({ children, verbatim, ...rest }: TextProps & { verbatim?: boolean }) {
  return <RNText {...rest}>{verbatim ? children : translate(children)}</RNText>;
}

export const TextInput = forwardRef<RNTextInput, TextInputProps>(function TextInput({ placeholder, accessibilityLabel, ...rest }, ref) {
  return (
    <RNTextInput
      ref={ref}
      {...rest}
      placeholder={placeholder ? tr(placeholder) : placeholder}
      accessibilityLabel={accessibilityLabel ? tr(accessibilityLabel) : accessibilityLabel}
    />
  );
});
