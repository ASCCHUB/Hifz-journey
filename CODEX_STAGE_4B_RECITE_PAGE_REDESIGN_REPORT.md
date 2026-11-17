# Stage 4B Recite Page Redesign Report

Date: 2026-11-14

## Result

`/recite` now opens directly on the existing canonical 15-line Madani Mushaf reader. It retains the current page and lesson handoff behavior, while passage selection and Recite Anywhere remain secondary options. `/mushaf` continues to use the same shared reader.

## Implemented interactions

- Direct `/recite` landing renders the Mushaf and a prominent microphone control. The existing recording implementation is reused.
- Compact previous/page/next and Surah navigation are available on the Recite landing. Page navigation keeps the `/recite` route.
- Distraction-free mode conceals Quran words in-place, preserving line spacing and page layout. Concealed words are removed from the accessibility tree. The toggle does not unmount the recorder.
- `Choose passage` exposes the existing passage form and history. Existing exact lesson handoffs (`s` and `return`) still open their selected range; validated `returnTo` paths return to the original Mushaf/Recite context.
- Existing recitation review, cancellation/error handling, privacy messaging, and mode-specific evidence protections remain in the shared recorder. The old passage-recitation route remains available through the secondary entry.

## ASR behavior and limits

The current ASR service can stream audio chunks to its server, but it does not provide reliable acoustic word timestamps or genuine streaming word-level recognition. The app therefore evaluates the completed recording and shows post-recording advisory feedback. Possible differences remain suggestions for learner confirmation; no Tajweed assessment is claimed. Existing server/network availability and microphone permission limitations remain, especially on Android WebView.

## Changed files

- `src/components/MushafReader.tsx` — shared existing Mushaf reader with the Recite landing, navigation, concealment, and secondary links.
- `src/app/mushaf/page.tsx` — thin route wrapper for the shared reader.
- `src/app/recite/page.tsx` — defaults to Mushaf; keeps exact handoffs and passage chooser routing.
- `src/components/RecitePassage.tsx` — previous passage form retained as the secondary flow with safe return handling.
- `src/components/MushafRecitation.tsx` — direct-start microphone behavior for the Recite landing.
- `src/app/globals.css` — compact Recite controls and narrow-screen wrapping rules.
- `CODEX_STAGE_4B_RECITE_PAGE_REDESIGN_REPORT.md` — this report.

No canonical Quran text, 15-line metadata, IndexedDB progress schema, Supabase migrations, teacher approvals, or mind-map PDFs were intentionally modified.

## Verification

- `npx tsc --noEmit`: passed.
- `test:mushaf-recitation`: 6/6 passed.
- `test:navigation`: 10/10 groups passed.
- `test:hifz`: 24/24 passed.
- `test:phase3`: 56/56 passed.
- `test:storage`: 17/17 passed.
- `test:sync-guard`: 15/15 passed.
- `test:refpdfs`: 7/7 passed.
- `test:journey`: 13/13 passed.
- `validate:quran`: reports two pre-existing source/reference differences, at 2:72 and 11:41 (exit code 2). The app Quran source was not changed. Details are in `scripts/quran-reference-differences.csv`.
- `npm run build:android`: optimized Next.js production build and Android Gradle build succeeded.

## Browser and device checks

Desktop and 360px screenshots could not be captured in this run. The Windows computer-use session listed the open VS Code/Chrome apps, but its browser access host was unavailable, so URL navigation and viewport capture could not be performed. The responsive CSS and automated navigation/layout-related checks ran, but visual browser verification is unverified. No physical Android device test was performed; Android WebView microphone permission and recording behavior remain unverified on-device.

## APK and frontend parity

- APK: `../Hifz-Companion-20261114-1833-81d4d6-debug.apk`
- Frontend build ID: `20261114-1833-81d4d6`
- Build fingerprint: `350dc349564233da`
- Version code: `1510233`
- Parity verifier: 264 frontend files checked, 0 missing, 0 stale, byte-for-byte match.
- The existing package ID and debug signing setup were used. No learner data migration was introduced.
