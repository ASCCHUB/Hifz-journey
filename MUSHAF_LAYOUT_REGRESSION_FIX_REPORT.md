# Mushaf Layout Regression Fix Report

## Root cause

The recent responsive change introduced three interacting layout problems:

1. Learn mode reduced Arabic font size to force all 15 lines into the remaining viewport height. On short viewports or with the lesson panel, that pushed the type down to an 8–16px range.
2. The desktop Learn grid allocated only about 63% of the available area to the Mushaf, and the Mushaf itself had no shared width constraint across modes.
3. Long lines used `justify-content: space-between`, stretching each line's gaps into columns. Fit measurement read the rendered DOM, so concealed words could also change the width estimate between modes.

The fix measures canonical words from the existing page-line sequence in an offscreen row. It fits text to available page width only, caps the desktop/tablet size at 30px, and uses a controlled 0.2em gap with centered lines. It does not reflow, sort, or edit the page-line metadata or Quran text. Read, Learn, and Recall now share the same page geometry and fitted size. Concealed words still use the existing measured placeholders and remain absent from the accessibility tree.

## Files changed

- `src/app/globals.css` — centered line layout, regular word gaps, tighter but readable row rhythm, 700px desktop page width, and a wider Mushaf column beside the lesson panel.
- `src/components/MushafReader.tsx` — mode-independent canonical-word fit measurement; unified one-row RTL Previous / page-number / Next controls; removed duplicate page-turn controls while retaining the page input, deep links, Tools, and legacy memorization actions.

No Quran data, page/line metadata, Hifz evidence, SRS, IndexedDB, Supabase, Visual Maps, PDF storage, or speech-recognition code was changed. The previously noted Quran reference differences at 2:72 and 11:41 remain untouched.

## Before and after

The before image is a **browser reproduction** of the previous regression CSS (height-shrunk 15.5px text, distributed line gaps, narrower 1.35fr Learn column). It is not a pre-edit production capture. The after image is the final browser render at the same page, mode, width, and 1400px viewport height.

- [Before: reproduced p3 Learn regression](tmp/mushaf-regression-shots/BEFORE-reproduced-regression-p3-learn-1280.png)
- [After: p3 Learn, concealed step](tmp/mushaf-regression-shots/p3-learn-1280.png)
- [After: p3 Read](tmp/mushaf-regression-shots/p3-read-1280.png)
- [After: p3 hidden Recall on phone](tmp/mushaf-regression-shots/p3-recall-360.png)

## Required page, mode, and viewport screenshots

All screenshots use the requested CSS widths and a 1400px viewport height so the complete page and its border fit in the capture. `R` is Read, `L` is Learn at a concealed guided step, and `H` is hidden Recall.

| Page | Width | Screenshots |
|---|---:|---|
| 3 | 360px | [R](tmp/mushaf-regression-shots/p3-read-360.png) · [L](tmp/mushaf-regression-shots/p3-learn-360.png) · [H](tmp/mushaf-regression-shots/p3-recall-360.png) |
| 3 | 768px | [R](tmp/mushaf-regression-shots/p3-read-768.png) · [L](tmp/mushaf-regression-shots/p3-learn-768.png) · [H](tmp/mushaf-regression-shots/p3-recall-768.png) |
| 3 | 1280px | [R](tmp/mushaf-regression-shots/p3-read-1280.png) · [L](tmp/mushaf-regression-shots/p3-learn-1280.png) · [H](tmp/mushaf-regression-shots/p3-recall-1280.png) |
| 155 | 360px | [R](tmp/mushaf-regression-shots/p155-read-360.png) · [L](tmp/mushaf-regression-shots/p155-learn-360.png) · [H](tmp/mushaf-regression-shots/p155-recall-360.png) |
| 155 | 768px | [R](tmp/mushaf-regression-shots/p155-read-768.png) · [L](tmp/mushaf-regression-shots/p155-learn-768.png) · [H](tmp/mushaf-regression-shots/p155-recall-768.png) |
| 155 | 1280px | [R](tmp/mushaf-regression-shots/p155-read-1280.png) · [L](tmp/mushaf-regression-shots/p155-learn-1280.png) · [H](tmp/mushaf-regression-shots/p155-recall-1280.png) |
| 558 | 360px | [R](tmp/mushaf-regression-shots/p558-read-360.png) · [L](tmp/mushaf-regression-shots/p558-learn-360.png) · [H](tmp/mushaf-regression-shots/p558-recall-360.png) |
| 558 | 768px | [R](tmp/mushaf-regression-shots/p558-read-768.png) · [L](tmp/mushaf-regression-shots/p558-learn-768.png) · [H](tmp/mushaf-regression-shots/p558-recall-768.png) |
| 558 | 1280px | [R](tmp/mushaf-regression-shots/p558-read-1280.png) · [L](tmp/mushaf-regression-shots/p558-learn-1280.png) · [H](tmp/mushaf-regression-shots/p558-recall-1280.png) |

## Typography and layout measurements

Headless Edge confirmed the bundled KFGQPC Uthmanic Hafs font was loaded for all captures. The measured page font sizes were:

| Width | Page 3 | Page 155 | Page 558 |
|---:|---:|---:|---:|
| 360px | 17.37px | 16.14px | 16.43px |
| 768px | 30px | 30px | 30px |
| 1280px | 30px | 30px | 30px |

At desktop/tablet size the line height is 57px; at 360px it scales with the fitted page font (about 30–33px for these pages). Every captured view reports exactly 15 rendered rows. The full page boundary fit in the viewport after scrolling the page into view. There was no document horizontal overflow, no page-shell horizontal overflow at default zoom, and no vertical clipping inside the Mushaf shell. The Learn page and teaching panel occupy adjacent columns at 1280px without overlap.

## Word-position stability and navigation

- Compared each line's word rectangles relative to the line origin between Read and concealed Learn/Recall at all three widths. Maximum measured position delta was **0px** at the recorded precision; the largest unrounded difference in the initial probe was 0.1px.
- Recall concealment produced 127–138 empty word slots per page, depending on page. Learn concealment produced 4–5 slots in its captured fade step. Concealed spans had no Quran text and their interactive ancestors had `aria-hidden="true"`.
- Existing canonical page and line word order is preserved by continuing to render `c.lines` and each stored `l.idx` in sequence.
- Browser navigation verified Next moves 155→156, Previous returns 156→155, and the page-number input deep-links to 558. Previous appears at the right and Next at the left for the RTL navigation row. Exactly one primary page-turn row is rendered.
- Recall hint handling and evidence/scheduling logic were not changed; the existing automated tests for assisted recall remain passing.

Detailed browser metrics for all 27 final captures are in [verification.json](tmp/mushaf-regression-shots/verification.json).

## Regression checks

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
- `validate:quran` — review required, with the same two differences at 2:72 and 11:41. App dataset SHA-256 remains `fab6e90867736262658b840b28b91aaab46ade99b058531e2cdc072931201680`.

The navigation test's separate comparison reports 56 page and 1,499 line-coordinate differences against its other layout source; it passes its checks that all existing app pages resolve and preserve all Ayah words in order. That comparison/layout provenance was not changed as part of this visual fix.

## APK and remaining limitations

- Build ID: `20261115-1319-6227c7`, version code `1511359`.
- APK: `../Hifz-Companion-20261115-1319-6227c7-debug.apk`.
- Android packaging passed parity verification: 286 frontend files, 0 missing, 0 stale, matching bytes.
- Verification used headless Edge responsive viewport simulation. No physical Android device was used, so device rendering/touch behavior is not claimed as tested.
- The two pinned Quran text differences remain for separate human review; canonical text was not modified.
