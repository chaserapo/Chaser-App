import { QueryClientProvider } from "@tanstack/react-query";
import { Stack } from "expo-router";
import { LogBox, View, ActivityIndicator } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { useEffect, useState } from "react";

import { ErrorBoundary } from "@/src/components/error-boundary";
import { queryClient } from "@/src/query-client";
import { seedIfNeeded } from "@/src/lib/seed";
import { colors } from "@/src/theme";
import { AuthProvider, useAuth } from "@/src/lib/auth-context";
import { AuthScreen } from "@/src/features/auth/AuthScreen";
import { MigrationScreen } from "@/src/features/auth/MigrationScreen";

LogBox.ignoreAllLogs(true);

function AuthGate() {
  const { loading, session, business, migration } = useAuth();

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.surface, alignItems: "center", justifyContent: "center" }}>
        <ActivityIndicator color={colors.brandPrimary} />
      </View>
    );
  }
  if (!session) return <AuthScreen />;
  if (migration.kind === "running" || migration.kind === "error" || migration.kind === "success" || !business) {
    return <MigrationScreen />;
  }
  return <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.surface } }} />;
}

export default function RootLayout() {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    (async () => {
      try {
        // Local seed only affects AsyncStorage — safe even if user later signs in and
        // switches to cloud (seed marker prevents re-seeding, and cloud repo ignores it).
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
              <AuthProvider>
                <AuthGate />
              </AuthProvider>
            ) : (
              <View style={{ flex: 1, backgroundColor: colors.surface }} />
            )}
          </QueryClientProvider>
        </SafeAreaProvider>
      </GestureHandlerRootView>
    </ErrorBoundary>
  );
}
