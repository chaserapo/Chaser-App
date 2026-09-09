import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { View, Text, StyleSheet, Pressable, ActivityIndicator, ScrollView } from "react-native";
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
import type { Paddock, PaddockBoundary, Farm } from "@/src/lib/types";

type Mode = "view" | "draw";
type ViewKind = "map" | "list";

export default function PaddocksTab() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { business } = useAuth();
  const canEdit = business?.role === "owner" || business?.role === "manager";
  const [paddocks, setPaddocks] = useState<Paddock[]>([]);
  const [farms, setFarms] = useState<Farm[]>([]);
  const [mode, setMode] = useState<Mode>("view");
  const [viewKind, setViewKind] = useState<ViewKind>("map");
  const [collapsedFarmIds, setCollapsedFarmIds] = useState<Record<string, boolean>>({});
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [drawInfo, setDrawInfo] = useState<{ count: number; areaHa: number }>({ count: 0, areaHa: 0 });
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState("");
  const [crop, setCrop] = useState("");
  const [gpsOn, setGpsOn] = useState(false);
  const mapRef = useRef<PaddockMapHandle>(null);
  const gpsWatch = useRef<Location.LocationSubscription | null>(null);
  const driveWatch = useRef<Location.LocationSubscription | null>(null);
  const lastDrivePoint = useRef<{ lat: number; lon: number; ts: number } | null>(null);
  const [driving, setDriving] = useState(false);

  const load = useCallback(async () => {
    const [pList, fList] = await Promise.all([repo.paddocks.active(), repo.farms.active()]);
    setPaddocks(pList);
    setFarms(fList);
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));
  useRealtime(["paddocks", "farms"], load, [load]);

  // Group paddocks by farm — memoised so the list view is snappy on big properties.
  const grouped = useMemo(() => {
    const byFarm = new Map<string, Paddock[]>();
    for (const p of paddocks) {
      const key = p.farm_id ?? "__unassigned__";
      const arr = byFarm.get(key) ?? [];
      arr.push(p);
      byFarm.set(key, arr);
    }
    // Sort paddocks alphabetically inside each farm bucket.
    for (const arr of byFarm.values()) arr.sort((a, b) => a.name.localeCompare(b.name));
    // Farms in the order the user created them, then Unassigned at the bottom.
    const sortedFarms = [...farms].sort((a, b) => a.name.localeCompare(b.name));
    const groups: { farm: Farm | null; paddocks: Paddock[]; totalHa: number }[] = [];
    for (const f of sortedFarms) {
      const list = byFarm.get(f.id) ?? [];
      groups.push({ farm: f, paddocks: list, totalHa: list.reduce((s, p) => s + (p.area_ha ?? 0), 0) });
    }
    const un = byFarm.get("__unassigned__") ?? [];
    if (un.length > 0) groups.push({ farm: null, paddocks: un, totalHa: un.reduce((s, p) => s + (p.area_ha ?? 0), 0) });
    return groups;
  }, [paddocks, farms]);

  function toggleFarmCollapsed(id: string) {
    setCollapsedFarmIds((prev) => ({ ...prev, [id]: !prev[id] }));
  }

  // Cleanup GPS on unmount
  useEffect(() => () => { gpsWatch.current?.remove(); driveWatch.current?.remove(); }, []);

  function haversine(a: { lat: number; lon: number }, b: { lat: number; lon: number }) {
    const R = 6371000; const toRad = (d: number) => (d * Math.PI) / 180;
    const dLat = toRad(b.lat - a.lat); const dLon = toRad(b.lon - a.lon);
    const s = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLon / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(s));
  }

  async function toggleDrive() {
    if (driving) {
      driveWatch.current?.remove(); driveWatch.current = null;
      lastDrivePoint.current = null;
      setDriving(false);
      return;
    }
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== "granted") { alert("Location permission is required to drive a boundary."); return; }
    setDriving(true);
    // Enter draw mode so drawn points render on the map
    if (mode !== "draw") { setMode("draw"); mapRef.current?.setMode("draw"); }
    // Seed with the first fix
    const first = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Highest });
    mapRef.current?.addPoint(first.coords.latitude, first.coords.longitude);
    mapRef.current?.setPosition(first.coords.latitude, first.coords.longitude, true);
    lastDrivePoint.current = { lat: first.coords.latitude, lon: first.coords.longitude, ts: Date.now() };
    driveWatch.current = await Location.watchPositionAsync(
      { accuracy: Location.Accuracy.Highest, timeInterval: 2000, distanceInterval: 3 },
      (loc) => {
        const p = { lat: loc.coords.latitude, lon: loc.coords.longitude, ts: Date.now() };
        mapRef.current?.setPosition(p.lat, p.lon, false);
        const last = lastDrivePoint.current;
        // Add a point every ~5m or 4s, whichever first
        if (!last || haversine(last, p) >= 5 || p.ts - last.ts >= 4000) {
          mapRef.current?.addPoint(p.lat, p.lon);
          lastDrivePoint.current = p;
        }
      },
    );
  }

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
    driveWatch.current?.remove(); driveWatch.current = null;
    lastDrivePoint.current = null;
    setDriving(false);
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
          <Text style={styles.sub}>{paddocks.length} paddock{paddocks.length === 1 ? "" : "s"}{farms.length > 0 ? ` · ${farms.length} farm${farms.length === 1 ? "" : "s"}` : ""}</Text>
        </View>
        {mode === "view" && canEdit ? (
          <Pressable style={styles.addBtn} onPress={startDraw} testID="draw-paddock-btn">
            <Icon name="draw" size={18} color={colors.onBrandPrimary} />
            <Text style={styles.addBtnText}>Add</Text>
          </Pressable>
        ) : null}
      </View>

      {/* Map / List segmented toggle (hidden while drawing) */}
      {mode === "view" ? (
        <View style={styles.toggleWrap} testID="paddock-view-toggle">
          <Pressable
            onPress={() => setViewKind("map")}
            style={[styles.toggleBtn, viewKind === "map" && styles.toggleBtnOn]}
            testID="paddock-view-map"
          >
            <Icon name="map-outline" size={16} color={viewKind === "map" ? colors.onBrandPrimary : colors.onSurface} />
            <Text style={[styles.toggleText, viewKind === "map" && styles.toggleTextOn]}>Map</Text>
          </Pressable>
          <Pressable
            onPress={() => setViewKind("list")}
            style={[styles.toggleBtn, viewKind === "list" && styles.toggleBtnOn]}
            testID="paddock-view-list"
          >
            <Icon name="format-list-bulleted" size={16} color={viewKind === "list" ? colors.onBrandPrimary : colors.onSurface} />
            <Text style={[styles.toggleText, viewKind === "list" && styles.toggleTextOn]}>List</Text>
          </Pressable>
        </View>
      ) : null}

      {viewKind === "list" && mode === "view" ? (
        <ScrollView
          contentContainerStyle={{ padding: spacing.lg, paddingBottom: insets.bottom + spacing.xxl }}
          testID="paddock-list-scroll"
        >
          {grouped.length === 0 ? (
            <Card>
              <Text style={styles.emptyTitle}>No paddocks yet</Text>
              <Text style={styles.emptyBody}>Switch to the Map view and tap Add to draw your first paddock, or head over to the Farms tab to create a farm first.</Text>
            </Card>
          ) : null}

          {grouped.map((g) => {
            const farmId = g.farm?.id ?? "__unassigned__";
            const collapsed = !!collapsedFarmIds[farmId];
            return (
              <View key={farmId} style={styles.farmGroup} testID={`farm-group-${farmId}`}>
                <Pressable
                  onPress={() => toggleFarmCollapsed(farmId)}
                  style={styles.farmHeader}
                  testID={`farm-header-${farmId}`}
                >
                  <Icon
                    name={collapsed ? "chevron-right" : "chevron-down"}
                    size={22}
                    color={colors.muted}
                  />
                  <Icon
                    name={g.farm ? "barn" : "help-circle-outline"}
                    size={20}
                    color={colors.brandPrimary}
                    style={{ marginRight: 8 }}
                  />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.farmName} numberOfLines={1}>
                      {g.farm ? g.farm.name : "Unassigned paddocks"}
                    </Text>
                    <Text style={styles.farmMeta} numberOfLines={1}>
                      {g.paddocks.length} paddock{g.paddocks.length === 1 ? "" : "s"}
                      {g.totalHa > 0 ? ` · ${g.totalHa.toFixed(1)} ha` : ""}
                      {g.farm?.region ? ` · ${g.farm.region}` : ""}
                    </Text>
                  </View>
                </Pressable>

                {!collapsed
                  ? g.paddocks.map((p) => (
                      <Pressable
                        key={p.id}
                        onPress={() => router.push({ pathname: "/paddocks/[id]", params: { id: p.id } })}
                        style={({ pressed }) => [styles.paddockRow, pressed && { backgroundColor: colors.surface }]}
                        testID={`paddock-row-${p.id}`}
                      >
                        <View style={styles.paddockDot}>
                          <Icon name="map-marker-outline" size={18} color={colors.brandPrimary} />
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.paddockName} numberOfLines={1}>{p.name}</Text>
                          <Text style={styles.paddockMeta} numberOfLines={1}>
                            {p.area_ha != null ? `${p.area_ha} ha` : "No area"}
                            {p.crop ? ` · ${p.crop}` : ""}
                            {p.variety ? ` (${p.variety})` : ""}
                            {!p.boundary ? " · no boundary" : ""}
                          </Text>
                        </View>
                        <Icon name="chevron-right" size={22} color={colors.muted} />
                      </Pressable>
                    ))
                  : null}

                {!collapsed && g.paddocks.length === 0 ? (
                  <Text style={styles.emptyGroupText}>No paddocks in this farm yet.</Text>
                ) : null}
              </View>
            );
          })}
        </ScrollView>
      ) : (
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
                  ? "Tap the map to add corner points, or hit Drive to record while driving the boundary."
                  : `${drawInfo.count} point${drawInfo.count === 1 ? "" : "s"} · ${drawInfo.areaHa.toFixed(2)} ha${driving ? "  •  RECORDING" : ""}`}
              </Text>
              <Text style={styles.drawHint}>Drag a point to move it · long-press to remove it</Text>
              <View style={{ height: 8 }} />
              <Pressable onPress={toggleDrive} style={[styles.driveBtn, driving && styles.driveBtnOn]} testID="drive-toggle-btn">
                <Icon name={driving ? "stop-circle-outline" : "car-connected"} size={18} color={driving ? colors.onBrandPrimary : colors.brandPrimary} />
                <Text style={[styles.driveBtnText, driving && { color: colors.onBrandPrimary }]}>
                  {driving ? "Stop recording" : "Drive boundary (GPS)"}
                </Text>
              </Pressable>
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
      )}
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
  driveBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, height: 40, borderRadius: radius.md, borderWidth: 1.5, borderColor: colors.brandPrimary, backgroundColor: colors.surface },
  driveBtnOn: { backgroundColor: colors.error, borderColor: colors.error },
  driveBtnText: { fontWeight: "700", color: colors.brandPrimary, fontSize: 13 },
  toggleWrap: { flexDirection: "row", alignSelf: "center", backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 999, padding: 3, marginBottom: spacing.sm, gap: 2 },
  toggleBtn: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 14, height: 34, borderRadius: 999, justifyContent: "center", minWidth: 84 },
  toggleBtnOn: { backgroundColor: colors.brandPrimary },
  toggleText: { fontSize: 13, fontWeight: "700", color: colors.onSurface },
  toggleTextOn: { color: colors.onBrandPrimary },
  farmGroup: { marginBottom: spacing.md, backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, overflow: "hidden" },
  farmHeader: { flexDirection: "row", alignItems: "center", paddingHorizontal: spacing.md, paddingVertical: spacing.md, backgroundColor: colors.brandSecondary },
  farmName: { fontSize: 15, fontWeight: "800", color: colors.onSurface },
  farmMeta: { fontSize: 12, color: colors.muted, marginTop: 2 },
  paddockRow: { flexDirection: "row", alignItems: "center", paddingHorizontal: spacing.md, paddingVertical: spacing.md, borderTopWidth: 1, borderTopColor: colors.border, gap: 12 },
  paddockDot: { width: 32, height: 32, borderRadius: 16, backgroundColor: colors.brandSecondary, alignItems: "center", justifyContent: "center" },
  paddockName: { fontSize: 14, fontWeight: "700", color: colors.onSurface },
  paddockMeta: { fontSize: 12, color: colors.muted, marginTop: 2 },
  emptyGroupText: { padding: spacing.md, color: colors.muted, fontStyle: "italic", fontSize: 12, textAlign: "center" },
});
