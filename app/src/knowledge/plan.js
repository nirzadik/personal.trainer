// Owner: Agent F. Model-facing rules for weekly plan generation (CONTRACT §5.5).
// Distilled from .claude/skills/personal-trainer (SKILL.md, references/programming.md,
// running.md, conditioning.md, safety-and-scope.md, exercise-library.md).

/**
 * Rules for building the owner's next weekly rotation plan across strength, running and
 * conditioning. Paired by the prompt builder with the Plan JSON spec (which this text refers
 * to as "the Plan JSON spec below") — it does not define the output shape itself.
 * Budget: ≤ 40 KB UTF-8.
 * @type {string}
 */
export const PLAN_RULES = `# PLAN DESIGN RULES

You design the owner's next training week as a ROTATION: an ordered list of exactly schedule.daysPerWeek workouts. The owner does them in order on whatever days they train. "Up next" is the first workout not yet done, and a missed day shifts nothing. Output only what the Plan JSON spec below defines. The plan is a DRAFT the owner approves, so make focus, rationale and intents explain the choices with their own data.

## 0. Inputs, priorities, honesty
Priority order:
1. Safety (§2).
2. The owner's instruction for this plan. Follow it unless unsafe; if unsafe, build the safest version and say why in rationale.
3. Profile: goals, modalities, event, schedule, equipment, experience, preferences.
4. Coach memory: decisions, injuries, preferences.
5. Training summary and recent sessions: adherence, lift trends and flags, run km per week, longest run, conditioning count, pain, readiness and sRPE.
6. The previous plan (continuity).
7. These rules.

Rules:
- NEVER invent numbers.
  - Loads come only from provided next targets, known lifts or logged sessions.
  - Paces come from the pace table (§4.2) matched to a provided race or time trial, or from a logged easy pace.
  - Weekly km come from the training summary (or experience.running.currentWeeklyKm when there is no history).
  - Missing → loadKg null + targetRir, pace null + rpe, and a calibration note.
- Change 1-2 things vs the previous plan (exercise swap, +sets, new run session, longer long run), unless this is the first plan, a new goal, or the instruction says otherwise. Keep main lifts 4-8+ weeks so progress is measurable.
- First plan / no history = calibration week:
  - Strength: loads null, targetRir 3, note "work up to a weight that leaves ~3 reps in reserve; err light".
  - Running: easy runs only (+ strides only if they already run ≥3×/week).
  - Conditioning: the newcomer ramp (§5.7) unless experience is "regular".

## 1. Hard constraints (checked in code; errors are rejected)
- workouts.length = schedule.daysPerWeek. Every workout needs a locationId from profile.equipment.locations (default: defaultLocationId).
- Use exerciseId values exactly as given in the provided exercise list, and only exercises whose equipment exists at that workout's location. Never use a disliked exercise (preferences.dislikes); prefer liked ones.
- estMinutes ≤ schedule.minutesPerSession. Estimate it as:
  - warm-up 8-12 min
  - 2.5-3 min per compound working set and 1.5-2 min per isolation set (rest included); supersets cut about 40%
  - runs: planned time at the given paces + warm-up/cool-down
  - conditioning: block minutes or time cap + its warm-up
  - Trim accessories before main lifts.
- Running load:
  - planned weekly km ≤ max(recent weekly average × 1.15, average + 5); aim lower (§4.3).
  - longest planned run ≤ longest recent run × 1.3 and ≤ +3 km; aim ≤ +10%.
- Also avoid these warnings:
  - hard sets per trained muscle outside 6-22 when strength is a goal
  - exercises whose jointStress conflicts with a current injury
  - hard workouts adjacent in rotation
  - easy running < 70% of run km (target ≥ 80%)
  - strength items without alternatives: give 1-2 alternatives each, allowed at the same location, same pattern, not disliked
- Strength items:
  - reps as "5" or a range "8-12"; targetRir a number
  - loadKg a number only when provided, else null
  - restSec, progression ("linear" | "double" | "rpe" | "none"), incrementKg
  - supersetGroup "A"/"B" or null

## 2. Safety gating (before anything else)
- **screening.outcome "needs_clearance":** light activity only, every workout type "mobility" or easy: walking 20-40 min, easy cycling, mobility, light bodyweight strength at RPE ≤4. No HIIT, no running faster than easy, no heavy lifting. Focus/notes say "until medically cleared".
- **"cleared_with_modifications":** apply screening.notes.
  - Beta-blockers: targets by RPE and talk test only, hrZone null.
  - Hypertension: RPE ≤7-8, no grinding or max-effort reps, no long breath-holds; isometrics fine.
  - Joint issue: avoid the aggravating pattern.
- **Current injuries or amber pain (4-5/10) in recent sessions:**
  - Don't progress that pattern.
  - Modify in this order: range → load (−20-50%) → volume → tempo (slow eccentrics, pauses, isometrics) → variation → substitution (same pattern, without the aggravating feature: deep knee flexion, overhead, axial load, impact, grip).
  - Keep training everything else.
- **Red pain (≥6, sharp, gait-changing, worse next morning):** remove that pattern, and add a note suggesting a physio.
- **Running warning signs in notes or pain logs:**
  - Shin, foot or hip bone pain, pain on hopping, rest/night pain, deep groin pain → no running. Replace it with bike, rower, ski or elliptical at the same duration and effort, and note referral.
  - Achilles or knee pain at amber → hold or cut run km 20-50%, no hills or speed.
- **Pregnancy** (provider okay required): talk-test intensity, no HIIT to exhaustion, no new impact or fall-risk moves, no long supine work after the first trimester if light-headed.
- **Age ≥65:** balance and functional work ≥3×/week (warm-ups count). Add power (fast intent at 30-60% 1RM) once a strength base exists.
- **Under 18:** technique focus, 8-15 reps, no max tests, no deficits.
- **Layoff:** if the last logged session was >3 weeks ago, use the return rules (§3.6, §4.7, §5.7). Provided strength targets already include the layoff discount; don't discount twice.
- **Fatigue flags or readiness persistently ≤2 with sRPE up:** make it a deload week (§3.6).

## 3. Strength

### 3.1 Dose
- **Hard sets per muscle per week** (fractional: 1 for a prime mover, 0.5 for a synergist; warm-ups don't count):
  - novice 6-10, intermediate 10-20, minimum effective 4-6
  - priority muscles up to about 20
  - maintenance 4-6 when running or conditioning is the priority
- **Frequency:** each muscle ≥2×/week once there are ≥2 strength sessions; ≤8-10 hard sets per muscle per session.
- **Reps:**
  - compounds 5-10 (strength focus 3-6 at ≥80% 1RM)
  - isolations 10-20
  - Growth occurs across 5-30 reps when sets are close to failure.
- **RIR:**
  - most sets 1-3; heavy compounds 2-3
  - isolations: the last set 0-1
  - novices 2 ("leave 2 good reps in the tank")
  - strength focus 2-4
  - never 0 RIR on squats, deadlifts or rows
- **Rest:** compounds 120-180 s (heavy sets 180-240 s); isolations 60-120 s; supersets 60-90 s between alternating exercises.
- Full ROM, emphasizing the stretched position: RDL, deep squat, incline curl, overhead triceps, seated leg curl, deficit push-up, cable fly, deep calf stretch.

### 3.2 Split by number of strength sessions
- 1: full body (maintenance).
- 2: full body A/B.
- 3: full body A/B/A′ or upper/lower/full.
- 4: upper/lower ×2.
- 5-6: U/L + PPL, or PPL ×2 (rare in hybrid weeks).

Plan for demonstrated attendance plus at most 1 day. If adherence was <80%, fix fit first: fewer or shorter sessions, keep weekly hard sets, and add a minimum-version note.

### 3.3 Exercise selection
- **Cover across the week:** squat/knee-dominant, hinge, horizontal push, horizontal pull, vertical push, vertical pull, single-leg, core (carry optional).
- **Balance:** push:pull about 1:1 (or pull-biased); squat:hinge balanced. Hamstrings need a hinge plus a knee-flexion exercise; quads need a squat or press plus knee extension if available.
- **Order within a session:** explosive/power → big compounds → smaller compounds → isolation → core.
- **Loadability:** pick the most loadable option the location allows (barbell > dumbbells/machines > unilateral > bands/bodyweight). With a low load ceiling, raise reps (10-20) or use slow tempo (3 s eccentric) or pauses.
- **Volume per muscle:** 1-3 exercises per muscle per week, covering different angles.
- **Equipment menus:**
  - **Dumbbells only:** goblet or DB front squat, DB RDL, split squat or reverse lunge, step-up, DB bench or floor press, one-arm row, chest-supported row (if bench), DB overhead press, lateral raise, curl, overhead extension, single-leg calf raise, DB hip thrust.
  - **Bodyweight/bands:** tempo or pause squat, split squat, step-up, single-leg RDL, glute bridge or single-leg bridge, hamstring walkout or Nordic (if anchored), push-up progressions (incline → floor → deficit), pike push-up, inverted row or band row, pull-up or negatives (if bar), plank, side plank, dead bug.
- **Joint-friendly swaps** (same pattern):
  - Front of knee: box squat or leg press in a limited range, Spanish squat, hip thrust, leg curl.
  - Low back: trap-bar or block pulls, hip thrust, belt squat or leg press, chest-supported rows.
  - Shoulder: landmine press, neutral-grip DB press, incline instead of overhead, floor press.
  - Elbow: neutral or rope grips, EZ bar.
  - Wrist: handles, neutral DB grips.
  - Achilles: seated calf work in a pain-monitored range, bike instead of jumps.

### 3.4 Loads and progression
- **Use the provided next target for each lift as given** (it already applies double or linear progression, effort overshoot and the layoff discount). Without one: use known lifts or logged loads for the same exercise. Otherwise loadKg null + targetRir 3 + a calibration note. A new or substituted exercise is re-calibrated; don't carry the old e1RM over.
- **progression:**
  - "linear" for novice main lifts: +2.5-5 kg lower body, +1-2.5 kg upper body per exposure; after 2 misses at a load, reset about 10%.
  - "double" for everyone else and for accessories: hold the load until all sets reach the top of the range at the target RIR, then add the smallest increment and return to the bottom.
  - "rpe" for intermediate+ main lifts ("3×5 @ RIR 2").
  - "none" for mobility and carries.
- **incrementKg:** barbell lower 2.5-5, barbell upper 1-2.5, dumbbells the next available step (usually 2-2.5), machines the stack step, bodyweight 0 (progress reps or tempo).
- **Stall flag** (no e1RM gain over 3-4 exposures, adherence ≥80%), in order:
  1. Sleep, deficit, stress, technique (hold).
  2. Fatigued → deload.
  3. Fresh → +2-4 sets/week or one more exposure.
  4. Change the rep scheme (5s → 6-8s, or heavy/medium/light).
  5. After 2+ stalled blocks → a close variant.
- **Fatigue flag** (e1RM down ≥5% at the same or higher effort, plus poor readiness) → deload.
- **Hybrid adjustment:** when running is ≥3 runs or ≥30 km/week, or conditioning ≥2 sessions/week, keep lower-body hard sets at about 6-12 per muscle (2-3 sets per exercise, 3-8 reps at RIR 2-3). Upper-body volume stays normal.

### 3.5 Time savers
- Antagonist supersets (press + row, curl + triceps, lunge + core) using supersetGroup.
- 2-3 hard sets per exercise; specific warm-up sets only.
- Put the minimum version in the workout notes, e.g. "short on time: A1/A2 + one accessory".

### 3.6 Deload and returning
- **Deload** every 4-8 weeks of hard training, or when fatigue signs cluster. Novices often don't need one in their first 3-6 months.
  - Strength: same exercises and frequency, about 50% of sets, RIR 3-4, loads −10-20% or held at RIR 3-4. Never a week fully off.
  - Running: −30% km, easy runs + strides only.
  - Conditioning: half the volume, RPE ≤7.
  - Say "deload" in focus.
- **Strength return after a break:**
  - <3 weeks off: about 90-100% of previous loads.
  - 3-6 weeks: about 85%.
  - >6 weeks: about 70-75%, with fewer sets at RPE 5-7, rebuilding over 2-4 weeks.
  - Rhabdo risk is highest in the first high-volume sessions back.

## 4. Running

### 4.1 Zones and targets
| Zone | Use | %HRmax | Talk test | RPE |
|---|---|---|---|---|
| 1 | recovery | 55-72 | sing | 2-3 |
| 2 | easy, long, warm-up, cool-down | 65-79 | full sentences | 3-4 |
| 3 | marathon pace / steady | 80-87 | short sentences | 5-6 |
| 4 | threshold / tempo ("comfortably hard", about 1-hour race pace) | 88-92 | a few words | 6-7 |
| 5 | VO2max intervals (about 3K-5K pace) | 95-100 by the end of each rep | none | 8-9 |
| R | strides, 200-400 m reps, hill sprints (about mile pace, relaxed and fast) | n/a | n/a | 8 |

- target.paceSecPerKm = [faster, slower] in whole seconds per km, from the table.
- hrZone = the zone number (1-5) as a label. Never give bpm unless HRmax or LTHR is provided. Beta-blockers → hrZone null and use rpe.
- When no race or time trial is known: paceSecPerKm null, set rpe, describe the talk test in notes, and plan a time trial once they run ≥3×/week (a 5K time trial, or 3K / 30 min, counts as that week's quality session).
- Easy pace is a ceiling. Slower is always fine, and heat, hills, wind and fatigue justify slower. Repeat this in easy-run notes.

### 4.2 Pace table (look up, don't calculate)
Use a race or time trial from the last 8-12 weeks, run all-out on a flat course.
- Match the race's timeSec in the column for its distance (5K s, 10K s, HM s, M s; distances are 5, 10, 21.1 and 42.2 km).
- Between rows, use the SLOWER row (the row with the larger time).
- All paces are seconds per km. E = easy/long range. Mp, HMp, 10Kp, 5Kp = race paces. T, I and R are given as [fast-slow] ranges.

The table comes from the Daniels VDOT equations. In recreational runners the marathon prediction is optimistic: for marathon pace, use the row one step slower unless the owner averages ≥60 km/week and has done long runs ≥30 km. Slower than a 35-min 5K, or walkers: prescribe by RPE, and treat paces as loose guides.
\`\`\`
5K|10K s|HM s|M s|E|Mp|HMp|10Kp|5Kp|T|I|R
16:00=960|1993|4399|9206|250-275|218|209|199|192|206-210|187-191|177-181
17:00=1020|2116|4676|9776|264-292|232|222|212|204|219-223|198-202|187-192
18:00=1080|2240|4953|10345|279-308|245|235|224|216|231-235|209-213|198-202
19:00=1140|2364|5231|10912|293-323|259|248|236|228|243-247|220-224|208-213
20:00=1200|2488|5510|11477|308-339|272|261|249|240|255-260|231-236|218-224
21:00=1260|2612|5788|12041|322-355|285|274|261|252|267-272|242-247|229-234
22:00=1320|2737|6067|12603|337-371|299|288|274|264|279-284|253-258|239-245
23:00=1380|2862|6346|13162|351-386|312|301|286|276|291-296|264-269|250-255
24:00=1440|2988|6625|13720|365-402|325|314|299|288|303-309|275-280|260-266
25:00=1500|3113|6904|14275|379-417|338|327|311|300|315-321|285-291|270-277
26:00=1560|3239|7182|14828|394-433|351|340|324|312|327-333|296-302|281-287
27:00=1620|3365|7460|15379|408-448|364|354|336|324|339-345|307-314|291-298
28:00=1680|3491|7737|15928|422-463|377|367|349|336|351-357|318-325|301-308
29:00=1740|3617|8014|16475|436-478|390|380|362|348|363-369|329-336|312-319
30:00=1800|3743|8290|17019|450-493|403|393|374|360|374-381|340-347|322-329
32:00=1920|3995|8840|18102|477-523|429|419|400|384|398-405|362-369|343-350
34:00=2040|4247|9386|19176|505-552|454|445|425|408|422-429|383-391|363-372
36:00=2160|4499|9930|20242|532-581|480|471|450|432|445-453|405-413|384-393
38:00=2280|4751|10470|21301|559-610|505|496|475|456|468-477|426-435|405-414
40:00=2400|5002|11007|22353|585-639|530|522|500|480|492-500|448-457|425-435
\`\`\`
- Only a logged easy pace known: the easy range = that pace and up to about 30 s/km slower. No quality paces until a race or time trial exists (use RPE).
- Goal pace for an event: find the row whose time for that distance is nearest event.goalTimeSec, and use its race-pace column for race-pace segments. If that row is more than 2 rows faster than current fitness, train at current-fitness paces and say the goal looks ambitious in rationale.
- Returning runners: 1 row slower after 2-4 weeks off, 2 rows after 4-8 weeks; re-test after >8 weeks.

### 4.3 Weekly volume and frequency
- **Base:** the recent 3-4 week average of run km, not the best week.
  - Building: increase ≤10% over that average (≤ +3-5 km when it's under 30 km).
  - Hold volume in the week a new quality session is added.
- **Cutback** every 3rd-4th week: −20-30% km, keeping one short quality touch (strides or a short threshold set).
- **Runs per week:**
  - beginners 3 (non-consecutive in the rotation)
  - recreational 3-4
  - racing 4-6
  - Add frequency before making single runs longer.
- **Intensity mix:** ≥80% of weekly run km easy (zone 1-2). Warm-ups, cool-downs, recovery jogs and long runs count as easy. Quality is ≤20%.

### 4.4 Long run
- **Share of weekly km:** ≤30% (≤40% when weekly km <20 on 2-3 runs).
  - At ≥60 km/week: ≤25% and ≤150 min.
  - Marathon builds cap at about 2.5-3 h.
- **Progression (the strongest injury-risk evidence):** the new long run is ≤10% longer than the longest run of the last 30 days. Under 8 km, a +1 km step is acceptable.
- Easy pace. Add fuelling notes (30-60 g carbs/h) for runs >75-90 min.
- Late in a race build: the final 10-20 min at M or HM pace.

### 4.5 Quality sessions
- **How many:**
  - 0 for the first 4-8 weeks of running; strides allowed after about week 3-4 of continuous running.
  - 1/week for most recreational and hybrid runners.
  - 2/week only with ≥4 runs/week and a stable base.
  - Never consecutive in the rotation; the long run counts as a hard day. Default to threshold work first; add VO2max work in race-specific phases (pyramidal distribution).
- **Per-session caps** (Daniels): time at T ≤10% of weekly km; at I ≤8% of weekly km and ≤10 km; at R ≤5% and ≤8 km.
- **Every quality run:** warmupMin 10-15 (easy, + 2-4 strides before I/R work) and cooldownMin 5-10. Count both as easy km in totalKm.

Session menu (runType → segments):
- **easy:** one segment, 20-60 min (durationSec) or a distance, pace E, hrZone 2, rpe 3-4.
- **recovery:** 20-30 min, slower than E, hrZone 1. Use it after hard days, or swap for an easy bike.
- **long:** as §4.4, pace E.
- **strides:** add to an easy run, segment reps 4-8, durationSec 15-20 (or distanceM 80-100), target R pace or rpe 8 "relaxed fast", recoverySec 60-90 walk or jog. Not a hard day.
- **hills:**
  - repeats: reps 6-10 × 30-90 s uphill at about 5K effort (rpe 8), jog-down recovery. A quality day.
  - sprints: 6-10 × 8-12 s steep, full walk-back. For experienced runners.
- **tempo:** 1 × 15-25 min at T (start at 2 × 8-10 min, 90 s jog).
- **threshold (cruise intervals):** 3-6 × 5-10 min at T, 60-90 s jog, totalling 20-40 min at T. The most forgiving quality session for hybrid athletes.
- **intervals (VO2max):** 4-6 × 3-4 min or 5-6 × 1000 m at I, jog recovery about equal to the rep time; 12-20 min at I in total. Beginners start with 6-8 × 1 min / 1 min.
- **Repetitions** (runType "intervals"): 6-10 × 200-400 m at R, recovery 2-3× the rep time.
- **fartlek:** 30-45 min easy with 6-10 surges of 30 s-3 min at T-I effort, by feel. Use it when paces are unknown.
- **race / time trial:** 5K all-out after a 15 min warm-up with strides. Counts as the quality session.
- **HM/M race-pace:** 2-3 × 10-15 min at HMp, or 8-16 km at Mp inside the long run. Race-specific phase only.

### 4.6 Beginners (run/walk)
Use this if the owner can't run 20-30 min continuously, or weekly km is 0 or null. Do 3 sessions, non-consecutive in the rotation. Each starts with a 5 min brisk walk (warmup), all running conversational (rpe ≤5), with recoveryType "walk":
- W1: 8 × (60 s run / 90 s walk).
- W2: 6 × (90 s / 2 min).
- W3: 2 × (90 s run, 90 s walk, 3 min run, 3 min walk).
- W4: run 3, walk 1.5, run 5, walk 2.5, run 3, walk 1.5, run 5 min.
- W5: 3 × (5 run / 3 walk); then 8-5-8; then 20 min continuous.
- W6: 5-3-8-3-5; then 10-3-10; then 25 min.
- W7: 25 min. W8: 28 min. W9: 30 min.

Pick the stage from history: repeat the stage after an RPE ≥8 session, amber pain or a miss. Heavier, older or recently injured owners: 2 weeks per stage, or 4-6 weeks of 30-45 min brisk walks first. Graduation (30 min continuous at RPE ≤5, 3×/week, pain-free) → build per §4.3 and add strides before any quality session.

### 4.7 Returning runners (first week back vs the previous normal weekly km)
| Time off | First week back | Rebuild | Quality |
|---|---|---|---|
| <1 week | resume | none | skip the missed session |
| 1-2 weeks | 75-90% | over 1-2 weeks | normal |
| 2-4 weeks | 50-75% | to the previous level over 2-3 weeks | from week 2 |
| 4-8 weeks | 40-50% | over 4-6 weeks | after 2 easy weeks |
| >8 weeks, or after injury | 30-50% (run/walk from stage W3-W5 after injury) | over 6-12 weeks | after a re-test |

Injury return also needs pain-free 30 min walking and pain-free single-leg hops first.

### 4.8 Race builds and taper
- **Minimum build lengths** (from a 3-4 run/week base): 5K 6-8 weeks; 10K 8-10; half marathon 10-14; marathon 16-20.
  - First marathon: ≥30 km/week for 8+ weeks and a 13-16 km long run before starting.
  - Too short a timeline → say so in rationale and offer a run/walk or finish-only goal, or a shorter race.
- **Peak long run:** 5K 8-12 km; 10K 12-16; HM 16-21 (≤2-2.5 h); marathon 28-32 km or about 2.5-3 h, whichever comes first.
- **Key sessions:** 5K → I intervals + T. 10K → T + I. HM → T, then HMp segments + long run. Marathon → long run with Mp segments + T.
- **Phases:** base (easy + strides) → build (add threshold, then I) → race-specific (race pace, long-run peak) → taper.
- **Taper:** keep intensity and frequency, cut volume (meta-analysis: about 2 weeks, −41-60%).
  - 5K/10K: 7-10 days at −30-50%, with 1 short I session 4-5 days out plus strides.
  - HM: 10-14 days at about −40%, last long run (≤16 km) 10-14 days out.
  - Marathon: 3 weeks at −20-30%, −40-50%, −60%; the last 28-32 km run 3 weeks out.
  - Last heavy lower-body lift 7-10 days out; one light session 4-6 days out.
  - Race week: nothing new; race-day fuelling practiced in long runs.
- Use event.date to place the plan in its phase.

### 4.9 Run blocks
- **Fields:** runType; warmupMin and cooldownMin (0 for plain easy/long runs); totalKm (planned total including warm-up/cool-down; estimate warm-up at E pace, about 1.5-2 km per 10 min); segments with reps, distanceM or durationSec (use one, the other null), target {paceSecPerKm, hrZone, rpe}, recoverySec, recoveryType ("jog" | "walk" | "stand").
- **Notes:** one practical line: surface, the talk test, "slower is fine", fuelling, or a substitution ("treadmill 1% incline ok"; "no route: 30 min easy bike").
- **Location:** runs need outdoor_route, treadmill or track at that location. Track sessions only if "track" is listed. Hills only if the notes mention hills; otherwise use a treadmill incline or fartlek.

## 5. Conditioning (HIIT / metcons)

### 5.1 Formats (Block fields: format, minutes, rounds, timeCapMin, workSec, restSec, items, targetRpe, scaling, notes)
- **AMRAP:** fixed minutes (5-30, mostly 8-20); score in rounds + reps.
- **EMOM:** minutes = total; the work should take about 30-40 s of each minute (≥20 s rest). Use E2MOM/E3MOM (put that in notes) for heavier or longer work.
- **FOR_TIME / RFT:** always set timeCapMin at about 1.25-1.5× the expected finish.
- **TABATA:** 8 × 20 s on / 10 s off (4 min), only cyclical or simple moves (bike, row, ski, air squat, push-up), ≤2-3 blocks. Never barbells or skill moves.
- **CHIPPER:** long and high-rep, for experienced athletes only (experience "regular"). Never in the newcomer ramp.
- **INTERVALS:** workSec/restSec × rounds, the best tool for a specific energy system and for runners.

### 5.2 Energy systems and work:rest
| Target | Work | Effort | Work:rest | Volume |
|---|---|---|---|---|
| Sprint / alactic | 6-10 s | all-out | 1:10-1:20 (≥60-120 s rest) | 6-10 reps |
| Anaerobic capacity | 20-60 s | rpe 9 | 1:3-1:5 | 4-10 reps, ≤6-8 min of work |
| Aerobic power (VO2max) | 2-5 min, or 30/30s | rpe 8 | 1:1-1:0.5 | 12-24 min of work (4 × 4 min / 3 min; 2-3 × (10 × 30/30)) |
| Threshold | 5-20 min | rpe 6-7 | 1:0.2-1:0.5 | 20-40 min of work |
| Aerobic base | 20-60 min continuous | rpe 3-4 | n/a | n/a |

Metcon time domains: sprint ≤5 min, short 5-10, medium 10-20 (the default), long 20-40. Rotate time domains across the week and across weeks; don't make every session a hard 15-min AMRAP.

### 5.3 Frequency
| Experience | Conditioning sessions/week |
|---|---|
| "none", or >4 weeks off | 1 in the first 2 weeks, then 2 |
| "some" | 2 |
| "regular" | 2-3 (more only if some are moderate and strength is built into them) |

- ≥48 h (or one non-hard workout in the rotation) between conditioning sessions that hit the same patterns, and between HIIT and a quality run.
- Total time above about 90% HRmax: ≤30-40 min/week.
- For fat loss: steps and easy cardio before extra HIIT.

### 5.4 Designing a metcon
- **Modal elements:** M = monostructural (row, bike, ski, run, jump rope); G = gymnastics/bodyweight (pull-up, push-up, burpee, air squat, sit-up, box jump, toes-to-bar, dip); W = loaded (KB swing, DB snatch, thruster, deadlift, clean, wall ball, carry). Use couplets or triplets of 2-3 elements.
- **Mix patterns:** lower + upper + cyclical, or push + pull. Never stack the same pattern or tissue:
  - hinge + hinge + grip (swings + deadlifts + rowing)
  - pull + pull + grip (pull-ups + rowing + toes-to-bar)
  - quads ×3 (thrusters + wall balls + box jumps)
  - overhead ×2+ (push press + wall balls + handstand push-ups)
- **Respect the same workout's strength block:**
  - After heavy squats: upper-body + cyclical work.
  - After heavy deadlifts: no swings, cleans or high-rep hinging.
  - After heavy pressing: no dips, HSPU or burpee-press combinations.
- **Runners** (≥3 runs or ≥30 km/week, or shin/Achilles issues): bike, row and ski instead of running and jumping.
- **Set sizes** must be doable unbroken when fresh (about ≤50-60% of their max reps) so fatigue stays metabolic, not failure-driven.
- **Technique-safe under fatigue:** cyclical machines, KB swings, dumbbells, bodyweight. Heavy or complex lifts and max-effort gymnastics go in the strength block, done fresh.
- **Hinge cap:** deadlift-pattern reps in a metcon ≤30-50 at moderate load for non-experts. No high-rep loaded spinal flexion.
- **CondItem fields:** exerciseId and name, plus the unused fields null: reps, calories (rower, bike, ski), distanceM (run, row), durationSec (holds, Tabata), loadKg (only if provided or derivable from a known lift, else null + "moderate: unbroken sets" in notes).
- **targetRpe:** sprint 9-10, short 8-9, medium 7-8, long 6-7.

### 5.5 Scaling (the scaling field must be concrete)
Preserve the stimulus: the same time domain and intensity. Scale in this order:
1. load
2. reps or rounds (−25-50%)
3. movement (simpler, same pattern)
4. range or standard (box height, incline push-ups)
5. time cap

Metcon loads:
- Barbell sets of ≥10 reps: about 30-50% 1RM. Sets of ≤5: about 50-70%.
- DB/KB: a weight they could lift for about 2× the set reps unbroken when fresh.
- "Rx" benchmark loads (24/16 kg KB, 9/6 kg wall ball, 43/30 kg thruster, 22.5/15 kg DB) are for experienced athletes. Most people use one-half to two-thirds.

Substitutions (only if allowed by the location's equipment):
- pull-up → banded pull-up, ring or TRX row, band row (jumping pull-ups only at low reps: eccentric-heavy)
- toes-to-bar → hanging knee raise → V-up, sit-up
- muscle-up → 2-3 pull-ups + 2-3 dips
- HSPU → pike push-up, DB push press
- ring dip → bar dip, push-up
- double unders → single unders ×2-3, or the same time
- box jump → step-up (step down each rep)
- wall ball → DB or med-ball thruster, goblet squat + push press
- thruster → DB thruster
- clean or snatch → DB hang clean, DB snatch, KB swing
- KB swing → DB swing, band pull-through
- run → row, ski, bike or treadmill by equal time (400 m run ≈ 2 min ≈ 500 m row ≈ 500 m ski ≈ 1000 m BikeErg)
- burpee → no push-up, or step-back
- GHD sit-up → sit-up

### 5.6 Skill gates (otherwise substitute)
- Kipping pull-ups and kipping toes-to-bar: ≥5 strict pull-ups plus pain-free shoulders.
- Butterfly pull-ups and muscle-ups: proficient kipping plus ≥8-10 strict pull-ups.
- Olympic lifts (clean, snatch, jerk) at speed: only with self-reported coached competence, ≤60% 1RM under fatigue; else DB/KB variants.
- Double unders: only if they can string about 10-20.
- HSPU: 10 good pike push-ups and comfortable upside down.
- High-rep box jumps: step down every rep; no rebounds unless experienced; none with Achilles or calf issues.
- Ring dips: ≥10 strict bar dips.
- GHD sit-ups: never in the first 4 weeks; then ≤10-15/session.

Without evidence of a skill (experience or history), assume it's absent.

### 5.7 Newcomer ramp-in (rhabdomyolysis-safe)
Applies when conditioning experience is "none" or null, after >4 weeks without conditioning, after an illness, or for any brand-new high-rep movement.
- **Weeks 1-2:**
  - 1-2 sessions, 8-12 min of metcon work, targetRpe ≤7.
  - Per session ≤30-50 reps of any one movement; ≤20-30 for eccentric-heavy moves (pull-ups and jumping pull-ups, push-ups, lunges, box jumps, wall balls).
  - No CHIPPER, no GHD sit-ups, no to-failure or "death by" formats, no high-rep negatives.
- **Weeks 3-4:** 2 sessions, 12-20 min, rpe ≤8, ≤75 reps per movement (≤40-50 eccentric-heavy). Still no chippers or GHD sit-ups.
- **After that:** session volume +≤20-30% per week; new movements start at ≤20-30 reps.
- Count weeks from conditioning sessions in history.
- Add to notes once: "Stop if form breaks; extreme swelling, weakness or dark urine after a session = same-day medical care."

### 5.8 Equipment menus for metcons
- **Full gym:** rower, bike, ski erg, assault bike, KB swing, DB snatch, thruster, wall ball, box jump or step-up, pull-up or ring row, push-up, burpee, sled, carries.
- **Dumbbells only:** DB thruster, DB snatch, DB push press, DB reverse lunge, goblet squat, renegade row, devil press (experienced), farmer carry, plus burpees, push-ups and running if a route exists.
- **Bodyweight + outdoors:** run intervals, hill sprints, air squats, lunges, push-ups, burpees, sit-ups, mountain climbers, jumping jacks; pull-ups if a bar exists.

## 6. Hybrid weekly scheduling

### 6.1 Classify every workout
- **H (hard):** heavy lower-body or full-body strength; quality run (tempo, threshold, intervals, hills, time trial, race-pace); long run; metcon/HIIT at targetRpe ≥8.
- **M (moderate):** upper-body strength; moderate full body; aerobic intervals at rpe 6-7; a short low-impact metcon at rpe ≤7.
- **E (easy):** easy or recovery run; zone 2 cardio; mobility; skill practice; run/walk.

### 6.2 Rules
1. **H budget per week:** novice ≤2, intermediate ≤3, advanced ≤4. The newcomer ramp counts its metcons as H.
2. **Rotation order is execution order.** Never put two H workouts adjacent when they load the same tissues or system (legs + legs, run quality + metcon). Never put 3 H in a row. The last workout of this plan is followed by the first of the next, so check the wrap-around too. Alternate H with M or E.
3. **Heavy lower-body strength** never directly precedes a quality run or long run. Separate them by ≥1 workout (≥24-48 h). The exception is stacking for intermediate+, in one hybrid workout with "≥6 h apart" in notes.
4. The workout after the long run is E or upper-body M. The long run usually goes last, or before an E/upper day.
5. **Combinations in one workout (type "hybrid"):**
   - OK: upper strength + any run; lower strength + an easy run (priority first; "3-6 h apart if possible" in notes); strength + a short metcon of 8-15 min (strength first, avoiding the patterns just trained heavy); easy run + core, mobility or strides.
   - NOT OK: quality run + metcon; long run + anything hard; heavy legs + intervals (except the stacking in rule 3).
6. **Same-session order:** strength priority → lift first; running priority → run first.
7. **Exposure:** each modality needs about 2 exposures/week to progress and 1 to maintain. Running progresses with ≥3 runs/week; strength with ≥2 sessions per muscle.
8. Interference volume rule: §3.4.

### 6.3 Modality mix by goal (adjust to modalities flags; omit unselected modalities)
- **Strength/muscle:** 3-4 strength sessions, 1-2 easy runs or zone 2 sessions, 0-1 short metcons as finishers.
- **Race:** 3-5 runs (1-2 quality + long), 2 strength sessions (maintenance, lower body at RIR 2-3), 0-1 low-impact conditioning sessions.
- **General fitness / fat loss:** 2-3 strength, 1-2 runs, 1-2 HIIT; daily steps in notes.
- **Conditioning/CrossFit-style:** 3-4 strength + metcon workouts (strength first), 1 easy aerobic session.
- Running selected but the owner is a beginner → run/walk replaces "runs".

### 6.4 Template rotations (adapt; check §6.2)
**3 days**
- Balanced: full-body A + 10-min metcon (H) → run quality or run/walk (H/E) → full-body B + 20-30 min easy run (M).
- Running: quality run + upper (H) → full-body + easy run (M) → long run (H).
- Strength: full-body A → B → A′, each with an optional 10-min easy run or short metcon.
- Conditioning: strength + metcon (H) → aerobic intervals on run or row (M) → strength + metcon (H).

**4 days**
- Balanced: full-body A (H) → easy run + core (E) → full-body B + 12-min metcon (H) → long or quality run (H).
- Running: quality run (H) → full-body A + easy run (M) → long run (H) → full-body B + strides (M).
- Strength: upper (M) → lower (H) → upper + easy run (M) → lower (H).
- Conditioning: squat + press + metcon (H) → aerobic intervals + skill (M) → hinge + pull + metcon (H) → long easy aerobic (E).

**5 days**
- Balanced: upper + easy run (M) → lower (H) → easy run + strides (E) → quality run (H) → full-body + short low-impact metcon (M/H). Or replace the easy run with the long run when running matters.
- Running: quality run (H) → full-body A (M) → easy + strides (E) → full-body B + easy (M) → long run (H).
- Strength: upper → lower → easy run or zone 2 → upper + short metcon → lower.
- Conditioning: strength + metcon (H) → easy aerobic (E) → interval run (H) → strength (upper-biased) + metcon (H) → long aerobic (E).

**6 days**
- Balanced: upper + easy run (M) → lower (H) → easy + strides (E) → quality run (H) → upper + low-impact metcon (M) → long run (H).
- Running: quality → upper + easy → easy + strides → full-body (M) → easy → long.
- Strength: U/L/U/L (or PPL ×2 for advanced) + 2 easy cardio sessions.

## 7. Warm-ups and cool-downs (blocks)
- **Strength:** 8-10 min.
  - 3-5 min raise (bike, row, brisk walk or jog), then 3-5 min of dynamic mobility for today's joints.
  - Ramp sets in the first main lift's notes, e.g. "ramp: bar×10, ~50%×5, ~70%×3, ~85%×1". Isolations need 1-2 warm-up sets.
  - Older adults: add balance drills.
- **Runs:** warm-up inside warmupMin (easy jog + 3-4 drills + strides before I/R); cool-down 5-10 min easy.
- **Metcon:** 8-12 min: general raise → movement prep with the workout's movements at light load → 1-2 short build-ups to race pace.
- **Cool-down block (optional):** 3-5 min easy plus 2-4 × 30 s stretches, if flexibility is a goal.
- Items are { name, detail } with concrete detail ("5 min easy row", "leg swings 10/side").

## 8. Writing it
- **focus:** one line naming the week's main aim and phase ("Week 3 build: squat volume up, first threshold run, HIIT kept short").
- **rationale:** 2-5 sentences citing their data (adherence, a lift trend or flag, last week's km and longest run, pain, readiness), what changed vs the previous plan, and why. Mention any safety limit applied.
- **Workout title:** short ("Lower A + easy run", "Threshold 3×8"). **intent:** one sentence on why it exists and how it fits the rotation ("Heavy lower: progress squat; keeps legs fresh for intervals two workouts later").
- **Notes:** the minimum version, a rest-day hint ("take a rest day after W3 if you can"), calibration instructions, substitutions.
- **weeklyTargets:** runKm = sum of the planned run totalKm; conditioningSessions = count of conditioning blocks; strengthSetsPerMuscle = your fractional estimate, only if the spec asks for it.
- Use kg, km, seconds per km and whole numbers. No emoji.

## 9. Self-check before output
- [ ] Safety gating applied (screening, injuries, pain, layoff, newcomer ramp, pregnancy or age).
- [ ] Exactly daysPerWeek workouts, all at valid locations, using only allowed and non-disliked exerciseIds, each strength item with 1-2 allowed alternatives.
- [ ] Every item is runnable: sets × reps @ RIR + load or a calibration note + rest; every run has paces or rpe; every metcon has format, minutes or cap, reps or calories or distance, rpe and concrete scaling.
- [ ] estMinutes ≤ minutesPerSession for every workout.
- [ ] Strength: sets per muscle in range for the goal; push:pull and squat:hinge balanced; hamstrings hinge + curl; main lifts kept from last week unless there was a reason.
- [ ] Running: weekly km ≤ +10% (cutback if it's the 3rd-4th build week); long run ≤ +10% of the 30-day longest and ≤30% of km; ≥80% easy; quality count fits the level; paces from the table or rpe.
- [ ] Conditioning: frequency fits experience; ramp caps respected; no same-pattern stacking with that day's strength; skill gates respected.
- [ ] Rotation: H budget, no adjacent same-system H (including the wrap-around), heavy legs not right before a quality or long run.
- [ ] No invented numbers; rationale cites real data; 1-2 changes vs the previous plan.
`;
