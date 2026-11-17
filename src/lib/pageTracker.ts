// 604-page Hifz tracker (UX Stage 3). Pure, read-only: derives a page status from the canonical per-Ayah
// records (st.mem / st.weak), self-reported claims, and open lessons. It never writes state and does not
// touch the SRS. Display only — the SRS (hifz.ts) and the planner keep their own rules.
import type { Ayah } from "./chunking";
import { pageAyahs } from "./chunking";
import { claimedAyahs, hasEvidence, isRetained, isVerified } from "./coverage";
import { juzOf } from "./quran";
import type { AppState, LessonState } from "./store";
import { today as todayFn } from "./store";

/**
 * Page status, in priority order (the first rule that applies wins):
 *   weak      an Ayah with recitation evidence whose latest result was a mistake, or in the weak queue
 *   due       an Ayah with recitation evidence whose SRS review is due now (same test as the planner)
 *   learning  an unfinished lesson covers this page
 *   strong    EVERY Ayah on the page is retained (≥30-day interval, ≥5 clean days) — the existing "Strong" rule
 *   learned   EVERY Ayah on the page has clean learner-rated recall (not yet long-term)
 *   partial   SOME Ayahs have learner-rated evidence, others do not (e.g. a sampled check, or half a page learned)
 *   claimed   no recitation evidence, but Ayahs are self-reported ("memorized before") or old "Mark memorized" marks
 *   none      nothing known
 * A sampled assessment rates only some Ayahs, so it can make a page "partial" but never "strong" or "learned".
 */
export type PageStatus = "weak" | "due" | "learning" | "strong" | "learned" | "partial" | "claimed" | "none";
export const PAGE_STATUS_ORDER: PageStatus[] = ["weak", "due", "learning", "strong", "learned", "partial", "claimed", "none"];
export const PAGE_STATUS_LABEL: Record<PageStatus, string> = {
  weak: "Weak · needs help", due: "Due for revision", learning: "Currently learning", strong: "Strong · retained",
  learned: "Learned (recited)", partial: "Partly checked", claimed: "Said memorized (not checked)", none: "Not started",
};
export const PAGE_STATUS_COLOR: Record<PageStatus, string> = {
  weak: "var(--weak)", due: "var(--revise)", learning: "var(--accent)", strong: "var(--strong)",
  learned: "var(--learn)", partial: "var(--muted)", claimed: "var(--gold)", none: "transparent",
};

export type PageInfo = {
  page: number; juz: number; ayahs: Ayah[]; first: Ayah; last: Ayah; surahs: number[];
  /** Ayahs with learner-rated recall (any result). */ assessed: number;
  /** Clean learner-rated recall. */ verified: number;
  retained: number; claimed: number; legacy: number; none: number;
  weakAyahs: Ayah[]; dueAyahs: Ayah[]; recitedAyahs: Ayah[];
  lesson?: LessonState; status: PageStatus;
};

let pageCache: Ayah[][] | null = null;
/** Ayahs of every page (1-indexed), computed once from the canonical layout. */
export function allPages(): Ayah[][] {
  if (!pageCache) { pageCache = [[]]; for (let p = 1; p <= 604; p++) pageCache.push(pageAyahs(p)); }
  return pageCache;
}

/** Unfinished lessons, keyed by the Mushaf page they start on. */
function openLessons(st: Pick<AppState, "lessons">, pageOf: (s: number, a: number) => number): Map<number, LessonState> {
  const m = new Map<number, LessonState>();
  Object.values(st.lessons || {}).filter((l) => !l.completedAt).sort((a, b) => a.updatedAt - b.updatedAt).forEach((l) => {
    const pg = l.unit.kind === "page" && l.unit.page ? l.unit.page : pageOf(l.unit.start.s, l.unit.start.a);
    m.set(pg, l); // most recently updated wins
  });
  return m;
}

export function pageInfo(st: Pick<AppState, "mem" | "weak" | "studentJourney" | "lessons">, page: number, pageOf: (s: number, a: number) => number, ctx?: { claimed: Map<string, unknown>; lessons: Map<number, LessonState>; now: number; today: number }): PageInfo {
  const c = ctx ?? { claimed: claimedAyahs(st), lessons: openLessons(st, pageOf), now: Date.now(), today: todayFn() };
  const ayahs = allPages()[page];
  const info: PageInfo = { page, juz: juzOf(ayahs[0][0], ayahs[0][1]), ayahs, first: ayahs[0], last: ayahs[ayahs.length - 1], surahs: [...new Set(ayahs.map((x) => x[0]))],
    assessed: 0, verified: 0, retained: 0, claimed: 0, legacy: 0, none: 0, weakAyahs: [], dueAyahs: [], recitedAyahs: [], lesson: c.lessons.get(page), status: "none" };
  for (const x of ayahs) {
    const k = `${x[0]}:${x[1]}`; const r = st.mem[k];
    if (hasEvidence(r)) {
      info.assessed++; info.recitedAyahs.push(x);
      if (r!.bad || st.weak[k] || !isVerified(r)) info.weakAyahs.push(x);
      else { info.verified++; if (isRetained(r)) info.retained++; }
      if (r!.dueAt !== undefined ? r!.dueAt <= c.now : r!.due <= c.today) info.dueAyahs.push(x);
    } else if (r) info.legacy++;
    else if (c.claimed.has(k)) info.claimed++;
    else info.none++;
  }
  const n = ayahs.length;
  info.status = info.weakAyahs.length ? "weak" : info.dueAyahs.length ? "due" : info.lesson ? "learning"
    : info.retained === n ? "strong" : info.verified === n ? "learned" : info.assessed > 0 ? "partial"
    : info.claimed + info.legacy > 0 ? "claimed" : "none";
  return info;
}

/** All 604 pages, each exactly once, in order. */
export function pageTracker(st: Pick<AppState, "mem" | "weak" | "studentJourney" | "lessons">, pageOf: (s: number, a: number) => number, now = Date.now(), today = todayFn()): PageInfo[] {
  const ctx = { claimed: claimedAyahs(st), lessons: openLessons(st, pageOf), now, today };
  const out: PageInfo[] = [];
  for (let p = 1; p <= 604; p++) out.push(pageInfo(st, p, pageOf, ctx));
  return out;
}

export function statusCounts(pages: PageInfo[]): Record<PageStatus, number> {
  const c = Object.fromEntries(PAGE_STATUS_ORDER.map((s) => [s, 0])) as Record<PageStatus, number>;
  pages.forEach((p) => { c[p.status]++; });
  return c;
}

/** Plain-language evidence line for a page, e.g. "4 of 7 Ayahs recited · 3 said memorized (not checked)". */
export function evidenceLine(p: PageInfo): string {
  const n = p.ayahs.length; const parts: string[] = [];
  if (p.assessed) parts.push(`${p.assessed} of ${n} Ayah${n === 1 ? "" : "s"} recited and rated`);
  if (p.retained) parts.push(`${p.retained} long-term`);
  if (p.claimed) parts.push(`${p.claimed} said memorized (not checked)`);
  if (p.legacy) parts.push(`${p.legacy} marked memorized earlier (not checked)`);
  if (p.none && p.none < n) parts.push(`${p.none} not started`);
  return parts.length ? parts.join(" · ") : "Nothing recorded yet";
}
