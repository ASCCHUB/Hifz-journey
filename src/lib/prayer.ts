import { CalculationMethod, Coordinates, Madhab, PrayerTimes } from "adhan";

export type PrayerMethod = "mwl" | "egyptian" | "karachi" | "ummalqura" | "dubai" | "qatar" | "kuwait" | "moonsighting" | "singapore" | "turkey" | "isna";
export type PrayerMadhab = "shafi" | "hanafi";
export type PrayerCity = { id: string; name: string; country: string; lat: number; lon: number; timeZone: string };
export type PrayerPrefs = { cityId: string; cityName: string; latitude: number; longitude: number; timeZone: string; method: PrayerMethod; madhab: PrayerMadhab };

// A deliberately explicit, manually chosen city list. No device location is read without consent.
export const PRAYER_CITIES: PrayerCity[] = [
  { id: "riyadh", name: "Riyadh", country: "Saudi Arabia", lat: 24.7136, lon: 46.6753, timeZone: "Asia/Riyadh" },
  { id: "makkah", name: "Makkah", country: "Saudi Arabia", lat: 21.3891, lon: 39.8579, timeZone: "Asia/Riyadh" },
  { id: "madinah", name: "Madinah", country: "Saudi Arabia", lat: 24.5247, lon: 39.5692, timeZone: "Asia/Riyadh" },
  { id: "jeddah", name: "Jeddah", country: "Saudi Arabia", lat: 21.4858, lon: 39.1925, timeZone: "Asia/Riyadh" },
  { id: "karachi", name: "Karachi", country: "Pakistan", lat: 24.8607, lon: 67.0011, timeZone: "Asia/Karachi" },
  { id: "lahore", name: "Lahore", country: "Pakistan", lat: 31.5204, lon: 74.3587, timeZone: "Asia/Karachi" },
  { id: "dhaka", name: "Dhaka", country: "Bangladesh", lat: 23.8103, lon: 90.4125, timeZone: "Asia/Dhaka" },
  { id: "istanbul", name: "Istanbul", country: "Türkiye", lat: 41.0082, lon: 28.9784, timeZone: "Europe/Istanbul" },
  { id: "cairo", name: "Cairo", country: "Egypt", lat: 30.0444, lon: 31.2357, timeZone: "Africa/Cairo" },
  { id: "london", name: "London", country: "United Kingdom", lat: 51.5072, lon: -0.1276, timeZone: "Europe/London" },
  { id: "new-york", name: "New York", country: "United States", lat: 40.7128, lon: -74.006, timeZone: "America/New_York" },
  { id: "toronto", name: "Toronto", country: "Canada", lat: 43.6532, lon: -79.3832, timeZone: "America/Toronto" },
  { id: "kuala-lumpur", name: "Kuala Lumpur", country: "Malaysia", lat: 3.139, lon: 101.6869, timeZone: "Asia/Kuala_Lumpur" },
  { id: "jakarta", name: "Jakarta", country: "Indonesia", lat: -6.2088, lon: 106.8456, timeZone: "Asia/Jakarta" },
  { id: "singapore", name: "Singapore", country: "Singapore", lat: 1.3521, lon: 103.8198, timeZone: "Asia/Singapore" },
  { id: "paris", name: "Paris", country: "France", lat: 48.8566, lon: 2.3522, timeZone: "Europe/Paris" },
  { id: "chicago", name: "Chicago", country: "United States", lat: 41.8781, lon: -87.6298, timeZone: "America/Chicago" },
  { id: "los-angeles", name: "Los Angeles", country: "United States", lat: 34.0522, lon: -118.2437, timeZone: "America/Los_Angeles" },
];

export const PRAYER_METHODS: { id: PrayerMethod; label: string; method: () => ReturnType<typeof CalculationMethod.MuslimWorldLeague> }[] = [
  { id: "mwl", label: "Muslim World League", method: CalculationMethod.MuslimWorldLeague },
  { id: "egyptian", label: "Egyptian General Authority", method: CalculationMethod.Egyptian },
  { id: "karachi", label: "University of Islamic Sciences, Karachi", method: CalculationMethod.Karachi },
  { id: "ummalqura", label: "Umm al-Qura, Makkah", method: CalculationMethod.UmmAlQura },
  { id: "dubai", label: "Dubai", method: CalculationMethod.Dubai },
  { id: "qatar", label: "Qatar", method: CalculationMethod.Qatar },
  { id: "kuwait", label: "Kuwait", method: CalculationMethod.Kuwait },
  { id: "moonsighting", label: "Moonsighting Committee", method: CalculationMethod.MoonsightingCommittee },
  { id: "singapore", label: "Singapore", method: CalculationMethod.Singapore },
  { id: "turkey", label: "Türkiye (Diyanet approximation)", method: CalculationMethod.Turkey },
  { id: "isna", label: "ISNA / North America", method: CalculationMethod.NorthAmerica },
];

export const PRAYER_PREFS_KEY = "hifz-journey-prayer-preferences-v1";
export function readPrayerPrefs(): PrayerPrefs | null {
  try {
    const raw = localStorage.getItem(PRAYER_PREFS_KEY);
    if (!raw) return null;
    const p = JSON.parse(raw) as PrayerPrefs;
    if (typeof p.cityName !== "string" || !Number.isFinite(p.latitude) || !Number.isFinite(p.longitude) || !validTimeZone(p.timeZone) || !PRAYER_METHODS.some((m) => m.id === p.method) || !["shafi", "hanafi"].includes(p.madhab)) return null;
    return p;
  } catch { return null; }
}
export function writePrayerPrefs(value: PrayerPrefs) { localStorage.setItem(PRAYER_PREFS_KEY, JSON.stringify(value)); }
export function validTimeZone(zone: string) { try { new Intl.DateTimeFormat("en", { timeZone: zone }); return true; } catch { return false; } }

export type PrayerName = "Fajr" | "Dhuhr" | "Asr" | "Maghrib" | "Isha";
export type PrayerTimeEntry = { name: PrayerName; at: Date };
function localDateInZone(now: Date, timeZone: string, offsetDays = 0): Date {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now);
  const get = (type: string) => Number(parts.find((x) => x.type === type)?.value);
  return new Date(get("year"), get("month") - 1, get("day") + offsetDays);
}
export function calculatePrayerTimesOnDate(prefs: PrayerPrefs, date: Date): PrayerTimeEntry[] | null {
  const selected = PRAYER_METHODS.find((m) => m.id === prefs.method);
  if (!selected || !validTimeZone(prefs.timeZone) || !Number.isFinite(prefs.latitude) || !Number.isFinite(prefs.longitude) || Math.abs(prefs.latitude) > 90 || Math.abs(prefs.longitude) > 180) return null;
  const params = selected.method();
  params.madhab = prefs.madhab === "hanafi" ? Madhab.Hanafi : Madhab.Shafi;
  const times = new PrayerTimes(new Coordinates(prefs.latitude, prefs.longitude), date, params);
  const values = [ ["Fajr", times.fajr], ["Dhuhr", times.dhuhr], ["Asr", times.asr], ["Maghrib", times.maghrib], ["Isha", times.isha] ] as [PrayerName, Date][];
  if (!values.every(([, at]) => Number.isFinite(at.getTime()))) return null;
  return values.map(([name, at]) => ({ name, at }));
}
export function calculatePrayerTimes(prefs: PrayerPrefs, now = new Date()): PrayerTimeEntry[] | null {
  return calculatePrayerTimesOnDate(prefs, localDateInZone(now, prefs.timeZone));
}
export function calculateTomorrowPrayerTimes(prefs: PrayerPrefs, now = new Date()): PrayerTimeEntry[] | null {
  return calculatePrayerTimesOnDate(prefs, localDateInZone(now, prefs.timeZone, 1));
}
export function nextPrayerTime(entries: PrayerTimeEntry[], now = Date.now()) {
  return entries.find((entry) => entry.at.getTime() > now) ?? null;
}
export function formatPrayerTime(date: Date, timeZone: string, hour12: boolean) {
  return new Intl.DateTimeFormat(undefined, { timeZone, hour: "numeric", minute: "2-digit", hour12 }).format(date);
}
export function prayerDateKey(now: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now);
  return parts.filter((p) => ["year", "month", "day"].includes(p.type)).map((p) => p.value).join("-");
}
