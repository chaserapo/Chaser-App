// One-time migration: uploads the user's existing AsyncStorage data to Supabase
// against a freshly-created business. Retry-safe (upsert on id). AsyncStorage is
// NEVER wiped — it remains as a local backup even after success.

import AsyncStorage from "@react-native-async-storage/async-storage";
import { supabase } from "./supabase";
import { localRepo } from "./storage";
import type {
  Farm, Paddock, Chemical, ChemicalBatch, Machinery, Maintenance,
  MaintenanceCompletion, Operator, SprayJob, StockMovement, ExternalLink,
} from "./types";

export type MigrationProgress = {
  step: string;
  currentTable?: string;
  uploaded: number;
  totalTables: number;
  completedTables: number;
};

const markerKey = (userId: string, businessId: string) => `@hectarehq/migrated-v1:${userId}:${businessId}`;

export async function isMigrated(userId: string, businessId: string): Promise<boolean> {
  return (await AsyncStorage.getItem(markerKey(userId, businessId))) === "true";
}

async function markMigrated(userId: string, businessId: string) {
  await AsyncStorage.setItem(markerKey(userId, businessId), "true");
}

async function upsertBatch(table: string, rows: any[]) {
  if (rows.length === 0) return;
  for (let i = 0; i < rows.length; i += 250) {
    const chunk = rows.slice(i, i + 250);
    // defaultToNull:false tells PostgREST to use column defaults for missing fields
    // instead of substituting nulls when batch rows have different key sets.
    const { error } = await supabase.from(table).upsert(chunk, { onConflict: "id", defaultToNull: false });
    if (error) throw new Error(`${table}: ${error.message}`);
  }
}

function stamp<T extends { created_at?: string }>(row: T, businessId: string): T & { business_id: string; created_at: string } {
  return {
    ...row,
    business_id: businessId,
    created_at: row.created_at ?? new Date().toISOString(),
  } as any;
}

export async function runMigration(
  userId: string,
  businessId: string,
  onProgress?: (p: MigrationProgress) => void,
): Promise<{ tablesMigrated: number; rowsMigrated: number }> {
  // Load every local table first (fast; small volumes)
  const [farms, paddocks, chemicals, chemBatches, stockMoves, machinery, maints, completions, operators, sprayJobs, links] =
    await Promise.all([
      localRepo.farms.list(),
      localRepo.paddocks.list(),
      localRepo.chemicals.list(),
      localRepo.chemicalBatches.list(),
      localRepo.stockMovements.list(),
      localRepo.machinery.list(),
      localRepo.maintenance.list(),
      localRepo.maintenanceCompletions.list(),
      localRepo.operators.list(),
      localRepo.sprayJobs.list(),
      localRepo.links.list(),
    ]);

  const tables: { name: string; table: string; rows: any[] }[] = [
    { name: "Farms", table: "farms", rows: (farms as Farm[]).map((r) => stamp(r, businessId)) },
    { name: "Paddocks", table: "paddocks", rows: (paddocks as Paddock[]).map((r) => stamp(r, businessId)) },
    { name: "Chemicals", table: "chemicals", rows: (chemicals as Chemical[]).map((r) => stamp(r, businessId)) },
    { name: "Chemical batches", table: "chemical_batches", rows: (chemBatches as ChemicalBatch[]).map((r) => stamp(r, businessId)) },
    { name: "Stock movements", table: "stock_movements", rows: (stockMoves as StockMovement[]).map((r) => stamp({ ...r, ts: r.ts ?? new Date().toISOString() }, businessId)) },
    { name: "Machinery", table: "machinery", rows: (machinery as Machinery[]).map((r) => stamp(r, businessId)) },
    { name: "Maintenance schedules", table: "maintenance_schedules", rows: (maints as Maintenance[]).map((r) => stamp(r, businessId)) },
    { name: "Service history", table: "maintenance_completions", rows: (completions as MaintenanceCompletion[]).map((r) => ({
        id: r.id,
        business_id: businessId,
        schedule_id: r.maintenance_id ?? null,
        machinery_id: r.machinery_id,
        date: r.date,
        hours: r.hours ?? null,
        km: r.km ?? null,
        work_performed: r.work_performed ?? null,
        parts_used: r.parts_used ?? null,
        cost: r.cost ?? null,
        service_provider: r.service_provider ?? null,
        notes: r.notes ?? null,
        created_at: r.created_at ?? new Date().toISOString(),
      })) },
    { name: "Operators", table: "operators", rows: (operators as Operator[]).map((r) => stamp(r, businessId)) },
    // Spray jobs: strip products (uploaded separately)
    { name: "Spray jobs", table: "spray_jobs", rows: (sprayJobs as SprayJob[]).map((j) => {
        const { products, ...rest } = j;
        return stamp(rest as any, businessId);
      }) },
    // Spray job products from embedded arrays
    { name: "Spray job products", table: "spray_job_products", rows: (sprayJobs as SprayJob[]).flatMap((j) =>
        (j.products ?? []).map((p) => ({
          id: p.id,
          business_id: businessId,
          spray_job_id: j.id,
          chemical_id: p.chemical_id ?? null,
          chemical_name: p.chemical_name ?? null,
          rate: p.rate ?? null,
          unit: p.unit ?? null,
          custom_unit_label: p.custom_unit_label ?? null,
          total_qty: p.total_qty ?? null,
          total_qty_unit: p.total_qty_unit ?? null,
          created_at: new Date().toISOString(),
        })),
      ) },
    { name: "External links", table: "external_links", rows: (links as ExternalLink[]).map((r) => stamp(r, businessId)) },
  ];

  let totalRows = 0;
  let completedTables = 0;
  for (const t of tables) {
    onProgress?.({ step: `Uploading ${t.name}…`, currentTable: t.name, uploaded: totalRows, totalTables: tables.length, completedTables });
    await upsertBatch(t.table, t.rows);
    totalRows += t.rows.length;
    completedTables += 1;
  }

  await markMigrated(userId, businessId);
  onProgress?.({ step: "Cloud sync active", uploaded: totalRows, totalTables: tables.length, completedTables });
  return { tablesMigrated: tables.length, rowsMigrated: totalRows };
}
