"use client";
// Reminder check-in: "Did you complete your Hifz / revision today?" (opened from a follow-up notification).
// Answers are self-reports only: they never change Hifz evidence, SRS ratings or daily-plan task status.
import Link from "next/link";
import { Suspense, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { activityStatus, checkinFor, reminderBridge, recordCheckin, type Kind } from "@/lib/reminder";
import { update, useStore } from "@/lib/store";

const LABEL: Record<Kind, { title: string; noun: string }> = {
  hifz: { title: "Did you complete your Hifz today?", noun: "today's lesson" },
  rev: { title: "Did you complete your revision today?", noun: "today's revision" },
};

function CheckIn() {
  const params = useSearchParams(); const router = useRouter(); const st = useStore();
  const kind: Kind = params.get("kind") === "rev" ? "rev" : "hifz";
  const status = useMemo(() => activityStatus(st, kind), [st, kind]);
  const prior = checkinFor(st, kind);
  const [said, setSaid] = useState<string | null>(null);

  const answer = (a: "yes" | "not_yet" | "later" | "skip") => {
    update((d) => recordCheckin(d, kind, a, "app"));
    try { if (a !== "not_yet") reminderBridge()?.answer?.(kind, a); } catch { /* older build */ }
    if (a === "not_yet") { router.push(status.href || "/journey"); return; }
    setSaid(a === "yes" ? (status.state === "done" ? "Recorded. Your saved lesson records already show this complete." : "Recorded as done outside the app. Your Hifz progress is not changed: recite it here when you can to keep your evidence accurate.")
      : a === "later" ? "We will remind you again later today." : "Skipped for today. No more reminders for this today.");
  };

  return <section className="card mx-auto flex max-w-lg flex-col gap-4">
    <div><div className="label">Check-in</div><h1 className="text-xl font-bold">{LABEL[kind].title}</h1></div>
    {status.state === "done" && <p className="rounded-xl bg-accent-soft/40 p-3 text-sm">Your saved records show {LABEL[kind].noun} is complete. There is nothing more to do.</p>}
    {status.state === "none" && <p className="text-sm text-muted">Nothing is scheduled for {LABEL[kind].noun}.</p>}
    {status.state === "todo" && <p className="text-sm text-muted">{status.summary.replace(" Tap to start.", "")}</p>}
    {prior && !said && <p className="text-xs text-muted">Already answered today: {prior.answer.replace("_", " ")}{prior.verifiedInApp ? " (confirmed by saved records)" : prior.answer === "yes" ? " (self-reported)" : ""}.</p>}
    {said ? <p className="text-sm" role="status">{said}</p> : <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
      <button className="btn-primary" onClick={() => answer("yes")}>Yes, completed</button>
      <button className="btn" onClick={() => answer("not_yet")}>Not yet: start now</button>
      <button className="btn" onClick={() => answer("later")}>Remind me later</button>
      <button className="btn" onClick={() => answer("skip")}>Skip today</button>
    </div>}
    <p className="text-xs text-muted">Answering here does not mark any Ayah as memorized or revised. Only recitations you rate in the app count as evidence.</p>
    <Link className="text-sm underline" href="/journey">Go to My Journey</Link>
  </section>;
}
export default function CheckInPage() { return <Suspense fallback={null}><CheckIn /></Suspense>; }
