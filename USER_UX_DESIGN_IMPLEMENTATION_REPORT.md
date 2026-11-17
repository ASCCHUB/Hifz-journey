# Quran Companion UX Design Implementation Report

## Design to app comparison

The five requested screens now use the existing forest-green visual system, shared navigation, and app state. The updates apply the reference hierarchy and layouts to existing routes and components. No sample Quran text or learner progress from the mockups was copied.

## Screens changed

- **My Journey:** A single shared top-bar title replaces the stacked titles. One prominent Continue Hifz action leads the page; Learning goal, Revision, and Your Quran use the same outlined action style. The revision count and “ayahs due” share a baseline. Existing daily plan and saved journey state remain in place.
- **New Learning:** Uses the shared top bar and keeps unfinished lesson resume, Juz/Surah/page selection, starting Ayah, whole/half page, and guided Ayah-by-Ayah actions. Juz contents now render only when that section is expanded, avoiding unnecessary work during initial rendering. No render loop or blocking synchronous computation was found in the route; lazy expansion reduces initial rendering work.
- **Mushaf Learn:** The shared title bar is shown and the sidebar selects New Learning while lesson mode is active. At desktop, the 15-line page and lesson panel sit side by side; at narrower widths they stack. Existing lesson state, display options, concealment, meaning/map availability, and recitation controls remain connected to the existing services. Page fitting accounts for viewport height.
- **Revision:** The shared top bar replaces its redundant in-page title. Existing SRS, planner and revision controls are unchanged; due and weak work remain clear.
- **My Quran:** The shared top bar replaces its redundant title. Existing expandable Juz/Surah/604-page coverage and distinct recited/self-reported states remain intact.

## Shared components and behavior

`PageTopBar` supplies the title, Search button and More button. Its More menu uses the same six destinations as the existing sidebar More menu. The sidebar itself keeps its existing presentation. Search opens the existing Quran search dialog. `Sheet` was extracted as a shared component to avoid a circular import. Shell navigation retains lesson deep links and resume state. Existing Quran data, IndexedDB progress, Supabase sync protections, planner, SRS, maps, recitation and lesson engines were reused; no duplicate progress store or memorization engine was added.

## Improvements beyond the mockups

- Journey uses one Continue Hifz action and keeps the daily planner under its existing disclosure.
- Learning passage choice is separated from lesson method and Juz details load on demand.
- Mushaf fitting responds to viewport height so all 15 rows fit in the desktop learning view.
- Self-reported memorization remains distinct from recitation and independently assessed evidence.
- Advanced display options remain within the existing disclosure. Meaning and map actions appear only when their current approved/local sources are available.

## Screenshots and visual verification

Screenshots were captured in headless Edge at 360px, 768px and 1280px CSS viewport widths (1000px high). Links are relative to this report.

| Screen | 360px | 768px | 1280px |
|---|---|---|---|
| My Journey | [screenshot](tmp/ux-design-screenshots/my-journey-360.png) | [screenshot](tmp/ux-design-screenshots/my-journey-768.png) | [screenshot](tmp/ux-design-screenshots/my-journey-1280.png) |
| New Learning | [screenshot](tmp/ux-design-screenshots/new-learning-360.png) | [screenshot](tmp/ux-design-screenshots/new-learning-768.png) | [screenshot](tmp/ux-design-screenshots/new-learning-1280.png) |
| Mushaf Learn | [screenshot](tmp/ux-design-screenshots/mushaf-learn-360.png) | [screenshot](tmp/ux-design-screenshots/mushaf-learn-768.png) | [screenshot](tmp/ux-design-screenshots/mushaf-learn-1280.png) |
| Revision | [screenshot](tmp/ux-design-screenshots/revision-360.png) | [screenshot](tmp/ux-design-screenshots/revision-768.png) | [screenshot](tmp/ux-design-screenshots/revision-1280.png) |
| My Quran | [screenshot](tmp/ux-design-screenshots/my-quran-360.png) | [screenshot](tmp/ux-design-screenshots/my-quran-768.png) | [screenshot](tmp/ux-design-screenshots/my-quran-1280.png) |

Automated visual checks confirmed the correct sidebar item on each route, all six More destinations, Search opening, and 15 Mushaf rows at all three widths. At 1280px, the Mushaf page and lesson panel are beside each other; the page's scroll height equals its client height, and all rows end within the 1000px viewport. No fixed navigation/audio bar overlaps any visible Mushaf row at any captured width. All audited navigation and UI controls outside the Arabic Mushaf text measured at least 44×44px. Arabic word hit regions remain dense to preserve the 15-line Mushaf; this audit does not establish a 44px minimum for each word-level text interaction.

Detailed viewport measurements and menu/navigation checks are in [verification.json](tmp/ux-design-screenshots/verification.json).

## Quran text differences requiring human review

The pinned validator compared all 114 surahs and 6,236 numbered ayahs. It reported exactly these two differences. Quran data was not changed, and this report does not decide which text is correct. The reference column is the pinned King Fahd Complex Uthmanic Hafs v2.0 dataset. Embedded end-of-ayah presentation marks and spacing are retained as supplied by the comparison.

### Surah 2, ayah 72

- App: `وَإِذۡ قَتَلۡتُمۡ نَفۡسٗا فَٱدَّـٰرَ ٰٔتُمۡ فِيهَاۖ وَٱللَّهُ مُخۡرِجٞ مَّا كُنتُمۡ تَكۡتُمُونَ`
- Reference: `وَإِذۡ قَتَلۡتُمۡ نَفۡسٗا فَٱدَّٰرَٰءۡتُمۡ فِيهَاۖ وَٱللَّهُ مُخۡرِجٞ مَّا كُنتُمۡ تَكۡتُمُونَ ﱇ`

### Surah 11, ayah 41

- App: `۞وَقَالَ ٱرۡكَبُواْ فِيهَا بِسۡمِ ٱللَّهِ مَجۡرٜىٰهَا وَمُرۡسَىٰهَآۚ إِنَّ رَبِّي لَغَفُورٞ رَّحِيمٞ`
- Reference: `۞ وَقَالَ ٱرۡكَبُواْ فِيهَا بِسۡمِ ٱللَّهِ مَجۡر۪ىٰهَا وَمُرۡسَىٰهَآۚ إِنَّ رَبِّي لَغَفُورٞ رَّحِيمٞ ﰨ`

The full machine-readable comparison is [quran-reference-differences.csv](scripts/quran-reference-differences.csv). Validator app dataset SHA-256: `fab6e90867736262658b840b28b91aaab46ade99b058531e2cdc072931201680`. Validation exits with status 1 to request review of these two differences.

## Checks

- `npx tsc --noEmit` — passed.
- `npm run build` — passed.
- `test:navigation` — 10 groups passed.
- `test:hifz` — 26 tests passed.
- `test:phase3` — 56 tests passed.
- `test:storage` — 17 tests passed.
- `test:refpdfs` — 7 tests passed.
- `test:sync-guard` — 15 tests passed.
- `test:journey` — 13 tests passed.
- `test:refpdf-learn` — 4 tests passed.
- `test:mushaf-recitation` — 6 tests passed.
- `validate:quran` — review required; exactly the two listed differences, no changes made.

## APK

- Build ID: `20261115-1229-682cdd` (version code `1511309`).
- APK: `../Hifz-Companion-20261115-1229-682cdd-debug.apk`.
- Packaging completed successfully. Frontend parity verification reported 286 files, zero missing, zero stale, and matching bytes.
- No physical Android device was used; device installation/runtime behavior is not claimed as verified.

## Outstanding verification

- Human review is needed to decide the two pinned Quran text differences above.
- The 44px audit covers visible UI controls outside the Arabic Mushaf text; it does not verify word-level hit regions against that threshold.
- Responsive screenshots and browser checks are complete. A physical Android device was not available for on-device validation.
