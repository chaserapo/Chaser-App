import { v4 as uuid } from "uuid";
import { repo } from "./storage";
import type { Business, Farm, Paddock, Chemical, Machinery, Maintenance, SprayJob } from "./types";

const nowIso = () => new Date().toISOString();
const daysAgo = (n: number) => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString();
};

export async function seedIfNeeded() {
  if (await repo.isSeeded()) return;

  const business: Business = {
    id: uuid(),
    name: "Riverina Broadacre Co.",
    created_at: nowIso(),
  };
  await repo.setBusiness(business);
  const bid = business.id;

  const farm1: Farm = { id: uuid(), business_id: bid, name: "Home Block", region: "Wagga Wagga, NSW", created_at: nowIso() };
  const farm2: Farm = { id: uuid(), business_id: bid, name: "River Paddocks", region: "Narrandera, NSW", created_at: nowIso() };
  await repo.farms.save(farm1);
  await repo.farms.save(farm2);

  const paddocks: Paddock[] = [
    { id: uuid(), business_id: bid, farm_id: farm1.id, name: "North 40", area_ha: 42, crop: "Wheat", created_at: nowIso() },
    { id: uuid(), business_id: bid, farm_id: farm1.id, name: "South Ridge", area_ha: 68, crop: "Canola", created_at: nowIso() },
    { id: uuid(), business_id: bid, farm_id: farm1.id, name: "Homestead", area_ha: 25, crop: "Barley", created_at: nowIso() },
    { id: uuid(), business_id: bid, farm_id: farm2.id, name: "River Flat", area_ha: 120, crop: "Wheat", created_at: nowIso() },
    { id: uuid(), business_id: bid, farm_id: farm2.id, name: "Boundary", area_ha: 55, crop: "Lupins", created_at: nowIso() },
  ];
  for (const p of paddocks) await repo.paddocks.save(p);

  const chemicals: Chemical[] = [
    {
      id: uuid(), business_id: bid,
      product_name: "Roundup PowerMAX",
      active_ingredient: "Glyphosate 540 g/L (potassium salt)",
      apvma_number: "62506",
      chemical_group: "M (Glycines)",
      formulation: "Soluble concentrate",
      default_rate: 1.5, default_unit: "L/ha",
      pack_size: "20 L", stock_qty: 4,
      label_url: "https://portal.apvma.gov.au/pubcris",
      sds_url: "",
      notes: "Non-selective knockdown herbicide.",
      created_at: nowIso(),
    },
    {
      id: uuid(), business_id: bid,
      product_name: "Estercide Xtra 680",
      active_ingredient: "2,4-D ester 680 g/L",
      apvma_number: "63536",
      chemical_group: "4 (Phenoxy)",
      formulation: "Emulsifiable concentrate",
      default_rate: 700, default_unit: "mL/ha",
      pack_size: "20 L", stock_qty: 2,
      notes: "Broadleaf herbicide. Observe temperature inversions.",
      created_at: nowIso(),
    },
    {
      id: uuid(), business_id: bid,
      product_name: "Axial",
      active_ingredient: "Pinoxaden 100 g/L",
      apvma_number: "63151",
      chemical_group: "1 (ACCase)",
      formulation: "Emulsifiable concentrate",
      default_rate: 300, default_unit: "mL/ha",
      pack_size: "10 L", stock_qty: 1,
      notes: "Selective grass herbicide in wheat & barley.",
      created_at: nowIso(),
    },
    {
      id: uuid(), business_id: bid,
      product_name: "Talstar 250 EC",
      active_ingredient: "Bifenthrin 250 g/L",
      apvma_number: "58207",
      chemical_group: "3A (Pyrethroid)",
      formulation: "Emulsifiable concentrate",
      default_rate: 40, default_unit: "mL/ha",
      pack_size: "5 L", stock_qty: 3,
      notes: "Insecticide for RLEM, aphids.",
      created_at: nowIso(),
    },
    {
      id: uuid(), business_id: bid,
      product_name: "Hasten Spray Adjuvant",
      active_ingredient: "Ethyl and methyl esters 704 g/L",
      apvma_number: "50387",
      chemical_group: "Adjuvant",
      formulation: "Oil",
      default_rate: 1, default_unit: "%v/v",
      pack_size: "20 L", stock_qty: 6,
      notes: "Oil-based adjuvant.",
      created_at: nowIso(),
    },
  ];
  for (const c of chemicals) await repo.chemicals.save(c);

  const m1: Machinery = {
    id: uuid(), business_id: bid,
    name: "Big Rig", make: "John Deere", model: "R4045", year: 2020,
    serial_number: "JD-R4045-8821", registration: "AGRI-01",
    current_hours: 2380, purchase_date: "2020-05-14",
    notes: "Self-propelled sprayer, 36m boom.",
    created_at: nowIso(),
  };
  const m2: Machinery = {
    id: uuid(), business_id: bid,
    name: "Case 340", make: "Case IH", model: "Magnum 340", year: 2018,
    serial_number: "CI-M340-4472", registration: "AGRI-02",
    current_hours: 5210, purchase_date: "2018-08-01",
    notes: "Primary tractor.",
    created_at: nowIso(),
  };
  const m3: Machinery = {
    id: uuid(), business_id: bid,
    name: "Hardi Commander", make: "Hardi", model: "Commander 6600", year: 2016,
    serial_number: "HC-6600-2210",
    current_hours: 1980,
    notes: "Trailing boom sprayer, 30m.",
    created_at: nowIso(),
  };
  for (const m of [m1, m2, m3]) await repo.machinery.save(m);

  const maints: Maintenance[] = [
    {
      id: uuid(), business_id: bid, machinery_id: m1.id,
      maintenance_type: "Engine oil & filter",
      service_interval_hours: 500,
      last_service_hours: 1900, next_service_hours: 2400,
      last_service_date: daysAgo(60), cost: 620,
      parts_used: "Oil filter, 15L SAE 15W-40",
      notes: "Due within 25 hours.",
      created_at: nowIso(),
    },
    {
      id: uuid(), business_id: bid, machinery_id: m2.id,
      maintenance_type: "Transmission service",
      service_interval_hours: 1000,
      last_service_hours: 4200, next_service_hours: 5200,
      last_service_date: daysAgo(180), cost: 1450,
      parts_used: "Trans filter kit, hydraulic oil",
      notes: "Overdue - schedule ASAP.",
      created_at: nowIso(),
    },
    {
      id: uuid(), business_id: bid, machinery_id: m3.id,
      maintenance_type: "Boom nozzle check",
      service_interval_hours: 200,
      last_service_hours: 1900, next_service_hours: 2100,
      last_service_date: daysAgo(20), cost: 180,
      parts_used: "6x AIXR 110-02 tips",
      notes: "",
      created_at: nowIso(),
    },
  ];
  for (const m of maints) await repo.maintenance.save(m);

  const j1: SprayJob = {
    id: uuid(), business_id: bid,
    farm_id: farm1.id, farm_name: farm1.name,
    paddock_id: paddocks[0].id, paddock_name: paddocks[0].name,
    crop: "Wheat", target: "Ryegrass",
    date: daysAgo(3).slice(0, 10),
    start_time: "07:15", finish_time: "10:40",
    operator: "Sam",
    machinery_id: m1.id, machinery_name: m1.name,
    area_ha: 42, water_rate: 80, speed_kmh: 22,
    boom_width_m: 36, nozzle_type: "AIXR 110-02", nozzle_spacing_m: 0.5, pressure: 3.2,
    temperature_c: 18.4, humidity: 62, delta_t: 4.1, wind_speed: 9, wind_direction: "SW",
    weather_captured_at: daysAgo(3),
    notes: "Good conditions.",
    products: [
      { id: uuid(), chemical_id: chemicals[0].id, chemical_name: chemicals[0].product_name, rate: 1.5, unit: "L/ha", total_qty: 63 },
      { id: uuid(), chemical_id: chemicals[4].id, chemical_name: chemicals[4].product_name, rate: 1, unit: "%v/v", total_qty: 33.6 },
    ],
    created_at: daysAgo(3),
  };
  const j2: SprayJob = {
    id: uuid(), business_id: bid,
    farm_id: farm1.id, farm_name: farm1.name,
    paddock_id: paddocks[1].id, paddock_name: paddocks[1].name,
    crop: "Canola", target: "Wild radish",
    date: daysAgo(10).slice(0, 10),
    start_time: "06:00", finish_time: "09:30",
    operator: "Jess",
    machinery_id: m3.id, machinery_name: m3.name,
    area_ha: 68, water_rate: 100, speed_kmh: 18,
    boom_width_m: 30, nozzle_type: "TT 110-03", nozzle_spacing_m: 0.5, pressure: 2.8,
    temperature_c: 15.2, humidity: 71, delta_t: 3.0, wind_speed: 6, wind_direction: "SE",
    weather_captured_at: daysAgo(10),
    notes: "",
    products: [
      { id: uuid(), chemical_id: chemicals[1].id, chemical_name: chemicals[1].product_name, rate: 700, unit: "mL/ha", total_qty: 47600 },
    ],
    created_at: daysAgo(10),
  };
  await repo.sprayJobs.save(j1);
  await repo.sprayJobs.save(j2);

  await repo.markSeeded();
}
