# Architecture, project-design and logic review (2026-11)

Scope: `src/{core,catalog,brain,store,store-mock,env,progress,swap,sample-mock}.js`, `src/prompts/**`, `tests/**`, `tools/**`, the contracts and READMEs. UI (`src/ui/**`) and knowledge text were read but not edited; what they need is listed in section 3.

State after the review: `npm test` 244 passing (20 new, in `tests/review-2026-11.test.mjs`), `npm run build` green (868 KB unminified).

Severity: **P0** loses or corrupts the owner's data, **P1** gives wrong coaching output or breaks a common flow, **P2** is maintainability or a rare edge.

## 1. Findings

### P0

| # | Finding | Status |
|---|---|---|
| 0.1 | **Mock mode could start on a real host.** `env.getRuntime` started the simulated coach and a localStorage database whenever `window.claude` was missing, on any host. A saved or re-hosted copy of the published page would accept workouts into browser-only storage, with only a small "Dev" tag to tell the owner. | Fixed |
| 0.2 | **A failed import left mixed data.** `store.importAll` writes about one document per session; a failure part-way left some old and some new documents and offered no undo (undo exists only on success). | Fixed |

### P1: logic

| # | Finding | Status |
|---|---|---|
| 1.1 | **Mid-week digest read as a bad week.** `progressionDigest` judged a plan week against all its workouts even while it was running. After Monday's first workout of four (the post-workout review always runs mid-week) it reported 25 % completion: week "repeat, no increases", runs "rebuild from completed km", untrained lifts "not trained last week". The same happened when "Generate next week" was tapped before the week ended. | Fixed |
| 1.2 | **Plan week ran away into the future.** A new plan's `weekStart` was `agreed.weekStart + 7` whenever the agreed plan was current or later. Generating and approving early twice gave a plan dated two or more weeks ahead. | Fixed |
| 1.3 | **A runner's first plan was capped at 0 km.** The prompt's run caps came only from logged runs. With none logged it said "weekly total ≤ 3 km; any single run ≤ 0 km", while the validator used the profile baseline (for example 20 km/week). Prompt and validator disagreed on the owner's very first plan. | Fixed |
| 1.4 | **A lifter starting to run was capped at 3 km/week.** With sessions logged but no runs, `validatePlan` used base 0, so RUN_RAMP rejected any week over 3 km and the repair call forced it down. Three short run/walk sessions already exceed that. | Fixed (8 km first-week floor) |
| 1.5 | **Undo of a logged session rolled back later logs.** The chat's log undo restored a snapshot of `rotation.done`. Log W1, log W2, undo W1: W2 dropped out of the rotation although its session still existed. | Fixed |
| 1.6 | **Chat and Plan tab disagreed on a skip.** The Plan tab's Skip (a `missed` session with a `workoutId`) advances the rotation. The same thing logged through chat did not, but the workout still counted as "locked", so it stayed "Up next" and could no longer be changed. | Fixed |
| 1.7 | **Double logging after a failed reply.** If a reply failed after `log_session` had run, Retry sent the message again and nothing but a prompt sentence stopped a second log. A wrong year in `date` was also accepted. | Fixed (duplicates and future dates refused) |
| 1.8 | **Empty plan saved as a draft.** A JSON reply with no workouts (wrong shape) went through validation, a repair attempt and was then saved as an empty draft. | Fixed |
| 1.9 | **Weekly sets per muscle understated for new owners.** `trainingSummary.setsPerMuscleWk` always divided by 4 weeks; in the first week the coach saw a quarter of the real volume. Adherence was already prorated. | Fixed |
| 1.10 | **PRs of a back-dated session** were compared with later, stronger sessions in `log_session` (but not in `update_session`). | Fixed |

### P1: data and memory

| # | Finding | Status |
|---|---|---|
| 1.11 | **Old documents had no guaranteed shape.** Sessions and plans were returned raw. The owner's v1 plan has no `changeLog`, v1 sessions no `reviewedAt` or feedback, and `state.lastPlanError` was not in the defaults; every reader had to guard by hand. | Fixed (read-side defaults) |
| 1.12 | **The coach forgot standing facts.** Prompts carried "the last 20 notes" of 200. After 20 small insights, an injury or preference note from months ago was never shown again. | Fixed (`selectNotes`) |
| 1.13 | **Clear chat forgot unsummarized messages.** The rolling summary only covers messages older than the last 24 and only after 40 new ones. Clearing the chat dropped everything said since. | API added (`coach.rememberChat`); UI wiring requested |

### P2 (noted; fixed where marked)

- `normalizeSession`: an unreadable duration became 0 minutes and an unreadable readiness became 1. **Fixed.**
- The injury → joint-stress map was copied into `swap.js`. **Fixed** (one export in core).
- `update_profile` with a new body weight did not feed the `body` trend, which nothing else writes. **Fixed.** The trend is still not shown to the coach or in the UI.
- `WORKOUT_COUNT` is an error, so "only two sessions this week, I'm travelling" is repaired back to `daysPerWeek`. The owner has to change the schedule first. Left as is; see roadmap.
- `nextTarget` treats all work sets of the last exposure as one group; a top set plus back-off sets at a lower load are mixed. This matches `trainer.py` and is left for parity.
- Last-writer-wins: every store write is read-modify-set of the whole document. Two devices writing the same singleton (`state`, `coach`, today's chat day) within a second can lose one change. Acceptable for one owner; `update()` for field patches would shrink the window.
- `isCutOff` reports an empty-plan reply as "cut off", so the UI offers "Try again / faster model". Harmless.
- The published page includes both mocks (about 110 KB) and is not minified. `tools/build.mjs --minify` exists but is not the default.
- `brain.js` is 1,900 lines. A split into `brain/tools.js` (tool implementations), `brain/plan.js` and `brain/chat.js` would help, but the tools close over the coach's private state, so it is a real refactor and was not done under this review's budget.
- No dead code was found in the reviewed modules; exports unused inside `src` are test surface. The History tab's old "plan mode" is in UI code (section 3).

### Checked and found sound

- **Dates:** all calendar dates are local `YYYY-MM-DD`; week maths runs on UTC midnights of pure dates, so DST cannot shift a week. Chat day documents use the local date.
- **db contract:** path parity is right everywhere; every path is under `data/users/<uid>/`; writes to one document are serialized; capped lists also trim to 250 KiB; the page holds about 6 subscriptions (limit 64). Plan documents with a full 30-entry change log stay near 100 KiB.
- **sample contract:** every call starts from a tap; nothing is retried by code; `cache: false` on chat, plan and review; no `cache` with tools; every error code maps to copy; permanent codes disable the coach for the view; Stop reaches tools through `context.signal`; `refused` drops partial text.
- **Tools:** 10 tools, all within the conservative schema subset, descriptions under 1 KB (`log_session` is at 922 bytes: little room left), results capped at 12 KB. None is redundant.
- **Backup:** export and import cover profile, coach, state (with `lastPlanError`), body, wellness, plans (with `changeLog`), sessions and chat.

## 2. Fixes made

| Finding | Change | Test |
|---|---|---|
| 0.1 | `env.isDevHost`; mocks only on localhost, `file:`, `?mock` or Node. Elsewhere: live runtime, all capabilities null, three problems | "env: the mocks only start on a dev host" |
| 0.2 | `importAll` restores the previous data on failure; rejection has `rolledBack` | "importAll: a write failure part-way…" |
| 1.1 | `week.inProgress` / `week.expected`; run and conditioning decisions skip completion rules mid-week; run base includes the last full week; prompt key explains it | "digest: a plan week still in progress…" |
| 1.2 | `brain.planWeekStart` | "planWeekStart: never more than one week ahead" |
| 1.3 | `runLoadOf` falls back to the profile baseline; `runCaps` never prints a 0 km cap | "plan prompt run caps…" |
| 1.4 | `RUN_LIMITS.weeklyStartKm = 8` in validator and prompt | "validatePlan: a lifter's first running week…" |
| 1.5 | `core.unmarkWorkoutDone`; brain's undo removes the id from the current rotation | "undo of an earlier log keeps later workouts done" |
| 1.6 | `log_session` advances the rotation for any status when a planned workout is given; tool text says so | "log_session: a skip…" |
| 1.7 | `sameSessionContent` guard and future-date check | "log_session: a future date and an exact duplicate…" |
| 1.8 | `invalid_json` when the plan has no workouts | "generatePlan: a JSON reply without workouts…" |
| 1.9 | active-week divisor | "trainingSummary: sets per muscle…" |
| 1.10 | prior sessions filtered to the session's date | "log_session: PRs of a back-dated session…" |
| 1.11 | `hydrateSession` / `hydratePlan` on every read; state defaults extended | "store: documents written by an older app version…" |
| 1.12 | `prompts/util.selectNotes`, `context.formatMemory` (also used by the plan prompt) | "selectNotes keeps old standing facts…" |
| 1.13 | `coach.rememberChat({ signal })` | "rememberChat folds unsummarized messages…" |
| P2 | normalizeSession nulls, single injury map, weigh-in trend | three tests |

Docs: `CONTRACT-v2.md` has a review addendum with every contract change; `app/README.md` gained a module map and docs index; the root `README.md` now describes skill and app.

## 3. Requests for other owners

**UI**
1. **Clear chat:** call `await coach.rememberChat({ signal })` on the Clear tap before `store.chat.clear()`. It makes at most one quick call, resolves `{ summarized }`, and rejects `{ code }`; on rejection, ask "Clear anyway?".
2. **Mock mode:** replace the small "Dev" tag with a full-width banner ("Demo data: nothing here is saved to your account").
3. **Rotation undo:** `ops.removeSession`, `chat.undoLogged` and `quicklog.advanceRotation` each re-implement "take the workout back out". Use `core.unmarkWorkoutDone` in all three.
4. **Import errors:** show the store's message; it now says whether the previous data was restored (`err.rolledBack`).
5. **Live drafts:** drafts are keyed `planId|workoutId` in localStorage. After a new plan is approved, old drafts are unreachable for a week; offer "discard" or drop them on approval. A draft resumed days later logs under its start date; show the date on the finish screen.
6. **Midnight:** `chat.js` re-subscribes the day document only when `checkDayRollover` runs; make sure it runs before each send.
7. **Dead code:** remove the History add form's old `{ plan, workout }` mode (`history.js`, around line 587) now that the workout sheet replaced it.
8. **Bodyweight:** `store.body` now receives weigh-ins; a small trend in History or Settings would use it.

**Knowledge**
1. `CHAT_RULES`: state the skip rule ("skipped a planned workout → `log_session` status missed with its workoutId; a missed day they will still do → no workoutId").
2. `CHAT_RULES`: say when to use `add_coach_note` kinds `injury`, `preference`, `goal` (standing facts, kept in every prompt) versus `insight` / `decision` (recent ones only).
3. `PLAN_RULES` / `REVIEW_RULES`: mention `week.inProgress` (workouts not done yet are still to come, not missed).
4. `PLAN_RULES` beginners: the validator now allows up to 8 km in a first running week; keep the run/walk table within that.

## 4. Risks and roadmap

**What breaks first with real use**
1. **Pro usage limits.** A chat send is 2-4 requests (tool rounds re-read about 40 KB), a review 2-3, a plan 1-2 on the complex tier. A heavy day reaches `rate_limited`. Mitigations in order: default the post-workout review to the quick tier, drop the equipment-id list and screening answers from the chat context outside onboarding, and show a usage hint after a `rate_limited`.
2. **History beyond about a year.** The coach reads the newest 300 sessions and the UI subscribes to 500. Older best lifts and rarely trained exercises fall out of view silently, and every send reads 300 documents. Next step: a small `stats` document (best e1RM and last exposure per exercise) updated on log, and a 180-day window for the chat context.
3. **Single copy of the data.** Deleting the artifact erases the database. The only backup is the manual download. Next step: a "last backup" date in state and a monthly reminder in the UI.
4. **Platform contract changes.** All calls go through `callSample` / `callJson` and `env.js`, so the surface is small; unknown error codes already read as `upstream_error`. Re-read `docs/runtime-types` on every publish.
5. **Two devices.** See the last-writer-wins note above.

**Next architectural steps, in priority order**
1. Wire `rememberChat` and the mock banner (UI, small).
2. Split `brain.js` into chat, plan and tools modules; no behaviour change, tests already cover it.
3. Per-exercise `stats` document and a bounded chat context (item 2 above).
4. Minify the published build and leave the mocks out of it (build flag plus a static import guard).
5. Garmin: keep the manual path (`log_wellness` with pasted text) as the base. A connector needs a capability the page does not have (no external fetch), so the realistic route is a scheduled task outside the app that writes wellness entries through the artifact database, with `source: "garmin"` already in the schema.
6. Scheduled tasks outside the app (weekly check-in draft, backup reminder) for the same reason: the page may not call Claude without a tap.
7. Merge `app-v1` into `main` once the three review parts land; the root README already describes both.
8. A one-week plan override ("2 sessions this week") so `WORKOUT_COUNT` does not fight a stated wish.
