"use client";
// Your Revision: at most two pending tasks, each with Start Revision and Done (lib/revisionSession.ts).
// The pair is chosen when the screen opens and stays fixed while it is on screen; Done removes a task without
// swapping in another. "Done" without reciting here is recorded as self-reported only — never as Hifz evidence.
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import EmptyState from "@/components/EmptyState";
import Practice from "@/components/Practice";
import ManualRevisionPicker from "@/components/ManualRevisionPicker";
import TodayPlan from "@/components/TodayPlan";
import { claimedAyahs } from "@/lib/coverage";
import { buildPlan } from "@/lib/planner";
import { sname } from "@/lib/quran";
import { completeRevisionItem, startRevisionSession, visiblePair, waitingRevision, type RevisionItem } from "@/lib/revisionSession";
import { storeReady, update, useStore } from "@/lib/store";

const KIND: Record<string, string> = { recent: "Recent page", weak: "Weak Ayahs", due: "Due for review", rotation: "Rotation" };

export default function RevisionPage() {
  const st = useStore();
  const [ready, setReady] = useState(false);
  const [running, setRunning] = useState<RevisionItem | null>(null);
  const [manual, setManual] = useState<{ items: [number, number][]; title: string } | null>(null);
  const [full, setFull] = useState(false);
  // Opening the screen starts a revision session: carried-over items first, then top up to two.
  // Wait for the stored records to be fully loaded first, so the pair is never chosen from a partial copy.
  useEffect(() => { let live = true; void storeReady().then(() => { if (!live) return; update((d) => { startRevisionSession(d); }); setReady(true); }); return () => { live = false; }; }, []);
  const plan = useMemo(() => buildPlan(st), [st]);
  const pair = useMemo(() => visiblePair(st, plan), [st, plan]);
  const waiting = useMemo(() => waitingRevision(st, plan), [st, plan]);
  const claimedKeys = [...claimedAyahs(st).keys()].filter((k) => !st.mem[k]);
  const practised = Object.keys(st.mem).length > 0;

  if (manual) return <Practice items={manual.items} title={manual.title} kind="rev" onClose={() => setManual(null)} />;
  if (running) return <Practice items={running.ayahs} title={`Page ${running.page} · ${KIND[running.kind] || "Revision"}`} kind={running.kind === "weak" ? "weak" : "rev"}
    onClose={() => setRunning(null)} onComplete={() => update((d) => completeRevisionItem(d, running.id, "app"))} />;

  if (!ready) return <div className="card text-sm text-muted" role="status">Opening your revision…</div>;

  return <div className="revision-screen flex flex-col gap-3">
    <ManualRevisionPicker onStart={(items, title) => setManual({ items, title })} />
    {!practised && claimedKeys.length === 0 && <EmptyState title="No scheduled revision yet" body="You can still revise any Quran passage manually above, or learn a new passage." href="/learn" action="Learn a passage" />}
    {pair.length > 0 ? <ol className="flex flex-col gap-2" aria-label="Pending revision">
      {pair.map((t) => { const first = t.ayahs[0];
        return <li key={t.id} className="revision-task card flex flex-col gap-2 !p-3.5" data-testid="revision-task">
          <div className="min-w-0">
            <div className="text-lg font-bold">Page {t.page}{first ? <span className="font-semibold text-muted"> · {sname(first[0])}</span> : null}</div>
            <p className="text-sm text-muted">{KIND[t.kind] || "Revision"} · {t.ayahs.length} Ayah{t.ayahs.length === 1 ? "" : "s"}{t.addedDay < plan.day ? " · from your last session" : ""}</p>
          </div>
          <div className="flex gap-2">
            <button className="btn-primary flex-1" onClick={() => setRunning(t)}>Start Revision</button>
            <button className="btn min-w-[96px]" aria-label={`Mark page ${t.page} done`} onClick={() => update((d) => completeRevisionItem(d, t.id, "self"))}>Done</button>
          </div>
        </li>; })}
    </ol> : <section className="card flex flex-col items-start gap-2" role="status">
      <h2 className="text-lg font-bold">{waiting.length ? "These two are done" : "All caught up"}</h2>
      {waiting.length > 0
        ? <><p className="text-sm text-muted">{waiting.length} more page{waiting.length === 1 ? " is" : "s are"} due.</p><button className="btn-primary" onClick={() => update((d) => { startRevisionSession(d); })}>Show next revision</button></>
        : <p className="text-sm text-muted">No revision is pending right now.</p>}
    </section>}
    {pair.length > 0 && <p className="text-xs text-muted">Done without reciting here is saved as self-reported. Only recitation in the app updates your Hifz record.</p>}
    {claimedKeys.length > 0 && <Link className="touch-target text-sm underline underline-offset-2" href="/assess">Check {claimedKeys.length} self-reported Ayahs</Link>}
    <button type="button" className="touch-target self-start text-sm text-muted underline underline-offset-2" aria-expanded={full} onClick={() => setFull((v) => !v)}>{full ? "Hide full schedule" : "Full revision schedule and history"}</button>
    {full && <><TodayPlan compact /><div className="flex flex-wrap gap-3 text-sm"><Link className="touch-target underline" href="/quran?tab=page">Page tracker</Link><Link className="touch-target underline" href="/progress">History</Link></div></>}
  </div>;
}
