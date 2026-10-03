// Site-wide settings. Everything deploy-specific comes from env so the
// GitHub Action (repo variables) controls it without code changes.

const trimSlash = (s) => s.replace(/\/+$/, "");

export const CONFIG = {
  // Public base URL the site is served from (no trailing slash).
  siteUrl: trimSlash(process.env.SITE_URL || "https://chaserapo.github.io/Chaser-App"),
  siteName: "Spray Window by Chaser",
  // Store links; a missing one is hidden from the call-to-action.
  appStoreUrl: process.env.APP_STORE_URL || "",
  playStoreUrl: process.env.PLAY_STORE_URL || "https://play.google.com/store/apps/details?id=au.com.chaserag.chaser",
  // Optional extra landing page (e.g. the Chaser marketing site).
  appSiteUrl: process.env.CHASER_SITE_URL || "",
  // Appended to every outbound app link so installs can be attributed.
  utm: "utm_source=spraywindow&utm_medium=organic",
};

export function withUtm(url, campaign) {
  if (!url) return url;
  const params = `${CONFIG.utm}&utm_campaign=${encodeURIComponent(campaign)}`;
  const sep = url.includes("?") ? "&" : "?";
  // Google Play only passes attribution through its `referrer` parameter.
  if (url.includes("play.google.com")) return `${url}${sep}referrer=${encodeURIComponent(params)}`;
  return `${url}${sep}${params}`;
}
