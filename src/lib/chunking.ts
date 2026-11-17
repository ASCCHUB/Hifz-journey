// Pure, canonical chunking for lessons. Units always reference (surah, ayah, word-index range) of the bundled
// text; words are read from the dataset, never generated, reordered, duplicated or edited.
//
// Phrase boundaries are *practice aids*, chosen automatically: preferably after a word carrying a waqf mark
// (ۖ ۗ ۚ ۛ ۘ ۙ ۜ already present in the Uthmani text), otherwise by length. They are not presented as
// authoritative waqf/ibtida rulings.
import { pageContent, words as ayahWords } from "./quran";

export type Ayah = [number, number];
export type Unit = { s: number; a: number; from: number; to: number; whole: boolean };

const WAQF = /[ۖ-ۜ]/;

/** Split one Ayah's words into practice units [from, to] (inclusive word indexes). */
export function splitAyah(words: string[], target = 8, max = 12, min = 3): [number, number][] {
  const n = words.length;
  if (n <= max) return [[0, n - 1]];
  const out: [number, number][] = [];
  let start = 0;
  while (start < n) {
    if (n - start <= max) { out.push([start, n - 1]); break; }
    // Prefer the waqf boundary closest to `target` within [min, max] words; else cut at `target`.
    let cut = -1, best = Infinity;
    for (let i = start + min - 1; i <= Math.min(n - 1, start + max - 1); i++) {
      if (WAQF.test(words[i]) && n - (i + 1) >= min) { const d = Math.abs(i - start + 1 - target); if (d < best) { best = d; cut = i; } }
    }
    if (cut < 0) cut = Math.min(n - 1, start + target - 1);
    if (n - (cut + 1) < min) cut = n - 1; // never leave a tiny tail
    out.push([start, cut]);
    start = cut + 1;
  }
  return out;
}

export function unitsForAyah(s: number, a: number, target?: number, max?: number): Unit[] {
  const ws = ayahWords(s, a);
  const parts = splitAyah(ws, target, max);
  return parts.map(([from, to]) => ({ s, a, from, to, whole: parts.length === 1 }));
}

/** Group consecutive Ayahs so each group has about `targetWords` words (a long Ayah forms its own group). */
export function groupAyahs(ayahs: Ayah[], targetWords = 30): Ayah[][] {
  const groups: Ayah[][] = []; let cur: Ayah[] = [], size = 0;
  for (const x of ayahs) {
    const n = ayahWords(x[0], x[1]).length;
    if (cur.length && size + n > targetWords) { groups.push(cur); cur = []; size = 0; }
    cur.push(x); size += n;
  }
  if (cur.length) groups.push(cur);
  return groups;
}

/** The Ayahs that begin on Mushaf page `pg`, in order (pages in this layout start on an Ayah boundary). */
export function pageAyahs(pg: number): Ayah[] {
  return pageContent(pg).ayat.map(([s, a]) => [s, a] as Ayah);
}

/** Text of a unit, from the canonical words. */
export const unitWords = (u: Unit) => ayahWords(u.s, u.a).slice(u.from, u.to + 1);
export const unitKey = (u: Unit) => `${u.s}:${u.a}:${u.from}-${u.to}`;
