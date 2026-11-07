import { Platform } from "react-native";
import { File, Paths } from "expo-file-system";
import * as Sharing from "expo-sharing";
import type { SprayJob, SpreadJob, SeedingJob, HarvestJob } from "./types";
import { weatherSourceLabel } from "./weather";
import { jobArea, jobCost, type AnyJob, type JobKind } from "./reports";

const HEADERS = [
  "Date", "Start", "Finish", "Farm", "Paddock", "Crop", "Variety", "Target",
  "Operator", "Machine", "Area planned (ha)", "Area treated (ha)",
  "Water rate (L/ha)", "Speed (km/h)", "Boom width (m)", "Nozzle type", "Nozzle spacing (m)", "Pressure (bar)",
  "Temp (°C)", "RH (%)", "Delta T", "Wind (km/h)", "Wind dir",
  "Weather edited", "Weather source",
  "Finish Temp", "Finish RH", "Finish Delta T", "Finish Wind", "Finish Wind dir",
  "GPS lat", "GPS lon",
  "Products",
  "Notes", "Finish notes",
];

function csvCell(v: unknown): string {
  if (v == null) return "";
  const s = String(v);
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function jobsToCsv(jobs: SprayJob[]): string {
  const rows = [HEADERS.map(csvCell).join(",")];
  for (const j of jobs) {
    const products = j.products.map((p) => {
      const total = p.total_qty != null ? ` (total ${p.total_qty.toFixed(2)} ${p.total_qty_unit ?? ""})` : "";
      return `${p.chemical_name} ${p.rate} ${p.unit}${total}`;
    }).join(" | ");
    rows.push([
      j.date, j.start_time, j.finish_time, j.farm_name, j.paddock_name, j.crop, j.variety, j.target,
      j.operator, j.machinery_name, j.area_ha, j.actual_area_ha,
      j.water_rate, j.speed_kmh, j.boom_width_m, j.nozzle_type, j.nozzle_spacing_m, j.pressure,
      j.temperature_c, j.humidity, j.delta_t, j.wind_speed, j.wind_direction,
      j.weather_edited ? "yes" : "no", weatherSourceLabel(j),
      j.finish_temperature_c, j.finish_humidity, j.finish_delta_t, j.finish_wind_speed, j.finish_wind_direction,
      j.gps_lat, j.gps_lon,
      products,
      j.notes, j.finish_notes,
    ].map(csvCell).join(","));
  }
  return rows.join("\n");
}

async function writeAndShareCsv(csv: string, filename: string, dialogTitle: string): Promise<{ ok: boolean; message?: string }> {
  if (Platform.OS === "web") {
    try {
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      return { ok: true };
    } catch (e: any) {
      return { ok: false, message: e?.message ?? "Download failed" };
    }
  }

  try {
    const file = new File(Paths.cache, filename);
    file.write(csv);
    if (await Sharing.isAvailableAsync()) {
      await Sharing.shareAsync(file.uri, { mimeType: "text/csv", dialogTitle });
      return { ok: true };
    }
    return { ok: true, message: `Saved to ${file.uri}` };
  } catch (e: any) {
    return { ok: false, message: e?.message ?? "Export failed" };
  }
}

export async function exportJobsCsv(jobs: SprayJob[]): Promise<{ ok: boolean; message?: string }> {
  const csv = jobsToCsv(jobs);
  const filename = `chaser-spray-records-${new Date().toISOString().slice(0, 10)}.csv`;
  return writeAndShareCsv(csv, filename, "Export Spray Records");
}

// ─── Reports screen: generic export across any of the four job types ──────
const REPORT_HEADERS = [
  "Date", "Farm", "Paddock", "Crop", "Variety", "Operator", "Machine", "Area (ha)", "Cost ($)", "Detail",
];

function productsSummary(products: { chemical_name: string; rate: number; unit: string }[]): string {
  return products.map((p) => `${p.chemical_name} ${p.rate} ${p.unit}`).join(" | ");
}

function reportDetail(kind: JobKind, j: AnyJob): string {
  switch (kind) {
    case "spray": return [(j as SprayJob).target, productsSummary((j as SprayJob).products)].filter(Boolean).join(" · ");
    case "spread": return productsSummary((j as SpreadJob).products);
    case "seeding": return productsSummary((j as SeedingJob).products);
    case "harvest": {
      const h = j as HarvestJob;
      return [
        h.yield_value != null ? `${h.yield_value} ${h.yield_unit === "bu_ac" ? "bu/ac" : "t/ha"}` : "",
        h.grade, h.destination,
      ].filter(Boolean).join(" · ");
    }
  }
}

export function reportJobsToCsv(kind: JobKind, jobs: AnyJob[]): string {
  const rows = [REPORT_HEADERS.map(csvCell).join(",")];
  for (const j of jobs) {
    const cost = jobCost(kind, j);
    rows.push([
      j.date, j.farm_name, j.paddock_name, j.crop, j.variety, j.operator, j.machinery_name,
      jobArea(j), cost != null ? cost.toFixed(2) : "", reportDetail(kind, j),
    ].map(csvCell).join(","));
  }
  return rows.join("\n");
}

export async function exportReportCsv(kind: JobKind, jobs: AnyJob[]): Promise<{ ok: boolean; message?: string }> {
  const csv = reportJobsToCsv(kind, jobs);
  const filename = `chaser-${kind}-report-${new Date().toISOString().slice(0, 10)}.csv`;
  return writeAndShareCsv(csv, filename, `Export ${kind[0].toUpperCase()}${kind.slice(1)} Report`);
}
