// Service worker: makes the app installable and usable offline.
// - Quran data, fonts and icons: cache first (they do not change within a version).
// - Ayah audio saved on this device (automatically after the first play, see src/lib/audioCache.ts):
//   served from the audio cache first, answering Range requests with correct 206 slices so seeking works
//   offline. Partial (206), opaque or error responses are never stored as "saved" audio.
// - Pages and scripts: network first, falling back to the cache when offline.
// VERSION is deliberately unchanged by the audio update: bumping it makes "activate" delete the current
// static cache (offline pages, Quran data, fonts, PDF viewer) before the new one is known to be complete.
const VERSION = "v4"; // v4: bundled PDF viewer (pdf.js) precached for offline reference PDF maps
const STATIC = `static-${VERSION}`;
const AUDIO = "quran-audio-v1"; // never deleted or renamed here: it holds the learner's saved recitation
// Add the https origin of a licensed Urdu recording host here ONLY after it is configured in
// src/lib/audioSources.ts (licence + verified Ayah mapping). Empty on purpose.
const EXTRA_AUDIO_ORIGINS = ["https://cdn.islamic.network"];
const CORE = ["/", "/mushaf", "/recite", "/memorize", "/profile", "/learn", "/assess", "/mind-maps", "/maps/manifest.json", "/maps/al-fatihah.json", "/maps/al-baqarah-1-5.json", "/maps/al-baqarah-21-29.json", "/data/quran.json", "/data/layout.json", "/data/juz.json", "/data/divisions.json", "/fonts/UthmanicHafs1Ver18.woff2", "/manifest.webmanifest", "/icons/icon-192.png", "/pdfjs/pdf.min.mjs", "/pdfjs/pdf.worker.min.mjs"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(STATIC).then((c) => c.addAll(CORE)).catch(() => {}).then(() => self.skipWaiting()));
});
self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k.startsWith("static-") && k !== STATIC).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

function isAyahAudio(url) {
  if (url.protocol === "https:" && url.hostname === "everyayah.com" && /^\/data\/.+\.mp3$/i.test(url.pathname)) return true;
  if (url.origin === self.location.origin && /^\/audio\/urdu-maududi\/.+\.(mp3|m4a|ogg)$/i.test(url.pathname)) return true;
  return EXTRA_AUDIO_ORIGINS.includes(url.origin) && /^\/quran\/audio\/(32|40|48|64|128|192)\/ur\.khan\/[1-9][0-9]{0,3}\.mp3$/i.test(url.pathname);
}

// One "bytes=" range -> {start, end} (inclusive); null = serve the whole file; "invalid" = 416.
function parseRange(header, size) {
  const m = /^bytes=(\d*)-(\d*)$/.exec(String(header).trim());
  if (!m) return null;
  if (m[1] === "" && m[2] === "") return "invalid";
  let start, end;
  if (m[1] === "") { const n = Number(m[2]); if (n === 0) return "invalid"; start = Math.max(0, size - n); end = size - 1; }
  else { start = Number(m[1]); end = m[2] === "" ? size - 1 : Math.min(Number(m[2]), size - 1); }
  if (start >= size || start > end) return "invalid";
  return { start, end };
}

async function serveSaved(saved, req) {
  const blob = await saved.blob();
  const type = saved.headers.get("content-type") || blob.type || "audio/mpeg";
  const size = blob.size;
  const full = () => new Response(blob, { status: 200, headers: { "Content-Type": type, "Content-Length": String(size), "Accept-Ranges": "bytes" } });
  const range = req.headers.get("range");
  if (!range) return full();
  const r = parseRange(range, size);
  if (r === "invalid") return new Response(null, { status: 416, headers: { "Content-Range": `bytes */${size}` } });
  if (r === null) return full();
  const part = blob.slice(r.start, r.end + 1, type);
  return new Response(part, { status: 206, headers: { "Content-Type": type, "Content-Length": String(part.size), "Content-Range": `bytes ${r.start}-${r.end}/${size}`, "Accept-Ranges": "bytes" } });
}

function looksLikeAudio(b) {
  if (b.length < 512) return false;
  return (b[0] === 0x49 && b[1] === 0x44 && b[2] === 0x33) || (b[0] === 0xff && (b[1] & 0xe0) === 0xe0) ||
    (b[0] === 0x4f && b[1] === 0x67 && b[2] === 0x67 && b[3] === 0x53) || (b[4] === 0x66 && b[5] === 0x74 && b[6] === 0x79 && b[7] === 0x70);
}

// Keep a complete, readable 200 response the page fetched (never 206, opaque or error pages; never overwrite).
async function maybeStore(cache, url, res) {
  try {
    if (res.status !== 200 || res.type === "opaque" || res.headers.get("content-range")) return;
    const ct = res.headers.get("content-type") || "";
    if (/^(text\/|application\/(json|xml|xhtml))/i.test(ct)) return;
    const bytes = new Uint8Array(await res.arrayBuffer());
    const declared = res.headers.get("content-length");
    if (declared && !/gzip|br|deflate/i.test(res.headers.get("content-encoding") || "") && Number(declared) !== bytes.length) return;
    if (!looksLikeAudio(bytes) || (await cache.match(url))) return;
    await cache.put(url, new Response(new Blob([bytes], { type: ct || "audio/mpeg" }), { status: 200, headers: { "Content-Type": ct || "audio/mpeg", "Content-Length": String(bytes.length), "Accept-Ranges": "bytes" } }));
  } catch { /* quota or interrupted body: playback is unaffected */ }
}

async function ayahAudio(e) {
  const req = e.request;
  const cache = await caches.open(AUDIO);
  const saved = await cache.match(req.url, { ignoreVary: true });
  if (saved && saved.type !== "opaque" && saved.status === 200) return serveSaved(saved, req);
  try {
    const res = await fetch(req);
    if (!saved && !req.headers.has("range") && res.status === 200 && res.type !== "opaque") e.waitUntil(maybeStore(cache, req.url, res.clone()));
    return res;
  } catch (err) {
    if (saved) return saved; // offline: an older copy saved by earlier versions ("Save … for offline listening")
    throw err;
  }
}

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);

  if (isAyahAudio(url)) {
    e.respondWith(ayahAudio(e));
    return;
  }
  // Android app only: native audio download path (answered by MainActivity); never cache it here.
  if (url.origin === self.location.origin && url.pathname.startsWith("/__hifz-audio/")) return;
  if (url.origin !== self.location.origin) return;

  if (url.pathname.startsWith("/data/") || url.pathname.startsWith("/fonts/") || url.pathname.startsWith("/icons/") || url.pathname.startsWith("/pdfjs/")) {
    e.respondWith(caches.open(STATIC).then((c) => c.match(req).then((hit) => hit || fetch(req).then((res) => { if (res.ok) c.put(req, res.clone()); return res; }))));
    return;
  }
  e.respondWith(
    fetch(req).then((res) => { if (res.ok) { const copy = res.clone(); caches.open(STATIC).then((c) => c.put(req, copy)); } return res; })
      .catch(() => caches.match(req).then((hit) => hit || caches.match("/")))
  );
});
