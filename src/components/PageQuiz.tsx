"use client";
// Optional understanding & order practice for one page: "what comes next?", meaning → Ayah, and Ayah order.
// Uses only bundled Quran text and the bundled reviewed translation. Practice only: nothing is saved as
// recitation evidence (recognising an Ayah is not reciting it).
import { useEffect, useMemo, useState } from "react";
import { pageAyahs, type Ayah } from "@/lib/chunking";
import { loadSet, SETS, words } from "@/lib/quran";
import { useStore } from "@/lib/store";

const start = (x: Ayah, n = 5) => words(x[0], x[1]).slice(0, n).join(" ") + (words(x[0], x[1]).length > n ? " …" : "");
const pickOthers = (all: Ayah[], not: Ayah, n: number, seed: number) => all.filter((x) => x !== not).map((x, i) => [x, (i * 7919 + seed * 104729) % 1009] as const).sort((a, b) => a[1] - b[1]).slice(0, n).map(([x]) => x);
const shuffle = <T,>(xs: T[], seed: number) => xs.map((x, i) => [x, (i * 2654435761 + seed * 40503) % 4294967296] as const).sort((a, b) => a[1] - b[1]).map(([x]) => x);

function Choice({ prompt, options, answer, render, onNext }: { prompt: React.ReactNode; options: Ayah[]; answer: Ayah; render: (x: Ayah) => React.ReactNode; onNext: () => void }) {
  const [picked, setPicked] = useState<Ayah | null>(null);
  return <div className="flex flex-col gap-2">
    {prompt}
    {options.map((x) => { const right = x === answer, chosen = picked === x; return <button key={`${x[0]}:${x[1]}`} disabled={!!picked} onClick={() => setPicked(x)} className={`rounded-xl border p-2 text-right ${picked ? (right ? "border-strong bg-strong/10" : chosen ? "border-weak bg-weak/10" : "border-line opacity-60") : "border-line"}`}>{render(x)}</button>; })}
    {picked && <div className="flex items-center justify-between gap-2"><span className={`text-sm ${picked === answer ? "text-strong" : "text-weak"}`}>{picked === answer ? "Correct." : "Not quite — the highlighted Ayah is right."}</span><button className="btn btn-sm" onClick={() => { setPicked(null); onNext(); }}>Next question</button></div>}
  </div>;
}

export default function PageQuiz({ page }: { page: number }) {
  const st = useStore();
  const ayahs = useMemo(() => pageAyahs(page), [page]);
  const [kind, setKind] = useState<"next" | "meaning" | "order">("next");
  const [q, setQ] = useState(0);
  const [tr, setTr] = useState<string[][] | null>(null);
  const [order, setOrder] = useState<Ayah[]>([]);
  useEffect(() => { if (kind === "meaning" && !tr) loadSet(st.settings.tr).then(setTr).catch(() => setTr([])); }, [kind, tr, st.settings.tr]);
  if (ayahs.length < 2) return <p className="card text-sm text-muted">This page has one Ayah, so these exercises are not available.</p>;
  const i = q % (ayahs.length - 1), cur = ayahs[i], next = ayahs[i + 1];
  const orderSet = ayahs.slice(0, Math.min(5, ayahs.length));
  const lang = SETS[st.settings.tr].lang;
  return <section className="card flex flex-col gap-3" aria-label="Understanding and order practice">
    <div className="flex flex-wrap gap-2">{([["next", "What comes next?"], ["meaning", "Meaning → Ayah"], ["order", "Put in order"]] as const).map(([k, l]) => <button key={k} className={`btn btn-sm ${kind === k ? "btn-on" : ""}`} onClick={() => { setKind(k); setQ(0); setOrder([]); }}>{l}</button>)}</div>
    {kind === "next" && <Choice key={`n${q}`} answer={next} options={shuffle([next, ...pickOthers(ayahs, next, 2, q).filter((x) => x !== cur)].slice(0, 3), q)} render={(x) => <span className="q text-xl" dir="rtl">{start(x)}</span>}
      prompt={<div><p className="text-sm">Which Ayah comes right after this one?</p><p className="q mt-1 rounded-xl bg-accent-soft/40 p-2 text-xl" dir="rtl">{words(cur[0], cur[1]).join(" ")}</p></div>} onNext={() => setQ(q + 1)} />}
    {kind === "meaning" && (!tr ? <p className="text-sm text-muted">Loading the translation…</p> : tr.length === 0 ? <p className="text-sm text-muted">The translation is not available offline.</p> :
      <Choice key={`m${q}`} answer={cur} options={shuffle([cur, ...pickOthers(ayahs, cur, 2, q + 3)], q + 1)} render={(x) => <span className="q text-xl" dir="rtl">{start(x)}</span>}
        prompt={<div><p className="text-sm">Which Ayah has this meaning? <span className="text-muted">({SETS[st.settings.tr].label})</span></p><p className={`mt-1 rounded-xl bg-accent-soft/40 p-2 ${lang === "ur" ? "ur text-[17px]" : "text-sm"}`} dir={lang === "ur" ? "rtl" : "ltr"}>{tr[cur[0] - 1]?.[cur[1] - 1]}</p></div>} onNext={() => setQ(q + 1)} />)}
    {kind === "order" && <div className="flex flex-col gap-2">
      <p className="text-sm">Tap the first {orderSet.length} Ayahs of the page in their Mushaf order.</p>
      {shuffle(orderSet, q + 7).map((x) => { const at = order.indexOf(x); return <button key={`${x[0]}:${x[1]}`} disabled={at >= 0} onClick={() => setOrder((o) => (orderSet[o.length] === x ? [...o, x] : o))} className={`rounded-xl border p-2 text-right ${at >= 0 ? "border-strong/50 opacity-60" : "border-line"}`}><span className="q text-xl" dir="rtl">{start(x)}</span>{at >= 0 && <span className="ms-2 font-ui text-xs text-strong">#{at + 1}</span>}</button>; })}
      {order.length === orderSet.length && <div className="flex items-center justify-between"><span className="text-sm text-strong">All in order.</span><button className="btn btn-sm" onClick={() => { setOrder([]); setQ(q + 1); }}>Again</button></div>}
    </div>}
    <p className="text-xs text-muted">Practice only — recognising an Ayah is not the same as reciting it, so these answers are not saved to your Hifz record. Word-by-word meanings are not shown: no reviewed word glossary is bundled.</p>
  </section>;
}
