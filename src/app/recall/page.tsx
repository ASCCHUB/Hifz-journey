"use client";
// Recall a Page — recite any Mushaf page from memory with the text hidden (works without a learning path).
// Reuses Practice: hints downgrade a correct answer to "hesitated"; nothing is saved unless every Ayah is rated;
// results go through applyResults ("assessment", which also creates records for pages not tracked yet).
import Link from "next/link";
import { Suspense, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import PageQuiz from "@/components/PageQuiz";
import Practice from "@/components/Practice";
import { SaveLine } from "@/components/SaveStatus";
import { pageAyahs, type Ayah } from "@/lib/chunking";
import { isRetained } from "@/lib/coverage";
import type { Mark } from "@/lib/hifz";
import { pageOf as pageOfAyah, ref, sname } from "@/lib/quran";
import { useStore } from "@/lib/store";

const LABEL: Record<Mark, string> = { ok: "Recited correctly", hes: "Hesitated or used a hint", bad: "Mistake / could not recall" };

function Recall({ page }: { page: number }) {
  const st = useStore();
  const ayahs = useMemo(() => pageAyahs(page), [page]);
  const [run, setRun] = useState<{ items: Ayah[]; kind: "assessment" | "weak"; title: string } | null>(null);
  const [results, setResults] = useState<{ items: Ayah[]; res: Record<number, Mark> } | null>(null);
  const [quiz, setQuiz] = useState(false);

  if (run) return <Practice items={run.items} title={run.title} kind={run.kind} onClose={() => setRun(null)}
    onComplete={(res) => { setResults({ items: run.items, res }); setRun(null); }} />;

  if (results) {
    const weak = results.items.filter((_, i) => results.res[i] !== "ok");
    return <section className="flex flex-col gap-3">
      <div className="card flex flex-col gap-3">
        <h1 className="text-xl font-bold">Page {page} · your results</h1>
        <SaveLine />
        <p className="text-sm">{weak.length === 0 ? "Every Ayah was recited correctly. Well done." : `${results.items.length - weak.length} of ${results.items.length} recited correctly · ${weak.length} to practise.`}</p>
        <ul className="flex flex-col gap-1 text-sm">{results.items.map(([s, a], i) => <li key={`${s}:${a}`} className="flex justify-between gap-2 rounded-lg border border-line px-2 py-1"><span>{ref(s, a)}</span><span className={results.res[i] === "ok" ? "text-strong" : results.res[i] === "hes" ? "text-revise" : "text-weak"}>{LABEL[results.res[i]]}</span></li>)}</ul>
        <p className="rounded-xl bg-accent-soft/40 p-3 text-sm">This is <b>one</b> recitation, recorded in your Hifz progress (whether it is saved on this device is shown above). An Ayah counts as <b>long-term</b> only after clean recitations on 5 different days, with its review interval reaching a month{(() => { const n = results.items.filter(([s, a]) => isRetained(st.mem[`${s}:${a}`])).length; return n ? ` (${n} on this page already are)` : ""; })()}.</p>
        <div className="flex flex-wrap gap-2">
          {weak.length > 0 && <button className="btn-primary" onClick={() => setRun({ items: weak, kind: "weak", title: `Page ${page} · practise ${weak.length} weak ayah${weak.length === 1 ? "" : "s"}` })}>Practise the {weak.length} weak ayah{weak.length === 1 ? "" : "s"}</button>}
          {weak.length > 0 && <Link className="btn" href={`/learn?page=${page}&template=recover`}>Step-by-step recovery for this page</Link>}
          <button className="btn" onClick={() => { setResults(null); }}>Recall this page again</button>
          <Link className="btn" href="/recall">Another page</Link>
        </div>
      </div>
      <button className="btn self-start" onClick={() => setQuiz((v) => !v)} aria-expanded={quiz}>{quiz ? "Hide" : "Optional:"} understanding &amp; order practice</button>
      {quiz && <PageQuiz page={page} />}
    </section>;
  }

  return <section className="card flex flex-col gap-4">
    <div><div className="label">Recall a page</div><h1 className="text-xl font-bold">Page {page} · {sname(ayahs[0][0])} {ayahs[0][1]}–{ayahs[ayahs.length - 1][0] !== ayahs[0][0] ? `${sname(ayahs[ayahs.length - 1][0])} ` : ""}{ayahs[ayahs.length - 1][1]}</h1>
      <p className="text-sm text-muted">{ayahs.length} ayahs · recite the whole page from memory, one Ayah at a time.</p></div>
    <ol className="list-decimal ps-5 text-sm text-muted">
      <li>The text is hidden. Recite the Ayah from memory (the previous Ayah is shown as your starting cue).</li>
      <li>Stuck? “Hint: next word” reveals one word — the Ayah then counts as <i>hesitated</i>, not clean.</li>
      <li>Reveal the Ayah, compare, and rate yourself honestly. Nothing is saved unless you finish the page.</li>
    </ol>
    <button className="btn-primary min-h-[52px] text-base" onClick={() => setRun({ items: ayahs, kind: "assessment", title: `Recall page ${page}` })}>Start recalling page {page}</button>
    <Link className="text-sm underline" href={`/recite?s=${ayahs[0][0]}&a=${ayahs[0][1]}&endS=${ayahs[ayahs.length - 1][0]}&endA=${ayahs[ayahs.length - 1][1]}`}>Or recite into the microphone with live checking (you start it; flagged words are only suggestions)</Link>
  </section>;
}

function Chooser() {
  const st = useStore(); const [pg, setPg] = useState(st.lastPage || 1);
  const [pageInput, setPageInput] = useState(String(st.lastPage || 1));
  const parsedPage = pageInput === "" ? null : Number(pageInput);
  const selectedPage = parsedPage !== null && Number.isInteger(parsedPage) && parsedPage >= 1 && parsedPage <= 604 ? parsedPage : pg;
  const commitPage = () => {
    if (parsedPage !== null && Number.isInteger(parsedPage) && parsedPage >= 1 && parsedPage <= 604) {
      setPg(parsedPage); setPageInput(String(parsedPage));
    } else setPageInput(String(pg));
  };
  const recent = useMemo(() => {
    const pages = new Map<number, number>();
    Object.entries(st.mem).forEach(([k, r]) => { const [s, a] = k.split(":").map(Number); if (!s) return; const p = pageOfAyah(s, a); pages.set(p, Math.max(pages.get(p) || 0, r.last || 0)); });
    return [...pages.entries()].sort((x, y) => y[1] - x[1]).slice(0, 12).map(([p]) => p);
  }, [st.mem]);
  return <div className="flex flex-col gap-4">
    <p className="text-sm text-muted">Test yourself on any page with the text hidden.</p>
    <section className="card flex flex-col gap-3">
      <label className="text-sm">Mushaf page (1–604)<input className="field mt-1" type="text" inputMode="numeric" pattern="[0-9]*" maxLength={3} autoComplete="off" value={pageInput} onFocus={(e) => e.currentTarget.select()} onChange={(e) => setPageInput(e.target.value.replace(/\D/g, ""))} onBlur={commitPage} onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }} /></label>
      <Link className="btn-primary" href={`/recall?page=${selectedPage}`}>Recall page {selectedPage}</Link>
    </section>
    {recent.length > 0 && <section className="card flex flex-col gap-2"><h2 className="font-bold">Pages you have practised</h2><div className="flex flex-wrap gap-2">{recent.map((p) => <Link key={p} className="btn btn-sm" href={`/recall?page=${p}`}>Page {p}</Link>)}</div></section>}
  </div>;
}
function RecallRoute() {
  const params = useSearchParams();
  const page = useMemo(() => { const n = Number(params.get("page")); return Number.isInteger(n) && n >= 1 && n <= 604 ? n : null; }, [params]);
  return page ? <Recall key={page} page={page} /> : <Chooser />;
}
export default function RecallPage() { return <Suspense fallback={null}><RecallRoute /></Suspense>; }
