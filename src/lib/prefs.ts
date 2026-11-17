// One authoritative source for daily study preferences.
//
// Source of truth: studentJourney.preferences (Phase 3.1). Older screens and code read the legacy copies
// (journey.studyMinutes / journey.learningDays / settings.newTarget / settings.revTarget); every write goes
// through setDailyPrefs(), which updates the authoritative copy and mirrors the legacy fields, so they cannot
// drift. Users without a studentJourney keep using the legacy fields (still mirrored consistently).
// Units: new memorization in "ayahs" | "half_pages" | "pages"; revision in "ayahs" | "pages" | "minutes".
import type { AppState, StudentJourney } from "./store";

export type DailyPrefs = StudentJourney["preferences"];
const AYAHS_PER_PAGE = 15; // labelled default for unit conversion of legacy Ayah targets (Madani page ≈ 15 lines)

export function dailyPrefs(st: Pick<AppState, "studentJourney" | "journey" | "settings">): DailyPrefs {
  if (st.studentJourney?.preferences) return st.studentJourney.preferences;
  return { studyMinutes: st.journey.studyMinutes, newAmount: st.settings.newTarget, newUnit: "ayahs", revisionAmount: st.settings.revTarget, revisionUnit: "ayahs", learningDays: [...st.journey.learningDays], prioritizeRevision: true, updatedAt: 0 };
}

/** Update preferences in the authoritative place and mirror the legacy fields. Never touches Hifz evidence. */
export function setDailyPrefs(d: AppState, patch: Partial<Omit<DailyPrefs, "updatedAt">>, now = Date.now()) {
  const next: DailyPrefs = { ...dailyPrefs(d), ...patch, updatedAt: now };
  next.studyMinutes = Math.max(5, Math.min(240, Math.round(next.studyMinutes)));
  next.learningDays = [...new Set(next.learningDays.filter((x) => Number.isInteger(x) && x >= 0 && x <= 6))].sort();
  if (d.studentJourney) { d.studentJourney.preferences = next; d.studentJourney.updatedAt = now; }
  d.journey.studyMinutes = next.studyMinutes;
  d.journey.learningDays = [...next.learningDays];
  d.settings.newTarget = Math.max(1, Math.round(newAyahsPerDay(next)));
  if (next.revisionUnit !== "minutes") d.settings.revTarget = Math.max(10, Math.round(next.revisionUnit === "pages" ? next.revisionAmount * AYAHS_PER_PAGE : next.revisionAmount));
}

/** New memorization per day, in Ayahs (approximate for page units; used by the legacy lesson recommender). */
export function newAyahsPerDay(p: DailyPrefs): number {
  return p.newUnit === "ayahs" ? p.newAmount : p.newUnit === "half_pages" ? p.newAmount * AYAHS_PER_PAGE / 2 : p.newAmount * AYAHS_PER_PAGE;
}
/** New memorization per day in Mushaf pages (fractional). */
export function newPagesPerDay(p: DailyPrefs): number {
  return p.newUnit === "pages" ? p.newAmount : p.newUnit === "half_pages" ? p.newAmount / 2 : p.newAmount / AYAHS_PER_PAGE;
}
/** Revision target in pages per day, or null when the learner set it in minutes. */
export function revisionPagesPerDay(p: DailyPrefs): number | null {
  return p.revisionUnit === "pages" ? p.revisionAmount : p.revisionUnit === "ayahs" ? p.revisionAmount / AYAHS_PER_PAGE : null;
}
