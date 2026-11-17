"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { readDashboardDisplayPrefs, writeDashboardDisplayPrefs, type DisplayPrefs } from "@/components/DashboardHeader";
import { HIJRI_CALENDARS, deviceTimeZone, headerTime, type HijriCalendar } from "@/lib/localTime";
import { PRAYER_CITIES, PRAYER_METHODS, readPrayerPrefs, validTimeZone, writePrayerPrefs, type PrayerMethod, type PrayerMadhab, type PrayerPrefs } from "@/lib/prayer";

const blank = (): PrayerPrefs => ({ cityId: "", cityName: "", latitude: 0, longitude: 0, timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC", method: "mwl", madhab: "shafi" });
export default function PrayerSettings() {
  const [prefs, setPrefs] = useState<PrayerPrefs>(blank);
  const [display, setDisplay] = useState<DisplayPrefs>({ hijriOffset: 0 });
  const [locating, setLocating] = useState(false);
  const [ready, setReady] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => { setPrefs(readPrayerPrefs() || blank()); setDisplay(readDashboardDisplayPrefs()); setReady(true); }, []);
  const selectCity = (id: string) => {
    if (id === "custom") { setPrefs((p) => ({ ...p, cityId: "custom", cityName: "", latitude: 0, longitude: 0 })); return; }
    const city = PRAYER_CITIES.find((x) => x.id === id);
    if (city) setPrefs((p) => ({ ...p, cityId: city.id, cityName: city.name, latitude: city.lat, longitude: city.lon, timeZone: city.timeZone }));
    else if (!id) setPrefs((p) => ({ ...p, cityId: "", cityName: "", latitude: 0, longitude: 0 }));
  };
  // Optional: the device location, only when the learner taps the button and grants permission.
  // The time zone is the device's own; nothing is assumed if permission is denied.
  const useLocation = () => {
    setError(""); setSaved(false);
    if (!("geolocation" in navigator)) { setError("Location is not available on this device. Choose a city instead."); return; }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => { setLocating(false); const lat = Math.round(pos.coords.latitude * 1e4) / 1e4, lon = Math.round(pos.coords.longitude * 1e4) / 1e4; setPrefs((p) => ({ ...p, cityId: "custom", cityName: "Current location", latitude: lat, longitude: lon, timeZone: deviceTimeZone() })); },
      (err) => { setLocating(false); setError(err.code === 1 ? "Location permission was not granted. Choose a city or enter a location instead." : "Your location could not be determined. Choose a city or enter a location instead."); },
      { enableHighAccuracy: false, timeout: 15000, maximumAge: 600000 },
    );
  };
  const update = <K extends keyof PrayerPrefs>(key: K, value: PrayerPrefs[K]) => setPrefs((p) => ({ ...p, [key]: value }));
  const savePrayer = () => {
    setError(""); setSaved(false);
    if (!prefs.cityName.trim()) { setError("Choose a city or enter a location name."); return; }
    if (!Number.isFinite(prefs.latitude) || Math.abs(prefs.latitude) > 90 || !Number.isFinite(prefs.longitude) || Math.abs(prefs.longitude) > 180) { setError("Enter valid coordinates (latitude −90 to 90, longitude −180 to 180)."); return; }
    if (!validTimeZone(prefs.timeZone)) { setError("Enter a valid IANA time zone, for example Asia/Riyadh."); return; }
    try { writePrayerPrefs({ ...prefs, cityName: prefs.cityName.trim() }); window.dispatchEvent(new Event("hifz-prayer-preferences")); setSaved(true); }
    catch { setError("Settings could not be saved on this device."); }
  };
  const saveDisplay = (value: DisplayPrefs) => { setDisplay(value); writeDashboardDisplayPrefs(value); };
  if (!ready) return <div className="card text-muted">Loading settings…</div>;
  return <div className="prayer-settings-page flex flex-col gap-4">
    <div className="flex flex-wrap items-center justify-between gap-3"><p className="max-w-2xl text-sm text-muted">Stored on this device, separately from Quran progress and account sync.</p><Link className="btn btn-sm" href="/profile">Back to Settings</Link></div>
    <section className="card flex flex-col gap-4" aria-labelledby="prayer-settings-title"><div><div className="label">Daily rhythm</div><h3 id="prayer-settings-title" className="mt-1 text-xl font-bold">Prayer times</h3><p className="mt-1 text-sm text-muted">Choose a city, or use your current location if you allow it. Times are calculated offline using the selected method, in the location&apos;s own time zone.</p></div>
      <button type="button" className="btn self-start" onClick={useLocation} disabled={locating}>{locating ? "Finding your location…" : "Use my current location"}</button>
      <label className="text-sm font-medium">City<select className="field mt-1" value={prefs.cityId} onChange={(e) => selectCity(e.target.value)}><option value="">Choose a city…</option>{PRAYER_CITIES.map((c) => <option key={c.id} value={c.id}>{c.name}, {c.country}</option>)}<option value="custom">Enter custom location</option></select></label>
      {prefs.cityId === "custom" && <div className="grid grid-cols-1 gap-3 sm:grid-cols-2"><label className="text-sm font-medium">Location name<input className="field mt-1" value={prefs.cityName} maxLength={80} onChange={(e) => update("cityName", e.target.value)} placeholder="City or town" /></label><label className="text-sm font-medium">Time zone (IANA name)<input className="field mt-1" value={prefs.timeZone} onChange={(e) => update("timeZone", e.target.value)} placeholder="Asia/Riyadh" /></label><label className="text-sm font-medium">Latitude<input className="field mt-1" type="number" min="-90" max="90" step="any" value={prefs.latitude || ""} onChange={(e) => update("latitude", Number(e.target.value))} /></label><label className="text-sm font-medium">Longitude<input className="field mt-1" type="number" min="-180" max="180" step="any" value={prefs.longitude || ""} onChange={(e) => update("longitude", Number(e.target.value))} /></label></div>}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2"><label className="text-sm font-medium">Calculation method<select className="field mt-1" value={prefs.method} onChange={(e) => update("method", e.target.value as PrayerMethod)}>{PRAYER_METHODS.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}</select></label><label className="text-sm font-medium">Asr convention<select className="field mt-1" value={prefs.madhab} onChange={(e) => update("madhab", e.target.value as PrayerMadhab)}><option value="shafi">Shafi, Maliki, Hanbali</option><option value="hanafi">Hanafi</option></select></label></div>
      {error && <p className="text-sm text-weak" role="alert">{error}</p>}{saved && <p className="text-sm text-strong" role="status">Prayer settings saved on this device.</p>}
      <button className="btn-primary self-start" onClick={savePrayer}>Save prayer settings</button>
      <details className="rounded-xl border border-line p-3"><summary className="cursor-pointer font-semibold">About the calculation</summary><p className="mt-2 text-sm text-muted">Calculated by Adhan.js 4.4.3 (MIT), using astronomical algorithms based on Jean Meeus&apos; Astronomical Algorithms. Methods publish their own Fajr/Isha angles or intervals; daylight-saving display uses your selected location&apos;s IANA timezone. These are calculated times, not a substitute for a local mosque timetable. Location is used only when you tap “Use my current location” and allow it; it stays on this device. No prayer notifications are enabled.</p></details>
    </section>
    <section id="date-time" className="card flex flex-col gap-3" aria-labelledby="date-settings-title"><div><div className="label">Dashboard display</div><h3 id="date-settings-title" className="mt-1 text-xl font-bold">Date &amp; time</h3><p className="mt-1 text-sm text-muted">The date and live clock follow this device&apos;s time zone ({deviceTimeZone()}) and regional format automatically, including daylight-saving changes. No location is needed.</p></div>
      <label className="text-sm font-medium">Clock format<select className="field mt-1 max-w-md" value={display.hour12 === undefined ? "auto" : display.hour12 ? "12" : "24"} onChange={(e) => saveDisplay({ ...display, hour12: e.target.value === "auto" ? undefined : e.target.value === "12" })}><option value="auto">Follow this device</option><option value="12">12-hour</option><option value="24">24-hour</option></select></label>
      <label className="text-sm font-medium">Hijri calendar<select className="field mt-1 max-w-md" value={display.hijriCalendar || "islamic-umalqura"} onChange={(e) => saveDisplay({ ...display, hijriCalendar: e.target.value as HijriCalendar })}>{HIJRI_CALENDARS.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}</select></label>
      <label className="text-sm font-medium">Hijri date adjustment<select className="field mt-1 max-w-md" value={display.hijriOffset} onChange={(e) => saveDisplay({ ...display, hijriOffset: Number(e.target.value) })}>{[-2, -1, 0, 1, 2].map((d) => <option key={d} value={d}>{d === 0 ? "No adjustment" : `${d > 0 ? "+" : ""}${d} day${Math.abs(d) === 1 ? "" : "s"}`}</option>)}</select></label>
      <p className="text-sm">Today here: {(() => { const t = headerTime(new Date(), display); return `${t.date} · ${t.hijri}`; })()}</p>
      <p className="text-xs text-muted">Calculated calendars can differ by a day from local moon-sighting. Choose the adjustment that matches your community.</p>
    </section>
  </div>;
}
