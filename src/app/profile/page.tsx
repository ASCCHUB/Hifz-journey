"use client";
// Profile: account and sync, settings, goals, analytics, bookmarks, backup.
import BuildInfo from "@/components/BuildInfo";
import DownloadedAudioSettings from "@/components/DownloadedAudioSettings";
import ReminderSettings from "@/components/ReminderSettings";
import SettingsGroup from "@/components/SettingsGroup";
import Link from "next/link";
import { useEffect, useState } from "react";
import { RECITERS } from "@/components/Audio";
import { Bar, Sheet, useUser } from "@/components/Shell";
import { GOAL_VERB, goalProgress, goalScope } from "@/lib/goals";
import { pageOf, parseKey, Q, ref, SETS, text, type SetName } from "@/lib/quran";
import { guestProgress, listSnapshots, mergeGuestProgressDurable, resetProgress, restoreBackup, restoreSnapshot, today, update, useStore, type AppState, type Goal, type Snapshot } from "@/lib/store";
import { getSyncDetail, getSyncStatus, onSyncStatus, supabase, supabaseConfigured, type SyncStatus } from "@/lib/supabase";

const cut = (t: string, n: number) => { const w = t.split(" "); return w.length > n ? w.slice(0, n).join(" ") + " …" : t; };

function GoalForm({ onClose }: { onClose: () => void }) {
  const [type, setType] = useState<Goal["type"]>("revise"); const [k, setK] = useState<Goal["k"]>("juz"); const [v, setV] = useState(30); const [days, setDays] = useState(30);
  return (
    <Sheet title="New goal" onClose={onClose}>
      <label className="label" htmlFor="gt">I want to</label>
      <select id="gt" className="field" value={type} onChange={(e) => setType(e.target.value as Goal["type"])}><option value="revise">Revise what I have memorized</option><option value="memorize">Memorize something new</option><option value="read">Read in the mushaf</option></select>
      <label className="label" htmlFor="gk">Which part</label>
      <div className="grid grid-cols-2 gap-2">
        <select id="gk" className="field" value={k} onChange={(e) => { setK(e.target.value as Goal["k"]); setV(1); }}><option value="juz">A juz</option><option value="surah">A surah</option><option value="all">The whole Quran</option></select>
        {k !== "all" && <select className="field" aria-label="Which one" value={v} onChange={(e) => setV(+e.target.value)}>{k === "juz" ? Q().juz.map((_, i) => <option key={i} value={i + 1}>Juz {i + 1}</option>) : Q().n.map((n, i) => <option key={i} value={i + 1}>{i + 1}. {n[1]}</option>)}</select>}
      </div>
      <label className="label" htmlFor="gd">Finish within</label>
      <select id="gd" className="field" value={days} onChange={(e) => setDays(+e.target.value)}>{[[7, "1 week"], [14, "2 weeks"], [30, "1 month"], [60, "2 months"], [90, "3 months"], [180, "6 months"], [365, "1 year"]].map(([d, l]) => <option key={d} value={d}>{l}</option>)}</select>
      <button className="btn-primary" onClick={() => { update((d) => { d.goals.push({ id: Math.random().toString(36).slice(2), type, k, v: k === "all" ? 0 : v, c: today(), due: today() + days }); }); onClose(); }}>Add goal</button>
    </Sheet>
  );
}



export default function ProfilePage() {
  const st = useStore(); const user = useUser();
  const [sync, setSync] = useState<SyncStatus>("guest");
  const [guestAvailable, setGuestAvailable] = useState(false);
  const [merged, setMerged] = useState(false);
  const [goalForm, setGoalForm] = useState(false);
  const [backup, setBackup] = useState<"" | "export" | "import">(""); const [imp, setImp] = useState(""); const [impErr, setImpErr] = useState("");
  useEffect(() => { setSync(getSyncStatus()); return onSyncStatus(setSync); }, []);
  const [snaps, setSnaps] = useState<Snapshot[]>([]); useEffect(() => { let live = true; void listSnapshots().then((s) => { if (live) setSnaps(s); }); return () => { live = false; }; }, [st.t]);
  useEffect(() => { setGuestAvailable(!!guestProgress()?.t || !!Object.keys(guestProgress()?.mem || {}).length); }, [user]);

  const bms = Object.keys(st.bookmarks).sort((a, b) => { const [x, y] = parseKey(a), [u, v] = parseKey(b); return x - u || y - v; });
  const syncText: Record<SyncStatus, string> = { guest: "Not signed in", syncing: "Syncing…", synced: "Synced to your account", error: "Sync failed. Your progress is still saved on this device.", offline: "Offline. Changes are saved on this device and will sync when you are online." };

  return (
    <div className="flex flex-col gap-3">
      <section className="card flex flex-col gap-2">
        <div className="label">Account</div>
        {!supabaseConfigured ? <p className="text-sm text-muted">Accounts are not set up on this copy of the app, so progress is kept on this device only. Add the Supabase keys to turn on sign-in and sync.</p>
          : user ? <>
            <div className="font-semibold">{user.email}</div><div className="text-sm text-muted">{syncText[sync]}</div>{getSyncDetail() && <div role="status" className={`text-sm ${sync === "error" ? "text-weak" : "text-muted"}`}>{getSyncDetail()}</div>}
            {guestAvailable && <div className="rounded-xl border border-gold/50 p-3 text-sm"><b>Guest progress is available on this device.</b><p className="my-1 text-muted">It stays separate until you choose to merge it into this account. The guest copy remains as a backup.</p><button className="btn btn-sm" disabled={merged} onClick={() => { if (window.confirm("Merge this device's guest progress into the signed-in account? Existing account progress is preserved, and the guest backup remains.")) void mergeGuestProgressDurable().then(setMerged); }}>{merged ? "Guest progress merged" : "Merge guest progress"}</button></div>}
            <button className="btn btn-sm self-start" onClick={() => supabase()?.auth.signOut()}>Sign out</button>
          </> : <>
            <p className="text-sm text-muted">Sign in to keep your progress safe and use it on all your devices. Until then it is saved on this device only.</p>
            <Link href="/login" className="btn-primary self-start">Sign in or create an account</Link>
          </>}
      </section>

      <SettingsGroup title="My Hifz Goal" summary="Learning path, previous memorization, daily workload, reading goals">
        <Link href="/journey-settings" className="btn-primary self-start">Edit my Hifz goal</Link>
        <Link href="/progress" className="text-sm underline self-start">See progress details</Link>
      <div className="flex items-center justify-between" id="goals"><h3 className="font-semibold">Reading &amp; revision goals</h3><button className="btn btn-sm" onClick={() => setGoalForm(true)}>Add a goal</button></div>
      {st.goals.length ? (
        <section className="card flex flex-col gap-4">
          {st.goals.map((g) => { const r = goalProgress(st, g); return (
            <div key={g.id}>
              <div className="flex justify-between gap-2"><span className="font-semibold">{GOAL_VERB[g.type]} {goalScope(g)}</span><span className="pill">{r.left <= 0 ? "Completed" : r.late ? "Past deadline" : `${r.pace} ${r.unit} a day`}</span></div>
              <div className="my-1.5"><Bar value={r.total ? (r.done / r.total) * 100 : 0} /></div>
              <div className="flex justify-between text-sm text-muted"><span>{r.done} of {r.total} {r.unit}{r.left > 0 && !r.late ? ` · ${r.daysLeft} days left` : ""}</span><button className="underline" onClick={() => update((d) => { d.goals = d.goals.filter((x) => x.id !== g.id); })}>Remove</button></div>
            </div>
          ); })}
        </section>
      ) : <div className="card text-sm text-muted">No goals yet. Try "Revise Juz 30 in two weeks" or "Read the whole Quran in a month". The app works out the daily pace.</div>}

      {goalForm && <GoalForm onClose={() => setGoalForm(false)} />}
      </SettingsGroup>

      <SettingsGroup title="Teaching Preferences" summary="Guided or manual, level, portion size, Ayah or Mushaf view">
        <Link href="/journey-settings#teaching" className="btn self-start">Open teaching preferences</Link>
      </SettingsGroup>

      <SettingsGroup id="reminders" title="Reminders" summary="Hifz and revision notifications (Android app)">
        <ReminderSettings />
      </SettingsGroup>

      <Link href="/prayer-settings" className="card flex min-h-[56px] items-center justify-between gap-3 text-ink no-underline hover:border-accent">
        <span><span className="block font-semibold">Prayer Times &amp; Calendar</span><span className="block text-sm text-muted">Prayer location and method, clock format, Hijri calendar</span></span>
        <span aria-hidden="true" className="text-xl text-muted">›</span>
      </Link>

      <SettingsGroup title="Appearance" summary="Theme, translation, reciter, daily reading">
      <div className="flex flex-col gap-3">
        <label className="text-sm text-muted">Appearance
          <select className="field mt-1" value={st.settings.theme} onChange={(e) => update((d) => { d.settings.theme = e.target.value as AppState["settings"]["theme"]; })}><option value="auto">Match my device</option><option value="light">Light</option><option value="dark">Dark</option></select>
        </label>
        <label className="text-sm text-muted">Translation
          <select className="field mt-1" value={st.settings.tr} onChange={(e) => update((d) => { d.settings.tr = e.target.value as SetName; })}>{(["tr-ur-maududi", "tr-ur-jalandhry", "tr-en-sahih"] as SetName[]).map((n) => <option key={n} value={n}>{SETS[n].label}</option>)}</select>
        </label>
        <label className="text-sm text-muted">Reciter
          <select className="field mt-1" value={st.settings.reciter} onChange={(e) => update((d) => { d.settings.reciter = e.target.value; })}>{Object.entries(RECITERS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
        </label>
        <label className="text-sm text-muted">Mushaf pages to read each day
          <input type="number" min={1} max={40} className="field mt-1" value={st.settings.pagesTarget} onChange={(e) => update((d) => { d.settings.pagesTarget = Math.min(40, Math.max(1, +e.target.value || 1)); })} />
        </label>
      </div>
      </SettingsGroup>

      <SettingsGroup id="downloaded-audio" title="Downloaded Audio" summary="Offline Ayah audio: storage used, limit, clear">
        <DownloadedAudioSettings />
      </SettingsGroup>

      <SettingsGroup title="Bookmarks" summary={`${bms.length} saved Ayah${bms.length === 1 ? "" : "s"}`}>
      {bms.length ? (
        <section className="card flex flex-col divide-y divide-line !py-1">
          {bms.map((k) => { const [s, a] = parseKey(k); return (
            <Link key={k} href={`/mushaf?s=${s}&a=${a}`} className="py-3 block">
              <div className="flex justify-between"><span className="font-semibold">{ref(s, a)}</span>{st.bookmarks[k].f ? <span className="pill !bg-transparent border border-gold !text-gold">Favourite</span> : null}</div>
              <div className="q text-[21px] !leading-[2]">{cut(text(s, a), 10)}</div>
            </Link>
          ); })}
        </section>
      ) : <div className="card text-sm text-muted">No bookmarks yet. Tap any ayah in the mushaf to bookmark it.</div>}
      </SettingsGroup>

      <SettingsGroup id="backup" title="Backup & Data Safety" summary="Backup code, restore, undo a recent change, reset">
      <div className="flex flex-col gap-2">
        <div className="flex gap-2"><button className="btn btn-sm" onClick={() => setBackup("export")}>Show backup code</button><button className="btn btn-sm" onClick={() => setBackup("import")}>Restore from code</button></div>
        {backup === "export" && <textarea readOnly className="field font-mono text-xs h-28" value={JSON.stringify(st)} onFocus={(e) => e.target.select()} aria-label="Backup code" />}
        {backup === "import" && <>
          <textarea className="field font-mono text-xs h-28" value={imp} onChange={(e) => setImp(e.target.value)} aria-label="Paste a backup code" placeholder="Paste a backup code. This replaces progress on this device; a copy of the current progress is kept first." />
          <button className="btn btn-sm self-start" onClick={() => { try { const o = JSON.parse(imp) as AppState; if (!o || o.v !== 1 || typeof o.mem !== "object") throw new Error(); restoreBackup(o); update(() => {}); setBackup(""); setImpErr(""); void listSnapshots().then(setSnaps); } catch { setImpErr("That code could not be read. Paste the full text of a backup code."); } }}>Restore</button>
          {impErr && <p className="text-sm text-weak">{impErr}</p>}
          {user && <p className="text-xs text-muted">While signed in, a restored backup is merged with your account copy on the next sync, so progress saved in the account is not deleted.</p>}
        </>}
        {snaps.length > 0 && <details className="text-sm"><summary className="cursor-pointer text-muted">Undo a recent change ({snaps.length} saved cop{snaps.length === 1 ? "y" : "ies"} on this device)</summary>
          <ul className="mt-2 flex flex-col gap-2">{snaps.map((s, i) => <li key={s.at + i} className="flex items-center justify-between gap-2 rounded-lg border border-line p-2"><span>{new Date(s.at).toLocaleString()} · {s.reason}</span><button className="btn btn-sm" onClick={() => { if (window.confirm("Return this device to this saved copy? Your current progress is saved as another copy first.")) { void restoreSnapshot(i).then(() => listSnapshots()).then(setSnaps); } }}>Restore</button></li>)}</ul></details>}
      </div>
        <details className="rounded-xl border border-line p-3"><summary className="cursor-pointer text-sm font-semibold">Reset options</summary><div className="mt-3">
      <div className="flex flex-col gap-3">
        <div>
          <b>Restart my journey</b>
          <p className="text-sm text-muted">Clears your learning path, memorized ayahs, lessons, plans, checks and mistakes so you can set up again. Keeps reading history, bookmarks, goals and settings.</p>
          <button className="btn btn-sm mt-2" onClick={async () => { if (window.confirm("Restart your Hifz journey? Memorization progress, lessons and your learning path will be cleared. A saved copy is kept so you can undo this under Backup.")) { await resetProgress("journey"); void listSnapshots().then(setSnaps); window.location.href = "/journey-settings"; } }}>Restart journey</button>
        </div>
        <div className="border-t border-line pt-3">
          <b className="text-weak">Reset everything</b>
          <p className="text-sm text-muted">Clears all progress: memorization, reading history, bookmarks, goals and streaks. Only your app settings are kept.</p>
          <button className="btn btn-sm mt-2 !border-weak !text-weak" onClick={async () => { if (window.confirm("Reset ALL progress? Everything except your settings is cleared.") && window.confirm("Are you sure? This also clears it from your signed-in account. A saved copy stays on this device under Backup.")) { await resetProgress("all"); void listSnapshots().then(setSnaps); window.location.href = "/"; } }}>Reset everything</button>
        </div>
        {user && <p className="text-xs text-muted">The reset also applies to your account, so other devices are reset when they next sync.</p>}
      </div>
        </div></details>
      </SettingsGroup>

      <SettingsGroup id="about" title="About & sources" summary="Quran text, layout, translations, audio">
      <div className="text-sm text-muted flex flex-col gap-2">
        <p><b className="text-ink">Quran text.</b> Uthmani Hafs text from the Noble Quran Encyclopedia (quranenc.com), shown unmodified in the King Fahd Complex Uthmanic Hafs typeface. A repeatable comparison covers all 6,236 ayahs against the pinned King Fahd Complex v2.0 developer dataset. It reports differences at Al-Baqarah 2:72 and Hud 11:41 for qualified Hafiz review; neither Quran file was changed automatically. See the project Quran validation report before changing text.</p>
        <p><b className="text-ink">Page layout.</b> Madinah mushaf, 15 lines, from the open mushaf-layout data set.</p>
        <p><b className="text-ink">Translations.</b> Urdu by Abul A&apos;la Maududi and by Fateh Muhammad Jalandhry, English by Saheeh International, all via Tanzil.net.</p>
        <p><b className="text-ink">Tafsir.</b> Al-Tafsir Al-Muyassar (King Fahd Complex). Urdu tafsir is loaded on demand from the open tafsir_api project. Tafsir is shown separately from translation.</p>
        <p><b className="text-ink">Audio.</b> Arabic recitation from everyayah.com, saved on this device after the first play for offline listening. Urdu translation audio uses the device&apos;s text-to-speech voice (not a human recording) until a licensed recording is added.</p>
      </div>
        <details className="text-sm"><summary className="cursor-pointer text-muted">Diagnostics (for support)</summary><div className="mt-2"><BuildInfo /></div></details>
      </SettingsGroup>
    </div>
  );
}

