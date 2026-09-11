// Curated list of common broadacre nozzle tips (AU market).
//
// Each entry captures the ISO-04-style colour code and its rated flow at
// the reference pressure (usually 3 bar). Chaser uses this to check whether
// a required flow rate is within the nozzle's operating window and, if not,
// suggests the pressure the operator would need to run at instead.
//
// Flow scales with sqrt(pressure) — Q₂ = Q₁ · √(P₂ / P₁).

export type Nozzle = {
  id: string;
  label: string;             // "TeeJet AIXR 110-02 (Yellow)"
  brand: string;             // "TeeJet" | "ARAG" | "Hardi" | "Lechler" | "Wilger"
  iso: string;               // "02" | "03" | "04" | "05" | "06" | "08"
  colour: string;            // "Yellow"
  ratedPressureBar: number;  // 3
  ratedFlowLpm: number;      // 0.79 L/min
  minPressureBar: number;    // 1
  maxPressureBar: number;    // 5 (nozzle-dependent)
  type: string;              // "Air-induction" | "Flat fan" | "TurboTee" | "Drift-reduction"
};

// Reference: TeeJet AIXR / TT / XR nozzle catalogue (2024 AU editions) and
// ARAG CFA range. Flow rates in L/min at 3 bar.
export const NOZZLES: Nozzle[] = [
  { id: "teejet-aixr-01",  label: "TeeJet AIXR 110-01 (Orange)", brand: "TeeJet", iso: "01", colour: "Orange", ratedPressureBar: 3, ratedFlowLpm: 0.39, minPressureBar: 2, maxPressureBar: 6, type: "Air-induction" },
  { id: "teejet-aixr-015", label: "TeeJet AIXR 110-015 (Green)", brand: "TeeJet", iso: "015", colour: "Green", ratedPressureBar: 3, ratedFlowLpm: 0.59, minPressureBar: 2, maxPressureBar: 6, type: "Air-induction" },
  { id: "teejet-aixr-02",  label: "TeeJet AIXR 110-02 (Yellow)", brand: "TeeJet", iso: "02", colour: "Yellow", ratedPressureBar: 3, ratedFlowLpm: 0.79, minPressureBar: 2, maxPressureBar: 6, type: "Air-induction" },
  { id: "teejet-aixr-025", label: "TeeJet AIXR 110-025 (Lilac)", brand: "TeeJet", iso: "025", colour: "Lilac", ratedPressureBar: 3, ratedFlowLpm: 0.99, minPressureBar: 2, maxPressureBar: 6, type: "Air-induction" },
  { id: "teejet-aixr-03",  label: "TeeJet AIXR 110-03 (Blue)",   brand: "TeeJet", iso: "03", colour: "Blue",   ratedPressureBar: 3, ratedFlowLpm: 1.18, minPressureBar: 2, maxPressureBar: 6, type: "Air-induction" },
  { id: "teejet-aixr-04",  label: "TeeJet AIXR 110-04 (Red)",    brand: "TeeJet", iso: "04", colour: "Red",    ratedPressureBar: 3, ratedFlowLpm: 1.58, minPressureBar: 2, maxPressureBar: 6, type: "Air-induction" },
  { id: "teejet-aixr-05",  label: "TeeJet AIXR 110-05 (Brown)",  brand: "TeeJet", iso: "05", colour: "Brown",  ratedPressureBar: 3, ratedFlowLpm: 1.97, minPressureBar: 2, maxPressureBar: 6, type: "Air-induction" },
  { id: "teejet-aixr-06",  label: "TeeJet AIXR 110-06 (Grey)",   brand: "TeeJet", iso: "06", colour: "Grey",   ratedPressureBar: 3, ratedFlowLpm: 2.37, minPressureBar: 2, maxPressureBar: 6, type: "Air-induction" },
  { id: "teejet-aixr-08",  label: "TeeJet AIXR 110-08 (White)",  brand: "TeeJet", iso: "08", colour: "White",  ratedPressureBar: 3, ratedFlowLpm: 3.16, minPressureBar: 2, maxPressureBar: 6, type: "Air-induction" },
  { id: "teejet-tt-02",    label: "TeeJet TT 110-02 (Yellow)",   brand: "TeeJet", iso: "02", colour: "Yellow", ratedPressureBar: 3, ratedFlowLpm: 0.79, minPressureBar: 1, maxPressureBar: 4, type: "TurboTee flat fan" },
  { id: "teejet-tt-03",    label: "TeeJet TT 110-03 (Blue)",     brand: "TeeJet", iso: "03", colour: "Blue",   ratedPressureBar: 3, ratedFlowLpm: 1.18, minPressureBar: 1, maxPressureBar: 4, type: "TurboTee flat fan" },
  { id: "teejet-tt-04",    label: "TeeJet TT 110-04 (Red)",      brand: "TeeJet", iso: "04", colour: "Red",    ratedPressureBar: 3, ratedFlowLpm: 1.58, minPressureBar: 1, maxPressureBar: 4, type: "TurboTee flat fan" },
  { id: "arag-cfa-02",     label: "ARAG CFA 110-02 (Yellow)",    brand: "ARAG",   iso: "02", colour: "Yellow", ratedPressureBar: 3, ratedFlowLpm: 0.80, minPressureBar: 1, maxPressureBar: 5, type: "Air-induction" },
  { id: "arag-cfa-03",     label: "ARAG CFA 110-03 (Blue)",      brand: "ARAG",   iso: "03", colour: "Blue",   ratedPressureBar: 3, ratedFlowLpm: 1.20, minPressureBar: 1, maxPressureBar: 5, type: "Air-induction" },
  { id: "arag-cfa-04",     label: "ARAG CFA 110-04 (Red)",       brand: "ARAG",   iso: "04", colour: "Red",    ratedPressureBar: 3, ratedFlowLpm: 1.60, minPressureBar: 1, maxPressureBar: 5, type: "Air-induction" },
  { id: "arag-cfa-05",     label: "ARAG CFA 110-05 (Brown)",     brand: "ARAG",   iso: "05", colour: "Brown",  ratedPressureBar: 3, ratedFlowLpm: 2.00, minPressureBar: 1, maxPressureBar: 5, type: "Air-induction" },
  { id: "hardi-minidrift-02", label: "Hardi MiniDrift 02 (Yellow)", brand: "Hardi",   iso: "02", colour: "Yellow", ratedPressureBar: 3, ratedFlowLpm: 0.79, minPressureBar: 1.5, maxPressureBar: 5, type: "Drift-reduction" },
  { id: "hardi-minidrift-03", label: "Hardi MiniDrift 03 (Blue)",   brand: "Hardi",   iso: "03", colour: "Blue",   ratedPressureBar: 3, ratedFlowLpm: 1.18, minPressureBar: 1.5, maxPressureBar: 5, type: "Drift-reduction" },
  { id: "hardi-minidrift-04", label: "Hardi MiniDrift 04 (Red)",    brand: "Hardi",   iso: "04", colour: "Red",    ratedPressureBar: 3, ratedFlowLpm: 1.58, minPressureBar: 1.5, maxPressureBar: 5, type: "Drift-reduction" },
];

/**
 * Given a required flow rate (L/min per nozzle), compute:
 *   - actual flow at the nozzle's rated pressure
 *   - the pressure the nozzle would need to run at to hit the required flow
 *   - a suitability verdict
 * Flow scales as sqrt(pressure): P₂ = P₁ · (Q₂/Q₁)²
 */
export type NozzleCheck = {
  ratedFlowAtRefLpm: number;
  requiredPressureBar: number | null;
  suitability: "good" | "undersized" | "oversized" | "out_of_range";
  message: string;
  tolerancePct: number; // how far off the rated flow is, +/- percent
};

export function checkNozzle(nozzle: Nozzle, requiredFlowLpm: number, refPressureBar = 3): NozzleCheck {
  if (requiredFlowLpm <= 0) {
    return { ratedFlowAtRefLpm: nozzle.ratedFlowLpm, requiredPressureBar: null, suitability: "out_of_range", message: "Enter a rate + speed to check.", tolerancePct: 0 };
  }
  const rated = nozzle.ratedFlowLpm;
  const tolerance = ((requiredFlowLpm - rated) / rated) * 100;
  // Required pressure to match Q_required with this nozzle:
  const reqP = nozzle.ratedPressureBar * (requiredFlowLpm / rated) ** 2;

  let suitability: NozzleCheck["suitability"];
  let message: string;

  if (reqP < nozzle.minPressureBar) {
    suitability = "oversized";
    message = `Nozzle is oversized — would need ${reqP.toFixed(2)} bar which is below its ${nozzle.minPressureBar} bar minimum. Choose a smaller (lower ISO) nozzle.`;
  } else if (reqP > nozzle.maxPressureBar) {
    suitability = "undersized";
    message = `Nozzle is undersized — would need ${reqP.toFixed(2)} bar which is above its ${nozzle.maxPressureBar} bar maximum. Choose a bigger (higher ISO) nozzle.`;
  } else if (Math.abs(tolerance) <= 5) {
    suitability = "good";
    message = `Well matched — runs almost at rated ${refPressureBar} bar.`;
  } else if (tolerance < 0) {
    suitability = "oversized";
    message = `Slightly oversized — would run at ${reqP.toFixed(2)} bar (below the ${refPressureBar} bar reference).`;
  } else {
    suitability = "undersized";
    message = `Slightly undersized — would need ${reqP.toFixed(2)} bar to deliver the required flow.`;
  }
  return { ratedFlowAtRefLpm: rated, requiredPressureBar: reqP, suitability, message, tolerancePct: tolerance };
}
