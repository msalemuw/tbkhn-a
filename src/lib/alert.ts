import { Alert as RNAlert, type AlertButton, type AlertOptions } from 'react-native';

import { tr } from '@/lib/i18n';

// Same as React Native's Alert, with the title, message and button names shown in Arabic when the app is in Arabic.
export const Alert = {
  alert(title: string, message?: string, buttons?: AlertButton[], options?: AlertOptions) {
    RNAlert.alert(
      tr(title),
      message ? tr(message) : message,
      buttons?.map((b) => ({ ...b, text: b.text ? tr(b.text) : b.text })),
      options,
    );
  },
};
