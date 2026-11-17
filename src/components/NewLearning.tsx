"use client";
// New Learning: (A) Continue Learning — one unfinished lesson, others recoverable; (B) Choose what to memorize —
// one passage selector and one Start Learning action. The learning method comes from the saved preference
// (tutor.method); "Change learning method" is a small disclosure. Rules live in lib/passagePick.ts.
import Link from "next/link";
import { useMemo, useState } from "react";
import { count, Q } from "@/lib/quran";
import { adjustStart, continueChoice, continueHref, juzPages, lessonPlace, MAX_RANGE_AYAHS, onOnePage, pickAyahs, pickJuz, pickPage, pickSurah, startLink, surahPages, type Method, type Passage, type Pick, type Portion } from "@/lib/passagePick";
import { update, useStore } from "@/lib/store";
import { Sheet } from "./Shell";

type Tab = "juz" | "surah" | "page" | "ayah";
const TABS: { id: Tab; label: string }[] = [{ id: "juz", label: "Juz" }, { id: "surah", label: "Surah" }, { id: "page", label: "Page" }, { id: "ayah", label: "Ayah" }];

export default function NewLearning() {
  const st = useStore();
  const { current, others } = useMemo(() => continueChoice(st.lessons), [st.lessons]);
  const [passage, setPassage] = useState<Passage | null>(null);
  const [picking, setPicking] = useState(false);
  const [changing, setChanging] = useState(false);
  const [portion, setPortion] = useState<Portion>("page");
  const method: Method = st.tutor?.method ?? (st.settings.learnView === "ayah" ? "ayah" : "mushaf");
  const setMethod = (m: Method) => update((d) => { d.tutor = { ...(d.tutor || { mode: "guided", level: "guided", portion: "page", repeat: 3, updatedAt: 0 }), method: m, updatedAt: Date.now() }; });
  const link = passage ? startLink(passage, method, passage.fullPage ? portion : "page") : null;

  return <div className="new-learning flex flex-col gap-3">
    {current && <section className="card flex flex-col gap-2 !p-3.5" aria-labelledby="continue-title" data-testid="continue-learning">
      <h2 id="continue-title" className="label">Continue Learning</h2>
      <div><div className="text-lg font-bold">{lessonPlace(current)}</div><p className="text-sm text-muted">{current.title} · Step {current.step + 1}</p></div>
      <Link className="btn-primary" href={continueHref(current)}>Continue Lesson</Link>
      {others.length > 0 && <details className="text-sm"><summary className="touch-target cursor-pointer text-muted underline underline-offset-2">Other unfinished lessons ({others.length})</summary>
        <ul className="mt-1 flex flex-col gap-1">{others.map((l) => <li key={l.id}><Link className="btn btn-sm w-full justify-between" href={continueHref(l)}><span className="truncate">{lessonPlace(l)}</span><span className="text-xs text-muted">Step {l.step + 1}</span></Link></li>)}</ul>
      </details>}
    </section>}

    <section className="card flex flex-col gap-3 !p-3.5" aria-labelledby="choose-title">
      <h2 id="choose-title" className="text-lg font-bold">Choose what to memorize</h2>
      <button type="button" className="passage-select field flex min-h-[52px] items-center justify-between gap-2 text-left" aria-haspopup="dialog" onClick={() => setPicking(true)} data-testid="passage-select">
        {passage ? <span className="min-w-0"><span className="block truncate font-semibold">{passage.label}</span><span className="block truncate text-xs text-muted">{passage.detail}</span></span>
          : <span className="text-muted">Select Juz, Surah, Page or Ayah</span>}
        <span aria-hidden="true" className="text-muted">▾</span>
      </button>
      {link?.routed && <p className="text-xs text-muted" role="note">This passage spans more than one Mushaf page, so it opens in the Ayah-by-Ayah tutor.</p>}
      {link ? <Link className="btn-primary min-h-[48px] text-base" href={link.href} data-testid="start-learning">Start Learning</Link>
        : <button className="btn-primary min-h-[48px] text-base" disabled aria-disabled="true" data-testid="start-learning">Start Learning</button>}
      <div className="text-sm">
        <button type="button" className="touch-target text-muted underline underline-offset-2" aria-expanded={changing} onClick={() => setChanging((v) => !v)}>
          {method === "mushaf" ? "Mushaf page learning" : "Ayah-by-Ayah tutor"}{passage?.fullPage && method === "mushaf" && portion !== "page" ? ` · ${portion} half` : ""} · Change learning method
        </button>
        {changing && <fieldset className="mt-2 grid gap-2 rounded-xl border border-line p-3">
          <legend className="sr-only">Learning method</legend>
          <label className="flex items-start gap-2"><input type="radio" name="method" className="mt-1" checked={method === "mushaf"} onChange={() => setMethod("mushaf")} /><span><b>Mushaf page learning</b><span className="block text-xs text-muted">In the 15-line Mushaf, one page at a time.</span></span></label>
          {method === "mushaf" && passage?.fullPage && <div className="ms-6 flex flex-wrap gap-1" role="group" aria-label="Part of the page">{(["page", "first", "second"] as Portion[]).map((p) => <button key={p} type="button" className={`btn btn-sm ${portion === p ? "btn-on" : ""}`} aria-pressed={portion === p} onClick={() => setPortion(p)}>{p === "page" ? "Whole page" : p === "first" ? "First half" : "Second half"}</button>)}</div>}
          <label className="flex items-start gap-2"><input type="radio" name="method" className="mt-1" checked={method === "ayah"} onChange={() => setMethod("ayah")} /><span><b>Ayah-by-Ayah tutor</b><span className="block text-xs text-muted">Listen, meaning, repeat, conceal and recall, Ayah by Ayah.</span></span></label>
          <p className="text-xs text-muted">Saved as your default. Guided or manual steps are chosen inside the lesson, as before.</p>
        </fieldset>}
      </div>
    </section>
    {picking && <PassageSheet initial={passage} onClose={() => setPicking(false)} onPick={(p) => { setPassage(p); setPortion("page"); setPicking(false); }} />}
  </div>;
}

function PassageSheet({ initial, onClose, onPick }: { initial: Passage | null; onClose: () => void; onPick: (p: Passage) => void }) {
  const core = Q();
  const [tab, setTab] = useState<Tab>(initial?.source ?? "surah");
  const [juz, setJuz] = useState(1); const [juzPage, setJuzPage] = useState<number | undefined>();
  const [surah, setSurah] = useState(initial?.start.s ?? 1); const [surahPage, setSurahPage] = useState<number | undefined>(); const [query, setQuery] = useState("");
  const [page, setPage] = useState(initial?.page ?? 1);
  const [rs, setRs] = useState(initial?.start.s ?? 1); const [ra, setRa] = useState(initial?.start.a ?? 1); const [rb, setRb] = useState(initial?.end.s === initial?.start.s ? initial?.end.a ?? 1 : initial?.start.a ?? 1);
  const [adjS, setAdjS] = useState<number | "">(""); const [adjA, setAdjA] = useState<number | "">("");
  const base: Pick = tab === "juz" ? pickJuz(juz, juzPage) : tab === "surah" ? pickSurah(surah, surahPage) : tab === "page" ? pickPage(page) : pickAyahs(rs, ra, rb);
  const adjusting = adjS !== "" && adjA !== "";
  const result: Pick = base.ok && adjusting ? adjustStart(base.passage, { s: Number(adjS), a: Number(adjA) }) : base;
  const surahs = useMemo(() => core.n.map((n, i) => ({ s: i + 1, name: n[1], total: n[2] })).filter((x) => !query || `${x.s} ${x.name}`.toLowerCase().includes(query.trim().toLowerCase())), [core, query]);
  const resetAdj = () => { setAdjS(""); setAdjA(""); };

  return <Sheet title="Choose what to memorize" onClose={onClose}>
    <div role="tablist" aria-label="Choose by" className="grid grid-cols-4 gap-1 rounded-xl border border-line p-1">
      {TABS.map((t) => <button key={t.id} role="tab" aria-selected={tab === t.id} className={`btn btn-sm justify-center ${tab === t.id ? "btn-on" : "border-transparent"}`} onClick={() => { setTab(t.id); resetAdj(); }}>{t.label}</button>)}
    </div>
    <div className="passage-sheet-body min-h-[180px]">
      {tab === "juz" && <div className="flex flex-col gap-2">
        <div className="grid grid-cols-6 gap-1.5" role="listbox" aria-label="Juz">{Array.from({ length: 30 }, (_, i) => i + 1).map((j) => <button key={j} role="option" aria-selected={juz === j} className={`btn btn-sm justify-center !px-0 ${juz === j ? "btn-on" : ""}`} onClick={() => { setJuz(j); setJuzPage(undefined); resetAdj(); }}>{j}</button>)}</div>
        <label className="text-sm">Page in Juz {juz}<select className="field mt-1" value={juzPage ?? juzPages(juz)[0]} onChange={(e) => { setJuzPage(+e.target.value); resetAdj(); }}>{juzPages(juz).map((p, i) => <option key={p} value={p}>Page {p}{i === 0 ? " (start of Juz)" : ""}</option>)}</select></label>
      </div>}
      {tab === "surah" && <div className="flex flex-col gap-2">
        <input className="field" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search Surah name or number" aria-label="Search Surah" />
        <select className="field" size={6} value={surah} aria-label="Surah" onChange={(e) => { setSurah(+e.target.value); setSurahPage(undefined); resetAdj(); }}>{surahs.map((x) => <option key={x.s} value={x.s}>{x.s}. {x.name} · {x.total} Ayahs</option>)}</select>
        {surahPages(surah).length > 1 && <label className="text-sm">Page<select className="field mt-1" value={surahPage ?? surahPages(surah)[0]} onChange={(e) => { setSurahPage(+e.target.value); resetAdj(); }}>{surahPages(surah).map((p, i) => <option key={p} value={p}>Page {p}{i === 0 ? " (Ayah 1)" : ""}</option>)}</select></label>}
      </div>}
      {tab === "page" && <div className="flex flex-col gap-2">
        <label className="text-sm">Mushaf page (1–604)<input className="field mt-1" type="number" inputMode="numeric" min={1} max={604} value={page || ""} onFocus={(e) => e.currentTarget.select()} onChange={(e) => { setPage(Math.trunc(+e.target.value)); resetAdj(); }} /></label>
        <input type="range" className="h-11 w-full" min={1} max={604} value={Math.min(604, Math.max(1, page || 1))} aria-label="Mushaf page" onChange={(e) => { setPage(+e.target.value); resetAdj(); }} />
      </div>}
      {tab === "ayah" && <div className="grid grid-cols-3 gap-2">
        <label className="col-span-3 text-sm">Surah<select className="field mt-1" value={rs} onChange={(e) => { const s = +e.target.value; setRs(s); setRa(1); setRb(1); }}>{core.n.map((n, i) => <option key={i} value={i + 1}>{i + 1}. {n[1]}</option>)}</select></label>
        <label className="text-sm">From Ayah<input className="field mt-1" type="number" inputMode="numeric" min={1} max={count(rs)} value={ra || ""} onChange={(e) => { const v = Math.trunc(+e.target.value); setRa(v); if (rb < v) setRb(v); }} /></label>
        <label className="text-sm">To Ayah<input className="field mt-1" type="number" inputMode="numeric" min={1} max={count(rs)} value={rb || ""} onChange={(e) => setRb(Math.trunc(+e.target.value))} /></label>
        <p className="self-end pb-2 text-xs text-muted">1–{count(rs)} · up to {MAX_RANGE_AYAHS}</p>
      </div>}
    </div>
    {tab !== "ayah" && base.ok && <details className="text-sm" open={adjusting && !result.ok}><summary className="cursor-pointer text-muted">Adjust starting Ayah</summary>
      <div className="mt-2 flex flex-wrap items-end gap-2">
        <label>Surah<input className="field mt-1 w-24" type="number" min={1} max={114} value={adjS} placeholder={String(base.passage.start.s)} onChange={(e) => setAdjS(e.target.value === "" ? "" : +e.target.value)} /></label>
        <label>Ayah<input className="field mt-1 w-24" type="number" min={1} value={adjA} placeholder={String(base.passage.start.a)} onChange={(e) => setAdjA(e.target.value === "" ? "" : +e.target.value)} /></label>
        {adjusting && <button type="button" className="btn btn-sm" onClick={resetAdj}>Reset</button>}
      </div>
    </details>}
    <div className="rounded-xl bg-accent-soft/40 p-3" aria-live="polite" data-testid="passage-summary">
      {result.ok ? <><b>{result.passage.label}</b><div className="text-sm text-muted">{result.passage.detail}</div>{!onOnePage(result.passage) && <div className="text-xs text-muted">Spans more than one page: opens in the Ayah-by-Ayah tutor.</div>}</>
        : <p className="text-sm text-weak" role="alert">{result.error}</p>}
    </div>
    <button className="btn-primary min-h-[48px]" disabled={!result.ok} onClick={() => { if (result.ok) onPick(result.passage); }}>Use this passage</button>
  </Sheet>;
}
