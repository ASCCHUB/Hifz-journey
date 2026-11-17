# Recall layout, Settings and consistency: focused report

Date: 2026-11-16 · Debug APK: `Hifz-Journey-20261116-2009-fb113e-debug.apk`
- **Frontend parity:** 296/296 files, bytes match.
- **Installs as an update:** package `com.hifzcompanion`, same certificate `866123fa…`, versionCode 1513209.
- **Native code:** no files were changed in this pass.

## 1. Recall and recitation layout

| | Before | After |
|---|---|---|
| Microphone | A large “Recite on page” panel above the Quran in Mushaf Recall and in Practice | A compact **“🎙 Recite aloud (optional)”** button (`ReciteToggle`). Tapping it opens the same `MushafRecitation` panel (“Hide microphone” closes it). Speech-recognition code is untouched. The duplicate “Check with microphone” link in the recall panel was removed; live recitation is still on the Recite tab |
| Mushaf Recall controls | A card **above** the page (instruction, Hint, Reveal, mic link, ratings and a three-sentence note) | A **bottom teaching dock** (`.mushaf-recall-dock`, sticky, safe-area aware): instruction, Hint, Reveal and ratings. The note is now one line, and “Help used: counts as Needed help” appears only when help was used |
| Practice (Recall a page, revision) | The action bar had no instruction | The action dock now shows “Recite *Ayah* from memory” (or “Compare, then rate”) and the help notice |
| Current Ayah | Could fall under the controls | `keepAboveDock()` keeps the current Ayah between the top of the screen and the dock after every rating, hint and view switch. Scrolling is otherwise left alone |
| Top bar | Said “Read Mushaf” during Recall | Says “Mushaf Recall” |

The assessment rules are unchanged: a hint, a reveal or opening Similar Ayahs still counts as help.

## 2. Settings, with progressive disclosure

**Settings** (`/profile`, now **1,079 px**, was 3,685 px at 393 px wide). The account summary stays visible at the top, followed by collapsible groups (`SettingsGroup`, a `<details>` with a title and one-line summary; links such as `#reminders` open them):
1. **My Hifz Goal**: edit the goal (Journey Settings), progress details, reading and revision goals.
2. **Teaching Preferences**: link to Journey Settings.
3. **Reminders**: the reminder settings (moved here, so they exist in one place).
4. **Prayer Times & Calendar** (link).
5. **Appearance**: theme, translation, reciter, daily reading.
6. **Bookmarks.**
7. **Backup & Data Safety**: backup code, restore, undo a recent change, and **Reset options** collapsed inside.
8. **About & sources**, with **Diagnostics (for support)** (build information) collapsed inside.

Nothing was removed. Backup, restore, snapshots, sign-in, sign-out, guest merge, restart and reset all still work, with their confirmations.

**Journey Settings** (now **1,005 px**, was 2,274 px):
- **My Hifz Goal** stays as before; the setup form opens on demand.
- **Teaching Preferences** (teaching plus learning view) is collapsed.
- **Reminders** is a link to Settings.

## 3. Shared consistency
- **Shared top bar.** Progress, Journey Settings, Settings, Prayer Times & Calendar and Recall now use the same top bar as the main screens, and their duplicate page headings are removed. Recall and Prayer intro text is now one line.
- **Shared components.** Group rows are 56 px minimum touch targets; dock buttons are 44 px minimum.
- **Not changed:** screens that already worked well (Home, New Learning, the guided lesson dock and Mushaf Read), apart from the header unification.

## Verification

| Suite | Result |
|---|---|
| **Recall flows, new** (`test-recall-dock-e2e.mjs`, 320/360/393/430 px, fresh profile each) | **44/44** |
| Complete learner journey | 21/21 |
| View switching on all session screens | 88/88 |
| Existing Android Mushaf UX test | pass |
| Dashboard worldwide time | 30/30 |
| Learning-feature screenshots (Similar Ayahs, reminders) | pass |
| Unit suites (9) | 153/153 |
| TypeScript, production build, Android build | pass |
| Quran integrity | SHA `fab6e908…`; the 2 known differences (2:72, 11:41) unchanged |

The new recall test covers:
- **Mushaf Recall:** a compact microphone, the sticky bottom dock, a hint on Ayah 2, and a switch to the Ayah view mid-recall (rated count kept). No concealed text appears in the page. Exit and resume keeps 3 of 5 rated. All 5 Ayahs are rated and saved once, with the hinted Ayah recorded as **“hes”** and the others clean.
- **Practice:** the instruction in the dock, a hint, a switch to the Mushaf view, then Check and rate.
- **At every step, in both screens and both views:** the bottom of the current Ayah is above the top of the dock.

The first run found the current Ayah under the dock right after switching to the Ayah view at 320, 360 and 393 px. The keep-visible check now also runs on view switches, and the test passes.

**Screenshots:**
- `artifacts/screens-{320,360,393,430}/`: all 21 routes per width (gallery: `index.html` in each)
- `artifacts/recall-dock/`: Recall flows per width
- `artifacts/ux-before/`: before

## Unchanged
Quran data, Hifz evidence and assessment rules, saved lessons and progress, SRS, sync and storage, PDF references, notification behavior, Mutashabihat gating, and speech recognition.

## Limitations
- **Not verified on a physical Android phone.** All results are from headless-browser viewports.
- **Dock height on small phones.** The Mushaf Recall dock takes about 35% of a 320 px-wide screen, because the rating labels wrap. The current Ayah stays visible, but less of the page shows at once.
- **The setup form itself** (`PersonalizedJourney`) is still long once opened. It was left as-is because it holds the goal and claims logic.
