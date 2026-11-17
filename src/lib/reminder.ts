// Hifz & revision reminders. The Android app (ReminderReceiver + MainActivity's AndroidReminder bridge) shows
// the notifications natively, so they work while the app is closed; this module keeps the native side informed
// and records check-in answers.
//
// Progress rule: a check-in answer is a self-report. It is stored in state.checkins only. It never changes
// per-Ayah evidence (mem), SRS intervals, weak lists or daily-plan task status. "verifiedInApp" is true only when
// the planner already shows the activity complete from saved lesson/revision records.
import { buildPlan, type Plan, type PlanTask } from "./planner";
import { today, type AppState, type Checkin, type ReminderPrefs } from "./store";

export type Kind = "hifz" | "rev";
type Bridge = {
  setup?(json: string): void; status?(day: number, kind: string, state: string, summary: string): void;
  answer?(kind: string, answer: string): void; responses?(): string; testKind?(kind: string, followUp: boolean): void;
  configure(enabled: boolean, hour: number, minute: number): void; report(day: number, done: boolean, summary: string): void;
  permitted(): boolean; test(): void;
};
export const reminderBridge = (): Bridge | null =>
  typeof window === "undefined" ? null : ((window as unknown as { AndroidReminder?: Bridge }).AndroidReminder ?? null);

export const DEFAULT_HIFZ_TIME = "20:00";
export const DEFAULT_REV_TIME = "06:00";
export const FOLLOW_UP_OPTIONS = [30, 60, 90, 120, 180];
// Kept for older imports.
export const DEFAULT_REMINDER_TIME = DEFAULT_HIFZ_TIME;

export const parseTime = (t: string | undefined, fallback = DEFAULT_HIFZ_TIME) => {
  const m = /^(\d{1,2}):(\d{2})$/.exec(t || fallback) || /^(\d{1,2}):(\d{2})$/.exec(fallback)!;
  return { hour: Math.min(23, +m[1]), minute: Math.min(59, +m[2]) };
};
const minutes = (t: string | undefined, fallback: string) => { const p = parseTime(t, fallback); return p.hour * 60 + p.minute; };

/** Effective preferences; older saves (single daily reminder) map onto the Hifz reminder. */
export function reminderPrefs(st: Pick<AppState, "settings">): ReminderPrefs {
  const s = st.settings;
  return s.reminders ?? {
    on: !!s.reminderOn, hifzOn: true, hifzTime: s.reminderTime || DEFAULT_HIFZ_TIME, revOn: true, revTime: DEFAULT_REV_TIME,
    days: [0, 1, 2, 3, 4, 5, 6], followUpMin: 60, maxFollowUps: 2, sound: "default",
  };
}

export const REV_KINDS: PlanTask["kind"][] = ["recent", "weak", "due", "rotation", "assess"];
export const tasksOf = (plan: Plan, kind: Kind) => plan.tasks.filter((t) => kind === "hifz" ? t.kind === "new" : REV_KINDS.includes(t.kind));

/** Today's state of one activity, from the existing daily planner (real tasks only, nothing invented). */
export function activityStatus(st: AppState, kind: Kind, plan: Plan = buildPlan(st)): { state: "none" | "todo" | "done"; summary: string; href?: string } {
  const tasks = tasksOf(plan, kind);
  const todo = tasks.filter((t) => t.status === "todo");
  if (!tasks.length) return { state: "none", summary: "" };
  if (!todo.length) return { state: "done", summary: "" };
  if (kind === "hifz") {
    const t = todo[0];
    return { state: "todo", summary: `Today's lesson: page ${t.page}${todo.length > 1 ? ` and ${todo.length - 1} more` : ""}. Tap to start.`, href: t.href };
  }
  const pages = todo.length, ayahs = todo.reduce((n, t) => n + t.ayahs.length, 0);
  return { state: "todo", summary: `${pages} page${pages === 1 ? "" : "s"} to revise (${ayahs} ayahs). Tap to start.`, href: todo[0].href };
}

/** Combined status (kept for older screens). */
export function todayStatus(st: AppState): { done: boolean; summary: string } {
  const plan = buildPlan(st);
  const h = activityStatus(st, "hifz", plan), r = activityStatus(st, "rev", plan);
  const parts = [h.state === "todo" ? "new lesson" : "", r.state === "todo" ? "revision" : ""].filter(Boolean);
  return { done: plan.tasks.length > 0 && h.state !== "todo" && r.state !== "todo", summary: parts.length ? `Today: ${parts.join(" and ")} still to do.` : "Nothing left in today's plan." };
}

const dayMask = (days: number[]) => days.reduce((m, d) => (d >= 0 && d <= 6 ? m | (1 << d) : m), 0);

/** Send preferences and today's status to the Android app. No-op in a browser. */
export function pushReminder(st: AppState) {
  const b = reminderBridge(); if (!b) return;
  const p = reminderPrefs(st);
  try {
    if (b.setup) {
      b.setup(JSON.stringify({
        on: p.on, hifzOn: p.hifzOn, hifzMin: minutes(p.hifzTime, DEFAULT_HIFZ_TIME), revOn: p.revOn, revMin: minutes(p.revTime, DEFAULT_REV_TIME),
        days: dayMask(p.days), followUp: p.followUpMin, maxFollow: p.maxFollowUps,
        quietStart: p.quietStart && p.quietEnd ? minutes(p.quietStart, "22:00") : -1, quietEnd: p.quietStart && p.quietEnd ? minutes(p.quietEnd, "06:00") : -1,
        sound: p.sound,
      }));
      const plan = buildPlan(st);
      (["hifz", "rev"] as Kind[]).forEach((k) => { const s = activityStatus(st, k, plan); b.status?.(today(), k, s.state, s.summary); });
    } else {
      const { hour, minute } = parseTime(p.hifzTime);
      b.configure(p.on, hour, minute);
      const s = todayStatus(st); b.report(today(), s.done, s.summary);
    }
  } catch { /* older app build without the bridge methods */ }
}

/** Record a check-in answer (from a notification button or the in-app check-in). Self-report only. */
export function recordCheckin(d: AppState, kind: Kind, answer: Checkin["answer"], source: Checkin["source"], day = today(), at = Date.now()) {
  const verifiedInApp = day === today() && activityStatus(d, kind).state === "done";
  d.checkins = d.checkins || {};
  d.checkins[`${day}:${kind}`] = { kind, day, answer, verifiedInApp, source, at };
  // keep the last ~60 days only
  const keys = Object.keys(d.checkins).sort((x, y) => +y.split(":")[0] - +x.split(":")[0]);
  keys.slice(120).forEach((k) => { delete d.checkins![k]; });
}

/** Notification-button answers queued natively while the app was closed. */
export function takeNativeResponses(): { kind: Kind; answer: "yes" | "later" | "skip"; day: number; at: number }[] {
  const b = reminderBridge();
  try {
    const raw = JSON.parse(b?.responses?.() || "[]");
    return Array.isArray(raw) ? raw.filter((r) => (r.kind === "hifz" || r.kind === "rev") && ["yes", "later", "skip"].includes(r.answer) && Number.isInteger(r.day)) : [];
  } catch { return []; }
}

export const checkinFor = (st: AppState, kind: Kind, day = today()) => st.checkins?.[`${day}:${kind}`] ?? null;
