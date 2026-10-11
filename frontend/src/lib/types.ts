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

export type PaddockBoundary = { type: "Polygon"; coordinates: number[][][] };

export type Paddock = {
  id: ID;
  business_id: ID;
  farm_id?: ID | null;
  name: string;
  area_ha?: number;
  crop?: string;
  variety?: string;
  notes?: string;
  boundary?: PaddockBoundary | null;
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
  chemical_group_key?: string;
  cost_per_unit?: number;
  formulation?: string;
  manufacturer?: string;
  default_rate?: number;
  default_unit?: RateUnit;
  pack_size?: string;
  stock_qty?: number;
  stock_unit?: string;
  low_stock_threshold?: number;
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
  stock_line_id?: ID | null;
  ts: string;
  delta: number;
  unit?: string;
  reason: StockMovementReason;
  spray_job_id?: ID;
  notes?: string;
  created_at: string;
};

// A concurrent pack-size line for a chemical — e.g. "Ester 680" can have both
// a "110 L" line and a "20 L" line on hand at once, each tracked separately.
export type ChemicalStockLine = {
  id: ID;
  business_id: ID;
  chemical_id: ID;
  pack_size: string;
  qty: number;
  location?: string;
  low_stock_threshold?: number;
  notes?: string;
  archived_at?: string;
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
  user_id?: ID;
  name: string;
  first_name?: string;
  last_name?: string;
  email?: string;
  phone?: string;
  role?: string;
  is_default_user?: boolean;
  archived_at?: string;
  created_at: string;
};

export type MachineType = "Tractor" | "Self-propelled sprayer" | "Tow-behind sprayer" | "Air seeder" | "Header/Harvester" | "Spreader" | "Ute/Vehicle" | "Implement" | "Other";
export const MACHINE_TYPES: MachineType[] = ["Tractor", "Self-propelled sprayer", "Tow-behind sprayer", "Air seeder", "Header/Harvester", "Spreader", "Ute/Vehicle", "Implement", "Other"];

export type SprayerApplicationMode = "broadcast" | "spot";
export type SprayerApplicationGoal = "systemic" | "contact" | "fungicide" | "insecticide" | "drift" | "fertiliser";

export type Machinery = {
  id: ID;
  business_id: ID;
  name: string;
  machine_type?: MachineType;
  make?: string;
  model?: string;
  year?: number;
  serial_number?: string;
  registration?: string;
  current_hours?: number;
  current_km?: number;
  purchase_date?: string;
  notes?: string;
  tank_capacity_l?: number;
  boom_width_m?: number;
  nozzle_spacing_m?: number;
  nozzle_positions?: number;
  default_nozzle?: string;
  default_speed_kmh?: number;
  default_water_rate_lha?: number;
  default_application_mode?: SprayerApplicationMode;
  default_application_goal?: SprayerApplicationGoal;
  pwm_enabled?: boolean;
  spot_nozzle_width_m?: number;
  default_treated_pct?: number;
  external_platform?: string;
  external_machine_id?: string;
  last_sync_at?: string;
  synced_hours?: number;
  sync_status?: "connected" | "pending" | "error" | "disconnected";
  archived_at?: string;
  created_at: string;
};

export type MaintenanceCompletion = {
  id: ID;
  business_id: ID;
  machinery_id: ID;
  maintenance_id?: ID;
  date: string;
  hours?: number;
  km?: number;
  work_performed?: string;
  parts_used?: string;
  cost?: number;
  service_provider?: string;
  notes?: string;
  created_at: string;
};
export type FuelRecord = {
  id: ID; business_id: ID; machinery_id: ID; date: string;
  litres?: number; cost?: number; hours?: number; km?: number; notes?: string; created_at: string;
};
export type RepairRecord = {
  id: ID; business_id: ID; machinery_id: ID; date: string;
  description: string; cost?: number; service_provider?: string; parts_used?: string; notes?: string; created_at: string;
};
export type PartUsage = {
  id: ID; business_id: ID; machinery_id: ID; date: string;
  part_name: string; part_number?: string; quantity?: number; cost?: number; notes?: string; created_at: string;
};
export type Attachment = {
  id: ID; business_id: ID; machinery_id: ID; kind: "photo" | "document"; uri: string; label?: string; created_at: string;
};
export type PreStartInspection = {
  id: ID; business_id: ID; machinery_id: ID; date: string; operator?: string;
  checklist_json: string; passed: boolean; notes?: string; created_at: string;
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

// Common ag-chem pack sizes, offered as quick-select chips when recording
// stock so a farmer isn't typing "20 L" by hand every time.
export const PACK_SIZE_PRESETS: string[] = ["1 L", "5 L", "10 L", "15 L", "20 L", "110 L", "200 L", "1000 L", "500 g", "1 kg", "5 kg", "10 kg", "20 kg", "25 kg"];

export type SprayJobProduct = {
  id: ID;
  chemical_id: ID;
  chemical_name: string;
  // Snapshotted from the Chemical register at the moment this product was
  // added to the job — not looked up live — so a job's recorded group/cost
  // never drifts if the chemical's own record changes later.
  chemical_group?: string;
  cost_per_unit?: number;
  cost_unit?: string;
  rate: number;
  unit: RateUnit;
  custom_unit_label?: string;
  total_qty?: number;
  total_qty_unit?: string;
};

export type SprayJobStatus = "draft" | "planned" | "active" | "completed";

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
  crop_stage?: string;
  crop_stage_custom?: string;
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

export type IssueSeverity = "low" | "medium" | "high" | "critical";
export type IssueStatus = "open" | "assigned" | "in_progress" | "resolved" | "closed";

export type FarmIssue = {
  id: ID;
  business_id: ID;
  farm_id?: ID | null;
  paddock_id?: ID | null;
  machinery_id?: ID | null;
  category: string;
  subcategory?: string | null;
  title: string;
  description?: string | null;
  severity: IssueSeverity;
  status: IssueStatus;
  reported_at: string;
  resolved_at?: string | null;
  resolution_notes?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  location_accuracy_m?: number | null;
  location_note?: string | null;
  photo_url?: string | null;
  farms?: { name: string } | null;
  paddocks?: { name: string } | null;
  machinery?: { name: string } | null;
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
