# Stage 3: 604-Page Hifz Tracker and Mobile Mushaf Usability

Date: 2026-11-14.

**Result:**
- **Tracker:** "My 604 Mushaf pages" is added to My Hifz Journey.
- **Statuses:** derived read-only from the existing per-Ayah records. No change to the SRS, planner, storage or Quran text.
- **Lesson panel:** compact and collapsible on small screens, so it no longer hides the Quran page.

**Verification:**
- Unit tests, TypeScript, browser checks (360 px and desktop), the static export and the debug APK all pass.
- **Not tested on a physical Android device.**

## 1. Files

**New:**
- `src/lib/pageTracker.ts`: pure status engine (`pageTracker`, `pageInfo`, `statusCounts`, `evidenceLine`, `allPages`).
- `src/components/PageTracker.tsx`: the tracker and page detail sheet.

**Changed:**

| File | Change |
|---|---|
| `src/app/memorize/page.tsx` | Mounts the tracker; `?page=N` opens that page's sheet. |
| `src/app/page.tsx` | Home link to "My 604 Mushaf pages". |
| `src/components/TodayPlan.tsx` | Each task's "Page N" links to that page's sheet. |
| `src/app/mushaf/page.tsx` | "Page status" button. |
| `src/components/MushafLesson.tsx` | Compact/collapsible panel; scrolling keeps the active passage visible above the panel. |
| `scripts/test-phase3.mjs` | 9 new tests. |

## 2. Status rules (`pageTracker.ts`)

**Inputs:**
- `st.mem` (per-Ayah SRS records);
- `st.weak`;
- live self-reported claims (`claimedAyahs`);
- unfinished lessons, attached to the page they start on.

**Per Ayah:**
- **recited:** `hasEvidence`.
- **clean:** `isVerified`, with no open mistake and not in the weak list.
- **retained:** `isRetained`, i.e. an interval of at least 30 days and at least 5 clean days (the existing Strong rule).
- **due:** the planner's test, `dueAt ≤ now` or `due ≤ today`.
- **said memorized (not checked):** a legacy "Mark memorized" record with no evidence, or a claim.

**Page status:** the first rule that applies wins.

| Priority | Status | Rule |
|---|---|---|
| 1 | Weak · needs help | any recited Ayah has an open mistake / is in the weak list |
| 2 | Due for revision | any recited Ayah is due |
| 3 | Currently learning | an unfinished lesson starts on this page |
| 4 | Strong · retained | **every** Ayah retained |
| 5 | Learned (recited) | **every** Ayah clean |
| 6 | Partly checked | some, not all, Ayahs recited (sampled checks, half-learned pages, mixed claim + recitation) |
| 7 | Said memorized (not checked) | only claims or legacy marks |
| 8 | Not started | nothing |

**Consequences:**
- **Sampled checks:** a sampled assessment can only make a page "Partly checked", never Strong or Learned. This is tested with the real `assessmentPrompts` / `saveAssessment` flow and with perfect records on the sampled Ayahs.
- **Mixed pages** show the evidence split, for example "2 of 7 Ayahs recited and rated · 2 long-term · 5 said memorized (not checked)".
- **Tiles differ by shape as well as colour:**
  - solid fill: weak, due, learned, strong;
  - dashed outline: claimed;
  - thick outline: learning;
  - hatching: partial.
- **Read-only:** the tracker never writes state (tested in unit and browser checks).

## 3. Tracker and sheet

**Header cards:**
- **Learning:** the current learning page (unfinished lesson, else the next page on the primary path), the path name and a "Continue learning" button.
- **Reading:** shown separately, as the last page opened in the Mushaf.

**Controls:**
- Juz selector (default: the Juz of the learning page; or All 30);
- jump-to-page box;
- status filter chips with counts;
- 604 tiles (the current learning page has a ring).

**Page sheet:**
- **Coverage:** page, Juz, Surahs, Ayah range; Ayahs recited and rated (and how many long-term); claims; weak and due Ayahs listed by reference; not started; open lesson and its step.
- **Visual maps:** reviewed maps only, through the existing review gate (`reviewedMapsForAyah`).
- **Actions:**
  - **Learn / Continue lesson:** Mushaf Learn mode, resuming the saved lesson.
  - **Recall page:** Mushaf Recall mode.
  - **Revise weak Ayahs / Revise due / Revise page:** the existing Practice component. Results go through `applyResults` as before, and only recited Ayahs are offered.
  - **Read.**
- **Opening a page or sheet changes nothing.**

## 4. Mobile panel fix

- **Compact by default** below 640 px; the choice is remembered on the device. In compact mode:
  - the instruction shrinks to one line;
  - the notes collapse;
  - **every action stays:** Back, Continue, Skip preparation, Hint, Show, ratings, microphone, Save & exit.
- **"Instructions ▾ / Hide ▴"** expands and collapses the panel without changing the lesson step (tested).
- **Height cap:** the panel never takes more than 45% of the screen height and scrolls inside itself.
- **Scrolling:** the active passage is placed in the visible area **above** the panel, not at the screen centre.
- **Nothing is permanently covered:** the panel is sticky inside the page flow, so scrolling to the end puts the last line above it.
- **Unchanged:** typography and page geometry.

## 5. Verification

**Unit tests (`test:phase3`): 55/55.** The 9 new UX3 tests cover:
- all 604 pages exactly once; all 6,236 Ayahs on exactly one page; Juz and page mapping;
- empty account (all Not started, no writes);
- claimed, learned, strong, weak, due, partial, mixed and learning states;
- a sampled assessment never Strong;
- legacy marks not counted as recited;
- a fully populated account with 201 due pages (counts consistent, computed in under 1.5 s);
- lesson attached to its page, and resume links.

**Other suites:**
- hifz 24/24, storage 17/17, sync-guard 15/15, navigation 10/10;
- TypeScript clean;
- `quran.json` SHA-256 is still `fab6e908…201680`.

**Browser (Chrome headless, 360×640 and 1280×900): 36/36.**
- **Tracker:** 604 tiles once each; empty account shows "Not started 604"; Juz 30 filter shows 582–604; no sideways scroll.
- **Sheet:** jump to page opens it with Juz, Surah and coverage; Learn, Recall and Read links are correct; browsing changes nothing in saved state.
- **Panel:** compact by default at 360 (192 px); Back, Continue, Skip and Save & exit present; buttons at least 32 px tall; no sideways scroll.
- **Visibility:** the active Ayah is visible above the panel on the Listen and Recall steps; the last Quran line can be scrolled above the panel; collapse/expand keeps step 3 of 13.
- **After a real lesson:** with page 2's first half learned, `/memorize?page=2` shows **Partly checked · 3 of 5**.
- No page errors.

**Earlier stages re-run:**
- **Stage 2:** 48/48.
- **Stage 1:** 20/22. The 2 failures are an outdated check expecting the Stage 1 `/learn` half links, which Stage 2 replaced with on-page portion buttons; Stage 2's checks cover these.

**Build:**
- the static export and debug APK built (11:16), and the APK contains the new tracker and panel strings;
- copied to `../Hifz-Companion-debug.apk`.

## 6. Limitations

- **Android:** not tested on a device; the WebView scrolling and sticky panel need a phone check.
- **Due status:** a Recall-tab or claimed page whose records are only "due" without any open mistakes shows "Due", even if the learner also has an open lesson there. Due outranks learning by design: revision first.
- **Lessons spanning pages** are attached to their first page only.
- **Visual map links** in the sheet appear only for teacher-reviewed maps (the existing gate); currently that may be none.
- **No backend change.** The B4 migration is untouched.
