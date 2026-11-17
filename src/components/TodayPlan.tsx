"use client";
// Today's Hifz (Phase 3.3): one plan combining recent, weak, due and rotation revision with today's new lesson.
// A task is marked done only after its practice session ends (Practice → applyResults), never by opening it.
import Link from "next/link";
import { useMemo, useState } from "react";
import Practice from "@/components/Practice";
import { buildPlan, markTask, setOverrideNew, type PlanTask } from "@/lib/planner";
import { dailyPrefs, setDailyPrefs } from "@/lib/prefs";
import { sname } from "@/lib/quran";
import { update, useStore } from "@/lib/store";

const KIND: Record<PlanTask["kind"], { label: string; cls: string }> = {
  recent: { label: "Recent revision", cls: "text-learn" }, weak: { label: "Weak ayahs", cls: "text-weak" },
  due: { label: "Older revision · due", cls: "text-revise" }, rotation: { label: "Older revision · rotation", cls: "text-accent" },
  new: { label: "New lesson", cls: "text-strong" }, assess: { label: "Check what I remember", cls: "text-gold" },
};

export default function TodayPlan({ compact = false }: { compact?: boolean }) {
  const st = useStore();
  const plan = useMemo(() => buildPlan(st), [st]);
  const [running, setRunning] = useState<PlanTask | null>(null);
  const [showAll, setShowAll] = useState(false);
  const prefs = dailyPrefs(st);
  // A new-lesson task counts as done once a lesson from the path was completed today.
  const newDone = Object.values(st.lessons || {}).some((l) => l.completedAt && l.pathId && new Date(l.completedAt).toDateString() === new Date().toDateString());
  const status = (t: PlanTask) => t.kind === "new" && newDone ? "done" : t.status;
  const todo = plan.tasks.filter((t) => status(t) === "todo");
  const doneCount = plan.tasks.filter((t) => status(t) === "done").length;

  if (running) return <Practice items={running.ayahs} title={`Page ${running.page} · ${KIND[running.kind].label}`} kind={running.kind === "weak" ? "weak" : "rev"}
    onClose={() => setRunning(null)} onComplete={() => update((d) => markTask(d, plan.day, running.id, "done"))} />;

  const start = (t: PlanTask) => { if (!t.href) setRunning(t); };
  const first = todo[0];
  const firstHref = first?.href;
  if (!plan.tasks.length) return <section className="card flex flex-col gap-2" aria-labelledby="today-title">
    <h2 id="today-title" className="text-lg font-bold">Today’s Hifz</h2>
    <p className="text-sm text-muted">Nothing is scheduled yet. Learn a page, set up your journey, or tell the app what you memorized before.</p>
    <div className="flex flex-wrap gap-2"><Link className="btn-primary" href="/learn">Learn a passage</Link><Link className="btn" href="/journey">My Hifz Journey</Link></div>
  </section>;

  return <section className="card flex flex-col gap-3" aria-labelledby="today-title">
    <div className="flex flex-wrap items-start justify-between gap-2">
      <div><h2 id="today-title" className="text-lg font-bold">Today’s Hifz</h2>
        <p className="text-sm text-muted">{doneCount} of {plan.tasks.length} done · about {plan.revisionMinutes + plan.newMinutes} of {plan.budget} min{plan.estimateSource === "default" ? " (default estimate)" : " (from your practice time)"}{plan.restDay ? " · rest day for new memorization" : ""}</p></div>
      <label className="text-sm text-muted">Time today <select className="field ml-1 inline w-auto" value={prefs.studyMinutes} onChange={(e) => update((d) => setDailyPrefs(d, { studyMinutes: +e.target.value }))}>{[...new Set([10, 15, 20, 30, 45, 60, 90, prefs.studyMinutes])].sort((x, y) => x - y).map((m) => <option key={m} value={m}>{m} min</option>)}</select></label>
    </div>
    {first && (firstHref ? <Link className="btn-primary min-h-[52px] text-base" href={firstHref}>▶ Start Today’s Hifz</Link> : <button className="btn-primary min-h-[52px] text-base" onClick={() => start(first)}>▶ Start Today’s Hifz</button>)}
    {!first && <p className="rounded-xl bg-strong/10 p-3 text-sm text-strong">All of today’s tasks are done. Well done.</p>}
    {plan.newPaused && <div className="rounded-xl border border-revise/40 bg-revise/10 p-3 text-sm">
      <b>Revision first today.</b> Due revision fills most of your {plan.budget} minutes, so new memorization is paused to protect what you already know.
      <button className="ml-2 underline" onClick={() => update((d) => setOverrideNew(d, plan.day, true))}>Add a new lesson anyway</button></div>}
    {plan.carriedOver > 0 && <p className="text-xs text-muted">{plan.carriedOver} more page{plan.carriedOver === 1 ? "" : "s"} of revision carried over to the coming days, most urgent first.</p>}
    {!compact || todo.length ? <ol className="flex flex-col gap-2">{plan.tasks.slice(0, compact && !showAll ? 3 : undefined).map((t) => {
      const s = status(t); const first = t.ayahs[0];
      return <li key={t.id} className={`rounded-xl border border-line p-3 ${s !== "todo" ? "opacity-60" : ""}`}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="min-w-0"><div className={`text-xs font-bold uppercase tracking-wide ${KIND[t.kind].cls}`}>{KIND[t.kind].label}</div>
            <div className="font-semibold"><Link className="touch-target underline decoration-line underline-offset-2" href={`/quran?tab=page&page=${t.page}`} title="Page status and evidence">Page {t.page}</Link>{first ? ` · ${sname(first[0])} ${first[1]}` : ""}{t.ayahs.length ? ` · ${t.ayahs.length} ayah${t.ayahs.length === 1 ? "" : "s"}` : ""} · ~{t.minutes} min</div>
            <div className="text-xs text-muted">{t.reason}</div></div>
          {s === "todo" ? <div className="flex gap-1">
            {t.href ? <Link className="btn btn-sm" href={t.href}>Start</Link> : <button className="btn btn-sm" onClick={() => start(t)}>Start</button>}
            <button className="btn btn-sm" title="Not today; it stays in your plan" onClick={() => update((d) => markTask(d, plan.day, t.id, "deferred"))}>Later</button>
          </div> : <span className="pill">{s === "done" ? "Done" : s === "self" ? "Done (self-reported)" : s === "deferred" ? "Moved to later" : "Skipped"}</span>}
        </div>
      </li>; })}</ol> : null}
    {compact && plan.tasks.length > 3 && <button type="button" className="self-start text-sm font-semibold underline underline-offset-2" onClick={() => setShowAll((v) => !v)} aria-expanded={showAll}>{showAll ? "Show fewer tasks" : "View All Revision Tasks"}</button>}
    {!compact && <div className="flex flex-wrap gap-2 text-sm"><Link className="touch-target underline" href={`/mushaf?p=${st.lastPage || 1}&mode=learn`}>Choose any page instead</Link><Link className="touch-target underline" href="/journey-settings">Journey settings</Link></div>}
    <p className="text-xs text-muted">Opening a task never marks it done — only finishing its recitation does. Self-reported portions are checked, not assumed.</p>
  </section>;
}

