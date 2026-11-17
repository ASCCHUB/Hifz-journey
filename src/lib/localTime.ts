// Local date / time / Hijri date for the dashboard header — worldwide, no fixed country or offset.
//
// • Time zone: the device's IANA zone (Intl resolvedOptions), re-read on every tick, so travel or a zone change
//   is picked up without a reload. Daylight-saving is handled by Intl (tz database), never by fixed offsets.
// • Formatting: the device locale; 12/24-hour follows the locale unless the learner chose one.
// • Hijri: computed deterministically in-app (never by the device's Intl islamic calendar — Android WebView ships
//   trimmed ICU data and rendered Umm al-Qura 7/6/1448 as "June 7, 1448 BC"). Tabular calendars are arithmetic;
//   Umm al-Qura and astronomical use month tables generated from full ICU (lib/hijriTables.ts). Month names and the
//   AH era come from our own English/Arabic tables. An optional ±2 day adjustment is applied to the *local calendar
//   day* (computed in the zone), so the result never depends on UTC.
// • No location permission is needed for any of this.

import { ASTRONOMICAL_TABLE, HIJRI_TABLE_FIRST_YEAR, HIJRI_TABLE_LAST_YEAR, UMALQURA_TABLE } from "./hijriTables";

export type HijriCalendar = "islamic-umalqura" | "islamic-civil" | "islamic-tbla" | "islamic";
export const HIJRI_CALENDARS: { id: HijriCalendar; label: string }[] = [
  { id: "islamic-umalqura", label: "Umm al-Qura (Saudi Arabia)" },
  { id: "islamic-civil", label: "Tabular / civil (Friday epoch)" },
  { id: "islamic-tbla", label: "Tabular (Thursday epoch)" },
  { id: "islamic", label: "Astronomical (device's Islamic calendar)" },
];

export const deviceTimeZone = () => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"; } catch { return "UTC"; } };

/** Calendar day (y, m, d) of an instant in a time zone. */
export function localDay(now: Date, timeZone: string): { y: number; m: number; d: number } {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  return { y: get("year"), m: get("month"), d: get("day") };
}

export type HeaderTime = { date: string; time: string; zone: string; hijri: string; hijriSupported: boolean };

export function headerTime(now: Date, opts: { timeZone?: string; locale?: string; hour12?: boolean; hijriCalendar?: HijriCalendar; hijriOffset?: number } = {}): HeaderTime {
  const timeZone = opts.timeZone || deviceTimeZone();
  const locale = opts.locale;
  const date = new Intl.DateTimeFormat(locale, { timeZone, weekday: "long", day: "numeric", month: "long", year: "numeric" }).format(now);
  // 12/24-hour: locale default unless chosen; a chosen 24-hour clock uses 00–23 with two digits ("00:05").
  const hourOpts: Intl.DateTimeFormatOptions = opts.hour12 === undefined ? { hour: "numeric" } : opts.hour12 ? { hour: "numeric", hour12: true } : { hour: "2-digit", hourCycle: "h23" };
  const time = new Intl.DateTimeFormat(locale, { timeZone, minute: "2-digit", ...hourOpts }).format(now);
  const zoneName = new Intl.DateTimeFormat(locale, { timeZone, timeZoneName: "short" }).formatToParts(now).find((p) => p.type === "timeZoneName")?.value || timeZone;
  // Hijri: take the local calendar day, apply the adjustment, and format that day (noon UTC avoids any edge).
  const { y, m, d } = localDay(now, timeZone);
  const day = new Date(Date.UTC(y, m - 1, d + Math.max(-2, Math.min(2, opts.hijriOffset || 0)), 12));
  const h = toHijri(Math.round((day.getTime() - 43_200_000) / 86_400_000), opts.hijriCalendar || "islamic-umalqura");
  const hijriSupported = !!h;
  const hijri = h ? formatHijri(h, locale || deviceLocale()) : "Hijri date unavailable";
  return { date, time, zone: zoneName, hijri, hijriSupported };
}

/** Milliseconds until the next minute boundary (the clock ticks on minute changes, which includes midnight). */
export const msToNextMinute = (now = Date.now()) => 60_000 - (now % 60_000) + 50;

// ---------------------------------------------------------------------------------------------------------------
// Deterministic Hijri calendar.
export type HijriDate = { year: number; month: number; day: number; calendar: HijriCalendar };
export const HIJRI_MONTHS_EN = ["Muharram", "Safar", "Rabi al-Awwal", "Rabi al-Thani", "Jumada al-Ula", "Jumada al-Akhirah", "Rajab", "Sha'ban", "Ramadan", "Shawwal", "Dhu al-Qa'dah", "Dhu al-Hijjah"];
export const HIJRI_MONTHS_AR = ["محرم", "صفر", "ربيع الأول", "ربيع الآخر", "جمادى الأولى", "جمادى الآخرة", "رجب", "شعبان", "رمضان", "شوال", "ذو القعدة", "ذو الحجة"];
const deviceLocale = () => { try { return new Intl.DateTimeFormat().resolvedOptions().locale || "en"; } catch { return "en"; } };

/** Tabular Islamic calendar (30-year cycle, leap years 2,5,7,10,13,16,18,21,24,26,29). epoch = epoch day of 1/1/1 AH. */
function tabular(epochDay: number, epoch: number): { year: number; month: number; day: number } {
  const n = epochDay - epoch; // days since 1 Muharram 1 AH
  const daysBefore = (y: number) => 354 * (y - 1) + Math.floor((3 + 11 * y) / 30);
  let year = Math.floor((30 * n + 10646) / 10631);
  while (daysBefore(year + 1) <= n) year++;
  while (daysBefore(year) > n) year--;
  const dy = n - daysBefore(year);
  let month = Math.min(12, Math.ceil((dy + 1 - 29) / 29.5) + 1);
  while (month > 1 && Math.ceil(29.5 * (month - 1)) > dy) month--;
  return { year, month, day: dy - Math.ceil(29.5 * (month - 1)) + 1 };
}

function fromTable(epochDay: number, t: readonly number[]): { year: number; month: number; day: number } | null {
  const years = HIJRI_TABLE_LAST_YEAR - HIJRI_TABLE_FIRST_YEAR + 1;
  if (epochDay < t[0]) return null;
  let lo = 0, hi = years - 1;
  while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (t[mid * 2] <= epochDay) lo = mid; else hi = mid - 1; }
  let rest = epochDay - t[lo * 2]; const mask = t[lo * 2 + 1];
  for (let m = 0; m < 12; m++) {
    const len = mask & (1 << m) ? 30 : 29;
    if (rest < len) return { year: HIJRI_TABLE_FIRST_YEAR + lo, month: m + 1, day: rest + 1 };
    rest -= len;
  }
  return null; // past the last tabled year
}

/** Hijri date of a civil day given as days since 1970-01-01. null only outside the supported 1340–1520 AH tables. */
export function toHijri(epochDay: number, calendar: HijriCalendar = "islamic-umalqura"): HijriDate | null {
  const r = calendar === "islamic-civil" ? tabular(epochDay, -492148)
    : calendar === "islamic-tbla" ? tabular(epochDay, -492149)
    : fromTable(epochDay, calendar === "islamic" ? ASTRONOMICAL_TABLE : UMALQURA_TABLE);
  return r ? { ...r, calendar } : null;
}

const AR_DIGITS = "٠١٢٣٤٥٦٧٨٩";
/** "7 Jumada al-Akhirah 1448 AH" / "٧ جمادى الآخرة ١٤٤٨ هـ". Arabic for ar* locales, English otherwise. */
export function formatHijri(h: { year: number; month: number; day: number }, locale = "en"): string {
  if (/^ar(?:[-_]|$)/i.test(locale)) {
    const ar = (n: number) => String(n).replace(/\d/g, (c) => AR_DIGITS[Number(c)]);
    return `${ar(h.day)} ${HIJRI_MONTHS_AR[h.month - 1]} ${ar(h.year)} هـ`;
  }
  return `${h.day} ${HIJRI_MONTHS_EN[h.month - 1]} ${h.year} AH`;
}
