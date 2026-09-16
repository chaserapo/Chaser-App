// Thin status-transition helpers for fault/risk reports. Listing and
// creating go straight through `repo.farmIssues` (see storage.ts /
// cloud-repo.ts) like every other entity in the app — no separate module
// needed for those. Types live in ./types.

import { repo } from "./storage";
import type { FarmIssue } from "./types";

export async function resolveFarmIssue(issue: FarmIssue, notes?: string) {
  await repo.farmIssues.save({
    ...issue,
    status: "resolved",
    resolved_at: new Date().toISOString(),
    resolution_notes: notes?.trim() || null,
  });
}

export async function reopenFarmIssue(issue: FarmIssue) {
  await repo.farmIssues.save({ ...issue, status: "open", resolved_at: null, resolution_notes: null });
}
