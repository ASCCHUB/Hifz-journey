"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { count, pageContent, pageOf, Q, resolveLocation, sname } from "@/lib/quran";
import { archivePath as archivePathTombstone, createStudentJourney, nextPathLesson, makeClaim, makePath, makeRanges, rangeFromPageBounds, tombstoneClaim } from "@/lib/journey";
import { coverageSummary } from "@/lib/coverage";
import { setDailyPrefs } from "@/lib/prefs";
import { update, useStore, type JourneyPath, type JourneyPathKind, type JourneyRange, type MemoryClaim, type StudentJourney } from "@/lib/store";

const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
function RangePicker({ onAdd, addLabel = "Add portion" }: { onAdd: (range: JourneyRange) => void; addLabel?: string }) {
  const core = Q();
  const [unit, setUnit] = useState<"ayah" | "surah" | "juz" | "juz-partial" | "page">("ayah");
  const [s, setS] = useState(1); const [a, setA] = useState(1); const [endS, setEndS] = useState(1); const [endA, setEndA] = useState(7);
  const [id, setId] = useState(1); const [pageStart, setPageStart] = useState(1); const [pageEnd, setPageEnd] = useState(1); const [error, setError] = useState("");
  const [partJuz, setPartJuz] = useState(1);
  const add = () => {
    let range: JourneyRange | null = null;
    if (unit === "ayah") {
      const start = resolveLocation(core, { kind: "ayah", surah: s, ayah: a }); const end = resolveLocation(core, { kind: "ayah", surah: endS, ayah: endA });
      if (start && end && (start.s < end.s || start.s === end.s && start.a <= end.a)) range = { start: { s, a }, end: { s: endS, a: endA }, label: `${sname(s)} ${a}–${sname(endS)} ${endA}` };
    } else if (unit === "surah") {
      const loc = resolveLocation(core, { kind: "surah", id }); if (loc) range = { start: loc, end: { s: id, a: count(id) }, label: sname(id) };
    } else if (unit === "juz") {
      const loc = resolveLocation(core, { kind: "juz", id }); const bounds = core.juz[id - 1]; if (loc && bounds) range = { start: loc, end: { s: bounds[1][0], a: bounds[1][1] }, label: `Juz ${id}` };
    } else if (unit === "juz-partial") {
      const bounds = core.juz[partJuz - 1];
      const afterStart = s > bounds[0][0] || s === bounds[0][0] && a >= bounds[0][1];
      const beforeEnd = endS < bounds[1][0] || endS === bounds[1][0] && endA <= bounds[1][1];
      if (bounds && afterStart && beforeEnd && (s < endS || s === endS && a <= endA)) range = { start: { s, a }, end: { s: endS, a: endA }, label: `Part of Juz ${partJuz} · ${sname(s)} ${a}–${sname(endS)} ${endA}` };
    } else range = rangeFromPageBounds(core, pageStart, pageEnd);
    if (!range) { setError("Check the selected Quran range and its order."); return; }
    setError(""); onAdd(range);
  };
  return <div className="rounded-xl border border-line p-3">
    <label className="label" htmlFor="range-unit">Add a Quran portion</label>
    <select id="range-unit" className="field mt-1" value={unit} onChange={(e) => setUnit(e.target.value as typeof unit)}>
      <option value="ayah">Surah/Ayah range</option><option value="surah">Entire Surah</option><option value="juz">Entire Juz</option><option value="juz-partial">Part of a Juz</option><option value="page">Mushaf page range</option>
    </select>
    {unit === "ayah" && <div className="mt-2 grid grid-cols-2 gap-2"><label className="text-sm">Start Surah<input className="field mt-1" type="number" min="1" max="114" value={s} onChange={(e) => setS(Math.max(1, Math.min(114, +e.target.value || 1)))} /></label><label className="text-sm">Start Ayah<input className="field mt-1" type="number" min="1" max={core.n[s - 1]?.[2] || 1} value={a} onChange={(e) => setA(Math.max(1, Math.min(core.n[s - 1]?.[2] || 1, +e.target.value || 1)))} /></label><label className="text-sm">End Surah<input className="field mt-1" type="number" min="1" max="114" value={endS} onChange={(e) => setEndS(Math.max(1, Math.min(114, +e.target.value || 1)))} /></label><label className="text-sm">End Ayah<input className="field mt-1" type="number" min="1" max={core.n[endS - 1]?.[2] || 1} value={endA} onChange={(e) => setEndA(Math.max(1, Math.min(core.n[endS - 1]?.[2] || 1, +e.target.value || 1)))} /></label></div>}
    {unit === "surah" && <label className="mt-2 block text-sm">Surah<select className="field mt-1" value={id} onChange={(e) => setId(+e.target.value)}>{core.n.map((n, i) => <option key={i + 1} value={i + 1}>{i + 1}. {n[1]}</option>)}</select></label>}
    {unit === "juz" && <label className="mt-2 block text-sm">Juz<select className="field mt-1" value={id} onChange={(e) => setId(+e.target.value)}>{core.juz.map((_, i) => <option key={i + 1}>{i + 1}</option>)}</select></label>}
    {unit === "juz-partial" && <><label className="mt-2 block text-sm">Juz<select className="field mt-1" value={partJuz} onChange={(e) => { const next = +e.target.value; const bounds = core.juz[next - 1]; setPartJuz(next); setS(bounds[0][0]); setA(bounds[0][1]); setEndS(bounds[1][0]); setEndA(bounds[1][1]); }}>{core.juz.map((_, i) => <option key={i + 1}>{i + 1}</option>)}</select></label><div className="mt-2 grid grid-cols-2 gap-2"><label className="text-sm">Start Surah<input className="field mt-1" type="number" min="1" max="114" value={s} onChange={(e) => setS(Math.max(1, Math.min(114, +e.target.value || 1)))} /></label><label className="text-sm">Start Ayah<input className="field mt-1" type="number" min="1" max={core.n[s - 1]?.[2] || 1} value={a} onChange={(e) => setA(Math.max(1, Math.min(core.n[s - 1]?.[2] || 1, +e.target.value || 1)))} /></label><label className="text-sm">End Surah<input className="field mt-1" type="number" min="1" max="114" value={endS} onChange={(e) => setEndS(Math.max(1, Math.min(114, +e.target.value || 1)))} /></label><label className="text-sm">End Ayah<input className="field mt-1" type="number" min="1" max={core.n[endS - 1]?.[2] || 1} value={endA} onChange={(e) => setEndA(Math.max(1, Math.min(core.n[endS - 1]?.[2] || 1, +e.target.value || 1)))} /></label></div><p className="mt-2 text-xs text-muted">Choose a smaller Ayah range inside Juz {partJuz}; no unselected part is assumed memorized.</p></>}
    {unit === "page" && <div className="mt-2 grid grid-cols-2 gap-2"><label className="text-sm">First page<input className="field mt-1" type="number" min="1" max="604" value={pageStart} onFocus={(e) => e.currentTarget.select()} onChange={(e) => setPageStart(+e.target.value)} /></label><label className="text-sm">Last page<input className="field mt-1" type="number" min="1" max="604" value={pageEnd} onFocus={(e) => e.currentTarget.select()} onChange={(e) => setPageEnd(+e.target.value)} /></label><p className="col-span-2 text-xs text-muted">Page portions use the shared resolver and Ayah boundaries. A long Ayah crossing pages stays one memorization unit.</p></div>}
    <button type="button" className="btn btn-sm mt-3" onClick={add}>{addLabel}</button>{error && <p role="alert" className="mt-2 text-sm text-weak">{error}</p>}
  </div>;
}

/** Recited evidence and self-reported coverage, always counted separately. */
function CoverageStrip() {
  const st = useStore();
  const c = useMemo(() => coverageSummary(st), [st.mem, st.weak, st.studentJourney]); // eslint-disable-line react-hooks/exhaustive-deps
  const items: [string, number, string, string][] = [
    ["Long-term", c.retained, "bg-strong", "Recited cleanly on 5+ days, 30-day interval"],
    ["Learning", c.learning, "bg-learn", "Recited here, still building"],
    ["Weak", c.weak, "bg-weak", "Recent mistake or in the weak list"],
    ["Marked earlier", c.legacy_marked, "border border-dashed border-muted", "Marked memorized with the older button; not yet recited here"],
    ["Said known", c.claimed, "border border-dashed border-gold", "Your self-reported portions; not yet recited here"],
  ];
  return <div aria-label="Memorization coverage" className="rounded-xl border border-line p-3">
    <div className="label">What the app knows · in ayahs</div>
    <div className="mt-2 grid grid-cols-2 gap-2 text-sm sm:grid-cols-5">{items.map(([label, n, cls, hint]) => <div key={label} title={hint}><div className="flex items-center gap-1.5"><span className={`inline-block h-3 w-3 rounded-sm ${cls}`} aria-hidden />{label}</div><div className="text-lg font-bold tabular-nums">{n.toLocaleString()}</div></div>)}</div>
    <p className="mt-1 text-xs text-muted">Solid = recited in this app. Dashed = not yet recited here. Self-reported portions never count as recited.</p>
  </div>;
}

export default function PersonalizedJourney() {
  const st = useStore(); const [editing, setEditing] = useState(false); const [reviewing, setReviewing] = useState(false); const [draft, setDraft] = useState<StudentJourney | null>(null);
  const [pathKind, setPathKind] = useState<JourneyPathKind>("forward"); const [editPathId, setEditPathId] = useState<string | null>(null);
  const [pathName, setPathName] = useState("My Quran path"); const [selectedSurahs, setSelectedSurahs] = useState<number[]>([]); const [surahSearch, setSurahSearch] = useState(""); const [selectedJuz, setSelectedJuz] = useState<number[]>([]); const [pathRanges, setPathRanges] = useState<JourneyRange[]>([]);
  const [claimConfidence, setClaimConfidence] = useState<"comfortable" | "needs_revision" | "mostly_forgotten">("needs_revision"); const [claimRanges, setClaimRanges] = useState<JourneyRange[]>([]);
  const core = Q();
  useEffect(() => { if (!draft && st.studentJourney?.onboarding === "in_progress") { setDraft(st.studentJourney); setEditing(true); } }, [st.studentJourney, draft]);
  useEffect(() => {
    if (!editing || !draft) return;
    const timer = setTimeout(() => update((d) => { d.studentJourney = { ...draft, updatedAt: Date.now(), onboarding: "in_progress" }; }), 120);
    return () => clearTimeout(timer);
  }, [editing, draft]);
  const primary = st.studentJourney?.paths.find((p) => p.id === st.studentJourney?.primaryPathId && !p.deletedAt);
  const nextLesson = primary ? nextPathLesson(core, primary, pageOf) : null;
  const currentPoint = nextLesson?.start || st.journey.last || (st.lastLocation ? { s: st.lastLocation.s, a: st.lastLocation.a } : (() => { const [s, a] = pageContent(st.lastPage || 1).first; return { s, a }; })());
  const activeClaims = (st.studentJourney?.claims || []).filter((c) => !c.deletedAt);
  const updateDraft = (fn: (value: StudentJourney) => StudentJourney) => setDraft((old) => old ? { ...fn(old), updatedAt: Date.now() } : old);
  const beginEdit = () => {
    setReviewing(false);
    const value = st.studentJourney || createStudentJourney(st);
    const p = value.paths.find((x) => x.id === value.primaryPathId && !x.deletedAt);
    setDraft({ ...value, onboarding: "in_progress" }); setEditing(true);
    setEditPathId(p?.id || null); setPathKind(p?.kind || value.learner.direction); setPathName(p?.name || "My Quran path");
    setPathRanges(p?.ranges || []); setSelectedSurahs(p?.kind === "surahs" ? p.ranges.map((r) => r.start.s) : []);
    setSelectedJuz(p?.kind === "juz" ? p.ranges.map((r) => Number(r.label?.replace("Juz ", ""))).filter(Boolean) : []);
  };
  const setPathPrimary = (id: string) => update((d) => {
    const j = d.studentJourney; if (!j) return; const now = Date.now();
    j.paths = j.paths.map((p) => ({ ...p, isPrimary: p.id === id, updatedAt: p.id === id ? now : p.updatedAt })); j.primaryPathId = id; j.updatedAt = now;
  });
  const selectPathForEdit = (id: string) => {
    setEditPathId(id || null);
    const p = st.studentJourney?.paths.find((x) => x.id === id);
    if (!p) { setPathKind("forward"); setPathName("My Quran path"); setSelectedSurahs([]); setSelectedJuz([]); setPathRanges([]); return; }
    setPathKind(p.kind); setPathName(p.name); setPathRanges(p.ranges);
    setSelectedSurahs(p.kind === "surahs" ? p.ranges.map((r) => r.start.s) : []);
    setSelectedJuz(p.kind === "juz" ? p.ranges.map((r) => Number(r.label?.replace("Juz ", ""))).filter(Boolean) : []);
  };
  const persistPath = () => {
    if (!draft) return;
    const ranges = pathKind === "surahs" ? makeRanges(core, { kind: pathKind, name: pathName, selected: selectedSurahs }) : pathKind === "juz" ? makeRanges(core, { kind: pathKind, name: pathName, selected: selectedJuz }) : ["custom", "collection"].includes(pathKind) ? pathRanges : makeRanges(core, { kind: pathKind, name: pathName });
    const built = makePath(core, { kind: pathKind, name: pathName, ranges }, Date.now(), editPathId || undefined);
    if (!built) return;
    const old = draft.paths.find((p) => p.id === editPathId);
    const path = old ? { ...built, createdAt: old.createdAt, cursor: old.cursor, isPrimary: old.isPrimary } : built;
    updateDraft((j) => {
      const paths = old ? j.paths.map((p) => p.id === old.id ? path : p) : [...j.paths, path];
      const primaryId = j.primaryPathId && paths.some((p) => p.id === j.primaryPathId && !p.deletedAt) ? j.primaryPathId : path.id;
      return { ...j, paths: paths.map((p) => ({ ...p, isPrimary: p.id === primaryId })), primaryPathId: primaryId };
    });
    setEditPathId(path.id); setPathRanges(path.ranges); setPathName(path.name);
  };
  const commitSave = () => {
    if (!draft) return;
    let next = { ...draft, onboarding: "complete" as const, updatedAt: Date.now() };
    const currentRanges = pathKind === "surahs" ? makeRanges(core, { kind: pathKind, name: pathName, selected: selectedSurahs }) : pathKind === "juz" ? makeRanges(core, { kind: pathKind, name: pathName, selected: selectedJuz }) : ["custom", "collection"].includes(pathKind) ? pathRanges : makeRanges(core, { kind: pathKind, name: pathName });
    const currentPath = makePath(core, { kind: pathKind, name: pathName, ranges: currentRanges });
    if (currentPath) {
      const prior = next.paths.find((p) => p.id === editPathId);
      if (prior) next.paths = next.paths.map((p) => p.id === prior.id ? { ...currentPath, id: prior.id, createdAt: prior.createdAt, cursor: prior.cursor, isPrimary: prior.isPrimary } : p);
      else if (!next.primaryPathId) { next.paths = [...next.paths, { ...currentPath, isPrimary: true }]; next.primaryPathId = currentPath.id; }
    }
    next.paths = next.paths.map((p) => ({ ...p, isPrimary: p.id === next.primaryPathId }));
    update((d) => {
      d.studentJourney = next;
      const { updatedAt: _ignored, ...prefs } = next.preferences; // eslint-disable-line @typescript-eslint/no-unused-vars
      setDailyPrefs(d, prefs); // authoritative copy + legacy mirrors, in one place
    });
    setDraft(next); setEditing(false); setReviewing(false);
  };
  const skip = () => {
    const next = { ...(draft || createStudentJourney(st)), onboarding: "skipped" as const, updatedAt: Date.now() };
    update((d) => { d.studentJourney = next; }); setDraft(next); setEditing(false);
  };
  const addClaim = (range: JourneyRange) => setClaimRanges((old) => [...old, range]);
  const saveClaim = () => {
    if (!draft || !claimRanges.length) return;
    const claim = makeClaim(`${claimRanges.length} self-reported portion${claimRanges.length === 1 ? "" : "s"}`, claimConfidence, claimRanges);
    if (!claim) return;
    updateDraft((j) => ({ ...j, claims: [...j.claims, claim] })); setClaimRanges([]);
  };
  const removeClaim = (claim: MemoryClaim) => updateDraft((j) => tombstoneClaim(j, claim.id));
  const archivePath = (path: JourneyPath) => updateDraft((j) => archivePathTombstone(j, path.id));
  const filteredSurahs = useMemo(() => core.n.map((n, i) => ({ id: i + 1, name: n[1] })).filter((x) => `${x.id} ${x.name}`.toLowerCase().includes(surahSearch.toLowerCase())).slice(0, 20), [core.n, surahSearch]);
  const primaryLabel = primary?.name || "Use your current Hifz setup";

  return <section className="card flex flex-col gap-4 border-gold/40" aria-labelledby="journey-title">
      <div className="flex flex-wrap items-start justify-between gap-3"><div><div className="label">Personalized learning</div><h2 id="journey-title" className="text-xl font-bold">{st.studentJourney?.learner.displayName ? `${st.studentJourney.learner.displayName}’s path & profile` : "My path & profile"}</h2><p className="mt-1 text-sm text-muted">{primaryLabel} · your learning preferences and self-reported portions stay separate from recitation evidence.</p><p className="mt-1 text-sm text-muted">Current memorization page {pageOf(currentPoint.s, currentPoint.a)} · {sname(currentPoint.s)} {currentPoint.a}</p></div><button className="btn btn-sm" onClick={beginEdit}>{st.studentJourney?.onboarding === "in_progress" ? "Resume setup" : st.studentJourney ? "Edit journey" : "Set up journey"}</button></div>
    {editing && draft && <div className="flex flex-col gap-4 border-t border-line pt-4">
      <h3 className="font-bold">Your learning profile <span className="text-sm font-normal text-muted">· you can skip and return later</span></h3>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-sm">What should we call you?<input className="field mt-1" maxLength={50} value={draft.learner.displayName} onChange={(e) => updateDraft((j) => ({ ...j, learner: { ...j.learner, displayName: e.target.value } }))} placeholder="Name (optional)" /></label>
        <label className="text-sm">Learning experience<select className="field mt-1" value={draft.learner.experience} onChange={(e) => updateDraft((j) => ({ ...j, learner: { ...j.learner, experience: e.target.value as StudentJourney["learner"]["experience"] } }))}><option value="beginner">Beginner</option><option value="some">Some memorization</option><option value="returning">Returning learner</option><option value="maintaining">Maintaining Hifz</option></select></label>
      </div>
      <label className="text-sm">Preferred memorization direction<select className="field mt-1" value={draft.learner.direction} onChange={(e) => { const direction = e.target.value as StudentJourney["learner"]["direction"]; updateDraft((j) => ({ ...j, learner: { ...j.learner, direction } })); setPathKind(direction); setEditPathId(null); }}><option value="forward">Beginning to end</option><option value="reverse_juz">End to beginning (reverse Juz order)</option><option value="short_surahs">Short Surahs first within Juz Amma</option></select></label>

      <div className="rounded-2xl border border-line p-3"><div className="flex flex-wrap items-end gap-2"><label className="min-w-[200px] flex-1 text-sm">Learning path<select className="field mt-1" value={pathKind} onChange={(e) => { setPathKind(e.target.value as JourneyPathKind); setEditPathId(null); setPathRanges([]); }}><option value="forward">Quran from beginning to end</option><option value="reverse_juz">Reverse Juz order, Ayahs stay forward</option><option value="short_surahs">Short-Surah-first in Juz Amma</option><option value="surahs">Selected Surahs</option><option value="juz">Selected Juz</option><option value="custom">Custom portions</option><option value="collection">Named collection</option></select></label><label className="min-w-[190px] flex-1 text-sm">Path name<input className="field mt-1" maxLength={70} value={pathName} onChange={(e) => setPathName(e.target.value)} /></label><button className="btn btn-sm" type="button" onClick={() => selectPathForEdit("")}>New path</button></div>
        {draft.paths.filter((p) => !p.deletedAt).length > 0 && <label className="mt-3 block text-sm">Edit a saved path<select className="field mt-1" value={editPathId || ""} onChange={(e) => selectPathForEdit(e.target.value)}><option value="">New path</option>{draft.paths.filter((p) => !p.deletedAt).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>}
        {pathKind === "surahs" && <div className="mt-3"><label className="text-sm">Find a Surah<input className="field mt-1" value={surahSearch} onChange={(e) => setSurahSearch(e.target.value)} placeholder="Search all 114 Surahs" /></label><div className="mt-2 grid max-h-52 grid-cols-2 gap-1 overflow-auto sm:grid-cols-3">{filteredSurahs.map((s) => <label key={s.id} className="flex items-center gap-2 rounded-lg p-2 text-sm"><input type="checkbox" checked={selectedSurahs.includes(s.id)} onChange={(e) => setSelectedSurahs((old) => e.target.checked ? [...old, s.id] : old.filter((x) => x !== s.id))} />{s.id}. {s.name}</label>)}</div></div>}
        {pathKind === "juz" && <div className="mt-3 grid grid-cols-5 gap-1 sm:grid-cols-10">{core.juz.map((_, i) => <label key={i} className="flex items-center gap-1 rounded-lg border border-line p-2 text-sm"><input type="checkbox" checked={selectedJuz.includes(i + 1)} onChange={(e) => setSelectedJuz((old) => e.target.checked ? [...old, i + 1] : old.filter((x) => x !== i + 1))} />{i + 1}</label>)}</div>}
        {["custom", "collection"].includes(pathKind) && <div className="mt-3 flex flex-col gap-3"><RangePicker onAdd={(r) => setPathRanges((old) => [...old, r])} addLabel="Add to path" />{pathRanges.map((r, i) => <div key={`${r.label}-${i}`} className="flex items-center justify-between gap-2 rounded-lg bg-accent-soft/40 p-2 text-sm"><span>{r.label || `${r.start.s}:${r.start.a}–${r.end.s}:${r.end.a}`}</span><button className="text-weak" aria-label={`Remove ${r.label || "range"}`} onClick={() => setPathRanges((old) => old.filter((_, n) => n !== i))}>Remove</button></div>)}</div>}
        <div className="mt-3 flex flex-wrap gap-2"><button type="button" className="btn-primary" onClick={persistPath}>{editPathId ? "Save path changes" : "Add path"}</button>{draft.paths.filter((p) => !p.deletedAt).map((p) => <div key={p.id} className="flex gap-1"><button type="button" className={`btn btn-sm ${p.id === draft.primaryPathId ? "border-accent text-accent" : ""}`} onClick={() => updateDraft((j) => ({ ...j, primaryPathId: p.id, paths: j.paths.map((x) => ({ ...x, isPrimary: x.id === p.id })) }))}>{p.id === draft.primaryPathId ? "Primary: " : "Make primary: "}{p.name}</button><button type="button" className="btn btn-sm text-weak" onClick={() => archivePath(p)} aria-label={`Archive path ${p.name}`}>Archive</button></div>)}</div>
        <p className="mt-2 text-xs text-muted">Paths only order Quran portions. They never create, remove, or upgrade memorization records.</p>
      </div>

      <div className="rounded-2xl border border-gold/40 p-3"><h3 className="font-bold">What have you memorized before?</h3><p className="mb-3 text-xs text-muted">These are your own descriptions, not verified mastery. Adding or removing a claim never changes Hifz records, review intervals, or recitation history.</p><div className="mb-3 grid gap-2 sm:grid-cols-2"><label className="text-sm">How does it feel now?<select className="field mt-1" value={claimConfidence} onChange={(e) => setClaimConfidence(e.target.value as typeof claimConfidence)}><option value="comfortable">Strong before, currently comfortable</option><option value="needs_revision">Memorized before, needs revision</option><option value="mostly_forgotten">Mostly forgotten</option></select></label><p className="self-end text-xs text-muted">Claims are stored separately and labelled self-reported.</p></div><RangePicker onAdd={addClaim} />{claimRanges.map((r, i) => <div key={`${r.label}-${i}`} className="mt-2 flex items-center justify-between rounded-lg bg-accent-soft/40 p-2 text-sm"><span>{r.label}</span><button aria-label={`Remove claimed portion ${i + 1}`} className="text-weak" onClick={() => setClaimRanges((old) => old.filter((_, n) => n !== i))}>Remove</button></div>)}<button className="btn btn-sm mt-2" disabled={!claimRanges.length} onClick={saveClaim}>Save self-reported portions</button>{activeClaims.length > 0 && <div className="mt-3 space-y-2">{activeClaims.map((c) => <article key={c.id} className="rounded-xl border border-line p-3 text-sm"><div className="flex justify-between gap-2"><b>{c.label} · self-reported</b><button className="text-weak" onClick={() => removeClaim(c)}>Remove claim</button></div><p className="text-muted">{c.confidence === "comfortable" ? "Comfortable now" : c.confidence === "needs_revision" ? "Needs revision" : "Mostly forgotten"} · {c.ranges.map((r) => r.label || `${r.start.s}:${r.start.a}–${r.end.s}:${r.end.a}`).join("; ")}</p></article>)}</div>}</div>

      <div className="rounded-2xl border border-line p-3"><h3 className="font-bold">Daily preferences</h3><p className="mb-3 text-xs text-muted">Preferences only; this phase does not forecast completion or schedule due pages.</p><div className="grid gap-3 sm:grid-cols-2"><label className="text-sm">Study time (minutes)<input className="field mt-1" type="number" min="5" max="240" step="5" value={draft.preferences.studyMinutes} onChange={(e) => updateDraft((j) => ({ ...j, preferences: { ...j.preferences, studyMinutes: Math.max(5, Math.min(240, +e.target.value || 5)), updatedAt: Date.now() } }))} /></label><label className="text-sm">New memorization amount<div className="mt-1 flex gap-2"><input className="field" type="number" min="1" max="100" value={draft.preferences.newAmount} onChange={(e) => updateDraft((j) => ({ ...j, preferences: { ...j.preferences, newAmount: Math.max(1, +e.target.value || 1), updatedAt: Date.now() } }))} /><select className="field" value={draft.preferences.newUnit} onChange={(e) => updateDraft((j) => ({ ...j, preferences: { ...j.preferences, newUnit: e.target.value as typeof j.preferences.newUnit, updatedAt: Date.now() } }))}><option value="ayahs">Ayahs</option><option value="half_pages">Half-pages</option><option value="pages">Pages</option></select></div></label><label className="text-sm">Revision workload<div className="mt-1 flex gap-2"><input className="field" type="number" min="1" max="240" value={draft.preferences.revisionAmount} onChange={(e) => updateDraft((j) => ({ ...j, preferences: { ...j.preferences, revisionAmount: Math.max(1, +e.target.value || 1), updatedAt: Date.now() } }))} /><select className="field" value={draft.preferences.revisionUnit} onChange={(e) => updateDraft((j) => ({ ...j, preferences: { ...j.preferences, revisionUnit: e.target.value as typeof j.preferences.revisionUnit, updatedAt: Date.now() } }))}><option value="ayahs">Ayahs</option><option value="pages">Pages</option><option value="minutes">Minutes</option></select></div></label><label className="flex items-center gap-2 self-end text-sm"><input type="checkbox" checked={draft.preferences.prioritizeRevision} onChange={(e) => updateDraft((j) => ({ ...j, preferences: { ...j.preferences, prioritizeRevision: e.target.checked, updatedAt: Date.now() } }))} />Prioritize revision</label></div><div className="mt-3"><div className="text-sm font-semibold">Preferred learning days</div><div className="mt-2 flex flex-wrap gap-2">{dayNames.map((label, day) => <label key={day} className="flex items-center gap-1 rounded-full border border-line px-3 py-2 text-sm"><input type="checkbox" checked={draft.preferences.learningDays.includes(day)} onChange={(e) => updateDraft((j) => ({ ...j, preferences: { ...j.preferences, learningDays: e.target.checked ? [...new Set([...j.preferences.learningDays, day])] : j.preferences.learningDays.filter((x) => x !== day), updatedAt: Date.now() } }))} />{label}</label>)}</div></div></div>

      <div className="flex flex-wrap gap-2"><button className="btn-primary" onClick={() => setReviewing(true)}>Review changes</button><button className="btn" onClick={skip}>Skip for now</button></div>
      {reviewing && <section className="rounded-xl border border-accent/40 bg-accent-soft/20 p-3" aria-label="Review journey settings"><h3 className="font-bold">Review before saving</h3><p className="mt-1 text-sm">Learning path: {draft.paths.find((p) => p.id === draft.primaryPathId)?.name || "No primary path selected"}.</p><p className="text-sm">Daily plan: {draft.preferences.studyMinutes} minutes · {draft.preferences.prioritizeRevision ? "revision prioritized" : "balanced learning"}.</p><p className="text-sm">Self-reported portions: {draft.claims.filter((c) => !c.deletedAt).length}. Existing recitation evidence and lesson history are preserved.</p>{!draft.paths.some((p) => !p.deletedAt) && <p role="alert" className="mt-2 text-sm text-revise">No learning path yet: choose one above and press “Add path”, or save without a path and add one later.</p>}<div className="mt-3 flex flex-wrap gap-2"><button className="btn-primary" onClick={commitSave}>Confirm and save</button><button className="btn" onClick={() => setReviewing(false)}>Continue editing</button></div></section>}
    </div>}

    {!editing && <div className="flex flex-wrap gap-2 text-sm"><Link className="underline" href={`/mushaf?p=${st.lastPage}`}>Open the Mushaf</Link></div>}
    {!editing && <CoverageStrip />}
    {!editing && activeClaims.length > 0 && <div><div className="label">Previously memorized · self-reported</div><div className="mt-2 flex flex-wrap gap-2">{activeClaims.map((c) => <span key={c.id} className="pill">{c.ranges.map((r) => r.label || `${r.start.s}:${r.start.a}–${r.end.s}:${r.end.a}`).join("; ")} · {c.confidence.replaceAll("_", " ")}</span>)}</div></div>}
    {!editing && st.studentJourney?.paths.filter((p) => !p.deletedAt).map((p) => <div key={p.id} className="flex items-center justify-between gap-2 rounded-xl border border-line p-2 text-sm"><span>{p.name}{p.id === primary?.id ? " · primary" : ""} · {p.ranges.length} portion{p.ranges.length === 1 ? "" : "s"}</span>{p.id !== primary?.id && <button className="btn btn-sm" onClick={() => setPathPrimary(p.id)}>Make primary</button>}</div>)}
  </section>;
}




