// Pure calculation helpers - offline-safe, no side effects.

export function nozzleFlowLpm(
  application_rate_lha: number,
  speed_kmh: number,
  nozzle_spacing_m: number,
): number {
  if (!application_rate_lha || !speed_kmh || !nozzle_spacing_m) return 0;
  return (application_rate_lha * speed_kmh * nozzle_spacing_m) / 600;
}

export function numNozzles(boom_width_m: number, nozzle_spacing_m: number): number {
  if (!boom_width_m || !nozzle_spacing_m) return 0;
  return Math.round(boom_width_m / nozzle_spacing_m);
}

export function totalBoomFlowLpm(nozzleFlow: number, nozzles: number): number {
  return nozzleFlow * nozzles;
}

export function hectaresPerTank(tank_l: number, application_rate_lha: number): number {
  if (!tank_l || !application_rate_lha) return 0;
  return tank_l / application_rate_lha;
}

export function chemicalPerTank(chemical_rate_lha: number, ha_per_tank: number): number {
  return chemical_rate_lha * ha_per_tank;
}

// Delta T from temperature (°C) and relative humidity (%)
// Uses standard psychrometric wet-bulb approximation (Stull 2011).
export function deltaT(temp_c: number, rh: number): number {
  if (temp_c == null || rh == null || isNaN(temp_c) || isNaN(rh)) return 0;
  const T = temp_c;
  const RH = Math.max(0, Math.min(100, rh));
  const Tw =
    T * Math.atan(0.151977 * Math.sqrt(RH + 8.313659)) +
    Math.atan(T + RH) -
    Math.atan(RH - 1.676331) +
    0.00391838 * Math.pow(RH, 1.5) * Math.atan(0.023101 * RH) -
    4.686035;
  return Number((T - Tw).toFixed(1));
}

// Tank mix: given tank size (L), water rate (L/ha), and list of products with rate+unit,
// compute hectares per tank and required amount of each product per full tank.
export type MixProductInput = {
  name: string;
  rate: number;
  unit: string; // L/ha, mL/ha, kg/ha, g/ha, %v/v
};

export type MixProductOutput = MixProductInput & {
  amount: number;
  amount_unit: string;
};

export function tankMix(
  tank_l: number,
  water_rate_lha: number,
  products: MixProductInput[],
): { ha_per_tank: number; products: MixProductOutput[] } {
  const ha_per_tank = water_rate_lha > 0 ? tank_l / water_rate_lha : 0;
  const out: MixProductOutput[] = products.map((p) => {
    let amount = 0;
    let amount_unit = "L";
    switch (p.unit) {
      case "L/ha":
        amount = p.rate * ha_per_tank;
        amount_unit = "L";
        break;
      case "mL/ha":
        amount = p.rate * ha_per_tank;
        amount_unit = "mL";
        break;
      case "kg/ha":
        amount = p.rate * ha_per_tank;
        amount_unit = "kg";
        break;
      case "g/ha":
        amount = p.rate * ha_per_tank;
        amount_unit = "g";
        break;
      case "%v/v":
        amount = (p.rate / 100) * tank_l;
        amount_unit = "L";
        break;
    }
    return { ...p, amount, amount_unit };
  });
  return { ha_per_tank, products: out };
}

// Product-total calculations across all supported rate units, with auto mL→L and g→kg normalisation.
function normalise(amount: number, base: string): { amount: number; unit: string } {
  if (base === "mL" && Math.abs(amount) >= 1000) return { amount: amount / 1000, unit: "L" };
  if (base === "g" && Math.abs(amount) >= 1000) return { amount: amount / 1000, unit: "kg" };
  return { amount, unit: base };
}

export function productTotalForJob(
  rate: number,
  unit: string,
  area_ha: number,
  water_rate_lha: number,
  custom_label?: string,
): { amount: number; unit: string } {
  const sprayVolume = area_ha * water_rate_lha;
  switch (unit) {
    case "L/ha": return normalise(rate * area_ha, "L");
    case "mL/ha": return normalise(rate * area_ha, "mL");
    case "kg/ha": return normalise(rate * area_ha, "kg");
    case "g/ha": return normalise(rate * area_ha, "g");
    case "mL/100 L": return normalise((rate * sprayVolume) / 100, "mL");
    case "L/100 L": return normalise((rate * sprayVolume) / 100, "L");
    case "%v/v": return normalise((rate * sprayVolume) / 100, "L");
    case "Custom": return { amount: rate * area_ha, unit: custom_label ?? "unit" };
    default: return { amount: rate * area_ha, unit: unit.replace("/ha", "") };
  }
}

export function productPerTank(
  rate: number,
  unit: string,
  tank_capacity_l: number,
  water_rate_lha: number,
  custom_label?: string,
): { amount: number; unit: string } {
  const haPerTank = water_rate_lha > 0 ? tank_capacity_l / water_rate_lha : 0;
  switch (unit) {
    case "L/ha": return normalise(rate * haPerTank, "L");
    case "mL/ha": return normalise(rate * haPerTank, "mL");
    case "kg/ha": return normalise(rate * haPerTank, "kg");
    case "g/ha": return normalise(rate * haPerTank, "g");
    case "mL/100 L": return normalise((rate * tank_capacity_l) / 100, "mL");
    case "L/100 L": return normalise((rate * tank_capacity_l) / 100, "L");
    case "%v/v": return normalise((rate * tank_capacity_l) / 100, "L");
    case "Custom": return { amount: rate * haPerTank, unit: custom_label ?? "unit" };
    default: return { amount: rate * haPerTank, unit: unit.replace("/ha", "") };
  }
}

// Cost of one product line in a job, in AUD — or undefined if there's not
// enough to go on. Deliberately omits rather than guesses: total_qty_unit
// (derived from the rate unit, and possibly rescaled by normalise() above —
// e.g. mL -> L past 1000) must match cost_unit (the chemical's stock_unit at
// the moment this product's cost was snapshotted) exactly, or the number
// would silently be off by a unit-conversion factor.
export function productCost(p: { cost_per_unit?: number; total_qty?: number; total_qty_unit?: string; cost_unit?: string }): number | undefined {
  if (p.cost_per_unit == null || p.total_qty == null) return undefined;
  if (p.cost_unit && p.total_qty_unit && p.total_qty_unit !== p.cost_unit) return undefined;
  return p.cost_per_unit * p.total_qty;
}

export function fmt(n: number, decimals = 2): string {
  if (n == null || isNaN(n) || !isFinite(n)) return "0";
  return Number(n.toFixed(decimals)).toString();
}
