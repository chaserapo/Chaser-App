import { useState } from "react";
import { View, Text, StyleSheet, KeyboardAvoidingView, Platform, ScrollView, Pressable, ActivityIndicator } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Icon from "@react-native-vector-icons/material-design-icons";
import { Button, Card, Input } from "@/src/components/ui";
import { colors, radius, spacing } from "@/src/theme";
import { useAuth } from "@/src/lib/auth-context";

type Mode = "signin" | "signup";

export function AuthScreen() {
  const insets = useSafeAreaInsets();
  const { signIn, signUp } = useAuth();
  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [businessName, setBusinessName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setError(null);
    if (!email.trim() || !password) { setError("Enter email and password."); return; }
    if (mode === "signup" && !businessName.trim()) { setError("Enter your farm / business name."); return; }
    setBusy(true);
    try {
      if (mode === "signin") await signIn(email, password);
      else await signUp(email, password, businessName);
    } catch (e: any) {
      setError(e?.message ?? "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface, paddingTop: insets.top }}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView
          contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxl + insets.bottom, flexGrow: 1, justifyContent: "center" }}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.brand}>
            <View style={styles.logo}><Icon name="sprout" size={32} color={colors.onBrandPrimary} /></View>
            <Text style={styles.title}>HectareHQ</Text>
            <Text style={styles.sub}>Farm spraying & machinery, in one place.</Text>
          </View>

          <View style={styles.tabs}>
            <Pressable onPress={() => setMode("signin")} style={[styles.tab, mode === "signin" && styles.tabActive]} testID="tab-signin">
              <Text style={[styles.tabText, mode === "signin" && styles.tabTextActive]}>Sign in</Text>
            </Pressable>
            <Pressable onPress={() => setMode("signup")} style={[styles.tab, mode === "signup" && styles.tabActive]} testID="tab-signup">
              <Text style={[styles.tabText, mode === "signup" && styles.tabTextActive]}>Create account</Text>
            </Pressable>
          </View>

          <Card>
            {mode === "signup" ? (
              <Input
                label="Farm / Business name"
                value={businessName}
                onChangeText={setBusinessName}
                placeholder="e.g. Riverina Broadacre Co."
                testID="input-business-name"
              />
            ) : null}
            <Input label="Email" value={email} onChangeText={setEmail} placeholder="you@farm.com.au" keyboardType="default" testID="input-email" />
            <Input label="Password" value={password} onChangeText={setPassword} placeholder="Minimum 6 characters" testID="input-password" />
            {error ? (
              <View style={styles.errorBox} testID="auth-error">
                <Icon name="alert-circle-outline" size={16} color={colors.error} />
                <Text style={styles.errorText}>{error}</Text>
              </View>
            ) : null}
            <View style={{ height: spacing.md }} />
            <Button
              title={busy ? "Please wait…" : mode === "signin" ? "Sign in" : "Create account"}
              icon={mode === "signin" ? "login" : "account-plus"}
              onPress={submit}
              loading={busy}
              disabled={busy}
              testID="submit-auth-btn"
            />
          </Card>

          <Text style={styles.footer}>
            {mode === "signin"
              ? "By signing in, you agree to keep your farm data safe. Your existing local data stays on this device as a backup."
              : "We'll create your cloud workspace and safely upload the data already on this device."}
          </Text>
          {busy ? (
            <View style={{ marginTop: spacing.md, alignItems: "center" }}>
              <ActivityIndicator color={colors.brandPrimary} />
            </View>
          ) : null}
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  brand: { alignItems: "center", marginBottom: spacing.xl },
  logo: { width: 64, height: 64, borderRadius: radius.lg, backgroundColor: colors.brandPrimary, alignItems: "center", justifyContent: "center" },
  title: { fontSize: 28, fontWeight: "800", color: colors.onSurface, marginTop: spacing.md },
  sub: { color: colors.muted, marginTop: 4, fontSize: 13 },
  tabs: { flexDirection: "row", backgroundColor: colors.surfaceTertiary, borderRadius: radius.pill, padding: 4, marginBottom: spacing.md },
  tab: { flex: 1, paddingVertical: 10, alignItems: "center", borderRadius: radius.pill },
  tabActive: { backgroundColor: colors.brandPrimary },
  tabText: { fontWeight: "700", color: colors.onSurfaceTertiary },
  tabTextActive: { color: colors.onBrandPrimary },
  errorBox: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: spacing.sm, backgroundColor: "#FEE2E2", padding: 10, borderRadius: radius.md },
  errorText: { color: colors.error, fontWeight: "600", fontSize: 13, flex: 1 },
  footer: { marginTop: spacing.lg, color: colors.muted, fontSize: 12, textAlign: "center", lineHeight: 17 },
});
