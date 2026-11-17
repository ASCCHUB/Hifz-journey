# Phase 3.4 — Previously Memorized Assessment and Recovery: Report

Date 2026-11-13 · Implementer: Claude

## Features implemented

- **"Check and recover" screen** (`/assess`, linked from My Hifz Journey as "Check & recover" and from Today's Hifz "check" tasks). It lists self-reported pages not yet checked or recited, from the Phase 3.1 claims (whole or partial Juz, Surahs, pages, Ayah ranges), plus a separate Recovery list.
- **Page check** (`/assess?page=N`), at most 2 prompts:
  1. **Page start:** recite the first Ayah of page N; the cue is the page number and Surah.
  2. **Continue:** read the shown Ayah, recite the one after it. The target is chosen deterministically per page and attempt.
  - Each prompt is rated **Recalled cleanly / Needed help / Could not recall**. Optional live recitation uses the existing Recite flow and its confirmation rules.
  - Prompts are frozen for the duration of a check.
- **Evidence rules** (`src/lib/assessment.ts`):
  - ratings are saved through the existing `applyResults("assessment")` **only for the prompted Ayahs**;
  - the page verdict (`clean / needs_help / forgot`) is stored in `AppState.assessments` as a **diagnostic**;
  - the rest of the page stays "said known", and the UI says so;
  - one clean prompt never makes anything "long-term retained", which still requires the existing 5-day / 30-day rule.
- **Recovery lesson** (`/learn?page=N&template=recover`, using the Phase 3.2 lesson engine):
  - listen and read the page;
  - per Ayah or part: **first-letter clues** → recall;
  - **rebuild the order** of the Ayahs (a tap-sequence exercise; practice only);
  - **recite the group without hints**;
  - **whole-page test**, the only evidence step, saved once through `applyResults("assessment")`, which also creates records for previously claimed Ayahs;
  - the follow-up schedule comes from the existing SRS: `hes` and `bad` give 10-minute and 1-day rechecks, and `ok` starts the 1/3/7… ladder.
- **Recovery progress kept separate:**
  - `assessments[page].recovery = { attempts, lastResult, at }`, apart from the original diagnostic;
  - the Recovery list shows "Recovered" after a clean recovery;
  - after **two unsuccessful recoveries** it recommends **"Relearn fully"** (the full guided page lesson) instead of more tests.
- **Weak-page identification:** pages with ≥ 2 weak-list Ayahs also appear in the Recovery list. The existing weak-Ayah and word-mistake records are reused unchanged.

## Problems found and corrected

1. **Links within `/assess` and within `/learn` didn't change the screen.** Next.js keeps a route mounted when only the query changes, and the URL was read once on mount. This affected "Learn page N+1" after a lesson and every page link on `/assess`. Both routes now use `useSearchParams` inside a Suspense boundary, as the Mushaf page already does.
2. **The check summary showed different Ayahs than were saved.** Saving increments the attempt count, which regenerated the prompts. Prompts are now frozen per check, and the browser re-test confirms the summary matches the saved records (78:1, 78:6).

## Files

- **New:** `src/lib/assessment.ts`, `src/app/assess/page.tsx`, `src/lib/quranView.ts`.
- **Modified:**
  - `src/components/LessonPlayer.tsx`: records the recovery outcome;
  - `src/app/learn/page.tsx`: `useSearchParams`;
  - `src/components/PersonalizedJourney.tsx`: "Check & recover" link;
  - `src/lib/store.ts`: `PageAssessment` type, from 3.1A.

## Data migrations

None. `assessments` is optional and defaults to `{}`.

## Tests

`npm run test:phase3`: 28/28 (4 new for 3.4). They cover:
- prompts: count, on-page targets, cue = preceding Ayah, deterministic, single-Ayah pages;
- prompted-only evidence (untested Ayahs stay "claimed", nothing becomes retained);
- verdicts, recovery attempts, relearn recommendation, recovered state, diagnostic kept separately, weak-cluster pages;
- recovery template steps and evidence creation for claimed Ayahs.

## Browser testing (Chrome headless, 360×740)

- **Setup:** claimed Juz 30 → 23 unchecked pages listed.
- **Check:** page 582, two prompts rated "could not recall" → "not recalled yet". Only 78:1 and 78:6 were recorded, with the verdict `forgot`.
- **Recovery:** "Recover page 582" opened the recovery lesson start screen.
- **Regression:** the full guided lesson test was re-run after the route change and still passes (resume, final-only evidence, hinted → hes).
- **Not done:** a full recovery lesson was not clicked through in the browser; its logic is covered by the tests and it shares the lesson engine. No Android device test.

## Remaining risks

- Two prompts per page is a coarse sample, which is intentional and stated in the UI. The verdict should not be read as page mastery.
- Prompt targets are deterministic per attempt, so a learner could learn to expect them; the attempt counter rotates the target.
- "Check" tasks in Today's Hifz offer one claimed page per day; large claims (e.g. 20 Juz) take months to sample through this route alone. The learner can check more pages manually from `/assess`.

## Quran integrity

Untouched.
