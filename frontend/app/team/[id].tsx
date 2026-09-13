import { useCallback, useState } from "react";
import { View, Text, ScrollView, StyleSheet, Pressable } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useFocusEffect, useLocalSearchParams } from "expo-router";
import Icon from "@react-native-vector-icons/material-design-icons";
import { ScreenHeader } from "@/src/components/header";
import { Card } from "@/src/components/ui";
import { colors, radius, spacing } from "@/src/theme";
import { getTeamActivity, getTeamMember, setTeamMemberActive, type TeamActivity, type TeamMember } from "@/src/lib/team";

export default function TeamMemberDetail() {
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [member, setMember] = useState<TeamMember | null>(null);
  const [activity, setActivity] = useState<TeamActivity>({ assignedJobs: [], recentJobs: [], incidents: [], prestarts: [] });

  const load = useCallback(async () => {
    if (!id) return;
    const [m, a] = await Promise.all([getTeamMember(id), getTeamActivity(id)]);
    setMember(m); setActivity(a);
  }, [id]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  if (!member) return <View style={{ flex: 1, backgroundColor: colors.surface, paddingTop: insets.top }}><ScreenHeader title="Team Member" back /></View>;

  const Field = ({ label, value }: { label: string; value?: string | null }) => value ? (
    <View style={styles.field}><Text style={styles.fieldLabel}>{label}</Text><Text style={styles.fieldValue}>{value}</Text></View>
  ) : null;

  async function toggleActive() {
    await setTeamMemberActive(member!.id, Boolean(member!.archived_at));
    await load();
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface, paddingTop: insets.top }}>
      <ScreenHeader title={member.name} back />
      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxl + insets.bottom }}>
        <Card>
          <View style={styles.profileTop}>
            <View style={styles.avatar}><Icon name="account" size={32} color={colors.brandPrimary} /></View>
            <View style={{ flex: 1 }}>
              <Text style={styles.name}>{member.name}</Text>
              <Text style={styles.sub}>{[member.role, member.employment_type].filter(Boolean).join(" · ") || "Team member"}</Text>
              <View style={[styles.status, member.archived_at ? styles.statusOff : styles.statusOn]}><Text style={styles.statusText}>{member.archived_at ? "INACTIVE" : "ACTIVE"}</Text></View>
            </View>
          </View>
          <Field label="Phone" value={member.phone} />
          <Field label="Availability" value={member.availability} />
          <Field label="Chemical accreditation" value={member.chemical_accreditation} />
          <Field label="Licences & qualifications" value={member.licences_qualifications?.join(", ")} />
          <Field label="Machinery competencies" value={member.machinery_competencies?.join(", ")} />
        </Card>

        {(member.emergency_contact_name || member.emergency_contact_phone) ? <>
          <Text style={styles.section}>Emergency contact</Text>
          <Card>
            <Field label="Name" value={member.emergency_contact_name} />
            <Field label="Phone" value={member.emergency_contact_phone} />
            <Field label="Relationship" value={member.emergency_contact_relationship} />
          </Card>
        </> : null}

        <Text style={styles.section}>Assigned jobs</Text>
        {activity.assignedJobs.length === 0 ? <Card><Text style={styles.empty}>No assigned or active jobs.</Text></Card> : activity.assignedJobs.map((j) => (
          <Card key={j.id} style={styles.itemCard}>
            <Text style={styles.itemTitle}>{j.target || "Spray job"}</Text>
            <Text style={styles.itemMeta}>{j.date} · {String(j.status).toUpperCase()}</Text>
            <Text style={styles.itemLine}>{[j.farm_name, j.paddock_name, j.machinery_name].filter(Boolean).join(" · ")}</Text>
          </Card>
        ))}

        <Text style={styles.section}>Recent jobs completed</Text>
        {activity.recentJobs.length === 0 ? <Card><Text style={styles.empty}>No completed jobs yet.</Text></Card> : activity.recentJobs.map((j) => (
          <Card key={j.id} style={styles.itemCard}>
            <Text style={styles.itemTitle}>{j.target || "Spray job"}</Text>
            <Text style={styles.itemMeta}>{j.date}</Text>
            <Text style={styles.itemLine}>{[j.farm_name, j.paddock_name, j.machinery_name].filter(Boolean).join(" · ")}</Text>
          </Card>
        ))}

        <Text style={styles.section}>Pre-starts & incidents</Text>
        {activity.prestarts.length === 0 && activity.incidents.length === 0 ? <Card><Text style={styles.empty}>No linked pre-starts or incidents.</Text></Card> : null}
        {activity.prestarts.map((p) => (
          <Card key={`pre-${p.id}`} style={styles.itemCard}>
            <View style={styles.iconRow}><Icon name={p.passed ? "check-circle-outline" : "alert-circle-outline"} size={18} color={p.passed ? colors.success : colors.warning} /><Text style={styles.itemTitle}>Pre-start · {p.machinery?.name ?? "Machine"}</Text></View>
            <Text style={styles.itemMeta}>{new Date(p.date).toLocaleDateString()}</Text>
            {p.notes ? <Text style={styles.itemLine}>{p.notes}</Text> : null}
          </Card>
        ))}
        {activity.incidents.map((i) => (
          <Card key={`issue-${i.id}`} style={styles.itemCard}>
            <View style={styles.iconRow}><Icon name="alert-outline" size={18} color={colors.warning} /><Text style={styles.itemTitle}>{i.title}</Text></View>
            <Text style={styles.itemMeta}>{String(i.category).replace(/_/g, " ")} · {String(i.severity).toUpperCase()} · {i.status}</Text>
          </Card>
        ))}

        {member.notes ? <><Text style={styles.section}>Notes</Text><Card><Text style={styles.notes}>{member.notes}</Text></Card></> : null}

        <Pressable onPress={toggleActive} style={styles.toggleBtn} testID="toggle-team-active">
          <Icon name={member.archived_at ? "account-check-outline" : "account-off-outline"} size={20} color={member.archived_at ? colors.success : colors.error} />
          <Text style={[styles.toggleText, { color: member.archived_at ? colors.success : colors.error }]}>{member.archived_at ? "Mark active" : "Mark inactive"}</Text>
        </Pressable>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  profileTop: { flexDirection: "row", alignItems: "center", gap: 14, marginBottom: spacing.md },
  avatar: { width: 58, height: 58, borderRadius: 29, backgroundColor: colors.brandSecondary, alignItems: "center", justifyContent: "center" },
  name: { fontSize: 21, fontWeight: "900", color: colors.onSurface },
  sub: { fontSize: 13, color: colors.muted, marginTop: 2, textTransform: "capitalize" },
  status: { alignSelf: "flex-start", borderRadius: radius.pill, paddingHorizontal: 8, paddingVertical: 3, marginTop: 6 },
  statusOn: { backgroundColor: colors.brandSecondary },
  statusOff: { backgroundColor: colors.surfaceTertiary },
  statusText: { fontSize: 9, fontWeight: "900", color: colors.onSurfaceTertiary },
  field: { borderTopWidth: 1, borderTopColor: colors.border, paddingVertical: 9 },
  fieldLabel: { fontSize: 10, fontWeight: "800", color: colors.muted, textTransform: "uppercase" },
  fieldValue: { fontSize: 14, color: colors.onSurface, marginTop: 3 },
  section: { fontSize: 13, fontWeight: "800", color: colors.muted, marginTop: spacing.lg, marginBottom: spacing.sm, textTransform: "uppercase", letterSpacing: 0.5 },
  empty: { color: colors.muted, textAlign: "center", paddingVertical: spacing.md },
  itemCard: { marginBottom: spacing.sm },
  itemTitle: { fontSize: 14, fontWeight: "800", color: colors.onSurface },
  itemMeta: { fontSize: 11, color: colors.muted, marginTop: 3, textTransform: "capitalize" },
  itemLine: { fontSize: 12, color: colors.onSurfaceTertiary, marginTop: 4 },
  iconRow: { flexDirection: "row", alignItems: "center", gap: 7 },
  notes: { color: colors.onSurface, lineHeight: 20 },
  toggleBtn: { marginTop: spacing.xl, height: 46, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 },
  toggleText: { fontWeight: "800" },
});
