// Recall on the Mushaf page (unified Mushaf, Recall mode). Pure helpers, no UI.
// Evidence rule (same as Recall a Page / Practice): nothing is saved until every Ayah on the page is rated;
// a hint, a peek or listening during the test turns "ok" into "hes"; results go through applyResults().
import { applyResults, type Mark } from "./hifz";
import type { PageContent } from "./quran";
import type { AppState } from "./store";

export type Ayah = [number, number];
export type RecallRatings = Record<string, Mark>;   // "s:a" → rating
export type RecallHelp = Record<string, true>;      // "s:a" → hint / peek / listen used
const k = (x: Ayah) => `${x[0]}:${x[1]}`;

/** Parse a selected-Ayah route for a page, rejecting references outside that canonical page. */
export function parsePageAyahSelection(pageAyahs: Ayah[], raw: string | null): Ayah[] | null {
  if (raw === null) return pageAyahs;
  if (!raw.trim()) return null;
  const wanted = new Set<string>();
  for (const token of raw.split(",")) {
    const match = /^(\d+):(\d+)$/.exec(token.trim());
    if (!match) return null;
    const ref: Ayah = [Number(match[1]), Number(match[2])], key = k(ref);
    if (!pageAyahs.some((x) => k(x) === key) || wanted.has(key)) return null;
    wanted.add(key);
  }
  return pageAyahs.filter((x) => wanted.has(k(x)));
}

/** Recall results to save, in page order. Returns null until every Ayah has been rated. */
export function recallEvidence(ayahs: Ayah[], ratings: RecallRatings, help: RecallHelp): { items: Ayah[]; res: Record<number, Mark> } | null {
  if (!ayahs.length || ayahs.some((x) => !ratings[k(x)])) return null;
  const res: Record<number, Mark> = {};
  ayahs.forEach((x, i) => { const r = ratings[k(x)]; res[i] = r === "ok" && help[k(x)] ? "hes" : r; });
  return { items: ayahs, res };
}

/** Save a completed page recall once. Returns the number of Ayahs saved (0 if incomplete). */
export function savePageRecall(d: AppState, page: number, ayahs: Ayah[], ratings: RecallRatings, help: RecallHelp): number {
  const ev = recallEvidence(ayahs, ratings, help);
  if (!ev) return 0;
  applyResults(d, ev.items, ev.res, "assessment", `Recall page ${page} · Mushaf`);
  return ev.items.length;
}

/**
 * Split a page's Ayahs into a first and second half for learning. The split is at the first Ayah that starts on
 * line 8 or later of the 15 (Surah headers and Bismillah lines count as lines), so each half is about half the page.
 * Pages with a single Ayah have no second half.
 */
export function pageHalves(c: Pick<PageContent, "lines" | "flat" | "ayat">): { first: Ayah[]; second: Ayah[] } {
  const startLine = new Map<string, number>();
  c.lines.forEach((l, n) => { if (l.t !== "t") return; l.idx.forEach((i) => { const f = c.flat[i]; if (f.w === 0) startLine.set(`${f.s}:${f.a}`, n); }); });
  const ayahs = c.ayat.map(([s, a]) => [s, a] as Ayah);
  let cut = ayahs.findIndex((x) => (startLine.get(k(x)) ?? 0) >= 7);
  if (cut <= 0) cut = Math.ceil(ayahs.length / 2);
  if (ayahs.length < 2) return { first: ayahs, second: [] };
  return { first: ayahs.slice(0, cut), second: ayahs.slice(cut) };
}
