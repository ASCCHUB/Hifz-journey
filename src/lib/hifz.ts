// Memorization logic: per-ayah records, spaced revision, surah status, lesson recommendation.
import { count, key, parseKey, Q } from "./quran";
import { addHist, logAdd, today, type AppState } from "./store";

export type Status = "none" | "learning" | "memorized" | "revise" | "strong";
export const STATUS_LABEL: Record<Status, string> = {
  none: "Not started", learning: "Learning", memorized: "Memorized", revise: "Needs revision", strong: "Strong",
};
export const STATUS_COLOR: Record<Status, string> = {
  none: "transparent", learning: "var(--learn)", memorized: "#8ca0b3", revise: "var(--revise)", strong: "var(--strong)",
};

/** An ayah counts as learned only after at least one clean recall, or an explicit existing-memory mark. */
export function isMemorized(rec: AppState["mem"][string] | undefined): boolean {
  if (!rec) return false;
  if (rec.reps === 0 && !rec.bad) return true; // explicitly marked as already known
  if (rec.successes !== undefined) return rec.successes > 0;
  return rec.iv > 0 && !rec.bad; // legacy records predate the success counter
}

export function surahStatus(st: AppState, s: number): { status: Status; done: number; total: number } {
  const total = count(s); let done = 0, tracked = 0, due = 0, strong = 0; const t = today();
  for (let a = 1; a <= total; a++) {
    const r = st.mem[key(s, a)];
    if (!r) continue;
    tracked++;
    if (isMemorized(r)) done++;
    if (r.bad || r.due <= t - 2) due++;
    if (r.iv >= 30 && (r.successDays?.length ?? 0) >= 5 && !r.bad) strong++;
  }
  const status: Status = tracked === 0 ? "none" : done < total ? "learning" : due > 0 ? "revise" : strong === total ? "strong" : "memorized";
  return { status, done, total };
}

export const memorizedCount = (st: AppState) => Object.values(st.mem).filter(isMemorized).length;

export type Run = { s: number; a: number; b: number };
const ord = (k: string) => { const [s, a] = parseKey(k); return s * 1000 + a; };

/** Ayat due for revision, grouped into consecutive runs of at most `max` ayat. */
export function dueRuns(st: AppState, max = 15): Run[] {
  const keys = Object.keys(st.mem).filter((k) => isAyahDue(st.mem[k])).sort((x, y) => st.mem[x].due - st.mem[y].due || ord(x) - ord(y));
  const set = new Set(keys); const used = new Set<string>(); const runs: Run[] = [];
  for (const k of keys) {
    if (used.has(k)) continue;
    const [s, a0] = parseKey(k);
    let a = a0; while (a > 1 && set.has(key(s, a - 1)) && !used.has(key(s, a - 1)) && a0 - a < max - 1) a--;
    let b = a; used.add(key(s, a));
    while (b < count(s) && set.has(key(s, b + 1)) && !used.has(key(s, b + 1)) && b - a < max - 1) { b++; used.add(key(s, b)); }
    runs.push({ s, a, b });
  }
  return runs;
}
export const dueCount = (st: AppState) => Object.values(st.mem).filter((r) => isAyahDue(r)).length;

/** The next ayat to memorize: continue a partly learned surah, else the first surah not started. */
export function nextLesson(st: AppState, preferSurah?: number): Run | null {
  const n = Math.max(1, st.settings.newTarget);
  const firstGap = (s: number) => { for (let a = 1; a <= count(s); a++) if (!isMemorized(st.mem[key(s, a)])) return a; return 0; };
  let target = 0;
  if (preferSurah && firstGap(preferSurah)) target = preferSurah;
  if (!target) for (let s = 1; s <= 114; s++) { const x = surahStatus(st, s); if (x.status === "learning") { target = s; break; } }
  if (!target) for (let s = 1; s <= 114; s++) if (surahStatus(st, s).status === "none") { target = s; break; }
  if (!target) return null;
  const a = firstGap(target);
  return { s: target, a, b: Math.min(count(target), a + n - 1) };
}

export type Mark = "ok" | "hes" | "bad";
export type PracticeKind = "new" | "rev" | "custom" | "weak" | "assessment";
export const isAyahDue = (r: AppState["mem"][string], now = Date.now()) => r.dueAt !== undefined ? r.dueAt <= now : r.due <= today();

/** Record a finished practice session. */
export function applyResults(d: AppState, items: [number, number][], res: Record<number, Mark>, kind: PracticeKind, title: string) {
  const t = today(); let missed = 0;
  items.forEach(([s, a], i) => {
    const k = key(s, a), r = res[i] || "ok"; let rec = d.mem[k];
    if (r !== "ok") missed++;
    if (kind === "weak") {
      const w = d.weak[k] || (d.weak[k] = { c: 0, d: 0 });
      if (r === "ok") {
        if (w.lastCleanDay !== t) { w.c = w.lastCleanDay === t - 1 ? w.c + 1 : 1; w.lastCleanDay = t; }
        w.d = t; if (w.c >= 3) delete d.weak[k];
      } else { w.c = 0; w.d = t; delete w.lastCleanDay; }
    } else if (r !== "ok") {
      d.weak[k] = { c: 0, d: t };
    }
    if (!rec && (kind === "new" || kind === "assessment")) rec = d.mem[k] = { iv: 0, due: t, last: t, reps: 0, successes: 0, failures: 0, confidence: 0 };
    if (!rec) return;
    if (r === "ok") {
      const successDays = rec.successDays || (rec.successDays = []);
      const newSuccessDay = !successDays.includes(t);
      if (newSuccessDay) successDays.push(t);
      rec.successes = (rec.successes || 0) + 1;
      rec.confidence = Math.min(5, (rec.confidence || 0) + 1);
      if (newSuccessDay) rec.iv = [1, 3, 7, 14, 30, 60][Math.min(5, successDays.length - 1)];
      delete rec.dueAt;
      delete rec.bad;
    } else if (r === "hes") {
      rec.failures = (rec.failures || 0) + 1;
      rec.confidence = Math.max(0, (rec.confidence || 0) - 1);
      rec.iv = 1;
      rec.dueAt = Date.now() + 10 * 60_000;
      rec.successDays = [];
    } else {
      rec.failures = (rec.failures || 0) + 1;
      rec.confidence = 0;
      rec.iv = 0;
      rec.dueAt = Date.now() + 10 * 60_000;
      rec.bad = 1;
      rec.successDays = [];
    }
    rec.due = r === "bad" ? t : t + rec.iv; rec.last = t; rec.reps++;
    rec.history = [...(rec.history || []), { at: Date.now(), result: r, interval: r === "bad" || r === "hes" ? 0 : rec.iv }].slice(-100);
  });
  logAdd(d, "a", items.length);
  if (kind === "new") logAdd(d, "nw", items.length);
  if (kind === "rev" || kind === "assessment") logAdd(d, "rev", items.length);
  const label = { new: "New lesson", rev: "Revision", custom: "Recitation", weak: "Weak ayat drill", assessment: "Mind map assessment" }[kind];
  addHist(d, label, title, items.length, missed);
}

/** Mark a range as already memorized, spreading first reviews over the coming days. */
export function markRange(d: AppState, s: number, a: number, b: number, on: boolean) {
  const t = today(); const per = Math.max(10, d.settings.revTarget);
  let n = Object.values(d.mem).filter((r) => r.reps === 0).length;
  for (let x = a; x <= b; x++) {
    const k = key(s, x);
    if (!on) { delete d.mem[k]; delete d.weak[k]; continue; }
    if (!d.mem[k]) { d.mem[k] = { iv: 3, due: t + Math.floor(n / per), last: 0, reps: 0, successes: 0, failures: 0, confidence: 0 }; n++; }
  }
}
export function markJuz(d: AppState, j: number, on: boolean) {
  const [[s1, a1], [s2, a2]] = Q().juz[j - 1];
  for (let s = s1; s <= s2; s++) markRange(d, s, s === s1 ? a1 : 1, s === s2 ? a2 : count(s), on);
}
export function juzProgress(st: AppState, j: number) {
  const [[s1, a1], [s2, a2]] = Q().juz[j - 1]; let done = 0, total = 0;
  for (let s = s1; s <= s2; s++) for (let a = s === s1 ? a1 : 1; a <= (s === s2 ? a2 : count(s)); a++) { total++; if (isMemorized(st.mem[key(s, a)])) done++; }
  return { done, total };
}
export const weakDue = (st: AppState) => { const t = today(); return Object.keys(st.weak).filter((k) => st.weak[k].d < t).sort((x, y) => ord(x) - ord(y)); };
