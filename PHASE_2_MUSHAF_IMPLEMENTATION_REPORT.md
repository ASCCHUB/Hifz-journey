# Phase 2 — Mushaf Reader Upgrade Report

## 1. Summary

Improved the existing 604-page reader without replacing its Quran text or layout data. The reader now has an optional distraction-free mode, safer Ayah highlighting, RTL-correct swipe navigation, persisted highlight preference, improved Arabic line spacing, browser/Android Back handling for the reader and Ayah sheet, and rotation support in the Android wrapper. The Phase 1 location selector and existing page/Ayah routes remain in place.

## 2. Files changed

- `src/app/mushaf/page.tsx` — reading mode, history handling, responsive page shell, swipe direction, accessible Ayah entry points, and highlight toggle.
- `src/app/globals.css` — Arabic line spacing, low-contrast highlight, full-window reader layout, and safe-area handling.
- `src/lib/readerMode.ts` — Back-action decision helper used by the reader.
- `src/lib/store.ts` — backward-compatible settings hydration and persisted Ayah-highlight preference.
- `src/components/Audio.tsx` — identifies the player bar so distraction-free mode can hide its overlay while audio playback continues.
- `public/sw.js` — service-worker cache version advanced to v2 and `divisions.json` added to core offline data.
- `public/manifest.webmanifest` — allows portrait or landscape orientation.
- `android/app/src/main/AndroidManifest.xml` — allows orientation changes; microphone code and permissions were not changed.
- `scripts/test-navigation.mjs` — expanded navigation, layout-sequence, and saved-state/reader-history checks.
- `README.md` — documents the layout provenance and comparison limits.
- `PHASE_2_MUSHAF_IMPLEMENTATION_REPORT.md` — this report.

`public/data/quran.json`, `public/data/layout.json`, `src/lib/quran.ts`, `src/components/LocationNavigator.tsx`, and `src/components/AyahSheet.tsx` were not changed in this phase. The bundled Arabic font was also left unchanged.

## 3. Existing features preserved

The existing Quran text, all 604 page records, row ordering, Phase 1 Surah/Ayah/Juz/Hizb/Quarter/Page navigation, `/mushaf?p=N` and `/mushaf?s=N&a=N` links, exact bookmarks and last location, translation/Tafsir sheet, audio and repeat controls, memorization overlay, saved Hifz data, and Supabase state shape remain intact. New saved preferences are optional fields merged into the existing v1 state; the state version was not bumped.

## 4. Mushaf layout changes and reference findings

The bundled layout contains 604 pages: 600 pages have 15 row records, two opening pages have 8, and two later pages have 12. The existing layout data and its word order were retained. Arabic line height was increased to leave more room for marks, and the selected-Ayah background is a light tint without an outline/shadow over the glyphs. Page-level zoom continues to use the persisted zoom setting and line fitting; pinch zoom remains available.

The layout source recorded in the project README is `zonetecde/mushaf-layout` (built from Quran.com), but its exact print edition is not recorded. The repository’s pinned King Fahd Complex Uthmanic Hafs v2.0 reference uses per-Ayah page and line metadata. Comparing it with the existing layout reports **56 Ayah page-boundary differences and 1,499 Ayah line-coordinate differences**. For example, 5:77 is on app page 121 versus reference page 120. Quran Foundation’s layout catalogue distinguishes multiple 604-page, 15-line Medina editions, so these differences may reflect edition/data provenance; they were not corrected by changing layout or Quran data. The current reader must be described as a reconstruction, not publisher-exact page artwork or coordinates. See [Quran Foundation’s layout catalogue](https://qul.tarteel.ai/mushaf_layouts), its [KFGQPC V2 preview](https://qul.tarteel.ai/resources/mushaf-layout/10), and the project’s pinned-reference notes in `scripts/reference/README.md`.

## 5. Navigation and Ayah highlighting

Previous/next controls remain available, page input remains available, and horizontal swipe now follows RTL reading direction: a leftward swipe advances; a rightward swipe goes back. Pinch handling remains separate from one-finger page swipes. Ayah deep links and bookmarks still resolve to the page and focus the Ayah; the brief highlight now uses a pale gold background, and users can turn that highlight off from the reader. The default remains on for older saves.

The first word of each Ayah is keyboard-focusable and labelled for assistive technology. Page region and page-number controls have labels. Existing global theme settings and persisted page zoom remain the reading theme and scale controls.

## 6. Distraction-free mode

The CSS-based mode hides the application navigation, normal reader toolbar, and floating audio bar, then fills the available window with the Mushaf and essential page controls. It includes an Exit Reading button, Escape handling, safe-area padding, and a history entry so browser Back—and Android WebView Back where the WebView supplies history—closes the Ayah sheet first and then leaves reading mode. Audio is hidden visually but is not stopped. Native browser fullscreen was not required.

## 7. Mobile and Android compatibility findings

The reader keeps touch-sized page controls, horizontal overflow for zoomed pages, Arabic RTL direction on the Mushaf region, and handles window resizing. PWA orientation is now `any`; the Android Activity allows orientation changes and already declares orientation/screen-size configuration handling. The existing Android wrapper’s `onBackPressed` delegates to WebView history, which the reader now uses.

No Android device or emulator was available for this verification. Rotation, WebView Back, pinch gestures, glyph rendering, and status/navigation-bar safe areas still need device testing. No APK or Gradle build was run. The installed desktop preview observed during visual QA was a stale `localhost:3001` build with a missing `.next-test` layout chunk; starting a fresh dev server failed with `spawn EPERM`. Therefore no reliable post-change screenshot or visual comparison was captured.

## 8. Performance and offline reliability

No runtime library or additional font asset was added. The existing bundled Uthmanic font remains locally served. The service worker cache was bumped to v2 so existing clients fetch the new app shell, and `divisions.json` is now included with Quran/layout/Juz data for offline location selection. The static export completed successfully. Offline operation was not exercised in a browser or on Android.

## 9. Quran text integrity

`public/data/quran.json` remains unchanged and its SHA-256 is still:

`fab6e90867736262658b840b28b91aaab46ade99b058531e2cdc072931201680`

The pinned comparison validator checked all 114 Surahs and 6,236 Ayahs. It reports the two already-known differences at **Al-Baqarah 2:72** and **Hud 11:41** and exits with status 2 to signal review is required. Neither text was changed. The detailed result from this run is `tmp/phase2-quran-integrity.csv`.

## 10. Tests and build results

- `npm run test:navigation` — passed **10/10 groups**: all division boundaries, 604 pages, page/word order, row limits, invalid inputs, first/last Ayahs, backward-compatible v1 saves, and reader Back-state decisions. The test also reports the page/line comparison differences above.
- `npx tsc --noEmit --incremental false` — passed.
- `BUILD_ANDROID=1 npm run build` — passed as a Next.js static export; all static routes generated.
- Quran integrity validator — completed the full comparison; exit status 2 only because of the two known text differences.
- `npm run lint` was not run in this phase because ESLint is not configured in the project; the existing command previously opened Next.js’s interactive ESLint setup prompt.
- Android Gradle build and device/emulator testing were not run.

## 11. Known limitations

- The existing page/line dataset does not match every coordinate in the pinned KFGQPC v2 reference; this phase deliberately retained it.
- This is text-and-line reconstruction, not a scan, page-specific calligraphy, or publisher-certified rendering.
- Visual QA could not be completed because the available preview was stale and the local development server could not start in this environment.
- Android-specific behavior remains unverified on physical hardware/emulator.

## 12. Screenshots and visual comparison

No new screenshot was captured. The external comparison used the public QUL/KFGQPC V2 page preview and edition catalogue linked above; it confirmed the reference edition is 604 pages and 15 lines per page, but also illustrates that a generic Uthmanic font plus reconstructed line data is not equivalent to page artwork.

## 13. Phase 3 preparation recommendations

Before a future learning-tutor phase, confirm which exact Madani print edition the app intends to match and obtain a suitable licensed layout source for that edition. Add browser/device visual regression tests for phone portrait, landscape, focus mode, and Ayah-sheet Back behavior. Keep learning features consuming the existing verified Ayah IDs/ranges and progress APIs; do not derive Quran text from rendered glyphs or recognition output.
