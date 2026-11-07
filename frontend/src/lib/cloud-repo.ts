// Supabase-backed repository matching the shape of localRepo (see storage.ts).
// Every call filters/writes with the active business_id resolved via backend.ts.
// Soft-delete convention: `remove(id)` sets deleted_at=now(); list()/active() filter deleted_at IS NULL.

import { supabase } from "./supabase";
import { getActiveBusinessId } from "./backend";
import { offlineQueue } from "./offline-queue";
import { seedingOfflineQueue } from "./seeding-offline-queue";
import { harvestOfflineQueue } from "./harvest-offline-queue";
import { spreadOfflineQueue } from "./spread-offline-queue";
import { issuesOfflineQueue } from "./issues-offline-queue";
import type {
  Business, Farm, Paddock, Chemical, ChemicalBatch, ChemicalStockLine, Machinery, Maintenance,
  MaintenanceCompletion, SprayJob, SprayJobProduct, SeedingJob, SeedingJobProduct, HarvestJob,
  SpreadJob, SpreadJobProduct, PreStartInspection, ExternalLink, Operator, StockMovement,
  FarmIssue,
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

// Columns added by migrations a Supabase project may not have run yet. If the
// database rejects one as unknown (PGRST204), the save is retried without it so
// records keep syncing until the migration is applied.
const OPTIONAL_COLUMNS = ["weather_source", "weather_station", "rainfast_hours", "pin_lat", "pin_lon"];

// The business + business_members rows that farms/paddocks/etc. depend on for
// RLS are created moments earlier in the same signup flow (see bootstrapBusiness
// in auth-context.tsx). Very occasionally the just-committed membership row isn't
// yet visible to the very next request — observed in practice as the first
// onboarding insert failing with a row-level security violation, then succeeding
// immediately on an identical retry. Rather than surface that as an error to a
// brand-new user, retry a few times with backoff before giving up; any other
// kind of error still fails immediately.
function isTransientRlsError(error: { code?: string; message?: string }): boolean {
  return error.code === "42501" || /row-level security policy/i.test(error.message ?? "");
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function upsertRow<T extends { id: string }>(table: string, row: T) {
  let payload: any = { ...row, business_id: bid(), deleted_at: null };
  let rlsAttempt = 0;
  for (;;) {
    const { error } = await supabase.from(table).upsert(payload, { onConflict: "id", defaultToNull: false });
    if (!error) return;
    const missing = error.code === "PGRST204" ? OPTIONAL_COLUMNS.find((c) => c in payload && error.message?.includes(`'${c}'`)) : undefined;
    if (missing) {
      const { [missing]: _dropped, ...rest } = payload;
      payload = rest;
      continue;
    }
    if (isTransientRlsError(error) && rlsAttempt < 4) {
      rlsAttempt += 1;
      await sleep(400 * rlsAttempt);
      continue;
    }
    throw error;
  }
}

// pin_lat/pin_lon are newer, additive columns that list_paddocks_with_boundary
// (a hand-authored Supabase function, not tracked in this repo) may predate
// and so not return — fetched separately and merged in by id rather than
// risking a change to that function's definition. Fails soft (paddocks still
// load, just without pin coordinates) if the column migration hasn't run yet.
async function fetchPaddocksWithPins(activeOnly: boolean): Promise<Paddock[]> {
  const { data, error } = await supabase.rpc("list_paddocks_with_boundary", { p_business_id: bid() });
  if (error) throw error;
  let rows = (data ?? []) as any[];
  if (activeOnly) rows = rows.filter((r) => !r.archived_at && !r.deleted_at);
  try {
    const { data: pinRows, error: pinError } = await supabase.from("paddocks").select("id, pin_lat, pin_lon").eq("business_id", bid());
    if (!pinError && pinRows) {
      const pinMap = new Map(pinRows.map((r: any) => [r.id, r]));
      rows = rows.map((r) => {
        const pin = pinMap.get(r.id);
        return pin ? { ...r, pin_lat: pin.pin_lat, pin_lon: pin.pin_lon } : r;
      });
    }
  } catch { /* fail-safe */ }
  return rows.map((r) => ({ ...r, boundary: r.boundary_geojson ?? null })) as Paddock[];
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
      chemical_group: p.chemical_group ?? null,
      cost_per_unit: p.cost_per_unit ?? null,
      cost_unit: p.cost_unit ?? null,
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
      chemical_group: p.chemical_group ?? undefined,
      cost_per_unit: p.cost_per_unit ?? undefined,
      cost_unit: p.cost_unit ?? undefined,
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

// ---- Seeding jobs (job + products join) ----
// Same shape as saveSprayJob/hydrateJobs above, scoped to seeding_jobs /
// seeding_job_products and the seeding offline queue instead.
function stripSeedingProducts(job: SeedingJob): Omit<SeedingJob, "products"> {
  const { products, ...rest } = job;
  return rest;
}

async function saveSeedingJob(job: SeedingJob) {
  const businessId = bid();
  const jobWithBiz: SeedingJob = { ...job, business_id: businessId };
  try {
    await seedingOfflineQueue.mirror(businessId, jobWithBiz);
  } catch (e) {
    console.warn("seeding offline mirror failed", e);
  }

  try {
    await upsertRow("seeding_jobs", stripSeedingProducts(jobWithBiz) as any);
    const productRows = (jobWithBiz.products ?? []).map((p) => ({
      id: p.id,
      business_id: businessId,
      seeding_job_id: jobWithBiz.id,
      chemical_id: p.chemical_id,
      chemical_name: p.chemical_name,
      chemical_group: p.chemical_group ?? null,
      cost_per_unit: p.cost_per_unit ?? null,
      cost_unit: p.cost_unit ?? null,
      rate: p.rate,
      unit: p.unit,
      custom_unit_label: p.custom_unit_label ?? null,
      total_qty: p.total_qty ?? null,
      total_qty_unit: p.total_qty_unit ?? null,
    }));
    if (productRows.length > 0) {
      const { error } = await supabase.from("seeding_job_products").upsert(productRows, { onConflict: "id", defaultToNull: false });
      if (error) throw error;
    }
    const keepIds = productRows.map((p) => p.id);
    let delQ = supabase.from("seeding_job_products").delete().eq("seeding_job_id", jobWithBiz.id).eq("business_id", businessId);
    if (keepIds.length > 0) delQ = delQ.not("id", "in", `(${keepIds.map((i) => `"${i}"`).join(",")})`);
    const { error: delErr } = await delQ;
    if (delErr) throw delErr;

    await seedingOfflineQueue.markSynced(businessId, jobWithBiz.id);
  } catch (e) {
    await seedingOfflineQueue.markFailed(businessId, jobWithBiz.id, e);
    console.warn("seeding job cloud save failed — kept in offline queue", e);
  }
}

async function hydrateSeedingJobs(jobs: any[]): Promise<SeedingJob[]> {
  if (jobs.length === 0) return [];
  const ids = jobs.map((j) => j.id);
  const { data: products, error } = await supabase.from("seeding_job_products").select("*").in("seeding_job_id", ids);
  if (error) throw error;
  const byJob = new Map<string, SeedingJobProduct[]>();
  for (const p of products ?? []) {
    const list = byJob.get(p.seeding_job_id) ?? [];
    list.push({
      id: p.id,
      chemical_id: p.chemical_id,
      chemical_name: p.chemical_name ?? "",
      chemical_group: p.chemical_group ?? undefined,
      cost_per_unit: p.cost_per_unit ?? undefined,
      cost_unit: p.cost_unit ?? undefined,
      rate: p.rate ?? 0,
      unit: p.unit,
      custom_unit_label: p.custom_unit_label ?? undefined,
      total_qty: p.total_qty ?? undefined,
      total_qty_unit: p.total_qty_unit ?? undefined,
    });
    byJob.set(p.seeding_job_id, list);
  }
  return jobs.map((j) => ({ ...j, products: byJob.get(j.id) ?? [] })) as SeedingJob[];
}

// ---- Harvest jobs (flat table, no products child table) ----
async function saveHarvestJob(job: HarvestJob) {
  const businessId = bid();
  const jobWithBiz: HarvestJob = { ...job, business_id: businessId };
  try {
    await harvestOfflineQueue.mirror(businessId, jobWithBiz);
  } catch (e) {
    console.warn("harvest offline mirror failed", e);
  }
  try {
    await upsertRow("harvest_jobs", jobWithBiz as any);
    await harvestOfflineQueue.markSynced(businessId, jobWithBiz.id);
  } catch (e) {
    await harvestOfflineQueue.markFailed(businessId, jobWithBiz.id, e);
    console.warn("harvest job cloud save failed — kept in offline queue", e);
  }
}

// ---- Spread jobs (job + products join) ----
// Same shape as saveSprayJob/hydrateJobs above, scoped to spread_jobs /
// spread_job_products and the spread offline queue instead.
function stripSpreadProducts(job: SpreadJob): Omit<SpreadJob, "products"> {
  const { products, ...rest } = job;
  return rest;
}

async function saveSpreadJob(job: SpreadJob) {
  const businessId = bid();
  const jobWithBiz: SpreadJob = { ...job, business_id: businessId };
  try {
    await spreadOfflineQueue.mirror(businessId, jobWithBiz);
  } catch (e) {
    console.warn("spread offline mirror failed", e);
  }

  try {
    await upsertRow("spread_jobs", stripSpreadProducts(jobWithBiz) as any);
    const productRows = (jobWithBiz.products ?? []).map((p) => ({
      id: p.id,
      business_id: businessId,
      spread_job_id: jobWithBiz.id,
      chemical_id: p.chemical_id,
      chemical_name: p.chemical_name,
      chemical_group: p.chemical_group ?? null,
      cost_per_unit: p.cost_per_unit ?? null,
      cost_unit: p.cost_unit ?? null,
      rate: p.rate,
      unit: p.unit,
      custom_unit_label: p.custom_unit_label ?? null,
      total_qty: p.total_qty ?? null,
      total_qty_unit: p.total_qty_unit ?? null,
    }));
    if (productRows.length > 0) {
      const { error } = await supabase.from("spread_job_products").upsert(productRows, { onConflict: "id", defaultToNull: false });
      if (error) throw error;
    }
    const keepIds = productRows.map((p) => p.id);
    let delQ = supabase.from("spread_job_products").delete().eq("spread_job_id", jobWithBiz.id).eq("business_id", businessId);
    if (keepIds.length > 0) delQ = delQ.not("id", "in", `(${keepIds.map((i) => `"${i}"`).join(",")})`);
    const { error: delErr } = await delQ;
    if (delErr) throw delErr;

    await spreadOfflineQueue.markSynced(businessId, jobWithBiz.id);
  } catch (e) {
    await spreadOfflineQueue.markFailed(businessId, jobWithBiz.id, e);
    console.warn("spread job cloud save failed — kept in offline queue", e);
  }
}

async function hydrateSpreadJobs(jobs: any[]): Promise<SpreadJob[]> {
  if (jobs.length === 0) return [];
  const ids = jobs.map((j) => j.id);
  const { data: products, error } = await supabase.from("spread_job_products").select("*").in("spread_job_id", ids);
  if (error) throw error;
  const byJob = new Map<string, SpreadJobProduct[]>();
  for (const p of products ?? []) {
    const list = byJob.get(p.spread_job_id) ?? [];
    list.push({
      id: p.id,
      chemical_id: p.chemical_id,
      chemical_name: p.chemical_name ?? "",
      chemical_group: p.chemical_group ?? undefined,
      cost_per_unit: p.cost_per_unit ?? undefined,
      cost_unit: p.cost_unit ?? undefined,
      rate: p.rate ?? 0,
      unit: p.unit,
      custom_unit_label: p.custom_unit_label ?? undefined,
      total_qty: p.total_qty ?? undefined,
      total_qty_unit: p.total_qty_unit ?? undefined,
    });
    byJob.set(p.spread_job_id, list);
  }
  return jobs.map((j) => ({ ...j, products: byJob.get(j.id) ?? [] })) as SpreadJob[];
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

// ---- Farm issues (fault/risk reports) ----
async function listFarmIssuesJoined(): Promise<FarmIssue[]> {
  const { data, error } = await supabase
    .from("farm_issues")
    .select("*, farms(name), paddocks(name), machinery(name)")
    .eq("business_id", bid())
    .is("deleted_at", null)
    .order("reported_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as FarmIssue[];
}

async function saveFarmIssue(issue: FarmIssue) {
  const businessId = bid();
  const issueWithBiz: FarmIssue = { ...issue, business_id: businessId };
  try {
    await issuesOfflineQueue.mirror(businessId, issueWithBiz);
  } catch (e) {
    console.warn("issue offline mirror failed", e);
  }
  try {
    const { farms, paddocks, machinery, ...row } = issueWithBiz;
    await upsertRow("farm_issues", row as any);
    await issuesOfflineQueue.markSynced(businessId, issueWithBiz.id);
  } catch (e) {
    await issuesOfflineQueue.markFailed(businessId, issueWithBiz.id, e);
    console.warn("farm issue cloud save failed — kept in offline queue", e);
  }
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
    list: () => fetchPaddocksWithPins(false),
    active: () => fetchPaddocksWithPins(true),
    save: async (p: Paddock) => {
      const { boundary, ...rest } = p as any;
      let payload: any = { ...rest, business_id: bid(), deleted_at: null };
      // Encode boundary as EWKT if provided, or explicit null to clear.
      if (boundary === null) {
        payload.boundary = null;
      } else if (boundary && boundary.type === "Polygon") {
        const ring = boundary.coordinates[0]
          .map((c: number[]) => `${c[0]} ${c[1]}`)
          .join(",");
        payload.boundary = `SRID=4326;POLYGON((${ring}))`;
      }
      let rlsAttempt = 0;
      for (;;) {
        const { error } = await supabase.from("paddocks").upsert(payload, { onConflict: "id", defaultToNull: false });
        if (!error) return;
        const missing = error.code === "PGRST204" ? OPTIONAL_COLUMNS.find((c) => c in payload && error.message?.includes(`'${c}'`)) : undefined;
        if (missing) {
          const { [missing]: _dropped, ...restPayload } = payload;
          payload = restPayload;
          continue;
        }
        if (isTransientRlsError(error) && rlsAttempt < 4) {
          rlsAttempt += 1;
          await sleep(400 * rlsAttempt);
          continue;
        }
        throw error;
      }
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
  chemicalStockLines: {
    list: () => listRows<ChemicalStockLine>("chemical_stock_lines"),
    forChemical: (chemId: string) => listRows<ChemicalStockLine>("chemical_stock_lines", { extraEq: [["chemical_id", chemId]] }),
    save: (l: ChemicalStockLine) => upsertRow("chemical_stock_lines", l),
    remove: (id: string) => softDelete("chemical_stock_lines", id),
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
  prestarts: {
    list: () => listRows<PreStartInspection>("prestart_inspections"),
    forMachine: async (machineId: string) => {
      const rows = await listRows<PreStartInspection>("prestart_inspections", { extraEq: [["machinery_id", machineId]] });
      return rows.sort((a, b) => b.date.localeCompare(a.date));
    },
    save: (p: PreStartInspection) => upsertRow("prestart_inspections", p),
    remove: (id: string) => softDelete("prestart_inspections", id),
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
    planned: async () => {
      try { return await hydrateJobs(await listRows<any>("spray_jobs", { extraEq: [["status", "planned"]] })); }
      catch (e) { console.warn("sprayJobs.planned cloud fail", e); return []; }
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
  seedingJobs: {
    list: async () => {
      try { return await hydrateSeedingJobs(await listRows<any>("seeding_jobs")); }
      catch (e) {
        console.warn("seedingJobs.list cloud fail, using shadow", e);
        const local = await seedingOfflineQueue.findLocalActive(bid());
        return local ? [local] : [];
      }
    },
    active: async () => {
      try {
        const jobs = await hydrateSeedingJobs(await listRows<any>("seeding_jobs", { extraEq: [["status", "active"]] }));
        if (jobs[0]) return jobs[0];
      } catch (e) {
        console.warn("seedingJobs.active cloud fail, using shadow", e);
      }
      return await seedingOfflineQueue.findLocalActive(bid());
    },
    completed: async () => {
      try { return await hydrateSeedingJobs(await listRows<any>("seeding_jobs", { extraEq: [["status", "completed"]] })); }
      catch (e) { console.warn("seedingJobs.completed cloud fail", e); return []; }
    },
    planned: async () => {
      try { return await hydrateSeedingJobs(await listRows<any>("seeding_jobs", { extraEq: [["status", "planned"]] })); }
      catch (e) { console.warn("seedingJobs.planned cloud fail", e); return []; }
    },
    save: saveSeedingJob,
    remove: (id: string) => softDelete("seeding_jobs", id),
    get: async (id: string) => {
      try {
        const rows = await listRows<any>("seeding_jobs", { extraEq: [["id", id]] });
        const jobs = await hydrateSeedingJobs(rows);
        if (jobs[0]) return jobs[0];
      } catch (e) {
        console.warn("seedingJobs.get cloud fail, using shadow", e);
      }
      return await seedingOfflineQueue.getShadow(bid(), id);
    },
  },
  harvestJobs: {
    list: async () => {
      try { return await listRows<HarvestJob>("harvest_jobs"); }
      catch (e) {
        console.warn("harvestJobs.list cloud fail, using shadow", e);
        const local = await harvestOfflineQueue.findLocalActive(bid());
        return local ? [local] : [];
      }
    },
    active: async () => {
      try {
        const jobs = await listRows<HarvestJob>("harvest_jobs", { extraEq: [["status", "active"]] });
        if (jobs[0]) return jobs[0];
      } catch (e) {
        console.warn("harvestJobs.active cloud fail, using shadow", e);
      }
      return await harvestOfflineQueue.findLocalActive(bid());
    },
    completed: async () => {
      try { return await listRows<HarvestJob>("harvest_jobs", { extraEq: [["status", "completed"]] }); }
      catch (e) { console.warn("harvestJobs.completed cloud fail", e); return []; }
    },
    planned: async () => {
      try { return await listRows<HarvestJob>("harvest_jobs", { extraEq: [["status", "planned"]] }); }
      catch (e) { console.warn("harvestJobs.planned cloud fail", e); return []; }
    },
    save: saveHarvestJob,
    remove: (id: string) => softDelete("harvest_jobs", id),
    get: async (id: string) => {
      try {
        const rows = await listRows<HarvestJob>("harvest_jobs", { extraEq: [["id", id]] });
        if (rows[0]) return rows[0];
      } catch (e) {
        console.warn("harvestJobs.get cloud fail, using shadow", e);
      }
      return await harvestOfflineQueue.getShadow(bid(), id);
    },
  },
  spreadJobs: {
    list: async () => {
      try { return await hydrateSpreadJobs(await listRows<any>("spread_jobs")); }
      catch (e) {
        console.warn("spreadJobs.list cloud fail, using shadow", e);
        const local = await spreadOfflineQueue.findLocalActive(bid());
        return local ? [local] : [];
      }
    },
    active: async () => {
      try {
        const jobs = await hydrateSpreadJobs(await listRows<any>("spread_jobs", { extraEq: [["status", "active"]] }));
        if (jobs[0]) return jobs[0];
      } catch (e) {
        console.warn("spreadJobs.active cloud fail, using shadow", e);
      }
      return await spreadOfflineQueue.findLocalActive(bid());
    },
    completed: async () => {
      try { return await hydrateSpreadJobs(await listRows<any>("spread_jobs", { extraEq: [["status", "completed"]] })); }
      catch (e) { console.warn("spreadJobs.completed cloud fail", e); return []; }
    },
    planned: async () => {
      try { return await hydrateSpreadJobs(await listRows<any>("spread_jobs", { extraEq: [["status", "planned"]] })); }
      catch (e) { console.warn("spreadJobs.planned cloud fail", e); return []; }
    },
    save: saveSpreadJob,
    remove: (id: string) => softDelete("spread_jobs", id),
    get: async (id: string) => {
      try {
        const rows = await listRows<any>("spread_jobs", { extraEq: [["id", id]] });
        const jobs = await hydrateSpreadJobs(rows);
        if (jobs[0]) return jobs[0];
      } catch (e) {
        console.warn("spreadJobs.get cloud fail, using shadow", e);
      }
      return await spreadOfflineQueue.getShadow(bid(), id);
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
  farmIssues: {
    list: async () => {
      try { return await listFarmIssuesJoined(); }
      catch (e) {
        console.warn("farmIssues.list cloud fail, using local shadow", e);
        return await issuesOfflineQueue.listLocal(bid());
      }
    },
    save: saveFarmIssue,
    remove: (id: string) => softDelete("farm_issues", id),
    get: async (id: string) => {
      try {
        const rows = await listRows<FarmIssue>("farm_issues", { extraEq: [["id", id]] });
        if (rows[0]) return rows[0];
      } catch (e) {
        console.warn("farmIssues.get cloud fail, using shadow", e);
      }
      const local = await issuesOfflineQueue.listLocal(bid());
      return local.find((i) => i.id === id) ?? null;
    },
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

/**
 * Retry any seeding jobs that failed to reach Supabase (offline / timeout).
 * Safe to call on app focus / after sign-in. No-op when nothing pending.
 */
export async function flushOfflineSeedingJobs(): Promise<{ attempted: number; synced: number }> {
  const businessId = getActiveBusinessId();
  if (!businessId) return { attempted: 0, synced: 0 };
  const pending = await seedingOfflineQueue.listPending();
  let synced = 0;
  for (const { business_id, job } of pending) {
    if (business_id !== businessId) continue;
    try {
      await saveSeedingJob(job);
      if (!(await seedingOfflineQueue.isPending(business_id, job.id))) synced += 1;
    } catch (e) {
      console.warn("flushOfflineSeedingJobs retry failed", e);
    }
  }
  return { attempted: pending.length, synced };
}

/**
 * Retry any harvest jobs that failed to reach Supabase (offline / timeout).
 * Safe to call on app focus / after sign-in. No-op when nothing pending.
 */
export async function flushOfflineHarvestJobs(): Promise<{ attempted: number; synced: number }> {
  const businessId = getActiveBusinessId();
  if (!businessId) return { attempted: 0, synced: 0 };
  const pending = await harvestOfflineQueue.listPending();
  let synced = 0;
  for (const { business_id, job } of pending) {
    if (business_id !== businessId) continue;
    try {
      await saveHarvestJob(job);
      if (!(await harvestOfflineQueue.isPending(business_id, job.id))) synced += 1;
    } catch (e) {
      console.warn("flushOfflineHarvestJobs retry failed", e);
    }
  }
  return { attempted: pending.length, synced };
}

/**
 * Retry any spread jobs that failed to reach Supabase (offline / timeout).
 * Safe to call on app focus / after sign-in. No-op when nothing pending.
 */
export async function flushOfflineSpreadJobs(): Promise<{ attempted: number; synced: number }> {
  const businessId = getActiveBusinessId();
  if (!businessId) return { attempted: 0, synced: 0 };
  const pending = await spreadOfflineQueue.listPending();
  let synced = 0;
  for (const { business_id, job } of pending) {
    if (business_id !== businessId) continue;
    try {
      await saveSpreadJob(job);
      if (!(await spreadOfflineQueue.isPending(business_id, job.id))) synced += 1;
    } catch (e) {
      console.warn("flushOfflineSpreadJobs retry failed", e);
    }
  }
  return { attempted: pending.length, synced };
}

/**
 * Retry any farm_issues (fault/risk reports) that failed to reach Supabase.
 * Safe to call on app focus / after sign-in. No-op when nothing pending.
 */
export async function flushOfflineIssues(): Promise<{ attempted: number; synced: number }> {
  const businessId = getActiveBusinessId();
  if (!businessId) return { attempted: 0, synced: 0 };
  const pending = await issuesOfflineQueue.listPending();
  let synced = 0;
  for (const { business_id, issue } of pending) {
    if (business_id !== businessId) continue;
    try {
      await saveFarmIssue(issue);
      const stillPending = (await issuesOfflineQueue.listPending()).some((p) => p.issue.id === issue.id);
      if (!stillPending) synced += 1;
    } catch (e) {
      console.warn("flushOfflineIssues retry failed", e);
    }
  }
  return { attempted: pending.length, synced };
}
