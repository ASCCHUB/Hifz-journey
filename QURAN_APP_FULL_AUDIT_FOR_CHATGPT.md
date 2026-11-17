# Quran App Full Audit for ChatGPT

Audit scope: source-level review of this project folder as inspected on 2026-11-13. This report does not claim every route or device path was exercised. No application source, Quran data, dependency, Android file, build output, or existing report was modified. The only new file requested is this report.

## 1. Executive Summary

This is a substantive Quran reading and memorization application built with Next.js 14, React 18, TypeScript and Tailwind. It also has a PWA/offline layer and a native Android WebView wrapper. Routes exist for Home, Mushaf, Recite, My Hifz Journey, Visual Maps, Profile and Login.

The strongest implemented areas are the bundled Quran reading data, page-based reading experience and per-Ayah manual Hifz practice. The app includes a 604-page, 15-line Madinah layout reconstruction, Surah/Juz/page selection, search, bookmarks, last-page continuation, audio, hidden-text practice, self-rated mistakes, due/weak queues, custom passages, progress charts, local backup and optional Supabase sync.

The most important confirmed gaps:

- Navigation has no Hizb or Rub' al-Hizb/quarter metadata or selector. Ayah search opens its containing page but does not focus that Ayah.
- The Mushaf reconstructs pages from word-count line metadata; it is not a scan/publisher-certified page image with exact word coordinates. No fullscreen mode, notes or alternate Mushaf layout was found.
- A local Quran-specific Whisper model and Python inference server are present under speech-server/, including local weights and a Python environment. However, the Recite UI is not connected to that server: active app recognition still uses generic browser Arabic speech recognition on web and generic Android SpeechRecognizer in the APK. Matching is heuristic, not validated Quran mistake detection.
- Manual Hifz outcomes update Ayah records, weak tracking and revision schedules. Live speech summaries do not update memorization outcomes.
- Quran text comparison output lists two differences against the pinned King Fahd Complex v2.0 reference, at Al-Baqarah 2:72 and Hud 11:41. The project says a qualified Hafiz should review them; neither dataset should be auto-edited.
- No test files/test script were found. README says live Supabase, audio and offline audio behavior were not tested. This audit did not operate a phone, grant mic access, test recitation audio, or visually inspect every screen at multiple sizes.

Overall: a strong foundation for Quran reading and personal Hifz; not yet a validated Quran-recitation recognition system. Priorities are reviewed Hizb/quarter data and navigation, Mushaf visual validation, then evidence-led ASR integration.

## 2. Project Technology and Architecture

### Stack and platforms

- Web: Next.js 14 App Router, React 18, TypeScript 5 and Tailwind CSS 3. See package.json, next.config.mjs and src/app/layout.tsx.
- PWA: public/manifest.webmanifest and public/sw.js; service worker registration is in src/components/Shell.tsx and only runs in production.
- Android: local native Android app (application ID com.hifzcompanion) wraps exported static web assets in a WebView. See android/app/src/main/java/com/hifzcompanion/MainActivity.java, android/app/src/main/AndroidManifest.xml, android/app/build.gradle and scripts/build-android.ps1.
- No iOS native project was found. Web/PWA may run on mobile browsers; iOS native functionality was not found.
- Styling: Tailwind and custom design tokens in src/app/globals.css; bundled KFGQPC Uthmanic Hafs WOFF2 font in public/fonts/UthmanicHafs1Ver18.woff2; other interface fonts are fetched from Google Fonts in src/app/layout.tsx.

### Entry points and architecture

- Shared layout/shell: src/app/layout.tsx and src/components/Shell.tsx.
- App Router routes: src/app/page.tsx (Home), mushaf/page.tsx, recite/page.tsx, memorize/page.tsx, mind-maps/page.tsx, profile/page.tsx and login/page.tsx.
- Shell has six main destinations, desktop sidebar and mobile bottom bar. It loads core Quran data before rendering route content.
- Mushaf page uses query route /mushaf?p=N; search can open via /mushaf?search=1.
- Quran access: src/lib/quran.ts. State: src/lib/store.ts. Hifz scheduling: src/lib/hifz.ts. Goals: src/lib/goals.ts. Visual map definitions: src/lib/mindMaps.ts. Audio: src/components/Audio.tsx. Auth/sync: src/lib/supabase.ts and supabase/schema.sql. Bundled Quran datasets: public/data/.
- A separate local ASR prototype exists in speech-server/server.py and speech-server/start.ps1; model weights/config/tokenizer are in speech-server/model/ and a Python environment is in speech-server/.venv/. It is not wired into the Next.js Recite client.

### Build and checks

package.json scripts: dev, build, build:android, start, lint and validate:quran. No test script or test/spec files found. Android script exports the Next app and invokes Gradle debug assembly from local SDK/cache. An APK artifact exists at android/app/build/outputs/apk/debug/app-debug.apk (about 3.0 MiB, debug variant); a pre-existing artifact does not establish current release or device behavior.

scripts/build-android.ps1 removes and replaces generated Android web assets and removes out after success. This audit did not run it.

## 3. Complete Screen and Feature Inventory

| Screen/component | Source-visible functionality | Evidence and limits |
|---|---|---|
| Home | Greeting/date, daily Ayah/translation, continue card, daily targets, streak, weekly activity, goals | src/app/page.tsx; continue uses saved page, not exact Ayah |
| Mushaf | 604-page reconstruction, page/Juz/Surah selection, search, swipe, zoom, audio, Ayah sheet, bookmarks/favourites, memorization overlay | src/app/mushaf/page.tsx; src/lib/quran.ts; src/components/AyahSheet.tsx |
| Recite | Same-Surah range up to 100 Ayahs; manual self-check; generic live transcription; recent summary | src/app/recite/page.tsx; src/lib/androidSpeech.ts; transcript itself is not persistent |
| My Hifz Journey | Recommendations, due revision, weak drill, recovery assessment, custom cross-Surah range, Surah/Juz tracker, charts/goals | src/app/memorize/page.tsx; src/lib/hifz.ts |
| Visual Maps | Three authored maps: Al-Fatihah, Al-Baqarah 1-5 and 21-29; colored branches, Arabic, translations, hide/reveal, order/match quizzes, status/schedule and print view | src/lib/mindMaps.ts; src/app/mind-maps/page.tsx; curated sample only |
| Profile | Account/sync status, metrics, heatmap, goals, bookmarks, theme/translation/reciter/page target, backup/restore, source notes | src/app/profile/page.tsx |
| Login | Email/password and Google OAuth when configured; guest-only explanation when not | src/app/login/page.tsx; live Supabase auth is unverified per README |
| Audio player | Seven reciters, play/pause, next/previous, repeat modes, speed, media-session hooks, attempt to save whole Surah offline | src/components/Audio.tsx; hosted at everyayah.com, offline behavior unverified |
| Shared controls | Navigation, Quran load gate, Ayah detail sheet, search, progress visualizations | src/components/Shell.tsx; SearchDialog.tsx; AyahSheet.tsx |

Practice and audio components are reused. No obvious duplicate route implementation was found. Source review is not visual QA.

## 4. Quran Navigation Audit

Status is based on source evidence, not independent usability testing.

| Requirement | Status | Evidence / gap |
|---|---|---|
| Open by Surah (114) | WORKING | Mushaf selector lists all Q().n items and opens pageOf(s,1); quran.json contains 114 metadata entries. |
| Open directly at an Ayah | PARTIAL | Search accepts Surah:Ayah and opens its page; no Ayah-focused URL/scroll/highlight after page opens. |
| Open by Juz (30) | WORKING | Mushaf selector and progress use public/data/juz.json boundaries. |
| Open by Hizb (60) | MISSING | No boundary data/helper/selector found. |
| Open by Rub' al-Hizb / quarter (240) | MISSING | No quarter data/helper/selector found. |
| Open by Mushaf page (604) | WORKING | Page input, previous/next, swipe, and /mushaf?p=N. |
| Jump directly to a Quran location | PARTIAL | Search handles Surah, Arabic terms and numeric locations; numeric-only queries can be ambiguous among Surah/Juz/page. No Hizb/quarter. |
| Navigate between Surahs and Ayahs | PARTIAL | Page navigation, Surah picker, Ayah sheet and audio next/previous. No Ayah-by-Ayah navigation controls in read mode. |
| Navigate between Mushaf pages | WORKING | Previous/next buttons and horizontal swipe at base zoom. |
| Accurate Juz/Hizb/quarter/page boundaries | PARTIAL | Page and Juz datasets exist; Hizb/quarter absent. Page dataset provenance/check is described in README, but publisher certification was not found. |
| Continue last reading location | PARTIAL | Stores lastPage; Home resumes that page. Exact Ayah/word location is absent. |
| Save/reopen bookmarks | PARTIAL | Ayah sheet saves bookmark/favourite and Profile links to its page; bookmark does not reopen focused at that Ayah. No notes/collections. |
| Recent reading positions | MISSING | History is session-oriented and Mushaf page reads are filtered from Recite's recent list; no reading-location history screen. |
| Search Surah names and Quran text | WORKING | quran.ts search supports Latin Surah names, normalized Arabic, Quran Arabic words, numeric page/Juz/Surah and Surah:Ayah. Limited to 60 Ayah hits; no English translation search. |
| Start memorization/recitation from selected location | PARTIAL | Mushaf Ayah sheet offers practice; Hifz range can start anywhere. Recite has separate Surah/range selector, not arbitrary reader selection/deep link. |
| Select passage/custom Ayah range | WORKING | Hifz supports cross-Surah start/end and chunks sessions; Recite supports same-Surah range up to 100 Ayahs. |

### Quarter metadata

src/lib/quran.ts core shape is {n,v,lay,juz}. quran.json has Surah metadata and verses; layout.json has page starts and line word counts/special markers; juz.json has 30 start/end pairs. No Hizb/quarter mapping or helper exists. Therefore current data is insufficient for accurate quarter/Hizb selection. Add an edition-specific, reviewed mapping with provenance; do not estimate quarter boundaries by equal Ayah counts.

## 5. Mushaf Reader Audit

- It is a page-based reconstruction, not a continuous scrolling Quran. pageContent(pg) in src/lib/quran.ts rebuilds one page from its start Ayah and line word counts; mushaf/page.tsx renders one page at a time with CSS flex distribution.
- It is more than plain text, but not a scan or page image with exact stored word coordinates. Page geometry depends on available width/font fitting.
- Uthmani text is from public/data/quran.json and rendered with bundled KFGQPC Uthmanic Hafs font. Matching normalization is for search/speech only, not display.
- Quran text region is RTL; ayah numbers follow final words. Layout markers render Surah headings and Bismillah lines.
- 604 pages, page buttons and horizontal touch swipe; Juz and Surah selectors; search; selected Ayah sheet with translation, Tafsir, audio, bookmark/favourite and practice.
- Current playing Ayah is highlighted; memorize mode hides words and lets user reveal words/Ayah or flag mistakes. Word marks are manual, not Tajweed.
- Zoom buttons and pinch gesture range 1x-4x. Theme is auto/light/dark. No separate Arabic font size setting, fullscreen, page-curl animation, alternate Mushaf edition, scanned-page mode or notes found.
- Last page persists, not exact Ayah/word; bookmark per Ayah exists but does not focus that Ayah on reopen.
- Accessibility: focus-visible outline and some ARIA labels are present. Root html uses lang=en and LTR while Quran passages declare RTL. No screen-reader or keyboard/device accessibility tests were performed.

Classification: a page-based 604-page/15-line text reconstruction, not a simple scroll reader, but not proven pixel-faithful publisher artwork.

## 6. Live Recitation and AI Audit

### Implemented pipeline

1. Recite page chooses a Surah and Ayah range (maximum 100) in src/app/recite/page.tsx.
2. Web uses browser SpeechRecognition/webkitSpeechRecognition, language ar-SA, continuous and interim results.
3. Android uses android/app/src/main/java/com/hifzcompanion/MainActivity.java with Android SpeechRecognizer; src/lib/androidSpeech.ts adapts the native JavaScript bridge to a SpeechRecognition-shaped API. Android manifest requests RECORD_AUDIO and Java code requests runtime permission.
4. Partial/final phrase text and optional provider confidence are received. Final segments persist during the active overlay; latest partial is separate. Engine restarts after final/end.
5. normA strips marks/punctuation and normalizes Arabic letters. The aligner advances sequentially with limited lookahead and edit-distance similarity >= 0.84. A later match can flag preceding expected words as possible missing. UI labels fuzzy/missing/uncertain/repeated rather than changing the reference or claiming definitive error.
6. Current position follows next expected word/Ayah; “repeat current Ayah” uses audio playback.

### Model and accuracy findings

- tarteel-ai/whisper-base-ar-quran: present locally and configured in the separate Python server. Evidence: speech-server/model/pytorch_model.bin (about 290 MB), config/tokenizer files, server.py default MODEL_ID, and installed torch/transformers packages in speech-server/.venv. The server prefers the local model directory when config.json exists and otherwise defaults to the Hugging Face ID. Its /health response reports a pinned revision, but no weight hash/provenance manifest was found.
- Is the model used by the app? No. src/app/recite/page.tsx calls the browser-shaped SpeechRecognition API; src/lib/androidSpeech.ts routes Android to the AndroidSpeech bridge. No client code in src/ captures/chunks audio and POSTs it to server.py /transcribe. Current web/Android UI therefore does not use the installed Quran model.
- server.py accepts 16 kHz mono PCM16 request bodies up to 28 seconds, detects near-silence and runs Whisper inference on CPU. It derives mean token probability as rough recognition confidence, explicitly not recitation correctness. The model card README is incomplete/generated and its model-index results are empty; no app-specific benchmark was found. Installed model is not proof of adequate recitation accuracy.
- A start script exists. Server defaults to 127.0.0.1; start.ps1 -Lan binds 0.0.0.0 for same-network access. No auth or TLS is visible in server.py. Review access control before exposing it on a LAN or connecting mobile clients.
- speech-server has no visible requirements/lock file or setup README, although start.ps1 refers to speech-server/README.md when its local environment is missing. The existing .venv makes it runnable in this workspace; reproducible setup elsewhere is unverified.
- No MediaRecorder/PCM capture/chunking/client integration in the Next app, streaming protocol, or word timestamps. The separate server is request/response (up to 28-second chunks), but no code currently sends audio to it. Active recognition remains delegated to browser/device service. Android emits phrase-level partial/final text and restarts its platform recognizer. Latency was not measured.
- Incorrect/correct detection is not validated. Exact normalized match can be shown as aligned; fuzzy match, omissions, repeats and unmatched speech are heuristics. No model benchmark, calibration or false-positive/negative evaluation is included.
- A later recognized word can trigger a “possible omission”; this could be ASR omission or aligner error. Repetition may be intentional. Engine confidence is generic and often absent; no confidence is not certainty.
- Pause/resume/retry exist. Retry archives the prior text in overlay component state and resets from the current Ayah. Stop stores only a session summary, not transcript/audio; closing/reloading loses transcript.
- Permission, missing microphone, network and generic errors have messages. Actual device behavior is unverified.
- Browser provider may process audio outside this app; UI says so. Android delegates to the installed recognition service, whose provider/offline/privacy behavior depends on device configuration.
- No Tajweed model/detection found.

Conclusion: useful live Arabic transcription aid with advisory text alignment. It cannot be described as validated Quran-specific mistake detection, reliable wrong/skipped-word classification or Tajweed checking.

## 7. Hifz and Revision Audit

- Per-Ayah record keyed Surah:Ayah in src/lib/store.ts: due dates, interval, last practice, reps, successes/failures, confidence-like user mark fields and history.
- src/components/Practice.tsx has read/listen for new Ayahs, hide-text recall, guided next-word hints, reveal/check and self-rating Mistake/Hesitated/Correct.
- src/lib/hifz.ts:applyResults updates learner-rated results. Success intervals: 1, 3, 7, 14, 30, 60 days on successful days. Hesitation/mistake schedules a short retry and weak status; weak drill clears after three clean days.
- dueRuns/dueCount/weakDue/nextLesson produce revision queue, weak drill and new lesson.
- Tracker covers all 114 Surahs and 30 Juz; explicit “already memorized” marks; diagnostics reveal no text and are split into sessions of up to 30 Ayahs.
- Custom Hifz range can cross Surahs; sessions are chunked. Recite separately limits ranges to one Surah and 100 Ayahs.
- Activity/history stores aggregate Ayah/page/session counts, not full recitation transcript or audio. Profile includes goals, weekly/12-week activity and backup/restore.
- Mind map progress/status/scheduling is separate from per-Ayah mem records.
- Speech alignment does not call applyResults and does not update mem/weak/due schedule. It records aggregate Follow-along transcript history. This avoids converting uncertain ASR into learner-confirmed mistakes.

Limitations: results are manually rated; “Correct” is not externally verified; no Tajweed or speech-derived score.

## 8. UI/UX and Android Audit

### UI and mobile

- Home is a compact dashboard; continue action is page-only.
- Mushaf has dense Arabic layout and responsive font fitting; no screenshot/device legibility validation was available.
- Recite separates live transcription and fixed reference, shows mic status/timer/control states. Accuracy remains generic ASR.
- Hifz page combines recommendation, revision, trackers and analytics; feature-rich but may have learning curve.
- Profile has appearance, translation, reciter and daily page target; no speech engine/privacy/language or accessibility font settings.
- Quran panels use RTL; html and PWA manifest are English/LTR. Urdu Nastaliq is requested from Google Fonts with system fallback; offline quality is unverified.
- Tailwind breakpoints, desktop sidebar and six-item mobile bottom bar exist. Six columns may be crowded on narrow screens; risk to verify visually, not a confirmed defect.
- Focus outline and some accessible labels exist. Keyboard, screen-reader order/pronunciation, contrast and dynamic font-size behavior not tested.
- No current route screenshots/device recordings were supplied for this audit; visual behavior on hardware is unverified.

### Android wrapper

- MainActivity creates local WebView and serves bundled assets from appassets.androidplatform.net; JavaScript/DOM storage are enabled. It rewrites Next _next paths to next because Android asset merging filters underscore-prefixed paths.
- Manifest requests INTERNET, RECORD_AUDIO and MODIFY_AUDIO_SETTINGS. minSdk 24, targetSdk 35, compileSdk 36. Runtime microphone permission logic exists.
- Android SpeechRecognizer availability, installed language pack and network behavior depend on device/OS service.
- Activity is portrait-locked. No native Android screen/navigation/settings UI or tablet layout was found.
- WebView localStorage uses appassets origin and should not be assumed to share guest data with an HTTPS website origin. Use configured account sync or explicit backup/restore for transfer.
- Service worker caches same-origin core pages/data/font/icons and proxies audio cache. Audio.tsx uses no-cors fetch for offline audio; README warns offline behavior/seeking are untested.
- Local debug APK exists; no production signing/release AAB/Play deployment configuration or actual device verification was found.

## 9. Feature Comparison Matrix

This compares only with the target requirements supplied by the user. It does not claim access to Tarteel source code or private features.

| Category | Status | What works | Missing / needs improvement | Dependencies |
|---|---|---|---|---|
| Quran navigation | PARTIAL | Surah, Ayah search, Juz, page, swipe | Hizb/quarter, Ayah focus/deep link, recent positions | Reviewed edition-specific boundary data and picker |
| Mushaf | PARTIAL | 604-page/15-line reconstruction, Hafs font, RTL, markers, zoom | Exact rendering validation, fullscreen, alternate layouts/accessibility QA | Trusted layout provenance/license and device visual testing |
| Bookmarks | PARTIAL | Per-Ayah bookmarks/favourites and profile list | Exact-Ayah restoration, notes, collections | Store schema migration and focus route |
| Recitation | PARTIAL | Generic Arabic browser STT and native Android SpeechRecognizer | Evaluated Quran ASR, privacy/offline plan, engine settings | Model/service decision, test audio set, backend only if cloud |
| Word alignment | PARTIAL / NOT VALIDATED | Normalization, sequential fuzzy match, possible omission/repeat/uncertain cues | Calibrated Quran word alignment and false positive/negative results | Quran ASR and aligned recitation evaluation corpus |
| Memorization | WORKING for manual self-check | Hidden/reveal, hint, user-rated results, ranges | Connect reader selection smoothly; ASR not an objective mark | Existing Practice/store reusable |
| Revision | WORKING for manual outcomes | Due queue, intervals, weak drill, tracker | Validate schedule; do not use unconfirmed speech errors | hifz scheduler, learner confirmation |
| Session history | PARTIAL | Recent summary rows and counts | Transcript/audio/word timeline and replay | Explicit consent/storage design |
| Progress | WORKING for current local metrics | Ayah/Surah/Juz, goals, streak/activity, history | Verified recitation accuracy metrics | Stable state schema and metric definitions |
| Settings | PARTIAL | Theme, translation, reciter, page target, quiz prefs | Accessibility font/layout and ASR/privacy/language prefs | UI/state additions and ASR decision |

## 10. Existing Quran Data and Metadata Analysis

| File | Schema / purpose | Assessment |
|---|---|---|
| public/data/quran.json | n: 114 tuples [Arabic name, English name, count, type]; v: 114 verse arrays, 6,236 total | About 1.35 MB. Fixed Arabic display/reference. |
| public/data/layout.json | 604 page records [starting Surah, Ayah, per-line word counts and special markers] | Enough for current line reconstruction; not exact word coordinates or page images. |
| public/data/juz.json | 30 [[start Surah,Ayah],[end Surah,Ayah]] pairs | Juz navigation/progress. |
| public/data/tr-en-sahih.json | Nested translation arrays | Loaded on demand. |
| public/data/tr-ur-maududi.json and tr-ur-jalandhry.json | Urdu translation arrays | Loaded on demand. |
| public/data/tafsir-ar-muyassar.json | Tafsir arrays | Bundled separately from translation. |
| scripts/reference/UthmanicHafs_v2-0 data/hafsData_v2-0.json | Pinned publisher developer data | Hash/provenance in scripts/reference/README.md. |
| scripts/quran-reference-differences.csv | Existing comparison output | Two differences (2:72, 11:41); read-only in this audit. |
| Missing | No Hizb/quarter table found | Needed for accurate picker/progress. |

The app Quran file's SHA-256 matches the recorded baseline: fab6e90867736262658b840b28b91aaab46ade99b058531e2cdc072931201680. scripts/validate-quran.mjs compares 6,236 Ayahs with the pinned reference and writes a CSV. It preserves Arabic letters/marks in comparison except documented whitespace/tatweel/reference display-glyph handling. Existing output reports two differences. Matching the local hash proves only that the reviewed snapshot has not changed, not that it is publisher-certified or that every mark is correct. No edit to public/data/quran.json is recommended without qualified review.

## 11. Technical Problems and Risks

### Confirmed

1. No Hizb/quarter data or navigation.
2. A Quran-specific model/server exists locally, but the live UI is not integrated with it; active recognition remains generic web/device speech service. Python environment setup is not reproducible from a checked-in requirements/lock file, and the referenced setup README is absent.
3. Alignment is heuristic; no validation results.
4. Live speech does not update Ayah Hifz records and full transcript is not persisted.
5. Last reading state is page-only; no recent reading-location list.
6. Reader page is reconstructed from line word counts, not exact coordinates/page images.
7. Existing Quran comparison output lists 2:72 and 11:41 differences from pinned reference.
8. No automated test files/test script found; README discloses live Supabase/audio/offline limitations.
9. PWA/root language and direction are English/LTR while Arabic regions are RTL.
10. Android has debug build setup, not release signing configuration.

### Risks to verify, not established failures

- Generic ASR could mishear correct recitation, cadence, repeats or background noise; heuristic alignment could show false omissions.
- Android recognition depends on OS service/language support; whether it is offline or cloud-processing is device-specific.
- Guest progress may not transfer between web HTTPS and appassets origins.
- Google-served fonts may be unavailable offline; check fallback appearance.
- Opaque cross-origin audio cache may not support seeking uniformly.
- Narrow mobile, tablet, landscape, accessibility and screen-reader behavior are unverified; Android forces portrait.
- Verify layout/translation licenses before distribution. README says review Tanzil terms for commercial use and KFGQPC font license before publishing.
- Store v1 and whole-snapshot timestamp sync need safe schema migration/conflict testing for future changes.
- normA intentionally collapses Arabic distinctions for search/comparison; never treat it as canonical text or proof of a Quranic mistake.

## 12. Recommended Development Roadmap

### Phase 1 — Complete Quran navigation

Source an edition-specific reviewed mapping for Juz/Hizb/quarter starts/ends and record provenance/license. Extend core data without touching Quran text. Add unified location picker and exact Surah/Ayah deep link that focuses the selected Ayah after page render. Make numeric search ambiguity explicit. Validate every boundary. Reuse quran.ts helpers, current Mushaf selectors and search.

### Phase 2 — Professional Mushaf reading interface

Confirm 604-page Madani edition and use trusted licensed exact coordinates/page art or validate current line metadata against references. Compare every page across mobile/desktop, including headers, Bismillah, verse markers, boundary Ayahs and font. Add fullscreen, independent Arabic font sizing, improved page turn and accessible selected-Ayah semantics. Never use OCR/AI to replace Quran text. Reuse bundled font, layout/page composition, AyahSheet, audio and theme.

### Phase 3 — Bookmarks, recent locations and custom ranges

Persist exact Surah/Ayah/word position and reading history. Restore bookmark focus, then consider notes/collections. Allow selected reader passages to flow to Recite/Hifz, including cross-Surah ranges. Plan a non-destructive migration for store v1 across local/cloud. Reuse store bookmark/lastPage/history, Profile list and Hifz custom range.

### Phase 4 — Quran-specific AI recognition and alignment

Investigate/evaluate candidate models, including tarteel-ai/whisper-base-ar-quran; model name is not evidence of fit. Benchmark Hafs voices, reciters, repeats, skips, noise, silence, long passages and normalization. Report WER and alignment false positives/negatives by condition. Choose on-device vs cloud after privacy, offline behavior, latency, size, licensing, retention and cost review. Preserve raw transcript/confidence separately from fixed Quran reference; uncertain output stays advisory. Do not claim Tajweed unless separately validated.

Reuse the current interface, mic/status/error controls and transcript/reference panes; replace the engine/alignment boundary. Never place provider secrets in browser code.

### Phase 5 — Memorization, revision and mistake integration

Require learner confirmation for possible mismatch/omission until automated error quality is demonstrated. Map confirmed outcomes to Ayah-level Hifz records; retain explicit consent/retention/delete/export choices for transcripts. Reuse applyResults, weak queue, Practice and dashboard.

### Phase 6 — UI polish, Android optimization and testing

Add data/boundary checks and unit/integration tests for navigation, deep links, storage migration, speech states and fallback. Test Android permission allow/deny, unavailable service/language, network/silence, backgrounding, offline reader/audio and upgrades on devices. Review responsive design, accessibility and RTL. Add signed release build/versioning and verify APK/AAB. Reuse Android WebView wrapper/build workflow, but do not infer production readiness from debug artifact.

## 13. Files and Components That Need Changes

Nothing was changed during this audit. Likely future touchpoints:

- Navigation: src/lib/quran.ts, new reviewed data in public/data/, src/components/SearchDialog.tsx, src/app/mushaf/page.tsx; likely shared location picker.
- Mushaf/accessibility: src/lib/quran.ts pageContent, src/app/mushaf/page.tsx, src/app/globals.css, src/app/layout.tsx; public/data/layout.json only after provenance/accuracy review.
- Bookmark/recent/range state: src/lib/store.ts (version/migration), src/components/AyahSheet.tsx, src/app/profile/page.tsx, Mushaf, Recite and Memorize routes.
- ASR/model: src/app/recite/page.tsx, src/lib/androidSpeech.ts, android/app/src/main/java/com/hifzcompanion/MainActivity.java and Android manifest; add a service/runtime boundary only after model selection. Keep secrets off client.
- Hifz: src/lib/hifz.ts, src/lib/store.ts, src/components/Practice.tsx and Recite session UI.
- Android/offline QA: android/app/build.gradle, AndroidManifest.xml, scripts/build-android.ps1, public/sw.js, manifest and tests/CI.

Do not modify Quran text without qualified review.

## 14. Existing Features That Must Be Preserved

Preserve the fixed Quran text, bundled Hafs font and 604-page layout; audio and reciter/repeat controls; Ayah translation/Tafsir separation; bookmarks/favourites, themes and zoom; local guest progress, explicit guest-to-account merge, RLS-backed Supabase sync and backup/restore; custom Hifz ranges, self-check hidden-text practice, user-rated outcomes, due/weak schedule, Surah/Juz tracker, goals and visual maps; PWA offline core and Android wrapper/native mic permission flow.

Keep speech matches advisory until validation and learner confirmation. Never allow recognized output to modify Quran text or silently convert uncertain recognition into a confirmed Hifz mistake.

## 15. Questions or Unverified Findings

1. Is the desired Mushaf exactly the Madani/KFGQPC 604-page edition? Which approved source should provide quarter/Hizb boundaries?
2. Must speech work offline/on-device, or is disclosed cloud processing acceptable? What retention/consent is acceptable?
3. Is the target riwayah Hafs 'an Asim? Which accents, voices and countries must be represented in evaluation?
4. Is there a qualified review team and suitable Quran recitation test corpus?
5. A local speech-server, model and virtual environment exist. Who will operate it, and should web/Android clients use it? Its CPU-only inference, request size, access security, model revision/weight provenance and accuracy need review before integration.
6. Are Supabase URL/anon key and Google OAuth configured in deployment? .env.example is blank; README says live auth/sync untested.
7. Is distribution a sideload debug APK, signed Play Store APK/AAB or hosted PWA/TWA?
8. Qualified Hafiz should review reference differences at 2:72 and 11:41 before any text correction.
9. Visual layout, microphone, Android performance, offline audio, storage and accessibility were not exercised on hardware.
10. This audit does not inspect Tarteel private source/features; use only supplied checklist for product comparison.

## 16. Final Recommendations for ChatGPT

Treat the current app as a Next.js/PWA Quran reader with a local Android WebView package and a meaningful manual Hifz workflow. Do not replace its architecture or Quran data as a first step.

First add reviewed Hizb/quarter boundaries and Ayah-focused deep links. Then establish the intended Mushaf edition and validate page rendering. Add exact recent locations/bookmark restoration with safe state migration. Keep live speech labelled generic Arabic transcription until a Quran ASR model has been benchmarked and privacy/offline choices are explicit. Before speech results affect Hifz, require learner confirmation and measure false positives. Preserve all existing reader/Hifz functions and verify Android permissions, storage, offline behavior and signed builds before claiming production readiness.
