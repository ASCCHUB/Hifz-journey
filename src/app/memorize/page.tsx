"use client";
import { Suspense, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import JourneyDashboard from "@/components/JourneyDashboard";
import LegacyMemorizePage from "@/components/LegacyMemorizePage";

function MemorizeCompatibility() {
  const params = useSearchParams(); const router = useRouter();
  useEffect(() => {
    const hash = window.location.hash.toLowerCase();
    if (hash === "#juz") router.replace("/quran?tab=juz");
    else if (hash === "#pages") router.replace("/quran?tab=page");
    else if (hash === "#today-title") router.replace("/revision");
    else if (!params.has("s") && params.has("page")) {
      const page = Number(params.get("page"));
      if (Number.isInteger(page) && page >= 1 && page <= 604) router.replace(`/quran?tab=page&page=${page}`);
    }
  }, [params, router]);
  if (params.has("s") || params.has("a")) return <LegacyMemorizePage />;
  return <JourneyDashboard />;
}
export default function MemorizeCompatibilityPage() { return <Suspense fallback={<div className="card">Opening My Hifz Journey…</div>}><MemorizeCompatibility /></Suspense>; }
