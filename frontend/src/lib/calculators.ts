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

export function fmt(n: number, decimals = 2): string {
  if (n == null || isNaN(n) || !isFinite(n)) return "0";
  return Number(n.toFixed(decimals)).toString();
}
