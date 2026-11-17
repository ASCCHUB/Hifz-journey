// Turn a finished live-recitation session into memorization updates.
//
// Weighting (speech recognition can be wrong, so suspicion counts less than a confirmed mistake):
//  • ayah with a mistake YOU confirmed       -> "bad": weak-ayah queue, word mistake count, revision reset
//  • ayah with unreviewed suspicions only    -> no change the first time; "hes" (short re-review + weak queue)
//                                               only when the same ayah is suspected again on another day
//  • ayah that is mostly "uncertain"         -> not assessed (no change)
//  • ayah recited cleanly from start to end  -> "ok" (counts as a successful review)
//  • ayah not fully reached                  -> not assessed
// Only ayahs that already have memorization records are rescheduled (applyResults "custom" behaviour).
import { applyResults, type Mark } from "./hifz";
import { key } from "./quran";
import type { Alignment, ExpWord, Summary, Verdict } from "./recitationAlign";
import { addHist, today, type AppState, type RecMistake, type RecSession } from "./store";

export type AyahVerdict = RecSession["ayahs"][string];

export function assessAyahs(exp: ExpWord[], al: Alignment, verdicts: Record<number, Verdict>) {
  const groups = new Map<string, number[]>();
  exp.forEach((w, i) => { const k = key(w.s, w.a); (groups.get(k) || groups.set(k, []).get(k)!).push(i); });
  const out: Record<string, AyahVerdict> = {};
  groups.forEach((idx, k) => {
    const st = idx.map((i) => al.exp[i]);
    if (st.some((x) => x === "pending")) { if (st.some((x) => x !== "pending")) out[k] = "partial"; return; }
    const isMistake = (i: number) => al.exp[i] === "incorrect" || al.exp[i] === "missing";
    if (idx.some((i) => verdicts[i] === "confirmed")) out[k] = "confirmed";
    else if (idx.some((i) => isMistake(i) && verdicts[i] !== "dismissed")) out[k] = "suspected";
    else if (idx.filter((i) => al.exp[i] === "uncertain" && verdicts[i] !== "dismissed").length * 2 > idx.length) out[k] = "uncertain";
    else out[k] = "clean";
  });
  return out;
}

export function saveRecitation(d: AppState, args: {
  exp: ExpWord[]; al: Alignment; verdicts: Record<number, Verdict>; summary: Summary; heardText: (expIndex: number) => string | undefined;
  title: string; engine: "local" | "browser"; secs: number; items: [number, number][];
}) {
  const { exp, al, verdicts, summary, title, engine, secs, items } = args;
  const ayahs = assessAyahs(exp, al, verdicts);
  const t = today();
  const marks: [number, number][] = []; const res: Record<number, Mark> = {};
  d.rsus ||= {};
  Object.entries(ayahs).forEach(([k, v]) => {
    const [s, a] = k.split(":").map(Number) as [number, number];
    if (v === "confirmed") { res[marks.length] = "bad"; marks.push([s, a]); delete d.rsus[k]; }
    else if (v === "suspected") {
      const prev = d.rsus[k];
      const n = prev && prev.d !== t ? prev.n + 1 : prev?.n || 1;
      d.rsus[k] = { n, d: t };
      if (n >= 2) { res[marks.length] = "hes"; marks.push([s, a]); }
    } else if (v === "clean") { res[marks.length] = "ok"; marks.push([s, a]); delete d.rsus[k]; }
  });
  // Word-level mistake counts: only mistakes the user confirmed.
  exp.forEach((w, i) => {
    if (verdicts[i] !== "confirmed") return;
    const m = (d.mw[key(w.s, w.a)] ||= {});
    m[String(w.w)] = (m[String(w.w)] || 0) + 1;
  });
  if (marks.length) applyResults(d, marks, res, "custom", `${title} · live`);
  else addHist(d, "Live recitation", title, Object.keys(ayahs).length, summary.confirmed + summary.review);
  const mistakes: RecMistake[] = [];
  exp.forEach((w, i) => {
    const st = al.exp[i];
    if (st !== "incorrect" && st !== "missing" && st !== "uncertain") return;
    mistakes.push({ s: w.s, a: w.a, w: w.w, type: st, heard: args.heardText(i), verdict: verdicts[i] });
  });
  const [s0, a0] = items[0], [s1, a1] = items[items.length - 1];
  d.recSessions = [{ t: Date.now(), title, engine, secs, range: [s0, a0, s1, a1] as [number, number, number, number], sum: summary, ayahs, mistakes: mistakes.slice(0, 150) }, ...(d.recSessions || [])].slice(0, 30);
  return { ayahs, rescheduled: marks.length };
}
