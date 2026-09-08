// Supabase-backed repository matching the shape of localRepo (see storage.ts).
// Every call filters/writes with the active business_id resolved via backend.ts.
// Soft-delete convention: `remove(id)` sets deleted_at=now(); list()/active() filter deleted_at IS NULL.

import { supabase } from "./supabase";
import { getActiveBusinessId } from "./backend";
import { offlineQueue } from "./offline-queue";
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
  const { error } = await supabase.from(table).upsert(payload, { onConflict: "id", defaultToNull: false });
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
  // 1) Always mirror to local shadow FIRST so a crash / network drop can't
  //    lose the farmer's active job or entered spray information.
  const businessId = bid();
  const jobWithBiz: SprayJob = { ...job, business_id: businessId };
  try {
    await offlineQueue.mirror(businessId, jobWithBiz);
  } catch (e) {
    // AsyncStorage should never fail on a real device; swallow so we still try
    // the cloud path.
    console.warn("offline mirror failed", e);
  }

  // 2) Attempt the cloud upsert (job + products).
  try {
    await upsertRow("spray_jobs", stripProducts(jobWithBiz) as any);
    const productRows = (jobWithBiz.products ?? []).map((p) => ({
      id: p.id,
      business_id: businessId,
      spray_job_id: jobWithBiz.id,
      chemical_id: p.chemical_id,
      chemical_name: p.chemical_name,
      rate: p.rate,
      unit: p.unit,
      custom_unit_label: p.custom_unit_label ?? null,
      total_qty: p.total_qty ?? null,
      total_qty_unit: p.total_qty_unit ?? null,
    }));
    if (productRows.length > 0) {
      const { error } = await supabase.from("spray_job_products").upsert(productRows, { onConflict: "id", defaultToNull: false });
      if (error) throw error;
    }
    const keepIds = productRows.map((p) => p.id);
    let delQ = supabase.from("spray_job_products").delete().eq("spray_job_id", jobWithBiz.id).eq("business_id", businessId);
    if (keepIds.length > 0) delQ = delQ.not("id", "in", `(${keepIds.map((i) => `"${i}"`).join(",")})`);
    const { error: delErr } = await delQ;
    if (delErr) throw delErr;

    // 3) Cloud write succeeded — clear the pending flag.
    await offlineQueue.markSynced(businessId, jobWithBiz.id);
  } catch (e) {
    // Cloud write failed — record the error but let the save() call succeed so
    // the UI can move forward. The shadow is still there and will retry on
    // next focus / flush.
    await offlineQueue.markFailed(businessId, jobWithBiz.id, e);
    // Swallow rather than throw: for the beta we prefer the farmer to keep
    // working with cached data over blocking the flow on a network hiccup.
    console.warn("spray job cloud save failed — kept in offline queue", e);
  }
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
    list: async () => {
      const { data, error } = await supabase.rpc("list_paddocks_with_boundary", { p_business_id: bid() });
      if (error) throw error;
      return ((data ?? []) as any[]).map((r) => ({ ...r, boundary: r.boundary_geojson ?? null })) as Paddock[];
    },
    active: async () => {
      const { data, error } = await supabase.rpc("list_paddocks_with_boundary", { p_business_id: bid() });
      if (error) throw error;
      return ((data ?? []) as any[])
        .filter((r) => !r.archived_at && !r.deleted_at)
        .map((r) => ({ ...r, boundary: r.boundary_geojson ?? null })) as Paddock[];
    },
    save: async (p: Paddock) => {
      const { boundary, ...rest } = p as any;
      const payload: any = { ...rest, business_id: bid(), deleted_at: null };
      // Encode boundary as EWKT if provided, or explicit null to clear.
      if (boundary === null) {
        payload.boundary = null;
      } else if (boundary && boundary.type === "Polygon") {
        const ring = boundary.coordinates[0]
          .map((c: number[]) => `${c[0]} ${c[1]}`)
          .join(",");
        payload.boundary = `SRID=4326;POLYGON((${ring}))`;
      }
      const { error } = await supabase.from("paddocks").upsert(payload, { onConflict: "id", defaultToNull: false });
      if (error) throw error;
    },
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
      const { error } = await supabase.from("maintenance_completions").upsert(completionToDb(c), { onConflict: "id", defaultToNull: false });
      if (error) throw error;
    },
    remove: (id: string) => softDelete("maintenance_completions", id),
  },
  sprayJobs: {
    list: async () => {
      try { return await hydrateJobs(await listRows<any>("spray_jobs")); }
      catch (e) {
        console.warn("sprayJobs.list cloud fail, using shadow", e);
        const local = await offlineQueue.findLocalActive(bid());
        return local ? [local] : [];
      }
    },
    active: async () => {
      // Cloud-first, shadow-fallback so a farmer running an active job never
      // loses sight of it during a reception blackspot.
      try {
        const jobs = await hydrateJobs(await listRows<any>("spray_jobs", { extraEq: [["status", "active"]] }));
        if (jobs[0]) return jobs[0];
      } catch (e) {
        console.warn("sprayJobs.active cloud fail, using shadow", e);
      }
      return await offlineQueue.findLocalActive(bid());
    },
    completed: async () => {
      try { return await hydrateJobs(await listRows<any>("spray_jobs", { extraEq: [["status", "completed"]] })); }
      catch (e) { console.warn("sprayJobs.completed cloud fail", e); return []; }
    },
    save: saveSprayJob,
    remove: (id: string) => softDelete("spray_jobs", id),
    get: async (id: string) => {
      try {
        const rows = await listRows<any>("spray_jobs", { extraEq: [["id", id]] });
        const jobs = await hydrateJobs(rows);
        if (jobs[0]) return jobs[0];
      } catch (e) {
        console.warn("sprayJobs.get cloud fail, using shadow", e);
      }
      // Shadow fallback — critical for active jobs when reception drops.
      return await offlineQueue.getShadow(bid(), id);
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

/**
 * Retry any spray jobs that failed to reach Supabase (offline / timeout).
 * Safe to call on app focus / after sign-in. No-op when nothing pending.
 */
export async function flushOfflineSprayJobs(): Promise<{ attempted: number; synced: number }> {
  const businessId = getActiveBusinessId();
  if (!businessId) return { attempted: 0, synced: 0 };
  const pending = await offlineQueue.listPending();
  let synced = 0;
  for (const { business_id, job } of pending) {
    if (business_id !== businessId) continue; // don't touch other business queues
    try {
      // Reuse saveSprayJob so we get identical write semantics (mirror included).
      await saveSprayJob(job);
      if (!(await offlineQueue.isPending(business_id, job.id))) synced += 1;
    } catch (e) {
      console.warn("flushOfflineSprayJobs retry failed", e);
    }
  }
  return { attempted: pending.length, synced };
}
