import { supabase } from "./supabase";
import { getActiveBusinessId } from "./backend";

export type TaskStatus = "open" | "in_progress" | "done";

export type Task = {
  id: string;
  business_id: string;
  title: string;
  description?: string | null;
  assigned_to?: string | null;
  status: TaskStatus;
  due_date?: string | null;
  created_at: string;
  completed_at?: string | null;
};

function bid() {
  const id = getActiveBusinessId();
  if (!id) throw new Error("No active business");
  return id;
}

export async function listTasks(): Promise<Task[]> {
  const { data, error } = await supabase
    .from("tasks")
    .select("*")
    .eq("business_id", bid())
    .is("deleted_at", null)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as Task[];
}

export async function listTasksForMember(memberId: string): Promise<Task[]> {
  const { data, error } = await supabase
    .from("tasks")
    .select("*")
    .eq("business_id", bid())
    .eq("assigned_to", memberId)
    .is("deleted_at", null)
    .neq("status", "done")
    .order("due_date", { ascending: true, nullsFirst: false });
  if (error) throw error;
  return (data ?? []) as Task[];
}

export async function getTask(id: string): Promise<Task | null> {
  const { data, error } = await supabase.from("tasks").select("*").eq("business_id", bid()).eq("id", id).is("deleted_at", null).maybeSingle();
  if (error) throw error;
  return data as Task | null;
}

export async function saveTask(task: Task) {
  const { error } = await supabase.from("tasks").upsert({ ...task, business_id: bid() }, { onConflict: "id" });
  if (error) throw error;
}

export async function setTaskStatus(id: string, status: TaskStatus) {
  const { error } = await supabase
    .from("tasks")
    .update({ status, completed_at: status === "done" ? new Date().toISOString() : null })
    .eq("business_id", bid())
    .eq("id", id);
  if (error) throw error;
}

export async function removeTask(id: string) {
  const { error } = await supabase.from("tasks").update({ deleted_at: new Date().toISOString() }).eq("business_id", bid()).eq("id", id);
  if (error) throw error;
}
