// Curated broadacre nozzle library for Chaser.
// Flow rates use ISO nominal capacities at 3 bar. Pressure windows and application
// metadata are family-specific and should still be checked against the current
// manufacturer chart and the chemical label before spraying.

export type ApplicationGoal = "systemic" | "contact" | "fungicide" | "insecticide" | "drift" | "fertiliser";

export type Nozzle = {
  id: string;
  label: string;
  brand: string;
  family: string;
  iso: string;
  colour: string;
  ratedPressureBar: number;
  ratedFlowLpm: number;
  minPressureBar: number;
  maxPressureBar: number;
  type: string;
  pwmApproved?: boolean;
  goals?: ApplicationGoal[];
  dropletRange?: string;
};

const ISO: Record<string, { colour: string; flow: number }> = {
  "01": { colour: "Orange", flow: 0.39 },
  "015": { colour: "Green", flow: 0.59 },
  "02": { colour: "Yellow", flow: 0.79 },
  "025": { colour: "Lilac", flow: 0.99 },
  "03": { colour: "Blue", flow: 1.18 },
  "04": { colour: "Red", flow: 1.58 },
  "05": { colour: "Brown", flow: 1.97 },
  "06": { colour: "Grey", flow: 2.37 },
  "08": { colour: "White", flow: 3.16 },
  "10": { colour: "Light blue", flow: 3.95 },
};

type Family = {
  key: string;
  brand: string;
  family: string;
  angle: string;
  sizes: string[];
  min: number | ((iso: string) => number);
  max: number;
  type: string;
  pwm?: boolean;
  goals: ApplicationGoal[];
  droplet?: string;
};

const FAMILIES: Family[] = [
  { key: "teejet-aixr", brand: "TeeJet", family: "AIXR", angle: "110", sizes: ["01","015","02","025","03","04","05","06","08"], min: 2, max: 6, type: "Air-induction flat fan", goals: ["systemic","drift"], droplet: "Medium–Ultra Coarse" },
  { key: "teejet-tt", brand: "TeeJet", family: "Turbo TeeJet TT", angle: "110", sizes: ["015","02","025","03","04","05","06"], min: 1, max: 4, type: "Turbo flat fan", pwm: true, goals: ["systemic","contact","fungicide","insecticide"], droplet: "Medium–Very Coarse" },
  { key: "teejet-ttj60", brand: "TeeJet", family: "Turbo TwinJet TTJ60", angle: "110", sizes: ["02","025","03","04","05","06","08","10"], min: 1.4, max: 6.2, type: "Twin flat fan", pwm: true, goals: ["contact","fungicide","insecticide","systemic"], droplet: "Medium–Very Coarse" },
  { key: "teejet-tti60", brand: "TeeJet", family: "TTI TwinJet", angle: "110", sizes: ["02","025","03","04","05","06","08"], min: 1.4, max: 6.9, type: "Air-induction twin flat fan", pwm: true, goals: ["systemic","drift","fertiliser"], droplet: "Coarse–Ultra Coarse" },
  { key: "teejet-aittj60", brand: "TeeJet", family: "Air Induction Turbo TwinJet", angle: "110", sizes: ["02","025","03","04","05","06","08","10"], min: 1.4, max: 6.2, type: "Air-induction twin flat fan", pwm: true, goals: ["systemic","drift","fungicide","insecticide"], droplet: "Medium–Ultra Coarse" },
  { key: "teejet-tj60", brand: "TeeJet", family: "TwinJet TJ60", angle: "110", sizes: ["015","02","025","03","04","05","06"], min: 2.1, max: 4.1, type: "Twin flat fan", pwm: true, goals: ["contact","fungicide","insecticide"], droplet: "Very Fine–Medium" },

  { key: "lechler-idk", brand: "Lechler", family: "IDK", angle: "120", sizes: ["01","015","02","025","03","04","05","06","08","10"], min: (s) => ["01","015","02","025","03"].includes(s) ? 1.5 : 1, max: 6, type: "Air-induction flat fan", goals: ["systemic","drift","fertiliser"], droplet: "Ultra Coarse–Medium" },
  { key: "lechler-idkt", brand: "Lechler", family: "IDKT", angle: "120", sizes: ["02","025","03","04","05","06"], min: 1.5, max: 3, type: "Compact air-induction twin flat fan", goals: ["contact","fungicide","insecticide","systemic"], droplet: "Very Coarse–Medium" },
  { key: "lechler-idta", brand: "Lechler", family: "IDTA", angle: "120", sizes: ["025","03","04","05","06","08"], min: 4, max: 8, type: "Air-induction asymmetric twin flat fan", goals: ["contact","fungicide","insecticide","systemic"], droplet: "Very Coarse–Coarse" },

  { key: "hardi-minidrift", brand: "Hardi", family: "MiniDrift", angle: "110", sizes: ["015","02","025","03","04","05","06","08"], min: 1.5, max: 5, type: "Drift-reduction flat fan", goals: ["systemic","drift"], droplet: "Coarse–Very Coarse" },
  { key: "hardi-injet", brand: "Hardi", family: "INJET", angle: "110", sizes: ["015","02","025","03","04","05","06","08"], min: 3, max: 8, type: "Air-induction flat fan", goals: ["systemic","drift"], droplet: "Very Coarse–Ultra Coarse" },

  { key: "hypro-uld", brand: "Hypro", family: "Ultra Lo-Drift ULD", angle: "120", sizes: ["015","02","025","03","04","05","06","08"], min: 1, max: 8, type: "Air-induction flat fan", goals: ["systemic","drift"], droplet: "Medium–Ultra Coarse" },
  { key: "hypro-guardianair", brand: "Hypro", family: "GuardianAIR", angle: "120", sizes: ["01","015","02","025","03","04","05","06"], min: 1, max: 6, type: "Air-induction flat fan", goals: ["systemic","contact","fungicide","insecticide"], droplet: "Fine–Extremely Coarse" },

  { key: "arag-cfa", brand: "ARAG", family: "CFA", angle: "110", sizes: ["015","02","025","03","04","05","06","08"], min: 1, max: 5, type: "Air-induction flat fan", goals: ["systemic","drift"], droplet: "Coarse–Ultra Coarse" },
];

export const NOZZLES: Nozzle[] = FAMILIES.flatMap((f) => f.sizes.map((iso) => {
  const cap = ISO[iso];
  return {
    id: `${f.key}-${iso}`,
    label: `${f.brand} ${f.family} ${f.angle}-${iso} (${cap.colour})`,
    brand: f.brand,
    family: f.family,
    iso,
    colour: cap.colour,
    ratedPressureBar: 3,
    ratedFlowLpm: cap.flow,
    minPressureBar: typeof f.min === "function" ? f.min(iso) : f.min,
    maxPressureBar: f.max,
    type: f.type,
    pwmApproved: f.pwm ?? false,
    goals: f.goals,
    dropletRange: f.droplet,
  };
}));

export type NozzleCheck = {
  ratedFlowAtRefLpm: number;
  requiredPressureBar: number | null;
  suitability: "good" | "undersized" | "oversized" | "out_of_range";
  message: string;
  tolerancePct: number;
};

export function checkNozzle(nozzle: Nozzle, requiredFlowLpm: number, refPressureBar = 3): NozzleCheck {
  if (requiredFlowLpm <= 0) return { ratedFlowAtRefLpm: nozzle.ratedFlowLpm, requiredPressureBar: null, suitability: "out_of_range", message: "Enter a rate + speed to check.", tolerancePct: 0 };
  const rated = nozzle.ratedFlowLpm;
  const tolerance = ((requiredFlowLpm - rated) / rated) * 100;
  const reqP = nozzle.ratedPressureBar * (requiredFlowLpm / rated) ** 2;
  if (reqP < nozzle.minPressureBar) return { ratedFlowAtRefLpm: rated, requiredPressureBar: reqP, suitability: "oversized", message: `Would need ${reqP.toFixed(2)} bar, below this family's recommended range.`, tolerancePct: tolerance };
  if (reqP > nozzle.maxPressureBar) return { ratedFlowAtRefLpm: rated, requiredPressureBar: reqP, suitability: "undersized", message: `Would need ${reqP.toFixed(2)} bar, above this family's recommended range.`, tolerancePct: tolerance };
  return { ratedFlowAtRefLpm: rated, requiredPressureBar: reqP, suitability: "good", message: `Suitable at about ${reqP.toFixed(2)} bar.`, tolerancePct: tolerance };
}

export function recommendNozzles(requiredFlowLpm: number, goal: ApplicationGoal = "systemic", pwm = false, spot = false, limit = 5) {
  if (requiredFlowLpm <= 0) return [];
  return NOZZLES.map((nozzle) => {
    const check = checkNozzle(nozzle, requiredFlowLpm);
    const inRange = check.requiredPressureBar != null && check.requiredPressureBar >= nozzle.minPressureBar && check.requiredPressureBar <= nozzle.maxPressureBar;
    let score = inRange ? 100 : 0;
    if (nozzle.goals?.includes(goal)) score += 25;
    if (pwm && nozzle.pwmApproved) score += 20;
    if (pwm && !nozzle.pwmApproved) score -= 15;
    if (spot && ["systemic","drift"].includes(goal) && /air-induction|drift/i.test(nozzle.type)) score += 8;
    if (check.requiredPressureBar != null) score -= Math.abs(check.requiredPressureBar - 3) * 3;
    return { nozzle, check, score, inRange };
  }).filter((x) => x.inRange).sort((a, b) => b.score - a.score).slice(0, limit);
}
