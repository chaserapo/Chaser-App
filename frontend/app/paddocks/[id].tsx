import { useCallback, useRef, useState } from "react";
import { View, Text, ScrollView, StyleSheet } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter, useFocusEffect } from "expo-router";
import Icon from "@react-native-vector-icons/material-design-icons";
import { ScreenHeader } from "@/src/components/header";
import { Button, Card } from "@/src/components/ui";
import { colors, radius, spacing } from "@/src/theme";
import { repo } from "@/src/lib/storage";
import { useAuth } from "@/src/lib/auth-context";
import { confirm } from "@/src/lib/confirm";
import { PaddockMap, PaddockMapHandle } from "@/src/features/paddocks/PaddockMap";
import type { Paddock, SprayJob } from "@/src/lib/types";

export default function PaddockDetail() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { business } = useAuth();
  const canEdit = business?.role === "owner" || business?.role === "manager";
  const [p, setP] = useState<Paddock | null>(null);
  const [history, setHistory] = useState<SprayJob[]>([]);
  const mapRef = useRef<PaddockMapHandle>(null);

  const load = useCallback(async () => {
    if (!id) return;
    const list = await repo.paddocks.list();
    const one = list.find((x) => x.id === id) ?? null;
    setP(one);
    // History: filter completed spray jobs for this paddock
    try {
      const jobs = await repo.sprayJobs.completed();
      setHistory(jobs.filter((j) => j.paddock_id === id).sort((a, b) => b.date.localeCompare(a.date)));
    } catch { /* history optional */ }
  }, [id]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  function confirmDelete() {
    if (!p) return;
    confirm({ title: "Delete paddock", message: `Remove ${p.name}? Existing spray records will remain but no longer link to this paddock.`, confirmLabel: "Delete", destructive: true },
      async () => { await repo.paddocks.remove(p.id); router.back(); });
  }

  if (!p) {
    return <View style={{ flex: 1, backgroundColor: colors.surface, paddingTop: insets.top }}><ScreenHeader title="Paddock" back /></View>;
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface, paddingTop: insets.top }}>
      <ScreenHeader title={p.name} back />
      <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + spacing.xxl }}>
        <View style={{ height: 260 }}>
          <PaddockMap
            ref={mapRef}
            paddocks={[{ id: p.id, name: p.name, area_ha: p.area_ha, crop: p.crop, boundary_geojson: p.boundary ?? null }]}
          />
        </View>

        <View style={{ padding: spacing.lg }}>
          <Card>
            <View style={{ flexDirection: "row", alignItems: "center", marginBottom: spacing.md }}>
              <View style={styles.icon}><Icon name="grass" size={28} color={colors.brandPrimary} /></View>
              <View style={{ flex: 1 }}>
                <Text style={styles.name}>{p.name}</Text>
                <Text style={styles.sub}>{p.area_ha != null ? `${p.area_ha} ha` : "—"}{p.crop ? ` · ${p.crop}` : ""}{p.variety ? ` (${p.variety})` : ""}</Text>
              </View>
            </View>
            <Field label="Crop" value={p.crop} />
            <Field label="Variety" value={p.variety} />
            <Field label="Notes" value={p.notes} />
          </Card>

          <View style={{ height: spacing.md }} />
          <Button title="New Spray Job" icon="plus" onPress={() => router.push({ pathname: "/records/new", params: { paddockId: p.id } })} testID="detail-new-job-btn" />
          {canEdit ? (
            <>
              <View style={{ height: spacing.sm }} />
              <Button title="Delete Paddock" variant="danger" icon="trash-can-outline" onPress={confirmDelete} testID="detail-delete-btn" />
            </>
          ) : null}

          <Text style={styles.section}>Application History</Text>
          {history.length === 0 ? (
            <Card><Text style={styles.empty}>No completed spray records yet.</Text></Card>
          ) : (
            history.map((j) => (
              <Card key={j.id} style={{ marginBottom: spacing.sm }} onPress={() => router.push({ pathname: "/records/[id]", params: { id: j.id } })} testID={`history-${j.id}`}>
                <View style={{ flexDirection: "row", alignItems: "center" }}>
                  <View style={styles.dot} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.rowTitle}>{j.date}{j.target ? ` · ${j.target}` : ""}</Text>
                    <Text style={styles.rowSub}>{j.operator ?? "—"} · {j.machinery_name ?? "—"} · {j.actual_area_ha ?? j.area_ha ?? "—"} ha</Text>
                  </View>
                  <Icon name="chevron-right" size={20} color={colors.muted} />
                </View>
              </Card>
            ))
          )}

          <Text style={styles.futureNote}>
            <Icon name="information-outline" size={12} color={colors.muted} /> Fertiliser applications, seeding, harvest and agronomy history will appear here in future updates.
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}

function Field({ label, value }: { label: string; value?: string | number | null }) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <Text style={styles.fieldValue}>{value ?? "—"}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  icon: { width: 52, height: 52, borderRadius: radius.md, backgroundColor: colors.brandSecondary, alignItems: "center", justifyContent: "center", marginRight: 14 },
  name: { fontSize: 20, fontWeight: "800", color: colors.onSurface },
  sub: { color: colors.muted, marginTop: 2, fontSize: 13 },
  field: { paddingVertical: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.border },
  fieldLabel: { fontSize: 12, color: colors.muted, fontWeight: "600", textTransform: "uppercase" },
  fieldValue: { fontSize: 15, color: colors.onSurface, marginTop: 4, fontWeight: "600" },
  section: { fontSize: 13, fontWeight: "800", color: colors.muted, marginTop: spacing.xl, marginBottom: spacing.sm, textTransform: "uppercase", letterSpacing: 0.5 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.brandPrimary, marginRight: 12 },
  rowTitle: { fontSize: 15, fontWeight: "700", color: colors.onSurface },
  rowSub: { fontSize: 12, color: colors.muted, marginTop: 2 },
  empty: { color: colors.muted, textAlign: "center" },
  futureNote: { marginTop: spacing.xl, fontSize: 12, color: colors.muted, fontStyle: "italic", textAlign: "center", lineHeight: 17 },
});
