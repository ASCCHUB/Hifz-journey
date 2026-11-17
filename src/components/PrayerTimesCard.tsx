"use client";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { calculatePrayerTimes, calculateTomorrowPrayerTimes, formatPrayerTime, nextPrayerTime, readPrayerPrefs, type PrayerPrefs, type PrayerTimeEntry } from "@/lib/prayer";

export default function PrayerTimesCard() {
  const [prefs, setPrefs] = useState<PrayerPrefs | null>(null);
  const [now, setNow] = useState<Date | null>(null);
  const [hour12, setHour12] = useState(true);
  useEffect(() => {
    const refresh = () => { setPrefs(readPrayerPrefs()); setNow(new Date()); try { setHour12(JSON.parse(localStorage.getItem("hifz-journey-display-preferences-v1") || "null")?.hour12 ?? true); } catch { setHour12(true); } };
    refresh(); const timer = window.setInterval(() => setNow(new Date()), 30_000);
    window.addEventListener("hifz-prayer-preferences", refresh);
    window.addEventListener("storage", refresh);
    return () => { clearInterval(timer); window.removeEventListener("hifz-prayer-preferences", refresh); window.removeEventListener("storage", refresh); };
  }, []);
  const entries = useMemo(() => prefs && now ? calculatePrayerTimes(prefs, now) : null, [prefs, now]);
  const nextInfo = useMemo(() => {
    if (!prefs || !now || !entries) return null;
    const todayNext = nextPrayerTime(entries, now.getTime());
    return todayNext ? { entry: todayNext, tomorrow: false } : (calculateTomorrowPrayerTimes(prefs, now)?.[0] ? { entry: calculateTomorrowPrayerTimes(prefs, now)![0], tomorrow: true } : null);
  }, [prefs, entries, now]);
  const next = nextInfo?.entry ?? null;
  let countdown = "";
  if (next && now) {
    let minutes = Math.max(0, Math.floor((next.at.getTime() - now.getTime()) / 60_000));
    countdown = minutes >= 60 ? `${Math.floor(minutes / 60)}h ${minutes % 60}m` : `${minutes} min`;
  }
  return <section className="prayer-card card relative overflow-hidden" aria-labelledby="prayer-title">
    <div className="flex flex-wrap items-start justify-between gap-2"><div><div className="label">Daily rhythm</div><h2 id="prayer-title" className="mt-1 text-lg font-bold">Prayer times</h2></div>{prefs && <Link href="/prayer-settings" className="btn btn-sm">Prayer settings</Link>}</div>
    {!prefs ? <p className="mt-2 text-sm text-muted">Prayer location not set yet. <Link className="font-semibold text-accent underline" href="/prayer-settings">Set it in Settings</Link> to see today&apos;s times (no location is guessed).</p>
      : !entries ? <p className="mt-3 rounded-xl bg-revise/10 p-3 text-sm text-muted">Prayer times are unavailable for this date and location with the selected method. Try another method or check the settings.</p>
      : <>
        <p className="mt-1 text-xs text-muted">{prefs.cityName} · {prefs.timeZone} · {prefs.method.toUpperCase()} · {prefs.madhab === "hanafi" ? "Hanafi Asr" : "Shafi Asr"}</p>
        <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-5">{entries.map((entry: PrayerTimeEntry) => { const active = !nextInfo?.tomorrow && next?.name === entry.name; return <div key={entry.name} className={`prayer-time rounded-xl border px-2 py-2 text-center ${active ? "border-accent bg-accent text-accent-ink shadow-sm" : "border-line bg-bg/70"}`} aria-current={active ? "time" : undefined}><div className="text-xs font-semibold opacity-80">{entry.name}</div><div className="mt-0.5 text-sm font-bold tabular-nums">{formatPrayerTime(entry.at, prefs.timeZone, hour12)}</div></div>; })}</div>
        {next ? <p className="mt-3 flex flex-wrap items-baseline gap-x-2 text-sm"><strong className="text-accent">Next: {next.name}{nextInfo?.tomorrow ? " tomorrow" : ""}</strong><span className="text-muted">in {countdown}</span></p> : <p className="mt-3 text-sm text-muted">Prayer times are unavailable for the next prayer.</p>}
      </>}
  </section>;
}
