import AsyncStorage from "@react-native-async-storage/async-storage";
import type {
  Business,
  Farm,
  Paddock,
  Chemical,
  Machinery,
  Maintenance,
  SprayJob,
} from "./types";

const KEYS = {
  business: "as.business",
  farms: "as.farms",
  paddocks: "as.paddocks",
  chemicals: "as.chemicals",
  machinery: "as.machinery",
  maintenance: "as.maintenance",
  spray_jobs: "as.spray_jobs",
  seeded: "as.seeded_v3",
} as const;

async function readList<T>(key: string): Promise<T[]> {
  const raw = await AsyncStorage.getItem(key);
  return raw ? (JSON.parse(raw) as T[]) : [];
}
async function writeList<T>(key: string, list: T[]) {
  await AsyncStorage.setItem(key, JSON.stringify(list));
}

export const repo = {
  async getBusiness(): Promise<Business | null> {
    const raw = await AsyncStorage.getItem(KEYS.business);
    return raw ? (JSON.parse(raw) as Business) : null;
  },
  async setBusiness(b: Business) {
    await AsyncStorage.setItem(KEYS.business, JSON.stringify(b));
  },

  farms: {
    list: () => readList<Farm>(KEYS.farms),
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
  },
  sprayJobs: {
    list: () => readList<SprayJob>(KEYS.spray_jobs),
    active: async () => (await readList<SprayJob>(KEYS.spray_jobs)).find((j) => j.status === "active") ?? null,
    completed: async () => (await readList<SprayJob>(KEYS.spray_jobs)).filter((j) => j.status === "completed"),
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
  async isSeeded(): Promise<boolean> {
    return (await AsyncStorage.getItem(KEYS.seeded)) === "1";
  },
  async markSeeded() {
    await AsyncStorage.setItem(KEYS.seeded, "1");
  },
  async clearAll() {
    await AsyncStorage.multiRemove(Object.values(KEYS));
  },
};

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
