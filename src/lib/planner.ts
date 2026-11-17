// Today's Hifz plan (Phase 3.3) — a pure function of the existing per-Ayah SRS records.
//
// Page-level tasks are built from Ayah records (no second scheduler):
//   1. recent   pages first learned in the last 14 days, revised every day (near revision)
//   2. weak     pages with an Ayah in the weak list or with an open mistake
//   3. due      pages with an Ayah whose SRS review is due (most overdue first)
//   4. rotation the least-recently revised remaining pages, so every memorized page comes round
//               within a cycle (no page is neglected even when the SRS says "not due")
//   5. new      today's new lesson from the primary path (only after revision fits in the budget)
//   6. assess   a self-reported (claimed) page not yet recited here: a sampling check (Phase 3.4)
// Each page appears at most once (in its highest-priority queue). Revision is capped to the day's budget so a
// missed week never produces an impossible list; the rest is reported as "carried over". When revision takes
// most of the time, new memorization is paused by recommendation; the learner may override.
// Time per page comes from the learner's own logged practice when there is enough of it; otherwise a
// clearly labelled default is used.
import { learnHref } from "./mushafLesson";
import { claimedAyahs, hasEvidence } from "./coverage";
import { nextPathLesson } from "./journey";
import { dailyPrefs, newPagesPerDay } from "./prefs";
import { pageOf, Q } from "./quran";
import type { AppState, DailyPlanState } from "./store";
import type { Ayah } from "./chunking";

export type TaskKind = "recent" | "weak" | "due" | "rotation" | "new" | "assess";
export type PlanTask = { id: string; kind: TaskKind; page: number; ayahs: Ayah[]; reason: string; minutes: number; status: "todo" | "done" | "skipped" | "deferred" | "self"; href?: string };
export type Plan = {
  day: number; budget: number; tasks: PlanTask[];
  revisionMinutes: number; newMinutes: number; minutesPerPage: number; estimateSource: "measured" | "default";
  carriedOver: number; overloaded: boolean; newPaused: boolean; restDay: boolean; cycleDays: number;
};

const DEFAULT_MIN_PER_REVISION_PAGE = 3;  // labelled default when there is no practice history
const DEFAULT_MIN_PER_NEW_PAGE = 30;      // labelled default for learning one new page
const RECENT_DAYS = 14;
const dayOf = (ms: number) => Math.floor((ms - new Date(ms).getTimezoneOffset() * 60000) / 86400000);

type PageInfo = { page: number; ayahs: Ayah[]; weakAyahs: Ayah[]; due: boolean; overdueDays: number; weak: boolean; firstDay: number | null; lastDay: number };

export function pageInfos(st: Pick<AppState, "mem" | "weak">, now = Date.now()): Map<number, PageInfo> {
  const today = dayOf(now);
  const pages = new Map<number, PageInfo>();
  for (const [k, r] of Object.entries(st.mem)) {
    const [s, a] = k.split(":").map(Number) as Ayah;
    if (!s || !a) continue;
    const pg = pageOf(s, a);
    const p = pages.get(pg) || { page: pg, ayahs: [], weakAyahs: [], due: false, overdueDays: 0, weak: false, firstDay: null, lastDay: -Infinity };
    p.ayahs.push([s, a]);
    const isWeak = !!st.weak[k] || !!r.bad;
    if (isWeak) { p.weak = true; p.weakAyahs.push([s, a]); }
    if (r.dueAt !== undefined ? r.dueAt <= now : r.due <= today) { p.due = true; p.overdueDays = Math.max(p.overdueDays, today - r.due); }
    const first = r.history?.length ? dayOf(r.history[0].at) : r.successDays?.length ? Math.min(...r.successDays) : null;
    if (first !== null && hasEvidence(r)) p.firstDay = p.firstDay === null ? first : Math.min(p.firstDay, first);
    p.lastDay = Math.max(p.lastDay, r.last || 0);
    pages.set(pg, p);
  }
  pages.forEach((p) => p.ayahs.sort((x, y) => x[0] - y[0] || x[1] - y[1]));
  return pages;
}

/** Minutes per revised page from the learner's own log (seconds of practice ÷ Ayahs practised), if enough data. */
export function measuredMinutesPerPage(st: Pick<AppState, "log">, today: number): number | null {
  let secs = 0, ayahs = 0;
  for (let d = today - 28; d <= today; d++) { const l = st.log[String(d)]; if (l) { secs += l.t || 0; ayahs += l.a || 0; } }
  if (ayahs < 30 || secs < 600) return null;
  return Math.min(15, Math.max(1, (secs / ayahs) * 15 / 60));
}

export function buildPlan(st: AppState, now = Date.now(), saved: DailyPlanState | null = st.dailyPlan ?? null): Plan {
  const day = dayOf(now);
  const prefs = dailyPrefs(st);
  const budget = prefs.studyMinutes;
  const restDay = !prefs.learningDays.includes(new Date(now).getDay());
  const measured = measuredMinutesPerPage(st, day);
  const perPage = measured ?? DEFAULT_MIN_PER_REVISION_PAGE;
  const status = (id: string) => (saved?.day === day ? saved.tasks[id]?.status : undefined) ?? "todo";
  const infos = pageInfos(st, now);
  const used = new Set<number>();
  const tasks: PlanTask[] = [];
  const memorizedPages = [...infos.values()];
  const cycleDays = Math.max(7, Math.ceil(memorizedPages.length / Math.max(1, Math.floor((budget * (prefs.prioritizeRevision ? 0.8 : 0.6)) / perPage))));
  const add = (kind: TaskKind, p: PageInfo, reason: string, ayahs = p.ayahs) => {
    if (used.has(p.page)) return; used.add(p.page);
    tasks.push({ id: `${day}:${kind}:${p.page}`, kind, page: p.page, ayahs, reason, minutes: Math.max(1, Math.round(perPage * Math.max(0.3, ayahs.length / 15))), status: status(`${day}:${kind}:${p.page}`) });
  };
  const notToday = (p: PageInfo) => p.lastDay < day;
  memorizedPages.filter((p) => p.firstDay !== null && p.firstDay >= day - RECENT_DAYS && notToday(p)).sort((a, b) => b.firstDay! - a.firstDay!)
    .forEach((p) => add("recent", p, `Learned ${day - p.firstDay! === 0 ? "today" : `${day - p.firstDay!} day${day - p.firstDay! === 1 ? "" : "s"} ago`} — recent pages are revised daily`));
  memorizedPages.filter((p) => p.weak).sort((a, b) => b.weakAyahs.length - a.weakAyahs.length || a.page - b.page)
    .forEach((p) => add("weak", p, `${p.weakAyahs.length} weak ayah${p.weakAyahs.length === 1 ? "" : "s"} from earlier mistakes`, p.weakAyahs));
  memorizedPages.filter((p) => p.due).sort((a, b) => b.overdueDays - a.overdueDays || a.page - b.page)
    .forEach((p) => add("due", p, p.overdueDays > 0 ? `Review due ${p.overdueDays} day${p.overdueDays === 1 ? "" : "s"} ago` : "Review due today"));
  const rotationQuota = Math.ceil(memorizedPages.length / cycleDays);
  memorizedPages.filter((p) => !used.has(p.page) && notToday(p)).sort((a, b) => a.lastDay - b.lastDay || a.page - b.page).slice(0, rotationQuota)
    .forEach((p) => add("rotation", p, `Rotation — last revised ${Number.isFinite(p.lastDay) && p.lastDay > 0 ? `${day - p.lastDay} days ago` : "before tracking began"} (every page comes round about every ${cycleDays} days)`));

  // Cap revision to the budget (priority order is preserved); the rest is carried over.
  const revCap = budget * (prefs.prioritizeRevision ? 1 : 0.7);
  let rev = 0, carriedOver = 0;
  const kept: PlanTask[] = [];
  for (const t of tasks) { if (rev + t.minutes <= revCap || (kept.length === 0)) { kept.push(t); rev += t.minutes; } else carriedOver++; }

  // New memorization from the primary path.
  let newMinutes = 0, newPaused = false;
  const overloaded = rev > budget * 0.8;
  const primary = st.studentJourney?.paths.find((p) => p.id === st.studentJourney?.primaryPathId && !p.deletedAt);
  const wantNew = newPagesPerDay(prefs) > 0 && !restDay;
  if (wantNew && primary) {
    const next = nextPathLesson(Q(), primary, pageOf);
    if (next) {
      const minutes = Math.max(5, Math.round(DEFAULT_MIN_PER_NEW_PAGE * Math.min(1, newPagesPerDay(prefs))));
      newPaused = (overloaded || rev + minutes > budget * 1.1) && !(saved?.day === day && saved.overrideNew);
      if (!newPaused) {
        const id = `${day}:new:${next.page}`;
        kept.push({ id, kind: "new", page: next.page, ayahs: [], reason: `Next on your path “${primary.name}”`, minutes, status: status(id), href: learnHref({ start: next.start, end: next.end, pathId: primary.id }, pageOf) });
        newMinutes = minutes;
      }
    }
  }
  // One sampling check of self-reported memorization per day, if there is room.
  if (rev + newMinutes + 5 <= budget) {
    const claimed = claimedAyahs(st);
    const claimedPages = [...new Set([...claimed.keys()].filter((k) => !st.mem[k]).map((k) => { const [s, a] = k.split(":").map(Number); return pageOf(s, a); }))].filter((pg) => !used.has(pg) && !st.assessments?.[String(pg)]).sort((a, b) => a - b);
    if (claimedPages.length) { const pg = claimedPages[0]; const id = `${day}:assess:${pg}`; kept.push({ id, kind: "assess", page: pg, ayahs: [], reason: `You said you know page ${pg}; a short check helps plan its revision (${claimedPages.length} claimed page${claimedPages.length === 1 ? "" : "s"} not yet checked)`, minutes: 5, status: status(id), href: `/assess?page=${pg}` }); }
  }
  return { day, budget, tasks: kept, revisionMinutes: rev, newMinutes, minutesPerPage: Math.round(perPage * 10) / 10, estimateSource: measured ? "measured" : "default", carriedOver, overloaded, newPaused, restDay, cycleDays };
}

/** Record a task outcome for today. Only called after a practice session ends (or the learner skips/defers). */
export function markTask(d: AppState, day: number, taskId: string, status: "done" | "skipped" | "deferred" | "self", now = Date.now()) {
  if (!d.dailyPlan || d.dailyPlan.day !== day) d.dailyPlan = { day, tasks: {}, updatedAt: now };
  d.dailyPlan.tasks[taskId] = { status, at: now }; d.dailyPlan.updatedAt = now;
}
export function setOverrideNew(d: AppState, day: number, on: boolean, now = Date.now()) {
  if (!d.dailyPlan || d.dailyPlan.day !== day) d.dailyPlan = { day, tasks: {}, updatedAt: now };
  d.dailyPlan.overrideNew = on; d.dailyPlan.updatedAt = now;
}
export const planDay = dayOf;
