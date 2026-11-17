"use client";
// Journey Settings → Hifz & Revision Reminders. Opt-in; delivered by the Android app (native alarms).
import { useEffect, useState } from "react";
import { FOLLOW_UP_OPTIONS, activityStatus, pushReminder, reminderBridge, reminderPrefs } from "@/lib/reminder";
import { update, useStore, type ReminderPrefs } from "@/lib/store";

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export default function ReminderSettings() {
  const st = useStore();
  const p = reminderPrefs(st);
  const [native, setNative] = useState(false); const [permitted, setPermitted] = useState(true);
  useEffect(() => { const b = reminderBridge(); setNative(!!b); try { if (b) setPermitted(b.permitted()); } catch { /* older build */ } }, [p.on]);
  const set = (patch: Partial<ReminderPrefs>) => update((d) => {
    const next = { ...reminderPrefs(d), ...patch };
    d.settings.reminders = next;
    d.settings.reminderOn = next.on; d.settings.reminderTime = next.hifzTime; // legacy mirror for older builds
  });
  const hifz = activityStatus(st, "hifz"), rev = activityStatus(st, "rev");
  const line = (s: typeof hifz) => s.state === "done" ? "done today, no more reminders" : s.state === "none" ? "nothing scheduled today, no reminder" : s.summary.replace(" Tap to start.", "");
  const quiet = !!(p.quietStart && p.quietEnd);

  return <section className="card flex flex-col gap-4" aria-labelledby="reminders-title">
    <div><div className="label">Notifications</div><h2 id="reminders-title" className="mt-1 text-xl font-bold">Hifz &amp; Revision Reminders</h2>
      <p className="mt-1 text-sm text-muted">A reminder at your chosen time, then one check-in asking whether you finished. Reminders stop once the activity is complete in the app. Answering a check-in never changes your Hifz progress.</p></div>
    <button type="button" className={`btn self-start ${p.on ? "btn-on" : ""}`} aria-pressed={p.on} onClick={() => set({ on: !p.on })}>{p.on ? "Reminders on" : "Turn reminders on"}</button>

    <fieldset className={`flex flex-col gap-3 ${p.on ? "" : "opacity-60"}`} disabled={!p.on}>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="rounded-xl border border-line p-3">
          <label className="flex items-center gap-2 font-semibold"><input type="checkbox" checked={p.hifzOn} onChange={(e) => set({ hifzOn: e.target.checked })} /> Hifz (new memorization)</label>
          <label className="mt-2 flex flex-col text-sm text-muted">Time<input type="time" className="field mt-1 !w-36" value={p.hifzTime} onChange={(e) => e.target.value && set({ hifzTime: e.target.value })} /></label>
          <p className="mt-2 text-xs text-muted">Today: {line(hifz)}</p>
        </div>
        <div className="rounded-xl border border-line p-3">
          <label className="flex items-center gap-2 font-semibold"><input type="checkbox" checked={p.revOn} onChange={(e) => set({ revOn: e.target.checked })} /> Revision (Muraja&apos;ah)</label>
          <label className="mt-2 flex flex-col text-sm text-muted">Time<input type="time" className="field mt-1 !w-36" value={p.revTime} onChange={(e) => e.target.value && set({ revTime: e.target.value })} /></label>
          <p className="mt-2 text-xs text-muted">Today: {line(rev)}</p>
        </div>
      </div>

      <div><div className="text-sm font-medium">Days</div><div className="mt-1 flex flex-wrap gap-1">{DAYS.map((d, i) => { const on = p.days.includes(i); return <button key={d} type="button" className={`btn btn-sm ${on ? "btn-on" : ""}`} aria-pressed={on} onClick={() => set({ days: on ? p.days.filter((x) => x !== i) : [...p.days, i].sort() })}>{d}</button>; })}</div></div>

      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col text-sm text-muted">Ask &ldquo;Did you complete it?&rdquo; after
          <select className="field mt-1 !w-40" value={p.followUpMin} onChange={(e) => set({ followUpMin: +e.target.value })}>{FOLLOW_UP_OPTIONS.map((m) => <option key={m} value={m}>{m < 60 ? `${m} min` : `${m / 60} hour${m === 60 ? "" : "s"}`}</option>)}</select></label>
        <label className="flex flex-col text-sm text-muted">Check-ins per day (each)
          <select className="field mt-1 !w-32" value={p.maxFollowUps} onChange={(e) => set({ maxFollowUps: +e.target.value })}>{[0, 1, 2, 3].map((n) => <option key={n} value={n}>{n === 0 ? "None" : n}</option>)}</select></label>
        <label className="flex flex-col text-sm text-muted">Sound
          <select className="field mt-1 !w-36" value={p.sound} onChange={(e) => set({ sound: e.target.value as ReminderPrefs["sound"] })}><option value="default">Phone default</option><option value="silent">Silent</option></select></label>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={quiet} onChange={(e) => set(e.target.checked ? { quietStart: "22:30", quietEnd: "05:00" } : { quietStart: "", quietEnd: "" })} /> Quiet hours</label>
        {quiet && <><label className="flex flex-col text-sm text-muted">From<input type="time" className="field mt-1 !w-32" value={p.quietStart} onChange={(e) => e.target.value && set({ quietStart: e.target.value })} /></label>
          <label className="flex flex-col text-sm text-muted">Until<input type="time" className="field mt-1 !w-32" value={p.quietEnd} onChange={(e) => e.target.value && set({ quietEnd: e.target.value })} /></label></>}
      </div>
    </fieldset>

    {native && <div className="flex flex-wrap gap-2">
      <button type="button" className="btn btn-sm" onClick={() => { pushReminder(st); reminderBridge()?.testKind?.("hifz", false); }}>Test Hifz reminder</button>
      <button type="button" className="btn btn-sm" onClick={() => { pushReminder(st); reminderBridge()?.testKind?.("rev", true); }}>Test check-in</button>
    </div>}
    {native && p.on && !permitted && <p className="text-sm text-weak" role="alert">Notifications are blocked for Hifz Journey. Allow them in Android Settings → Apps → Hifz Journey → Notifications.</p>}
    {!native && <p className="text-xs text-muted">Reminders are delivered by the Android app, even while it is closed. A browser or installed web app cannot schedule them reliably, so none are sent here. Your choices still sync when you are signed in.</p>}
    {native && <p className="text-xs text-muted">Android may deliver reminders a few minutes late to save battery. If they never arrive, allow notifications and set battery use for Hifz Journey to &ldquo;Unrestricted&rdquo;.</p>}
  </section>;
}
