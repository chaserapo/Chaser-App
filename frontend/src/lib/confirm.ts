// Cross-platform confirmation helper.
// React Native's `Alert.alert` is a no-op on react-native-web (v0.21.x still ships a stub).
// This helper falls back to the browser's `window.confirm` on web while using
// the proper native Alert on iOS/Android — same UX contract everywhere.

import { Alert, Platform } from "react-native";

export type ConfirmOptions = {
  title: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
};

export function confirm(options: ConfirmOptions, onConfirm: () => void, onCancel?: () => void) {
  const { title, message, confirmLabel = "Confirm", cancelLabel = "Cancel", destructive } = options;
  if (Platform.OS === "web") {
    const text = message ? `${title}\n\n${message}` : title;
    const ok = typeof window !== "undefined" && typeof window.confirm === "function"
      ? window.confirm(text)
      : true;
    if (ok) onConfirm();
    else onCancel?.();
    return;
  }
  Alert.alert(title, message, [
    { text: cancelLabel, style: "cancel", onPress: onCancel },
    { text: confirmLabel, style: destructive ? "destructive" : "default", onPress: onConfirm },
  ]);
}
