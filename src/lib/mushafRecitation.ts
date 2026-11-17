import { align, buildExpected, summarize, type Alignment, type ExpStatus, type ExpWord, type HeardToken, type Summary } from "./recitationAlign";
import type { EngineKind, FinalSegment } from "./quranAsr";
import { words } from "./quran";

export type MushafMode = "read" | "learn" | "recall" | "revise";
export type MushafReview = { alignment: Alignment; summary: Summary; expected: ExpWord[]; heardCount: number };

/** Final transcript chunks are lexical only; the recognizers provide no reliable word timestamps. */
export function reviewMushafRecitation(items: [number, number][], segments: FinalSegment[]): MushafReview {
  const expected = buildExpected(items, words);
  const tokens: HeardToken[] = [...segments].sort((a, b) => a.id - b.id).flatMap((seg) =>
    seg.text.split(/\s+/).filter(Boolean).map((raw, i) => ({ id: `${seg.id}:${i}`, raw, seg: seg.id, confidence: seg.confidence })));
  const alignment = align(expected, tokens);
  return { alignment, summary: summarize(alignment, {}), expected, heardCount: tokens.length };
}

export function feedbackIsVisible(mode: MushafMode, textIsVisible = true): boolean {
  return textIsVisible && mode !== "recall" && mode !== "revise";
}

export function feedbackLabel(status: ExpStatus): string {
  switch (status) {
    case "correct": return "Possible match (ASR advisory)";
    case "incorrect": return "Possible word mismatch (confirm yourself)";
    case "missing": return "Possible skipped word (confirm yourself)";
    case "uncertain": return "Unclear recognition; not counted as a mistake";
    default: return "Not assessed";
  }
}

export function recognitionEngineLabel(engine: EngineKind): string {
  return engine === "local" ? "Local Quran speech model" : "Browser or phone Arabic speech recognition";
}
