// Builds Open-Meteo request URLs.
//
// Open-Meteo's free endpoints are licensed for non-commercial use only. Once
// EXPO_PUBLIC_OPEN_METEO_API_KEY is set (commercial subscription), every call
// goes to the matching customer-* host with the key attached instead.
//
// Like every EXPO_PUBLIC_* value, the key is baked into the app bundle, so
// treat it as extractable: watch usage in the Open-Meteo dashboard and rotate
// it if the call budget starts draining unexpectedly.

const KEY = process.env.EXPO_PUBLIC_OPEN_METEO_API_KEY;

export function openMeteoUrl(host: "api" | "archive-api", pathAndQuery: string): string {
  if (!KEY) return `https://${host}.open-meteo.com${pathAndQuery}`;
  const sep = pathAndQuery.includes("?") ? "&" : "?";
  return `https://customer-${host}.open-meteo.com${pathAndQuery}${sep}apikey=${encodeURIComponent(KEY)}`;
}
