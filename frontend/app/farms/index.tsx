import { useCallback, useMemo, useState } from "react";
import { View, Text, ScrollView, StyleSheet, Pressable, TextInput } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter, useFocusEffect } from "expo-router";
import Icon from "@react-native-vector-icons/material-design-icons";
import { ScreenHeader } from "@/src/components/header";
import { Button, Card } from "@/src/components/ui";
import { colors, radius, spacing } from "@/src/theme";
import { repo } from "@/src/lib/storage";
import type { Farm, Paddock } from "@/src/lib/types";

export default function FarmsList() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [farms, setFarms] = useState<Farm[]>([]);
  const [paddocks, setPaddocks] = useState<Paddock[]>([]);
  const [q, setQ] = useState("");
  const [showArchived, setShowArchived] = useState(false);

  useFocusEffect(useCallback(() => {
    (async () => {
      const [f, p] = await Promise.all([repo.farms.list(), repo.paddocks.list()]);
      setFarms(f.sort((a, b) => a.name.localeCompare(b.name)));
      setPaddocks(p);
    })();
  }, []));

  const visibleFarms = useMemo(() => farms.filter((f) => showArchived ? !!f.archived_at : !f.archived_at), [farms, showArchived]);

  const s = q.trim().toLowerCase();
  const farmMatches = useMemo(() => {
    if (!s) return visibleFarms;
    return visibleFarms.filter((f) =>
      f.name.toLowerCase().includes(s) ||
      (f.property_name ?? "").toLowerCase().includes(s) ||
      (f.region ?? "").toLowerCase().includes(s) ||
      (f.address ?? "").toLowerCase().includes(s) ||
      paddocks.some((p) => p.farm_id === f.id && !p.archived_at && (
        p.name.toLowerCase().includes(s) ||
        (p.crop ?? "").toLowerCase().includes(s) ||
        (p.variety ?? "").toLowerCase().includes(s)
      )),
    );
  }, [visibleFarms, paddocks, s]);

  const paddockMatches = useMemo(() => {
    if (!s) return [] as (Paddock & { farmName: string })[];
    return paddocks
      .filter((p) => !p.archived_at)
      .filter((p) => p.name.toLowerCase().includes(s) || (p.crop ?? "").toLowerCase().includes(s) || (p.variety ?? "").toLowerCase().includes(s))
      .map((p) => ({ ...p, farmName: farms.find((f) => f.id === p.farm_id)?.name ?? "" }))
      .slice(0, 20);
  }, [paddocks, farms, s]);

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface, paddingTop: insets.top }}>
      <ScreenHeader title="Farms & Paddocks" back right={
        <Pressable onPress={() => router.push("/farms/new")} testID="add-farm-header-btn">
          <Icon name="plus" size={24} color={colors.brandPrimary} />
        </Pressable>
      } />

      <View style={styles.searchWrap}>
        <View style={styles.search}>
          <Icon name="magnify" size={20} color={colors.muted} />
          <TextInput
            value={q}
            onChangeText={setQ}
            placeholder="Search farms or paddocks"
            placeholderTextColor={colors.muted}
            style={styles.searchInput}
            testID="farms-search"
          />
          {q ? (
            <Pressable onPress={() => setQ("")} testID="clear-search-btn"><Icon name="close-circle" size={18} color={colors.muted} /></Pressable>
          ) : null}
        </View>
        <Pressable
          onPress={() => setShowArchived((v) => !v)}
          style={[styles.archiveToggle, showArchived && styles.archiveToggleActive]}
          testID="toggle-archived-btn"
        >
          <Icon name={showArchived ? "archive" : "archive-outline"} size={16} color={showArchived ? colors.onBrandPrimary : colors.onSurface} />
          <Text style={[styles.archiveText, showArchived && { color: colors.onBrandPrimary }]}>{showArchived ? "Archived" : "Active"}</Text>
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={{ paddingHorizontal: spacing.lg, paddingBottom: spacing.xxl + insets.bottom }}>
        {farmMatches.length === 0 && paddockMatches.length === 0 ? (
          <Card>
            <Text style={styles.empty}>{showArchived ? "No archived farms." : q ? "No matches." : "No farms yet."}</Text>
            {!showArchived && !q ? (
              <>
                <View style={{ height: spacing.md }} />
                <Button title="Add Your First Farm" icon="plus" onPress={() => router.push("/farms/new")} testID="empty-add-farm-btn" />
              </>
            ) : null}
          </Card>
        ) : null}

        {farmMatches.length > 0 && (
          <>
            {q ? <Text style={styles.sectionLabel}>Farms · {farmMatches.length}</Text> : null}
            {farmMatches.map((item) => {
              const count = paddocks.filter((p) => p.farm_id === item.id && !p.archived_at).length;
              return (
                <Card key={item.id} style={{ marginBottom: spacing.md }} onPress={() => router.push({ pathname: "/farms/[id]", params: { id: item.id } })} testID={`farm-card-${item.id}`}>
                  <View style={{ flexDirection: "row", alignItems: "center" }}>
                    <View style={styles.iconBox}><Icon name="tractor" size={26} color={colors.brandPrimary} /></View>
                    <View style={{ flex: 1 }}>
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                        <Text style={styles.name}>{item.name}</Text>
                        {item.archived_at ? <View style={styles.archBadge}><Text style={styles.archBadgeText}>Archived</Text></View> : null}
                      </View>
                      {item.property_name || item.region ? <Text style={styles.meta}>{item.property_name ?? item.region}</Text> : null}
                      <Text style={styles.metaSm}>{count} paddock{count === 1 ? "" : "s"}</Text>
                    </View>
                    <Icon name="chevron-right" size={22} color={colors.muted} />
                  </View>
                </Card>
              );
            })}
          </>
        )}

        {paddockMatches.length > 0 && (
          <>
            <Text style={styles.sectionLabel}>Paddocks · {paddockMatches.length}</Text>
            {paddockMatches.map((p) => (
              <Card key={p.id} style={{ marginBottom: spacing.sm }} onPress={() => router.push({ pathname: "/farms/paddock-edit", params: { id: p.id } })} testID={`paddock-match-${p.id}`}>
                <View style={{ flexDirection: "row", alignItems: "center" }}>
                  <View style={styles.pIconBox}><Icon name="grass" size={20} color={colors.brandPrimary} /></View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.pName}>{p.name}</Text>
                    <Text style={styles.pMeta}>
                      {p.farmName ? `${p.farmName} · ` : ""}
                      {p.area_ha != null ? `${p.area_ha} ha` : "—"}
                      {p.crop ? ` · ${p.crop}` : ""}
                      {p.variety ? ` (${p.variety})` : ""}
                    </Text>
                  </View>
                  <Icon name="chevron-right" size={20} color={colors.muted} />
                </View>
              </Card>
            ))}
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  searchWrap: { flexDirection: "row", gap: 8, paddingHorizontal: spacing.lg, paddingBottom: spacing.md },
  search: { flex: 1, flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: colors.surfaceSecondary, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: 12, height: 44 },
  searchInput: { flex: 1, fontSize: 15, color: colors.onSurface },
  archiveToggle: { flexDirection: "row", alignItems: "center", gap: 4, height: 44, paddingHorizontal: 12, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfaceSecondary },
  archiveToggleActive: { backgroundColor: colors.brandPrimary, borderColor: colors.brandPrimary },
  archiveText: { fontSize: 12, fontWeight: "700", color: colors.onSurface },
  sectionLabel: { fontSize: 12, fontWeight: "800", color: colors.muted, textTransform: "uppercase", letterSpacing: 0.5, marginTop: spacing.md, marginBottom: spacing.sm },
  iconBox: { width: 52, height: 52, borderRadius: radius.md, backgroundColor: colors.brandSecondary, alignItems: "center", justifyContent: "center", marginRight: 14 },
  name: { fontSize: 16, fontWeight: "700", color: colors.onSurface },
  meta: { fontSize: 13, color: colors.muted, marginTop: 2 },
  metaSm: { fontSize: 12, color: colors.muted, marginTop: 2 },
  empty: { color: colors.muted, textAlign: "center" },
  archBadge: { backgroundColor: colors.surfaceTertiary, paddingHorizontal: 6, paddingVertical: 2, borderRadius: radius.pill },
  archBadgeText: { fontSize: 10, fontWeight: "800", color: colors.onSurfaceTertiary, textTransform: "uppercase" },
  pIconBox: { width: 40, height: 40, borderRadius: radius.md, backgroundColor: colors.brandSecondary, alignItems: "center", justifyContent: "center", marginRight: 12 },
  pName: { fontSize: 15, fontWeight: "700", color: colors.onSurface },
  pMeta: { fontSize: 12, color: colors.muted, marginTop: 2 },
});
