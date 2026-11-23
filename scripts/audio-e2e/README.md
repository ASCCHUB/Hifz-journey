# Automatic offline audio: browser end-to-end tests

These run real Google Chrome through Playwright for Python. They are **not** part of GitHub Actions
(the CI runs `npm run test:audio-cache` and `npm run test:audio-proxy`), and they do **not** replace testing on
a physical Android phone.

Requirements: Python 3.10+, `pip install playwright`, Google Chrome/Chromium with MP3 support, OpenSSL,
Node.js 24 (for type stripping).

| Script | What it tests |
|---|---|
| `engine_tests.py` | `src/lib/audioCache.ts` + `public/sw.js` directly: first-play timing, offline replay, browser restart, dedupe, HTTP 500, dropped connection, HTML/non-audio bodies, missing CORS, storage limit (stop / LRU), Urdu identifiers, preservation of older saved files, clear, service-worker Range (206) serving. |
| `app_e2e.py --mode android` | The real app UI from the Android static export (`BUILD_ANDROID=1 npm run build`), served at `https://appassets.androidplatform.net` the way `MainActivity` serves it, with `/__hifz-audio/fetch` behaving like `AudioDownloadProxy.java`, no service worker and `window.AndroidApp` present. The fake everyayah.com sends **no CORS headers**, so saving must go through the native path. |
| `app_e2e.py --mode web` | The real app UI from `npm run build` + `next start`, with the service worker and Chrome's full offline mode. |
| `chain_e2e.py --mode android\|web` | Ayah Chain through the real UI: settings toggle, steppers and preview arithmetic; the lesson entry button; playback order against the plan; Pause/Resume, Back one step, Skip; progress data unchanged; then app closed and reopened offline, the chain plays from the audio cache with no network. Uses 1-second generated clips (needs `ffmpeg`). |

`app_e2e.py` checks the success criterion: play an Ayah online once → it is saved automatically → close and
reopen the app offline → the same Ayah plays. It also checks the offline message for unsaved Ayahs, the Urdu TTS
label, Settings → Downloaded Audio, that Clear removes only audio (localStorage progress and other caches are
byte-for-byte unchanged), and that a failed download never blocks playback.

```
python3 scripts/audio-e2e/engine_tests.py
BUILD_ANDROID=1 npm run build && python3 scripts/audio-e2e/app_e2e.py --mode android
npm run build && python3 scripts/audio-e2e/app_e2e.py --mode web
python3 scripts/audio-e2e/chain_e2e.py --mode android   # or --mode web (after the matching build)
```
