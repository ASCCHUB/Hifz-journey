"use client";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { pageOf, Q, sname } from "@/lib/quran";
import { Sheet } from "./Shell";

type Tab = "Surah" | "Ayah" | "Juz" | "Hizb" | "Quarter" | "Page";
const tabs: Tab[] = ["Surah", "Ayah", "Juz", "Hizb", "Quarter", "Page"];
export default function LocationNavigator({ initial, onClose, onOpen }: { initial: [number, number]; onClose: () => void; onOpen: (s: number, a: number) => void }) {
  const router = useRouter(); const core = Q();
  const [tab, setTab] = useState<Tab>("Surah"); const [query, setQuery] = useState("");
  const [s, setS] = useState(initial[0]); const [a, setA] = useState(initial[1]);
  const [endS, setEndS] = useState(initial[0]); const [endA, setEndA] = useState(initial[1]);
  const list = useMemo(() => {
    if (tab === "Surah") return core.n.map((n, i) => ({ id: i + 1, label: `${i + 1}. ${n[1]}` })).filter((x) => x.label.toLowerCase().includes(query.toLowerCase()));
    if (tab === "Ayah") return [];
    const max = tab === "Juz" ? 30 : tab === "Hizb" ? 60 : tab === "Quarter" ? 240 : 604;
    const prefix = tab === "Page" ? "Page" : tab;
    return Array.from({ length: max }, (_, i) => ({ id: i + 1, label: `${prefix} ${i + 1}` })).filter((x) => x.label.toLowerCase().includes(query.toLowerCase()));
  }, [core, query, tab]);
  const target = (s0: number, a0: number) => { if (s0 < 1 || s0 > 114 || a0 < 1 || a0 > core.n[s0 - 1][2]) return; onOpen(s0, a0); onClose(); };
  const position = (ss: number, aa: number) => core.n.slice(0, ss - 1).reduce((total, n) => total + n[2], 0) + aa;
  const rangeLength = endS >= 1 && endS <= 114 && s >= 1 && s <= 114 ? position(endS, endA) - position(s, a) + 1 : 0;
  const goRange = (path: "recite" | "memorize", mode = "learn") => {
    if (endS < s || (endS === s && endA < a) || a < 1 || a > core.n[s - 1]?.[2] || endA < 1 || endA > core.n[endS - 1]?.[2]) return;
    const params = new URLSearchParams({ s: String(s), a: String(a), endS: String(endS), endA: String(endA) });
    if (path === "memorize") params.set("mode", mode);
    onClose(); router.push(`/${path}?${params.toString()}`);
  };
  return <Sheet title="Go to Quran location" onClose={onClose}>
    <div className="flex gap-1 overflow-x-auto pb-1" role="tablist" aria-label="Quran location type">
      {tabs.map((x) => <button key={x} role="tab" aria-selected={tab === x} className={`btn btn-sm shrink-0 ${tab === x ? "btn-on" : ""}`} onClick={() => { setTab(x); setQuery(""); }}>{x}</button>)}
    </div>
    {tab !== "Ayah" && <input className="field" type="search" aria-label={`Search ${tab}`} placeholder={`Search ${tab.toLowerCase()}…`} value={query} onChange={(e) => setQuery(e.target.value)} />}
    {tab === "Ayah" ? <div className="grid grid-cols-2 gap-2">
      <label className="text-sm text-muted">Surah<select className="field mt-1" value={s} onChange={(e) => { const n = +e.target.value; setS(n); setA(Math.min(a, core.n[n - 1][2])); }}>{core.n.map((n, i) => <option key={i} value={i + 1}>{i + 1}. {n[1]}</option>)}</select></label>
      <label className="text-sm text-muted">Ayah<input className="field mt-1" type="number" min={1} max={core.n[s - 1][2]} value={a} onChange={(e) => setA(+e.target.value)} /></label>
      <button className="btn-primary col-span-2" onClick={() => target(s, a)}>Open {sname(s)} {a} · page {pageOf(s, a)}</button>
    </div> : <div className="grid max-h-52 grid-cols-2 gap-2 overflow-y-auto sm:grid-cols-3">
      {list.slice(0, 120).map((x) => <button key={x.id} className="btn btn-sm" onClick={() => {
        if (tab === "Surah") target(x.id, 1);
        else if (tab === "Juz") { const [ss, aa] = core.juz[x.id - 1][0]; target(ss, aa); }
        else if (tab === "Hizb") { const [ss, aa] = core.hizbs[x.id - 1]; target(ss, aa); }
        else if (tab === "Quarter") { const [ss, aa] = core.quarters[x.id - 1]; target(ss, aa); }
        else { const [ss, aa] = core.lay[x.id - 1]; target(ss, aa); }
      }}>{x.label}</button>)}
      {!list.length && <p className="col-span-2 text-sm text-muted">No matching locations.</p>}
    </div>}
    <details className="border-t border-line pt-3">
      <summary className="cursor-pointer font-semibold">Choose a practice range</summary>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <label className="text-sm text-muted">Start Surah<select className="field mt-1" value={s} onChange={(e) => setS(+e.target.value)}>{core.n.map((n, i) => <option key={i} value={i + 1}>{i + 1}. {n[1]}</option>)}</select></label>
        <label className="text-sm text-muted">Start Ayah<input className="field mt-1" type="number" min={1} max={core.n[s - 1][2]} value={a} onChange={(e) => setA(+e.target.value)} /></label>
        <label className="text-sm text-muted">End Surah<select className="field mt-1" value={endS} onChange={(e) => setEndS(+e.target.value)}>{core.n.map((n, i) => <option key={i} value={i + 1}>{i + 1}. {n[1]}</option>)}</select></label>
        <label className="text-sm text-muted">End Ayah<input className="field mt-1" type="number" min={1} max={core.n[endS - 1][2]} value={endA} onChange={(e) => setEndA(+e.target.value)} /></label>
        <button className="btn col-span-2" disabled={!rangeLength || rangeLength > 100} onClick={() => goRange("recite")}>Open selected range in Recite {rangeLength > 0 ? `· ${rangeLength} ayahs` : ""}</button>
        <button className="btn-primary" onClick={() => goRange("memorize", "learn")}>Memorize range</button>
        <button className="btn" onClick={() => goRange("memorize", "revise")}>Revise range</button>
      </div>
      {rangeLength > 100 && <p className="text-xs text-muted">Recite supports up to 100 ayahs per session. Shorten the range or use Memorize for longer passages.</p>}
      <p className="mt-2 text-xs text-muted">Routes only prepare the selected passage. Microphone listening starts only after you press Start Recitation.</p>
    </details>
  </Sheet>;
}
