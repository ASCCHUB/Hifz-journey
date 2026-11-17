# Phase 3.0 — Safety Implementation Report

**Date:** 2026-11-13  
**Scope:** Foundation, progress protection, and repeatable regression tests only. No Smart Hifz Tutor curriculum, planner, page lesson engine, map import, or ASR redesign was implemented.

## 1. Executive summary

Added 11 in-memory Hifz/recitation safety tests using Node’s built-in `node:test` runner. Tests cover the existing `applyResults` schedule, weak-Ayah handling, word-mistake attribution, memorized ranges/Juz, mastery/due rules, state hydration, guest merge, and the learner-confirmation boundary for Quran ASR.

The tests exposed a real guest-account migration omission: `mergeGuestProgress()` merged bookmarks and Hifz state but dropped the guest’s timestamped precise last Quran location and corresponding page. The smallest safe fix now carries that pair over only when the guest position is newer. The current v1 state schema and existing records are retained. Tests, TypeScript, navigation checks, and the static production export pass. The Quran validator confirms the pinned data hash and the two known reference differences only.

## 2. Current Hifz engine architecture

- `src/lib/store.ts` owns schema-v1 app state, local persistence, optional-field hydration, guest/account state selection, guest merge, and Supabase change snapshots.
- `src/lib/hifz.ts` provides per-Ayah memorization records, SRS, weak queue, `applyResults()`, explicit known-range marking, Juz rollups, and due runs.
- `src/components/Practice.tsx` collects learner self-ratings and passes results to `applyResults()`.
- `src/lib/recitationAlign.ts` aligns recognized tokens to canonical Quran words and labels possible alignment outcomes.
- `src/lib/recitationResults.ts` assesses Ayah-level results after learner verdicts, updates confirmed word mistakes, and selectively calls `applyResults()`.
- `src/components/LiveRecitation.tsx` runs microphone/ASR sessions, exposes confirm/dismiss actions, and saves only after the learner chooses to save.
- Visual Maps keep separate `mapProgress`; their standalone cue/order activities do not count as per-Ayah recitation. Their independent/final recall uses the existing Practice assessment path.

## 3. Existing scheduling rules verified

- `ok`: increments successes and confidence; the SRS interval grows once per distinct success day using 1, 3, 7, 14, 30, then 60 days. More than one clean attempt on the same day increments recall counts but does not advance that day-based interval twice.
- `hes`: reduces confidence, sets a 1-day interval and a 10-minute `dueAt`, and clears the clean-day streak.
- `bad`: resets interval to zero, sets `bad`, schedules a 10-minute recheck, and marks the Ayah weak.
- Legacy due records use day-based `due`; records with `dueAt` use an exact timestamp.
- `markRange(..., true)` creates explicit known records at interval 3 with `reps: 0`. The current `isMemorized()` treats an unfailed zero-rep record as memorized, so this is conservative known/claimed progress, not a distinct verified mastery state.
- `markRange(..., false)` removes the range’s `mem` and `weak` entries. This is the existing explicit unmark operation; this phase does not change that behavior.
- Current “Strong” classification requires a 30-day interval and at least five success days. A map’s independent `mapProgress` status does not itself prove Ayah mastery.

One inconsistency for the future shared mastery contract: `goalProgress()` counts any existing `mem` entry as memorized for a memorization goal, while `isMemorized()` applies the more specific success/legacy rules. Phase 3.0 records this without changing goal behavior.

## 4. Test framework and files added

Added `scripts/test-hifz.mjs`, a fixture-only Node 24 test suite. It imports the app’s TypeScript modules using the Node TypeScript loader and stubs Quran JSON fetches with local workspace files. A tiny in-memory `localStorage` fixture exercises guest/account state without reading real user storage. No network service or Supabase credentials are used.

Added the `test:hifz` npm script. The project already runs its navigation test directly against TypeScript; no new runtime or development dependency was required.

## 5. Test cases and results

`npm run test:hifz` — **11 passed, 0 failed**:

- `ok`, `hes`, `bad`, history retention, day logging, repeated same-day recalls, interval progression, due dates.
- Weak queue inclusion, clean weak streak update, and no early weak-record deletion.
- Confirmed word mistakes remain keyed by Surah/Ayah/word; preexisting other-Ayah word counts remain intact.
- Unconfirmed ASR mismatch without confidence does not mark `bad` or add word mistakes.
- Explicitly confirmed ASR result does update the correct Ayah/word record.
- Overlapping `markRange()` calls preserve existing practice history; partial and complete Juz marking preserve existing records.
- Existing mastery classifications, timestamp/day due behavior, due-run output.
- v1 state and backup JSON hydration, missing optional values, malformed top-level containers, bookmark and map progress retention.
- Guest merge conflict by timestamps, bookmarks/history/map progress, latest exact last-location/page, and retention of the guest backup.
- Current Visual Map IDs remain stable.

`npm run test:navigation` — **10/10 groups passed**, including all Quran divisions, 604-page boundaries, full page-word traversal/order, deep links, invalid inputs, older saves, and reader back-state behavior.

## 6. Weak Ayah and word-mistake integrity findings

A confirmed `bad` Practice result enters `weak`; weak drills track clean-day streaks and retain the record until the existing three-clean rule removes it. `weakDue()` selects prior-day weak records. Word mistakes are stored separately in `mw["surah:ayah"][wordIndex]`; live-recitation code increments these only for an explicit `confirmed` verdict. This behavior is exercised by tests and was not redesigned.

`mergeGuestProgress()` combines word mistake counts by taking the maximum per word, rather than summing duplicate guest/account counts. That avoids duplicate inflation during repeat merges, though it is not a chronological conflict-resolution model.

## 7. Guest/Supabase merge findings

Supabase sync upserts a complete `AppState` JSON snapshot and, when pulling, chooses the snapshot with the newer top-level `t`. It is not a field-by-field server merge. Guest merge is a separate local operation: it merges per-Ayah records by `last`, bookmarks by bookmark timestamp, map progress by `last`, read-page marks by maximum, history by unique tuple, and selected additional state.

**Fix:** guest `lastLocation` and `lastPage` are now merged together when that precise location has a newer timestamp than the account location. If the account location is newer, it remains unchanged. Old saves without `lastLocation` still hydrate with `null`; schema remains `v: 1`.

**Remaining merge limits:** guest merge does not merge every preference or plan field (for example `settings`, `journey`, or `goals`), and weak-record conflict resolution uses the smaller clean counter rather than a timestamp comparison. Supabase behavior was verified by code inspection only; no live account was used.

## 8. Speech-recognition confirmation boundary

The active local engine posts PCM16 audio to the configured Quran speech server’s `/transcribe` endpoint. The app identifies the Quran-trained model as `tarteel-ai/whisper-base-ar-quran` (Apache-2.0); `/health` reports active server/model status. Default local URL is `NEXT_PUBLIC_QURAN_ASR_URL` or `http://127.0.0.1:8765`. A generic browser/Android speech-recognition engine is an explicit fallback option.

The local server returns recognized text and may return confidence. Missing confidence remains `undefined`; alignment uses confidence only when present and below its low-confidence threshold. Incorrect/missing/uncertain alignments are displayed as suspicions. The user must select “I made this mistake” or “I recited it correctly.” Saving an unconfirmed suspicion only records a first-day suspicion counter; it does not update Ayah SRS or word-mistake counts. Repeated suspicion on another day can be scheduled as `hes`, but still never becomes a confirmed word mistake automatically. Confirmed mistakes alone increment `mw`.

When the local server is unavailable, the client stops active listening, keeps queued audio in memory, reports the network error, and offers retry; this is not automatically converted into a recitation failure. Browser recognition output is also subject to the same learner confirmation boundary. Automated tests cover the pure alignment-to-saving boundary, not microphone devices, the Python server process, or real ASR quality.

## 9. Visual Maps progress findings

Three IDs remain present: `al-fatihah`, `al-baqarah-1-5`, and `al-baqarah-21-29`. Existing map records are top-level `mapProgress` and remain distinct from per-Ayah `mem` and `weak` records. Map cue-match/order results update map quiz/stage state. Independent and final memorization sessions use Practice with `kind: "assessment"`, which creates/updates per-Ayah recall from the learner’s self-rating. No map progress migration or UI rewrite was made.

## 10. Quran page-boundary risks for future lessons

The current resolver and `pageContent()` operate over the existing page layout metadata, whose rows include positive word counts and special zero/negative layout markers. Existing navigation tests walk the full 604-page layout and verify every Quran word is consumed in order. This phase did not add `chunkPage()`.

A future chunker must keep word references stable when a page starts/ends within an Ayah; join a long Ayah spanning multiple lines/pages without duplicating text; retain waqf marks as split candidates without editing source text; preserve unusual Bismillah/surah heading markers; handle Surah transitions; and treat multiple Ayahs on a line as separate canonical Ayah ranges. The current page metadata’s known coordinate differences from the cited KFGQPC reference remain relevant; it is reconstructed layout metadata, not publisher-certified page artwork.

## 11. Files changed

- `src/lib/store.ts` — backward-compatible state container hydration and timestamped guest last-location/page merge.
- `scripts/test-hifz.mjs` — 11 in-memory Hifz and ASR-boundary tests.
- `package.json` — `test:hifz` script only; no dependency added.
- `PHASE_3_0_SAFETY_IMPLEMENTATION_REPORT.md` — this report.

The requested input reports were read. Current source was treated as authoritative where a planning statement did not match implementation.

## 12. Quran integrity verification

`public/data/quran.json` SHA-256 before and after validation:

`fab6e90867736262658b840b28b91aaab46ade99b058531e2cdc072931201680`

`npm run validate:quran -- --report=tmp/phase3-quran-integrity.csv` compared all 114 Surahs / 6,236 numbered Ayahs. It reported exactly the two known differences at Al-Baqarah 2:72 and Hud 11:41. The validator exits with status **2** when review differences exist; this is expected and not a validation crash. No Quran data was modified.

## 13. TypeScript, navigation, and production build results

- `npm run test:hifz` — passed, 11/11.
- `npm run test:navigation` — passed, 10/10 groups.
- `npx tsc --noEmit --incremental false` — passed.
- `BUILD_ANDROID=1 NEXT_DIST_DIR=.next-phase3 npm run build` — passed as a Next.js static export; all static routes prerendered. The build generated `.next-phase3/` and refreshed `out/`.
- Quran integrity validator — completed with the two known differences and exit 2, as above.
- Lint was not run; no non-interactive ESLint configuration/check was established in this task. Android Gradle build and physical/emulator tests were not run.

## 14. Remaining risks

- Store hydration protects missing or malformed top-level containers; it does not deeply validate each nested record’s fields. Backup import remains an intentional full-state replacement and should only be used with a trusted complete backup.
- Supabase synchronizes a whole JSON state by timestamp and was not tested against a live account or concurrent clients.
- Some guest fields (notably settings/journey/goals) are not part of the explicit guest merge.
- Speech tests prove the confirmation gate in pure logic only; microphone permission, server outage, Android browser behavior, and model quality require device/server tests.
- The page coordinate provenance mismatch recorded in Phase 2 persists; Quran text and page metadata were not changed.
- Node’s built-in TypeScript test execution depends on a recent Node runtime. The suite was run on Node v24.19.0.

## 15. Recommendations for Phase 3.1

1. Define one shared per-Ayah evidence contract distinguishing explicit known/claimed marks, self-reported recall, learner-confirmed live-recitation results, and unconfirmed ASR suspicions.
2. Align goal and dashboard counts with the chosen authoritative `isMemorized()`/mastery rules without resetting records.
3. Specify conflict semantics for guest/account weak records, settings, journey, goals, and reading locations; retain whole-state cloud compatibility until a tested migration is designed.
4. Build a pure page/range chunker over canonical `(surah, ayah, word)` references and test cross-page Ayahs, waqf candidates, page markers, and Surah transitions before UI work.
5. Add browser/device tests for microphone denial, ASR outage/retry, pause/resume, and learner confirmation on Android.

## 16. Scope confirmation

This milestone establishes a testable, backward-compatible foundation and fixes only the verified guest reading-position merge omission. It does not implement onboarding, study paths, daily planning, guided page learning, new Visual Maps architecture, third-party PDF import, cumulative quizzes, or new speech models. Quran text, the 604-page layout, current map IDs, SRS logic, and app-state version were preserved.
