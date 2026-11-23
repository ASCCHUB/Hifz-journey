"use client";
// Settings for Ayah Chain (in Teaching preferences): on/off, the two repeat counts, and a live preview of the
// plan for one step, with the play arithmetic. Saved in tutor.chain (see readChainPrefs for older saves).
import { useMemo, useState } from "react";
import ControlIcon from "@/components/ControlIcon";
import { buildChainPlan, CHAIN_LIMITS, previewCycle, readChainPrefs, type ChainPrefs } from "@/lib/ayahChain";
import { CHAIN_TEXT as T, stepHint, stepRow } from "@/lib/ayahChainText";
import { defaultTutor, update, useStore } from "@/lib/store";

const EXAMPLE_AYAHS = 7;

function Stepper({ label, help, value, onChange, testId }: { label: string; help: string; value: number; onChange: (n: number) => void; testId: string }) {
  return <div className="flex items-center justify-between gap-2" data-testid={testId}>
    <span className="min-w-0"><span className="block text-sm font-semibold">{label}</span><span className="block text-xs text-muted">{help}</span></span>
    <span className="flex items-center gap-1" role="group" aria-label={label}>
      <button type="button" className="btn btn-sm !px-3" aria-label={`${label}: fewer`} disabled={value <= CHAIN_LIMITS.minReps} onClick={() => onChange(value - 1)}>−</button>
      <output className="min-w-[2.5rem] text-center font-bold" aria-live="polite">×{value}</output>
      <button type="button" className="btn btn-sm !px-3" aria-label={`${label}: more`} disabled={value >= CHAIN_LIMITS.maxReps} onClick={() => onChange(value + 1)}>+</button>
    </span>
  </div>;
}

export default function AyahChainSettings() {
  const st = useStore();
  const prefs = readChainPrefs(st.tutor?.chain);
  // Keep every other teaching preference (and any field a newer version adds) exactly as it is.
  const set = (patch: Partial<ChainPrefs>) => update((d) => {
    const t = d.tutor || defaultTutor();
    d.tutor = { ...t, chain: { ...readChainPrefs(t.chain), ...patch }, updatedAt: Date.now() };
  });
  const plan = useMemo(() => buildChainPlan(Array.from({ length: EXAMPLE_AYAHS }, (_, i) => [1, i + 1] as [number, number]), { newReps: prefs.newReps, setReps: prefs.setReps, linkSingle: prefs.linkSingle === true }), [prefs.newReps, prefs.setReps, prefs.linkSingle]);
  const [cycle, setCycle] = useState(4);
  const v = previewCycle(plan, cycle);

  return <section className="ayah-chain-settings mt-4 flex flex-col gap-3 border-t border-line pt-3" data-testid="ayah-chain-settings" aria-labelledby="ayah-chain-title">
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0"><h3 id="ayah-chain-title" className="font-bold">{T.name}</h3><p className="text-sm text-muted">{T.tagline}</p></div>
      <label className="flex shrink-0 items-center gap-2 text-sm font-semibold">
        <input type="checkbox" role="switch" className="h-5 w-5 accent-[var(--accent,#0b5d4b)]" checked={prefs.on} aria-checked={prefs.on} onChange={(e) => set({ on: e.target.checked })} data-testid="ayah-chain-toggle" />
        <span className="sr-only">{T.toggle}</span>{prefs.on ? "On" : "Off"}
      </label>
    </div>
    <p className="text-xs text-muted">{T.toggleHelp}</p>
    <div className="flex flex-col gap-2 rounded-xl border border-line p-3">
      <div className="text-xs font-semibold uppercase tracking-wide text-muted">Repetition</div>
      <Stepper label={T.newReps} help={T.newRepsHelp} value={prefs.newReps} onChange={(n) => set({ newReps: n })} testId="chain-new-reps" />
      <Stepper label={T.setReps} help={T.setRepsHelp} value={prefs.setReps} onChange={(n) => set({ setReps: n })} testId="chain-set-reps" />
      <label className="flex items-center gap-2 text-xs text-muted"><input type="checkbox" checked={prefs.linkSingle === true} onChange={(e) => set({ linkSingle: e.target.checked })} /> {T.linkSingle}</label>
    </div>
    <div className="flex flex-col gap-2 rounded-xl border border-line p-3" data-testid="ayah-chain-preview">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-semibold uppercase tracking-wide text-muted">{T.preview} · {T.previewExample(EXAMPLE_AYAHS)}</span>
        <span className="flex items-center gap-1">
          <button type="button" className="btn btn-sm !px-2" aria-label={T.prevStep} disabled={v.cycle <= 1} onClick={() => setCycle(v.cycle - 1)}><ControlIcon name="arrow-left" /></button>
          <button type="button" className="btn btn-sm !px-2" aria-label={T.nextStep} disabled={v.cycle >= plan.cycles} onClick={() => setCycle(v.cycle + 1)}><ControlIcon name="arrow-right" /></button>
        </span>
      </div>
      <div className="flex items-baseline justify-between gap-2"><b>{T.addAyah(v.cycle)}</b><span className="pill" data-testid="chain-preview-plays">{T.plays(v.cyclePlays)} · {T.thisStep}</span></div>
      <ol className="flex flex-col gap-1 text-sm">{v.steps.map((s) => <li key={s.index} className="flex justify-between gap-2"><span>{stepRow(s)} <span className="text-xs text-muted">· {stepHint(s)}</span></span><span className="text-xs text-muted">{T.plays(s.plays)}</span></li>)}</ol>
      <p className="text-xs text-muted" data-testid="chain-preview-math">{T.throughHere(v.cycle)}: {T.plays(v.playsThrough)} · {T.wholePlan} ({EXAMPLE_AYAHS} Ayahs): {T.plays(v.totalPlays)}</p>
    </div>
  </section>;
}
