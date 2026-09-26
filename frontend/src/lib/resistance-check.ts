// Resistance / mode-of-action rotation check — advisory only, never blocking.
//
// Locked rule: only warn if the same group was used on the SAME paddock in
// a STRICTLY EARLIER calendar year than the job being created/edited now.
// Deliberately not a rolling day/week window — splitting one paddock's spray
// across multiple passes a day or a week apart must never trigger this, only
// a genuine repeat in a later season.

import { repo } from "./storage";

export type ResistanceWarning = {
  id: string;
  chemicalGroup: string;
  priorYear: number;
  priorDate: string;
};

export async function checkGroupRotation(
  groupKey: string,
  paddockId: string,
  currentDateStr: string,
): Promise<ResistanceWarning | null> {
  const currentYear = new Date(currentDateStr).getFullYear();
  const history = (await repo.sprayJobs.completed()).filter((j) => j.paddock_id === paddockId);
  for (const job of history) {
    const priorYear = new Date(job.date).getFullYear();
    if (priorYear >= currentYear) continue; // strictly earlier year only — same-year repeats never warn
    const match = job.products.some((p) => (p.chemical_group ?? "") === groupKey);
    if (match) {
      return { id: `${groupKey}-${job.id}`, chemicalGroup: groupKey, priorYear, priorDate: job.date };
    }
  }
  return null;
}
