export type ReaderHistoryState = { hifzReaderFocus?: boolean; hifzAyahSheet?: boolean } | null | undefined;
export type ReaderBackAction = "close-sheet" | "exit-reader-focus" | "none";

/** Decide what a browser/Android WebView Back event should close first. */
export function readerBackAction(state: ReaderHistoryState, sheetEntryActive: boolean, focusEntryActive: boolean): ReaderBackAction {
  if (sheetEntryActive && !state?.hifzAyahSheet) return "close-sheet";
  if (focusEntryActive && !state?.hifzReaderFocus) return "exit-reader-focus";
  return "none";
}

/** "smooth" unless the learner asked the system for reduced motion. */
export const scrollMotion = (): ScrollBehavior => {
  try { return window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth"; } catch { return "auto"; }
};
