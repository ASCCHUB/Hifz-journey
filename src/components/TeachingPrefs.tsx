"use client";
// Teaching preferences — one place to review how the tutor teaches. Each value has a single stored copy:
// mode/level/portion/repeat in `tutor`, the reciter in settings.reciter, daily goals via setDailyPrefs().
import { RECITERS } from "@/components/Audio";
import { dailyPrefs, setDailyPrefs } from "@/lib/prefs";
import { defaultTutor, update, useStore, type TutorPrefs } from "@/lib/store";

export default function TeachingPrefs() {
  const st = useStore(); const t = st.tutor || defaultTutor(); const p = dailyPrefs(st);
  const set = (patch: Partial<TutorPrefs>) => update((d) => { d.tutor = { ...(d.tutor || defaultTutor()), ...patch, updatedAt: Date.now() }; });
  const primary = st.studentJourney?.paths.find((x) => x.id === st.studentJourney?.primaryPathId && !x.deletedAt);
  const claims = (st.studentJourney?.claims || []).filter((c) => !c.deletedAt).length;
  return <details className="card" id="teaching-prefs">
    <summary className="cursor-pointer text-lg font-bold">Teaching preferences</summary>
    <div className="mt-3 grid gap-3 sm:grid-cols-2">
      <label className="text-sm">Lesson style<select className="field mt-1" value={t.mode} onChange={(e) => set({ mode: e.target.value as TutorPrefs["mode"] })}><option value="guided">Guided — the tutor leads each step</option><option value="manual">Manual — I choose what to repeat and test</option></select></label>
      <label className="text-sm">Difficulty<select className="field mt-1" value={t.level} onChange={(e) => set({ level: e.target.value as TutorPrefs["level"] })}><option value="guided">Guided — gradual hiding and hints</option><option value="standard">Standard — less prompting</option><option value="challenge">Challenge — no hints, bigger blocks</option></select></label>
      <label className="text-sm">Portion for a new lesson<select className="field mt-1" value={t.portion} onChange={(e) => set({ portion: e.target.value as TutorPrefs["portion"] })}><option value="page">A full page (15 lines)</option><option value="half_page">Half a page</option></select></label>
      <label className="text-sm">Listen repeats per step<select className="field mt-1" value={t.repeat} onChange={(e) => set({ repeat: +e.target.value })}>{[1, 3, 5, 7, 10].map((n) => <option key={n} value={n}>{n}×</option>)}</select></label>
      <label className="text-sm">Reciter<select className="field mt-1" value={st.settings.reciter} onChange={(e) => update((d) => { d.settings.reciter = e.target.value; })}>{Object.entries(RECITERS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
      <label className="text-sm">Study time per day<select className="field mt-1" value={p.studyMinutes} onChange={(e) => update((d) => setDailyPrefs(d, { studyMinutes: +e.target.value }))}>{[...new Set([10, 15, 20, 30, 45, 60, 90, p.studyMinutes])].sort((a, b) => a - b).map((m) => <option key={m} value={m}>{m} minutes</option>)}</select></label>
    </div>
    <p className="mt-3 text-sm text-muted">Path: <b className="text-ink">{primary ? primary.name : "none yet"}</b> · Previously memorized portions: <b className="text-ink">{claims}</b> · New per day: <b className="text-ink">{p.newAmount} {p.newUnit.replace("_", " ")}</b> · Revision per day: <b className="text-ink">{p.revisionAmount} {p.revisionUnit}</b>. Change these under “My Hifz Journey → Edit journey”.</p>
    <p className="mt-1 text-xs text-muted">Changing preferences never changes your memorization records.</p>
  </details>;
}
