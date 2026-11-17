# Hifz Journey — Four Android Fixes Report

Date: 17 November 2026
APK: `Hifz-Journey-20261117-0631-22a099-debug.apk` (in the `QURAN COMPANION` folder)
Physical Android verification: **not done.** Everything below was checked with automated tests and headless Microsoft Edge at Android-sized viewports. No phone was used.

---

## 1. Problems and solutions

### Task 1 — Islamic (Hijri) date

**Problem.** The dashboard showed "June 7, 1448 BC".

**Root cause.** `headerTime()` asked the device's `Intl.DateTimeFormat` for an `islamic-umalqura` date. It only checked that `resolvedOptions().calendar` matched. The Android WebView ships trimmed ICU data: it accepts the Islamic calendar and computes the right numbers (Umm al-Qura 7/6/1448), but it prints them with **Gregorian** month and era names. Month 6 became "June" and the era became "BC". The numbers in the screenshot match Umm al-Qura for 17 Nov 2026 exactly, which confirms this diagnosis.

**Solution.** The app no longer uses Intl for any Hijri field.
- **Tabular calendars** (`islamic-civil`, `islamic-tbla`) are computed with the standard 30-year arithmetic.
- **Umm al-Qura** and **astronomical** (`islamic`) dates come from month-start tables (`src/lib/hijriTables.ts`, 1340–1520 AH, about 1921–2097). The tables are generated from full ICU by `scripts/generate-hijri-tables.mjs`.
- Month names (English and Arabic) and the era (AH / هـ) come from the app's own tables.
- The result is fully offline and gives the same output on every WebView and browser.

Unchanged: the ±2-day adjustment, the default calendar (Umm al-Qura), the calendar choices in Settings, the Gregorian date, the local clock, and the minute-boundary tick that rolls the date over at local midnight.

Output: `7 Jumada al-Akhirah 1448 AH`, or `٧ جمادى الآخرة ١٤٤٨ هـ` for Arabic locales.

### Task 2 — Long-press an Ayah

**Behaviour.** In the Mushaf, press and hold an Ayah for 550 ms. A small bottom sheet opens with:
- the Surah and Ayah reference;
- **Play Arabic Recitation**, which becomes Pause/Resume recitation plus Replay;
- **Read Urdu Translation**;
- **Play Urdu Translation**, which becomes Stop (and Pause/Resume where the voice supports it) plus Replay.

The held Ayah stays highlighted. Android Back or Close returns to the same page and scroll position: the sheet is an overlay with its own history entry and does not navigate.

**Interaction safety**
- A press is cancelled if the finger moves more than 10 px (a scroll), lifts early, or the pointer is cancelled.
- The click that follows a long-press is swallowed, so the normal tap sheet does not also open.
- A normal tap still opens the full Ayah sheet as before.
- On touch screens the text-selection callout is disabled on the Mushaf page.
- A desktop right-click opens the same quick sheet.

**Arabic recitation** uses the existing `AudioProvider`: the same single audio element, the selected reciter and speed, and the everyayah.com Ayah files. It plays a one-Ayah range, so it stops after that Ayah. No second player was added.

**Urdu text** comes from the existing attributed sets (Maududi by default, or Jalandhry if that is the learner's chosen translation), shown verbatim. It is displayed right-to-left in the Nastaliq font, with the source line "Translation: … (Tanzil.net)".

**Recall safeguard.** The sheet never renders Arabic Quran text. The rules for when it may open are in `src/lib/ayahQuick.ts`:

| Situation | Long-press |
|---|---|
| Read mode | Opens |
| Recall, Ayah not yet rated | **Blocked**: "Rate this Ayah first…" |
| Recall, Ayah already rated, or page saved | Opens (the evidence is already fixed) |
| Guided lesson with any word of the Ayah hidden | **Blocked** |
| Old memorize run, or Recite with text hidden | **Blocked** |

Hidden word slots still contain no text in the page.

### Task 3 — Revision: two pending tasks

**Layout.** The screen is titled "Your Revision". It shows at most two compact cards, each with the page, the Surah, a short description, **Start Revision** and **Done**.
- When nothing is pending it shows "All caught up".
- When the pair is finished and more is due, it shows "These two are done" and a **Show next revision** button.
- A subtle "Full revision schedule and history" link reveals the old full plan.

**Rules** (implemented in `src/lib/revisionSession.ts`):
- Tasks come from the existing planner (`buildPlan`), so there is no second scheduler.
- The pair is filled only when a session starts (opening the screen) or when the learner taps Show next revision. Unfinished items from an earlier session come first, then due tasks in the planner's priority order.
- Done removes the card immediately and does **not** pull in a replacement while the learner is looking.
- Done after an in-app revision (Practice finished) records `how: "app"` and marks the plan task done, as before. The evidence is whatever Practice already wrote.
- Done without reciting records `how: "self"`. It adds a "Revision · self-reported" history line and sets the plan status to `"self"`, shown as "Done (self-reported)". It **never** touches `mem`, `weak`, SRS intervals or assessments. Because the page's SRS record is unchanged, it comes back on a later day when it is still due.
- The session waits for the stored records to finish loading (`storeReady()`) before choosing a pair. See the bug in section 6.

### Task 4 — New Learning

**Section A — Continue Learning.** Shows one lesson: the most recently used unfinished one, with "Page 542 · Al-Mujadila" and the step, and a **Continue Lesson** button. The others are under a collapsed "Other unfinished lessons (n)". Every unfinished lesson is kept; the old screen capped the list at five.

**Section B — Choose what to memorize.** One selector button ("Select Juz, Surah, Page or Ayah"), then **Start Learning**, which stays disabled until a valid passage is chosen. A small line at the bottom shows the current method with a "Change learning method" link.

**Passage sheet.** Four tabs:
- **Juz** — 1–30, plus a page within that Juz.
- **Surah** — search and a list of all 114, plus a page within that Surah.
- **Page** — 1–604, typed or with a slider.
- **Ayah** — a Surah, plus From and To Ayah. Up to 60 Ayahs; reversed or out-of-range values are rejected.

The sheet shows a live summary and validation. "Adjust starting Ayah" is collapsed.

**Method.** The method is saved as `tutor.method`. When it has never been set, it follows the global view preference: `learnView = "ayah"` means the Ayah-by-Ayah tutor; otherwise Mushaf page learning. The whole-page / first-half / second-half choice stays inside "Change learning method". Guided versus manual is still chosen inside the lesson, as before.

**Routing.** A passage on one page opens the Mushaf lesson. A passage that spans pages opens the tutor, and the screen says so explicitly. A Juz or Surah starts at the chosen page and the summary states exactly which Ayahs. The passage is never changed silently.

**State safety.** Lesson IDs are deterministic (`learn:page:N`, `learn:range:…`), so starting a passage that already has a lesson resumes it rather than creating a duplicate. Opening or selecting never marks anything completed.

---

## 2. Files changed

**New**
- `src/lib/hijriTables.ts` — generated Umm al-Qura and astronomical month tables
- `scripts/generate-hijri-tables.mjs` — generator
- `src/lib/ayahQuick.ts` — long-press gating and press tracker (pure)
- `src/lib/urduSpeech.ts` — Urdu text-to-speech adapter (Android bridge or Web Speech; Urdu voices only)
- `src/components/AyahQuickSheet.tsx` — the long-press bottom sheet
- `src/lib/revisionSession.ts` — two-task revision session (pure)
- `src/lib/passagePick.ts` — passage selection, validation, lesson link, Continue choice (pure)
- `scripts/test-four-android-fixes.mjs` — 35 unit and regression tests
- `scripts/test-four-fixes-e2e.mjs` — 89 browser checks and screenshots

**Modified**
- `src/lib/localTime.ts` — deterministic Hijri calendar and formatter
- `src/lib/quran.ts` — `hijriDate()` now uses the deterministic formatter
- `src/components/MushafReader.tsx` — long-press handlers, `data-qa` on word spans, quick sheet, notice, helper text
- `src/app/globals.css` — selected-Ayah highlight, no touch callout, Urdu line height
- `android/app/src/main/java/com/hifzcompanion/MainActivity.java` — `AndroidTTS` bridge (TextToSpeech, Urdu-only voice; stops on pause; shut down on destroy)
- `src/app/revision/page.tsx` — new two-task screen
- `src/lib/store.ts`
  - optional `revisionSession` and `tutor.method`
  - plan status `"self"`
  - `storeReady()`
  - reset clears `revisionSession`
- `src/lib/planner.ts` — `"self"` status type
- `src/lib/sync.ts` — merges `revisionSession` (newer wins); the field stays absent when neither copy has it
- `src/components/TodayPlan.tsx` — "Done (self-reported)" label
- `src/components/Shell.tsx` — "Your Revision" title
- `src/components/NewLearning.tsx` — rewritten (Continue + one selector)
- `package.json` — `test:four-android-fixes` script
- Test updates for the new UI:
  - `scripts/test-local-time.mjs` — `.ts` resolver hook
  - `scripts/test-android-mushaf-ux.mjs` — new New Learning selector
  - `scripts/test-complete-journey.mjs` — New Learning and Revision checks

**Not changed:**
- the Quran text and its pinned fingerprint;
- `layout.json` (15-line page data);
- assessment, recall and SRS rules;
- Mutashabihat gating;
- prayer calculations;
- reminder scheduling code;
- the package ID and signing key.

---

## 3. Screenshots (`artifacts/four-android-fixes/`)

**After** — each at 320, 360, 393, 430, 768 and 1280 px:
- `dashboard-*`
- `revision-*`
- `learn-*`
- `learn-sheet-*`
- `mushaf-longpress-*`

Single shots at 393 px:
- `revision-after-done-393` — one card left after Done
- `learn-sheet-ayah-range-393`
- `learn-selected-393`
- `mushaf-longpress-audio-393` — Urdu voice speaking, recitation paused
- `mushaf-recall-blocked-393`

**Before** (`before/`, from 16 Nov, before this change):
- `01-home-nov16-393`, `03-learn-nov16-393`, `04-revision-nov16-393`, `06-mushaf-read-nov16-393`
- These were captured in desktop Edge with an empty profile. Desktop Edge has full ICU, so they **do not reproduce** the "BC" date; that bug is only visible in your Android screenshot. They do show the earlier layouts.

---

## 4. Hijri implementation and verification

- **ICU agreement:** for all four calendars, every day from 1 Jan 1925 to 1 Jan 2095 (about 62,000 days each) matches full ICU 78.3 exactly.
- **Published Umm al-Qura anchors:**
  - 1 Muharram 1446 = 7 Jul 2024
  - 1 Ramadan 1446 = 1 Mar 2025
  - 1 Ramadan 1447 = 18 Feb 2026
- **Android reproduction test:** `Intl.DateTimeFormat` is replaced with a fake that returns "June 7, 1448 BC" for Islamic calendars. The dashboard still shows `7 Jumada al-Akhirah 1448 AH`, and the Gregorian date is unchanged.
- **Also tested:**
  - 17 Nov 2026 in each method (Umm al-Qura 7 / astronomical 8 / civil 6 / Thursday-epoch 7)
  - ±1 and ±2 adjustments, clamping, and crossing into Sha'ban
  - local-midnight rollover in Riyadh, London and New York
  - Arabic output
- **Limitation:** outside 1340–1520 AH (about 1921–2097) the Umm al-Qura and astronomical methods show "Hijri date unavailable". They never fall back to Gregorian.

---

## 5. Urdu translation and audio

**Text.** Bundled Tanzil.net sets: Abul A'la Maududi and Fateh Muhammad Jalandhry. They are shown verbatim and work offline.

**Audio.** There is no verified recorded Urdu translation in the app, so audio uses the device's text-to-speech, **Urdu voices only**:
- **Android app:** the new `AndroidTTS` bridge uses Android TextToSpeech.
  - It picks an installed voice whose locale language is `ur`, preferring offline voices. If there is none, it tries `setLanguage(ur-PK / ur)` and accepts the result only if the resulting voice is Urdu.
  - With no Urdu voice it reports "no-urdu", and the sheet says "No Urdu text-to-speech voice is installed… read the translation below."
  - Android TTS has no pause, so the sheet offers Stop and Replay and says so.
  - Speech stops when the app goes to the background and when the sheet closes.
- **Browsers:** `speechSynthesis` with a voice whose `lang` starts with `ur`. Pause and Resume are supported.
- **One stream at a time:**
  - starting Urdu audio pauses the recitation;
  - starting recitation stops Urdu audio.
- **Labelling:** the audio is labelled "Urdu translation audio (device voice) — not Quran recitation."
- **Headless Edge result:** an Urdu voice was available and spoke. On a phone, availability depends on the installed TTS engine; many phones need the Urdu voice data downloaded in Google Text-to-speech.

---

## 6. Revision persistence and evidence safeguards

- `revisionSession = { items (the visible pair), done: { id → { at, day, page, how: "app" | "self" } }, updatedAt }`.
  - It is stored in the normal state, so it goes into IndexedDB and the localStorage mirror and is synced to Supabase (newer wins).
  - Older saves without it load unchanged, and it stays absent until first used.
  - Done entries older than 30 days are pruned.
- Tests confirm:
  - `mem`, `weak` and `assessments` are byte-identical after a self-reported Done;
  - Done twice is a no-op;
  - the done task stays gone after a restart, while the unfinished task is carried over first;
  - extra due tasks stay queued.
- **Bug found and fixed during browser testing.** On a fresh load, the Revision screen could choose its pair before the IndexedDB copy had finished merging. It then saw no due pages and showed an empty pair while 5 pages were due. The new `storeReady()` makes the session wait for the merge. This race could also happen on a phone.

---

## 7. New Learning selection behaviour

See Task 4 above. Tests cover:
- all 30 Juz, all 114 Surahs and all 604 pages;
- single Ayahs and ranges;
- invalid page, Ayah, reversed range and over-60 range;
- starting-Ayah adjustment;
- method links (whole page, halves, tutor, and routing across pages);
- Continue picking the most recent lesson, older lessons recoverable, completed lessons excluded;
- no lesson records created or deleted.

---

## 8. Test results

| Suite | Result |
|---|---|
| `test:four-android-fixes` (new) | 35 / 35 |
| `test-four-fixes-e2e.mjs` (new, browser, 6 widths) | 89 / 89 |
| `test:hifz` | 26 / 26 |
| `test:phase3` | 56 / 56 |
| `test:storage` | 17 / 17 |
| `test:sync-guard` | 15 / 15 |
| `test:refpdfs` | 7 / 7 |
| `test:refpdf-learn` | 4 / 4 |
| `test:mushaf-recitation` | 6 / 6 |
| `test:local-time` | 15 / 15 |
| `test:learning-features` | 7 / 7 |
| `test:navigation` | 10 / 10 groups |
| `test-complete-journey.mjs` | 21 / 21 |
| `test-view-switch-e2e.mjs` | 88 / 88 |
| `test-dashboard-time-e2e.mjs` | 30 / 30 |
| `test-recall-dock-e2e.mjs` | 44 / 44 |
| `test:android-mushaf-ux` | pass (all viewports) |
| TypeScript (`tsc --noEmit`) | clean |
| `validate:quran` | 114 Surahs / 6,236 Ayahs compared; the same 2 known differences (2:72, 11:41), unchanged |
| `next build` | success |
| APK verification | 296 frontend files, 0 missing, 0 stale, bytes match |
| Signing | same certificate SHA-256 `866123fa…77f31` as `Hifz-Journey-20261116-2009-fb113e`; package `com.hifzcompanion`; versionCode 1513831 (> 1513209) |

Three existing tests were updated because they asserted the old UI text ("Choose the passage", "Due today", `#passage-search`), not behaviour.

---

## 9. Unresolved limitations

1. **Not tested on a physical phone.** This includes long-press feel, vibration, the TTS bridge, the WebView's text-selection callout and Back behaviour.
2. **Urdu audio depends on the phone's TTS engine.** Without Urdu voice data you get the "unavailable" message; the text still works.
3. **Long-press is in Mushaf View only.** It is not in Ayah View (the list), Practice or the tutor.
4. **A self-reported Done does not change SRS.** That page comes back on a later day while it is still due. This is intentional (no false evidence) but may surprise you.
5. **Hijri tables cover 1340–1520 AH.**
6. **Juz and Surah selections start one page at a time,** because lessons run one page or up to 60 Ayahs. The summary always states the exact Ayahs.

## 10. Physical Android verification status

**Not performed.** Suggested checks on the phone:
- the dashboard date;
- long-press in Read and in Recall (blocked);
- Urdu audio with and without Google Urdu voice data;
- Done on Revision, then reopen;
- New Learning on Continue, the selector and Start;
- Android Back from each sheet.
