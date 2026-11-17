// Find where in the whole Quran a stretch of recognized speech belongs.
// 1) vote with word pairs (skeleton keys) from a whole-Quran index, 2) verify the best candidates with the
// same alignment used for mistake detection, 3) only accept a clear winner, otherwise wait for more words.
import { align, normKey, skeleton, type ExpWord, type HeardToken } from "./recitationAlign";

type Index = { expected: ExpWord[]; pairs: Map<string, number[]> };
let cache: Index | null = null;

export function locateIndex(expected: ExpWord[]): Index {
  if (cache && cache.expected === expected) return cache;
  const pairs = new Map<string, number[]>();
  for (let i = 0; i + 1 < expected.length; i++) {
    const k = `${expected[i].sk}|${expected[i + 1].sk}`;
    const list = pairs.get(k); if (list) list.push(i); else pairs.set(k, [i]);
  }
  cache = { expected, pairs };
  return cache;
}

export type Located = { start: number; tokenIndex: number; matched: number; ambiguous: false } | { ambiguous: true; reason: string };

/** Returns the word index where the recitation starts, and which heard token it starts at. */
export function locate(expected: ExpWord[], tokens: HeardToken[]): Located | null {
  const toks = tokens.map((t) => ({ t, sk: skeleton(normKey(t.raw)) })).filter((x) => x.sk.length >= 2);
  if (toks.length < 4) return null;
  const { pairs } = locateIndex(expected);
  const votes = new Map<number, number>();
  for (let i = 0; i + 1 < toks.length; i++) {
    const list = pairs.get(`${toks[i].sk}|${toks[i + 1].sk}`);
    if (!list || list.length > 400) continue; // very common pairs say little about position
    const weight = list.length <= 3 ? 3 : list.length <= 20 ? 2 : 1;
    for (const p of list) {
      const start = Math.max(0, p - i);
      // tolerate a few skipped/extra words by voting into a small neighbourhood
      for (const s of [start - 1, start, start + 1]) if (s >= 0) votes.set(s, (votes.get(s) || 0) + (s === start ? weight : weight / 2));
    }
  }
  const candidates = [...votes.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12).map(([s]) => s);
  if (!candidates.length) return null;
  const heard = toks.map((x) => x.t);
  const scored = candidates.map((c) => {
    const a = align(expected, heard, Math.max(0, c - 3));
    const hits = a.heard.filter((h) => h.status === "match" || h.status === "near");
    const first = hits.length ? Math.min(...hits.map((h) => h.exp!)) : c;
    return { start: first, matched: hits.length, tokenIndex: hits.length ? heard.findIndex((t) => t.id === hits[0].id) : 0 };
  }).sort((a, b) => b.matched - a.matched);
  const best = scored[0];
  if (best.matched < 4 || best.matched < heard.length * 0.5) return null;
  // A different place (not just a neighbouring offset) that matches as well: wait for more words.
  const rival = scored.find((x) => Math.abs(x.start - best.start) > 25 && x.matched >= best.matched - 1);
  if (rival) return { ambiguous: true, reason: `matches ${expected[best.start].s}:${expected[best.start].a} and ${expected[rival.start].s}:${expected[rival.start].a}` };
  return { start: best.start, tokenIndex: best.tokenIndex, matched: best.matched, ambiguous: false };
}
