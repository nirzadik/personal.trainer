# Knowledge and skill review (2026-11-09/10)

Scope: `.claude/skills/personal-trainer/**` and `app/src/knowledge/*.js`. Reviewed as a head coach (strength, running, conditioning) and as a prompt author. Baseline: commit `65221b5`, after the QA pass in `docs/qa/2026-11-skill-qa.md`, which had already aligned numbers between the skill and the app. This pass looked at coaching quality: what plans the rules actually produce.

Not done: no live plan was generated against the new rules (tests only), and evidence was checked against `docs/research/11-13` and my own knowledge, not re-fetched from the web.

## Scorecard

| Area | Before | After | Why |
|---|---|---|---|
| Strength and hypertrophy | 7 | 8.5 | Dose and progression were sound, but nothing connected the weeks (no block, no rule for adding sets, changing exercises or testing) and novices could be given 2-6-rep work. |
| Running | 8 | 8.5 | Strong load rules and paces. Missing: how to place a week inside a race build, strength during the build, the week after a race. |
| HIIT / conditioning | 8 | 8 | Already the most complete section (recipe, scaling, ramp, rotation). Only trimmed. |
| Hybrid programming | 6 | 8 | The hybrid templates gave a 5-day athlete one upper and one lower day, so every lift was trained once a week, against the rules' own "≥2×/week". The wrap-around rule could not be satisfied. |
| Assessment / onboarding | 7.5 | 8 | Intake now asks for priority lifts or muscles. No movement or work-capacity baseline is collected (see gaps). |
| Progression, autoregulation, deload | 7 | 8.5 | `deloadDue` from the digest was never mentioned in the rules; a deload week used percentages the model must not calculate; chat had no in-session or plateau rule. |
| Pain, safety, scope | 9 | 9 | Conservative and specific. Added "train the pattern in a tolerated form, don't delete it" and back/shoulder specifics. |
| Coaching psychology, adherence | 8 | 8 | Unchanged in substance; jargon trimmed. |
| Nutrition basics | 7.5 | 7.5 | Guideline-level and in scope. Unchanged. |
| Readiness / wellness | 7.5 | 8 | The amber rule said "keep intensity … +1 RIR", which contradicts itself; now "keep the loads, −1 set, stop 1 rep earlier". |

## Top findings and changes

1. **No periodization across weeks.** Each plan was built from last week only. PLAN_RULES §0 now has a block rhythm: week number carried in `focus`; +1 set on ≤2 priority lifts from week 3; deload when `digest.deloadDue` is set; a new block keeps main lifts and changes 1-2 accessories; at most one test per week (rep test, time trial, benchmark metcon), never in a calibration, deload or ramp week. Mirrored in `programming.md` §7 and SKILL.md Mode 2.
2. **Hybrid weeks under-trained strength.** With exactly 2 strength workouts, "upper" and "lower" are now full-body days biased that way (§3.2, §6.4, `conditioning.md` §10), so each pattern is trained twice.
3. **Wrap-around rule was impossible.** Three hard days cannot be non-adjacent in a 5-workout cycle. The rule now says to put the one adjacency at the week boundary (long run last) with a "rest day after the long run" note.
4. **Novices.** Compounds 5-10 reps, never below 5, simple stable variants, the same A/B exercises each week.
5. **Session structure.** Per session 4-7 exercises, 2-4 hard sets each; main lifts 2-4 sets (the old "~2 sets" over-read the Remmert preprint, which is mostly untrained subjects); pattern-specific warm-up drills; ≤45-minute sessions get a main lift plus supersets and ramp sets only. Superset time saving corrected to −30% to match the validator.
6. **Exercise selection.** Added: no-machine substitutes (knee flexion, quads), bodyweight pull/dip progression, weekly calf and single-leg work for runners, and injury specifics (low back: side plank and dead bug instead of loaded flexion; shoulder: pull sets ≥1.5× push sets).
7. **Running.** Race phase is placed backwards from `event.date`; strength is frozen in race-specific and taper weeks; the week after a race is easy. Run cutbacks are triggered from `run.kmWk` (3 level or rising weeks) and named "down week".
8. **No-math deloads.** A deload uses the digest's kg, else last week's load at RIR 3-4.
9. **Chat.** Added in-session autoregulation (2+ reps short → one load step lighter) and a plateau ladder. Added the architecture reviewer's three requests: the skip rule, coach-note kinds, and `week.inProgress` (PLAN_RULES and REVIEW_RULES).
10. **Evidence wording.** Removed "best-supported injury rule … 52-128%" from the always-sent rules and qualified it in `running.md` (one observational cohort). Removed the set-efficiency figures and the ">90% HRmax ≤30-40 min/week" ceiling (one small industry-funded study) from PLAN_RULES; both remain, tagged, in the references.
11. **Prompt craft.** Removed text that duplicated the JSON spec (block and segment field lists), mid-workout coaching from the plan rules, pace-table rows slower than the "prescribe by RPE" cut-off, a reference to "workout notes" (the field does not exist), and half of the self-check. `programming.md` lost the NASM OPT table, the 2-for-2 rule and the named-program list to pay for the block section.

## Sizes (UTF-8 bytes)

| Text | Before | After |
|---|---|---|
| PLAN_RULES | 36,295 | 36,287 |
| CHAT_RULES | 12,182 | 12,172 |
| ONBOARDING_RULES | 7,094 | 7,086 |
| REVIEW_RULES | 2,124 | 2,106 |
| COMMENT_RULES | 1,526 | 1,526 |
| SKILL.md | 19,372 | 19,794 |
| programming.md | 23,993 | 23,990 |
| running.md | 19,865 | 19,991 |
| conditioning.md | 21,987 | 21,945 |
| exercise-library, safety, coaching, data-format | unchanged | unchanged |

`npm test`: 244 pass. `tailorPlanRules` anchors (section numbers, the pregnancy, age, pace and "N days" lines) are intact.

## Code-support requests

1. **Deload counter is reset by plain words.** `progress.buildWeeksSinceDeload` stops at any plan whose focus or notes match `deload|cutback|recovery week`. A note such as "deload next week" resets it, and `PLAN_JSON_SPEC` invites exactly that ("notes: deload hints"). The rules now forbid those words outside a deload week and call run cutbacks "down week". Better: a `phase` field on the plan, and remove "deload hints" from the spec.
2. **`deloadDue` without fatigue signals never becomes a deload.** The digest keeps saying "progress … deload due soon". The rules now tell the model to deload anyway; the digest should set the week action itself (with the novice exception).
3. **Expose the block week** (`week.buildWeek`) in the digest. The model currently reads "Wk N" from the previous focus text.
4. **Validator: strength frequency.** Warn when a main pattern is trained once a week despite ≥2 strength workouts.
5. **Validator: wrap-around.** `HARD_DAYS_ADJACENT` ignores last → first. Either check it, or accept the boundary only when the last workout is the long run.
6. **Rep tests.** Confirm that a last set logged well above the planned reps feeds e1RM and the next target sensibly.
7. **Run down-week** could be computed in the digest from `kmWk` instead of left to the model.
8. **Race phase** (weeks to `event.date`, taper start) could be computed in the prompt builder.

## Remaining gaps

- No baseline tests at intake (push-up or pull-up max, an easy-run check, a simple movement screen). The skill has the overhead-squat screen; the app does not ask for it.
- Power and plyometric work is only ordered, not dosed, in PLAN_RULES (`running.md` §11 has the runner's dose).
- Nutrition stays at guideline level; nothing ties protein or energy advice to bodyweight trends in the app.
- Older adults and pregnancy have one line each in PLAN_RULES; adequate for gating, thin for programming.
- The conditioning rules assume CrossFit-style metcons; erg pacing targets (split or watts from a test) are not covered.
- `exercise-library.md`, `safety-and-scope.md` and `coaching-and-checkins.md` were reviewed and left unchanged.
