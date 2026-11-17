# Stage 2: Guided Ayah-by-Ayah Learning on the Mushaf

Date: 2026-11-14.

**Result:** guided learning now runs directly on the 15-line Madani Mushaf page. It uses the existing lesson engine, lesson records and evidence rule; no second memorization system was added.

**Verification:**
- Unit tests, TypeScript, a browser check (phone and desktop sizes), a static export and a debug APK build all pass.
- **Not verified on a physical Android device.**

## 1. Architecture and reuse

| Piece | What it does | Reused / new |
|---|---|---|
| `lib/lesson.ts` `buildSteps`, `LessonState`, `finalKey`, `evidenceFromLesson`, `saveLessonEvidence` | The method, progress record, evidence rule | **Reused unchanged** |
| `lib/lessonFinish.ts` `finishLesson()` | One shared "finish" for `/learn` and the Mushaf: saves evidence once, records recovery outcome, advances path cursor | **Extracted** from `LessonPlayer` (same behaviour; `LessonPlayer` now calls it) |
| `lib/mushafLesson.ts` | Pure helpers: `wordView` (how each page word looks for the current step), `manualWordView`, `finalCursor`, `hintLimit`, `activity`, `nextRecallStep`, `portionLesson`, `learnHref`, `lessonHref`, `parsePortion`, `headOf` | **New** (pure, unit-tested) |
| `components/MushafLesson.tsx` `useMushafLesson()` | Portion chooser, start/resume, teaching panel, finish card; returns a `view(s,a,w)` function to the page | **New**. Reuses `useRepeatPlayer` (selected reciter, speed, repeat ×N), `Meaning`, `MapCue`, `MethodIntro`, `SaveLine` |
| `app/mushaf/page.tsx` | Draws words from the canonical page layout; asks `view()` how each word should look | **Extended** (Stage 1 Recall unchanged) |
| `lib/pageRecall.ts` `pageHalves` | First/second half split | Reused from Stage 1 |

**Lesson ids are the same as `/learn`:**
- the whole page uses `learn:page:N`;
- a half uses `learn:range:s:a-s:a`.

So a lesson started on `/learn` resumes on the Mushaf and the other way round. If an older range lesson covers exactly the whole page, the Mushaf resumes that record instead of starting a new one.

## 2. Learning progression (from `buildSteps`, unchanged)

1. **Ayah 1:** Listen & repeat (audio ×N, optional meaning and map cue), then Hide gradually (guided level: half the words → first letters → all hidden), then Recite from memory.
2. **Ayah 2:** the same steps, then **Ayahs 1–2 together**.
3. **Ayah 3:** the same steps, then **Ayahs 1–3 together**, and so on. Long running blocks restart with an "everything so far" review.
4. **Long Ayahs** are learned in waqf-aware phrase parts (at most 12 words). Each part goes listen → hide → recall, with **cumulative joins** (parts 1–2, 1–3, …) before the next Ayah.
5. **Page test:** every Ayah of the portion from memory, one at a time, each rated. **This is the only step saved as Hifz evidence.**
6. **Optional:** connect to the Ayah before the portion (practice only).
7. **Finish & save**, then weak Ayahs go to the weak list and revision is scheduled by the existing SRS (`applyResults`).

**Panel activity labels:** Listen / Understand / Hide / Recall / Join / Page test.

**Skip preparation:**
- jumps to the next recall step;
- skipped steps write nothing, and practice ratings are never evidence.

**Practice "Could not recall":** sends the learner back once to re-listen, as `/learn` does.

## 3. Portions

**Chooser:** First half, Second half or Whole page, each with its Ayah count, range and status (in progress at step N, or learned). There is also a Guided/Manual choice and a level selector.

**Half boundary:** the split is at the first Ayah that starts on **line 8 or later** of the 15 lines (Surah titles count as lines), so a half never cuts an Ayah. The page explains this, and notes that long Ayahs can make the halves uneven.

**Progress:** each portion keeps its own lesson record, so switching portions loses nothing.

**Manual learning** (on the page):
- tap an Ayah;
- play it ×N, cycle Hide half / First letters / Hide all / Show;
- rate it.

Only rated Ayahs are saved.

**URL:** `/mushaf?p=N&mode=learn[&from=s:a&to=s:a][&portion=page|first|second][&pathId=…]`.

## 4. On the Mushaf page

- **The page stays visible** throughout. The current Ayah or phrase is highlighted (`.w.act`), and the page scrolls it into view at each step.
- **Concealed words:** empty boxes at the word's measured width (the Stage 1 technique), so line breaks and word positions are unchanged. The browser check measured **0px difference** from the Read page on phone and desktop.
- **Hidden words contain no text** and sit inside `aria-hidden` wrappers, so they are absent from the page and from the accessibility tree until revealed. "First letters" shows only the first letter and its marks.
- **What gets concealed:**
  - only the current step's passage; other Ayahs stay as printed;
  - in the page test, Ayahs already tested are shown, the current one is hidden and highlighted, and later ones stay hidden.
- **Hints:**
  - reveal the next word in reading order across the whole recalled passage, including across Ayahs in a join;
  - an "ok" given with a hint is saved as "Needed help";
  - the challenge level has no hints.
- **During a lesson:**
  - tapping words never opens translations or reveals anything (manual mode: a tap selects the Ayah);
  - "Play page" is off;
  - page swipes are off.
- **Quran text and layout:** not modified. `quran.json` SHA-256 is still `fab6e908…201680`.

## 5. Audio and microphone

**Listen ×N:**
- uses the selected reciter, speed and saved repeat count, through the existing repeat player;
- has a Stop control;
- for phrase steps, says "Audio plays the whole Ayah" (there is no phrase-level audio).

**Check with microphone:**
- **Learner-initiated:** it is a link and never starts automatically.
- **Return:** it opens `/recite` with the passage and a `return=` destination. Recite shows **"← Back to your lesson on the Mushaf"**, and only same-app `/mushaf?` return paths are accepted.
- **Advisory:** Recite explains the check does not change lesson ratings.
- **Phrase steps:** the panel says the microphone checks whole Ayahs, so it will check all of the Ayah, not just the part. Phrase-level ASR is not supported, and the panel says so instead of quietly checking a different range.
- **Returning:** the lesson step is stored in the saved lesson, so the learner returns to the **same step**. Verified in the browser: step 3 of 13 before and after.

**Stage 1 Recall:**
- an unfinished page recall is now kept in `sessionStorage` (this tab only), so the microphone trip doesn't lose ratings;
- this copy is a convenience only and never evidence; evidence is still saved only when every Ayah is rated.

## 6. Saving, resume, evidence

- **Saving:**
  - progress (`step`, practice ratings, final ratings, hints) is written to the existing `LessonState` after every action, through `update()`, so it goes through the IndexedDB-protected store;
  - "Save & exit" leaves the lesson as it is (no completion, no reset).
- **Mode switching:** switching Read / Learn / Recall changes only the URL; the lesson record is untouched. Verified in the browser: Read → Learn shows "in progress (step 3)" and resumes there.
- **Final-only evidence:** `finishLesson` → `saveLessonEvidence`, which:
  - saves only Ayahs rated in the page test;
  - turns hinted "ok" into "hes";
  - uses the `savedToHifz` guard, so **finishing twice saves nothing the second time** (tested; history, SRS records and weak list unchanged).
- **Unattempted Ayahs** (for example the second half while learning the first) get no record (tested).
- **Honest save status:** the finish card shows the existing `SaveLine`, which reports saving / saved / **not saved** from the IndexedDB layer; the global `SaveBanner` still applies. The text says ratings were "added to your Hifz record", not that they are stored safely; the save line shows that.
- **Teaching preferences:** mode, level, portion (page / half page) and repeat count are saved in `tutor`.

## 7. Navigation

| Entry point | Now opens |
|---|---|
| Home "Continue learning" / next on path | `lessonHref` / `learnHref`: Mushaf Learn for single-page Learn lessons |
| Journey (TutorHub) Learn page N | `/mushaf?p=N&mode=learn&portion=page` (or `first` with the half-page preference) |
| Journey Recall a page | `/mushaf?p=N&mode=recall` |
| Today's Hifz "new lesson" (planner) and "Learn a page" | Mushaf Learn |
| Ayah sheet "Learn this page" / "Learn this ayah" | Mushaf Learn (page / that Ayah) |
| `/learn` "Learn page N+1" after completion | Mushaf Learn |

**Still on `/learn`:**
- recovery lessons (`template=recover`);
- path ranges that span two pages;
- all older deep links and saved sessions.

`/learn` is unchanged and still exported.

**Not affected:** page navigation, bookmarks, reading-location saving and Distraction-free reading work as before (navigation tests 10/10).

## 8. Tests

| Suite | Result |
|---|---|
| `test:phase3` | **46 / 46**. 10 new UX2 tests: Ayah-by-Ayah order and joins 1–2 / 1–3 / page test; long-Ayah phrase chunks and cumulative joins covering every word once in order; only the step passage concealed; fade levels; hint order across Ayahs; page-test view; hinted ok → hes; unrated excluded; halves / portions / lesson ids / older-range resume; link routing; resume after reload; final-only evidence; finish twice = no duplicates; unattempted Ayahs untouched; skip preparation; manual view. One older planner assertion was updated because path lessons now open on the Mushaf (intended). |
| `test:hifz` | 24 / 24 |
| `test:storage` | 17 / 17 |
| `test:sync-guard` | 15 / 15 |
| `test:navigation` | 10 / 10 |
| `tsc --noEmit` | clean |

**Browser check (Chrome, puppeteer), 48 / 48 pass.** Each of these was checked at **360×740 and 1280×900**:
- **Chooser:** offers the halves with the line-8 explanation; the portion goes in the URL.
- **Lesson start:** the panel shows the Listen step; the Ayah is highlighted; the page still has 15 lines; Play page is off.
- **Concealment:** the fade step appears; concealed words keep exact positions (0px); Skip lands on a recall step; hidden boxes have no text and are `aria-hidden`; a hint reveals exactly one word.
- **Microphone round trip:** the link carries the return URL; Recite shows "Back to your lesson"; returning lands on the same step.
- **Mode switch:** Read → Learn shows "in progress" and resumes at the same step.
- **Full lesson:** nothing is added to history before Finish; Finish → exactly one history entry, `savedToHifz` set; the completion card offers "Learn the second half"; no evidence for the unlearned half; no page errors.

**Build:**
- the static production export and the debug APK build succeeded (`build-android.ps1` with its stale-export guard);
- the APK (10:55, 3.2 MB) contains the new Mushaf, Recite and lesson strings plus `learn.html`;
- copied to `../Hifz-Companion-debug.apk`.

## 9. Limitations and honest notes

- **No physical Android device test.** WebView behaviour (sticky panel over the page, audio autoplay rules, the microphone trip) still needs checking on a phone.
- **The panel covers part of the page:** on small phones it is sticky at the bottom and covers the lower lines while visible. The active passage is scrolled into view at each step, but a learner may need to scroll to see lines under the panel.
- **No phrase-level audio or microphone:** both work per whole Ayah, and the app says so.
- **Pages with one Ayah** (for example parts of 2:282) have no halves, so only Whole page is offered.
- **Recovery and multi-page lessons** still use `/learn`. A path lesson whose range crosses a page boundary also stays on `/learn`.
- **Stage 1 in-progress Recall state** is in `sessionStorage` (per tab). It is lost if the tab is closed, by design: nothing is evidence until every Ayah is rated.
- **Another agent:** a Codex process (`codex.exe`) was running on this machine during the work. I saw no unexpected file changes, and all suites pass on the final files. If Codex was editing this project, its changes should be reviewed separately.
- **No Supabase migrations deployed and no production services changed.**

## 10. Files

**New:**
- `src/lib/mushafLesson.ts`
- `src/lib/lessonFinish.ts`
- `src/components/MushafLesson.tsx`
- this report

**Changed:**
- `src/app/mushaf/page.tsx`
- `src/app/recite/page.tsx` (return link)
- `src/components/LessonPlayer.tsx` (uses `finishLesson`; exports `useRepeatPlayer` / `Meaning`)
- `src/components/TutorHub.tsx`, `src/app/page.tsx`, `src/components/TodayPlan.tsx`, `src/components/AyahSheet.tsx`, `src/lib/planner.ts` (links)
- `src/app/globals.css` (`.w.act`, `.w.ph.head`)
- `scripts/test-phase3.mjs`
