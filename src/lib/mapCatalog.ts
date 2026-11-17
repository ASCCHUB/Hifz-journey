// Visual Maps catalog (Phase 3.5): a versioned manifest + one lazily loaded JSON document per map.
// Map documents reference canonical Quran locations (surah, ayah) and carry memory cues only — never Quran
// text, never Tafsir. The three original maps are also bundled (lib/mindMaps.ts) so they work offline and
// keep their stable IDs; their JSON documents are generated from that file (scripts/build-map-docs.mjs) and a
// test fails if the two ever differ.
import { MIND_MAPS, type MindMapLesson } from "./mindMaps";
import { count } from "./quran";

export type MapReview = { status: "app_authored_unreviewed" | "teacher_reviewed"; reviewer?: string; reviewedAt?: string };
export type MapManifestEntry = { id: string; version: number; title: string; subtitle: string; surah: number; from: number; to: number; file: string; source: string; license: string; review: MapReview };
export type MapManifest = { schema: 1; version: number; maps: MapManifestEntry[] };
export type MapReviewRecord = { id: string; ayahCoverage: { surah: number; from: number; to: number }; status: "awaiting_review" | "teacher_reviewed"; reviewer: string | null; reviewedAt: string | null; sourceAttribution: string; permissionStatus: "unresolved" | "cleared" | "denied"; technicalStatus: "technically_valid" | "technical_issues"; outstandingIssues: string[] };
export type ReviewManifest = { schema: 1; version: number; maps: MapReviewRecord[] };

function approvalFromReviewFile(record: MapReviewRecord | undefined, entry: MapManifestEntry): MapReview {
  const validDate = !!record?.reviewedAt && !Number.isNaN(Date.parse(record.reviewedAt));
  const sameCanonicalRange = record?.ayahCoverage?.surah === entry.surah && record.ayahCoverage.from === entry.from && record.ayahCoverage.to === entry.to;
  const approved = sameCanonicalRange && record?.status === "teacher_reviewed" && record.technicalStatus === "technically_valid" && record.permissionStatus === "cleared" && !!record.reviewer?.trim() && validDate && Array.isArray(record.outstandingIssues) && record.outstandingIssues.length === 0;
  return approved ? { status: "teacher_reviewed", reviewer: record!.reviewer!, reviewedAt: record!.reviewedAt! } : { status: "app_authored_unreviewed" };
}

/** Merge the editorial review file into runtime metadata. Missing review data always fails closed. */
export function applyReviewManifest(manifest: MapManifest, review?: ReviewManifest | null): MapManifest {
  const records = review?.schema === 1 && Array.isArray(review.maps) ? new Map(review.maps.map((x) => [x.id, x])) : new Map<string, MapReviewRecord>();
  return { ...manifest, maps: manifest.maps.map((entry) => ({ ...entry, review: approvalFromReviewFile(records.get(entry.id), entry) })) };
}

/** Only reviewed, canonical-range entries may be offered as lesson teaching material. */
export function reviewedMapsForAyah(entries: MapManifestEntry[], surah: number, ayah: number): MapManifestEntry[] {
  if (!Number.isInteger(surah) || !Number.isInteger(ayah) || surah < 1 || surah > 114 || ayah < 1) return [];
  return entries.filter((x) => x.review?.status === "teacher_reviewed" && x.surah === surah && ayah >= x.from && ayah <= x.to);
}

const bundled = new Map(MIND_MAPS.map((m) => [m.id, m]));
let manifestP: Promise<MapManifest> | null = null;
const docs = new Map<string, Promise<MindMapLesson | null>>();

/** Built-in fallback manifest (used offline before the JSON manifest has been cached). */
export function bundledManifest(): MapManifest {
  return { schema: 1, version: 1, maps: MIND_MAPS.map((m) => ({ id: m.id, version: 1, title: m.title, subtitle: m.subtitle, surah: m.surah, from: m.from, to: m.to, file: `maps/${m.id}.json`, source: "Hifz Companion original memory cues", license: "app-original", review: { status: "app_authored_unreviewed" } })) };
}

export function loadManifest(): Promise<MapManifest> {
  if (!manifestP) {
    manifestP = fetch("/maps/manifest.json").then((r) => (r.ok ? r.json() : Promise.reject(new Error("no manifest"))))
      .then(async (m: MapManifest) => {
        if (!m || m.schema !== 1 || !Array.isArray(m.maps)) return bundledManifest();
        let review: ReviewManifest | null = null;
        try { const r = await fetch("/maps/review-manifest.json"); if (r.ok) review = await r.json() as ReviewManifest; } catch {}
        return applyReviewManifest(m, review);
      })
      .catch(() => bundledManifest());
  }
  return manifestP;
}

/** Problems with a map document (empty array = valid). */
export function validateMapDoc(doc: MindMapLesson): string[] {
  const errs: string[] = [];
  if (!doc || typeof doc.id !== "string") return ["missing id"];
  if (!(doc.surah >= 1 && doc.surah <= 114)) errs.push("surah out of range");
  else if (!(doc.from >= 1 && doc.to >= doc.from && doc.to <= count(doc.surah))) errs.push("ayah range out of bounds");
  (doc.nodes || []).forEach((n) => { if (!(n.ayah >= doc.from && n.ayah <= doc.to)) errs.push(`node ayah ${n.ayah} outside the map range`); });
  (doc.groups || []).forEach((g) => g.ayahs.forEach((a) => { if (!(a >= doc.from && a <= doc.to)) errs.push(`group ayah ${a} outside the map range`); }));
  if (JSON.stringify(doc).match(/[ً-ْٰ]/)) errs.push("contains Arabic diacritics — map documents must not embed Quran text");
  return errs;
}

export function loadMap(id: string): Promise<MindMapLesson | null> {
  if (bundled.has(id)) return Promise.resolve(bundled.get(id)!);
  if (!docs.has(id)) {
    docs.set(id, loadManifest().then(async (m) => {
      const entry = m.maps.find((x) => x.id === id); if (!entry) return null;
      const r = await fetch(`/${entry.file}`); if (!r.ok) return null;
      const doc = (await r.json()) as MindMapLesson;
      return validateMapDoc(doc).length ? null : doc;
    }).catch(() => null));
  }
  return docs.get(id)!;
}

/** Manifest entries whose range covers (s, a). */
export async function mapsForAyah(s: number, a: number): Promise<MapManifestEntry[]> {
  const m = await loadManifest();
  return m.maps.filter((x) => x.surah === s && a >= x.from && a <= x.to);
}

/** Lesson-facing lookup: never exposes app-authored/unreviewed maps to the teaching engine. */
export async function reviewedMapsForLocation(s: number, a: number): Promise<MapManifestEntry[]> {
  return reviewedMapsForAyah((await loadManifest()).maps, s, a);
}
