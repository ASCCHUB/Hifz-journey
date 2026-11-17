# Stage 4 — Live Recitation on the Mushaf

Date: 2026-11-14

## ASR audit

- The local `tarteel-ai/whisper-base-ar-quran` service accepts short PCM audio requests. The app captures audio continuously, sends completed speech chunks after pauses (or at a forced cut), and can request provisional text while listening.
- It returns transcript text and a recognizer confidence estimate, but no reliable word timestamps. Its confidence describes recognition certainty, not recitation correctness. The existing aligner compares transcript words with canonical Quran words; that is lexical alignment, not acoustic alignment.
- Browser Web Speech and the Android `SpeechRecognizer` bridge also return interim/final transcript segments without word timestamps.
- Stage 4 therefore does not highlight words while the learner is speaking. It aligns final transcript segments after Stop and labels every result as advisory.

## Implemented interactions

- Added a recitation control to the Mushaf page. Start opens the microphone only after the learner taps it. The page and current Read/Learn/Recall state stay mounted; elapsed time, recording indicator, Stop and Cancel controls appear above the Quran lines so they do not cover them.
- After Stop, Read and Learn show post-recording word feedback on the Mushaf and a review list for possible mismatches, skips, unclear recognition and unmatched transcript words. Learners can mark a finding as recited correctly or confirm a possible slip. Those choices are temporary review state and do not save Hifz progress.
- The unrecited tail stays pending and is not labeled as skipped. Recognition suspicions are never treated as confirmed mistakes, and no Tajweed or pronunciation judgment is claimed.
- Recall keeps concealed Quran words and transcripts out of both the page and its accessibility feedback. Microphone feedback counts as help for the current Recall Ayah; it does not create a rating. Revise uses the existing hidden-ayah Practice screen and records microphone feedback as help for its current step. Existing assessment and scheduling code remains the only source of Hifz evidence.
- Microphone tracks stop immediately when the session ends, is canceled, or the page unmounts. Browser recognition waits briefly for final transcript delivery on Stop. Permission, unavailable-recognizer and server errors are surfaced in the control panel.
- The `/recite` route, Quran text, 15-line page metadata, storage, Supabase schema, teacher-review states and PDF content were not changed.

## Android and privacy

- Android continues to use the existing native speech bridge and requests microphone permission after the user starts recording. The local model at `127.0.0.1` is treated as unavailable unless the device itself can reach it; the UI does not assume the desktop speech server is accessible from a phone.
- On desktop with the local server connected, PCM chunks go to that local server and are processed in memory. With browser/phone recognition, the browser or speech provider handles the audio and may send it to its service; the app does not save a recording.
- Reading and memorization flows remain offline-capable. Speech recognition requires a compatible recognizer and may require a network connection.
- No physical Android device was available for runtime verification.

## Files changed

- `src/components/MushafRecitation.tsx` — in-page microphone session, timer, cancellation, post-recording review and privacy behavior.
- `src/lib/mushafRecitation.ts` — final-segment alignment and feedback labels/gates.
- `src/lib/quranAsr.ts` — stop microphone tracks before waiting for queued inference; flush browser final results on Stop.
- `src/app/mushaf/page.tsx` — mounts the recorder without leaving the current Mushaf state.
- `src/components/Practice.tsx` — adds the advisory microphone check to the existing Revise/Practice step and counts reviewed feedback as help.
- `src/app/globals.css` — accessible status colors and compact mobile controls.
- `scripts/test-mushaf-recitation.mjs`, `package.json` — focused alignment, privacy, speech-session and error tests.
- `CODEX_STAGE_4_LIVE_MUSHAF_RECITATION_REPORT.md` — this report.

## Verification

- TypeScript: `npx tsc --noEmit` passed; the optimized Next.js static export compiled and generated all 13 routes.
- Focused recitation checks: 6/6 passed (alignment, pending passage tail, Recall/Revise privacy, advisory findings, browser/Android final-result flush, permission denial and unavailable local server).
- Hifz: 24/24 passed.
- Phase 3: 56/56 passed.
- Storage: 17/17 passed.
- Sync guard: 15/15 passed.
- Reference PDFs: 7/7 passed.
- Journey: 13/13 passed.
- Navigation: 10/10 groups passed.
- Quran integrity validation compared all 6,236 Ayahs and reported the two known reference differences at 2:72 and 11:41. It exited with status 1 as designed; Quran source data was not modified. The differences are recorded in `scripts/quran-reference-differences.csv`.
- A real browser/microphone end-to-end check and 360 px screenshot were not completed: the Windows computer-use preview could not verify the browser URL and stopped. The focused speech tests use a fake Web Speech engine.
- Desktop preview follow-up: the screenshot's unstyled Home icon was caused by the old dev server on port 3000 returning 404 for its CSS and JavaScript chunks. That server was stopped and the updated source was restarted on port 3000 with its own dev asset directory. The Mushaf route now returns HTTP 200, its stylesheet returns HTTP 200, and all 6 referenced JavaScript chunks return HTTP 200. Reload the desktop app window to pick up the corrected assets; a visual reload was not verified in the browser tool.

## APK

- Fresh APK: `../Hifz-Companion-20261114-1553-5ea052-debug.apk`
- Frontend build ID: `20261114-1553-5ea052`
- Frontend fingerprint: `750f4463a69f77a8`
- Application ID remains `com.hifzcompanion`; build version code: `1510073`.
- APK verifier passed: 262 frontend files, zero missing, zero stale, and packaged bytes match the static export fingerprint.
- Runtime behavior on a physical Android device remains unverified.
