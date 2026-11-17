"use client";
import ReferencePdfMaps from "@/components/ReferencePdfMaps";
import { useEffect, useMemo, useRef, useState } from "react";
import Practice from "@/components/Practice";
import { useAudio } from "@/components/Audio";
import { Bar } from "@/components/Shell";
import { MIND_MAPS, mapAyahs, type MindMapGroup, type MindMapLesson } from "@/lib/mindMaps";
import { loadManifest, loadMap, type MapManifestEntry } from "@/lib/mapCatalog";
import Link from "next/link";
import type { Mark, PracticeKind } from "@/lib/hifz";
import { loadSet, pageOf, sarabic, sname, text, words } from "@/lib/quran";
import { update, useStore, type MindMapRec, type MindMapStatus } from "@/lib/store";

type Mode = "map" | "learn" | "visual" | "order" | "match";
type PracticeSession = { items: [number, number][]; title: string; kind: PracticeKind };
const INTERVALS = [1, 3, 7, 14, 30, 60];
const STATUS_LABEL: Record<MindMapStatus, string> = { new: "New", learning: "Learning", revision: "Needs revision", remembered: "Remembered", strong: "Strong" };
const STATUS_STYLE: Record<MindMapStatus, string> = {
  new: "border-line text-muted", learning: "border-learn text-learn", revision: "border-revise text-revise",
  remembered: "border-accent text-accent", strong: "border-strong text-strong",
};
const mix = <T,>(items: T[]) => { const a = [...items]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };

function initialRec(): MindMapRec { return { status: "learning", due: Date.now() + 10 * 60_000, last: Date.now(), reps: 0, intervalDays: 0, quizAttempts: 0, quizCorrect: 0 }; }
function schedule(rec: MindMapRec | undefined, rating: "again" | "difficult" | "good" | "easy"): MindMapRec {
  const r = rec ? { ...rec } : initialRec();
  const now = Date.now();
  if (rating === "again") { r.status = "revision"; r.intervalDays = 0; r.due = now + 10 * 60_000; r.assessmentDays = []; r.assessmentSuccesses = 0; }
  else if (rating === "difficult") { r.status = "revision"; r.intervalDays = Math.max(1, Math.floor(r.intervalDays * 0.6)); r.due = now + Math.max(1, r.intervalDays) * 86_400_000; r.assessmentDays = []; r.assessmentSuccesses = 0; }
  else {
    r.reps += 1;
    const next = rating === "easy" ? Math.max(3, Math.ceil((r.intervalDays || 1) * 2.2)) : INTERVALS[Math.min(INTERVALS.length - 1, r.reps - 1)];
    r.intervalDays = Math.min(60, next);
    r.status = r.reps >= 3 ? "remembered" : "learning";
    r.due = now + r.intervalDays * 86_400_000;
  }
  r.last = now;
  return r;
}

function statusFor(map: MindMapLesson, progress?: MindMapRec): MindMapStatus {
  if (!progress) return "new";
  if (progress.status === "strong" || progress.due > Date.now()) return progress.status;
  return "revision";
}

function MindMapCanvas({ map, selected, onSelect, concealed, zoom, onZoom, hostRef }: {
  map: MindMapLesson; selected: number; onSelect: (ayah: number) => void; concealed: boolean;
  zoom: number; onZoom: (v: number) => void; hostRef: React.RefObject<HTMLDivElement>;
}) {
  const w = 1600, h = 1000, hub = { x: 800, y: 480 };
  useEffect(() => {
    requestAnimationFrame(() => {
      const width = hostRef.current?.clientWidth || 1600;
      onZoom(Math.max(.5, Math.min(.82, (width - 20) / w)));
    });
  }, [map.id]);
  const layouts: Record<MindMapGroup["quadrant"], { trunk: number; rowX: number; rowW: number; start: number; step: number; titleY: number; side: "left" | "right" }> = {
    ne: { trunk: 1060, rowX: 1090, rowW: 465, start: 155, step: 70, titleY: 56, side: "right" },
    nw: { trunk: 540, rowX: 50, rowW: 455, start: 175, step: 70, titleY: 56, side: "left" },
    se: { trunk: 1060, rowX: 1090, rowW: 465, start: 610, step: 70, titleY: 560, side: "right" },
    sw: { trunk: 540, rowX: 50, rowW: 455, start: 610, step: 70, titleY: 560, side: "left" },
  };
  const groups = map.groups.map((group) => {
    const layout = layouts[group.quadrant];
    const items = group.ayahs.flatMap((ayah) => {
      const all = words(map.surah, ayah);
      const size = map.surah === 1 && ayah === 7 ? 5 : 12;
      const chunks: string[][] = [];
      for (let i = 0; i < all.length; i += size) chunks.push(all.slice(i, i + size));
      return chunks.map((part) => ({ ayah, words: part }));
    });
    const budget = group.quadrant === "ne" || group.quadrant === "nw" ? 300 : 340;
    const step = items.length > 1 ? Math.min(layout.step, budget / (items.length - 1)) : layout.step;
    const rowHeight = Math.min(62, step - 6);
    const rows = items.map((item, i) => ({ ...item, y: layout.start + i * step }));
    const middle = rows.length ? (rows[0].y + rows[rows.length - 1].y) / 2 : layout.start;
    return { group, layout: { ...layout, step, rowHeight }, rows, middle };
  });
  const motifPath: Record<MindMapGroup["motif"], string> = {
    spark: "M20 2l3.6 12.4L36 18l-12.4 3.6L20 34l-3.6-12.4L4 18l12.4-3.6z",
    scale: "M20 4v24m-10 6h20M8 11h24M12 11l-6 12h12zm16 0l-6 12h12z",
    compass: "M20 3a17 17 0 1 0 0 34 17 17 0 0 0 0-34zm7 10-5 12-12 5 5-12z",
    book: "M4 8c7-2 12 0 16 3v23c-4-3-9-5-16-3zm32 0c-7-2-12 0-16 3v23c4-3 9-5 16-3z",
    rain: "M12 24a8 8 0 0 1 1-16 10 10 0 0 1 19 3 7 7 0 0 1-1 13zm1 4-2 5m11-5-2 5m11-5-2 5",
    flame: "M21 4c2 9-8 10-4 18 1-4 4-5 6-8 6 8 5 17-3 19-8 1-13-5-10-13 2-6 8-9 11-16z",
    garden: "M20 35V17m0 8C8 25 5 16 5 9c9 0 15 4 15 12m0 0c0-9 6-14 15-14 0 8-3 17-15 17M9 35h22",
    link: "M15 25l-4 4a7 7 0 0 1-10-10l8-8a7 7 0 0 1 10 0m6 6 4-4a7 7 0 1 1 10 10l-8 8a7 7 0 0 1-10 0m-10-1 18-18",
    sky: "M5 30h30M9 30a11 11 0 0 1 22 0M20 4l2 5 5 1-5 2-2 5-2-5-5-2 5-1zM32 10l1 3 3 1-3 1-1 3-1-3-3-1 3-1z",
  };
  return <div className="mindmap-stage">
    <div className="mindmap-toolbar flex flex-wrap items-center justify-between gap-2 px-3 py-2 border-b border-line">
      <span className="text-xs text-muted">Landscape mind map · exact Quran text follows the coloured branches</span>
      <div className="flex gap-1"><button className="btn btn-sm" aria-label="Zoom out" onClick={() => onZoom(Math.max(.5, +(zoom - .1).toFixed(2)))}>−</button><span className="px-2 self-center text-sm tabular-nums">{Math.round(zoom * 100)}%</span><button className="btn btn-sm" aria-label="Zoom in" onClick={() => onZoom(Math.min(1.5, +(zoom + .1).toFixed(2)))}>+</button><button className="btn btn-sm" onClick={() => onZoom(Math.max(.5, Math.min(.82, ((hostRef.current?.clientWidth || 1600) - 20) / 1600)))}>Fit</button><button className="btn btn-sm" onClick={() => hostRef.current?.requestFullscreen?.()}>⛶</button><button className="btn btn-sm" onClick={() => window.print()}>Print / PDF</button></div>
    </div>
    <div className="mindmap-viewport" ref={hostRef}>
      <div className="mindmap-canvas" style={{ width: w * zoom, height: h * zoom }}>
        <svg aria-hidden="true" className="absolute inset-0 overflow-visible" width={w * zoom} height={h * zoom} viewBox={`0 0 ${w} ${h}`}>
          {groups.map(({ group, layout, rows, middle }) => {
            const fromX = layout.side === "left" ? hub.x - 155 : hub.x + 155;
            const edge = layout.side === "left" ? layout.rowX + layout.rowW : layout.rowX;
            const trunkTop = rows[0]?.y || middle, trunkBottom = rows[rows.length - 1]?.y || middle;
            const active = group.ayahs.includes(selected);
            return <g key={group.title} fill="none" stroke={group.color} strokeLinecap="round" strokeLinejoin="round" opacity={active ? 1 : .72}>
              <path d={`M${fromX} ${hub.y} C${layout.side === "left" ? fromX - 90 : fromX + 90} ${hub.y},${layout.trunk} ${middle},${layout.trunk} ${middle}`} strokeWidth={active ? 16 : 13} />
              <path d={`M${layout.trunk} ${trunkTop} L${layout.trunk} ${trunkBottom}`} strokeWidth={active ? 10 : 7} />
              {rows.map((row, i) => <path key={`${row.ayah}-${i}`} d={`M${layout.trunk} ${row.y} L${edge} ${row.y}`} strokeWidth={row.ayah === selected ? 9 : 5} />)}
            </g>;
          })}
          <circle cx={hub.x} cy={hub.y} r="158" fill="none" stroke="#d6ae45" strokeOpacity=".18" strokeWidth="2" strokeDasharray="3 11" />
        </svg>
        <div className="mindmap-hub" style={{ left: hub.x * zoom, top: (hub.y - 62) * zoom }}>
          <span className="q text-[32px] leading-tight text-white">{sarabic(map.surah)}</span>
          <div className="font-bold leading-tight text-white">{map.title}</div>
          <div className="text-xs text-white/85">{map.subtitle}</div>
        </div>
        {groups.map(({ group, layout, rows, middle }) => <div key={group.title}>
          <div className="mindmap-group-title" aria-current={group.ayahs.includes(selected) ? "location" : undefined} style={{ left: (layout.side === "right" ? 1088 : 600) * zoom, top: layout.titleY * zoom, color: group.color, width: (layout.side === "right" ? 460 : 430) * zoom, opacity: group.ayahs.includes(selected) ? 1 : .72, fontWeight: group.ayahs.includes(selected) ? 800 : undefined }}>
            <span className="mindmap-motif" style={{ color: group.color, borderColor: `${group.color}66` }} aria-hidden="true"><svg viewBox="0 0 40 40"><path d={motifPath[group.motif]} /></svg></span>
            <span>{group.title}</span>
          </div>
          <div className="mindmap-range" style={{ left: (layout.trunk - (layout.side === "right" ? 49 : 47)) * zoom, top: (middle - 23) * zoom, background: group.color }}>{group.ayahs[0] === group.ayahs[group.ayahs.length - 1] ? group.ayahs[0] : `${group.ayahs[0]}–${group.ayahs[group.ayahs.length - 1]}`}</div>
          {rows.map((row, i) => <button key={`${group.title}-${row.ayah}-${i}`} className={`mindmap-quran-line ${selected === row.ayah ? "is-selected" : ""}`} dir="rtl" style={{ left: layout.rowX * zoom, top: (row.y - layout.rowHeight / 2) * zoom, width: layout.rowW * zoom, height: layout.rowHeight * zoom, borderColor: group.color, ["--branch-color" as string]: group.color } as React.CSSProperties} onClick={() => onSelect(row.ayah)} aria-label={`Reveal ayah ${row.ayah}`}>
            <span className="mindmap-ayah-number" style={{ background: group.color }}>{row.ayah}</span>
            {concealed ? <span className="mindmap-hidden-line">Tap to recall · Ayah {row.ayah}</span> : <span className="q mindmap-verse-words">{row.words.map((word, wi) => <span key={wi} className={wi === 0 ? "mindmap-highlight" : undefined}>{word} </span>)}</span>}
          </button>)}
        </div>)}
      </div>
    </div>
  </div>;
}

export default function VisualMindMapsPage() {
  const st = useStore();
  const audio = useAudio();
  const [mapId, setMapId] = useState<string | null>(null);
  const [returnTo, setReturnTo] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode>("map");
  const [selected, setSelected] = useState(1);
  const [reveal, setReveal] = useState(true);
  const [zoom, setZoom] = useState(.82);
  const [english, setEnglish] = useState<string[][]>([]);
  const [urdu, setUrdu] = useState<string[][]>([]);
  const [tafsir, setTafsir] = useState<string[][]>([]);
  const [session, setSession] = useState<PracticeSession | null>(null);
  const [order, setOrder] = useState<number[]>([]);
  const [orderChecked, setOrderChecked] = useState<boolean | null>(null);
  const [matchAyah, setMatchAyah] = useState<number | null>(null);
  const [matchChoices, setMatchChoices] = useState<number[]>([]);
  const [matchResult, setMatchResult] = useState<boolean | null>(null);
  const [stage, setStage] = useState(1);
  const [phraseIndex, setPhraseIndex] = useState(0);
  const hostRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let live = true;
    Promise.all([loadSet("tr-en-sahih"), loadSet("tr-ur-jalandhry")]).then(([en, ur]) => { if (live) { setEnglish(en); setUrdu(ur); } }).catch(() => {});
    return () => { live = false; };
  }, []);
  useEffect(() => { let live = true; loadSet("tafsir-ar-muyassar").then((data) => { if (live) setTafsir(data); }).catch(() => {}); return () => { live = false; }; }, []);

  // Catalog: bundled maps plus any further maps listed in the versioned manifest (loaded on demand).
  const [catalog, setCatalog] = useState<MindMapLesson[]>(MIND_MAPS);
  const [extraEntries, setExtraEntries] = useState<MapManifestEntry[]>([]);
  useEffect(() => { loadManifest().then((m) => setExtraEntries(m.maps.filter((e) => !MIND_MAPS.some((b) => b.id === e.id)))).catch(() => {}); }, []);
  const openEntry = (id: string) => loadMap(id).then((doc) => { if (!doc) return; setCatalog((c) => c.some((x) => x.id === doc.id) ? c : [...c, doc]); chooseMap(doc); });
  const map = useMemo(() => catalog.find((m) => m.id === mapId) || null, [mapId, catalog]);
  const ayahs = map ? mapAyahs(map) : [];
  const selectedNode = map?.nodes.find((node) => node.ayah === selected) || map?.nodes[0];
  const selectedTranslationEn = map ? english[map.surah - 1]?.[selected - 1] || "" : "";
  const selectedTranslationUr = map ? urdu[map.surah - 1]?.[selected - 1] || "" : "";
  const progress = map ? st.mapProgress[map.id] : undefined;
  const status = statusFor(map || MIND_MAPS[0], progress);
  const memCount = map ? ayahs.filter(([s, a]) => !!st.mem[`${s}:${a}`]).length : 0;
  const isDue = !!progress && progress.due <= Date.now();
  const recallMode = mode === "visual";

  const chooseMap = (lesson: MindMapLesson) => {
    const saved = st.mapProgress[lesson.id];
    setMapId(lesson.id); setSelected(saved?.selectedAyah || lesson.from); setMode("map"); setStage(saved?.stage || 1); setReveal(true); setPhraseIndex(0);
    setOrder(mix(lesson.nodes.map((node) => node.ayah))); setOrderChecked(null);
    setMatchAyah(lesson.nodes[Math.floor(Math.random() * lesson.nodes.length)].ayah); setMatchChoices(mix(lesson.nodes.map((node) => node.ayah))); setMatchResult(null);
  };
  useEffect(() => {
    const q = new URLSearchParams(window.location.search); const id = q.get("map"); const ayah = Number(q.get("ayah"));
    const requestedReturn = q.get("returnTo");
    if (requestedReturn?.startsWith("/learn?") && !requestedReturn.startsWith("//") && !requestedReturn.includes("\\")) setReturnTo(requestedReturn);
    if (id) loadMap(id).then((doc) => { if (!doc) return; setCatalog((c) => c.some((x) => x.id === doc.id) ? c : [...c, doc]); chooseMap(doc); if (Number.isInteger(ayah) && ayah >= doc.from && ayah <= doc.to) setSelected(ayah); });
  }, []);
  const setStageMode = (next: number) => {
    setStage(next);
    if (map) update((d) => { const r = d.mapProgress[map.id] || initialRec(); r.stage = next; d.mapProgress[map.id] = r; });
    setMode(next === 1 ? "map" : next === 2 || next === 3 ? "learn" : next === 4 ? "visual" : next === 6 ? "order" : "visual");
    if (next === 4) setReveal(false);
    if (next === 5) setReveal(false);
    if (next === 6 && map) { setOrder(mix(map.nodes.map((n) => n.ayah))); setOrderChecked(null); }
    if (next === 7 && map) { setMatchAyah(map.nodes[Math.floor(Math.random() * map.nodes.length)].ayah); setMatchChoices(mix(map.nodes.map((node) => node.ayah))); setMatchResult(null); }
  };
  const rateMap = (rating: "again" | "difficult" | "good" | "easy") => update((d) => { if (!map) return; d.mapProgress[map.id] = schedule(d.mapProgress[map.id], rating); });
  const moveOrder = (i: number, dir: -1 | 1) => { setOrderChecked(null); setOrder((old) => { const n = [...old], j = i + dir; if (j < 0 || j >= n.length) return n; [n[i], n[j]] = [n[j], n[i]]; return n; }); };
  const submitMatch = (ayah: number) => {
    if (!map || matchAyah === null) return;
    const correct = ayah === matchAyah;
    setMatchResult(correct);
    update((d) => { const r = d.mapProgress[map.id] || initialRec(); r.quizAttempts += 1; if (correct) r.quizCorrect += 1; d.mapProgress[map.id] = r; });
  };

  if (session && map) return <Practice items={session.items} title={session.title} kind={session.kind} onClose={() => setSession(null)} onComplete={(results: Record<number, Mark>) => {
    if (session.kind !== "assessment") return;
    update((d) => {
      const r = d.mapProgress[map.id] || initialRec(); const clean = session.items.every((_, i) => results[i] === "ok"); const day = Math.floor((Date.now() - new Date().getTimezoneOffset() * 60000) / 86400000);
      r.assessmentDays ||= [];
      const newCleanDay = clean && !r.assessmentDays.includes(day);
      if (newCleanDay) r.assessmentDays.push(day);
      if (!clean) r.assessmentDays = [];
      r.assessmentSuccesses = r.assessmentDays.length;
      r.completedStages = [...new Set([...(r.completedStages || []), ...(clean ? [stage] : [])])];
      if (newCleanDay) r.intervalDays = [1, 3, 7, 14, 30, 60][Math.min(5, r.assessmentSuccesses - 1)];
      if (r.assessmentSuccesses >= 5 && r.intervalDays >= 30) r.status = "strong";
      else if (clean) r.status = r.assessmentSuccesses >= 3 ? "remembered" : "learning";
      else { r.status = "revision"; r.due = Date.now() + 10 * 60_000; }
      if (clean && newCleanDay) r.due = Date.now() + r.intervalDays * 86_400_000;
      r.stage = stage; d.mapProgress[map.id] = r;
    });
  }} />;

  if (!map) return <div className="flex flex-col gap-4"><ReferencePdfMaps /></div>;

  const phraseChunks = text(map.surah, selected).split(" ").reduce<string[]>((chunks, word, i) => { if (i % 4 === 0) chunks.push(word); else chunks[chunks.length - 1] += ` ${word}`; return chunks; }, []);
  const correctOrder = map.nodes.map((n) => n.ayah);
  const stageLabel = ["", "Study the map", "Learn each ayah", "Phrase by phrase", "Recall from a visual cue", "Recite without the map", "Rebuild the sequence", "Final memorization test"];
  const stageHelp = ["", "Take in the central theme, the coloured branches and their order.", "Open each branch to read the exact ayah and its Urdu and English translation.", "Read a short phrase, repeat it, then join the phrases. Audio is provided for the complete ayah.", "Hide the ayah and retrieve it from its branch cue before revealing.", "The map is hidden. Recite the complete range, then self-assess each ayah.", "Put the ayahs back into their Quran order using the up and down controls.", "Recite the entire passage independently, then record your self-assessment."];

  return <div className="mindmap-print flex flex-col gap-4">
    <header className="flex items-start gap-3">
      {returnTo ? <Link className="btn btn-sm" href={returnTo}>Back to lesson (step saved)</Link> : <button className="btn btn-sm" onClick={() => setMapId(null)}>All maps</button>}
      <div className="min-w-0 flex-1"><h1 className="text-2xl font-bold">{map.title}</h1><p className="text-sm text-muted">{map.subtitle} · {map.nodes.length} ayahs in order</p></div>
      <span className={`pill border bg-transparent ${STATUS_STYLE[status]}`}>{STATUS_LABEL[status]}</span>
    </header>

    <section className="card mindmap-controls flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2"><div><div className="label">7-step Hifz journey</div><div className="font-bold">Step {stage} · {stageLabel[stage]}</div></div><span className="pill">{memCount}/{ayahs.length} ayahs in Hifz tracker</span></div>
      <p className="text-sm text-muted">{stageHelp[stage]}</p>
      <div className="grid grid-cols-4 gap-1.5 sm:grid-cols-7">{stageLabel.slice(1).map((label, i) => <button key={i} className={`rounded-xl border px-2 py-2 text-[11px] font-semibold sm:text-xs ${stage === i + 1 ? "border-accent bg-accent-soft text-accent" : "border-line text-muted"}`} onClick={() => setStageMode(i + 1)} aria-current={stage === i + 1 ? "step" : undefined}>{i + 1}. {label.split(" ").slice(0, 2).join(" ")}</button>)}</div>
      <button className="self-start text-sm font-semibold text-accent underline" onClick={() => { setMode("match"); setMatchAyah(map.nodes[Math.floor(Math.random() * map.nodes.length)].ayah); setMatchChoices(mix(map.nodes.map((node) => node.ayah))); setMatchResult(null); }}>Try a meaning-match quiz</button>
    </section>

    {(stage === 5 || stage === 7) ? <section className="card flex flex-col items-center gap-4 py-10 text-center">
      <div className="grid h-28 w-28 place-items-center rounded-full border-2 border-dashed border-gold bg-accent-soft text-5xl text-gold">✧</div>
      <div><h2 className="text-xl font-bold">The map is hidden</h2><p className="mt-1 max-w-md text-sm text-muted">Recite {map.title} from memory. When ready, reveal the range and assess each ayah honestly.</p></div>
      {stage === 5 && <button className="btn-primary" onClick={() => setSession({ items: ayahs, title: `Independent recall · ${map.title}`, kind: "assessment" })}>Start independent recall</button>}
      {stage === 7 && <button className="btn-primary" onClick={() => setSession({ items: ayahs, title: `Final memorization test · ${map.title}`, kind: "assessment" })}>Start final memorization test</button>}
      <button className="btn btn-sm" onClick={() => setStageMode(1)}>Show map again</button>
    </section> : <>
      <MindMapCanvas map={map} selected={selected} onSelect={(a) => { setSelected(a); setPhraseIndex(0); setReveal(mode !== "visual"); update((d) => { const r = d.mapProgress[map.id] || initialRec(); r.selectedAyah = a; d.mapProgress[map.id] = r; }); }} concealed={recallMode} zoom={zoom} onZoom={setZoom} hostRef={hostRef} />

      {(mode === "map" || mode === "learn" || mode === "visual") && selectedNode && <section className="card mindmap-controls flex flex-col gap-4" key={`${map.id}-${selected}`}>
        <div className="flex flex-wrap items-center justify-between gap-2"><div><div className="label">{map.title} · ayah {selectedNode.ayah}</div><div className="text-lg font-bold">{selectedNode.cue}</div></div><div className="flex gap-2"><button className="btn btn-sm" onClick={() => audio.play(map.surah, selectedNode.ayah)}>Listen</button><button className="btn btn-sm" onClick={() => { const learned = !!st.mem[`${map.surah}:${selectedNode.ayah}`]; setSession({ items: [[map.surah, selectedNode.ayah]], title: `${map.title} · Ayah ${selectedNode.ayah}`, kind: learned ? "custom" : "new" }); }}>Recite</button></div></div>
        {mode === "visual" && !reveal ? <div className="rounded-2xl border border-dashed border-gold p-5 text-center"><div className="text-sm text-muted">Visual cue</div><div className="text-2xl" style={{ color: selectedNode.color }}>{selectedNode.symbol}</div><p className="font-semibold">{selectedNode.cue}</p><button className="btn-primary mt-3" onClick={() => setReveal(true)}>Reveal ayah</button></div> : <>
          <div className="rounded-2xl bg-accent-soft/60 px-4 py-5"><div className="label mb-2">Exact Quran text · {map.surah}:{selectedNode.ayah}</div><p className="q text-[27px] sm:text-[34px]">{text(map.surah, selectedNode.ayah)}</p></div>
          <div className="flex flex-wrap gap-3 text-sm"><Link className="underline" href={`/mushaf?s=${map.surah}&a=${selected}`}>Open {sname(map.surah)} {selected} in the Mushaf</Link><Link className="underline" href={`/learn?page=${pageOf(map.surah, selected)}`}>Learn this page</Link></div><div className="grid gap-3 sm:grid-cols-2"><div className="rounded-2xl border border-line p-3"><div className="label mb-1">English translation | Saheeh International</div><p className="text-sm leading-relaxed">{selectedTranslationEn}</p></div><div className="rounded-2xl border border-line p-3"><div className="label mb-1">اردو ترجمہ | فتح محمد جالندھری</div><p dir="rtl" className="ur text-[16px]">{selectedTranslationUr}</p></div></div>
          {tafsir[map.surah - 1]?.[selected - 1] && <div className="rounded-2xl border border-gold/40 p-3"><div className="label mb-1">Tafsir · Al-Tafsir Al-Muyassar, King Fahd Complex</div><p dir="rtl" className="q text-lg leading-loose">{tafsir[map.surah - 1][selected - 1]}</p><p className="mt-2 text-xs text-muted">Tafsir is shown separately from Quran text, translations, and memory associations.</p></div>}
          {(mode === "learn" || stage === 3) && <div className="rounded-2xl border border-gold/50 p-3"><div className="label mb-2">Phrase practice · phrase {Math.min(phraseIndex + 1, phraseChunks.length)} of {phraseChunks.length}</div><div className="q rounded-xl border border-line bg-surface px-3 py-3 text-2xl text-right" dir="rtl">{phraseChunks.slice(0, phraseIndex + 1).join(" ")}</div><div className="mt-3 flex flex-wrap gap-2"><button className="btn" disabled={phraseIndex === 0} onClick={() => setPhraseIndex(Math.max(0, phraseIndex - 1))}>Previous phrase</button><button className="btn-primary" disabled={phraseIndex >= phraseChunks.length - 1} onClick={() => setPhraseIndex(Math.min(phraseChunks.length - 1, phraseIndex + 1))}>Reveal next phrase</button><button className="btn" onClick={() => { setPhraseIndex(phraseChunks.length - 1); update((d) => { const r = d.mapProgress[map.id] || initialRec(); r.completedStages = [...new Set([...(r.completedStages || []), 3])]; d.mapProgress[map.id] = r; }); }}>Join full ayah</button></div><p className="mt-2 text-xs text-muted">Phrase chunks are taken exactly from the displayed Quran ayah; audio is available for the complete ayah.</p></div>}
          <div className="flex flex-wrap justify-between gap-2"><span className="text-xs text-muted">The illustration is a recall association, not an explanation of Tafsir.</span><button className="btn btn-sm" onClick={() => setReveal(false)}>Hide Arabic for recall</button></div>
        </>}
      </section>}

      {mode === "order" && <section className="card mindmap-controls flex flex-col gap-3"><div><h2 className="font-bold">Rebuild the Ayah sequence</h2><p className="text-sm text-muted">Arrange the branch labels in Quran order. Ayah numbers are shown so you can focus on remembering the map’s flow.</p></div><div className="flex flex-col gap-2">{order.map((ayah, i) => { const node = map.nodes.find((n) => n.ayah === ayah)!; return <div key={ayah} className="flex items-center gap-2 rounded-2xl border border-line p-2"><span className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-lg" style={{ color: node.color, background: `${node.color}18` }}>{node.symbol}</span><span className="min-w-0 flex-1"><b>Ayah {node.ayah}</b><span className="block truncate text-xs text-muted">{node.cue}</span></span><button className="btn btn-sm" aria-label={`Move ayah ${ayah} up`} disabled={i === 0 || orderChecked === true} onClick={() => moveOrder(i, -1)}>↑</button><button className="btn btn-sm" aria-label={`Move ayah ${ayah} down`} disabled={i === order.length - 1 || orderChecked === true} onClick={() => moveOrder(i, 1)}>↓</button></div>; })}</div>{orderChecked === true && <p className="rounded-xl bg-accent-soft p-3 font-semibold text-accent">Correct sequence. The branches follow the Quran’s ayah order.</p>}{orderChecked === false && <p className="rounded-xl bg-revise/10 p-3 font-semibold text-revise">Not quite. Revisit the map’s ayah numbers and try again.</p>}<button className="btn-primary" onClick={() => { const correct = order.every((ayah, i) => ayah === correctOrder[i]); setOrderChecked(correct); if (correct) update((d) => { const r = d.mapProgress[map.id] || initialRec(); r.completedStages = [...new Set([...(r.completedStages || []), 6])]; d.mapProgress[map.id] = r; }); }}>Check sequence</button>{orderChecked !== null && <button className="btn" onClick={() => { setOrder(mix(correctOrder)); setOrderChecked(null); }}>Shuffle and try again</button>}</section>}

      {mode === "match" && matchAyah !== null && <section className="card mindmap-controls flex flex-col gap-3"><div><h2 className="font-bold">Match the visual cue to its ayah</h2><p className="text-sm text-muted">Choose which ayah carries this memory cue.</p></div><div className="flex items-center gap-3 rounded-2xl border border-line p-4"><span className="text-3xl" style={{ color: map.nodes.find((n) => n.ayah === matchAyah)?.color }}>{map.nodes.find((n) => n.ayah === matchAyah)?.symbol}</span><b>{map.nodes.find((n) => n.ayah === matchAyah)?.cue}</b></div><div className="grid grid-cols-3 gap-2 sm:grid-cols-5">{matchChoices.map((ayah) => <button key={ayah} className="btn" disabled={matchResult !== null} onClick={() => submitMatch(ayah)}>Ayah {ayah}</button>)}</div>{matchResult !== null && <div className={`rounded-xl p-3 text-sm font-semibold ${matchResult ? "bg-strong/10 text-strong" : "bg-revise/10 text-revise"}`}>{matchResult ? "Correct match." : `The cue belongs to ayah ${matchAyah}. Read its branch, then try another.`}</div>}<button className="btn" onClick={() => { setMatchAyah(map.nodes[Math.floor(Math.random() * map.nodes.length)].ayah); setMatchChoices(mix(map.nodes.map((node) => node.ayah))); setMatchResult(null); }}>Next match</button></section>}
    </>}

    <section className="card mindmap-controls flex flex-col gap-3">
      <div><div className="label">Map review · adaptive schedule</div><p className="text-sm text-muted">Rate how well you recalled the map. A miss comes back in 10 minutes; confident recall grows through 1, 3, 7, 14, 30 and 60 day intervals. A single success never marks it Strong.</p></div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">{([["again", "Again"], ["difficult", "Difficult"], ["good", "Good"], ["easy", "Easy"]] as const).map(([rating, label]) => <button key={rating} className="btn" onClick={() => rateMap(rating)}>{label}</button>)}</div>
      {progress && <p className="text-xs text-muted">{isDue ? "Due now" : `Review due ${new Date(progress.due).toLocaleString()}`} · {progress.reps} successful map review{progress.reps === 1 ? "" : "s"} · status {STATUS_LABEL[status]}</p>}
    </section>
    <section className="mindmap-print-details hidden">
      <h2>{map.title} · Complete ayah and translation reference</h2>
      <p>{map.subtitle} · Quran text from the bundled Hafs dataset. Memory cues are associations, not Tafsir.</p>
      {map.nodes.map((node) => <article key={node.ayah}>
        <h3>Ayah {node.ayah} · {node.cue}</h3>
        <p className="q">{text(map.surah, node.ayah)}</p>
        <p><b>English · Saheeh International:</b> {english[map.surah - 1]?.[node.ayah - 1] || ""}</p>
        <p dir="rtl" className="ur"><b>اردو | فتح محمد جالندھری:</b> {urdu[map.surah - 1]?.[node.ayah - 1] || ""}</p>
      </article>)}
    </section>
    </div>;
}

