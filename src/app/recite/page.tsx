"use client";
import { Suspense, useMemo } from "react";
import { useRouter } from "next/navigation";
import LiveRecitation from "@/components/LiveRecitation";
import { Q } from "@/lib/quran";
import { useSearchParams } from "next/navigation";
import MushafReader from "@/components/MushafReader";
import RecitePassage from "@/components/RecitePassage";

function ReciteContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const allAyahs = useMemo<[number, number][]>(() => Q().n.flatMap((n, i) => Array.from({ length: n[2] }, (_, j) => [i + 1, j + 1] as [number, number])), []);
  const hasExactHandoff = searchParams.has("s") && searchParams.has("return");
  const passagePicker = searchParams.get("choose") === "1" || hasExactHandoff;
  return passagePicker ? <RecitePassage /> : searchParams.has("p")
    ? <MushafReader reciteLanding />
    : <LiveRecitation auto items={allAyahs} title="Recite aloud from anywhere" onClose={() => router.push("/mushaf")} />;
}

export default function RecitePage() {
  return <Suspense fallback={<div className="card text-muted">Opening the Mushaf…</div>}><ReciteContent /></Suspense>;
}
