"use client";
// Manual revision never changes the scheduled revision queue. Practice results use the existing revision flow.
import { useState } from "react";
import { Q, count, nextAyah, sname } from "@/lib/quran";

type Ayah = [number, number];
type Mode = "page" | "ayah" | "juz" | "surah";
const MAX_AYAHS = 6236;

export function collectRevisionRange(first: Ayah, after: Ayah | null): Ayah[] {
  const items: Ayah[] = [];
  let pos: Ayah | null = first;
  while (pos && items.length < MAX_AYAHS && (!after || pos[0] < after[0] || (pos[0] === after[0] && pos[1] < after[1]))) {
    items.push(pos);
    pos = nextAyah(pos[0], pos[1]);
  }
  return items;
}

export default function ManualRevisionPicker({ onStart }: {
  onStart: (items: Ayah[], title: string) => void;
}) {
  const [mode, setMode] = useState<Mode>("page");
  const [pageInput, setPageInput] = useState("1");
  const page = Number(pageInput);
  const validPage = /^\d+$/.test(pageInput) && page >= 1 && page <= 604;
  const [surah, setSurah] = useState(1);
  const [startAyah, setStartAyah] = useState(1);
  const [endAyah, setEndAyah] = useState(7);
  const [juz, setJuz] = useState(1);
  const core = Q();

  const start = () => {
    if (mode === "page" && !validPage) return;
    let first: Ayah, after: Ayah | null, title: string;
    if (mode === "page") {
      first = [core.lay[page - 1][0], core.lay[page - 1][1]];
      after = page < 604 ? [core.lay[page][0], core.lay[page][1]] : null;
      title = `Manual revision · Page ${page}`;
    } else if (mode === "juz") {
      first = core.juz[juz - 1][0];
      after = juz < 30 ? core.juz[juz][0] : null;
      title = `Manual revision · Juz ${juz}`;
    } else if (mode === "surah") {
      first = [surah, 1];
      after = surah < 114 ? [surah + 1, 1] : null;
      title = `Manual revision · ${sname(surah)}`;
    } else {
      first = [surah, startAyah];
      after = nextAyah(surah, endAyah);
      title = `Manual revision · ${sname(surah)} ${startAyah}–${endAyah}`;
    }
    const items = collectRevisionRange(first, after);
    if (items.length) onStart(items, title);
  };
  const valid = mode === "page" ? validPage : mode !== "ayah" || (startAyah >= 1 && endAyah <= count(surah) && endAyah >= startAyah);
  return <details className="card flex flex-col gap-3" data-testid="manual-revision">
    <summary className="cursor-pointer text-lg font-bold">Manual revision · choose any passage</summary>
    <div className="mt-3 flex flex-col gap-3">
      <p className="text-sm text-muted">Revise any page, Ayah range, complete Juz or Surah, even if it is not in today's schedule.</p>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4" role="group" aria-label="Manual revision type">
        {(["page", "ayah", "juz", "surah"] as Mode[]).map((x) =>
          <button type="button" key={x} className={`btn btn-sm ${mode === x ? "btn-on" : ""}`}
            aria-pressed={mode === x} onClick={() => setMode(x)}>{x === "ayah" ? "Ayahs" : x === "juz" ? "Juz" : x === "surah" ? "Surah" : "Page"}</button>)}
      </div>
      {mode === "page" && <label className="text-sm">Page (1–604)
        <input className="field mt-1" type="number" min={1} max={604} inputMode="numeric" value={pageInput} onChange={(e) => setPageInput(e.target.value)} onBlur={() => { if (validPage) setPageInput(String(page)); }}/></label>}
      {mode === "juz" && <label className="text-sm">Juz
        <select className="field mt-1" value={juz} onChange={(e) => setJuz(+e.target.value)}>
          {Array.from({ length: 30 }, (_, i) => <option key={i} value={i + 1}>Juz {i + 1}</option>)}</select></label>}
      {(mode === "surah" || mode === "ayah") && <label className="text-sm">Surah
        <select className="field mt-1" value={surah} onChange={(e) => {
          const s = +e.target.value; setSurah(s); setStartAyah(1); setEndAyah(Math.min(7, count(s)));
        }}>{core.n.map((n, i) => <option key={i} value={i + 1}>{i + 1}. {n[1]}</option>)}</select></label>}
      {mode === "ayah" && <div className="grid grid-cols-2 gap-2">
        <label className="text-sm">From Ayah<input className="field mt-1" type="number" min={1} max={count(surah)} value={startAyah} onChange={(e) => setStartAyah(+e.target.value)}/></label>
        <label className="text-sm">To Ayah<input className="field mt-1" type="number" min={1} max={count(surah)} value={endAyah} onChange={(e) => setEndAyah(+e.target.value)}/></label>
      </div>}
      {!valid && <p role="alert" className="text-sm text-weak">{mode === "page" ? "Enter a page number from 1 to 604." : "Choose a valid Ayah range within this Surah."}</p>}
      <button type="button" className="btn-primary" disabled={!valid} onClick={start}>Start manual revision</button>
      <p className="text-xs text-muted">Manual revision does not remove or mark any scheduled task Done. Grade your recitation in the practice screen.</p>
    </div>
  </details>;
}
