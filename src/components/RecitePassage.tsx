"use client";
// Recite: self-check practice, or live recitation checked against the Quran text by speech recognition.
// Live recitation is a recognition aid, not a Tajweed assessment; see components/LiveRecitation.tsx.
import Link from "next/link";
import { useEffect, useState } from "react";
import LiveRecitation from "@/components/LiveRecitation";
import Practice from "@/components/Practice";
import { count, nextAyah, Q, ref, sname } from "@/lib/quran";
import { useStore } from "@/lib/store";
import { installAndroidSpeech } from "@/lib/androidSpeech";

installAndroidSpeech();

export default function RecitePage() {
  const st = useStore();
  const [s, setS] = useState(1);
  const [from, setFrom] = useState(1);
  const [to, setTo] = useState(7);
  const [run, setRun] = useState<{ mode: "self" | "mic" | "auto"; items: [number, number][]; title: string } | null>(null);
  const startAuto = () => {
    const items: [number, number][] = [];
    Q().n.forEach((n, i) => { for (let a = 1; a <= n[2]; a++) items.push([i + 1, a]); });
    setRun({ mode: "auto", items, title: "Recite from anywhere" });
  };
  const [msg, setMsg] = useState("");
  const [selectedRange, setSelectedRange] = useState<{ items: [number, number][]; title: string } | null>(null);
  // Return destination (from a Mushaf lesson or recall): only same-app Mushaf links are accepted.
  const [returnTo, setReturnTo] = useState<string | null>(null);
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const r = q.get("returnTo") || q.get("return");
    if (r && (r.startsWith("/mushaf?") || r.startsWith("/recite?")) && !r.startsWith("//")) setReturnTo(r);
    if (q.get("auto") === "1") startAuto();
  }, []);
  const back = returnTo ? <Link className="btn btn-sm self-start" href={returnTo}>← Back to the Mushaf</Link> : null;
  useEffect(() => {
    const q = new URLSearchParams(window.location.search), ss = Number(q.get("s")), aa = Number(q.get("a")), es = Number(q.get("endS") || ss), ea = Number(q.get("endA") || aa);
    if (!Number.isInteger(ss) || !Number.isInteger(aa) || !Number.isInteger(es) || !Number.isInteger(ea) || ss < 1 || ss > 114 || es < 1 || es > 114 || aa < 1 || aa > count(ss) || ea < 1 || ea > count(es)) return;
    const items: [number, number][] = []; let here: [number, number] | null = [ss, aa];
    while (here && items.length <= 100) { items.push(here); if (here[0] === es && here[1] === ea) break; here = nextAyah(here[0], here[1]); }
    const last = items[items.length - 1];
    if (items.length <= 100 && last?.[0] === es && last?.[1] === ea) setSelectedRange({ items, title: `${ref(ss, aa)} – ${ref(es, ea)}` });
  }, []);

  const begin = (mode: "self" | "mic") => {
    const n = count(s);
    if (!(from >= 1 && to >= from && to <= n)) { setMsg(`${sname(s)} has ${n} ayat. Enter a range between 1 and ${n}.`); return; }
    if (to - from > 99) { setMsg("Choose 100 ayat or fewer at a time."); return; }
    setMsg("");
    const items: [number, number][] = [];
    for (let a = from; a <= to; a++) items.push([s, a]);
    setRun({ mode, items, title: `${sname(s)} ${from}-${to}` });
  };

  if (run) return <div className="flex flex-col gap-2">{back}{run.mode !== "self"
    ? <LiveRecitation key={`${run.title}-${run.mode}`} items={run.items} title={run.title} auto={run.mode === "auto"} onClose={() => setRun(null)} />
    : <Practice items={run.items} title={run.title} kind="custom" onClose={() => setRun(null)} />}</div>;

  const recent = st.hist.filter((h) => h.k !== "Mushaf page").slice(0, 8);
  return <div className="flex flex-col gap-4">
    {back}
    {returnTo && <p className="text-sm text-muted">The microphone check is advisory: it does not change your lesson ratings. Go back to the lesson and rate yourself.</p>}
    <header><h1 className="text-2xl font-bold">Recite</h1><p className="text-sm text-muted">Choose a passage to recite from memory, then review your own words beside the fixed Quran text.</p></header>
    <section className="card flex flex-col gap-2 border-accent/40">
      <button className="btn-primary min-h-[56px] text-lg" onClick={startAuto}>🎙 Recite from anywhere</button>
      <p className="text-sm text-muted">Start reciting any surah or ayah from memory. Your place is found automatically from your recitation, then followed word by word with mistake detection.</p>
    </section>
    <h2 className="label">Or choose a passage</h2>
    <section className="card flex flex-col gap-3">
      {selectedRange && <div className="rounded-xl border border-accent/30 bg-accent/5 p-3"><b>Selected range: {selectedRange.title}</b><div className="mt-2 flex flex-wrap gap-2"><button className="btn-primary" onClick={() => setRun({ mode: "self", items: selectedRange.items, title: selectedRange.title })}>Recite and check myself</button><button className="btn" onClick={() => setRun({ mode: "mic", items: selectedRange.items, title: selectedRange.title })}>Open live recitation</button></div><p className="mt-2 text-xs text-muted">The microphone remains off until you press Start in the next screen.</p></div>}
      <label className="label" htmlFor="rs">Surah</label>
      <select id="rs" className="field" value={s} onChange={(e) => { const v = +e.target.value; setS(v); setFrom(1); setTo(Math.min(count(v), 10)); }}>
        {Q().n.map((n, i) => <option key={i} value={i + 1}>{i + 1}. {n[1]} ({n[2]} ayat)</option>)}
      </select>
      <div className="grid grid-cols-2 gap-2">
        <label className="text-sm text-muted">From ayah<input type="number" min={1} max={count(s)} className="field mt-1" value={from} onChange={(e) => setFrom(+e.target.value)} /></label>
        <label className="text-sm text-muted">To ayah<input type="number" min={1} max={count(s)} className="field mt-1" value={to} onChange={(e) => setTo(+e.target.value)} /></label>
      </div>
      {msg && <p className="text-sm text-weak">{msg}</p>}
      <button className="btn-primary" onClick={() => begin("self")}>Recite and check myself</button>
      <button className="btn" onClick={() => begin("mic")}>Live recitation with mistake detection</button>
      <p className="text-sm text-muted">Live recitation uses the Quran speech model when its server is running (otherwise your browser’s generic Arabic recognition). Flagged words are suspicions for you to confirm, not a Tajweed assessment. Self-check works without a microphone.</p>
    </section>
    <h2 className="label">Recent recitations</h2>
    {recent.length ? <section className="card flex flex-col divide-y divide-line !py-1">
      {recent.map((h, i) => <div key={i} className="flex items-center justify-between gap-3 py-3">
        <div><div className="font-semibold">{h.l}</div><div className="text-sm text-muted">{h.k} · {new Date(h.t).toLocaleDateString(undefined, { day: "numeric", month: "short" })} · {h.n} ayat</div></div>
        <span className="pill" style={h.m ? { background: "transparent", border: "1px solid var(--weak)", color: "var(--weak)" } : undefined}>{h.m ? `${h.m} possible omissions` : "Session"}</span>
      </div>)}
    </section> : <div className="card text-sm text-muted">Your recitation sessions will be listed here.</div>}
  </div>;
}
