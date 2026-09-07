import { Platform } from "react-native";
import * as FileSystem from "expo-file-system";
import * as Sharing from "expo-sharing";
import type { SprayJob } from "./types";

const HEADERS = [
  "Date", "Start", "Finish", "Farm", "Paddock", "Crop", "Variety", "Target",
  "Operator", "Machine", "Area planned (ha)", "Area treated (ha)",
  "Water rate (L/ha)", "Speed (km/h)", "Boom width (m)", "Nozzle type", "Nozzle spacing (m)", "Pressure (bar)",
  "Temp (°C)", "RH (%)", "Delta T", "Wind (km/h)", "Wind dir",
  "Weather edited",
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
      j.weather_edited ? "yes" : "no",
      j.finish_temperature_c, j.finish_humidity, j.finish_delta_t, j.finish_wind_speed, j.finish_wind_direction,
      j.gps_lat, j.gps_lon,
      products,
      j.notes, j.finish_notes,
    ].map(csvCell).join(","));
  }
  return rows.join("\n");
}

export async function exportJobsCsv(jobs: SprayJob[]): Promise<{ ok: boolean; message?: string }> {
  const csv = jobsToCsv(jobs);
  const filename = `hectarehq-spray-records-${new Date().toISOString().slice(0, 10)}.csv`;

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
    const uri = `${FileSystem.cacheDirectory}${filename}`;
    await FileSystem.writeAsStringAsync(uri, csv, { encoding: FileSystem.EncodingType.UTF8 });
    if (await Sharing.isAvailableAsync()) {
      await Sharing.shareAsync(uri, { mimeType: "text/csv", dialogTitle: "Export Spray Records" });
      return { ok: true };
    }
    return { ok: true, message: `Saved to ${uri}` };
  } catch (e: any) {
    return { ok: false, message: e?.message ?? "Export failed" };
  }
}
