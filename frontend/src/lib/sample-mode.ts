// Sample-data mode for test builds and screenshots.
//
// Enabled only when the build sets EXPO_PUBLIC_SAMPLE_MODE=1 (never in the
// production profile). It skips sign-in, onboarding and the paywall, keeps all
// data on the device (local repo, no Supabase writes) and seeds a small sample
// farm near Merredin WA so weather and DPIRD features have somewhere to show.

import type { Session } from "@supabase/supabase-js";
import { repo } from "./storage";
import type { Chemical, Farm, Machinery, Maintenance, Operator, Paddock, SprayJob } from "./types";

export const SAMPLE_MODE = process.env.EXPO_PUBLIC_SAMPLE_MODE === "1";

const BIZ = "sample-business";
const created_at = "2026-01-01T00:00:00.000Z";

export const SAMPLE_BUSINESS = { id: BIZ, name: "Sample Farm Co", role: "owner" as const, created_at };

export const SAMPLE_SESSION = {
  access_token: "sample",
  refresh_token: "sample",
  token_type: "bearer",
  expires_in: 3600,
  user: { id: "sample-user", email: "sample@chaser.local", app_metadata: {}, user_metadata: {}, aud: "authenticated", created_at },
} as unknown as Session;

const daysAgo = (n: number) => new Date(Date.now() - n * 86400e3).toISOString();

// Seeds once: does nothing if any farm already exists on this device.
export async function seedSampleData() {
  if (!SAMPLE_MODE) return;
  if ((await repo.farms.list()).length) return;

  const farm: Farm = { id: "s-farm", business_id: BIZ, name: "Sample Farm", property_name: "Merredin", region: "Central Wheatbelt, WA", created_at };
  const paddocks: Paddock[] = [
    { id: "s-pad-north", business_id: BIZ, farm_id: farm.id, name: "North Paddock", area_ha: 220, crop: "Wheat", variety: "Scepter", created_at },
    { id: "s-pad-creek", business_id: BIZ, farm_id: farm.id, name: "Creek Paddock", area_ha: 180, crop: "Canola", variety: "HyTTec Trophy", created_at },
    { id: "s-pad-home", business_id: BIZ, farm_id: farm.id, name: "Home Paddock", area_ha: 95, crop: "Barley", variety: "Spartacus CL", created_at },
  ];
  const chemicals: Chemical[] = [
    { id: "s-chem-gly", business_id: BIZ, product_name: "Glyphosate 450", product_type: "Herbicide", active_ingredient: "450 g/L glyphosate", chemical_group: "9", default_rate: 1.5, default_unit: "L/ha", stock_qty: 400, stock_unit: "L", created_at },
    { id: "s-chem-cleth", business_id: BIZ, product_name: "Clethodim 240", product_type: "Herbicide", active_ingredient: "240 g/L clethodim", chemical_group: "1", default_rate: 500, default_unit: "mL/ha", stock_qty: 60, stock_unit: "L", created_at },
    { id: "s-chem-fung", business_id: BIZ, product_name: "Prothioconazole + Tebuconazole", product_type: "Fungicide", chemical_group: "3", default_rate: 300, default_unit: "mL/ha", stock_qty: 40, stock_unit: "L", created_at },
    { id: "s-chem-adj", business_id: BIZ, product_name: "Methylated seed oil", product_type: "Adjuvant", default_rate: 1, default_unit: "%v/v", stock_qty: 100, stock_unit: "L", created_at },
  ];
  const sprayer: Machinery = {
    id: "s-mach-sprayer", business_id: BIZ, name: "36 m self-propelled sprayer", machine_type: "Self-propelled sprayer",
    current_hours: 1840, tank_capacity_l: 6000, boom_width_m: 36, nozzle_spacing_m: 0.5, nozzle_positions: 72,
    default_nozzle: "AIXR 110-03 (Blue)", default_speed_kmh: 18, default_water_rate_lha: 80, created_at,
  } as Machinery;
  const tractor: Machinery = { id: "s-mach-tractor", business_id: BIZ, name: "Seeding tractor", machine_type: "Tractor", current_hours: 3120, created_at } as Machinery;
  const maintenance: Maintenance[] = [
    { id: "s-maint-1", business_id: BIZ, machinery_id: sprayer.id, maintenance_type: "250 hr service", service_interval_hours: 250, last_service_hours: 1600, next_service_hours: 1850, created_at },
    { id: "s-maint-2", business_id: BIZ, machinery_id: tractor.id, maintenance_type: "Engine oil & filters", service_interval_hours: 500, last_service_hours: 3000, next_service_hours: 3500, created_at },
  ];
  const operator: Operator = { id: "s-op", business_id: BIZ, name: "Sam Sample", first_name: "Sam", last_name: "Sample", role: "Owner", is_default_user: true, created_at };
  const jobs: SprayJob[] = [
    {
      id: "s-job-1", business_id: BIZ, status: "completed", date: daysAgo(3).slice(0, 10), created_at: daysAgo(3),
      farm_id: farm.id, farm_name: farm.name, paddock_id: paddocks[0].id, paddock_name: paddocks[0].name, crop: "Wheat", target: "Ryegrass, wild radish",
      operator_id: operator.id, operator: operator.name, machinery_id: sprayer.id, machinery_name: sprayer.name,
      area_ha: 220, actual_area_ha: 218, water_rate: 80, speed_kmh: 18, boom_width_m: 36, nozzle_type: "AIXR 110-03 (Blue)", nozzle_spacing_m: 0.5, pressure: 3,
      temperature_c: 19.5, humidity: 58, delta_t: 4.6, wind_speed: 12, wind_direction: "SE", weather_captured_at: daysAgo(3),
      start_time: daysAgo(3), finish_time: daysAgo(3),
      products: [
        { id: "s-jp-1", chemical_id: "s-chem-gly", chemical_name: "Glyphosate 450", rate: 1.5, unit: "L/ha" },
        { id: "s-jp-2", chemical_id: "s-chem-adj", chemical_name: "Methylated seed oil", rate: 1, unit: "%v/v" },
      ],
    } as SprayJob,
    {
      id: "s-job-2", business_id: BIZ, status: "planned", date: daysAgo(-1).slice(0, 10), created_at: daysAgo(0),
      farm_id: farm.id, farm_name: farm.name, paddock_id: paddocks[1].id, paddock_name: paddocks[1].name, crop: "Canola", target: "Brome grass",
      operator_id: operator.id, operator: operator.name, machinery_id: sprayer.id, machinery_name: sprayer.name,
      area_ha: 180, water_rate: 80, speed_kmh: 18, boom_width_m: 36, nozzle_type: "AIXR 110-03 (Blue)", nozzle_spacing_m: 0.5,
      products: [{ id: "s-jp-3", chemical_id: "s-chem-cleth", chemical_name: "Clethodim 240", rate: 500, unit: "mL/ha" }],
    } as SprayJob,
  ];

  await repo.farms.save(farm);
  for (const p of paddocks) await repo.paddocks.save(p);
  for (const c of chemicals) await repo.chemicals.save(c);
  for (const m of [sprayer, tractor]) await repo.machinery.save(m);
  for (const m of maintenance) await repo.maintenance.save(m);
  await repo.operators.save(operator);
  for (const j of jobs) await repo.sprayJobs.save(j);
}
