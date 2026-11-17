# Smart Hifz Tutor — Experience Refinement Report

Date 2026-11-13 · Implementer: Claude

## 1. Original requirements vs. observed implementation (audit before editing)

The audit was done in Chrome at 360×740 and 1366×900.

| Requirement | Observed before |
|---|---|
| Three clear choices: Learn / Recall / Revise | Not present. My Hifz Journey had 9 sections and was **5,197 px tall** on a phone, with two "My Hifz Journey" headings. The first actions were "Learn a page", "Set up journey", "Continue", "Learn a Mushaf page", "Open the Mushaf" and "Check & recover", with no hierarchy. |
| Standalone full-page recall | **Missing.** Recall existed only as the last step of a lesson, or as generic "revision" Practice. |
| "How this method works" | **Missing.** |
| Cumulative Ayah learning (1, 1–2, 1–3 …) | **Partial.** Links joined only *neighbouring* Ayahs; "everything so far" came only between word-count groups. |
| Clear step instructions and progress | Steps showed short labels; progress said **"Step 1 of 81"** (page 3, guided). |
| Teaching preferences in one place | Mode and level were chosen per lesson and not remembered; repeat count was not saved. |
| Understanding and order quizzes | Existed only inside the Visual Maps page (3 passages). |
| Header progress | "x of 6,236 ayat memorized" counted legacy "Mark memorized" records as memorized. |

## 2. UX gaps found (checklist)

- [x] No primary entry point; no Recall action.
- [x] Method never explained.
- [x] Cumulative linking unclear; too many unexplained steps.
- [x] Progress shown as a technical step count.
- [x] Teaching preferences not persisted.
- [x] Duplicate headings and buttons; long page.
- [x] **Bug:** in multi-Ayah recall steps (links, groups, **the final page test**), every Ayah except the last was **fully visible**, because the hint counter applied only to the last unit. Found from a screenshot during this work.
- [x] Map cues were shown during recall, acting as an unrecorded hint.
- [x] **Bug:** the Android build packaged a stale pre-Phase-3 web export (see §7).

## 3. Changes implemented

- **Smart Hifz Tutor hub** (`TutorHub`), at the top of My Hifz Journey:
  - **Learn a new page:** continue an unfinished lesson; next page on the path; any page; respects the half-page preference.
  - **Recall a page:** any page number; pages practised.
  - **Revise previous Hifz:** jump to today's revision; choose a Juz or Surah in the tracker; Check & recover. It states how many self-reported pages await a check and that they are *not* counted as recited.
  - Three columns on desktop, stacked on mobile; the hub title is above the fold on a 360 px phone.
- **"How this method works"** (`MethodIntro`): 8 plain steps. It appears on the start screen of the first guided lesson, opens from "?" inside any lesson and from the hub link, and has a "Don't show this before every lesson" choice saved in `tutor.introDismissedAt`, separate from profile onboarding.
- **Lesson engine (learn template) rewritten for true cumulative linking:**
  - per Ayah: listen & repeat while looking → (Guided: hide gradually) → recite from memory;
  - then **"Now recite Ayahs 1–2 together"**, **"1–3"**, and so on;
  - long Ayahs are practised in parts with "join parts 1–k";
  - the running block restarts after about 60/90/130 words (by level) with a **review of everything so far**, so joins stay manageable;
  - then the page test (the only evidence) and the connection to the previous Ayah.
  - Every step carries an **instruction** and **Ayah progress**. Page 1 now has 28 steps; page 3 dropped from **81 to under 60**.
- **Lesson screen:**
  - instruction callout;
  - progress "**Ayah 3 of 7 · linking with earlier Ayahs**" (step count secondary);
  - one gradual-hide step with "Hide more" (half → first letters → hidden);
  - mode, level and repeat default from saved preferences and are remembered;
  - **hidden-text bug fixed**: all Ayahs hidden, hints reveal words in reading order across the whole passage;
  - map cues shown only while learning, not during recall;
  - optional understanding practice after a page lesson.
- **Recall a Page** (`/recall`, `/recall?page=N`):
  - works without a path;
  - instructions, then the existing **Practice** (hidden text, previous Ayah as cue, "Hint: next word", reveal and self-rate);
  - **hint → hesitated**; **nothing is saved unless every Ayah is rated** (leaving midway saves nothing);
  - saved via `applyResults("assessment")`;
  - Ayah-level results;
  - **"Practise the N weak ayahs"** (weak drill) and step-by-step recovery;
  - an explicit note that one recitation is not long-term retention (5 clean days, month-long interval);
  - an optional learner-started live-recitation link.
- **Teaching preferences** (`TeachingPrefs`, collapsible on Journey):
  - lesson style, difficulty, portion (page / half page), listen repeats, reciter, study minutes;
  - a summary of path, claims and daily goals;
  - **single copies**: `tutor` (new, merged by `updatedAt` in sync), `settings.reciter`, and daily goals via `setDailyPrefs`.
- **Understanding and order practice** (`PageQuiz`):
  - "What comes next?", meaning → Ayah (bundled reviewed translation), and put-in-order;
  - labelled practice only; saves nothing;
  - word-by-word meanings stay disabled (no reviewed glossary).
- **Journey page decluttered:**
  - hub → Today's Hifz → path & profile (renamed; duplicate buttons removed) → teaching preferences → tracker;
  - classic tools and activity/targets are folded into collapsible sections;
  - the header now shows "**recited in this app**", with legacy marks counted separately;
  - mobile height dropped from 5,197 to 3,308 px.
- **Android build script** hardened (§7).

## 4. New learning and recall flows

- **Learn:** Hub → Learn page N → (first time) method intro + Guided/Manual + level → steps with instructions → page test → saved → "Learn page N+1" / optional quiz.
- **Recall:** Hub → Recall page N → instructions → Practice → results → practise weak Ayahs / recovery / recall again / optional quiz.
- **Revise:** Hub → Today's revision (planner tasks) · choose a Juz/Surah · Check & recover.

## 5. Files

- **New:** `src/components/TutorHub.tsx`, `MethodIntro.tsx`, `TeachingPrefs.tsx`, `PageQuiz.tsx`, `src/app/recall/page.tsx`.
- **Modified:**
  - `src/lib/lesson.ts`: cumulative engine, phases, instructions;
  - `src/components/LessonPlayer.tsx`;
  - `src/app/memorize/page.tsx`;
  - `src/components/PersonalizedJourney.tsx`;
  - `src/lib/store.ts`: `TutorPrefs`, defaults, hydration;
  - `src/lib/sync.ts`: tutor merge;
  - `scripts/test-phase3.mjs`;
  - `scripts/build-android.ps1`;
  - `PHASE_3_6_FINAL_QA_REPORT.md`: correction note.
- **Untouched:** Hifz engine, SRS, claims and paths, planner logic, assessment records, map progress, ASR, Quran data.

## 6. Tests and browser evidence

**Automated:**

| Check | Result |
|---|---|
| `test:hifz` | 24/24 |
| `test:navigation` | 10/10 |
| `test:phase3` | 33/33 |
| TypeScript | clean |
| Quran SHA-256 | `fab6e908…1680`, unchanged |
| Static export | 13 pages incl. `/recall` |
| Android APK | built and **opened to verify** it contains learn, recall, assess, memorize, mind-maps and the maps manifest |

New and updated tests:
- cumulative links for Al-Fatihah are exactly [1–2], [1–3] … [1–7], with the text "Now recite Ayahs 1–3 together without looking.";
- every step has an instruction and Ayah progress;
- long pages restart the block with a review;
- page 3 has fewer than 60 steps;
- long-Ayah joins;
- teaching preferences default, hydrate for old saves, merge by `updatedAt` and never touch records.

**Browser** (Chrome headless, first-time learner, 360×740 and 1366×900):

| Check | Result |
|---|---|
| Hub cards | "Learn a new page", "Recall a page", "Revise previous Hifz"; hub title above the fold on mobile; side by side on desktop |
| Headings | one "My Hifz Journey" heading |
| First guided lesson | shows "How this method works" |
| First step | "Ayah 1 of 7 · listening & repeating" — "Listen to Ayah 1, then repeat it several times while looking at the text." |
| Link step | "Now recite Ayahs 1–2 together without looking." with **0 visible Quran words** before reveal and **1 after one hint**; no map cue during recall |
| Recall page 1 | leaving midway saved nothing; full run saved 1:1 ok, 1:2 (hinted) **hes**, 1:3 **bad**, 7 records; weak-Ayah practice offered |
| Teaching preferences | difficulty changed and saved; records byte-identical |
| Other | Today's Hifz still present; microphone calls 0; no horizontal scroll; no page errors |

**Not done:** real Android device testing (no device or emulator connected), real audio playback, live recitation with the speech server.

## 7. Remaining limitations

- **Earlier APK was stale.** It contained the pre-Phase-3 web app: no `/learn`, `/assess` or maps. `scripts/build-android.ps1` packaged a leftover `./out` export, because with `NEXT_DIST_DIR` set, Next exports into that folder instead. The script now uses the real export folder, deletes old exports first, rejects exports older than the build, and checks that the key pages exist. **The APK at `../Hifz-Companion-debug.apk` (23:19) is the first one that contains the Smart Hifz Tutor.**
- **Recall page hints:** "next word" only; there is no first-letter mode, because Practice is shared and was kept as is.
- **Live recitation results** are not fed back into lessons or recall automatically; the learner self-rates.
- **Audio:** the whole Ayah is played even when practising a part of a long Ayah.
- **Content:** word-by-word meanings stay disabled; map cues are not teacher-reviewed; only 3 maps exist.
- **Planner time estimates** still use labelled defaults until enough practice is logged.

## 8. Screens that still need user review

1. **My Hifz Journey** (hub at the top) on your phone.
2. **A guided lesson** for a page you know, e.g. page 2: are the instructions and the 1–2, 1–3 linking clear, and is the number of steps comfortable?
3. **Recall a page:** the results screen and the weak-Ayah practice.
4. **Teaching preferences:** are these the right options?
5. **The method introduction wording** — a teacher may want to adjust it.
6. **Install the new APK** (uninstall the old one first; copy your backup code if needed) and compare it with the PC.
