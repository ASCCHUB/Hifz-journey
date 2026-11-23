"use client";
// /chain?s=&a=&endS=&endA= (or ?page=N) · optional &returnTo=/path — Ayah Chain listening session.
import { Suspense, useMemo } from "react";
import { useSearchParams } from "next/navigation";
import AyahChainSession from "@/components/AyahChain";
import { CHAIN_TEXT } from "@/lib/ayahChainText";
import { parseLearnTarget } from "@/lib/learnTarget";

export default function ChainPage() { return <Suspense fallback={<div className="card text-sm text-muted">Opening {CHAIN_TEXT.name}…</div>}><Chain /></Suspense>; }
function Chain() {
  const params = useSearchParams();
  const target = useMemo(() => parseLearnTarget(new URLSearchParams(params.toString())), [params]);
  const returnTo = params.get("returnTo") || undefined;
  if (!target) return <section className="card flex flex-col gap-2"><h1 className="font-bold">{CHAIN_TEXT.name}</h1><p className="text-sm text-muted">{CHAIN_TEXT.invalid}</p></section>;
  return <AyahChainSession key={`${target.unit.start.s}:${target.unit.start.a}-${target.unit.end.s}:${target.unit.end.a}`} ayahs={target.ayahs} title={target.title.replace(/^(Learn|Recover) /, "")} returnTo={returnTo} />;
}
