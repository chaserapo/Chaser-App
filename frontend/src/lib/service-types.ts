// Common recurring service types for farm machinery, offered as quick-pick
// suggestions when a business sets up a new maintenance schedule for a
// machine. Interval hours are sensible defaults, not fixed rules — always
// editable on the Add Service Type screen.

export type ServiceTypePreset = {
  name: string;
  intervalHours: number;
  icon: string;
};

export const SERVICE_TYPE_PRESETS: ServiceTypePreset[] = [
  { name: "Engine oil & filter", intervalHours: 250, icon: "oil" },
  { name: "Hydraulic oil & filter", intervalHours: 500, icon: "gauge" },
  { name: "Air filter", intervalHours: 250, icon: "air-filter" },
  { name: "Fuel filter(s)", intervalHours: 500, icon: "fuel" },
  { name: "Grease all points", intervalHours: 50, icon: "wrench" },
  { name: "Coolant service", intervalHours: 1000, icon: "water" },
  { name: "Transmission / gearbox oil", intervalHours: 1000, icon: "cog" },
  { name: "Belts & tensioners inspection", intervalHours: 500, icon: "link-variant" },
  { name: "Tyres / tracks inspection", intervalHours: 250, icon: "car-tire-alert" },
  { name: "Battery check", intervalHours: 500, icon: "car-battery" },
];
