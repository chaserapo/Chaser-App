import { useState } from "react";
import { View, Text, StyleSheet, KeyboardAvoidingView, Platform, ScrollView, Pressable, ActivityIndicator, Image } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import Icon from "@react-native-vector-icons/material-design-icons";
import { Button, Card, Input } from "@/src/components/ui";
import { colors, radius, spacing } from "@/src/theme";
import { useAuth } from "@/src/lib/auth-context";

const ICON = require("../../../assets/images/chaser-icon.png");

type Mode = "signin" | "signup" | "forgot-request" | "forgot-verify";

export function AuthScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { signIn, signUp, requestPasswordReset, confirmPasswordReset } = useAuth();
  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [businessName, setBusinessName] = useState("");
  const [resetCode, setResetCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  function goToMode(next: Mode) {
    setMode(next);
    setError(null);
    setNotice(null);
    setPassword("");
    setConfirmPassword("");
    setResetCode("");
  }

  async function submit() {
    setError(null);
    setNotice(null);

    if (mode === "forgot-request") {
      if (!email.trim()) { setError("Enter your email."); return; }
      setBusy(true);
      try {
        await requestPasswordReset(email);
        setNotice("Code sent — check your email.");
        setMode("forgot-verify");
      } catch (e: any) {
        setError(e?.message ?? "Something went wrong");
      } finally {
        setBusy(false);
      }
      return;
    }

    if (mode === "forgot-verify") {
      if (!resetCode.trim()) { setError("Enter the code from your email."); return; }
      if (password.length < 6) { setError("Password must be at least 6 characters."); return; }
      if (password !== confirmPassword) { setError("Passwords don't match."); return; }
      setBusy(true);
      try {
        await confirmPasswordReset(email, resetCode, password);
        // A successful reset leaves the user signed in with the new
        // password — the root layout swaps this screen out once the
        // session updates, same as a normal sign-in.
      } catch (e: any) {
        setError(e?.message ?? "Something went wrong");
      } finally {
        setBusy(false);
      }
      return;
    }

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

          {mode === "signin" || mode === "signup" ? (
            <View style={styles.tabs}>
              <Pressable onPress={() => goToMode("signin")} style={[styles.tab, mode === "signin" && styles.tabActive]} testID="tab-signin">
                <Text style={[styles.tabText, mode === "signin" && styles.tabTextActive]}>Sign in</Text>
              </Pressable>
              <Pressable onPress={() => goToMode("signup")} style={[styles.tab, mode === "signup" && styles.tabActive]} testID="tab-signup">
                <Text style={[styles.tabText, mode === "signup" && styles.tabTextActive]}>Create account</Text>
              </Pressable>
            </View>
          ) : (
            <Text style={styles.forgotTitle}>Reset your password</Text>
          )}

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

            {mode !== "forgot-verify" ? (
              <Input label="Email" value={email} onChangeText={setEmail} placeholder="you@farm.com.au" keyboardType="default" autoCapitalize="none" testID="input-email" />
            ) : (
              <Text style={styles.forgotEmailNotice}>Code sent to {email}</Text>
            )}

            {mode === "forgot-verify" ? (
              <Input label="6-digit code" value={resetCode} onChangeText={setResetCode} placeholder="123456" keyboardType="numeric" testID="input-reset-code" />
            ) : null}

            {mode !== "forgot-request" ? (
              <View>
                <Input
                  label={mode === "forgot-verify" ? "New password" : "Password"}
                  value={password}
                  onChangeText={setPassword}
                  placeholder="Minimum 6 characters"
                  secureTextEntry={!showPassword}
                  autoCapitalize="none"
                  testID="input-password"
                />
                <Pressable onPress={() => setShowPassword((v) => !v)} hitSlop={10} style={styles.eyeBtn} testID="toggle-password-visibility">
                  <Icon name={showPassword ? "eye-off-outline" : "eye-outline"} size={20} color={colors.muted} />
                </Pressable>
              </View>
            ) : null}
            {mode === "signup" || mode === "forgot-verify" ? (
              <View>
                <Input label="Confirm password" value={confirmPassword} onChangeText={setConfirmPassword} placeholder="Re-enter password" secureTextEntry={!showConfirm} autoCapitalize="none" testID="input-confirm-password" />
                <Pressable onPress={() => setShowConfirm((v) => !v)} hitSlop={10} style={styles.eyeBtn} testID="toggle-confirm-visibility">
                  <Icon name={showConfirm ? "eye-off-outline" : "eye-outline"} size={20} color={colors.muted} />
                </Pressable>
              </View>
            ) : null}

            {mode === "signin" ? (
              <Pressable onPress={() => goToMode("forgot-request")} hitSlop={8} style={{ alignSelf: "flex-end", marginTop: 4 }} testID="forgot-password-link">
                <Text style={styles.footerLink}>Forgot password?</Text>
              </Pressable>
            ) : null}

            {notice ? (
              <View style={styles.noticeBox} testID="auth-notice">
                <Icon name="check-circle-outline" size={16} color={colors.success} />
                <Text style={styles.noticeText}>{notice}</Text>
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
              title={
                busy ? "Please wait…"
                : mode === "signin" ? "Sign in"
                : mode === "signup" ? "Create account"
                : mode === "forgot-request" ? "Send code"
                : "Reset password"
              }
              icon={mode === "signin" ? "login" : mode === "signup" ? "account-plus" : mode === "forgot-request" ? "email-send-outline" : "lock-reset"}
              onPress={submit}
              loading={busy}
              disabled={busy}
              testID="submit-auth-btn"
            />
            {mode === "forgot-verify" ? (
              <Pressable onPress={() => requestPasswordReset(email).then(() => setNotice("Code re-sent — check your email.")).catch((e: any) => setError(e?.message ?? "Couldn't resend the code"))} hitSlop={8} style={{ alignSelf: "center", marginTop: spacing.md }} testID="resend-code-link">
                <Text style={styles.footerLink}>Resend code</Text>
              </Pressable>
            ) : null}
            {mode === "forgot-request" || mode === "forgot-verify" ? (
              <Pressable onPress={() => goToMode("signin")} hitSlop={8} style={{ alignSelf: "center", marginTop: spacing.sm }} testID="back-to-signin-link">
                <Text style={styles.footerLink}>Back to sign in</Text>
              </Pressable>
            ) : null}
          </Card>

          <Text style={styles.footer}>
            {mode === "signin"
              ? "By signing in, you agree to keep your farm data safe. Your existing local data stays on this device as a backup."
              : mode === "signup"
              ? "We'll create your cloud workspace and safely upload the data already on this device."
              : ""}
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
  noticeBox: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: spacing.sm, backgroundColor: colors.brandSecondary, padding: 10, borderRadius: radius.md },
  noticeText: { color: colors.success, fontWeight: "600", fontSize: 13, flex: 1 },
  forgotTitle: { fontSize: 18, fontWeight: "800", color: colors.onSurface, textAlign: "center", marginBottom: spacing.md },
  forgotEmailNotice: { fontSize: 13, color: colors.muted, marginBottom: spacing.sm },
  footer: { marginTop: spacing.lg, color: colors.muted, fontSize: 12, textAlign: "center", lineHeight: 17 },
  footerLink: { color: colors.brandPrimary, fontWeight: "700" },
  eyeBtn: { position: "absolute", right: 12, top: 34, padding: 4 },
});
