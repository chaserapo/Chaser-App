import { useCallback, useState } from "react";
import { View, Text, ScrollView, StyleSheet, Pressable, KeyboardAvoidingView, Platform } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter, useFocusEffect } from "expo-router";
import { v4 as uuid } from "uuid";
import { ScreenHeader } from "@/src/components/header";
import { Button, Card, Input, Chip } from "@/src/components/ui";
import { colors, spacing } from "@/src/theme";
import { getTask, saveTask, removeTask, type TaskStatus } from "@/src/lib/tasks";
import { listTeamMembers, type TeamMember } from "@/src/lib/team";
import { confirm } from "@/src/lib/confirm";

const STATUSES: { key: TaskStatus; label: string }[] = [
  { key: "open", label: "Open" },
  { key: "in_progress", label: "In progress" },
  { key: "done", label: "Done" },
];

export default function TaskForm() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { taskId, memberId } = useLocalSearchParams<{ taskId?: string; memberId?: string }>();
  const isEdit = !!taskId;
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<TaskStatus>("open");
  const [assignedTo, setAssignedTo] = useState<string | null>(memberId ?? null);
  const [f, setF] = useState({ title: "", description: "", due_date: "" });

  useFocusEffect(useCallback(() => {
    (async () => {
      const list = await listTeamMembers(false);
      setMembers(list);
      if (taskId) {
        const t = await getTask(taskId);
        if (t) {
          setF({ title: t.title, description: t.description ?? "", due_date: t.due_date ?? "" });
          setAssignedTo(t.assigned_to ?? null);
          setStatus(t.status);
        }
      }
    })();
  }, [taskId]));

  async function save() {
    if (!f.title.trim()) return;
    setSaving(true);
    try {
      const existing = taskId ? await getTask(taskId) : null;
      await saveTask({
        id: taskId ?? uuid(),
        business_id: existing?.business_id ?? "",
        title: f.title.trim(),
        description: f.description.trim() || undefined,
        assigned_to: assignedTo,
        status,
        due_date: f.due_date.trim() || undefined,
        created_at: existing?.created_at ?? new Date().toISOString(),
        completed_at: status === "done" ? (existing?.completed_at ?? new Date().toISOString()) : undefined,
      });
      router.back();
    } finally { setSaving(false); }
  }

  function confirmDelete() {
    if (!taskId) return;
    confirm({ title: "Delete task", message: "This can't be undone.", confirmLabel: "Delete", destructive: true }, async () => {
      await removeTask(taskId);
      router.back();
    });
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface, paddingTop: insets.top }}>
      <ScreenHeader title={isEdit ? "Edit Task" : "New Task"} back />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxl + insets.bottom }} keyboardShouldPersistTaps="handled">
          <Card>
            <Input label="Task*" value={f.title} onChangeText={(v) => setF({ ...f, title: v })} placeholder="e.g. Grease the header before harvest" testID="task-title" />
            <Input label="Details" value={f.description} onChangeText={(v) => setF({ ...f, description: v })} multiline testID="task-description" />
            <Input label="Due date" value={f.due_date} onChangeText={(v) => setF({ ...f, due_date: v })} placeholder="YYYY-MM-DD (optional)" testID="task-due-date" />
          </Card>

          <Text style={styles.section}>Assign to</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
            <Chip label="Unassigned" active={assignedTo === null} onPress={() => setAssignedTo(null)} testID="assign-unassigned" />
            {members.map((m) => (
              <Chip key={m.id} label={m.name} active={assignedTo === m.id} onPress={() => setAssignedTo(m.id)} testID={`assign-${m.id}`} />
            ))}
          </ScrollView>

          {isEdit ? (
            <>
              <Text style={styles.section}>Status</Text>
              <View style={styles.statusRow}>
                {STATUSES.map((s) => (
                  <Pressable key={s.key} onPress={() => setStatus(s.key)} style={[styles.statusChip, status === s.key && styles.statusChipActive]} testID={`status-${s.key}`}>
                    <Text style={[styles.statusChipText, status === s.key && styles.statusChipTextActive]}>{s.label}</Text>
                  </Pressable>
                ))}
              </View>
            </>
          ) : null}

          <View style={{ height: spacing.md }} />
          <Button title={isEdit ? "Save Changes" : "Create Task"} icon="content-save-outline" onPress={save} loading={saving} disabled={saving || !f.title.trim()} testID="save-task-btn" />
          {isEdit ? (
            <>
              <View style={{ height: spacing.sm }} />
              <Button title="Delete Task" variant="danger" icon="trash-can-outline" onPress={confirmDelete} testID="delete-task-btn" />
            </>
          ) : null}
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  section: { fontSize: 13, fontWeight: "800", color: colors.muted, marginTop: spacing.lg, marginBottom: spacing.sm, textTransform: "uppercase", letterSpacing: 0.5 },
  chipRow: { gap: 8, paddingBottom: spacing.sm },
  statusRow: { flexDirection: "row", gap: 8, paddingBottom: spacing.sm },
  statusChip: { paddingHorizontal: 14, height: 38, borderRadius: 999, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfaceTertiary, alignItems: "center", justifyContent: "center" },
  statusChipActive: { backgroundColor: colors.brandPrimary, borderColor: colors.brandPrimary },
  statusChipText: { fontSize: 12, fontWeight: "700", color: colors.onSurfaceTertiary },
  statusChipTextActive: { color: colors.onBrandPrimary },
});
