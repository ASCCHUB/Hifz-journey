// Lesson engine (pure): turns a page or Ayah range into an ordered list of steps.
//
// Evidence rule: only the final "whole" recall step (scope "page") produces per-Ayah ratings that are saved
// through applyResults(). Every other step (listen, read, fade, phrase/link/group/cumulative recall, order,
// connect) is practice and is kept in lesson state only. A hint used on an Ayah turns "ok" into "hes".
import { groupAyahs, unitsForAyah, type Ayah, type Unit } from "./chunking";
import { prevAyah, words } from "./quran";
import { applyResults } from "./hifz";
import type { AppState, LessonState } from "./store";

export type Level = LessonState["level"];
export type Template = LessonState["template"];
export type RecallScope = "phrase" | "ayah" | "link" | "group" | "cumulative" | "page" | "connect";
/** What the learner is doing, shown as the progress label (not a technical step number). */
export type Phase = "learn" | "hide" | "recall" | "join" | "link" | "review" | "order" | "test" | "connect";
type StepMeta = { label: string; instruction: string; phase: Phase; ayahIndex: number; ayahCount: number };
export type Step = StepMeta & (
  | { kind: "listen"; units: Unit[] }
  | { kind: "read"; units: Unit[] }
  | { kind: "fade"; units: Unit[]; fade: 1 | 2 }
  | { kind: "order"; ayahs: Ayah[] }
  | { kind: "recall"; units: Unit[]; scope: RecallScope });

const whole = (x: Ayah): Unit[] => [{ s: x[0], a: x[1], from: 0, to: words(x[0], x[1]).length - 1, whole: true }];
const ayahUnits = (xs: Ayah[]): Unit[] => xs.flatMap(whole);
const name = (x: Ayah) => `${x[0]}:${x[1]}`;
const span = (xs: Ayah[]) => xs.length === 1 ? `Ayah ${name(xs[0])}` : `Ayahs ${name(xs[0])}–${name(xs[xs.length - 1])}`;
/** "Ayah 2:3" or "Ayahs 2:1–2:3" in plain words for instructions. */
const spoken = (xs: Ayah[]) => xs.length === 1 ? `Ayah ${xs[0][1]}` : xs[0][0] === xs[xs.length - 1][0] ? `Ayahs ${xs[0][1]}–${xs[xs.length - 1][1]}` : `${span(xs)}`;
const wordCount = (x: Ayah) => words(x[0], x[1]).length;

/**
 * Learn template — cumulative, Ayah by Ayah:
 *   Ayah 1: listen & repeat while looking → (guided: recite while the text fades) → recite from memory
 *   Ayah 2: the same, then "Now recite Ayahs 1–2 together without looking"
 *   Ayah 3: the same, then "Now recite Ayahs 1–3 together" … and so on.
 * Long Ayahs are practised in parts with cumulative joins (parts 1–2, 1–3 …).
 * To keep each joined recitation manageable, the running block restarts after about 60/90/130 words
 * (guided/standard/challenge); each time it does, the learner recites everything learned so far once.
 * Finally: the whole page from memory (the only step saved as Hifz evidence) and a link to the Ayah before.
 */
export function buildSteps(ayahs: Ayah[], level: Level, template: Template = "learn", includeConnect = true): Step[] {
  if (!ayahs.length) return [];
  const steps: Step[] = [];
  const N = ayahs.length;
  const idx = (x: Ayah) => ayahs.findIndex((y) => y[0] === x[0] && y[1] === x[1]) + 1;
  if (template === "recover") {
    const groups = groupAyahs(ayahs, level === "challenge" ? 45 : level === "standard" ? 30 : 20);
    groups.forEach((g) => {
      const at = idx(g[g.length - 1]);
      steps.push({ kind: "listen", units: ayahUnits(g), label: `Listen · ${span(g)}`, instruction: `Listen to ${spoken(g)} and recite along while looking at the text.`, phase: "learn", ayahIndex: at, ayahCount: N });
      g.forEach((x) => unitsForAyah(x[0], x[1]).forEach((u, i, all) => {
        const tag = `${spoken([x])}${all.length > 1 ? `, part ${i + 1}` : ""}`;
        steps.push({ kind: "fade", units: [u], fade: 2, label: `First-letter clues · ${name(x)}${all.length > 1 ? ` part ${i + 1}` : ""}`, instruction: `Only the first letter of each word is shown. Recite ${tag} in full.`, phase: "hide", ayahIndex: idx(x), ayahCount: N });
        steps.push({ kind: "recall", units: [u], scope: all.length > 1 ? "phrase" : "ayah", label: `Recall · ${name(x)}${all.length > 1 ? ` part ${i + 1}` : ""}`, instruction: `Recite ${tag} from memory.`, phase: "recall", ayahIndex: idx(x), ayahCount: N });
      }));
      if (g.length > 1) steps.push({ kind: "order", ayahs: g, label: `Rebuild the order · ${span(g)}`, instruction: "Tap the Ayahs in the order they come in the Mushaf.", phase: "order", ayahIndex: at, ayahCount: N });
      steps.push({ kind: "recall", units: ayahUnits(g), scope: "group", label: `Recite without hints · ${span(g)}`, instruction: `Now recite ${spoken(g)} together without looking.`, phase: "link", ayahIndex: at, ayahCount: N });
    });
    steps.push({ kind: "recall", units: ayahUnits(ayahs), scope: "page", label: `Whole test · ${span(ayahs)}`, instruction: `Test: recite ${spoken(ayahs)} without looking, then rate each Ayah honestly.`, phase: "test", ayahIndex: N, ayahCount: N });
    return steps;
  }
  const cap = level === "challenge" ? 130 : level === "standard" ? 90 : 60;
  let blockStart = 0, blockWords = 0;
  ayahs.forEach((x, i) => {
    const n = wordCount(x);
    // Start a new running block when this Ayah would make the joined recitation too long.
    if (i > blockStart && blockWords + n > cap) {
      if (blockStart > 0) steps.push({ kind: "recall", units: ayahUnits(ayahs.slice(0, i)), scope: "cumulative", label: `Everything so far · ${span(ayahs.slice(0, i))}`, instruction: `Review: recite everything learned so far — ${spoken(ayahs.slice(0, i))} — without looking.`, phase: "review", ayahIndex: i, ayahCount: N });
      blockStart = i; blockWords = 0;
    }
    blockWords += n;
    const units = unitsForAyah(x[0], x[1]);
    units.forEach((u, ui) => {
      const tag = `${spoken([x])}${units.length > 1 ? `, part ${ui + 1} of ${units.length}` : ""}`;
      const label = `${name(x)}${units.length > 1 ? ` part ${ui + 1}/${units.length}` : ""}`;
      steps.push({ kind: "listen", units: [u], label: `Listen & repeat · ${label}`, instruction: `Listen to ${tag}${level === "challenge" ? "" : ", then repeat it several times while looking at the text"}.`, phase: "learn", ayahIndex: i + 1, ayahCount: N });
      if (level === "guided") steps.push({ kind: "fade", units: [u], fade: 1, label: `Hide gradually · ${label}`, instruction: `Recite ${tag} while the text fades: first half the words are hidden, then only first letters remain.`, phase: "hide", ayahIndex: i + 1, ayahCount: N });
      steps.push({ kind: "recall", units: [u], scope: units.length > 1 ? "phrase" : "ayah", label: `Recite from memory · ${label}`, instruction: `Recite ${tag} from memory, without looking.`, phase: "recall", ayahIndex: i + 1, ayahCount: N });
      if (ui > 0) steps.push({ kind: "recall", units: units.slice(0, ui + 1), scope: "phrase", label: `Join parts 1–${ui + 1} · ${name(x)}`, instruction: `Now join parts 1–${ui + 1} of ${spoken([x])} without looking.`, phase: "join", ayahIndex: i + 1, ayahCount: N });
    });
    if (i > blockStart) {
      const run = ayahs.slice(blockStart, i + 1);
      steps.push({ kind: "recall", units: ayahUnits(run), scope: i - blockStart === 1 ? "link" : "group", label: `Together · ${span(run)}`, instruction: `Now recite ${spoken(run)} together without looking.`, phase: "link", ayahIndex: i + 1, ayahCount: N });
    }
  });
  if (blockStart > 0) steps.push({ kind: "recall", units: ayahUnits(ayahs), scope: "cumulative", label: `Everything so far · ${span(ayahs)}`, instruction: `Review: recite all ${N} Ayahs once more before the test.`, phase: "review", ayahIndex: N, ayahCount: N });
  steps.push({ kind: "recall", units: ayahUnits(ayahs), scope: "page", label: `Full recitation, text hidden · ${span(ayahs)}`, instruction: `Test: recite ${spoken(ayahs)} without looking. After each Ayah, compare and rate it honestly — only this test is saved to your Hifz record.`, phase: "test", ayahIndex: N, ayahCount: N });
  const before = prevAyah(ayahs[0][0], ayahs[0][1]);
  if (includeConnect && before) steps.push({ kind: "recall", units: ayahUnits([before, ayahs[0]]), scope: "connect", label: `Connect with what comes before · ${name(before)} → ${name(ayahs[0])}`, instruction: `Finally, connect this portion to what comes before it: recite ${name(before)} and then ${name(ayahs[0])}.`, phase: "connect", ayahIndex: N, ayahCount: N });
  return steps;
}

/** Plain-language progress label for a step, e.g. "Ayah 3 of 7 · linking Ayahs 1–3". */
export const PHASE_LABEL: Record<Phase, string> = { learn: "listening & repeating", hide: "hiding the text", recall: "reciting from memory", join: "joining parts", link: "linking with earlier Ayahs", review: "reviewing everything so far", order: "putting Ayahs in order", test: "page test", connect: "connecting to the previous Ayah" };
/** Per-Ayah result keys used in the final "page" step. */
export const finalKey = (s: number, a: number) => `final:${s}:${a}`;
/** Correct self-ratings made after opening a recall aid are recorded as needing help. */
export function markWithAssistance(mark: "ok" | "hes" | "bad", assisted: boolean): "ok" | "hes" | "bad" {
  return mark === "ok" && assisted ? "hes" : mark;
}

/** Evidence to save: only Ayahs rated in the final step; hinted "ok" is downgraded to "hes".
 *  Returns parallel arrays for applyResults (which treats a missing rating as "ok", so unrated Ayahs are excluded). */
export function evidenceFromLesson(l: Pick<LessonState, "results" | "hinted">, ayahs: Ayah[]): { items: Ayah[]; res: Record<number, "ok" | "hes" | "bad"> } {
  const items: Ayah[] = []; const res: Record<number, "ok" | "hes" | "bad"> = {};
  ayahs.forEach(([s, a]) => {
    const r = l.results[finalKey(s, a)];
    if (!r) return;
    res[items.length] = markWithAssistance(r, !!l.hinted[finalKey(s, a)]);
    items.push([s, a]);
  });
  return { items, res };
}

// ---------------------------------------------------------------- lesson state helpers
export function lessonId(template: Template, unit: LessonState["unit"]): string {
  return unit.kind === "page" ? `${template}:page:${unit.page}` : `${template}:range:${unit.start.s}:${unit.start.a}-${unit.end.s}:${unit.end.a}`;
}
export function newLesson(template: Template, unit: LessonState["unit"], title: string, mode: LessonState["mode"], level: Level, now = Date.now(), pathId?: string): LessonState {
  return { id: lessonId(template, unit), title, unit, template, mode, level, step: 0, results: {}, hinted: {}, startedAt: now, updatedAt: now, ...(pathId ? { pathId } : {}) };
}

/**
 * Save a finished lesson's evidence once. Learn lessons create/advance records ("new"); recovery uses
 * "assessment" (creates records for previously claimed material). Returns the number of Ayahs saved.
 * A lesson already saved, or one without final-step ratings, saves nothing.
 */
export function saveLessonEvidence(d: AppState, lessonKey: string, ayahs: Ayah[], now = Date.now()): number {
  const l = d.lessons?.[lessonKey]; if (!l || l.savedToHifz) return 0;
  const { items, res } = evidenceFromLesson(l, ayahs);
  if (!items.length) return 0;
  applyResults(d, items, res, l.template === "recover" ? "assessment" : "new", `${l.title} · ${l.template === "recover" ? "recovery" : "guided lesson"}`);
  l.savedToHifz = now; l.completedAt = l.completedAt || now; l.updatedAt = now;
  return items.length;
}
