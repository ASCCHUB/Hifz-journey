"use client";
// Settings → Downloaded audio: how much Ayah audio is saved on this device, the size limit, what happens when it
// is full, automatic saving on/off, and clearing. Only the audio cache is touched — never Quran text,
// translations, Hifz progress, assessments or backups.
import { useCallback, useEffect, useState } from "react";
import { formatBytes, getAudioCache, KIND_ARABIC, KIND_URDU, type AudioCache, type AudioKind, type AudioUsage } from "@/lib/audioCache";
import { listUrduRecordings } from "@/lib/audioSources";

const LIMITS = [100, 250, 500, 1024, 2048].map((mb) => mb * 1024 * 1024);

export default function DownloadedAudioSettings() {
  const [cache, setCache] = useState<AudioCache | null | undefined>(undefined);
  const [u, setU] = useState<AudioUsage | null>(null);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async (c: AudioCache | null | undefined) => { if (c) setU(await c.usage()); }, []);
  useEffect(() => {
    let off: (() => void) | undefined; let live = true;
    void getAudioCache().then((c) => {
      if (!live) return;
      setCache(c); void refresh(c);
      off = c?.subscribe((e) => { if (e.type !== "status" || e.status.state === "saved" || e.status.state === "none") void refresh(c); });
    });
    return () => { live = false; off?.(); };
  }, [refresh]);

  if (cache === undefined) return <p className="text-sm text-muted">Checking downloaded audio…</p>;
  if (cache === null) return <p className="text-sm text-muted">This browser can&apos;t store audio for offline listening. Recitation still streams normally when you are online.</p>;

  const set = async (patch: Parameters<AudioCache["setSettings"]>[0]) => { await cache.setSettings(patch); await refresh(cache); };
  const clear = async (kind?: AudioKind) => {
    const what = kind === KIND_ARABIC ? "all downloaded Arabic recitation" : kind === KIND_URDU ? "all downloaded Urdu translation audio" : "all downloaded audio";
    if (!window.confirm(`Remove ${what} from this device? Your Quran text, translations, Hifz progress and backups are not affected. Ayahs will be saved again automatically the next time you play them online.`)) return;
    setBusy(true);
    try { const r = await cache.clear(kind ? { kind } : {}); setMsg(`Removed ${formatBytes(r.freedBytes)} of downloaded audio.`); }
    catch { setMsg("The downloaded audio could not be cleared. Please try again."); }
    finally { setBusy(false); await refresh(cache); }
  };

  const ar = u?.byKind[KIND_ARABIC], ur = u?.byKind[KIND_URDU];
  const limit = u?.settings.maxBytes ?? 0;
  const pct = limit ? Math.min(100, Math.round(((u?.bytes || 0) / limit) * 100)) : 0;
  const hasUrduRecording = listUrduRecordings().length > 0;
  return (
    <div className="flex flex-col gap-3" data-testid="downloaded-audio-settings">
      <p className="text-sm text-muted">When you play an Ayah while online, its complete recitation is saved on this device automatically, so it plays again without internet. Audio is kept in the app&apos;s private storage, not in your Downloads folder.</p>
      <div>
        <div className="flex justify-between text-sm"><span className="font-semibold">Saved on this device</span><span data-testid="audio-usage">{formatBytes(u?.bytes)} of {formatBytes(limit)}</span></div>
        <div className="mt-1 h-2 rounded-full bg-line" aria-hidden="true"><div className="h-2 rounded-full bg-accent" style={{ width: `${pct}%` }} /></div>
        <ul className="mt-2 text-sm text-muted">
          <li>Arabic recitation: {ar?.count || 0} Ayah{ar?.count === 1 ? "" : "s"} · {formatBytes(ar?.bytes)}</li>
          <li>Urdu translation (recorded): {hasUrduRecording ? `${ur?.count || 0} Ayah${ur?.count === 1 ? "" : "s"} · ${formatBytes(ur?.bytes)}` : "no licensed recording configured yet — Urdu audio uses the device's text-to-speech voice and needs no download"}</li>
          {!!u?.unverified && <li>{u.unverified} older saved file{u.unverified === 1 ? "" : "s"} kept from an earlier version (re-checked automatically when played online)</li>}
          {u?.device?.quota ? <li>Device storage available to the app: {formatBytes(Math.max(0, u.device.quota - (u.device.usage || 0)))}</li> : null}
        </ul>
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={u?.settings.autoSave ?? true} onChange={(e) => void set({ autoSave: e.target.checked })} />
        Save Ayah audio automatically when I play it
      </label>
      <label className="text-sm text-muted">Storage limit for downloaded audio
        <select className="field mt-1" value={limit} onChange={(e) => void set({ maxBytes: Number(e.target.value) })} data-testid="audio-limit">
          {[...new Set([...LIMITS, limit])].filter(Boolean).sort((x, y) => x - y).map((b) => <option key={b} value={b}>{formatBytes(b)}</option>)}
        </select>
      </label>
      <label className="text-sm text-muted">When the limit is reached
        <select className="field mt-1" value={u?.settings.whenFull || "stop"} onChange={(e) => void set({ whenFull: e.target.value as "stop" | "evict-lru" })}>
          <option value="stop">Keep what is saved; stop saving new Ayahs</option>
          <option value="evict-lru">Remove the least recently played Ayahs to make room</option>
        </select>
      </label>
      <div className="flex flex-wrap gap-2">
        <button className="btn btn-sm !border-weak !text-weak" disabled={busy} onClick={() => void clear()} data-testid="clear-audio">Clear downloaded audio</button>
        {!!ar?.count && <button className="btn btn-sm" disabled={busy} onClick={() => void clear(KIND_ARABIC)}>Clear Arabic only</button>}
        {!!ur?.count && <button className="btn btn-sm" disabled={busy} onClick={() => void clear(KIND_URDU)}>Clear Urdu only</button>}
      </div>
      {msg && <p className="text-sm text-muted" role="status">{msg}</p>}
    </div>
  );
}
