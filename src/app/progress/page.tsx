"use client";
import Link from "next/link";
import { useMemo } from "react";
import EmptyState from "@/components/EmptyState";
import { dueCount, weakDue } from "@/lib/hifz";
import { coverageSummary } from "@/lib/coverage";
import { pageTracker, statusCounts } from "@/lib/pageTracker";
import { pageOf } from "@/lib/quran";
import { fmtMin, streak, today, useStore } from "@/lib/store";

export default function ProgressPage() {
  const st = useStore(); const c = useMemo(() => coverageSummary(st), [st]);
  const counts = useMemo(() => statusCounts(pageTracker(st, pageOf)), [st]);
  const t = today(); const week = Array.from({ length: 7 }, (_, i) => ({ day: t - 6 + i, ayahs: st.log[String(t - 6 + i)]?.a || 0, revision: st.log[String(t - 6 + i)]?.rev || 0 }));
  const claims = (st.studentJourney?.claims || []).filter((x) => !x.deletedAt);
  const history = [...st.hist].sort((a, b) => b.t - a.t).slice(0, 20);
  const evidence = c.learning + c.retained + c.weak;
  if (evidence === 0 && c.claimed === 0 && claims.length === 0 && history.length === 0) return <div className="flex flex-col gap-4">
    <EmptyState title="No progress yet" body="Your recited Ayahs, revision and streak appear here after your first lesson." href="/learn" action="Learn a passage" />
  </div>;
  return <div className="flex flex-col gap-4">
    <p className="text-sm text-muted">Self-reported coverage and recitation evidence are shown separately.</p>
    <section className="grid grid-cols-2 gap-2 sm:grid-cols-4"><div className="card"><div className="text-2xl font-bold">{evidence.toLocaleString()}</div><div className="text-sm text-muted">Ayahs recited and rated</div></div><div className="card"><div className="text-2xl font-bold">{c.retained.toLocaleString()}</div><div className="text-sm text-muted">Retained long-term</div></div><div className="card"><div className="text-2xl font-bold">{c.claimed.toLocaleString()}</div><div className="text-sm text-muted">Self-reported, not checked</div></div><div className="card"><div className="text-2xl font-bold">{dueCount(st)}</div><div className="text-sm text-muted">Due · {weakDue(st).length} weak</div></div></section>
    <section className="card flex flex-col gap-3"><h2 className="text-lg font-bold">Coverage by Mushaf page</h2><p className="text-sm text-muted">Every page is derived from the saved Ayah evidence. A claimed range remains self-reported until it is assessed.</p><div className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">{Object.entries(counts).map(([status, n]) => <div key={status} className="rounded-lg border border-line p-2"><b>{n}</b><div className="text-muted">{status.replaceAll("_", " ")}</div></div>)}</div><Link className="btn self-start" href="/quran?tab=page">Open 604-page tracker</Link></section>
    <section className="card flex flex-col gap-3"><h2 className="text-lg font-bold">Previously memorized · self-reported</h2>{claims.length ? claims.map((claim) => <div key={claim.id} className="rounded-lg border border-dashed border-gold p-3"><b>{claim.label}</b><div className="text-sm text-muted">{claim.confidence.replaceAll("_", " ")} · {claim.ranges.map((r) => r.label || `${r.start.s}:${r.start.a}–${r.end.s}:${r.end.a}`).join("; ")}</div></div>) : <p className="text-sm text-muted">No self-reported portions recorded.</p>}<p className="text-xs text-muted">Claims do not count as independent recitation evidence or as verified Hifz.</p></section>
    <section className="card flex flex-col gap-3"><h2 className="text-lg font-bold">Last seven days</h2><div className="flex gap-4 text-xs text-muted"><span><i className="mr-1 inline-block h-2 w-2 rounded-full bg-accent" />Ayahs practiced</span><span><i className="mr-1 inline-block h-2 w-2 rounded-full bg-revise" />Revision Ayahs</span></div><div className="grid grid-cols-7 gap-2 items-end h-28" role="img" aria-label="Ayahs practiced and revision Ayahs each day over the last seven days">{week.map((d) => <div key={d.day} className="flex h-full flex-col items-center justify-end gap-1 text-[10px] text-muted"><div className="flex h-20 w-full items-end justify-center gap-0.5"><div className="w-2/5 rounded-t bg-accent" title={`${d.ayahs} Ayahs practiced`} style={{ height: `${Math.max(3, Math.min(68, d.ayahs * 2))}px` }} /><div className="w-2/5 rounded-t bg-revise" title={`${d.revision} Ayahs revised`} style={{ height: `${Math.max(3, Math.min(68, d.revision * 2))}px` }} /></div><span>{new Date(d.day * 86400000).toLocaleDateString(undefined, { weekday: "short", timeZone: "UTC" })}</span></div>)}</div><p className="text-sm text-muted">{streak(st)} day streak · total practice {fmtMin(Object.values(st.log).reduce((sum, x) => sum + (x.t || 0), 0))}</p></section>
    <section className="card"><h2 className="mb-2 text-lg font-bold">Recent history</h2>{history.length ? <ol className="divide-y divide-line">{history.map((h, i) => <li key={`${h.t}-${i}`} className="flex flex-wrap justify-between gap-2 py-2 text-sm"><span>{h.l || h.k}</span><span className="text-muted">{new Date(h.t).toLocaleString()} · {h.n} items{h.m ? ` · ${h.m} needed help` : ""}</span></li>)}</ol> : <p className="text-sm text-muted">Your recitation history will appear here as you practice.</p>}</section>
  </div>;
}

