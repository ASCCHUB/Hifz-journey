"use client";
import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import MushafReader from "@/components/MushafReader";
import RecitePassage from "@/components/RecitePassage";

function ReciteContent() {
  const searchParams = useSearchParams();
  const hasExactHandoff = searchParams.has("s") && searchParams.has("return");
  const passagePicker = searchParams.get("choose") === "1" || hasExactHandoff;
  return passagePicker ? <RecitePassage /> : <MushafReader reciteLanding />;
}

export default function RecitePage() {
  return <Suspense fallback={<div className="card text-muted">Opening the Mushaf…</div>}><ReciteContent /></Suspense>;
}
