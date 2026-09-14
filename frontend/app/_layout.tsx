import { QueryClientProvider } from "@tanstack/react-query";
import { Stack } from "expo-router";
import { LogBox, View, ActivityIndicator, AppState } from "react-native";
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
import { flushOfflineSprayJobs } from "@/src/lib/cloud-repo";
import { getBackendMode } from "@/src/lib/backend";
import { useOnboarding } from "@/src/lib/onboarding";
import DiscoveryScreen, { useDiscoveryGate } from "@/src/features/onboarding/DiscoveryScreen";
import Onboarding from "./onboarding";

LogBox.ignoreAllLogs(true);

function AuthGate() {
  const { loading, session, business, migration } = useAuth();

  // Offline queue: flush any pending spray-job writes as soon as we have a
  // business (post sign-in / bootstrap) and whenever the app comes back to
  // the foreground. This is what lets a job saved during a reception blackspot
  // reach Supabase when service returns.
  useEffect(() => {
    if (!business) return;
    const attemptFlush = () => {
      if (getBackendMode() !== "cloud") return;
      flushOfflineSprayJobs().catch((e) => console.warn("flush error", e));
    };
    attemptFlush();
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") attemptFlush();
    });
    const t = setInterval(attemptFlush, 60_000); // periodic retry — cheap, no-op when queue empty
    return () => { sub.remove(); clearInterval(t); };
  }, [business]);

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
  return <PostAuthShell />;
}

/**
 * Rendered once a signed-in user has an active business. New users first get a
 * tiny acquisition survey, then the Chaser setup wizard. Existing beta users
 * were backfilled as discovery-complete so they are never interrupted by it.
 */
function PostAuthShell() {
  const { session } = useAuth();
  const userId = session?.user?.id ?? null;
  const { needsOnboarding, loading, profile } = useOnboarding();
  const discovery = useDiscoveryGate(userId);

  // Wait until we've loaded both profile gates before deciding what to render,
  // avoiding a flash of tabs or the wrong onboarding page.
  if ((loading && !profile) || discovery.isLoading) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.surface, alignItems: "center", justifyContent: "center" }}>
        <ActivityIndicator color={colors.brandPrimary} />
      </View>
    );
  }

  if (userId && !discovery.data?.completed) return <DiscoveryScreen userId={userId} />;
  if (needsOnboarding) return <Onboarding />;
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
