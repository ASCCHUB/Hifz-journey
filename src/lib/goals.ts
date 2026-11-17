import { count, key, pageOf, Q, sname } from "./quran";
import { today, type AppState, type Goal } from "./store";

export const GOAL_VERB = { memorize: "Memorize", revise: "Revise", read: "Read" } as const;
export const goalScope = (g: Goal) => (g.k === "all" ? "the whole Quran" : g.k === "juz" ? `Juz ${g.v}` : sname(g.v));

function scopeAyat(g: Goal): [number, number][] {
  const out: [number, number][] = [];
  if (g.k === "surah") { for (let a = 1; a <= count(g.v); a++) out.push([g.v, a]); return out; }
  const [[s1, a1], [s2, a2]] = g.k === "all" ? [[1, 1], [114, 6]] : Q().juz[g.v - 1];
  for (let s = s1; s <= s2; s++) for (let a = s === s1 ? a1 : 1; a <= (s === s2 ? a2 : count(s)); a++) out.push([s, a]);
  return out;
}
export function goalPages(g: Goal): number[] {
  if (g.k === "all") return Array.from({ length: 604 }, (_, i) => i + 1);
  const ay = scopeAyat(g); const a = pageOf(ay[0][0], ay[0][1]), b = pageOf(ay[ay.length - 1][0], ay[ay.length - 1][1]);
  return Array.from({ length: b - a + 1 }, (_, i) => a + i);
}
export function goalProgress(st: AppState, g: Goal) {
  let done = 0, total = 0, unit = "ayat";
  if (g.type === "read") { const p = goalPages(g); total = p.length; done = p.filter((x) => (st.readPages[String(x)] || 0) >= g.c).length; unit = "pages"; }
  else {
    const ay = scopeAyat(g);
    if (g.type === "memorize") { total = ay.length; done = ay.filter(([s, a]) => st.mem[key(s, a)]).length; }
    else { const m = ay.filter(([s, a]) => st.mem[key(s, a)]); total = m.length || ay.length; done = m.filter(([s, a]) => st.mem[key(s, a)].last >= g.c).length; }
  }
  const left = total - done, days = Math.max(1, g.due - today() + 1);
  return { done, total, unit, left, late: g.due < today() && left > 0, pace: Math.ceil(left / days), daysLeft: Math.max(0, g.due - today()) };
}
