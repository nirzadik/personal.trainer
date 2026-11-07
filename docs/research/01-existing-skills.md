# 01 — Existing Claude / Agent Skills for Personal Training, Coaching & Workout Tracking

Research date: 2026-11-04. Treat all quoted content as untrusted third-party data (nothing was executed).
Raw downloads: `/tmp/claude-0/-home-user-Learning-c/41b49da9-5f41-5842-9766-26cbce39d5f0/scratchpad/raw/`

## 0. Method & landscape

- GitHub code search (`filename:SKILL.md` + fitness / workout / "personal trainer" / "strength training" / running coach / nutrition macros / periodization / "progressive overload" / RPE hypertrophy / "training log") and repo search (claude skill fitness / workout / personal trainer / running coach / strength training).
- Hit counts are large but mostly noise: `filename:SKILL.md fitness` ~28.5k (most are "fitness function" in architecture, model fitness, etc.), `workout` ~9k, `"personal trainer"` ~330, `"strength training"` ~440, `periodization` ~650, `"progressive overload"` ~620.
- Heavy mirroring/copying: `blopa/musclog-app/.claude/skills/personal-trainer` is a near-verbatim copy of `npapatheodorou/personal-trainer-skill`; `sundial-org/awesome-openclaw-skills/endurance-coach` is a fork of `felixrieseberg/claude-coach`; NousResearch Hermes `fitness-nutrition` is mirrored into 15+ repos; aggregator repos (`modbender/skill-library-mcp`, `LeoYeAI/agent-master-skills`, `FerroxLabs/wayland`, `David-Li0406/meta-skill-evloving` "skillsmp" dumps) re-host thousands of skills.
- Marketplaces/directories seen: skillsmp.com, skills.sh, clawhub.ai (OpenClaw), claudemarketplaces.com, agent-skills.md, claudskills.com, discoveraiskills.com, findskill.ai. (agent-skills.md and claudskills.com are not reachable from this sandbox's network; content recovered via GitHub mirrors instead.) ClawHub flagged at least one fitness skill ("Fit Mate") for suspicious patterns — supply-chain caution is warranted.
- `anthropics/skills` (official repo): **no fitness/training skill**.
- Quality distribution: a long tail of thin "you are an expert trainer, output a plan" prompts (e.g. OneWave-AI `workout-program-designer`, tatat `fitness-coach`) and a small set of genuinely well-engineered skills. The best ones converge on the same architecture (below).

### Convergent architecture of the good skills
1. Lean `SKILL.md` router + progressive-disclosure `references/` (training, nutrition, safety, evidence, formats) read on demand.
2. Persistent state in plain files **outside** the skill bundle (`~/.fitness-coach/`, `~/.trainer/`, `~/Clawic/data/fitness/`, `coach-data/`), read at every invocation.
3. Append-only training log as source of truth; profile edited in place with a change log.
4. Onboarding interview in grouped rounds, then "graceful degradation" (ask only for the missing field).
5. Deterministic tools for math (Python/Node CLIs) — "never do mental math".
6. Explicit safety red-flag table that halts programming and refers out.
7. Weekly check-in / review loop with recovery signals feeding autoregulation.

---

## 1. Top skills analysed (ranked by usefulness as a reference)

### 1.1 clawic `fitness` (+ `workouts`, `gym`, `personal-trainer`, `coach`, `nutrition`) — best knowledge density
- URL: https://github.com/clawic/skills/tree/main/skills/fitness (raw: `https://raw.githubusercontent.com/clawic/skills/main/skills/fitness/SKILL.md`), homepage clawic.com/skills/fitness. v1.0.4. Supporting files: `setup.md`, `memory-template.md`, `assessment.md`, `program-design.md`, `progression.md`, `cardio.md`, `recovery.md`, `comeback.md`, `body-composition.md`, `minimal-equipment.md`, `tracking.md`.
- **Structure**: Configuration table (typed user variables with defaults & effects) → When To Use → Quick Reference situation→play table → 8 numbered Core Rules with worked examples → Program Design Defaults → Progression & Plateaus (diagnostic order) → Recovery & Readiness → Red Flags table → **Output Gates** (pre-emit checklist) → Traps table → "Where Experts Disagree" → related skills.
- **Knowledge encoded** (quantified, opinionated): double progression; Epley e1RM only from 3–8 rep sets; RIR prescription; 10–20 hard sets/muscle/week; 80/20 cardio; Karvonen with Tanaka HRmax; layoff discount table; deload-on-evidence; beginner linear progression until first stall.
- **Intake/assessment**: `assessment.md` — "Collect inside normal work ... never as a questionnaire." Minimum baseline set (e1RM per lift, 7-morning resting HR, attendance rate, 12-min Cooper-style test, pain-free movement screen). Starting-load protocol with no log (ramp until 8 reps @ RIR 3; "err low"). Classifies training age by *observed response*, not self-report.
- **Program design**: split by days (2–3 full body / 4 U-L / 5–6 PPL); weekly movement floor (squat, hinge, H-push, H-pull, V-push, V-pull); "Program to logged attendance plus at most one day, not to stated ambition."
- **Progression**: Rule 1 verbatim: *"Progress by double progression, not by feel. Assign a rep range (e.g. 3x8-12). When every set reaches the top of the range at the same load, add 2.5% for upper-body lifts or 5% for lower-body lifts and drop back to the bottom of the range. Worked example: 3x12 at 60 kg squat completed, next session is 3x8 at 63 kg."* Stall = no improvement across 3 sessions; diagnostic order cheapest-first: audit log (RIR/rest actually followed?) → inputs (sleep <7h, deficit) → deload + resume at 90% → change one constraint (microload → rep range shift → variant).
- **Layoff rule (Rule 6)**: <1 week missed = nothing; 1–2 weeks = resume last load, no jump; ≥2 weeks = −10% load per week missed, floor 50%, add back ~10%/week. "never stack two workouts into one."
- **Deload (Rule 7)**: trigger = two consecutive sessions below logged numbers on same lift, or RHR +5 bpm for 3+ mornings; 1 week at 50% sets, same loads; cap hard blocks at 4–8 weeks.
- **Readiness check**: RHR within 5 bpm of baseline, sleep ≥6h, appetite normal — two of three failed → convert to Zone 2/technique, don't cancel. DOMS-vs-injury test spelled out.
- **Tracking / file formats** (`memory-template.md`): three files, three jobs — `config.yaml` (declared prefs), `memory.md` (derived baselines table with "As of" dates, context, injury exclusions, observed preferences, status ongoing/complete), `log.md` one line per session, append-only:
  ```
  YYYY-MM-DD | lower | squat 3x8 @ 100kg RIR2 · RDL 3x10 @ 80kg RIR3 | felt: normal | sleep 7h
  YYYY-MM-DD | cardio | 40 min Zone 2 bike | RHR 57
  YYYY-MM-DD | missed | planned upper — travel
  ```
  Logs **missed** sessions with reason (attendance & gap-length are computed from them). Companion `workouts` skill uses `logs/YYYY-MM-DD.md`, `routines/*.md`, `exercises.md`, `prs.md`.
- **Safety**: Red-flag table (signal → suspicion → action) incl. exertional chest pain, syncope, rhabdo (cola urine + swelling), sharp joint pain, neuro symptoms, overtraining (RHR+5 for a week despite deload), EIB, pregnancy/cardiac/metabolic/renal without clearance. "Anything in this table suspends every protocol above."
- **Output gates** (verbatim excerpt): *"Does every exercise line carry sets x reps + load or RIR + rest (Rule 8)? ... Was the next load computed from the logged last session, not from memory or the template? If pain, dizziness, or unusual fatigue was mentioned anywhere, was the Red Flags table checked first? After a gap of 2+ weeks, was the layoff discount applied?"*
- **Traps** (excerpt): "Programming to stated ambition → Logged attendance + max 1 day"; "Adding volume to break a stall → stalls are usually recovery-limited"; "Testing 1RM to measure progress → Epley e1RM from rep sets"; "Guilt-framing missed sessions → Shame predicts dropout; the log is data, not a verdict"; "Treating wearable readiness scores as ground truth → raw RHR + sleep + log".
- **Good**: most actionable rule set found; numbers + worked examples; explicit gates; handles comebacks/travel; acknowledges expert disagreement.
- **Weak**: one-line log is lossy (no per-set detail, defers to `gym` skill); no deterministic calculator (relies on model arithmetic); nutrition routed to separate skills; branding/upsell lines; HR math relies on model.

### 1.2 neilberget `fitness-coach` — best workflow/UX engineering for a Claude Code personal trainer
- URL: https://github.com/neilberget/fitness-skill (`fitness-coach/SKILL.md`, `references/onboarding.md`, `log-format.md`, `check-in-format.md`, `profile-template.md`, `programming-principles.md`).
- **Storage resolution**: `$FITNESS_COACH_HOME` → `~/.fitness-coach/` (if exists) → `~/.claude/fitness-coach/` (under Claude Code) → `~/.fitness-coach/`. *"Always use the absolute path ... Claude Code's permission matcher matches the literal path string"* and offers once to add persistent allow rules to settings.json (tracked via `permission_offer: unprompted|accepted|declined`).
- **Files**: `profile.md` (edited in place), `workout-log.md` (append-only, **newest-first** so you read only the top ~200 lines), `check-ins.md` (newest-first), optional `morning-log.md`.
- **Router**: explicit intent → flow mapping (design / modify / log / update profile / weekly check-in / scheduled daily check-in / manage schedule).
- **Date anchoring section** (unique, very useful): convert each log ISO date to weekday + days-ago + sequence ("Friday hard circuit → Saturday easy run → Sunday today"); ISO date authoritative; flag weekday conflicts; ask for date if not available.
- **Onboarding**: 5–6 grouped rounds (bio & safety incl. clinician restrictions, meds affecting HR, pregnancy; long-term goals *with a worked example of how specific to be*; preferences; equipment per location; life context; optional daily check-in), then show saved profile and ask "Anything to fix?".
- **Profile template**: Bio, derived HR zones table (pre-computed bpm), Injuries, Medical/safety notes, verbatim goals, preferences, Equipment by location, Current context, **Flexible weekly compass** (mode loose|fixed plan, current bias, weekly targets, next good options, avoid for now), Skill settings (youtube_links, permission_offer, daily_check_in mode/time/id, profile_created, last_check_in), Change log.
- **Workout output template** (verbatim):
  ```
  ## Today's workout — [date], ~[duration]
  **Focus:** [one line]
  **Why this:** [1–2 sentences tying it to goals + recent log]
  ### Warm-up (~X min)
  ### Main work (~X min)
  - [Exercise](https://www.youtube.com/results?search_query=Exercise+form) — sets × reps @ load/intensity, rest
  ### Finisher / cooldown (~X min)
  **Target HR zones:** ...
  **Notes:** [form cues, alternatives]
  ```
  Exercise names auto-linked to a YouTube *search* for "+form" (toggleable).
- **Log entry format** (`log-format.md`): `## YYYY-MM-DD — [title]`, Duration, Followed plan: yes/partially/no + what changed, RPE/felt, "What was done" bullets (actual sets×reps@load; cardio time/distance/avg HR/pace), Notes, `---`. "Don't fabricate numbers"; pain also goes to profile injuries.
- **Weekly check-in**: due when days ≥7 AND sessions ≥3 (soft-overdue ≥10 days or ≥6 sessions); surface one line at top, never block today's request; 2–3 rounds of questions grounded in the last ~10 log entries; reflect back 3–4 bullets and confirm before saving; bump `last_check_in`.
- **Programming principles**: goal→weekly dose map (VO2max: 1–2 interval + 2–4 Z2; hypertrophy: 8–20 sets/muscle/week; strength 3–6 reps 80–95%); "Use a weekly compass, not guilt" — never stack missed workouts; "When time is short, shrink the session before changing the training intent"; rotation rules (heavy lower yesterday → upper/Z2 today; nothing aerobic 5+ days → add Z2 finisher); two consecutive RPE 9–10 → today RPE ≤6; time budgeting table; always give real BPM ranges; loading from last log (RIR left → +5 lb upper/+10 lb lower; grinder → repeat; failed → repeat or −5–10%); "Every workout must be runnable as-written."
- **Daily scheduled check-in**: detects scheduling capability (CronCreate, /schedule, env vars) before offering; modes `morning_ping` (1–2 lines) vs `accountability` (bundled 5-question morning interview → `morning-log.md`); stores schedule id; handles "profile missing on scheduled run".
- **Safety**: stop-and-refer list (chest pain, fainting, severe SOB, acute injury, neuro symptoms, uncontrolled dizziness, worsening pain); never diagnose or prescribe rehab.
- **Good**: excellent operational detail (paths, permissions, dates, cadence), flexible-compass philosophy for busy adults, run-as-written outputs.
- **Weak**: no periodization/mesocycle concept (session-by-session only); no e1RM or progression table per lift; Markdown log is hard to compute trends from; no nutrition; imperial-centric examples; large SKILL.md (~26 KB).

### 1.3 Yuvasee `trainer` — best safety file + deterministic tools + JSONL log
- URL: https://github.com/Yuvasee/trainer (`.claude/skills/trainer/SKILL.md`, `intake.md`, `knowledge/{INDEX,training,nutrition,recovery,safety}.md`, `templates/{profile,goals,plan}.md`, `routines/daily_nudge.md`, `tools/cli.py`).
- **Three hard rules** (verbatim): *"1. Never do mental math. Every number (calories, macros, BMR/TDEE, trend, rate, projection, rollups) comes from the Python tools. If you typed a number you didn't get from a tool, you did it wrong. 2. State lives in files, not in your head. ... The log is append-only. 3. Safety wins over everything."*
- **Operating loop**: read state → onboard if empty → gather only what's missing → log facts → compute with tools → justify from knowledge (via INDEX, load on demand) → answer → persist.
- **Data**: `~/.trainer/` (`$TRAINER_HOME`): `profile.md`, `goals.md`, `plan.md` (with dated **Adaptation log**), `log.jsonl`, `today.md`, `dashboard.html`. Profile uses exact `- Key: value` bullets so Python can parse them (Markdown-as-config).
- **Event-typed JSONL log** via `cli.py log add <type> --set k=v`: `weight{kg}`, `workout{kind,duration_min,moving_min,distance_km,avg_hr,kcal,notes}` (kind normalised: bike→cycling, jog→run), `meal{kcal,protein_g,estimated}`, `sleep{hours,quality,score,stages...}`, `steps{count}`, `recovery{soreness,stress,readiness,hrv,rhr,body_battery}`, `adherence{on-plan|over|under}`, `note{text}`. Corrections are appended with same `ts` (last wins) — log stays append-only. Garmin CSV import + unofficial API sync, idempotent dedup.
- **Metrics**: Mifflin-St Jeor targets, EMA weight trend, rate + safety verdict, projection, **adaptive observed TDEE** (needs ≥10 meal-logged days; refuses rather than guess), weekly rollups flag sparse weeks (<4 meal days).
- **Intake** (`intake.md`): reusable for Onboard / Re-assess / Check-in; idempotent, skips known fields, "Confirm before overwrite (show old → new)"; **graceful degradation priority list** (weight+height+age+sex+activity unlock TDEE → target+strategy unlock rate/projection → environment+equipment+injuries unlock training week → rest refines). Auto-suggest re-interview on goal drift, unsafe/stalled rate ≥2 weeks, context change, staleness >4 weeks.
- **"What now?" output**: one concrete action + Why (data + knowledge §ref) + Watch-for (the signal that would change the plan). "The action must change as the log changes."
- **Safety (`knowledge/safety.md`)** — cited (Harvard Health, IOC REDs 2014/2023, NIDDK, ACSM pre-participation, NEDA, JOSPT): loss 0.5–1% BW/week ("Always reason in %BW, never a flat kg figure"); lean gain 0.25–0.5 kg/wk; never sustain intake below ~BMR; VLCD <800 kcal supervised only; ACSM symptom list (chest/jaw/arm discomfort, unusual SOB, syncope, orthopnea, ankle edema, palpitations, claudication, murmur, unusual fatigue) → stop & refer; refer-out table (MD / RD + mental health / PT); disordered-eating warning signs; populations needing clearance (CV/metabolic/pulmonary/renal disease, pregnancy, diabetes/insulin); running load: "10% rule ... not well supported", prefer avoiding a single run >10–30% beyond the longest run in prior 30 days.
- **Good**: strongest guardrails and data discipline; tool-computed numbers; cited knowledge "data not authority"; adaptation log with triggers.
- **Weak**: workout log lacks per-exercise set/rep/load detail (focus is weight-loss/lifestyle); heavy dependency on bundled Python; some Russian-language prompts; strength progression less specified than clawic.

### 1.4 npapatheodorou `personal-trainer` (copied by blopa/musclog-app) — best combined trainer+nutritionist with simple Markdown templates
- URL: https://github.com/npapatheodorou/personal-trainer-skill (17★; `personal-trainer/SKILL.md`, `references/{evidence,training,nutrition,prompts}.md`, `assets/{athlete-profile,exercise-library,lift-log,programme-template,nutrition}.md`). Distilled from guides by @Hawks0x.
- **Persona**: "Coach — a direct, knowledgeable, scientific personal trainer and nutritionist ... No fluff, no generic disclaimers." Evidence rules: lead with recommendation then cite (short form, e.g. *Morton et al., 2018*), grade confidence (strong/moderate/emerging), "Never fabricate a citation".
- **Data**: `coach-data/` in CWD: `athlete-profile.md`, `exercise-library.md` (**YES / SUB / NO per exercise** — "the single most important input for tailored sessions"), `lift-log.md` (Current working weights table + append-only sessions), `programme.md` (active split + block tracking table Start/End Wk4/Wk8/Wk11), `nutrition.md`.
- **Profile template**: very thorough nutrition intake (current diet by time of day, "be honest — this is the most important section", alcohol units, cooking confidence, eat-out frequency, shift work, mindset re: tracking, what success looks like beyond the scale).
- **Training rules**: RPE 7–8 hypertrophy / 8–9 strength; **"Never compute working weights from percentages; use the logged working weights as baseline"**; add load after hitting top of rep range at target RPE for **2 consecutive sessions** (+2.5 kg upper, +5 kg lower; accessories add reps first); Week 1 = calibration (flag every starting weight as calibration weight); deload every 4–6 weeks (~40–50% volume, RPE cap ~6); default 12-week block (1–4 volume, 5–8 intensity, 9–11 heavy, 12 deload); plateau buster = diagnose (recovery, volume, technique, intensity, nutrition) then 2–3 week plan.
- **Log format** (verbatim):
  ```
  [DD/MM/YYYY] — [Session Name]
  Week [X] | Block [1/2/3]
  Exercise          | Sets x Reps | Weight (kg) | RPE | Notes
  ----------------------------------------------------------
  [Exercise name]   | 4 x 6       | 100         | 8   |
  Session notes: [energy / sleep / how it felt / anything notable]
  ```
- **Nutrition**: Mifflin-St Jeor × activity, 300–500 kcal deficit, protein 0.8–1 g/lb, fat ≥0.35 g/lb, carbs fill; evidence-backed supplements only (protein, creatine, caffeine, omega-3).
- **Good**: exercise-library YES/SUB/NO idea; working weights vs 1RM distinction; block tracking table; "prompt stack" reference for users; portable (works in Codex/Cursor/opencode via AGENTS.md).
- **Weak**: DD/MM/YYYY dates (sort-unfriendly); log is a fixed-width text table (not machine-parseable, sets aggregated so no per-set reps); per-set RPE only one value; safety minimal ("You are not a doctor... consult GP"); no red-flag screen; no cardio/HR programming; no check-in cadence.

### 1.5 felixrieseberg `claude-coach` (+ fork `endurance-coach`) — best endurance/periodized plan generator with structured JSON output
- URL: https://github.com/felixrieseberg/claude-coach (`skill/SKILL.md`, `skill/reference/{queries,assessment,zones,load-management,periodization,workouts,race-day}.md`); npm CLI `claude-coach` (Strava OAuth sync → SQLite `~/.claude-coach/coach.db`, `query`, `render`).
- **Intake**: AskUserQuestion to choose Strava vs manual. Manual: last 4–8 weeks hours by sport, longest sessions, consistency, benchmarks (FTP, threshold pace/race times, CSS, max/LT HR), background, constraints. Builds an `assessment` JSON object either way.
- **Assessment insight** (verbatim): *"Foundation vs Current Form ... An athlete who completed an Ironman last year but has barely trained in 10 weeks is NOT the same as a beginner"* — table of scenarios → Rebuild vs Build vs Peak. Gap analysis vs event requirements table. Infers preferred long-session days via SQL on history. **Mandatory athlete validation step** before writing the plan (9 validation questions).
- **Load management**: TSS formulas, sTSS heuristics, CTL ramp-rate table by level (beginner 3–5 TSS/day/week ... pro 8–12), ATL, TSB ranges (< −30 overreaching), race-day TSB/taper length by event.
- **Output**: full **TrainingPlan JSON schema** (meta, preferences/units, assessment, zones for run HR/bike power/swim CSS, phases, weeks→days→workouts with id/sport/type/durationMinutes/distance/primaryZone/humanReadable/completed, weekly summary, raceStrategy incl. pacing/nutrition/taper) → `npx claude-coach render plan.json` → interactive HTML calendar (completion saved in localStorage). Rule: *"Durations must add up ... change durationMinutes and humanReadable together."* Unit inference (US events → imperial, round distances).
- **Principles**: consistency over heroics; easy easy/hard hard; progress the limiter; specificity increases over time; adequate taper; practice race nutrition; 1–2 strength sessions/week; never same sport back-to-back days.
- **Good**: rigorous machine-readable plan schema; foundation-vs-form; validation gate; field tests for manual-data users; conservative-when-unsure.
- **Weak**: endurance-only; no ongoing logging/adaptation loop (plan is a one-shot artifact, completion lives in browser localStorage); requires npm/Strava setup; safety only "injuries or health considerations".

### 1.6 ColinEberhardt `claude-running-coach` (running-race-coach plugin; 32★) — best coaching-conversation + weekly review for runners
- URL: https://github.com/ColinEberhardt/claude-running-coach (`running-race-coach/skills/{training-plan,running-coach,strava-sync,training-dashboard}/SKILL.md`, `training-plan/references/coaches-guide.md`, `scripts/calculate_paces.py`).
- **training-plan**: required inputs (distance, race date, current weekly mileage over last 4 weeks, days/week), recommended (target time, recent races, background, injuries, constraints); flags too-short timelines (<8 weeks for marathon). **Paces computed by script** (`calculate_paces.py -d 10 -t 45:30 --per-km`): Easy 120–130% of race pace, Steady 110–115, Threshold 103–107, VO2 95–98, Repetition 90–93. Plan lengths by distance; 3:1 / 2:1 build-recovery; deload 15–30%; 1–2 quality sessions + long run + easy w/ strides. Odd rule: intervals must be distance-based, never time-based.
- **running-coach (weekly review)**: data from `training-log/week-N.md` (Strava sync or manual/conversational) vs `training-plan.md`; **"Ask ONE question at a time"**; athlete perspective first ("how did this week feel overall? Give me the headline") then per-session analysis (completion, pacing vs prescribed, HR, workout quality, volume), cross-training briefly; verdict On track / Behind / Ahead; **"Give them ONE or TWO things to focus on. Not a laundry list."**; writes `coaching-log/week-N-coaching-notes.md` (planned vs actual, athlete perspective, session analysis, assessment, adjustments, next-week focus).
- **Good**: planned-vs-actual review structure; persisted coaching notes; human tone; script for paces.
- **Weak**: emoji/banter-heavy persona; percentage-of-race-pace zones are crude (pace offsets from goal not fitness); minimal safety; week-number files rather than dates.

### 1.7 joeuk89 `strength-coach` — most rigorous engine-backed architecture (Claude judges, engine computes)
- URL: https://github.com/joeuk89/strength-coach (Claude Code plugin; skills `onboard`, `kit`, `program`, `plan-week`, `check-in`; Python `coach` CLI; `docs/spec/*` incl. autoregulation, deloads, detraining-return, volume-frequency, running-load, sleep-dieting; ADRs; Hevy integration).
- **Division of labour** (README): *"the `coach` engine ... owns everything that must be exact: arithmetic, units, rounding loads to the plates and dumbbells you own, safety bounds, data integrity ... Claude owns the coaching judgement and records a reason for every decision."* Instance = a git repo of the athlete's data; readable pages written to `pages/week.md`.
- **Weekly loop**: train (Hevy routines) → `/check-in` (engine produces a "card" stating what's known, asks only what it can't; readiness poor/ok/good) → `/plan-week` (engine Draft with **flags**: `stall_streak`, `rep_range_missed`, `dose_under_target`, `session_dose_high`, `light_week_*`, `session_drop_suggested`, `override_persisting`; Claude answers each with an override + reason, a Decision, or an Acknowledgement). "A load the engine derived is never retyped." Dry-run then athlete says yes before anything is recorded.
- Check-in judgement rules: "Misses ... Pattern over blame: a run of `time` misses is a schedule problem for the plan, not a willpower problem"; "Sleep and weight. Read the trend, not the week"; niggles tracked reported/aggravated/easing/resolved, escalate "when pain changes gait, sleep or daily tasks; never diagnose"; low adherence → "present a smaller schedule with the same weekly hard sets per muscle".
- **Good**: decision log with reasons; flag taxonomy; equipment-aware load rounding (plate math); never mutates external history; explicit consent gates.
- **Weak**: heavy install (uv, Python 3.12, git, optional Hevy Pro); terse jargon-heavy skill prose that only makes sense with the engine; not usable standalone.

### 1.8 lesterwh `fitness-review` — best command set for post-session review, PRs, stats
- URL: https://github.com/lesterwh/fitness-review-skill (single SKILL.md, Obsidian-oriented, bilingual).
- **Commands**: `/fitness-review` (default), `/fitness-log` (quick log, no questions; parses "Bench 3×8@70kg, squat 4×6@100kg"), `/fitness-plan`, `/fitness-deload`, `/fitness-pr`, `/fitness-stats [exercise] [3m]`, `/fitness-monthly YYYY-MM`.
- Review: collect RPE per working exercise one at a time; physiological state (duration, kcal, sleep, bodyweight, protein on target yes/no, DOMS 1–5); optional recovery metric (HRV, fatigue 1–5); recompute tonnage (unilateral not ×2, bodyweight excluded).
- **Overload rule**: RPE ≤7 → +2.5 kg; RPE 8 → same weight +1–2 reps; RPE 9–10 → −5% or fewer sets. Deload triggers: same exercise RPE ≥9 for 3+ consecutive sessions, 4+ weeks without rest week, persistent joint pain/motivation loss/sleep disruption/stall 3+ weeks; deload = 50–60% load, 2–3 sets, same exercises.
- Plan: equipment validation against presets (with dumbbell/cable increments!), push:pull volume ratio 1:0.8–1:1.2 check, time caps per day.
- PR file: `| Exercise | PR Weight | Reps | Date | Notes |`; auto-detect PRs after review ("🏆 New PR"). Stats output: per-session top set table + trend % + stalls (same weight 3+ sessions).
- Monthly logs `YYYY-MM-training-log.md` with Markdown tables; "always preserve header row and separator row".
- **Good**: crisp RPE→next-load mapping; equipment increments; PR detection; monthly review.
- **Weak**: user must hand-edit config paths in SKILL.md; RPE collected after the fact for last set only; minimal safety.

### 1.9 Nutrition-specific: NataMoroz `nutrition-coach`, xeroctation `macros-log`, Hermes `fitness-nutrition`
- **NataMoroz** (https://github.com/NataMoroz/nutrition-coach): `~/.nutrition-coach/user.md` (profile + `## Learnings` updated silently) + `meals.jsonl` append-only, one JSON per meal: `{"date":"2026-06-27","time":"08:00","food":"Oatmeal 100g, milk 200ml","kcal":320,"protein_g":14,"fat_g":8,"carbs_g":48}`; corrections appended with `"corrects":"HH:MM"`. Sex-specific guidance (cycle phases, postpartum/breastfeeding: no aggressive deficit, iron/bone). Lead with numbers; flag protein low / deficit beyond safe range / below floor.
- **xeroctation macros-log** (https://github.com/xeroctation/macros-log): `my-profile.md`, `my-products.md` (personal food DB, per-100g macros, fuzzy match), `food-log.md`; progress bar summaries (`Calories: 820 / 2350 ████░░░░░░ 35%`); unknown foods marked "(approx.)"; "data dump"/import commands for chat-only persistence; recalc TDEE on ≥1 kg weight change; "Protein is priority #1 ... < 80% of goal by evening → warn".
- **Hermes fitness-nutrition** (NousResearch/hermes-agent `optional-skills/health/fitness-nutrition`): uses free **wger** exercise API (690+ exercises with muscles/equipment/images) and **USDA FoodData Central** (DEMO_KEY) + stdlib calculators (BMI, Mifflin TDEE, 1RM Epley/Brzycki/Lombardi, macro splits, US Navy BF%).

### 1.10 Others worth knowing (briefly)
- **disco-trooper `hypertrophy-training`** (https://github.com/disco-trooper/skills): dense evidence summary with citations/PMIDs: MEV 6–10 / MAV 12–20 / MRV 20–26+ sets; max 6–8 hard sets per muscle per session; 2×/week frequency; 5–30 reps near failure; 1–2 RIR; mesocycle accumulation→intensification→deload; lengthened partials table; stimulus-to-fatigue ratio; supplement tiers; references/glossary. Knowledge-only (no state/logging).
- **Lancetnik `evidence-based-fitness-coach`** (https://github.com/Lancetnik/evidence-based-fitness-coach): "Rules of evidence" (calibrate confidence; don't name "the single best exercise"; consistency beats optimality), intake checklist, defaults table, and a strong **Gotchas** list: no bro-split default, no failure on compounds for beginners, no cardio right after lifting, no rigid by-the-hour meal plans, never cut calories "to be safe" (fat ≥30 g/day), goals as rates ("+1 rep/week", "−0.5% BW/week"), diet without lifting = muscle loss, women compare weight in same cycle phase. Clear exclusions in description (injury rehab, clinical nutrition, ED treatment, PEDs).
- **LiamMorrow LiftLog `create-liftlog-plan`**: generates an importable `.liftlogplan` JSON for the LiftLog app; **always run `node scripts/validate-plan.mjs` and fix until it passes**; "Don't interrogate someone who said 'give me a 3-day full body routine for a beginner'"; ask for an export rather than rebuild a plan from a verbal description.
- **mberg `fitness-tracker`** (mirrored in skillsmp dumps): one file per day `YYYY-MM-DD.md` with terse grammar — exercise name line, `- 185 - 8, 8, 8`, bodyweight `- 10, 10, 10`, duration `- 30m`, notes `// warmup`; parsed to CSV and queried with DuckDB; synced to GitHub/Obsidian.
- **pablovilas `pacecraft`** (road-running, trail-running, periodization): base 30–40% / build 30–40% / peak 10–20% / taper; 3:1, 2:1 (masters, injury-prone, high stress), 4:1 patterns; signs to progress/extend a phase.
- **revfactory `harness-100` #74 fitness-program** (`periodization-engine`, `fitness-program` skills used by multi-agent "program-architect"/"template-builder"): linear/DUP/block templates with %1RM; volume table by level (MV/MEV/MAV/MRV); RPE→RIR→%1RM table. Generic but tidy.
- **H1an1 `health-coach`**: broad (meal photo analysis, lab interpretation, body metrics with 7-day avg/30-day trend, reminders); "All personal data stays in the user's workspace. Never commit health data to shared repos."
- **K-Dense `exercise-physiologist`**: expert-persona "operating mind" (Fick principle, VT1/RCP/MLSS, CPET) — lab-science depth, not a coaching workflow.
- **Weak/anti-pattern examples**: OneWave-AI `workout-program-designer` (generic template with placeholders like "[Sample user request here]"), tatat `fitness-coach` (output format only), clawd-team `workout-logger` (feature list, no instructions/format). These show that a skill without state, formats, rules and safety adds little over a base model.
- Other repos found but not fetched in depth (access/time): MuscleOtter/rowan-fitness-skill ("independent AI review and a portable Training Record"), danilogj/fitcoach-pro ("deterministic tools instead of model arithmetic"), kaustin923/agent-fitness-coach ("files are the database, skills are the features, the agent is the app"), krishnabhat/fitness-copilot (HEVY/Oura/Apple Health), Capybara335/Hybrid-Athlete-Coach, AryanHamedani senior-gym-trainer (safety screening), chuazj/cycling-fitness-coach & estruyf/skill-cycling-plan-coach (intervals.icu/Zwift), AboveColin/hevy-api-knowledge, ironledgerapp/skills, Krtvy/gym-plan-artifact-skill (phone-friendly visual plan), otto-tries-to-build-stuff/workout-app-builder (timer web app).

---

## 2. Cross-cutting comparison

| Skill | Intake | Program design | Progression | Log format | Check-in loop | Safety | Deterministic math |
|---|---|---|---|---|---|---|---|
| clawic fitness | implicit baselines, no questionnaire | split by days, movement floor | double progression, e1RM, layoff table | 1 line/session `log.md` + `memory.md` baselines + `config.yaml` | readiness check | red-flag table + output gates | no |
| neilberget | 5–6 grouped rounds | session-by-session + weekly compass | last-log based | MD newest-first entries | weekly (≥7d & ≥3 sessions) + optional daily cron | stop list | no |
| Yuvasee trainer | reusable intake, graceful degradation | plan.md + adaptation log | via knowledge | typed JSONL events | periodic re-assess triggers | best (cited) | yes (Python) |
| npapatheodorou | profile template + YES/SUB/NO library | 12-wk block | 2 sessions at top of range @ RPE | text table per session | none | minimal | no |
| claude-coach | Strava or manual + validation gate | phases, TSS/CTL | CTL ramp | Strava SQLite; plan JSON | none | minimal | partially (CLI) |
| running-coach | race inputs | phases, pace zones | 5–10%/wk, 3:1 | week-N.md | weekly planned-vs-actual review | minimal | yes (pace script) |
| strength-coach | onboard/kit skills | program versions | engine flags | engine store + Hevy | weekly card | niggle tracking | yes (engine) |
| fitness-review | config | weekly table | RPE→load map | monthly MD tables + PR file | post-session | minimal | no |

Gaps nobody covers well:
- A single log format that is **both** human-friendly Markdown **and** machine-parseable per set (most choose one).
- Per-set RPE/RIR capture with fast entry during a session.
- Combining strength + running + nutrition under one weekly plan with interference rules (only clawic touches concurrent training).
- Technique/form coaching beyond "YouTube search link".
- Explicit pre-participation screening (PAR-Q+) at intake — only Yuvasee and neilberget collect clinician restrictions; nobody uses PAR-Q+ explicitly.
- Testing/evals of skill behaviour (only joeuk89 has a test suite, for its engine).

---

## 3. Best ideas to borrow

**Architecture & state**
1. Lean SKILL.md router + on-demand references (training, nutrition, safety, formats); an `INDEX.md` mapping topic → file/section (Yuvasee).
2. Data home outside the skill bundle with env override (`$X_HOME`), resolved once to an **absolute path** (permission-matcher friendly), plus a one-time offer to add allow rules (neilberget).
3. Separate files by job: `config` (declared prefs) / `profile` or `memory` (derived baselines with "as of" dates, injury exclusions) / append-only `log` / living `plan` with an **adaptation log** citing the trigger for each change (clawic + Yuvasee).
4. Append-only log; corrections are new entries that supersede (`corrects` field / same-ts last-wins) — never rewrite history (Yuvasee, NataMoroz).
5. Log **missed** sessions with a reason tag (travel/time/illness/pain) — enables attendance rate, layoff discount, and "pattern over blame" (clawic, joeuk89).
6. Newest-first Markdown log if the agent reads it directly (read only the top N lines); or JSONL/one-line-per-session if tools compute trends. Consider: human Markdown log + machine JSONL, or the terse grammar `- 100kg x 8, 8, 7 @RIR2` that's both readable and parseable (mberg/clawic).
7. ISO dates (`YYYY-MM-DD`) everywhere; explicit **date anchoring** (weekday + days-ago + sequence) before reasoning about recovery (neilberget).
8. Exercise library with **YES / SUB / NO** status and preferred substitutions (npapatheodorou), plus equipment presets with actual increments (dumbbell steps, plate math) so prescribed loads are achievable (lesterwh, joeuk89).

**Intake / assessment**
9. Grouped-round onboarding (bio+safety → specific measurable goals with an example → preferences → equipment per location → life context), then show the saved profile for correction (neilberget).
10. Graceful degradation: ask only for the single missing field needed now; priority list of which fields unlock which capabilities (Yuvasee). Don't interrogate someone who gave enough (LiftLog).
11. Foundation vs current form distinction (claude-coach) and classify training age by observed response, not self-report (clawic).
12. Starting loads without history: ramp to a load that ends at RIR 3 for 8 reps; flag Week 1 as calibration; "err low" (clawic, npapatheodorou).
13. Validate the assessment with the athlete before writing a plan (claude-coach).

**Programming & progression rules (concrete, numeric)**
14. Double progression with explicit increments (+2.5% upper / +5% lower, or +2.5/+5 kg) and worked example; beginners linear until first stall (clawic).
15. RPE→next-load mapping: ≤7 add load; 8 add reps; 9–10 hold/back off 5% (lesterwh); "If last session was a grinder → repeat" (neilberget).
16. Stall definition (3 sessions) + diagnostic order cheapest first: audit execution → sleep/deficit → deload & resume at 90% → change one variable (clawic).
17. Layoff discount table; never stack missed workouts; weekly compass rather than schedule debt; "shrink the session before changing the training intent" (clawic, neilberget).
18. Program to logged attendance + 1 day, not stated ambition (clawic). Low adherence → fewer sessions, same weekly hard sets (joeuk89).
19. Deload on evidence (2 sessions below logged numbers, RHR +5 bpm ×3 mornings, RPE ≥9 ×3) with calendar backstop 4–8 weeks (clawic, lesterwh).
20. Weekly movement floor & push:pull balance check (clawic, lesterwh). Volume corridor 10–20 hard sets/muscle/week, ≤6–8 per session (clawic, disco-trooper).
21. Endurance: 80/20 intensity, HR zones in actual bpm (Karvonen + Tanaka), foundation-vs-form, CTL ramp caps, avoid single-run spikes >10–30% of longest recent run rather than the 10% rule (clawic, claude-coach, Yuvasee).

**Output discipline**
22. "Every prescription = exercise + sets × reps + load or RIR + rest" and "runnable as-written" — no "moderate weight" (clawic, neilberget).
23. **Output gates** checklist before emitting any plan (clawic) — easy to adapt as a self-check section.
24. Session template with Focus + "Why this" tying to goals and recent log (neilberget); "What now?" = one action + why + watch-for (Yuvasee).
25. Plans as structured data (JSON schema) rendered to a viewer; durations must add up (claude-coach); validate generated files with a script before handing over (LiftLog).
26. Exercise names linked to a form-demo search (neilberget) — cheap technique aid.

**Review loops**
27. Weekly check-in with due-logic (≥7 days AND ≥3 sessions), surfaced as one line without blocking the request; grounded in recent log; reflect back and confirm before saving (neilberget).
28. Planned-vs-actual weekly review: athlete's perspective first, one question at a time, one or two focus points for next week, persisted coaching notes (ColinEberhardt).
29. Post-session quick-log vs full-review modes; PR auto-detection; per-lift stats with trend and stall flags; monthly report (lesterwh, clawic workouts).
30. Readiness rule: 2 of 3 (RHR, sleep ≥6h, appetite) failed → convert to Z2/technique rather than cancel (clawic).

**Safety & honesty**
31. Red-flag table (signal → suspicion → action) that suspends programming (clawic) + ACSM symptom list, refer-out table, clearance populations, disordered-eating signs, REDs, %BW weight-change bounds, calorie floor ≈ BMR (Yuvasee safety.md).
32. DOMS-vs-injury discriminator; niggle lifecycle (reported/aggravated/easing/resolved) with escalation when pain changes gait, sleep or daily tasks (clawic, joeuk89).
33. "Never do mental math" — compute TDEE, e1RM, zones, paces, tonnage with a script (Yuvasee, ColinEberhardt pace script, Hermes calculators). Never fabricate log entries, numbers, or citations.
34. Evidence posture: cite briefly, grade confidence, name where experts disagree, reject pseudoscience (npapatheodorou, Lancetnik, clawic). Lancetnik-style Gotchas list of common AI-coach mistakes.
35. Consent: dry-run / show diff before writing durable state; "records nothing until you say yes" (joeuk89, Yuvasee "confirm before overwrite").
36. Privacy: keep health data in the user's home/workspace, never commit to shared repos (H1an1); be cautious of third-party skills (ClawHub flagged "Fit Mate").

## 4. Pitfalls observed (to avoid)
- Generic persona prompts with placeholder output templates and no state (OneWave-AI, tatat).
- Over-long monolithic SKILL.md (20–26 KB) that loads every turn; better to push detail into references.
- Persona excess (banter, emojis) that dilutes signal (running-coach).
- Fixed-width text tables and DD/MM dates that are hard to parse/sort (npapatheodorou).
- Config that requires the user to edit SKILL.md itself (lesterwh).
- Plans that are one-shot artifacts with no logging/adaptation loop (claude-coach).
- Heavy external dependencies (Strava OAuth, Hevy Pro, uv/npm engines) as hard requirements rather than optional enrichments.

## 5. Source URLs
- https://github.com/clawic/skills/tree/main/skills/fitness (also `workouts`, `gym`, `personal-trainer`, `nutrition`)
- https://github.com/neilberget/fitness-skill
- https://github.com/Yuvasee/trainer
- https://github.com/npapatheodorou/personal-trainer-skill (copy: https://github.com/blopa/musclog-app/tree/main/.claude/skills/personal-trainer)
- https://github.com/felixrieseberg/claude-coach (fork: https://github.com/sundial-org/awesome-openclaw-skills/tree/main/skills/endurance-coach)
- https://github.com/ColinEberhardt/claude-running-coach
- https://github.com/joeuk89/strength-coach
- https://github.com/lesterwh/fitness-review-skill
- https://github.com/NataMoroz/nutrition-coach
- https://github.com/xeroctation/macros-log
- https://github.com/NousResearch/hermes-agent/tree/main/optional-skills/health/fitness-nutrition
- https://github.com/disco-trooper/skills/tree/main/hypertrophy-training
- https://github.com/Lancetnik/evidence-based-fitness-coach
- https://github.com/LiamMorrow/LiftLog/tree/main/plugins/liftlog-plan-builder
- https://github.com/pablovilas/pacecraft
- https://github.com/revfactory/harness-100/tree/main/en/74-fitness-program
- https://github.com/H1an1/health-coach
- https://github.com/K-Dense-AI/scientific-agents
- https://github.com/OneWave-AI/claude-skills/tree/main/workout-program-designer
- mberg fitness-tracker (via mirror): https://github.com/David-Li0406/meta-skill-evloving/blob/main/skill-flow/data/skills-refined-36k/skillsmp/fitness-tracker/SKILL.md
- Directories: https://skillsmp.com , https://skills.sh , https://clawhub.ai/skills/personal-trainer , https://clawhub.ai/skills/workout-logger , https://claudemarketplaces.com/skills/tatat/agents-playground/fitness-coach
