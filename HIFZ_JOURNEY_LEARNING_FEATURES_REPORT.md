# Hifz Journey — Mushaf View, Mutashabihat and Smart Reminders

Date: 2026-11-16 · **Current debug APK: `Hifz-Journey-20261116-1114-19a453-debug.apk`** (frontend `20261116-1114-19a453`, versionCode 1512674). It replaces `…1044-252357…` (versionCode 1512644).

## Update 2: view switch on the Mushaf lesson, Mushaf Recall and `/learn`

**What changed.** The Ayah view / Mushaf view switch from Practice is now one shared implementation in `src/components/LearnView.tsx`: `useLearnView`, `ViewSwitch`, `Word` and `AyahList`. It is used by:
- the **guided Mushaf lesson** (`/mushaf?mode=learn`): adds an Ayah view
- **Mushaf Recall** (`/mushaf?mode=recall`): adds an Ayah view
- **`/learn` (LessonPlayer)**, used for recovery lessons and ranges that span pages: adds a Mushaf view
- Practice: refactored onto the shared switch, with no change in behaviour

**One preference.**
- There is still only one setting, `settings.learnView`; no new setting was created.
- When it is not set, each screen keeps its usual view: Mushaf lessons and Mushaf Recall open on the page; Practice and `/learn` open Ayah by Ayah. This keeps the existing behaviour for anyone who never picks a default.
- **Use this view for all sessions** works on every screen.
- Journey Settings → Learning view offers: Each screen's usual view, Ayah by Ayah, or Full Mushaf page.

**How state is kept.** Both views draw the same per-word states from the screen's existing logic:
- the guided lesson: `lesson.view()`
- Mushaf Recall: `shown()` and the current Ayah
- `/learn`: the fade and hint rules of `AyahBlock`, as a per-word function

Switching only changes which view is drawn. The step, the current Ayah, ratings, hints and help flags are untouched, and nothing is saved by a switch. The Mushaf page stays mounted (hidden) while the Ayah view is showing. Its measured word widths therefore survive, and hidden-word boxes are identical after switching back; the test compares every box width.

**Concealment.** The existing rule is that hidden Quran text is never put in the page. Concealed words in the new views follow it:
- They are empty boxes whose width is measured off-screen on a canvas, with no text in the page.
- The "first letters" stage shows the first letter only.
- The Mushaf view inside Practice now uses the same boxes.
- The existing Android Mushaf UX test caught an earlier draft that used transparent text; this was fixed before release.

**Android layout.**
- The switch sits above the Quran area: in the guided lesson, between the top bar and the page, with the lesson panel docked as before.
- During a guided `/learn` lesson and an unsaved Mushaf Recall, the bottom navigation is hidden. Save & exit, Back and the Read/Learn/Recall tabs remain.
- The Ayah list gets the same height limit as the page, so the docked lesson panel does not cover it.

**Tests, `scripts/test-view-switch-e2e.mjs`.** **88/88 checks pass** at 320, 360, 393 and 430 px, each width in a fresh browser profile. Covered:

*Mushaf Recall*
- Starts in its usual view (Mushaf).
- Mushaf to Ayah to Mushaf keeps the rating count and the hidden words (35 in the list and 35 on the page).
- Box widths are identical after switching back.
- Concealed boxes contain no text.
- No evidence is written.
- Exiting and returning keeps the unsaved progress.

*Guided Mushaf lesson (page 3)*
- The test steps forward to the "Hide" step (step 2 of 53).
- Both directions keep the step.
- The same number of words is concealed in each view (5 and 5).
- The lesson is not completed and no evidence is written.
- Exit and resume returns to the same step.

*`/learn` (recover page 4)*
- At step 2 of 48, Ayah to Mushaf shows the 15-line page; Mushaf to Ayah works too.
- The step is unchanged and no evidence is written.
- Save & exit, then resume, keeps step 2.

*Global default*
- A Mushaf default set in `/learn` applies after leaving it, and also to Recall a Page.
- An Ayah default then applies to Mushaf Recall.
- No horizontal scrolling at any width.

**Evidence check.** The test compares, before and after switching, the per-Ayah records (`mem`), the weak list, and each lesson's completed / saved / final-rating fields. They match in every case.

**Regression.** The existing `scripts/test-android-mushaf-ux.mjs` passes: guided Mushaf lesson on a phone, concealment and resume.

**Screenshots.** In `artifacts/view-switch/`, at each width:
- `{w}-recall-ayah-view.png`, `{w}-recall-mushaf-view.png`
- `{w}-lesson-ayah-view.png`, `{w}-lesson-mushaf-view.png`
- `{w}-learn-ayah-view.png`, `{w}-learn-mushaf-view.png`

Results are in `results.json`. Practice and Similar Ayahs screenshots were retaken in `artifacts/learning-features/`.

**Unchanged in this update:**
- the notification implementation: no Java or manifest changes; the Gradle Java compile was up to date
- the Quran text: SHA `fab6e908…`, 2 known differences
- assessment rules, SRS, sync and storage

**Mutashabihat.** All 11 groups remain `pending_review`. They are hidden by default, and when the learner opts in they are labelled "Awaiting review". They are not treated as teacher-approved.

**APK.** `Hifz-Journey-20261116-1114-19a453-debug.apk`:
- Frontend parity: 296 files, 0 missing, 0 stale, bytes match.
- Same package `com.hifzcompanion`.
- Same signing certificate as the previous APK (SHA-256 `866123fa…077f31`, this computer's standard debug key).
- Higher versionCode, so it installs as an update without uninstalling.

**Remaining limits of the view switch:**
- **Manual mode:** `/learn` in Manual mode (per-Ayah cards with their own hide buttons) and the Order exercise step have no switch.
- **Ayah view in the guided lesson:** shows the whole page as a list, and tapping a word behaves as on the page.
- **Practice's original Ayah view:** still draws hidden words as transparent text. That behaviour is unchanged from before this work.

---

## 1. Files changed

| File | Change |
|---|---|
| `android/.../ReminderReceiver.java` | Rewritten: separate Hifz and Revision alarms, follow-up check-ins with action buttons, weekdays, quiet hours, a daily cap, silent channel, duplicate suppression; re-arms on boot, update, time change and timezone change |
| `android/.../MainActivity.java` | Reminder bridge (`setup`, `status`, `answer`, `responses`, `testKind`; old methods kept); tap paths may carry one query parameter; **system-bar inset padding** (fixes the toolbar under the status bar on Android 15 / targetSdk 35) |
| `android/.../AndroidManifest.xml` | Receiver also listens for `TIMEZONE_CHANGED` and `TIME_SET` |
| `src/lib/store.ts` | Additive optional fields: `settings.reminders`, `settings.learnView`, `settings.mutashabihatPending`, `checkins` |
| `src/lib/reminder.ts` | Per-activity status from the existing planner, native sync, check-in recording |
| `src/lib/mutashabihat.ts` | **New.** Curated reference list and deterministic word-level comparison |
| `src/components/Practice.tsx` | Ayah view / Mushaf view switch, “Use this view for all sessions”, Similar Ayahs (counts as help), lesson focus mode |
| `src/components/MiniMushafPage.tsx` | **New.** 15-line page from `pageContent`; hidden words keep their exact width |
| `src/components/SimilarAyahs.tsx` | **New.** Button and bottom sheet: stacked comparison, Open in Mushaf, back to the comparison |
| `src/components/ReminderSettings.tsx`, `LearnViewSetting.tsx` | **New.** Journey Settings sections (reminders are also shown in Profile) |
| `src/app/checkin/page.tsx` | **New.** “Did you complete …?” with Yes / Not yet / Remind me later / Skip today |
| `src/components/Shell.tsx` | Reads notification answers on open and resume; `/journey?start=hifz\|rev` opens the first real task; nav class for focus mode |
| `src/components/MushafReader.tsx`, `AyahSheet.tsx` | Similar Ayahs in Mushaf Recall (counts as help) and in the Ayah details sheet; page-level count |
| `src/app/journey-settings/page.tsx`, `src/app/profile/page.tsx`, `globals.css` | Wiring and focus-mode CSS |
| `scripts/test-learning-features.mjs`, `scripts/shots-learning-features.mjs` | **New.** Tests and screenshot script (`npm run test:learning-features`) |

Not touched: Quran text and its fingerprint, page layout data, assessment rules (`applyResults`), SRS, planner, IndexedDB persistence, sync merge logic, PDF maps, recitation. The differences at 2:72 and 11:41 are left as they were.

## 2. Global view preference
There is one setting, `settings.learnView` (`"ayah"` by default when it is absent). You can set it in **Journey Settings → Learning view**, or with **Use this view for all sessions** inside a session. Practice starts in the default view; the switch only changes the current session.

## 3. Ayah / Mushaf switching
`Practice` is the shared screen for Recall a Page, revision, new lessons, custom ranges and the weak-Ayah drill. Both views render **the same session state** (index, words revealed, hints, ratings), so switching never writes anything. The Mushaf view uses the existing reconstructed 15-line page:
- Earlier Ayahs are shown, and their numbers are coloured by rating.
- The current Ayah is hidden word by word, and hints reveal words in place.
- Later Ayahs in the session are hidden.
- Ayahs outside the session are dimmed.

The page follows the current Ayah across page boundaries.

Screenshot checks at 320, 360, 393 and 430 (`artifacts/learning-features/results.json`):

| Check | Result at all four widths |
|---|---|
| Switched views mid-recall (Ayah 5 of 5) | Index kept |
| Hidden words in Mushaf view | 8 |
| Horizontal overflow | None |
| Action bar on screen | Yes |
| Bottom navigation during the lesson | `display: none` |

Duplicate assessment: saving still happens once, in `mark()`, guarded by `savedRef`, and the view switch does not call it.

**Done in Update 2:** the guided Mushaf lesson, Mushaf Recall and `/learn` (see above).

## 4. Mutashabihat dataset and review status
`src/lib/mutashabihat.ts` holds **11 groups, references only**:
- 2:5 / 31:5
- 2:35 / 7:19
- 2:48 / 2:123
- 2:49 / 7:141 / 14:6
- 2:58 / 7:161
- 2:62 / 5:69
- 2:136 / 3:84
- 2:173 / 16:115
- 7:54 / 10:3
- the refrain in Ash-Shu'ara (8 Ayahs)
- the refrain in Al-Mursalat (10 Ayahs)

How the comparison works:
- All displayed Arabic comes from the pinned dataset.
- Shared and differing words come from a word-level LCS over `normA` forms, which are never displayed.
- Each result is classed as exact, same words in a different order, or near-identical. The longest shared phrase is shown.
- Results below 50% shared words are never shown.

The test checks every pair against the canonical text.

**Review status: all 11 groups are `pending_review`. No qualified human has reviewed them.** By default the button is therefore hidden everywhere. Learners can opt in with “Show examples awaiting review”; those examples then carry a visible “Awaiting review” notice and their source. To approve a group, a reviewer sets `status: "approved"`, `reviewer`, `reviewedAt` and `source`. A group marked approved without a reviewer is still hidden.

Integration:
- **Practice:** opening Similar Ayahs before the Ayah is revealed counts as a hint, so “Correct” becomes “Hesitated”.
- **Mushaf Recall:** sets `help`.
- **Read:** available from the Ayah details sheet.
- **Open in Mushaf:** opens the page inside the sheet, so the lesson is never left.

## 5. Similar Ayah screenshots
In `artifacts/learning-features/`:
- `{w}-similar-sheet.png`: 2:5 compared with 31:5, labelled as an exact repetition
- `{w}-similar-mushaf-context.png`
- `{w}-recall-ayah-view.png`
- `{w}-recall-mushaf-view.png`

## 6. Notifications and permissions
Native and independent of the WebView, so reminders still arrive while the app is closed.

- **Alarms:** `AlarmManager.setAndAllowWhileIdle` (inexact). It is Doze-safe and needs no exact-alarm permission, but **Android may deliver a reminder some minutes late**. Exact alarms were not used: on Android 14+ they need a permission that is denied by default.
- **Permission:** `POST_NOTIFICATIONS` is requested when reminders are turned on. If it is denied, settings show a warning, and posting is wrapped so the app cannot crash.
- **Re-arming:** alarms are re-armed when the app opens, after reboot (`BOOT_COMPLETED`), after an app update (`MY_PACKAGE_REPLACED`), and after time or timezone changes. Times are wall-clock local times recomputed with `Calendar`, so daylight-saving changes are followed.
- **Offline:** all scheduling is local, so reminders do not need a connection.
- **Duplicates:** one initial reminder per activity per day; follow-ups are capped (0–3); the notification ID is per activity, so a new one replaces the old. The single alarm from earlier builds is cancelled.
- **Tap:** opens `/journey?start=hifz|rev`, which goes to the first real task of that kind. Follow-up taps open `/checkin?kind=…`.
- **Content:** shows real planner tasks only (for example “Today's lesson: page 12”, or “3 pages to revise (41 ayahs)”), otherwise generic text. When nothing is scheduled, no reminder is sent.
- **Browser / PWA:** no reminders are sent there. The settings say so, because a closed browser tab cannot schedule them reliably.

## 7. Completion follow-up logic
After the initial reminder, if the activity is not done in the app and not already answered, a follow-up fires after the configured delay. It offers three buttons: **Yes, completed**, **Remind me later** and **Skip today**. Android allows three action buttons, so **Not yet: start now** is on the check-in screen with all four answers.
- Completing the activity in the app (the planner shows it done) reports `done`. This withdraws any visible reminder and stops follow-ups.
- Answers are saved in `state.checkins` with `verifiedInApp`: true only if saved records show the activity complete. Otherwise the answer is stored as a **self-report**.
- A test confirms that `mem`, `weak`, `dailyPlan` and `lessons` are unchanged by check-ins. No SRS rating or evidence changes.
- `checkins` is added only on first use, which keeps sync idempotent. This was caught by the existing sync tests and fixed.

## 8. Android screenshot testing
- **Captured:** headless Edge at 320, 360, 393 and 430 px (mobile emulation) against the dev server, for Recall in Ayah and Mushaf view, the Similar sheet, Mushaf context, reminder settings and check-in.
- **Bug found and fixed:** Mushaf view lines overflowed until the font-fit measurement was corrected.
- **Not shown in these screenshots:** the status-bar fix is native and only takes effect inside the APK.

## 9. Physical device notification verification
**Not verified.** No Android device was connected (`adb devices` is empty). Background delivery, delivery after reboot, action buttons, permission denial and timezone change on a real phone all **remain unverified**. Suggested device checklist:
1. Install the debug APK.
2. Turn reminders on, set a time 2 minutes ahead, and close the app.
3. Wait for the reminder, then for the follow-up (set the delay to 30 min).
4. Tap the follow-up's buttons.
5. Reboot before a scheduled time.
6. Change the timezone.
7. Deny notification permission.

## 10. Results, remaining issues and limitations
**Passed:**
- `tsc`
- `next build` (lint and types)
- every test suite: 26 + 56 + 17 + 15 + 7 + 4 + 6 + 7 tests
- Quran validation: SHA `fab6e908…`, 2 known differences, unchanged
- Android debug build: asset parity 296/296, bytes match

**Limitations:**
- **Mutashabihat:** no reviewed examples yet, so the feature is invisible unless you opt in. It needs a qualified reviewer.
- **View switch:** now on every session screen except Manual mode in `/learn` and the Order exercise (Update 2).
- **Delivery timing:** reminders are inexact; battery restrictions from some phone makers (Xiaomi, Oppo and others) can still delay or block them.
- **Sound:** the choice is between the phone default and silent. A custom sound is not offered.
- **Release APK:** not built; that waits for the on-device checks.
