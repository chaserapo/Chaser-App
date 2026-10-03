// Australian broadacre / cropping towns that get a Spray Window page.
// Coordinates are approximate town centres (2 dp ≈ 1 km) — good enough for a
// regional forecast. Add towns freely; slugs are derived from the name.

export const STATES = {
  NSW: "New South Wales",
  VIC: "Victoria",
  QLD: "Queensland",
  SA: "South Australia",
  WA: "Western Australia",
  TAS: "Tasmania",
};

const RAW = [
  // NSW
  ["Wagga Wagga", "NSW", -35.12, 147.37],
  ["Dubbo", "NSW", -32.25, 148.6],
  ["Moree", "NSW", -29.47, 149.84],
  ["Narrabri", "NSW", -30.32, 149.78],
  ["Gunnedah", "NSW", -30.98, 150.25],
  ["Tamworth", "NSW", -31.09, 150.93],
  ["Parkes", "NSW", -33.14, 148.17],
  ["Forbes", "NSW", -33.38, 148.01],
  ["Griffith", "NSW", -34.29, 146.04],
  ["Leeton", "NSW", -34.55, 146.4],
  ["West Wyalong", "NSW", -33.92, 147.2],
  ["Temora", "NSW", -34.45, 147.53],
  ["Cootamundra", "NSW", -34.64, 148.03],
  ["Young", "NSW", -34.31, 148.3],
  ["Coonamble", "NSW", -30.95, 148.39],
  ["Walgett", "NSW", -30.02, 148.12],
  ["Nyngan", "NSW", -31.56, 147.19],
  ["Condobolin", "NSW", -33.09, 147.15],
  ["Hay", "NSW", -34.51, 144.84],
  ["Deniliquin", "NSW", -35.53, 144.95],
  ["Narrandera", "NSW", -34.75, 146.55],
  ["Lockhart", "NSW", -35.22, 146.71],
  ["Gilgandra", "NSW", -31.71, 148.66],
  ["Coonabarabran", "NSW", -31.27, 149.28],
  ["Wellington", "NSW", -32.56, 148.94],
  ["Orange", "NSW", -33.28, 149.1],
  // VIC
  ["Horsham", "VIC", -36.71, 142.2],
  ["Warracknabeal", "VIC", -36.25, 142.39],
  ["Swan Hill", "VIC", -35.34, 143.55],
  ["Mildura", "VIC", -34.19, 142.16],
  ["Echuca", "VIC", -36.13, 144.75],
  ["Shepparton", "VIC", -36.38, 145.4],
  ["Bendigo", "VIC", -36.76, 144.28],
  ["Ballarat", "VIC", -37.56, 143.85],
  ["Hamilton", "VIC", -37.74, 142.02],
  ["Donald", "VIC", -36.37, 142.98],
  ["Birchip", "VIC", -35.98, 142.92],
  ["Ouyen", "VIC", -35.07, 142.32],
  ["Nhill", "VIC", -36.33, 141.65],
  ["Kerang", "VIC", -35.73, 143.92],
  ["St Arnaud", "VIC", -36.62, 143.26],
  ["Colac", "VIC", -38.34, 143.58],
  // QLD
  ["Toowoomba", "QLD", -27.56, 151.95],
  ["Dalby", "QLD", -27.18, 151.26],
  ["Goondiwindi", "QLD", -28.55, 150.31],
  ["Emerald", "QLD", -23.53, 148.16],
  ["Roma", "QLD", -26.57, 148.79],
  ["Kingaroy", "QLD", -26.54, 151.84],
  ["St George", "QLD", -28.04, 148.58],
  ["Chinchilla", "QLD", -26.74, 150.63],
  ["Warwick", "QLD", -28.21, 152.03],
  ["Biloela", "QLD", -24.4, 150.51],
  ["Miles", "QLD", -26.66, 150.18],
  ["Clermont", "QLD", -22.82, 147.64],
  // SA
  ["Clare", "SA", -33.83, 138.61],
  ["Kadina", "SA", -33.96, 137.72],
  ["Minlaton", "SA", -34.77, 137.6],
  ["Port Pirie", "SA", -33.19, 138.02],
  ["Crystal Brook", "SA", -33.35, 138.21],
  ["Naracoorte", "SA", -36.96, 140.74],
  ["Bordertown", "SA", -36.31, 140.77],
  ["Keith", "SA", -36.1, 140.35],
  ["Loxton", "SA", -34.45, 140.57],
  ["Murray Bridge", "SA", -35.12, 139.27],
  ["Cleve", "SA", -33.7, 136.49],
  ["Wudinna", "SA", -33.05, 135.46],
  ["Kimba", "SA", -33.14, 136.42],
  ["Cummins", "SA", -34.26, 135.73],
  ["Jamestown", "SA", -33.21, 138.6],
  ["Tumby Bay", "SA", -34.38, 136.1],
  // WA
  ["Northam", "WA", -31.65, 116.67],
  ["Merredin", "WA", -31.48, 118.28],
  ["Narrogin", "WA", -32.93, 117.18],
  ["Katanning", "WA", -33.69, 117.55],
  ["Geraldton", "WA", -28.77, 114.61],
  ["Esperance", "WA", -33.86, 121.89],
  ["Moora", "WA", -30.64, 116.01],
  ["Wongan Hills", "WA", -30.89, 116.72],
  ["Kojonup", "WA", -33.83, 117.15],
  ["Albany", "WA", -35.02, 117.88],
  ["Dalwallinu", "WA", -30.28, 116.66],
  ["Corrigin", "WA", -32.33, 117.87],
  ["Lake Grace", "WA", -33.1, 118.46],
  ["Ravensthorpe", "WA", -33.58, 120.05],
  ["Mullewa", "WA", -28.54, 115.51],
  ["Kulin", "WA", -32.67, 118.15],
  // TAS
  ["Launceston", "TAS", -41.44, 147.14],
  ["Cressy", "TAS", -41.69, 147.08],
  ["Scottsdale", "TAS", -41.16, 147.52],
  ["Devonport", "TAS", -41.18, 146.35],
];

export function slugify(s) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

export const TOWNS = RAW.map(([name, state, lat, lon]) => ({
  name,
  state,
  lat,
  lon,
  slug: slugify(name),
  path: `${state.toLowerCase()}/${slugify(name)}/`,
}));

function haversineKm(a, b) {
  const R = 6371;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export function nearbyTowns(town, n = 6) {
  return TOWNS.filter((t) => t !== town)
    .map((t) => ({ town: t, km: haversineKm(town, t) }))
    .sort((a, b) => a.km - b.km)
    .slice(0, n);
}
