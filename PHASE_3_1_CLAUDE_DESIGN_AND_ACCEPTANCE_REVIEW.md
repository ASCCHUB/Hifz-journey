# Phase 3.1 — Personalized Hifz Journey: Independent Design & Acceptance Review

Reviewer: Claude (Anthropic) · Date: 2026-11-13 · Mode: **read-only**. This file is the only change. No source, Quran data, layout, app state or progress was modified, no packages were installed, and no scripts were run against user data.

**Evidence read:**

- Reports: `QURAN_APP_FULL_AUDIT_FOR_CHATGPT.md`, `VISUAL_MAPS_INTEGRATION_AUDIT.md`, `SMART_HIFZ_TUTOR_CLAUDE_DESIGN_REVIEW.md`, `PHASE_3_0_SAFETY_IMPLEMENTATION_REPORT.md`.
- Source: `src/lib/store.ts`, `hifz.ts`, `goals.ts`, `supabase.ts`, `components/Shell.tsx`, `app/memorize/page.tsx` (`markRange`/`markJuz` call sites), `app/profile/page.tsx` (merge and backup), `scripts/test-hifz.mjs` (test names).

**State of Codex's work at review time:** no Phase 3.1 code was found. The newest change to `store.ts` is the Phase 3.0 guest-location merge fix. Everything below labelled "Phase 3.1" is a requirement, not an observation of Codex's code.

**Legend:**

- ✅ Confirmed in current source.
- ⚠️ Confirmed **risk** in current source.
- 🆕 Proposed requirement.
- 🧪 Acceptance test.

---

## 1. Executive Summary

Phase 3.1 is mostly a **data-model** milestone dressed as a UI milestone. Onboarding screens and path pickers are easy. The hard part is recording *what a learner says they know*, *what they are learning next* and *what they prefer*, without touching the per-Ayah evidence that drives revision.

Findings that shape the design:

1. ⚠️ **"Clear" destroys real evidence today.** `markRange(d, s, a, b, false)` and `markJuz(d, j, false)` delete the `mem` and `weak` records for the range, including practice history, successes and failures. The Juz tile "Clear" button and the range "Clear these ayat" button call these (`app/memorize/page.tsx`). Any Phase 3.1 UI that lets a learner *edit or remove a declaration* must not reuse this path. → **BLOCKER for 3.1 if reused**; HIGH as an existing issue.
2. ⚠️ **Claims are indistinguishable from verified memorization.** `markRange(…, true)` creates `{iv:3, reps:0, successes:0}`, and `isMemorized()` returns `true` for `reps === 0 && !bad`. Dashboards, `memorizedCount`, `juzProgress`, `nextLesson` and `goalProgress` (which counts *any* `mem` entry) therefore treat self-reported memorization as memorized. It cannot become **Strong** without evidence (Strong needs `iv ≥ 30` and ≥ 5 success days), which is good. But "Memorized" is overstated.
3. 🆕 **A separate claim/coverage layer is required.** Declarations (whole/partial Juz, Surahs, pages, Ayah ranges, non-contiguous, overlapping) should be stored as **range records with confidence**, not as fabricated per-Ayah `mem` records. Per-Ayah `mem` must stay *evidence only*.
4. ⚠️ **Sync is whole-state, last-writer-wins on top-level `t`** (`supabase.ts` `startSync`). Two devices, or a device that was offline, can silently overwrite each other's entire state, including Hifz history. Phase 3.1 adds more user-edited fields, which makes this more likely. Do not claim conflict safety. Add the mitigations in §8.
5. ⚠️ **Guest merge ignores `settings`, `journey` and `goals`**, and merges `mem` by replacing the *whole record* when `last` is newer (`mergeGuestProgress`). That drops the other side's history and success days. Phase 3.1 must define merge rules for every new field (§7) and should improve the `mem` merge.
6. ✅ **The foundation is solid.** v1 hydration fills new optional fields safely (`hydrateState`). Guest and account data are stored separately (`…:guest` vs `…:user:<id>`), merge is explicit and repeatable with the guest copy kept, and 11 safety tests plus 10 navigation test groups exist.

**Recommendation:** implement Phase 3.1 as three additive, backward-compatible state fields: `profile`, `paths` and `claims`. Leave `mem`, `weak` and `mw` untouched except through `applyResults`. Ship with the acceptance matrix in §11 automated wherever pure logic allows.

---

## 2. Recommended Onboarding Experience 🆕

**Format:** **3 short steps plus an optional 4th**, shown once, **skippable at every step, resumable**, and fully editable later in *Profile → My Hifz settings*. A single long configurable screen is fine on desktop but overwhelming on a small Android screen. Steps with sensible defaults are better.

**Launch:**
- automatically on first open of **My Hifz Journey**, not on app launch: readers who only want the Mushaf are never interrupted;
- also from a "Set up my Hifz plan" card on Home until completed or dismissed.

| Step | Title (exact label) | Controls (exact labels) | Default | Notes |
|---|---|---|---|---|
| 1 | **"Welcome to your Hifz journey"** | Text field: **"What should we call you?"** (placeholder *"Your name (optional)"*). Choice chips under **"Where are you in your Hifz?"**: **"Just starting"** · **"I have memorized some"** · **"I memorized a lot and want to restore it"** · **"I have completed the Quran and want to keep it strong"** | Name empty; *Just starting* | Name is display-only, local unless signed in. |
| 2 | **"What have you memorized before?"** *(shown unless "Just starting")* | Juz grid 1–30; tap a Juz → sheet **"Juz 5"** with **"All of it"** / **"Part of it"** / **"None"**. *Part of it* opens **"Choose Surahs, pages or ayahs"**. Below the grid: **"Add a Surah, page range or ayah range"**. Per declaration: **"How well do you remember it?"** → **"Strong"** · **"Some mistakes"** · **"Mostly forgotten"** | Nothing selected; confidence **"Some mistakes"** | Footer text: *"This helps plan your revision. It is not a test, and nothing is marked as mastered until you recite it."* |
| 3 | **"What would you like to memorize next?"** | Radio list: **"From the beginning of the Quran (Al-Fatihah → An-Nas)"** · **"From the end (Juz 30 first, starting with the short Surahs)"** · **"Juz Amma, shortest Surahs first"** · **"Selected Surahs"** · **"Selected Juz"** · **"A custom range"** · **"My teacher gives me portions"** · **"Nothing new for now — revision only"** | Experience-based (§6) | Shows a preview line, e.g. *"You will start with An-Nas (114:1)."* |
| 4 *(optional)* | **"Your daily routine"** | **"Study time per day"** (10 / 15 / 20 / 30 / 45 / 60 min) · **"Study days"** (7 day chips) · **"New memorization per day"** (stepper: ayahs or lines) · **"Revision per day"** (stepper: pages) · **"When time is short, put first:"** **"Revision"** · **"Balanced"** · **"New memorization"** | §6 defaults | Show *"About X pages of revision and Y lines of new memorization each day."* Never a completion date (see §6). |

Buttons on every step: **"Skip for now"** (secondary) · **"Back"** · **"Continue"** (primary). Final: **"Start my journey"**.

**Resumability:** store `profile.onboarding = { step, completedAt?, dismissedAt? }`. Reopening resumes at `step`. **Editing later never resets memorization history.** Every control writes only to `profile`, `paths` or `claims`.

**Avoid:** asking for age, gender, location, teacher name or email in onboarding. Don't ask about Qira'at (assume Hafs, as the dataset is Hafs). Don't ask for goals with deadlines.

---

## 3. Learning Path Requirements 🆕

### 3.1 Model

```ts
type UnitRef =
  | { k: "surah"; s: number; a?: number; b?: number }   // whole Surah or Ayah sub-range
  | { k: "juz"; j: number }
  | { k: "pages"; from: number; to: number }             // Mushaf pages (inclusive)
  | { k: "range"; from: [number, number]; to: [number, number] }; // canonical (s,a)→(s,a)
type PathKind = "forward" | "reverse" | "ammaShortFirst" | "surahs" | "juz" | "range" | "pages" | "collection" | "teacher";
type LearningPath = { id: string; kind: PathKind; title: string; units: UnitRef[];
                      cursor: { s: number; a: number } | null; createdAt: number; updatedAt: number; archived?: boolean };
// state.paths = { list: LearningPath[]; primaryId: string | null; updatedAt: number }
```

- **A path owns only ordering and a cursor. It never owns progress.** Progress is always derived from `mem` (per Ayah).
- **Expansion:** `expandPath(path) → [s,a][]` is a **pure function**, the single source of order and unit-tested. Within every Surah, Ayahs are **always ascending**.
  - *Reverse* reverses the **order of Surahs or Juz**, never Ayahs or words. Juz 30 under reverse = An-Nas…An-Naba as Surah order; each Surah internally 1→n.
  - *Juz Amma short-first* orders Surahs 78–114 by Ayah count or word count ascending, with a stable tie-break by Surah number. Document which measure is used; word count is a better proxy for effort.
  - *Pages* expand via the existing page layout to canonical `(s,a)`. A page that **begins mid-Ayah** includes that Ayah once, owned by the page where it *starts*. A page with a **Surah transition** includes both Surahs' Ayahs in Mushaf order. A **long Ayah spanning pages** is never duplicated.
  - *Selected Surahs/Juz/collection* = the user's list in the user's order. Duplicates across units are **de-duplicated at expansion** (first occurrence wins).
- **Next item** = the first expanded Ayah where `!isEvidenceMemorized(mem[k])` (§4.4). **Claimed** Ayahs count as "not new" for path progression only if the learner chose so (see §4.5).
- **Primary path** drives the Home/Journey **"Continue"** action. Other paths are browsable and startable manually.
- **Overlapping paths** share `mem` records by key `"s:a"`, so no duplicate Hifz records are possible by construction.
- **Archiving or deleting a path** removes only the `LearningPath` object. 🧪 It must leave `mem`, `weak`, `mw`, `claims` and history unchanged.
- **Manual learning stays independent:** Mushaf → Ayah sheet → "Practise" and the existing "custom passage" flow continue to work without any path.

### 3.2 Compatibility with ✅ existing `journey`

`journey.start/end/last/lastEnd` already acts as a custom range plus cursor. Migrate it lazily and non-destructively:

- On first load with no `paths`, create one `range` path from `journey.start→end`, with cursor = `journey.last`, as primary.
- **Keep the `journey` fields** (do not delete them) so that older app builds, and backups restored into older builds, still work.
- Keep `studyMinutes` and `learningDays` where they are, or mirror them into `profile.daily` with a single owner (§5). Do not keep two writable copies.

### 3.3 Edge cases (all need tests, §11)

Surah spanning many pages (Al-Baqarah) · page with two Surah headers (e.g. pages in Juz 30) · page starting mid-Ayah · Ayah spanning a page break · Al-Fatihah special first page · partially memorized range inside a path (skip evidence-memorized Ayahs, keep order) · path whose every Ayah is memorized ("Path complete" state, not an error) · reverse path across a Juz boundary · selected Juz plus an overlapping selected Surah in one collection.

---

## 4. Previously Memorized Quran — Data Design 🆕 (most important)

### 4.1 Is `markRange()` safe for onboarding declarations? **No.**

| Problem | Evidence | Consequence |
|---|---|---|
| Creates synthetic `mem` records | `markRange(on=true)` → `{iv:3, due:…, last:0, reps:0, …}` | A declaration is stored as if it were evidence. It schedules SRS for 600+ Ayahs per Juz immediately. |
| Claim = memorized everywhere | `isMemorized()` → `true` for `reps===0 && !bad`; `goalProgress` counts any `mem` | Stats and goals overstate verified Hifz. |
| No confidence | Single state only | "Mostly forgotten" Juz 5 is treated the same as "Strong" Juz 1. |
| Removal is destructive | `markRange(on=false)` deletes `mem` **and** `weak` | Editing a declaration can erase real history. |
| Range unit = one Surah | Signature `(s, a, b)` | Pages and cross-Surah ranges need loops; partial Juz is error-prone. |

Phase 3.0 tests confirm that overlapping `markRange(true)` calls *preserve* existing records, because they only create missing ones. That is good, but it doesn't solve the problems above.

### 4.2 Proposed claim model

```ts
type Claim = {
  id: string;                         // uuid; stable across devices
  unit: UnitRef;                      // juz | surah(+range) | pages | range
  confidence: "strong" | "some" | "forgotten";
  createdAt: number; updatedAt: number;
  deleted?: true;                     // tombstone, needed for merge/sync (§7)
  source: "onboarding" | "profile" | "teacher";
};
// state.claims = { items: Claim[]; updatedAt: number }
```

- **Overlaps are allowed and resolved on read.** Expand all non-deleted claims to Ayah keys. For each Ayah, the **effective claim confidence = the most recent** `updatedAt` among the claims covering it. Never merge claims into one mega-range on write; learners edit what they entered.
- **Non-contiguous regions** = multiple claims. The example learner (Juz 1–4, part of Juz 5, Juz 29–30) is 4 juz claims + N surah/range claims for Juz 5 + 2 juz claims.
- **Partial Juz** = a `range`, `surah` sub-range or `pages` claim. No requirement to claim the whole Juz.
- **Display:** a separate, visually distinct layer in the Juz/page grid (§9.3).

### 4.3 Claims never become evidence

- 🆕 A claim **must not** create or modify `mem`, `weak`, `mw`, `hist`, `log` or `rsus`.
- 🆕 A claim **must not** count toward "Strong", streaks, daily logs, goals of type `memorize`/`revise`, or recitation history.
- 🆕 Claims feed **planning only** (Phase 3.2+): they let the planner schedule *verification checks* and decide what is "not new".

### 4.4 Evidence contract (shared with the future tutor)

Define one function and use it everywhere: dashboards, goals, `nextLesson`, path progression and Juz tiles.

```
coverage(s,a) =
  "evidence-strong"   if mem rec is Strong (current rule: iv ≥ 30 && successDays ≥ 5 && !bad)
  "evidence-learned"  if mem rec has successes > 0 && !bad
  "evidence-weak"     if mem rec has bad || weak[key]
  "legacy-known"      if mem rec exists with reps === 0 && !bad  (pre-3.1 markRange records; treat as a claim)
  "claimed-<conf>"    if no mem rec but an effective claim exists
  "none"
```

- **Legacy records:** existing users' `markRange` records (`reps===0`) are displayed as **"Claimed (from earlier)"**, not as verified, and are **never deleted** by migration. No data rewrite is needed. Just change how they are *classified*.
- `isMemorized()` should keep its current behaviour for SRS and backward compatibility. Add a **new** `isVerified()` for dashboards and goals, and use it in new UI. Changing `isMemorized` semantics would silently shift existing users' schedules (HIGH risk).

### 4.5 How claims interact with paths

Path option, asked once when a path overlaps claimed material: **"Skip what I already know?"** → **"Yes, skip claimed portions"** (default for *restore* and *completed* learners) / **"No, include them as new"**. Skipped claimed Ayahs are later offered as *verification* by the planner (Phase 3.2), not silently treated as learned.

### 4.6 Future assessment hook

Store nothing extra now. Phase 3.2/3.5 page-sampling assessment writes **evidence through `applyResults`**. The claim stays as historical context; its UI badge changes because coverage now resolves to evidence.

---

## 5. Profile and Preferences 🆕

```ts
type Profile = {
  name?: string;                      // display only
  experience?: "new" | "some" | "restore" | "complete";
  onboarding: { step: number; completedAt?: number; dismissedAt?: number };
  daily: { minutes: number; days: number[]; newPerDay: { unit: "ayah" | "line"; n: number };
           revisionPagesPerDay: number; priority: "revision" | "balanced" | "new" };
  updatedAt: number;                  // per-section timestamp for merge
};
```

- **Single owner rule:** today `settings.newTarget`, `settings.revTarget`, `journey.studyMinutes` and `journey.learningDays` already hold overlapping preferences ✅. Choose **one** writable home (recommend `profile.daily`) and derive the legacy fields from it on write, so older code paths keep working. Never keep two independently editable copies.
- **Name:** trim, length ≤ 40, render as text only (no HTML). Show it in the Home greeting.
- **Experience** changes defaults only; it never changes evidence.

---

## 6. Daily Learning Preferences — recommended defaults 🆕

Adjustable starting points, shown as *"Recommended for you"*, with no rigid rules and **no completion dates**. If a projection is shown at all, phrase it as *"At this pace, about N weeks per Juz"*, with the caveat *"Actual progress depends on revision."*

| Persona | Study time | New per day | Revision per day | Days | Priority |
|---|---|---|---|---|---|
| Beginner ("Just starting") | 15 min | 3 lines (≈ 2–3 short Ayahs) | Everything learned so far, up to 2 pages | 5 | Balanced |
| Steady student ("some") | 30 min | ½ page (≈ 7 lines) | 5 pages (≈ ¼ Juz) | 6 | Revision |
| Returning ("restore") | 30 min | 0 (until verified portions stabilise) | 10 pages, oldest/forgotten first | 6 | Revision |
| Experienced Hafiz ("complete") | 45 min | 0 | 1 Juz (20 pages) | 7 | Revision |

Notes:
- Lines are a better unit than Ayahs for new memorization, because Ayah lengths vary a hundredfold. Pages are better for revision.
- A **"Revision first" default for everyone except beginners** is the single most protective setting for long-term Hifz.
- Phase 3.1 stores the preferences only. It must not yet change what `nextLesson`/`dueRuns` return. That is Phase 3.2 planner scope.

---

## 7. Existing Hifz Compatibility

| Area | Current behaviour ✅ | Phase 3.1 requirement 🆕 |
|---|---|---|
| `mem` | Per-Ayah SRS record; created by `applyResults` (`new`/`assessment`) or `markRange` | Untouched by onboarding/paths. Only `applyResults` writes evidence. |
| `weak`, `mw`, `rsus` | Evidence-driven | Untouched. |
| `isMemorized` | `reps===0 && !bad` → true | Keep; add `isVerified` / `coverage()` for UI. |
| `nextLesson` | Forward 1→114 only; prefers the "learning" Surah | Keep as the fallback when no primary path exists; path-aware *Continue* uses `expandPath` + coverage. |
| `goalProgress` | Counts any `mem` entry | Switch counts to `isVerified` **in a separate, tested change**, or label goal progress "includes claimed". Don't silently change. |
| Juz tiles "Mark memorized / Clear" | `markJuz(±)` | **Replace with claim UI.** "Remove" must delete a *claim*, never `mem`. If a destructive "Reset evidence for this range" is ever needed, put it behind a typed confirmation in Profile → Data. |
| Visual Maps `mapProgress` | Separate map-level state | Unchanged in 3.1 (single-mastery work is Phase 3.4). |

---

## 8. Guest/Account Merge Rules 🆕 (and fixes to existing ones)

The merge stays **explicit, repeatable and idempotent**, with the guest copy kept ✅. Rules per field:

| Field | Rule | Idempotent? |
|---|---|---|
| `profile.name` | Keep **account** value if non-empty; else take guest. Never concatenate. | Yes |
| `profile.experience` | Account wins if set; else guest. | Yes |
| `profile.daily` | Section-level: newer `profile.updatedAt` wins **as a whole section**. Do not mix days from one side with minutes from the other. | Yes |
| `profile.onboarding` | `completedAt` = earliest non-null; `step` = max. | Yes |
| `paths.list` | **Union by `id`**; same id → newer `updatedAt`. Paths are never deleted by merge. | Yes |
| `paths.primaryId` | Account's if it exists in the union; else guest's. Never null if any path exists. | Yes |
| Path `cursor` | Per path (same id): newer `updatedAt` wins. For the *migrated legacy journey path*, use deterministic ids (`legacy-journey`) so guest and account copies collide and resolve instead of duplicating. | Yes |
| `claims.items` | **Union by `id`**; same id → newer `updatedAt`; **tombstones win if newer**. | Yes |
| `mem` (existing, **improve**) | Today: whole record replaced if `last` newer. **Recommend:** merge history arrays by `at` (de-dupe), recompute `successes`/`failures` from the merged history when available, keep the later schedule fields. At minimum, never replace an evidence record (`reps>0`) with a claim-like record (`reps===0`). | Must be |
| `weak` (existing) | Today: smaller `c` wins (no timestamp). Recommend: newer `d` wins; ties → smaller `c`. | Yes |
| `settings`, `goals` (existing gap) | Account wins (explicit). Goals: union by `id`. | Yes |

🧪 **Repeated merge:** merging the same guest state twice must produce a byte-identical result after the first merge, ignoring `t`.

---

## 9. Supabase and Offline Safety

✅ **Current mechanism.**
- **Push:** debounced 2 s upsert of the *entire* `AppState` to `user_state`.
- **Startup:** pull; if `remote.t > local.t`, replace local entirely, else push local.
- **Session start/stop:** `Shell.tsx`/`setProfile` switch the local key per user.

⚠️ **Risks (not solved by Phase 3.1; must not be made worse):**

1. **Two devices:** A edits offline (t=100); B edits online later (t=200); A comes online. A pulls B's newer state and **replaces A's local state**, so A's offline practice is lost.
2. **Clock skew:** `t = Date.now()` per device. A fast clock can win forever.
3. **Mid-session overwrite:** while signed in, a remote change from another device is not pulled until the next `startSync`. The next push from this device overwrites the other device's work.
4. **Backup restore** ✅ is a full replacement (`replaceState`, then `update` bumps `t`). After a restore, the next sync **pushes the restored state over the cloud copy**, which is intended but irreversible.

🆕 **Minimum safe measures for Phase 3.1** (no server change required):

- **Merge instead of replace on pull.** When remote and local differ, run the same deterministic field-level merge as guest→account (§8), not "newer `t` wins". This is the most valuable fix and reuses the merge code.
- **Keep a local "before-sync" snapshot** (last 3, capped) so a bad overwrite can be undone from Profile → Data.
- **Per-section `updatedAt`** on `profile`, `paths` and `claims` (shown above), so merges don't depend on the top-level `t`.
- **Backup restore:** show *"This replaces progress on this device and in your account. A copy of the current progress will be kept."* and keep that copy.
- **Hydration:** `hydrateState` must default `profile`, `paths` and `claims` when missing or malformed (same pattern as Phase 3.0). Keep `v: 1`. Adding optional fields needs no version bump. Older builds ignore unknown fields, and the existing `...source` spread preserves them on save.
- **Do not** claim "conflict-free sync" anywhere in UI or reports.

---

## 10. UX and Navigation Recommendations 🆕

- **No new bottom tab.** ✅ Six destinations already exist; mobile space is full. "My Hifz Journey" (`/memorize`) is the home of paths, claims and plan settings.
- **Home:**
  - one **Continue** card, *"Continue: Al-Mulk 67:12 · your main path"*, which opens the next items of the primary path in the existing Practice/lesson flow;
  - a secondary **"Set up my Hifz plan"** card until onboarding is complete or dismissed.
- **Journey page order:**
  1. Continue.
  2. Due revision.
  3. Weak ayahs.
  4. **"My paths"** (list, ★ primary, "Make main path", "Archive").
  5. **"What I've memorized"** (claims and evidence grid).
  6. **"My daily routine"**.
  7. Existing custom-range, recovery and map links.
- **Switching paths:** a ★ toggle on each path card, with confirmation text *"Continue will now follow this path. Your progress is kept."*
- **Manual page learning:** unchanged and always available. Mushaf → long-press or tap an Ayah → sheet → **"Practise this ayah"** / 🆕 **"Practise this page"**.
- **Microphone:** no Phase 3.1 screen may open the microphone. Live recitation remains user-initiated on Recite only.

### 10.3 Claimed vs verified display

In the Juz/page grid, use **two separate channels** so colour alone never carries the meaning:

- **Fill = evidence** (from `coverage()`): none / learning / learned / strong / weak.
- **Outline or pattern = claim:** dashed outline + small "≈" badge for *claimed, not yet checked*.
- **Legend text:** *"Dashed = you told us you know this. Solid = you've recited it here."*
- **Counts are always split:** *"Recited here: 312 ayahs · Said known: 1,140 ayahs."* Never one combined "Memorized" number.

---

## 11. Accessibility and Arabic RTL 🆕

- **Language direction:**
  - UI chrome stays LTR (current app);
  - every Quran string or Arabic Surah name uses `dir="rtl"` and the Quran font class;
  - mixed lines (e.g. *"An-Nas · الناس"*) isolate the Arabic with `<bdi>` or a `dir` span.
- **Path previews show the Ayah reference in both forms:** "114:1" (LTR) plus the Arabic name.
- **Touch and screen size:**
  - all chips and steppers ≥ 44 px touch targets (✅ `.btn` min-height 44 px);
  - the Juz grid becomes 5 columns at ≤ 380 px width;
  - claim sheets are full-height bottom sheets, scrollable, with the primary button sticky above the bottom nav.
- **Screen readers:**
  - grid tiles get `aria-label` such as *"Juz 5: 40 ayahs recited, 120 said known, needs checking"*;
  - stepper values are announced;
  - onboarding steps use `aria-current="step"`.
- **Never use colour alone** (see §10.3). Keep focus-visible outlines.
- **Name field:** `autocomplete="nickname"`, `maxLength` 40, accept Arabic and Urdu names (no Latin-only validation).

---

## 12. Detailed Acceptance Test Matrix 🧪

**A** = automatable with the existing `node:test` harness (`scripts/test-hifz.mjs`, pure logic and in-memory storage). **B** = browser test (Playwright/puppeteer or manual). **D** = Android device or WebView.

### Profile

| # | Test | Pass criteria | Type |
|---|---|---|---|
| P1 | New profile | Fresh state → onboarding offered on first Journey visit only; Home unaffected | B |
| P2 | Skip | "Skip for now" at step 1 → `dismissedAt` set; Journey usable; Home shows "Set up my Hifz plan" | A+B |
| P3 | Resume | Close at step 3 → reopen resumes step 3 with entered values | A+B |
| P4 | Edit later | Change experience/name/daily → `mem/weak/mw/hist/log` deep-equal before/after | **A** |
| P5 | Existing user | Load a real v1 save without `profile/paths/claims` → hydrates; all prior records deep-equal; legacy journey becomes one primary path; `journey` fields still present | **A** |
| P6 | Name safety | `<b>x</b>`, 300-char, Arabic name → rendered as text, trimmed to 40 | A+B |

### Learning paths

| # | Test | Pass criteria | Type |
|---|---|---|---|
| L1 | Forward | `expandPath(forward)` starts 1:1, ends 114:6, 6,236 unique Ayahs, ascending | **A** |
| L2 | Reverse | Surah order 114→1; **within every Surah, Ayahs ascending**; 6,236 unique | **A** |
| L3 | Juz Amma short-first | Only Surahs 78–114; order by the documented size measure; each Surah ascending | **A** |
| L4 | Selected Surahs | User order preserved; duplicates removed | **A** |
| L5 | Selected Juz | Juz boundaries match `juz.json`; mid-Surah Juz starts honoured | **A** |
| L6 | Ayah range | Cross-Surah range inclusive both ends | **A** |
| L7 | Page range | Pages 1–2, 49–50 (mid-Ayah start), pages with two Surah headers, last page 604 → every Ayah exactly once, Mushaf order | **A** |
| L8 | Overlapping paths | Two paths covering 2:1–10 → practising via either updates the single `mem["2:5"]` | **A** |
| L9 | Switch primary | Continue target changes; no record changes | **A**+B |
| L10 | Delete/archive path | `mem/weak/mw/claims/hist` deep-equal before/after | **A** |
| L11 | Partially memorized range | Path skips evidence-learned Ayahs, keeps order, cursor correct | **A** |
| L12 | Path complete | All Ayahs learned → "Path complete" state, no crash | A+B |
| L13 | Manual learning | Mushaf Ayah practice works with zero paths | B |

### Previously memorized (claims)

| # | Test | Pass criteria | Type |
|---|---|---|---|
| C1 | Whole Juz | Claim Juz 1 → 0 `mem` records created; coverage shows claimed for all Juz 1 Ayahs | **A** |
| C2 | Partial Juz | Claim 4:1–4:23 inside Juz 5 → only those Ayahs claimed; rest of Juz 5 `none` | **A** |
| C3 | Non-contiguous | Example learner (Juz 1–4, part of 5, 29–30) → exact Ayah set; counts correct | **A** |
| C4 | Overlap | Juz 30 "strong" + Surah 78 "forgotten" (newer) → 78 = forgotten, rest = strong | **A** |
| C5 | Remove claim | Delete claim → tombstone; `mem/weak` untouched (incl. an Ayah with real history) | **A** |
| C6 | Claim ≠ evidence | Claimed Ayahs: `isVerified` false; not Strong; not counted in streak/log/goal memorize counts; no `hist` entry | **A** |
| C7 | History preserved | Ayah with 5 success days, then claimed "forgotten" → `mem` record deep-equal | **A** |
| C8 | Legacy markRange records | Pre-3.1 `reps:0` records display as "Claimed (earlier)", not verified; not deleted | **A**+B |
| C9 | Old "Clear" path | No 3.1 UI calls `markRange(…, false)`/`markJuz(…, false)` (grep/test) | **A** |

### Persistence and sync

| # | Test | Pass criteria | Type |
|---|---|---|---|
| S1 | Offline restart | Complete onboarding offline, reload → all values persist | B/D |
| S2 | Guest → account | Guest claims/paths/profile merged per §8; account values kept where specified | **A** |
| S3 | Repeated merge | Merge twice → identical state (ignoring `t`) | **A** |
| S4 | v1 save | See P5 | **A** |
| S5 | Backup/restore | Export → import into fresh state → `profile/paths/claims/mem` deep-equal; pre-restore copy kept | **A**+B |
| S6 | Old backup into new app | Pre-3.1 backup restores; hydration fills new fields | **A** |
| S7 | New backup into old build | Unknown fields ignored, not crash (manual with older build) | B |
| S8 | Two-device conflict | Simulate local `t=100` with new claim + remote `t=200` with new path → after pull both exist (requires §9 merge-on-pull); **if not implemented, document as known risk and do not mark passed** | **A** (pure merge) + B (live Supabase) |
| S9 | Clock skew | Remote `t` in future → local offline evidence not discarded (with merge-on-pull) | **A** |
| S10 | Sign-out | Account state not visible in guest; guest unchanged | B |

### Navigation

| # | Test | Pass criteria | Type |
|---|---|---|---|
| N1 | Resume Surah/Ayah | Continue opens the exact next `(s,a)` of the primary path | **A** (target) + B |
| N2 | Resume page | Reading Continue still uses `lastLocation`/`lastPage` (unchanged) | B |
| N3 | Manual page navigation | Existing navigation tests still 10/10 | **A** |
| N4 | No mic activation | Visiting onboarding/Journey/Profile never calls `getUserMedia` (spy in browser test) | B |
| N5 | RTL | Arabic names render RTL; mixed lines isolated | B |
| N6 | Small screen | 360×740: no horizontal scroll; buttons reachable above bottom nav | B/D |

Regression gates: `npm run test:hifz`, `npm run test:navigation`, `npx tsc --noEmit`, the static export build, and `validate:quran` (expect the two known differences, exit 2) must all pass unchanged.

---

## 13. Blockers and High-Risk Findings

| Severity | Finding | Status / required action |
|---|---|---|
| **BLOCKER** | Onboarding/claims implemented via `markRange`/`markJuz` (synthetic `mem` records) | Must use a separate `claims` layer (§4). Verify with C1, C6, C9. |
| **BLOCKER** | Any 3.1 "remove/edit what I memorized" action that calls `markRange(…, false)` / `markJuz(…, false)` | Deletes real `mem` + `weak` history. Must delete claims only (C5, C7). |
| **BLOCKER** | Reverse path that reverses Ayahs within a Surah | `expandPath` tests L2, L3 must pass. |
| **HIGH** (existing) | Juz tile "Clear" and range "Clear these ayat" buttons already delete evidence | Replace or guard in 3.1 since the claim UI replaces these controls. At minimum add a confirm stating history will be deleted. |
| **HIGH** (existing) | `isMemorized` counts claims; `goalProgress` counts any `mem` | Add `isVerified`/`coverage`; label or adjust counts; never merge claimed and verified numbers in UI. |
| **HIGH** (existing) | Whole-state, newer-`t`-wins sync can discard a device's offline work | Implement merge-on-pull (§9), or ship with explicit known-risk documentation. S8/S9 must not be reported as passing without it. |
| **HIGH** (existing) | Guest merge replaces whole `mem` records by `last`; ignores settings/journey/goals | Implement §8 rules; tests S2, S3. |
| **HIGH** | Two writable copies of daily preferences (`settings.*Target`, `journey.studyMinutes/learningDays`, new `profile.daily`) | Single owner + derived legacy fields (§5). |
| MEDIUM | Legacy `journey` migration creating duplicate paths on each device | Deterministic id `legacy-journey`. |
| MEDIUM | Page-range expansion around mid-Ayah page starts and Surah headers | Test L7. |
| MEDIUM | Onboarding interrupting readers | Launch from Journey only. |
| MEDIUM | Codex and Claude editing the same files concurrently (observed earlier: `.next` clobbered, simultaneous edits to `store.ts`/`recite/page.tsx`) | One agent per file set; separate dist dirs. |
| LOW | Short-first ordering metric ambiguity | Document the metric. |
| LOW | Name length/charset | §11. |
| LOW | Projection wording | No dates (§6). |

No risk above is declared resolved. Each needs the listed test evidence.

---

## 14. Suggested Improvements to Codex's Implementation Plan

Order matters: **data and tests first, UI second.**

1. **3.1a — Pure modules + tests (no UI).**
   - `lib/paths.ts`: `expandPath`, `nextInPath`, `unitToAyahs` (reusing the existing resolver and `pageContent`).
   - `lib/claims.ts`: `effectiveClaims`, `coverage`, `isVerified`.
   - Merge functions for `profile/paths/claims`.
   - Hydration defaults.
   - Tests L1–L11, C1–C9, P4–P5, S2–S6, S8–S9 (pure merge).
2. **3.1b — Migration.** Lazy legacy-journey → `legacy-journey` primary path; leave `journey` intact. Classify legacy `reps:0` records as claimed. Tests P5, C8.
3. **3.1c — Onboarding UI** (4 steps, skippable and resumable) writing only `profile/paths/claims`. Browser tests P1–P3, N4–N6.
4. **3.1d — Journey UI.** Paths list, primary toggle, claims grid with the two-channel display; replace the destructive Juz "Clear" with claim removal. Tests L9, L12–L13, C5.
5. **3.1e — Sync hardening.** Merge-on-pull reusing the §8 merge; local pre-sync snapshots; restore copy. Tests S8–S10. If deferred, document it as a known risk in the 3.1 report.
6. **Out of scope for 3.1:** the planner that *acts* on daily preferences, verification assessments, lesson engine, map unification.

The 3.1 implementation report should include before/after deep-equality evidence for `mem/weak/mw` in every test that touches profile, paths or claims.

---

## 15. Final Recommendations for ChatGPT and Codex

1. **Store declarations as claims, not as Hifz records.** Add `claims` (range + confidence + tombstone) and never call `markRange`/`markJuz` from onboarding or profile. Per-Ayah `mem` is evidence written only by `applyResults`.
2. **Never delete evidence from a "remove" action.** Removing or editing a claim or path deletes only that claim or path. Fix or guard the existing Juz "Clear" button, which deletes `mem` and `weak` today.
3. **Make paths pure orderings.** Implement `expandPath` as one tested pure function, with ascending Ayahs inside every Surah for all path kinds including reverse and short-first. Paths share `mem` by key, so overlaps cannot duplicate progress.
4. **Separate claimed from verified everywhere.** Add `coverage()`/`isVerified()` and show two channels (fill = evidence, dashed = claimed) with split counts. Keep `isMemorized` unchanged for SRS compatibility.
5. **Write merge rules before UI, and stop whole-state overwrites.** Section-level `updatedAt` plus union-by-id with tombstones for `paths`/`claims`, explicit rules for `profile`, and the same merge on Supabase pull instead of "newer `t` replaces everything". Until merge-on-pull exists, document two-device sync as a known data-loss risk.
