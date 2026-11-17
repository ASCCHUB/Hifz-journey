// Mutashabihat (similar Ayahs) — curated reference list + deterministic comparison.
//
// Accuracy rules
//  • Entries hold references only. All Arabic shown comes from the app's pinned canonical text (text()/words()).
//  • Shared / different words are computed deterministically: normalized forms (normA) are used only to compare,
//    never displayed. The comparison is a word-level LCS between the two canonical Ayahs.
//  • A group is learner-facing guidance only when status === "approved" with a named reviewer. Entries awaiting
//    review are hidden unless the learner opts in (Settings), and are then labelled "awaiting review".
//  • A group whose computed similarity falls below MIN_SHARED is never shown (guards against a wrong reference).
//    scripts/test-mutashabihat.mjs checks every entry against the canonical text.
//
// To approve a group after review, set status "approved", reviewer, reviewedAt (ISO date) and source.
import { key, normA, words } from "./quran";

export type Ref = [number, number];
export type MutGroup = {
  id: string;
  ayahs: Ref[];               // every Ayah in the group is similar to every other one
  note?: string;              // short reviewer note (English); never Quran text
  status: "approved" | "pending_review";
  source: string;             // where the example comes from
  reviewer?: string; reviewedAt?: string;
};

const PENDING_SOURCE = "Commonly cited Mutashabihat example; references checked deterministically against the pinned Quran text. Awaiting review by a qualified teacher.";
const pending = (id: string, ayahs: Ref[], note?: string): MutGroup => ({ id, ayahs, note, status: "pending_review", source: PENDING_SOURCE });

/** Start small; expand only with review. */
export const MUTASHABIHAT: MutGroup[] = [
  pending("2-5_31-5", [[2, 5], [31, 5]], "The whole Ayah is repeated."),
  pending("2-35_7-19", [[2, 35], [7, 19]], "Adam and his wife in the Garden: compare the wording around “eat”."),
  pending("2-48_2-123", [[2, 48], [2, 123]], "Same opening; intercession and compensation appear in a different order."),
  pending("2-49_7-141_14-6", [[2, 49], [7, 141], [14, 6]], "Rescue from Pharaoh's people: compare the verb for killing the sons."),
  pending("2-58_7-161", [[2, 58], [7, 161]], "Entering the town: several small differences."),
  pending("2-62_5-69", [[2, 62], [5, 69]], "Compare the order of the groups and the ending."),
  pending("2-136_3-84", [[2, 136], [3, 84]], "Compare the opening command and “to us”."),
  pending("2-173_16-115", [[2, 173], [16, 115]], "Compare the word order of the phrase about what is dedicated to other than Allah."),
  pending("7-54_10-3", [[7, 54], [10, 3]], "Same opening about the creation in six days; the endings differ."),
  pending("26-refrain", [[26, 8], [26, 67], [26, 103], [26, 121], [26, 139], [26, 158], [26, 174], [26, 190]], "A refrain repeated after each story in Surah Ash-Shu'ara."),
  pending("77-refrain", [[77, 15], [77, 19], [77, 24], [77, 28], [77, 34], [77, 37], [77, 40], [77, 45], [77, 47], [77, 49]], "A refrain repeated through Surah Al-Mursalat."),
];

export const MIN_SHARED = 0.5; // share of the shorter Ayah's words that must match

export type Diff = { a: boolean[]; b: boolean[]; shared: number; kind: "exact" | "order" | "near"; phrase: [number, number] | null };

/** Word-level comparison of two canonical Ayahs. a[i]/b[j] = true when that word is part of the common sequence. */
export function compare(x: Ref, y: Ref): Diff {
  const A = words(x[0], x[1]).map(normA), B = words(y[0], y[1]).map(normA);
  const n = A.length, m = B.length;
  const L = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) L[i][j] = A[i] === B[j] ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1]);
  const a = new Array<boolean>(n).fill(false), b = new Array<boolean>(m).fill(false);
  for (let i = 0, j = 0; i < n && j < m;) {
    if (A[i] === B[j]) { a[i] = b[j] = true; i++; j++; } else if (L[i + 1][j] >= L[i][j + 1]) i++; else j++;
  }
  // longest contiguous shared run in x (the "matching phrase")
  let best: [number, number] | null = null;
  for (let i = 0; i < n;) { if (!a[i]) { i++; continue; } let e = i; while (e + 1 < n && a[e + 1]) e++; if (!best || e - i > best[1] - best[0]) best = [i, e]; i = e + 1; }
  const exact = n === m && A.every((w, i) => w === B[i]);
  const sameBag = n === m && [...A].sort().join(" ") === [...B].sort().join(" ");
  return { a, b, shared: L[0][0] / Math.max(1, Math.min(n, m)), kind: exact ? "exact" : sameBag ? "order" : "near", phrase: best };
}

let index: Map<string, MutGroup[]> | null = null;
function byAyah() {
  if (index) return index;
  index = new Map();
  for (const g of MUTASHABIHAT) for (const r of g.ayahs) { const k = key(r[0], r[1]); index.set(k, [...(index.get(k) || []), g]); }
  return index;
}

export type Match = { ref: Ref; group: MutGroup; diff: Diff };
/** Visible matches for one Ayah. Approved only, unless includePending. Low-similarity results are dropped. */
export function matchesFor(s: number, a: number, includePending = false): Match[] {
  const out: Match[] = [];
  for (const g of byAyah().get(key(s, a)) || []) {
    if (g.status !== "approved" && !includePending) continue;
    if (g.status === "approved" && !g.reviewer) continue;
    for (const r of g.ayahs) {
      if (r[0] === s && r[1] === a) continue;
      try { const diff = compare([s, a], r); if (diff.shared >= MIN_SHARED) out.push({ ref: r, group: g, diff }); } catch { /* reference outside the loaded text */ }
    }
  }
  return out;
}

export const hasMatches = (s: number, a: number, includePending = false) => matchesFor(s, a, includePending).length > 0;
