"use client";
// Smart Hifz Tutor entry point: three clear choices — Learn a New Page, Recall a Page, Revise Previous Hifz.
import { learnHref, lessonHref } from "@/lib/mushafLesson";
import Link from "next/link";
import { useMemo, useState } from "react";
import MethodIntro from "@/components/MethodIntro";
import { pageAyahs } from "@/lib/chunking";
import { claimedAyahs } from "@/lib/coverage";
import { nextPathLesson } from "@/lib/journey";
import { buildPlan } from "@/lib/planner";
import { pageOf, Q, sname } from "@/lib/quran";
import { useStore } from "@/lib/store";

export default function TutorHub({ showContinue = true }: { showContinue?: boolean }) {
  const st = useStore();
  const [showMethod, setShowMethod] = useState(false);
  const [learnPg, setLearnPg] = useState(st.lastPage || 1);
  const [recallPg, setRecallPg] = useState(st.lastPage || 1);
  const primary = st.studentJourney?.paths.find((p) => p.id === st.studentJourney?.primaryPathId && !p.deletedAt);
  const next = primary ? nextPathLesson(Q(), primary, pageOf) : null;
  const unfinished = Object.values(st.lessons || {}).filter((l) => !l.completedAt).sort((a, b) => b.updatedAt - a.updatedAt)[0];
  const unfinishedHref = unfinished ? lessonHref(unfinished, pageOf) : "";
  const half = st.tutor?.portion === "half_page";
  // Learning opens on the Mushaf page (Learn mode); a half-page preference preselects the first half.
  const learnPageHref = (pg: number) => `/mushaf?p=${pg}&mode=learn&portion=${half ? "first" : "page"}`;
  const plan = useMemo(() => buildPlan(st), [st]);
  const revisionTodo = plan.tasks.filter((t) => t.kind !== "new" && t.status === "todo");
  const firstRevision = revisionTodo.find((t) => !t.href) || revisionTodo[0];
  const claimedPages = useMemo(() => new Set([...claimedAyahs(st).keys()].map((k) => { const [s, a] = k.split(":").map(Number); return pageOf(s, a); })).size, [st]);

  return <section aria-labelledby="tutor-title" className="flex flex-col gap-3">
    <div className="flex flex-wrap items-end justify-between gap-2">
      <div><h2 id="tutor-title" className="text-xl font-bold">Smart Hifz Tutor</h2><p className="text-sm text-muted">What would you like to do?</p></div>
      <button className="text-sm underline" onClick={() => setShowMethod((v) => !v)} aria-expanded={showMethod}>How this method works</button>
    </div>
    {showMethod && <MethodIntro onClose={() => setShowMethod(false)} />}
    <div className="grid gap-3 lg:grid-cols-3">
      {/* A. Learn a New Page */}
      <article className="card flex flex-col gap-3 border-strong/40">
        <div><div className="text-3xl" aria-hidden>📖</div><h3 className="text-lg font-bold">Learn a new page</h3><p className="text-sm text-muted">Step by step: listen, repeat, hide the text, recite, join with earlier Ayahs, then test the page.</p></div>
        {showContinue && unfinished && <Link className="btn-primary min-h-[48px]" href={unfinishedHref}>Continue: {unfinished.title} (step {unfinished.step + 1})</Link>}
        {showContinue && next && <Link className={unfinished ? "btn min-h-[48px]" : "btn-primary min-h-[48px]"} href={learnHref({ start: next.start, end: next.end, pathId: primary!.id }, pageOf)}>Next on my path: page {next.page} ? {sname(next.start.s)} {next.start.a}</Link>}
        <div className="flex gap-2"><label className="sr-only" htmlFor="learn-pg">Page to learn</label><input id="learn-pg" className="field w-24" type="number" min={1} max={604} value={learnPg} onChange={(e) => setLearnPg(Math.max(1, Math.min(604, +e.target.value || 1)))} /><Link className="btn-primary min-h-[48px] flex-1" href={learnPageHref(learnPg)}>Learn page {learnPg}{half ? " (first half)" : ""}</Link></div>
        <p className="text-xs text-muted">Guided or manual — you choose before starting. {st.tutor?.mode === "manual" ? "Your default: manual." : "Your default: guided."}</p>
      </article>
      {/* B. Recall a Page */}
      <article className="card flex flex-col gap-3 border-accent/40">
        <div><div className="text-3xl" aria-hidden>🎯</div><h3 className="text-lg font-bold">Recall a page</h3><p className="text-sm text-muted">Recite a whole page from memory with the text hidden. Optional hints, Ayah-by-Ayah results, then practise the weak Ayahs.</p></div>
        <div className="flex gap-2"><label className="sr-only" htmlFor="recall-pg">Page to recall</label><input id="recall-pg" className="field w-24" type="number" min={1} max={604} value={recallPg} onChange={(e) => setRecallPg(Math.max(1, Math.min(604, +e.target.value || 1)))} /><Link className="btn-primary min-h-[48px] flex-1" href={`/mushaf?p=${recallPg}&mode=recall`}>Recall page {recallPg}</Link></div>
        <Link className="text-sm underline" href="/recall">Choose from pages I have practised</Link>
      </article>
      {/* C. Revise Previous Hifz */}
      <article className="card flex flex-col gap-3 border-gold/50">
        <div><div className="text-3xl" aria-hidden>📚</div><h3 className="text-lg font-bold">Revise previous Hifz</h3><p className="text-sm text-muted">Today’s assigned revision, any Juz or Surah you choose, and recovery of pages that have faded.</p></div>
        {firstRevision ? <a className="btn-primary" href="#today-title">Today’s revision: {revisionTodo.length} task{revisionTodo.length === 1 ? "" : "s"} below</a> : <span className="rounded-xl bg-strong/10 p-2 text-sm text-strong">No revision due right now.</span>}
        <div className="flex flex-wrap gap-2"><Link className="btn btn-sm min-h-[44px]" href="/quran?tab=juz">Choose a Juz or Surah</Link><Link className="btn btn-sm min-h-[44px]" href="/assess">Check &amp; recover pages</Link></div>
        <p className="text-xs text-muted">{claimedPages ? `${claimedPages} page${claimedPages === 1 ? "" : "s"} you said you know are waiting for a quick check. They are not counted as recited until you recite them.` : "Portions you memorized before can be added under My Hifz Journey, then Edit journey."}</p>
      </article>
    </div>
  </section>;
}

