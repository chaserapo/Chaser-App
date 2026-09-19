import { useCallback, useState } from "react";
import { View, Text, ScrollView, StyleSheet, Pressable, KeyboardAvoidingView, Platform } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter, useFocusEffect } from "expo-router";
import { v4 as uuid } from "uuid";
import { ScreenHeader } from "@/src/components/header";
import { Button, Card, Input } from "@/src/components/ui";
import { colors, radius, spacing } from "@/src/theme";
import { getActiveBusinessId } from "@/src/lib/backend";
import { getTeamMember, saveTeamMember, type EmploymentType } from "@/src/lib/team";

const EMPLOYMENT: EmploymentType[] = ["employee", "contractor", "casual"];

export default function NewTeamMember() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { memberId } = useLocalSearchParams<{ memberId?: string }>();
  const isEdit = !!memberId;
  const [employment, setEmployment] = useState<EmploymentType>("employee");
  const [saving, setSaving] = useState(false);
  const [f, setF] = useState({
    name: "", phone: "", role: "", start_date: "", licences: "", chemical: "", machinery: "",
    emergency_name: "", emergency_phone: "", emergency_relationship: "", availability: "Available", notes: "",
  });

  useFocusEffect(useCallback(() => {
    if (!memberId) return;
    getTeamMember(memberId).then((m) => {
      if (!m) return;
      setF({
        name: m.name, phone: m.phone ?? "", role: m.role ?? "", start_date: m.start_date ?? "",
        licences: (m.licences_qualifications ?? []).join(", "), chemical: m.chemical_accreditation ?? "",
        machinery: (m.machinery_competencies ?? []).join(", "),
        emergency_name: m.emergency_contact_name ?? "", emergency_phone: m.emergency_contact_phone ?? "",
        emergency_relationship: m.emergency_contact_relationship ?? "", availability: m.availability ?? "", notes: m.notes ?? "",
      });
      if (m.employment_type) setEmployment(m.employment_type);
    });
  }, [memberId]));

  async function save() {
    const businessId = getActiveBusinessId();
    if (!businessId || !f.name.trim()) return;
    setSaving(true);
    try {
      const existing = memberId ? await getTeamMember(memberId) : null;
      await saveTeamMember({
        id: memberId ?? uuid(), business_id: businessId, name: f.name.trim(), phone: f.phone || null,
        role: f.role || null, employment_type: employment,
        start_date: f.start_date || null,
        licences_qualifications: f.licences.split(",").map((x) => x.trim()).filter(Boolean),
        chemical_accreditation: f.chemical || null,
        machinery_competencies: f.machinery.split(",").map((x) => x.trim()).filter(Boolean),
        emergency_contact_name: f.emergency_name || null,
        emergency_contact_phone: f.emergency_phone || null,
        emergency_contact_relationship: f.emergency_relationship || null,
        availability: f.availability || null,
        notes: f.notes || null,
        archived_at: existing?.archived_at,
        created_at: existing?.created_at ?? new Date().toISOString(),
      });
      router.back();
    } finally { setSaving(false); }
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface, paddingTop: insets.top }}>
      <ScreenHeader title={isEdit ? "Edit Team Member" : "Add Team Member"} back />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxl + insets.bottom }} keyboardShouldPersistTaps="handled">
          <Card>
            <Input label="Team member name*" value={f.name} onChangeText={(v) => setF({ ...f, name: v })} testID="team-name" />
            <Input label="Phone" value={f.phone} onChangeText={(v) => setF({ ...f, phone: v })} keyboardType="phone-pad" testID="team-phone" />
            <Input label="Role" value={f.role} onChangeText={(v) => setF({ ...f, role: v })} placeholder="e.g. Farm hand, Manager, Spray operator" testID="team-role" />
            <Input label="Start date" value={f.start_date} onChangeText={(v) => setF({ ...f, start_date: v })} placeholder="YYYY-MM-DD (optional)" testID="team-start-date" />

            <Text style={styles.label}>Employment type</Text>
            <View style={styles.chips}>{EMPLOYMENT.map((x) => <Pressable key={x} onPress={() => setEmployment(x)} style={[styles.chip, employment === x && styles.chipOn]}><Text style={[styles.chipText, employment === x && styles.chipTextOn]}>{x[0].toUpperCase() + x.slice(1)}</Text></Pressable>)}</View>

            <Input label="Licences & qualifications" value={f.licences} onChangeText={(v) => setF({ ...f, licences: v })} multiline placeholder="Comma separated, e.g. HR licence, Forklift, First aid" testID="team-licences" />
            <Input label="Chemical accreditation" value={f.chemical} onChangeText={(v) => setF({ ...f, chemical: v })} placeholder="e.g. ChemCard / accreditation details" testID="team-chemical" />
            <Input label="Machinery competencies" value={f.machinery} onChangeText={(v) => setF({ ...f, machinery: v })} multiline placeholder="Comma separated, e.g. SP sprayer, Header, Air seeder" testID="team-machinery" />
          </Card>

          <Text style={styles.section}>Emergency contact</Text>
          <Card>
            <Input label="Name" value={f.emergency_name} onChangeText={(v) => setF({ ...f, emergency_name: v })} testID="team-emergency-name" />
            <Input label="Phone" value={f.emergency_phone} onChangeText={(v) => setF({ ...f, emergency_phone: v })} keyboardType="phone-pad" testID="team-emergency-phone" />
            <Input label="Relationship" value={f.emergency_relationship} onChangeText={(v) => setF({ ...f, emergency_relationship: v })} testID="team-emergency-relationship" />
          </Card>

          <Text style={styles.section}>Status & notes</Text>
          <Card>
            <Input label="Availability / status" value={f.availability} onChangeText={(v) => setF({ ...f, availability: v })} placeholder="e.g. Available, On leave, Seasonal" testID="team-availability" />
            <Input label="Notes" value={f.notes} onChangeText={(v) => setF({ ...f, notes: v })} multiline testID="team-notes" />
          </Card>

          <View style={{ height: spacing.md }} />
          <Button title={isEdit ? "Save Changes" : "Save Team Member"} icon="content-save-outline" onPress={save} loading={saving} disabled={saving || !f.name.trim()} testID="save-team-member" />
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  section: { fontSize: 13, fontWeight: "800", color: colors.muted, marginTop: spacing.lg, marginBottom: spacing.sm, textTransform: "uppercase", letterSpacing: 0.5 },
  label: { fontSize: 12, fontWeight: "700", color: colors.muted, marginTop: 6, marginBottom: 6 },
  chips: { flexDirection: "row", gap: 8, marginBottom: spacing.md },
  chip: { flex: 1, minHeight: 40, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfaceTertiary, alignItems: "center", justifyContent: "center" },
  chipOn: { backgroundColor: colors.brandPrimary, borderColor: colors.brandPrimary },
  chipText: { fontSize: 12, fontWeight: "700", color: colors.onSurfaceTertiary },
  chipTextOn: { color: colors.onBrandPrimary },
});
