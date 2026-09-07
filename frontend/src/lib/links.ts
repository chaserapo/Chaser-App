import type { ExternalLink } from "./types";

export const EXTERNAL_LINKS: ExternalLink[] = [
  // Weather
  { category: "Weather", name: "BOM Weather", url: "http://www.bom.gov.au/", description: "Bureau of Meteorology" },
  { category: "Weather", name: "BOM Rain Radar", url: "http://www.bom.gov.au/australia/radar/", description: "National radar" },

  // Chemicals & Labels
  { category: "Chemicals & Labels", name: "APVMA PubCRIS Chemical Search", url: "https://portal.apvma.gov.au/pubcris", description: "Registered chemicals" },
  { category: "Chemicals & Labels", name: "APVMA Permits Search", url: "https://portal.apvma.gov.au/permits", description: "Off-label permits" },
  { category: "Chemicals & Labels", name: "CropLife Australia", url: "https://www.croplife.org.au/", description: "MOA / resistance info" },

  // Spray Application
  { category: "Spray Application", name: "SprayWise", url: "https://www.spraywise.com.au/", description: "Nufarm SprayWise tools" },
  { category: "Spray Application", name: "SnapCard Spray Calculator", url: "https://www.agric.wa.gov.au/spray-application/spray-application-technology", description: "DPIRD WA spray guidance" },
  { category: "Spray Application", name: "TeeJet Nozzle Selector", url: "https://www.teejet.com/", description: "Nozzle selection tool" },
  { category: "Spray Application", name: "Hardi Nozzle Guide", url: "https://www.hardi-australia.com/", description: "Nozzle manufacturer" },

  // Agronomy
  { category: "Agronomy", name: "GRDC", url: "https://grdc.com.au/", description: "Grains Research & Development" },
  { category: "Agronomy", name: "DPIRD WA", url: "https://www.agric.wa.gov.au/", description: "Dept Primary Industries WA" },
  { category: "Agronomy", name: "Agriculture Victoria", url: "https://agriculture.vic.gov.au/", description: "Ag Victoria" },
];
