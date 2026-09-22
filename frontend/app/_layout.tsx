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
import { flushOfflineSprayJobs, flushOfflineIssues } from "@/src/lib/cloud-repo";
import { getBackendMode } from "@/src/lib/backend";
import { registerPushToken, useNotificationRouting } from "@/src/lib/push-tokens";
import { useOnboarding } from "@/src/lib/onboarding";
import DiscoveryScreen, { useDiscoveryGate } from "@/src/features/onboarding/DiscoveryScreen";
import { configurePurchases, useEntitlement } from "@/src/lib/purchases";
import { PaywallScreen } from "@/src/features/subscription/PaywallScreen";

LogBox.ignoreAllLogs(true);

function AuthGate() {
  const { loading, session, business, migration } = useAuth();

  useEffect(() => {
    if (!business) return;
    const attemptFlush = () => {
      if (getBackendMode() !== "cloud") return;
      flushOfflineSprayJobs().catch((e) => console.warn("flush error", e));
      flushOfflineIssues().catch((e) => console.warn("issue flush error", e));
    };
    attemptFlush();
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") attemptFlush();
    });
    const t = setInterval(attemptFlush, 60_000);
    return () => { sub.remove(); clearInterval(t); };
  }, [business]);

  useEffect(() => {
    if (!business || !session?.user) return;
    registerPushToken(session.user.id, business.id);
  }, [business, session]);

  useEffect(() => {
    if (!session?.user) return;
    configurePurchases(session.user.id);
  }, [session]);

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

function DeferredOnboarding() {
  // Keep the large onboarding dependency tree out of normal startup. This
  // module is only evaluated for users who actually need the setup wizard.
  const Onboarding = require("./onboarding").default;
  return <Onboarding />;
}

function PostAuthShell() {
  const { session, business } = useAuth();
  const userId = session?.user?.id ?? null;
  const { needsOnboarding, loading, profile } = useOnboarding();
  const discovery = useDiscoveryGate(userId);
  const entitlement = useEntitlement(business?.created_at ?? null);
  useNotificationRouting();

  if ((loading && !profile) || discovery.isLoading || entitlement.loading) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.surface, alignItems: "center", justifyContent: "center" }}>
        <ActivityIndicator color={colors.brandPrimary} />
      </View>
    );
  }

  if (userId && !discovery.data?.completed) return <DiscoveryScreen userId={userId} />;
  if (needsOnboarding) return <DeferredOnboarding />;
  // Trial/subscription gate comes last — after onboarding, so a brand-new
  // signup always gets to set up their farm before ever seeing a paywall.
  if (entitlement.showPaywall) return <PaywallScreen />;
  return <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.surface } }} />;
}

function RootLayout() {
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

export default RootLayout;
