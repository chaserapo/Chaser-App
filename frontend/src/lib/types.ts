export type ID = string;

export type Business = {
  id: ID;
  name: string;
  created_at: string;
};

export type Farm = {
  id: ID;
  business_id: ID;
  name: string;
  property_name?: string;
  region?: string;
  address?: string;
  notes?: string;
  archived_at?: string;
  created_at: string;
};

export type Paddock = {
  id: ID;
  business_id: ID;
  farm_id: ID;
  name: string;
  area_ha?: number;
  crop?: string;
  variety?: string;
  notes?: string;
  archived_at?: string;
  created_at: string;
};

export type ChemicalCategory = "Herbicide" | "Fungicide" | "Insecticide" | "Adjuvant" | "Fertiliser" | "Other";
export const CHEMICAL_CATEGORIES: ChemicalCategory[] = ["Herbicide", "Fungicide", "Insecticide", "Adjuvant", "Fertiliser", "Other"];

export type Chemical = {
  id: ID;
  business_id: ID;
  product_name: string;
  product_type?: ChemicalCategory;
  active_ingredient?: string;
  apvma_number?: string;
  chemical_group?: string;
  formulation?: string;
  manufacturer?: string;
  default_rate?: number;
  default_unit?: RateUnit;
  pack_size?: string;
  stock_qty?: number;
  stock_unit?: string;
  storage_location?: string;
  label_url?: string;
  sds_url?: string;
  notes?: string;
  archived_at?: string;
  created_at: string;
};

export type StockMovementReason = "Purchase" | "Usage" | "Spray Job" | "Correction" | "Spill" | "Transfer" | "Other";

export type StockMovement = {
  id: ID;
  business_id: ID;
  chemical_id: ID;
  ts: string;
  delta: number; // positive added, negative removed
  unit?: string;
  reason: StockMovementReason;
  spray_job_id?: ID;
  notes?: string;
  created_at: string;
};

export type ChemicalBatch = {
  id: ID;
  business_id: ID;
  chemical_id: ID;
  batch_number?: string;
  quantity?: number;
  unit?: string;
  purchase_date?: string;
  expiry_date?: string;
  notes?: string;
  created_at: string;
};

export type Operator = {
  id: ID;
  business_id: ID;
  name: string;
  is_default_user?: boolean;
  archived_at?: string;
  created_at: string;
};

export type Machinery = {
  id: ID;
  business_id: ID;
  name: string;
  make?: string;
  model?: string;
  year?: number;
  serial_number?: string;
  registration?: string;
  current_hours?: number;
  purchase_date?: string;
  notes?: string;
  tank_capacity_l?: number;
  boom_width_m?: number;
  nozzle_spacing_m?: number;
  nozzle_positions?: number;
  default_nozzle?: string;
  default_speed_kmh?: number;
  default_water_rate_lha?: number;
  created_at: string;
};

export type MaintenanceStatus = "good" | "due_soon" | "overdue";

export type Maintenance = {
  id: ID;
  business_id: ID;
  machinery_id: ID;
  maintenance_type: string;
  service_interval_hours?: number;
  last_service_hours?: number;
  next_service_hours?: number;
  last_service_date?: string;
  cost?: number;
  parts_used?: string;
  notes?: string;
  created_at: string;
};

export type RateUnit = "L/ha" | "mL/ha" | "kg/ha" | "g/ha" | "mL/100 L" | "L/100 L" | "%v/v" | "Custom";
export const RATE_UNITS: RateUnit[] = ["L/ha", "mL/ha", "kg/ha", "g/ha", "mL/100 L", "L/100 L", "%v/v", "Custom"];

export type SprayJobProduct = {
  id: ID;
  chemical_id: ID;
  chemical_name: string;
  rate: number;
  unit: RateUnit;
  custom_unit_label?: string;
  total_qty?: number;
  total_qty_unit?: string;
};

export type SprayJobStatus = "draft" | "active" | "completed";

export type SprayJob = {
  id: ID;
  business_id: ID;
  status: SprayJobStatus;
  farm_id?: ID;
  farm_name?: string;
  paddock_id?: ID;
  paddock_name?: string;
  crop?: string;
  variety?: string;
  target?: string;
  date: string;
  start_time?: string;
  finish_time?: string;
  operator_id?: ID;
  operator?: string;
  machinery_id?: ID;
  machinery_name?: string;
  area_ha?: number;
  actual_area_ha?: number;
  water_rate?: number;
  speed_kmh?: number;
  boom_width_m?: number;
  nozzle_type?: string;
  nozzle_spacing_m?: number;
  pressure?: number;
  temperature_c?: number;
  humidity?: number;
  delta_t?: number;
  wind_speed?: number;
  wind_direction?: string;
  weather_captured_at?: string;
  temperature_c_auto?: number;
  humidity_auto?: number;
  delta_t_auto?: number;
  wind_speed_auto?: number;
  wind_direction_auto?: string;
  weather_edited?: boolean;
  gps_lat?: number;
  gps_lon?: number;
  finish_temperature_c?: number;
  finish_humidity?: number;
  finish_delta_t?: number;
  finish_wind_speed?: number;
  finish_wind_direction?: string;
  finish_weather_captured_at?: string;
  notes?: string;
  finish_notes?: string;
  products: SprayJobProduct[];
  created_at: string;
};

export type ExternalLink = {
  id: ID;
  business_id: ID;
  category: string;
  name: string;
  url: string;
  description?: string;
  created_at: string;
};
