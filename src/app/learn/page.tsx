"use client";
// /learn?page=N · /learn?s=&a=&endS=&endA= · &template=recover · &pathId=
import { Suspense, useMemo } from "react";
import { useSearchParams } from "next/navigation";
import LessonPlayer from "@/components/LessonPlayer";
import NewLearning from "@/components/NewLearning";
import { parseLearnTarget } from "@/lib/learnTarget";

export default function LearnPage() { return <Suspense fallback={<div className="card text-sm text-muted">Opening New Learning…</div>}><Learn /></Suspense>; }
function Learn() {
  const params = useSearchParams(); const target = useMemo(() => parseLearnTarget(new URLSearchParams(params.toString())), [params]);
  if (!target) return <NewLearning />;
  return <LessonPlayer key={`${target.template}-${target.unit.start.s}:${target.unit.start.a}-${target.unit.end.s}:${target.unit.end.a}`} {...target} />;
}
