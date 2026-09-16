// Offline resilience layer for farm_issues cloud writes — same strategy as
// offline-queue.ts (spray jobs), scoped to fault/risk reports since they're
// often filed while walking a paddock with no signal. See offline-queue.ts
// for the detailed rationale; this is a parallel, independently-keyed copy
// rather than a shared generic so neither entity's resilience can regress
// the other's.

import AsyncStorage from "@react-native-async-storage/async-storage";
import type { FarmIssue } from "./types";

const KEY_PREFIX = "chaser.offline.farm_issue.";
const PENDING_INDEX_KEY = "chaser.offline.farm_issue.pending_ids";

type ShadowRecord = {
  issue: FarmIssue;
  business_id: string;
  pending: boolean;
  last_attempt_at?: string;
  last_error?: string;
  updated_at: string;
};

function keyFor(businessId: string, issueId: string) {
  return `${KEY_PREFIX}${businessId}.${issueId}`;
}

async function readShadow(businessId: string, issueId: string): Promise<ShadowRecord | null> {
  const raw = await AsyncStorage.getItem(keyFor(businessId, issueId));
  if (!raw) return null;
  try { return JSON.parse(raw) as ShadowRecord; } catch { return null; }
}

async function writeShadow(rec: ShadowRecord) {
  await AsyncStorage.setItem(keyFor(rec.business_id, rec.issue.id), JSON.stringify(rec));
}

async function readPendingIndex(): Promise<{ business_id: string; issue_id: string }[]> {
  const raw = await AsyncStorage.getItem(PENDING_INDEX_KEY);
  if (!raw) return [];
  try { return JSON.parse(raw); } catch { return []; }
}
async function writePendingIndex(list: { business_id: string; issue_id: string }[]) {
  await AsyncStorage.setItem(PENDING_INDEX_KEY, JSON.stringify(list));
}
async function addPending(businessId: string, issueId: string) {
  const list = await readPendingIndex();
  if (!list.some((x) => x.business_id === businessId && x.issue_id === issueId)) {
    list.push({ business_id: businessId, issue_id: issueId });
    await writePendingIndex(list);
  }
}
async function removePending(businessId: string, issueId: string) {
  const list = await readPendingIndex();
  const next = list.filter((x) => !(x.business_id === businessId && x.issue_id === issueId));
  if (next.length !== list.length) await writePendingIndex(next);
}

export const issuesOfflineQueue = {
  async mirror(businessId: string, issue: FarmIssue) {
    await writeShadow({ issue, business_id: businessId, pending: true, updated_at: new Date().toISOString() });
    await addPending(businessId, issue.id);
  },
  async markSynced(businessId: string, issueId: string) {
    const rec = await readShadow(businessId, issueId);
    if (rec) {
      rec.pending = false;
      rec.last_error = undefined;
      rec.updated_at = new Date().toISOString();
      await writeShadow(rec);
    }
    await removePending(businessId, issueId);
  },
  async markFailed(businessId: string, issueId: string, err: unknown) {
    const rec = await readShadow(businessId, issueId);
    if (rec) {
      rec.pending = true;
      rec.last_error = err instanceof Error ? err.message : String(err);
      rec.last_attempt_at = new Date().toISOString();
      await writeShadow(rec);
    }
    await addPending(businessId, issueId);
  },
  async listLocal(businessId: string): Promise<FarmIssue[]> {
    const keys = await AsyncStorage.getAllKeys();
    const prefix = `${KEY_PREFIX}${businessId}.`;
    const mine = keys.filter((k) => k.startsWith(prefix));
    const out: FarmIssue[] = [];
    for (const k of mine) {
      const raw = await AsyncStorage.getItem(k);
      if (!raw) continue;
      try {
        const rec = JSON.parse(raw) as ShadowRecord;
        if (rec.issue) out.push(rec.issue);
      } catch { /* skip */ }
    }
    return out;
  },
  async listPending(): Promise<{ business_id: string; issue: FarmIssue }[]> {
    const idx = await readPendingIndex();
    const out: { business_id: string; issue: FarmIssue }[] = [];
    for (const { business_id, issue_id } of idx) {
      const rec = await readShadow(business_id, issue_id);
      if (rec?.pending) out.push({ business_id, issue: rec.issue });
    }
    return out;
  },
};
