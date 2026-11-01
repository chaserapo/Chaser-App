// Offline resilience layer for seeding-job cloud writes — same mirror /
// pending-index / flush pattern as offline-queue.ts (spray_jobs), scoped to
// seeding_jobs + seeding_job_products instead.

import AsyncStorage from "@react-native-async-storage/async-storage";
import type { SeedingJob } from "./types";

const KEY_PREFIX = "chaser.offline.seeding_job.";
const PENDING_INDEX_KEY = "chaser.offline.seeding_job.pending_ids";

type ShadowRecord = {
  job: SeedingJob;
  business_id: string;
  pending: boolean;
  last_attempt_at?: string;
  last_error?: string;
  updated_at: string;
};

function keyFor(businessId: string, jobId: string) {
  return `${KEY_PREFIX}${businessId}.${jobId}`;
}

async function readShadow(businessId: string, jobId: string): Promise<ShadowRecord | null> {
  const raw = await AsyncStorage.getItem(keyFor(businessId, jobId));
  if (!raw) return null;
  try { return JSON.parse(raw) as ShadowRecord; } catch { return null; }
}

async function writeShadow(rec: ShadowRecord) {
  await AsyncStorage.setItem(keyFor(rec.business_id, rec.job.id), JSON.stringify(rec));
}

async function readPendingIndex(): Promise<{ business_id: string; job_id: string }[]> {
  const raw = await AsyncStorage.getItem(PENDING_INDEX_KEY);
  if (!raw) return [];
  try { return JSON.parse(raw); } catch { return []; }
}
async function writePendingIndex(list: { business_id: string; job_id: string }[]) {
  await AsyncStorage.setItem(PENDING_INDEX_KEY, JSON.stringify(list));
}
async function addPending(businessId: string, jobId: string) {
  const list = await readPendingIndex();
  if (!list.some((x) => x.business_id === businessId && x.job_id === jobId)) {
    list.push({ business_id: businessId, job_id: jobId });
    await writePendingIndex(list);
  }
}
async function removePending(businessId: string, jobId: string) {
  const list = await readPendingIndex();
  const next = list.filter((x) => !(x.business_id === businessId && x.job_id === jobId));
  if (next.length !== list.length) await writePendingIndex(next);
}

export const seedingOfflineQueue = {
  async mirror(businessId: string, job: SeedingJob) {
    await writeShadow({ job, business_id: businessId, pending: true, updated_at: new Date().toISOString() });
    await addPending(businessId, job.id);
  },
  async markSynced(businessId: string, jobId: string) {
    const rec = await readShadow(businessId, jobId);
    if (rec) {
      rec.pending = false;
      rec.last_error = undefined;
      rec.updated_at = new Date().toISOString();
      await writeShadow(rec);
    }
    await removePending(businessId, jobId);
  },
  async markFailed(businessId: string, jobId: string, err: unknown) {
    const rec = await readShadow(businessId, jobId);
    if (rec) {
      rec.pending = true;
      rec.last_error = err instanceof Error ? err.message : String(err);
      rec.last_attempt_at = new Date().toISOString();
      await writeShadow(rec);
    }
    await addPending(businessId, jobId);
  },
  async getShadow(businessId: string, jobId: string): Promise<SeedingJob | null> {
    const rec = await readShadow(businessId, jobId);
    return rec?.job ?? null;
  },
  async findLocalActive(businessId: string): Promise<SeedingJob | null> {
    const keys = await AsyncStorage.getAllKeys();
    const prefix = `${KEY_PREFIX}${businessId}.`;
    const mine = keys.filter((k) => k.startsWith(prefix));
    for (const k of mine) {
      const raw = await AsyncStorage.getItem(k);
      if (!raw) continue;
      try {
        const rec = JSON.parse(raw) as ShadowRecord;
        if (rec.job?.status === "active") return rec.job;
      } catch { /* skip */ }
    }
    return null;
  },
  async isPending(businessId: string, jobId: string): Promise<boolean> {
    const rec = await readShadow(businessId, jobId);
    return !!rec?.pending;
  },
  async listPending(): Promise<{ business_id: string; job: SeedingJob }[]> {
    const idx = await readPendingIndex();
    const out: { business_id: string; job: SeedingJob }[] = [];
    for (const { business_id, job_id } of idx) {
      const rec = await readShadow(business_id, job_id);
      if (rec?.pending) out.push({ business_id, job: rec.job });
    }
    return out;
  },
  async flush(perform: (job: SeedingJob) => Promise<void>) {
    const pending = await this.listPending();
    for (const { business_id, job } of pending) {
      try {
        await perform(job);
        await this.markSynced(business_id, job.id);
      } catch (e) {
        await this.markFailed(business_id, job.id, e);
      }
    }
  },
  async pendingCount(): Promise<number> {
    return (await readPendingIndex()).length;
  },
};

export type { ShadowRecord };
