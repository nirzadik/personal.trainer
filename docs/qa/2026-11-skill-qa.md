# QA pass: skill knowledge and app knowledge (2026-11-08/09)

Scope: `.claude/skills/personal-trainer/` (SKILL.md, references, trainer.py), the app's model-facing knowledge (`app/src/knowledge/*.js`), the plan prompt builder, and `core.validatePlan`. Baseline is commit `e62122d`, after the three research rewrites (docs 11, 12 and 13).

## Findings and fixes

| # | Finding | Fix |
|---|---|---|
| 1 | `programming.md` §8 and `conditioning.md` §10.5 still said "running interferes more than cycling" (Wilson 2012). Schumann 2022 (43 studies) found no difference by cardio mode. | Claim removed from both files. Each now gives the Schumann/Petré summary in one line and points to `running.md` §11, which owns the evidence. |
| 2 | Same-day gaps disagreed: `conditioning.md` said "≥6 h"; running.md, SKILL.md and the app said 3-6 h. | 3-6 h everywhere: rule 2, the pairings table, rule 5, PLAN_RULES §6.2 and CHAT_RULES. |
| 3 | SKILL.md had the old long-run rule ("long run ≤10% longer than the 30-day longest"). PLAN_RULES §4.4 kept the dropped "+1 km under 8 km" floor. The digest (`progress.js`) used +1 km under 8 km. The prompt caps and validator allowed ×1.3 / +3 km. | One rule everywhere: no run longer than the 30-day longest × 1.1, and at most one new longest run per week; on short runs, round down. Updated in SKILL.md, PLAN_RULES, CHAT_RULES, `progress.js` (longMax = ×1.1) and `runCaps`. |
| 4 | Hybrid templates broke their own rules. Conditioning 5-day "balanced" put Lower right before the quality run, with 3 hard days in a row. The app's 4-day "balanced" put heavy legs + metcon right before the long run. The app's 3-day "balanced" put a metcon next to the quality run. | Templates re-ordered in both files. Notes added: 3-day weeks assume non-consecutive days; put a rest day after the long run. |
| 5 | Running §11 duplicated the conditioning §10 scheduling rules. Safety §5 duplicated the layoff steps with different numbers from programming §5. | Running §11 keeps the evidence plus the 3 running-specific rules and points to conditioning §10. Safety §5 now points to programming §5, running §8 and conditioning §8. |
| 6 | `conditioning.md` stats did not match doc 12: the week shape said "≈1 short, 2-3 medium" (the sample shows 0-2 and 2-4), and retest gaps said "2-15 months" (median ≈8.5 months; shortest 8-10 weeks). | Corrected. |
| 7 | Evidence tags differed in each file ([V]/[K], [R], [SR]). | One legend in programming, running and conditioning: [MA] [RCT] [OBS] [PS] [P], plus [CF] in conditioning. Citations use the Author Year form. |
| 8 | SKILL.md dose table: "strength work 2-4 RIR" against programming's 1-3. Zone 2 was "60-70% HRmax" in programming but "65-79" in running. "PPL ×1 is worse for growth" contradicts the volume-equated evidence. | Aligned: strength 1-3 RIR (heavy compounds about 2). Zone 2 now points to the running zones. The PPL wording is corrected. |
| 9 | Doc 07 said Milanović 2015 found HIIT "+5.5 ml/kg/min more than" continuous training. | Checked against the abstract: HIIT +5.5 and continuous +4.9 vs controls, so HIIT vs continuous is +1.2 ± 0.9. Fixed in 07 and 03; noted in 12. |
| 10 | ONBOARDING_RULES and REVIEW_RULES say "chat safety rules apply", but `brain.js` sends them **without** CHAT_RULES. | Each now has its own short red-flag line (urgent action only). |
| 11 | The SKILL.md description did not name running or HIIT, and the body was 23 KB. | Description is now 1,007 chars and names gym, running plans and HIIT/metcons. Body is 19.4 KB; detail was moved into the references, not deleted. |
| 12 | PLAN_RULES lacked the new conditioning recipe: time estimate, load as unbroken-set size, weekly rotation slots, the scaling ladder (first round without failure, <50% Rx for newcomers, tier ratios, no progressive scaling). CHAT_RULES §3 repeated the tool descriptions. | PLAN_RULES §5 rebuilt (recipe, scaling, rotation). Duplicates of the JSON spec and the tool descriptions removed. |
| 13 | `validatePlan` used RUN_RAMP ×1.15/+5 and an error-only LONG_RUN_SPIKE at ×1.3/+3. | `core.RUN_LIMITS`: RUN_RAMP error above max(base × 1.1, base + 3), where base = max(4-week average, latest week's km), mirroring the digest. LONG_RUN_SPIKE **warns** above the 30-day longest × 1.1 (ignoring steps ≤1 km) and stays an error for gross spikes (×1.3 and +3 km). The prompt's caps line and `brain.runLoadOf` (30-day longest, latest week) use the same base. A new test covers the warning; CONTRACT.md is updated. |

## Sizes (UTF-8 bytes)

| File | Before | After | Cap |
|---|---|---|---|
| SKILL.md | 22,975 | 19,372 | ≤ 20 KB |
| programming.md | 23,980 | 23,993 | 24 KB |
| running.md | 19,888 | 19,865 | 20 KB |
| conditioning.md | 21,983 | 21,987 | 22 KB |
| exercise-library.md | 11,965 | 11,965 | 12 KB |
| safety-and-scope.md | 23,800 | 23,740 | 24 KB |
| coaching-and-checkins.md | 9,690 | 9,690 | 10 KB |
| data-format.md | 3,564 | 3,564 | n/a |
| **references total** | 114,870 | 114,804 | no growth |
| PLAN_RULES | 40,615 | 36,295 | ≤ 40 KB (aim 36) |
| CHAT_RULES | 14,317 | 12,182 | ≤ 14 KB (aim 12) |
| ONBOARDING_RULES | 6,981 | 7,094 (+safety line) | ≤ 7 KB |
| REVIEW_RULES | 2,113 | 2,124 | ≤ 2.5 KB |
| COMMENT_RULES | 1,526 | 1,526 | ≤ 2 KB |

## Request sizes (tokens ≈ bytes / 4; dev seed data, mock store; script at scratchpad `qa/measure.mjs`)

| Request | Before | After | Worst case (all budgets full) |
|---|---|---|---|
| Chat turn (instructions + snapshot + history + 10.7 KB tool specs) | ≈ 9.1k | ≈ 8.5k | ≈ 24k (40 KB instructions + 30 KB history + 16 KB message + tools) |
| Plan generation | ≈ 16.7k | ≈ 15.6k | ≈ 40k for the section budgets. The hard ceiling was lowered from 200 KB to 176 KB (≈ 45k tokens); the rules budget is now 40 KB |

Nothing realistic exceeds the 25k (chat) or 45k (plan) flags.

## Verification
- `npm test`: 211/211 pass.
- `npm run build`: OK.
- `trainer.py --help`: OK.

## Deliberately left
- The validator's `HARD_DAYS_ADJACENT` still treats any workout with ≥4 leg sets as heavy and ignores the rotation wrap-around. This is a heuristic warning only.
- The app's 4-week average still counts the current partial week.
- The pace table stays in PLAN_RULES (≈2.7 KB). It is needed for logged time trials and goal paces when the profile has no race.
- `docs/research/*` was only corrected for Milanović; nothing else in it was polished.
