"use client";
// Reference PDF Maps: the learner's own mind-map PDFs, imported from their device and kept only in this
// browser's local database (lib/refPdfs.ts). Rendered offline with the bundled pdf.js (public/pdfjs).
// Reference only: not teacher-reviewed, not Hifz evidence, never shown as a hint during recall.
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ACTIVE_RECALL_PDF_KEY, PENDING_RECALL_PDF_KEY, clearPos, getRefPdf, importRefPdf, listRefPdfs, loadPos, MAX_PDF_BYTES, REFERENCE_JUZ, removeRefPdf, savePos, type RefPdfMeta } from "@/lib/refPdfs";

type PdfDoc = { numPages: number; getPage: (n: number) => Promise<PdfPage>; destroy: () => Promise<void> };
type PdfPage = { getViewport: (o: { scale: number }) => { width: number; height: number }; render: (o: { canvasContext: CanvasRenderingContext2D; viewport: unknown }) => { promise: Promise<void>; cancel: () => void } };
type PdfJs = { GlobalWorkerOptions: { workerSrc: string }; PDFWorker: new (o?: object) => unknown; getDocument: (o: object) => { promise: Promise<PdfDoc> } };
// One worker for the whole session: reopening a PDF (also offline) does not reload the worker script.
let sharedWorker: unknown = null;
let pdfjsPromise: Promise<PdfJs> | null = null;
/** Load the bundled pdf.js from the app's own assets (works offline, no CDN). */
function loadPdfJs(): Promise<PdfJs> {
  if (!pdfjsPromise) pdfjsPromise = (import(/* webpackIgnore: true */ "/pdfjs/pdf.min.mjs" as string) as Promise<PdfJs>).then((m) => { m.GlobalWorkerOptions.workerSrc = "/pdfjs/pdf.worker.min.mjs"; return m; }).catch((e) => { pdfjsPromise = null; throw e; });
  return pdfjsPromise;
}
const mb = (n: number) => `${(n / 1048576).toFixed(n < 10485760 ? 1 : 0)} MB`;

export default function ReferencePdfMaps({ launchJuz, returnTo, viewerOnly = false }: { launchJuz?: number; returnTo?: string | null; viewerOnly?: boolean }) {
  const router = useRouter();
  const [items, setItems] = useState<RefPdfMeta[] | null>(null);
  const [err, setErr] = useState<string>(""); const [busy, setBusy] = useState<number | null>(null);
  const [open, setOpen] = useState<number | null>(null);
  const [launchChecked, setLaunchChecked] = useState(launchJuz == null);
  const pick = useRef<HTMLInputElement>(null); const target = useRef<number>(30);
  const refresh = () => listRefPdfs().then(setItems).catch((e) => { setItems([]); setErr(e.message || "Local storage is unavailable."); });
  useEffect(() => { refresh(); }, []);
  useEffect(() => {
    if (!launchJuz || !items) return;
    if (items.some((item) => item.juz === launchJuz)) setOpen(launchJuz);
    else setErr(`No Juz ${launchJuz} PDF is imported on this device. Import it from the Mind Maps page first.`);
    setLaunchChecked(true);
  }, [launchJuz, items]);

  const choose = (juz: number) => { target.current = juz; setErr(""); if (pick.current) { pick.current.value = ""; pick.current.click(); } };
  const onFile = async (f: File | undefined) => {
    if (!f) return; const juz = target.current; setBusy(juz); setErr("");
    try { await importRefPdf(juz, f); clearPos(juz); await refresh(); }
    catch (e) { setErr(`Juz ${juz}: ${(e as Error).message || "The PDF could not be saved."} You can choose the file again.`); }
    finally { setBusy(null); }
  };
  const remove = async (juz: number) => {
    if (!window.confirm(`Remove the Juz ${juz} PDF from this device? Your Hifz progress is not affected.`)) return;
    try { await removeRefPdf(juz); clearPos(juz); await refresh(); } catch (e) { setErr((e as Error).message); }
  };

  if (open !== null) {
    try {
      const active = JSON.parse(sessionStorage.getItem(ACTIVE_RECALL_PDF_KEY) || "null") as { lessonId?: string; step?: number; at?: number } | null;
      if (active?.lessonId && typeof active.step === "number" && Date.now() - (active.at || 0) < 30 * 60_000) sessionStorage.setItem(PENDING_RECALL_PDF_KEY, JSON.stringify(active));
    } catch { /* assistance marker is a session-only convenience */ }
    return <PdfViewer juz={open} returnTo={returnTo} onClose={() => { if (returnTo) router.replace(returnTo); else { setOpen(null); refresh(); } }} />;
  }
  if (viewerOnly) return <section className="card flex flex-col gap-3"><p role={launchChecked ? "alert" : undefined} className="text-sm text-muted">{launchChecked ? err || "This reference PDF is not available on this device." : "Checking imported PDF…"}</p>{returnTo && <Link className="btn self-start" href={returnTo}>Return to Learning</Link>}<Link className="btn self-start" href="/mind-maps">Manage imported PDFs</Link></section>;
  const have = new Map((items || []).map((i) => [i.juz, i]));
  return <section className="flex flex-col gap-3" aria-labelledby="ref-pdf-title">
    <div><h2 id="ref-pdf-title" className="label">Reference PDF maps · your own files</h2>
      <p className="text-sm text-muted">Import your mind-map PDFs from this device to study them here, also offline. They stay only on this device: they are not uploaded, not synced and not part of your Hifz progress or backups. They are reference material, not teacher-reviewed and not used to score memorization.</p></div>
    <input ref={pick} type="file" accept="application/pdf,.pdf" className="hidden" aria-hidden tabIndex={-1} onChange={(e) => onFile(e.target.files?.[0])} />
    {err && <p role="alert" className="rounded-xl border border-weak/40 bg-weak/10 p-3 text-sm text-weak">{err}</p>}
    <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
      {REFERENCE_JUZ.map((j) => { const it = have.get(j.juz); return <article key={j.juz} className="card flex flex-col gap-2" data-juz={j.juz}>
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0"><b>{j.en}</b><div className="q text-lg leading-snug" dir="rtl" lang="ar">{j.ar}</div></div>
          <span className={`pill shrink-0 ${it ? "text-strong" : "text-muted"}`}>{it ? "On this device" : "Not imported"}</span>
        </div>
        {it && <p className="truncate text-xs text-muted" title={it.name}>{it.name} · {mb(it.size)}</p>}
        <div className="flex flex-wrap gap-2">
          {it && <button className="btn-primary btn-sm" onClick={() => setOpen(j.juz)} aria-label={`Open ${j.en} PDF`}>Open</button>}
          <button className="btn btn-sm" disabled={busy !== null} onClick={() => choose(j.juz)} aria-label={`${it ? "Replace" : "Import"} ${j.en} PDF from device`}>{busy === j.juz ? "Saving…" : it ? "Replace" : "Import PDF from device"}</button>
          {it && <button className="btn btn-sm" onClick={() => remove(j.juz)} aria-label={`Remove ${j.en} PDF`}>Remove</button>}
        </div>
      </article>; })}
    </div>
    <p className="text-xs text-muted">Files up to {MAX_PDF_BYTES / 1048576} MB. Large PDFs need free storage on the device; if saving fails, the app says so and you can choose the file again.</p>
  </section>;
}

function PdfViewer({ juz, onClose, returnTo }: { juz: number; onClose: () => void; returnTo?: string | null }) {
  const meta = REFERENCE_JUZ.find((j) => j.juz === juz)!;
  const [doc, setDoc] = useState<PdfDoc | null>(null); const [err, setErr] = useState("");
  const [pos, setPos] = useState(() => loadPos(juz)); const [rendering, setRendering] = useState(false);
  const [quality, setQuality] = useState<"high" | "balanced">("high");
  const [pageInput, setPageInput] = useState(String(pos.page));
  const self = useRef<HTMLElement>(null);
  useEffect(() => { self.current?.scrollIntoView({ block: "start" }); }, []); // the viewer opens below the map list: bring it into view
  const wrap = useRef<HTMLDivElement>(null); const canvas = useRef<HTMLCanvasElement>(null); const [width, setWidth] = useState(0);
  const pinch = useRef<{ distance: number; startZoom: number; targetZoom: number; originX: number; originY: number; viewX: number; viewY: number; scrollLeft: number; scrollTop: number } | null>(null);
  const zoomAnchor = useRef<{ zoom: number; ratio: number; viewX: number; viewY: number; scrollLeft: number; scrollTop: number } | null>(null);
  useEffect(() => { const el = wrap.current; if (!el) return; const ro = new ResizeObserver(() => setWidth(el.clientWidth)); ro.observe(el); setWidth(el.clientWidth); return () => ro.disconnect(); }, []);
  useEffect(() => {
    let live = true; let d: PdfDoc | null = null;
    Promise.all([loadPdfJs(), getRefPdf(juz).then((b) => b.arrayBuffer())]).then(([pdfjs, data]) =>
      pdfjs.getDocument({ worker: (sharedWorker ||= new pdfjs.PDFWorker()), data, cMapUrl: "/pdfjs/cmaps/", cMapPacked: true, standardFontDataUrl: "/pdfjs/standard_fonts/", isEvalSupported: false }).promise)
      .then((x) => { d = x; if (!live) { x.destroy(); return; } setDoc(x); setPos((p) => ({ ...p, page: Math.min(Math.max(1, p.page), x.numPages) })); })
      .catch((e) => { if (live) setErr(e?.message?.includes("no longer") ? e.message : "This PDF could not be opened on this device. Try importing it again."); });
    return () => { live = false; d?.destroy(); };
  }, [juz]);
  useEffect(() => { savePos(juz, pos); setPageInput(String(pos.page)); }, [juz, pos]);
  useEffect(() => {
    if (!doc || !width || !canvas.current) return;
    let task: { cancel: () => void } | null = null; let live = true; setRendering(true);
    doc.getPage(pos.page).then((page) => {
      if (!live || !canvas.current) return;
      const base = page.getViewport({ scale: 1 }); const fit = (width - 2) / base.width;
      const cssViewport = page.getViewport({ scale: fit * pos.zoom });
      const maxPixels = quality === "high" ? 24_000_000 : 12_000_000;
      const maxSide = quality === "high" ? 8192 : 6144;
      const maxDprByArea = Math.sqrt(maxPixels / Math.max(1, cssViewport.width * cssViewport.height));
      const maxDprBySide = maxSide / Math.max(cssViewport.width, cssViewport.height);
      const dpr = Math.max(1, Math.min(window.devicePixelRatio || 1, quality === "high" ? 3 : 2, maxDprByArea, maxDprBySide));
      const vp = page.getViewport({ scale: fit * pos.zoom * dpr });
      const c = canvas.current; c.width = Math.floor(vp.width); c.height = Math.floor(vp.height);
      c.style.width = `${Math.floor(cssViewport.width)}px`; c.style.height = `${Math.floor(cssViewport.height)}px`; c.style.transform = "";
      const t = page.render({ canvasContext: c.getContext("2d")!, viewport: vp }); task = t;
      return t.promise.then(() => {
        const anchor = zoomAnchor.current;
        if (anchor && anchor.zoom === pos.zoom && wrap.current) requestAnimationFrame(() => {
          if (!wrap.current) return;
          wrap.current.scrollLeft = Math.max(0, (anchor.scrollLeft + anchor.viewX) * anchor.ratio - anchor.viewX);
          wrap.current.scrollTop = Math.max(0, (anchor.scrollTop + anchor.viewY) * anchor.ratio - anchor.viewY);
          zoomAnchor.current = null;
        });
      });
    }).catch(() => {}).finally(() => { if (live) setRendering(false); });
    return () => { live = false; task?.cancel(); };
  }, [doc, pos.page, pos.zoom, width, quality]);
  const n = doc?.numPages ?? 0;
  const goPage = (p: number) => setPos((x) => ({ ...x, page: Math.min(Math.max(1, p), n || 1) }));
  const zoom = (z: number) => setPos((x) => ({ ...x, zoom: Math.min(4, Math.max(1, Math.round(z * 4) / 4)) }));
  const onTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
    if (e.touches.length !== 2 || !wrap.current || !canvas.current) return;
    const a = e.touches[0], b = e.touches[1], bounds = wrap.current.getBoundingClientRect(), canvasBounds = canvas.current.getBoundingClientRect();
    const distance = Math.hypot(b.clientX - a.clientX, b.clientY - a.clientY);
    const originX = (a.clientX + b.clientX) / 2 - canvasBounds.left, originY = (a.clientY + b.clientY) / 2 - canvasBounds.top;
    pinch.current = { distance, startZoom: pos.zoom, targetZoom: pos.zoom, originX, originY, viewX: (a.clientX + b.clientX) / 2 - bounds.left, viewY: (a.clientY + b.clientY) / 2 - bounds.top, scrollLeft: wrap.current.scrollLeft, scrollTop: wrap.current.scrollTop };
    canvas.current.style.transformOrigin = `${originX}px ${originY}px`;
  };
  const onTouchMove = (e: React.TouchEvent<HTMLDivElement>) => {
    const state = pinch.current;
    if (!state || e.touches.length !== 2 || !canvas.current) return;
    const distance = Math.hypot(e.touches[1].clientX - e.touches[0].clientX, e.touches[1].clientY - e.touches[0].clientY);
    const targetZoom = Math.min(4, Math.max(1, Math.round(state.startZoom * distance / state.distance * 20) / 20));
    state.targetZoom = targetZoom;
    canvas.current.style.transform = `scale(${targetZoom / state.startZoom})`;
  };
  const onTouchEnd = (e: React.TouchEvent<HTMLDivElement>) => {
    const state = pinch.current;
    if (!state || e.touches.length >= 2) return;
    pinch.current = null;
    if (canvas.current) canvas.current.style.transform = "";
    if (state.targetZoom === state.startZoom) return;
    zoomAnchor.current = { zoom: state.targetZoom, ratio: state.targetZoom / state.startZoom, viewX: state.viewX, viewY: state.viewY, scrollLeft: state.scrollLeft, scrollTop: state.scrollTop };
    setPos((x) => ({ ...x, zoom: state.targetZoom }));
  };
  return <section ref={self} className="flex scroll-mt-2 flex-col gap-2" aria-label={`${meta.en} reference PDF`}>
    <div className="flex flex-wrap items-center gap-2">
      <button className="btn btn-sm" onClick={onClose}>{returnTo ? "← Return to Learning" : "← Close"}</button>
      <div className="min-w-0 flex-1"><b>{meta.en}</b> <span className="q" dir="rtl" lang="ar">{meta.ar}</span><div className="text-xs text-muted">Reference PDF · not teacher-reviewed · stored on this device</div></div>
    </div>
    <div className="sticky top-0 z-10 flex flex-wrap items-center gap-2 rounded-xl border border-line bg-bg p-2" role="toolbar" aria-label="PDF controls">
      <button className="btn btn-sm" disabled={pos.page <= 1} onClick={() => goPage(pos.page - 1)} aria-label="Previous PDF page">‹ Prev</button>
      <label className="flex items-center gap-1 text-sm">Page <input className="field !w-16 !py-1" type="number" inputMode="numeric" min={1} max={n || 1} value={pageInput} aria-label="PDF page number" onFocus={(e) => e.currentTarget.select()} onChange={(e) => setPageInput(e.target.value)} onBlur={() => goPage(parseInt(pageInput, 10) || pos.page)} onKeyDown={(e) => { if (e.key === "Enter") goPage(parseInt(pageInput, 10) || pos.page); }} /> <span aria-live="polite">of {n || "…"}</span></label>
      <button className="btn btn-sm" disabled={!n || pos.page >= n} onClick={() => goPage(pos.page + 1)} aria-label="Next PDF page">Next ›</button>
      <span className="flex items-center gap-1"><button className="btn btn-sm" disabled={pos.zoom <= 1} onClick={() => zoom(pos.zoom - 0.25)} aria-label="Zoom out">−</button><span className="w-12 text-center text-sm tabular-nums" aria-live="polite">{Math.round(pos.zoom * 100)}%</span><button className="btn btn-sm" disabled={pos.zoom >= 4} onClick={() => zoom(pos.zoom + 0.25)} aria-label="Zoom in">+</button>{pos.zoom !== 1 && <button className="btn btn-sm" onClick={() => zoom(1)}>Fit</button>}</span>
    </div>
    <div className="flex flex-wrap items-center gap-3 text-sm">
      <label className="flex items-center gap-2">Image quality<select className="field !w-auto !min-w-0 !py-1 text-sm" aria-label="PDF image quality" value={quality} onChange={(e) => setQuality(e.target.value as "high" | "balanced")}><option value="high">High detail</option><option value="balanced">Balanced</option></select></label>
      <span className="text-xs text-muted">Pinch with two fingers to zoom; drag with one finger to pan.</span>
    </div>
    {err ? <p role="alert" className="rounded-xl border border-weak/40 bg-weak/10 p-3 text-sm text-weak">{err}</p> : null}
    <div ref={wrap} onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={onTouchEnd} onTouchCancel={onTouchEnd} className="reference-pdf-viewport relative overflow-auto rounded-xl border border-line bg-white" style={{ maxHeight: "calc(100vh - 220px)", touchAction: "pan-x pan-y", overscrollBehavior: "contain" }}>
      {!doc && !err && <p className="p-6 text-center text-sm text-muted">Opening the PDF…</p>}
      <canvas ref={canvas} role="img" aria-label={`${meta.en} map, PDF page ${pos.page} of ${n || "?"}`} className={`reference-pdf-canvas ${rendering ? "opacity-70" : ""}`} />
    </div>
  </section>;
}
