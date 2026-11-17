import { resolveLocation, type Core } from "./quran";
import type { AppState, JourneyPath, JourneyPathKind, JourneyPoint, JourneyRange, StudentJourney } from "./store";

export type PathDraft = { kind: JourneyPathKind; name: string; ranges?: JourneyRange[]; selected?: number[] };

export function createStudentJourney(state: Pick<AppState, "journey" | "settings">, now = Date.now()): StudentJourney {
  const old = state.journey;
  const isDefault = old.start.s === 1 && old.start.a === 1 && old.end.s === 1 && old.end.a === 7;
  const paths: JourneyPath[] = isDefault ? [] : [{ id: "legacy-custom", name: "Current custom range", kind: "custom", ranges: [{ start: old.start, end: old.end, label: "Existing learning range" }], traversal: "forward", cursor: old.last ? { rangeIndex: 0, ...old.last } : { rangeIndex: 0, ...old.start }, isPrimary: true, createdAt: 0, updatedAt: 0 }];
  return { schema: 1, updatedAt: now, onboarding: "in_progress", learner: { displayName: "", experience: "beginner", direction: "forward" }, paths, primaryPathId: paths[0]?.id || null, claims: [], preferences: { studyMinutes: old.studyMinutes, newAmount: state.settings.newTarget, newUnit: "ayahs", revisionAmount: state.settings.revTarget, revisionUnit: "ayahs", learningDays: [...old.learningDays], prioritizeRevision: true, updatedAt: now } };
}

export function makeRanges(core: Core, draft: PathDraft): JourneyRange[] {
  const surahRange = (s: number): JourneyRange => ({ start: { s, a: 1 }, end: { s, a: core.n[s - 1][2] }, label: core.n[s - 1][1] });
  const fromJuz = (j: number): JourneyRange => {
    const [[s, a], [es, ea]] = core.juz[j - 1];
    return { start: { s, a }, end: { s: es, a: ea }, label: `Juz ${j}` };
  };
  switch (draft.kind) {
    case "forward": return [{ start: { s: 1, a: 1 }, end: { s: 114, a: core.n[113][2] }, label: "Al-Fatihah to An-Nas" }];
    case "reverse_juz": return core.juz.map((_, i) => fromJuz(30 - i));
    case "short_surahs": return Array.from({ length: 37 }, (_, i) => i + 78).sort((a, b) => core.n[a - 1][2] - core.n[b - 1][2] || a - b).map(surahRange);
    case "surahs": return [...new Set(draft.selected || [])].filter((s) => Number.isInteger(s) && s >= 1 && s <= 114).map(surahRange);
    case "juz": return [...new Set(draft.selected || [])].filter((j) => Number.isInteger(j) && j >= 1 && j <= 30).map(fromJuz);
    case "custom":
    case "collection": return (draft.ranges || []).filter((r) => validRange(core, r));
  }
}

export function validRange(core: Core, range: JourneyRange): boolean {
  const { start, end } = range;
  const valid = (p: JourneyPoint) => Number.isInteger(p.s) && Number.isInteger(p.a) && p.s >= 1 && p.s <= 114 && p.a >= 1 && p.a <= core.n[p.s - 1][2];
  return valid(start) && valid(end) && compare(start, end) <= 0;
}
export function compare(a: JourneyPoint, b: JourneyPoint): number { return a.s - b.s || a.a - b.a; }

export function partialJuzRange(core: Core, juz: number, start: JourneyPoint, end: JourneyPoint): JourneyRange | null {
  const bounds = core.juz[juz - 1];
  if (!bounds) return null;
  const juzStart = { s: bounds[0][0], a: bounds[0][1] }, juzEnd = { s: bounds[1][0], a: bounds[1][1] };
  if (compare(start, juzStart) < 0 || compare(end, juzEnd) > 0) return null;
  const range = { start, end };
  return validRange(core, range) ? { ...range, label: `Part of Juz ${juz} · ${start.s}:${start.a}–${end.s}:${end.a}` } : null;
}

export function makePath(core: Core, draft: PathDraft, now = Date.now(), id = `path-${now}-${Math.random().toString(36).slice(2, 8)}`): JourneyPath | null {
  const ranges = draft.ranges?.length ? draft.ranges : makeRanges(core, draft);
  if (!ranges.length || ranges.some((r) => !validRange(core, r))) return null;
  const traversal = draft.kind === "reverse_juz" ? "reverse_units" : draft.kind === "short_surahs" ? "short_first" : "forward";
  return { id, name: draft.name.trim() || "My Quran path", kind: draft.kind, ranges, traversal, cursor: null, isPrimary: false, createdAt: now, updatedAt: now };
}

export function normalizeStudentJourney(value: StudentJourney | null | undefined): StudentJourney | null {
  if (!value || value.schema !== 1) return null;
  const paths = Array.isArray(value.paths) ? value.paths.filter((p) => p && typeof p.id === "string" && Array.isArray(p.ranges)) : [];
  const claims = Array.isArray(value.claims) ? value.claims.filter((c) => c && typeof c.id === "string" && Array.isArray(c.ranges)) : [];
  const prefs = value.preferences && typeof value.preferences === "object" ? value.preferences : null;
  if (!prefs) return null;
  return { ...value, paths, claims, primaryPathId: paths.some((p) => p.id === value.primaryPathId && !p.deletedAt) ? value.primaryPathId : null };
}

/** Claims are descriptive coverage only. This helper never writes to Hifz records. */
export function makeClaim(label: string, confidence: "comfortable" | "needs_revision" | "mostly_forgotten", ranges: JourneyRange[], now = Date.now()): StudentJourney["claims"][number] | null {
  if (!ranges.length) return null;
  return { id: `claim-${now}-${Math.random().toString(36).slice(2, 8)}`, label: label.trim() || "Previously memorized portion", confidence, provenance: "self_reported", ranges, createdAt: now, updatedAt: now };
}

export function pathStart(path: JourneyPath): JourneyPath["cursor"] {
  if (path.cursor && path.ranges[path.cursor.rangeIndex]) return path.cursor;
  if (!path.ranges.length) return null;
  const index = 0;
  const start = path.ranges[index].start;
  return { rangeIndex: index, ...start };
}

/** The Ayah immediately before (s, a) in Mushaf order, or null at 1:1. */
export function previousAyah(core: Core, p: JourneyPoint): JourneyPoint | null {
  if (p.a > 1) return { s: p.s, a: p.a - 1 };
  return p.s > 1 ? { s: p.s - 1, a: core.n[p.s - 2][2] } : null;
}

/** Pages pageStart..pageEnd inclusive, as whole Ayahs: from the first Ayah of pageStart to the Ayah before
 *  the first Ayah of the page after pageEnd. (Each page in the layout begins on an Ayah boundary.) */
export function rangeFromPageBounds(core: Core, pageStart: number, pageEnd: number): JourneyRange | null {
  if (!Number.isInteger(pageStart) || !Number.isInteger(pageEnd) || pageStart < 1 || pageEnd > 604 || pageEnd < pageStart) return null;
  const start = resolveLocation(core, { kind: "page", id: pageStart });
  const next = pageEnd < 604 ? resolveLocation(core, { kind: "page", id: pageEnd + 1 }) : null;
  const end = pageEnd < 604 ? (next ? previousAyah(core, next) : null) : { s: core.n.length, a: core.n.at(-1)![2] };
  if (!start || !end || compare(start, end) > 0) return null;
  return { start: { s: start.s, a: start.a }, end: { s: end.s, a: end.a }, label: `Pages ${pageStart}–${pageEnd} (Ayah-boundary selection)` };
}

/** Every Ayah of the ranges, in path order; Ayahs inside each range are always ascending (Mushaf order). */
export function expandRanges(core: Core, ranges: JourneyRange[]): JourneyPoint[] {
  const out: JourneyPoint[] = [];
  for (const r of ranges) {
    for (let s = r.start.s; s <= r.end.s; s++) {
      const from = s === r.start.s ? r.start.a : 1, to = s === r.end.s ? r.end.a : core.n[s - 1][2];
      for (let a = from; a <= to; a++) out.push({ s, a });
    }
  }
  return out;
}

/** Remove a claim by tombstone. Touches only the claim list — never mem/weak/mw/history. */
export function tombstoneClaim(journey: StudentJourney, claimId: string, now = Date.now()): StudentJourney {
  return { ...journey, updatedAt: now, claims: journey.claims.map((c) => c.id === claimId ? { ...c, deletedAt: now, updatedAt: now } : c) };
}

/** Archive a path by tombstone, choosing a new primary if needed. Touches only the path list. */
export function archivePath(journey: StudentJourney, pathId: string, now = Date.now()): StudentJourney {
  const paths = journey.paths.map((p) => p.id === pathId ? { ...p, deletedAt: now, updatedAt: now, isPrimary: false } : p);
  const primaryPathId = journey.primaryPathId === pathId ? paths.find((p) => !p.deletedAt)?.id || null : journey.primaryPathId;
  return { ...journey, updatedAt: now, paths: paths.map((p) => ({ ...p, isPrimary: p.id === primaryPathId })), primaryPathId };
}

/** Move a path's cursor past `last` (the final Ayah just completed), into the next range if needed. */
export function advanceCursor(core: Core, path: JourneyPath, last: JourneyPoint): JourneyPath["cursor"] {
  const idx = path.ranges.findIndex((r) => compare(r.start, last) <= 0 && compare(last, r.end) <= 0);
  if (idx < 0) return path.cursor;
  const r = path.ranges[idx];
  if (compare(last, r.end) < 0) {
    const next = last.a < core.n[last.s - 1][2] ? { s: last.s, a: last.a + 1 } : { s: last.s + 1, a: 1 };
    return { rangeIndex: idx, ...next };
  }
  const after = path.ranges[idx + 1];
  return after ? { rangeIndex: idx + 1, ...after.start } : null; // null = path complete
}

/** The next chunk of a path to learn: from the cursor to the end of that Mushaf page (or the range end). */
export function nextPathLesson(core: Core, path: JourneyPath, pageOf: (s: number, a: number) => number): { start: JourneyPoint; end: JourneyPoint; page: number } | null {
  const c = pathStart(path); if (!c) return null;
  const r = path.ranges[c.rangeIndex]; if (!r) return null;
  const page = pageOf(c.s, c.a);
  let end: JourneyPoint = { s: c.s, a: c.a };
  for (;;) {
    const next = end.a < core.n[end.s - 1][2] ? { s: end.s, a: end.a + 1 } : end.s < 114 ? { s: end.s + 1, a: 1 } : null;
    if (!next || compare(next, r.end) > 0 || pageOf(next.s, next.a) !== page) break;
    end = next;
  }
  return { start: { s: c.s, a: c.a }, end, page };
}
