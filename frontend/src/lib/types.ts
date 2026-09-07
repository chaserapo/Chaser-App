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
  region?: string;
  created_at: string;
};

export type Paddock = {
  id: ID;
  business_id: ID;
  farm_id: ID;
  name: string;
  area_ha?: number;
  crop?: string;
  created_at: string;
};

export type Chemical = {
  id: ID;
  business_id: ID;
  product_name: string;
  active_ingredient?: string;
  apvma_number?: string;
  chemical_group?: string;
  formulation?: string;
  default_rate?: number;
  default_unit?: RateUnit;
  pack_size?: string;
  stock_qty?: number;
  label_url?: string;
  sds_url?: string;
  notes?: string;
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

export type RateUnit = "L/ha" | "mL/ha" | "kg/ha" | "g/ha" | "%v/v";

export type SprayJobProduct = {
  id: ID;
  chemical_id: ID;
  chemical_name: string;
  rate: number;
  unit: RateUnit;
  total_qty?: number;
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
  target?: string;
  date: string;
  start_time?: string;
  finish_time?: string;
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
  category: string;
  name: string;
  url: string;
  description?: string;
};
