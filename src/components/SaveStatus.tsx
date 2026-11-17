"use client";
// Visible save state (B1). The banner stays on every screen while progress is not durably saved on this device.
// "I understand" only shrinks it to a persistent badge — it never claims anything was saved.
import { useEffect, useState } from "react";
import { acknowledgeUnsaved, getSaveStatus, onSaveStatus, retrySaves, type SaveStatus } from "@/lib/persist";
import { getState } from "@/lib/store";

export function useSaveStatus(): SaveStatus {
  const [s, setS] = useState<SaveStatus>(getSaveStatus());
  useEffect(() => { setS(getSaveStatus()); return onSaveStatus(setS); }, []);
  return s;
}

/** Offer the current in-memory progress as a file, so it can be kept even if the device cannot save it. */
export function downloadBackup() {
  const blob = new Blob([JSON.stringify(getState())], { type: "application/json" });
  const a = document.createElement("a"); a.href = URL.createObjectURL(blob);
  a.download = `hifz-companion-backup-${new Date().toISOString().slice(0, 10)}.json`; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}

export function SaveBanner() {
  const s = useSaveStatus(); const [busy, setBusy] = useState(false);
  // Warn before leaving while anything is not durably saved.
  useEffect(() => {
    const h = (e: BeforeUnloadEvent) => { const cur = getSaveStatus(); if (cur.state === "unsaved" || cur.state === "saving") { e.preventDefault(); e.returnValue = ""; } };
    window.addEventListener("beforeunload", h); return () => window.removeEventListener("beforeunload", h);
  }, []);
  if (s.state !== "unsaved") return null;
  const retry = async () => { setBusy(true); try { await retrySaves(); } finally { setBusy(false); } };
  if (s.acknowledged) return <div role="status" className="fixed right-3 top-3 z-[60] flex items-center gap-2 rounded-full border border-weak bg-surface px-3 py-1.5 text-sm font-semibold text-weak shadow-lg">
    ⚠ Progress not saved <button className="underline" onClick={() => void retry()} disabled={busy}>{busy ? "Saving…" : "Retry"}</button></div>;
  return <div role="alert" aria-live="assertive" className="fixed inset-x-0 top-0 z-[60] border-b-2 border-weak bg-surface px-4 py-3 shadow-xl">
    <div className="mx-auto flex max-w-3xl flex-col gap-2">
      <b className="text-weak">⚠ Your latest progress is NOT saved on this device.</b>
      <p className="text-sm">{s.error || "The device refused to save."} Your progress is kept while the app stays open, but <b>closing or reloading the app may lose it</b>. Free some space (or leave private browsing) and retry, or download a backup.</p>
      <div className="flex flex-wrap gap-2">
        <button className="btn-primary btn-sm" onClick={() => void retry()} disabled={busy}>{busy ? "Saving…" : "Retry save"}</button>
        <button className="btn btn-sm" onClick={downloadBackup}>Download a backup</button>
        <button className="btn btn-sm" onClick={acknowledgeUnsaved}>I understand — remind me</button>
      </div>
    </div>
  </div>;
}

/** Inline, honest save line for result screens: in memory → saved on this device. (Cloud sync is shown in Profile.) */
export function SaveLine() {
  const s = useSaveStatus();
  if (s.state === "unsaved") return <p className="text-sm font-semibold text-weak" role="status">⚠ Not saved on this device yet — see the warning at the top.</p>;
  if (s.state === "saving" || s.state === "idle") return <p className="text-sm text-muted" role="status">Saving on this device…</p>;
  return <p className="text-sm text-strong" role="status">✓ Saved on this device{s.where === "localstorage" ? " (basic storage)" : ""}.</p>;
}
