import { v4 as uuid } from "uuid";
import { repo } from "./storage";
import { supabase } from "./supabase";
import type { Chemical, SprayJob, StockMovement, StockMovementReason } from "./types";

export const DEFAULT_LOW_STOCK_THRESHOLD = 1;

// A business-wide fallback for chemicals that don't have their own
// low_stock_threshold set, so "warn me when running low" can be a one-off
// setting instead of something every product needs configured.
export async function getDefaultLowStockThreshold(businessId: string): Promise<number> {
  const { data } = await supabase.from("businesses").select("default_low_stock_threshold").eq("id", businessId).maybeSingle();
  return data?.default_low_stock_threshold ?? DEFAULT_LOW_STOCK_THRESHOLD;
}

export async function setDefaultLowStockThreshold(businessId: string, value: number): Promise<void> {
  const { error } = await supabase.from("businesses").update({ default_low_stock_threshold: value }).eq("id", businessId);
  if (error) throw error;
}

export function lowStockThresholdFor(c: Chemical, businessDefault: number): number {
  return c.low_stock_threshold ?? businessDefault;
}

// Parse "20 L", "1000 g", "5 kg", "500 mL" → { size, unit }
export function parsePackSize(s?: string): { size: number; unit: string } | null {
  if (!s) return null;
  const m = s.trim().match(/^([\d.]+)\s*(mL|L|kg|g|ml|l)?/i);
  if (!m) return null;
  const size = parseFloat(m[1]);
  const unit = (m[2] ?? "L").replace(/^ml$/i, "mL").replace(/^l$/i, "L");
  if (isNaN(size) || size <= 0) return null;
  return { size, unit };
}

// Parse the unit a chemical's stock_qty is actually counted in: "L", "kg" (a
// bare physical unit — stock_qty is a literal volume/weight), or "20 L",
// "25 kg" (a sized pack — stock_qty counts how many of that pack you have).
// A bare number defaults to 1 of that unit. Free text with no recognisable
// unit ("packs", "drums") returns null - deliberately not guessed at, since
// silently assuming a size would risk the exact wrong-quantity bug this
// exists to prevent.
export function parseStockUnit(s?: string): { size: number; unit: string } | null {
  if (!s) return null;
  const m = s.trim().match(/^([\d.]+)?\s*(mL|L|kg|g|ml|l)\b/i);
  if (!m) return null;
  const size = m[1] ? parseFloat(m[1]) : 1;
  const unit = m[2].replace(/^ml$/i, "mL").replace(/^l$/i, "L");
  if (isNaN(size) || size <= 0) return null;
  return { size, unit };
}

// Convert quantity between compatible units (mL↔L, g↔kg). Returns null if incompatible.
function convert(amount: number, from: string, to: string): number | null {
  if (from === to) return amount;
  if ((from === "mL" && to === "L") || (from === "L" && to === "mL")) {
    return from === "mL" ? amount / 1000 : amount * 1000;
  }
  if ((from === "g" && to === "kg") || (from === "kg" && to === "g")) {
    return from === "g" ? amount / 1000 : amount * 1000;
  }
  return null;
}

export type DeductionPreview = {
  chemical_id: string;
  chemical_name: string;
  unit_label: string; // what stock_qty is counted in, e.g. "L", "20 L", "packs"
  packs_used: number | null; // null = cannot compute
  before: number;
  after: number;
  warning: boolean; // going below zero
  note?: string;
};

export async function previewDeductions(job: SprayJob): Promise<DeductionPreview[]> {
  const chemMap = new Map<string, Chemical>();
  for (const c of await repo.chemicals.list()) chemMap.set(c.id, c);

  const previews: DeductionPreview[] = [];
  for (const p of job.products) {
    const chem = chemMap.get(p.chemical_id);
    if (!chem) continue;
    const current = chem.stock_qty ?? 0;
    const unitLabel = chem.stock_unit?.trim() || "units";
    const stockUnit = parseStockUnit(chem.stock_unit);
    if (!stockUnit || p.total_qty == null || !p.total_qty_unit) {
      previews.push({
        chemical_id: chem.id, chemical_name: chem.product_name, unit_label: unitLabel,
        packs_used: null, before: current, after: current, warning: false,
        note: "No comparable stock unit — stock unchanged.",
      });
      continue;
    }
    const totalInStockUnit = convert(p.total_qty, p.total_qty_unit, stockUnit.unit);
    if (totalInStockUnit == null) {
      previews.push({
        chemical_id: chem.id, chemical_name: chem.product_name, unit_label: unitLabel,
        packs_used: null, before: current, after: current, warning: false,
        note: `Stock unit "${chem.stock_unit}" not comparable to ${p.total_qty_unit}.`,
      });
      continue;
    }
    const used = totalInStockUnit / stockUnit.size;
    const after = current - used;
    previews.push({
      chemical_id: chem.id, chemical_name: chem.product_name, unit_label: unitLabel,
      packs_used: used, before: current, after, warning: after < 0,
    });
  }
  return previews;
}

export async function applyDeductions(previews: DeductionPreview[], sprayJobId?: string): Promise<void> {
  for (const d of previews) {
    if (d.packs_used == null) continue;
    const chem = await repo.chemicals.get(d.chemical_id);
    if (!chem) continue;
    const current = chem.stock_qty ?? 0;
    const next = Math.round((current - d.packs_used) * 100) / 100;
    await repo.chemicals.save({ ...chem, stock_qty: next });
    const business = chem.business_id;
    const movement: StockMovement = {
      id: uuid(),
      business_id: business,
      chemical_id: chem.id,
      ts: new Date().toISOString(),
      delta: -Math.round(d.packs_used * 100) / 100,
      unit: chem.stock_unit ?? "packs",
      reason: "Spray Job",
      spray_job_id: sprayJobId,
      created_at: new Date().toISOString(),
    };
    await repo.stockMovements.save(movement);
  }
}

export async function recordManualMovement(
  chemicalId: string,
  delta: number,
  reason: StockMovementReason,
  notes?: string,
  stockLineId?: string,
): Promise<void> {
  const chem = await repo.chemicals.get(chemicalId);
  if (!chem) return;
  const current = chem.stock_qty ?? 0;
  const next = Math.round((current + delta) * 100) / 100;
  await repo.chemicals.save({ ...chem, stock_qty: next });

  // When the adjustment is attributed to a specific pack-size line, keep
  // that line's own qty in sync too — this is what makes point-in-time
  // history per pack size possible going forward.
  let lineUnit: string | undefined;
  if (stockLineId) {
    const lines = await repo.chemicalStockLines.forChemical(chemicalId);
    const line = lines.find((l) => l.id === stockLineId);
    if (line) {
      lineUnit = line.pack_size;
      await repo.chemicalStockLines.save({ ...line, qty: Math.round((line.qty + delta) * 100) / 100 });
    }
  }

  const mv: StockMovement = {
    id: uuid(),
    business_id: chem.business_id,
    chemical_id: chem.id,
    stock_line_id: stockLineId ?? null,
    ts: new Date().toISOString(),
    delta: Math.round(delta * 100) / 100,
    unit: lineUnit ?? chem.stock_unit ?? "packs",
    reason,
    notes,
    created_at: new Date().toISOString(),
  };
  await repo.stockMovements.save(mv);
}
