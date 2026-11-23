"use client";
// App state: kept in memory, saved durably on the device (IndexedDB + localStorage mirror, see persist.ts),
// and synced to Supabase when the user is signed in.
import type { RevisionSessionState } from "./revisionSession";
import type { ChainPrefs } from "./ayahChain";
import { useSyncExternalStore } from "react";
import type { SetName } from "./quran";
import { mergeStates, sameData } from "./sync";
import { configurePersistence, enqueueSave, getMirror, hasDurable, indexedDbBackend, markHydrated, migrateMirror, readDurable, readSnapshots, writeMirror, writeSnapshot, type DurableBackend, type MirrorBackend, type Snapshot as PersistSnapshot } from "./persist";

export type MemRec = { iv: number; due: number; dueAt?: number; last: number; reps: number; successes?: number; successDays?: number[]; failures?: number; confidence?: number; bad?: 1; history?: { at: number; result: "ok" | "hes" | "bad"; interval: number }[] };
export type JourneyPoint = { s: number; a: number };
export type JourneyPrefs = { start: JourneyPoint; end: JourneyPoint; last: JourneyPoint | null; lastEnd: JourneyPoint | null; studyMinutes: number; learningDays: number[]; restDays: number[]; recoverMode: "surah" | "juz"; recoverId: number };
export type JourneyRange = { start: JourneyPoint; end: JourneyPoint; label?: string };
export type JourneyPathKind = "forward" | "reverse_juz" | "short_surahs" | "surahs" | "juz" | "custom" | "collection";
export type JourneyPath = { id: string; name: string; kind: JourneyPathKind; ranges: JourneyRange[]; traversal: "forward" | "reverse_units" | "short_first"; cursor: { rangeIndex: number; s: number; a: number } | null; isPrimary: boolean; createdAt: number; updatedAt: number; deletedAt?: number };
export type MemoryClaim = { id: string; label: string; confidence: "comfortable" | "needs_revision" | "mostly_forgotten"; provenance: "self_reported"; ranges: JourneyRange[]; createdAt: number; updatedAt: number; deletedAt?: number };
export type StudentJourney = {
  schema: 1;
  updatedAt: number;
  onboarding: "in_progress" | "skipped" | "complete";
  learner: { displayName: string; experience: "beginner" | "some" | "returning" | "maintaining"; direction: "forward" | "reverse_juz" | "short_surahs" };
  paths: JourneyPath[];
  primaryPathId: string | null;
  claims: MemoryClaim[];
  preferences: { studyMinutes: number; newAmount: number; newUnit: "ayahs" | "half_pages" | "pages"; revisionAmount: number; revisionUnit: "ayahs" | "pages" | "minutes"; learningDays: number[]; prioritizeRevision: boolean; updatedAt: number };
};
/** Guided/recovery lesson progress (Phase 3.2/3.4). Lesson state is NOT memorization evidence. */
export type LessonState = {
  id: string; title: string;
  unit: { kind: "page" | "range"; page?: number; start: JourneyPoint; end: JourneyPoint };
  template: "learn" | "recover"; mode: "guided" | "manual"; level: "guided" | "standard" | "challenge";
  step: number; results: Record<string, "ok" | "hes" | "bad">; hinted: Record<string, true>;
  startedAt: number; updatedAt: number; completedAt?: number; savedToHifz?: number; pathId?: string;
};
/** Today's plan bookkeeping (Phase 3.3). Completion is recorded only after a practice session ends. */
/** "self" = the learner tapped Done without reciting in the app: a self-report, never Hifz evidence. */
export type DailyPlanState = { day: number; tasks: Record<string, { status: "done" | "skipped" | "deferred" | "self"; at: number }>; overrideNew?: boolean; updatedAt: number };
/** Sampling diagnostic for one Mushaf page (Phase 3.4). Diagnostic only: never certifies the whole page. */
export type PageAssessment = {
  page: number; at: number; attempts: number;
  prompts: { s: number; a: number; kind: "page_start" | "continue"; result: "ok" | "hes" | "bad" }[];
  verdict: "clean" | "needs_help" | "forgot";
  recovery?: { attempts: number; lastResult: "ok" | "hes" | "bad"; at: number };
};
/** How the learner likes to be taught (Smart Hifz Tutor). Single copy; the reciter stays in settings.reciter. */
export type TutorPrefs = {
  mode: "guided" | "manual"; level: "guided" | "standard" | "challenge";
  portion: "page" | "half_page"; repeat: number;
  /** New Learning default: Mushaf page learning or the Ayah-by-Ayah tutor (absent in older saves). */
  method?: "mushaf" | "ayah";
  visibility?: "full" | "unlearned" | "current";
  introDismissedAt?: number;   // "How this method works" dismissed (separate from profile onboarding)
  /** Ayah Chain listening mode (lib/ayahChain.ts). Optional: absent in older saves = off; read via readChainPrefs(). */
  chain?: ChainPrefs;
  updatedAt: number;
};
export type Goal = { id: string; type: "memorize" | "revise" | "read"; k: "juz" | "surah" | "all"; v: number; c: number; due: number };
export type Hist = { t: number; k: string; l: string; n: number; m: number };
export type MindMapStatus = "new" | "learning" | "revision" | "remembered" | "strong";
export type MindMapRec = { status: MindMapStatus; due: number; last: number; reps: number; intervalDays: number; quizAttempts: number; quizCorrect: number; stage?: number; selectedAyah?: number; completedStages?: number[]; assessmentSuccesses?: number; assessmentDays?: number[] };
export type RecMistake = { s: number; a: number; w: number; type: "incorrect" | "missing" | "uncertain"; heard?: string; verdict?: "confirmed" | "dismissed" };
export type RecSession = {
  t: number; title: string; engine: "local" | "browser"; secs: number;
  range: [number, number, number, number]; // start surah, ayah, end surah, ayah
  sum: { reached: number; correct: number; incorrect: number; missing: number; uncertain: number; extra: number; repeats: number; confirmed: number; review: number; accuracy: number | null };
  ayahs: Record<string, "clean" | "suspected" | "confirmed" | "uncertain" | "partial">;
  mistakes: RecMistake[];
};
export type DayLog = { a?: number; pg?: number; t?: number; rev?: number; nw?: number };
export type Settings = {
  theme: "auto" | "light" | "dark";
  tr: SetName;
  reciter: string;
  speed: number;
  newTarget: number;   // new ayat to memorize each day
  revTarget: number;   // ayat to revise each day
  pagesTarget: number; // mushaf pages to read each day
  zoom: number;
  readerAyahHighlight?: boolean;
  quizLength: number;
  quizDifficulty: "guided" | "challenge";
  reminderOn?: boolean;   // daily notification (Android app)
  reminderTime?: string;  // "HH:MM", local time — start of the learning window
  reminderEnd?: string;   // "HH:MM", end of the learning window (repeat reminders until then)
  reminderEvery?: number; // minutes between repeat reminders inside the window (legacy; replaced by follow-ups)
  /** Hifz & revision reminders (Android app). Absent in older saves; derived from the legacy fields. */
  reminders?: ReminderPrefs;
  /** Learning view: Ayah-by-Ayah or the full 15-line Mushaf page. One shared preference for every session. */
  learnView?: "ayah" | "mushaf";
  /** Opt-in: show Mutashabihat examples still awaiting scholarly review (clearly labelled). */
  mutashabihatPending?: boolean;
};
export type ReminderPrefs = {
  on: boolean; hifzOn: boolean; hifzTime: string; revOn: boolean; revTime: string;
  days: number[];          // 0 = Sunday … 6 = Saturday
  followUpMin: number;     // delay before "Did you complete …?"
  maxFollowUps: number;    // follow-ups per activity per day (notification limit)
  quietStart?: string; quietEnd?: string; // "HH:MM"; both empty = no quiet hours
  sound: "default" | "silent";
};
/** A reminder check-in answer. A self-report only: never Hifz evidence, never changes SRS or plan status. */
export type Checkin = { kind: "hifz" | "rev"; day: number; answer: "yes" | "not_yet" | "later" | "skip"; verifiedInApp: boolean; source: "notification" | "app"; at: number };
export type AppState = {
  v: 1;
  t: number; // last change, used to pick the newer copy when syncing
  settings: Settings;
  lastPage: number;
  /** Optional exact last Ayah; absent in older v1 saves and safely defaults to null. */
  lastLocation?: { s: number; a: number; t: number } | null;
  readPages: Record<string, number>;
  log: Record<string, DayLog>;
  bookmarks: Record<string, { t: number; f: 0 | 1 }>;
  mem: Record<string, MemRec>;                 // per-ayah memorization record, keyed "surah:ayah"
  weak: Record<string, { c: number; d: number; lastCleanDay?: number }>;
  mw: Record<string, Record<string, number>>;  // word-level mistakes, keyed "surah:ayah" then word index
  goals: Goal[];
  hist: Hist[];
  mapProgress: Record<string, MindMapRec>;
  journey: JourneyPrefs;
  /** Optional Phase 3.1 profile/path/claim data; legacy `journey` remains intact. */
  studentJourney?: StudentJourney | null;
  best: number;
  recSessions: RecSession[];                   // live recitation sessions (newest first, capped)
  rsus: Record<string, { n: number; d: number }>; // per-ayah count of sessions with unreviewed speech-recognition suspicions
  lessons?: Record<string, LessonState>;         // guided/recovery lesson progress, keyed by lesson id
  dailyPlan?: DailyPlanState | null;             // today's plan task statuses
  revisionSession?: RevisionSessionState | null; // the two-task "Your Revision" pair and closed items (not evidence)
  assessments?: Record<string, PageAssessment>;  // page sampling diagnostics, keyed by page number
  tutor?: TutorPrefs;                            // teaching preferences (mode, level, portion, repeat, intro)
  checkins?: Record<string, Checkin>;            // reminder check-ins keyed "day:kind" (self-reports, not evidence)
  /** Time of the last deliberate reset. Sync never merges back data from a copy with an older reset time. */
  resetAt?: number;
};

const KEY = "hifz-companion-state-v1";
const GUEST_KEY = `${KEY}:guest`;
let profileKey = GUEST_KEY;
export const today = () => { const d = new Date(); return Math.floor((d.getTime() - d.getTimezoneOffset() * 60000) / 86400000); };

export const defaultTutor = (): TutorPrefs => ({ mode: "guided", level: "guided", portion: "page", repeat: 3, visibility: "full", updatedAt: 0 });

export function defaultState(): AppState {
  return {
    v: 1, t: 0,
    settings: { theme: "auto", tr: "tr-ur-maududi", reciter: "Alafasy_128kbps", speed: 1, newTarget: 5, revTarget: 60, pagesTarget: 2, zoom: 1, readerAyahHighlight: true, quizLength: 10, quizDifficulty: "guided" },
    lastPage: 1, lastLocation: null, readPages: {}, log: {}, bookmarks: {}, mem: {}, weak: {}, mw: {}, goals: [], hist: [], mapProgress: {},
    journey: { start: { s: 1, a: 1 }, end: { s: 1, a: 7 }, last: null, lastEnd: null, studyMinutes: 20, learningDays: [0, 1, 2, 3, 4, 5, 6], restDays: [], recoverMode: "surah", recoverId: 1 }, studentJourney: null, best: 0,
    recSessions: [], rsus: {}, lessons: {}, dailyPlan: null, assessments: {}, tutor: defaultTutor(),
  };
}

/** Fill fields added in later releases while retaining the user's v1 reading and Hifz data. */
export function hydrateState(saved: Partial<AppState>): AppState {
  const defaults = defaultState();
  const source = saved && typeof saved === "object" ? saved : {};
  const record = <T,>(value: unknown, fallback: T): T =>
    value && typeof value === "object" && !Array.isArray(value) ? value as T : fallback;
  return {
    ...defaults,
    ...source,
    settings: { ...defaults.settings, ...record<Partial<Settings>>(source.settings, {}) },
    journey: { ...defaults.journey, ...record<Partial<JourneyPrefs>>(source.journey, {}) },
    studentJourney: (() => {
      const savedJourney = record<Partial<StudentJourney> | null>(source.studentJourney, null);
      return savedJourney?.schema === 1 && Array.isArray(savedJourney.paths) && Array.isArray(savedJourney.claims)
        && !!savedJourney.learner && !!savedJourney.preferences
        ? savedJourney as StudentJourney : null;
    })(),
    readPages: record(source.readPages, defaults.readPages),
    log: record(source.log, defaults.log),
    bookmarks: record(source.bookmarks, defaults.bookmarks),
    mem: record(source.mem, defaults.mem),
    weak: record(source.weak, defaults.weak),
    mw: record(source.mw, defaults.mw),
    goals: Array.isArray(source.goals) ? source.goals : defaults.goals,
    hist: Array.isArray(source.hist) ? source.hist : defaults.hist,
    mapProgress: record(source.mapProgress, defaults.mapProgress),
    recSessions: Array.isArray(source.recSessions) ? source.recSessions : defaults.recSessions,
    rsus: record(source.rsus, defaults.rsus),
    lessons: record(source.lessons, {}),
    dailyPlan: source.dailyPlan && typeof source.dailyPlan === "object" && Number.isInteger(source.dailyPlan.day) ? { ...source.dailyPlan, tasks: record(source.dailyPlan.tasks, {}) } : null,
    assessments: record(source.assessments, {}),
    tutor: { ...defaultTutor(), ...record<Partial<TutorPrefs>>(source.tutor, {}) },
    ...(source.checkins && typeof source.checkins === "object" ? { checkins: record(source.checkins, {}) } : {}),
    // Optional (older saves have none): kept absent rather than null so unchanged data stays byte-identical.
    ...(source.revisionSession && typeof source.revisionSession === "object" && Array.isArray(source.revisionSession.items) ? { revisionSession: { items: source.revisionSession.items.filter((i) => i && typeof i.id === "string" && Number.isInteger(i.page)), done: record(source.revisionSession.done, {}), updatedAt: Number(source.revisionSession.updatedAt) || 0 } } : {}),
  };
}

const SERVER = defaultState();
let state: AppState = SERVER;
let loaded = false;
const listeners = new Set<() => void>();
let onChange: ((s: AppState) => void) | null = null;

// ---- durable persistence (B1): IndexedDB primary + localStorage mirror, via lib/persist.ts ----
let persistenceConfigured = false;
function browserLocalStorage(): MirrorBackend | null { try { return typeof localStorage !== "undefined" && localStorage ? localStorage : null; } catch { return null; } }
/** The configured mirror — the same storage the save layer writes to. */
function mirrorStorage(): MirrorBackend | null { initPersistence(); return getMirror(); }
function initPersistence() {
  if (persistenceConfigured) return; persistenceConfigured = true;
  let d: DurableBackend | null = null;
  try { if (typeof indexedDB !== "undefined" && indexedDB) d = indexedDbBackend(indexedDB); } catch { d = null; }
  configurePersistence(d, browserLocalStorage());
}
/** Tests/advanced use: replace the storage backends (the next load() re-reads). */
export function usePersistenceBackends(d: DurableBackend | null, m: MirrorBackend | null) { configurePersistence(d, m); persistenceConfigured = true; loaded = false; state = SERVER; }

function readMirror(key: string): AppState | null {
  try { const raw = mirrorStorage()?.getItem(key); if (!raw) return null; const o = JSON.parse(raw) as AppState; return o && o.v === 1 ? hydrateState(o) : null; } catch { return null; }
}

function load() {
  if (loaded || typeof window === "undefined") return;
  loaded = true;
  initPersistence();
  const ls = mirrorStorage();
  try {
    // The old shared key belongs to guest progress. Never migrate it into an account.
    // Only remove the old key after the copy has verifiably been written (a failed copy must not lose it).
    const legacy = ls?.getItem(KEY);
    if (legacy && ls) {
      if (!ls.getItem(GUEST_KEY)) { try { ls.setItem(GUEST_KEY, legacy); } catch { /* keep legacy key */ } }
      if (ls.getItem(GUEST_KEY) !== null) ls.removeItem(KEY);
    }
  } catch { /* storage blocked: start from memory */ }
  const fromMirror = readMirror(profileKey) ?? (profileKey === GUEST_KEY ? readMirror(KEY) : null);
  state = fromMirror ?? defaultState();
  hydration = hydrateFromDurable(profileKey, fromMirror).catch(() => { /* a failed durable read leaves the mirror state */ });
}

/**
 * Merge the durable (IndexedDB) copy into memory, then allow writes for this profile. Non-destructive:
 * an empty or unreadable durable store never replaces anything, and the mirror is migrated by copying.
 */
let hydration: Promise<void> = Promise.resolve();
/** Resolves once the durable (IndexedDB) copy has been merged into memory. Screens that derive and save state
 *  from the learner's records on open (e.g. the Revision pair) wait for this so they never act on a partial copy. */
export function storeReady(): Promise<void> { load(); return hydration; }
async function hydrateFromDurable(key: string, fromMirror: AppState | null) {
  if (!hasDurable()) { await markHydrated(key); return; }
  const rec = await readDurable(key);
  if (!rec && fromMirror) await migrateMirror(key, fromMirror);
  if (key === profileKey && rec) {
    const merged = mergeStates(state, hydrateState(rec.state));
    merged.t = Math.max(state.t || 0, rec.t || 0, merged.t || 0);
    if (!sameData(merged, state)) { state = merged; writeMirror(key, state); listeners.forEach((l) => l()); }
    enqueueSave(key, state);
  }
  await markHydrated(key);
  if (key === profileKey) void migrateMirrorSnapshots(key);
}

export function getState(): AppState { load(); return state; }
export function setProfile(userId: string | null) {
  if (typeof window === "undefined") return;
  load();
  profileKey = userId ? `${KEY}:user:${userId}` : GUEST_KEY;
  loaded = false; state = SERVER; load();
  listeners.forEach((l) => l());
}
export const currentProfileKey = () => profileKey;
/** Guest progress from the localStorage mirror (synchronous; may be older than the durable copy). */
export function guestProgress(): AppState | null {
  if (typeof window === "undefined") return null;
  initPersistence();
  return readMirror(GUEST_KEY) ?? readMirror(KEY);
}
/** Guest progress from both the mirror and the durable store, merged (use this in the UI). */
export async function guestProgressDurable(): Promise<AppState | null> {
  const m = guestProgress(); const rec = await readDurable(GUEST_KEY);
  if (rec && m) return mergeStates(m, hydrateState(rec.state));
  return rec ? hydrateState(rec.state) : m;
}
/** Explicit, repeatable guest-to-account merge; keep the guest backup intact.
 *  Uses the same field-level merge as cloud sync; the account's settings/preferences win on conflict. */
export function mergeGuestProgress(guestState?: AppState | null) {
  const guest = guestState ?? guestProgress(); if (!guest) return false;
  void saveSnapshot("before merging guest progress");
  const merged = mergeStates(getState(), hydrateState(guest), { preferences: "a" });
  update((d) => { Object.assign(d, merged); });
  return true;
}
export async function mergeGuestProgressDurable() { return mergeGuestProgress(await guestProgressDurable()); }

// ---- local recovery snapshots (before sync replacement, guest merge and backup restore) ----
// Kept in IndexedDB (not localStorage) so they never compete with saving progress. Without IndexedDB they
// fall back to localStorage only if there is room; a failed snapshot never blocks or fails a save.
export type Snapshot = PersistSnapshot;
const SNAP_LIMIT = 3;
const snapKey = (key = profileKey) => `${key}:snapshots`;
function legacySnapshots(key = profileKey): Snapshot[] {
  try { const v = JSON.parse(mirrorStorage()?.getItem(snapKey(key)) || "[]"); return Array.isArray(v) ? v : []; } catch { return []; }
}
async function migrateMirrorSnapshots(key: string) {
  const old = legacySnapshots(key); if (!old.length || !hasDurable()) return;
  const cur = await readSnapshots(key);
  for (const s of [...old].reverse()) if (!cur.some((c) => c.at === s.at)) await writeSnapshot(key, s, SNAP_LIMIT);
  const after = await readSnapshots(key);
  if (old.every((s) => after.some((c) => c.at === s.at) || after.length >= SNAP_LIMIT)) { try { mirrorStorage()?.removeItem(snapKey(key)); } catch { /* keep */ } }
}
export async function listSnapshots(): Promise<Snapshot[]> {
  if (typeof window === "undefined") return [];
  load();
  return hasDurable() ? readSnapshots(profileKey) : legacySnapshots();
}
/** Keep a copy of the current state (no credentials are ever part of AppState). Oldest is dropped beyond 3. */
export async function saveSnapshot(reason: string): Promise<boolean> {
  if (typeof window === "undefined") return false;
  load();
  const snap: Snapshot = { at: Date.now(), reason, state };
  if (hasDurable()) return writeSnapshot(profileKey, snap, SNAP_LIMIT);
  try { mirrorStorage()?.setItem(snapKey(), JSON.stringify([snap, ...legacySnapshots()].slice(0, SNAP_LIMIT))); return true; }
  catch { return false; } // no room: skip the snapshot rather than endanger the progress save
}
/** Restore a snapshot; the current state is itself snapshotted first, so this is undoable. */
export async function restoreSnapshot(index: number) {
  const snap = (await listSnapshots())[index]; if (!snap) return false;
  await saveSnapshot("before restoring a snapshot");
  const restored = hydrateState(snap.state), now = Date.now();
  // Undoing a reset: give the restored copy a newer reset time so sync does not reapply the reset.
  if ((state.resetAt || 0) > (restored.resetAt || 0)) restored.resetAt = now;
  commit({ ...restored, t: now });
  return true;
}
/** Backup restore: replaces this device's progress after keeping a snapshot of it. */
export function restoreBackup(backup: AppState) {
  void saveSnapshot("before restoring a backup code");
  commit({ ...hydrateState(backup), t: Date.now() });
}
/**
 * Deliberate reset. "journey" clears the learning path, memorized claims, lessons and plans but keeps
 * reading history, bookmarks and goals. "all" clears every kind of progress. Settings (theme, reciter,
 * translation, teaching preferences) are kept. A snapshot is saved first so it can be undone.
 */
export async function resetProgress(scope: "journey" | "all") {
  load();
  await saveSnapshot(scope === "all" ? "before resetting all progress" : "before resetting the journey");
  const fresh = defaultState(), now = Date.now();
  const next: AppState = scope === "all"
    ? { ...fresh, settings: state.settings, tutor: state.tutor }
    : { ...state, journey: fresh.journey, studentJourney: null, lessons: {}, dailyPlan: null, revisionSession: undefined, mem: {}, weak: {}, mw: {}, assessments: {}, mapProgress: {}, recSessions: [], rsus: {} };
  commit({ ...hydrateState(next), resetAt: now, t: now });
}
export function subscribe(fn: () => void) { listeners.add(fn); return () => { listeners.delete(fn); }; }
export function setChangeHandler(fn: ((s: AppState) => void) | null) { onChange = fn; }

/** Apply a new state in memory, write the localStorage mirror now, and queue the durable save. The save
 *  outcome (saved / unsaved) is reported by lib/persist.ts — never assumed. */
function commit(next: AppState, fromRemote = false) {
  state = next;
  initPersistence();
  writeMirror(profileKey, state);
  void enqueueSave(profileKey, state);
  listeners.forEach((l) => l());
  if (!fromRemote && onChange) onChange(state);
}

/** Change the state. The function receives a private copy it may mutate freely. */
export function update(fn: (draft: AppState) => void) {
  load();
  const draft: AppState = JSON.parse(JSON.stringify(state));
  fn(draft);
  draft.t = Math.max(Date.now(), (state.t || 0) + 1); // strictly increasing, so newer always wins
  commit(draft);
}
export function replaceState(next: AppState) { load(); commit(hydrateState(next), true); }
export function useStore(): AppState {
  return useSyncExternalStore(subscribe, getState, () => SERVER);
}

// ---- small helpers used across modules ----
export function logAdd(d: AppState, field: keyof DayLog, n: number) {
  const k = String(today());
  const l = d.log[k] || (d.log[k] = {});
  l[field] = (l[field] || 0) + n;
  const keys = Object.keys(d.log);
  if (keys.length > 400) delete d.log[keys.sort((a, b) => +a - +b)[0]];
  d.best = Math.max(d.best || 0, streak(d));
}
export const isActive = (s: AppState, day: number) => { const l = s.log[String(day)]; return !!(l && (l.a || l.pg || l.rev || l.nw)); };
export function streak(s: AppState) { let d = today(), n = 0; if (!isActive(s, d)) d--; while (isActive(s, d)) { n++; d--; } return n; }
export function addHist(d: AppState, k: string, l: string, n: number, m: number) { d.hist.unshift({ t: Date.now(), k, l, n, m }); if (d.hist.length > 60) d.hist.pop(); }
export function markRead(d: AppState, pg: number) { if (d.readPages[String(pg)] !== today()) { d.readPages[String(pg)] = today(); logAdd(d, "pg", 1); } }
export function totals(s: AppState) { let a = 0, t = 0; Object.values(s.log).forEach((l) => { a += l.a || 0; t += l.t || 0; }); return { ayat: a, seconds: t, pages: Object.keys(s.readPages).length }; }
export const fmtMin = (sec: number) => { const m = Math.round(sec / 60); return m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m} min`; };
