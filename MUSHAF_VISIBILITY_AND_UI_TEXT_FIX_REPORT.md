# Mushaf Visibility and UI Text Fix Report

## Summary

Fixed corrupted interface literals and added saved display options to the existing Mushaf lesson panel. The Quran text dataset and lesson evidence rules were not modified.

## Root causes

- Several user-facing labels contained mojibake directly in source strings, including quote marks, separators, arrows, Urdu labels, and an icon. These were malformed source literals rather than a browser font issue.
- Surah summaries composed separators and page ranges inline, so the malformed punctuation appeared in dynamically generated rows as well.
- The running development server and Android production export both used `.next`. The APK build replaced the dev chunks while the old server stayed open, so it served HTML that referenced missing CSS and JavaScript files.

## Changes

- Replaced corrupted UI text with readable labels and simple punctuation across Mushaf, My Quran, learning, assessment, profile, and maps screens. Restored the Urdu translation labels.
- Added shared Surah page-summary and Juz-name helpers in `src/lib/quranView.ts`; My Quran displays single-page references as `Page N` and ranges as `Pages N-N`.
- Added **Text visibility** under **Display options** in both guided and manual Mushaf lesson panels. Options are **Show full page**, **Hide unlearned Ayahs**, and **Current Ayah only**. Existing learners default to the previous full-page display.
- Saved the choice in optional tutor preferences. Changing it does not alter the lesson step, ratings, or Hifz progress.
- Visibility only adds concealment to the lesson renderer. Already-hidden Recall words remain hidden. Concealed words use empty measured-width placeholders marked `aria-hidden`, preserving line geometry without placing hidden Quran text in the DOM or accessibility tree. The active learning passage remains highlighted.
- Visibility follows the selected lesson portion in canonical Ayah order, including second-half starts, multi-Ayah ordering exercises, and phrase chunks within long Ayahs.
- Added regression coverage for Surah/Juz/page labels and visibility behavior, including prior/current/future Ayahs and preservation of existing hidden Recall words.
- Set development builds to `.next-dev` by default in `next.config.mjs`, while retaining `NEXT_DIST_DIR` overrides. Production and APK builds continue using `.next`, so they no longer overwrite a running dev server's assets.

## Verification

- TypeScript check: passed.
- `test:hifz`: 26 passed, including the new label and visibility cases.
- `test:navigation`: 10/10 groups passed.
- `test:journey`: 13 passed.
- `test:phase3`: 56 passed.
- `test:storage`: 17 passed.
- `test:refpdfs`: 7 passed.
- `test:sync-guard`: 15 passed.
- `test:refpdf-learn`: 4 passed.
- `test:mushaf-recitation`: 6 passed.
- Quran validation: all 114 Surahs and 6,236 numbered Ayahs checked. Dataset SHA-256 remains `fab6e90867736262658b840b28b91aaab46ade99b058531e2cdc072931201680`. The validator reports two reference differences requiring review; the dataset was not changed.
- Android production export completed and APK parity verification passed: 286 frontend files, 0 missing, 0 stale, and byte-for-byte matching assets.

## Screenshot and layout check

After restarting the dev server with the isolated output directory, the Mushaf route loaded in the VS Code preview with the emerald theme, Quran page, and compact lesson panel visible. The route and its CSS/JavaScript assets returned HTTP 200. The lesson panel's Display options section was present. The 360px viewport was not separately checked.

## APK

- Fresh build ID: `20261115-0950-5c1223`
- APK: `C:\Users\sajid\Downloads\QURAN COMPANION\Hifz-Companion-20261115-0950-5c1223-debug.apk`
- Frontend fingerprint: `d8b5a1bebb5d70e7`

## Limitations

- The normal web build initially could not launch worker processes under the restricted sandbox. The Android export and APK build succeeded with the project's single-worker settings, and the APK was built and parity-verified outside the process sandbox.
- The restarted development server is running with its own `.next-dev` build directory. Desktop preview was visually checked; 360px mobile was not.
