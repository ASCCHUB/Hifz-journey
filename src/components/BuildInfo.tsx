"use client";
// "About this build": proves which frontend is running. The build ID compiled into this JavaScript is compared with
// build-info.json shipped beside it (written by scripts/build-info.mjs after the export). A mismatch means the page
// is running older cached code than the files installed. On Android, the native wrapper version is shown too.
import { useEffect, useState } from "react";

type Info = { appVersion: string; buildId: string; builtAt: string; gitCommit: string | null; frontendFingerprint: string; fileCount: number };
declare global { interface Window { AndroidApp?: { versionName: () => string; versionCode: () => number } } }

export const EMBEDDED_BUILD_ID = process.env.NEXT_PUBLIC_BUILD_ID || "";
export const EMBEDDED_BUILD_TIME = process.env.NEXT_PUBLIC_BUILD_TIME || "";

export default function BuildInfo() {
  const [info, setInfo] = useState<Info | null | "none">(null);
  const [native, setNative] = useState<string>("");
  useEffect(() => {
    fetch("/build-info.json", { cache: "no-store" }).then((r) => (r.ok ? r.json() : "none")).then(setInfo).catch(() => setInfo("none"));
    try { if (window.AndroidApp) setNative(`${window.AndroidApp.versionName()} · code ${window.AndroidApp.versionCode()}`); } catch { /* not Android */ }
  }, []);
  const file = info && info !== "none" ? info : null;
  const mismatch = !!(file && EMBEDDED_BUILD_ID && file.buildId !== EMBEDDED_BUILD_ID);
  return <section className="card flex flex-col gap-1 text-sm" aria-label="About this build">
    <div className="font-semibold">About this build</div>
    <div><span className="text-muted">Frontend build: </span><code className="break-all">{EMBEDDED_BUILD_ID || "development (live source, not a packaged build)"}</code></div>
    {EMBEDDED_BUILD_TIME && <div><span className="text-muted">Built: </span>{new Date(EMBEDDED_BUILD_TIME).toLocaleString()}</div>}
    {file && <>
      <div><span className="text-muted">App version: </span>{file.appVersion}{file.gitCommit ? ` · commit ${file.gitCommit.slice(0, 10)}` : " · no git commit (project is not a git repository)"}</div>
      <div><span className="text-muted">Frontend fingerprint: </span><code className="break-all">{file.frontendFingerprint.slice(0, 16)}</code> · {file.fileCount} files</div>
    </>}
    {native && <div><span className="text-muted">Android app: </span>{native}</div>}
    {mismatch && <p role="alert" className="rounded-xl border border-weak/40 bg-weak/10 p-2 text-weak">This screen is running frontend {EMBEDDED_BUILD_ID}, but the installed files are {file!.buildId}. Close and reopen the app to load the update. Your progress is not affected.</p>}
  </section>;
}
