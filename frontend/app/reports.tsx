import { useCallback, useEffect, useMemo, useState } from "react";
import { View, Text, StyleSheet, Pressable, ScrollView, ActivityIndicator } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useFocusEffect } from "expo-router";
import Icon from "@react-native-vector-icons/material-design-icons";
import { ScreenHeader } from "@/src/components/header";
import { Card, Chip, Button } from "@/src/components/ui";
import { colors, spacing } from "@/src/theme";
import { repo } from "@/src/lib/storage";
import { useAuth } from "@/src/lib/auth-context";
import { exportReportCsv } from "@/src/lib/csv";
import { exportReportSummaryPdf } from "@/src/lib/pdf-report";
import {
  JOB_KIND_LABEL, RANGE_PRESET_LABEL, rangeStart, jobArea, jobCost, jobDetailLine,
  summarizeJobs, tankCapacityByMachinery, type JobKind, type AnyJob, type RangePreset,
} from "@/src/lib/reports";
import type { Machinery } from "@/src/lib/types";

const KINDS: JobKind[] = ["spray", "spread", "seeding", "harvest"];
const PRESETS: RangePreset[] = ["3m", "6m", "12m", "all"];

const JOB_FETCHERS: Record<JobKind, () => Promise<AnyJob[]>> = {
  spray: () => repo.sprayJobs.completed(),
  spread: () => repo.spreadJobs.completed(),
  seeding: () => repo.seedingJobs.completed(),
  harvest: () => repo.harvestJobs.completed(),
};

export default function Reports() {
  const insets = useSafeAreaInsets();
  const { business } = useAuth();
  const [kind, setKind] = useState<JobKind>("spray");
  const [preset, setPreset] = useState<RangePreset>("3m");
  const [jobs, setJobs] = useState<AnyJob[]>([]);
  const [machinery, setMachinery] = useState<Machinery[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [exporting, setExporting] = useState(false);

  useFocusEffect(useCallback(() => {
    repo.machinery.list().then(setMachinery).catch(() => {});
  }, []));

  useEffect(() => {
    let cancelled = false;
    // Intentional: re-show the spinner on every job-type change, not just first mount.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    JOB_FETCHERS[kind]()
      .then((list) => { if (!cancelled) { setJobs(list); setLoading(false); } })
      .catch(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [kind]);

  const from = useMemo(() => rangeStart(preset), [preset]);
  const inRange = useMemo(
    () => jobs.filter((j) => !from || j.date >= from).sort((a, b) => (a.date < b.date ? 1 : -1)),
    [jobs, from],
  );

  // `selected` holds ids explicitly DESELECTED rather than ids selected, so
  // everything in the current range counts as selected by default — a job
  // just loaded or brought into range by a wider date filter doesn't need
  // an effect to opt it in, and switching job type/range needs no reset
  // since stale ids from a previous list simply match nothing in inRange.
  const selectedJobs = useMemo(() => inRange.filter((j) => !selected.has(j.id)), [inRange, selected]);
  const tankByMachinery = useMemo(() => tankCapacityByMachinery(machinery), [machinery]);
  const summary = useMemo(() => summarizeJobs(kind, selectedJobs, tankByMachinery), [kind, selectedJobs, tankByMachinery]);
  const allSelected = inRange.length > 0 && inRange.every((j) => !selected.has(j.id));

  function toggleJob(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  async function doExportCsv() {
    if (selectedJobs.length === 0) return;
    setExporting(true);
    try {
      const res = await exportReportCsv(kind, selectedJobs);
      if (!res.ok) alert(res.message ?? "Export failed");
    } finally { setExporting(false); }
  }
  async function doExportPdf() {
    if (selectedJobs.length === 0) return;
    setExporting(true);
    try {
      const res = await exportReportSummaryPdf(kind, selectedJobs, summary, business?.name ?? "Chaser", RANGE_PRESET_LABEL[preset]);
      if (!res.ok) alert(res.message ?? "Export failed");
    } finally { setExporting(false); }
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface, paddingTop: insets.top }}>
      <ScreenHeader title="Reports" back />
      <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + spacing.xxl }}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
          {KINDS.map((k) => (
            <Chip key={k} label={JOB_KIND_LABEL[k]} active={kind === k} onPress={() => setKind(k)} testID={`report-type-${k}`} />
          ))}
        </ScrollView>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
          {PRESETS.map((p) => (
            <Chip key={p} label={RANGE_PRESET_LABEL[p]} active={preset === p} onPress={() => setPreset(p)} testID={`report-range-${p}`} />
          ))}
        </ScrollView>

        <View style={{ paddingHorizontal: spacing.lg }}>
          <Card testID="report-summary-card">
            <View style={styles.statsRow}>
              <Stat label="Jobs completed" value={String(summary.count)} />
              <Stat label="Hectares covered" value={`${summary.totalHa.toFixed(2)} ha`} />
            </View>
            <View style={styles.statsRow}>
              <Stat
                label="Cost"
                value={summary.totalCost != null ? `$${summary.totalCost.toFixed(2)}` : "—"}
                note={summary.totalCost != null && summary.costJobsCount < summary.count ? `${summary.costJobsCount}/${summary.count} jobs` : undefined}
              />
              {summary.extraLabel ? (
                <Stat
                  label={summary.extraLabel}
                  value={summary.extraValue != null ? summary.extraValue.toFixed(1) : "—"}
                  note={summary.extraValue != null && summary.extraJobsCount < summary.count ? `${summary.extraJobsCount}/${summary.count} jobs` : undefined}
                />
              ) : <View style={{ flex: 1 }} />}
            </View>
          </Card>

          <View style={styles.row}>
            <Pressable onPress={() => setSelected(allSelected ? new Set(inRange.map((j) => j.id)) : new Set())} style={styles.selectAllBtn} testID="report-select-all-btn">
              <Icon name={allSelected ? "checkbox-marked" : "checkbox-blank-outline"} size={18} color={colors.brandPrimary} />
              <Text style={styles.selectAllText}>{allSelected ? "Deselect all" : "Select all"}</Text>
            </Pressable>
            <Text style={styles.selectedCount}>{selectedJobs.length} of {inRange.length} selected</Text>
          </View>

          <View style={styles.exportRow}>
            <View style={{ flex: 1 }}>
              <Button title="Export CSV" icon="file-delimited-outline" variant="outline" onPress={doExportCsv} loading={exporting} disabled={exporting || selectedJobs.length === 0} testID="report-export-csv-btn" />
            </View>
            <View style={{ flex: 1 }}>
              <Button title="Export PDF" icon="file-pdf-box" onPress={doExportPdf} loading={exporting} disabled={exporting || selectedJobs.length === 0} testID="report-export-pdf-btn" />
            </View>
          </View>

          {loading ? (
            <ActivityIndicator color={colors.brandPrimary} style={{ marginTop: spacing.xl }} />
          ) : inRange.length === 0 ? (
            <View style={styles.emptyState}>
              <Icon name="clipboard-text-off-outline" size={36} color={colors.muted} />
              <Text style={styles.emptyText}>No completed {JOB_KIND_LABEL[kind].toLowerCase()} jobs in this range.</Text>
            </View>
          ) : (
            inRange.map((j) => {
              const isSelected = !selected.has(j.id);
              const cost = jobCost(kind, j);
              const detail = jobDetailLine(kind, j);
              return (
                <Pressable key={j.id} onPress={() => toggleJob(j.id)} style={styles.jobRow} testID={`report-job-row-${j.id}`}>
                  <Icon name={isSelected ? "checkbox-marked" : "checkbox-blank-outline"} size={20} color={isSelected ? colors.brandPrimary : colors.muted} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.jobTitle} numberOfLines={1}>{j.farm_name ?? "—"} · {j.paddock_name ?? "—"}</Text>
                    <Text style={styles.jobSub} numberOfLines={1}>
                      {j.date} · {jobArea(j).toFixed(2)} ha{j.crop ? ` · ${j.crop}` : ""}{detail ? ` · ${detail}` : ""}
                    </Text>
                  </View>
                  {cost != null ? <Text style={styles.jobCost}>${cost.toFixed(2)}</Text> : null}
                </Pressable>
              );
            })
          )}
        </View>
      </ScrollView>
    </View>
  );
}

function Stat({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <View style={{ flex: 1 }}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}{note ? ` (${note})` : ""}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  chipRow: { paddingHorizontal: spacing.lg, gap: spacing.sm, paddingVertical: spacing.sm },
  statsRow: { flexDirection: "row", gap: spacing.md, marginBottom: spacing.sm },
  statValue: { fontSize: 18, fontWeight: "800", color: colors.brandPrimary },
  statLabel: { fontSize: 11, color: colors.muted, marginTop: 2 },
  row: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: spacing.md },
  selectAllBtn: { flexDirection: "row", alignItems: "center", gap: 6 },
  selectAllText: { fontSize: 13, fontWeight: "700", color: colors.brandPrimary },
  selectedCount: { fontSize: 12, color: colors.muted },
  exportRow: { flexDirection: "row", gap: 8, marginTop: spacing.md, marginBottom: spacing.md },
  emptyState: { alignItems: "center", justifyContent: "center", paddingVertical: spacing.xxl, gap: spacing.sm },
  emptyText: { color: colors.muted, textAlign: "center", fontSize: 14, lineHeight: 20 },
  jobRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.border },
  jobTitle: { fontSize: 14, fontWeight: "700", color: colors.onSurface },
  jobSub: { fontSize: 12, color: colors.muted, marginTop: 2 },
  jobCost: { fontSize: 13, fontWeight: "700", color: colors.onSurface },
});
