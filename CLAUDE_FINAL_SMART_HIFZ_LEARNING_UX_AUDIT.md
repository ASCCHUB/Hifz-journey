# Smart Hifz Tutor — Final Learning UX Audit

Auditor: Claude (Anthropic) · Date: 2026-11-14

**Mode:** read-only. Checks used a fresh headless-browser profile against the local dev build (same source as the 23:19 APK); no learner data was touched.

**Scope note:** the separate "learning UX audit requirements" document is not in the workspace. This audit uses the Smart Hifz Tutor requirements given in the Experience Refinement task: three entry points, teaching method, cumulative learning, standalone recall, saved preferences, optional understanding, UX quality and evidence safety.

**Independence caveat:** Claude built these screens. The findings below come from measurements and screenshots taken for this audit.

## 1. Summary

The core teaching loop now matches the agreed concept:
- a clear three-way entry point;
- an explained method;
- Ayah-by-Ayah learning with cumulative "recite 1–2, then 1–3 …" joins;
- an evidence-safe page test;
- a standalone Recall a Page.

The main remaining UX problems are:
- **tap count**: a 7-Ayah Fatiha lesson takes 56 taps;
- **half-page learning offers only the first half**;
- **two unrecorded "peeks" during recall**: the Listen button, and visible word-length blocks;
- **no page-level progress view**.

None of these endangers data. One (half page) is a functional gap a learner will hit quickly.

| Area | Status |
|---|---|
| A. Learn / B. Recall / C. Revise entry points | **Good** |
| Teaching method explained | **Good** |
| Cumulative Ayah learning | **Good** |
| Full-page recall | **Good, with two peeks to close** |
| Saved teaching preferences | **Good; half-page gap** |
| Understanding activities | **Adequate** (practice-only, clearly labelled) |
| Effort / friction | **Needs work** |
| Progress visibility | **Needs work** |
| Accessibility | **Needs work** (hidden words read by screen readers) |

## 2. Evidence

All at 360×740, plus 1366×900 for desktop layout.

| Observation | Measured |
|---|---|
| Journey: hub title position | Above the fold. Cards: "Learn a new page", "Recall a page", "Revise previous Hifz"; side by side on desktop |
| Journey page height (mobile) | 3,308 px (was 5,197); one "My Hifz Journey" heading (was 2) |
| First guided lesson start | Shows "How this method works" (8 steps) |
| First step | "Ayah 1 of 7 · listening & repeating" — "Listen to Ayah 1, then repeat it several times while looking at the text." |
| Cumulative step | "Now recite Ayahs 1–2 together without looking." — 0 Quran words visible before reveal, 1 after one hint |
| Steps per lesson | Page 1 (guided) 28; page 3 (guided) under 60 (was 81) |
| **Taps to finish a lesson** | **Page 1 guided: 56 · page 2 guided: 42 · page 2 standard: 37** |
| Recall a Page midway | Current and upcoming Ayahs covered by blocks; previous Ayah visible as a cue; "Hint: next word" / "Check ayah" |
| Recall evidence | Hinted → "hes"; leaving midway saves nothing; weak-Ayah practice offered |
| **Half-page preference** | Hub offers only "Learn page 1 (first half) → 1:1–1:4". **No way to learn the second half** |
| Home, new learner | Today's Hifz empty state with "Learn a page" / "My Hifz Journey"; the three-way hub is on Journey, not Home |
| Microphone | Never requested on these screens |

## 3. Findings

| # | Sev | Finding | Recommendation |
|---|---|---|---|
| U1 | **High** | **Half-page portion only ever offers the first half.** `TutorHub` builds the first half of the chosen page; there is no "second half" or "continue with the rest of the page". "Next on my path" ignores the half-page preference. | Offer "First half / Second half". After finishing the first half, the completion screen should offer the second half, then a whole-page join. |
| U2 | **High** | **Tap load:** 56 taps for 7 short Ayahs (each recall = "I have recited it" + a rating; each listen/hide step = "Continue"). This is likely to tire learners on long pages. | Merge "show text" and rating into one action (rate directly, reveal on demand); auto-advance after audio ends on listen steps; let Standard skip per-Ayah recall for very short Ayahs; show the estimated minutes up front. |
| U3 | **Medium** | **Unrecorded peeks during Recall a Page:** (a) the header **Listen** button plays the passage audio during the test without downgrading the rating; (b) hidden words are drawn as **blocks of the word's width**, revealing word count and length (a mild cue, common in Hifz apps, but undisclosed). | Disable or hide Listen during recall (or count it as a hint). Optionally use uniform-width blanks in Challenge. |
| U4 | **Medium** | **Screen readers read hidden Ayahs aloud.** Hidden words are transparent text, still in the page, so a blind learner hears the answer, and select-all reveals it in lessons. | Render placeholders while hidden; give recall areas an accessible label such as "Ayah 3 hidden — recite from memory". |
| U5 | **Medium** | **No page-level progress view.** The learner sees counts (coverage strip) and a Surah/Juz tracker, but not "which pages have I learned, which are strong, which are due", which is how Huffaz think. | Add a compact 604-page or per-Juz page grid: colour = learning / long-term / weak / due, outline = said-known. |
| U6 | **Medium** | **Recall a Page uses the older Practice screen style** (different header, buttons, labels "Mistake / Hesitated / Correct") while lessons use the new style ("Could not recall / Needed help / Recited correctly"). This inconsistency in wording can confuse self-rating. | Align labels and layout across lesson, recall and revision. |
| U7 | **Medium** | **Live recitation is a detour:** "Check with live recitation" opens the Recite screen; results don't come back into the lesson or recall, so the learner must still self-rate. | Later phase: return confirmed ASR results to the calling step as suggestions. |
| U8 | Low | **Recall hints are next-word only.** First-letter hints exist in lessons but not in Recall a Page. | Add a first-letter hint in Recall (counted as a hint). |
| U9 | Low | **Home doesn't show the three choices.** A new learner lands on Home, which shows an empty Today's Hifz with "Learn a page" / "My Hifz Journey". | Add a compact three-button version of the hub to Home for first-time learners. |
| U10 | Low | **Revise card and Today's Hifz overlap** on Journey; the Revise card links down to the plan. | Acceptable; could merge later. |
| U11 | Low | **Long-Ayah audio plays the whole Ayah** while practising one part. | Needs word timings; document in-app (already noted). |
| U12 | Low | **Default page = last *reading* page** in the Learn/Recall pickers, which may not be the page the learner is memorizing. | Prefer the path cursor, or the last lesson page. |
| U13 | Info | **Word-by-word meanings** are correctly disabled (no reviewed glossary). Understanding quizzes are practice-only and labelled. Map cues are labelled "not Tafsir" and hidden during recall. | Keep. |

## 4. What works well (keep)

- One obvious place to start, with plain-language cards; desktop and mobile layouts both work.
- Every lesson step states what to do in a sentence; progress shows the *activity*, not just a number.
- The cumulative joins match the agreed method exactly (tested: [1–2] … [1–7] for Al-Fatihah); long pages restart the running block with a review, so joins stay manageable.
- **Evidence safety is visible to the learner:** "only this test is saved", "with a hint → counted as needed help", "one recitation is not long-term retention", "said known ≠ recited".
- Resume after leaving works for lessons; Recall saves nothing until finished.
- The microphone never starts by itself.

## 5. Suggested order of fixes (after review)

1. U1 (half page: second half and join).
2. U3 + U4 (close the recall peeks; accessible placeholders).
3. U2 (cut taps roughly in half).
4. U6 (consistent recall/lesson wording).
5. U5 (page grid).
6. U9, U8, U12.

The technical blockers from `CLAUDE_FINAL_TECHNICAL_QA_AUDIT.md` (**B1 storage overflow**, B2/B4 sync, B3 device) take precedence over all UX items.
