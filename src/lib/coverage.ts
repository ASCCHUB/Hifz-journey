// What we actually know about each Ayah, kept separate from how the SRS schedules it.
//
//   retained       learner-recited evidence, interval ≥ 30 days and ≥ 5 distinct clean days (the existing "Strong" rule)
//   learning       learner-recited evidence (at least one recall rating), not yet long-term
//   weak           recited, but the latest result was a mistake or the Ayah is in the weak queue
//   legacy_marked  a record created by the old "Mark memorized" buttons: no recitation evidence
//   claimed        self-reported in "What have you memorized before?" only
//   none           nothing known
//
// isMemorized() in hifz.ts is unchanged (it drives the existing SRS); use these helpers for display and planning.
import { expandRanges } from "./journey";
import { Q } from "./quran";
import type { AppState, MemRec } from "./store";

export type Coverage = "retained" | "learning" | "weak" | "legacy_marked" | "claimed" | "none";

export const hasEvidence = (r: MemRec | undefined) => !!r && ((r.reps || 0) > 0 || (r.history?.length || 0) > 0 || (r.successes || 0) > 0 || (r.failures || 0) > 0);
/** Learner-demonstrated recall at least once, with no open mistake. */
export const isVerified = (r: MemRec | undefined) => hasEvidence(r) && (r!.successes || 0) > 0 && !r!.bad;
export const isRetained = (r: MemRec | undefined) => isVerified(r) && r!.iv >= 30 && (r!.successDays?.length ?? 0) >= 5;

/** Ayah keys covered by live (non-deleted) self-reported claims, with the most recently updated claim's confidence. */
export function claimedAyahs(st: Pick<AppState, "studentJourney">): Map<string, "comfortable" | "needs_revision" | "mostly_forgotten"> {
  const out = new Map<string, "comfortable" | "needs_revision" | "mostly_forgotten">();
  const claims = (st.studentJourney?.claims || []).filter((c) => !c.deletedAt).sort((a, b) => a.updatedAt - b.updatedAt);
  for (const c of claims) for (const p of expandRanges(Q(), c.ranges)) out.set(`${p.s}:${p.a}`, c.confidence);
  return out;
}

export function coverageOf(st: Pick<AppState, "mem" | "weak">, key: string, claimed: Map<string, unknown>): Coverage {
  const r = st.mem[key];
  if (hasEvidence(r)) {
    if (r!.bad || st.weak[key]) return "weak";
    if (isRetained(r)) return "retained";
    return isVerified(r) ? "learning" : "weak";
  }
  if (r) return "legacy_marked";
  return claimed.has(key) ? "claimed" : "none";
}

export type CoverageCounts = Record<Coverage, number>;
export function coverageSummary(st: Pick<AppState, "mem" | "weak" | "studentJourney">): CoverageCounts {
  const claimed = claimedAyahs(st);
  const counts: CoverageCounts = { retained: 0, learning: 0, weak: 0, legacy_marked: 0, claimed: 0, none: 0 };
  const keys = new Set([...Object.keys(st.mem), ...claimed.keys()]);
  keys.forEach((k) => { counts[coverageOf(st, k, claimed)]++; });
  counts.none = 6236 - keys.size;
  return counts;
}
