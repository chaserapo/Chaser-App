// Chaser seed.
//
// Chaser is now cloud-first — every new user gets a blank workspace on
// Supabase and populates it themselves (either via the onboarding wizard
// or the tab-level "Add" buttons). We deliberately do NOT ship demo farms,
// paddocks, machinery, chemicals or spray records any more.
//
// The seed marker is still written on first run so the old local-mode
// migration flow doesn't try to re-seed a downgraded install. External
// links (support links etc.) are still seeded — those are safe and useful
// regardless of user data.

import { seedLinksIfNeeded } from "./links";
import { repo } from "./storage";

export async function seedIfNeeded() {
  // Always seed external support links (harmless, no user data).
  try { await seedLinksIfNeeded(); } catch (e) { console.warn("links seed error", e); }

  // Mark local storage as seeded so old local-mode boot paths don't try to
  // re-populate demo data. Cloud repos ignore this marker entirely.
  try { if (!(await repo.isSeeded())) await repo.markSeeded(); } catch { /* cloud repo, ignore */ }
}
