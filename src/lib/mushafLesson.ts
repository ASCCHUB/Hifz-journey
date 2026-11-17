// Guided learning on the Mushaf page (UX Stage 2). Pure helpers, no UI.
// The lesson itself is the existing engine (lib/lesson.ts: buildSteps / LessonState / saveLessonEvidence);
// this file only decides what each word on the 15-line page looks like for the current step, and where
// "Learn" links should open. No second memorization system: same lesson ids, same evidence rule.
import { finalKey, lessonId, type Step } from "./lesson";
import type { Ayah, Unit } from "./chunking";
import type { LessonState } from "./store";

/** show = normal text · hide = empty box of the word's width (no text) · head = first letter only. */
export type WordState = "show" | "hide" | "head";
export type WordView = { state: WordState; active: boolean };
export type TextVisibility = "full" | "unlearned" | "current";
export type ViewCtx = {
  lessonAyahs: Ayah[];
  results: LessonState["results"];
  /** Learner has recited and pressed "show text" for the current recall. */
  shown: boolean;
  /** Hint words revealed, counted in reading order across the recalled passage. */
  reveal: number;
  /** Concealment chosen by the learner on a fade step: 1 half, 2 first letters, 3 all hidden. */
  fadeLevel: 1 | 2 | 3;
};

const k = (s: number, a: number) => `${s}:${a}`;
const inUnit = (u: Unit, s: number, a: number, w: number) => u.s === s && u.a === a && w >= u.from && w <= u.to;

/** The Ayah currently tested in the final page step: the first lesson Ayah without a final rating. */
export function finalCursor(lessonAyahs: Ayah[], results: LessonState["results"]): number {
  const i = lessonAyahs.findIndex(([s, a]) => !results[finalKey(s, a)]);
  return i < 0 ? lessonAyahs.length : i;
}

/** Position of word (s,a,w) in reading order within the passage made of `units`, or -1. */
function orderIn(units: Unit[], s: number, a: number, w: number): number {
  let before = 0;
  for (const u of units) { if (inUnit(u, s, a, w)) return before + (w - u.from); before += u.to - u.from + 1; }
  return -1;
}

/**
 * How one Mushaf word looks during a guided step. Words outside the step's passage are always shown
 * (only the intended learning passage is ever concealed); hidden words carry no text.
 */
export function wordView(step: Step, ctx: ViewCtx, s: number, a: number, w: number): WordView {
  const plain: WordView = { state: "show", active: false };
  if (step.kind === "order") return plain;
  if (step.kind === "recall" && step.scope === "page") {
    const at = ctx.lessonAyahs.findIndex((x) => x[0] === s && x[1] === a);
    if (at < 0) return plain;
    if (ctx.results[finalKey(s, a)]) return plain;                // already tested → shown
    const cur = finalCursor(ctx.lessonAyahs, ctx.results);
    if (at !== cur) return { state: "hide", active: false };       // later Ayahs stay hidden
    return { state: ctx.shown || w < ctx.reveal ? "show" : "hide", active: true };
  }
  const pos = orderIn(step.units, s, a, w);
  if (pos < 0) return plain;
  if (step.kind === "listen" || step.kind === "read") return { state: "show", active: true };
  if (step.kind === "fade") {
    const level = step.fade === 2 ? 2 : ctx.fadeLevel;
    const local = w - step.units.find((u) => inUnit(u, s, a, w))!.from;
    if (level === 1) return { state: local % 2 === 0 ? "show" : "hide", active: true };
    return { state: level === 2 ? "head" : "hide", active: true };
  }
  return { state: ctx.shown || pos < ctx.reveal ? "show" : "hide", active: true };
}

/** Add learner-selected concealment without ever making a word visible that the lesson engine hid. */
export function applyTextVisibility(base: WordView, visibility: TextVisibility, portion: Ayah[], step: Step, s: number, a: number, w: number, pageCursor?: Ayah | null): WordView {
  if (visibility === "full" || base.state !== "show") return base;
  const current = step.kind === "recall" && step.scope === "page" ? (pageCursor || null) : null;
  const activeUnits = step.kind === "order" ? [] : step.units;
  const inCurrent = activeUnits.some((u) => u.s === s && u.a === a && w >= u.from && w <= u.to)
    || step.kind === "order" && step.ayahs.some((x) => x[0] === s && x[1] === a)
    || !!current && current[0] === s && current[1] === a
    || step.kind !== "order" && activeUnits.length === 0 && portion[Math.max(0, step.ayahIndex - 1)]?.[0] === s && portion[Math.max(0, step.ayahIndex - 1)]?.[1] === a;
  if (visibility === "current") return inCurrent ? base : { ...base, state: "hide", active: false };

  // Learning order follows the selected portion (including second-half starts), then word order.
  // Earlier Ayahs and completed phrase chunks stay visible; later chunks and Ayahs become placeholders.
  const targetAyah = current ? { s: current[0], a: current[1], to: Number.MAX_SAFE_INTEGER } : (activeUnits.length
    ? activeUnits.reduce((best, u) => {
      const bi = portion.findIndex((x) => x[0] === best.s && x[1] === best.a);
      const ui = portion.findIndex((x) => x[0] === u.s && x[1] === u.a);
      return ui > bi || ui === bi && u.to > best.to ? { s: u.s, a: u.a, to: u.to } : best;
    }, { s: activeUnits[0].s, a: activeUnits[0].a, to: activeUnits[0].to })
    : (() => { const x = portion[Math.max(0, step.ayahIndex - 1)]; return x ? { s: x[0], a: x[1], to: Number.MAX_SAFE_INTEGER } : null; })());
  if (!targetAyah) return base;
  const ti = portion.findIndex((x) => x[0] === targetAyah.s && x[1] === targetAyah.a);
  const wi = portion.findIndex((x) => x[0] === s && x[1] === a);
  const maxWord = targetAyah.to;
  const later = wi < 0 || ti < 0 ? false : wi > ti || wi === ti && w > maxWord;
  return later ? { ...base, state: "hide", active: false } : base;
}

/** Manual learning: each Ayah has its own concealment (0 full, 1 half, 2 first letters, 3 hidden). */
export function manualWordView(fade: Record<string, 0 | 1 | 2 | 3>, selected: Ayah | null, s: number, a: number, w: number): WordView {
  const f = fade[k(s, a)] || 0; const active = !!selected && selected[0] === s && selected[1] === a;
  return { state: f === 0 || (f === 1 && w % 2 === 0) ? "show" : f === 2 ? "head" : "hide", active };
}

/** Total words in the passage that hints can reveal for the current recall. */
export function hintLimit(step: Step, ctx: Pick<ViewCtx, "lessonAyahs" | "results">, wordCount: (s: number, a: number) => number): number {
  if (step.kind !== "recall") return 0;
  if (step.scope === "page") { const x = ctx.lessonAyahs[finalCursor(ctx.lessonAyahs, ctx.results)]; return x ? wordCount(x[0], x[1]) : 0; }
  return step.units.reduce((n, u) => n + u.to - u.from + 1, 0);
}

/** Plain activity name for the teaching panel. */
export function activity(step: Step): "Listen" | "Understand" | "Hide" | "Recall" | "Join" | "Page test" | "Order" {
  if (step.kind === "listen") return "Listen";
  if (step.kind === "read") return "Understand";
  if (step.kind === "fade") return "Hide";
  if (step.kind === "order") return "Order";
  if (step.scope === "page") return "Page test";
  return step.scope === "phrase" && step.phase === "recall" || step.scope === "ayah" ? "Recall" : "Join";
}

/** Index of the next recall step after `from` (used by "Skip preparation"; skipped steps are never evidence). */
export function nextRecallStep(steps: Step[], from: number): number {
  for (let i = from + 1; i < steps.length; i++) if (steps[i].kind === "recall") return i;
  return Math.min(from + 1, steps.length - 1);
}

/** Lesson unit, id and title for a portion of a Mushaf page. The whole page uses the page unit (same id as /learn?page=N). */
export function portionLesson(page: number, pageAyahs: Ayah[], portion: Ayah[], template: LessonState["template"] = "learn", has?: (id: string) => boolean): { unit: LessonState["unit"]; id: string; title: string } {
  const first = portion[0], last = portion[portion.length - 1];
  // The whole page uses the page unit, unless a saved range lesson over exactly this page already exists (resume it).
  const rangeId = lessonId(template, { kind: "range", start: { s: first[0], a: first[1] }, end: { s: last[0], a: last[1] } });
  const whole = portion.length === pageAyahs.length && !(has && has(rangeId) && !has(lessonId(template, { kind: "page", page, start: { s: first[0], a: first[1] }, end: { s: last[0], a: last[1] } })));
  const unit: LessonState["unit"] = whole
    ? { kind: "page", page, start: { s: first[0], a: first[1] }, end: { s: last[0], a: last[1] } }
    : { kind: "range", start: { s: first[0], a: first[1] }, end: { s: last[0], a: last[1] } };
  const verb = template === "recover" ? "Recover" : "Learn";
  const title = whole ? `${verb} page ${page}` : `${verb} page ${page} · Ayahs ${first[0]}:${first[1]}–${last[0]}:${last[1]}`;
  return { unit, id: lessonId(template, unit), title };
}

/**
 * Where a "Learn" link should open. Learn lessons that fit on one Mushaf page open on the Mushaf
 * (`/mushaf?p=N&mode=learn[&from=s:a&to=s:a][&pathId=]`). Recovery lessons and ranges spanning pages keep
 * using /learn, which stays available for older links and saved lessons.
 */
export function learnHref(t: { page?: number; start?: { s: number; a: number }; end?: { s: number; a: number }; template?: LessonState["template"]; pathId?: string }, pageOf: (s: number, a: number) => number): string {
  const tpl = t.template ?? "learn"; const pid = t.pathId ? `&pathId=${encodeURIComponent(t.pathId)}` : "";
  if (t.page && !t.start) return tpl === "learn" ? `/mushaf?p=${t.page}&mode=learn&portion=page${pid}` : `/learn?page=${t.page}&template=${tpl}${pid}`;
  const st = t.start!, en = t.end ?? t.start!;
  const p1 = pageOf(st.s, st.a), p2 = pageOf(en.s, en.a);
  if (tpl === "learn" && p1 === p2) return `/mushaf?p=${p1}&mode=learn&from=${st.s}:${st.a}&to=${en.s}:${en.a}${pid}`;
  return `/learn?s=${st.s}&a=${st.a}&endS=${en.s}&endA=${en.a}${tpl === "recover" ? "&template=recover" : ""}${pid}`;
}

/** Parse `from`/`to` ("s:a") and return the slice of the page's Ayahs, or null if invalid / not on this page. */
export function parsePortion(pageAyahs: Ayah[], from: string | null, to: string | null): Ayah[] | null {
  if (!from || !to) return null;
  const i = pageAyahs.findIndex((x) => k(x[0], x[1]) === from), j = pageAyahs.findIndex((x) => k(x[0], x[1]) === to);
  if (i < 0 || j < i) return null;
  return pageAyahs.slice(i, j + 1);
}

/** First letter of a word with its marks (for "first letters" concealment). */
export function headOf(w: string): string { const m = w.match(/^.[ً-ٰٟۖ-ۭ]*/); return m ? m[0] : w.slice(0, 1); }

/** Where to resume a saved lesson (Mushaf for single-page Learn lessons, /learn otherwise). */
export function lessonHref(l: Pick<LessonState, "unit" | "template" | "pathId">, pageOf: (s: number, a: number) => number): string {
  return l.unit.kind === "page" && l.unit.page ? learnHref({ page: l.unit.page, template: l.template, pathId: l.pathId }, pageOf)
    : learnHref({ start: l.unit.start, end: l.unit.end, template: l.template, pathId: l.pathId }, pageOf);
}
