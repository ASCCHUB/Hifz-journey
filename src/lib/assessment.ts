// Previously-memorized assessment and recovery (Phase 3.4). Pure helpers.
//
// A page check samples at most two prompts: recite the page's first Ayah (cue: page number + Surah), and
// continue after a randomly chosen Ayah (cue: that Ayah's text). Ratings are evidence ONLY for the Ayahs
// actually recited (saved through applyResults "assessment"). The page verdict is a diagnostic label for
// planning; it never marks the rest of the page — let alone a Juz — as verified.
import { pageAyahs, type Ayah } from "./chunking";
import { applyResults, type Mark } from "./hifz";
import { pageOf } from "./quran";
import type { AppState, PageAssessment } from "./store";

export type Prompt = { kind: "page_start" | "continue"; target: Ayah; cue: Ayah | null };

/** Deterministic per page and attempt, so a resumed check shows the same prompts. */
export function assessmentPrompts(page: number, attempt = 0): Prompt[] {
  const ayahs = pageAyahs(page);
  const prompts: Prompt[] = [{ kind: "page_start", target: ayahs[0], cue: null }];
  if (ayahs.length > 1) {
    const i = 1 + ((page * 31 + attempt * 17) % (ayahs.length - 1)); // any Ayah after the first, as target
    prompts.push({ kind: "continue", target: ayahs[i], cue: ayahs[i - 1] });
  }
  return prompts;
}

export function verdictOf(results: Mark[]): PageAssessment["verdict"] {
  if (results.length && results.every((r) => r === "ok")) return "clean";
  if (results.every((r) => r === "bad")) return "forgot";
  return "needs_help";
}

/** Save a finished page check. Returns the verdict. */
export function saveAssessment(d: AppState, page: number, prompts: Prompt[], results: Mark[], now = Date.now()): PageAssessment["verdict"] {
  const verdict = verdictOf(results);
  const prev = d.assessments?.[String(page)];
  (d.assessments ||= {})[String(page)] = {
    page, at: now, attempts: (prev?.attempts || 0) + 1, verdict,
    prompts: prompts.map((p, i) => ({ s: p.target[0], a: p.target[1], kind: p.kind, result: results[i] })),
    ...(prev?.recovery ? { recovery: prev.recovery } : {}),
  };
  const items = prompts.map((p) => p.target);
  const res: Record<number, Mark> = {}; results.forEach((r, i) => { res[i] = r; });
  applyResults(d, items, res, "assessment", `Page ${page} check`);
  return verdict;
}

/** Record a finished recovery lesson for a page (worst final rating counts). */
export function recordRecovery(d: AppState, page: number, finals: Mark[], now = Date.now()) {
  if (!finals.length) return;
  const worst: Mark = finals.includes("bad") ? "bad" : finals.includes("hes") ? "hes" : "ok";
  const a = (d.assessments ||= {})[String(page)] || { page, at: now, attempts: 0, prompts: [], verdict: "needs_help" as const };
  a.recovery = { attempts: (a.recovery?.attempts || 0) + 1, lastResult: worst, at: now };
  d.assessments[String(page)] = a;
}

export type RecoveryItem = { page: number; reason: string; weakAyahs: Ayah[]; recovery?: PageAssessment["recovery"]; recommendRelearn: boolean; recovered: boolean };

/** Pages that need recovery: a failed/hesitant check, or several weak Ayahs. Recovery progress kept separate. */
export function recoveryList(st: Pick<AppState, "assessments" | "weak" | "mem">): RecoveryItem[] {
  const byPage = new Map<number, Ayah[]>();
  Object.keys(st.weak).forEach((k) => { const [s, a] = k.split(":").map(Number) as Ayah; if (!s) return; const pg = pageOf(s, a); byPage.set(pg, [...(byPage.get(pg) || []), [s, a]]); });
  const pages = new Set<number>([...byPage.keys()].filter((pg) => (byPage.get(pg) || []).length >= 2));
  Object.values(st.assessments || {}).forEach((x) => { if (x.verdict !== "clean" || x.recovery) pages.add(x.page); });
  return [...pages].sort((a, b) => a - b).map((pg) => {
    const x = st.assessments?.[String(pg)]; const weak = byPage.get(pg) || [];
    const recovered = !!x?.recovery && x.recovery.lastResult === "ok";
    const reason = x && x.verdict !== "clean" ? `Page check: ${x.verdict === "forgot" ? "could not recall" : "needed help"}` : `${weak.length} weak ayahs on this page`;
    return { page: pg, reason, weakAyahs: weak, recovery: x?.recovery, recovered, recommendRelearn: !!x?.recovery && x.recovery.attempts >= 2 && x.recovery.lastResult !== "ok" };
  });
}

/** Self-reported pages that have not been checked or recited yet. */
export function uncheckedClaimedPages(st: Pick<AppState, "assessments" | "mem">, claimedKeys: Iterable<string>): number[] {
  const out = new Set<number>();
  for (const k of claimedKeys) { if (st.mem[k]) continue; const [s, a] = k.split(":").map(Number); const pg = pageOf(s, a); if (!st.assessments?.[String(pg)]) out.add(pg); }
  return [...out].sort((a, b) => a - b);
}
