import { v4 as uuid } from "uuid";
import { repo } from "./storage";
import type { ExternalLink } from "./types";

export const LINK_CATEGORIES = ["Weather", "Chemicals & Labels", "Spray Application", "Agronomy"] as const;
export type LinkCategory = (typeof LINK_CATEGORIES)[number];

const DEFAULT_LINKS: Omit<ExternalLink, "id" | "business_id" | "created_at">[] = [
  { category: "Weather", name: "BOM Weather", url: "http://www.bom.gov.au/", description: "Bureau of Meteorology" },
  { category: "Weather", name: "BOM Rain Radar", url: "http://www.bom.gov.au/australia/radar/", description: "National radar" },
  { category: "Chemicals & Labels", name: "APVMA PubCRIS Chemical Search", url: "https://portal.apvma.gov.au/pubcris", description: "Registered chemicals" },
  { category: "Chemicals & Labels", name: "APVMA Permits Search", url: "https://portal.apvma.gov.au/permits", description: "Off-label permits" },
  { category: "Chemicals & Labels", name: "CropLife Australia", url: "https://www.croplife.org.au/", description: "MOA / resistance info" },
  { category: "Spray Application", name: "SprayWise", url: "https://www.spraywise.com.au/", description: "Nufarm SprayWise tools" },
  { category: "Spray Application", name: "SnapCard Spray Calculator", url: "https://www.agric.wa.gov.au/spray-application/spray-application-technology", description: "DPIRD WA spray guidance" },
  { category: "Spray Application", name: "Fantastic Nozzles", url: "https://fantasticnozzles.com.au", description: "Nozzle selection & supply" },
  { category: "Spray Application", name: "Hardi Australia", url: "https://www.hardi-australia.com/", description: "Nozzle manufacturer" },
  { category: "Agronomy", name: "GRDC", url: "https://grdc.com.au/", description: "Grains Research & Development" },
  { category: "Agronomy", name: "DPIRD WA", url: "https://www.agric.wa.gov.au/", description: "Dept Primary Industries WA" },
  { category: "Agronomy", name: "Agriculture Victoria", url: "https://agriculture.vic.gov.au/", description: "Ag Victoria" },
];

export async function seedLinksIfNeeded() {
  if (await repo.isLinksSeeded()) return;
  const business = await repo.getBusiness();
  if (!business) return;
  const now = new Date().toISOString();
  const links: ExternalLink[] = DEFAULT_LINKS.map((l) => ({
    id: uuid(),
    business_id: business.id,
    created_at: now,
    ...l,
  }));
  await repo.links.saveAll(links);
  await repo.markLinksSeeded();
}
