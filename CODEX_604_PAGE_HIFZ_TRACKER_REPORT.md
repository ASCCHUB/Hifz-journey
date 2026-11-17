# Codex Stage 3 — 604-Page Hifz Tracker

Date: 2026-11-14

## Result

The Journey screen contains a read-only tracker for all 604 canonical Madani Mushaf pages. It groups pages by Juz, filters by memorization status, opens a page detail sheet, marks the current learning page, and keeps the last reading page visibly separate. Read, Learn, Recall and Revise actions use the existing Mushaf routes. Revision links select only Ayahs on the chosen canonical page and enter the existing Practice flow.

Opening a tile or page sheet does not write progress. Page statuses are derived from the learner's current evidence and existing claims; no SRS rules or storage formats were changed.

## Files changed for this Stage 3 completion

- `src/components/PageTracker.tsx` — route-based revision actions, separated reading location label, strict integer page jump, and accessible current-page indication.
- `src/app/mushaf/page.tsx` — handles the tracker’s page-scoped revision route and does not update last-read location during learn, recall or revision.
- `src/lib/pageRecall.ts` — validates the optional Ayah subset on a revision route against that page’s canonical Ayah list.
- `scripts/test-phase3.mjs` — tests valid subsets, full-page fallback and rejected malformed, duplicate or out-of-page Ayahs.
- `CODEX_604_PAGE_HIFZ_TRACKER_REPORT.md` — this report.

The previously implemented tracker logic remains in `src/lib/pageTracker.ts`. The existing broader implementation history and earlier browser checks are recorded in `STAGE_3_604_PAGE_HIFZ_TRACKER_REPORT.md`. No Quran data/layout, persistence, Supabase, SRS, or Android build files were changed. The production build temporarily added its custom output directory to `tsconfig.json`; that generated include entry was removed afterward.

## Status rules

The tracker evaluates a page using canonical per-Ayah memory records, weak flags, learner claims and unfinished lessons. First matching status wins:

1. **Weak / needs help** — a recited Ayah has a mistake or is in the weak queue.
2. **Due for revision** — any evidenced Ayah is due under the existing due-date fields.
3. **Currently learning** — an unfinished lesson begins on the page.
4. **Strongly retained** — every Ayah on the page meets the existing retention rule (at least a 30-day interval and five clean days).
5. **Learned with evidence** — every Ayah has clean learner-rated recall but the whole page is not yet strongly retained.
6. **Partly checked** — some Ayahs have recall evidence, but not every Ayah does.
7. **Previously memorized (self-reported)** — only claims or legacy marks exist, without recitation evidence.
8. **Not started** — no evidence or claim exists.

A partial or sampled assessment cannot mark a full page Learned or Strong. Claims remain visibly unverified. Page status and the tracker are derived views; they do not award evidence or alter scheduling.

## Page information and actions

The detail sheet shows page and Juz, represented Surah names and Ayah range, assessed/retained counts, self-reported claims, weak and due Ayahs, not-started Ayahs, and any maps returned by the existing teacher-review gate. If no map passes that gate, none is shown. The review manifest currently has no approved maps, so map links may be absent.

The learning location comes from the newest unfinished lesson, then the next unit in the primary learning path. The saved reading location is independently displayed from `st.lastPage`; the Mushaf updates that value only in read mode. Page grouping uses the Juz of that canonical page's first Ayah. Existing claims that lack detailed Ayah references cannot be attributed to a page by the page-level claim lookup.

## Verification

| Check | Result |
|---|---:|
| `npm run test:hifz` | 24/24 passed |
| `npm run test:phase3` | 56/56 passed, including 604-page coverage, mixed evidence and revision-route Ayah validation |
| `npm run test:navigation` | 10/10 groups passed, including all Juz, Hizb, quarters, pages and deep links |
| `npm run test:storage` | 17/17 passed |
| `npm run test:sync-guard` | 15/15 passed |
| `npx tsc --noEmit --incremental false` | Passed |
| `NEXT_DIST_DIR=.next-codex-604-tracker npm run build` | Passed; optimized production build and static page generation completed |

The production build initially failed inside the restricted process sandbox with `spawn EPERM`; it passed when rerun through the approved elevated build invocation, using a separate output directory to avoid touching the regular `.next` build. The generated `tsconfig.json` include entry for that directory was removed after the build.

### Browser and mobile check limitation

I attempted to access the open Chrome window for a fresh desktop and 360px browser check. The computer-use service reported that its browser access host was unavailable and did not expose browser tabs. Therefore I cannot claim a fresh screenshot-based visual check from this run. The existing Stage 3 report records prior 360×640 and desktop browser checks for the tracker. This completion adds narrow-screen-friendly wrapping controls, 42px-minimum grid tiles, status shape cues, and bottom-page padding supplied by the existing app shell, but those layout details still need a fresh visual check when browser access is available. No physical Android/WebView test was performed.

## Known limitations

- A page spanning Surahs lists all represented Surah names, with its first and last canonical references; it does not enumerate every intermediate reference in the sheet.
- Lessons spanning multiple pages are associated with their start page by the existing page tracker rule.
- Reviewed-map visibility remains governed by existing teacher approval and redistribution-review rules; this work does not approve or import maps.
- No physical Android device check was performed.
