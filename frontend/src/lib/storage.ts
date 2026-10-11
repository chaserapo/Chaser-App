import AsyncStorage from "@react-native-async-storage/async-storage";
import { getBackendMode } from "./backend";
import { cloudRepo } from "./cloud-repo";
import type {
  Business,
  Farm,
  Paddock,
  Chemical,
  ChemicalBatch,
  ChemicalStockLine,
  Machinery,
  Maintenance,
  MaintenanceCompletion,
  SprayJob,
  ExternalLink,
  Operator,
  StockMovement,
  FarmIssue,
} from "./types";

const KEYS = {
  business: "as.business",
  farms: "as.farms",
  paddocks: "as.paddocks",
  chemicals: "as.chemicals",
  chemical_batches: "as.chemical_batches",
  chemical_stock_lines: "as.chemical_stock_lines",
  stock_movements: "as.stock_movements",
  machinery: "as.machinery",
  maintenance: "as.maintenance",
  maintenance_completions: "as.maintenance_completions",
  spray_jobs: "as.spray_jobs",
  farm_issues: "as.farm_issues",
  links: "as.links",
  operators: "as.operators",
  seeded: "as.seeded_v5",
  seeded_links: "as.seeded_links_v1",
} as const;

async function readList<T>(key: string): Promise<T[]> {
  const raw = await AsyncStorage.getItem(key);
  return raw ? (JSON.parse(raw) as T[]) : [];
}
async function writeList<T>(key: string, list: T[]) {
  await AsyncStorage.setItem(key, JSON.stringify(list));
}

export const localRepo = {
  async getBusiness(): Promise<Business | null> {
    const raw = await AsyncStorage.getItem(KEYS.business);
    return raw ? (JSON.parse(raw) as Business) : null;
  },
  async setBusiness(b: Business) {
    await AsyncStorage.setItem(KEYS.business, JSON.stringify(b));
  },

  farms: {
    list: () => readList<Farm>(KEYS.farms),
    active: async () => (await readList<Farm>(KEYS.farms)).filter((f) => !f.archived_at),
    save: async (f: Farm) => {
      const list = await readList<Farm>(KEYS.farms);
      const idx = list.findIndex((x) => x.id === f.id);
      if (idx >= 0) list[idx] = f;
      else list.push(f);
      await writeList(KEYS.farms, list);
    },
    remove: async (id: string) => {
      const list = (await readList<Farm>(KEYS.farms)).filter((f) => f.id !== id);
      await writeList(KEYS.farms, list);
    },
  },
  paddocks: {
    list: () => readList<Paddock>(KEYS.paddocks),
    active: async () => (await readList<Paddock>(KEYS.paddocks)).filter((p) => !p.archived_at),
    save: async (p: Paddock) => {
      const list = await readList<Paddock>(KEYS.paddocks);
      const idx = list.findIndex((x) => x.id === p.id);
      if (idx >= 0) list[idx] = p;
      else list.push(p);
      await writeList(KEYS.paddocks, list);
    },
    remove: async (id: string) => {
      const list = (await readList<Paddock>(KEYS.paddocks)).filter((x) => x.id !== id);
      await writeList(KEYS.paddocks, list);
    },
  },
  chemicals: {
    list: () => readList<Chemical>(KEYS.chemicals),
    active: async () => (await readList<Chemical>(KEYS.chemicals)).filter((c) => !c.archived_at),
    save: async (c: Chemical) => {
      const list = await readList<Chemical>(KEYS.chemicals);
      const idx = list.findIndex((x) => x.id === c.id);
      if (idx >= 0) list[idx] = c;
      else list.push(c);
      await writeList(KEYS.chemicals, list);
    },
    remove: async (id: string) => {
      const list = (await readList<Chemical>(KEYS.chemicals)).filter((x) => x.id !== id);
      await writeList(KEYS.chemicals, list);
    },
    get: async (id: string) => (await readList<Chemical>(KEYS.chemicals)).find((c) => c.id === id) ?? null,
  },
  chemicalBatches: {
    list: () => readList<ChemicalBatch>(KEYS.chemical_batches),
    forChemical: async (chemId: string) => (await readList<ChemicalBatch>(KEYS.chemical_batches)).filter((b) => b.chemical_id === chemId),
    save: async (b: ChemicalBatch) => {
      const list = await readList<ChemicalBatch>(KEYS.chemical_batches);
      const idx = list.findIndex((x) => x.id === b.id);
      if (idx >= 0) list[idx] = b;
      else list.push(b);
      await writeList(KEYS.chemical_batches, list);
    },
    remove: async (id: string) => {
      const list = (await readList<ChemicalBatch>(KEYS.chemical_batches)).filter((x) => x.id !== id);
      await writeList(KEYS.chemical_batches, list);
    },
  },
  chemicalStockLines: {
    list: () => readList<ChemicalStockLine>(KEYS.chemical_stock_lines),
    forChemical: async (chemId: string) => (await readList<ChemicalStockLine>(KEYS.chemical_stock_lines)).filter((l) => l.chemical_id === chemId),
    save: async (l: ChemicalStockLine) => {
      const list = await readList<ChemicalStockLine>(KEYS.chemical_stock_lines);
      const idx = list.findIndex((x) => x.id === l.id);
      if (idx >= 0) list[idx] = l;
      else list.push(l);
      await writeList(KEYS.chemical_stock_lines, list);
    },
    remove: async (id: string) => {
      const list = (await readList<ChemicalStockLine>(KEYS.chemical_stock_lines)).filter((x) => x.id !== id);
      await writeList(KEYS.chemical_stock_lines, list);
    },
  },
  stockMovements: {
    list: () => readList<StockMovement>(KEYS.stock_movements),
    forChemical: async (id: string) => (await readList<StockMovement>(KEYS.stock_movements)).filter((m) => m.chemical_id === id).sort((a, b) => b.ts.localeCompare(a.ts)),
    save: async (m: StockMovement) => {
      const list = await readList<StockMovement>(KEYS.stock_movements);
      list.push(m);
      await writeList(KEYS.stock_movements, list);
    },
  },
  machinery: {
    list: () => readList<Machinery>(KEYS.machinery),
    save: async (m: Machinery) => {
      const list = await readList<Machinery>(KEYS.machinery);
      const idx = list.findIndex((x) => x.id === m.id);
      if (idx >= 0) list[idx] = m;
      else list.push(m);
      await writeList(KEYS.machinery, list);
    },
    remove: async (id: string) => {
      const list = (await readList<Machinery>(KEYS.machinery)).filter((x) => x.id !== id);
      await writeList(KEYS.machinery, list);
    },
    get: async (id: string) => (await readList<Machinery>(KEYS.machinery)).find((m) => m.id === id) ?? null,
  },
  maintenance: {
    list: () => readList<Maintenance>(KEYS.maintenance),
    forMachine: async (machineId: string) =>
      (await readList<Maintenance>(KEYS.maintenance)).filter((m) => m.machinery_id === machineId),
    save: async (m: Maintenance) => {
      const list = await readList<Maintenance>(KEYS.maintenance);
      const idx = list.findIndex((x) => x.id === m.id);
      if (idx >= 0) list[idx] = m;
      else list.push(m);
      await writeList(KEYS.maintenance, list);
    },
    remove: async (id: string) => {
      const list = (await readList<Maintenance>(KEYS.maintenance)).filter((x) => x.id !== id);
      await writeList(KEYS.maintenance, list);
    },
    get: async (id: string) => (await readList<Maintenance>(KEYS.maintenance)).find((m) => m.id === id) ?? null,
  },
  maintenanceCompletions: {
    list: () => readList<MaintenanceCompletion>(KEYS.maintenance_completions),
    forMachine: async (machineId: string) =>
      (await readList<MaintenanceCompletion>(KEYS.maintenance_completions))
        .filter((c) => c.machinery_id === machineId)
        .sort((a, b) => b.date.localeCompare(a.date)),
    forMaintenance: async (maintenanceId: string) =>
      (await readList<MaintenanceCompletion>(KEYS.maintenance_completions))
        .filter((c) => c.maintenance_id === maintenanceId)
        .sort((a, b) => b.date.localeCompare(a.date)),
    save: async (c: MaintenanceCompletion) => {
      const list = await readList<MaintenanceCompletion>(KEYS.maintenance_completions);
      const idx = list.findIndex((x) => x.id === c.id);
      if (idx >= 0) list[idx] = c;
      else list.push(c);
      await writeList(KEYS.maintenance_completions, list);
    },
    remove: async (id: string) => {
      const list = (await readList<MaintenanceCompletion>(KEYS.maintenance_completions)).filter((x) => x.id !== id);
      await writeList(KEYS.maintenance_completions, list);
    },
  },
  sprayJobs: {
    list: () => readList<SprayJob>(KEYS.spray_jobs),
    active: async () => (await readList<SprayJob>(KEYS.spray_jobs)).find((j) => j.status === "active") ?? null,
    completed: async () => (await readList<SprayJob>(KEYS.spray_jobs)).filter((j) => j.status === "completed"),
    planned: async () => (await readList<SprayJob>(KEYS.spray_jobs)).filter((j) => j.status === "planned"),
    save: async (j: SprayJob) => {
      const list = await readList<SprayJob>(KEYS.spray_jobs);
      const idx = list.findIndex((x) => x.id === j.id);
      if (idx >= 0) list[idx] = j;
      else list.push(j);
      await writeList(KEYS.spray_jobs, list);
    },
    remove: async (id: string) => {
      const list = (await readList<SprayJob>(KEYS.spray_jobs)).filter((x) => x.id !== id);
      await writeList(KEYS.spray_jobs, list);
    },
    get: async (id: string) => (await readList<SprayJob>(KEYS.spray_jobs)).find((j) => j.id === id) ?? null,
  },
  farmIssues: {
    list: () => readList<FarmIssue>(KEYS.farm_issues),
    save: async (i: FarmIssue) => {
      const list = await readList<FarmIssue>(KEYS.farm_issues);
      const idx = list.findIndex((x) => x.id === i.id);
      if (idx >= 0) list[idx] = i;
      else list.push(i);
      await writeList(KEYS.farm_issues, list);
    },
    remove: async (id: string) => {
      const list = (await readList<FarmIssue>(KEYS.farm_issues)).filter((x) => x.id !== id);
      await writeList(KEYS.farm_issues, list);
    },
    get: async (id: string) => (await readList<FarmIssue>(KEYS.farm_issues)).find((i) => i.id === id) ?? null,
  },
  async isSeeded(): Promise<boolean> {
    return (await AsyncStorage.getItem(KEYS.seeded)) === "1";
  },
  async markSeeded() {
    await AsyncStorage.setItem(KEYS.seeded, "1");
  },
  async isLinksSeeded(): Promise<boolean> {
    return (await AsyncStorage.getItem(KEYS.seeded_links)) === "1";
  },
  async markLinksSeeded() {
    await AsyncStorage.setItem(KEYS.seeded_links, "1");
  },
  links: {
    list: () => readList<ExternalLink>(KEYS.links),
    save: async (l: ExternalLink) => {
      const list = await readList<ExternalLink>(KEYS.links);
      const idx = list.findIndex((x) => x.id === l.id);
      if (idx >= 0) list[idx] = l;
      else list.push(l);
      await writeList(KEYS.links, list);
    },
    remove: async (id: string) => {
      const list = (await readList<ExternalLink>(KEYS.links)).filter((x) => x.id !== id);
      await writeList(KEYS.links, list);
    },
    get: async (id: string) => (await readList<ExternalLink>(KEYS.links)).find((l) => l.id === id) ?? null,
    saveAll: async (list: ExternalLink[]) => writeList(KEYS.links, list),
  },
  operators: {
    list: () => readList<Operator>(KEYS.operators),
    active: async () => (await readList<Operator>(KEYS.operators)).filter((o) => !o.archived_at),
    defaultUser: async () => (await readList<Operator>(KEYS.operators)).find((o) => o.is_default_user && !o.archived_at) ?? null,
    save: async (o: Operator) => {
      const list = await readList<Operator>(KEYS.operators);
      const idx = list.findIndex((x) => x.id === o.id);
      if (idx >= 0) list[idx] = o;
      else list.push(o);
      await writeList(KEYS.operators, list);
    },
    remove: async (id: string) => {
      const list = (await readList<Operator>(KEYS.operators)).filter((x) => x.id !== id);
      await writeList(KEYS.operators, list);
    },
  },
  async clearAll() {
    await AsyncStorage.multiRemove(Object.values(KEYS));
  },
};

// -----------------------------------------------------------------------------
// Backend router: exports `repo` as a Proxy that dispatches to the currently
// active backend (local AsyncStorage before sign-in, Supabase after).
// -----------------------------------------------------------------------------

export const repo: typeof localRepo = new Proxy({} as typeof localRepo, {
  get(_target, prop, _receiver) {
    const impl: any = getBackendMode() === "cloud" ? cloudRepo : localRepo;
    return impl[prop as keyof typeof localRepo];
  },
}) as typeof localRepo;

export function maintenanceStatus(
  currentHours: number | undefined,
  nextServiceHours: number | undefined,
): "good" | "due_soon" | "overdue" {
  if (currentHours == null || nextServiceHours == null) return "good";
  const remaining = nextServiceHours - currentHours;
  if (remaining <= 0) return "overdue";
  if (remaining <= 25) return "due_soon";
  return "good";
}
