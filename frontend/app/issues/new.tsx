import { useEffect, useMemo, useRef, useState } from "react";
import { View, Text, ScrollView, StyleSheet, Pressable, Image, KeyboardAvoidingView, Platform } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter, useLocalSearchParams } from "expo-router";
import * as Location from "expo-location";
import { v4 as uuid } from "uuid";
import Icon from "@react-native-vector-icons/material-design-icons";
import { ScreenHeader } from "@/src/components/header";
import { Button, Card, Input } from "@/src/components/ui";
import { colors, radius, spacing } from "@/src/theme";
import { repo } from "@/src/lib/storage";
import { useAuth } from "@/src/lib/auth-context";
import { ISSUE_CATEGORIES, type IssueCategory } from "@/src/lib/issue-categories";
import { pickIssuePhoto, uploadIssuePhoto } from "@/src/lib/issue-photos";
import { PaddockMap, PaddockMapHandle } from "@/src/features/paddocks/PaddockMap";
import type { Farm, Paddock, Machinery, FarmIssue, IssueSeverity } from "@/src/lib/types";

const SEVERITIES: IssueSeverity[] = ["low", "medium", "high", "critical"];

export default function NewIssueScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const params = useLocalSearchParams<{ machineryId?: string }>();
  const { business } = useAuth();
  const mapRef = useRef<PaddockMapHandle>(null);
  const issueId = useMemo(() => uuid(), []);
  const [farms, setFarms] = useState<Farm[]>([]);
  const [paddocks, setPaddocks] = useState<Paddock[]>([]);
  const [machines, setMachines] = useState<Machinery[]>([]);
  const [category, setCategory] = useState<IssueCategory>(params.machineryId ? "machine" : "poi");
  const [severity, setSeverity] = useState<IssueSeverity>("medium");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [locationNote, setLocationNote] = useState("");
  const [farmId, setFarmId] = useState<string | null>(null);
  const [paddockId, setPaddockId] = useState<string | null>(null);
  const [machineryId, setMachineryId] = useState<string | null>(params.machineryId ?? null);
  const [coords, setCoords] = useState<{ latitude: number; longitude: number; accuracy?: number | null } | null>(null);
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [locating, setLocating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([repo.farms.active(), repo.paddocks.active(), repo.machinery.list()]).then(([f, p, m]) => {
      setFarms(f); setPaddocks(p); setMachines(m);
    }).catch(() => {});
  }, []);

  useEffect(() => { mapRef.current?.setMode("pin"); }, []);

  const shownPaddocks = useMemo(() => farmId ? paddocks.filter((p) => p.farm_id === farmId) : paddocks, [paddocks, farmId]);
  const mapPaddocks = useMemo(
    () => paddocks.map((p) => ({ id: p.id, name: p.name, area_ha: p.area_ha, crop: p.crop, boundary_geojson: p.boundary ?? null })),
    [paddocks],
  );

  function onPinPlaced(lat: number, lon: number) {
    setCoords({ latitude: lat, longitude: lon, accuracy: null });
  }

  async function captureLocation() {
    setLocating(true); setError(null);
    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (!permission.granted) throw new Error("Location permission was not granted.");
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      setCoords({ latitude: pos.coords.latitude, longitude: pos.coords.longitude, accuracy: pos.coords.accuracy });
      mapRef.current?.setReportPin(pos.coords.latitude, pos.coords.longitude);
    } catch (e: any) { setError(e?.message ?? "Couldn't capture location."); }
    finally { setLocating(false); }
  }

  async function addPhoto() {
    setError(null);
    try {
      const uri = await pickIssuePhoto();
      if (uri) setPhotoUri(uri);
    } catch (e: any) { setError(e?.message ?? "Couldn't open the photo library."); }
  }

  async function save() {
    if (!title.trim() || !business) return;
    setSaving(true); setError(null);
    try {
      let photo_url: string | null = null;
      if (photoUri) photo_url = await uploadIssuePhoto(business.id, issueId, photoUri);
      const row: FarmIssue = {
        id: issueId,
        business_id: business.id,
        farm_id: farmId,
        paddock_id: paddockId,
        machinery_id: machineryId,
        category,
        subcategory: null,
        title: title.trim(),
        description: description.trim() || null,
        severity,
        status: "open",
        reported_at: new Date().toISOString(),
        resolved_at: null,
        resolution_notes: null,
        latitude: coords?.latitude ?? null,
        longitude: coords?.longitude ?? null,
        location_accuracy_m: coords?.accuracy ?? null,
        location_note: locationNote.trim() || null,
        photo_url,
      };
      await repo.farmIssues.save(row);
      router.replace("/issues");
    } catch (e: any) { setError(e?.message ?? "Couldn't save this issue."); }
    finally { setSaving(false); }
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface, paddingTop: insets.top }}>
      <ScreenHeader title="Report Issue" back />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxl + insets.bottom }} keyboardShouldPersistTaps="handled">
          <Text style={styles.section}>What happened?</Text>
          <Card>
            <View style={styles.grid}>{ISSUE_CATEGORIES.map(({ key, label, icon }) => (
              <Pressable key={key} onPress={() => setCategory(key)} style={[styles.category, category === key && styles.categoryActive]}>
                <Icon name={icon as any} size={20} color={category === key ? colors.onBrandPrimary : colors.brandPrimary} />
                <Text style={[styles.categoryText, category === key && { color: colors.onBrandPrimary }]}>{label}</Text>
              </Pressable>
            ))}</View>
            <Input label="Short title*" value={title} onChangeText={setTitle} placeholder="e.g. Large rock in north-west corner" testID="issue-title" />
            <Input label="Details" value={description} onChangeText={setDescription} multiline placeholder="What should the next person know?" testID="issue-description" />
          </Card>

          <Text style={styles.section}>Severity</Text>
          <View style={styles.severityRow}>{SEVERITIES.map((s) => (
            <Pressable key={s} onPress={() => setSeverity(s)} style={[styles.severity, severity === s && styles.severityActive]}>
              <Text style={[styles.severityText, severity === s && { color: colors.onBrandPrimary }]}>{s.toUpperCase()}</Text>
            </Pressable>
          ))}</View>

          <Text style={styles.section}>Where?</Text>
          <Card>
            <Text style={styles.label}>Tap the map to drop a pin</Text>
            <View style={styles.mapWrap}>
              <PaddockMap ref={mapRef} paddocks={mapPaddocks} onPinPlaced={onPinPlaced} style={styles.map} />
            </View>
            <View style={{ height: spacing.sm }} />
            <Button title={coords ? "GPS Captured" : "Or use my GPS location"} icon={coords ? "map-marker-check-outline" : "crosshairs-gps"} onPress={captureLocation} loading={locating} variant="outline" testID="issue-gps-btn" />
            {coords ? <Text style={styles.gpsText}>{coords.latitude.toFixed(6)}, {coords.longitude.toFixed(6)}{coords.accuracy ? ` · ±${Math.round(coords.accuracy)} m` : ""}</Text> : null}

            <Text style={styles.label}>Farm (optional)</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.choiceRow}>
              <Choice label="None" active={!farmId} onPress={() => { setFarmId(null); setPaddockId(null); }} />
              {farms.map((f) => <Choice key={f.id} label={f.name} active={farmId === f.id} onPress={() => { setFarmId(f.id); setPaddockId(null); }} />)}
            </ScrollView>

            <Text style={styles.label}>Paddock (optional)</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.choiceRow}>
              <Choice label="None" active={!paddockId} onPress={() => setPaddockId(null)} />
              {shownPaddocks.map((p) => <Choice key={p.id} label={p.name} active={paddockId === p.id} onPress={() => setPaddockId(p.id)} />)}
            </ScrollView>

            {category === "machine" ? <>
              <Text style={styles.label}>Machine (optional)</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.choiceRow}>
                <Choice label="None" active={!machineryId} onPress={() => setMachineryId(null)} />
                {machines.map((m) => <Choice key={m.id} label={m.name} active={machineryId === m.id} onPress={() => setMachineryId(m.id)} />)}
              </ScrollView>
            </> : null}

            <Input label="Location note" value={locationNote} onChangeText={setLocationNote} placeholder="e.g. 20 m inside western fence" />
          </Card>

          <Text style={styles.section}>Photo (optional)</Text>
          <Card>
            {photoUri ? (
              <View>
                <Image source={{ uri: photoUri }} style={styles.photoPreview} />
                <Pressable onPress={() => setPhotoUri(null)} style={styles.photoRemove} hitSlop={8} testID="issue-photo-remove">
                  <Icon name="close-circle" size={26} color={colors.error} />
                </Pressable>
              </View>
            ) : (
              <Button title="Add Photo" icon="camera-plus-outline" variant="outline" onPress={addPhoto} testID="issue-photo-btn" />
            )}
          </Card>

          {error ? <Text style={styles.error}>{error}</Text> : null}
          <View style={{ height: spacing.lg }} />
          <Button title="Report Issue" icon="alert-plus-outline" onPress={save} loading={saving} disabled={saving || !title.trim()} testID="save-issue-btn" />
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

function Choice({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return <Pressable onPress={onPress} style={[styles.choice, active && styles.choiceActive]}><Text style={[styles.choiceText, active && { color: colors.onBrandPrimary }]}>{label}</Text></Pressable>;
}

const styles = StyleSheet.create({
  section: { fontSize: 13, fontWeight: "800", color: colors.muted, marginTop: spacing.lg, marginBottom: spacing.sm, textTransform: "uppercase", letterSpacing: 0.5 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: spacing.md },
  category: { width: "48%", minHeight: 58, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfaceTertiary, alignItems: "center", justifyContent: "center", gap: 4 },
  categoryActive: { backgroundColor: colors.brandPrimary, borderColor: colors.brandPrimary },
  categoryText: { fontSize: 12, fontWeight: "800", color: colors.onSurface },
  severityRow: { flexDirection: "row", gap: 6 },
  severity: { flex: 1, alignItems: "center", paddingVertical: 10, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfaceSecondary },
  severityActive: { backgroundColor: colors.brandPrimary, borderColor: colors.brandPrimary },
  severityText: { fontSize: 10, fontWeight: "900", color: colors.onSurfaceTertiary },
  label: { fontSize: 12, color: colors.muted, marginBottom: 6, marginTop: spacing.sm, fontWeight: "700" },
  mapWrap: { height: 220, borderRadius: radius.md, overflow: "hidden", borderWidth: 1, borderColor: colors.border },
  map: { flex: 1 },
  choiceRow: { gap: 8, paddingBottom: spacing.sm },
  choice: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfaceTertiary },
  choiceActive: { backgroundColor: colors.brandPrimary, borderColor: colors.brandPrimary },
  choiceText: { color: colors.onSurfaceTertiary, fontSize: 12, fontWeight: "700" },
  gpsText: { textAlign: "center", color: colors.muted, fontSize: 11, marginTop: spacing.sm },
  photoPreview: { width: "100%", height: 180, borderRadius: radius.md },
  photoRemove: { position: "absolute", top: -10, right: -10, backgroundColor: colors.surface, borderRadius: 999 },
  error: { color: colors.error, fontSize: 13, marginTop: spacing.md, fontWeight: "700" },
});
