"use client";
// Check previously memorized pages (Phase 3.4). /assess?page=N runs a two-prompt sampling check.
// Ratings are evidence only for the Ayahs actually recited; the page verdict is a diagnostic, not mastery.
import Link from "next/link";
import { Suspense, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { assessmentPrompts, recoveryList, saveAssessment, uncheckedClaimedPages, type Prompt } from "@/lib/assessment";
import { claimedAyahs } from "@/lib/coverage";
import { SaveLine } from "@/components/SaveStatus";
import { arNum, juzOf, pageAyahsStart, ref, sname, text } from "@/lib/quranView";
import { update, useStore } from "@/lib/store";
import type { Mark } from "@/lib/hifz";

const LABEL: Record<Mark, string> = { ok: "Recalled cleanly", hes: "Needed help", bad: "Could not recall" };

function Check({ page }: { page: number }) {
  const st = useStore();
  const attempt = st.assessments?.[String(page)]?.attempts || 0;
  // Frozen for the whole check: saving increments `attempts`, which must not change the prompts on screen.
  const [prompts] = useState<Prompt[]>(() => assessmentPrompts(page, attempt));
  const [i, setI] = useState(0); const [shown, setShown] = useState(false); const [results, setResults] = useState<Mark[]>([]);
  const [done, setDone] = useState<string | null>(null);
  const p = prompts[i];
  const rate = (m: Mark) => {
    const next = [...results, m]; setResults(next); setShown(false);
    if (i + 1 < prompts.length) { setI(i + 1); return; }
    let v = ""; update((d) => { v = saveAssessment(d, page, prompts, next); }); setDone(v);
  };
  if (done) return <section className="card flex flex-col gap-3">
    <h1 className="text-xl font-bold">Page {page} check · {done === "clean" ? "recalled cleanly" : done === "forgot" ? "not recalled yet" : "needed some help"}</h1>
    <SaveLine />
    <ul className="text-sm">{prompts.map((x, n) => <li key={n}>{ref(x.target[0], x.target[1])} · {LABEL[results[n]]}</li>)}</ul>
    <p className="text-xs text-muted">This was a quick sample of {prompts.length} ayah{prompts.length === 1 ? "" : "s"}. Only those ayahs were added to your record; the rest of the page is still "said known" until you recite it.</p>
    <div className="flex flex-wrap gap-2">
      {done !== "clean" && <Link className="btn-primary" href={`/learn?page=${page}&template=recover`}>Recover page {page}</Link>}
      {done === "clean" && <Link className="btn-primary" href="/assess">Check another page</Link>}
      <Link className="btn" href="/journey">My Hifz Journey</Link>
    </div>
  </section>;
  return <section className="card flex flex-col gap-4">
    <div><div className="label">Check what I remember · page {page} · Juz {juzOf(page)}</div><h1 className="text-lg font-bold">Prompt {i + 1} of {prompts.length}</h1></div>
    {p.kind === "page_start" ? <p>Recite the <b>first ayah of page {page}</b> from memory. It begins {sname(p.target[0])}{p.target[1] === 1 ? " (start of the Surah)" : ` at ayah ${p.target[1]}`}.</p>
      : <div><p>Read this ayah, then <b>recite the one that comes after it</b> from memory:</p><p className="q mt-2 rounded-xl bg-accent-soft/40 p-2 text-2xl" dir="rtl">{text(p.cue![0], p.cue![1])} <span className="font-ui text-sm text-accent">{arNum(p.cue![1])}</span></p></div>}
    {!shown ? <button className="btn-primary" onClick={() => setShown(true)}>I have recited · show the ayah</button>
      : <>
        <p className="q rounded-xl border border-line p-2 text-2xl" dir="rtl">{text(p.target[0], p.target[1])} <span className="font-ui text-sm text-accent">{arNum(p.target[1])}</span></p>
        <div className="grid grid-cols-3 gap-2">{(["bad", "hes", "ok"] as Mark[]).map((m) => <button key={m} className={`btn ${m === "bad" ? "!border-weak !text-weak" : m === "hes" ? "!border-revise !text-revise" : "!border-strong !text-strong"}`} onClick={() => rate(m)}>{LABEL[m]}</button>)}</div>
      </>}
    <Link className="text-sm underline" href={`/recite?s=${p.target[0]}&a=${p.target[1]}&endS=${p.target[0]}&endA=${p.target[1]}`}>Use live recitation instead (optional)</Link>
  </section>;
}

export default function AssessPage() { return <Suspense fallback={null}><Assess /></Suspense>; }

function Assess() {
  const st = useStore(); const params = useSearchParams();
  const page = useMemo(() => { const n = Number(params.get("page")); return Number.isInteger(n) && n >= 1 && n <= 604 ? n : null; }, [params]);
  const claimed = useMemo(() => claimedAyahs(st), [st]);
  const unchecked = useMemo(() => uncheckedClaimedPages(st, claimed.keys()), [st, claimed]);
  const recovery = useMemo(() => recoveryList(st), [st]);
  if (page) return <Check key={page} page={page} />;
  return <div className="flex flex-col gap-4">
    <header><h1 className="text-2xl font-bold">Check and recover</h1><p className="text-sm text-muted">Quick page checks for what you memorized before, and step-by-step recovery for pages that have faded.</p></header>
    <section className="card flex flex-col gap-2"><h2 className="font-bold">Pages you said you know, not yet checked</h2>
      {unchecked.length ? <div className="flex flex-wrap gap-2">{unchecked.slice(0, 40).map((pg) => <Link key={pg} className="btn btn-sm" href={`/assess?page=${pg}`}>Page {pg}</Link>)}{unchecked.length > 40 && <span className="self-center text-sm text-muted">+{unchecked.length - 40} more</span>}</div>
        : <p className="text-sm text-muted">None. Add previously memorized portions in My Hifz Journey → Edit journey.</p>}
      <p className="text-xs text-muted">Each check asks 2 short prompts. It is a sample, not proof that every ayah on the page is strong.</p></section>
    <section className="card flex flex-col gap-2"><h2 className="font-bold">Recovery</h2>
      {recovery.length ? recovery.map((r) => <div key={r.page} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-line p-2 text-sm">
        <div><b>Page {r.page}</b> · {pageAyahsStart(r.page)} · {r.reason}{r.recovery ? ` · recovery ${r.recovery.attempts}× (last: ${LABEL[r.recovery.lastResult].toLowerCase()})` : ""}</div>
        {r.recovered ? <span className="pill">Recovered</span> : r.recommendRelearn ? <Link className="btn btn-sm" href={`/learn?page=${r.page}`}>Relearn fully</Link> : <Link className="btn btn-sm" href={`/learn?page=${r.page}&template=recover`}>Recover</Link>}
      </div>) : <p className="text-sm text-muted">No pages need recovery right now.</p>}
      <p className="text-xs text-muted">Recovery progress is shown here separately from your overall memorization record.</p></section>
  </div>;
}

