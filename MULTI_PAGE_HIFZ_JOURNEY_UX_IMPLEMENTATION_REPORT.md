# Multi-Page Hifz Journey UX Implementation Report

Date: 2026-11-14

## Final routes

- `/` and `/journey` — concise My Hifz Journey dashboard.
- `/learn` — New Learning entry, passage selection, unfinished lesson resume, and the existing Mushaf/Tutor lesson modes.
- `/revision` — focused Muraja'ah page using the existing TodayPlan, SRS queue, and weak/claimed counts.
- `/quran` — My Quran library with By Juz, By Surah, and By Page tabs; the page tab reuses the existing 604-page tracker.
- `/journey-settings` — personalized path, self-reported coverage and daily preferences, with a review and confirm step.
- `/progress` — claims, demonstrated evidence, coverage by page, due/weak counts, recent history, and seven-day practice/revision trends.
- `/mind-maps`, `/recite`, `/mushaf`, `/profile` — secondary destinations in More or contextual links.

Legacy route compatibility remains: `/memorize` opens the Journey dashboard by default, while legacy practice query parameters and supported hash links continue to route into the prior flow or their replacement page. Existing lesson IDs and saved lesson state are reused.

## Navigation and screen changes

The primary navigation is now My Journey, New Learning, Revision, and My Quran, with a fifth More destination on mobile. Secondary routes live under More. The old all-in-one memorization page no longer appears as the default home screen; its legacy component remains behind the old practice/query path. Profile's repeated progress metrics and activity chart were replaced with a link to Progress. My Quran exposes page actions contextually instead of putting four actions on every library item.

My Journey keeps daily goal/location, one Continue Hifz action, one recommended task with its reason, a concise evidence/claim summary, and links to setup, learning, revision and library. New Learning supports canonical Juz/Surah/page selection, Juz ranges, Surah page intersections, a starting Ayah, whole-page/half-page Mushaf learning, Tutor lessons, and unfinished lesson continuation. The Tutor offers a reference PDF action only in preparation steps when the *active Ayah's* supported Juz PDF is imported locally. It returns through the saved lesson URL/state.

Journey Settings reuses PersonalizedJourney and TeachingPrefs. Final save now has an explicit review/confirm step. Claims remain separately labelled self-reported. Progress separates claims from recitation evidence and surfaces revision trends.

## Data and safety

No Quran text, 15-line page metadata, IndexedDB progress schema, Supabase migration, PDF file, teacher-review status, or mind-map PDF was changed or bundled. The existing path, lesson, planner, page tracker, claim, SRS, and progress models are reused. Reference PDF matching is derived from canonical Juz metadata and the current lesson Ayah; PDF files remain in their existing device-local database. Recall still uses the existing hidden-text and assistance behavior. Existing tests cover one-time assessment writes, hint assistance, and PDF matching.

## Verification

- `npx tsc --noEmit` — passed.
- `npm run test:navigation` — 10/10 groups passed.
- `npm run test:hifz` — 24/24 passed.
- `npm run test:phase3` — 56/56 passed.
- `npm run test:storage` — 17/17 passed.
- `npm run test:refpdfs` — 7/7 passed.
- `npm run test:sync-guard` — 15/15 passed.
- `npm run test:journey` — 13/13 passed.
- `npm run test:refpdf-learn` — 4/4 passed.
- `npm run test:mushaf-recitation` — 6/6 passed.
- Android production frontend export — passed.
- APK parity — passed: 286 frontend files, zero missing, zero stale, byte-for-byte match.
- Quran integrity validator — ran across all 6,236 Ayahs and reported the project's two documented reference differences at Al-Baqarah 2:72 and Hud 11:41. Neither Quran source was modified. Details are in `scripts/quran-reference-differences.csv`.

The local Next development server is running at `http://localhost:3000`. HTTP checks returned 200 for `/journey`, `/learn`, `/revision`, `/quran`, `/journey-settings`, and `/progress`. Visual browser automation could not be completed because the browser access host was unavailable in this session. No physical Android device test was performed. The new settings review is a final confirmation step around the existing combined profile editor, rather than a new multi-screen wizard; existing paths and unfinished lesson records are retained when goals change.

## Android build

- APK: `C:\Users\sajid\Downloads\QURAN COMPANION\Hifz-Companion-20261114-2019-eca603-debug.apk`
- Frontend build ID: `20261114-2019-eca603`
- Android version code: `1510339`
- Fingerprint: `b915cd5f51497422`
- Package ID, signing configuration and learner data handling use the existing Android build/parity mechanism.

