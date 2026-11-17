"use client";
// My 604 Mushaf pages (UX Stage 3). Read-only view over the existing records: opening a page or its sheet never
// writes progress. Every action opens the canonical Mushaf route; revision runs the existing Practice flow there.
import Link from "next/link";
import React, { useEffect, useMemo, useState } from "react";
import { Sheet } from "@/components/Shell";
import { nextPathLesson } from "@/lib/journey";
import { loadManifest, reviewedMapsForAyah, type MapManifestEntry } from "@/lib/mapCatalog";
import { learnHref, lessonHref } from "@/lib/mushafLesson";
import { evidenceLine, PAGE_STATUS_COLOR, PAGE_STATUS_LABEL, PAGE_STATUS_ORDER, pageTracker, statusCounts, type PageInfo, type PageStatus } from "@/lib/pageTracker";
import { pageOf, Q, ref, sname } from "@/lib/quran";
import { useStore } from "@/lib/store";

// Each status differs by shape as well as colour: outline (claimed, learning), hatching (partial), solid fills (the rest).
const tileStyle = (s: PageStatus): React.CSSProperties | undefined => s === "none" ? undefined
  : s === "partial" ? { background: `repeating-linear-gradient(135deg, color-mix(in srgb, var(--learn) 55%, transparent) 0 6px, transparent 6px 12px)`, borderColor: "var(--learn)" }
  : s === "claimed" ? { borderColor: PAGE_STATUS_COLOR.claimed, borderStyle: "dashed", borderWidth: 2, color: "var(--gold)" }
  : s === "learning" ? { borderColor: PAGE_STATUS_COLOR.learning, borderWidth: 3, color: "var(--accent)" }
  : { background: PAGE_STATUS_COLOR[s], color: "#fff", borderColor: "transparent" };

export default function PageTracker({ initialPage }: { initialPage?: number | null }) {
  const st = useStore();
  const pages = useMemo(() => pageTracker(st, pageOf), [st]);
  const counts = useMemo(() => statusCounts(pages), [pages]);
  const unfinished = Object.values(st.lessons || {}).filter((l) => !l.completedAt).sort((a, b) => b.updatedAt - a.updatedAt)[0];
  const path = st.studentJourney?.paths.find((p) => p.id === st.studentJourney?.primaryPathId && !p.deletedAt);
  const next = path ? nextPathLesson(Q(), path, pageOf) : null;
  // Memorization location (where learning continues) is kept separate from the reading location (st.lastPage).
  const learningPage = unfinished ? (unfinished.unit.kind === "page" && unfinished.unit.page ? unfinished.unit.page : pageOf(unfinished.unit.start.s, unfinished.unit.start.a)) : next?.page ?? null;
  const [juz, setJuz] = useState<number | 0>(() => learningPage ? pages[learningPage - 1].juz : 1);
  const [filter, setFilter] = useState<PageStatus | "all">("all");
  const [open, setOpen] = useState<number | null>(initialPage ?? null);
  const [jump, setJump] = useState("");
  useEffect(() => { if (initialPage) { setOpen(initialPage); setJuz(pages[initialPage - 1].juz); } }, [initialPage]); // eslint-disable-line react-hooks/exhaustive-deps

  const shown = pages.filter((p) => (juz === 0 || p.juz === juz) && (filter === "all" || p.status === filter));
  const continueHref = unfinished ? lessonHref(unfinished, pageOf) : next && path ? learnHref({ start: next.start, end: next.end, pathId: path.id }, pageOf) : null;
  const go = () => { const n = Number(jump); if (Number.isInteger(n) && n >= 1 && n <= 604) { setOpen(n); setJuz(pages[n - 1].juz); } };

  return <section className="card flex flex-col gap-3" aria-labelledby="pages-title" id="pages">
    <div className="flex flex-wrap items-start justify-between gap-2">
      <div><h2 id="pages-title" className="text-lg font-bold">My 604 Mushaf pages</h2>
        <p className="text-sm text-muted">Every page of the Madani Mushaf, coloured by what your own recitations show.</p></div>
    </div>
    <div className="grid gap-2 sm:grid-cols-2">
      <div className="rounded-xl border border-line p-3 text-sm">
        <div className="label">Learning</div>
        {learningPage ? <><b>Page {learningPage}</b>{unfinished ? <span className="text-muted"> · {unfinished.title} (step {unfinished.step + 1})</span> : next ? <span className="text-muted"> · next on “{path!.name}”</span> : null}</> : <span className="text-muted">No lesson in progress.</span>}
        {path && <div className="text-xs text-muted">Path: {path.name}</div>}
        {continueHref && <Link className="btn-primary mt-2 w-full" href={continueHref}>Continue learning</Link>}
      </div>
      <div className="rounded-xl border border-line p-3 text-sm">
        <div className="label">Last read (separate)</div>
        <b>Page {st.lastPage || 1}</b><span className="text-muted"> · saved reading location</span>
        <Link className="btn mt-2 w-full" href={`/mushaf?p=${st.lastPage || 1}`}>Continue reading</Link>
      </div>
    </div>

    <div className="flex flex-wrap items-center gap-2">
      <select className="field !w-auto" aria-label="Juz" value={juz} onChange={(e) => setJuz(+e.target.value)}>
        <option value={0}>All 30 Juz</option>{Q().juz.map((_, i) => <option key={i} value={i + 1}>Juz {i + 1}</option>)}
      </select>
      <form className="flex gap-1" onSubmit={(e) => { e.preventDefault(); go(); }}>
        <input className="field !w-24" type="number" min={1} max={604} inputMode="numeric" placeholder="Page" aria-label="Go to page" value={jump} onChange={(e) => setJump(e.target.value)} />
        <button className="btn btn-sm" type="submit">Open</button>
      </form>
    </div>
    <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filter by status">
      <button className={`pill ${filter === "all" ? "btn-on" : ""}`} aria-pressed={filter === "all"} onClick={() => setFilter("all")}>All</button>
      {PAGE_STATUS_ORDER.map((s) => <button key={s} aria-pressed={filter === s} className={`pill inline-flex items-center gap-1.5 ${filter === s ? "btn-on" : ""}`} onClick={() => setFilter(filter === s ? "all" : s)}>
        <i className="inline-block h-3 w-3 rounded-full border border-line" style={tileStyle(s)} />{PAGE_STATUS_LABEL[s]} {counts[s]}</button>)}
    </div>

    {shown.length ? <div className="grid gap-1.5" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(42px, 1fr))" }}>
      {shown.map((p) => <button key={p.page} data-page={p.page} onClick={() => setOpen(p.page)}
        aria-label={`Page ${p.page}, Juz ${p.juz}: ${PAGE_STATUS_LABEL[p.status]}`} title={`Page ${p.page}: ${PAGE_STATUS_LABEL[p.status]}`}
        aria-current={p.page === learningPage ? "page" : undefined}
        className={`aspect-square rounded-lg border border-line text-xs font-bold tabular-nums ${p.page === learningPage ? "ring-2 ring-accent ring-offset-1" : ""}`} style={tileStyle(p.status)}>{p.page}</button>)}
    </div> : <p className="text-sm text-muted">No pages {juz ? `in Juz ${juz} ` : ""}with this status.</p>}
    <p className="text-xs text-muted">A page is Strong only when every Ayah on it is retained long-term; a sampled check or half a page makes it “Partly checked”. Self-reported pages stay “Said memorized” until you recite them. Opening a page never changes your progress.</p>

    {open && <PageSheet p={pages[open - 1]} onClose={() => setOpen(null)} />}
  </section>;
}

function PageSheet({ p, onClose }: { p: PageInfo; onClose: () => void }) {
  const [maps, setMaps] = useState<MapManifestEntry[]>([]);
  useEffect(() => {
    let live = true; setMaps([]);
    loadManifest().then((m) => { const hit = new Map<string, MapManifestEntry>(); p.ayahs.forEach(([s, a]) => reviewedMapsForAyah(m.maps, s, a).forEach((e) => hit.set(e.id, e))); if (live) setMaps([...hit.values()]); }).catch(() => {});
    return () => { live = false; };
  }, [p.page]); // eslint-disable-line react-hooks/exhaustive-deps
  const learn = p.lesson ? lessonHref(p.lesson, pageOf) : learnHref({ page: p.page }, pageOf);
  const reviseHref = (items: [number, number][], kind: "rev" | "weak") => `/mushaf?p=${p.page}&mode=revise&kind=${kind}&ayahs=${items.map(([s, a]) => `${s}:${a}`).join(",")}`;
  return <Sheet title={`Page ${p.page}`} onClose={onClose}>
    <div className="flex items-center gap-2"><span className="inline-block h-4 w-4 rounded-full border border-line" style={tileStyle(p.status)} /><b>{PAGE_STATUS_LABEL[p.status]}</b></div>
    <p className="text-sm text-muted">Page {p.page} · Juz {p.juz} · {p.surahs.map(sname).join(", ")} · {ref(p.first[0], p.first[1])} – {ref(p.last[0], p.last[1])} · {p.ayahs.length} Ayah{p.ayahs.length === 1 ? "" : "s"}</p>
    <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-sm">
      <dt className="text-muted">Recited &amp; rated by you</dt><dd><b>{p.assessed}</b> of {p.ayahs.length}{p.retained ? ` (${p.retained} long-term)` : ""}</dd>
      <dt className="text-muted">Said memorized before</dt><dd><b>{p.claimed + p.legacy}</b>{p.claimed + p.legacy ? " · not yet checked" : ""}</dd>
      <dt className="text-muted">Weak · needs help</dt><dd><b>{p.weakAyahs.length}</b>{p.weakAyahs.length ? ` · ${p.weakAyahs.map(([s, a]) => `${s}:${a}`).join(", ")}` : ""}</dd>
      <dt className="text-muted">Due for revision</dt><dd><b>{p.dueAyahs.length}</b>{p.dueAyahs.length ? ` · ${p.dueAyahs.map(([s, a]) => `${s}:${a}`).join(", ")}` : ""}</dd>
      <dt className="text-muted">Not started</dt><dd><b>{p.none}</b></dd>
    </dl>
    <p className="text-xs text-muted">{evidenceLine(p)}. Claims are what you told the app; only recitations you rated count as checked.</p>
    {p.lesson && <p className="rounded-xl bg-accent-soft/40 p-2 text-sm">Lesson in progress: <b>{p.lesson.title}</b> · step {p.lesson.step + 1}</p>}
    {maps.length > 0 && <div className="text-sm"><span className="text-muted">Visual maps: </span>{maps.map((m) => <Link key={m.id} className="mr-2 underline" href={`/mind-maps?map=${encodeURIComponent(m.id)}`}>{m.title}</Link>)}</div>}
    <div className="grid grid-cols-2 gap-2">
      <Link className={p.status === "none" || p.status === "claimed" || p.status === "learning" ? "btn-primary" : "btn"} href={learn}>{p.lesson ? "Continue lesson" : "Learn"}</Link>
      <Link className={p.status === "claimed" || p.status === "partial" || p.status === "learned" ? "btn-primary" : "btn"} href={`/mushaf?p=${p.page}&mode=recall`}>Recall page</Link>
      {p.weakAyahs.length > 0 && <Link className="btn-primary" href={reviseHref(p.weakAyahs, "weak")}>Revise weak Ayahs ({p.weakAyahs.length})</Link>}
      {p.dueAyahs.length > 0 && <Link className="btn-primary" href={reviseHref(p.dueAyahs, "rev")}>Revise due Ayahs ({p.dueAyahs.length})</Link>}
      {p.assessed > 0 && p.dueAyahs.length === 0 && p.weakAyahs.length === 0 && <Link className="btn" href={reviseHref(p.recitedAyahs, "rev")}>Revise assessed Ayahs ({p.recitedAyahs.length})</Link>}
      <Link className="btn" href={`/mushaf?p=${p.page}`}>Read</Link>
    </div>
  </Sheet>;
}
