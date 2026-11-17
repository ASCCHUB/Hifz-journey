# Hifz Journey: Android UX audit

Date: 2026-11-16. Source: full-page screenshots of all 21 routes at 393 px (`artifacts/ux-before/`, a new learner with no records), earlier lesson screenshots at 320, 360, 393 and 430 px (`artifacts/view-switch/`, `artifacts/learning-features/`), and the code of each screen.

Heights are full-page heights at 393 px. The bottom navigation is about 64 px.

## Cross-cutting findings

| # | Finding | Where | Impact |
|---|---|---|---|
| X1 | **Quran pushed far below the fold.** Before the page come the mode tabs, a “Recite on page N” card, a setup card and a toolbar. | Mushaf Learn (Quran starts at about 1,200 px of 3,620), Mushaf Read (about 450 px), Mushaf Recall (below the recall panel) | The learner scrolls between the instruction and the Quran |
| X2 | **Two competing primary buttons** in one card, or a primary that contradicts the state | Home: “Set up journey” and “Start Your Hifz Journey” both open setup; Home revision card says “complete for today” with a primary **Start Revision** to a new user with nothing learned | Unclear what to do next |
| X3 | **Contradictory or zero-state noise** | Revision (“0 ayahs need review” and “Recall a practiced page” with nothing practised); Progress (14 zero tiles and an empty chart); My Quran (30 expanded Juz rows of zeros, about 8,100 px) | Looks broken and overwhelming |
| X4 | **Duplicate entry points to the same destination** | Home prayer card: “Prayer settings” button and the “Set it in Settings” link; Revision: “Check previously memorized” and the “Check a passage” card; Home: shortcuts repeat the bottom navigation (Learn, My Quran) | Visual clutter, though the actions are real. Consolidate; don't delete functions |
| X5 | **Advanced controls shown to everyone** | New Learning: Start Surah, Start Ayah and “Set starting Ayah” always open; Mushaf Learn: Guided/Manual, level and a halves explanation always open | Long setup before the first lesson |
| X6 | **Smooth-scroll and motion with no reduced-motion support** | `html { scroll-behavior: smooth }`; smooth `scrollIntoView` and `scrollBy` in the reader, lesson and live recitation | Unexpected movement; no `prefers-reduced-motion` handling |
| X7 | **Inconsistent empty states and wording** | “Begin your Hifz journey” / “Start Your Hifz Journey” / “Set up journey”; “Revise” / “Revision” / “Recall” / “Check” used loosely | Terminology drifts |
| X8 | **Bottom navigation during focused work** | Already removed in guided Mushaf lessons, Practice, `/learn` and Mushaf Recall (earlier updates). Still shown on Mushaf Learn's chooser, which is fine because no lesson is running yet | — |

Already in place from earlier work (kept): the shared Ayah/Mushaf view switch, the docked guided-lesson panel on phones, safe-area insets in the APK, and the Similar Ayahs sheet.

## Screen inventory

| Screen | Purpose | Primary action | Secondary | Problems found | Proposed fix |
|---|---|---|---|---|---|
| **Home / My Journey** (`/`, `/journey`, 984 px) | Today's next step | Continue Hifz / Start | Journey settings, revision, prayer, shortcuts | X2: two setup buttons; revision card contradicts a new user; prayer card has two setup links; an explanatory line under the primary button | One primary per card. Setup link only when a goal exists. Revision card states “Nothing to revise yet” with no primary when nothing is learned, and “done for today” with a secondary link when records exist. One prayer setup link |
| **New Learning** (`/learn`, 1,395 px) | Pick a passage, then a method | Method A / B start | Find by Juz, Surah or Page; start-Ayah adjust | X5: start-Ayah adjusters always open; intro line repeats the title | Step 1 “Choose the passage” and step 2 “Choose how to learn”. Start-Ayah adjusters inside a collapsed “Adjust the starting Ayah” |
| **Mushaf Read** (`/mushaf`, 961 px) | Read the page | Read and navigate pages | Tools, Recite, Ayah sheet | X1: helper text and toolbar sit above the page | The page comes first after the mode tabs. The toolbar (Tools, Next, page number, Previous) moves under the page, where page turning happens. Helper text shortened |
| **Mushaf Learn** (`/mushaf?mode=learn`, 3,618 px) | Start or resume a lesson on the page | Start lesson | Portion, Guided/Manual, level, method intro | X1, X5: about 900 px of chooser plus a “Recite on page” card before the Quran | Compact chooser: portion chips on one row, a big Start, and options (mode, level, explanation) collapsed. The Recite card is hidden in Learn (it stays in Read and in Tools). The toolbar goes below the page |
| **Guided lesson** (Mushaf) | Step through listen, hide, recall | Next / rating | Hint, Expand, Save & exit, view switch | Already docked; verified earlier (88/88) | Keep. Check no overlap at 320 px |
| **Guided / manual lesson** (`/learn?…`) | Recovery and cross-page ranges | Continue / rating / Finish | View switch, Save & exit, maps | Uses its own header; fine | Keep; covered by journey tests |
| **Mushaf Recall** (`/mushaf?mode=recall`) | Recite the page from memory | Rating | Hint, Reveal, mic, Similar | X1: page below the recall panel and toolbar | Toolbar below the page (same change as Read) |
| **Recall a page** (`/recall`) | Choose a page to test | Recall page N | Practised pages | Fine | — |
| **Practice** (Ayah recall) | Per-Ayah recall | Check / rating | Hint, view switch, Similar, mic | Verified earlier; mic card above the text | Keep |
| **Revision** (`/revision`, 859 px) | Do due revision | Today's plan tasks | Weak, check claims, history | X3: “0 ayahs need review” plus a recall button with nothing practised; X4: two “check” entries; intro sentence | No records: one empty state (“Nothing to revise yet”, primary Learn a passage). With records: Due / Weak / Optional practice, one “check” entry |
| **My Quran** (`/quran`, 8,096 px) | Browse coverage | Open a page | Juz/Surah/Page tabs | X3: every Juz summary lists five zero counts | One-line Juz rows showing only non-zero counts (“Not started” when empty); details stay expandable |
| **Progress** (`/progress`, 1,480 px) | Optional statistics | — | 604-page tracker | X3: 14 zero tiles and an empty chart | No records: one empty state with a Learn action. Otherwise unchanged |
| **Journey Settings** (2,274 px) | Goal, teaching, view, reminders | Save goal | — | Long but sectioned | Keep sections (Journey setup, Teaching, Learning view, Reminders). No structural change in this pass |
| **Settings** (`/profile`, 3,685 px) | Account, display, prayer link | — | Many sections | Long | Keep. The Prayer Times & Calendar link card is already at the top |
| **Visual Maps / PDF** (`/mind-maps`, `/reference-map`) | Maps and imported PDFs | Open map / import | — | Missing PDF already shows “Manage imported PDFs”; labelled “not teacher-reviewed” | Keep; add a Back link on the missing-PDF state |
| **Check-in, Assess, Login** | Single purpose | — | — | Fine | — |

## Out of scope in this pass, deliberately
- **Journey Settings and Settings.** Their length comes from real settings sections; restructuring them risks the goal and preference flows.
- **Recite (mic) screens.** No changes to the recitation implementation.
- **Data and Quran layers.** Untouched by design: text, layout, evidence, SRS, sync, notifications, Mutashabihat gating, PDF storage.
