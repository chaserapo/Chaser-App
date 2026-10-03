// Publishes today's national post (all state cards + caption) to a Facebook
// Page. Runs after the site is deployed, because Facebook fetches the card
// images from their public URLs.
//
// Required env: FB_PAGE_ID, FB_PAGE_TOKEN (a long-lived Page access token with
// pages_manage_posts). Optional: FB_GRAPH_VERSION (default v23.0).
//
// Facebook Groups can't be posted to through the API, so group sharing stays
// manual through the post kit at <site>/social/.

import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { CONFIG } from "./config.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const { FB_PAGE_ID, FB_PAGE_TOKEN } = process.env;
const GRAPH = `https://graph.facebook.com/${process.env.FB_GRAPH_VERSION || "v23.0"}`;

if (!FB_PAGE_ID || !FB_PAGE_TOKEN) {
  console.log("FB_PAGE_ID / FB_PAGE_TOKEN not set; skipping Facebook post.");
  process.exit(0);
}

const kit = JSON.parse(await readFile(join(ROOT, "dist/social/posts.json"), "utf8"));
if (kit.fixture) {
  console.error("Refusing to post: this build used sample data.");
  process.exit(1);
}

async function graph(path, params) {
  const res = await fetch(`${GRAPH}/${path}`, {
    method: "POST",
    body: new URLSearchParams({ ...params, access_token: FB_PAGE_TOKEN }),
  });
  const json = await res.json();
  if (!res.ok || json.error) throw new Error(`Graph ${path}: ${JSON.stringify(json.error ?? json)}`);
  return json;
}

// Wait for the freshly deployed images to be served (Pages can lag a minute).
const imageUrl = (img) => `${CONFIG.siteUrl}/social/${img}?d=${kit.date}`;
for (let i = 0; ; i++) {
  const res = await fetch(imageUrl(kit.national.images[0]), { method: "HEAD" });
  if (res.ok) break;
  if (i >= 10) throw new Error(`Card image not reachable at ${imageUrl(kit.national.images[0])}`);
  await new Promise((r) => setTimeout(r, 15_000));
}

const media = [];
for (const img of kit.national.images) {
  const { id } = await graph(`${FB_PAGE_ID}/photos`, { url: imageUrl(img), published: "false" });
  media.push(id);
}
const attached = Object.fromEntries(media.map((id, i) => [`attached_media[${i}]`, JSON.stringify({ media_fbid: id })]));
const post = await graph(`${FB_PAGE_ID}/feed`, { message: kit.national.text, ...attached });
console.log(`Posted to Facebook: ${post.id}`);
