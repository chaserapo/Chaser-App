import { useCallback, useEffect, useState } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator, Switch } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { v4 as uuid } from "uuid";
import Icon from "@react-native-vector-icons/material-design-icons";
import { ScreenHeader } from "@/src/components/header";
import { Card, Button } from "@/src/components/ui";
import { colors, radius, spacing } from "@/src/theme";
import { supabase } from "@/src/lib/supabase";
import { useAuth } from "@/src/lib/auth-context";
import { confirm } from "@/src/lib/confirm";

type AlertKind = "spray_window" | "rain_after_spray" | "frost" | "wind_max" | "rain_change";
type Alert = {
  id: string;
  business_id: string;
  user_id: string;
  farm_id?: string | null;
  kind: AlertKind;
  config: Record<string, any>;
  enabled: boolean;
  created_at: string;
};

const KINDS: { kind: AlertKind; icon: string; label: string; sub: string }[] = [
  { kind: "spray_window",     icon: "sprinkler-variant",     label: "Suitable spraying window",  sub: "Notify me when a window matching my thresholds opens up." },
  { kind: "rain_after_spray", icon: "weather-pouring",       label: "Rain after a spray job",   sub: "Warn me if rain is forecast within the rain-free window after today's spray." },
  { kind: "frost",            icon: "snowflake",             label: "Frost risk",               sub: "Notify me when overnight lows are near or below freezing." },
  { kind: "wind_max",         icon: "weather-windy",         label: "Wind exceeds threshold",   sub: "Warn me when forecast winds exceed my configured maximum." },
  { kind: "rain_change",      icon: "weather-lightning-rainy", label: "Rainfall forecast changes", sub: "Notify me if the rainfall forecast shifts significantly." },
];

export default function AlertsScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { farmId } = useLocalSearchParams<{ farmId: string }>();
  const { user, business } = useAuth();
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyKind, setBusyKind] = useState<AlertKind | null>(null);

  const load = useCallback(async () => {
    if (!user || !business) return;
    setLoading(true);
    try {
      let q = supabase.from("weather_alerts").select("*").eq("user_id", user.id);
      if (farmId) q = q.eq("farm_id", farmId as string);
      const { data, error } = await q.order("created_at", { ascending: false });
      if (!error && data) setAlerts(data as Alert[]);
    } finally { setLoading(false); }
  }, [user, business, farmId]);
  useEffect(() => { load(); }, [load]);

  async function toggle(kind: AlertKind) {
    if (!user || !business) return;
    setBusyKind(kind);
    try {
      const existing = alerts.find((a) => a.kind === kind);
      if (existing) {
        const { error } = await supabase.from("weather_alerts").update({ enabled: !existing.enabled }).eq("id", existing.id);
        if (!error) setAlerts((s) => s.map((a) => (a.id === existing.id ? { ...a, enabled: !a.enabled } : a)));
      } else {
        const row: Alert = {
          id: uuid(),
          business_id: business.id,
          user_id: user.id,
          farm_id: (farmId as string) ?? null,
          kind,
          config: {},
          enabled: true,
          created_at: new Date().toISOString(),
        };
        const { error } = await supabase.from("weather_alerts").insert(row);
        if (!error) setAlerts((s) => [row, ...s]);
      }
    } finally { setBusyKind(null); }
  }

  async function removeAlert(kind: AlertKind) {
    const existing = alerts.find((a) => a.kind === kind);
    if (!existing) return;
    confirm({ title: "Delete this alert?", message: "This can be re-created any time.", confirmLabel: "Delete", destructive: true }, async () => {
      const { error } = await supabase.from("weather_alerts").delete().eq("id", existing.id);
      if (!error) setAlerts((s) => s.filter((a) => a.id !== existing.id));
    });
  }

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.surface, paddingTop: insets.top }}>
        <ScreenHeader title="Weather alerts" back />
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}><ActivityIndicator color={colors.brandPrimary} /></View>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface, paddingTop: insets.top }}>
      <ScreenHeader title="Weather alerts" back />
      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: insets.bottom + spacing.xxl }}>
        <Card>
          <View style={styles.notice}>
            <Icon name="information-outline" size={18} color={colors.brandPrimary} />
            <Text style={styles.noticeText}>
              Turn any of these on and Chaser checks the forecast in the background and sends you a push notification the first time the condition is met. Make sure notifications are allowed for Chaser in your phone&apos;s settings.
            </Text>
          </View>
        </Card>

        {KINDS.map((k) => {
          const existing = alerts.find((a) => a.kind === k.kind);
          const enabled = existing?.enabled ?? false;
          return (
            <View key={k.kind} style={styles.alertRow} testID={`alert-${k.kind}`}>
              <Icon name={k.icon} size={22} color={enabled ? colors.brandPrimary : colors.muted} />
              <View style={{ flex: 1 }}>
                <Text style={styles.alertLabel}>{k.label}</Text>
                <Text style={styles.alertSub}>{k.sub}</Text>
              </View>
              {busyKind === k.kind ? (
                <ActivityIndicator color={colors.brandPrimary} />
              ) : (
                <Switch value={enabled} onValueChange={() => toggle(k.kind)} thumbColor={enabled ? colors.brandPrimary : colors.surface} trackColor={{ true: colors.brandSecondary, false: colors.border }} />
              )}
              {existing ? (
                <Pressable onPress={() => removeAlert(k.kind)} hitSlop={10} style={{ marginLeft: 4 }}>
                  <Icon name="close" size={16} color={colors.muted} />
                </Pressable>
              ) : null}
            </View>
          );
        })}

        <Text style={styles.footer}>Alerts are stored per-user, scoped to your business. Chaser will never share alerts with other operators.</Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  notice: { flexDirection: "row", gap: 8, alignItems: "flex-start" },
  noticeText: { flex: 1, fontSize: 12, color: colors.onSurface, lineHeight: 17 },
  alertRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.border },
  alertLabel: { fontSize: 14, fontWeight: "800", color: colors.onSurface },
  alertSub: { fontSize: 11, color: colors.muted, marginTop: 2, lineHeight: 15 },
  footer: { fontSize: 11, color: colors.muted, textAlign: "center", marginTop: spacing.xl, fontStyle: "italic" },
});
