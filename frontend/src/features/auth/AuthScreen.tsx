import { useState } from "react";
import { View, Text, StyleSheet, KeyboardAvoidingView, Platform, ScrollView, Pressable, ActivityIndicator, Image } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import Icon from "@react-native-vector-icons/material-design-icons";
import { Button, Card, Input } from "@/src/components/ui";
import { colors, radius, spacing } from "@/src/theme";
import { useAuth } from "@/src/lib/auth-context";

const ICON = require("../../../assets/images/chaser-icon.png");

type Mode = "signin" | "signup";

export function AuthScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { signIn, signUp } = useAuth();
  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [businessName, setBusinessName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setError(null);
    if (!email.trim() || !password) { setError("Enter email and password."); return; }
    if (mode === "signup") {
      if (!businessName.trim()) { setError("Enter your farm / business name."); return; }
      if (password.length < 6) { setError("Password must be at least 6 characters."); return; }
      if (password !== confirmPassword) { setError("Passwords don't match."); return; }
    }
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
            <Image source={ICON} style={styles.logo} resizeMode="contain" accessibilityLabel="Chaser" />
            <Text style={styles.title}>Chaser</Text>
            <Text style={styles.sub}>Behind every good operation</Text>
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
            <Input label="Email" value={email} onChangeText={setEmail} placeholder="you@farm.com.au" keyboardType="default" autoCapitalize="none" testID="input-email" />
            <View>
              <Input label="Password" value={password} onChangeText={setPassword} placeholder="Minimum 6 characters" secureTextEntry={!showPassword} autoCapitalize="none" testID="input-password" />
              <Pressable onPress={() => setShowPassword((v) => !v)} hitSlop={10} style={styles.eyeBtn} testID="toggle-password-visibility">
                <Icon name={showPassword ? "eye-off-outline" : "eye-outline"} size={20} color={colors.muted} />
              </Pressable>
            </View>
            {mode === "signup" ? (
              <View>
                <Input label="Confirm password" value={confirmPassword} onChangeText={setConfirmPassword} placeholder="Re-enter password" secureTextEntry={!showConfirm} autoCapitalize="none" testID="input-confirm-password" />
                <Pressable onPress={() => setShowConfirm((v) => !v)} hitSlop={10} style={styles.eyeBtn} testID="toggle-confirm-visibility">
                  <Icon name={showConfirm ? "eye-off-outline" : "eye-outline"} size={20} color={colors.muted} />
                </Pressable>
              </View>
            ) : null}
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
          {mode === "signup" ? (
            <Text style={styles.footer}>
              By creating an account you agree to Chaser&apos;s{" "}
              <Text style={styles.footerLink} onPress={() => router.push({ pathname: "/legal/[slug]", params: { slug: "terms" } })} testID="signup-terms-link">
                Terms
              </Text>
              {" "}and{" "}
              <Text style={styles.footerLink} onPress={() => router.push({ pathname: "/legal/[slug]", params: { slug: "privacy" } })} testID="signup-privacy-link">
                Privacy Policy
              </Text>
              .
            </Text>
          ) : null}
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
  logo: { width: 96, height: 96, borderRadius: 22 },
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
  footerLink: { color: colors.brandPrimary, fontWeight: "700" },
  eyeBtn: { position: "absolute", right: 12, top: 34, padding: 4 },
});
