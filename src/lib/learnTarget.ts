// Passage from the URL, shared by /learn and /chain: ?page=N, or ?s=&a=&endS=&endA= (at most 60 Ayahs),
// plus &template=recover and &pathId=. Moved unchanged from app/learn/page.tsx so both routes validate alike.
import { pageAyahs, type Ayah } from "./chunking";
import { expandRanges } from "./journey";
import { count, Q, sname } from "./quran";
import type { LessonState } from "./store";

export type LearnTarget = { unit: LessonState["unit"]; ayahs: Ayah[]; title: string; template: "learn" | "recover"; pathId?: string };
export function parseLearnTarget(q: URLSearchParams): LearnTarget | null {
  const template = q.get("template") === "recover" ? "recover" : "learn"; const pathId = q.get("pathId") || undefined;
  const pg = Number(q.get("page"));
  if (q.has("page") && Number.isInteger(pg) && pg >= 1 && pg <= 604) { const ayahs = pageAyahs(pg); return { unit: { kind: "page", page: pg, start: { s: ayahs[0][0], a: ayahs[0][1] }, end: { s: ayahs.at(-1)![0], a: ayahs.at(-1)![1] } }, ayahs, title: `${template === "recover" ? "Recover" : "Learn"} page ${pg}`, template, pathId }; }
  const s = Number(q.get("s")), a = Number(q.get("a")), es = Number(q.get("endS") || q.get("s")), ea = Number(q.get("endA") || q.get("a"));
  const ok = [s, a, es, ea].every(Number.isInteger) && s >= 1 && s <= 114 && es >= 1 && es <= 114 && a >= 1 && a <= count(s) && ea >= 1 && ea <= count(es) && (s < es || (s === es && a <= ea));
  if (!ok) return null;
  const ayahs = expandRanges(Q(), [{ start: { s, a }, end: { s: es, a: ea } }]).map((p) => [p.s, p.a] as Ayah);
  if (ayahs.length > 60) return null;
  return { unit: { kind: "range", start: { s, a }, end: { s: es, a: ea } }, ayahs, title: `${template === "recover" ? "Recover" : "Learn"} ${sname(s)} ${a}–${es !== s ? `${sname(es)} ` : ""}${ea}`, template, pathId };
}
