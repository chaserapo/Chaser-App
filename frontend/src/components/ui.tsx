import React from "react";
import { View, Text, Pressable, StyleSheet, ViewStyle, TextStyle, StyleProp, KeyboardTypeOptions } from "react-native";
import * as Haptics from "expo-haptics";
import Icon from "@react-native-vector-icons/material-design-icons";
import { colors, radius, spacing } from "../theme";

type Variant = "primary" | "secondary" | "outline" | "ghost" | "danger";

export function Button({
  title,
  onPress,
  variant = "primary",
  icon,
  disabled,
  loading,
  size = "md",
  style,
  testID,
}: {
  title: string;
  onPress?: () => void;
  variant?: Variant;
  icon?: string;
  disabled?: boolean;
  loading?: boolean;
  size?: "sm" | "md" | "lg";
  style?: ViewStyle;
  testID?: string;
}) {
  const bg =
    variant === "primary" ? colors.brandPrimary
    : variant === "secondary" ? colors.brandSecondary
    : variant === "danger" ? colors.error
    : "transparent";
  const fg =
    variant === "primary" ? colors.onBrandPrimary
    : variant === "secondary" ? colors.onBrandSecondary
    : variant === "danger" ? colors.onError
    : colors.onSurface;
  const border = variant === "outline" ? colors.borderStrong : "transparent";
  const height = size === "lg" ? 60 : size === "sm" ? 44 : 52;
  const fontSize = size === "lg" ? 18 : 16;

  return (
    <Pressable
      testID={testID}
      disabled={disabled || loading}
      onPress={() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
        onPress?.();
      }}
      style={({ pressed }) => [
        styles.btn,
        { backgroundColor: bg, borderColor: border, height, opacity: disabled ? 0.5 : pressed ? 0.85 : 1 },
        style,
      ]}
    >
      {icon ? <Icon name={icon as any} size={size === "lg" ? 22 : 20} color={fg} style={{ marginRight: 8 }} /> : null}
      <Text style={[styles.btnText, { color: fg, fontSize }]}>{loading ? "…" : title}</Text>
    </Pressable>
  );
}

export function Card({ children, style, onPress, testID }: { children: React.ReactNode; style?: StyleProp<ViewStyle>; onPress?: () => void; testID?: string }) {
  const content = <View style={[styles.card, style]}>{children}</View>;
  if (onPress) {
    return (
      <Pressable testID={testID} onPress={onPress} style={({ pressed }) => ({ opacity: pressed ? 0.9 : 1 })}>
        {content}
      </Pressable>
    );
  }
  return <View testID={testID}>{content}</View>;
}

export function SectionTitle({ children, action, testID }: { children: React.ReactNode; action?: React.ReactNode; testID?: string }) {
  return (
    <View style={styles.sectionRow} testID={testID}>
      <Text style={styles.sectionTitle}>{children}</Text>
      {action}
    </View>
  );
}

export function StatusBadge({ status, testID }: { status: "good" | "due_soon" | "overdue"; testID?: string }) {
  const map = {
    good: { bg: colors.brandSecondary, fg: colors.onBrandSecondary, label: "Good" },
    due_soon: { bg: "#FEF3C7", fg: colors.warning, label: "Due Soon" },
    overdue: { bg: "#FEE2E2", fg: colors.error, label: "Overdue" },
  } as const;
  const c = map[status];
  return (
    <View style={[styles.badge, { backgroundColor: c.bg }]} testID={testID}>
      <Text style={[styles.badgeText, { color: c.fg }]}>{c.label}</Text>
    </View>
  );
}

export function Input({
  label,
  value,
  onChangeText,
  keyboardType,
  placeholder,
  suffix,
  testID,
  multiline,
  error,
  secureTextEntry,
  autoCapitalize,
}: {
  label?: string;
  value: string;
  onChangeText: (t: string) => void;
  keyboardType?: KeyboardTypeOptions;
  placeholder?: string;
  suffix?: string;
  testID?: string;
  multiline?: boolean;
  error?: boolean;
  secureTextEntry?: boolean;
  autoCapitalize?: "none" | "sentences" | "words" | "characters";
}) {
  const { TextInput } = require("react-native");
  return (
    <View style={styles.inputWrap}>
      {label ? <Text style={[styles.inputLabel, error && { color: colors.error }]}>{label}{error ? " *" : ""}</Text> : null}
      <View style={[styles.inputBox, multiline && { minHeight: 88, alignItems: "flex-start" }, error && { borderColor: colors.error, borderWidth: 1.5 }]}>
        <TextInput
          testID={testID}
          value={value}
          onChangeText={onChangeText}
          keyboardType={keyboardType}
          placeholder={placeholder}
          placeholderTextColor={colors.muted}
          style={styles.input}
          multiline={multiline}
          secureTextEntry={secureTextEntry}
          autoCapitalize={autoCapitalize}
        />
        {suffix ? <Text style={styles.suffix}>{suffix}</Text> : null}
      </View>
    </View>
  );
}

export function Chip({ label, active, onPress, testID }: { label: string; active?: boolean; onPress?: () => void; testID?: string }) {
  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      style={[
        styles.chip,
        { backgroundColor: active ? colors.brandPrimary : colors.surfaceTertiary, borderColor: active ? colors.brandPrimary : colors.border },
      ]}
    >
      <Text style={{ color: active ? colors.onBrandPrimary : colors.onSurfaceTertiary, fontWeight: "600", fontSize: 13 }}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  btn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.md,
    paddingHorizontal: spacing.lg,
    borderWidth: 1,
  },
  btnText: { fontWeight: "700" as TextStyle["fontWeight"] },
  card: {
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.lg,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  sectionRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: spacing.xl,
    marginBottom: spacing.md,
  },
  sectionTitle: { fontSize: 18, fontWeight: "700", color: colors.onSurface },
  badge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radius.pill,
    alignSelf: "flex-start",
  },
  badgeText: { fontWeight: "700", fontSize: 12 },
  inputWrap: { marginBottom: spacing.md },
  inputLabel: { fontSize: 13, fontWeight: "600", color: colors.onSurfaceTertiary, marginBottom: 6 },
  inputBox: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
    minHeight: 52,
  },
  input: { flex: 1, fontSize: 16, color: colors.onSurface, paddingVertical: 12 },
  suffix: { color: colors.muted, fontWeight: "600", marginLeft: 8 },
  chip: {
    height: 36,
    paddingHorizontal: 14,
    borderRadius: radius.pill,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
});
