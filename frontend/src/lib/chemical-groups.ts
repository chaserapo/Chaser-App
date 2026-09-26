// Mode-of-action (resistance) group picker for the Chemical Register.
//
// ACCURACY CAVEAT — read before trusting this for a real rotation decision:
// this list was assembled from general knowledge of the HRAC (herbicide),
// FRAC (fungicide) and IRAC (insecticide) mode-of-action group systems, plus
// the older Australian letter codes still printed on many local labels. It
// has NOT been verified against current APVMA-registered labels or the
// latest CropLife Australia group tables (no internet access when this was
// written) — group numbers/letters are occasionally renumbered by HRAC/FRAC/
// IRAC, and this list does not cover every active ingredient. Always check
// your product's actual label if you're relying on this for a resistance-
// management decision. "Not sure / Other" is always available so a chemical
// is never unsaveable because its group isn't listed here yet.
//
// Chaser never suggests application rates or agronomic decisions — this
// picker exists purely so the app can flag when you're about to repeat the
// same group on the same paddock across seasons, using data you provide.

import type { ChemicalCategory } from "./types";

export type ChemicalGroupOption = { key: string; label: string };

export const OTHER_GROUP: ChemicalGroupOption = { key: "other", label: "Not sure / Other" };

export const HERBICIDE_GROUPS: ChemicalGroupOption[] = [
  { key: "hrac_1_a", label: "Group 1 / A — ACCase inhibitors (fops, dims)" },
  { key: "hrac_2_b", label: "Group 2 / B — ALS inhibitors (sulfonylureas, imidazolinones)" },
  { key: "hrac_3_d", label: "Group 3 / D — Microtubule inhibitors (trifluralin, dinitroanilines)" },
  { key: "hrac_4_i", label: "Group 4 / I — Synthetic auxins (2,4-D, dicamba, MCPA, picloram)" },
  { key: "hrac_5_c1", label: "Group 5 / C1 — Photosystem II inhibitors, triazines (atrazine, simazine)" },
  { key: "hrac_6_c3", label: "Group 6 / C3 — Photosystem II inhibitors, ureas/amides (diuron, metribuzin)" },
  { key: "hrac_9_m", label: "Group 9 / M — EPSPS inhibitor (glyphosate)" },
  { key: "hrac_10_n", label: "Group 10 / N — Glutamine synthetase inhibitor (glufosinate)" },
  { key: "hrac_12_f1", label: "Group 12 / F1 — Carotenoid biosynthesis inhibitors" },
  { key: "hrac_13_k3", label: "Group 13 — DOXP synthase inhibitors (clomazone)" },
  { key: "hrac_14_e", label: "Group 14 / E — PPO inhibitors (diflufenican, oxyfluorfen)" },
  { key: "hrac_15_k1", label: "Group 15 / K1 — VLCFA inhibitors (metolachlor, pyroxasulfone)" },
  { key: "hrac_22_l", label: "Group 22 / L — Photosystem I inhibitors (paraquat, diquat)" },
  { key: "hrac_27_f2", label: "Group 27 / F2 — HPPD inhibitors" },
  { key: "hrac_29", label: "Group 29 — Cellulose biosynthesis inhibitors" },
  OTHER_GROUP,
];

export const FUNGICIDE_GROUPS: ChemicalGroupOption[] = [
  { key: "frac_1_g1", label: "Group 1 — Benzimidazoles (MBC)" },
  { key: "frac_2_g2", label: "Group 2 — Dicarboximides" },
  { key: "frac_3_g1_dmi", label: "Group 3 — DMI / triazoles (tebuconazole, propiconazole)" },
  { key: "frac_7_g7", label: "Group 7 — SDHI (succinate dehydrogenase inhibitors)" },
  { key: "frac_11_g11", label: "Group 11 — QoI / strobilurins (azoxystrobin, pyraclostrobin)" },
  { key: "frac_m", label: "Group M — Multi-site (mancozeb, chlorothalonil, copper, sulfur)" },
  { key: "frac_4_g4", label: "Group 4 — Phenylamides (metalaxyl)" },
  { key: "frac_9_g9", label: "Group 9 — Anilinopyrimidines" },
  OTHER_GROUP,
];

export const INSECTICIDE_GROUPS: ChemicalGroupOption[] = [
  { key: "irac_1a", label: "Group 1A — Carbamates" },
  { key: "irac_1b", label: "Group 1B — Organophosphates" },
  { key: "irac_3a", label: "Group 3A — Pyrethroids / pyrethrins" },
  { key: "irac_4a", label: "Group 4A — Neonicotinoids" },
  { key: "irac_5", label: "Group 5 — Spinosyns" },
  { key: "irac_6", label: "Group 6 — Avermectins/milbemycins" },
  { key: "irac_11", label: "Group 11 — Bt / microbial disruptors" },
  { key: "irac_15", label: "Group 15 — Benzoylureas (chitin synthesis inhibitors)" },
  { key: "irac_22", label: "Group 22 — Oxadiazines/semicarbazones (indoxacarb)" },
  { key: "irac_28", label: "Group 28 — Diamides" },
  OTHER_GROUP,
];

/** Returns the group list appropriate for a chemical's product type — all three (deduplicated by "Other") if the type is unset or doesn't map to one of them. */
export function groupOptionsFor(type?: ChemicalCategory): ChemicalGroupOption[] {
  switch (type) {
    case "Herbicide": return HERBICIDE_GROUPS;
    case "Fungicide": return FUNGICIDE_GROUPS;
    case "Insecticide": return INSECTICIDE_GROUPS;
    default: {
      const all = [...HERBICIDE_GROUPS, ...FUNGICIDE_GROUPS, ...INSECTICIDE_GROUPS];
      const seen = new Set<string>();
      return all.filter((g) => (seen.has(g.key) ? false : (seen.add(g.key), true)));
    }
  }
}

/** Human label for a stored group key, falling back to the raw key/legacy free text so nothing renders blank. */
export function groupLabel(key?: string): string {
  if (!key) return "—";
  const all = [...HERBICIDE_GROUPS, ...FUNGICIDE_GROUPS, ...INSECTICIDE_GROUPS];
  return all.find((g) => g.key === key)?.label ?? key;
}
