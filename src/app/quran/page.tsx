"use client";
import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import MyQuranLibrary from "@/components/MyQuranLibrary";

function QuranContent() {
  const params = useSearchParams(); const rawTab = params.get("tab");
  const tab = rawTab === "page" || rawTab === "surah" ? rawTab : "juz";
  const page = Number(params.get("page"));
  return <MyQuranLibrary initialTab={tab} initialPage={Number.isInteger(page) && page >= 1 && page <= 604 ? page : null} />;
}
export default function MyQuranPage() { return <Suspense fallback={<div className="card">Opening My Quran…</div>}><QuranContent /></Suspense>; }
