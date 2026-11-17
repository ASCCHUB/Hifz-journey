// "Your Revision": at most two pending revision tasks at a time, each with Start Revision and Done.
//
// The tasks come from the existing daily planner (lib/planner.ts → SRS records); nothing here schedules anything.
// State (AppState.revisionSession) only remembers which pair is on screen and which items were closed:
//   • A pair is (re)filled only when a revision session starts (opening the Revision screen) or when the learner
//     deliberately asks for the next pair — never while they are looking at it, so Done never swaps in a surprise.
//   • Unfinished items from an earlier session are carried over and come first; then currently due plan tasks.
//   • Done through the app (a finished Practice) records "app" and marks the plan task done, exactly as before.
//   • Done without reciting here records "self": a self-report in history and the plan only. It never touches
//     mem / weak / SRS / assessments, so it can never count as recall, retention or stronger evidence.
import type { Ayah } from "./chunking";
import { buildPlan, markTask, pageInfos, planDay, type Plan, type PlanTask, type TaskKind } from "./planner";
import { addHist, type AppState } from "./store";

export const PAIR_SIZE = 2;
export const REVISION_KINDS: TaskKind[] = ["recent", "weak", "due", "rotation"];
export type RevisionItem = { id: string; kind: TaskKind; page: number; ayahs: Ayah[]; reason: string; addedDay: number; addedAt: number };
export type RevisionDone = { at: number; day: number; page: number; how: "app" | "self" };
export type RevisionSessionState = { items: RevisionItem[]; done: Record<string, RevisionDone>; updatedAt: number };

const empty = (): RevisionSessionState => ({ items: [], done: {}, updatedAt: 0 });

/** Plan revision tasks still to do today, in the planner's priority order. */
export function dueRevision(plan: Plan): PlanTask[] {
  return plan.tasks.filter((t) => REVISION_KINDS.includes(t.kind) && t.status === "todo");
}

/** An item is closed when it was marked done, or its page was finished/moved today in the plan, or (carried over)
 *  its page has since been revised in the app. Closed items are never shown again. */
function isClosed(st: AppState, plan: Plan, it: RevisionItem, now: number): boolean {
  const s = st.revisionSession;
  if (s?.done[it.id]) return true;
  const today = plan.tasks.find((t) => t.page === it.page && REVISION_KINDS.includes(t.kind));
  if (today && today.status !== "todo") return true;
  const info = pageInfos(st, now).get(it.page);
  if (!info) return true; // its records are gone (e.g. reset): nothing left to revise
  return !today && info.lastDay >= it.addedDay; // revised in the app since it was queued
}

/** The pair currently on screen (open items only, max two). Pure. */
export function visiblePair(st: AppState, plan: Plan = buildPlan(st), now = Date.now()): RevisionItem[] {
  return (st.revisionSession?.items || []).filter((it) => !isClosed(st, plan, it, now)).slice(0, PAIR_SIZE);
}

/** Due revision not in the visible pair and not closed today (kept queued, reachable through the full schedule). */
export function waitingRevision(st: AppState, plan: Plan = buildPlan(st), now = Date.now()): PlanTask[] {
  const shown = new Set(visiblePair(st, plan, now).map((i) => i.page));
  const day = planDay(now);
  const doneToday = new Set(Object.values(st.revisionSession?.done || {}).filter((d) => d.day === day).map((d) => d.page));
  return dueRevision(plan).filter((t) => !shown.has(t.page) && !doneToday.has(t.page));
}

/** Start a revision session: keep open carried-over items first, then top up to two from the plan. Mutates d. */
export function startRevisionSession(d: AppState, now = Date.now()): RevisionItem[] {
  const plan = buildPlan(d, now);
  const day = planDay(now);
  const prev = d.revisionSession || empty();
  const open = prev.items.filter((it) => !isClosed(d, plan, it, now)).slice(0, PAIR_SIZE);
  const fill = waitingRevision({ ...d, revisionSession: { ...prev, items: open } }, plan, now);
  const items = [...open];
  for (const t of fill) { if (items.length >= PAIR_SIZE) break; items.push({ id: `${day}:${t.kind}:${t.page}`, kind: t.kind, page: t.page, ayahs: t.ayahs, reason: t.reason, addedDay: day, addedAt: now }); }
  const same = items.length === prev.items.length && items.every((x, i) => x.id === prev.items[i]?.id);
  if (!same) d.revisionSession = { items, done: prune(prev.done, day), updatedAt: now };
  return items;
}

const prune = (done: Record<string, RevisionDone>, day: number) =>
  Object.fromEntries(Object.entries(done).filter(([, v]) => v.day >= day - 30));

/** Close one item. "app" after a finished in-app revision (evidence is written by Practice itself);
 *  "self" when the learner taps Done without reciting here — a self-report only. Mutates d. */
export function completeRevisionItem(d: AppState, itemId: string, how: "app" | "self", now = Date.now()) {
  const s = d.revisionSession || (d.revisionSession = empty());
  const it = s.items.find((x) => x.id === itemId);
  if (!it || s.done[itemId]) return;
  const day = planDay(now);
  s.done[itemId] = { at: now, day, page: it.page, how }; s.updatedAt = now;
  const plan = buildPlan(d, now);
  const task = plan.tasks.find((t) => t.page === it.page && REVISION_KINDS.includes(t.kind) && t.status === "todo");
  if (task) markTask(d, plan.day, task.id, how === "app" ? "done" : "self", now);
  if (how === "self") addHist(d, "Revision · self-reported", `Page ${it.page} · marked done without reciting in the app`, it.ayahs.length, 0);
}
