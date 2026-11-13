import { useCallback, useEffect, useRef, useState } from "react";
import { View, Text, ScrollView, KeyboardAvoidingView, Platform, Pressable, StyleSheet } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter, useFocusEffect } from "expo-router";
import * as Location from "expo-location";
import Icon from "@react-native-vector-icons/material-design-icons";
import { ScreenHeader } from "@/src/components/header";
import { Button, Card, Input, Chip, SectionTitle } from "@/src/components/ui";
import { colors, radius, spacing } from "@/src/theme";
import { repo } from "@/src/lib/storage";
import { PaddockMap, PaddockMapHandle } from "@/src/features/paddocks/PaddockMap";
import { geocodeAddress } from "@/src/lib/geocoding";
import type { Paddock, PaddockBoundary, Farm } from "@/src/lib/types";

export default function EditPaddock() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const mapRef = useRef<PaddockMapHandle>(null);
  const driveWatch = useRef<Location.LocationSubscription | null>(null);
  const lastDrivePoint = useRef<{ lat: number; lon: number; ts: number } | null>(null);

  const [paddock, setPaddock] = useState<Paddock | null>(null);
  const [farms, setFarms] = useState<Farm[]>([]);
  const [allPaddocks, setAllPaddocks] = useState<Paddock[]>([]);
  const [f, setF] = useState({ name: "", area: "", crop: "", variety: "", notes: "" });
  const [farmId, setFarmId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Only meaningful while adding a boundary/pin to a paddock that has
  // neither yet — a paddock that already has one shows a read-only map
  // instead (redrawing an existing boundary isn't this screen's job).
  const [locateMode, setLocateMode] = useState<"draw" | "pin">("draw");
  const [drawInfo, setDrawInfo] = useState<{ count: number; areaHa: number }>({ count: 0, areaHa: 0 });
  const [driving, setDriving] = useState(false);
  const [pin, setPin] = useState<{ lat: number; lon: number } | null>(null);

  const needsLocation = !!paddock && !paddock.boundary && paddock.pin_lat == null;
  const otherPaddocks = paddock ? allPaddocks.filter((x) => x.id !== paddock.id && x.farm_id === farmId && !x.archived_at) : [];

  useFocusEffect(useCallback(() => {
    (async () => {
      if (!id) return;
      const [list, farmList] = await Promise.all([repo.paddocks.list(), repo.farms.list()]);
      const p = list.find((x) => x.id === id) ?? null;
      setPaddock(p);
      setFarms(farmList);
      setAllPaddocks(list);
      if (p) {
        setF({ name: p.name, area: p.area_ha != null ? p.area_ha.toString() : "", crop: p.crop ?? "", variety: p.variety ?? "", notes: p.notes ?? "" });
        setFarmId(p.farm_id ?? null);
      }
    })();
  }, [id]));

  useEffect(() => () => { driveWatch.current?.remove(); }, []);

  function haversine(a: { lat: number; lon: number }, b: { lat: number; lon: number }) {
    const R = 6371000; const toRad = (d: number) => (d * Math.PI) / 180;
    const dLat = toRad(b.lat - a.lat); const dLon = toRad(b.lon - a.lon);
    const s = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLon / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(s));
  }

  function onMapReady() {
    mapRef.current?.setMode(locateMode);
    const farm = farms.find((x) => x.id === farmId);
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

  async function persist(opts?: { geojson?: PaddockBoundary; areaHa?: number; pin?: { lat: number; lon: number } }) {
    if (!paddock || !f.name.trim()) return;
    setSaving(true);
    try {
      const next: Paddock = {
        ...paddock,
        name: f.name.trim(),
        farm_id: farmId,
        area_ha: opts?.geojson ? Math.round((opts.areaHa ?? 0) * 100) / 100 : (f.area ? parseFloat(f.area) : undefined),
        crop: f.crop.trim() || undefined,
        variety: f.variety.trim() || undefined,
        notes: f.notes.trim() || undefined,
        ...(opts?.geojson ? { boundary: opts.geojson, pin_lat: undefined, pin_lon: undefined } : {}),
        ...(opts?.pin ? { pin_lat: opts.pin.lat, pin_lon: opts.pin.lon } : {}),
      };
      await repo.paddocks.save(next);
      router.back();
    } finally {
      setSaving(false);
    }
  }

  function handleSave() {
    if (!f.name.trim()) { alert("Please give the paddock a name."); return; }
    if (needsLocation && locateMode === "pin" && pin) {
      persist({ pin });
    } else if (needsLocation && locateMode === "draw" && drawInfo.count >= 3) {
      // Async round-trip: the map computes the polygon + area and posts it
      // back via onSaveGeometry, which calls persist({geojson, areaHa}).
      mapRef.current?.save();
    } else {
      persist();
    }
  }

  async function archive() {
    if (!paddock) return;
    await repo.paddocks.save({ ...paddock, archived_at: new Date().toISOString() });
    router.back();
  }
  async function unarchive() {
    if (!paddock) return;
    await repo.paddocks.save({ ...paddock, archived_at: undefined });
    router.back();
  }

  if (!paddock) return <View style={{ flex: 1, backgroundColor: colors.surface, paddingTop: insets.top }}><ScreenHeader title="Paddock" back /></View>;

  // Keep the currently-assigned farm selectable even if it's since been
  // archived, so reassigning away from it is still obvious and possible.
  const farmOptions = farms.filter((x) => !x.archived_at || x.id === paddock.farm_id);

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface, paddingTop: insets.top }}>
      <ScreenHeader title="Edit Paddock" back />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxl + insets.bottom }} keyboardShouldPersistTaps="handled">
          {paddock.archived_at ? <View style={styles.archBadge}><Text style={styles.archText}>Archived</Text></View> : null}

          <Card>
            <Input label="Paddock name*" value={f.name} onChangeText={(v) => setF({ ...f, name: v })} testID="edit-paddock-name" />
            <Input label="Area" value={f.area} onChangeText={(v) => setF({ ...f, area: v })} keyboardType="decimal-pad" suffix="ha" testID="edit-paddock-area" />
            <Input label="Current crop" value={f.crop} onChangeText={(v) => setF({ ...f, crop: v })} testID="edit-paddock-crop" />
            <Input label="Variety" value={f.variety} onChangeText={(v) => setF({ ...f, variety: v })} testID="edit-paddock-variety" />
            <Input label="Notes" value={f.notes} onChangeText={(v) => setF({ ...f, notes: v })} multiline testID="edit-paddock-notes" />
          </Card>

          <SectionTitle>Farm</SectionTitle>
          <Card>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
              {farmOptions.map((x) => (
                <Chip key={x.id} label={x.name} active={farmId === x.id} onPress={() => setFarmId(x.id)} testID={`edit-paddock-farm-${x.id}`} />
              ))}
            </ScrollView>
            {farmOptions.length === 0 ? <Text style={styles.meta}>No farms yet — add one from the Farm tab first.</Text> : null}
          </Card>

          <SectionTitle>Boundary</SectionTitle>
          {needsLocation ? (
            <Card>
              <Text style={styles.meta}>This paddock was created without a boundary or pin. Add one now, or leave it as-is.</Text>
              <View style={styles.modeToggle}>
                <Pressable onPress={() => switchLocateMode("draw")} style={[styles.modeBtn, locateMode === "draw" && styles.modeBtnActive]} testID="edit-locate-mode-draw">
                  <Icon name="vector-polygon" size={16} color={locateMode === "draw" ? colors.onBrandPrimary : colors.brandPrimary} />
                  <Text style={[styles.modeBtnText, locateMode === "draw" && { color: colors.onBrandPrimary }]}>Draw boundary</Text>
                </Pressable>
                <Pressable onPress={() => switchLocateMode("pin")} style={[styles.modeBtn, locateMode === "pin" && styles.modeBtnActive]} testID="edit-locate-mode-pin">
                  <Icon name="map-marker-outline" size={16} color={locateMode === "pin" ? colors.onBrandPrimary : colors.brandPrimary} />
                  <Text style={[styles.modeBtnText, locateMode === "pin" && { color: colors.onBrandPrimary }]}>Drop a pin</Text>
                </Pressable>
              </View>

              <View style={{ height: 260, borderRadius: radius.md, overflow: "hidden" }}>
                <PaddockMap
                  ref={mapRef}
                  paddocks={otherPaddocks.map((x) => ({
                    id: x.id, name: x.name, area_ha: x.area_ha, crop: x.crop, boundary_geojson: x.boundary ?? null,
                    location: x.pin_lat != null && x.pin_lon != null ? { lat: x.pin_lat, lon: x.pin_lon } : null,
                  }))}
                  onReady={onMapReady}
                  onPointsUpdate={(count, areaHa) => setDrawInfo({ count, areaHa })}
                  onSaveGeometry={(geojson, areaHa) => persist({ geojson, areaHa })}
                  onPinPlaced={(lat, lon) => setPin({ lat, lon })}
                />
              </View>

              {locateMode === "draw" ? (
                <>
                  <Text style={styles.meta}>
                    {drawInfo.count === 0
                      ? "Tap the map to trace this paddock's boundary, or hit Drive to record it."
                      : `${drawInfo.count} point${drawInfo.count === 1 ? "" : "s"} · ${drawInfo.areaHa.toFixed(2)} ha${driving ? "  •  RECORDING" : ""}`}
                  </Text>
                  <Pressable onPress={toggleDrive} style={[styles.driveBtn, driving && styles.driveBtnOn]} testID="edit-drive-toggle-btn">
                    <Icon name={driving ? "stop-circle-outline" : "car-connected"} size={18} color={driving ? colors.onBrandPrimary : colors.brandPrimary} />
                    <Text style={[styles.driveBtnText, driving && { color: colors.onBrandPrimary }]}>
                      {driving ? "Stop recording" : "Drive boundary (GPS)"}
                    </Text>
                  </Pressable>
                  <View style={styles.row}>
                    <Pressable style={styles.iconBtn} onPress={() => mapRef.current?.undo()} disabled={drawInfo.count === 0} testID="edit-draw-undo-btn">
                      <Icon name="undo-variant" size={20} color={drawInfo.count === 0 ? colors.muted : colors.onSurface} />
                      <Text style={styles.iconBtnText}>Undo</Text>
                    </Pressable>
                    <Pressable style={styles.iconBtn} onPress={() => mapRef.current?.clear()} disabled={drawInfo.count === 0} testID="edit-draw-clear-btn">
                      <Icon name="close-thick" size={20} color={drawInfo.count === 0 ? colors.muted : colors.onSurface} />
                      <Text style={styles.iconBtnText}>Clear</Text>
                    </Pressable>
                  </View>
                </>
              ) : (
                <>
                  <Text style={styles.meta}>
                    {pin ? `Pin dropped · ${pin.lat.toFixed(5)}, ${pin.lon.toFixed(5)}` : "Tap the map to drop a pin at this paddock's location."}
                  </Text>
                  {pin ? (
                    <Pressable onPress={() => { mapRef.current?.clearReportPin(); setPin(null); }} style={styles.driveBtn} testID="edit-clear-pin-btn">
                      <Icon name="close" size={18} color={colors.brandPrimary} />
                      <Text style={styles.driveBtnText}>Clear pin</Text>
                    </Pressable>
                  ) : null}
                </>
              )}
            </Card>
          ) : (
            <Card>
              <View style={{ height: 200, borderRadius: radius.md, overflow: "hidden" }}>
                <PaddockMap
                  ref={mapRef}
                  paddocks={[{
                    id: paddock.id, name: paddock.name, area_ha: paddock.area_ha, crop: paddock.crop,
                    boundary_geojson: paddock.boundary ?? null,
                    location: paddock.pin_lat != null && paddock.pin_lon != null ? { lat: paddock.pin_lat, lon: paddock.pin_lon } : null,
                  }]}
                />
              </View>
            </Card>
          )}

          <View style={{ height: spacing.md }} />
          <Button title={saving ? "Saving…" : "Save Changes"} icon="content-save-outline" onPress={handleSave} loading={saving} disabled={saving || !f.name.trim()} testID="save-paddock-edit-btn" />
          <View style={{ height: spacing.sm }} />
          {paddock.archived_at ? (
            <Button title="Unarchive Paddock" icon="archive-arrow-up-outline" variant="secondary" onPress={unarchive} testID="unarchive-paddock-btn" />
          ) : (
            <Button title="Archive Paddock" icon="archive-outline" variant="danger" onPress={archive} testID="archive-paddock-btn" />
          )}
          <Text style={styles.hint}>Archiving keeps history intact and hides the paddock from spray-job selection. Existing spray records keep their historical values.</Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  archBadge: { alignSelf: "flex-start", backgroundColor: colors.surfaceTertiary, paddingHorizontal: 10, paddingVertical: 4, borderRadius: radius.pill, marginBottom: spacing.md },
  archText: { fontSize: 11, fontWeight: "800", color: colors.onSurfaceTertiary, textTransform: "uppercase" },
  hint: { fontSize: 12, color: colors.muted, textAlign: "center", marginTop: spacing.md, fontStyle: "italic", lineHeight: 17 },
  meta: { fontSize: 13, color: colors.onSurface, fontWeight: "600", marginBottom: spacing.sm },
  modeToggle: { flexDirection: "row", gap: 8, marginBottom: spacing.sm },
  modeBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, height: 36, borderRadius: radius.md, borderWidth: 1.5, borderColor: colors.brandPrimary, backgroundColor: colors.surface },
  modeBtnActive: { backgroundColor: colors.brandPrimary },
  modeBtnText: { fontWeight: "700", color: colors.brandPrimary, fontSize: 12 },
  driveBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, height: 40, borderRadius: radius.md, borderWidth: 1.5, borderColor: colors.brandPrimary, backgroundColor: colors.surface, marginTop: spacing.sm },
  driveBtnOn: { backgroundColor: colors.error, borderColor: colors.error },
  driveBtnText: { fontWeight: "700", color: colors.brandPrimary, fontSize: 13 },
  row: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: spacing.sm },
  iconBtn: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, height: 44, borderRadius: radius.md, paddingHorizontal: 10 },
  iconBtnText: { fontSize: 13, fontWeight: "700", color: colors.onSurface },
});
