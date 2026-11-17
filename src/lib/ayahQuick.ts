// Long-press an Ayah → quick sheet (Arabic recitation, Urdu translation text and Urdu translation audio).
// Pure logic, kept here so it can be tested without a browser:
//   • quickAccess(): may this Ayah's quick sheet open right now? Never during concealed recall/lesson text.
//   • LongPress: a press only counts when held still; moving (scrolling), lifting early or a second finger cancels it.

export type QuickContext = {
  mode: "read" | "learn" | "recall";
  /** Old memorize mode in progress (words hidden ahead of the pointer). */
  memorizing?: boolean;
  /** Recite screen with "Hide Quran text" on. */
  reciteHidden?: boolean;
  /** Recall: the page result has been saved (all text revealed). */
  recallSaved?: boolean;
  /** Recall: this Ayah already has a rating (its evidence is fixed and its text is revealed). */
  ayahRated?: boolean;
  /** Learn: a guided lesson is running. */
  lessonRunning?: boolean;
  /** Learn: every word of this Ayah is currently shown by the lesson. */
  lessonAyahVisible?: boolean;
};

export type QuickAccess = { ok: true } | { ok: false; reason: string };

/** Assistance (recitation / translation) must not reach an Ayah whose text the learner is recalling unaided. */
export function quickAccess(c: QuickContext): QuickAccess {
  if (c.reciteHidden) return { ok: false, reason: "Reveal the Quran text first. Help is off while the text is hidden." };
  if (c.memorizing) return { ok: false, reason: "Finish this memorize run first." };
  if (c.mode === "recall" && !c.recallSaved && !c.ayahRated) return { ok: false, reason: "Rate this Ayah first. Recitation and translation open after your own recall, so it stays independent." };
  if (c.mode === "learn" && c.lessonRunning && !c.lessonAyahVisible) return { ok: false, reason: "This Ayah is hidden in the lesson step. Reveal it first." };
  return { ok: true };
}

export const LONG_PRESS_MS = 550;
export const LONG_PRESS_SLOP_PX = 10;

/** Tracks one press. start → (move)* → end/cancel; fire() is called by the caller's timer after LONG_PRESS_MS. */
export class LongPress {
  private x = 0; private y = 0; private t = 0; private active = false; fired = false;
  start(x: number, y: number, t: number) { this.x = x; this.y = y; this.t = t; this.active = true; this.fired = false; }
  /** Returns false (and cancels) when the finger moved further than the slop: that is a scroll, not a press. */
  move(x: number, y: number) { if (this.active && Math.hypot(x - this.x, y - this.y) > LONG_PRESS_SLOP_PX) this.active = false; return this.active; }
  cancel() { this.active = false; }
  /** The timer callback: true when the press is still held still long enough. */
  fire(t: number) { if (!this.active || t - this.t < LONG_PRESS_MS) return false; this.active = false; this.fired = true; return true; }
  /** After a fired long-press the trailing click must not also open the normal tap action. Consumes the flag. */
  swallowClick() { const f = this.fired; this.fired = false; return f; }
}
