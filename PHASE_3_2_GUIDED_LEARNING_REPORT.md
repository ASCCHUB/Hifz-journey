# Phase 3.2 — Guided 15-Line Page Learning: Report

Date 2026-11-13 · Implementer: Claude

## Features implemented

- **"Learn this page", available from:**
  - the Mushaf Ayah sheet ("Learn this page (page N) step by step", "Learn this ayah");
  - My Hifz Journey ("Learn a Mushaf page"; **Continue** now opens a guided lesson for the primary path's next page-sized portion);
  - the new `/learn` route (page picker, short-Surah picker, "Continue where you stopped"). It is not a new navigation tab.
- **Units:** a full page (default), a single Ayah, a short Surah, or any Ayah range up to 60 Ayahs. Long Ayahs are practiced in parts within a lesson.
- **Two modes:**
  - **Guided:** the app walks through the steps.
  - **Manual:** per Ayah, the learner can play ×N, cycle hide levels (half → first letters → hidden → shown) and rate recall; only rated Ayahs are saved.
- **Three levels:**
  - **Guided:** listen → read along → half-hidden → first letters → recall, with hints.
  - **Standard:** listen → read → recall, with hints.
  - **Challenge:** listen → recall, larger groups, no hints.
- **Guided progression** (`src/lib/lesson.ts` `buildSteps`):
  - per unit: listen (repeat 1–10×, selected reciter), read along, fades, recall;
  - rolling joins inside long Ayahs (parts 1–2, 1–3, …) and links between neighbouring Ayahs;
  - group recall and cumulative "everything so far";
  - **full recitation with the text hidden** (the only evidence step);
  - **connection with the previous Ayah or page**.
- **Grouping adapts to length:** about 20, 30 or 45 words per group by level, so a long Ayah is its own group. There is no fixed 5-Ayah grouping.
- **Meaning:** the Ayah-level translation from the bundled reviewed set, collapsed by default.
- **Word-by-word meanings: disabled.** The UI says so because no reviewed glossary is bundled.
- **Struggle handling:** "Could not recall" on a practice step returns once to the matching listen step.
- **Optional live recitation:** "Check with live recitation" opens the existing Recite screen for the same range, with the existing ASR and confirmation rules. Self-rating is always available, the mic never starts automatically, and an unavailable ASR does not penalize.
- **Resume:** lesson state (`AppState.lessons`) saves after every step, survives restart, and syncs with the 3.1A merge (newer `updatedAt` wins).
- **Evidence rules:**
  - Only final-step ratings are saved, through the existing `applyResults` (`"new"`), **once** (`savedToHifz`).
  - A hinted "Recited correctly" is saved as `hes`.
  - Unrated Ayahs are **not** saved, because `applyResults` would otherwise default them to `ok`.
  - Practice ratings stay in lesson state.
- **Path cursor:** after saving, the primary path's cursor advances (`advanceCursor`) within the range, then to the next range.

## Chunking (`src/lib/chunking.ts`)

- `splitAyah` creates units of up to 12 words, preferring a cut **after a word that carries a waqf mark** already in the text. It never leaves a tail under 3 words.
- Boundaries are labelled in code as practice aids, not authoritative waqf rulings. No reviewed phrase annotations exist in the project, so none are used.
- Units are canonical `(s, a, from, to)` references; the text is read from the dataset.
- **Verified for all 6,236 Ayahs:** complete, ordered, non-overlapping, words unchanged. 2:282 (128 words) yields ≥ 11 units.
- **Pages:**
  - verified across all 604 pages: every page's words are exactly the whole words of the Ayahs that start on it;
  - in this layout **no Ayah crosses a page boundary**, so a page lesson always contains whole Ayahs;
  - every Ayah appears once, in canonical order.

## Files

- **New:** `src/lib/chunking.ts`, `src/lib/lesson.ts`, `src/components/LessonPlayer.tsx`, `src/app/learn/page.tsx`, `src/components/MapCue.tsx` (a placeholder, replaced in 3.5).
- **Modified:**
  - `src/lib/journey.ts`: `advanceCursor`, `nextPathLesson`;
  - `src/components/AyahSheet.tsx`: Learn buttons;
  - `src/components/PersonalizedJourney.tsx`: Continue → `/learn`; "Learn a Mushaf page";
  - `src/lib/store.ts`: `LessonState` type, from 3.1A.

## Data migrations

None. `lessons` is an optional field defaulting to `{}`.

## Tests

`npm run test:phase3`: 18/18 total (6 new for 3.2). They cover:
- page integrity across 604 pages;
- long-Ayah chunking across 6,236 Ayahs, with waqf preference;
- step plan (fades, rolling joins, cumulative, final, connect; challenge is shorter; nothing before 1:1);
- the evidence rules (an interrupted lesson saves nothing, hinted → hes, unrated not saved, once-only);
- resume through hydration and merge;
- path cursor advance.

Regression: `test:hifz` 24/24; `tsc` clean.

## Browser testing (Chrome headless, 360×740, dev server)

Full guided lesson on page 2 (Al-Baqarah 1–5, 33 steps, Guided level). Audio playback was stubbed:
- the start screen worked, and **mid-lesson reload resumed at the same step**;
- **0 Hifz records before the final step**;
- after finishing, 5 final ratings were saved and `mem` has 2:1–2:5;
- the hinted Ayah was saved as `hes`;
- no horizontal scroll, no microphone calls, no page errors.

**Not verified:** real audio playback (everyayah.com) in this run, and an Android device.

## Remaining risks and deferred items

- Audio plays the **whole Ayah** even when practicing one part of a long Ayah; per-word audio timing isn't available.
- The previous-page "connection" step links only the single preceding Ayah.
- Phrase boundaries are automatic. A teacher-reviewed phrase-annotation file would improve them, and none exists.
- `/learn` ranges are capped at 60 Ayahs per lesson; longer Surahs are learned page by page.

## Quran integrity

No Quran data touched. The page/word coverage test reads the bundled text and confirms it unchanged in content and order.

## Stage 2 addition — reviewed Visual Map integration (2026-11-14)

- Guided lessons look up a map by canonical `(surah, ayah)` only when its manifest entry is `teacher_reviewed`. The lesson engine is data-driven and needs no changes when a new reviewed map is added.
- During the listen/prepare step, a matched map offers its reviewed memory theme, branch cue and canonical sequence context. Opening the map selects/highlights the matching Ayah branch. A return link goes to the same lesson URL; the existing saved `LessonState.step` restores the exact step and does not reset lesson or map progress.
- On recall steps, explanatory map cues are hidden. If a reviewed map exists, the learner may deliberately open it using **View visual map (counts as help)**. This records help against the canonical Ayah in existing lesson state; a later correct final self-rating is downgraded to `hes` by the existing evidence rule.
- No map, Quran text, translation or Tafsir is generated. Missing or unreviewed maps produce no lesson card.
- **Supported reviewed coverage: 0 Ayahs currently.** The manifest contains three authored maps—Al-Fatihah 1:1–7, Al-Baqarah 2:1–5, and Al-Baqarah 2:21–29—but all remain `app_authored_unreviewed`, so they are catalog-only and not shown as lesson aids. The nine referenced PDFs were not imported or adapted; they are not in the project and their permissions/accuracy have not been reviewed.
- Added a Stage 2 integration test for reviewed status filtering, canonical range/surah matching, exact Ayah branch lookup and map-assisted evidence downgrade.
- Verification: `npx tsc --noEmit --incremental false` passed. `npm run test:phase3` passed all 46 tests, including the new map integration test. No browser/device run was performed for this addition.
