# Quran Companion — Tarteel-Informed UX Redesign: Specification and Implementation Plan

Author: Claude (Anthropic) · Date: 2026-11-14 · **Specification only.** No application code was changed for this task.

## Inputs and limits

- **Your five screenshots** (Home, Mushaf, Recite, My Hifz Journey, Visual Maps) were not attached to this request in this session. Findings below come from the **current implementation**: source code, plus screenshots and measurements captured during the 2026-11-13/14 audits at 360×740 and 1366×900. Please attach them if any finding below does not match what you see.
- **Tarteel, used as inspiration only:**
  - **Hide Ayahs:** one control blanks the whole page while Ayah markers stay; correct recitation fills the text back in.
  - **Goals:** Memorize / Review / Recite actions, where **Memorize and Review count only with Ayahs hidden**; sessions shown as progress bars (completed / in progress / missed).

  No Tarteel trademarks, illustrations, assets, wording or implementation are to be copied. Our ASR is advisory, and we **must not imply Tarteel-level mistake detection** without equivalent validation.
- **Safety baseline:** no new scheduler or progress system. Per-Ayah `mem/weak/mw` + `applyResults` stays the single source of evidence. Quran text, the 604-page layout, ASR logic, migrations, backups and offline behaviour are preserved.

---

## 1. Current screen-by-screen usability findings

| Screen | What works | Problems |
|---|---|---|
| **Home** | Greeting with name; Today's Hifz card with reasons; Ayah of the day; Continue reading | The three main choices (Learn / Recall / Revise) live on Journey, not Home. Today's Hifz, the Ayah of the day, goals, streak and weekly charts all compete for attention. "Continue reading" and "Continue Hifz" are separate and unequal. |
| **Mushaf** | Faithful 15-line page reconstruction, page/Juz/Surah/Hizb navigation, Ayah sheet, audio, memorize-overlay | Learning and recall happen *elsewhere* (`/learn`, `/recall`) in a different, non-Mushaf layout. The student leaves the page they think in. "Learn this page" is buried in the Ayah sheet. |
| **Recite** | Recite-from-anywhere with auto-detect; fixed-range mode; learner-confirmed mistakes; local Quran ASR + fallback | It is a separate island: a lesson's "Check with live recitation" opens Recite, **results don't come back**, and the student must find their way back to the lesson step. |
| **My Hifz Journey** | Three-choice hub at the top; method intro; coverage strip; Today's Hifz; teaching preferences | Still long (3,308 px on mobile): hub + Today's Hifz + path/profile + preferences + tracker + folded tools. Revise appears twice (hub card + plan). **No page-level progress view.** "Half page" offers only the first half. |
| **Lessons (`/learn`)** | Cumulative 1→1–2→1–3; explained steps; page test is the only evidence; resume | 56 taps for Al-Fatihah (guided). Card layout, not the Mushaf page. Hidden words are transparent text, so screen readers read them. |
| **Recall (`/recall`)** | Hidden page, hint → hesitated, nothing saved unless finished, weak-Ayah retry | Uses the older Practice look and different rating words. The **Listen** button plays audio during the test without counting as help. Blocks reveal word lengths. |
| **Visual Maps** | 3 original maps, stages, progress, cues in lessons, Mushaf links | A separate destination with its own stages and status, partly duplicating lessons. Discoverable mainly through the nav tab. |

**Cross-cutting:**
- six bottom tabs plus many in-page buttons with overlapping destinations;
- three different visual languages (Mushaf page, lesson cards, Practice);
- progress shown as counts rather than *pages*, which is how a Quran teacher and student think.

---

## 2. New navigation architecture

**Principle:** the **Mushaf page is the home of learning**. Everything else either *chooses a page* or *reports on pages*.

**Bottom navigation** (5 tabs; Maps folds into Learn/Journey):

```
[ Home ]  [ Mushaf ]  [ Recite ]  [ Journey ]  [ Profile ]
```

| Tab | Purpose |
|---|---|
| **Home** | "What should I do now?" One primary *Continue* card and three verbs (Learn, Recall, Revise), then Continue reading. |
| **Mushaf** | One reading surface with a **Read / Learn / Recall** mode switch (§4). |
| **Recite** | Recite from anywhere (unchanged), plus a handoff target from the Mushaf (§6). |
| **Journey** | Path, the **604-page tracker** (§5), previously memorized coverage, goals; details expandable. |
| **Profile** | Account, sync, backups, settings (including teaching preferences). |

**Visual Maps** remain reachable from Journey ("Visual memory maps"), inside Learn and Recover (§7), and through deep links, so existing map progress and IDs are untouched. Removing the tab is a navigation change only.

**URL scheme** (shareable, resumable; existing routes kept as aliases):

| URL | Opens |
|---|---|
| `/mushaf?p=37` | Read |
| `/mushaf?p=37&mode=learn` (or `&lesson=<id>`) | Learn |
| `/mushaf?p=37&mode=recall` | Recall |
| `/learn?page=37` | → redirects to `/mushaf?p=37&mode=learn` |
| `/recall?page=37` | → redirects to `/mushaf?p=37&mode=recall` |
| `/recite?s=2&a=6&endS=2&endA=16&return=<encoded mushaf URL with lesson & step>` | Recite with a handoff back |

---

## 3. Home and Journey wireframes

### Home (mobile)

```
┌────────────────────────────────────┐
│ Assalamu alaikum, Aminah   🔥 4    │
├────────────────────────────────────┤
│ CONTINUE                           │
│ Learning page 37 · Ayah 5 of 9     │
│ "Link Ayahs 1–5"   ▓▓▓▓▓▓░░░ 62%   │
│ [ ▶ Continue lesson ]              │  ← one primary action
├────────────────────────────────────┤
│ [ 📖 Learn ] [ 🎯 Recall ] [ 🔁 Revise ] │  ← three verbs, equal size
├────────────────────────────────────┤
│ TODAY · about 25 of 30 min         │
│ Next: Revise page 12 (due 2 days)  │  ← only the NEXT task, with reason
│ 3 more tasks ›                     │
├────────────────────────────────────┤
│ Continue reading · page 105  ›     │
└────────────────────────────────────┘
```

- **Continue** picks, in order: an unfinished lesson → the next Today task → the next page on the path.
- **The three verbs** each open a small sheet:
  - *Learn:* "next on path / choose page / first or second half".
  - *Recall:* "a page I learned recently / choose page".
  - *Revise:* "today's revision / choose Juz or page / recover a faded page".
- **Removed from Home:** the weekly chart, goals list and Ayah of the day become a small collapsible "More" row below the fold.

### Journey (mobile)

```
┌────────────────────────────────────┐
│ My path: Juz Amma, short first     │
│ Current: page 589 · An-Naba 31     │  [Change path]
├────────────────────────────────────┤
│ 604-PAGE TRACKER    Juz [30 ▾]     │
│ ┌─┬─┬─┬─┬─┬─┬─┬─┬─┬─┐               │
│ │■│■│▣│▧│□│□│◌│◌│◌│◌│  582–591      │  ■ long-term  ▣ learned
│ ├─┼─┼─┼─┼─┼─┼─┼─┼─┼─┤               │  ▧ due/weak   □ learning
│ │◌│◌│◌│◌│◌│◌│◌│◌│◌│◌│  592–601      │  ◌ said known (dashed)
│ └─┴─┴─┴─┴─┴─┴─┴─┴─┴─┘               │
│ Recited here 214 · Said known 380  │
├────────────────────────────────────┤
│ Goals  Daily: ½ page new · 5 pages revision │
│ Sessions ▓▓▓▓▓░ (done / in progress / missed)│
├────────────────────────────────────┤
│ ▸ Previously memorized portions (4) │
│ ▸ Revision details & weak Ayahs     │
│ ▸ Teaching preferences              │
│ ▸ Advanced: custom ranges, diagnostics, legacy tools │
└────────────────────────────────────┘
```

- **Removed duplication:** the hub cards move to Home; Today's Hifz appears once (Home), with Journey linking to the full list under "Revision details".
- **Goals:** reuse the existing daily preferences. Session bars are *derived* from the existing `log` / `dailyPlan` (no new store), with colours plus labels (completed / in progress / missed).

---

## 4. Unified Read / Learn / Recall Mushaf design

**One surface:** the existing 15-line page renderer (`mushaf/page.tsx` + `pageContent()`), with a segmented control at the top: `[ Read | Learn | Recall ]`. Switching modes keeps the **page, the selected Ayah and any active lesson** (URL plus `lessons[id]` state). The page geometry never changes between modes, so the student's visual memory of the page is preserved.

### READ (today's Mushaf)
- Text, Ayah sheet (translation/tafsir/audio/bookmark), page navigation, audio follow-along.
- New: a mode chip on the selected Ayah: "Learn from here" → Learn mode at that Ayah.

### LEARN (guided cumulative memorization on the page)
- **The engine stays `buildSteps()`** (cumulative 1 → 1–2 → 1–3, long-Ayah parts, review blocks, page test, connect). Only the rendering moves onto the page:
  - **current unit** highlighted in place; **already-learned Ayahs** normal; **upcoming Ayahs** dimmed;
  - **fade** applies only to the words of the current unit, on the page itself;
  - **instruction bar** pinned at the bottom: *"Now recite Ayahs 1–3 together without looking."*, with progress "Ayah 3 of 9 · linking";
  - **controls** (thumb-reachable): `▶ ×3` · `Hide more` · `Hint` · `Done ✓ / Needed help / Couldn't`.
- **Fewer taps without weakening evidence:**
  - **Rate directly:** the three rating buttons replace "show text" + rating. Revealing is optional ("Peek" counts as a hint).
  - **Auto-advance after listening:** once `▶ ×N` finishes, the step advances unless "Stay" is tapped.
  - **Merge** the read-along step into Listen for Standard and Challenge (already done for Guided).
  - Estimated: Al-Fatihah guided **56 → ~30 taps**. The page test remains per-Ayah rated (it is the evidence).
- **Half page:** Learn offers **First half · Second half · Whole page** (split at the Ayah nearest the 8th line). After the second half, a **"Join both halves"** step precedes the whole-page test.
- **Help is recorded:** any peek, hint or play during a recall-type step marks that unit `hinted` (existing rule → `hes`).

### RECALL (hidden 15-line page)
- The **same page, fully hidden**, Tarteel-style. Line shapes stay, Ayah markers stay (toggleable), and the text is **not in the page or the accessibility tree** until revealed (§8).
- Per Ayah, in order: `Reveal` · `Hint (first word / first letters)` · rating.
- **Listen is disabled** during Recall, or, if the learner insists, it is logged as help.
- **Results overlay** on the page itself: each Ayah tinted (clean / help / mistake); "Practise 3 weak Ayahs" opens Learn on just those Ayahs; "Recall again".
- **Evidence:** the same as today: `applyResults("assessment")` only after every Ayah is rated; hinted → `hes`; leaving midway saves nothing.
- **Recite with microphone** (optional, learner-started) hands off to Recite for this page (§6). Confirmed results return as *suggested ratings* the learner accepts.

### How existing components share the surface (no engine rewrite)

| Existing | Becomes |
|---|---|
| `pageContent`, `mushaf/page.tsx` renderer | the shared `MushafPage` surface with a `mode` prop and per-word render callbacks (`renderWord(wordRef, mode, state)`) |
| `LessonPlayer` | split into `useLesson()` (state, steps, rating, save: today's logic) + a thin Mushaf overlay. The card UI is kept as a fallback for ranges that span pages |
| `Practice` | `useRecallSession()` hook (rating, hint→hes, save-on-complete) used by Recall mode; the existing Practice screen stays for Today's revision lists |
| `LiveRecitation` | unchanged engine; gains `return` handling (§6) |
| `buildSteps`, `chunking`, `saveLessonEvidence`, `applyResults`, `planner`, `assessment`, `coverage` | **unchanged** |

---

## 5. 604-page tracker design

**Data:** derived only, from existing records. No new progress store. Per page *p*, from the Ayahs that start on *p*:

| Status (priority order) | Rule (all from existing data) | Visual |
|---|---|---|
| **Weak** | any Ayah in `weak` or `bad` | red-orange fill + `!` |
| **Due** | any Ayah due by SRS | amber outline + dot |
| **Long-term** | **every** Ayah on the page `isRetained` (≥ 5 clean days, interval ≥ 30) | dark solid |
| **Learned** | every Ayah has clean evidence (`isVerified`), not all long-term | solid |
| **Learning** | some Ayahs have evidence | half-filled (fraction = Ayahs with evidence) |
| **Sampled** | only page-check prompts recited (≤ 2 Ayahs), rest said-known | dashed + small dot, labelled "checked (sample)" |
| **Said known** | only claims (or legacy marks) | dashed outline (gold = claim, grey = legacy) |
| **None** | — | empty |

- **Never "Strong" from a sample.** Long-term requires *every* Ayah on the page to qualify. A clean two-prompt check shows "checked (sample)", never Learned or Long-term.
- **Mixed pages** (two Surahs, or a partial claim) show a split cell: fill for evidence plus a dashed band for claims.
- **Filters:** Juz selector (default: current Juz), "Due", "Weak", "Said known". Page numbers are shown on each cell (accessible label: *"Page 37, Al-Baqarah 246–252: 5 of 7 Ayahs learned, 1 due"*).
- **Tap a page** → a sheet with Read · Learn · Recall · Revise for that page, plus its Ayah-level breakdown.
- **Performance:** compute once per state change (6,236 Ayahs → 604 pages, O(n)), memoised. Render one Juz at a time (about 20 cells), or the full 604 on desktop.

---

## 6. Recite and lesson handoff

- **From the Mushaf (Learn or Recall):** "🎙 Recite this" opens `/recite?s=…&a=…&endS=…&endA=…&return=<urlencoded /mushaf?p=…&mode=…&lesson=<id>&step=<n>>`.
  - Recite starts in **fixed-range mode** for exactly that range. The microphone still needs the learner's tap.
  - On finish: "**Return to your lesson**" goes to the `return` URL.
  - **Confirmed** results (the learner's own "I made this mistake" / "I recited it correctly", plus clean matches) travel back as `suggested` ratings in session storage keyed by lesson id and step.
  - The lesson shows them pre-selected; **the learner still taps to accept**. Unconfirmed suspicions are never converted into ratings.
- **Independent Recite from Anywhere** stays exactly as today.
- **Wording:** "Recognition can mishear recitation; you decide." No accuracy claims; no Tajweed claims.
- **Return robustness:**
  - lesson state is already persisted per step (`lessons[id].step`), so even without `return` the learner lands at the right step via "Continue";
  - `return` is validated (same-origin path only).

---

## 7. Visual Maps integration

- **The three maps keep their IDs** (`al-fatihah`, `al-baqarah-1-5`, `al-baqarah-21-29`) and `mapProgress`.
- **Where the learner meets them:**
  1. **Learn, the first time on a mapped page:** a "Memory map available" chip above the instruction bar; tapping shows the branch for the current Ayah (symbol, colour, cue). Cues are shown on listen/hide steps only, never on recall or test steps, where they would be unrecorded help.
  2. **Recover a faded page:** step 1 offers "Rebuild from the memory map" (order the branches → reveal the Ayahs). This is the existing order exercise, practice only.
  3. **The page tracker sheet:** a map link for mapped pages.
  4. **Journey → "Visual memory maps":** the existing standalone map page (unchanged) for browsing and its 7 stages.
- **No new map content.** PDF-derived maps stay **not authorized** until permissions and teacher review are resolved. The manifest's `review` field must read `teacher_reviewed` before any new map ships.

---

## 8. Accessibility and RTL

- **Hidden text is not in the DOM.** In Recall, Learn-hide and the page test, hidden words render as **placeholders** (uniform-width in Challenge, word-width otherwise), with `aria-label="Ayah 5, hidden — recite from memory"`. The real words are inserted only when revealed. This fixes the screen-reader leak and copy/select-all peeking.
- **Revealing is explicit and announced** (`aria-live="polite"`: "Ayah 5 revealed").
- **Direction:** Quran text `dir="rtl"` with the Hafs font; UI chrome LTR; mixed labels isolate Arabic with `<bdi>`. The page tracker reads page numbers LTR, with Arabic Surah names isolated.
- **Touch and type:** targets ≥ 44 px. Bottom controls are thumb-reachable and stay above the system navigation. Arabic text ≥ 26 px, scaling with the existing zoom.
- **Colour is never the only signal:** the tracker uses fill + pattern + icon + text labels; ratings use words, not just colours.
- **Motion:** honour `prefers-reduced-motion` for fades and auto-advance (fallback: no auto-advance).

---

## 9. Safe component reuse plan

| Layer | Change | Must stay identical |
|---|---|---|
| Evidence | none | `applyResults`, `isMemorized`, SRS intervals, `weak`, `mw`, `recitationResults` confirmation rules |
| Planning | none (UI only) | `buildPlan`, `assessment`, `coverage` |
| Lesson logic | extract `useLesson()` from `LessonPlayer`; add half-page units + "join halves" in `buildSteps`; add "rate directly" | step order, final-only evidence, hinted→hes, once-only save |
| Recall logic | extract `useRecallSession()` from `Practice` | save only when complete, hinted→hes |
| Surface | new shared `MushafPage` using `pageContent()` | the 604-page layout, Quran text |
| ASR | add the `return` param and suggested ratings | engine, server, alignment, confirmation boundary |
| Persistence | none | B1 save queue, IndexedDB, banner, backups |
| Routing | `/learn` and `/recall` redirect to Mushaf modes; old links keep working | deep links |

---

## 10. Incremental implementation milestones

Each is shippable and individually tested.

1. **M0 — Blockers first:** B4 and B2 (see §12). No UX release before.
2. **M1 — Accessibility and recall honesty:** placeholders instead of hidden text; Listen/peek during recall counted as help; consistent rating words across lesson, recall and revision.
3. **M2 — Half page:** first/second half and "join halves" in `buildSteps`, with tests.
4. **M3 — `MushafPage` surface + Recall mode on the page:** using `useRecallSession`; `/recall` redirects.
5. **M4 — Learn mode on the page:** using `useLesson`; rate-directly; auto-advance; `/learn` redirects; resume across modes.
6. **M5 — 604-page tracker** on Journey + page sheet.
7. **M6 — Home simplification:** Continue + three verbs + next task; Journey reorganised; Maps tab folded.
8. **M7 — Recite handoff:** `return` + suggested ratings.
9. **M8 — Map touchpoints** in Learn and Recover; manifest review gate.

## 11. Acceptance criteria

- **First-time learner:** on Home, sees *Continue* (or "Start your first page") and Learn / Recall / Revise without scrolling at 360 px.
- **Mode switching:** switching Read ↔ Learn ↔ Recall keeps the same page, selected Ayah and lesson step (automated + browser test).
- **Learn:** a full-page lesson keeps the cumulative 1–2, 1–3 … order and long-Ayah joins (existing tests pass); taps for Al-Fatihah guided ≤ 35; the second half and the join step exist.
- **Recall:** 0 hidden words in the DOM before reveal (DOM query); the screen reader announces only "hidden"; Listen/peek → `hes`; leaving early saves nothing; results tinted on the page.
- **Tracker:**
  - 604 cells, Juz filter;
  - a page with a clean 2-prompt sample shows "checked (sample)", **never** Learned/Long-term;
  - a page shows Long-term only if every Ayah `isRetained`;
  - said-known is visually distinct.
- **Recite handoff:** the exact range opens; the mic needs a tap; return lands on the same lesson step; only confirmed results are suggested; nothing is auto-rated.
- **Maps:** IDs and `mapProgress` unchanged (existing test); no cue is visible on recall/test steps; lessons without maps unaffected.
- **No regressions:** all suites pass (hifz, navigation, phase3, storage), `tsc`, static export, APK inspection (pages present), Quran checksum unchanged.

## 12. Release blockers and required tests

| Blocker | Status (2026-11-14) | Required before release |
|---|---|---|
| **B1** storage overflow / silent save failure | **FIXED** today: IndexedDB + persistent unsaved warning; 17 storage tests + browser quota simulation (`B1_STORAGE_PROGRESS_PROTECTION_REPORT.md`) | On-device confirmation as part of B3; consider `navigator.storage.persist()` |
| **B4** old-client cloud overwrite | **OPEN** | Server-side guard (schema marker + RLS/trigger) + forced-update message; test that an old-format write is rejected |
| **B2** real Supabase verification | **OPEN**: no project keys on this machine | Two-device live test (offline edits, claim deletion, compare-and-swap conflict), payload size measurement |
| **B3** real Android testing | **OPEN**: no device or emulator | Install the APK (09:18 build), lesson with audio, resume after kill, quota/IndexedDB behaviour, offline, no unexpected mic prompt |

**Do not release** while B4, B2 or B3 are open. Signed-in multi-device use specifically must wait for B4 + B2. These UX milestones should not start shipping to learners before M0.
