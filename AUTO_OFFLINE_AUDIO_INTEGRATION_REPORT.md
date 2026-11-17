# Automatic Offline Audio – Integration Report

Date: 17 November 2026 · Base: `Hifz-Journey-Source.zip` (uploaded 17 Nov 2026) · Suggested branch: `feature/auto-offline-audio-cache`

**Status:** integrated into the real app and tested in desktop Chrome, including a simulation of the Android WebView shell. **Not tested on a physical Android phone.** `MainActivity.java` was checked with javac's parser only; the full Android compile still has to run in the `Android CI test APK` workflow. No APK was built, signing was not touched, and nothing was merged.

## What the learner gets

1. **Play once while online.** Tap Play on any Ayah and it starts immediately (0.19–0.21 s from tap to playing in the tests). About 0.3 s after playback starts, the complete file downloads once in the background, is checked, and is stored in the app's private storage.
2. **"✓ Saved offline"** appears in the player bar, but only after the stored file has been read back successfully.
3. **Later plays use the saved copy first**, online or offline, after the app has been closed and reopened, with seeking. A saved Ayah is never downloaded again.
4. **Offline and never played:** a clear message says the Ayah isn't saved yet and will be saved automatically after one online play.
5. **Download problems never stop playback.** The Ayah keeps playing from the network, nothing is marked as saved, and the save is retried later (back-off from 1 minute to 24 hours, and again when the device comes back online).
6. **Settings → Downloaded Audio:** shows the space used, Arabic and Urdu counts, and the device space available. It also has the size limit (100 MB to 2 GB, default 500 MB), what to do when full (keep existing files and stop saving, or remove the least recently played), an automatic-saving on/off switch, and **Clear downloaded audio** (all, Arabic only, or Urdu only) behind a confirmation.
7. **Urdu translation:** unchanged device text-to-speech, now always labelled *"Urdu translation · device text-to-speech voice, not a human recording, not Quran recitation"* (with an Urdu label too). A verified, licensed Maududi recording would use the same caching automatically once one is configured (see below).

## Files

### Changed (8)

| File | Change |
|---|---|
| `src/components/Audio.tsx` | The shared player plays each Ayah through the cache (saved copy first, otherwise streamed and saved). Adds the "Saved offline" state and indicator and the offline message. A slower earlier start can no longer replace a newer one. The existing "Save … for offline listening" surah button now saves verified complete files through the same cache, instead of opaque `no-cors` copies that couldn't be checked. |
| `src/components/LessonPlayer.tsx` | The lesson repeat player (`useRepeatPlayer`) uses the same cache. |
| `src/components/AyahQuickSheet.tsx` | Urdu audio: a recorded Maududi translation if one is configured (only when the Maududi translation is selected), otherwise the existing TTS, with the label permanently visible. Falls back to TTS if a recording can't play or isn't saved yet offline. |
| `src/app/profile/page.tsx` | New **Downloaded Audio** settings group (`/profile#downloaded-audio`); updated "About & sources" audio note. |
| `public/sw.js` | Ayah audio is served cache-first with correct `206`/`416` Range responses; opaque, partial and error responses are never stored. **`VERSION` stays `"v4"` on purpose:** bumping it would make `activate` delete the cached offline pages, Quran data, fonts and PDF viewer before a new copy is confirmed. The precache list, install/activate and page/data handling are byte-for-byte unchanged. |
| `android/.../MainActivity.java` | Routes `GET /__hifz-audio/fetch` to `AudioDownloadProxy` inside the existing `shouldInterceptRequest`, and adds `AndroidApp.audioProxyVersion()` (returns 1). There is no other native change and no Capacitor. |
| `package.json` | Adds the scripts `test:audio-cache` and `test:audio-proxy`. No new dependencies. |
| `.github/workflows/hifz-tests.yml` | Adds the two new test steps. |

### New (11)

| File | Purpose |
|---|---|
| `src/lib/audioCache.ts` | The shared cache: identifiers, complete-file download and checks, read-back confirmation, deduplication (also across tabs), retry, size limit, LRU eviction, clear, and adoption of files saved by earlier versions. |
| `src/lib/audioSources.ts` | everyayah.com URLs (unchanged), the Urdu recording registry (**empty**) with its licence and Ayah-mapping checks, and the TTS label. |
| `src/lib/audioPlayback.ts` | One `playTrack()` used by all players; falls back to plain streaming if storage is unavailable. |
| `src/lib/urduRecording.ts` | Recorded Urdu playback, managed outside the sheet like `urduSpeech.ts`. |
| `src/components/DownloadedAudioSettings.tsx` | The Settings section. |
| `android/.../AudioDownloadProxy.java` | Native download path (pure Java). |
| `scripts/test-audio-cache.mjs` | 12 Node tests (run in CI). |
| `scripts/test-audio-proxy.mjs`, `scripts/audio-proxy-test/AudioDownloadProxyTest.java` | Compile and test the Java proxy (11 tests) and parse `MainActivity.java` (run in CI). |
| `scripts/audio-e2e/*` | Browser end-to-end tests (Playwright for Python; local only) and their fixtures. See `scripts/audio-e2e/README.md`. |
| `AUTO_OFFLINE_AUDIO_INTEGRATION_REPORT.md` | This report. |

## Android WebView design (no Capacitor)

The app runs at `https://appassets.androidplatform.net`. It can *play* everyayah.com audio, but it can only *read* the bytes (to check a file is complete and store it) if everyayah.com sends CORS headers, and I couldn't confirm that it does. So the Android app uses a narrow native path: the page requests `/__hifz-audio/fetch?u=<audio URL>` from its own origin, and `MainActivity.shouldInterceptRequest` answers it through `AudioDownloadProxy`. Its limits:

* **Allow-listed URLs only:** HTTPS `everyayah.com/data/<reciter>/SSSAAA.mp3`, plus licensed Urdu hosts once configured (list is empty). Query strings, user info, other ports, `..`, `%` and redirects to other hosts are all refused.
* **Request shape:** GET only, no Range header, no cookies, identity encoding, 15 s / 30 s timeouts, 25 MB cap.
* **Incomplete files can't pass:** a body shorter than its Content-Length raises an error.
* **No native storage:** nothing is written to disk natively. The page checks the bytes and stores them in its own app-private CacheStorage (inside `/data/data/com.hifzcompanion/`, never in Downloads).
* **Reachable only from this WebView:** no JavaScript interface carries audio data, and other apps can't use the path.

Saved Ayahs play from `blob:` URLs, so the WebView never has to send Range requests offline. This also doesn't depend on the service worker, which the custom WebView probably doesn't run: there's no `ServiceWorkerController` client, so `appassets` requests from a worker aren't intercepted.

## Data safety

* The audio code never imports the app store, `localStorage`, Quran data, sync or Supabase; a test enforces this.
* **Clear** removes only `quran-audio-v1` entries and the audio index (`hifz-audio-cache` IndexedDB). In the end-to-end test, all `localStorage` (progress, settings, backups) and every other cache were byte-for-byte identical before and after Clear.
* Files saved by the previous "Save … for offline listening" button are **kept**. They still play offline where possible and are re-checked when played online; they are never deleted on upgrade.
* `public/data/quran.json` is unchanged (SHA-256 `fab6e908…1680`, matching the pinned baseline).

## Recorded Maududi Urdu audio

**None is configured, and no URL was added.** To add one, put an entry in `URDU_RECORDINGS` (`src/lib/audioSources.ts`). It is refused unless it names the narrator (the voice is never assumed to be Maulana Maududi), states it is the Maududi / Tafheem-ul-Quran translation, documents a licence allowing **both** streaming and offline storage, and records who verified the Ayah mapping, when, and how. If the files are on another host, add that host to `URDU_AUDIO_HOSTS` (`AudioDownloadProxy.java`) and `EXTRA_AUDIO_ORIGINS` (`public/sw.js`). It then uses the same save, offline, Settings and Clear features as Arabic, under identifiers like `ur-translation:<narrator>:SSSAAA`. The engine tests confirm this with a clearly marked test fixture.

## Test results (17 Nov 2026, Node 24.22.3, Chrome 153)

| Check | Result |
|---|---|
| TypeScript (`tsc --noEmit`) | pass |
| Existing suites: navigation, hifz, phase3, storage, refpdfs, sync-guard, refpdf-learn, mushaf-recitation, local-time, four-android-fixes, learning-features | **all pass** (188 tests + 10 navigation groups), same counts as the untouched baseline |
| New: `test:audio-cache` | 12/12 |
| New: `test:audio-proxy` (Java) | 11/11; `MainActivity.java` parses |
| Production build (`npm run build`) | pass |
| Android static export (`BUILD_ANDROID=1 npm run build`) | pass |
| Quran integrity (as CI runs it) | exit 2 with exactly **2:72 and 11:41**; regenerated CSV identical to the committed one (see note 1) |
| Engine browser tests (`engine_tests.py`) | 10/10 |
| Real app, simulated Android shell (`app_e2e.py --mode android`) | **14/14**, including the success criterion |
| Real app, web build with service worker (`app_e2e.py --mode web`) | **13/13**, including the success criterion |

Real-app steps checked in both modes: first play starts immediately; saved automatically with "Saved offline"; stored in `quran-audio-v1`; older saved file preserved; exactly one full download; replay uses no network; **after closing and reopening offline, the same Ayah plays**; no network offline; clear message for unsaved Ayahs; Urdu TTS label; Settings sizes, limit and counts; Clear removes audio only; a failed download doesn't block playback. Android mode also confirmed saving works through the native path when everyayah.com sends **no** CORS headers.

Engine tests covered: playback starting while a slow download was still running (0.34 s vs 2.7 s); offline seek; 3 simultaneous saves causing one download; browser restart; HTTP 500 with back-off and later retry; dropped connection, HTML error page, non-audio bytes and 404 never stored; missing CORS; storage limit in both modes; Urdu and Arabic identifiers kept separate, with per-kind clear; older-version files adopted without re-downloading; service-worker Range (206) seeking offline.

**Notes**
1. Your ZIP's copy of `scripts/reference/UthmanicHafs_v2-0 data/hafsData_v2-0.json` has Windows CRLF line endings, so `validate-quran` fails its pinned reference hash locally, on the untouched baseline too. With the line endings converted back to LF (a temporary copy; the project wasn't changed), the hash matches exactly and the validation gives the expected result. GitHub stores the LF version, so CI is unaffected. Don't commit a CRLF copy of that file.
2. The existing test suites need **Node 24**: Node 22 rejects `--test-isolation`, as `hifz-tests.yml` already notes.

## Limitations, honestly

* **No physical Android device was available.** The Android results come from desktop Chrome serving the app exactly as `MainActivity` does. Real WebView behaviour still needs checking on a phone: blob playback, IndexedDB, CacheStorage, `shouldInterceptRequest` streaming, and keeping storage under pressure. Use the checklist below.
* **`MainActivity.java` has only been syntax-checked.** The Android SDK isn't reachable from my environment. The change uses only APIs the file already uses (the 6-argument `WebResourceResponse`, `WebResourceRequest.getMethod()`, `Uri.getQueryParameter`). Run **Actions → Android CI test APK → Run workflow** on the branch to compile it. That workflow's APK is signed with a temporary key: **don't install it over your app.**
* **Whether everyayah.com sends CORS headers is unverified.** The Android app doesn't depend on it (native path). In a desktop browser without CORS, Ayahs still play online but aren't saved.
* **First play transfers each Ayah twice:** once streamed by the player, once by the background save (typically 50–500 KB per Ayah). Avoiding that would delay the start of playback.
* The lesson repeat player shares the same code path, but the end-to-end tests drive the Mushaf Ayah sheet, not a lesson.
* Previously saved opaque files can't be checked, so they don't show "Saved offline" until they've been played once online.

## Physical Android checklist (to do)

Install a build signed with **your** key over the existing app (never uninstall or clear data), then:

1. Ayahs saved earlier still play in airplane mode.
2. Online: tap Play → sound within about 1 s → "✓ Saved offline" a few seconds later, with no stutter.
3. Airplane mode → the same Ayah plays and seeks.
4. Force-stop the app (`adb shell am force-stop com.hifzcompanion`), reopen in airplane mode → it still plays.
5. An Ayah never played → the "isn't saved yet" message appears.
6. Settings → Downloaded Audio shows the size → Clear → 0 MB, with progress and backups unchanged.
7. Two reciters → separate saves.
8. Urdu → TTS with the label.
9. Limit at 100 MB with "keep existing" → new Ayahs play but aren't saved.
10. `adb shell ls /sdcard/Download` shows no Hifz audio.

## Pull request text (ready to paste)

**Title:** Automatic offline Ayah audio (Arabic now; licensed Urdu recordings ready)

**Body:**
> Plays each Ayah immediately; after playback starts, the complete file is saved automatically in app-private storage and used first afterwards, including offline after an app restart. Shared cache for Arabic recitation and, once a verified licensed source is configured, recorded Maududi Urdu translation; Urdu TTS kept and labelled. Adds Settings → Downloaded Audio (size, limit, when-full, clear). Service worker serves saved audio with Range support, static cache version unchanged. Android: narrow same-origin native download path in the existing WebView (`AudioDownloadProxy`), no Capacitor, no signing changes.
>
> Tests: all existing suites pass; new `test:audio-cache` (12) and `test:audio-proxy` (11); production build and Android export pass; Chrome end-to-end: Android-shell simulation 14/14, web 13/13, engine 10/10. See AUTO_OFFLINE_AUDIO_INTEGRATION_REPORT.md.
>
> Not yet done: physical Android test; full Android compile — please run "Android CI test APK" on this branch (its APK is NOT for installing over the app). Do not merge until both are checked.
