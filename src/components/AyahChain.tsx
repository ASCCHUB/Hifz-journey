"use client";
// Ayah Chain session: plays a passage as "new Ayah ×N → Ayahs so far ×M → next Ayah" (plan from lib/ayahChain.ts).
//
// Reuses the app's audio path: playTrack() + arabicTrack() (saved copy first, so it works offline once the Ayahs
// have been played or saved; otherwise streamed and saved automatically), the selected reciter and speed, and the
// shared player is stopped first so only one recitation plays. Displays the passage with the existing AyahList /
// MiniMushafPage views. Listening practice only: nothing here writes Hifz records, the page tracker or lessons.
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAudio } from "@/components/Audio";
import ControlIcon from "@/components/ControlIcon";
import { AyahList, useLearnView, ViewSwitch } from "@/components/LearnView";
import MiniMushafPage from "@/components/MiniMushafPage";
import { getAudioCache } from "@/lib/audioCache";
import { OFFLINE_NOT_SAVED_MESSAGE, playTrack } from "@/lib/audioPlayback";
import { arabicTrack } from "@/lib/audioSources";
import { buildChainPlan, ChainPlanError, positionAt, readChainPrefs, stepStart, type ChainAyah, type ChainPlan, type ChainPosition } from "@/lib/ayahChain";
import { ayahRef, CHAIN_TEXT as T, stepHint, stepRow } from "@/lib/ayahChainText";
import { pageOf, sname } from "@/lib/quran";
import { useStore } from "@/lib/store";

/** Link target for a passage; `returnTo` must be an in-app path. */
export function chainHref(ayahs: readonly ChainAyah[], returnTo?: string): string {
  const a = ayahs[0], b = ayahs[ayahs.length - 1];
  const back = returnTo && returnTo.startsWith("/") && !returnTo.startsWith("//") ? `&returnTo=${encodeURIComponent(returnTo)}` : "";
  return `/chain?s=${a[0]}&a=${a[1]}&endS=${b[0]}&endA=${b[1]}${back}`;
}

export type ChainStatus = "idle" | "playing" | "paused" | "done";

/**
 * Plays a chain plan one Ayah file at a time. Pause keeps the place inside the current Ayah; Resume continues
 * from there. Skip / Back move to the start of the next / previous step. A new plan resets to the start.
 */
export function useChainPlayer(plan: ChainPlan | null) {
  const st = useStore(); const global = useAudio();
  const el = useRef<HTMLAudioElement | null>(null);
  const run = useRef(0);          // a new start / stop cancels anything still pending from the previous one
  const loaded = useRef(-1);      // play index whose audio is loaded in the element
  const posRef = useRef(0);
  const [pos, setPosState] = useState(0);
  const [status, setStatus] = useState<ChainStatus>("idle");
  const [err, setErr] = useState("");
  const live = useRef({ reciter: st.settings.reciter, speed: st.settings.speed });
  live.current = { reciter: st.settings.reciter, speed: st.settings.speed };
  const setPos = (i: number) => { posRef.current = i; setPosState(i); };

  const startAt = useCallback((i: number) => {
    if (!plan) return;
    const my = ++run.current; const isCurrent = () => run.current === my;
    const p = positionAt(plan, i);
    if (!p) { el.current?.pause(); loaded.current = -1; setPos(plan.totalPlays); setStatus("done"); return; }
    if (!el.current) el.current = new Audio();
    const a = el.current;
    global.stop(); setErr(""); setPos(i); setStatus("playing"); loaded.current = i;
    a.onended = () => { if (isCurrent()) startAt(posRef.current + 1); };
    a.onerror = () => { if (isCurrent()) { setErr("Audio is unavailable right now. You can continue by reading."); setStatus("paused"); loaded.current = -1; } };
    playTrack(a, arabicTrack(live.current.reciter, p.ayah[0], p.ayah[1]), { rate: live.current.speed, isCurrent }).catch((e: Error) => {
      if (e?.name === "StaleAudioRequest" || !isCurrent()) return;
      loaded.current = -1;
      setErr(e?.name === "OfflineUnavailableError" ? `${OFFLINE_NOT_SAVED_MESSAGE} (${sname(p.ayah[0])} ${p.ayah[1]})` : "Audio could not play (offline or blocked). You can continue by reading.");
      setStatus("paused");
    });
  }, [plan, global]);

  const pause = useCallback(() => { el.current?.pause(); setStatus((s) => (s === "playing" ? "paused" : s)); }, []);
  const play = useCallback(() => {
    if (!plan) return;
    if (status === "done") { startAt(0); return; }
    const a = el.current;
    // Resume inside the same Ayah when its audio is still loaded; otherwise start this play afresh.
    if (status === "paused" && a && loaded.current === posRef.current && a.currentSrc && !a.ended) {
      global.stop(); setErr(""); setStatus("playing");
      a.play().catch(() => startAt(posRef.current));
      return;
    }
    startAt(posRef.current);
  }, [plan, status, startAt, global]);
  /** Move to another step: keeps playing if playing, otherwise waits there (paused) for Resume. */
  const jump = useCallback((target: number) => {
    if (!plan) return;
    if (status === "playing") { startAt(target); return; }
    run.current++; el.current?.pause(); loaded.current = -1; setErr("");
    setPos(target); setStatus(target === 0 && status === "idle" ? "idle" : "paused");
  }, [plan, status, startAt]);
  const cur = plan ? positionAt(plan, Math.min(pos, plan.totalPlays - 1)) : null;
  const skipStep = useCallback(() => {
    if (!plan || !cur) return;
    if (cur.step >= plan.steps.length - 1) { run.current++; el.current?.pause(); loaded.current = -1; setPos(plan.totalPlays); setStatus("done"); return; }
    jump(stepStart(plan, cur.step + 1));
  }, [plan, cur, jump]);
  const backStep = useCallback(() => {
    if (!plan) return;
    // Always the start of the previous step (from the finished screen: the last step). Clamped at step 1.
    const at = status === "done" ? plan.steps.length : (cur?.step ?? 0);
    jump(stepStart(plan, at - 1));
  }, [plan, cur, status, jump]);
  const stop = useCallback(() => { run.current++; el.current?.pause(); loaded.current = -1; }, []);

  // A different plan (passage or repeat counts changed) starts again from the beginning.
  useEffect(() => { run.current++; el.current?.pause(); loaded.current = -1; setPos(0); setStatus("idle"); setErr(""); }, [plan]);
  // Stop when leaving the screen; pause when the app goes to the background (resume with one tap).
  useEffect(() => {
    const hide = () => { if (document.visibilityState === "hidden") pause(); };
    document.addEventListener("visibilitychange", hide);
    return () => { document.removeEventListener("visibilitychange", hide); stop(); };
  }, [pause, stop]);
  useEffect(() => { if (el.current) el.current.playbackRate = st.settings.speed; }, [st.settings.speed]);

  return { status, pos, cur, err, play, pause, skipStep, backStep, restart: () => startAt(0) };
}

/** Offline availability of the passage's audio, and a one-tap "save all" through the shared cache. */
function useOfflineAudio(ayahs: readonly ChainAyah[], reciter: string) {
  const [saved, setSaved] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const check = useCallback(async () => {
    const c = await getAudioCache(); if (!c) { setSaved(null); return; }
    const st = await Promise.all(ayahs.map((x) => c.getStatus(arabicTrack(reciter, x[0], x[1])).catch(() => null)));
    setSaved(st.filter((s) => s?.savedOffline).length);
  }, [ayahs, reciter]);
  useEffect(() => {
    let off: (() => void) | undefined; let alive = true;
    void check();
    void getAudioCache().then((c) => { if (alive && c) off = c.subscribe((e) => { if (e.type !== "settings") void check(); }); });
    return () => { alive = false; off?.(); };
  }, [check]);
  const saveAll = async () => {
    const c = await getAudioCache(); if (!c) return;
    setBusy(true);
    try { for (const x of ayahs) await c.ensureSaved(arabicTrack(reciter, x[0], x[1]), { force: true }); } finally { setBusy(false); void check(); }
  };
  return { saved, busy, saveAll };
}

export default function AyahChainSession({ ayahs, title, returnTo }: { ayahs: ChainAyah[]; title: string; returnTo?: string }) {
  const st = useStore();
  const prefs = readChainPrefs(st.tutor?.chain);
  const planOrError = useMemo<ChainPlan | ChainPlanError>(() => {
    try { return buildChainPlan(ayahs, { newReps: prefs.newReps, setReps: prefs.setReps, linkSingle: prefs.linkSingle === true }); }
    catch (e) { return e instanceof ChainPlanError ? e : new ChainPlanError("empty", String(e)); }
  }, [ayahs, prefs.newReps, prefs.setReps, prefs.linkSingle]);
  const plan = planOrError instanceof ChainPlanError ? null : planOrError;
  const player = useChainPlayer(plan);
  const learnView = useLearnView("ayah");
  const [showText, setShowText] = useState(true);
  const offline = useOfflineAudio(ayahs, st.settings.reciter);
  const back = returnTo && returnTo.startsWith("/") && !returnTo.startsWith("//") ? returnTo : "/learn";

  if (!plan) return <section className="card flex flex-col gap-2"><h1 className="font-bold">{T.name}</h1><p className="text-sm text-weak" role="alert">{T.invalid}</p><Link className="btn btn-sm self-start" href={back}>{T.backToLesson}</Link></section>;

  const done = player.status === "done";
  const p: ChainPosition | null = player.cur;
  const step = plan.steps[done ? plan.steps.length - 1 : (p?.step ?? 0)];
  const inStep = new Set(step.ayahs.map(ayahRef));
  const activeKey = !done && p && player.status !== "idle" ? ayahRef(p.ayah) : null;
  const playsLeft = done ? 0 : plan.totalPlays - player.pos;
  const pct = Math.round(((done ? plan.totalPlays : player.pos) / plan.totalPlays) * 100);
  const wordState = (s: number, a: number) => (!showText ? "hide" : inStep.has(`${s}:${a}`) ? "show" : "dim");
  const pages = [...new Set(ayahs.map((x) => pageOf(x[0], x[1])))];
  const first = step.ayahs[0], last = step.ayahs[step.ayahs.length - 1];
  const where = (x: ChainAyah) => `${sname(x[0])} ${x[1]}`;
  const repeatLabel = p && !done ? (step.type === "learn" ? T.repeatOf(p.repeat, step.repeats) : T.roundOf(p.repeat, step.repeats)) : "";
  const isPlaying = player.status === "playing";

  return <section className="ayah-chain flex flex-col gap-3 pb-[132px]" data-testid="ayah-chain-session">
    <div className="flex items-center gap-2">
      <Link href={back} className="btn btn-sm"><ControlIcon name="arrow-left" /> {T.backToLesson}</Link>
      <div className="min-w-0 flex-1"><h1 className="truncate font-bold">{T.name} · {title}</h1><p className="text-xs text-muted">{T.cycleRule(plan.rules.newReps, plan.rules.setReps)}</p></div>
    </div>

    <div className="card flex flex-col gap-2" aria-live="polite" data-testid="chain-step">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="font-semibold">{T.addAyah(step.cycle)} <span className="text-sm text-muted">· {where(plan.ayahs[step.cycle - 1])}</span></h2>
        <span className="pill" data-testid="chain-plays-left">{T.playsLeft(playsLeft)}</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-line" role="progressbar" aria-label="Passage progress" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}><div className="h-full bg-accent" style={{ width: `${pct}%` }} /></div>
      <ol className="flex flex-col gap-1 text-sm">
        {plan.steps.filter((s) => s.cycle === step.cycle).map((s) => {
          const state = done || s.index < step.index ? "done" : s.index === step.index ? "now" : "next";
          return <li key={s.index} className={`flex items-center justify-between gap-2 rounded-lg px-2 py-1 ${state === "now" ? "bg-accent-soft font-semibold" : state === "done" ? "text-muted" : ""}`} aria-current={state === "now" ? "step" : undefined}>
            <span>{state === "done" ? "✓ " : ""}{stepRow(s)} <span className="text-xs font-normal text-muted">· {stepHint(s)}</span></span>
            <span className="text-xs text-muted">{T.plays(s.plays)}</span>
          </li>;
        })}
      </ol>
      <p className="text-xs text-muted" data-testid="chain-now">{done ? T.done : <>{T.stepOf(step.index + 1, plan.steps.length)} · {repeatLabel}{activeKey && p ? ` · ${T.nowPlaying(where(p.ayah))}` : ""}</>}</p>
      {player.err && <p className="text-sm text-weak" role="alert">{player.err}</p>}
      <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
        {offline.saved !== null && <span data-testid="chain-offline">{T.offlineSaved(offline.saved, ayahs.length)}</span>}
        {offline.saved !== null && offline.saved < ayahs.length && <button type="button" className="btn btn-sm" disabled={offline.busy} onClick={() => void offline.saveAll()}>{offline.busy ? T.saving : T.saveAll}</button>}
        <Link className="btn btn-sm" href={`/recite?s=${first[0]}&a=${first[1]}&endS=${last[0]}&endA=${last[1]}`}><ControlIcon name="mic" /> {T.reciteSet}</Link>
      </div>
      <p className="text-xs text-muted">{T.practiceOnly}</p>
    </div>

    <div className="flex items-center justify-between gap-2">
      <ViewSwitch view={learnView.view} setView={learnView.setView} defaultView={learnView.defaultView} />
      <button type="button" className="btn btn-sm" aria-pressed={!showText} onClick={() => setShowText((v) => !v)}><ControlIcon name={showText ? "eye-off" : "eye"} /> {showText ? T.hideText : T.showText}</button>
    </div>
    <div className="card">
      {learnView.view === "mushaf"
        ? <div className="flex flex-col gap-2">{pages.map((pg) => <MiniMushafPage key={pg} page={pg} active={activeKey} state={(w) => (ayahs.some((x) => x[0] === w.s && x[1] === w.a) ? wordState(w.s, w.a) : "dim")} />)}</div>
        : <AyahList ayahs={ayahs} active={activeKey} state={(s, a) => wordState(s, a)} />}
    </div>

    {/* One-handed controls: fixed above the bottom navigation, the main action in the middle. */}
    <div className="ayah-chain-bar fixed left-0 right-0 bottom-[64px] z-30 px-3 pb-2 lg:bottom-0 lg:left-[220px]" data-testid="chain-controls">
      <div className="mx-auto flex max-w-3xl items-center gap-2 card !p-2 shadow-lg">
        <button type="button" className="btn btn-sm flex-1" onClick={player.backStep} disabled={player.status === "idle" && player.pos === 0} aria-label={T.back}><ControlIcon name="arrow-left" /> <span className="max-[380px]:hidden">{T.back}</span></button>
        <button type="button" className="btn-primary flex-[1.4] !py-3" onClick={isPlaying ? player.pause : player.play} data-testid="chain-play">
          <ControlIcon name={isPlaying ? "pause" : "play"} /> {isPlaying ? T.pause : done ? T.restart : player.status === "paused" ? T.resume : T.start}
        </button>
        <button type="button" className="btn btn-sm flex-1" onClick={player.skipStep} disabled={done} aria-label={T.skip}><span className="max-[380px]:hidden">{T.skip}</span> <ControlIcon name="arrow-right" /></button>
      </div>
    </div>
  </section>;
}
