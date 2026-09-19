// Search Australia's official public chemical product registry (APVMA
// PubCRIS) via its data.gov.au CKAN datastore. No API key needed - it's a
// public government dataset, updated weekly.
//
// Verified live field shape (2026-09):
//   fpname  - product name, e.g. "ROUNDUP BIACTIVE HERBICIDE"
//   sname   - registration holder, e.g. "MONSANTO AUSTRALIA PTY LTD"
//   pcode   - APVMA product/registration number, e.g. "48518"
//   hlevel1 - product class, e.g. "HERBICIDE"
//   fdesc   - formulation description, e.g. "SOLUBLE CONCENTRATE"
//   regcode - "R" for a registered product, "A" for a bare active
//             constituent entry (e.g. just "GLYPHOSATE") - filtered to "R"
//             here since a farmer searches for what they bought, not the
//             raw active ingredient index.
import type { ChemicalCategory } from "./types";

export type ApvmaProduct = {
  pcode: string;
  productName: string;
  holder: string;
  category?: string;
  formulation?: string;
};

const RESOURCE_ID = "b4bb5394-b60b-4602-8bde-2e206ffc498f";

export async function searchApvmaProducts(query: string): Promise<ApvmaProduct[]> {
  const q = query.trim();
  if (q.length < 3) return [];
  const filters = encodeURIComponent(JSON.stringify({ regcode: "R" }));
  const url =
    `https://data.gov.au/data/api/3/action/datastore_search?resource_id=${RESOURCE_ID}` +
    `&q=${encodeURIComponent(q)}&filters=${filters}&limit=20`;
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), 10_000);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) return [];
    const j: any = await res.json();
    const records: any[] = j?.result?.records ?? [];
    return records
      .map((r) => ({
        pcode: String(r.pcode ?? "").trim(),
        productName: String(r.fpname ?? "").trim(),
        holder: String(r.sname ?? "").trim(),
        category: r.hlevel1 ? String(r.hlevel1).trim() : undefined,
        formulation: r.fdesc ? String(r.fdesc).trim() : undefined,
      }))
      .filter((p) => p.productName);
  } catch {
    return [];
  } finally {
    clearTimeout(t);
  }
}

/** Best-effort match of an APVMA product class (e.g. "HERBICIDE") onto Chaser's own category list. */
export function mapApvmaCategory(hlevel1?: string): ChemicalCategory | null {
  if (!hlevel1) return null;
  const upper = hlevel1.toUpperCase();
  if (upper.includes("HERBICIDE")) return "Herbicide";
  if (upper.includes("FUNGICIDE")) return "Fungicide";
  if (upper.includes("INSECTICIDE")) return "Insecticide";
  return null;
}
