// New Learning: one passage selector (Juz / Surah / Mushaf page / Ayah range) and one Start Learning link.
// Pure helpers so the rules are testable: what each choice selects, validation, the lesson link, and which
// unfinished lesson is offered as "Continue Learning".
//
// Lessons run one Mushaf page at a time (Mushaf page learning) or up to 60 Ayahs (Ayah-by-Ayah tutor). A Juz or a
// Surah therefore starts at one of its pages — the summary always says exactly which page and Ayahs, so the
// passage is never changed silently.
import { pageAyahs, type Ayah } from "./chunking";
import { learnHref, lessonHref } from "./mushafLesson";
import { count, pageOf, Q, sname } from "./quran";
import type { LessonState } from "./store";

export type Point = { s: number; a: number };
export type Passage = { start: Point; end: Point; page: number; label: string; detail: string; fullPage: boolean; source: "juz" | "surah" | "page" | "ayah" };
export type Pick = { ok: true; passage: Passage } | { ok: false; error: string };
export type Method = "mushaf" | "ayah";
export type Portion = "page" | "first" | "second";

export const MAX_RANGE_AYAHS = 60;
const cmp = (x: Point, y: Point) => x.s - y.s || x.a - y.a;
const name = (p: Point) => `${sname(p.s)} ${p.a}`;
const span = (start: Point, end: Point) => start.s === end.s ? `${sname(start.s)} ${start.a}–${end.a}` : `${name(start)} – ${name(end)}`;

/** The Ayahs of `page` that lie inside [min, max]. */
function onPage(page: number, min?: Point, max?: Point): Ayah[] {
  return pageAyahs(page).filter(([s, a]) => (!min || cmp({ s, a }, min) >= 0) && (!max || cmp({ s, a }, max) <= 0));
}
function fromAyahs(ayahs: Ayah[], page: number, label: string, source: Passage["source"]): Pick {
  if (!ayahs.length) return { ok: false, error: "That page has no Ayahs in the chosen passage." };
  const start = { s: ayahs[0][0], a: ayahs[0][1] }, end = { s: ayahs.at(-1)![0], a: ayahs.at(-1)![1] };
  const full = ayahs.length === pageAyahs(page).length;
  return { ok: true, passage: { start, end, page, label, detail: `${span(start, end)} · Mushaf page ${page}${full ? " (whole page)" : ""}`, fullPage: full, source } };
}

export const juzPages = (juz: number): number[] => {
  const [[s, a], [es, ea]] = Q().juz[juz - 1]; const p1 = pageOf(s, a), p2 = pageOf(es, ea);
  return Array.from({ length: p2 - p1 + 1 }, (_, i) => p1 + i);
};
export const surahPages = (surah: number): number[] => {
  const p1 = pageOf(surah, 1), p2 = pageOf(surah, count(surah));
  return Array.from({ length: p2 - p1 + 1 }, (_, i) => p1 + i);
};

export function pickJuz(juz: number, page?: number): Pick {
  if (!Number.isInteger(juz) || juz < 1 || juz > 30) return { ok: false, error: "Choose a Juz from 1 to 30." };
  const pages = juzPages(juz); const p = page ?? pages[0];
  if (!pages.includes(p)) return { ok: false, error: `Juz ${juz} covers pages ${pages[0]}–${pages.at(-1)}.` };
  const [[s, a], [es, ea]] = Q().juz[juz - 1];
  return fromAyahs(onPage(p, { s, a }, { s: es, a: ea }), p, `Juz ${juz} · page ${p}${p === pages[0] ? " (start)" : ""}`, "juz");
}

export function pickSurah(surah: number, page?: number): Pick {
  if (!Number.isInteger(surah) || surah < 1 || surah > 114) return { ok: false, error: "Choose a Surah from 1 to 114." };
  const pages = surahPages(surah); const p = page ?? pages[0];
  if (!pages.includes(p)) return { ok: false, error: `${sname(surah)} is on pages ${pages[0]}–${pages.at(-1)}.` };
  return fromAyahs(onPage(p, { s: surah, a: 1 }, { s: surah, a: count(surah) }), p, `${surah}. ${sname(surah)} · page ${p}`, "surah");
}

export function pickPage(page: number): Pick {
  if (!Number.isInteger(page) || page < 1 || page > 604) return { ok: false, error: "Choose a Mushaf page from 1 to 604." };
  return fromAyahs(pageAyahs(page), page, `Mushaf page ${page}`, "page");
}

/** One Ayah or a range inside one Surah (from ≤ to, at most MAX_RANGE_AYAHS Ayahs). */
export function pickAyahs(surah: number, from: number, to: number = from): Pick {
  if (!Number.isInteger(surah) || surah < 1 || surah > 114) return { ok: false, error: "Choose a Surah from 1 to 114." };
  const n = count(surah);
  if (!Number.isInteger(from) || !Number.isInteger(to) || from < 1 || to < 1 || from > n || to > n) return { ok: false, error: `${sname(surah)} has Ayahs 1–${n}.` };
  if (to < from) return { ok: false, error: "The last Ayah must come after the first." };
  if (to - from + 1 > MAX_RANGE_AYAHS) return { ok: false, error: `Choose up to ${MAX_RANGE_AYAHS} Ayahs for one lesson.` };
  const start = { s: surah, a: from }, end = { s: surah, a: to }, p1 = pageOf(surah, from), p2 = pageOf(surah, to);
  const single = from === to;
  return { ok: true, passage: { start, end, page: p1, label: single ? `${sname(surah)} · Ayah ${from}` : `${sname(surah)} · Ayahs ${from}–${to}`, detail: `${span(start, end)} · Mushaf page${p1 === p2 ? ` ${p1}` : `s ${p1}–${p2}`}`, fullPage: false, source: "ayah" } };
}

/** Narrow a selected passage to start at a later Ayah of it (the collapsed "Adjust starting Ayah"). */
export function adjustStart(p: Passage, start: Point): Pick {
  if (start.s < 1 || start.s > 114 || start.a < 1 || start.a > count(start.s) || cmp(start, p.start) < 0 || cmp(start, p.end) > 0)
    return { ok: false, error: `Choose an Ayah from ${name(p.start)} to ${name(p.end)}.` };
  if (p.source === "ayah") return pickAyahs(start.s, start.a, p.end.s === start.s ? p.end.a : count(start.s));
  return fromAyahs(onPage(pageOf(start.s, start.a), start, p.end), pageOf(start.s, start.a), `${p.label} · from Ayah ${start.a}`, p.source);
}

/** True when the passage lies on one Mushaf page (Mushaf page learning works one page at a time). */
export const onOnePage = (p: Passage) => pageOf(p.start.s, p.start.a) === pageOf(p.end.s, p.end.a);

/** The lesson link. Mushaf method on one page → the Mushaf lesson (whole page, a half, or the chosen Ayahs);
 *  a passage across pages, or the Ayah method → the Ayah-by-Ayah tutor. `routed` says when the method had to change. */
export function startLink(p: Passage, method: Method, portion: Portion = "page"): { href: string; routed: boolean } {
  if (method === "mushaf" && onOnePage(p)) {
    if (p.fullPage) return { href: `/mushaf?p=${p.page}&mode=learn&portion=${portion}`, routed: false };
    return { href: learnHref({ start: p.start, end: p.end }, pageOf), routed: false };
  }
  const href = p.fullPage ? `/learn?page=${p.page}` : `/learn?s=${p.start.s}&a=${p.start.a}&endS=${p.end.s}&endA=${p.end.a}`;
  return { href, routed: method === "mushaf" };
}

/** Continue Learning: the most recently used unfinished lesson; every other unfinished lesson stays recoverable. */
export function continueChoice(lessons: Record<string, LessonState> | undefined): { current: LessonState | null; others: LessonState[] } {
  const open = Object.values(lessons || {}).filter((l) => l && !l.completedAt).sort((a, b) => b.updatedAt - a.updatedAt);
  return { current: open[0] || null, others: open.slice(1) };
}
export const continueHref = (l: LessonState) => lessonHref(l, pageOf);
export const lessonPlace = (l: LessonState) => {
  const pg = l.unit.page ?? pageOf(l.unit.start.s, l.unit.start.a);
  return `Page ${pg} · ${sname(l.unit.start.s)}`;
};
