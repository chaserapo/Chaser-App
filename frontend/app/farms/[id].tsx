import { useCallback, useState } from "react";
import { View, Text, ScrollView, StyleSheet, Pressable, KeyboardAvoidingView, Platform } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter, useFocusEffect } from "expo-router";
import Icon from "@react-native-vector-icons/material-design-icons";
import { ScreenHeader } from "@/src/components/header";
import { Button, Card, Input } from "@/src/components/ui";
import { colors, radius, spacing } from "@/src/theme";
import { repo } from "@/src/lib/storage";
import type { Farm, Paddock } from "@/src/lib/types";

export default function FarmDetail() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [farm, setFarm] = useState<Farm | null>(null);
  const [paddocks, setPaddocks] = useState<Paddock[]>([]);
  const [editing, setEditing] = useState(false);
  const [f, setF] = useState({ name: "", property_name: "", address: "", notes: "" });

  useFocusEffect(useCallback(() => {
    (async () => {
      if (!id) return;
      const [fs, ps] = await Promise.all([repo.farms.list(), repo.paddocks.list()]);
      const found = fs.find((x) => x.id === id) ?? null;
      setFarm(found);
      if (found) setF({
        name: found.name,
        property_name: found.property_name ?? found.region ?? "",
        address: found.address ?? "",
        notes: found.notes ?? "",
      });
      setPaddocks(ps.filter((p) => p.farm_id === id).sort((a, b) => a.name.localeCompare(b.name)));
    })();
  }, [id]));

  async function saveEdit() {
    if (!farm) return;
    const next: Farm = {
      ...farm,
      name: f.name.trim(),
      property_name: f.property_name.trim() || undefined,
      region: undefined,
      address: f.address.trim() || undefined,
      notes: f.notes.trim() || undefined,
    };
    await repo.farms.save(next);
    setFarm(next);
    setEditing(false);
  }

  async function archiveFarm() {
    if (!farm) return;
    await repo.farms.save({ ...farm, archived_at: new Date().toISOString() });
    router.back();
  }
  async function unarchiveFarm() {
    if (!farm) return;
    const next = { ...farm, archived_at: undefined };
    await repo.farms.save(next);
    setFarm(next);
  }

  if (!farm) return <View style={{ flex: 1, backgroundColor: colors.surface, paddingTop: insets.top }}><ScreenHeader title="Farm" back /></View>;

  const activePaddocks = paddocks.filter((p) => !p.archived_at);
  const archivedPaddocks = paddocks.filter((p) => p.archived_at);

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface, paddingTop: insets.top }}>
      <ScreenHeader title={farm.name} back right={
        !editing ? (
          <Pressable onPress={() => setEditing(true)} testID="edit-farm-btn"><Icon name="pencil" size={22} color={colors.brandPrimary} /></Pressable>
        ) : null
      } />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxl + insets.bottom }} keyboardShouldPersistTaps="handled">
          {editing ? (
            <>
              <Card>
                <Input label="Farm name*" value={f.name} onChangeText={(v) => setF({ ...f, name: v })} testID="edit-farm-name" />
                <Input label="Property / location name" value={f.property_name} onChangeText={(v) => setF({ ...f, property_name: v })} testID="edit-farm-property" />
                <Input label="Address (optional)" value={f.address} onChangeText={(v) => setF({ ...f, address: v })} multiline testID="edit-farm-address" />
                <Input label="Notes" value={f.notes} onChangeText={(v) => setF({ ...f, notes: v })} multiline testID="edit-farm-notes" />
              </Card>
              <View style={{ height: spacing.md }} />
              <Button title="Save Changes" icon="content-save-outline" onPress={saveEdit} disabled={!f.name.trim()} testID="save-farm-edit-btn" />
              <View style={{ height: spacing.sm }} />
              <Button title="Cancel" variant="outline" onPress={() => { setEditing(false); setF({ name: farm.name, property_name: farm.property_name ?? farm.region ?? "", address: farm.address ?? "", notes: farm.notes ?? "" }); }} testID="cancel-farm-edit-btn" />
              <View style={{ height: spacing.md }} />
              {farm.archived_at ? (
                <Button title="Unarchive Farm" icon="archive-arrow-up-outline" variant="secondary" onPress={unarchiveFarm} testID="unarchive-farm-btn" />
              ) : (
                <Button title="Archive Farm" icon="archive-outline" variant="danger" onPress={archiveFarm} testID="archive-farm-btn" />
              )}
              <Text style={styles.hint}>Archiving keeps history intact and hides the farm from spray-job selection. You can restore it any time.</Text>
            </>
          ) : (
            <Card>
              <View style={{ flexDirection: "row", alignItems: "center" }}>
                <View style={styles.iconBox}><Icon name="tractor" size={30} color={colors.brandPrimary} /></View>
                <View style={{ flex: 1 }}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                    <Text style={styles.farmName}>{farm.name}</Text>
                    {farm.archived_at ? <View style={styles.archBadge}><Text style={styles.archBadgeText}>Archived</Text></View> : null}
                  </View>
                  {farm.property_name || farm.region ? <Text style={styles.farmMeta}>{farm.property_name ?? farm.region}</Text> : null}
                  <Text style={styles.farmMeta}>{activePaddocks.length} paddock{activePaddocks.length === 1 ? "" : "s"}</Text>
                </View>
              </View>
              {farm.address ? (<><View style={styles.divider} /><Field label="Address" value={farm.address} /></>) : null}
              {farm.notes ? (<><View style={styles.divider} /><Field label="Notes" value={farm.notes} /></>) : null}
            </Card>
          )}

          {!editing && (
            <>
              <View style={styles.sectionRow}>
                <Text style={styles.section}>Paddocks</Text>
                {!farm.archived_at ? (
                  <Pressable onPress={() => router.push({ pathname: "/farms/paddock-new", params: { farmId: farm.id } })} testID="add-paddock-btn">
                    <Text style={styles.link}>+ Add</Text>
                  </Pressable>
                ) : null}
              </View>

              {activePaddocks.length === 0 && archivedPaddocks.length === 0 ? (
                <Card><Text style={styles.empty}>No paddocks yet.</Text></Card>
              ) : (
                activePaddocks.map((p) => (
                  <Card key={p.id} style={{ marginBottom: spacing.sm }} onPress={() => router.push({ pathname: "/farms/paddock-edit", params: { id: p.id } })} testID={`paddock-card-${p.id}`}>
                    <View style={{ flexDirection: "row", alignItems: "center" }}>
                      <View style={styles.pIconBox}><Icon name="grass" size={20} color={colors.brandPrimary} /></View>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.pName}>{p.name}</Text>
                        <Text style={styles.pMeta}>
                          {p.area_ha != null ? `${p.area_ha} ha` : "—"}
                          {p.crop ? ` · ${p.crop}` : ""}
                          {p.variety ? ` (${p.variety})` : ""}
                        </Text>
                      </View>
                      <Icon name="chevron-right" size={20} color={colors.muted} />
                    </View>
                  </Card>
                ))
              )}

              {archivedPaddocks.length > 0 && (
                <>
                  <Text style={styles.subsection}>Archived · {archivedPaddocks.length}</Text>
                  {archivedPaddocks.map((p) => (
                    <Card key={p.id} style={{ marginBottom: spacing.sm, opacity: 0.65 }} onPress={() => router.push({ pathname: "/farms/paddock-edit", params: { id: p.id } })} testID={`archived-paddock-${p.id}`}>
                      <View style={{ flexDirection: "row", alignItems: "center" }}>
                        <View style={styles.pIconBox}><Icon name="grass" size={20} color={colors.muted} /></View>
                        <View style={{ flex: 1 }}>
                          <Text style={[styles.pName, { color: colors.muted }]}>{p.name}</Text>
                          <Text style={styles.pMeta}>Archived · {p.crop ?? "—"}</Text>
                        </View>
                        <Icon name="chevron-right" size={20} color={colors.muted} />
                      </View>
                    </Card>
                  ))}
                </>
              )}
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ paddingVertical: spacing.sm }}>
      <Text style={{ fontSize: 12, color: colors.muted, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.4 }}>{label}</Text>
      <Text style={{ fontSize: 15, color: colors.onSurface, marginTop: 4, lineHeight: 20 }}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  iconBox: { width: 56, height: 56, borderRadius: radius.md, backgroundColor: colors.brandSecondary, alignItems: "center", justifyContent: "center", marginRight: 14 },
  farmName: { fontSize: 20, fontWeight: "800", color: colors.onSurface, flexShrink: 1 },
  farmMeta: { fontSize: 14, color: colors.muted, marginTop: 2 },
  divider: { height: 1, backgroundColor: colors.border, marginVertical: spacing.sm },
  sectionRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: spacing.xl, marginBottom: spacing.sm },
  section: { fontSize: 18, fontWeight: "800", color: colors.onSurface },
  subsection: { fontSize: 12, fontWeight: "800", color: colors.muted, textTransform: "uppercase", letterSpacing: 0.5, marginTop: spacing.lg, marginBottom: spacing.sm },
  link: { color: colors.brandPrimary, fontWeight: "700", fontSize: 14 },
  pIconBox: { width: 40, height: 40, borderRadius: radius.md, backgroundColor: colors.brandSecondary, alignItems: "center", justifyContent: "center", marginRight: 12 },
  pName: { fontSize: 15, fontWeight: "700", color: colors.onSurface },
  pMeta: { fontSize: 12, color: colors.muted, marginTop: 2 },
  empty: { color: colors.muted, textAlign: "center" },
  hint: { color: colors.muted, fontSize: 12, textAlign: "center", marginTop: spacing.md, fontStyle: "italic" },
  archBadge: { backgroundColor: colors.surfaceTertiary, paddingHorizontal: 6, paddingVertical: 2, borderRadius: radius.pill },
  archBadgeText: { fontSize: 10, fontWeight: "800", color: colors.onSurfaceTertiary, textTransform: "uppercase" },
});
