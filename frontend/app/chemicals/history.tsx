import { useCallback, useMemo, useState } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useLocalSearchParams, useFocusEffect } from "expo-router";
import Icon from "@react-native-vector-icons/material-design-icons";
import { ScreenHeader } from "@/src/components/header";
import { Card, Chip, Input } from "@/src/components/ui";
import { colors, radius, spacing } from "@/src/theme";
import { repo } from "@/src/lib/storage";
import type { Chemical, ChemicalStockLine, StockMovement } from "@/src/lib/types";

type Mode = "asof" | "period";

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}
function monthsAgoStr(n: number): string {
  const d = new Date();
  d.setMonth(d.getMonth() - n);
  return d.toISOString().slice(0, 10);
}

// Movements are the ledger of truth; a line/chemical's CURRENT qty is the
// known-good endpoint, so "qty as of a past date" is reconstructed by
// walking backward: subtract every movement that happened AFTER that date.
function qtyAsOf(currentQty: number, movements: StockMovement[], dateISO: string): number {
  const cutoff = new Date(dateISO + "T23:59:59").getTime();
  const after = movements.filter((m) => new Date(m.ts).getTime() > cutoff);
  const undoSum = after.reduce((sum, m) => sum + m.delta, 0);
  return Math.round((currentQty - undoSum) * 100) / 100;
}

export default function ChemicalHistory() {
  const insets = useSafeAreaInsets();
  const { chemicalId } = useLocalSearchParams<{ chemicalId?: string }>();
  const [chemicals, setChemicals] = useState<Chemical[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(chemicalId ?? null);
  const [lines, setLines] = useState<ChemicalStockLine[]>([]);
  const [movements, setMovements] = useState<StockMovement[]>([]);
  const [mode, setMode] = useState<Mode>("asof");
  const [asOfDate, setAsOfDate] = useState(todayStr());
  const [periodStart, setPeriodStart] = useState(monthsAgoStr(12));
  const [periodEnd, setPeriodEnd] = useState(todayStr());

  useFocusEffect(useCallback(() => {
    repo.chemicals.active().then((cs) => {
      setChemicals(cs);
      setSelectedId((cur) => cur ?? (cs[0]?.id ?? null));
    });
  }, []));

  useFocusEffect(useCallback(() => {
    if (!selectedId) return;
    repo.chemicalStockLines.forChemical(selectedId).then((ls) => setLines(ls.filter((l) => !l.archived_at)));
    repo.stockMovements.forChemical(selectedId).then(setMovements);
  }, [selectedId]));

  const chem = chemicals.find((c) => c.id === selectedId) ?? null;

  const asOfResult = useMemo(() => {
    if (!chem) return null;
    const total = qtyAsOf(chem.stock_qty ?? 0, movements, asOfDate);
    const perLine = lines.map((l) => {
      const lineMovements = movements.filter((m) => m.stock_line_id === l.id);
      const hasHistory = lineMovements.length > 0;
      return {
        line: l,
        qty: hasHistory ? qtyAsOf(l.qty, lineMovements, asOfDate) : null, // null = no attributable history, can't reconstruct
      };
    });
    return { total, perLine };
  }, [chem, movements, lines, asOfDate]);

  const periodResult = useMemo(() => {
    if (!chem) return null;
    const start = new Date(periodStart + "T00:00:00").getTime();
    const end = new Date(periodEnd + "T23:59:59").getTime();
    const inRange = movements.filter((m) => {
      const t = new Date(m.ts).getTime();
      return t >= start && t <= end;
    });
    const added = inRange.filter((m) => m.delta > 0).reduce((s, m) => s + m.delta, 0);
    const used = inRange.filter((m) => m.delta < 0).reduce((s, m) => s - m.delta, 0);
    const byReason = new Map<string, number>();
    for (const m of inRange) {
      byReason.set(m.reason, (byReason.get(m.reason) ?? 0) + Math.abs(m.delta));
    }
    const byLine = lines.map((l) => {
      const lineMoves = inRange.filter((m) => m.stock_line_id === l.id);
      const netUsed = lineMoves.filter((m) => m.delta < 0).reduce((s, m) => s - m.delta, 0);
      const netAdded = lineMoves.filter((m) => m.delta > 0).reduce((s, m) => s + m.delta, 0);
      return { line: l, netUsed, netAdded, count: lineMoves.length };
    }).filter((r) => r.count > 0);
    return {
      count: inRange.length,
      added: Math.round(added * 100) / 100,
      used: Math.round(used * 100) / 100,
      byReason: Array.from(byReason.entries()),
      byLine,
    };
  }, [chem, movements, lines, periodStart, periodEnd]);

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface, paddingTop: insets.top }}>
      <ScreenHeader title="Stock History" back />

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
        {chemicals.map((c) => (
          <Chip key={c.id} label={c.product_name} active={selectedId === c.id} onPress={() => setSelectedId(c.id)} testID={`history-chem-${c.id}`} />
        ))}
      </ScrollView>

      {!chem ? (
        <View style={styles.emptyState}>
          <Icon name="flask-outline" size={40} color={colors.muted} />
          <Text style={styles.emptyText}>No chemicals in your register yet.</Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxl + insets.bottom }}>
          <View style={styles.modeRow}>
            <Pressable onPress={() => setMode("asof")} style={[styles.modeBtn, mode === "asof" && styles.modeBtnActive]} testID="mode-asof">
              <Text style={[styles.modeText, mode === "asof" && styles.modeTextActive]}>Level as of a date</Text>
            </Pressable>
            <Pressable onPress={() => setMode("period")} style={[styles.modeBtn, mode === "period" && styles.modeBtnActive]} testID="mode-period">
              <Text style={[styles.modeText, mode === "period" && styles.modeTextActive]}>Moved over a period</Text>
            </Pressable>
          </View>

          {mode === "asof" ? (
            <>
              <Card>
                <Input label="As of date (YYYY-MM-DD)" value={asOfDate} onChangeText={setAsOfDate} testID="input-asof-date" />
                <View style={styles.presetRow}>
                  <Chip label="1 month ago" onPress={() => setAsOfDate(monthsAgoStr(1))} testID="preset-1m" />
                  <Chip label="3 months ago" onPress={() => setAsOfDate(monthsAgoStr(3))} testID="preset-3m" />
                  <Chip label="6 months ago" onPress={() => setAsOfDate(monthsAgoStr(6))} testID="preset-6m" />
                  <Chip label="12 months ago" onPress={() => setAsOfDate(monthsAgoStr(12))} testID="preset-12m" />
                </View>
              </Card>

              <Text style={styles.section}>{chem.product_name} as of {asOfDate}</Text>
              <Card>
                <Text style={styles.bigNumber}>{asOfResult?.total ?? 0} {chem.stock_unit ?? chem.pack_size ?? ""}</Text>
                <Text style={styles.hint}>Reconstructed from the stock movement ledger — reverses every recorded movement after this date from today&apos;s total.</Text>
              </Card>

              {lines.length > 0 ? (
                <>
                  <Text style={styles.section}>By pack size</Text>
                  {asOfResult?.perLine.map(({ line, qty }) => (
                    <Card key={line.id} style={{ marginBottom: spacing.sm }} testID={`asof-line-${line.id}`}>
                      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                        <View>
                          <Text style={styles.lineTitle}>{line.pack_size}</Text>
                          {line.location ? <Text style={styles.lineMeta}>{line.location}</Text> : null}
                        </View>
                        {qty != null ? (
                          <Text style={styles.lineQty}>{qty}</Text>
                        ) : (
                          <Text style={styles.noHistory}>No history before now</Text>
                        )}
                      </View>
                    </Card>
                  ))}
                </>
              ) : null}
            </>
          ) : (
            <>
              <Card>
                <View style={{ flexDirection: "row", gap: 8 }}>
                  <View style={{ flex: 1 }}><Input label="From (YYYY-MM-DD)" value={periodStart} onChangeText={setPeriodStart} testID="input-period-start" /></View>
                  <View style={{ flex: 1 }}><Input label="To (YYYY-MM-DD)" value={periodEnd} onChangeText={setPeriodEnd} testID="input-period-end" /></View>
                </View>
                <View style={styles.presetRow}>
                  <Chip label="Last 30 days" onPress={() => { setPeriodStart(monthsAgoStr(1)); setPeriodEnd(todayStr()); }} testID="preset-30d" />
                  <Chip label="Last 3 months" onPress={() => { setPeriodStart(monthsAgoStr(3)); setPeriodEnd(todayStr()); }} testID="preset-3mo" />
                  <Chip label="Last 12 months" onPress={() => { setPeriodStart(monthsAgoStr(12)); setPeriodEnd(todayStr()); }} testID="preset-12mo" />
                </View>
              </Card>

              <Text style={styles.section}>{chem.product_name} · {periodStart} → {periodEnd}</Text>
              <Card>
                <Text style={styles.periodLine}>Added: <Text style={styles.periodValue}>+{periodResult?.added ?? 0} {chem.stock_unit ?? ""}</Text></Text>
                <Text style={styles.periodLine}>Used / removed: <Text style={[styles.periodValue, { color: colors.error }]}>−{periodResult?.used ?? 0} {chem.stock_unit ?? ""}</Text></Text>
                <Text style={styles.hint}>{periodResult?.count ?? 0} movement{periodResult?.count === 1 ? "" : "s"} in this period.</Text>
              </Card>

              {periodResult && periodResult.byReason.length > 0 ? (
                <>
                  <Text style={styles.section}>By reason</Text>
                  <Card>
                    {periodResult.byReason.map(([reason, total]) => (
                      <View key={reason} style={styles.field}>
                        <Text style={styles.fieldLabel}>{reason}</Text>
                        <Text style={styles.fieldValue}>{Math.round(total * 100) / 100} {chem.stock_unit ?? ""}</Text>
                      </View>
                    ))}
                  </Card>
                </>
              ) : null}

              {periodResult && periodResult.byLine.length > 0 ? (
                <>
                  <Text style={styles.section}>By pack size</Text>
                  {periodResult.byLine.map(({ line, netUsed, netAdded }) => (
                    <Card key={line.id} style={{ marginBottom: spacing.sm }} testID={`period-line-${line.id}`}>
                      <Text style={styles.lineTitle}>{line.pack_size}{line.location ? ` · ${line.location}` : ""}</Text>
                      <Text style={styles.lineMeta}>Added {netAdded} · Used {netUsed}</Text>
                    </Card>
                  ))}
                </>
              ) : null}
            </>
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
  modeRow: { flexDirection: "row", gap: 8, marginBottom: spacing.md },
  modeBtn: { flex: 1, height: 44, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfaceTertiary, alignItems: "center", justifyContent: "center" },
  modeBtnActive: { backgroundColor: colors.brandPrimary, borderColor: colors.brandPrimary },
  modeText: { fontSize: 13, fontWeight: "700", color: colors.onSurfaceTertiary },
  modeTextActive: { color: colors.onBrandPrimary },
  presetRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: spacing.sm },
  section: { fontSize: 13, fontWeight: "800", color: colors.muted, marginTop: spacing.lg, marginBottom: spacing.sm, textTransform: "uppercase", letterSpacing: 0.5 },
  bigNumber: { fontSize: 28, fontWeight: "800", color: colors.onSurface },
  hint: { fontSize: 12, color: colors.muted, fontStyle: "italic", lineHeight: 17, marginTop: 6 },
  lineTitle: { fontSize: 15, fontWeight: "700", color: colors.onSurface },
  lineMeta: { fontSize: 12, color: colors.muted, marginTop: 2 },
  lineQty: { fontSize: 18, fontWeight: "800", color: colors.brandPrimary },
  noHistory: { fontSize: 11, color: colors.muted, fontStyle: "italic", maxWidth: 140, textAlign: "right" },
  periodLine: { fontSize: 14, color: colors.onSurface, marginBottom: 4 },
  periodValue: { fontWeight: "800", color: colors.success },
  field: { flexDirection: "row", justifyContent: "space-between", paddingVertical: spacing.xs, borderBottomWidth: 1, borderBottomColor: colors.border },
  fieldLabel: { fontSize: 13, color: colors.muted, fontWeight: "600" },
  fieldValue: { fontSize: 13, color: colors.onSurface, fontWeight: "700" },
});
