import { useCallback, useEffect, useRef, useState } from "react";
import { View, Text, StyleSheet, Pressable, ActivityIndicator } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter, useFocusEffect } from "expo-router";
import { v4 as uuid } from "uuid";
import * as Location from "expo-location";
import Icon from "@react-native-vector-icons/material-design-icons";
import { Button, Card, Input } from "@/src/components/ui";
import { colors, radius, spacing } from "@/src/theme";
import { repo } from "@/src/lib/storage";
import { useRealtime } from "@/src/lib/realtime";
import { useAuth } from "@/src/lib/auth-context";
import { PaddockMap, PaddockMapHandle } from "@/src/features/paddocks/PaddockMap";
import type { Paddock, PaddockBoundary } from "@/src/lib/types";

type Mode = "view" | "draw";

export default function PaddocksTab() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { business } = useAuth();
  const canEdit = business?.role === "owner" || business?.role === "manager";
  const [paddocks, setPaddocks] = useState<Paddock[]>([]);
  const [mode, setMode] = useState<Mode>("view");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [drawInfo, setDrawInfo] = useState<{ count: number; areaHa: number }>({ count: 0, areaHa: 0 });
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState("");
  const [crop, setCrop] = useState("");
  const [gpsOn, setGpsOn] = useState(false);
  const mapRef = useRef<PaddockMapHandle>(null);
  const gpsWatch = useRef<Location.LocationSubscription | null>(null);

  const load = useCallback(async () => {
    const list = await repo.paddocks.active();
    setPaddocks(list);
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));
  useRealtime(["paddocks"], load, [load]);

  // Cleanup GPS on unmount
  useEffect(() => () => { gpsWatch.current?.remove(); }, []);

  async function toggleGps() {
    if (gpsOn) {
      gpsWatch.current?.remove(); gpsWatch.current = null; setGpsOn(false);
      return;
    }
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== "granted") {
      alert("Location permission denied — the map still works without GPS.");
      return;
    }
    setGpsOn(true);
    const first = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
    mapRef.current?.setPosition(first.coords.latitude, first.coords.longitude, true);
    gpsWatch.current = await Location.watchPositionAsync(
      { accuracy: Location.Accuracy.Balanced, timeInterval: 3000, distanceInterval: 5 },
      (loc) => mapRef.current?.setPosition(loc.coords.latitude, loc.coords.longitude, false),
    );
  }

  function startDraw() {
    if (!canEdit) return;
    setSelectedId(null); setName(""); setCrop("");
    setMode("draw"); mapRef.current?.setMode("draw");
    mapRef.current?.clear();
  }
  function cancelDraw() {
    mapRef.current?.clear();
    mapRef.current?.setMode("view");
    setMode("view"); setDrawInfo({ count: 0, areaHa: 0 });
  }
  function requestSaveGeometry() { mapRef.current?.save(); }

  async function persistPaddock(geojson: PaddockBoundary, areaHa: number) {
    if (!business) return;
    if (!name.trim()) { alert("Please give the paddock a name before saving."); return; }
    setSaving(true);
    try {
      const p: Paddock = {
        id: uuid(),
        business_id: business.id,
        farm_id: null,
        name: name.trim(),
        area_ha: Math.round(areaHa * 100) / 100,
        crop: crop.trim() || undefined,
        boundary: geojson,
        created_at: new Date().toISOString(),
      };
      await repo.paddocks.save(p);
      await load();
      cancelDraw();
    } catch (e: any) {
      alert("Save failed: " + (e?.message ?? e));
    } finally { setSaving(false); }
  }

  const selectedPaddock = selectedId ? paddocks.find((p) => p.id === selectedId) : null;

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface, paddingTop: insets.top }}>
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Paddocks</Text>
          <Text style={styles.sub}>{paddocks.length} paddock{paddocks.length === 1 ? "" : "s"} on your map</Text>
        </View>
        {mode === "view" && canEdit ? (
          <Pressable style={styles.addBtn} onPress={startDraw} testID="draw-paddock-btn">
            <Icon name="draw" size={18} color={colors.onBrandPrimary} />
            <Text style={styles.addBtnText}>Add</Text>
          </Pressable>
        ) : null}
      </View>

      <View style={{ flex: 1 }}>
        <PaddockMap
          ref={mapRef}
          paddocks={paddocks.map((p) => ({
            id: p.id, name: p.name, area_ha: p.area_ha, crop: p.crop, boundary_geojson: p.boundary ?? null,
          }))}
          onSelect={(id) => { if (mode === "view") { setSelectedId(id); mapRef.current?.focusPaddock(id); } }}
          onPointsUpdate={(count, areaHa) => setDrawInfo({ count, areaHa })}
          onSaveGeometry={persistPaddock}
        />

        {/* GPS toggle */}
        <Pressable onPress={toggleGps} style={[styles.gpsBtn, gpsOn && styles.gpsBtnOn]} testID="gps-toggle-btn">
          <Icon name={gpsOn ? "crosshairs-gps" : "crosshairs"} size={20} color={gpsOn ? colors.onBrandPrimary : colors.brandPrimary} />
        </Pressable>

        {/* Draw controls overlay */}
        {mode === "draw" ? (
          <View style={[styles.drawOverlay, { paddingBottom: insets.bottom + 12 }]} testID="draw-overlay">
            <Card style={{ marginBottom: 8 }}>
              <Input label="Paddock name*" value={name} onChangeText={setName} placeholder="e.g. North 40" testID="draw-name" />
              <Input label="Crop (optional)" value={crop} onChangeText={setCrop} placeholder="e.g. Wheat" testID="draw-crop" />
              <Text style={styles.drawMeta}>
                {drawInfo.count === 0
                  ? "Tap the map to add corner points. You need at least 3 points."
                  : `${drawInfo.count} point${drawInfo.count === 1 ? "" : "s"} · ${drawInfo.areaHa.toFixed(2)} ha`}
              </Text>
              <Text style={styles.drawHint}>Drag a point to move it · long-press to remove it</Text>
            </Card>
            <View style={styles.drawRow}>
              <Pressable style={styles.iconBtn} onPress={() => mapRef.current?.undo()} disabled={drawInfo.count === 0} testID="draw-undo-btn">
                <Icon name="undo-variant" size={20} color={drawInfo.count === 0 ? colors.muted : colors.onSurface} />
                <Text style={styles.iconBtnText}>Undo</Text>
              </Pressable>
              <Pressable style={styles.iconBtn} onPress={() => mapRef.current?.clear()} disabled={drawInfo.count === 0} testID="draw-clear-btn">
                <Icon name="close-thick" size={20} color={drawInfo.count === 0 ? colors.muted : colors.onSurface} />
                <Text style={styles.iconBtnText}>Clear</Text>
              </Pressable>
              <View style={{ flex: 1 }}>
                <Button title={saving ? "Saving…" : "Save Paddock"} icon="content-save-outline" onPress={requestSaveGeometry} loading={saving} disabled={drawInfo.count < 3 || saving || !name.trim()} testID="draw-save-btn" />
              </View>
            </View>
            <Pressable onPress={cancelDraw} style={{ alignItems: "center", marginTop: 6 }} testID="draw-cancel-btn">
              <Text style={{ color: colors.muted, fontWeight: "700" }}>Cancel</Text>
            </Pressable>
          </View>
        ) : null}

        {/* Selected paddock summary */}
        {mode === "view" && selectedPaddock ? (
          <View style={[styles.summary, { paddingBottom: insets.bottom + 12 }]} testID="paddock-summary">
            <Card>
              <View style={{ flexDirection: "row", alignItems: "center" }}>
                <View style={styles.summaryIcon}><Icon name="map-marker-outline" size={22} color={colors.brandPrimary} /></View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.summaryName} numberOfLines={1}>{selectedPaddock.name}</Text>
                  <Text style={styles.summaryMeta} numberOfLines={1}>
                    {selectedPaddock.area_ha != null ? `${selectedPaddock.area_ha} ha` : "—"}
                    {selectedPaddock.crop ? ` · ${selectedPaddock.crop}` : ""}
                    {selectedPaddock.variety ? ` (${selectedPaddock.variety})` : ""}
                  </Text>
                </View>
                <Pressable onPress={() => setSelectedId(null)} hitSlop={8} testID="close-summary-btn">
                  <Icon name="close" size={20} color={colors.muted} />
                </Pressable>
              </View>
              <View style={{ height: spacing.sm }} />
              <View style={{ flexDirection: "row", gap: 8 }}>
                <View style={{ flex: 1 }}>
                  <Button title="View" icon="chevron-right" onPress={() => router.push({ pathname: "/paddocks/[id]", params: { id: selectedPaddock.id } })} testID="summary-view-btn" />
                </View>
                <View style={{ flex: 1 }}>
                  <Button title="New Job" variant="outline" icon="plus" onPress={() => router.push({ pathname: "/records/new", params: { paddockId: selectedPaddock.id } })} testID="summary-new-job-btn" />
                </View>
              </View>
            </Card>
          </View>
        ) : null}

        {paddocks.length === 0 && mode === "view" && canEdit ? (
          <View style={[styles.emptyOverlay, { paddingBottom: insets.bottom + 12 }]} pointerEvents="box-none">
            <Card>
              <Text style={styles.emptyTitle}>No paddocks yet</Text>
              <Text style={styles.emptyBody}>Tap Add to draw your first paddock boundary — Chaser will calculate its hectares automatically.</Text>
              <View style={{ height: spacing.md }} />
              <Button title="Draw a paddock" icon="draw" onPress={startDraw} testID="empty-draw-btn" />
            </Card>
          </View>
        ) : null}

        {saving ? (
          <View style={styles.savingOverlay}>
            <ActivityIndicator color={colors.brandPrimary} />
          </View>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: spacing.lg, paddingTop: spacing.sm, paddingBottom: spacing.md, gap: spacing.md },
  title: { fontSize: 26, fontWeight: "800", color: colors.onSurface },
  sub: { color: colors.muted, fontSize: 13, marginTop: 2 },
  addBtn: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: colors.brandPrimary, paddingHorizontal: 14, height: 40, borderRadius: 999 },
  addBtnText: { color: colors.onBrandPrimary, fontWeight: "700" },
  gpsBtn: { position: "absolute", right: 12, top: 12, width: 44, height: 44, borderRadius: 22, backgroundColor: colors.surface, alignItems: "center", justifyContent: "center", shadowColor: "#000", shadowOpacity: 0.18, shadowRadius: 6, elevation: 4, borderWidth: 1, borderColor: colors.border },
  gpsBtnOn: { backgroundColor: colors.brandPrimary, borderColor: colors.brandPrimary },
  drawOverlay: { position: "absolute", left: 12, right: 12, bottom: 0 },
  drawMeta: { fontSize: 13, color: colors.onSurface, fontWeight: "600", marginTop: spacing.sm },
  drawHint: { fontSize: 12, color: colors.muted, marginTop: 2, fontStyle: "italic" },
  drawRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  iconBtn: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, height: 44, borderRadius: radius.md, paddingHorizontal: 10 },
  iconBtnText: { fontSize: 13, fontWeight: "700", color: colors.onSurface },
  summary: { position: "absolute", left: 12, right: 12, bottom: 0 },
  summaryIcon: { width: 40, height: 40, borderRadius: radius.md, backgroundColor: colors.brandSecondary, alignItems: "center", justifyContent: "center", marginRight: 12 },
  summaryName: { fontSize: 16, fontWeight: "800", color: colors.onSurface },
  summaryMeta: { fontSize: 13, color: colors.muted, marginTop: 2 },
  emptyOverlay: { position: "absolute", left: 12, right: 12, bottom: 0 },
  emptyTitle: { fontSize: 16, fontWeight: "800", color: colors.onSurface },
  emptyBody: { color: colors.muted, marginTop: 4, fontSize: 13, lineHeight: 18 },
  savingOverlay: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(255,255,255,0.4)" },
});
