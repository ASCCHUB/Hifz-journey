// Word-level alignment of recognized speech against the canonical Quran text.
// The canonical words are only READ here; normalization produces comparison keys and never alters display text.
// Every non-correct result is a *suspicion* from speech recognition until the user confirms it.

export type ExpWord = { s: number; a: number; w: number; txt: string; k: string; sk: string };
export type HeardToken = { id: string; raw: string; seg: number; confidence?: number };
export type ExpStatus = "pending" | "correct" | "incorrect" | "missing" | "uncertain";
export type HeardStatus = "match" | "near" | "incorrect" | "extra" | "repeat" | "uncertain";
export type HeardResult = HeardToken & { k: string; status: HeardStatus; exp?: number; score?: number };
export type Alignment = {
  exp: ExpStatus[];            // per expected word (indexes into the full passage)
  heardFor: (number | null)[]; // heard token index that produced each expected word's status
  heard: HeardResult[];
  cursor: number;              // next expected word index
  lost: boolean;               // recent speech no longer follows the text
};

const LOW_CONFIDENCE = 0.45;
// Similarity at or above this counts as the same word. 0.8 lets a 5+ letter word differ by one letter
// (recognizer spelling), while a one-letter difference in a 4-letter word (الدين / الذين) stays "unclear".
const NEAR = 0.8;
const MERGE = 0.85; // split/joined-word matches must be close, or they would explain away real skips

/** Comparison key: letters only, hamza seats / alif forms / ta marbuta / alif maqsura unified. */
export function normKey(w: string): string {
  return w
    .replace(/و([ً-ْ]*)ٰ/g, "ا$1") // Uthmani rasm: صلوٰة / زكوٰة / حيوٰة are written with alif in standard spelling
    .replace(/ۧ/g, "ي")                      // small yeh as in إبرٰهـۧم is written ي in standard spelling
    .replace(/ٰ/g, "ا")                      // dagger alif -> alif
    .replace(/[^ء-غف-يٱ]/g, "")              // drop harakat, Quranic marks, tatweel, digits
    .replace(/[ٱأإآ]/g, "ا").replace(/ى/g, "ي").replace(/ة/g, "ه")
    .replace(/[ؤئ]/g, "ء").replace(/ء/g, "");
}
/** Skeleton key: also ignores written alifs, which Uthmani and standard spelling often differ on (الرحمن / الرحمٰن). */
export const skeleton = (k: string) => k.replace(/ا/g, "").replace(/^و?ي(?=ا)/, "");

function lev(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const row = [i];
    for (let j = 1; j <= b.length; j++) row[j] = Math.min(prev[j] + 1, row[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    prev = row;
  }
  return prev[b.length];
}
/** 1 = same word (after normalization), 0 = unrelated. */
export function wordScore(k: string, sk: string, e: ExpWord): number {
  if (!k) return 0;
  if (k === e.k || (sk && sk === e.sk)) return 1;
  // Compare skeletons (no alifs): alif spelling varies, and keeping it inflates similarity (الذين vs الدين).
  if (sk && e.sk) return 1 - lev(sk, e.sk) / Math.max(sk.length, e.sk.length);
  return 1 - lev(k, e.k) / Math.max(k.length, e.k.length);
}

export function buildExpected(items: [number, number][], wordsOf: (s: number, a: number) => string[]): ExpWord[] {
  return items.flatMap(([s, a]) => wordsOf(s, a).map((txt, w) => { const k = normKey(txt); return { s, a, w, txt, k, sk: skeleton(k) }; }));
}

/**
 * Semi-global alignment (all heard tokens consumed; the unrecited tail of the passage is free).
 * Costs: exact 0, near 0.2–0.5, substitution ≤1, skipped expected word 1, extra heard word 1.
 */
type Tok = HeardToken & { k: string; sk: string };
const BLOCK = 40;
type CachedBlock = { expected: ExpWord[]; exp: [number, ExpStatus, number | null][]; heard: [number, HeardStatus, number | undefined, number | undefined][]; cursor: number };
const blockCache = new Map<string, CachedBlock>();

export function align(expected: ExpWord[], tokens: HeardToken[], anchor = 0): Alignment {
  const exp: ExpStatus[] = expected.map(() => "pending");
  const heardFor: (number | null)[] = expected.map(() => null);
  const toks: Tok[] = tokens.map((t) => { const k = normKey(t.raw); return { ...t, k, sk: skeleton(k) }; });
  const heard: HeardResult[] = toks.map((t) => ({ id: t.id, raw: t.raw, seg: t.seg, confidence: t.confidence, k: t.k, status: "extra" as HeardStatus }));
  // Align in blocks so long sessions stay fast; each block starts where the previous one ended.
  let cursor = anchor;
  for (let start = 0; start < toks.length; start += BLOCK) {
    const block = toks.slice(start, start + BLOCK);
    const ck = block.length === BLOCK ? `${expected.length}|${cursor}|${start}|${block.map((t) => t.id + t.raw).join(",")}` : "";
    const hit = ck ? blockCache.get(ck) : undefined;
    if (hit && hit.expected === expected) {
      hit.exp.forEach(([e, st, h]) => { exp[e] = st; if (h !== null) heardFor[e] = h; });
      hit.heard.forEach(([i, status, e, score]) => { heard[i].status = status; heard[i].exp = e; heard[i].score = score; });
      cursor = hit.cursor;
      continue;
    }
    const before = exp.slice();
    const next = alignBlock(expected, block, start, cursor, exp, heardFor, heard);
    if (ck) {
      const changed: [number, ExpStatus, number | null][] = [];
      exp.forEach((st, e) => { if (st !== before[e]) changed.push([e, st, heardFor[e]]); });
      const hs: [number, HeardStatus, number | undefined, number | undefined][] = [];
      for (let i = start; i < start + block.length; i++) hs.push([i, heard[i].status, heard[i].exp, heard[i].score]);
      if (blockCache.size > 200) blockCache.clear();
      blockCache.set(ck, { expected, exp: changed, heard: hs, cursor: next });
    }
    cursor = next;
  }
  // Classify unaligned heard words: a repeat of nearby recited text, unreadable, or extra.
  const nextExp: number[] = new Array(heard.length).fill(cursor);
  for (let i = heard.length - 2; i >= 0; i--) nextExp[i] = heard[i + 1].exp !== undefined && heard[i + 1].status !== "repeat" ? heard[i + 1].exp! : nextExp[i + 1];
  let lastExp = anchor - 1;
  heard.forEach((h, i) => {
    if (h.exp !== undefined) { lastExp = Math.max(lastExp, h.exp); return; }
    if (!h.k) { h.status = "uncertain"; return; }
    const sk = skeleton(h.k);
    const to = Math.min(expected.length - 1, Math.max(lastExp, nextExp[i]));
    for (let e = to; e >= Math.max(0, lastExp - 40); e--) if (wordScore(h.k, sk, expected[e]) >= 1) { h.status = "repeat"; h.exp = e; return; }
    h.status = h.confidence !== undefined && h.confidence < LOW_CONFIDENCE ? "uncertain" : "extra";
  });
  const tail = heard.slice(-6);
  const lost = tail.length >= 6 && tail.every((h) => h.status === "extra" || h.status === "incorrect" || h.status === "uncertain");
  return { exp, heardFor, heard, cursor, lost };
}

function alignBlock(expected: ExpWord[], toks: Tok[], offset: number, anchor: number, exp: ExpStatus[], heardFor: (number | null)[], heard: HeardResult[]): number {
  const n = toks.length;
  const m = Math.min(expected.length - anchor, 2 * n + 60);
  if (!n || m <= 0) return anchor;
  const W = m + 1;
  const D = new Float32Array((n + 1) * W);
  // 1 diag, 2 up (extra heard), 3 left (missing expected),
  // 4 two heard pieces = one Quran word (recognizer split it), 5 one heard word = two Quran words (recognizer joined them)
  const B = new Uint8Array((n + 1) * W);
  const S = new Float32Array((n + 1) * W);
  const cost = (sc: number) => (sc >= 1 ? 0 : sc >= NEAR ? 0.3 : sc >= 0.5 ? 0.7 : 1);
  for (let j = 1; j <= m; j++) { D[j] = j; B[j] = 3; }
  for (let i = 1; i <= n; i++) {
    D[i * W] = i; B[i * W] = 2;
    const t = toks[i - 1];
    const pair = i >= 2 ? (() => { const k = toks[i - 2].k + t.k; return { k, sk: skeleton(k) }; })() : null;
    for (let j = 1; j <= m; j++) {
      const e = expected[anchor + j - 1];
      const sc = wordScore(t.k, t.sk, e);
      let best = D[(i - 1) * W + j - 1] + cost(sc), b = 1, bs = sc;
      const up = D[(i - 1) * W + j] + 1;
      const left = D[i * W + j - 1] + 1;
      if (up < best) { best = up; b = 2; }
      if (left < best) { best = left; b = 3; }
      if (pair && sc < 1) {
        const s2 = wordScore(pair.k, pair.sk, e);
        if (s2 >= MERGE && s2 >= sc + 0.25) { const c = D[(i - 2) * W + j - 1] + cost(s2) + 0.15; if (c < best) { best = c; b = 4; bs = s2; } }
      }
      if (j >= 2 && sc < 1) {
        const p = expected[anchor + j - 2], s3 = wordScore(t.k, t.sk, { ...e, k: p.k + e.k, sk: p.sk + e.sk });
        if (s3 >= MERGE && s3 >= sc + 0.25 && Math.min(p.sk.length, e.sk.length) >= 3) { const c = D[(i - 1) * W + j - 2] + cost(s3) + 0.15; if (c < best) { best = c; b = 5; bs = s3; } }
      }
      D[i * W + j] = best; B[i * W + j] = b; S[i * W + j] = bs;
    }
  }
  let j = 0, bestEnd = Infinity;
  for (let c = 0; c <= m; c++) if (D[n * W + c] < bestEnd - 1e-6) { bestEnd = D[n * W + c]; j = c; }
  const end = j;
  let i = n;
  while (i > 0 || j > 0) {
    const b = B[i * W + j];
    if (i > 0 && j > 0 && (b === 1 || b === 4 || b === 5)) {
      const sc = S[i * W + j], t = toks[i - 1];
      const low = t.confidence !== undefined && t.confidence < LOW_CONFIDENCE;
      const hs: HeardStatus = sc >= 1 ? "match" : sc >= NEAR ? "near" : sc >= 0.5 || low ? "uncertain" : "incorrect";
      const es: ExpStatus = sc >= NEAR ? "correct" : sc >= 0.5 || low ? "uncertain" : "incorrect";
      const hIdx = b === 4 ? [i - 2, i - 1] : [i - 1];
      const eIdx = b === 5 ? [anchor + j - 2, anchor + j - 1] : [anchor + j - 1];
      hIdx.forEach((hi) => { const h = heard[offset + hi]; h.exp = eIdx[eIdx.length - 1]; h.score = sc; h.status = hs; });
      eIdx.forEach((e) => { exp[e] = es; heardFor[e] = offset + hIdx[0]; });
      i -= hIdx.length; j -= eIdx.length;
    } else if (i > 0 && (j === 0 || b === 2)) {
      i--;
    } else {
      const e = anchor + j - 1;
      // A skipped word next to low-confidence speech is more likely a recognition gap than a recitation slip.
      const near = [toks[i - 1], toks[i]].filter(Boolean);
      exp[e] = near.some((h) => h.confidence !== undefined && h.confidence < LOW_CONFIDENCE) ? "uncertain" : "missing";
      j--;
    }
  }
  return anchor + end;
}

export type Verdict = "confirmed" | "dismissed";
export type Summary = { reached: number; correct: number; incorrect: number; missing: number; uncertain: number; extra: number; repeats: number; confirmed: number; review: number; accuracy: number | null };

/** Accuracy = correct / (correct + incorrect + missing) over the words reached. Uncertain words are excluded;
 *  a mistake the user dismissed counts as correct, a confirmed one stays a mistake. */
export function summarize(a: Alignment, verdicts: Record<number, Verdict>): Summary {
  let correct = 0, incorrect = 0, missing = 0, uncertain = 0, confirmed = 0, review = 0, reached = 0;
  a.exp.forEach((st, e) => {
    if (st === "pending") return;
    reached++;
    const v = verdicts[e];
    if (v === "dismissed" || st === "correct") { correct++; return; }
    if (st === "uncertain" && v !== "confirmed") { uncertain++; return; }
    if (v === "confirmed") confirmed++; else review++;
    if (st === "missing") missing++; else incorrect++;
  });
  const extra = a.heard.filter((h) => h.status === "extra").length;
  const repeats = a.heard.filter((h) => h.status === "repeat").length;
  const denom = correct + incorrect + missing;
  return { reached, correct, incorrect, missing, uncertain, extra, repeats, confirmed, review, accuracy: denom ? Math.round((correct / denom) * 1000) / 10 : null };
}
