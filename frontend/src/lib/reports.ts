// Pure logic for the cross-job-type Reports screen: date-range presets and
// the hectares/cost/tanks/tonnes roll-ups shown there. No I/O — the screen
// fetches jobs via repo and passes them in.
import { productCost } from "./calculators";
import type { SprayJob, SpreadJob, SeedingJob, HarvestJob, Machinery } from "./types";

export type JobKind = "spray" | "spread" | "seeding" | "harvest";
export type AnyJob = SprayJob | SpreadJob | SeedingJob | HarvestJob;

export const JOB_KIND_LABEL: Record<JobKind, string> = {
  spray: "Spray", spread: "Spread", seeding: "Seeding", harvest: "Harvest",
};

export type RangePreset = "3m" | "6m" | "12m" | "all";
export const RANGE_PRESET_LABEL: Record<RangePreset, string> = {
  "3m": "Last 3 months", "6m": "Last 6 months", "12m": "Last 12 months", all: "All time",
};

// ISO yyyy-mm-dd cutoff for a preset, or null for "all time" (no cutoff).
export function rangeStart(preset: RangePreset): string | null {
  if (preset === "all") return null;
  const months = preset === "3m" ? 3 : preset === "6m" ? 6 : 12;
  const d = new Date();
  d.setMonth(d.getMonth() - months);
  return d.toISOString().slice(0, 10);
}

export function jobArea(j: AnyJob): number {
  return j.actual_area_ha ?? j.area_ha ?? 0;
}

// Sum of productCost() across a job's product lines — spray/spread/seeding
// only. Harvest jobs carry no product/cost data, so always undefined there.
export function jobCost(kind: JobKind, job: AnyJob): number | undefined {
  if (kind === "harvest") return undefined;
  const products = (job as SprayJob | SpreadJob | SeedingJob).products ?? [];
  const costs = products.map(productCost).filter((n): n is number => n != null);
  return costs.length ? costs.reduce((s, n) => s + n, 0) : undefined;
}

// Tanks used = area * water rate / tank capacity. Needs the job's water
// rate and the fitted machine's tank capacity — omitted (not zero) when
// either is missing, rather than guessing.
export function sprayTanksForJob(job: SprayJob, tankCapacityByMachinery: Map<string, number>): number | undefined {
  const tank = job.machinery_id ? tankCapacityByMachinery.get(job.machinery_id) : undefined;
  const area = jobArea(job);
  if (!tank || !job.water_rate || !area) return undefined;
  return (area * job.water_rate) / tank;
}

// Total tonnes = yield (t/ha) * area. Only defined for jobs recorded in
// t/ha — bu/ac jobs need a crop-specific test-weight conversion we don't
// have, so they're left out of the total rather than approximated.
export function harvestTonnesForJob(job: HarvestJob): number | undefined {
  const area = jobArea(job);
  if (job.yield_unit !== "t_ha" || job.yield_value == null || !area) return undefined;
  return job.yield_value * area;
}

export function tankCapacityByMachinery(machinery: Machinery[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const mach of machinery) if (mach.tank_capacity_l) m.set(mach.id, mach.tank_capacity_l);
  return m;
}

export type ReportSummary = {
  count: number;
  totalHa: number;
  totalCost?: number;
  costJobsCount: number;
  extraLabel?: string;
  extraValue?: number;
  extraJobsCount: number;
};

export function summarizeJobs(kind: JobKind, jobs: AnyJob[], tankByMachinery: Map<string, number>): ReportSummary {
  let totalHa = 0;
  let totalCost = 0, costJobsCount = 0;
  let extraValue = 0, extraJobsCount = 0;
  for (const j of jobs) {
    totalHa += jobArea(j);
    const cost = jobCost(kind, j);
    if (cost != null) { totalCost += cost; costJobsCount++; }
    if (kind === "spray") {
      const t = sprayTanksForJob(j as SprayJob, tankByMachinery);
      if (t != null) { extraValue += t; extraJobsCount++; }
    } else if (kind === "harvest") {
      const t = harvestTonnesForJob(j as HarvestJob);
      if (t != null) { extraValue += t; extraJobsCount++; }
    }
  }
  return {
    count: jobs.length,
    totalHa,
    totalCost: costJobsCount > 0 ? totalCost : undefined,
    costJobsCount,
    extraLabel: kind === "spray" ? "Spray tanks used" : kind === "harvest" ? "Tonnes harvested" : undefined,
    extraValue: extraJobsCount > 0 ? extraValue : undefined,
    extraJobsCount,
  };
}

// One short line of type-specific detail for a job row in the list.
export function jobDetailLine(kind: JobKind, j: AnyJob): string {
  switch (kind) {
    case "spray": {
      const s = j as SprayJob;
      return s.target ? `Target: ${s.target}` : "";
    }
    case "harvest": {
      const h = j as HarvestJob;
      return h.yield_value != null ? `${h.yield_value} ${h.yield_unit === "bu_ac" ? "bu/ac" : "t/ha"}` : "";
    }
    case "spread":
    case "seeding":
      return "";
  }
}
