import { useCallback, useMemo, useState } from "react";
import { View, Text, StyleSheet, Pressable, FlatList } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter, useFocusEffect } from "expo-router";
import Icon from "@react-native-vector-icons/material-design-icons";
import { ScreenHeader } from "@/src/components/header";
import { Card, Button } from "@/src/components/ui";
import { colors, spacing } from "@/src/theme";
import { listTasks, setTaskStatus, type Task, type TaskStatus } from "@/src/lib/tasks";
import { listTeamMembers, type TeamMember } from "@/src/lib/team";

const STATUS_LABEL: Record<TaskStatus, string> = { open: "Open", in_progress: "In progress", done: "Done" };
const STATUS_COLOR: Record<TaskStatus, string> = { open: colors.muted, in_progress: colors.warning, done: colors.success };

export default function TasksScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [showDone, setShowDone] = useState(false);

  const load = useCallback(async () => {
    const [t, m] = await Promise.all([listTasks(), listTeamMembers(true)]);
    setTasks(t);
    setMembers(m);
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const nameById = useMemo(() => new Map(members.map((m) => [m.id, m.name])), [members]);
  const shown = useMemo(
    () => tasks.filter((t) => showDone || t.status !== "done").sort((a, b) => (a.status === b.status ? 0 : a.status === "done" ? 1 : -1)),
    [tasks, showDone],
  );
  const openCount = tasks.filter((t) => t.status !== "done").length;

  async function cycleStatus(t: Task) {
    const next: TaskStatus = t.status === "open" ? "in_progress" : t.status === "in_progress" ? "done" : "open";
    await setTaskStatus(t.id, next);
    await load();
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface, paddingTop: insets.top }}>
      <ScreenHeader title="Tasks" back />
      <FlatList
        data={shown}
        keyExtractor={(t) => t.id}
        contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxl + insets.bottom }}
        ListHeaderComponent={
          <>
            <Button title="New Task" icon="plus" onPress={() => router.push("/tasks/new")} testID="new-task-btn" />
            <View style={styles.sectionRow}>
              <Text style={styles.sectionTitle}>{openCount} open</Text>
              <Pressable onPress={() => setShowDone((v) => !v)} hitSlop={8}>
                <Text style={styles.link}>{showDone ? "Hide done" : "Show done"}</Text>
              </Pressable>
            </View>
          </>
        }
        ListEmptyComponent={
          <Card>
            <Text style={styles.empty}>No tasks yet. Create one and assign it to someone, or leave it open for anyone to pick up.</Text>
          </Card>
        }
        renderItem={({ item }) => (
          <Card style={{ marginBottom: spacing.sm }} testID={`task-${item.id}`}>
            <View style={{ flexDirection: "row", alignItems: "flex-start" }}>
              <Pressable onPress={() => cycleStatus(item)} style={styles.statusDot} testID={`task-cycle-${item.id}`}>
                <Icon
                  name={item.status === "done" ? "check-circle" : item.status === "in_progress" ? "progress-clock" : "circle-outline"}
                  size={24}
                  color={STATUS_COLOR[item.status]}
                />
              </Pressable>
              <Pressable style={{ flex: 1 }} onPress={() => router.push({ pathname: "/tasks/new", params: { taskId: item.id } })} testID={`task-edit-${item.id}`}>
                <Text style={[styles.title, item.status === "done" && styles.titleDone]}>{item.title}</Text>
                <Text style={styles.meta}>
                  {item.assigned_to ? (nameById.get(item.assigned_to) ?? "Unknown") : "Unassigned"}
                  {item.due_date ? ` · Due ${item.due_date}` : ""}
                  {" · "}{STATUS_LABEL[item.status]}
                </Text>
                {item.description ? <Text style={styles.desc}>{item.description}</Text> : null}
              </Pressable>
            </View>
          </Card>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  sectionRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: spacing.lg, marginBottom: spacing.sm },
  sectionTitle: { fontSize: 16, fontWeight: "800", color: colors.onSurface },
  link: { color: colors.brandPrimary, fontWeight: "700", fontSize: 13 },
  empty: { color: colors.muted, textAlign: "center", lineHeight: 19 },
  statusDot: { marginRight: 12, paddingTop: 2 },
  title: { fontSize: 15, fontWeight: "700", color: colors.onSurface },
  titleDone: { textDecorationLine: "line-through", color: colors.muted },
  meta: { fontSize: 12, color: colors.muted, marginTop: 2, textTransform: "capitalize" },
  desc: { fontSize: 13, color: colors.onSurfaceTertiary, marginTop: 6 },
});
