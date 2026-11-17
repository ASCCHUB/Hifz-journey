"use client";
// Dashboard welcome header: title, greeting, local Gregorian date, live clock and Hijri date.
// Everything follows the device's own time zone and locale (see lib/localTime.ts); settings live in
// More → Settings → Prayer Times & Calendar, not here.
import { useEffect, useState } from "react";
import { useStore } from "@/lib/store";
import { headerTime, msToNextMinute, type HijriCalendar } from "@/lib/localTime";

/** hour12 undefined = follow the device locale. */
export type DisplayPrefs = { hour12?: boolean; hijriOffset: number; hijriCalendar?: HijriCalendar };
const KEY = "hifz-journey-display-preferences-v1";
const CALS: HijriCalendar[] = ["islamic-umalqura", "islamic-civil", "islamic-tbla", "islamic"];
export function readDashboardDisplayPrefs(): DisplayPrefs {
  try {
    const p = JSON.parse(localStorage.getItem(KEY) || "null") as Partial<DisplayPrefs> | null;
    return { hour12: typeof p?.hour12 === "boolean" ? p.hour12 : undefined, hijriOffset: Math.max(-2, Math.min(2, Number(p?.hijriOffset) || 0)), hijriCalendar: CALS.includes(p?.hijriCalendar as HijriCalendar) ? p!.hijriCalendar : undefined };
  } catch { return { hijriOffset: 0 }; }
}
export function writeDashboardDisplayPrefs(prefs: DisplayPrefs) { try { localStorage.setItem(KEY, JSON.stringify(prefs)); window.dispatchEvent(new Event("hifz-dashboard-preferences")); } catch { /* private browsing can disable local storage */ } }

export default function DashboardHeader() {
  const st = useStore();
  const [now, setNow] = useState<Date | null>(null);
  const [prefs, setPrefs] = useState<DisplayPrefs>({ hijriOffset: 0 });
  useEffect(() => {
    const tick = () => setNow(new Date());
    tick();
    // Tick on every minute boundary (this also rolls the date over at local midnight), and immediately when the
    // app returns to the foreground, since timers are paused while the phone sleeps.
    let id = 0;
    const align = () => { tick(); id = window.setTimeout(align, msToNextMinute()); };
    id = window.setTimeout(align, msToNextMinute());
    const wake = () => { if (document.visibilityState === "visible") tick(); };
    const onPrefs = () => setPrefs(readDashboardDisplayPrefs());
    onPrefs();
    window.addEventListener("hifz-dashboard-preferences", onPrefs);
    document.addEventListener("visibilitychange", wake); window.addEventListener("focus", wake);
    return () => { clearTimeout(id); window.removeEventListener("hifz-dashboard-preferences", onPrefs); document.removeEventListener("visibilitychange", wake); window.removeEventListener("focus", wake); };
  }, []);
  const displayName = st.studentJourney?.learner.displayName.trim();
  const t = now ? headerTime(now, { hour12: prefs.hour12, hijriCalendar: prefs.hijriCalendar, hijriOffset: prefs.hijriOffset }) : null;

  return <header className="dashboard-hero relative isolate overflow-hidden rounded-[1.4rem] px-4 py-3.5 text-white shadow-lg sm:px-6 sm:py-5" aria-label="Hifz Journey welcome">
    <div className="dashboard-geometry pointer-events-none absolute inset-0 -z-0" aria-hidden="true" />
    <div className="relative z-10 min-w-0">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3">
        <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">Hifz Journey</h2>
        <time className="text-lg font-semibold tabular-nums text-white sm:text-xl" dateTime={now?.toISOString()} aria-label={t ? `Local time ${t.time} ${t.zone}` : undefined}>{t ? t.time : ""}<span className="ms-1 text-xs font-medium text-white/70">{t?.zone}</span></time>
      </div>
      <p className="text-base font-medium text-emerald-50">Assalamu Alaikum{displayName ? `, ${displayName}` : ""}</p>
      <p className="dashboard-meta mt-1.5 text-sm text-white/90"><span>{t?.date || " "}</span><span>{t?.hijri}{prefs.hijriOffset ? ` (${prefs.hijriOffset > 0 ? "+" : ""}${prefs.hijriOffset})` : ""}</span></p>
    </div>
    <div className="dashboard-mihrab pointer-events-none absolute -bottom-32 right-[8%] -z-0 h-56 w-40 rounded-t-[90px] border border-[#f0d58f]/40 opacity-30 sm:right-[20%]" aria-hidden="true" />
  </header>;
}
