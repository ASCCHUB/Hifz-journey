"use client";
// Journey Settings → Learning view (one shared preference for every learning, recall and revision session)
// and the opt-in for Mutashabihat examples awaiting review.
import { update, useStore } from "@/lib/store";

export default function LearnViewSetting() {
  const st = useStore();
  const view = st.settings.learnView ?? null;
  const opts: [typeof view, string][] = [[null, "Each screen's usual view"], ["ayah", "Ayah by Ayah"], ["mushaf", "Full Mushaf page"]];
  return <section className="card flex flex-col gap-3" aria-labelledby="learn-view-title">
    <div><div className="label">Learning preferences</div><h2 id="learn-view-title" className="mt-1 text-xl font-bold">Learning view</h2>
      <p className="mt-1 text-sm text-muted">Use one view for all learning and revision sessions, or keep each screen&apos;s usual view (Mushaf lessons and Mushaf Recall on the page; other sessions Ayah by Ayah). You can still switch inside a session without losing your place.</p></div>
    <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Default learning view">
      {opts.map(([v, label]) => <button key={label} type="button" role="radio" aria-checked={view === v} className={`btn ${view === v ? "btn-on" : ""}`} onClick={() => update((d) => { if (v) d.settings.learnView = v; else delete d.settings.learnView; })}>{label}</button>)}
    </div>
    <label className="flex items-start gap-2 text-sm"><input type="checkbox" className="mt-1" checked={!!st.settings.mutashabihatPending} onChange={(e) => update((d) => { d.settings.mutashabihatPending = e.target.checked; })} />
      <span>Show Similar Ayahs (Mutashabihat) examples that are <b>awaiting review</b>. They are clearly labelled. Only reviewed examples are shown when this is off.</span></label>
  </section>;
}
