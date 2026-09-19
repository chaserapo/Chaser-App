import { useCallback, useEffect, useRef, useState } from "react";
import { View, Text, StyleSheet, Pressable } from "react-native";
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
    mapRef.current?.setMode("draw");
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

  async function persistPaddock(geojson?: PaddockBoundary, areaHa?: number) {
    const business = await repo.getBusiness();
    if (!business || !farmId || !f.name.trim()) return;
    setSaving(true);
    try {
      const p: Paddock = {
        id: uuid(),
        business_id: business.id,
        farm_id: farmId,
        name: f.name.trim(),
        area_ha: geojson ? Math.round((areaHa ?? 0) * 100) / 100 : (f.area ? parseFloat(f.area) : undefined),
        crop: f.crop.trim() || undefined,
        variety: f.variety.trim() || undefined,
        notes: f.notes.trim() || undefined,
        boundary: geojson,
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
    if (drawInfo.count >= 3) {
      // Async round-trip: the map computes the polygon + area and posts it
      // back via onSaveGeometry, which calls persistPaddock(geojson, areaHa).
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
          }))}
          onReady={onMapReady}
          onPointsUpdate={(count, areaHa) => setDrawInfo({ count, areaHa })}
          onSaveGeometry={(geojson, areaHa) => persistPaddock(geojson, areaHa)}
        />

        <View style={[styles.overlay, { paddingBottom: insets.bottom + 12 }]} testID="paddock-new-overlay">
          <Card style={{ marginBottom: 8 }}>
            <Input label="Paddock name*" value={f.name} onChangeText={(v) => setF({ ...f, name: v })} placeholder="e.g. North 40" testID="input-paddock-name" />
            <Input label="Crop (optional)" value={f.crop} onChangeText={(v) => setF({ ...f, crop: v })} placeholder="e.g. Wheat" testID="input-paddock-crop" />
            <Input label="Variety" value={f.variety} onChangeText={(v) => setF({ ...f, variety: v })} testID="input-paddock-variety" />
            <Input label="Notes" value={f.notes} onChangeText={(v) => setF({ ...f, notes: v })} testID="input-paddock-notes" />
            <Text style={styles.meta}>
              {drawInfo.count === 0
                ? "Tap the map to trace this paddock's boundary, or hit Drive to record while driving it — or skip and enter an area below."
                : `${drawInfo.count} point${drawInfo.count === 1 ? "" : "s"} · ${drawInfo.areaHa.toFixed(2)} ha${driving ? "  •  RECORDING" : ""}`}
            </Text>
            {drawInfo.count === 0 ? (
              <Input label="Area (if not drawing a boundary)" value={f.area} onChangeText={(v) => setF({ ...f, area: v })} keyboardType="decimal-pad" suffix="ha" placeholder="Optional" testID="input-paddock-area" />
            ) : null}
            <View style={{ height: 8 }} />
            <Pressable onPress={toggleDrive} style={[styles.driveBtn, driving && styles.driveBtnOn]} testID="drive-toggle-btn">
              <Icon name={driving ? "stop-circle-outline" : "car-connected"} size={18} color={driving ? colors.onBrandPrimary : colors.brandPrimary} />
              <Text style={[styles.driveBtnText, driving && { color: colors.onBrandPrimary }]}>
                {driving ? "Stop recording" : "Drive boundary (GPS)"}
              </Text>
            </Pressable>
          </Card>
          <View style={styles.row}>
            <Pressable style={styles.iconBtn} onPress={() => mapRef.current?.undo()} disabled={drawInfo.count === 0} testID="draw-undo-btn">
              <Icon name="undo-variant" size={20} color={drawInfo.count === 0 ? colors.muted : colors.onSurface} />
              <Text style={styles.iconBtnText}>Undo</Text>
            </Pressable>
            <Pressable style={styles.iconBtn} onPress={() => mapRef.current?.clear()} disabled={drawInfo.count === 0} testID="draw-clear-btn">
              <Icon name="close-thick" size={20} color={drawInfo.count === 0 ? colors.muted : colors.onSurface} />
              <Text style={styles.iconBtnText}>Clear</Text>
            </Pressable>
            <View style={{ flex: 1 }}>
              <Button title={saving ? "Saving…" : "Save Paddock"} icon="content-save-outline" onPress={handleSave} loading={saving} disabled={saving || !f.name.trim()} testID="save-paddock-btn" />
            </View>
          </View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: { position: "absolute", left: 12, right: 12, bottom: 0 },
  meta: { fontSize: 13, color: colors.onSurface, fontWeight: "600", marginTop: spacing.sm },
  driveBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, height: 40, borderRadius: radius.md, borderWidth: 1.5, borderColor: colors.brandPrimary, backgroundColor: colors.surface },
  driveBtnOn: { backgroundColor: colors.error, borderColor: colors.error },
  driveBtnText: { fontWeight: "700", color: colors.brandPrimary, fontSize: 13 },
  row: { flexDirection: "row", alignItems: "center", gap: 8 },
  iconBtn: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, height: 44, borderRadius: radius.md, paddingHorizontal: 10 },
  iconBtnText: { fontSize: 13, fontWeight: "700", color: colors.onSurface },
});
