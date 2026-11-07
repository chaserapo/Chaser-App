import { useCallback, useEffect, useRef, useState } from "react";
import { View, Text, StyleSheet, Pressable, Platform, ScrollView, KeyboardAvoidingView } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter, useFocusEffect } from "expo-router";
import { v4 as uuid } from "uuid";
import * as Location from "expo-location";
import Icon from "@react-native-vector-icons/material-design-icons";
import { ScreenHeader } from "@/src/components/header";
import { Button, Card, Input } from "@/src/components/ui";
import { colors, radius, spacing } from "@/src/theme";
import { repo } from "@/src/lib/storage";
import { PaddockMap, PaddockMapHandle } from "@/src/features/paddocks/PaddockMap";
import { geocodeAddress } from "@/src/lib/geocoding";
import type { Paddock, PaddockBoundary, Farm } from "@/src/lib/types";

export default function NewPaddock() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { farmId } = useLocalSearchParams<{ farmId: string }>();
  const mapRef = useRef<PaddockMapHandle>(null);
  const driveWatch = useRef<Location.LocationSubscription | null>(null);
  const lastDrivePoint = useRef<{ lat: number; lon: number; ts: number } | null>(null);
  const [farm, setFarm] = useState<Farm | null>(null);
  const [otherPaddocks, setOtherPaddocks] = useState<Paddock[]>([]);
  const [f, setF] = useState({ name: "", area: "", crop: "", variety: "", notes: "" });
  const [drawInfo, setDrawInfo] = useState<{ count: number; areaHa: number }>({ count: 0, areaHa: 0 });
  const [driving, setDriving] = useState(false);
  const [saving, setSaving] = useState(false);
  const [locateMode, setLocateMode] = useState<"draw" | "pin">("draw");
  const [pin, setPin] = useState<{ lat: number; lon: number } | null>(null);

  useFocusEffect(useCallback(() => {
    if (!farmId) return;
    (async () => {
      const [farms, paddocks] = await Promise.all([repo.farms.list(), repo.paddocks.active()]);
      setFarm(farms.find((x) => x.id === farmId) ?? null);
      setOtherPaddocks(paddocks.filter((p) => p.farm_id === farmId));
    })();
  }, [farmId]));

  useEffect(() => () => { driveWatch.current?.remove(); }, []);

  function haversine(a: { lat: number; lon: number }, b: { lat: number; lon: number }) {
    const R = 6371000; const toRad = (d: number) => (d * Math.PI) / 180;
    const dLat = toRad(b.lat - a.lat); const dLon = toRad(b.lon - a.lon);
    const s = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLon / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(s));
  }

  function onMapReady() {
    mapRef.current?.setMode(locateMode);
    // Jump the map to the farm's address (if it has one) so the user isn't
    // stuck staring at a world map before they can start tracing a boundary.
    if (farm?.address) {
      geocodeAddress(farm.address).then((loc) => {
        if (loc) mapRef.current?.flyTo(loc.lat, loc.lon, 14);
      });
    }
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
        if (!last || haversine(last, p) >= 5 || p.ts - last.ts >= 4000) {
          mapRef.current?.addPoint(p.lat, p.lon);
          lastDrivePoint.current = p;
        }
      },
    );
  }

  function switchLocateMode(next: "draw" | "pin") {
    if (next === locateMode) return;
    setLocateMode(next);
    if (next === "pin") {
      mapRef.current?.clear();
      mapRef.current?.setMode("pin");
    } else {
      mapRef.current?.clearReportPin();
      setPin(null);
      mapRef.current?.setMode("draw");
    }
  }

  async function persistPaddock(opts?: { geojson?: PaddockBoundary; areaHa?: number; pin?: { lat: number; lon: number } }) {
    const business = await repo.getBusiness();
    if (!business || !farmId || !f.name.trim()) return;
    setSaving(true);
    try {
      const p: Paddock = {
        id: uuid(),
        business_id: business.id,
        farm_id: farmId,
        name: f.name.trim(),
        area_ha: opts?.geojson ? Math.round((opts.areaHa ?? 0) * 100) / 100 : (f.area ? parseFloat(f.area) : undefined),
        crop: f.crop.trim() || undefined,
        variety: f.variety.trim() || undefined,
        notes: f.notes.trim() || undefined,
        boundary: opts?.geojson,
        pin_lat: opts?.pin?.lat,
        pin_lon: opts?.pin?.lon,
        created_at: new Date().toISOString(),
      };
      await repo.paddocks.save(p);
      router.back();
    } catch (e: any) {
      alert("Save failed: " + (e?.message ?? e));
    } finally {
      setSaving(false);
    }
  }

  function handleSave() {
    if (!f.name.trim()) { alert("Please give the paddock a name."); return; }
    if (locateMode === "pin" && pin) {
      persistPaddock({ pin });
    } else if (locateMode === "draw" && drawInfo.count >= 3) {
      // Async round-trip: the map computes the polygon + area and posts it
      // back via onSaveGeometry, which calls persistPaddock({geojson, areaHa}).
      mapRef.current?.save();
    } else {
      persistPaddock();
    }
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface, paddingTop: insets.top }}>
      <ScreenHeader title={farm ? `New Paddock — ${farm.name}` : "New Paddock"} back />
      <View style={{ flex: 1 }}>
        <PaddockMap
          ref={mapRef}
          paddocks={otherPaddocks.map((p) => ({
            id: p.id, name: p.name, area_ha: p.area_ha, crop: p.crop, boundary_geojson: p.boundary ?? null,
            location: p.pin_lat != null && p.pin_lon != null ? { lat: p.pin_lat, lon: p.pin_lon } : null,
          }))}
          onReady={onMapReady}
          onPointsUpdate={(count, areaHa) => setDrawInfo({ count, areaHa })}
          onSaveGeometry={(geojson, areaHa) => persistPaddock({ geojson, areaHa })}
          onPinPlaced={(lat, lon) => setPin({ lat, lon })}
        />

        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.kbWrap} testID="paddock-new-overlay">
          <View style={[styles.overlay, { paddingBottom: insets.bottom + 12 }]}>
            <Card style={{ marginBottom: 8 }}>
              <ScrollView style={styles.formScroll} keyboardShouldPersistTaps="handled" nestedScrollEnabled>
                <Input label="Paddock name*" value={f.name} onChangeText={(v) => setF({ ...f, name: v })} placeholder="e.g. North 40" testID="input-paddock-name" />

                {/* Boundary comes right after the name — it's the main thing
                    this screen is for, so it needs to stay visible before the
                    keyboard opens on a field further down. */}
                <View style={styles.boundarySection}>
                  <View style={styles.modeToggle}>
                    <Pressable onPress={() => switchLocateMode("draw")} style={[styles.modeBtn, locateMode === "draw" && styles.modeBtnActive]} testID="locate-mode-draw">
                      <Icon name="vector-polygon" size={16} color={locateMode === "draw" ? colors.onBrandPrimary : colors.brandPrimary} />
                      <Text style={[styles.modeBtnText, locateMode === "draw" && { color: colors.onBrandPrimary }]}>Draw boundary</Text>
                    </Pressable>
                    <Pressable onPress={() => switchLocateMode("pin")} style={[styles.modeBtn, locateMode === "pin" && styles.modeBtnActive]} testID="locate-mode-pin">
                      <Icon name="map-marker-outline" size={16} color={locateMode === "pin" ? colors.onBrandPrimary : colors.brandPrimary} />
                      <Text style={[styles.modeBtnText, locateMode === "pin" && { color: colors.onBrandPrimary }]}>Drop a pin</Text>
                    </Pressable>
                  </View>
                  {locateMode === "draw" ? (
                    <>
                      <Text style={styles.meta}>
                        {drawInfo.count === 0
                          ? "Tap the map to trace this paddock's boundary, or hit Drive to record it — or skip and enter an area below."
                          : `${drawInfo.count} point${drawInfo.count === 1 ? "" : "s"} · ${drawInfo.areaHa.toFixed(2)} ha${driving ? "  •  RECORDING" : ""}`}
                      </Text>
                      <Pressable onPress={toggleDrive} style={[styles.driveBtn, driving && styles.driveBtnOn]} testID="drive-toggle-btn">
                        <Icon name={driving ? "stop-circle-outline" : "car-connected"} size={18} color={driving ? colors.onBrandPrimary : colors.brandPrimary} />
                        <Text style={[styles.driveBtnText, driving && { color: colors.onBrandPrimary }]}>
                          {driving ? "Stop recording" : "Drive boundary (GPS)"}
                        </Text>
                      </Pressable>
                      {drawInfo.count === 0 ? (
                        <Input label="Area (if not drawing a boundary)" value={f.area} onChangeText={(v) => setF({ ...f, area: v })} keyboardType="decimal-pad" suffix="ha" placeholder="Optional" testID="input-paddock-area" />
                      ) : null}
                    </>
                  ) : (
                    <>
                      <Text style={styles.meta}>
                        {pin ? `Pin dropped · ${pin.lat.toFixed(5)}, ${pin.lon.toFixed(5)}` : "Tap the map to drop a pin at this paddock's location."}
                      </Text>
                      {pin ? (
                        <Pressable onPress={() => { mapRef.current?.clearReportPin(); setPin(null); }} style={styles.driveBtn} testID="clear-pin-btn">
                          <Icon name="close" size={18} color={colors.brandPrimary} />
                          <Text style={styles.driveBtnText}>Clear pin</Text>
                        </Pressable>
                      ) : null}
                      <Input label="Area (optional)" value={f.area} onChangeText={(v) => setF({ ...f, area: v })} keyboardType="decimal-pad" suffix="ha" placeholder="Optional" testID="input-paddock-area" />
                    </>
                  )}
                </View>

                <View style={styles.twoCol}>
                  <View style={{ flex: 1 }}><Input label="Crop (optional)" value={f.crop} onChangeText={(v) => setF({ ...f, crop: v })} placeholder="e.g. Wheat" testID="input-paddock-crop" /></View>
                  <View style={{ flex: 1 }}><Input label="Variety" value={f.variety} onChangeText={(v) => setF({ ...f, variety: v })} testID="input-paddock-variety" /></View>
                </View>
                <Input label="Notes" value={f.notes} onChangeText={(v) => setF({ ...f, notes: v })} testID="input-paddock-notes" />
              </ScrollView>
            </Card>
            <View style={styles.row}>
              <Pressable style={styles.iconBtn} onPress={() => mapRef.current?.undo()} disabled={locateMode !== "draw" || drawInfo.count === 0} testID="draw-undo-btn">
                <Icon name="undo-variant" size={20} color={locateMode !== "draw" || drawInfo.count === 0 ? colors.muted : colors.onSurface} />
                <Text style={styles.iconBtnText}>Undo</Text>
              </Pressable>
              <Pressable style={styles.iconBtn} onPress={() => mapRef.current?.clear()} disabled={locateMode !== "draw" || drawInfo.count === 0} testID="draw-clear-btn">
                <Icon name="close-thick" size={20} color={locateMode !== "draw" || drawInfo.count === 0 ? colors.muted : colors.onSurface} />
                <Text style={styles.iconBtnText}>Clear</Text>
              </Pressable>
              <View style={{ flex: 1 }}>
                <Button title={saving ? "Saving…" : "Save Paddock"} icon="content-save-outline" onPress={handleSave} loading={saving} disabled={saving || !f.name.trim()} testID="save-paddock-btn" />
              </View>
            </View>
          </View>
        </KeyboardAvoidingView>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  kbWrap: { position: "absolute", left: 0, right: 0, bottom: 0 },
  overlay: { paddingHorizontal: 12 },
  formScroll: { maxHeight: 300 },
  boundarySection: { marginTop: spacing.sm, paddingTop: spacing.sm, borderTopWidth: 1, borderTopColor: colors.border },
  modeToggle: { flexDirection: "row", gap: 8, marginBottom: spacing.sm },
  modeBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, height: 36, borderRadius: radius.md, borderWidth: 1.5, borderColor: colors.brandPrimary, backgroundColor: colors.surface },
  modeBtnActive: { backgroundColor: colors.brandPrimary },
  modeBtnText: { fontWeight: "700", color: colors.brandPrimary, fontSize: 12 },
  twoCol: { flexDirection: "row", gap: 8 },
  meta: { fontSize: 13, color: colors.onSurface, fontWeight: "600" },
  driveBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, height: 40, borderRadius: radius.md, borderWidth: 1.5, borderColor: colors.brandPrimary, backgroundColor: colors.surface, marginTop: spacing.sm },
  driveBtnOn: { backgroundColor: colors.error, borderColor: colors.error },
  driveBtnText: { fontWeight: "700", color: colors.brandPrimary, fontSize: 13 },
  row: { flexDirection: "row", alignItems: "center", gap: 8 },
  iconBtn: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, height: 44, borderRadius: radius.md, paddingHorizontal: 10 },
  iconBtnText: { fontSize: 13, fontWeight: "700", color: colors.onSurface },
});
