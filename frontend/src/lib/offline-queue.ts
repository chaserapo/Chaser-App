// Offline resilience layer for spray-job cloud writes.
//
// Strategy (kept intentionally simple for the beta):
//  1. Every `sprayJobs.save()` mirrors the full job payload to AsyncStorage BEFORE
//     the cloud write is attempted, keyed by business_id + job_id. This means the
//     record survives a crash, kill, or reboot even if the cloud write never
//     completes.
//  2. If the cloud write throws (offline, RLS blip, timeout), the shadow is
//     flagged as "pending" and enqueued for retry.
//  3. Reads (`active`, `get`) fall back to the local shadow when the cloud
//     lookup fails OR returns nothing but a pending shadow exists — so an
//     active job the farmer is running never disappears just because a query
//     failed to reach the server.
//  4. `flushPending()` is called on app focus / repo re-init and reruns pending
//     writes when the network returns. Successful flushes clear the pending
//     flag; failures stay queued.
//
// This is deliberately scoped to spray_jobs + spray_job_products — the surface
// area the user asked us to protect for beta ("do not lose an active job or
// entered spray information simply because reception drops or the app is
// closed/reopened"). Other tables can adopt the same pattern later.

import AsyncStorage from "@react-native-async-storage/async-storage";
import type { SprayJob } from "./types";

const KEY_PREFIX = "chaser.offline.spray_job.";
const PENDING_INDEX_KEY = "chaser.offline.spray_job.pending_ids";

type ShadowRecord = {
  job: SprayJob;
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

export const offlineQueue = {
  /** Called from cloudRepo.sprayJobs.save BEFORE the cloud call. */
  async mirror(businessId: string, job: SprayJob) {
    await writeShadow({
      job,
      business_id: businessId,
      pending: true,
      updated_at: new Date().toISOString(),
    });
    await addPending(businessId, job.id);
  },
  /** Called after a successful cloud upsert. */
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
  /** Called after a failed cloud upsert. Keeps the shadow, records the error. */
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
  /** Get the shadow record for a job — regardless of pending state. */
  async getShadow(businessId: string, jobId: string): Promise<SprayJob | null> {
    const rec = await readShadow(businessId, jobId);
    return rec?.job ?? null;
  },
  /** Get any locally-known active job for a business — used as a read fallback. */
  async findLocalActive(businessId: string): Promise<SprayJob | null> {
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
  /** True if this job has an unsynced local mirror. */
  async isPending(businessId: string, jobId: string): Promise<boolean> {
    const rec = await readShadow(businessId, jobId);
    return !!rec?.pending;
  },
  async listPending(): Promise<{ business_id: string; job: SprayJob }[]> {
    const idx = await readPendingIndex();
    const out: { business_id: string; job: SprayJob }[] = [];
    for (const { business_id, job_id } of idx) {
      const rec = await readShadow(business_id, job_id);
      if (rec?.pending) out.push({ business_id, job: rec.job });
    }
    return out;
  },
  /** Retries every queued job. Uses the caller-supplied performer so we don't
   *  create a circular import back into cloud-repo. */
  async flush(perform: (job: SprayJob) => Promise<void>) {
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
