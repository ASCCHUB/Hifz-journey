# Hifz Journey: Android UX standardization report

Date: 2026-11-16 · Debug APK: `Hifz-Journey-20261116-1943-6b1807-debug.apk`
- **Frontend parity:** 296/296 files, bytes match.
- **Installs as an update:** package `com.hifzcompanion`, same signing certificate `866123fa…`, versionCode 1513183.

The audit is in `HIFZ_JOURNEY_UX_AUDIT.md`. This pass corrects layout and flow; it adds no features.

## Problems fixed

| Screen | Before | After |
|---|---|---|
| **Mushaf Learn** | About 900 px of chooser (portion cards with Ayah ranges, a halves explanation, Guided/Manual, level, method text, Start) plus a “Recite on page” card, then the toolbar, all **before** the Quran. Page height 1,809 px | One compact card: portion chips in one row and **Start guided lesson · N ayahs**. Mode, level and explanations are under **Lesson options** (collapsed). Recite is not shown while choosing a lesson (still in Read, Recall and the Recite tab). The toolbar moves under the page. **The page starts on the first screen** (456 px on a 360×780 screen). Height 1,258 px |
| **Mushaf Read / Recall** | Toolbar and long helper text above the page | Page first; Tools / Next / page / Previous under the page; helper shortened |
| **Home** | “Set up journey” *and* “Start Your Hifz Journey” (both open setup); revision card said “complete for today” with a primary **Start Revision** to a user with nothing learned; prayer card had a settings button *and* a setup link; extra explanatory line | **One primary action per card.** “Change goal” text link only once a goal exists. Revision card: “Nothing to revise yet…” (no button), “Today's revision is done” with a secondary link, or a primary Start Revision only when work is due. One prayer setup link |
| **Revision** | “0 ayahs need review” plus “Recall a practiced page” with nothing practised; two separate “check” entries; intro sentence | No records: **one empty state** (“Nothing to revise yet”, *Learn a passage*). With records: Due today (weak count only if any), Today's plan, Not yet checked (one entry), Optional practice |
| **Progress** | 14 zero tiles, empty chart and empty lists (1,480 px) | No records: **one empty state** (850 px). Unchanged once there is data |
| **My Quran** | Every Juz and Surah row listed five counts, mostly zeros (4,048 px) | Rows show only non-zero counts, or “Not started”, on one line; details stay expandable (2,825 px) |
| **New Learning** | Intro line; start-Ayah adjusters always open; footer note | **Step 1 · Choose the passage** and **Step 2 · Choose how to learn**; adjusters under “Adjust the starting Ayah” (opens automatically on an error) |
| **Journey Settings** | “Review changes → Confirm and save” without adding a path silently saved **no goal**, though the learner believed they had set one. Found by the journey test | The review step now says “No learning path yet: choose one above and press ‘Add path’…” |
| **Visual Maps** | A missing PDF opened from a `/learn` lesson had no way back (only `/mushaf` return links were accepted) | `/learn?` return links are also accepted (same safety check). The missing-PDF state shows “Return to Learning” and “Manage imported PDFs”, and the “not teacher-reviewed” label is kept |
| **Motion** | Global smooth scrolling and scripted smooth scrolls; no reduced-motion support | `prefers-reduced-motion` turns off smooth scrolling, animations and transitions. Scripted scrolls in the reader and lesson use `scrollMotion()`. Live recitation was left untouched by design |

Kept from earlier work: the bottom navigation is hidden during guided lessons, Practice, `/learn` and an unsaved Recall; the docked lesson panel; the shared Ayah/Mushaf switch; safe-area insets in the APK; and the compact dashboard header.

## Buttons removed or consolidated (no function lost)

| Removed | Still reachable at |
|---|---|
| Home “Set up journey” | the primary button, which opens the same setup |
| Home “Journey settings” button | the “Change goal” link, and More → Journey Settings |
| Home revision primary for a new user | Revision tab |
| Prayer card “Prayer settings” while unconfigured | the inline “Set it in Settings” link |
| Revision “Check previously memorized” | the “Not yet checked → Check a passage” card, and Assess |
| Revision “Recall a practiced page” with nothing practised | shown under Optional practice once Ayahs exist |
| Mushaf Learn “How this method works” link, Guided/Manual, level | Lesson options |
| Recite card in Mushaf Learn | Read and Recall modes, and the Recite tab |

## Components reused or added
- **`EmptyState`** (new): Revision and Progress.
- **`ViewSwitch` / `AyahList` / `Word`** (`LearnView.tsx`, from the previous update): every session screen.
- **`MiniMushafPage`**: Practice, `/learn` and Similar Ayahs.
- **`scrollMotion()`** (`readerMode.ts`): reduced-motion-aware scrolling.
- **Not done:** one shared page-header, dialog and loading component across *all* screens. Screens already share `PageTopBar`, `.card`, `.btn` and `.btn-primary`, and the sheets share `Sheet`. Replacing every local header and loading state was left out to avoid an unrelated, risky rewrite.

## Before / after screenshots
- `artifacts/ux-before/` (before) and `artifacts/all-screens/` (after): the same 21 routes at 393 px, new user. Gallery: `artifacts/all-screens/index.html`.
- Journey screenshots: `artifacts/complete-journey/`.

Page height at 393 px, before → after:

| Screen | Before → after |
|---|---|
| Mushaf Learn | 1,809 → 1,258 |
| My Quran | 4,048 → 2,825 |
| Progress | 1,480 → 850 |
| New Learning | 1,395 → 1,211 |
| Home | 984 → 860 |
| Mushaf Read | 961 → 937 |

Unchanged: Recall, Recite, Settings, Journey Settings, Visual Maps.

## Complete journey testing (`scripts/test-complete-journey.mjs`, fresh profile, 360 px): 21/21 pass
1. New user: one primary action, honest revision card. **Set up journey → Add path → Review → Confirm and save** saves a path.
2. New Learning: two steps, adjusters collapsed.
3–6. Guided lesson (Al-Ikhlas 1): listen, repeat, hide, recall, with a **hint in the final test**.
7. Finish saves **once**: the lesson is completed and 112:1 has exactly one evidence event. **The hinted pass is saved as “hes”, not clean.** A second Finish tap adds nothing.
8. Interrupted Mushaf lesson: Home shows **Continue Hifz**, and resume returns to the same step (Hide · Ayah 1 of 11, step 2 of 53).
9. View switch inside the resumed lesson. The lesson panel does not cover the active Ayah (panel top 563 px, active Ayah bottom 182 px).
10. Revision after learning shows “Due today”, not the empty state.
11. Missing memory map: import action, Return to Learning, “not teacher-reviewed” label.
12. Back (`history.back()`) returns to the previous screen.

Also: no horizontal overflow on 14 routes at 320, 360, 393, 430, 768 (tablet) and 1280 (desktop).

## Tests passed and failed

| Suite | Result |
|---|---|
| Complete journey (new) | 21/21 |
| View switch, all session screens | 88/88 |
| Existing Android Mushaf UX (concealment, resume, docked panel) | pass |
| Dashboard worldwide time | 30/30 |
| Unit suites (hifz, phase3, storage, sync-guard, refpdfs, refpdf-learn, mushaf-recitation, learning-features, local-time) | 153/153 |
| TypeScript, production build, Android build | pass |
| Quran integrity | SHA `fab6e908…` unchanged; 2 known differences (2:72, 11:41) untouched |

During development, the first journey runs failed 3 checks and then 1. Every one was a mistake in the test script (a skipped “Set up journey” tap, hint placement, letter case), and each run surfaced a real UX issue that was fixed (the silent no-path save). No product test was weakened.

## Not changed
Quran text and fingerprint, page assignments, assessment and evidence rules, saved lessons, SRS, IndexedDB and backups, Supabase sync, notification scheduling, Mutashabihat gating, PDF import and storage, the recitation implementation, and the package ID and signing key.

## Remaining limitations
- **Physical Android device: not verified.** All checks are headless-browser viewport tests. Gestures, the system Back button in the WebView, safe areas on real notches and gesture bars, and font rendering still need a phone. No recordings were made; only screenshots.
- **Journey Settings and Settings** are still long (2,274 and 3,685 px). They are sectioned but not yet behind progressive disclosure. That needs its own pass, because the goal and claims editors are complex.
- **Shared components.** Header, dialog and loading components were not unified across every screen (see above).
- **Recall screens** (Mushaf Recall, Practice) still show the mic card above the Quran. It was left as-is to avoid touching the recitation flow.
- **Order exercise and Manual mode** in `/learn` have no view switch (unchanged).
