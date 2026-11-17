"use client";
import Link from "next/link";
import { useMemo, useState } from "react";
import PageTracker from "@/components/PageTracker";
import { claimedAyahs, coverageOf, coverageSummary } from "@/lib/coverage";
import { count, pageContent, pageOf, Q, sname } from "@/lib/quran";
import { useStore } from "@/lib/store";
import { juzName, surahPageLabel } from "@/lib/quranView";

type Tab = "juz" | "surah" | "page";
type Summary = { total: number; retained: number; recited: number; weak: number; claimed: number; untouched: number };
const blank = (total: number): Summary => ({ total, retained: 0, recited: 0, weak: 0, claimed: 0, untouched: 0 });
const refOrder = (s: number, a: number) => s * 1000 + a;

export default function MyQuranLibrary({ initialTab = "juz", initialPage = null }: { initialTab?: Tab; initialPage?: number | null }) {
  const st = useStore(); const core = Q(); const [tab, setTab] = useState<Tab>(initialTab);
  const [search, setSearch] = useState(""); const [selectedPage, setSelectedPage] = useState<number | null>(initialPage);
  const claims = useMemo(() => claimedAyahs(st), [st.studentJourney]);
  const overall = useMemo(() => coverageSummary(st), [st.mem, st.weak, st.studentJourney]);
  const recitedTotal = overall.retained + overall.learning + overall.weak;
  const summarize = (start: { s: number; a: number }, end: { s: number; a: number }): Summary => {
    const out = blank(0);
    for (let s = start.s; s <= end.s; s++) for (let a = s === start.s ? start.a : 1; a <= (s === end.s ? end.a : count(s)); a++) {
      out.total++; const k = `${s}:${a}`, cov = coverageOf(st, k, claims);
      if (cov === "retained") { out.retained++; out.recited++; }
      else if (cov === "learning") out.recited++;
      else if (cov === "weak") { out.weak++; out.recited++; }
      else if (cov === "claimed" || cov === "legacy_marked") out.claimed++;
      else out.untouched++;
    }
    return out;
  };
  const juzRows = useMemo(() => core.juz.map(([[s, a], [es, ea]], i) => ({ id: i + 1, start: { s, a }, end: { s: es, a: ea }, firstPage: pageOf(s, a), lastPage: pageOf(es, ea), summary: summarize({ s, a }, { s: es, a: ea }) })), [st.mem, st.weak, st.studentJourney]); // eslint-disable-line react-hooks/exhaustive-deps
  const surahRows = useMemo(() => core.n.map((n, i) => ({ id: i + 1, name: n[1], total: n[2], startPage: pageOf(i + 1, 1), endPage: pageOf(i + 1, n[2]), summary: summarize({ s: i + 1, a: 1 }, { s: i + 1, a: n[2] }) })).filter((x) => !search || `${x.id} ${x.name}`.toLowerCase().includes(search.toLowerCase())), [st.mem, st.weak, st.studentJourney, search]); // eslint-disable-line react-hooks/exhaustive-deps
  // Only what is there: zero counts are left out, and an untouched range simply says "Not started".
  const summaryText = (x: Summary) => { const parts = [x.recited && `${x.recited} recited`, x.retained && `${x.retained} retained`, x.weak && `${x.weak} weak`, x.claimed && `${x.claimed} self-reported, not checked`].filter(Boolean); return parts.length ? `${parts.join(" · ")}${x.untouched ? ` · ${x.untouched} not started` : ""}` : "Not started"; };
  const pageActions = selectedPage && <section className="card flex flex-col gap-2" aria-label={`Actions for Mushaf page ${selectedPage}`}><div className="font-semibold">Page {selectedPage} · choose an action</div><div className="grid grid-cols-2 gap-2"><Link className="btn" href={`/mushaf?p=${selectedPage}`}>Read</Link><Link className="btn" href={`/mushaf?p=${selectedPage}&mode=learn&portion=page`}>Learn</Link><Link className="btn" href={`/mushaf?p=${selectedPage}&mode=recall`}>Recall</Link><Link className="btn" href={`/mushaf?p=${selectedPage}&mode=revise`}>Revise</Link></div><button className="self-start text-sm underline" onClick={() => setSelectedPage(null)}>Close actions</button></section>;

  return <div className="flex flex-col gap-4">
    <header className="my-quran-heading"><p className="font-semibold">{recitedTotal.toLocaleString()} ayahs recited · {overall.claimed.toLocaleString()} self-reported, not yet checked</p><p className="mt-1 text-sm text-muted">Browse the canonical Mushaf by Juz, Surah, or page. Coverage keeps self-reported claims separate from recited evidence.</p></header>
    <div className="flex flex-wrap gap-2" aria-label="Coverage legend"><span className="pill">Recited</span><span className="pill" style={{ color: "var(--weak)" }}>Needs practice</span><span className="pill" style={{ color: "var(--gold)" }}>Self-reported · not checked</span><span className="pill" style={{ color: "var(--muted)" }}>Not started</span></div>
    <div role="tablist" aria-label="Browse Quran by" className="grid grid-cols-3 gap-2">{(["juz", "surah", "page"] as const).map((x) => <button key={x} role="tab" aria-selected={tab === x} className={`btn justify-center capitalize ${tab === x ? "btn-on" : ""}`} onClick={() => setTab(x)}>{x === "page" ? "By Page" : `By ${x}`}</button>)}</div>
    {tab === "juz" && <section className="quran-juz-grid">{juzRows.map((j) => { const segments: { s: number; start: number; end: number }[] = []; for (let s = j.start.s; s <= j.end.s; s++) segments.push({ s, start: s === j.start.s ? j.start.a : 1, end: s === j.end.s ? j.end.a : count(s) }); const claimLabel = j.summary.claimed === j.summary.total ? "Whole Juz self-reported" : j.summary.claimed ? `Partial self-reported coverage · ${j.summary.claimed}/${j.summary.total}` : "No self-reported claim"; return <details key={j.id} className="card !py-2.5"><summary className="cursor-pointer font-semibold">Juz {j.id} <span className="text-sm font-normal text-muted">· pages {j.firstPage}–{j.lastPage}</span><span className="ms-2 text-xs font-normal text-muted">{summaryText(j.summary)}{j.summary.claimed ? ` · ${claimLabel}` : ""}</span></summary><div className="mt-3 flex flex-col gap-2"><div className="text-sm text-muted">Actual Surah ranges</div>{segments.map((x) => <div key={x.s} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-line p-2 text-sm"><span>{x.s}. {sname(x.s)} · Ayahs {x.start}–{x.end} · pages {pageOf(x.s, x.start)}–{pageOf(x.s, x.end)}</span><button className="btn btn-sm" onClick={() => { setTab("page"); setSelectedPage(pageOf(x.s, x.start)); }}>Open first page</button></div>)}<div className="flex flex-wrap gap-1">{Array.from({ length: j.lastPage - j.firstPage + 1 }, (_, i) => j.firstPage + i).map((p) => <button key={p} className="btn btn-sm" onClick={() => { setTab("page"); setSelectedPage(p); }}>Page {p}</button>)}</div></div></details>; })}{pageActions}</section>}
    {tab === "surah" && <section className="flex flex-col gap-2"><label className="text-sm" htmlFor="surah-search">Search all 114 Surahs</label><input id="surah-search" className="field" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Name or number" />{surahRows.map((s) => <details key={s.id} className="card !py-2.5"><summary className="cursor-pointer font-semibold">{s.id}. {s.name}<span className="text-sm font-normal text-muted"> | {surahPageLabel(s.name, s.total, s.startPage, s.endPage).replace(`${s.name} | `, "")}</span><span className="ms-2 text-xs font-normal text-muted">{summaryText(s.summary)}</span></summary><div className="mt-3 flex flex-wrap gap-2">{Array.from({ length: s.endPage - s.startPage + 1 }, (_, i) => s.startPage + i).map((p) => <button key={p} className="btn btn-sm" onClick={() => { setTab("page"); setSelectedPage(p); }}>Open page {p} | {(() => { const refs = pageContent(p).ayat.filter(([surah]) => surah === s.id); return refs.length ? `Ayahs ${refs[0][1]}-${refs[refs.length - 1][1]}` : "no Ayahs"; })()}</button>)}</div></details>)}{pageActions}</section>}
    {tab === "page" && <><PageTracker initialPage={selectedPage} />{pageActions}</>}
  </div>;
}



