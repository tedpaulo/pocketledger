import { Alert, Platform } from 'react-native';

/**
 * Cross-platform confirmation dialog.
 * (react-native-web's Alert.alert is a no-op, so web uses window.confirm.)
 */
export function confirmAsync(title: string, message: string, confirmLabel = 'Proceed'): Promise<boolean> {
  if (Platform.OS === 'web') {
    return Promise.resolve(window.confirm([title, message].filter(Boolean).join('\n\n')));
  }
  return new Promise((resolve) => {
    Alert.alert(title, message, [
      { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
      { text: confirmLabel, style: 'destructive', onPress: () => resolve(true) },
    ]);
  });
}

/** Cross-platform one-button notice. */
export function notify(title: string, message: string): void {
  if (Platform.OS === 'web') {
    window.alert([title, message].filter(Boolean).join('\n\n'));
    return;
  }
  Alert.alert(title, message);
}
