# Desktop ↔ Android Feature Parity Audit

Date: 2026-11-14. Auditor: Claude.

**Physical Android device: NOT tested.** Parity is proved here at the level of the **bundled files**: the APK contains byte-identical copies of the production export, with the same build ID. **Runtime parity on a real phone is not claimed.**

## 1. Root cause: evidence and possible causes

| # | Cause | Evidence | Status |
|---|---|---|---|
| A | **Stale export packaged** (the earlier incident): when `NEXT_DIST_DIR` was set, the build wrote the export elsewhere and the script copied an old `./out` | Found and admitted in an earlier session; the old APK lacked new pages | Fixed earlier (fresh-export check). Now also **cryptographically verified** (§2). |
| B | **Android asset packaging silently dropped files** in folders starting with `_`. aapt's default `ignoreAssetsPattern` contains `<dir>_*`. | **Found in this audit** by the new APK verifier: the APK lacked `_next/static/chunks/app/_not-found/page-*.js`, `_<id>/_buildManifest.js` and `_ssgManifest.js`, which the export contains. `404.html` loads the `_not-found` chunk, so Android's 404 page could not hydrate. **Every earlier APK had this gap.** | **Fixed:** `android/app/build.gradle` `androidResources.ignoreAssetsPattern` keeps the defaults minus `<dir>_*`. Verified: 0 files missing. |
| C | **Same file name and `versionCode 1` for every APK**, so it was easy to install an older copy by mistake, and impossible to tell builds apart on the phone | `Hifz-Companion-debug.apk` was overwritten each build; `versionCode 1` / `versionName 1.0` in Gradle | **Fixed:** unique file name with the build ID; versionCode increases per build; versionName includes the build ID; About screen shows the ID. |
| D | WebView / service-worker caching serving old files after an update | See §6: unlikely on this wrapper (assets are served by `shouldInterceptRequest`, which the HTTP cache does not store; the service worker most likely cannot register in this WebView) | Mitigated anyway (per-build service-worker cache name; mismatch warning in About). **Needs device confirmation.** |

## 2. Build pipeline changes (`scripts/build-android.ps1`, `scripts/build-info.mjs`, `android/app/build.gradle`)

**Steps:**
1. **Build identity is created before the build:** `buildId = <UTC yyyyMMdd-HHmm>-<6 random hex>`. It is passed to Next.js as `NEXT_PUBLIC_BUILD_ID`, `NEXT_PUBLIC_BUILD_TIME` and `NEXT_PUBLIC_APP_VERSION`, so **the ID is compiled into the JavaScript bundle**.
2. **Fresh export:** the old export folder is deleted. The build must create `index.html` newer than the build start, and **all required routes and assets** must exist: learn, recall, assess, memorize, mushaf, recite, mind-maps, profile, `sw.js`, the maps manifest, and both pdf.js files.
3. **Stamp** (`build-info.mjs stamp`):
   - the service-worker cache name is set to the build ID;
   - the stamp **fails unless a JS chunk embeds the build ID**;
   - SHA-256 is computed over every exported file (path + content hash), and `build-info.json` is written: `{appVersion, buildId, builtAt, gitCommit: null, frontendFingerprint, fileCount}`.
4. **Copy:** the Android asset folder is deleted and recreated from this export only (`_next` → `next`, as the wrapper expects). No obsolete assets can remain.
5. **Gradle:**
   - `-PhifzVersionCode=<minutes since 2024-01-01 UTC>`, so it always increases and updates install in place;
   - `-PhifzVersionName="<appVersion> (<buildId>)"`;
   - **underscore folders now kept**;
   - the script fails if the APK is older than the build start.
6. **Verify the real APK** (`build-info.mjs verify`). It opens the APK as a zip and fails loudly unless:
   - the `build-info.json` ID and fingerprint equal the export's;
   - **every exported file is present** (0 missing);
   - **no extra frontend file exists** (0 stale);
   - **the bytes hash to the recorded fingerprint**;
   - the required routes exist;
   - **no PDF files** are bundled.
7. **Unique output:** the APK is copied to `..\Hifz-Companion-<buildId>-debug.apk`. **Earlier APKs are never overwritten.** The temporary asset and export folders are removed.

Every stage uses `$ErrorActionPreference = "Stop"` plus exit-code checks; any failure stops the build before an APK is produced or named.

**About screen** (`Profile → About`, `src/components/BuildInfo.tsx`):
- shows the build ID compiled into the running JS, build time, app version, git status and frontend fingerprint;
- on Android, also the native wrapper version (`window.AndroidApp`, a new read-only bridge in `MainActivity`);
- **if the running JS and the installed `build-info.json` disagree, it warns** to reopen the app (progress unaffected).

## 3. Exact frontend build

| Field | Value |
|---|---|
| Build ID | **`20261114-0845-53cadd`** (UTC 08:45 = 11:45 local) |
| App version | 0.1.0 (`package.json`) |
| Git commit | none: the project is not a git repository (recorded as `null`) |
| Frontend fingerprint | **`9a1b032fe45620bd04104514131565b302ba178623be717c6678900a4feff553`** (261 files + `build-info.json`) |
| Android | `com.hifzcompanion`, **versionCode 1509645**, versionName `0.1.0 (20261114-0845-53cadd)` |
| APK | **`C:\Users\sajid\Downloads\QURAN COMPANION\Hifz-Companion-20261114-0845-53cadd-debug.apk`** (5.2 MB) |
| Signing | Debug certificate SHA-256 `866123fa…77f31`, **identical to the previously installed APK**, so it updates in place |

**Verifier output:** `APK-VERIFIED 20261114-0845-53cadd fingerprint 9a1b032fe45620bd · 262 frontend files, 0 missing, 0 stale, bytes match`.

**Runtime proof (desktop):** the frontend *extracted from this APK* was served locally. Its About card shows:
- `Frontend build: 20261114-0845-53cadd`;
- `Frontend fingerprint: 9a1b032fe45620bd · 261 files`;
- no mismatch.

On the desktop dev server, the card correctly says "development (live source, not a packaged build)".

## 4. Desktop feature inventory (current source; browser-verified this session)

| Feature | Desktop |
|---|---|
| Home and Journey refinements (Continue/Resume lesson, 604-pages link, Today's Hifz) | ✔ (integration 29/29) |
| 604-page tracker and page sheet | ✔ (Stage 3: 36/36) |
| Mushaf Read / Learn / Recall / **Revise** | ✔ (integration 29/29) |
| Guided lesson panel (compact/expand) | ✔ (Stage 2: 48/48, Stage 3) |
| Half-page learning | ✔ |
| Recite → return to lesson | ✔ |
| IndexedDB save warnings and backup | ✔ (`test:storage` 17/17) |
| Visual Maps (Ayah-linked) | ✔ |
| Reference PDF import and viewer | ✔ (32/32, with the user's real PDFs) |
| PDF map shortcut from Learn mode | ✘ **not implemented** (on either platform; the PDF library is reached from Visual Maps only) |
| About this build | ✔ |

## 5. APK feature inventory (strings and modules found inside the APK's bundled files)

| Feature | Marker searched | Present |
|---|---|---|
| Home 604-pages link | "My 604 Mushaf pages" | ✔ |
| Tracker statuses | "Partly checked" | ✔ |
| Mushaf mode tabs | "Mushaf mode" | ✔ |
| Revise mode | "Revision selection not valid" | ✔ |
| Guided lesson panel / compact toggle | "Skip preparation" / "Instructions ▾" | ✔ |
| Half-page learning | "line 8 or later" | ✔ |
| Recall on page | "Recite page" | ✔ |
| Recite return | "Back to your lesson on the Mushaf" | ✔ |
| Save warnings and backup | "Progress not saved", "closing or reloading the app may lose it", "hifz-companion-backup-" | ✔ |
| Visual Maps (Ayah-linked) | "Ayah-linked maps" | ✔ |
| PDF import / viewer / pdf.js | "Import PDF from device", "PDF page number", `pdfjs/pdf.min.mjs` + worker | ✔ |
| About this build | "About this build" | ✔ |
| Today's Hifz | "Start Today" | ✔ |

**Routes in the APK:** `index, mushaf, memorize, learn, recall, recite, mind-maps, profile, assess, login, 404` (+ `_not-found` chunk, now included).

**Native side** (compiled `classes*.dex`): `onShowFileChooser`, the `AndroidApp` bridge, the `AndroidSpeech` bridge.

**Result:** the APK frontend is **byte-identical** to the production export of the current source. Every implemented feature is bundled, and nothing implemented on desktop is missing from the APK.

## 6. Cache behaviour

- **WebView HTTP cache:**
  - all app files are served from APK assets through `WebViewClient.shouldInterceptRequest`, and responses supplied this way are not written to the WebView HTTP cache;
  - after an update, the WebView reads the new assets;
  - `Cache-Control: no-cache` is also set.
- **Service worker:** `Shell` registers `/sw.js` in production.
  - **Probably no service worker on Android:** the wrapper does not set a `ServiceWorkerController` client, so the worker's own fetch of `https://appassets.androidplatform.net/sw.js` is not intercepted and goes to the network, where that host doesn't resolve. Registration should therefore fail silently.
  - **If a service worker ever does register** (on the web or a future WebView), its cache name is now the **build ID**: activating a new build deletes old `static-*` caches only. The recitation-audio cache, IndexedDB, localStorage, Hifz records, imported PDFs and backups are never touched.
- **Learner data is never cleared** by the pipeline or the app to force a refresh.
- **Detection:** the About card compares the running JS build ID with the installed `build-info.json`; a stale running page is shown, not hidden.
- **Device confirmation needed:** whether the service worker registers in this WebView (`chrome://inspect` → Application → Service Workers), and that the About card shows the new ID immediately after an update.

## 7. Android wrapper capabilities (code inspection)

| Capability | Implementation | Needs a device test |
|---|---|---|
| PDF file picker | `onShowFileChooser` → system picker; result or cancel returned; `ActivityNotFoundException` handled; survives rotation (`configChanges`) | Picking, cancelling, choosing a non-PDF (app rejects it), and Juz 1/4 sized files (memory) |
| Microphone | `onPermissionRequest` grants only `AUDIO_CAPTURE` after the `RECORD_AUDIO` runtime permission; native `SpeechRecognizer` bridge | Permission prompt, denial, Recite |
| Local PDF reading / offline | PDFs in IndexedDB; pdf.js, cmaps and fonts are local assets served with JS MIME for `.mjs` | Airplane-mode reopen; WebView version 80+ for the module worker |
| Back navigation | `onBackPressed` → `webView.goBack()` (Ayah sheet and reader-focus states use history entries) | Back from the PDF viewer leaves Visual Maps (position is kept) |
| No uploads | No upload code in PDF modules; `setAllowFileAccess(false)`; no storage permissions | — |

## 8. Build and packaging verification (this audit)

| Check | Result |
|---|---|
| TypeScript | clean |
| Unit suites | phase3 56/56 · hifz 24/24 · storage 17/17 · sync-guard 15/15 · refpdfs 7/7 · navigation 10/10 |
| Quran integrity | `validate:quran`: 6,236 Ayahs, **2 known differences** (2:72, 11:41, unchanged). `quran.json` SHA-256 `fab6e908…` in source and APK. |
| Browser (desktop dev) | integration 29/29 · Stage 2 48/48 · Stage 3 36/36 · PDF maps 32/32 |
| Fresh Android build | export → stamp → copy → Gradle → **APK verify PASS** (the first attempt correctly **failed** on the missing underscore files, before the Gradle fix) |
| Signing / versioning | Same debug certificate as the previous APK; versionCode 1 → 1509645; applicationId unchanged |
| APK contents | 262 frontend files, 0 missing, 0 stale; 0 PDFs; required routes present |

## 9. Installing the update without losing data

1. Copy **`Hifz-Companion-20261114-0845-53cadd-debug.apk`** to the phone and open it. Choose **Update**. **Do not uninstall first**: uninstalling deletes the app's local progress and imported PDFs.
2. This APK has the same package name and the same debug signing key as before, and a higher versionCode, so Android installs it **in place**, keeping IndexedDB, localStorage, Hifz progress and imported PDFs.
3. After updating, open **Profile → About**. It must show **Frontend build `20261114-0845-53cadd`** and *Android app `0.1.0 (20261114-0845-53cadd) · code 1509645`*. If it shows a different ID, the old APK is still installed.
4. **If Android refuses the update:**
   - **"App not installed / package conflicts":** a different signing key was used (for example, an APK built on another PC with another debug keystore). Check with `apksigner verify --print-certs <apk>`: the certificate must be `866123fa…77f31`.
   - **"Downgrade":** the installed versionCode is higher than this APK's (an APK built later).

   Diagnose these before considering anything else. **Before any uninstall**, use **Profile → Backup → Download backup** (and keep the PDFs' originals). Clearing app data is never a routine fix.
5. Precaution before any update: Profile → Backup → Download backup.

## 10. Remaining physical-Android tests (not done)

1. In-place update over the previous install: progress, lessons and imported PDFs still present; About shows the new ID.
2. PDF picker: pick, cancel, non-PDF, a 60–84 MB map (memory), offline reopen, Back from the viewer.
3. Service-worker status in the WebView (expected: not registered); About card mismatch never shown after an update.
4. Microphone, Recite and return-to-lesson; audio playback.
5. Mushaf Learn and Recall panel scrolling and touch targets; Revise mode; tracker.
6. IndexedDB persistence across force-stop and restart; save-warning behaviour when storage is full.
7. The 404 page (now bundled) renders for an unknown route.

**Full runtime parity is not claimed until these pass on a real phone.**

## Files changed in this audit

- `scripts/build-android.ps1`: identity, stamping, verification, unique output, versioning.
- `scripts/build-info.mjs`: new; stamp and APK verifier.
- `android/app/build.gradle`: versionCode/versionName from the build; `ignoreAssetsPattern` fix.
- `android/app/src/main/java/com/hifzcompanion/MainActivity.java`: read-only `AndroidApp` version bridge.
- `src/components/BuildInfo.tsx`: new; About card.
- `src/app/profile/page.tsx`: mounts it.

**Not changed:** Quran data, scheduling rules, map approval data, cloud schema; no Supabase deployment.
