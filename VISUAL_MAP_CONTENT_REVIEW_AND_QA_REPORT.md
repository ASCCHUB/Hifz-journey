# Visual Map Content Review and QA Report

Date: 2026-11-14

## Review outcome

The three current map documents are **technically valid** against the map schema and their canonical Ayah boundaries. **None is approved for teaching.** All three remain `awaiting_review`; no reviewer/date has been entered, usage permissions remain unresolved, and each has outstanding content questions. The lesson lookup fails closed unless technical validation, exact range matching, teacher review, a named reviewer/date, cleared permissions, and zero outstanding issues are all present.

| Map | Canonical coverage | Branch coverage | Arabic / translation / Tafsir in map document | Preliminary meaning and sequence review | New learning status |
|---|---|---|---|---|---|
| `al-fatihah` | Surah 1, Ayahs 1–7 | Seven ordered nodes; groups 1–4, 5–6, and 7 cover each Ayah exactly once. No missing or out-of-range references. | No full Quran Ayah, translation, or Tafsir is embedded. Arabic is loaded separately from the Quran dataset. | The broad progression (praise, mercy and recompense; worship, help and guidance; the paths in Ayah 7) follows the Ayah order. The final branch mentions the favored path and those astray but omits “those who incurred anger”; review whether that shortened label is misleading or incomplete. | **Not approved.** Structurally suitable as a visual aid, subject to teacher/scholar review of branch wording and rights. |
| `al-baqarah-1-5` | Surah 2, Ayahs 1–5 | Five ordered nodes; groups 1–2, 3–4, and 5 cover every Ayah exactly once. No missing or out-of-range references. | No full Quran Ayah, translation, or Tafsir is embedded. Node 2:1 uses the Arabic letter `ا` as an icon for the opening letters; it is not a verse string. Arabic verse text is loaded separately. | Sequence runs from the opening letters and Book, through qualities of belief, prayer and revelation, to guidance/success. Cue 2:3 compresses spending from provision to “provision”; cue 2:4 omits belief in previous revelation. Both are shorthand, but need teacher review for learning completeness. | **Not approved.** Review the condensed labels, particularly 2:3–4, before presenting as an authored teaching association. |
| `al-baqarah-21-29` | Surah 2, Ayahs 21–29 | Nine ordered nodes; groups 21–22, 23–24, 25–26, and 27–29 cover every Ayah exactly once. No missing or out-of-range references. | No full Quran Ayah, translation, or Tafsir is embedded. Arabic verse text is loaded separately. | Ayah order is preserved. The broad topics correspond to worship/creation, challenge/warning, good news/example, and covenant/return/heavens. The cue for 2:25 omits purified spouses and permanence; 2:26 omits the response to the example; 2:29 compresses the earth/sky sequence. A scholar/teacher should confirm the groupings do not imply unsupported links. | **Not approved.** Review completeness and the relationship implied by multi-Ayah branches before using during new learning. |

“Preliminary” here means a source-to-label comparison for review triage, not a Tafsir ruling or scholarly endorsement. No new religious interpretation was added.

## Text and source separation

- Map JSON contains canonical references and short memory labels, not the full Quranic Ayahs, translation text, or Tafsir. The content audit test checks that every canonical Ayah is represented once in the node list and group coverage, and that complete Ayah strings are not copied into the map document.
- The reader obtains Arabic from the bundled `public/data/quran.json` QuranEnc quran-json snapshot; `src/lib/quran.ts` documents its pinned KFGQPC v2.0 comparison. The map page renders the exact Ayah from this data separately from visual cues.
- The existing map page loads translations from `public/data/tr-en-sahih.json` (Saheeh International) and `public/data/tr-ur-jalandhry.json` (Fateh Muhammad Jalandhry), and Tafsir from `public/data/tafsir-ar-muyassar.json` (Al-Tafsir Al-Muyassar, King Fahd Complex). UI labels identify these separately. They are not copied into map JSON.
- The existing runtime map manifest calls map content `app-original`. This audit did not verify authorship records or redistribution/adaptation rights. Therefore, the separate review manifest records permissions as **unresolved**, rather than treating the label as proof of permission.
- `npm run validate:quran` reports two differences against its KFGQPC reference at 2:72 and 11:41; neither is in the three reviewed map ranges. The validator also says the upstream QuranEnc package version was not preserved. No Quran data was changed; those separate dataset findings remain for review. The command wrote/updated `scripts/quran-reference-differences.csv`.

## Review workflow and approval gate

Added [`public/maps/review-manifest.json`](public/maps/review-manifest.json) as the editorial record, separate from the technical map manifest. Each entry records its ID, canonical Ayah range, review status, reviewer/date, source attribution, permission status, technical status, and open issues.

Technical validation and teacher approval are separate:

1. Technical checks validate document schema, Surah/Ayah bounds, node/group coverage, and that full Quran text is not embedded. Passing these checks marks only `technicalStatus: technically_valid`.
2. A qualified teacher/scholar reviews every cue, group, sequence, translation/Tafsir distinction, and source. Enter the reviewer and ISO date only after that review.
3. Record source/rights evidence and set `permissionStatus: cleared` only when the usage rights are confirmed. Resolve every item in `outstandingIssues`.
4. Set that map’s status to `teacher_reviewed`. The lesson engine needs no edits: it merges this review manifest with the map catalog and enables an entry only when all approval fields pass and the canonical range still matches exactly.
5. If a source or map range changes, review it again. A missing/malformed review manifest, stale range, technical issue, open finding, missing reviewer/date, or unresolved/denied permission fails closed.

The production review manifest currently has three `awaiting_review` entries and **zero** lesson-approved maps. Technical validation does not set approval status. Tests use an in-memory synthetic approval record and do not edit production approval data.

## Learner-flow verification

### Automated checks

`npm run test:phase3` passed **48/48** after this report’s review-gate changes. `npx tsc --noEmit --incremental false` passed. Added test coverage verifies:

- each map has complete, ordered Ayah nodes and exact-once group coverage;
- map documents do not duplicate full Ayah strings;
- an in-memory reviewed fixture resolves by the exact canonical Surah/Ayah range;
- technical issues, stale coverage, open findings, unresolved rights, or a missing review file suppress the lesson lookup;
- only map-assisted ratings become “needed help”; clean recall remains clean;
- existing lesson progress/evidence behavior remains under the Phase 3 regression suite.

The same catalog lookup and `MapCue` component used by lessons receive approved entries from the effective catalog; the fixture is test-only and does not approve production maps. Existing UI code opens the map with the selected Ayah, highlights its node/branch, and returns to the persisted lesson route/step.

### Browser check

- Opened synthetic lesson `/learn?s=1&a=3&endS=1&endA=4` on an isolated local origin (`localhost:3012`) in Chrome. The learner reached the Al-Fatihah lesson start and first preparation/listen step; Arabic appeared from the Quran data. Because production has no approved map, the map card was correctly omitted. This verified the graceful no-approved-map path at the available desktop browser viewport.
- No Hifz ratings, map progress, or account synchronization were submitted. The browser origin was separate from the app’s normal origin and used a new local browser state.
- A 360px viewport and the approved-map render/branch-highlight/return interaction were **not visually verified**. The available Windows browser automation did not provide a supported viewport-resize control, and the safe synthetic approval was restricted to the in-memory test fixture after a production-manifest change was rejected. The approval gate, range lookup, branch references, step persistence, and assisted-evidence rules passed automated tests; those tests are not a substitute for visual browser QA at 360px.

## Nine-PDF import and review procedure

The supplied nine collections have not been found in the project, copied, extracted, OCR-processed, published, or packaged. Keep originals in a private review location **outside the repository**, `public/`, and `android/` while permission is unresolved.

1. Receive the original files into a private folder outside the project and record filenames, owners/source, receipt date, and file hashes for chain-of-custody. Do not add them to source control or a web-accessible folder.
2. Obtain written permission that specifically covers internal review, extraction/OCR, adaptation, redistribution, and app/Android distribution. Record the permitted scope and attribution requirements before any conversion.
3. Have a qualified Quran teacher/scholar compare every map’s Surah/Ayah boundary, exact Arabic text, order, translations/Tafsir, and visual associations against trusted sources. Record corrections and reviewer/date; do not infer missing content.
4. If permission is granted, extract only approved material into a private staging area. Review OCR against the source PDF page-by-page; do not trust OCR for Quranic Arabic.
5. Encode approved maps as separate canonical map documents referencing Quran data; avoid duplicating Quran text or source artwork unless the written permission explicitly allows it.
6. Run technical validation, compare visual rendering against the reviewed source, resolve all issues, and set individual review-manifest status/reviewer/date/permission only after both scholarly and rights review.
7. Before any release, inspect the static export and APK inputs to confirm only permitted map assets are included. The current Android build script copies the static export from `out/` into Android assets, so anything placed under `public/` can be packaged.

## Files changed for this review

- `public/maps/review-manifest.json` — editorial status, source, permissions, and open issues for all three existing maps.
- `src/lib/mapCatalog.ts` — fail-closed merge and eligibility gate; approval requires exact-range match, technical validity, named reviewer/date, cleared rights, and no outstanding findings.
- `scripts/test-phase3.mjs` — audit and isolated-approval workflow tests.
- `VISUAL_MAP_CONTENT_REVIEW_AND_QA_REPORT.md` — this report.

No Quran dataset, translation/Tafsir data, Hifz evidence, learner progress, storage schema, Supabase behavior, PDF, or Android build script was changed.
