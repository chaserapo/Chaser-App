// Crop growth-stage lookup used by the New Spray Job form and the completed-record view.
// Kept intentionally plain (no external agronomy service) — Chaser never suggests rates
// or timings, we just help the operator label the stage they're spraying at.

export type StageOption = {
  /** Canonical stage id — stored in spray_jobs.crop_stage. */
  id: string;
  /** Human label shown in UI. */
  label: string;
  /** Optional short hint (e.g. Zadoks range) for cereals. */
  hint?: string;
};

const GENERIC: StageOption[] = [
  { id: "pre_emergent",     label: "Pre-emergent" },
  { id: "emergence",        label: "Emergence" },
  { id: "seedling",         label: "Seedling" },
  { id: "vegetative",       label: "Tillering / Vegetative" },
  { id: "stem_elongation",  label: "Stem elongation" },
  { id: "booting",          label: "Booting" },
  { id: "heading",          label: "Heading / Flowering" },
  { id: "grain_fill",       label: "Grain fill / Pod fill" },
  { id: "maturity",         label: "Maturity" },
  { id: "fallow",           label: "Fallow / No crop" },
  { id: "other",            label: "Other" },
];

// Zadoks-based stages for cereals (wheat, barley, oats, triticale, rye).
const CEREALS: StageOption[] = [
  { id: "pre_emergent",     label: "Pre-emergent",           hint: "before Z10" },
  { id: "emergence",        label: "Emergence",               hint: "Z10 – Z11" },
  { id: "seedling",         label: "Seedling",                hint: "Z11 – Z13" },
  { id: "tillering",        label: "Tillering",               hint: "Z20 – Z29" },
  { id: "stem_elongation",  label: "Stem elongation",         hint: "Z30 – Z39" },
  { id: "booting",          label: "Booting",                 hint: "Z40 – Z49" },
  { id: "heading",          label: "Heading / Ear emergence", hint: "Z50 – Z59" },
  { id: "flowering",        label: "Flowering",               hint: "Z60 – Z69" },
  { id: "milk_dough",       label: "Milk / Dough",            hint: "Z70 – Z85" },
  { id: "maturity",         label: "Maturity",                hint: "Z90+" },
  { id: "fallow",           label: "Fallow / No crop" },
  { id: "other",            label: "Other" },
];

// Canola BBCH-inspired.
const CANOLA: StageOption[] = [
  { id: "pre_emergent",   label: "Pre-emergent" },
  { id: "emergence",      label: "Emergence / Cotyledon" },
  { id: "seedling",       label: "Seedling (2–6 leaf)" },
  { id: "rosette",        label: "Rosette" },
  { id: "bolting",        label: "Bolting / Stem elongation" },
  { id: "buds_visible",   label: "Buds visible" },
  { id: "flowering",      label: "Flowering" },
  { id: "pod_fill",       label: "Pod fill" },
  { id: "maturity",       label: "Maturity" },
  { id: "windrow",        label: "Windrow / Swathing" },
  { id: "fallow",         label: "Fallow / No crop" },
  { id: "other",          label: "Other" },
];

// Pulses (chickpeas, lentils, peas, lupins, faba beans).
const PULSES: StageOption[] = [
  { id: "pre_emergent",   label: "Pre-emergent" },
  { id: "emergence",      label: "Emergence" },
  { id: "vegetative",     label: "Vegetative (nodes)" },
  { id: "flowering",      label: "Flowering" },
  { id: "podding",        label: "Podding" },
  { id: "pod_fill",       label: "Pod fill" },
  { id: "maturity",       label: "Maturity" },
  { id: "fallow",         label: "Fallow / No crop" },
  { id: "other",          label: "Other" },
];

// Cotton.
const COTTON: StageOption[] = [
  { id: "pre_emergent",   label: "Pre-emergent" },
  { id: "emergence",      label: "Emergence" },
  { id: "seedling",       label: "Seedling" },
  { id: "squaring",       label: "Squaring" },
  { id: "flowering",      label: "Flowering" },
  { id: "boll_fill",      label: "Boll fill" },
  { id: "cutout",         label: "Cut-out / Maturity" },
  { id: "defoliation",    label: "Defoliation" },
  { id: "fallow",         label: "Fallow / No crop" },
  { id: "other",          label: "Other" },
];

// Sorghum / maize / summer cereals.
const SUMMER_CEREAL: StageOption[] = [
  { id: "pre_emergent",   label: "Pre-emergent" },
  { id: "emergence",      label: "Emergence" },
  { id: "seedling",       label: "Seedling" },
  { id: "vegetative",     label: "Vegetative" },
  { id: "boot",           label: "Boot" },
  { id: "flowering",      label: "Flowering" },
  { id: "grain_fill",     label: "Grain fill" },
  { id: "maturity",       label: "Maturity / Black layer" },
  { id: "fallow",         label: "Fallow / No crop" },
  { id: "other",          label: "Other" },
];

const CROP_MAP: { patterns: RegExp[]; stages: StageOption[]; label: string }[] = [
  { patterns: [/wheat/i, /barley/i, /oats?/i, /rye\b/i, /triticale/i, /cereal/i], stages: CEREALS,       label: "Cereal (Zadoks)" },
  { patterns: [/canola|rapeseed|oilseed rape/i],                                  stages: CANOLA,        label: "Canola" },
  { patterns: [/chickpea|lentil|pea\b|lupin|faba|broad bean|pulse/i],             stages: PULSES,        label: "Pulse" },
  { patterns: [/cotton/i],                                                        stages: COTTON,        label: "Cotton" },
  { patterns: [/sorghum|corn|maize|millet/i],                                     stages: SUMMER_CEREAL, label: "Summer cereal" },
];

/** Return the stage option set best suited to the supplied crop string. */
export function stagesForCrop(crop?: string | null): { stages: StageOption[]; group: string } {
  const c = (crop ?? "").trim();
  if (!c) return { stages: GENERIC, group: "Generic" };
  for (const entry of CROP_MAP) {
    if (entry.patterns.some((r) => r.test(c))) return { stages: entry.stages, group: entry.label };
  }
  return { stages: GENERIC, group: "Generic" };
}

/** Human-friendly label given the stored id + optional custom text. */
export function stageLabel(id?: string | null, custom?: string | null, crop?: string | null): string {
  if (!id && !custom) return "—";
  if (id === "other" || id === "custom") return custom?.trim() ? custom.trim() : "Other";
  if (!id) return custom?.trim() ?? "—";
  const { stages } = stagesForCrop(crop);
  const found = stages.find((s) => s.id === id) ?? GENERIC.find((s) => s.id === id);
  return found ? found.label : id;
}
