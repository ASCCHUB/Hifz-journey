// Deterministic reconciliation of two copies of the app state (two devices, or guest + account).
//
// Principles
//  • Evidence is unioned, never dropped: per-Ayah practice history events, recitation sessions,
//    session history, word-mistake counts, read pages and day logs from both sides survive.
//  • Records with practice evidence always beat evidence-free records (legacy "mark memorized").
//  • Claims and learning paths merge per item by `updatedAt`; deletion tombstones are items too,
//    so a deletion is never resurrected by an older live copy.
//  • The result does not depend on argument order (ties are broken by content), and merging the
//    result again with either input changes nothing (idempotent).
//  • Clocks: device clocks only decide *which schedule/preference wins* when both sides changed the
//    same record; they can no longer cause a whole state (and its evidence) to be discarded.
import type { AppState, JourneyPath, MemoryClaim, MemRec, StudentJourney } from "./store";

type Hist = NonNullable<MemRec["history"]>[number];
const stable = (x: unknown) => JSON.stringify(x);
/** Deterministic winner: higher key wins; on equal keys the larger serialized value wins. */
function pick<T>(a: T, b: T, key: (x: T) => number[]): T {
  const ka = key(a), kb = key(b);
  for (let i = 0; i < Math.max(ka.length, kb.length); i++) {
    const d = (ka[i] | 0) - (kb[i] | 0);
    if (d) return d > 0 ? a : b;
  }
  return stable(a) >= stable(b) ? a : b;
}

const hasEvidence = (r: MemRec) => (r.reps || 0) > 0 || (r.history?.length || 0) > 0 || (r.successes || 0) > 0 || (r.failures || 0) > 0;
const latestEvent = (r: MemRec) => (r.history || []).reduce((m, h) => Math.max(m, h.at || 0), 0);

export function mergeMem(a: MemRec | undefined, b: MemRec | undefined): MemRec | undefined {
  if (!a) return b; if (!b) return a;
  const ea = hasEvidence(a), eb = hasEvidence(b);
  if (ea !== eb) return ea ? a : b; // a legacy/claim-like record never replaces practice evidence
  const seen = new Map<string, Hist>();
  [...(a.history || []), ...(b.history || [])].forEach((h) => seen.set(`${h.at}:${h.result}:${h.interval}`, h));
  const history = [...seen.values()].sort((x, y) => x.at - y.at || stable(x).localeCompare(stable(y))).slice(-100);
  // Schedule fields come from the record that saw the most recent practice event.
  const primary = pick(a, b, (r) => [latestEvent(r), r.history?.length || 0, r.last || 0, r.reps || 0]);
  const okCount = history.filter((h) => h.result === "ok").length, failCount = history.length - okCount;
  const merged: MemRec = {
    ...primary,
    reps: Math.max(a.reps || 0, b.reps || 0, history.length),
    successes: Math.max(a.successes || 0, b.successes || 0, okCount),
    failures: Math.max(a.failures || 0, b.failures || 0, failCount),
  };
  if (history.length) merged.history = history; else delete merged.history;
  if (merged.successes === 0 && a.successes === undefined && b.successes === undefined) delete merged.successes;
  if (merged.failures === 0 && a.failures === undefined && b.failures === undefined) delete merged.failures;
  return merged;
}

function byId<T extends { id: string; updatedAt: number }>(a: T[], b: T[]): T[] {
  const m = new Map<string, T>();
  [...a, ...b].forEach((item) => { const cur = m.get(item.id); m.set(item.id, cur ? pick(cur, item, (x) => [x.updatedAt]) : item); });
  return [...m.values()].sort((x, y) => x.id.localeCompare(y.id));
}

export function mergeJourney(a: StudentJourney | null | undefined, b: StudentJourney | null | undefined): StudentJourney | null {
  if (!a) return b || null; if (!b) return a;
  const base = pick(a, b, (j) => [j.updatedAt]);
  const other = base === a ? b : a;
  const paths: JourneyPath[] = byId(a.paths, b.paths);
  const claims: MemoryClaim[] = byId(a.claims, b.claims);
  const live = (id: string | null) => !!id && paths.some((p) => p.id === id && !p.deletedAt);
  const primaryPathId = live(base.primaryPathId) ? base.primaryPathId : live(other.primaryPathId) ? other.primaryPathId : null;
  const rank = { in_progress: 0, skipped: 1, complete: 2 } as const;
  return {
    ...base,
    onboarding: rank[a.onboarding] >= rank[b.onboarding] ? a.onboarding : b.onboarding,
    paths: paths.map((p) => ({ ...p, isPrimary: p.id === primaryPathId })),
    claims, primaryPathId,
    preferences: pick(a.preferences, b.preferences, (p) => [p.updatedAt]),
    updatedAt: Math.max(a.updatedAt, b.updatedAt),
  };
}

function mergeRecords<V>(a: Record<string, V>, b: Record<string, V>, f: (x: V, y: V) => V): Record<string, V> {
  const out: Record<string, V> = {};
  for (const k of new Set([...Object.keys(a || {}), ...Object.keys(b || {})].sort())) {
    const x = a?.[k], y = b?.[k];
    out[k] = x === undefined ? y as V : y === undefined ? x : f(x, y);
  }
  return out;
}

export type MergeOptions = {
  /** Which side's settings/legacy-journey/goals win on conflict: "newer" (by state t) or a fixed side. */
  preferences?: "newer" | "a" | "b";
};

/** Merge two hydrated states. Pure; does not touch storage. */
export function mergeStates(a: AppState, b: AppState, opts: MergeOptions = {}): AppState {
  // A deliberate reset wins: the copy made before it must not bring the cleared progress back.
  const ra = a.resetAt || 0, rb = b.resetAt || 0;
  if (ra !== rb) { const w = ra > rb ? a : b; return { ...w, t: Math.max(a.t || 0, b.t || 0) }; }
  const prefSide = opts.preferences === "a" ? a : opts.preferences === "b" ? b : pick(a, b, (s) => [s.t || 0]);
  const loc = pick(a, b, (s) => [s.lastLocation?.t || 0]);
  const histKey = (h: AppState["hist"][number]) => `${h.t}:${h.k}:${h.l}`;
  const hist = new Map<string, AppState["hist"][number]>(); [...a.hist, ...b.hist].forEach((h) => hist.set(histKey(h), h));
  const rec = new Map<number, AppState["recSessions"][number]>(); [...(a.recSessions || []), ...(b.recSessions || [])].forEach((r) => rec.set(r.t, rec.has(r.t) ? pick(rec.get(r.t)!, r, () => []) : r));
  const goals = new Map<string, AppState["goals"][number]>(); [...(prefSide === a ? b : a).goals, ...prefSide.goals].forEach((g) => goals.set(g.id, g));
  return {
    ...prefSide,
    v: 1,
    t: Math.max(a.t || 0, b.t || 0),
    settings: prefSide.settings,
    journey: prefSide.journey,
    lastLocation: loc.lastLocation ?? null,
    lastPage: loc.lastLocation ? loc.lastPage : prefSide.lastPage,
    readPages: mergeRecords(a.readPages, b.readPages, Math.max),
    log: mergeRecords(a.log, b.log, (x, y) => { const o = { ...x }; (Object.keys(y) as (keyof typeof y)[]).forEach((f) => { o[f] = Math.max(o[f] || 0, y[f] || 0); }); return o; }),
    bookmarks: mergeRecords(a.bookmarks, b.bookmarks, (x, y) => pick(x, y, (v) => [v.t])),
    mem: mergeRecords(a.mem, b.mem, (x, y) => mergeMem(x, y)!),
    weak: mergeRecords(a.weak, b.weak, (x, y) => pick(x, y, (w) => [w.d, -w.c])),
    mw: mergeRecords(a.mw, b.mw, (x, y) => mergeRecords(x, y, Math.max)),
    goals: [...goals.values()].sort((x, y) => x.id.localeCompare(y.id)),
    hist: [...hist.values()].sort((x, y) => y.t - x.t || histKey(x).localeCompare(histKey(y))).slice(0, 60),
    mapProgress: mergeRecords(a.mapProgress, b.mapProgress, (x, y) => pick(x, y, (m) => [m.last, m.reps])),
    studentJourney: mergeJourney(a.studentJourney, b.studentJourney),
    best: Math.max(a.best || 0, b.best || 0),
    recSessions: [...rec.values()].sort((x, y) => y.t - x.t).slice(0, 30),
    rsus: mergeRecords(a.rsus || {}, b.rsus || {}, (x, y) => pick(x, y, (r) => [r.d, r.n])),
    lessons: mergeRecords(a.lessons || {}, b.lessons || {}, (x, y) => pick(x, y, (l) => [l.updatedAt])),
    dailyPlan: pick(a, b, (s) => [s.dailyPlan?.day ?? -1, s.dailyPlan?.updatedAt ?? 0]).dailyPlan ?? null,
    ...((a.revisionSession || b.revisionSession) ? { revisionSession: pick(a, b, (s) => [s.revisionSession?.updatedAt ?? 0]).revisionSession ?? undefined } : {}),
    assessments: mergeRecords(a.assessments || {}, b.assessments || {}, (x, y) => pick(x, y, (r) => [r.at])),
    tutor: a.tutor && b.tutor ? pick(a.tutor, b.tutor, (t) => [t.updatedAt]) : a.tutor || b.tutor,
  };
}

/** True when two states carry the same learner data (ignores the top-level change time). */
export function sameData(a: AppState, b: AppState): boolean {
  return stable({ ...a, t: 0 }) === stable({ ...b, t: 0 });
}

// ---------------------------------------------------------------- cloud reconciliation loop

/** Minimal storage contract, implemented by Supabase in supabase.ts and by a fake in tests. */
export type SyncRow = { state: unknown; version: string };
export type SyncBackend = {
  read(): Promise<SyncRow | null>;
  /** Insert the first row; resolves false if a row already exists (another device won the race). */
  insert(state: AppState, version: string): Promise<boolean>;
  /** Replace the row only if it still has `expected` version; resolves false otherwise. */
  replaceIf(expected: string, state: AppState, version: string): Promise<boolean>;
};

/**
 * Pull → merge → conditional write, retried on conflict. Never discards local data: on any failure the
 * caller keeps its local state. Returns the merged state the caller should adopt (merge it again with any
 * local edits made while this was running).
 */
export async function reconcile(backend: SyncBackend, local: AppState, hydrate: (s: unknown) => AppState, newVersion: () => string, maxAttempts = 5): Promise<AppState> {
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const row = await backend.read();
    const merged = row ? mergeStates(local, hydrate(row.state)) : local;
    if (row && sameData(merged, hydrate(row.state))) return merged; // cloud already has everything
    const ok = row ? await backend.replaceIf(row.version, merged, newVersion()) : await backend.insert(merged, newVersion());
    if (ok) return merged;
    // Someone else wrote in between: read again and merge their changes too.
  }
  throw new Error("sync-conflict-retries-exhausted");
}
