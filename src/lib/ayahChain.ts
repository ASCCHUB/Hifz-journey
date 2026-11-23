// Ayah Chain: learn one new Ayah, join it to the Ayahs before it, then add the next.
//
// Pure and deterministic: no store, no audio, no Quran data. The same inputs always give the same plan.
//
// SEQUENCE RULES (every value below is a parameter, see ChainRules):
//   The passage is an ordered list of N Ayahs (1-based positions k = 1..N in the plan).
//   For each cycle k = 1..N ("Add Ayah k"):
//     1. "learn" step: the new Ayah k alone, played `newReps` times in a row.
//     2. "link"  step: the growing set, Ayahs 1..k in order, played through `setReps` times.
//        In cycle 1 the set is just Ayah 1 (already heard in step 1), so the link step is skipped
//        unless `linkSingle` is true.
//   Nothing else is added: no extra review or test step (those stay with the existing lesson engine).
//
// PLAYS: one play = one Ayah audio file played once (audio is per Ayah).
//   learn step plays = newReps
//   link step plays  = k × setReps
//   cycle k plays    = newReps + k × setReps         (cycle 1: newReps, or newReps + setReps with linkSingle)
//   total            = N × newReps + setReps × (N(N+1)/2 − 1)      (+ setReps when linkSingle)
//   Example, N = 4, newReps 3, setReps 2: 12 + 2 × 9 = 30 plays.

export type ChainAyah = [number, number]; // [surah, ayah]
export type ChainStepType = "learn" | "link";

export type ChainRules = {
  /** Plays of the new Ayah on its own in each cycle. */
  newReps: number;
  /** Plays through the growing set (Ayahs 1..k) in each cycle. */
  setReps: number;
  /** Also "link" in cycle 1, where the set is the single first Ayah. Default false. */
  linkSingle?: boolean;
};

export type ChainStep = {
  index: number;          // 0-based position in plan.steps
  cycle: number;          // k: the Ayah being added (1-based position in the passage)
  type: ChainStepType;
  from: ChainAyah;        // first Ayah of the step
  to: ChainAyah;          // last Ayah of the step
  ayahs: ChainAyah[];     // Ayahs played, in order, once per repeat
  repeats: number;
  plays: number;          // ayahs.length × repeats
  playsBefore: number;    // plays in all earlier steps (position of this step's first play)
};

export type ChainPlan = { ayahs: ChainAyah[]; rules: Required<ChainRules>; steps: ChainStep[]; cycles: number; totalPlays: number };

export const CHAIN_DEFAULTS: Required<ChainRules> = { newReps: 3, setReps: 2, linkSingle: false };
/** Limits: repeat counts 1–10 (the app's existing repeat choices go up to 10); at most 60 Ayahs (the /learn range limit). */
export const CHAIN_LIMITS = { minReps: 1, maxReps: 10, maxAyahs: 60 } as const;

export class ChainPlanError extends Error {
  code: "empty" | "too-long" | "bad-ayah" | "order" | "bad-reps";
  constructor(code: ChainPlanError["code"], message: string) { super(message); this.name = "ChainPlanError"; this.code = code; }
}

const isAyah = (x: unknown): x is ChainAyah =>
  Array.isArray(x) && x.length === 2 && Number.isInteger(x[0]) && Number.isInteger(x[1]) && x[0] >= 1 && x[0] <= 114 && x[1] >= 1 && x[1] <= 286;
const before = (x: ChainAyah, y: ChainAyah) => x[0] < y[0] || (x[0] === y[0] && x[1] < y[1]);

function checkReps(name: string, n: unknown): number {
  if (typeof n !== "number" || !Number.isInteger(n) || n < CHAIN_LIMITS.minReps || n > CHAIN_LIMITS.maxReps) {
    throw new ChainPlanError("bad-reps", `${name} must be a whole number from ${CHAIN_LIMITS.minReps} to ${CHAIN_LIMITS.maxReps}`);
  }
  return n;
}

/** Validates and completes rules (defaults for missing values). Throws ChainPlanError. */
export function chainRules(r: Partial<ChainRules> = {}): Required<ChainRules> {
  return {
    // Only an absent value takes the default; null, 0, fractions or strings are invalid input.
    newReps: checkReps("New Ayah repeats", r.newReps === undefined ? CHAIN_DEFAULTS.newReps : r.newReps),
    setReps: checkReps("Growing set repeats", r.setReps === undefined ? CHAIN_DEFAULTS.setReps : r.setReps),
    linkSingle: r.linkSingle === undefined ? CHAIN_DEFAULTS.linkSingle : r.linkSingle === true,
  };
}

/**
 * Build the plan for an ordered passage (it may cross a Surah boundary, e.g. a Mushaf page).
 * Ayahs must be valid, strictly ascending and without duplicates. Throws ChainPlanError on invalid input.
 */
export function buildChainPlan(ayahs: readonly ChainAyah[], rules: Partial<ChainRules> = {}): ChainPlan {
  const r = chainRules(rules);
  if (!Array.isArray(ayahs) || ayahs.length === 0) throw new ChainPlanError("empty", "Choose at least one Ayah");
  if (ayahs.length > CHAIN_LIMITS.maxAyahs) throw new ChainPlanError("too-long", `Choose at most ${CHAIN_LIMITS.maxAyahs} Ayahs`);
  ayahs.forEach((x, i) => {
    if (!isAyah(x)) throw new ChainPlanError("bad-ayah", `Invalid Ayah at position ${i + 1}`);
    if (i > 0 && !before(ayahs[i - 1], x)) throw new ChainPlanError("order", "Ayahs must be in Mushaf order without repeats");
  });
  const list = ayahs.map((x) => [x[0], x[1]] as ChainAyah);
  const steps: ChainStep[] = [];
  let played = 0;
  const push = (cycle: number, type: ChainStepType, xs: ChainAyah[], repeats: number) => {
    const plays = xs.length * repeats;
    steps.push({ index: steps.length, cycle, type, from: xs[0], to: xs[xs.length - 1], ayahs: xs, repeats, plays, playsBefore: played });
    played += plays;
  };
  list.forEach((x, i) => {
    const k = i + 1;
    push(k, "learn", [x], r.newReps);
    if (k > 1 || r.linkSingle) push(k, "link", list.slice(0, k), r.setReps);
  });
  return { ayahs: list, rules: r, steps, cycles: list.length, totalPlays: played };
}

/** Same-Surah convenience: Ayahs start..end of one Surah (start may equal end). */
export function chainPlanForRange(surah: number, start: number, end: number, rules: Partial<ChainRules> = {}): ChainPlan {
  if (![surah, start, end].every(Number.isInteger) || start < 1 || end < start) throw new ChainPlanError("order", "The end Ayah must not come before the start Ayah");
  if (end - start + 1 > CHAIN_LIMITS.maxAyahs) throw new ChainPlanError("too-long", `Choose at most ${CHAIN_LIMITS.maxAyahs} Ayahs`);
  return buildChainPlan(Array.from({ length: end - start + 1 }, (_, i) => [surah, start + i] as ChainAyah), rules);
}

/** Closed-form total plays (used to cross-check the plan and for previews without building it). */
export function chainTotalPlays(n: number, newReps: number, setReps: number, linkSingle = false): number {
  if (!Number.isInteger(n) || n < 1) return 0;
  return n * newReps + setReps * ((n * (n + 1)) / 2 - 1) + (linkSingle ? setReps : 0);
}

/** Plays in cycle k ("Add Ayah k"). */
export const cyclePlays = (k: number, newReps: number, setReps: number, linkSingle = false) =>
  newReps + (k > 1 || linkSingle ? k * setReps : 0);

export type CyclePreview = { cycle: number; ayah: ChainAyah; cyclePlays: number; playsThrough: number; totalPlays: number; steps: ChainStep[] };

/** Preview for one cycle: its steps, its plays, plays up to and including it, and the plan total. */
export function previewCycle(plan: ChainPlan, cycle: number): CyclePreview {
  const k = Math.min(Math.max(1, Math.round(cycle)), plan.cycles);
  const steps = plan.steps.filter((s) => s.cycle === k);
  const last = steps[steps.length - 1];
  return { cycle: k, ayah: plan.ayahs[k - 1], cyclePlays: steps.reduce((n, s) => n + s.plays, 0), playsThrough: last.playsBefore + last.plays, totalPlays: plan.totalPlays, steps };
}

// ---------------------------------------------------------------- playback position (for the player)

/** Position of one play: which step, which repeat, which Ayah. `play` is 0-based over the whole plan. */
export type ChainPosition = { play: number; step: number; repeat: number; ayahInStep: number; ayah: ChainAyah; remaining: number };

/** Resolve a 0-based play index. Returns null at or past the end of the plan. */
export function positionAt(plan: ChainPlan, play: number): ChainPosition | null {
  if (!Number.isInteger(play) || play < 0 || play >= plan.totalPlays) return null;
  let lo = 0, hi = plan.steps.length - 1;
  while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (plan.steps[mid].playsBefore <= play) lo = mid; else hi = mid - 1; }
  const s = plan.steps[lo];
  const offset = play - s.playsBefore;
  const ayahInStep = offset % s.ayahs.length;
  return { play, step: s.index, repeat: Math.floor(offset / s.ayahs.length) + 1, ayahInStep, ayah: s.ayahs[ayahInStep], remaining: plan.totalPlays - play };
}

/** First play of a step (for "skip step" and "back one step"). Clamped to the plan. */
export function stepStart(plan: ChainPlan, step: number): number {
  const i = Math.min(Math.max(0, step), plan.steps.length - 1);
  return plan.steps[i].playsBefore;
}

// ---------------------------------------------------------------- stored preferences (tutor.chain)

/** Saved in AppState.tutor.chain. Optional: absent in older saves and on older app versions (= mode off). */
export type ChainPrefs = { on: boolean; newReps: number; setReps: number; linkSingle?: boolean };
export const DEFAULT_CHAIN_PREFS: ChainPrefs = { on: false, newReps: CHAIN_DEFAULTS.newReps, setReps: CHAIN_DEFAULTS.setReps };

/**
 * Read stored preferences forgivingly: anything missing, damaged or out of range falls back to the default
 * for that field, so a bad sync value can never break a lesson. (buildChainPlan itself stays strict.)
 */
export function readChainPrefs(x: unknown): ChainPrefs {
  const o = x && typeof x === "object" && !Array.isArray(x) ? x as Record<string, unknown> : {};
  const reps = (v: unknown, d: number) => typeof v === "number" && Number.isInteger(v) && v >= CHAIN_LIMITS.minReps && v <= CHAIN_LIMITS.maxReps ? v : d;
  return {
    on: o.on === true,
    newReps: reps(o.newReps, DEFAULT_CHAIN_PREFS.newReps),
    setReps: reps(o.setReps, DEFAULT_CHAIN_PREFS.setReps),
    ...(o.linkSingle === true ? { linkSingle: true } : {}),
  };
}
