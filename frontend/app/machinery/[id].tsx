import { useCallback, useState } from "react";
import { View, Text, ScrollView, StyleSheet, Pressable } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter, useFocusEffect } from "expo-router";
import Icon from "@react-native-vector-icons/material-design-icons";
import { ScreenHeader } from "@/src/components/header";
import { Button, Card, Input, StatusBadge } from "@/src/components/ui";
import { colors, radius, spacing } from "@/src/theme";
import { repo, maintenanceStatus } from "@/src/lib/storage";
import { confirm } from "@/src/lib/confirm";
import { resolveFarmIssue, reopenFarmIssue } from "@/src/lib/issues";
import { issueCategoryIcon, issueCategoryLabel } from "@/src/lib/issue-categories";
import { MACHINE_TYPES } from "@/src/lib/types";
import type { Machinery, Maintenance, MaintenanceCompletion, MachineType, FarmIssue } from "@/src/lib/types";

const OPEN_ISSUE_STATUSES = ["open", "assigned", "in_progress"];

export default function MachineDetail() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [m, setM] = useState<Machinery | null>(null);
  const [maints, setMaints] = useState<Maintenance[]>([]);
  const [completions, setCompletions] = useState<MaintenanceCompletion[]>([]);
  const [issues, setIssues] = useState<FarmIssue[]>([]);
  const [editing, setEditing] = useState(false);
  const [fenceJets, setFenceJets] = useState<0 | 1 | 2>(0);
  const [ef, setEf] = useState({
    name: "", machine_type: "Tractor" as MachineType,
    make: "", model: "", year: "", serial_number: "", registration: "",
    current_hours: "", current_km: "", notes: "",
    tank_capacity_l: "", boom_width_m: "", nozzle_spacing_m: "", nozzle_positions: "",
    default_nozzle: "", default_speed_kmh: "", default_water_rate_lha: "",
    external_platform: "", external_machine_id: "",
  });

  const loadFields = (mm: Machinery) => setEf({
    name: mm.name,
    machine_type: mm.machine_type ?? "Tractor",
    make: mm.make ?? "", model: mm.model ?? "", year: mm.year != null ? String(mm.year) : "",
    serial_number: mm.serial_number ?? "", registration: mm.registration ?? "",
    current_hours: mm.current_hours != null ? String(mm.current_hours) : "",
    current_km: mm.current_km != null ? String(mm.current_km) : "",
    notes: mm.notes ?? "",
    tank_capacity_l: mm.tank_capacity_l != null ? String(mm.tank_capacity_l) : "",
    boom_width_m: mm.boom_width_m != null ? String(mm.boom_width_m) : "",
    nozzle_spacing_m: mm.nozzle_spacing_m != null ? String(mm.nozzle_spacing_m * 1000) : "",
    nozzle_positions: mm.nozzle_positions != null ? String(mm.nozzle_positions) : "",
    default_nozzle: mm.default_nozzle ?? "",
    default_speed_kmh: mm.default_speed_kmh != null ? String(mm.default_speed_kmh) : "",
    default_water_rate_lha: mm.default_water_rate_lha != null ? String(mm.default_water_rate_lha) : "",
    external_platform: mm.external_platform ?? "",
    external_machine_id: mm.external_machine_id ?? "",
  });

  // Auto-fill "# of nozzles" from boom width ÷ nozzle spacing, plus however
  // many fence jets are ticked - those sit at the boom ends outside the
  // regular spacing pattern. Still a plain editable field afterwards. Fence
  // jet count itself isn't stored - it's just a helper for this calculation.
  function recomputeNozzleCount(boomStr: string, spacingStr: string, fj: 0 | 1 | 2) {
    const boomM = parseFloat(boomStr);
    const spacingMm = parseFloat(spacingStr);
    if (!boomM || !spacingMm) return;
    const mainCount = Math.round(boomM / (spacingMm / 1000));
    setEf((prev) => ({ ...prev, nozzle_positions: String(mainCount + fj) }));
  }

  useFocusEffect(useCallback(() => {
    if (!id) return;
    (async () => {
      const [mach, mm, comps, allIssues] = await Promise.all([
        repo.machinery.get(id),
        repo.maintenance.forMachine(id),
        repo.maintenanceCompletions.forMachine(id),
        repo.farmIssues.list(),
      ]);
      setM(mach);
      if (mach) loadFields(mach);
      setMaints(mm.sort((a, b) => (a.next_service_hours ?? Infinity) - (b.next_service_hours ?? Infinity)));
      setCompletions(comps);
      setIssues(allIssues.filter((i) => i.machinery_id === id).sort((a, b) => b.reported_at.localeCompare(a.reported_at)));
    })();
  }, [id]));

  async function toggleIssue(issue: FarmIssue) {
    if (OPEN_ISSUE_STATUSES.includes(issue.status)) await resolveFarmIssue(issue);
    else await reopenFarmIssue(issue);
    const all = await repo.farmIssues.list();
    setIssues(all.filter((i) => i.machinery_id === id).sort((a, b) => b.reported_at.localeCompare(a.reported_at)));
  }

  async function saveEdit() {
    if (!m || !ef.name.trim()) return;
    const isSprayer = ef.machine_type === "Self-propelled sprayer" || ef.machine_type === "Tow-behind sprayer";
    const next: Machinery = {
      ...m,
      name: ef.name.trim(),
      machine_type: ef.machine_type,
      make: ef.make || undefined,
      model: ef.model || undefined,
      year: ef.year ? parseInt(ef.year) : undefined,
      serial_number: ef.serial_number || undefined,
      registration: ef.registration || undefined,
      current_hours: ef.current_hours ? parseFloat(ef.current_hours) : undefined,
      current_km: ef.current_km ? parseFloat(ef.current_km) : undefined,
      notes: ef.notes || undefined,
      tank_capacity_l: isSprayer && ef.tank_capacity_l ? parseFloat(ef.tank_capacity_l) : undefined,
      boom_width_m: isSprayer && ef.boom_width_m ? parseFloat(ef.boom_width_m) : undefined,
      nozzle_spacing_m: isSprayer && ef.nozzle_spacing_m ? parseFloat(ef.nozzle_spacing_m) / 1000 : undefined,
      nozzle_positions: isSprayer && ef.nozzle_positions ? parseInt(ef.nozzle_positions) : undefined,
      default_nozzle: isSprayer ? (ef.default_nozzle || undefined) : undefined,
      default_speed_kmh: isSprayer && ef.default_speed_kmh ? parseFloat(ef.default_speed_kmh) : undefined,
      default_water_rate_lha: isSprayer && ef.default_water_rate_lha ? parseFloat(ef.default_water_rate_lha) : undefined,
      external_platform: ef.external_platform || undefined,
      external_machine_id: ef.external_machine_id || undefined,
    };
    await repo.machinery.save(next);
    setM(next);
    setEditing(false);
  }

  function confirmDelete() {
    if (!m) return;
    confirm({
      title: "Delete Machine",
      message: `Delete ${m.name}? Maintenance and service history will remain.`,
      confirmLabel: "Delete",
      destructive: true,
    }, async () => {
      await repo.machinery.remove(m.id);
      router.back();
    });
  }

  if (!m) {
    return <View style={{ flex: 1, backgroundColor: colors.surface, paddingTop: insets.top }}><ScreenHeader title="Machine" back /></View>;
  }

  const Field = ({ label, value }: { label: string; value?: string | number }) => (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <Text style={styles.fieldValue}>{value ?? "—"}</Text>
    </View>
  );

  const dueCount = maints.filter((mn) => maintenanceStatus(m.current_hours, mn.next_service_hours) !== "good").length;
  const openIssues = issues.filter((i) => OPEN_ISSUE_STATUSES.includes(i.status));
  const resolvedIssuesCount = issues.length - openIssues.length;

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface, paddingTop: insets.top }}>
      <ScreenHeader title={m.name} back right={
        !editing ? (
          <Pressable onPress={() => { setFenceJets(0); setEditing(true); }} testID="edit-machine-btn"><Icon name="pencil" size={22} color={colors.brandPrimary} /></Pressable>
        ) : null
      } />
      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxl + insets.bottom }} keyboardShouldPersistTaps="handled">
        {editing ? (
          <>
            <Card>
              <Input label="Machine name*" value={ef.name} onChangeText={(v) => setEf({ ...ef, name: v })} testID="edit-machine-name" />
              <Text style={styles.editLabel}>Type</Text>
              <View style={styles.typeGrid}>
                {MACHINE_TYPES.map((t) => (
                  <Pressable key={t} onPress={() => setEf({ ...ef, machine_type: t })} style={[styles.typeChip, ef.machine_type === t && styles.typeChipActive]} testID={`edit-type-${t}`}>
                    <Text style={[styles.typeChipText, ef.machine_type === t && { color: colors.onBrandPrimary }]}>{t}</Text>
                  </Pressable>
                ))}
              </View>
              <Input label="Manufacturer" value={ef.make} onChangeText={(v) => setEf({ ...ef, make: v })} testID="edit-make" />
              <Input label="Model" value={ef.model} onChangeText={(v) => setEf({ ...ef, model: v })} testID="edit-model" />
              <View style={{ flexDirection: "row", gap: 8 }}>
                <View style={{ flex: 1 }}><Input label="Year" value={ef.year} onChangeText={(v) => setEf({ ...ef, year: v })} keyboardType="numeric" testID="edit-year" /></View>
                <View style={{ flex: 1 }}><Input label="Registration" value={ef.registration} onChangeText={(v) => setEf({ ...ef, registration: v })} testID="edit-rego" /></View>
              </View>
              <Input label="Serial number" value={ef.serial_number} onChangeText={(v) => setEf({ ...ef, serial_number: v })} testID="edit-serial" />
              <View style={{ flexDirection: "row", gap: 8 }}>
                <View style={{ flex: 1 }}><Input label="Current hours" value={ef.current_hours} onChangeText={(v) => setEf({ ...ef, current_hours: v })} keyboardType="decimal-pad" suffix="h" testID="edit-hours" /></View>
                <View style={{ flex: 1 }}><Input label="Current km" value={ef.current_km} onChangeText={(v) => setEf({ ...ef, current_km: v })} keyboardType="decimal-pad" suffix="km" testID="edit-km" /></View>
              </View>
              <Input label="Notes" value={ef.notes} onChangeText={(v) => setEf({ ...ef, notes: v })} multiline testID="edit-notes" />
            </Card>

            {(ef.machine_type === "Self-propelled sprayer" || ef.machine_type === "Tow-behind sprayer") && (
              <>
                <Text style={styles.section}>Sprayer setup</Text>
                <Card>
                  <View style={{ flexDirection: "row", gap: 8 }}>
                    <View style={{ flex: 1 }}><Input label="Tank capacity" value={ef.tank_capacity_l} onChangeText={(v) => setEf({ ...ef, tank_capacity_l: v })} keyboardType="decimal-pad" suffix="L" testID="edit-tank" /></View>
                    <View style={{ flex: 1 }}><Input label="Boom width" value={ef.boom_width_m} onChangeText={(v) => { setEf({ ...ef, boom_width_m: v }); recomputeNozzleCount(v, ef.nozzle_spacing_m, fenceJets); }} keyboardType="decimal-pad" suffix="m" testID="edit-boom" /></View>
                  </View>
                  <View style={{ flexDirection: "row", gap: 8 }}>
                    <View style={{ flex: 1 }}><Input label="Nozzle spacing" value={ef.nozzle_spacing_m} onChangeText={(v) => { setEf({ ...ef, nozzle_spacing_m: v }); recomputeNozzleCount(ef.boom_width_m, v, fenceJets); }} keyboardType="decimal-pad" suffix="mm" testID="edit-spacing" /></View>
                    <View style={{ flex: 1 }}><Input label="# of nozzles" value={ef.nozzle_positions} onChangeText={(v) => setEf({ ...ef, nozzle_positions: v })} keyboardType="numeric" testID="edit-positions" /></View>
                  </View>
                  <Text style={styles.editLabel}>Fence jet nozzles</Text>
                  <View style={{ flexDirection: "row", gap: 8, marginBottom: spacing.sm }}>
                    {([0, 1, 2] as const).map((n) => (
                      <Pressable key={n} onPress={() => { setFenceJets(n); recomputeNozzleCount(ef.boom_width_m, ef.nozzle_spacing_m, n); }} style={[styles.typeChip, { flex: 1 }, fenceJets === n && styles.typeChipActive]} testID={`edit-fence-jets-${n}`}>
                        <Text style={[styles.typeChipText, fenceJets === n && { color: colors.onBrandPrimary }]}>{n}</Text>
                      </Pressable>
                    ))}
                  </View>
                  <Text style={styles.helperText}>
                    Fence jets sit at the boom ends spraying outward, outside the regular nozzle spacing. &quot;# of nozzles&quot; auto-fills from boom width ÷ spacing + fence jets — edit it directly if it doesn&apos;t match your setup.
                  </Text>
                  <Input label="Default nozzle" value={ef.default_nozzle} onChangeText={(v) => setEf({ ...ef, default_nozzle: v })} testID="edit-def-nozzle" />
                  <View style={{ flexDirection: "row", gap: 8 }}>
                    <View style={{ flex: 1 }}><Input label="Default speed" value={ef.default_speed_kmh} onChangeText={(v) => setEf({ ...ef, default_speed_kmh: v })} keyboardType="decimal-pad" suffix="km/h" testID="edit-def-speed" /></View>
                    <View style={{ flex: 1 }}><Input label="Default water rate" value={ef.default_water_rate_lha} onChangeText={(v) => setEf({ ...ef, default_water_rate_lha: v })} keyboardType="decimal-pad" suffix="L/ha" testID="edit-def-water" /></View>
                  </View>
                </Card>
              </>
            )}

            <Text style={styles.section}>Connected Data</Text>
            <Card>
              <Text style={styles.helperText}>
                Enter a platform name and machine ID now to prepare for future telematics integrations (John Deere Operations Center / JDLink, CNH FieldOps, etc.). Live sync is not yet enabled.
              </Text>
              <Input label="External platform" value={ef.external_platform} onChangeText={(v) => setEf({ ...ef, external_platform: v })} placeholder="e.g. John Deere Operations Center" testID="edit-ext-platform" />
              <Input label="External machine ID" value={ef.external_machine_id} onChangeText={(v) => setEf({ ...ef, external_machine_id: v })} testID="edit-ext-machine-id" />
            </Card>

            <View style={{ height: spacing.md }} />
            <Button title="Save Changes" icon="content-save-outline" onPress={saveEdit} disabled={!ef.name.trim()} testID="save-machine-edit-btn" />
            <View style={{ height: spacing.sm }} />
            <Button title="Cancel" variant="outline" onPress={() => { setEditing(false); setFenceJets(0); loadFields(m); }} testID="cancel-machine-edit-btn" />
            <View style={{ height: spacing.md }} />
            <Button title="Delete Machine" variant="danger" icon="trash-can-outline" onPress={confirmDelete} testID="delete-machine-btn" />
          </>
        ) : (
          <>
            <Card>
              <View style={{ flexDirection: "row", alignItems: "center", marginBottom: spacing.md }}>
                <View style={styles.iconBox}><Icon name="tractor-variant" size={30} color={colors.brandPrimary} /></View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.name}>{m.name}</Text>
                  <Text style={styles.sub}>{[m.make, m.model].filter(Boolean).join(" ") || "—"}</Text>
                  {m.machine_type ? (
                    <View style={styles.typePill}>
                      <Text style={styles.typePillText}>{m.machine_type.toUpperCase()}</Text>
                    </View>
                  ) : null}
                </View>
              </View>
              <Field label="Year" value={m.year} />
              <Field label="Serial number" value={m.serial_number} />
              <Field label="Registration" value={m.registration} />
              <Field label="Current hours" value={m.current_hours != null ? `${m.current_hours} h` : undefined} />
              {m.current_km != null ? <Field label="Current km" value={`${m.current_km} km`} /> : null}
              <Field label="Purchase date" value={m.purchase_date} />
            </Card>

            {(m.tank_capacity_l != null || m.boom_width_m != null || m.default_nozzle) && (
              <>
                <Text style={styles.section}>Sprayer setup</Text>
                <Card>
                  <Field label="Tank capacity" value={m.tank_capacity_l != null ? `${m.tank_capacity_l} L` : undefined} />
                  <Field label="Boom width" value={m.boom_width_m != null ? `${m.boom_width_m} m` : undefined} />
                  <Field label="Nozzle spacing" value={m.nozzle_spacing_m != null ? `${Math.round(m.nozzle_spacing_m * 1000)} mm` : undefined} />
                  <Field label="# of nozzles" value={m.nozzle_positions} />
                  <Field label="Default nozzle" value={m.default_nozzle} />
                  <Field label="Default speed" value={m.default_speed_kmh != null ? `${m.default_speed_kmh} km/h` : undefined} />
                  <Field label="Default water rate" value={m.default_water_rate_lha != null ? `${m.default_water_rate_lha} L/ha` : undefined} />
                </Card>
              </>
            )}

            <Text style={styles.section}>Connected Data</Text>
            <Card>
              <Field label="Source" value={m.external_platform ? m.external_platform : "Manual hours"} />
              {m.external_machine_id ? <Field label="External machine ID" value={m.external_machine_id} /> : null}
              {m.synced_hours != null ? <Field label="Synced hours" value={`${m.synced_hours} h`} /> : null}
              {m.last_sync_at ? <Field label="Last sync" value={new Date(m.last_sync_at).toLocaleString()} /> : null}
              {m.sync_status ? <Field label="Status" value={m.sync_status} /> : null}
              <Text style={[styles.helperText, { marginTop: spacing.sm }]}>
                Live telematics sync (John Deere Operations Center · JDLink · CNH FieldOps) is on the roadmap. Edit the machine to link a platform ID today so history is ready when we switch it on.
              </Text>
            </Card>

            <View style={styles.sectionRow}>
              <Text style={styles.sectionTitle}>Faults & Risks</Text>
              <Pressable onPress={() => router.push({ pathname: "/issues/new", params: { machineryId: m.id } })} testID="add-issue-btn" hitSlop={8}>
                <Text style={styles.link}>+ Report</Text>
              </Pressable>
            </View>
            {openIssues.length === 0 ? (
              <Card>
                <Text style={styles.empty}>
                  No open faults or risks for this machine.{resolvedIssuesCount > 0 ? ` ${resolvedIssuesCount} resolved.` : ""}
                </Text>
              </Card>
            ) : (
              openIssues.map((issue) => (
                <Card key={issue.id} style={{ marginBottom: spacing.sm }} testID={`machine-issue-${issue.id}`}>
                  <View style={{ flexDirection: "row", alignItems: "flex-start" }}>
                    <View style={styles.historyIcon}><Icon name={issueCategoryIcon(issue.category) as any} size={20} color={colors.error} /></View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.mnTitle}>{issue.title}</Text>
                      <Text style={styles.mnMeta}>{issueCategoryLabel(issue.category)} · {issue.severity.toUpperCase()} · {issue.reported_at.slice(0, 10)}</Text>
                      {issue.description ? <Text style={styles.historyLine}>{issue.description}</Text> : null}
                      {issue.location_note ? <Text style={styles.historyLine}>Where: {issue.location_note}</Text> : null}
                    </View>
                  </View>
                  <Pressable onPress={() => toggleIssue(issue)} style={styles.resolveBtn} testID={`resolve-machine-issue-${issue.id}`}>
                    <Icon name="check-circle-outline" size={16} color={colors.success} />
                    <Text style={styles.resolveBtnText}>Mark resolved</Text>
                  </Pressable>
                </Card>
              ))
            )}
            {resolvedIssuesCount > 0 && openIssues.length > 0 ? (
              <Text style={[styles.subCount, { marginBottom: spacing.sm }]}>{resolvedIssuesCount} resolved — see Faults & Risks for full history.</Text>
            ) : null}

            <View style={styles.sectionRow}>
              <Text style={styles.sectionTitle}>Maintenance Schedule</Text>
              <Pressable onPress={() => router.push({ pathname: "/machinery/service-new", params: { machineId: m.id } })} testID="add-maint-btn" hitSlop={8}>
                <Text style={styles.link}>+ Add</Text>
              </Pressable>
            </View>
            {dueCount > 0 ? (
              <View style={styles.warnBanner}>
                <Icon name="alert-circle" size={16} color={colors.warning} />
                <Text style={styles.warnText}>{dueCount} service{dueCount === 1 ? "" : "s"} due or overdue</Text>
              </View>
            ) : null}

            {maints.length === 0 ? (
              <Card><Text style={styles.empty}>No maintenance scheduled.</Text></Card>
            ) : (
              maints.map((mn) => {
                const status = maintenanceStatus(m.current_hours, mn.next_service_hours);
                const remaining = mn.next_service_hours != null && m.current_hours != null ? mn.next_service_hours - m.current_hours : null;
                return (
                  <Card key={mn.id} style={{ marginBottom: spacing.sm }} testID={`maint-card-${mn.id}`}>
                    <View style={{ flexDirection: "row", alignItems: "flex-start", marginBottom: spacing.sm }}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.mnTitle}>{mn.maintenance_type}</Text>
                        <Text style={styles.mnMeta}>
                          Interval: {mn.service_interval_hours ?? "—"}h · Last: {mn.last_service_hours ?? "—"}h · Next: {mn.next_service_hours ?? "—"}h
                        </Text>
                        {remaining != null ? (
                          <Text style={[styles.mnDate, remaining <= 0 && { color: colors.error, fontWeight: "700" }]}>
                            {remaining <= 0 ? `${Math.abs(Math.round(remaining))}h overdue` : `${Math.round(remaining)}h remaining`}
                          </Text>
                        ) : null}
                        {mn.last_service_date ? <Text style={styles.mnDate}>Last serviced: {mn.last_service_date.slice(0, 10)}</Text> : null}
                      </View>
                      <StatusBadge status={status} />
                    </View>
                    <View style={{ flexDirection: "row", gap: 8 }}>
                      <Pressable
                        onPress={() => router.push({ pathname: "/machinery/maintenance-complete", params: { machineId: m.id, maintenanceId: mn.id } })}
                        style={styles.completeBtn}
                        testID={`complete-maint-${mn.id}`}
                      >
                        <Icon name="check-circle-outline" size={16} color={colors.onBrandPrimary} />
                        <Text style={styles.completeBtnText}>Mark Complete</Text>
                      </Pressable>
                      <Pressable
                        onPress={() => {
                          confirm({
                            title: "Delete Schedule",
                            message: `Remove ${mn.maintenance_type}?`,
                            confirmLabel: "Delete",
                            destructive: true,
                          }, async () => {
                            await repo.maintenance.remove(mn.id);
                            const mm = await repo.maintenance.forMachine(m.id);
                            setMaints(mm.sort((a, b) => (a.next_service_hours ?? Infinity) - (b.next_service_hours ?? Infinity)));
                          });
                        }}
                        style={styles.iconBtn}
                        testID={`delete-maint-${mn.id}`}
                        hitSlop={8}
                      >
                        <Icon name="trash-can-outline" size={18} color={colors.error} />
                      </Pressable>
                    </View>
                  </Card>
                );
              })
            )}

            <View style={styles.sectionRow}>
              <Text style={styles.sectionTitle}>Service History</Text>
              <Text style={styles.subCount}>{completions.length} entr{completions.length === 1 ? "y" : "ies"}</Text>
            </View>
            {completions.length === 0 ? (
              <Card><Text style={styles.empty}>No completed services yet. Mark a scheduled service complete above.</Text></Card>
            ) : (
              completions.map((c) => {
                const linked = maints.find((mn) => mn.id === c.maintenance_id);
                return (
                  <Card key={c.id} style={{ marginBottom: spacing.sm }} testID={`history-${c.id}`}>
                    <View style={{ flexDirection: "row", alignItems: "flex-start" }}>
                      <View style={styles.historyIcon}><Icon name="check-decagram" size={20} color={colors.brandPrimary} /></View>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.mnTitle}>{linked?.maintenance_type ?? c.work_performed ?? "Service"}</Text>
                        <Text style={styles.mnMeta}>{c.date.slice(0, 10)} · {c.hours != null ? `${c.hours}h` : "—"}{c.km != null ? ` · ${c.km}km` : ""}</Text>
                        {c.work_performed && linked ? <Text style={styles.historyLine}>{c.work_performed}</Text> : null}
                        {c.parts_used ? <Text style={styles.historyLine}>Parts: {c.parts_used}</Text> : null}
                        {c.service_provider ? <Text style={styles.historyLine}>By: {c.service_provider}</Text> : null}
                        {c.cost != null ? <Text style={styles.historyLine}>Cost: ${c.cost.toFixed(2)}</Text> : null}
                        {c.notes ? <Text style={[styles.historyLine, { fontStyle: "italic" }]}>{c.notes}</Text> : null}
                      </View>
                    </View>
                  </Card>
                );
              })
            )}

            {m.notes ? (
              <>
                <Text style={[styles.sectionTitle, { marginTop: spacing.lg, marginBottom: spacing.sm }]}>Notes</Text>
                <Card><Text style={{ color: colors.onSurface, lineHeight: 20 }}>{m.notes}</Text></Card>
              </>
            ) : null}
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  iconBox: { width: 56, height: 56, borderRadius: radius.md, backgroundColor: colors.brandSecondary, alignItems: "center", justifyContent: "center", marginRight: 14 },
  name: { fontSize: 20, fontWeight: "800", color: colors.onSurface },
  sub: { fontSize: 14, color: colors.muted, marginTop: 2 },
  typePill: { marginTop: 6, backgroundColor: colors.brandSecondary, alignSelf: "flex-start", paddingHorizontal: 10, paddingVertical: 3, borderRadius: 999 },
  typePillText: { color: colors.onBrandSecondary, fontSize: 10, fontWeight: "800", letterSpacing: 0.4 },
  field: { paddingVertical: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.border },
  fieldLabel: { fontSize: 12, color: colors.muted, fontWeight: "600", textTransform: "uppercase" },
  fieldValue: { fontSize: 15, color: colors.onSurface, marginTop: 4, fontWeight: "600" },
  section: { fontSize: 13, fontWeight: "800", color: colors.muted, marginTop: spacing.lg, marginBottom: spacing.sm, textTransform: "uppercase", letterSpacing: 0.5 },
  sectionRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: spacing.xl, marginBottom: spacing.sm },
  sectionTitle: { fontSize: 18, fontWeight: "800", color: colors.onSurface },
  subCount: { fontSize: 12, color: colors.muted, fontWeight: "600" },
  link: { color: colors.brandPrimary, fontWeight: "700", fontSize: 14 },
  mnTitle: { fontSize: 15, fontWeight: "700", color: colors.onSurface },
  mnMeta: { fontSize: 13, color: colors.onSurfaceTertiary, marginTop: 2 },
  mnDate: { fontSize: 12, color: colors.muted, marginTop: 2 },
  empty: { color: colors.muted, textAlign: "center" },
  editLabel: { fontSize: 13, fontWeight: "600", color: colors.onSurfaceTertiary, marginBottom: 6 },
  typeGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: spacing.md },
  typeChip: { paddingHorizontal: 12, height: 36, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfaceTertiary, alignItems: "center", justifyContent: "center" },
  typeChipActive: { backgroundColor: colors.brandPrimary, borderColor: colors.brandPrimary },
  typeChipText: { fontSize: 12, fontWeight: "700", color: colors.onSurfaceTertiary },
  helperText: { fontSize: 12, color: colors.muted, fontStyle: "italic", lineHeight: 16 },
  warnBanner: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: "#FEF3C7", paddingHorizontal: 12, paddingVertical: 8, borderRadius: radius.md, marginBottom: spacing.sm },
  warnText: { color: colors.warning, fontWeight: "700", fontSize: 13 },
  completeBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, backgroundColor: colors.brandPrimary, height: 40, borderRadius: radius.md },
  completeBtnText: { color: colors.onBrandPrimary, fontWeight: "700", fontSize: 13 },
  iconBtn: { width: 40, height: 40, alignItems: "center", justifyContent: "center", borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfaceSecondary },
  historyIcon: { width: 36, height: 36, borderRadius: radius.md, backgroundColor: colors.brandSecondary, alignItems: "center", justifyContent: "center", marginRight: 12 },
  historyLine: { fontSize: 13, color: colors.onSurface, marginTop: 3 },
  resolveBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, marginTop: spacing.sm, paddingTop: spacing.sm, borderTopWidth: 1, borderTopColor: colors.border, minHeight: 36 },
  resolveBtnText: { color: colors.success, fontWeight: "800", fontSize: 13 },
});
