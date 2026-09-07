// Supabase-backed repository matching the shape of localRepo (see storage.ts).
// Every call filters/writes with the active business_id resolved via backend.ts.
// Soft-delete convention: `remove(id)` sets deleted_at=now(); list()/active() filter deleted_at IS NULL.

import { supabase } from "./supabase";
import { getActiveBusinessId } from "./backend";
import type {
  Business, Farm, Paddock, Chemical, ChemicalBatch, Machinery, Maintenance,
  MaintenanceCompletion, SprayJob, SprayJobProduct, ExternalLink, Operator, StockMovement,
} from "./types";

function bid(): string {
  const id = getActiveBusinessId();
  if (!id) throw new Error("No active business — call setBackend('cloud', businessId) after sign-in.");
  return id;
}

async function softDelete(table: string, id: string) {
  const { error } = await supabase.from(table).update({ deleted_at: new Date().toISOString() }).eq("id", id).eq("business_id", bid());
  if (error) throw error;
}

async function upsertRow<T extends { id: string }>(table: string, row: T) {
  const payload: any = { ...row, business_id: bid(), deleted_at: null };
  const { error } = await supabase.from(table).upsert(payload, { onConflict: "id" });
  if (error) throw error;
}

async function listRows<T>(table: string, opts?: { activeOnly?: boolean; extraEq?: [string, any][] }): Promise<T[]> {
  let q = supabase.from(table).select("*").eq("business_id", bid()).is("deleted_at", null);
  if (opts?.activeOnly) q = q.is("archived_at", null);
  if (opts?.extraEq) for (const [k, v] of opts.extraEq) q = q.eq(k, v);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as T[];
}

// ---- Spray jobs (job + products join) ----
function stripProducts(job: SprayJob): Omit<SprayJob, "products"> {
  const { products, ...rest } = job;
  return rest;
}

async function saveSprayJob(job: SprayJob) {
  await upsertRow("spray_jobs", stripProducts(job) as any);
  // Upsert current products, delete removed ones.
  const productRows = (job.products ?? []).map((p) => ({
    id: p.id,
    business_id: bid(),
    spray_job_id: job.id,
    chemical_id: p.chemical_id,
    chemical_name: p.chemical_name,
    rate: p.rate,
    unit: p.unit,
    custom_unit_label: p.custom_unit_label ?? null,
    total_qty: p.total_qty ?? null,
    total_qty_unit: p.total_qty_unit ?? null,
  }));
  if (productRows.length > 0) {
    const { error } = await supabase.from("spray_job_products").upsert(productRows, { onConflict: "id" });
    if (error) throw error;
  }
  // Delete any products for this job that are no longer in the list (hard delete — child table)
  const keepIds = productRows.map((p) => p.id);
  let delQ = supabase.from("spray_job_products").delete().eq("spray_job_id", job.id).eq("business_id", bid());
  if (keepIds.length > 0) delQ = delQ.not("id", "in", `(${keepIds.map((i) => `"${i}"`).join(",")})`);
  const { error: delErr } = await delQ;
  if (delErr) throw delErr;
}

async function hydrateJobs(jobs: any[]): Promise<SprayJob[]> {
  if (jobs.length === 0) return [];
  const ids = jobs.map((j) => j.id);
  const { data: products, error } = await supabase.from("spray_job_products").select("*").in("spray_job_id", ids);
  if (error) throw error;
  const byJob = new Map<string, SprayJobProduct[]>();
  for (const p of products ?? []) {
    const list = byJob.get(p.spray_job_id) ?? [];
    list.push({
      id: p.id,
      chemical_id: p.chemical_id,
      chemical_name: p.chemical_name ?? "",
      rate: p.rate ?? 0,
      unit: p.unit,
      custom_unit_label: p.custom_unit_label ?? undefined,
      total_qty: p.total_qty ?? undefined,
      total_qty_unit: p.total_qty_unit ?? undefined,
    });
    byJob.set(p.spray_job_id, list);
  }
  return jobs.map((j) => ({ ...j, products: byJob.get(j.id) ?? [] })) as SprayJob[];
}

// ---- Maintenance <-> DB field mapping (maintenance_id <-> schedule_id) ----
function completionToDb(c: MaintenanceCompletion) {
  return {
    id: c.id,
    business_id: bid(),
    schedule_id: c.maintenance_id ?? null,
    machinery_id: c.machinery_id,
    date: c.date,
    hours: c.hours ?? null,
    km: c.km ?? null,
    work_performed: c.work_performed ?? null,
    parts_used: c.parts_used ?? null,
    cost: c.cost ?? null,
    service_provider: c.service_provider ?? null,
    notes: c.notes ?? null,
    created_at: c.created_at,
  };
}
function completionFromDb(row: any): MaintenanceCompletion {
  return {
    id: row.id,
    business_id: row.business_id,
    machinery_id: row.machinery_id,
    maintenance_id: row.schedule_id ?? undefined,
    date: row.date,
    hours: row.hours ?? undefined,
    km: row.km ?? undefined,
    work_performed: row.work_performed ?? undefined,
    parts_used: row.parts_used ?? undefined,
    cost: row.cost ?? undefined,
    service_provider: row.service_provider ?? undefined,
    notes: row.notes ?? undefined,
    created_at: row.created_at,
  };
}

// -----------------------------------------------------------------------------
export const cloudRepo = {
  async getBusiness(): Promise<Business | null> {
    const id = getActiveBusinessId();
    if (!id) return null;
    const { data, error } = await supabase.from("businesses").select("*").eq("id", id).maybeSingle();
    if (error) throw error;
    if (!data) return null;
    return { id: data.id, name: data.name, created_at: data.created_at };
  },
  async setBusiness(_b: Business) { /* no-op in cloud; business row managed via signup */ },

  farms: {
    list: () => listRows<Farm>("farms"),
    active: () => listRows<Farm>("farms", { activeOnly: true }),
    save: (f: Farm) => upsertRow("farms", f),
    remove: (id: string) => softDelete("farms", id),
  },
  paddocks: {
    list: () => listRows<Paddock>("paddocks"),
    active: () => listRows<Paddock>("paddocks", { activeOnly: true }),
    save: (p: Paddock) => upsertRow("paddocks", p),
    remove: (id: string) => softDelete("paddocks", id),
  },
  chemicals: {
    list: () => listRows<Chemical>("chemicals"),
    active: () => listRows<Chemical>("chemicals", { activeOnly: true }),
    save: (c: Chemical) => upsertRow("chemicals", c),
    remove: (id: string) => softDelete("chemicals", id),
    get: async (id: string) => {
      const rows = await listRows<Chemical>("chemicals", { extraEq: [["id", id]] });
      return rows[0] ?? null;
    },
  },
  chemicalBatches: {
    list: () => listRows<ChemicalBatch>("chemical_batches"),
    forChemical: (chemId: string) => listRows<ChemicalBatch>("chemical_batches", { extraEq: [["chemical_id", chemId]] }),
    save: (b: ChemicalBatch) => upsertRow("chemical_batches", b),
    remove: (id: string) => softDelete("chemical_batches", id),
  },
  stockMovements: {
    list: () => listRows<StockMovement>("stock_movements"),
    forChemical: async (chemId: string) => {
      const rows = await listRows<StockMovement>("stock_movements", { extraEq: [["chemical_id", chemId]] });
      return rows.sort((a, b) => b.ts.localeCompare(a.ts));
    },
    save: (m: StockMovement) => upsertRow("stock_movements", m),
  },
  machinery: {
    list: () => listRows<Machinery>("machinery"),
    save: (m: Machinery) => upsertRow("machinery", m),
    remove: (id: string) => softDelete("machinery", id),
    get: async (id: string) => {
      const rows = await listRows<Machinery>("machinery", { extraEq: [["id", id]] });
      return rows[0] ?? null;
    },
  },
  maintenance: {
    list: () => listRows<Maintenance>("maintenance_schedules"),
    forMachine: (machineId: string) => listRows<Maintenance>("maintenance_schedules", { extraEq: [["machinery_id", machineId]] }),
    save: (m: Maintenance) => upsertRow("maintenance_schedules", m),
    remove: (id: string) => softDelete("maintenance_schedules", id),
    get: async (id: string) => {
      const rows = await listRows<Maintenance>("maintenance_schedules", { extraEq: [["id", id]] });
      return rows[0] ?? null;
    },
  },
  maintenanceCompletions: {
    list: async () => (await listRows<any>("maintenance_completions")).map(completionFromDb),
    forMachine: async (machineId: string) => {
      const rows = await listRows<any>("maintenance_completions", { extraEq: [["machinery_id", machineId]] });
      return rows.map(completionFromDb).sort((a, b) => b.date.localeCompare(a.date));
    },
    forMaintenance: async (mnId: string) => {
      const rows = await listRows<any>("maintenance_completions", { extraEq: [["schedule_id", mnId]] });
      return rows.map(completionFromDb).sort((a, b) => b.date.localeCompare(a.date));
    },
    save: async (c: MaintenanceCompletion) => {
      const { error } = await supabase.from("maintenance_completions").upsert(completionToDb(c), { onConflict: "id" });
      if (error) throw error;
    },
    remove: (id: string) => softDelete("maintenance_completions", id),
  },
  sprayJobs: {
    list: async () => hydrateJobs(await listRows<any>("spray_jobs")),
    active: async () => {
      const jobs = await hydrateJobs(await listRows<any>("spray_jobs", { extraEq: [["status", "active"]] }));
      return jobs[0] ?? null;
    },
    completed: async () => hydrateJobs(await listRows<any>("spray_jobs", { extraEq: [["status", "completed"]] })),
    save: saveSprayJob,
    remove: (id: string) => softDelete("spray_jobs", id),
    get: async (id: string) => {
      const rows = await listRows<any>("spray_jobs", { extraEq: [["id", id]] });
      const jobs = await hydrateJobs(rows);
      return jobs[0] ?? null;
    },
  },
  operators: {
    list: () => listRows<Operator>("operators"),
    active: () => listRows<Operator>("operators", { activeOnly: true }),
    defaultUser: async () => {
      const rows = await listRows<Operator>("operators", { activeOnly: true, extraEq: [["is_default_user", true]] });
      return rows[0] ?? null;
    },
    save: (o: Operator) => upsertRow("operators", o),
    remove: (id: string) => softDelete("operators", id),
  },
  links: {
    list: () => listRows<ExternalLink>("external_links"),
    save: (l: ExternalLink) => upsertRow("external_links", l),
    remove: (id: string) => softDelete("external_links", id),
    get: async (id: string) => {
      const rows = await listRows<ExternalLink>("external_links", { extraEq: [["id", id]] });
      return rows[0] ?? null;
    },
    saveAll: async (list: ExternalLink[]) => {
      // Not atomic but acceptable — used only for reorder/initial seed.
      for (const l of list) await upsertRow("external_links", l);
    },
  },

  // Seed / marker no-ops in cloud mode.
  async isSeeded() { return true; },
  async markSeeded() { /* no-op */ },
  async isLinksSeeded() { return true; },
  async markLinksSeeded() { /* no-op */ },
  async clearAll() { /* refuse to wipe cloud from client */ },
};
