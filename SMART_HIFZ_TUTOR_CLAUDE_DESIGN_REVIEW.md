# Smart Hifz Tutor — Independent Design Review (Phase 3)

Reviewer: Claude (Anthropic). Date: 2026-11-13. Scope: read-only design and architecture review. No application source, data, Quran text or user progress was changed; this file is the only output.

**Legend used throughout**

- ✅ **Confirmed** — exists in the current source (file references given).
- 🟡 **Partial** — exists but does not yet meet the Phase 3 goal.
- 🆕 **Proposed** — new design in this review; not implemented.

**Evidence base.** I read `src/lib/hifz.ts`, `store.ts`, `goals.ts`, `mindMaps.ts`, `recitationResults.ts`, `components/Practice.tsx`, `app/memorize/page.tsx`, `app/mind-maps/page.tsx` and the existing `QURAN_APP_FULL_AUDIT_FOR_CHATGPT.md`.

- **The earlier audit is out of date on speech recognition.** Since it was written, the local Quran ASR has been wired into Recite: `components/LiveRecitation.tsx`, `lib/quranAsr.ts`, `lib/recitationAlign.ts` and `lib/quranLocate.ts`. It now feeds `applyResults`.
- **No mind-map PDFs are present in the workspace.** I have not seen them and make no assumption about their content, licensing or reuse rights.

---

## 1. Executive Summary

The app already has the hard foundations a Hifz tutor needs:
- a verified 604-page Quran dataset;
- per-Ayah memorization records with spaced intervals;
- a weak-Ayah queue and word-level mistake counts;
- hide-and-recite practice;
- an Ayah-range picker;
- a diagnostic "recover old memorization" flow;
- three hand-authored visual maps with a 7-step flow;
- a live recitation checker that is advisory and confirmation-based.

What it lacks is an **orchestrator**: something that decides *what this learner should do next, in what order, at what difficulty*, and that reasons in **pages and chunks** rather than only in Ayahs.

**Core recommendation.** Do not build a second scheduling system. Add a thin **Tutor layer** on top of the existing Ayah records:

1. A **Unit model** (page → chunk → Ayah) derived from `layout.json`, so a 15-line page becomes the teaching and progress unit while Ayah records stay the source of truth.
2. A **Lesson engine**: a small state machine of steps (listen → learn → hide → recall → link → page test). It reuses `Practice`, `Audio` and `LiveRecitation` as step renderers.
3. A **Daily Planner** that fills a minute budget from three queues (new, near revision, far revision) using simple, explainable rules.
4. A **Mastery model** with evidence-based states (Learning → Learned → Strong, and Fading). Only recitation evidence counts, never meaning quizzes or speech-recognition guesses.
5. **Optional maps** as an overlay ("cue layer") on any lesson, never a separate path a learner must follow.

Keep Phase 3 small: one page-learning flow done well beats twelve quiz types done roughly.

---

## 2. Learner Personas

| Persona | Situation | Main need | Risk if the design ignores them |
|---|---|---|---|
| **A. Beginner adult** | Reads slowly, little or no Hifz, 10–20 min/day | Very small chunks, audio-first, meaning to anchor | Overwhelm; quits in week 2 |
| **B. Child / teen with teacher** | Has a teacher, uses app between classes | Teacher-set range, short daily loop, clear "done" | App overrides teacher's plan |
| **C. Steady student** | Memorizing ~1 page/day, follows a path | Efficient page flow, cumulative linking, low friction | Too many steps, too many taps |
| **D. Returning Hafiz** | Memorized much (or all) years ago; much has faded | Honest assessment, recovery without shame, big revision cycles | App treats "memorized once" as "strong" |
| **E. Active Hafiz** | Full Quran, maintaining | Large daily revision (e.g. ½–1 Juz), weak-page focus | New-memorization UI gets in the way |

Design implication: the **same engine** with different defaults: chunk size, steps shown, revision ratio, number of hints. Do not build separate products.

---

## 3. Personalized Onboarding 🆕

Five screens, all skippable, all changeable later in Profile. Ask only what changes the plan.

1. **Name** — "What should we call you?" (stored locally; synced only if signed in).
2. **Experience** — *New to Hifz* / *Some memorized* / *Memorized a lot, want to restore* / *Hafiz, maintaining*.
3. **What you already know** — Juz grid (30 tiles) plus "add Surah / page range". Three choices per tile: *Strong*, *Shaky*, *Mostly forgotten*. Default is *Shaky*, never *Strong*.
4. **Path** — first→last, last→first (Juz 30 first, recommended for beginners), selected Surahs, selected Juz, custom range, "my teacher sets it".
5. **Daily time** — 10 / 20 / 30 / 45 / 60 min, plus learning days. The app then shows the *consequence*: "≈ ½ page new per day + 1 Juz revision cycle every 12 days". The user can accept or adjust.

**Important rule for screen 3:** self-reported memorization creates records in a **Claimed** state (see §13). It schedules short *verification* checks; it does **not** create long intervals. ✅ `markRange` today sets `iv: 3, reps: 0`, which is already conservative. The Tutor should label these as *Claimed* in the UI and route them into the §10 assessment.

---

## 4. Learning Path Architecture 🆕

A **Path** is only an *ordering of units*. It owns no progress.

```
Path { id, kind: "forward" | "reverse" | "surahs" | "juz" | "custom" | "teacher", units: UnitRef[], cursor }
Progress lives in mem/weak/mw (per Ayah) + page rollups (derived)
```

- Switching paths moves a cursor; it never deletes or resets records. This satisfies "change path without losing progress".
- Multiple active paths are allowed, for example "my Juz 30 path" plus "Surah Al-Kahf collection". The planner draws *new material* from the **primary** path only, to avoid splitting focus.
- **Personal collections** are named lists of `UnitRef`s (Surah, page or range). The same structure is used for "teacher-assigned".
- ✅ Reuse: `journey.start/end/last/lastEnd` already behaves like a single custom path cursor. Migrate it into the first `Path` record.

**Unit granularity.** The page is the default unit, because the 15-line Madinah page is how Huffaz think and revise. For Surahs shorter than a page, the Surah is the unit. Page boundaries come from ✅ `layout.json` / `pageContent()`.

---

## 5. Guided 15-Line Page Learning 🆕

A page is split into **chunks** of about 3–5 lines that end on Ayah boundaries where possible (rules in §6). A typical page has 3–4 chunks.

**Per-chunk loop** (each step is one screen; most take under a minute):

| # | Step | What happens | Reuses |
|---|---|---|---|
| 1 | **Listen** | Chunk audio ×3 (repeat count adjustable), text visible, current Ayah highlighted | ✅ `Audio` repeat/range |
| 2 | **Understand (light)** | One-line gist per Ayah + up to 3 key words with meanings. Collapsed by default for personas C/E | ✅ translations; 🆕 word glossary (see §16) |
| 3 | **Read along ×3** | User recites *with* text, ideally with audio after the first time | ✅ Audio |
| 4 | **Fade** | Text fades in 3 levels: every other word hidden → first letters only → fully hidden | 🟡 `Practice` hides whole Ayah; add fade levels |
| 5 | **Recall** | Recite the chunk hidden; self-rate per Ayah (or live check, see below) | ✅ `Practice` ok/hes/bad |
| 6 | **Link** | Recite *previous chunk + this chunk* hidden | ✅ `Practice` with joined items |

**After the last chunk:**

7. **Page test**: recite the whole page hidden once. The result is the page's first evidence point.
8. **Connect to yesterday**: recite the last 3 lines of the previous page + the first 3 of this page. This trains the page transition, a classic weak point.
9. **Schedule**: the page enters *Learning* (§13). Tomorrow's plan includes it in "near revision".

**Live recitation in the loop.** Steps 5–7 can optionally use ✅ `LiveRecitation` in *fixed-range* mode. Its flags are suspicions. The learner confirms or dismisses them, and only confirmed or self-rated outcomes count (✅ already true in `recitationResults.ts`). Default to self-rating when the speech server is unavailable.

**Pacing.** If time runs out mid-page, save the chunk index and resume there. Never force the full page in one sitting. Allow a "half page today" plan.

---

## 6. Long-Ayah Chunk Learning 🆕

Rules for splitting, applied in order:

1. **Prefer Ayah boundaries.** A chunk is 1–N whole Ayahs totalling ≤ ~4 lines.
2. **An Ayah longer than ~2 lines** (e.g. 2:282, 2:102, 24:31) is split into **phrases** at:
   - waqf marks present in the text (ۚ ۖ ۗ ۛ) — they are already in `quran.json` Uthmani text. Use them as split *candidates* only, never altering text;
   - otherwise line boundaries from `layout.json`;
   - otherwise ~5–8 word groups.
3. **Learn phrases cumulatively:** P1 → P1+P2 → P1+P2+P3 → whole Ayah. This "rolling join" prevents learners from knowing phrases but not the Ayah.
4. **Hints for long Ayahs** are first-word-of-next-phrase, not the whole next line.
5. A long Ayah is "recalled" only when recited **whole** at least once. Phrase successes are practice, not evidence.

✅ The Visual Maps page already has a "Phrase by phrase" stage (`mind-maps/page.tsx`, stage 3). Generalize that splitter into a shared `chunkAyah()` utility rather than writing a second one.

---

## 7. Quiz Design and Difficulty Levels

**Principle: separate *memorization evidence* from *understanding practice*.** Only the first changes mastery.

| Quiz | Tests | Counts toward mastery? | Status |
|---|---|---|---|
| Hidden recitation (Ayah / chunk / page) | Memorization | **Yes** (primary) | ✅ `Practice` |
| "What comes next?" — given Ayah N, recite N+1 | Memorization (sequence) | **Yes** | ✅ "Daily continuation quiz" in memorize page |
| Page start / end — given page number, recite first line | Memorization (page anchoring) | **Yes** | 🆕 |
| Word-order rebuild — tap shuffled words of an Ayah into order | Memorization (recognition, weaker) | Partial: counts as *hesitation*, never as a clean recall | 🟡 maps have order quizzes |
| First-letter prompts — only first letters shown | Memorization with scaffold | No (practice) | 🆕 |
| Meaning match — match Ayah to gist | Understanding | **No** | ✅ maps "meaning match" |
| Key-word meaning | Understanding | **No** | 🆕 |
| Mutashabihat — "which continuation belongs here?" for similar Ayahs | Memorization (discrimination) | Yes, as a weak-signal boost | 🆕 (later phase; needs a reviewed similar-verse list) |

**Difficulty levels** (one setting, ✅ `settings.quizDifficulty` already exists as guided/challenge; extend to three):

- **Guided**: hints allowed (next word, first letters); hint use downgrades "Correct" to "Hesitated" (✅ already implemented in `Practice`).
- **Standard**: no hints; previous Ayah shown as cue.
- **Test**: no cue, random start points inside the page, no audio.

A page cannot reach *Strong* through Guided-mode successes alone.

---

## 8. Cumulative Memorization Method

Use the established three-ring model (used in many Hifz schools as *sabaq / sabqi / manzil*), expressed in neutral terms in the UI:

| Ring | Contents | When | Typical size |
|---|---|---|---|
| **New** | Today's lesson | Daily | ¼–1 page |
| **Near revision** | The last ~5–20 learned pages, recited every day (or every 2nd day) | Daily, *before* new | 1–5 pages |
| **Far revision** | Everything older, on a rotation + spaced repetition | Daily | ½–2 Juz (see §12) |

When cumulative revision happens:

- **Within a lesson**: the chunk *Link* step (§5 step 6) and the end-of-page test.
- **Next day**: the new page moves into *near revision* and is recited daily until it has ~7 clean days. That is the existing successDays ladder: ✅ `applyResults` grows intervals 1→3→7→14→30→60 on distinct clean days.
- **Graduation**: after near revision, the page joins the far-revision rotation (§12).
- **Weekly checkpoint** 🆕: once a week, recite the last 5–7 pages *continuously* (one long hidden recitation). Failures send specific pages back to near revision.

---

## 9. Mind-Map Integration (optional cue layer)

**Confirmed today** ✅:
- **Content:** `lib/mindMaps.ts` holds 3 hand-authored maps (Al-Fatihah, Al-Baqarah 1–5, 21–29) with per-Ayah cue, symbol, colour and groups.
- **Flow:** `mind-maps/page.tsx` has a 7-stage flow (study → learn → phrase → visual-cue recall → recite without map → rebuild sequence → final test).
- **Separate schedule:** it keeps its own schedule (`mapProgress`, `MindMapRec`).
- **Labelling:** the code labels cues as "not Tafsir", which is correct.

**Issue.** Two parallel progress systems: `mapProgress` statuses and Ayah `mem` records. A learner can be "Strong" on a map but "Due" in Hifz, which is confusing.

**Recommendation 🆕: make maps a *cue layer*, not a path.**

- **Shared engine:** extract a `CueSet` interface `{ unit, chunks[], cues[{ayah|phrase, label, symbol, colour}] }`. Today's `MIND_MAPS` become the first CueSets.
- **Optional inside lessons:** any lesson step can *optionally* render cues: progressive branch reveal during Learn; cue-only prompt during Recall ("recite the Ayah behind ☁"); branch-order rebuild as a sequence test.
- **No map, same lesson:** with no CueSet for a unit, the lesson runs unchanged. Cues only add steps.
- **One source of mastery:** map assessments write results through ✅ `applyResults` (the map page already calls it with kind `"assessment"`). Retire `MindMapRec.status` as a *mastery* signal and keep it only as "map stage reached" UI state.
- **Recovery use:** for a Fading page that has a CueSet, offer "rebuild from the map" as a lighter first recovery step (§11).

**Content and rights**:
- **Third-party artwork:** treat the PDFs' artwork, layouts and wording as third-party copyright until written permission is obtained. Do not trace, reproduce or adapt them commercially.
- **What's safe:** the *method* (coloured branches, chunked Ayahs, cue words, progressive reveal) is not protectable and can be implemented with original cues.
- **Cue review:** cue text is interpretive; have each CueSet reviewed by a qualified teacher before release, and show "memory cue, not Tafsir".
- **Scale:** authoring is the bottleneck (3 maps today). Plan an authoring format (JSON) and a reviewer sign-off field, not code edits per map.

---

## 10. Previously Memorized Quran Assessment

✅ Exists: "Recover my old memorization" diagnostic per Surah/Juz (hides Ayahs, the user self-rates, capped at 30 Ayahs per run). `markRange`/`markJuz` create conservative records.

🆕 Proposed **page-sampling assessment** (fast enough for a whole Juz):

1. **Sample, don't test everything.** For each page in the claimed range, ask **2 prompts**:
   - "recite the first line given the page number + Surah name", and
   - "continue from this random Ayah for ~2 lines".

   A Juz (20 pages) is about 40 prompts, about 20–25 minutes, splittable across days.
2. **Rate per prompt:** Clean / Hesitant / Couldn't. Optionally use live recitation for the page-start prompt; it is advisory only.
3. **Page verdict:**
   - 2 clean → **Learned** (interval 7 days);
   - 1 clean → **Fading** (interval 1–3 days);
   - 0 clean → **Needs relearning** (goes to §11 recovery, not to "new").
4. **Juz verdict** = distribution shown as a strip of 20 coloured page tiles. This is the most motivating view for returning Huffaz (persona D).
5. **Never upgrade from self-claim alone.** A *Claimed* page becomes Learned only through this assessment or normal revision evidence.

---

## 11. Forgotten-Page Recovery 🆕

A forgotten page is not "new". The learner has latent memory, so recovery is shorter than first learning:

1. **Listen once, read once** (no meaning step unless requested).
2. **Recall chunk by chunk** with first-letter hints allowed. Hints are expected here.
3. **Joined recall** of the whole page.
4. **Re-test next day**, then 3 days, then 7: a compressed ladder.
5. If a page fails recovery twice, it becomes **Relearn**: it goes back through the full §5 flow as if new, and counts against the *new* budget, not revision.

Recovery sessions draw from the ✅ `weak` queue (Ayah-level) rolled up to pages. ✅ `mw` word-mistake counts identify the exact trouble words to highlight in step 2.

---

## 12. Daily Revision Scheduling

✅ Exists:
- per-Ayah `due/dueAt/iv` with ladder intervals;
- `dueRuns()` grouping due Ayahs into consecutive runs;
- a minute budget (`studyMinutes`) and simple split between revision and new in the memorize page.

🆕 Planner, page-based, explainable:

```
budget = studyMinutes
1. Near revision (always first, never skipped):  last N learned pages        ≈ 25–35% of budget
2. Weak/overdue far pages (most overdue first):  pages with due Ayahs, weak flags
3. Rotation far pages:                            next pages in the manzil cycle
4. New lesson:                                    remaining budget, capped by plan
```

**Manzil rotation** (prevents neglecting any Juz):
- **Cycle:** all Learned/Strong pages are ordered by mushaf position into a cycle of K days, so each page is revised at least once every K days. K comes from the daily budget, e.g. 20 memorized Juz at 1 Juz/day gives K = 20.
- **Spaced repetition adjusts priority:** a weak page is pulled forward; a Strong page may be skipped once if it was clean in its last 3 cycles. But **no page goes longer than 2K days** unseen. This is the "don't neglect" guarantee.
- **Time estimates:** about 1.5–3 minutes per page revised (measure per user and adapt).
- **Overload rule:** if due revision exceeds 80% of the budget for 3+ days, the planner **pauses new memorization automatically** and says why ("Revision first this week — 34 pages due"). This is the single most important safeguard for long-term Hifz.
- **Missed days:** no "debt" pile-up. Overdue pages are re-prioritised; the plan for today never exceeds 1.5× the normal budget.

User control: "Accept today's plan" (default), or adjust sliders for *new* / *revision*. Show the consequence ("at this pace, Juz 29 finishes in ~6 weeks").

---

## 13. Progress and Mastery Definitions

Page state is **derived** from its Ayahs' records, plus page-level test evidence. Ayahs stay the single source of truth.

| State | Definition (proposed) | Enters from |
|---|---|---|
| **Not started** | No Ayah records | — |
| **Claimed** | User marked as memorized; no evidence yet | Onboarding / mark range |
| **Learning** | New lesson done; < 3 clean page recitations on distinct days | Lesson, Relearn |
| **Learned** | ≥ 3 clean page recitations on distinct days, in Standard/Test mode; no unresolved confirmed mistakes | Learning, assessment |
| **Strong** | ≥ 5 clean distinct-day recitations **and** current interval ≥ 30 days **and** last 2 far-revision checks clean | Learned |
| **Fading** | A Learned/Strong page with a hesitant/failed check, or overdue > 2× its interval | Any learned state |
| **Relearn** | Failed recovery twice | Fading |

What counts as evidence:
- self-rated **Correct** in Standard/Test mode;
- a **confirmed-clean** live recitation;
- a teacher mark (future).

What does not count:
- meaning-quiz success;
- word-order taps;
- Guided-mode success with hints;
- unconfirmed speech-recognition "matches".

✅ Already aligned: `isMemorized()` requires a clean recall. The Strong rule in `surahStatus` (`iv ≥ 30 && successDays ≥ 5`) and the map page's `assessmentSuccesses ≥ 5 && intervalDays ≥ 30` match this table. Unify them into one function.

---

## 14. Recommended Screen and Navigation Design 🆕

Keep the ✅ six existing tabs. Re-centre **Home** on "Today".

```
Home ── Today card ─ [ ▶ Start today's plan  (≈ 25 min) ]
        │            near revision 3 pages · far revision Juz 12 p.4–9 · new ½ page
        ├─ Progress strip (30 Juz tiles, page colours on tap)
        └─ Continue reading (Mushaf)
Journey ─ Paths & collections · Assessment · Recovery · Plan settings
Mushaf ── unchanged; Ayah sheet gains "Learn this page" / "Test this page"
Recite ── live recitation (fixed range / anywhere)
Maps ──── optional library of cue sets
Profile ─ name, onboarding answers, daily time, data
```

- **One primary button per day.** "Start today's plan" runs near revision → far revision → new as a single guided session with a progress bar and a clean exit/resume at any step.
- **Notifications** (Android only, opt-in): at most **one per day** at the user-chosen time, plus nothing else. No streak-guilt messages. In-app, show at most one banner (e.g. "Revision first this week").
- **Lesson screen**: step indicator (●●●○○), big text, one primary action, "skip step" available to experienced users.

---

## 15. Reuse of Existing App Features

| Existing (✅) | Reuse in Phase 3 | Change needed |
|---|---|---|
| `store.ts` AppState, guest/account isolation, Supabase sync | Store paths, plan settings, page evidence | Add `paths`, `onboarding`, `pageEvidence`; extend `mergeGuestProgress` |
| `hifz.ts` `applyResults`, ladder intervals, `weak`, `isMemorized`, `dueRuns` | Remains the scheduling core | Add page rollups; unify Strong rule; add Claimed state |
| `Practice.tsx` | Recall/Link/Page-test step renderer | Add fade levels + chunk/page modes |
| `Audio.tsx` (repeat, range) | Listen step | Chunk-range repeat count |
| `LiveRecitation` + `recitationResults` | Optional live check in steps 5–7 and assessment | Fixed-range launch from a lesson; return outcome to the lesson |
| `layout.json` / `pageContent()` | Page and line boundaries for chunking | `chunkPage()` helper |
| Mind-maps 7-stage flow, phrase splitter | Cue layer + shared chunker | Extract `CueSet`; stop parallel mastery |
| Recovery diagnostic (memorize page) | Basis of page-sampling assessment | Page sampling instead of first 30 Ayahs |
| Goals (`goals.ts`) | Keep as user-facing targets | Derive from plan; avoid duplicate pacing logic |

Nothing here needs a rebuild. Ayah-level records, which are already in production, can express every proposed state.

---

## 16. Technical Risks and Dependencies

| Risk | Why it matters | Mitigation |
|---|---|---|
| **Word-by-word meanings** need a reviewed, licensed word-gloss dataset | None bundled today (✅ only full-Ayah translations + Tafsir Muyassar). Generated glosses would violate "no unverified interpretation". | Use an openly licensed, scholar-reviewed word-by-word dataset with provenance; until then show the full-Ayah translation only. |
| **Mutashabihat list** | Must be curated | Defer; later phase. |
| **Ayah vs page mismatch** | Ayahs span pages, so page state is a rollup | Define rollup rules once (§13); test with pages that start mid-Ayah. |
| **Store growth / sync size** | Whole state syncs as one JSON row (`user_state`) | Keep page evidence compact (counters, last dates); cap histories (already capped at 100 per Ayah). |
| **Two mastery systems** (maps vs mem) | Contradictory UI | Single mastery source (§9). |
| **Speech recognition reliability** | Noise, students reciting from memory; confirmed only on limited recordings | Keep advisory; self-rating remains the default evidence. |
| **Concurrent agents editing the same files** | Observed during this session: Codex and Claude edited `recite/page.tsx`, `store.ts`, `mushaf/page.tsx` simultaneously, and builds overwrote `.next` | Give each agent a branch, worktree or file ownership; use `NEXT_DIST_DIR` for parallel dev servers. |
| **No automated tests** | Scheduling changes can silently corrupt progress | Add unit tests for `applyResults`, rollups and the planner *before* Phase 3 changes to them. |
| **Content rights** for maps | Third-party artwork | §9 rules; original cues only. |

---

## 17. Suggested Phase 3 Implementation Milestones

Each milestone is shippable on its own.

1. **M0 — Safety net (≈2–3 days).** Unit tests for `applyResults`, `isMemorized`, `markRange`, weak queue and guest merge. A unified `masteryOf(page)` function. Write state migrations for any new fields.
2. **M1 — Pages and chunks (≈1 week).** `chunkPage()` / `chunkAyah()` utilities; page rollup states (Claimed, Learning, Learned, Strong, Fading); 604-page progress strip on Journey.
3. **M2 — Guided page lesson (≈1–2 weeks).** Lesson state machine with Listen → Read-along → Fade → Recall → Link → Page test → Connect, built from `Practice` + `Audio`, with resume. Optional live check.
4. **M3 — Daily planner (≈1 week).** Three-ring planner, manzil rotation, overload pause, a single "Start today's plan" session.
5. **M4 — Onboarding and paths (≈1 week).** Five-screen onboarding, `Path` records, collections, migrating `journey`.
6. **M5 — Assessment and recovery (≈1 week).** Page-sampling assessment, recovery ladder, Relearn handling.
7. **M6 — Cue layer (≈1 week).** `CueSet` extraction, optional cues in lesson steps, single mastery source; authoring JSON with reviewer sign-off.
8. **Later:** word-gloss dataset (once licensed), mutashabihat, teacher mode, notifications.

---

## 18. Final Recommendations

1. **Build an orchestrator, not a new scheduler.** Keep per-Ayah records as the only source of truth; add page rollups, a lesson state machine and a planner on top.
2. **Make the 15-line page the unit of teaching and progress**, chunked by Ayah and waqf boundaries, with rolling joins and a page-transition link step.
3. **Count only recitation evidence toward mastery.** Meaning quizzes, word-order taps, hinted successes and unconfirmed speech matches are practice, never promotions.
4. **Protect revision above all.** Use near revision before new, a far-revision rotation that guarantees every page is seen every K days, and an automatic pause on new memorization when revision is overloaded.
5. **Treat "previously memorized" as a claim to verify.** Fast page-sampling assessment, an honest Juz tile view, and a short recovery ladder before anything is called Strong.
6. **Keep maps optional and single-sourced.** A shared cue layer that enriches any lesson, writes through the same mastery path, and uses original, teacher-reviewed cues only.
7. **Stay simple.** One "Start today" button, at most one notification a day, no streak guilt, and expert users able to skip steps.

---

### Five most important recommendations for ChatGPT and Codex

1. **Do not create a second progress or scheduling system.** Extend `hifz.ts`/`store.ts` (Ayah records, `applyResults`, `weak`, `mw`) with derived page rollups. Retire `MindMapRec.status` as a mastery signal so maps and Hifz can never disagree.
2. **Write tests before touching scheduling.** There are none today. Cover `applyResults`, `markRange`, the weak queue, guest→account merge and the new rollups first (milestone M0); a scheduling bug silently damages a learner's Hifz record.
3. **Page-first lesson engine reusing existing components.** Implement `chunkPage()`/`chunkAyah()` from `layout.json` and waqf marks, and drive Listen → Fade → Recall → Link → Page test with `Practice`, `Audio` and (optional) `LiveRecitation`. No new reciter or recorder code.
4. **Planner rules that protect revision:** near revision first; a manzil rotation with a hard "no page unseen > 2K days"; automatic pause of new memorization when revision exceeds ~80% of the budget; "Claimed" ≠ "Strong" until verified by page-sampling assessment.
5. **Coordinate the two agents and respect content limits.** Split file ownership or use separate branches/worktrees (simultaneous edits and `.next` clobbering happened in this session). Use no word-gloss or mutashabihat data without a licensed, reviewed source; use no third-party map artwork; generate no interpretations.
