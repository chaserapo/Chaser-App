import { useCallback, useState } from "react";
import { View, Text, FlatList, StyleSheet, Pressable, ActivityIndicator } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter, useFocusEffect } from "expo-router";
import Icon from "@react-native-vector-icons/material-design-icons";
import { ScreenHeader } from "@/src/components/header";
import { Card, Input, Button } from "@/src/components/ui";
import { colors, radius, spacing } from "@/src/theme";
import { repo } from "@/src/lib/storage";
import { useAuth } from "@/src/lib/auth-context";
import { getDefaultLowStockThreshold, setDefaultLowStockThreshold, lowStockThresholdFor, DEFAULT_LOW_STOCK_THRESHOLD } from "@/src/lib/stock";
import { exportLowStockQuotePdf } from "@/src/lib/pdf-report";
import type { Chemical } from "@/src/lib/types";

export default function LowStock() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { business } = useAuth();
  const [items, setItems] = useState<Chemical[]>([]);
  const [defaultThreshold, setDefaultThresholdState] = useState(DEFAULT_LOW_STOCK_THRESHOLD);
  const [defaultInput, setDefaultInput] = useState(String(DEFAULT_LOW_STOCK_THRESHOLD));
  const [savingDefault, setSavingDefault] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [qtyByChem, setQtyByChem] = useState<Record<string, string>>({});
  const [neededBy, setNeededBy] = useState("");
  const [exporting, setExporting] = useState(false);
  const [exportMsg, setExportMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    const def = business ? await getDefaultLowStockThreshold(business.id) : DEFAULT_LOW_STOCK_THRESHOLD;
    setDefaultThresholdState(def);
    setDefaultInput(String(def));
    const list = await repo.chemicals.active();
    const low = list
      .filter((c) => c.stock_qty != null && c.stock_qty <= lowStockThresholdFor(c, def))
      .sort((a, b) => (a.stock_qty ?? 0) - (b.stock_qty ?? 0));
    setItems(low);
    setSelected(new Set(low.map((c) => c.id)));
  }, [business]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  async function saveDefault() {
    if (!business) return;
    const v = parseFloat(defaultInput);
    if (isNaN(v) || v < 0) return;
    setSavingDefault(true);
    try {
      await setDefaultLowStockThreshold(business.id, v);
      await load();
    } finally { setSavingDefault(false); }
  }

  function toggle(id: string) {
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  async function generateQuotePdf() {
    const chosen = items.filter((c) => selected.has(c.id));
    if (chosen.length === 0) return;
    setExporting(true);
    setExportMsg(null);
    try {
      const result = await exportLowStockQuotePdf(
        chosen.map((chemical) => ({ chemical, qtyRequested: qtyByChem[chemical.id]?.trim() || undefined })),
        business?.name ?? "My Farm",
        neededBy.trim() || undefined,
      );
      if (!result.ok) setExportMsg(result.message ?? "Export failed");
      else if (result.message) setExportMsg(result.message);
    } finally { setExporting(false); }
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface, paddingTop: insets.top }}>
      <ScreenHeader title="Low Stock" back />
      <FlatList
        data={items}
        keyExtractor={(c) => c.id}
        contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxl + insets.bottom }}
        ListEmptyComponent={<Card><Text style={styles.empty}>Nothing running low. 👍</Text></Card>}
        ListHeaderComponent={
          <>
            <Card style={{ marginBottom: spacing.md }}>
              <Text style={styles.settingsLabel}>Default low-stock warning</Text>
              <Text style={styles.hint}>Applies to any product that doesn&apos;t have its own warning level set on its Inventory tab.</Text>
              <View style={{ flexDirection: "row", gap: 8, marginTop: spacing.sm, alignItems: "flex-end" }}>
                <View style={{ flex: 1 }}>
                  <Input value={defaultInput} onChangeText={setDefaultInput} keyboardType="decimal-pad" testID="default-threshold-input" />
                </View>
                <Button title="Save" onPress={saveDefault} loading={savingDefault} disabled={savingDefault || defaultInput === String(defaultThreshold)} testID="save-default-threshold-btn" />
              </View>
            </Card>
            <Text style={styles.hint}>Products at or below their warning level are shown here so you can reorder.</Text>
          </>
        }
        renderItem={({ item }) => {
          const stock = item.stock_qty ?? 0;
          const critical = stock <= 0;
          const isSelected = selected.has(item.id);
          return (
            <Card style={{ marginBottom: spacing.md }} testID={`low-row-${item.id}`}>
              <Pressable onPress={() => router.push({ pathname: "/chemicals/[id]", params: { id: item.id } })} style={{ flexDirection: "row", alignItems: "center" }}>
                <Pressable onPress={() => toggle(item.id)} hitSlop={8} style={styles.checkbox} testID={`select-${item.id}`}>
                  <Icon name={isSelected ? "checkbox-marked" : "checkbox-blank-outline"} size={22} color={isSelected ? colors.brandPrimary : colors.muted} />
                </Pressable>
                <View style={[styles.box, { backgroundColor: critical ? colors.error : "#FEE2E2" }]}>
                  <Text style={[styles.num, { color: critical ? colors.onError : colors.error }]}>{stock}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.name}>{item.product_name}</Text>
                  {item.product_type ? <Text style={styles.type}>{item.product_type}{item.manufacturer ? ` · ${item.manufacturer}` : ""}</Text> : null}
                  <Text style={styles.unit}>{item.stock_unit ?? item.pack_size ?? "units"}</Text>
                </View>
                <Pressable onPress={(e) => { e.stopPropagation?.(); router.push({ pathname: "/chemicals/stock-adjust", params: { chemicalId: item.id } }); }} style={styles.adjustBtn} testID={`quick-adjust-${item.id}`}>
                  <Icon name="plus" size={18} color={colors.onBrandPrimary} />
                </Pressable>
              </Pressable>
              {isSelected ? (
                <View style={{ marginTop: spacing.sm }}>
                  <Input
                    label="Qty to request (optional)"
                    value={qtyByChem[item.id] ?? ""}
                    onChangeText={(v) => setQtyByChem((q) => ({ ...q, [item.id]: v }))}
                    placeholder="e.g. 2 drums"
                    testID={`qty-request-${item.id}`}
                  />
                </View>
              ) : null}
            </Card>
          );
        }}
        ListFooterComponent={items.length > 0 ? (
          <View style={{ marginTop: spacing.sm }}>
            <Input label="Required by (optional)" value={neededBy} onChangeText={setNeededBy} placeholder="e.g. 2026-10-01" testID="needed-by-input" />
            {exportMsg ? <Text style={styles.hint}>{exportMsg}</Text> : null}
            <Button
              title={exporting ? "Preparing PDF…" : `Send quote request (${selected.size})`}
              icon="file-pdf-box"
              onPress={generateQuotePdf}
              disabled={exporting || selected.size === 0}
              testID="generate-quote-pdf-btn"
            />
            {exporting ? <ActivityIndicator style={{ marginTop: spacing.sm }} color={colors.brandPrimary} /> : null}
          </View>
        ) : null}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  hint: { fontSize: 12, color: colors.muted, fontStyle: "italic", marginBottom: spacing.md, lineHeight: 17 },
  settingsLabel: { fontSize: 13, fontWeight: "800", color: colors.onSurface },
  checkbox: { marginRight: 10 },
  box: { width: 56, height: 56, borderRadius: radius.md, alignItems: "center", justifyContent: "center", marginRight: 14 },
  num: { fontSize: 24, fontWeight: "900" },
  name: { fontSize: 16, fontWeight: "700", color: colors.onSurface },
  type: { fontSize: 12, color: colors.muted, marginTop: 2, fontWeight: "600" },
  unit: { fontSize: 12, color: colors.muted, marginTop: 2 },
  adjustBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.brandPrimary, alignItems: "center", justifyContent: "center" },
  empty: { color: colors.muted, textAlign: "center" },
});
