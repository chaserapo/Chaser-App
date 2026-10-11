import { useCallback, useMemo, useState } from "react";
import { View, Text, StyleSheet, ScrollView } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter, useFocusEffect } from "expo-router";
import Icon from "@react-native-vector-icons/material-design-icons";
import { ScreenHeader } from "@/src/components/header";
import { Card, Chip } from "@/src/components/ui";
import { colors, radius, spacing } from "@/src/theme";
import { repo } from "@/src/lib/storage";
import type { Chemical, ChemicalBatch, StockMovement } from "@/src/lib/types";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

type OrderEntry = { id: string; date: string; qty?: number; unit?: string; label: string; notes?: string };

export default function MyChemicalHistory() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [chemicals, setChemicals] = useState<Chemical[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [batches, setBatches] = useState<ChemicalBatch[]>([]);
  const [movements, setMovements] = useState<StockMovement[]>([]);

  // Every chemical ever added — active and archived — so nothing drops out
  // of this view just because it was retired from the active register.
  useFocusEffect(useCallback(() => {
    repo.chemicals.list().then((cs) => {
      const sorted = [...cs].sort((a, b) => a.product_name.localeCompare(b.product_name));
      setChemicals(sorted);
      setSelectedId((cur) => (cur && sorted.some((c) => c.id === cur) ? cur : sorted[0]?.id ?? null));
    });
  }, []));

  useFocusEffect(useCallback(() => {
    if (!selectedId) { setBatches([]); setMovements([]); return; }
    repo.chemicalBatches.forChemical(selectedId).then(setBatches);
    repo.stockMovements.forChemical(selectedId).then(setMovements);
  }, [selectedId]));

  const chem = chemicals.find((c) => c.id === selectedId) ?? null;

  // Seasonal usage — every outgoing movement (delta < 0, any reason) summed
  // by calendar month across all years on record, so a grower can see which
  // months this product is typically used in, independent of the year.
  const seasonal = useMemo(() => {
    const totals = new Array(12).fill(0);
    for (const m of movements) {
      if (m.delta >= 0) continue;
      totals[new Date(m.ts).getMonth()] += -m.delta;
    }
    const rounded = totals.map((t) => Math.round(t * 100) / 100);
    const max = Math.max(1, ...rounded);
    return MONTHS.map((label, i) => ({ label, total: rounded[i], pct: rounded[i] / max }));
  }, [movements]);
  const hasAnyUsage = seasonal.some((m) => m.total > 0);

  // Order/restock history — merges formal batch records (lot number,
  // expiry) with standalone "Purchase" stock adjustments logged without a
  // batch, newest first. These come from two separate entry points in the
  // app (New Batch vs. a manual stock adjustment) that never create each
  // other, so there's no risk of the same restock appearing twice here.
  const orders = useMemo<OrderEntry[]>(() => {
    const fromBatches: OrderEntry[] = batches.map((b) => ({
      id: b.id,
      date: b.purchase_date ?? b.created_at,
      qty: b.quantity,
      unit: b.unit,
      label: b.batch_number ? `Lot ${b.batch_number}` : "Batch",
      notes: b.notes,
    }));
    const fromPurchaseMovements: OrderEntry[] = movements
      .filter((m) => m.reason === "Purchase" && m.delta > 0)
      .map((m) => ({ id: m.id, date: m.ts, qty: m.delta, unit: m.unit, label: "Restock", notes: m.notes }));
    return [...fromBatches, ...fromPurchaseMovements].sort((a, b) => b.date.localeCompare(a.date));
  }, [batches, movements]);

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface, paddingTop: insets.top }}>
      <ScreenHeader title="My Chemical History" back />

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
        {chemicals.map((c) => (
          <Chip
            key={c.id}
            label={c.archived_at ? `${c.product_name} (Archived)` : c.product_name}
            active={selectedId === c.id}
            onPress={() => setSelectedId(c.id)}
            testID={`my-history-chem-${c.id}`}
          />
        ))}
      </ScrollView>

      {!chem ? (
        <View style={styles.emptyState}>
          <Icon name="flask-outline" size={40} color={colors.muted} />
          <Text style={styles.emptyText}>No chemicals added yet.</Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxl + insets.bottom }}>
          <Card onPress={() => router.push({ pathname: "/chemicals/[id]", params: { id: chem.id } })} testID="my-history-chem-card">
            <View style={{ flexDirection: "row", alignItems: "center" }}>
              <View style={{ flex: 1 }}>
                <Text style={styles.chemName}>{chem.product_name}</Text>
                {chem.active_ingredient ? <Text style={styles.chemAi}>{chem.active_ingredient}</Text> : null}
              </View>
              {chem.archived_at ? (
                <View style={styles.archBadge}><Text style={styles.archBadgeText}>Archived</Text></View>
              ) : null}
              <Icon name="chevron-right" size={20} color={colors.muted} />
            </View>
          </Card>

          <Text style={styles.section}>Seasonal usage</Text>
          <Card>
            {hasAnyUsage ? (
              seasonal.map((m) => (
                <View key={m.label} style={styles.monthRow}>
                  <Text style={styles.monthLabel}>{m.label}</Text>
                  <View style={styles.barTrack}>
                    {m.total > 0 ? <View style={[styles.barFill, { width: `${Math.max(6, Math.round(m.pct * 100))}%` }]} /> : null}
                  </View>
                  <Text style={styles.monthValue}>{m.total > 0 ? `${m.total} ${chem.stock_unit ?? ""}` : "—"}</Text>
                </View>
              ))
            ) : (
              <Text style={styles.hint}>No usage recorded yet — this fills in as spray jobs use this product over time.</Text>
            )}
          </Card>

          <Text style={styles.section}>Order history</Text>
          {orders.length > 0 ? (
            orders.map((o) => (
              <Card key={o.id} style={{ marginBottom: spacing.sm }} testID={`order-${o.id}`}>
                <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.orderLabel}>{o.label}</Text>
                    <Text style={styles.orderDate}>{o.date?.slice(0, 10)}</Text>
                    {o.notes ? <Text style={styles.orderNotes}>{o.notes}</Text> : null}
                  </View>
                  {o.qty != null ? <Text style={styles.orderQty}>+{o.qty} {o.unit ?? ""}</Text> : null}
                </View>
              </Card>
            ))
          ) : (
            <Card><Text style={styles.hint}>No purchases recorded yet — add a batch or log a &quot;Purchase&quot; stock adjustment to track restocks here.</Text></Card>
          )}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  chipRow: { paddingHorizontal: spacing.lg, gap: spacing.sm, paddingVertical: spacing.sm },
  emptyState: { flex: 1, alignItems: "center", justifyContent: "center", padding: spacing.xl, gap: spacing.sm },
  emptyText: { color: colors.muted, textAlign: "center", fontSize: 14 },
  chemName: { fontSize: 17, fontWeight: "800", color: colors.onSurface },
  chemAi: { fontSize: 13, color: colors.muted, marginTop: 2 },
  archBadge: { backgroundColor: colors.surfaceTertiary, paddingHorizontal: 8, paddingVertical: 3, borderRadius: radius.pill, marginRight: 8 },
  archBadgeText: { fontSize: 10, fontWeight: "800", color: colors.onSurfaceTertiary, textTransform: "uppercase" },
  section: { fontSize: 13, fontWeight: "800", color: colors.muted, marginTop: spacing.lg, marginBottom: spacing.sm, textTransform: "uppercase", letterSpacing: 0.5 },
  hint: { fontSize: 12, color: colors.muted, fontStyle: "italic", lineHeight: 17 },
  monthRow: { flexDirection: "row", alignItems: "center", paddingVertical: 6, gap: 8 },
  monthLabel: { width: 34, fontSize: 12, fontWeight: "700", color: colors.onSurface },
  barTrack: { flex: 1, height: 10, borderRadius: 5, backgroundColor: colors.surfaceTertiary, overflow: "hidden" },
  barFill: { height: 10, borderRadius: 5, backgroundColor: colors.brandPrimary },
  monthValue: { width: 74, fontSize: 11, color: colors.muted, textAlign: "right", fontWeight: "600" },
  orderLabel: { fontSize: 14, fontWeight: "700", color: colors.onSurface },
  orderDate: { fontSize: 12, color: colors.muted, marginTop: 2 },
  orderNotes: { fontSize: 12, color: colors.muted, marginTop: 4, fontStyle: "italic" },
  orderQty: { fontSize: 14, fontWeight: "800", color: colors.success },
});
