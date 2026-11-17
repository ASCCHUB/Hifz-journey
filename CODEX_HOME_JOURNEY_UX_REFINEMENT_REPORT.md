# Home & Hifz Journey UX Refinement Report

Date: 2026-11-14

## Summary

- Home now leads with the learner greeting and the saved unfinished lesson, primary path lesson, or saved page, followed by Learn, Recall, and Revise actions.
- Today's Hifz initially shows at most three tasks. “View All Revision Tasks” expands the complete existing plan without changing how tasks are scheduled.
- Continue Reading follows the task summary. Progress, daily Ayah, goals, and charts are grouped in a collapsed section.
- My Hifz Journey now presents the current memorization page, path/profile, tutor actions, the existing Surah/Juz tracker, today's compact plan, and collapsible teaching and advanced tools.
- The existing tracker remains the 114-Surah/30-Juz tracker; no new 604-page tracker was introduced. Self-reported claims and recitation evidence remain distinguished.
- The Juz/Surah action now links to the Journey tracker from Home. Primary action buttons have larger touch targets, and the Arabic daily Ayah uses RTL direction.

## Files Changed

- `src/app/page.tsx`
- `src/app/memorize/page.tsx`
- `src/components/PersonalizedJourney.tsx`
- `src/components/TodayPlan.tsx`
- `src/components/TutorHub.tsx`

## Screens Verified

- Home and My Hifz Journey at desktop width (1280px browser window).
- Home and My Hifz Journey at 360px responsive viewport.
- Checked visible ordering, task controls, page tracker, bottom navigation, Arabic direction, and horizontal overflow. No horizontal overflow was observed.
- The preview used the app's blank browser state; no learner records were reset or modified for testing.

## Automated Checks

- `npm run test:hifz` — passed, 24 tests.
- `npm run test:phase3` — passed, 35 tests.
- `npm run test:navigation` — passed, 10/10 groups. The suite reports existing page/line reference differences and cautions that layout provenance needs care.
- `npm run test:storage` — passed, 17 tests.
- `npx tsc --noEmit --incremental false` — passed.
- Static production build — passed; all 13 routes were prerendered. Built with `BUILD_ANDROID=1` and isolated output directory `.next-codex-home-journey`.

## Limitations

- The existing Journey tracker covers Surahs and Juz, not individual 604 Mushaf pages. This task did not add a page grid.
- Browser review used the current blank preview state; screens with populated claims, unfinished lessons, and more than three due tasks were covered by the existing state-driven rendering and automated Hifz/planner suites, not by editing real learner data.
- Android WebView was not separately exercised. No Android build scripts or persistence/scheduling code were changed.
