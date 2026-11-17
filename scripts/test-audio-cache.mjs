// Unit and integration-contract tests for automatic offline Ayah audio (lib/audioCache.ts, lib/audioSources.ts)
// and its wiring into the players, Settings, service worker and Android shell. Browser behaviour (actual
// playback, CacheStorage, offline replay, restart) is covered by scripts/audio-e2e/run_e2e.py.
import { registerHooks } from "node:module";
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

registerHooks({
  resolve(specifier, context, nextResolve) {
    if ((specifier.startsWith("./") || specifier.startsWith("../")) && !/\.[a-z]+$/i.test(specifier)) {
      try { return nextResolve(`${specifier}.ts`, context); } catch {}
    }
    return nextResolve(specifier, context);
  },
});
const root = process.cwd();
const src = (p) => readFile(resolve(root, p), "utf8").then((t) => t.replace(/\r\n/g, "\n"));
const ac = await import("../src/lib/audioCache.ts");
const as = await import("../src/lib/audioSources.ts");

const id3 = (n) => { const b = new Uint8Array(n); b.set([0x49, 0x44, 0x33]); return b; };

test("Audio ids: kind + reciter/narrator + surah + ayah, separate for Arabic and Urdu", () => {
  assert.equal(ac.audioId({ kind: "ar-recitation", voiceId: "Alafasy_128kbps", surah: 2, ayah: 255 }), "ar-recitation:Alafasy_128kbps:002255");
  assert.equal(ac.audioId({ kind: "ur-translation", voiceId: "maududi-x", surah: 2, ayah: 255 }), "ur-translation:maududi-x:002255");
  for (const bad of [{ kind: "x", voiceId: "a", surah: 1, ayah: 1 }, { kind: "ar-recitation", voiceId: "a/b", surah: 1, ayah: 1 }, { kind: "ar-recitation", voiceId: "a", surah: 115, ayah: 1 }, { kind: "ar-recitation", voiceId: "a", surah: 1, ayah: 287 }]) {
    assert.throws(() => ac.audioId(bad));
  }
});

test("Arabic URLs are exactly the everyayah.com URLs the app always used, for every reciter (old saved files stay valid)", async () => {
  const audioTsx = await src("src/components/Audio.tsx");
  const reciters = [...audioTsx.matchAll(/^\s+"?([A-Za-z0-9_.-]+)"?: "[^"]+",$/gm)].map((m) => m[1]);
  assert.ok(reciters.length >= 7, `found reciters: ${reciters}`);
  const pad = (n) => String(n).padStart(3, "0");
  for (const r of reciters) {
    const t = as.arabicTrack(r, 2, 7);
    assert.equal(t.url, `https://everyayah.com/data/${r}/${pad(2)}${pad(7)}.mp3`);
    assert.equal(t.kind, "ar-recitation"); assert.equal(t.voiceId, r);
    assert.deepEqual(ac.parseEveryAyahUrl(t.url), { kind: "ar-recitation", voiceId: r, surah: 2, ayah: 7 });
  }
  assert.equal(ac.parseEveryAyahUrl("http://everyayah.com/data/A/001001.mp3"), null);
  assert.equal(ac.parseEveryAyahUrl("https://example.com/data/A/001001.mp3"), null);
});

test("Only complete, real audio files are accepted for saving", () => {
  const ok = { status: 200, contentType: "audio/mpeg", contentLength: "4000", contentRange: null, bytes: id3(4000) };
  assert.equal(ac.validateCompleteAudio(ok), "audio/mpeg");
  const code = (r) => { try { ac.validateCompleteAudio(r); return "accepted"; } catch (e) { return e.code; } };
  assert.equal(code({ ...ok, status: 206 }), "partial");
  assert.equal(code({ ...ok, contentRange: "bytes 0-99/4000" }), "partial");
  assert.equal(code({ ...ok, status: 500 }), "http");
  assert.equal(code({ ...ok, status: 404 }), "http");
  assert.equal(code({ ...ok, contentType: "text/html" }), "not-audio");
  assert.equal(code({ ...ok, bytes: id3(100), contentLength: "100" }), "too-small");
  assert.equal(code({ ...ok, contentLength: "8000" }), "truncated");
  assert.equal(code({ ...ok, bytes: new Uint8Array(4000) }), "not-audio");
  assert.equal(code({ ...ok, contentLength: null }), "accepted"); // length unknown: signature still checked
  const frame = new Uint8Array(4000); frame.set([0xff, 0xfb]);
  assert.equal(ac.sniffAudio(frame), "audio/mpeg");
});

test("Native Android download path is used only when the app shell provides it", () => {
  delete globalThis.AndroidApp;
  assert.equal(ac.hasNativeAudioProxy(), false);
  globalThis.AndroidApp = { versionName: () => "1" }; // older APK: no audio path
  assert.equal(ac.hasNativeAudioProxy(), false);
  globalThis.AndroidApp = { audioProxyVersion: () => 1 };
  assert.equal(ac.hasNativeAudioProxy(), true);
  delete globalThis.AndroidApp;
  assert.equal(ac.NATIVE_PROXY_PATH, "/__hifz-audio/fetch");
});

test("Urdu: no recording configured, so the device TTS is used and clearly labelled", () => {
  assert.deepEqual(as.URDU_RECORDINGS, []);
  assert.deepEqual(as.listUrduRecordings(), []);
  const r = as.resolveUrduAudio(1, 1);
  assert.equal(r.type, "tts");
  assert.match(r.label.en, /text-to-speech/); assert.match(r.label.en, /not a human recording/); assert.match(r.label.en, /not Quran recitation/);
});

test("Urdu: a recording is refused without narrator, Maududi translation, licence (streaming + offline) and verified Ayah mapping", () => {
  const good = {
    id: "test-narrator", narratorName: "TEST", translation: "Tafheem-ul-Quran (Maududi)", urlTemplate: "/audio/urdu-maududi/test-narrator/{surah3}{ayah3}.mp3",
    licence: { holder: "h", grantedTo: "g", reference: "r", allowsStreaming: true, allowsOfflineStorage: true },
    ayahMapping: { verified: true, verifiedBy: "v", verifiedOn: "2026-11-17", method: "m" },
  };
  assert.doesNotThrow(() => as.validateUrduRecording(good));
  const without = (patch) => () => as.validateUrduRecording({ ...good, ...patch });
  assert.throws(without({ narratorName: "" }), /narratorName/);
  assert.throws(without({ translation: "Jalandhry" }), /Maududi/);
  assert.throws(without({ licence: { ...good.licence, allowsOfflineStorage: false } }), /licence/);
  assert.throws(without({ licence: undefined }), /licence/);
  assert.throws(without({ ayahMapping: { ...good.ayahMapping, verified: false } }), /mapping/);
  assert.throws(without({ urlTemplate: "http://x.com/{surah3}{ayah3}.mp3" }), /urlTemplate/);
  assert.throws(without({ urlTemplate: "/audio/urdu-maududi/x/001.mp3" }), /urlTemplate/);
  as._resetUrduRecordingsForTests();
  as.registerUrduRecording(good);
  const r = as.resolveUrduAudio(2, 255);
  assert.equal(r.type, "recording");
  assert.equal(r.track.kind, "ur-translation");
  assert.equal(ac.audioId(r.track), "ur-translation:test-narrator:002255");
  assert.notEqual(ac.audioId(r.track), ac.audioId(as.arabicTrack("Alafasy_128kbps", 2, 255)));
  as._resetUrduRecordingsForTests();
  assert.equal(as.resolveUrduAudio(2, 255).type, "tts");
});

test("Audio cache module stores audio only: no access to the store, progress, localStorage or Quran data", async () => {
  for (const f of ["src/lib/audioCache.ts", "src/lib/audioSources.ts", "src/lib/audioPlayback.ts", "src/lib/urduRecording.ts", "src/components/DownloadedAudioSettings.tsx"]) {
    const t = (await src(f)).replace(/\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");
    assert.doesNotMatch(t, /localStorage|@\/lib\/store|lib\/quran|lib\/sync|supabase|deleteDatabase/, f);
  }
  const cacheTs = await src("src/lib/audioCache.ts");
  assert.match(cacheTs, /AUDIO_CACHE_NAME = "quran-audio-v1"/);
  assert.doesNotMatch(cacheTs, /caches\.delete\(/, "never deletes whole caches");
});

test("Players use the shared cache: main player, lesson repeat player, Urdu recording", async () => {
  const audio = await src("src/components/Audio.tsx");
  assert.match(audio, /playTrack\(audio, track/);
  assert.doesNotMatch(audio, /audio\.src = audioUrl/);
  assert.doesNotMatch(audio, /mode: "no-cors"/, "manual surah save no longer stores unverifiable opaque responses");
  assert.match(audio, /ensureSaved\(arabicTrack/);
  assert.match(audio, /Saved offline/);
  const lesson = await src("src/components/LessonPlayer.tsx");
  assert.match(lesson, /playTrack\(a, arabicTrack/);
  assert.doesNotMatch(lesson, /a\.src = audioUrl/);
  const sheet = await src("src/components/AyahQuickSheet.tsx");
  assert.match(sheet, /resolveUrduAudio/); assert.match(sheet, /shamshadTrack\(s, a\)/); assert.match(sheet, /playUrduRecording\(track, onRec\)/);
  assert.match(await src("src/lib/urduRecording.ts"), /playTrack\(el, track/, "recorded Urdu uses the shared cache");
  assert.match(sheet, /speakUrdu\(/, "existing Urdu TTS is kept");
  assert.match(sheet, /URDU_TTS_LABEL/);
  assert.match(sheet, /set === "tr-ur-maududi" \? resolveUrduAudio/, "recording only for the Maududi translation");
});

test("Settings: Downloaded Audio section with usage, limit, when-full and clear", async () => {
  const profile = await src("src/app/profile/page.tsx");
  assert.match(profile, /<DownloadedAudioSettings \/>/);
  const s = await src("src/components/DownloadedAudioSettings.tsx");
  for (const re of [/usage\(\)/, /maxBytes/, /whenFull/, /autoSave/, /cache\.clear\(/, /window\.confirm\(/]) assert.match(s, re);
});

test("Service worker: audio cache-first with Range support; every existing offline behaviour kept", async () => {
  const sw = await src("public/sw.js");
  assert.match(sw, /const VERSION = "v4";/, "static cache name unchanged, so offline pages are not dropped on update");
  assert.match(sw, /const AUDIO = "quran-audio-v1";/);
  const core = sw.match(/const CORE = (\[[^\]]+\]);/)[1];
  assert.deepEqual(JSON.parse(core), ["/", "/mushaf", "/recite", "/memorize", "/profile", "/learn", "/assess", "/mind-maps", "/maps/manifest.json", "/maps/al-fatihah.json", "/maps/al-baqarah-1-5.json", "/maps/al-baqarah-21-29.json", "/data/quran.json", "/data/layout.json", "/data/juz.json", "/data/divisions.json", "/fonts/UthmanicHafs1Ver18.woff2", "/manifest.webmanifest", "/icons/icon-192.png", "/pdfjs/pdf.min.mjs", "/pdfjs/pdf.worker.min.mjs"]);
  assert.match(sw, /k\.startsWith\("static-"\) && k !== STATIC/, "activate still deletes only old static caches");
  assert.match(sw, /url\.pathname\.startsWith\("\/data\/"\) \|\| url\.pathname\.startsWith\("\/fonts\/"\) \|\| url\.pathname\.startsWith\("\/icons\/"\) \|\| url\.pathname\.startsWith\("\/pdfjs\/"\)/);
  assert.match(sw, /status: 206/); assert.match(sw, /status: 416/);
  assert.match(sw, /res\.type !== "opaque"/, "never stores opaque responses");
  assert.match(sw, /const EXTRA_AUDIO_ORIGINS = \["https:\/\/cdn\.islamic\.network"\];/);
});

test("Service worker Range parsing", async () => {
  const sw = await src("public/sw.js");
  const fn = new Function(`${sw.match(/function parseRange[\s\S]*?\n}\n/)[0]}; return parseRange;`)();
  assert.deepEqual(fn("bytes=0-", 100), { start: 0, end: 99 });
  assert.deepEqual(fn("bytes=10-19", 100), { start: 10, end: 19 });
  assert.deepEqual(fn("bytes=90-500", 100), { start: 90, end: 99 });
  assert.deepEqual(fn("bytes=-10", 100), { start: 90, end: 99 });
  assert.equal(fn("bytes=100-", 100), "invalid");
  assert.equal(fn("bytes=-0", 100), "invalid");
  assert.equal(fn("bytes=0-1,5-6", 100), null);
});

test("Android: narrow native download path wired into the existing WebView, no Capacitor, signing untouched", async () => {
  const main = await src("android/app/src/main/java/com/hifzcompanion/MainActivity.java");
  assert.match(main, /if \(AudioDownloadProxy\.PATH\.equals\(request\.getUrl\(\)\.getPath\(\)\)\) return audioDownload\(request\);/);
  assert.match(main, /public int audioProxyVersion\(\) \{ return 1; \}/);
  assert.match(main, /"GET"\.equalsIgnoreCase\(request\.getMethod\(\)\)/);
  const proxy = await src("android/app/src/main/java/com/hifzcompanion/AudioDownloadProxy.java");
  assert.match(proxy, /URDU_AUDIO_HOSTS = \{"cdn\.islamic\.network"\};/);
  assert.doesNotMatch(proxy, /import android\./);
  assert.doesNotMatch(proxy, /FileOutputStream|getExternal|Environment\./, "never writes files");
  const pkg = JSON.parse(await src("package.json"));
  assert.ok(!Object.keys({ ...pkg.dependencies, ...pkg.devDependencies }).some((d) => /capacitor/i.test(d)));
  const gradle = await src("android/app/build.gradle");
  assert.doesNotMatch(gradle, /signingConfig/);
});


test("Shamshad source: authenticated edition and Ayah mapping yield the provider CDN audio URL only", async () => {
  const sh = await import("../src/lib/shamshadUrdu.ts");
  const item = { code: 200, data: { number: 1, numberInSurah: 1, surah: { number: 1 },
    edition: { identifier: "ur.khan" }, audio: "https://cdn.islamic.network/quran/audio/64/ur.khan/1.mp3" }};
  assert.equal(sh.parseShamshadAyah(item, 1, 1), item.data.audio);
  assert.throws(() => sh.parseShamshadAyah({ ...item, data: { ...item.data, numberInSurah: 2 } }, 1, 1), /mapping/);
  assert.throws(() => sh.parseShamshadAyah({ ...item, data: { ...item.data, edition: { identifier: "ur.maududi" } } }, 1, 1), /mapping/);
  assert.throws(() => sh.parseShamshadAyah({ ...item, data: { ...item.data, audio: "https://evil.example/quran/audio/64/ur.khan/1.mp3" } }, 1, 1), /approved edition/);
  assert.throws(() => sh.parseShamshadAyah({ ...item, data: { ...item.data, audio: "https://cdn.islamic.network/quran/audio/64/ur.khan/2.mp3" } }, 1, 1), /approved edition/);
  assert.throws(() => sh.validateShamshadAudioUrl("http://cdn.islamic.network/quran/audio/64/ur.khan/1.mp3", 1), /approved edition/);
});

test("Shamshad source: resolves the URL once, reuses saved metadata offline, audio cache is shared", async () => {
  const sh = await import("../src/lib/shamshadUrdu.ts");
  const oldFetch = globalThis.fetch, oldStorage = globalThis.localStorage;
  const map = new Map();
  let calls = 0;
  globalThis.localStorage = { getItem: k => map.get(k) ?? null, setItem: (k,v) => map.set(k,v) };
  globalThis.fetch = async (url) => {
    calls++;
    assert.equal(url, "https://api.alquran.cloud/v1/ayah/1:1/ur.khan");
    return { ok: true, json: async () => ({ code: 200, data: { number: 1,
      numberInSurah: 1, surah: { number: 1 }, edition: { identifier: "ur.khan" },
      audio: "https://cdn.islamic.network/quran/audio/64/ur.khan/1.mp3" } }) };
  };
  try {
    const online = await sh.shamshadTrack(1,1);
    assert.equal(online.kind, "ur-translation");
    assert.equal(online.url, "https://cdn.islamic.network/quran/audio/64/ur.khan/1.mp3");
    assert.match(ac.audioId(online), /^ur-translation:shamshad/);
    globalThis.fetch = async () => { throw new Error("offline"); };
    const offline = await sh.shamshadTrack(1,1);
    assert.deepEqual(offline, online);
    assert.equal(calls, 1);
  } finally { globalThis.fetch = oldFetch; globalThis.localStorage = oldStorage; }
});
