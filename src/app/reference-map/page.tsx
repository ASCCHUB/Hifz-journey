"use client";
import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import ReferencePdfMaps from "@/components/ReferencePdfMaps";

function ReferenceMapContent() {
  const params = useSearchParams();
  const value = Number(params.get("juz"));
  const launchJuz = Number.isInteger(value) && value >= 1 && value <= 30 ? value : undefined;
  const candidate = params.get("returnTo") || "";
  const returnTo = (candidate.startsWith("/mushaf?") || candidate.startsWith("/learn?")) && !candidate.startsWith("//") ? candidate : null;
  return <main className="mx-auto flex max-w-5xl flex-col gap-3 px-4 py-5"><header><h1 className="text-xl font-bold">Visual Memory Map</h1><p className="text-sm text-muted">Reference PDF · stored on this device · not teacher-reviewed</p></header><ReferencePdfMaps launchJuz={launchJuz} returnTo={returnTo} viewerOnly /></main>;
}

export default function ReferenceMapPage() {
  return <Suspense fallback={<main className="p-4 text-sm text-muted">Opening your reference PDF…</main>}><ReferenceMapContent /></Suspense>;
}
