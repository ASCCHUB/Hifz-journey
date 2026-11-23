// All user-facing text for Ayah Chain in one table. The app has no translation layer yet; keeping the strings
// here (not inline in components) means a future one can translate this mode by replacing this file.
import type { ChainAyah, ChainStep } from "./ayahChain";

export const CHAIN_TEXT = {
  name: "Ayah Chain",
  tagline: "Hear a new Ayah on its own, join it to the Ayahs before it, then move on to the next.",
  cycleRule: (newReps: number, setReps: number) => `Each Ayah: new Ayah ×${newReps} → Ayahs so far ×${setReps} → next Ayah.`,
  toggle: "Use Ayah Chain in lessons",
  toggleHelp: "Adds an Ayah Chain button to lessons. Listening practice only: it never changes your Hifz records.",
  newReps: "New Ayah",
  newRepsHelp: "plays of the new Ayah alone",
  setReps: "Ayahs so far",
  setRepsHelp: "plays through the growing set",
  linkSingle: "Also repeat the first Ayah as a set of one",
  preview: "Preview",
  previewExample: (n: number) => `Example: a ${n}-Ayah passage`,
  addAyah: (k: number) => `Add Ayah ${k}`,
  plays: (n: number) => `${n} play${n === 1 ? "" : "s"}`,
  thisStep: "this step",
  throughHere: (k: number) => `Ayahs 1–${k} so far`,
  wholePlan: "whole passage",
  rowLearn: (k: number, reps: number) => `Learn Ayah ${k} ×${reps}`,
  rowLearnHint: "Listen to the new Ayah",
  rowLink: (k: number, reps: number) => (k === 1 ? `Ayah 1 again ×${reps}` : `Join Ayahs 1–${k} ×${reps}`),
  rowLinkHint: "Listen to the growing set",
  prevStep: "Previous Ayah step",
  nextStep: "Next Ayah step",
  // session
  start: "Start",
  pause: "Pause",
  resume: "Resume",
  restart: "Start again",
  back: "Back one step",
  skip: "Skip step",
  done: "Passage complete. Well done!",
  stepOf: (i: number, n: number) => `Step ${i} of ${n}`,
  playsLeft: (n: number) => `${n} play${n === 1 ? "" : "s"} left`,
  repeatOf: (r: number, n: number) => `repeat ${r} of ${n}`,
  roundOf: (r: number, n: number) => `round ${r} of ${n}`,
  nowPlaying: (ref: string) => `Now: ${ref}`,
  reciteSet: "Recite these Ayahs",
  backToLesson: "Back to lesson",
  open: "Ayah Chain",
  offlineSaved: (n: number, total: number) => `Saved for offline: ${n} of ${total} Ayahs`,
  saveAll: "Save all for offline",
  saving: "Saving…",
  invalid: "This passage can't be used for Ayah Chain. Choose a range of 1–60 Ayahs from New Learning.",
  practiceOnly: "Listening practice only — your Hifz records are not changed.",
  textHidden: "Text hidden",
  showText: "Show text",
  hideText: "Hide text",
} as const;

/** "Learn Ayah 3 ×3" / "Join Ayahs 1–3 ×2" using positions within the passage (as the preview does). */
export const stepRow = (s: Pick<ChainStep, "type" | "cycle" | "repeats">) =>
  s.type === "learn" ? CHAIN_TEXT.rowLearn(s.cycle, s.repeats) : CHAIN_TEXT.rowLink(s.cycle, s.repeats);
export const stepHint = (s: Pick<ChainStep, "type">) => (s.type === "learn" ? CHAIN_TEXT.rowLearnHint : CHAIN_TEXT.rowLinkHint);
export const ayahRef = (x: ChainAyah) => `${x[0]}:${x[1]}`;
