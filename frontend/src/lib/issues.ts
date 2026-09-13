import { v4 as uuid } from "uuid";
import { supabase } from "./supabase";
import { getActiveBusinessId } from "./backend";

export type IssueSeverity = "low" | "medium" | "high" | "critical";
export type IssueStatus = "open" | "assigned" | "in_progress" | "resolved" | "closed";

export type FarmIssue = {
  id: string;
  business_id: string;
  farm_id?: string | null;
  paddock_id?: string | null;
  machinery_id?: string | null;
  category: string;
  subcategory?: string | null;
  title: string;
  description?: string | null;
  severity: IssueSeverity;
  status: IssueStatus;
  reported_at: string;
  resolved_at?: string | null;
  resolution_notes?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  location_accuracy_m?: number | null;
  location_note?: string | null;
  farms?: { name: string } | null;
  paddocks?: { name: string } | null;
  machinery?: { name: string } | null;
};

export type NewFarmIssue = {
  farm_id?: string | null;
  paddock_id?: string | null;
  machinery_id?: string | null;
  category: string;
  subcategory?: string | null;
  title: string;
  description?: string | null;
  severity: IssueSeverity;
  latitude?: number | null;
  longitude?: number | null;
  location_accuracy_m?: number | null;
  location_note?: string | null;
};

function bid(): string {
  const id = getActiveBusinessId();
  if (!id) throw new Error("No active business.");
  return id;
}

export async function listFarmIssues(): Promise<FarmIssue[]> {
  const { data, error } = await supabase
    .from("farm_issues")
    .select("*, farms(name), paddocks(name), machinery(name)")
    .eq("business_id", bid())
    .is("deleted_at", null)
    .order("reported_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as FarmIssue[];
}

export async function createFarmIssue(input: NewFarmIssue): Promise<FarmIssue> {
  const row = {
    id: uuid(),
    business_id: bid(),
    farm_id: input.farm_id ?? null,
    paddock_id: input.paddock_id ?? null,
    machinery_id: input.machinery_id ?? null,
    category: input.category,
    subcategory: input.subcategory ?? null,
    title: input.title.trim(),
    description: input.description?.trim() || null,
    severity: input.severity,
    status: "open" as const,
    reported_at: new Date().toISOString(),
    latitude: input.latitude ?? null,
    longitude: input.longitude ?? null,
    location_accuracy_m: input.location_accuracy_m ?? null,
    location_note: input.location_note?.trim() || null,
  };
  const { data, error } = await supabase.from("farm_issues").insert(row).select("*").single();
  if (error) throw error;
  return data as FarmIssue;
}

export async function resolveFarmIssue(id: string, notes?: string) {
  const { error } = await supabase
    .from("farm_issues")
    .update({
      status: "resolved",
      resolved_at: new Date().toISOString(),
      resolution_notes: notes?.trim() || null,
    })
    .eq("id", id)
    .eq("business_id", bid());
  if (error) throw error;
}

export async function reopenFarmIssue(id: string) {
  const { error } = await supabase
    .from("farm_issues")
    .update({ status: "open", resolved_at: null, resolution_notes: null })
    .eq("id", id)
    .eq("business_id", bid());
  if (error) throw error;
}
