import { supabase } from "./supabase";
import { getActiveBusinessId } from "./backend";

export type EmploymentType = "employee" | "contractor" | "casual";

export type TeamMember = {
  id: string;
  business_id: string;
  user_id?: string | null;
  name: string;
  first_name?: string | null;
  last_name?: string | null;
  phone?: string | null;
  email?: string | null;
  role?: string | null;
  employment_type?: EmploymentType | null;
  licences_qualifications?: string[] | null;
  chemical_accreditation?: string | null;
  machinery_competencies?: string[] | null;
  emergency_contact_name?: string | null;
  emergency_contact_phone?: string | null;
  emergency_contact_relationship?: string | null;
  availability?: string | null;
  notes?: string | null;
  is_default_user?: boolean;
  archived_at?: string | null;
  created_at?: string;
};

function bid() {
  const id = getActiveBusinessId();
  if (!id) throw new Error("No active business");
  return id;
}

export async function listTeamMembers(includeInactive = true): Promise<TeamMember[]> {
  let q = supabase.from("operators").select("*").eq("business_id", bid()).is("deleted_at", null).order("name");
  if (!includeInactive) q = q.is("archived_at", null);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as TeamMember[];
}

export async function getTeamMember(id: string): Promise<TeamMember | null> {
  const { data, error } = await supabase.from("operators").select("*").eq("business_id", bid()).eq("id", id).is("deleted_at", null).maybeSingle();
  if (error) throw error;
  return data as TeamMember | null;
}

export async function saveTeamMember(member: TeamMember) {
  const payload = { ...member, business_id: bid(), deleted_at: null };
  const { error } = await supabase.from("operators").upsert(payload, { onConflict: "id", defaultToNull: false });
  if (error) throw error;
}

export async function setTeamMemberActive(id: string, active: boolean) {
  const { error } = await supabase.from("operators").update({ archived_at: active ? null : new Date().toISOString() }).eq("business_id", bid()).eq("id", id);
  if (error) throw error;
}

export type TeamActivity = {
  assignedJobs: any[];
  recentJobs: any[];
  incidents: any[];
  prestarts: any[];
};

export async function getTeamActivity(operatorId: string): Promise<TeamActivity> {
  const businessId = bid();
  const [assigned, recent, incidents, prestarts] = await Promise.all([
    supabase.from("spray_jobs").select("id,date,status,farm_name,paddock_name,target,machinery_name").eq("business_id", businessId).eq("operator_id", operatorId).in("status", ["planned", "active"]).order("date", { ascending: false }).limit(20),
    supabase.from("spray_jobs").select("id,date,status,farm_name,paddock_name,target,machinery_name").eq("business_id", businessId).eq("operator_id", operatorId).eq("status", "completed").order("date", { ascending: false }).limit(10),
    supabase.from("farm_issues").select("id,title,category,severity,status,reported_at").eq("business_id", businessId).eq("assigned_operator_id", operatorId).is("deleted_at", null).order("reported_at", { ascending: false }).limit(10),
    supabase.from("prestart_inspections").select("id,date,passed,notes,machinery(name)").eq("business_id", businessId).eq("operator_id", operatorId).is("deleted_at", null).order("date", { ascending: false }).limit(10),
  ]);
  for (const r of [assigned, recent, incidents, prestarts]) if (r.error) throw r.error;
  return {
    assignedJobs: assigned.data ?? [],
    recentJobs: recent.data ?? [],
    incidents: incidents.data ?? [],
    prestarts: prestarts.data ?? [],
  };
}
