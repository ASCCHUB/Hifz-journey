# Phase 3.1 — Personalized Hifz Journey: Implementation Report

**Date:** 2026-11-13
**Implementers:** Codex (initial implementation, stopped at its usage limit) → Claude (completion, fixes and verification, as sole implementation agent).
**Scope:** learner profile/onboarding, learning paths, previously-memorized claims, daily preferences, guest/account merge. **Not** Phase 3.2 (no planner, no lesson engine, no assessments).

> The project is not a Git repository. "What Codex did" was determined from file modification times after the Phase 3.0 report and the Phase 3.1 design review, and by reading the code.

---

## 1. Summary

Phase 3.1 is complete as far as the acceptance criteria below can be verified with automated tests and a browser smoke test.
- **Separation:** previously-memorized claims and learning paths are stored in a separate, optional `studentJourney` object. They never create, change or delete per-Ayah Hifz evidence (`mem`, `weak`, `mw`, `hist`, `log`, `rsus`).
- **Deletion:** removing a claim or archiving a path is a timestamped tombstone, so it survives merging and never touches Hifz history.

Codex built the data model, path builders, claims, merge rules, the onboarding/edit UI and 7 tests. When I took over, **TypeScript failed** and verification had not been run. I fixed four defects, added helpers and 6 more tests, and ran all checks:

| Defect found | Effect | Fix |
|---|---|---|
| `partialJuzRange` compared Juz bounds (`[surah, ayah]` tuples) as `{s,a}` objects | TypeScript build failure; partial-Juz validation was wrong at runtime | Convert bounds to points before comparing |
| `rangeFromPageBounds` ended a page range on the **first Ayah of the next page** | "Pages 100–101" also claimed or studied one Ayah of page 102. Codex's test asserted this wrong value. | End on the Ayah *before* the next page's first Ayah; test corrected |
| `memorize/page.tsx` saved with broken character encoding (27 places: `Â·`, `â€“`) | Garbled text visible on the Hifz Journey page | Re-encoded exactly; only the garbled sequences changed |
| Guest merge read the guest journey without validation | A malformed guest journey could throw during merge | Guest journey is validated with `hydrateState` first; malformed ones are ignored |

Plus:
- **Tested helpers:** claim removal and path archiving moved into pure `tombstoneClaim()` / `archivePath()` helpers in `lib/journey.ts`, so the "never touches Hifz history" guarantee is testable. Added `expandRanges()` and `previousAyah()`.
- **Destructive buttons guarded:** the two **existing** Juz/range "Clear" buttons, which permanently delete `mem` + `weak`, now require confirmation that says so and points to the non-destructive claim feature.

---

## 2. What was implemented

### Data model (`src/lib/store.ts`, by Codex)
- `AppState.studentJourney?: StudentJourney | null`. It is optional, so no schema bump (`v: 1`).
- **Legacy compatibility:** older saves hydrate to `null`, and the legacy `journey` fields are kept unchanged.
- `StudentJourney` = `schema: 1`, `updatedAt`, `onboarding` (`in_progress | skipped | complete`), `learner` (name, experience, direction), `paths[]`, `primaryPathId`, `claims[]`, `preferences` (with its own `updatedAt`).
- `JourneyPath` = id, name, kind, `ranges[]` (canonical `{s,a}`→`{s,a}`), traversal, cursor `{rangeIndex,s,a}`, `isPrimary`, timestamps, optional `deletedAt`.
- `MemoryClaim` = id, label, confidence (`comfortable | needs_revision | mostly_forgotten`), `provenance: "self_reported"`, `ranges[]`, timestamps, optional `deletedAt`.

### Path kinds (`src/lib/journey.ts`)
| Kind | Ordering | Ayah order inside each unit |
|---|---|---|
| `forward` | 1:1 → 114:6 | ascending |
| `reverse_juz` | Juz 30, 29, … 1 | **ascending** (verified for all 6,236 Ayahs) |
| `short_surahs` | Surahs 78–114 by Ayah count, ties by number | ascending, each starting at Ayah 1 |
| `surahs` / `juz` | user's selection order, duplicates removed | ascending |
| `custom` / `collection` | user's ranges (Ayah, Surah, Juz, part-Juz, page ranges) | ascending |

The legacy custom range (`journey.start/end/last`), if not the default, becomes a deterministic `legacy-custom` primary path with its cursor kept.

### UI (`src/components/PersonalizedJourney.tsx` on the My Hifz Journey page)
- **Onboarding/edit form:** name, experience, direction, learning paths (add/edit, make primary, archive), "What have you memorized before?" (claims with confidence and range picker), daily preferences (minutes, new amount and unit, revision amount and unit, learning days, prioritize revision).
- **Skip and resume:** "Skip for now" records `skipped`, and an in-progress setup is restored ("Resume setup").
- **Continue** opens the primary path at its cursor; after a session, the cursor advances within the range, then to the next range.
- **Manual learning:** "Manual learn a page" opens the Mushaf at the last page.
- **Claim labelling:** claims are labelled "self-reported" with the text *"never changes Hifz records, review intervals, or recitation history."*
- No new navigation tab. No microphone access.

---

## 3. Safety guarantees and evidence

| Guarantee | Evidence |
|---|---|
| Claims never create/modify Hifz evidence | Tests 15, 22 (snapshot of `mem/weak/mw/hist/log/rsus` equal before/after). Browser: a claim saved via the UI left `mem` with 0 records. |
| Deleting a claim / archiving a path never deletes Hifz history | Test 22: tombstone helpers on a state with real `mem`, `weak` and `mw` → all unchanged |
| Reverse path keeps Ayah order | Test 20: all 6,236 Ayahs covered exactly once; inside each Juz every Ayah follows its predecessor; first 78:1, last 2:141 |
| Partial Juz claim does not imply the whole Juz | Tests 15, 21: in-bounds part accepted (10 Ayahs); starts before or ends after the Juz rejected |
| Non-contiguous claims | Test 15 (part of Juz 5 + Juz 29–30) |
| Page ranges = exactly the Ayahs that start on those pages | Test 19: pages 1, 1–2, 49–50, 100–101, 582–583, 600–604, 604 |
| Overlapping paths share one record per Ayah | Test 16 |
| Guest→account merge: union by id, newer `updatedAt` wins, tombstones survive both directions, archived path cannot stay primary, repeat merge is a no-op | Tests 17, 23 |
| Malformed guest journey cannot break merge | Test 24 |
| Old saves/backups hydrate safely; Quran dataset hash unchanged | Test 18, Phase 3.0 tests 9–10 |
| No unintended microphone activation on the Journey page | Browser smoke test: `getUserMedia` calls = 0 |

---

## 4. Test and build results (all run on 2026-11-13, Node v24.19.0)

| Check | Result |
|---|---|
| `npm run test:hifz` | **24 passed, 0 failed** (11 Phase 3.0 + 7 Codex Phase 3.1 + 6 added now) |
| `npm run test:navigation` | **10/10 groups passed** |
| `npx tsc --noEmit --incremental false` | **Passed** (was failing at handover) |
| Static production export (`BUILD_ANDROID=1 NEXT_DIST_DIR=.next-phase31 next build`) | **Passed**; 10/10 static pages; `/memorize` 13.3 kB |
| `npm run validate:quran` | Completed: 114 Surahs / 6,236 Ayahs compared, **2 known differences** (2:72, 11:41), exit 2 = expected "review differences" status |
| `public/data/quran.json` SHA-256 | `fab6e90867736262658b840b28b91aaab46ade99b058531e2cdc072931201680` (unchanged) |
| Browser smoke test (Chrome headless, 360×740) | Journey renders, setup opens, partial-Juz claim saved as claim only, onboarding `complete`, no errors, no horizontal scroll, no garbled text, 0 mic calls |

Not run: lint (no ESLint configuration in the project), Android Gradle build, physical device tests, live Supabase.

---

## 5. Files changed

**By Codex (before handover):**
- `src/lib/store.ts`: `StudentJourney` types, hydration, guest-merge rules for paths/claims/preferences.
- `src/lib/journey.ts`: **new**; path/claim/range builders.
- `src/components/PersonalizedJourney.tsx`: **new**; onboarding/edit UI.
- `src/app/memorize/page.tsx`: renders the journey card; path cursor update after sessions.
- `scripts/test-hifz.mjs`: 7 Phase 3.1 tests.

**By Claude (completion):**
- `src/lib/journey.ts`:
  - fixed `partialJuzRange` and `rangeFromPageBounds`;
  - added `previousAyah`, `expandRanges`, `tombstoneClaim`, `archivePath`.
- `src/components/PersonalizedJourney.tsx`: claim removal and path archiving now call the tested helpers.
- `src/lib/store.ts`: guest journey validated before merge.
- `src/app/memorize/page.tsx`:
  - repaired 27 encoding-corrupted characters;
  - confirmation dialogs on the two existing destructive "Clear" buttons.
- `scripts/test-hifz.mjs`: corrected the page-range expectation; added 6 tests.
- `PHASE_3_1_PERSONALIZED_JOURNEY_REPORT.md`: this report.

**Side effects:**
- `npm run validate:quran` rewrote its own output `scripts/quran-reference-differences.csv` (same 2 differences).
- The build created `.next-phase31/` and refreshed `out/`.

**Not changed:** Quran text, page layout, ASR (`quranAsr.ts`, `recitationAlign.ts`, `LiveRecitation.tsx`, speech server), Visual Maps, SRS logic in `hifz.ts`.

---

## 6. Remaining risks

### Supabase multi-device synchronization (unresolved — HIGH)
Sync is still **whole-state, newer-top-level-`t` wins** (`src/lib/supabase.ts`); Phase 3.1 did not change it.
- **Offline work can be lost:** Device A practices offline, Device B edits later, A reconnects. A *pulls B's newer state and replaces its own*, so A's offline Hifz evidence, claims and path changes are lost.
- **Mid-session overwrites:** a device that is already signed in pushes its whole state, overwriting changes another device made since this device's last pull.
- **Clock skew:** a device with a fast clock wins every comparison.
- **Partial protection only:** the new per-item `updatedAt` and tombstones make a field-level merge *possible*, but they are only used for guest→account merge, not for cloud pulls.
- **Recommended next step:** reuse the guest-merge logic for Supabase pulls (merge instead of replace), and keep a few local pre-sync snapshots. **Two-device sync must not be described as conflict-free.**

### Other known gaps
| Severity | Item |
|---|---|
| HIGH (existing) | The Juz/range "Mark memorized" buttons still create synthetic `mem` records (`markRange`), and `isMemorized()` counts them. Dashboards therefore mix "said known" with "recited". Claims are now the recommended path, but the old buttons remain, now behind a confirmation for the destructive direction. |
| MEDIUM | Claims are not yet shown in the Juz/Surah tracker grid (the dashed "claimed vs recited" display from the review is not built). They appear only as labelled pills on the journey card. |
| MEDIUM | Two preference copies: saving the journey writes `journey.studyMinutes/learningDays` and `settings.newTarget/revTarget` (Ayah units only). The older "Daily study time" control writes only `journey.studyMinutes`, so the two can diverge until the journey is next saved. |
| MEDIUM | Guest merge takes `learner` (name/experience) from whichever journey has the newer `updatedAt`, not "account name first" as recommended in the review. Deterministic, but an account name can be replaced by a newer guest name. |
| MEDIUM | Continue starts at the path cursor and does not yet skip Ayahs already learned or claimed. Skipping is planner work (Phase 3.2). |
| LOW | Learner name is limited to 50 characters (review suggested 40) and rendered as plain text (no HTML). Arabic and Urdu input works. |
| LOW | `short_surahs` orders by Ayah count, not word count. Documented. |
| — | Device-level checks (Android WebView, screen readers, RTL in the native app) were not run. |

---

## 7. Acceptance status against the Phase 3.1 review

| Review blocker | Status |
|---|---|
| Claims stored as synthetic `mem` records | **Resolved:** claims live in `studentJourney.claims`; tests 15, 22 and browser check |
| Remove/edit actions deleting evidence | **Resolved** for claims and paths (tombstones; test 22). Legacy "Clear" buttons still delete, now with explicit confirmation. |
| Reverse path reversing Ayahs | **Resolved:** test 20 |

The high-risk items in §6 remain open and are documented, not claimed as fixed.
