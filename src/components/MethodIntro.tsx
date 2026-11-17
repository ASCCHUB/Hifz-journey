"use client";
// "How this method works" — the Smart Hifz Tutor teaching method in eight steps. Shown before the first guided
// lesson and available any time afterwards. Dismissal is stored in tutor prefs (separate from profile onboarding).
import { update, useStore } from "@/lib/store";

export const METHOD_STEPS: [string, string][] = [
  ["Listen carefully", "Hear the Ayah recited, a few times, before you try to say it."],
  ["Read and understand", "Look at the Ayah and, if you like, open its meaning (translation)."],
  ["Repeat while looking", "Recite it several times with the text in front of you."],
  ["Hide the text gradually", "Half the words disappear, then only first letters remain."],
  ["Recite from memory", "Say it without looking, then compare and rate yourself honestly."],
  ["Join with what you learned", "After each new Ayah, recite it together with the Ayahs before it (1–2, then 1–3 …)."],
  ["Test the whole page", "Recite the full page without looking. Only this test is saved to your Hifz record."],
  ["Revise on future days", "The app brings the page back in Today’s Hifz: daily at first, then less often."],
];

export default function MethodIntro({ onClose, compact = false }: { onClose?: () => void; compact?: boolean }) {
  const st = useStore();
  const dismissed = !!st.tutor?.introDismissedAt;
  const setDismissed = (on: boolean) => update((d) => { d.tutor = { ...(d.tutor || { mode: "guided", level: "guided", portion: "page", repeat: 3, updatedAt: 0 }), introDismissedAt: on ? Date.now() : undefined, updatedAt: Date.now() }; });
  return <section className="rounded-2xl border border-accent/40 bg-accent-soft/30 p-4" aria-labelledby="method-title">
    <h2 id="method-title" className="text-lg font-bold">How this method works</h2>
    {!compact && <p className="text-sm text-muted">A teacher-style routine you can follow for any page. Your place is saved after every step.</p>}
    <ol className="mt-3 flex flex-col gap-2">{METHOD_STEPS.map(([t, d], i) => <li key={t} className="flex gap-3"><span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-accent font-ui text-sm font-bold text-accent-ink">{i + 1}</span><span><b>{t}.</b> <span className="text-sm text-muted">{d}</span></span></li>)}</ol>
    <div className="mt-3 flex flex-wrap items-center gap-3">
      {onClose && <button className="btn-primary" onClick={onClose}>Got it</button>}
      <label className="flex items-center gap-2 text-sm text-muted"><input type="checkbox" checked={dismissed} onChange={(e) => setDismissed(e.target.checked)} /> Don’t show this before every lesson</label>
    </div>
  </section>;
}
