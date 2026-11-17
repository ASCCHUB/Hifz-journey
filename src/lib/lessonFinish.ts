// Finishing a lesson — shared by /learn (LessonPlayer) and guided learning on the Mushaf, so both save the same way:
// final-step evidence once (saveLessonEvidence guards against duplicates), recovery outcome, path cursor.
import { recordRecovery } from "./assessment";
import type { Ayah } from "./chunking";
import { advanceCursor } from "./journey";
import { finalKey, saveLessonEvidence } from "./lesson";
import { Q } from "./quran";
import type { AppState, LessonState } from "./store";

export function finishLesson(d: AppState, id: string, ayahs: Ayah[], unit: LessonState["unit"], template: LessonState["template"], pathId?: string, now = Date.now()): number {
  const n = saveLessonEvidence(d, id, ayahs, now);
  const l = d.lessons?.[id];
  if (n && template === "recover" && unit.kind === "page" && unit.page && l) recordRecovery(d, unit.page, ayahs.map(([s, a]) => l.results[finalKey(s, a)]).filter(Boolean) as ("ok" | "hes" | "bad")[]);
  if (l) { l.completedAt = l.completedAt || now; l.updatedAt = now; }
  if (n && pathId && d.studentJourney) {
    const p = d.studentJourney.paths.find((x) => x.id === pathId && !x.deletedAt); const last = ayahs[ayahs.length - 1];
    if (p) { p.cursor = advanceCursor(Q(), p, { s: last[0], a: last[1] }); p.updatedAt = now; d.studentJourney.updatedAt = now; }
  }
  return n;
}
