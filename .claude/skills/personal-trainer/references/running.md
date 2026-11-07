# Running: Programming, Paces, Progression & Injury Management

Evidence-informed defaults for recreational runners and lifters who also run: beginners, returning runners and 5K-to-marathon racers. The evidence base is thinner than for strength training. Most injury data are observational cohorts with self-reported injuries, and most intensity-distribution trials are in trained athletes. So the rules below are **conservative defaults**, and the runner's logged response overrides them. Full sources and confidence tags: `docs/research/06-running.md`.

## Contents
1. Principles
2. Intensity distribution and zones
3. Paces from a recent race (lookup table)
4. Weekly structure: volume, ramp, long run, quality sessions
5. Session library and per-session limits
6. Beginners: run/walk
7. Returning after a break
8. Race-specific basics and taper
9. Injury signs, modifications and referral
10. Running alongside strength training
11. Logging and progress signals

---

## 1. Principles

1. **Consistency beats heroics.** Frequent, mostly easy running builds the aerobic base. A missed run is not made up by doubling the next one.
2. **Easy days easy, hard days hard.** Most runners run their easy days too fast, and then their quality days suffer.
3. **Build volume before intensity.** Add quality work only once easy running is regular (≥3-4 weeks at a stable volume). When adding intensity, hold volume steady that week.
4. **Avoid spikes, not just weekly jumps.** The best current data point to *single-session* spikes, not week-to-week ratios.
5. **Strength training is part of running training.** It improves running economy and lowers injury risk (§10).
6. **Previous injury is the strongest injury predictor.** Anyone with a running injury in the last 12 months progresses more slowly.

## 2. Intensity distribution and zones

**Distribution:** keep about **75-80%+ of weekly running time easy** (zone 1-2, conversational). The remaining ≤20-25% is threshold and interval work, including race-pace segments. Both "pyramidal" (most easy, some threshold, little VO2max) and "polarized" (most easy, almost no threshold, some VO2max) distributions work. Trials in recreational runners don't clearly favor either (Muñoz 2014: both improved 10K time; the 2024 meta-analysis is mostly trained athletes). Pyramidal suits most recreational and hybrid athletes, because threshold work is less stressful than VO2max work. Count warm-ups, cool-downs, recovery jogs and long runs as easy time.

| Zone | Name | %HRmax | Talk test | RPE 0-10 | Pace (from §3 table) | Used for |
|---|---|---|---|---|---|---|
| Z1 | Recovery | 55-72 | Full sentences, could sing | 2-3 | slower than the easy range | recovery runs, walk breaks |
| Z2 | Easy / long | 65-79 | Full sentences | 3-4 | Easy/long range | most running, long runs, strides recoveries |
| Z3 | Steady / marathon | 80-87 | Short sentences | 5-6 | M pace | marathon-specific segments |
| Z4 | Threshold / tempo | 88-92 | A few words | 6-7 ("comfortably hard") | T pace (about the pace you could race for ~1 hour) | tempo runs, cruise intervals |
| Z5 | VO2max intervals | 95-100 by the end of each rep | Can't talk | 8-9 | I pace (about 3K-5K race pace) | 2-5 min intervals |
| (Speed) | Repetition | not useful (too short) | n/a | 8-9, relaxed and fast | R pace (about mile race pace) | strides, 200-400 m reps, hill sprints |

**Heart rate:**
- HRmax (Tanaka) ≈ 208 − 0.7 × age. It is an estimate with ±10 bpm error; a measured max from a race finish or hill test is better.
- Karvonen target = HRrest + % × (HRmax − HRrest). Easy ≈ 50-70% of HR reserve.
- Threshold-based zones are more individual: LTHR ≈ average HR over the last 20 min of a solo 30-min all-out run (Friel). Easy < 85-89% LTHR; threshold ≈ 95-100% LTHR.
- HR lags 1-2 min behind effort, drifts up in heat and on long runs, and is blunted by beta-blockers. On beta-blockers use RPE and the talk test only.
- Default to **pace + RPE** for prescriptions. Use HR as a ceiling on easy days ("keep it under Z2") when the runner has a reliable monitor.

## 3. Paces from a recent race

Use a **recent (≤8-12 weeks), all-out race or time trial on a flat course**. A training run or a jogged race underestimates fitness. Find the row nearest the 5K time (or the matching 10K/half time) and read the training paces. This table was computed from the Daniels-Gilbert VDOT equations (Easy = 62-70% VDOT, T = 88%, I = 97.5%, R = 105%) and reproduces Daniels' published VDOT 50 equivalents within seconds.

| 5K | VDOT | 10K | Half | Marathon | Easy/long /km | M /km | T /km | I /km | R /km |
|---|---|---|---|---|---|---|---|---|---|
| 16:00 | 65 | 33:13 | 1:13:19 | 2:33:26 | 4:10-4:35 | 3:38 | 3:27 | 3:11 | 3:00 |
| 17:00 | 60 | 35:16 | 1:17:56 | 2:42:56 | 4:24-4:52 | 3:52 | 3:40 | 3:22 | 3:10 |
| 18:00 | 56 | 37:20 | 1:22:33 | 2:52:25 | 4:39-5:08 | 4:05 | 3:52 | 3:33 | 3:21 |
| 19:00 | 53 | 39:24 | 1:27:11 | 3:01:52 | 4:53-5:23 | 4:19 | 4:04 | 3:44 | 3:31 |
| 20:00 | 50 | 41:28 | 1:31:50 | 3:11:17 | 5:08-5:39 | 4:32 | 4:16 | 3:56 | 3:42 |
| 21:00 | 47 | 43:32 | 1:36:28 | 3:20:41 | 5:22-5:55 | 4:45 | 4:28 | 4:07 | 3:52 |
| 22:00 | 45 | 45:37 | 1:41:07 | 3:30:03 | 5:37-6:11 | 4:59 | 4:40 | 4:18 | 4:03 |
| 23:00 | 42 | 47:42 | 1:45:46 | 3:39:22 | 5:51-6:26 | 5:12 | 4:52 | 4:29 | 4:13 |
| 24:00 | 40 | 49:48 | 1:50:25 | 3:48:40 | 6:05-6:42 | 5:25 | 5:04 | 4:40 | 4:24 |
| 25:00 | 38 | 51:53 | 1:55:04 | 3:57:55 | 6:19-6:57 | 5:38 | 5:16 | 4:51 | 4:34 |
| 26:00 | 37 | 53:59 | 1:59:42 | 4:07:08 | 6:34-7:13 | 5:51 | 5:28 | 5:02 | 4:45 |
| 27:00 | 35 | 56:05 | 2:04:20 | 4:16:19 | 6:48-7:28 | 6:04 | 5:40 | 5:14 | 4:55 |
| 28:00 | 33 | 58:11 | 2:08:57 | 4:25:28 | 7:02-7:43 | 6:17 | 5:52 | 5:25 | 5:06 |
| 29:00 | 32 | 1:00:17 | 2:13:34 | 4:34:35 | 7:16-7:58 | 6:30 | 6:04 | 5:36 | 5:16 |
| 30:00 | 31 | 1:02:23 | 2:18:10 | 4:43:39 | 7:30-8:13 | 6:43 | 6:16 | 5:47 | 5:27 |
| 32:00 | 29 | 1:06:35 | 2:27:20 | 5:01:42 | 7:57-8:43 | 7:09 | 6:40 | 6:09 | 5:48 |
| 34:00 | 26 | 1:10:47 | 2:36:26 | 5:19:36 | 8:25-9:12 | 7:34 | 7:03 | 6:31 | 6:09 |
| 36:00 | 25 | 1:14:59 | 2:45:30 | 5:37:22 | 8:52-9:41 | 8:00 | 7:27 | 6:53 | 6:30 |
| 38:00 | 23 | 1:19:11 | 2:54:30 | 5:55:01 | 9:19-10:10 | 8:25 | 7:51 | 7:15 | 6:51 |
| 40:00 | 22 | 1:23:22 | 3:03:27 | 6:12:33 | 9:45-10:39 | 8:50 | 8:14 | 7:37 | 7:11 |

**Using it:**
- Between rows, use the slower row. Easy pace is a *ceiling*: slower is always fine, and hills, heat, wind and fatigue justify slower.
- Give paces as a range of about ±5 s/km for T, I and R.
- **Riegel** (T2 = T1 × (D2/D1)^1.06) gives similar equivalents. Both are calibrated on well-trained runners. In recreational runners the marathon prediction is too optimistic (Vickers 2016: Riegel was at least 10 min too fast for half of 2,303 runners; their fitted exponent was nearer 1.15). For a marathon goal, add about 5% to the table time unless the runner averages ≥60 km/week and has done long runs ≥30 km.
- **Slower than a 35-min 5K, or a walker:** prescribe by effort (RPE, talk test), and use paces only as a loose guide.
- **No race available:** prescribe by RPE and talk test for 2-4 weeks, then schedule a 5K time trial, or a 3K or 30-min time trial, after a light day to set paces. A 5K time trial is a hard session: count it as the week's quality session.
- **Re-test** every 6-10 weeks, or move one row faster when T and I sessions feel clearly easier at the same paces and HR for 2-3 weeks.

## 4. Weekly structure

**Weekly volume (km).** Base next week's volume on the **average of the last 3-4 weeks**, not the best week.

| Rule | Default |
|---|---|
| Weekly increase while building | ≤10% over the recent average (≤ +3-5 km for low-volume runners). Hold, don't build, in a week that adds new intensity. |
| Cutback week | Every 3rd-4th week, about −20-30% km. Keep one short quality touch. |
| Long run share | ≤30% of weekly km at <60 km/week (≤40% is acceptable when weekly volume is <20 km over 2-3 runs). ≤25% and ≤150 min at ≥60 km/week. Marathon builds cap at about 2.5-3 h. |
| Long-run progression | **Each run ≤10% longer than the longest run of the past 30 days** (Frandsen 2025). For runs under 8 km, a +1 km step is a practical floor. |
| Runs per week | Beginners 3 (non-consecutive). Recreational 3-4. Racing 4-6. Frequency rises before single-run length does. |
| Quality sessions | 0 in the first 4-8 weeks of running (strides allowed after week 3-4). 1/week for most recreational and hybrid runners. 2/week only with ≥4 runs/week and a stable base. Never on consecutive days, ≥48 h apart, and the long run counts as a hard day. |

**Why ≤10%:** the "10% rule" itself has weak support. In the GRONORUN RCT (Buist 2008, n=532 novices), a graded 13-week plan with 10% steps had the same injury rate as a standard 8-week plan (20.8% vs 20.3%). In Nielsen 2014 (n=874 novices with GPS), increases of >30% over 2 weeks showed more distance-related injuries such as patellofemoral pain and shin problems (HR 1.59, p=0.07, so borderline). In Frandsen 2025 (BJSM, 5,205 runners, 588,071 sessions), a single run >10% longer than the longest run in the previous 30 days raised injury hazard: +64% for a 10-30% spike, +52% for 30-100%, and +128% for >100%. Week-to-week ratios did not predict injury. So keep the weekly ≤10% rule as a sensible ceiling, but police single-run spikes hardest.

## 5. Session library and per-session limits

Per-session caps follow Daniels (practitioner rules, widely used): T ≤10% of weekly km, I ≤8% (and ≤10 km), R ≤5% (and ≤8 km). Below those caps, use the minimums that make a session worthwhile.

| Session | Prescription | Notes |
|---|---|---|
| **Easy** | 20-60 min at Easy pace, Z2, RPE 3-4 | Most of the week. Can follow a lifting session. |
| **Recovery** | 20-30 min, slower than Easy, Z1 | The day after a hard session, or swap for an easy bike or walk. |
| **Long** | 25-30% of weekly km at Easy pace; see §4 caps | Fuel runs >75-90 min (30-60 g carbs/h). Later in a race build, finish with 10-20 min at M or HM effort. |
| **Strides** | 4-8 × 15-20 s (about 80-100 m) at R effort, smooth and relaxed, 60-90 s walk or jog between | 1-3×/week after easy runs. Not a hard session. Good first "speed" for beginners after week 3-4. |
| **Hill sprints / hills** | Sprints: 6-10 × 8-12 s steep uphill, full walk-back recovery. Hill repeats: 6-10 × 30-90 s at about 5K effort, jog down | Hill repeats count as a quality session. Sprints are low-injury-risk power work for experienced runners. |
| **Tempo (continuous threshold)** | 15-25 min at T pace inside a 10-15 min warm-up + 10 min cool-down | Start with 2 × 8-10 min. |
| **Cruise intervals (threshold)** | 3-6 × 5-10 min at T, 60-90 s jog between (about 1:5 rest) | Total 20-40 min at T. The most forgiving quality session for hybrid athletes. |
| **VO2max intervals** | 4-6 × 3-4 min (or 5 × 1 km) at I pace, recovery jog ≈ equal to the rep time | Total 12-20 min at I. Reps of 3-5 min. Beginners start with 6-8 × 1 min / 1 min. |
| **Repetitions** | 6-10 × 200-400 m at R pace, recovery 2-3× the rep time | ≤2 min per rep. Form and speed, not suffering. |
| **Fartlek** | 30-45 min easy with 6-10 surges of 30 s-3 min at T to I effort, by feel | Great when pace targets are unknown, or on trails. |
| **Race-pace** | HM: 2-3 × 10-15 min at HM effort. M: 8-16 km at M pace in long runs | Race-specific phase only. |
| **Time trial** | 5K (or 3K / 30 min) all-out after a 15 min warm-up with strides | Counts as the quality session that week. |

Every quality run needs 10-15 min easy warm-up (+ 2-4 strides before I/R work) and 5-10 min easy cool-down. Count these as easy km.

## 6. Beginners: run/walk

For someone who can't yet run 20-30 min continuously, or who currently runs 0 km. Do 3 sessions/week on non-consecutive days. Each session starts with a 5-min brisk walk, and every running interval is at a conversational effort. This follows the NHS Couch to 5K structure (repeating any week is fine).

| Week | Each session (after a 5 min walk) |
|---|---|
| 1 | 8 × (run 60 s, walk 90 s) |
| 2 | 6 × (run 90 s, walk 2 min) |
| 3 | 2 × (run 90 s, walk 90 s, run 3 min, walk 3 min) |
| 4 | run 3 min, walk 90 s, run 5 min, walk 2.5 min, run 3 min, walk 90 s, run 5 min |
| 5 | S1: 3 × (run 5 min, walk 3 min) · S2: run 8, walk 5, run 8 · S3: run 20 min |
| 6 | S1: run 5, walk 3, run 8, walk 3, run 5 · S2: run 10, walk 3, run 10 · S3: run 25 min |
| 7 | 25 min continuous |
| 8 | 28 min continuous |
| 9 | 30 min continuous |

Rules:
- **Repeat the week** if a session felt very hard (RPE ≥8), if pain hit amber, or if a session was missed.
- Heavier or older beginners, or anyone with a recent lower-limb injury, can spend 2 weeks per stage, or start with 4-6 weeks of brisk walking (30-45 min).
- **Graduation:** 30 min continuous at RPE ≤5, 3×/week, pain-free. Then build volume (§4) and add strides before any quality session.

## 7. Returning after a break

Fitness falls faster than the habit. Tendons and bones lag behind the aerobic system, so rebuild volume conservatively even when the runs feel easy.

| Time off | First week back | Rebuild | Paces |
|---|---|---|---|
| <7 days | Resume the plan; skip the missed quality session | none | unchanged |
| 1-2 weeks | about 75-90% of the previous weekly km, easy only for 3-5 days | 1-2 weeks | unchanged, or 1 row slower |
| 2-4 weeks | about 50-75%, easy only | 2-3 weeks to the previous volume; quality from week 2 | 1 row slower (about −3-4%) |
| 4-8 weeks | about 40-50%, easy only for 2 weeks | 4-6 weeks | 2 rows slower; re-test after 4 weeks |
| >8 weeks, or after injury or illness | treat as a base rebuild: about 30-50% of the old volume. Use run/walk (§6, starting week 3-5) after injury. | 6-12 weeks | re-test before using paces |

After an injury, also require pain-free walking for 30 min, pain-free hopping (10-20 single-leg hops each side), and a clinician's okay where one was involved. After an illness with fever or chest symptoms, wait until symptom-free, then start at the lower end of the band.

## 8. Race-specific basics and taper

| Race | Min. build (from a 3-4 run/week base) | Typical weekly km (recreational) | Peak long run | Key sessions |
|---|---|---|---|---|
| 5K | 6-8 weeks | 20-40 | 8-12 km | I intervals + T; strides |
| 10K | 8-10 weeks | 25-50 | 12-16 km | T (cruise intervals) + I |
| Half marathon | 10-14 weeks | 30-60 | 16-21 km (≤2-2.5 h) | T, then HM-pace segments; long run |
| Marathon | 16-20 weeks | 45-80 | 28-32 km, or about 2.5-3 h (whichever comes first) | Long run with M-pace segments; T |

Entry rule of thumb for a first marathon: ≥30 km/week for 8+ weeks and a comfortable 13-16 km long run before starting a 16-20-week plan. When the timeline is too short, say so and offer a shorter race, a run/walk strategy, or a finish-only goal.

**Phases:** base (easy volume + strides) → build (add 1 quality session, threshold first) → race-specific (race-pace work; long-run peak) → taper.

**Taper (Bosquet 2007 meta-analysis: about 2 weeks, volume −41-60%, intensity and frequency kept):**
- 5K/10K: 7-10 days, volume −30-50%. Keep 1 short quality session (e.g. 4 × 3 min at I) 4-5 days out, plus strides.
- Half marathon: 10-14 days, about −40%. Last long run (≤16 km) 10-14 days out.
- Marathon: 2-3 weeks: about −20-30% (week 1), −40-50% (week 2), −60% in race week. Last 28-32 km long run 3 weeks out.
- Strength during a taper: last heavy lower-body session 7-10 days out; one light session 4-6 days out; nothing new.
- Race-week rules: no new shoes, food or workouts; practice race fuelling in long runs.

## 9. Injury signs, modifications and referral

Use the pain traffic light from `safety-and-scope.md`: green ≤3/10 and settled by next morning; amber 4-5 or not fully settled; red ≥6, sharp, gait-changing, or worse next morning. **Pain that changes how you run means stop the run and walk home.**

| Area | Typical pattern | Coach action | Refer / stop running |
|---|---|---|---|
| **Shin** | Diffuse soreness along the inner shin (>5 cm band) that eases once warm (MTSS-like) | Cut weekly km 30-50%, softer and flatter surfaces, avoid sudden speed or hill work, calf and tibialis strengthening, cross-train on bike or rower | **Focal** pinpoint tenderness on the bone, pain on single-leg hopping, pain at rest or night, or pain that worsens during runs or makes you limp: possible bone stress injury. Stop running and see a clinician. Higher suspicion with low energy availability (RED-S) or a previous stress fracture. |
| **Achilles / calf** | Morning stiffness, pain at the start of runs that warms up, or pain after hills or speed | Hold or cut volume, remove hills and fast running, heavy slow calf raises (3×/week, bent- and straight-knee, about 3 s up / 3 s down), avoid deep heel drops off a step if the pain is at the insertion | A sudden "kicked in the calf" pop with weakness: **emergency** (possible rupture). Swelling, or no improvement in 2-3 weeks: physio. |
| **Front of knee** (patellofemoral) | Pain with downhills, stairs, squats, or sitting long | Cut volume and downhill running. Raise step rate about 5-10% (shorter strides). Hip and quad strengthening (step-ups, split squats to a tolerable depth, hip abduction) | Swelling, locking, giving way: physio. |
| **Outer knee / hip** (ITB-type) | Lateral knee pain that starts at a predictable distance | Shorten runs below the onset distance, avoid cambered roads and long downhills, hip abductor strengthening | No improvement in 2-3 weeks: physio. |
| **Heel / arch** (plantar) | First-step morning pain under the heel | Reduce volume, calf raises with toes elevated, check shoe wear and recent changes | Pain at rest, swelling, or no improvement in 4-6 weeks: physio. |
| **Hip, groin, buttock** | Deep groin pain with running or hopping | Stop running if hopping hurts | **Always refer**: hip and pelvic bone stress injuries need urgent assessment. |

General load rules:
- Amber pain → don't progress volume or intensity. Cut the next runs by 20-50%, remove quality and hills, and re-test in 48 h.
- Keep aerobic fitness with low-impact work (bike, rower, ski erg, elliptical, pool running) at the same planned duration and effort.
- Return from a running injury with run/walk and the §4 progression rules, starting at about 50% volume.

## 10. Running alongside strength training

**Evidence:**
- Concurrent training doesn't meaningfully blunt hypertrophy or max strength (Schumann 2022). It slightly blunts explosive strength, mostly when both are done in one session.
- Running interferes more than cycling (Wilson 2012), and more when frequent or long.
- Strength before endurance in the same session gives better lower-body dynamic strength (Eddens 2018: +6.9%). Order doesn't change aerobic gains.
- Strength training improves running economy by about 2-8% (Blagrove 2018 review, 24 studies). Heavy strength and plyometrics both help.
- Strength training cut sports injuries to about one-third (Lauersen 2014, RR 0.32). Stretching didn't reduce them.

**Scheduling rules:**
1. **Heavy lower-body lifting and hard runs:** either stack them on the same day (quality run first, lift ≥6 h later, or lift first if strength is the priority), or separate them by ≥24-48 h. Never put heavy legs in the 24 h *before* a quality run or long run.
2. Easy runs combine with anything. An easy run after an upper-body session, or 3-6 h after a leg session, costs little.
3. The day after the long run is easy, or upper-body strength.
4. **Same session:** do the priority first. Strength goal: lift, then an easy run. Running goal: run, then upper body or light lower body.
5. When running is ≥3 runs or ≥30 km per week, keep lower-body strength around maintenance to moderate: 2 sessions/week, 2-3 hard sets per exercise, 6-12 total hard sets per lower-body muscle, 3-8 reps at 2-3 RIR, plus calf and hip work. Upper-body volume is unaffected.
6. **Plyometrics** for experienced runners: 1×/week, 40-80 low-intensity contacts (pogo hops, skips, bounds), on a strength day. Skip them during pain or in high-volume weeks.
7. Strength minimum for runners: 2×/week of 30-40 min covering squat or split squat, hinge, calf raises (bent- and straight-knee), hip abduction and core.

## 11. Logging and progress signals

- **Log per run:** type, distance km, duration, average pace, RPE, and optionally average HR, elevation, splits and pain (0-10, during and next morning).
- **Progress shows as:** a faster pace at the same HR on easy runs; less HR drift on long runs; the same T or I session at the same pace feeling 1+ RPE easier; time-trial PRs.
- **Warning signs:** easy-run HR up ≥5-10 bpm at the same pace for a week (fatigue, illness or heat), legs heavy for 3+ runs, pain trending up, or resting HR up unusually. Respond with a cutback week (−30%, easy only), then re-check sleep, food and stress.
- Session load = sRPE × minutes. Watch for single-session spikes, not just weekly totals.
