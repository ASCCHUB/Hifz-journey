"use client";
// Private, user-imported whole-Surah audio. Never claims Ayah alignment.
import { useEffect, useState, type Ref } from "react";
import { deletePersonalSurahAudio, getPersonalSurahAudio, savePersonalSurahAudio } from "@/lib/personalSurahAudio";

export default function PersonalSurahRecording({ surah, ayah, playerRef, onPlay }: {
  surah: number; ayah: number; playerRef: Ref<HTMLAudioElement>; onPlay: () => void;
}) {
  const [revision, setRevision] = useState(0);
  const [url, setUrl] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let live = true;
    let objectUrl = "";
    setUrl(""); setName(""); setError("");
    getPersonalSurahAudio(surah).then((record) => {
      if (!live || !record) return;
      objectUrl = URL.createObjectURL(record.blob);
      setUrl(objectUrl); setName(record.name);
    }).catch(() => { if (live) setError("Private saved audio cannot be read on this device."); });
    return () => { live = false; if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [surah, revision]);
  const importRecording = async (file?: File) => {
    if (!file) return;
    setBusy(true); setError("");
    try { await savePersonalSurahAudio(surah, file); setRevision((v) => v + 1); }
    catch (e) { setError((e as Error).message || "Cannot import this audio."); }
    finally { setBusy(false); }
  };
  const removeRecording = async () => {
    setBusy(true); setError("");
    try { await deletePersonalSurahAudio(surah); setRevision((v) => v + 1); }
    catch (e) { setError((e as Error).message || "Cannot remove this audio."); }
    finally { setBusy(false); }
  };
  return <div className="grid gap-2 border-t border-line pt-3" aria-label="Private whole-Surah recording">
    <p className="text-sm font-medium">My imported Urdu recording — whole Surah {surah}</p>
    <p className="text-xs text-muted">Import an MP3, M4A or OGG recording you obtained lawfully. Stored on this device for offline listening. The app cannot verify the narrator or translation. The file covers the whole Surah, not specifically Ayah {ayah}.</p>
    <label className="btn text-center">
      {busy ? "Saving recording…" : name ? "Replace saved Surah recording" : "Import my Surah recording"}
      <input type="file" className="sr-only" accept=".mp3,.m4a,.ogg,audio/mpeg,audio/mp4,audio/ogg"
        disabled={busy} onChange={(event) => {
          const file = event.currentTarget.files?.[0]; event.currentTarget.value = "";
          void importRecording(file);
        }}/>
    </label>
    {url && <>
      <p className="text-xs text-muted">Saved offline: {name}</p>
      <audio ref={playerRef} controls preload="metadata" src={url} className="w-full"
        aria-label="Play saved whole-Surah Urdu recording" onPlay={onPlay}/>
      <button className="btn btn-sm" disabled={busy} onClick={() => { void removeRecording(); }}>Remove this Surah recording</button>
    </>}
    {error && <p role="alert" className="text-sm text-weak">{error}</p>}
  </div>;
}
