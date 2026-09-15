// Initialized from index.js, before any other app module is required, so
// crashes during module evaluation/app startup are captured, not just
// React render errors caught by our ErrorBoundary.
import * as Sentry from "@sentry/react-native";

const dsn = process.env.EXPO_PUBLIC_SENTRY_DSN;

Sentry.init({
  dsn,
  enabled: Boolean(dsn),
  debug: __DEV__,
});

export { Sentry };
