import { useEffect, useState } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator, Image } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Icon from "@react-native-vector-icons/material-design-icons";
import { ScreenHeader } from "@/src/components/header";
import { Button, Card } from "@/src/components/ui";
import { colors, radius, spacing } from "@/src/theme";
import { getOfferings, purchasePackage, restorePurchases, TRIAL_DAYS } from "@/src/lib/purchases";

const ICON = require("../../../assets/images/chaser-icon.png");

const FEATURES = [
  "Unlimited spray records with auto-captured weather",
  "Chaser Weather Intelligence — 4-model consensus forecasting",
  "Chemical register with APVMA lookup & stock tracking",
  "Machinery maintenance & fault reporting",
  "Team roster, task assignment & invites",
  "Full offline support — syncs when you're back in range",
];

export function PaywallScreen({ back }: { back?: boolean }) {
  const insets = useSafeAreaInsets();
  const [offering, setOffering] = useState<any | null>(null);
  const [loadingOffering, setLoadingOffering] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getOfferings().then((o) => { setOffering(o); setLoadingOffering(false); });
  }, []);

  async function subscribe(pkg: any) {
    setBusy(true);
    setError(null);
    const result = await purchasePackage(pkg);
    setBusy(false);
    if (!result.ok && result.message) setError(result.message);
    // On success, the RevenueCat customer-info listener (useEntitlement) picks
    // up the change and the app layout re-renders past this screen on its own.
  }

  async function restore() {
    setBusy(true);
    setError(null);
    const result = await restorePurchases();
    setBusy(false);
    if (!result.ok) setError(result.message ?? "Nothing to restore");
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface, paddingTop: insets.top }}>
      <ScreenHeader title="Chaser Pro" back={back} />
      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxl + insets.bottom }}>
        <View style={styles.brand}>
          <Image source={ICON} style={styles.logo} resizeMode="contain" />
          <Text style={styles.title}>Your free trial has ended</Text>
          <Text style={styles.sub}>Subscribe to keep using Chaser — behind every good operation.</Text>
        </View>

        <Card>
          {FEATURES.map((f) => (
            <View key={f} style={styles.featureRow}>
              <Icon name="check-circle" size={18} color={colors.brandPrimary} />
              <Text style={styles.featureText}>{f}</Text>
            </View>
          ))}
        </Card>

        {error ? (
          <View style={styles.errorBox} testID="paywall-error">
            <Icon name="alert-circle-outline" size={16} color={colors.error} />
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : null}

        <View style={{ height: spacing.lg }} />

        {loadingOffering ? (
          <ActivityIndicator color={colors.brandPrimary} />
        ) : offering?.availablePackages?.length ? (
          offering.availablePackages.map((pkg: any) => (
            <View key={pkg.identifier} style={{ marginBottom: spacing.sm }}>
              <Button
                title={busy ? "Please wait…" : `Subscribe — ${pkg.product.priceString}`}
                icon="star-outline"
                onPress={() => subscribe(pkg)}
                loading={busy}
                disabled={busy}
                testID={`subscribe-btn-${pkg.identifier}`}
              />
            </View>
          ))
        ) : (
          <Text style={styles.hint}>Subscriptions aren&apos;t available right now — check your connection and try again shortly.</Text>
        )}

        <Pressable onPress={restore} hitSlop={8} style={{ alignSelf: "center", marginTop: spacing.md }} disabled={busy} testID="restore-purchases-btn">
          <Text style={styles.restoreText}>Restore purchases</Text>
        </Pressable>

        <Text style={styles.disclaimer}>
          New subscribers get a {TRIAL_DAYS}-day free trial. Subscription auto-renews unless cancelled at least 24 hours before the end of the current period. Manage or cancel any time in your device&apos;s App Store account settings.
        </Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  brand: { alignItems: "center", marginBottom: spacing.xl },
  logo: { width: 72, height: 72, borderRadius: 18, marginBottom: spacing.md },
  title: { fontSize: 22, fontWeight: "800", color: colors.onSurface, textAlign: "center" },
  sub: { fontSize: 14, color: colors.muted, marginTop: 6, textAlign: "center" },
  featureRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 7 },
  featureText: { flex: 1, fontSize: 13, color: colors.onSurface, fontWeight: "600" },
  errorBox: { flexDirection: "row", alignItems: "flex-start", gap: 6, marginTop: spacing.md, backgroundColor: "#FEE2E2", padding: 10, borderRadius: radius.md },
  errorText: { color: colors.error, fontWeight: "600", fontSize: 12, flex: 1, lineHeight: 16 },
  hint: { fontSize: 13, color: colors.muted, textAlign: "center", lineHeight: 18 },
  restoreText: { color: colors.brandPrimary, fontWeight: "700", fontSize: 13 },
  disclaimer: { fontSize: 11, color: colors.muted, textAlign: "center", marginTop: spacing.lg, lineHeight: 16, paddingHorizontal: 12 },
});
