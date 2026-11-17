"use client";
import Link from "next/link";
import { useMemo } from "react";
import DashboardHeader from "@/components/DashboardHeader";
import PrayerTimesCard from "@/components/PrayerTimesCard";
import { buildPlan } from "@/lib/planner";
import { learnHref, lessonHref } from "@/lib/mushafLesson";
import { nextPathLesson } from "@/lib/journey";
import { pageAyahs } from "@/lib/chunking";
import { buildSteps } from "@/lib/lesson";
import { juzOf, pageOf, Q, ref, sname } from "@/lib/quran";
import { useStore } from "@/lib/store";

export default function JourneyDashboard() {
  const st = useStore();
  const path = st.studentJourney?.paths.find((p) => p.id === st.studentJourney?.primaryPathId && !p.deletedAt);
  const unfinished = useMemo(() => Object.values(st.lessons || {}).filter((l) => !l.completedAt).sort((a, b) => b.updatedAt - a.updatedAt)[0], [st.lessons]);
  const next = path ? nextPathLesson(Q(), path, pageOf) : null;
  const continueHref = unfinished ? lessonHref(unfinished, pageOf) : next && path ? learnHref({ start: next.start, end: next.end, pathId: path.id }, pageOf) : null;
  const target = unfinished?.unit.start || next?.start || null;
  const lessonAyahs = useMemo(() => {
    if (!unfinished) return [];
    if (unfinished.unit.kind === "page" && unfinished.unit.page) return pageAyahs(unfinished.unit.page);
    const { start, end } = unfinished.unit;
    const out: [number, number][] = [];
    for (let s = start.s; s <= end.s; s++) {
      const first = s === start.s ? start.a : 1, last = s === end.s ? end.a : Q().n[s - 1][2];
      for (let a = first; a <= last; a++) out.push([s, a]);
    }
    return out;
  }, [unfinished]);
  const steps = useMemo(() => unfinished ? buildSteps(lessonAyahs, unfinished.level, unfinished.template) : [], [unfinished, lessonAyahs]);
  const activeStep = unfinished ? steps[Math.min(Math.max(0, unfinished.step), Math.max(0, steps.length - 1))] : null;
  const progress = unfinished && steps.length ? Math.min(100, Math.round(((unfinished.step + 1) / steps.length) * 100)) : 0;
  const plan = useMemo(() => buildPlan(st), [st]);
  const dueTasks = plan.tasks.filter((t) => t.status === "todo" && t.kind !== "new" && t.kind !== "assess");
  const dueAyahs = dueTasks.reduce((n, task) => n + task.ayahs.length, 0);
  const weakAyahs = dueTasks.filter((t) => t.kind === "weak").reduce((n, task) => n + task.ayahs.length, 0);
  const configured = !!path;
  // Has the learner any Hifz records at all? (recited Ayahs or self-reported portions)
  const hasRecords = Object.keys(st.mem).length > 0 || (st.studentJourney?.claims || []).some((c) => !c.deletedAt);

  return <div className="journey-screen dashboard-screen flex flex-col gap-4 sm:gap-5">
    <DashboardHeader />

    <section className="hifz-main-card card flex flex-col gap-3" aria-labelledby="hifz-card-title">
      <div className="flex flex-wrap items-start justify-between gap-3"><div className="min-w-0"><div className="label">Your memorization</div><h2 id="hifz-card-title" className="mt-1 text-xl font-bold">{unfinished ? unfinished.title : path?.name || "Begin your Hifz journey"}</h2>
        <p className="mt-1 text-sm text-muted">{unfinished ? `Continue your saved lesson at ${activeStep?.label || `step ${unfinished.step + 1}`}. Lesson progress resumes exactly where you left it.` : next ? `Next on your learning path: ${sname(next.start.s)} ${next.start.a}.` : path ? "Your current learning path is complete. Choose a new goal to continue." : "Choose a starting point and daily study time when you’re ready."}</p></div>
        {configured && <Link className="text-sm font-semibold text-accent underline dashboard-goal-link" href="/journey-settings">Change goal</Link>}
      </div>
      {target && <div className="hifz-location-grid" aria-label="Current Quran location"><div><span>Juz</span><strong>{juzOf(target.s, target.a)}</strong></div><div><span>Surah</span><strong>{sname(target.s)}</strong></div><div><span>Mushaf page</span><strong>{pageOf(target.s, target.a)}</strong></div><div><span>Ayah</span><strong>{ref(target.s, target.a)}</strong></div></div>}
      {unfinished && <div className="hifz-step-progress"><div className="flex justify-between gap-3 text-sm"><span className="font-semibold">Lesson progress</span><span className="tabular-nums text-muted">Step {unfinished.step + 1}{steps.length ? ` of ${steps.length}` : ""}</span></div><div className="mt-2 h-2 overflow-hidden rounded-full bg-line" role="progressbar" aria-label="Saved lesson progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress}><div className="h-full rounded-full bg-accent transition-[width]" style={{ width: `${progress}%` }} /></div></div>}
      {continueHref ? <Link className="btn-primary journey-continue dashboard-continue self-start px-6" href={continueHref}>{unfinished ? "Continue Hifz" : "Start Your Hifz Journey"}<span aria-hidden="true"> →</span></Link>
        : <Link className="btn-primary journey-continue dashboard-continue self-start px-6" href="/journey-settings">{path ? "Choose a new goal" : "Start Your Hifz Journey"}<span aria-hidden="true"> →</span></Link>}
    </section>

    <PrayerTimesCard />

    <section className="today-revision-card card flex flex-wrap items-center justify-between gap-4" aria-labelledby="revision-card-title">
      <div className="min-w-0"><div className="label">Protect what you know</div><h2 id="revision-card-title" className="mt-1 text-lg font-bold">Today&apos;s Revision</h2>{dueAyahs > 0 ? <><p className="mt-1 text-sm text-muted">{dueAyahs.toLocaleString()} Ayahs across {dueTasks.length} review task{dueTasks.length === 1 ? "" : "s"} are planned today.</p>{weakAyahs > 0 && <p className="mt-1 text-sm text-revise">{weakAyahs.toLocaleString()} weak Ayahs need extra attention.</p>}</> : hasRecords ? <p className="mt-1 text-sm text-muted">Today&apos;s revision is done.</p> : <p className="mt-1 text-sm text-muted">Nothing to revise yet. Ayahs you learn here come back for revision automatically.</p>}</div>
      {dueAyahs > 0 ? <Link className="btn-primary self-center" href="/revision">Start Revision</Link> : hasRecords ? <Link className="btn self-center" href="/revision">Open Revision</Link> : null}
    </section>

    <nav className="dashboard-shortcuts" aria-label="Learning shortcuts">
      <Link className="dashboard-shortcut" href="/learn"><span className="dashboard-shortcut-icon" aria-hidden="true">✦</span><span><strong>New Learning</strong><small>Learn the next passage</small></span><span aria-hidden="true">→</span></Link>
      <Link className="dashboard-shortcut" href="/quran"><span className="dashboard-shortcut-icon" aria-hidden="true">۞</span><span><strong>My Quran</strong><small>Browse your memorization</small></span><span aria-hidden="true">→</span></Link>
      <Link className="dashboard-shortcut" href="/mind-maps"><span className="dashboard-shortcut-icon" aria-hidden="true">⌘</span><span><strong>Visual Maps</strong><small>Open your visual references</small></span><span aria-hidden="true">→</span></Link>
    </nav>
  </div>;
}
