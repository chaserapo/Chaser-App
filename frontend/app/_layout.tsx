import { QueryClientProvider } from "@tanstack/react-query";
import { Stack } from "expo-router";
import { LogBox, View } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { useEffect, useState } from "react";

import { ErrorBoundary } from "@/src/components/error-boundary";
import { queryClient } from "@/src/query-client";
import { seedIfNeeded } from "@/src/lib/seed";
import { colors } from "@/src/theme";

LogBox.ignoreAllLogs(true);

export default function RootLayout() {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    (async () => {
      try {
        await seedIfNeeded();
      } catch (e) {
        console.warn("seed error", e);
      } finally {
        setReady(true);
      }
    })();
  }, []);

  return (
    <ErrorBoundary>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <SafeAreaProvider>
          <QueryClientProvider client={queryClient}>
            {ready ? (
              <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.surface } }} />
            ) : (
              <View style={{ flex: 1, backgroundColor: colors.surface }} />
            )}
          </QueryClientProvider>
        </SafeAreaProvider>
      </GestureHandlerRootView>
    </ErrorBoundary>
  );
}
