// Service worker: makes the app installable and usable offline.
// - Quran data, fonts and icons: cache first (they do not change within a version).
// - Recitation audio saved by the user: served from the audio cache when present.
// - Pages and scripts: network first, falling back to the cache when offline.
const VERSION = "v4"; // v4: bundled PDF viewer (pdf.js) precached for offline reference PDF maps
const STATIC = `static-${VERSION}`;
const AUDIO = "quran-audio-v1";
const CORE = ["/", "/mushaf", "/recite", "/memorize", "/profile", "/learn", "/assess", "/mind-maps", "/maps/manifest.json", "/maps/al-fatihah.json", "/maps/al-baqarah-1-5.json", "/maps/al-baqarah-21-29.json", "/data/quran.json", "/data/layout.json", "/data/juz.json", "/data/divisions.json", "/fonts/UthmanicHafs1Ver18.woff2", "/manifest.webmanifest", "/icons/icon-192.png", "/pdfjs/pdf.min.mjs", "/pdfjs/pdf.worker.min.mjs"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(STATIC).then((c) => c.addAll(CORE)).catch(() => {}).then(() => self.skipWaiting()));
});
self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k.startsWith("static-") && k !== STATIC).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);

  if (url.hostname === "everyayah.com") {
    e.respondWith(caches.open(AUDIO).then((c) => c.match(req.url)).then((hit) => hit || fetch(req)));
    return;
  }
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
