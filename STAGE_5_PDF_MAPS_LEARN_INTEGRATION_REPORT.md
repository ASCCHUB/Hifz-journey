# Stage 5 PDF Mind Maps Learn Integration Report

Date: 2026-11-14

## Outcome

The existing locally imported reference PDFs can now be opened from Smart Hifz Tutor while learning on the Mushaf. The feature reuses the existing `ReferencePdfMaps` viewer, local IndexedDB storage, and existing guided lesson engine.

## Implemented behavior

- During guided Learn preparation (Listen, Understand/Read, and text-fade preparation), the current active Ayah is resolved to a Juz using canonical Quran metadata.
- A compact **Visual Memory Map · View Juz Mind Map** action appears only when that Juz is supported and its PDF is imported on this device. Supported PDFs are Juz 1–5, 26, and 28–30.
- Matching uses the active Ayah, not the page’s starting Juz. The shortcut is absent during recall/test steps and when the corresponding PDF is unavailable.
- The action opens the dedicated `/reference-map` viewer with the exact Mushaf return URL. Lesson step, Ayah portion, difficulty, and progress remain in the existing lesson state. **Return to Learning** returns without advancing or restarting.
- The viewer preserves its existing per-Juz PDF page and zoom position. It opens at the last viewed PDF page (or page 1 on first use). No Ayah-to-PDF-page mapping is claimed.
- If a learner opens a reference PDF from the Maps page during an active recall step, a session-only marker records assistance for that exact lesson step. A later correct rating is saved as needing help under existing lesson evidence rules.
- Reference PDFs remain in their separate local database, are not uploaded or synced, are not teacher-reviewed, and are not included in the APK. No PDF interpretation or Tafsir extraction was added.

## Files changed

- `src/components/MushafLesson.tsx` — active-Ayah matching, conditional preparation action, lesson return context, and recall assistance handling.
- `src/components/ReferencePdfMaps.tsx` — launch directly into an imported Juz PDF, return action, and session assistance marker.
- `src/app/reference-map/page.tsx` — focused viewer route with validated Mushaf return path.
- `src/lib/refPdfLearn.ts` — matching and return URL helpers.
- `src/lib/refPdfs.ts` — shared session marker keys; existing local-only PDF storage remains intact.
- `scripts/test-refpdf-learn.mjs` — targeted Juz matching and return-context checks against the canonical Quran metadata.
- `package.json` — `test:refpdf-learn` script.
- `STAGE_5_PDF_MAPS_LEARN_INTEGRATION_REPORT.md` — this report.

No Quran text, Mushaf page metadata, progress schema, cloud migrations, teacher statuses, or bundled PDF files were changed.

## Verification

- `npx tsc --noEmit`: passed.
- `test:refpdf-learn`: 4/4 passed, including Juz 1, Juz 30, no-import behavior, and the Juz 4 boundary where Ayahs 3:92 and 3:93 share page 62 but resolve to different Juz PDFs.
- `test:refpdfs`: 7/7 passed, including device-local import/open/remove, separate storage, offline behavior, and saved page/zoom position.
- `test:mushaf-recitation`: 6/6 passed.
- `test:navigation`: 10/10 groups passed.
- `test:hifz`: 24/24 passed.
- `test:phase3`: 56/56 passed.
- `test:storage`: 17/17 passed.
- `test:sync-guard`: 15/15 passed.
- `test:journey`: 13/13 passed.
- Quran integrity validator compared 114 Surahs and 6,236 numbered Ayahs; it reports two existing source/reference differences at 2:72 and 11:41. The Quran dataset was unchanged. Details: `scripts/quran-reference-differences.csv`.
- Local HTTP check for `/reference-map?juz=30&returnTo=...`: HTTP 200.
- Windows browser automation was unavailable because the browser access host could not be reached. Therefore the rendered browser flow, desktop screenshot, and 360px layout were not visually verified.

## Android and APK

- Production Next.js export and Android Gradle build succeeded.
- Fresh APK: `../Hifz-Companion-20261114-1856-c98751-debug.apk`
- Frontend build ID: `20261114-1856-c98751`
- Fingerprint: `ee6da8fe529e9133`
- Version code: `1510256`
- APK parity verification: 268 frontend files checked; 0 missing, 0 stale, byte-for-byte match.
- The Android bundle contains the viewer code and pdf.js assets but no learner-imported original PDFs.
- No physical Android device was available. WebView local IndexedDB persistence, imported PDF rendering, and hardware Back navigation still require physical-device verification. The viewer return uses app navigation and preserves the original Mushaf URL for the WebView history.

