// Standard tractor / broadacre-machinery pre-start checklist. Grouped the
// way a paper pre-start pad typically is, covering what's commonly required
// across WHS/farm-safety pre-operational checks. Editable per item by the
// operator on the day (Fail/N-A + a note) — this is the starting template,
// not a fixed audit form.

export type PreStartChecklistItemDef = { key: string; label: string };
export type PreStartChecklistSection = { title: string; items: PreStartChecklistItemDef[] };

export const PRESTART_CHECKLIST: PreStartChecklistSection[] = [
  {
    title: "Fluids & Engine",
    items: [
      { key: "engine_oil", label: "Engine oil level" },
      { key: "coolant", label: "Coolant level" },
      { key: "fuel_water", label: "Fuel level / water trap drained" },
      { key: "hydraulic_oil", label: "Hydraulic oil level" },
    ],
  },
  {
    title: "Tyres & Wheels",
    items: [
      { key: "tyre_condition", label: "Tyre condition & pressure" },
      { key: "wheel_nuts", label: "Wheel nuts / bolts secure" },
    ],
  },
  {
    title: "Safety Equipment",
    items: [
      { key: "seatbelt", label: "Seatbelt condition" },
      { key: "rops_cab", label: "ROPS / cab structure intact" },
      { key: "lights", label: "Lights & indicators" },
      { key: "reverse_alarm", label: "Reverse alarm / horn" },
      { key: "mirrors", label: "Mirrors clean & adjusted" },
      { key: "fire_ext", label: "Fire extinguisher present & charged" },
      { key: "first_aid", label: "First aid kit present" },
    ],
  },
  {
    title: "Mechanical & Controls",
    items: [
      { key: "brakes", label: "Park & service brakes" },
      { key: "steering", label: "Steering" },
      { key: "pto_guard", label: "PTO guard fitted" },
      { key: "belts_hoses", label: "Belts, hoses & visible leaks" },
      { key: "battery", label: "Battery & terminals" },
      { key: "air_filter", label: "Air filter / intake" },
    ],
  },
  {
    title: "Attachments & Implements",
    items: [
      { key: "hitch_pins", label: "Hitch / linkage pins secured" },
      { key: "implement_hyd", label: "Implement hydraulics connected, no leaks" },
    ],
  },
  {
    title: "General",
    items: [
      { key: "walkaround", label: "Walk-around visual check (leaks, damage, loose parts)" },
      { key: "windscreen", label: "Windscreen / windows clean & undamaged" },
    ],
  },
];
