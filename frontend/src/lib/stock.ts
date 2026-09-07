import { v4 as uuid } from "uuid";
import { repo } from "./storage";
import type { Chemical, SprayJob, StockMovement, StockMovementReason } from "./types";

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
    const pack = parsePackSize(chem.pack_size);
    if (!pack || p.total_qty == null || !p.total_qty_unit) {
      previews.push({
        chemical_id: chem.id, chemical_name: chem.product_name,
        packs_used: null, before: current, after: current, warning: false,
        note: "No comparable pack size — stock unchanged.",
      });
      continue;
    }
    const totalInPackUnit = convert(p.total_qty, p.total_qty_unit, pack.unit);
    if (totalInPackUnit == null) {
      previews.push({
        chemical_id: chem.id, chemical_name: chem.product_name,
        packs_used: null, before: current, after: current, warning: false,
        note: `Pack "${chem.pack_size}" not comparable to ${p.total_qty_unit}.`,
      });
      continue;
    }
    const packs = totalInPackUnit / pack.size;
    const after = current - packs;
    previews.push({
      chemical_id: chem.id, chemical_name: chem.product_name,
      packs_used: packs, before: current, after, warning: after < 0,
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
): Promise<void> {
  const chem = await repo.chemicals.get(chemicalId);
  if (!chem) return;
  const current = chem.stock_qty ?? 0;
  const next = Math.round((current + delta) * 100) / 100;
  await repo.chemicals.save({ ...chem, stock_qty: next });
  const mv: StockMovement = {
    id: uuid(),
    business_id: chem.business_id,
    chemical_id: chem.id,
    ts: new Date().toISOString(),
    delta: Math.round(delta * 100) / 100,
    unit: chem.stock_unit ?? "packs",
    reason,
    notes,
    created_at: new Date().toISOString(),
  };
  await repo.stockMovements.save(mv);
}
