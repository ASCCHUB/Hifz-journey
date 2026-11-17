// Generate public/maps/manifest.json and one JSON document per bundled map from src/lib/mindMaps.ts.
// Usage: node scripts/build-map-docs.mjs   (re-run after editing mindMaps.ts; test-phase3 checks they match)
// New maps that are not bundled can be added to the manifest by hand: give them a stable id, a file,
// source/license fields and a review status. Map documents must reference (surah, ayah) only — no Quran text.
import { writeFile, mkdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const root = process.cwd();
const { MIND_MAPS } = await import(pathToFileURL(resolve(root, "src/lib/mindMaps.ts")).href);
const dir = resolve(root, "public/maps");
await mkdir(dir, { recursive: true });
let previous = { maps: [] };
try { previous = JSON.parse(await readFile(resolve(dir, "manifest.json"), "utf8")); } catch {}
const extra = (previous.maps || []).filter((m) => !MIND_MAPS.some((b) => b.id === m.id)); // keep hand-added entries
const maps = MIND_MAPS.map((m) => ({ id: m.id, version: 1, title: m.title, subtitle: m.subtitle, surah: m.surah, from: m.from, to: m.to, file: `maps/${m.id}.json`, source: "Hifz Companion original memory cues", license: "app-original", review: { status: "app_authored_unreviewed" } }));
for (const m of MIND_MAPS) await writeFile(resolve(dir, `${m.id}.json`), JSON.stringify(m, null, 2) + "\n");
await writeFile(resolve(dir, "manifest.json"), JSON.stringify({ schema: 1, version: 1, maps: [...maps, ...extra] }, null, 2) + "\n");
console.log(`Wrote ${MIND_MAPS.length} map documents and manifest (${maps.length + extra.length} entries).`);
