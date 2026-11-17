# Final Hifz User Experience QA

Date: 2026-11-14

## Summary

This pass ran the synthetic learner regression suites and attempted a fresh browser walkthrough. A fresh end-to-end browser session could not be completed: the existing Chrome tab showed a lesson at `localhost:3012`, but that server was no longer available. I started a dev server at `localhost:3015` and navigated to its isolated origin; the computer-use runtime then stopped because it could not confidently determine the current browser URL. No lesson controls, ratings, PDF actions, or existing learner profile were changed during that attempt.

I therefore do **not** claim fresh visual testing for the requested journey, desktop viewport, 360px viewport, PDF viewer, or synthetic learner profiles. Historical browser checks are listed separately below with links to their reports.

No application source code was changed in this QA pass. The only new deliverable is this report. The optional Quran reference validator generated `scripts/quran-reference-differences.csv`; it did not modify Quran data.

## Current browser attempt

- Desktop accessibility inspection identified an open Chrome window at a Mushaf lesson URL for Al-Fatihah 3–4, showing step 1 of 9. That was an existing browser origin, so I did not use its learning controls.
- The old app server at port 3012 was unavailable. A temporary Next.js server was started on port 3015 for a clean origin.
- After navigating the Chrome window to the new origin, the computer-use runtime stopped with: “could not determine the current browser URL on Windows with enough confidence to enforce policy.” I stopped UI automation as instructed.
- No synthetic learner profile was entered into the browser during this run. All current-run synthetic data coverage below comes from isolated automated tests.

## Existing browser checks (historical; not rerun in this pass)

These are prior QA results recorded in the repository reports, not new observations from this run:

- [Guided Mushaf learning report](STAGE_2_UNIFIED_MUSHAF_LEARNING_REPORT.md): records 48/48 browser checks at 360×740 and 1280×900, including lesson start, guided Ayah sequence, concealment and hints, Save & exit/resume, Read→Learn resume, completion evidence, and lesson navigation.
- [604-page tracker report](STAGE_3_604_PAGE_HIFZ_TRACKER_REPORT.md): records 36/36 checks at 360×640 and 1280×900, including 604 tiles, Juz filtering, page details and routes, tracker read-only behavior, panel visibility, and no horizontal overflow.
- [Phase 3.6 integration report](PHASE_3_6_FINAL_QA_REPORT.md): records a fresh synthetic profile flow through setup, a prior-memorization claim, guided lesson completion, next-day revision, recovery, progress and reload. It also explicitly records that live Supabase and on-device Android were not tested.
- [Reference PDF integration report](REFERENCE_PDF_MAPS_INTEGRATION_REPORT.md): records 32/32 PDF viewer checks at 360×740 and 1280×900 with local PDFs, page navigation, zoom, offline reopen, and no Hifz writes. That report does not establish the complete “open PDF from an active lesson and return to that exact lesson state” flow in this run.

Treat these as previous verification records. They do not replace the blocked fresh browser pass requested here.

## Automated regression results (run in this pass)

| Suite | Result |
|---|---:|
| `npm run test:hifz` | 24/24 passed |
| `npm run test:phase3` | 56/56 passed |
| `npm run test:navigation` | 10/10 groups passed |
| `npm run test:storage` | 17/17 passed |
| `npm run test:sync-guard` | 15/15 passed |
| `npm run test:refpdfs` | 7/7 passed |
| `npm run test:journey` | 13/13 passed |
| `npx tsc --noEmit --incremental false` | Passed |

The synthetic suites cover Hifz scheduling/evidence safety, lesson and Journey state helpers, all 604 page mappings and status combinations, route resolution, isolated IndexedDB PDF import/list/reopen/remove, PDF validation and storage failures, SRS storage protections, and sync guards. These are automated tests, not visual/browser completion of the learner journey.

### Quran reference validation

`npm run validate:quran` compared 114 Surahs and 6,236 Ayahs and exited with status 1 because it found two known review differences: **2:72** and **11:41**. The existing [Phase 3.6 report](PHASE_3_6_FINAL_QA_REPORT.md) records those same references as known and intentionally untouched. I did not edit `public/data/quran.json`, the Mushaf layout, or reference metadata. The generated comparison is in `scripts/quran-reference-differences.csv` for follow-up review.

## Requested journey coverage

| Journey check | Current-pass result |
|---|---|
| Home identifies current learning page | Not freshly browser-tested; prior Phase 3.6 report has a fresh-profile Home/learning flow. |
| Journey tracker locates the page | Not freshly browser-tested; prior Stage 3 report checks tracker pages, filters and details. |
| Start and complete a guided page lesson | Not freshly browser-tested; prior Stage 2 and Phase 3.6 reports cover this. |
| Save midway and resume at exact step | Not freshly browser-tested; prior Stage 2 report records this flow. Automated lesson/Journey tests passed. |
| Full-page recall and clean vs assisted ratings | Automated evidence and rating tests passed; not freshly browser-tested as one UI flow. |
| Tracker reflects newly earned evidence | Automated status tests passed; no new browser evidence was recorded this pass. |
| Revision task and return to page | Route/navigation tests passed; not freshly browser-tested end to end. |
| Open imported PDF and return to exact lesson | PDF storage tests passed; exact lesson-to-PDF return was not tested. |
| Read / Learn / Recall and page state | Navigation tests passed; not freshly browser-tested. |
| Navigation causes no unintended progress | Storage and evidence suites passed; no UI navigation experiment was performed in this run. |

## Bugs and fixes

- **No new application bug was confirmed in this pass.** Browser automation stopped before a reproducible UI issue could be tested.
- **No application fix was applied.** This task was QA-only and preserves Quran data, SRS rules, learner storage, cloud schema, and map approval statuses.
- The known validator differences at 2:72 and 11:41 remain unresolved and unchanged; review them against the project’s authoritative edition before altering any Quran text.

## Outstanding checks

- Fresh end-to-end browser run with isolated synthetic profiles: empty, partially memorized, and heavily populated.
- Desktop and 360px visual checks for the complete flow: Home, Journey, learning panel, recall ratings, tracker updates, revision return, and navigation-only progress invariance.
- Exact lesson → local imported PDF → exact lesson step return; PDF zoom/page controls in that same flow.
- Android WebView/device checks, including 360px-equivalent layout, touch targets, Arabic RTL/Quran typography, sticky teaching panel, file picker, and PDF rendering.
- Voice-recitation behavior on a real microphone and any live Supabase behavior were outside this test pass.
