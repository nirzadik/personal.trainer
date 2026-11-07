# 05: Coaching practice, workout tracking and skill design

Research for a Claude Agent Skill that acts as a personal trainer. The skill co-designs a workout plan with the user and tracks it over time in files.
Researched 2026-11-04.

**Network note.** WebSearch worked. WebFetch could reach only Anthropic hosts (platform.claude.com, code.claude.com, anthropic.com) and GitHub raw. Many fitness sites were unreachable from this sandbox: coachway.io, hubfit.com, acefitness.org, docs.rs and api.hevyapp.com. Part A therefore relies on search-result syntheses plus established practitioner and academic knowledge. Each claim is labelled with its evidence strength:
- **[evidence]**: research-backed.
- **[consensus]**: practitioner consensus.
- **[vendor]**: an app or vendor claim.

Part B comes from primary Anthropic sources that were fetched in full.

---

## Contents

**Part A: Coaching and tracking practice**
- A1. Intake (questionnaire contents, screening, consent)
- A2. Check-ins (weekly template, scales, cadence)
- A3. Adherence (SDT and autonomy support, MI/OARS, habit formation)
- A4. Workout logging (per-set fields, session notes, readiness, bodyweight)
- A5. App data models (Hevy schema verified; Strong CSV; RP; Boostcamp; JEFIT)
- A6. Progress metrics (e1RM, volume load, sets per muscle, adherence %)
- A7. Decision rules (progression, stalls, regression, deloads)
- A8. Exercise substitution logic (movement patterns)
- A9. Proposed file data model for the skill

**Part B: Skill authoring best practices**
- B1. Frontmatter rules and limits
- B2. Writing the description (triggering)
- B3. Progressive disclosure and structure
- B4. Writing style
- B5. Workflows, templates, feedback loops, scripts
- B6. Evaluation and iteration (skill-creator process)
- B7. Claude Code-specific frontmatter and behaviors
- B8. Checklist and implications for this skill

Sources are listed at the end.

---

# PART A: COACHING AND TRACKING PRACTICE

## A1. Intake

### Two-stage structure [consensus]
Online-coaching sources separate two questions:
1. **Readiness screening.** Is it safe to start? This is a PAR-Q+ style screen.
2. **Programming intake.** What should the first program look like?

Online coaching makes a thorough intake more important, because the coach often programs for someone they have never seen move.
(Search synthesis: coachway.io intake form and PAR-Q templates, exercise.com, wellnesscreatives.com, pabau.com.)

### Screening [evidence]
- **PAR-Q+.** Use the PAR-Q+ (CSEP / ePARmed-X+), the current version of the original PAR-Q. Its follow-up questions per condition reduce unnecessary medical referrals.
- **ACSM 2015 pre-participation algorithm** (Riebe et al., *MSSE* 2015). Referral depends on three things:
  1. Whether the person currently exercises.
  2. Known cardiovascular, metabolic or renal disease, or signs and symptoms of it.
  3. The desired exercise intensity.

  This update cut physician referrals by about 41% compared with the earlier version (Whitfield et al., 2017).
- **What this means for the skill.** Ask a short set of screening questions. If any red flag appears, recommend medical clearance before training and keep the plan conservative. Red flags include:
  - chest pain or discomfort on exertion
  - fainting or dizziness
  - unexplained shortness of breath
  - known heart, kidney or metabolic disease
  - pregnancy
  - recent surgery
  - acute injury

  Use a "not medical advice" framing. Most templates include a consent block stating that coaching is not medical treatment.

### Intake questionnaire contents [consensus; aggregated across coaching templates]
Commonly covered sections: goals, training history, injuries, lifestyle, nutrition, availability, equipment, medications, activity level and consent. A practical intake for the skill:

| Section | Questions / fields |
|---|---|
| **Goals** | Primary goal (strength / hypertrophy / fat loss / general health / sport / performance on a specific lift or event). Secondary goals. Why it matters now (an MI "importance" probe). Target date or event. What success looks like in 12 weeks. |
| **Training history** | Years of consistent training. Current routine (days, split, main lifts). Known bests or working weights (e.g., 5RM squat). Comfort with the main lifts (technique confidence 1–5). Past programs that worked or failed and why. Longest period of consistency. |
| **Schedule** | Days per week realistically available. Minutes per session. Preferred days and times. Travel or shift work. Seasonal disruptions. |
| **Equipment** | Gym type (commercial / home / hotel / none). Inventory: barbell, rack, bench, adjustable dumbbells (max weight), cables, machines, bands, pull-up bar, kettlebells, cardio equipment. |
| **Injuries and health** | PAR-Q+ items. Current pain (location, 0–10, aggravating movements). Past injuries and surgeries. Medications that affect exercise (e.g., beta-blockers make heart rate and RPE less reliable). Clinician restrictions. |
| **Lifestyle and recovery** | Sleep hours and quality. Stress (1–10). Job activity level and daily steps. Nutrition approach (and whether the user wants nutrition guidance at all). Alcohol. Other sports or cardio. |
| **Preferences** | Exercises they love or hate. Preferred style (structured vs. flexible). Session feel (fast and dense vs. relaxed). Coaching tone (direct vs. encouraging). How much data they will log (minimal vs. detailed RIR). Preferred units (kg/lb). |
| **Measurements (optional)** | Bodyweight. Height. Waist. Photos (user-held). Baseline tests such as push-ups to failure, a rep-max on the main lifts, or a timed carry or plank. |
| **Logistics and consent** | Check-in day. Acknowledgement that this is not medical advice. Consent to store data in local files. |

**Design tip for the skill.** Do not ask all of this at once. Use the "minimum viable intake" principle:
1. Ask the 6–8 questions that block programming: goal, days and minutes, equipment, injuries/screen, experience, and exercise preferences.
2. Fill in the rest over the first 1–2 check-ins.

Long forms reduce completion; the check-in guidance below makes the same point.

---

## A2. Weekly check-ins

### Cadence and length [consensus / vendor]
- Hold check-ins weekly, on a fixed day.
- Keep them short. About 8–12 questions built on a fixed core, completable in under 2 minutes. Templates report that completion drops sharply beyond about 10 questions.
- Read for trends, not single weeks. One template suggests that three consecutive weeks of falling energy with stable sleep should prompt a review of training load.
- Add conditional follow-ups. For example, low energy triggers questions about sleep and recovery.

(Sources: typeform.com fitness weekly check-in template, hubfit.com 12-field form, mypthub.net, quickcoach.fit, gymkee.com, coachway.io; via search.)

### Proposed weekly check-in template (fixed core)
1. **Sessions completed vs. planned** (e.g., 3/4). Adherence % is computed from this.
2. **Overall training feel this week** (1–10).
3. **Energy** (1–10).
4. **Sleep quality** (1–10) and average hours.
5. **Stress** (1–10).
6. **Soreness / recovery** (1–10). Note any joint pain, with location and 0–10 rating.
7. **Bodyweight 7-day average** (if tracking) and optionally waist.
8. **Nutrition adherence** (1–10 or "on plan" days), only if in scope.
9. **Wins this week** (open). This affirms competence (SDT).
10. **Obstacles / what got in the way** (open).
11. **One thing to change or focus on next week** (open). This is the user's own choice and supports autonomy.
12. **Any pain, injuries or schedule changes coming up?**

### Coach response pattern [consensus + MI]
Structure each reply as follows:
1. **Reflect and summarize** what you heard (OARS).
2. **Affirm** specific effort.
3. **Present data**: adherence %, e1RM trends and volume.
4. **Offer 1–2 adjustments with a rationale and a choice** (autonomy support).
5. **Confirm** next week's plan.

Avoid changing more than 1–2 variables per week. Otherwise you cannot tell what worked.

### Readiness / wellness (per session, optional) [evidence]
- **Hooper Index** (Hooper and Mackinnon, 1995). A pre-session self-report of four items: sleep quality, stress, fatigue and muscle soreness. The ratings are summed. It is cheap and non-invasive. In professional soccer it tracked match-induced fatigue better than resting HRV.
- **Session-RPE load** (Foster et al., 2001). Load = session RPE (CR-10) × duration in minutes. Use it to track weekly internal load and spikes.
- **Lightweight version for the skill.** Before a session, ask for a "readiness 1–5", or sleep, stress and soreness on 1–5. After the session, ask for session RPE (1–10). Store both.

---

## A3. Adherence

### Self-determination theory (SDT) and autonomy-supportive coaching [evidence, mixed but consistent direction]
SDT names three basic needs:
- **autonomy**: volition and choice
- **competence**: feeling effective
- **relatedness**: feeling connected and cared for

Autonomous motivation, meaning intrinsic or identified reasons, predicts long-term exercise persistence better than controlled motivation (guilt or pressure).

Studies:
- **Almagro et al., 2010** (*JSSM*, 608 adolescent athletes). Coach autonomy support → perceived autonomy → intrinsic motivation → intention to stay active.
- **Edmunds, Ntoumanis and Duda, 2007** (*Psych Sport Exerc*, exercise-on-prescription). Need satisfaction relates to adherence and well-being.
- **Yan et al., 2025** (*BMC Public Health*). Autonomy support acts indirectly through autonomous motivation.
- **Null result.** One small 8-week thesis study (UND) found no significant prediction.
- **Takeaway.** Autonomy support works *through* autonomous motivation, not directly.

Concrete autonomy-supportive behaviors (well established in the SDT coaching literature, e.g., Ng et al. 2012 meta-analysis; Teixeira et al. 2012 review):
- **Offer meaningful choice.** For example, "Bulgarian split squat or walking lunges for this slot?" or "3 or 4 days?"
- **Give the rationale** for every prescription ("we keep 2 reps in reserve so you can add load next week").
- **Acknowledge feelings and difficulty.** Avoid controlling language ("you must", "you should have").
- **Invite the client's input** and let them set their own weekly focus.
- **Build competence.** Set achievable progressions, give specific positive feedback, and make progress visible (PR log, trend charts).
- **Build relatedness.** Remember personal details, show warmth, and follow up.

### Motivational interviewing (MI) [evidence for health behavior broadly; PT-specific evidence weaker]
MI was developed by Miller and Rollnick. Its spirit is partnership, acceptance, compassion and evocation.

**OARS:**
- **Open questions.** "What would make training feel worth it for you?" or "What got in the way this week?"
- **Affirmations.** "You got 3 sessions in during a brutal work week. That takes commitment."
- **Reflections.** Simple reflections repeat what was said. Complex reflections add meaning, e.g., "You want to get stronger, and you're worried about your back flaring up again."
- **Summaries.** Collect the key points, then ask "What did I miss?"

**Change talk** (DARN-CAT): Desire, Ability, Reasons, Need, Commitment, Activation, Taking steps.
- Evoke it and reflect it.
- Do not argue with sustain talk. Arguing hardens resistance ("righting reflex").
- Use the **readiness/confidence ruler**: "On 0–10, how confident are you that you can do 3 sessions this week? Why not lower? What would move it up one point?"
- Use **Elicit–Provide–Elicit** for advice: ask what they know, offer information with permission, then ask what they make of it.
- Pacing matters. Jumping into planning too early gets compliance without commitment.

(Sources: ACE "Revisiting MI", train.fitness, theptdc.com, motivationalinterviewing.org; via search.)

### Habit formation [evidence]
- **Lally et al., 2010** (*Eur J Soc Psych*, n=96). Median 66 days to habit automaticity, with a range of 18–254 days. Exercise behaviors were slower: a median of about 91 days, past the study's 84-day end. Missing a single day did not derail habit formation. Tell users that one missed session does not reset progress.
- **Implementation intentions** (Gollwitzer and Sheeran, 2006 meta-analysis, 94 studies, d≈0.65). These are "if-then" plans specifying when, where and how. For example: "Mon/Wed/Fri at 7am, after dropping kids at school, I go straight to the gym."
- **Practical habit levers** [consensus]:
  - a stable cue (same time and place)
  - a minimum viable session ("if short on time, do the A-block only, 20 min")
  - lower friction (pack the bag the night before)
  - track streaks and adherence without shaming
  - the "never miss twice" norm
  - plan for obstacles, such as a travel or hotel version of the plan

### Implications for the skill's coaching voice
- Ask before telling. Offer 2–3 options, recommend one, and explain why.
- Plan with the user, not for them. The user approves the plan before it is saved.
- At check-ins, start with what went well.
- Treat missed sessions as data, not failure. Explore barriers and adjust the plan to fit real life.
- Keep a "why" statement in the profile file and refer back to it.

---

## A4. Workout logging best practices

### Per-set fields [consensus; matches app schemas]
| Field | Notes |
|---|---|
| exercise (canonical id + display name) | Use consistent naming so trends are computable. |
| set index | Order within the exercise. |
| set type | warmup / working (normal) / top set / backoff / drop / failure / AMRAP. Warm-ups are excluded from volume and e1RM. |
| load | Number plus unit (kg/lb). For bodyweight moves: `bw`, plus added or assisted load. For bands: a level. |
| reps | Integer. For timed holds: `duration_s`. For carries: `distance_m` + load. |
| effort: RIR or RPE | RIR 0–5, or RPE 6–10 where RPE ≈ 10 − RIR (Zourdos/Helms RIR-based RPE scale). Log at least the last working set. |
| tempo (optional) | e.g., 3-1-1-0. |
| rest (optional) | Seconds. |
| notes | Form cues, pain, equipment variant ("Smith", "close grip"). |
| pain flag (optional) | Location and 0–10. Feeds the substitution and regression logic. |

**RIR accuracy** [evidence]:
- Zourdos et al. 2016 introduced and validated the RIR-based RPE scale. Experienced lifters' RPE related strongly to bar velocity.
- RIR predictions are more accurate close to failure. Mean error was about 2 reps at RPE 9 vs. about 5 reps at RPE 5, and higher-rep sets are less accurate (Zourdos et al., *JSCR* 2021).
- Lifters tend to underpredict RIR by about 1 rep (Halperin et al. scoping review, secondary).
- **Skill implication:** trust RIR more at 0–3 RIR and in lower-rep sets. Beginners' RIR is noisy, so for them use simpler rules (rep targets, "leave 1–2 good reps in the tank") and calibrate occasionally with an AMRAP set.

### Session-level fields
- date, start/end time or duration, plan day/session id (e.g., `W3-D2`), location/equipment context
- pre-session readiness (1–5 or Hooper-style), post-session sRPE (1–10)
- session notes (free text): energy, technique, anything abnormal
- deviations from plan: substitutions, skipped exercises, added work

### Body metrics
- Weigh 4–7 times a week, same conditions (morning, after the bathroom, before eating). Use the **7-day average** and read trends over 2–4 weeks [consensus].
- Target rates [consensus; e.g., Helms, Aragon and Fitschen 2014]:
  - fat loss: about 0.5–1.0% of bodyweight per week (upper end harder to sustain; leaner people should go slower)
  - lean gain: about 0.25–0.5% per week (common practice)
- Optional: waist circumference weekly, progress photos every 2–4 weeks (stored by the user).

---

## A5. App data models

### Hevy (verified from an OpenAPI-derived types file)
From `sundial-org/awesome-openclaw-skills/skills/hevy/src/types.ts` ("Generated from OpenAPI spec"). The official docs are at api.hevyapp.com/docs and API access needs Hevy Pro; that site was not reachable from this sandbox.
```
SetType = warmup | normal | failure | dropset
ExerciseType = weight_reps | reps_only | bodyweight_reps | bodyweight_assisted_reps |
               duration | weight_duration | distance_duration | short_distance_weight
MuscleGroup = abdominals | shoulders | biceps | triceps | forearms | quadriceps | hamstrings |
              calves | glutes | abductors | adductors | lats | upper_back | traps | lower_back |
              chest | cardio | neck | full_body | other
EquipmentCategory = none | barbell | dumbbell | kettlebell | machine | plate | resistance_band | suspension | other

Set { index, type, weight_kg|null, reps|null, distance_meters|null, duration_seconds|null, rpe|null, custom_metric|null }
RoutineSet extends Set { rep_range?: {start, end} }
Exercise { index, title, notes, exercise_template_id, supersets_id|null, sets[] }
RoutineExercise { index, title, rest_seconds|null, notes, exercise_template_id, supersets_id|null, sets: RoutineSet[] }
Workout { id, title, routine_id?, description, start_time, end_time, updated_at, created_at, exercises[] }
Routine { id, title, folder_id|null, notes?, exercises: RoutineExercise[] }
ExerciseTemplate { id, title, type: ExerciseType, primary_muscle_group, secondary_muscle_groups[], is_custom }
ExerciseHistoryEntry { workout_id, workout_title, workout_start_time, ..., weight_kg, reps, rpe, set_type }
```
Design lessons from this schema:
1. Keep **plan (routine)** separate from **log (workout)**. Routines carry `rep_range` and `rest_seconds` targets; workouts carry actuals.
2. The **exercise type** determines which set fields apply.
3. Each exercise template has **primary + secondary muscle groups**, so weekly sets per muscle can be computed.
4. Store weights in kg internally. Built-in template IDs are 8-character hex; custom templates use UUIDs.
5. Input uses `superset_id`, but responses return `supersets_id`.

Hevy's CSV export columns (third-party description): Date, Workout Name, Exercise Name, Set Order, Weight (kg), Reps, Distance (m), Duration (s), Notes, RPE.

### Strong (CSV export; third-party descriptions, not official docs)
Export path: Settings → Export Strong Data → CSV. One row per set:
`Date, Workout Name, Duration, Exercise Name, Set Order, Weight, Reps, Distance, Seconds, Notes, Workout Notes, RPE`

- RPE is optional or often empty.
- The file must be exported in English to import into Hevy.
- Strong cannot re-import its own CSV.
- App features [vendor]: tag sets as Warm Up / Failure / Drop. Supersets. Warm-up calculator. Rest timer. Notes and progress photos. Free tier limited to 3 custom routines.
- Lesson: a flat, tidy "one row per set" CSV is the de facto interchange format. Exercise names follow the "Bench Press (Barbell)" convention: movement plus equipment in parentheses.

### RP Hypertrophy app [vendor; no public schema]
- Per-session/per-muscle feedback: **soreness** (did it heal before this session?), **pump**, **workload/difficulty**, and **joint pain**. The app uses these week to week to set sets, load and reps.
- Mesocycles start near MEV, add sets across weeks, then deload. Load and rep targets are given per set.
- Lesson: structured per-muscle feedback after the last exercise for that muscle drives volume autoregulation (see A7).

### Boostcamp [vendor]
- Program-library app. Stores RPE per set, shows average RPE across a block, and supports autoregulation. No official export schema was found; a third-party Chrome extension exports history as CSV.

### JEFIT [vendor]
- Exercise database plus set/rep/weight logging. RPE/RIR is not a native free-tier field according to third-party comparisons. CSV export was mentioned but not confirmed. No public schema found.

### Other reference
- intervals.icu forum threads on importing Strong data confirm the same CSV header line.

---

## A6. Progress metrics

| Metric | Formula / method | Use |
|---|---|---|
| **e1RM (estimated 1-rep max)** | **Epley:** w × (1 + r/30). **Brzycki:** w × 36/(37 − r) = w / (1.0278 − 0.0278r). **RPE-adjusted:** use reps + RIR as "reps to failure", i.e., e1RM = w × (1 + (r + RIR)/30). | Trend per lift (best set per session). Most accurate for 1–10 reps, and especially from about 5RM. Equations tend to *underestimate* from high-rep sets. Use for trends, not absolutes. RPE charts disagree (e.g., 5 reps at RPE 8 ≈ 81–86%), so be consistent. |
| **Volume load (tonnage)** | Σ(load × reps) over working sets | Session and weekly workload per lift or muscle. Less meaningful across different exercises. |
| **Hard sets per muscle per week** | Count working sets within about 0–4 RIR. Count 1 for a primary mover; optionally 0.5 for a secondary mover (common practitioner convention). | Main hypertrophy dose variable. Schoenfeld et al. 2017: graded dose-response, 10+ sets per week > 5–9 > <5 (about 9.8% vs. 6.6% vs. 5.4% growth). Pelland et al. 2024 preprint: diminishing but continued returns at higher volumes. Strength also shows a graded dose-response (Ralston 2017). Practical range: about 10–20 hard sets per muscle per week for hypertrophy, starting lower (about 6–10) for beginners or when returning. |
| **Rep PRs / rep-max PRs** | Best reps at a given load. Best load at a given rep count. | Motivating, competence-building feedback. Log PR events. |
| **Adherence %** | sessions completed ÷ sessions planned (weekly and rolling 4-week). Optionally a set-level completion %. | Interpret strength trends only when adherence is at least ~80%. If adherence is low, fix the plan's fit before its content. |
| **Session RPE load** | sRPE × minutes (Foster) | Spot spikes. Keep week-to-week jumps moderate. |
| **Readiness trend** | Rolling mean of readiness or Hooper scores | Combine with performance to detect accumulated fatigue. |
| **Bodyweight trend** | 7-day moving average; weekly % change | Goal-rate tracking. |
| **Pain log** | Count and severity per joint or exercise | Triggers substitution or regression. |

---

## A7. Decision rules (when and how to adjust)

These are practitioner conventions, not validated cutoffs. Tune them to the individual. The general order is:
1. Check adherence and recovery.
2. Check whether the trend is really flat.
3. Then change one variable.

### Progression models (pick per lift and level)
- **Linear (novice).** Add load every session or week when all target reps are hit. Typical increments: +2.5–5 kg lower body, +1–2.5 kg upper body.
- **Double progression (default for accessories and many intermediates).** Use a rep range, e.g., 3×8–12.
  - Keep the load fixed and add reps until *all* sets reach the top of the range at the target RIR.
  - Then increase load by the smallest practical increment (about 2–5%) and restart at the bottom of the range.
  - Variant: dynamic double progression, where each set progresses independently.
- **RIR/RPE-based autoregulation (intermediate+).**
  - Prescribe, for example, "3×5 @ RPE 8".
  - If the logged RPE is below target, add load next time (about 2–5% per RPE point under). If it is above target, hold or reduce.
  - Or use top set + backoff: work to a top single or triple at RPE 8, then do backoffs at −10%.
- **Volume progression (hypertrophy blocks, RP-style).**
  - Start a 4–6-week mesocycle near the low end of the volume range.
  - Add about 1 set per muscle per week (or every 2 weeks) while recovery is on track, then deload.
  - Feedback rules: if soreness healed early, pump was good and performance rose → add a set. If soreness had not healed, joints hurt or performance dropped → hold or remove sets.

### Stall detection
- One bad session is noise (sleep, stress, food).
- **Stall:** e1RM (best set) flat or falling across **3–4 consecutive exposures** for that lift, *or* failing to hit the bottom of the rep range in 2 consecutive sessions, while adherence is good.
- **Fatigue signal:** e1RM drops about 5% or more while RPE at the same load is equal or higher, especially with falling readiness, sleep or mood, or rising soreness and joint pain.

### Stall / regression playbook (try in order, one change at a time)
1. **Check the basics.** Adherence ≥80%? Sleep, stress or calorie deficit? Technique drift? Is the load jump too large? If a lifestyle factor explains the stall, hold the program and address that factor.
2. **Short-term fatigue → deload.** Run 1 week:
   - cut sets about 30–50%
   - keep load moderate, or reduce it about 10%
   - cap effort at about RPE 6–7 (3–4 RIR)

   Then resume. Many coaches also schedule a deload every 4–8 weeks, or whenever fatigue signals cluster.
3. **Reset the load.** Reduce about 5–10% and build back up (common on linear programs).
4. **Change the rep scheme or progression model.** Move from linear to double progression or RPE-based, or from 5s to 6–8s.
5. **Adjust volume.** Add 1–2 sets per week if recovery is clearly fine and volume is low. Remove sets if recovery is poor.
6. **Rotate the exercise variant** within the same movement pattern (see A8) after about 4–8+ weeks of stagnation, or if pain appears.
7. **Re-evaluate the goal or phase.** In a calorie deficit, maintaining strength may be the realistic goal.

### Pain rules [consensus; not medical advice]
- Mild pain (≤3/10) that does not worsen during the session or the next day: continue with modifications (range, tempo, load).
- Pain above 3/10, worsening pain, or sharp pain: stop that exercise and substitute a pain-free variant in the same pattern.
- Persistent pain, or red flags such as numbness, swelling or night pain: refer to a clinician.

### Plan-level review cadence
- **Weekly (check-in):** adherence, readiness and any pain. Make micro-adjustments (load or rep targets, one substitution).
- **Every 4–6 weeks (block end):** e1RM trends, weekly sets per muscle vs. target, bodyweight vs. goal rate, and the user's enjoyment. Decide whether to continue, progress or change the block.
- **Every 12 weeks:** goal review and a new macro plan.

---

## A8. Exercise substitution logic

### Pattern taxonomy [consensus]
Pattern frameworks vary. Dan John uses push, pull, hinge, squat and loaded carry. Rusin adds the lunge. Others use 8 patterns, splitting push and pull into horizontal and vertical. A practical taxonomy for the skill:

| Pattern | Examples (rough order of loadability / skill) |
|---|---|
| **Squat** (knee-dominant, bilateral) | back squat, front squat, safety-bar squat, hack squat, leg press, goblet squat, box squat, Smith squat, bodyweight squat |
| **Hinge** (hip-dominant) | deadlift, trap-bar deadlift, Romanian deadlift (RDL), good morning, hip thrust/glute bridge, kettlebell swing, back extension, single-leg RDL |
| **Lunge / single-leg** | Bulgarian split squat, reverse lunge, walking lunge, step-up, split squat, single-leg press, pistol progressions |
| **Horizontal push** | bench press (barbell/dumbbell), incline press, machine chest press, floor press, push-up (incline → deficit → weighted), dips (also vertical-ish) |
| **Vertical push** | overhead press (barbell/dumbbell), landmine press, machine shoulder press, pike push-up, handstand push-up |
| **Horizontal pull** | barbell row, chest-supported row, dumbbell row, cable row, seal row, inverted row, band row |
| **Vertical pull** | pull-up/chin-up, assisted pull-up, lat pulldown, band pulldown, negatives |
| **Carry** | farmer's carry, suitcase carry (anti-lateral flexion), front-rack carry, overhead carry |
| **Core** | anti-extension (plank, ab wheel, dead bug), anti-rotation (Pallof press), anti-lateral flexion (side plank, suitcase carry), flexion (cable crunch, hanging leg raise) |
| **Isolation (by muscle)** | biceps curls, triceps extensions, lateral raises, rear-delt flyes, leg extension, leg curl, calf raise, chest fly |

### Substitution algorithm (for a script or reference file)
Given an exercise X that cannot be done (equipment, pain or preference):
1. **Same movement pattern** and the **same primary muscles** (e.g., quads for squat; glutes and hamstrings for hinge). Match the pattern, not just the muscle.
2. **Available equipment** filter, from the user profile's equipment list.
3. **Pain/injury constraints.** Filter out the aggravating features: deep knee flexion, overhead position, spinal loading, impact, grip. Prefer supported or stable variants such as machines or chest-supported rows.
4. **Similar loadability and skill level.** Prefer variants that allow progressive loading. Bilateral free-weight → machine → unilateral → bodyweight/band is a decreasing-load ladder. A substitute may cap available load, so adjust rep ranges upward (e.g., 6–8 → 10–15 with dumbbells or bands).
5. **Similar range of motion and lengthened-position stimulus** where possible.
6. **Preference.** Use liked exercises first and never use disliked ones.
7. **Re-baseline the load.** Start a new exercise conservatively at about 3 RIR and treat its first session as calibration. Do not carry over e1RM.
8. **Record** the substitution with its reason in the plan or log, so trends are tracked per exercise and the main lift can be restored later.

Keep a canonical exercise library file with these fields:
`id, name, pattern, primary_muscles, secondary_muscles, equipment[], laterality, loadability (1-5), skill (1-5), joint_stress tags (knee_flexion_deep, overhead, spinal_axial, wrist_extension...), regressions[], progressions[], alternatives[]`.

---

## A9. Proposed file data model for the skill

This is a synthesis of the findings above, combining Hevy's plan/log split and Strong's flat CSV.

```
fitness/                               # user's data dir (configurable)
├── profile.md                         # intake: goals + "why", schedule, equipment, injuries/screen, preferences, units
├── plan/
│   ├── current-plan.md                # human-readable program: block, phase, weekly template, progression rules
│   └── archive/2026-11-block1.md
├── logs/
│   └── sets.csv                       # one row per set (append-only)
├── sessions.csv                       # one row per session: date, session_id, duration_min, readiness, srpe, notes
├── checkins/2026-W45.md               # weekly check-in Q&A + coach summary + adjustments made
├── body.csv                           # date, bodyweight, waist, notes
├── prs.md (or derived)                # personal records
└── decisions.md                       # changelog: date, what changed, why (keeps coaching auditable)
```

Suggested `sets.csv` header:
`date,session_id,exercise_id,exercise_name,set_index,set_type,load,unit,reps,rir,rpe,duration_s,distance_m,tempo,rest_s,pain,notes`

Suggested plan prescription per exercise:
`exercise_id, sets, rep_range [lo,hi], target_rir, load_start, progression_rule (linear|double|rpe|volume), increment, rest_s, alternatives[]`

Scripts worth bundling (deterministic computation saves tokens and improves reliability):
- `scripts/progress_report.py`: e1RM trend per lift, weekly hard sets per muscle, tonnage, adherence %, bodyweight 7-day average, stall and fatigue flags.
- `scripts/next_session.py`: apply the progression rules to the last log and output today's targets.
- `scripts/validate_log.py`: check CSV schema, units, unknown exercise IDs.
- Optional: `scripts/import_strong_hevy.py`, mapping a Strong or Hevy CSV onto `sets.csv`.

---

# PART B: SKILL AUTHORING BEST PRACTICES (Anthropic primary sources)

## B1. Frontmatter rules and limits
Sources: platform.claude.com overview and best-practices pages (fetched).
- **Required fields:** `name` and `description`.
- **`name`:**
  - at most 64 characters
  - lowercase letters, numbers and hyphens only
  - no XML tags
  - cannot contain the reserved words `anthropic` or `claude`
- **`description`:**
  - non-empty
  - at most 1,024 characters
  - no XML tags
  - must say both *what the skill does* and *when to use it*
- **Naming convention:** gerund form is recommended (`processing-pdfs`, `analyzing-spreadsheets`). Noun phrases (`pdf-processing`) and action forms (`process-pdfs`) are acceptable. Avoid vague names (`helper`, `utils`), overly generic names (`documents`, `data`) and reserved words. For this skill, candidates are `personal-training`, `coaching-workouts` or `training-coach`.
- **Optional fields outside Claude Code:** claude.ai uploads, the Skills API and `package_skill.py` accept only `name`, `description`, `license`, `compatibility`, `metadata` and `allowed-tools`. **Other keys cause a hard error.** (code.claude.com/docs/en/skills)
- `compatibility` takes up to 500 characters. skill-creator says it is "optional, rarely needed".
- The open standard spec lives at agentskills.io/specification (not reachable from this sandbox). The `anthropics/skills/spec` file just points there.

## B2. Writing the description (triggering)
- **Always third person.** The description is injected into the system prompt, so "Processes Excel files…" is right. Avoid "I can help…" and "You can use this…".
- **Be specific and include key terms and triggers.** Claude picks among potentially 100+ skills using only the description.
  - Good pattern: `"<What it does>. Use when <contexts / user phrases / file types>."`
  - Bad: "Helps with documents".
- **Be somewhat "pushy"** (skill-creator). "Currently Claude has a tendency to 'undertrigger' skills… please make the skill descriptions a little bit 'pushy'." Its example: "...Make sure to use this skill whenever the user mentions dashboards, data visualization, internal metrics…, even if they don't explicitly ask for a 'dashboard.'"
- **All "when to use" information belongs in the description**, not the body. The body loads only after triggering.
- **Claude Code specifics.** `description` + `when_to_use` are truncated at **1,536 characters** in the listing. Put the key use case first, since truncation cuts from the end.
- **Triggering reality** (skill-creator): "Claude only consults skills for tasks it can't easily handle on its own". Simple one-step queries may not trigger even with a perfect description. Multi-step, specialized tasks trigger reliably. A personal-trainer skill fits this well (plan design, logging, check-ins).
- **Description optimization loop** (skill-creator):
  1. Write 20 realistic queries: 8–10 should trigger and 8–10 should not, with the negatives as *near-misses*.
  2. Run `scripts.run_loop`. It uses a 60/40 train/test split, runs each query 3 times, iterates up to 5 times, and picks `best_description` by *test* score.

**Draft description for this skill** (illustrative, about 600 characters):
> Acts as a personal trainer that co-designs a strength/fitness training plan with the user and tracks it over time in local files (profile, plan, set-by-set workout logs, weekly check-ins, bodyweight). Use whenever the user wants a workout plan or program, asks what to do at the gym today, wants to log a workout/sets/reps/weights, reports how training went, asks about progress, PRs, plateaus, deloads, or exercise swaps for equipment or injuries, or wants a weekly fitness check-in, even if they don't say "personal trainer". Not for medical diagnosis or detailed meal planning.

## B3. Progressive disclosure and structure
- **Three levels** (overview page):

  | Level | When loaded | Token cost | Content |
  |---|---|---|---|
  | 1: Metadata | Always (startup) | ~100 tokens per skill | name + description |
  | 2: Instructions | When triggered | Under 5k tokens | SKILL.md body |
  | 3+: Resources | As needed | None until accessed | Reference files are read; scripts run and only their output enters context |

- **Keep the SKILL.md body under 500 lines.** Split into separate files as it approaches that.
- **Keep references one level deep from SKILL.md.** Nested references can lead Claude to read files partially (`head -100`).
- **Tables of contents.** Add one to reference files over 100 lines (best-practices doc). skill-creator says over 300 lines.
- **Directory anatomy** (skill-creator):
  ```
  skill-name/
  ├── SKILL.md (required: frontmatter + instructions)
  ├── scripts/     executable code for deterministic/repetitive tasks
  ├── references/  docs loaded into context as needed
  └── assets/      files used in output (templates, icons, fonts)
  ```
- **Patterns:**
  1. High-level guide with links ("Form filling: see FORMS.md").
  2. Domain-specific organization (`reference/finance.md`, `reference/sales.md`). Claude reads only the relevant one.
  3. Conditional details (basic content inline, advanced content linked).
- **Say when to read each file.** For example: "Before designing a plan, read references/program-design.md".
- **Name files descriptively** (`exercise_library.md`, not `doc2.md`). Use forward slashes only.
- **Bundled content has no context penalty until it is read.** Comprehensive references are fine.
- **Scripts:** be explicit whether Claude should *run* a script ("Run `scripts/progress_report.py`") or *read* it as reference. Running is preferred: it is more reliable and saves tokens.

**Suggested layout for the personal-trainer skill:**
```
personal-training/
├── SKILL.md                      # role, workflow router (intake → plan → log → check-in → review), file conventions, safety
├── references/
│   ├── intake.md                 # screening + intake question bank, minimum-viable intake
│   ├── program-design.md         # splits by days/goal, volume targets, rep ranges, progression models
│   ├── progression-rules.md      # decision rules for progression/stalls/deload/pain (A7)
│   ├── exercise-library.md       # pattern taxonomy + substitutions (A8)  (or assets/exercises.csv)
│   ├── checkin.md                # weekly check-in template + MI/SDT coaching style guide
│   └── data-format.md            # file layout + CSV schemas (A9)
├── scripts/
│   ├── progress_report.py
│   ├── next_session.py
│   └── validate_log.py
└── assets/
    ├── profile_template.md
    ├── plan_template.md
    └── checkin_template.md
```

## B4. Writing style
- **"Concise is key."** The context window is a public good. Default assumption: "Claude is already very smart". Only add context Claude does not already have. Ask of each paragraph, "Does this paragraph justify its token cost?" Do not explain what RPE is at length; give the rules and conventions specific to this skill.
- **Match degrees of freedom to fragility:**
  - **High freedom** (text heuristics) where many approaches are valid, e.g., coaching conversation and plan design.
  - **Medium** (templates or pseudocode with parameters), e.g., plan format and check-in structure.
  - **Low** (exact scripts) where fragile or consistency-critical, e.g., CSV schema, appending logs, computing metrics.
  - The guide's analogy: narrow bridge vs. open field.
- **Imperative form** (skill-creator).
- **Explain the why instead of heavy-handed MUSTs.** skill-creator: "If you find yourself writing ALWAYS or NEVER in all caps, or using super rigid structures, that's a yellow flag. If possible, reframe and explain the reasoning." The best-practices doc does allow stronger emphasis when testing shows a rule is being missed.
- **Keep the skill general**, not overfit to the examples. Draft, then reread with fresh eyes.
- **Use consistent terminology.** Pick one term per concept: "session" vs. "workout", "set" vs. "round", "RIR" vs. "reps in reserve".
- **Avoid time-sensitive information.** Use an "old patterns" section if needed.
- **Avoid offering too many options.** Give a default with an escape hatch.
- **Principle of lack of surprise:** the skill's contents should match its stated intent. Role-play style ("act as a personal trainer") is explicitly OK.

## B5. Workflows, templates, feedback loops, scripts
- **Workflows with checklists.** For multi-step tasks, give a checklist Claude copies and checks off. Example for this skill: Intake → Screen → Draft plan → User review/edit → Save plan → First-session targets.
- **Conditional workflow pattern.** Route by request type, e.g.:
  - "New user, no profile.md?" → intake workflow
  - "Logging a session?" → logging workflow
  - "Weekly check-in?" → check-in workflow
  - "Asking for progress?" → run the report script
- **Template pattern.** Use strict templates for data formats (CSV headers) and flexible ones for prose outputs (plan and check-in summaries: "sensible default, use judgment").
- **Examples pattern.** Input/output pairs help with style, e.g., a sample check-in reply in MI/SDT style.
- **Feedback loops.** Validate → fix → repeat. For example: run `validate_log.py` after appending logs, and confirm the plan with the user before saving it.
- **Plan–validate–execute.** For batch or destructive changes, such as rewriting a plan or migrating logs, write an intermediate file, validate it, then apply.
- **Scripts should "solve, don't defer":**
  - handle errors (e.g., create missing files with headers)
  - give verbose, specific error messages
  - avoid "voodoo constants": document thresholds, e.g., "STALL_EXPOSURES = 3  # 3 flat exposures ≈ beyond normal day-to-day noise"
- **Dependencies.** Do not assume packages are installed. Prefer the Python standard library (csv, statistics) for portability. The claude.ai runtime may have varying network access. The API container has **no network and no package installation**. Claude Code has full access but should install packages locally only.
- **MCP tools.** If any are referenced, use fully qualified `ServerName:tool_name`.

## B6. Evaluation and iteration (skill-creator process)
- **Evals first.**
  1. Run Claude without the skill on representative tasks and note the gaps.
  2. Build at least 3 scenarios.
  3. Establish a baseline.
  4. Write minimal instructions that close the gaps.
  5. Iterate.

  Eval JSON shape (best-practices doc): `{skills, query, files, expected_behavior[]}`.
- **skill-creator loop:**
  1. Capture intent: what the skill does, when it triggers, output format, whether tests are needed.
  2. Interview and research.
  3. Write SKILL.md.
  4. Write 2–3 realistic test prompts in `evals/evals.json`.
  5. Spawn with-skill and baseline runs in the same turn.
  6. Draft assertions while the runs proceed.
  7. Grade into `grading.json` with fields `text`, `passed`, `evidence`.
  8. Aggregate the benchmark.
  9. Human review via `eval-viewer/generate_review.py`.
  10. Improve and repeat in `iteration-N/` directories.
- **Improvement principles:**
  - Generalize from feedback rather than overfitting.
  - Keep the prompt lean; read transcripts, not just final outputs.
  - Explain the why.
  - Bundle repeated work: if test runs keep writing the same helper, put it in `scripts/`.
- **Claude A / Claude B method** (best practices). One Claude instance authors and refines the skill; a fresh instance uses it on real tasks. Observe navigation: unexpected file-reading order, missed links, overused sections (move them into SKILL.md), ignored files (remove them or signal them better).
- **Test across models** (Haiku needs more guidance; Opus should not be over-explained).
- **Subjective skills** (e.g., coaching tone) benefit more from human review than from assertions. Objective parts are assertable, e.g., "log appended with the correct CSV header" or "plan respects 3 days/week and the no-barbell constraint".

**Example eval prompts for this skill:**
1. "i'm 34, haven't lifted in 3 yrs, have adjustable DBs to 25kg and a pull-up bar, 3x/week 45min, bad left knee. want to get stronger and lose a bit of belly. make me a plan."
   Expect: screening questions or a red-flag check, the knee constraint respected, a plan with progression rules, files created.
2. "did push day: bench 80x8,8,7 last set felt like 1 left, ohp 45x10,9,8, dips bw 12,10,9, tri pushdown 30x15x3. log it"
   Expect: correct rows appended, RIR parsed, PR noted, next targets.
3. "bench has been stuck at 80 for like 3 weeks, what do i do"
   Expect: reads the logs, checks adherence and fatigue, applies the stall playbook, offers options.
4. Near-miss negatives for trigger evals:
   - "what's the calorie count of a banana"
   - "write a python script that parses Strava GPX" (cardio data engineering, not coaching)
   - "my physio says I tore my ACL, what surgery is best" (medical)

## B7. Claude Code-specific frontmatter and behaviors (code.claude.com/docs/en/skills)
- **Locations:**
  - personal: `~/.claude/skills/<name>/SKILL.md`
  - project: `.claude/skills/<name>/SKILL.md`
  - nested and plugin locations (`/plugin-name:skill-name`)
  - Precedence: enterprise > personal > project.
  - Cloud sessions do not read `~/.claude/skills/`.
- **Extra fields** (Claude Code only; they error on claude.ai/API upload except `allowed-tools`): `when_to_use`, `argument-hint`, `arguments`, `disable-model-invocation`, `user-invocable`, `disallowed-tools`, `model`, `effort`, `context: fork`, `agent`, `background`, `hooks`, `paths`, `shell`.
- **Substitutions:** `$ARGUMENTS`, `$0..$N`, `${CLAUDE_SKILL_DIR}` (use this to run bundled scripts robustly), `${CLAUDE_PROJECT_DIR}`, `${CLAUDE_SESSION_ID}`.
- **Dynamic context injection:** `` !`command` `` runs before the skill is sent, and its output replaces the placeholder. For example, `` !`tail -n 30 fitness/logs/sets.csv || true` ``.
  - A non-zero exit aborts the invocation, so append `|| true`.
  - The timeout is 2 minutes.
  - These commands are not run for claude.ai-synced skills.
- **Compaction:** the most recent invocation of each skill is re-attached, keeping its first 5,000 tokens within a combined 25,000-token budget. Put the most important instructions early in SKILL.md.
- **Frontmatter parsing:** the opening `---` must be on line 1. If the YAML fails to parse, the skill loads with no fields set.

## B8. Checklist (official) and implications
Official "Checklist for effective Skills":
- **Core quality:**
  - The description is specific and includes key terms, both what and when.
  - The body is under 500 lines; details are in separate files.
  - No time-sensitive information.
  - Consistent terminology.
  - Concrete examples.
  - References one level deep.
  - Clear workflow steps.
- **Code:**
  - Scripts solve rather than defer.
  - Explicit error handling.
  - No voodoo constants.
  - Packages listed.
  - Forward slashes.
  - Validation steps and feedback loops.
- **Testing:**
  - At least 3 evals.
  - Tested on Haiku, Sonnet and Opus.
  - Real usage scenarios.
  - Team feedback.

**Specific implications for the personal-trainer skill:**
1. Put intake, plan, logging, check-in and review routing in SKILL.md, with brief rules. Move domain depth (program templates, progression rules, exercise library, MI/SDT style guide, schemas) into `references/`.
2. Use scripts for every computation (e1RM, sets per muscle, adherence, stall flags) and for CSV validation and appending. Keep them standard-library Python so they run on all surfaces.
3. Make the data directory location explicit and configurable, and create files from `assets/` templates on first use.
4. Encode the coaching stance with reasons rather than caps:
   - collaborative, user approves plans
   - offer choices
   - change one or two variables at a time
   - missed sessions are data
5. Make safety explicit but brief: screening red flags → suggest clinician clearance; pain rules; not medical advice.
6. Keep a `decisions.md` changelog so future sessions understand why the plan changed. This is the skill's memory across conversations.

---

## Sources

### Part B (primary, fetched)
- Agent Skills overview: https://platform.claude.com/docs/en/agents-and-tools/agent-skills/overview (redirected from docs.claude.com/en/docs/agents-and-tools/agent-skills/overview)
- Skill authoring best practices: https://platform.claude.com/docs/en/agents-and-tools/agent-skills/best-practices
- Claude Code Skills: https://code.claude.com/docs/en/skills
- Engineering blog: https://www.anthropic.com/engineering/equipping-agents-for-the-real-world-with-agent-skills
- skill-creator SKILL.md: https://github.com/anthropics/skills/blob/main/skills/skill-creator/SKILL.md (raw: https://raw.githubusercontent.com/anthropics/skills/main/skills/skill-creator/SKILL.md)
- anthropics/skills README and template: https://github.com/anthropics/skills, https://github.com/anthropics/skills/tree/main/template
- Agent Skills spec (not reachable from this sandbox): https://agentskills.io/specification
- Help center: https://support.claude.com/en/articles/12512198-creating-custom-skills

### Part A
- Hevy types (OpenAPI-derived), fetched: https://raw.githubusercontent.com/sundial-org/awesome-openclaw-skills/main/skills/hevy/src/types.ts ; official docs at https://api.hevyapp.com/docs
- Hevy set types: https://help.hevyapp.com/hc/en-us/articles/34896293707927 ; Strong CSV import into Hevy: https://help.hevyapp.com/hc/en-us/articles/38001424401943
- Strong CSV layout: https://repstack.pages.dev/tools/strong-csv-template/ , https://forum.intervals.icu/t/import-strong-data-weightlifting-app/5531 ; Strong App Store listing: https://apps.apple.com/gb/app/id464254577
- RP Hypertrophy app: https://rpstrength.com/hypertrophy-app
- Boostcamp: https://www.boostcamp.app/best/workout-logging ; app comparisons: https://setgraph.app/articles/best-workout-tracking-apps
- Intake / PAR-Q templates: https://coachway.io/templates/client-intake-form/ , https://coachway.io/templates/par-q-form/ , https://exercise.com/grow/personal-trainer-par-q-form-template , https://pabau.com/templates/personal-training-questionnaire/
- ACSM screening: https://www.acsm.org/blog-detail/acsm-certified-blog/2018/02/01/exercise-preparticipation-screening-removing-barriers-initiating-exercise ; https://pmc.ncbi.nlm.nih.gov/articles/PMC7059860
- Check-ins: https://www.typeform.com/templates/fitness-weekly-check-in-form-template , https://hubfit.com/blog/weekly-check-in-form-template-for-online-coaches-and-personal-trainers , https://coachway.io/templates/weekly-check-in-form/ , https://www.quickcoach.fit/client-check-in-questions.html , https://gymkee.com/uk/blog/personal-training-client-check-in-template
- SDT: https://www.jssm.org/jssm-09-8.xml-abst ; https://selfdeterminationtheory.org/wp-content/uploads/2014/04/2007_EdmundsNtoumanisDuda_PSE.pdf ; https://doaj.org/article/be3dc3b2bbba4c93b90dba5077f0da85 ; https://commons.und.edu/theses/1077
- MI / OARS: https://www.acefitness.org/continuing-education/certified/september-2021/7939/revisiting-mi-how-to-apply-motivational-interviewing-techniques-for-better-client-results/ ; https://train.fitness/personal-trainer-blogs/the-advanced-coaching-skill-setting-top-pts-apart/amp ; https://open-exam-prep.com/study-guides/ace-cpt/behavior-change-and-goals/motivational-interviewing
- Habits: https://www.thebehavioralscientist.com/articles/how-long-to-form-a-habit (Lally et al. 2010; Gollwitzer and Sheeran 2006)
- RIR/RPE: https://pubmed.ncbi.nlm.nih.gov/30747900/ ; https://openrepository.aut.ac.nz/items/efef3b25-6701-4fb5-bb82-55fcd2a26027/full (Zourdos et al. 2016)
- Volume: https://rd.springer.com/content/pdf/10.1007/s40279-017-0762-7.pdf (Schoenfeld et al. 2017) ; Pelland et al. 2024 preprint: https://sportrxiv.org/index.php/server/preprint/download/460/967/908
- Volume landmarks (secondary): https://arvo.guru/resources/methods/rp-training ; https://fitnessvolt.com/rpe-training/volume-tracker/
- e1RM: https://arxiv.org/pdf/2603.17495v1.pdf ; https://fitnessvolt.com/rpe-training/compare/e1rm-formulas/
- Progression / stalls / deload (practitioner): https://rippedbody.com/progression/ ; https://repstack.pages.dev/calculators/progressive-overload/ ; https://fitnessvolt.com/rpe-training/deload-calculator ; https://coachway.io/tools/lift-progression-reader/
- Readiness: Hooper Index / session-RPE: https://hrcak.srce.hr/file/346498 ; https://hal.univ-antilles.fr/hal-01163440
- Bodyweight trends: https://coachway.io/tools/weight-loss-percentage-calculator/ ; https://blog.ultimateperformance.com/?p=9663
- Movement patterns: https://web.prairieathletic.com/foundational-movement-patterns-part-1/ ; https://barpathfitness.com/blog/eight-foundational-movement-patterns-to-include-in-your-training/ ; https://breakingmuscle.com/go-beyond-the-5-fundamental-movement-patterns/
- Precedent fitness skills on GitHub (for comparison): OneWave-AI/claude-skills `workout-program-designer`, LeoYeAI/agent-master-skills `garmin-trainer`, mohitagw15856/pm-claude-skills `home-workout-builder`
