# Android Mushaf Learning UX Fix Report

## Root cause

On phone widths, the Mushaf reader kept its mode tabs, recitation panel, page toolbar, and shared bottom navigation in normal page flow. The teaching panel appeared after the page instead of staying reachable beside it. Its “keep Ayah visible” logic scrolled the window, although the page needed to scroll independently. In short landscape viewports, the old flow could also leave the active Ayah behind the lesson panel.

## Changes

- Active Mushaf lessons at phone, tablet portrait, and short landscape sizes now use a focused viewport. The shared app bottom navigation, Mushaf mode tabs, standalone recitation panel and page toolbar are hidden while the lesson is running. Other screens and inactive Mushaf navigation are unchanged.
- The 15-line Mushaf is the main scroll surface. Its Quran font is not reduced to fit the full page vertically. The active Ayah is moved only when it falls outside the unobscured page area; viewport and panel size changes are observed so rotation keeps it visible.
- The compact dock starts collapsed and shows the activity, current Ayah, short instruction, Listen when relevant, Next, Expand and Save & Exit. Listen and Next sit side by side on compact preparation steps. Expanded controls include meaning, repetition, hints, visibility options, available memory maps, skip/back and Save & Exit.
- The expanded panel scrolls within the viewport; the Mushaf remains visible above it. Bottom placement respects `env(safe-area-inset-bottom)`.
- Show full page, Hide unlearned Ayahs and Current Ayah only remain available. Hidden text remains empty and `aria-hidden`; browser checks found no text leakage.
- Save & Exit and resume use the existing lesson record and lesson step. The browser test advanced one practice step, exited, and confirmed it resumed at that step. It did not finish/rate the lesson or create Hifz evidence.
- Desktop keeps the existing side-by-side Mushaf and lesson panel.

## Files changed

- `src/app/globals.css`
- `src/components/MushafLesson.tsx`
- `scripts/test-android-mushaf-ux.mjs` — headless Edge viewport regression and screenshot capture
- `package.json` — `test:android-mushaf-ux` script

No Quran text, page/line metadata, assessment rules, saved lesson records, SRS, IndexedDB or Supabase code was changed.

## Browser screenshots

Captured from Microsoft Edge 157 headless. The “before” image is a browser reproduction of the former stacked flow with the focused-mode CSS class disabled; it is not a saved screenshot from before the edit.

- Before, stacked layout: [360 × 800](artifacts/android-mushaf-learning-ux/before-stacked-layout-360x800.png)
- After, compact dock: [320 × 740](artifacts/android-mushaf-learning-ux/phone-320x740-collapsed.png), [360 × 800](artifacts/android-mushaf-learning-ux/phone-360x800-collapsed.png), [393 × 852](artifacts/android-mushaf-learning-ux/phone-393x852-collapsed.png), [430 × 932](artifacts/android-mushaf-learning-ux/phone-430x932-collapsed.png)
- Expanded dock: [360 × 800](artifacts/android-mushaf-learning-ux/phone-360x800-expanded.png)
- After advancing and resuming: [after Next](artifacts/android-mushaf-learning-ux/phone-360x800-after-next.png), [resumed](artifacts/android-mushaf-learning-ux/phone-360x800-resumed.png)
- Other form factors: [phone landscape, 844 × 390](artifacts/android-mushaf-learning-ux/phone-landscape-844x390-collapsed.png), [tablet portrait, 768 × 1024](artifacts/android-mushaf-learning-ux/tablet-768x1024-collapsed.png), [tablet landscape, 1024 × 768](artifacts/android-mushaf-learning-ux/tablet-landscape-1024x768-collapsed.png)

## Verification

- Automated viewport regression passed for 320, 360, 393, 430, 768, 844 × 390, and 1024 × 768. Every screenshot contained 15 Mushaf lines; no viewport had horizontal overflow. At phone and tablet portrait widths, the active Ayah stayed above the dock, navigation was hidden during the lesson, and Next, Expand, Save & Exit were visible with 44 px minimum height.
- Expanded dock stayed within the viewport. All three visibility choices were present. Hide unlearned and Current Ayah checks produced 127 empty placeholders in the test page, with no Arabic text in the hidden accessible nodes.
- Next advanced from step 1 to step 2; Save & Exit followed by reopening the lesson resumed step 2. The test did not rate or complete a lesson.
- TypeScript: `npx tsc --noEmit` passed.
- `test:navigation` 10/10 groups, `test:hifz` 26/26, `test:journey` 13/13, `test:phase3` 56/56, `test:storage` 17/17, `test:refpdfs` 7/7, `test:sync-guard` 15/15, `test:refpdf-learn` 4/4, `test:mushaf-recitation` 6/6, and `test:android-mushaf-ux` passed.
- Quran integrity validation compared all 114 Surahs and 6,236 numbered Ayahs; it exited nonzero for the two previously documented reference differences at 2:72 and 11:41. They remain untouched, pending review.
- `npm run lint` could not run unattended: it stops at Next.js's interactive ESLint setup prompt. No lint configuration was added for this UI-only fix.
- No Android emulator was available (`adb` is not installed). Android system Back, soft keyboard behavior, and physical safe-area insets were not verified on a device. Browser viewport tests cover the in-app Save & Exit/resume path and safe-area CSS placement.

## Android package

Production Android build succeeded. Build ID: `20261115-1908-d2b3e4` (versionCode `1511708`). The APK frontend parity check passed: 287 files, zero missing, zero stale, and all bytes match.

APK: `C:\Users\sajid\Downloads\QURAN COMPANION\Hifz-Journey-20261115-1908-d2b3e4-debug.apk`
