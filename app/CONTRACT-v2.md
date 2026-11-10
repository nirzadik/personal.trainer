# Contract v2 addendum: swap, adaptive planning, exercise feedback, wellness

This adds to CONTRACT.md, which still applies. Four agents work in parallel. Stick to your owned files. Where two agents share a file, make **targeted Edits only** and never rewrite the whole file.

## Shared data changes
- `Session.strength[].feedback`: `"easy" | "fine" | "hard" | null`. This is how the exercise felt overall; it's optional.
- `Session.reviewedAt`: an ISO timestamp, or null. It's set when the coach finishes a post-workout review.
- New doc `data/users/<uid>/wellness`: `{ entries: [ WellnessEntry ] }`, capped at 400 entries, one per date (merged), newest last.
  - `WellnessEntry = { date, trainingReadiness /* 0-100 */, sleepScore /* 0-100 */, sleepHours, hrvStatus /* "balanced" | "unbalanced" | "low" | "poor" | null */, hrvMs, bodyBattery /* 0-100 */, restingHr, stress /* 0-100 */, notes, source: "manual" | "garmin" }`, with unknown fields null.

## Shared interfaces
- **store.js (owner S)**
  - `store.plans.update(planId, patch)` resolves `{ plan, undo }`. Top-level fields are replaced; `workouts` is replaced as a whole array. It works on draft and agreed plans and sets `updatedAt`.
  - `store.wellness.add(entry)` resolves `{ entry, undo }`. It merges into an existing entry with the same date.
  - `store.wellness.list({ from, to })` returns entries oldest first.
  - `store.wellness.subscribe(cb)`.
- **src/swap.js (owner S, new, pure)**
  - `swapOptions(item, { profile, plan, core, catalog, limit = 8 })` returns `[{ exerciseId, name, reason, equipmentOk }]`. It ranks the item's own `alternatives` first, then `core.findSubstitutes`, then catalog search on the same pattern; everything is filtered by equipment.
  - `applySwap(plan, workoutId, itemIndex, newExerciseId, { catalog })` returns a new plan with the item's exerciseId and name replaced. It keeps sets, reps and RIR, sets `loadKg` to null (recalibrate), and puts the old id first in `alternatives`. `itemIndex` is the flat index over the workout's strength **and** conditioning items, in block order.
- **src/progress.js (owner P, new, pure)**
  - `progressionDigest({ sessions, plans, wellness, profile, today, weeks = 2 })` returns a compact object (≤ 6 KB JSON). It covers the last week vs plan: done, missed or skipped; per exercise the last loads, reps and RIR, feedback, the core `nextTarget` and an e1RM trend; run volume and paces vs plan; conditioning results; pain; readiness and wellness trends. It ends with explicit `adjustments` hints: progress, hold, deload, swap, reduce volume.
- **core.js (owner F)**
  - `nextTarget` also considers the last exposure's `feedback`: "easy" means progress as normal (or add the increment even if the top of the range is missed by 1 rep), "hard" means hold the load, "hard" twice in a row means a −5-10% load, and "hard" plus pain means use the pain protocol. Add tests.

## File ownership
- **S (swap):** `src/ui/plan.js`, `src/store.js`, `src/swap.js`, `tests/store.test.mjs`, `tests/swap.test.mjs`.
- **P (adaptive planning):** `src/progress.js`, `src/prompts/plan.js`, `src/knowledge/plan.js`, the `generatePlan` / `reviseDraft` code paths in `src/brain.js` (targeted edits only), `tests/progress.test.mjs`, `docs/research/08-adaptive-planning.md`.
- **F (feedback + post-workout review + wellness logging):** `src/core.js`, `tests/core.test.mjs`, `src/ui/quicklog.js`, `src/ui/history.js`, `src/ui/chat.js`, `src/prompts/{tools,chat,context,util}.js`, `src/knowledge/chat.js`, `src/brain.js` (everything except generatePlan / reviseDraft; targeted edits only), `tests/brain.test.mjs`, `src/sample-mock.js`.
- **G (Garmin research):** `docs/research/09-garmin.md` only.
- `src/ui/styles.css` is shared: append your own delimited section only (`/* v2: <agent> */`). `src/ui/app.js`, `settings.js` and `components.js` are owned by F, if needed.

Don't commit. Run `cd app && npm test` and `npm run build`; both must pass at the end.

## Integration notes (as built)
- The chat offers **10 tools**: the 8 from v1, plus `update_plan_workout` and `log_wellness`. The count is still capped by `limits().tools.maxCount`, and `log_session` is never dropped.
- `Session.conditioning[].feedback` exists as well (same enum).
- `Plan.changeLog[]` records coach changes to the agreed plan, so Undo still works after a reload. `Plan.items[].swappedFrom` marks owner swaps.
- `knowledge.REVIEW_RULES` drives `coach.reviewWorkout(sessionId)`. It runs after a Plan quick-log save (that tap is the user action) and can be turned off under Settings → "Review after each workout".

## Review addendum (2026-11 architecture review)
See `docs/reviews/2026-11-architecture-review.md`. Contract changes it made:
- **AppState** defaults now include `lastPlanError: null` and `settings.reviewAfterWorkout: true`.
- **Session** defaults include `reviewedAt: null`. **Read-side migration:** `store.sessions.get/list/subscribe` and `store.plans.get/getAgreed/getDraft/list/subscribe` fill missing top-level fields (Session §4 defaults; Plan `changeLog: []`, `notes`, `validation`, `weeklyTargets`, `approvedAt`). Stored documents are never rewritten on load; `exportAll()` stays raw.
- `store.importAll` restores the previous data when a write fails part-way; the rejection carries `rolledBack`.
- **core.js:** `unmarkWorkoutDone(state, plan, workoutId)` (inverse of `markWorkoutDone`; removes the id from the current rotation), `injuryTags(profile)` / `INJURY_STRESS_MAP` (single source, used by swap.js), `RUN_LIMITS.weeklyStartKm = 8` (RUN_RAMP floor for a first running week).
- **Rotation rule:** a session logged against a planned workout advances the rotation whatever its status: done, partial, or `missed` (= skip). A missed day without `workoutId` shifts nothing. Chat (`log_session`) and the Plan tab now agree.
- **log_session** refuses future dates and exact duplicates (same date, type, status and content); PRs compare with sessions up to the session's date.
- **Plan weekStart:** this week, or next week when the agreed plan already covers this week or later; never further ahead (`brain.planWeekStart`). A JSON reply with no workouts rejects `invalid_json` instead of saving an empty draft.
- **progressionDigest:** `week.inProgress` / `week.expected` when the plan week is still running; completion, run and conditioning decisions are judged against what is due so far.
- **Coach memory:** prompts take notes through `prompts/util.selectNotes` (newest 8 each of injury / preference / goal, newest 12 others, de-duplicated, byte-budgeted) instead of "the last 20". `coach.rememberChat({ signal })` folds unsummarized chat into `CoachMemory.summary` (one quick call, from a tap). `update_profile` with a new `weightKg` also appends to `body`.
- **env.js:** mocks start only on a dev host (`isDevHost`: localhost, file:, `?mock`, or Node). Elsewhere a missing `window.claude` yields a live runtime with all three problems.
