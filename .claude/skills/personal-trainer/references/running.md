# Running: Paces, Weekly Plans, Progression & Injury Signals

Defaults for lifters who also run (1-3 runs/week beside gym and HIIT) and recreational runners, from first run/walk to 5K-marathon goals. Injury data are mostly observational and intensity trials small, so numbers are **conservative defaults**; the runner's logged response overrides them. Tags: **[MA]** meta-analysis/systematic review · **[RCT]** trial · **[OBS]** observational · **[PS]** guideline, consensus or standard text · **[P]** practitioner convention. Sources: `docs/research/13-running-sources.md` (earlier: `06-running.md`).

## Contents
1. Rules that matter most
2. Intensity: distribution, zones, setting effort without a race
3. Paces from a race (lookup table)
4. Volume, spikes and long-run progression
5. Session library and dosing
6. Weekly templates (1, 2, 3+ runs/week by goal)
7. Beginners: run/walk
8. Returning after a break
9. Race builds and taper
10. Injury signals and what to change
11. Running with lifting and HIIT
12. Logging and progress signals

---

## 1. Rules that matter most

1. **No single run >10% longer than the longest run of the last 30 days** (Frandsen 2025 [OBS]): the best-supported load rule. At most one new longest run per week.
2. **Mostly easy.** About 80% of running time conversational; easy days easy so hard days can be hard.
3. **Volume before intensity.** Speed raises bone load faster than distance (Warden 2021 [PS]). Add quality only after 3-4 stable weeks; hold volume that week.
4. **One change per week:** a longer long run, *or* more km, *or* more/faster quality [P].
5. **Injury in the last 12 months is the strongest risk factor** (van Poppel 2021 [MA]): progress at the low end of every range.
6. **HIIT and heavy legs are hard days too:** one shared hard-day budget (`conditioning.md` §10).

## 2. Intensity

**Distribution.** Keep **~75-80%+ of running time easy** (warm-ups, cool-downs, recovery jogs and long runs count as easy); the rest is threshold, interval and race pace.
- Polarized beat other models only for VO2peak (SMD 0.24), mainly in highly trained athletes and <12-week studies; time trials were equal (Oliveira 2024, 17 studies [MA]).
- Recreational runners: polarized vs threshold-heavy gave similar gains (Muñoz 2014; Festa 2020, where 40/50/10 matched 77/3/20 with 17% less time [RCT]).
- **Default: pyramidal** (easy > threshold > VO2max). At 1-3 runs/week what matters is ≤1 hard run, since HIIT already supplies intensity.

| Intensity | Talk test | RPE 0-10 | ~%HRmax | Pace (§3) | Used for |
|---|---|---|---|---|---|
| Easy / long (incl. recovery) | Full sentences, could chat | 2-4 | 65-79 | Easy range or slower | most running |
| Marathon (M) | Short sentences | 5 | 80-89 | M | marathon segments |
| Threshold (T) | A few words; "comfortably hard" | 6-7 | 88-92 | T (~ pace you could race ~60 min) | tempo, cruise intervals |
| Interval (I) | Can't talk | 8-9 | 95-100 by end of rep | I (~3K-5K race pace) | 2-5 min reps |
| Repetition (R) | n/a (too short for HR) | 8, fast but relaxed | n/a | R (~mile pace) | strides, 200-400 m, hill sprints |

HR bands: Daniels [PS], ±5-10 points individually. When HR and talk test disagree, the talk test wins: comfortable speech tracks the first ventilatory threshold (Reed & Pipe 2014; Kwon 2023 [OBS]).

**Heart rate.** HRmax ≈ 208 - 0.7 × age (Tanaka 2001 [MA], ±10 bpm); a measured max or LTHR (mean HR of the last 20 min of a solo 30-min all-out run; easy < ~85% LTHR) is better. HR lags 1-2 min, drifts in heat and long runs, and is blunted by beta-blockers (then RPE only). Prescribe by **pace + RPE**; HR is an easy-day ceiling.

**No race result yet (the usual hybrid case):**
1. Weeks 1-3: talk test and RPE only (easy = full sentences; quality = fartlek surges at RPE 6-8).
2. Then a time trial after an easy day, as that week's quality: 5K, or 3K (5K ≈ 3K × 1.72), or a mile (5K ≈ mile × 3.33) (Riegel). Use the §3 row.
3. 5K slower than ~35 min, or walkers: stay on effort.

## 3. Paces from a race

Use a **recent (≤8-12 weeks), all-out, flat** race or time trial; take the row nearest the 5K (or 10K/half) time. Computed from the Daniels-Gilbert VDOT equations (Easy 62-70% VDOT, T 88%, I 97.5%, R 105%); matches Daniels' VDOT 50 values within seconds [PS].

| 5K | 10K | Half | Marathon | Easy /km | M /km | T /km | I /km | R /km |
|---|---|---|---|---|---|---|---|---|
| 16:00 | 33:13 | 1:13:19 | 2:33:26 | 4:10-4:35 | 3:38 | 3:27 | 3:11 | 3:00 |
| 17:00 | 35:16 | 1:17:56 | 2:42:56 | 4:24-4:52 | 3:52 | 3:40 | 3:22 | 3:10 |
| 18:00 | 37:20 | 1:22:33 | 2:52:25 | 4:39-5:08 | 4:05 | 3:52 | 3:33 | 3:21 |
| 19:00 | 39:24 | 1:27:11 | 3:01:52 | 4:53-5:23 | 4:19 | 4:04 | 3:44 | 3:31 |
| 20:00 | 41:28 | 1:31:50 | 3:11:17 | 5:08-5:39 | 4:32 | 4:16 | 3:56 | 3:42 |
| 21:00 | 43:32 | 1:36:28 | 3:20:41 | 5:22-5:55 | 4:45 | 4:28 | 4:07 | 3:52 |
| 22:00 | 45:37 | 1:41:07 | 3:30:03 | 5:37-6:11 | 4:59 | 4:40 | 4:18 | 4:03 |
| 23:00 | 47:42 | 1:45:46 | 3:39:22 | 5:51-6:26 | 5:12 | 4:52 | 4:29 | 4:13 |
| 24:00 | 49:48 | 1:50:25 | 3:48:40 | 6:05-6:42 | 5:25 | 5:04 | 4:40 | 4:24 |
| 25:00 | 51:53 | 1:55:04 | 3:57:55 | 6:19-6:57 | 5:38 | 5:16 | 4:51 | 4:34 |
| 26:00 | 53:59 | 1:59:42 | 4:07:08 | 6:34-7:13 | 5:51 | 5:28 | 5:02 | 4:45 |
| 27:00 | 56:05 | 2:04:20 | 4:16:19 | 6:48-7:28 | 6:04 | 5:40 | 5:14 | 4:55 |
| 28:00 | 58:11 | 2:08:57 | 4:25:28 | 7:02-7:43 | 6:17 | 5:52 | 5:25 | 5:06 |
| 29:00 | 1:00:17 | 2:13:34 | 4:34:35 | 7:16-7:58 | 6:30 | 6:04 | 5:36 | 5:16 |
| 30:00 | 1:02:23 | 2:18:10 | 4:43:39 | 7:30-8:13 | 6:43 | 6:16 | 5:47 | 5:27 |
| 32:00 | 1:06:35 | 2:27:20 | 5:01:42 | 7:57-8:43 | 7:09 | 6:40 | 6:09 | 5:48 |
| 34:00 | 1:10:47 | 2:36:26 | 5:19:36 | 8:25-9:12 | 7:34 | 7:03 | 6:31 | 6:09 |
| 36:00 | 1:14:59 | 2:45:30 | 5:37:22 | 8:52-9:41 | 8:00 | 7:27 | 6:53 | 6:30 |
| 38:00 | 1:19:11 | 2:54:30 | 5:55:01 | 9:19-10:10 | 8:25 | 7:51 | 7:15 | 6:51 |
| 40:00 | 1:23:22 | 3:03:27 | 6:12:33 | 9:45-10:39 | 8:50 | 8:14 | 7:37 | 7:11 |

- Between rows use the slower row. **Easy pace is a ceiling**: slower is always fine (hills, heat, HIIT yesterday). T/I/R ±5 s/km.
- **Marathon predictions are optimistic.** Riegel (T2 = T1 × (D2/D1)^1.06) is well calibrated up to the half but put the marathon ≥10 min too fast for half of 2,303 recreational runners; weekly mileage improved prediction (Vickers 2016 [OBS]). Add ~5% to the table marathon unless ≥60 km/week with ≥30 km long runs [P].
- **Re-test** every 6-10 weeks, or move a row faster when the same T/I session feels ≥1 RPE easier for 2-3 weeks.

## 4. Volume, spikes and long-run progression

| Rule | Default |
|---|---|
| **Single-run cap** (any run) | ≤ longest run of the last 30 days × 1.10. Spikes of >10-30%, >30-100% and >100% raised overuse-injury rate 64%, 52% and 128% in 5,205 runners (Frandsen 2025 [OBS]) |
| Spacing | At most **one** new longest run per week; chaining +10% runs within a week is still too much (Frandsen's authors) |
| Weekly km | Plan from the 3-4-week average, not the best week; ceiling ≈ +10% (or +3-5 km at low volume) [P] |
| Cutback | Every 3rd-4th week: -20-30% km, long run back to ~80%, keep one short quality touch [P] |
| Long-run share | ≤30% of weekly km below ~60 km/week (≤40% at 1-2 runs or <20 km/week); ≤25% and ≤150 min above (Daniels [P]); marathon builds ~3 h max. Past 40%, add a run before lengthening the long one |

**Weekly ramps:** a graded 10%/week plan didn't cut injuries in 532 novices (20.8% vs 20.3%; Buist 2008 [RCT]); >30% over 2 weeks gave borderline more distance-related injuries in 874 novices (HR 1.59, p=0.07; Nielsen 2014 [OBS]); week-to-week ratio showed no link and ACWR an inverse one (Frandsen 2025). Weekly 10% is a ceiling, not a magic number; police single-run spikes hardest.

**Long-run progression** (worked rule): step = +10% of the 30-day longest, every 1-2 weeks, with a cutback every 3rd-4th week.
- From 10 km: 11 → 12 → 10 (cutback) → 13 → 14 → 11 → 15 km: ~+5 km in 7 weeks. Plan race builds backwards from this.
- Round down on short runs (5 → 5.5 km; 30 → 33 min); use minutes on trails. Beginners follow §7.

## 5. Session library and dosing

Per-session caps (Daniels [P]): T ≤10% of weekly km, I ≤8% (≤10 km), R ≤5% (≤8 km); below ~25-30 km/week use the session minimums instead. Quality runs get a 10-15 min easy warm-up (+2-4 strides before I/R) and 5-10 min cool-down, counted as easy.

| Session | Prescription | Notes |
|---|---|---|
| **Easy** | 20-60 min at Easy pace, RPE 2-4 | Default run |
| **Long** | Week's longest run at Easy pace; §4 caps | Fuel >75-90 min (30-60 g carbs/h) [PS]; late in a half/marathon build finish with 10-20 min at M/HM effort |
| **Strides** | 4-8 × 15-20 s (~80-100 m) at R effort, smooth, full walk/jog recovery | 1-3×/week after easy runs; not a hard session [P] |
| **Hill sprints** | 6-10 × 8-12 s steep uphill, walk back | Easy-day add-on for experienced runners [P] |
| **Hill repeats** | 6-10 × 30-90 s at ~5K effort, jog down | Counts as quality. |
| **Fartlek** | 30-45 min easy with 6-10 surges of 30 s-3 min at RPE 6-8 | Best first quality; no paces needed |
| **Tempo** | 15-25 min continuous at T (start 2 × 8-10 min) | |
| **Cruise intervals** | 3-6 × 5-10 min at T, 60-90 s jog | 20-40 min at T; most forgiving quality for hybrids |
| **VO2max intervals** | 6-8 × 1 min/1 min → 5 × 2 → 5 × 3 → 4-5 × 4 min (or 5 × 1 km) at I, jog ≈ rep time | 10-20 min total at I |
| **Repetitions** | 6-10 × 200-400 m at R, jog 2-3× rep time | ≤2 min reps; speed and form |
| **Race-pace** | HM: 2-3 × 10-15 min at HM effort. M: 8-16 km at M inside long runs | Race-specific phase |
| **Time trial** | 3K/5K all-out after warm-up + strides | The week's quality |

**Quality sessions per week:** 0 in the first 4-8 weeks (strides from week 3-4); 1 for most recreational and hybrid runners; 2 only with ≥4 runs/week, a stable base and ≤1 HIIT. Never on consecutive days; the long run counts as a hard day [P].

## 6. Weekly templates

Q = quality, L = long, E = easy. Place them with §11 and `conditioning.md` §10. Progress frequency → long run → quality.

| Runs/week | General fitness / hybrid | 5K-10K goal | Half-marathon goal | Marathon goal |
|---|---|---|---|---|
| **1** | 30-45 min E + 4-6 strides; extend toward 60 min by §4. HIIT supplies the intensity. | Alternate weeks: fartlek / long-ish E (≤60 min). Expect slow progress. | Not enough: offer 2+ runs or a finish goal with run/walk. | Not suitable. |
| **2** | E + strides; L (or fartlek every 2nd-3rd week) | Q (fartlek → cruise → I reps); L 8-12 km | Q (T, then HM pace); L to 16-18 km | Finish goal only: L to ~28 km + 1 E; add 1-2 low-impact aerobic sessions (bike, row). |
| **3** | E + strides; E; L | Q; E + strides; L 8-14 km | Q (T); E + strides; L to 18-21 km (last 10-20 min at HM effort late in build) | Q (T or M-pace); E; L to 28-32 km (≤3 h). ≥30 km/week base first. |
| **4+** | add E runs | 2 Q possible (I + T); L 10-16 km | Q; E; E + strides; L | Q (T); M-pace long run alternate weeks; E ×2 |

Hybrid rules of thumb:
- With **≥2 HIIT/week**, keep running at 0-1 quality session; with 1 run/week, that run stays easy or fartlek.
- HIIT on rower/bike/ski spares the legs; running- or jump-heavy HIIT adds impact load.
- Put the long run where the next day can be easy or upper-body.

## 7. Beginners: run/walk

For anyone who can't yet run 20-30 min nonstop: 3 sessions/week on non-consecutive days, each after a 5-min brisk walk, running conversational. Follows NHS Couch to 5K [PS]; repeating weeks is normal.

| Week | Each session |
|---|---|
| 1 | 8 × (run 60 s, walk 90 s) |
| 2 | 6 × (run 90 s, walk 2 min) |
| 3 | 2 × (run 90 s, walk 90 s, run 3 min, walk 3 min) |
| 4 | run 3, walk 1.5, run 5, walk 2.5, run 3, walk 1.5, run 5 (min) |
| 5 | S1: 3 × (run 5, walk 3) · S2: run 8, walk 5, run 8 · S3: run 20 |
| 6 | S1: run 5, walk 3, run 8, walk 3, run 5 · S2: run 10, walk 3, run 10 · S3: run 25 |
| 7-9 | 25 → 28 → 30 min continuous |

- **Repeat the week** after an RPE ≥8 session, amber pain, or a missed session. Week 5's 20-min run is a big jump: offer week 5-S2 twice if needed.
- Heavier or older beginners, or after leg injury: 2 weeks per stage, or 4-6 weeks of 30-45 min brisk walks first.
- **Graduation:** 30 min continuous at RPE ≤5, 3×/week, pain-free. Then grow the long run and volume (§4) and add strides before any quality.

## 8. Returning after a break

Aerobic fitness returns faster than tendon and bone tolerance, so rebuild volume conservatively even when runs feel easy [P]. The §4 single-run cap uses the last 30 days, so after a break it is automatically lower.

| Time off | First week back | Back to previous volume | Paces |
|---|---|---|---|
| <7 days | Resume; skip the missed quality | now | unchanged |
| 1-2 weeks | ~75-90% of previous km, easy only for 3-5 days | 1-2 weeks | unchanged or 1 row slower |
| 2-4 weeks | ~50-75%, easy only | 2-3 weeks; quality from week 2 | 1 row slower |
| 4-8 weeks | ~40-50%, easy only for 2 weeks | 4-6 weeks | 2 rows slower; re-test after 4 weeks |
| >8 weeks, injury or illness | ~30-50%; run/walk (§7, from week 3-5) after injury | 6-12 weeks | re-test first |

All tiers [P]. After injury also require 30 min pain-free walking, 10-20 pain-free single-leg hops each side, and a clinician's okay where one was involved. After fever or chest illness: symptom-free first, then the low end.

## 9. Race builds and taper

| Race | Min. build (from 3 runs/week) | Typical weekly km | Peak long run | Key sessions |
|---|---|---|---|---|
| 5K | 6-8 weeks | 15-40 | 8-12 km | I reps + T; strides |
| 10K | 8-10 weeks | 20-50 | 12-16 km | T (cruise) + I |
| Half | 10-14 weeks | 25-60 | 16-21 km (≤2.5 h) | T, then HM-pace; long run |
| Marathon | 16-20 weeks | 40-80 | 28-32 km or ~3 h, whichever first | Long run with M segments; T |

[PS/P: Daniels, Pfitzinger.] First marathon: ≥30 km/week for 8+ weeks and a comfortable 13-16 km long run first. If §4 long-run steps can't reach the peak in time, say so; offer a shorter race, run/walk, or a finish goal.

**Phases:** base (easy volume + strides) → build (1 quality, threshold first) → race-specific (race pace; long-run peak) → taper.

**Taper:** ~2 weeks, volume cut 41-60% progressively, intensity and frequency kept (Bosquet 2007; Wang 2023 [MA]). In 158,000 recreational marathoners, a strict 3-week taper went with a median 2.6% (5.5 min) faster finish than a minimal taper (Smyth 2021 [OBS]).
- 5K/10K: 7-10 days, -30-50% km; one short I or T session 4-5 days out, plus strides.
- Half: 10-14 days, ~-40%; last long run (≤16 km) 10-14 days out.
- Marathon: 3 weeks, about -20-30%, -40%, then -60% in race week; last 28-32 km run 3 weeks out; keep short M-pace work.
- Strength: last heavy lower-body session 7-10 days out, one light session 4-6 days out.
- Race week: nothing new (shoes, food, workouts); fuelling rehearsed in long runs.

## 10. Injury signals and what to change

Use the pain traffic light from `safety-and-scope.md` (green ≤3/10 and settled next morning; amber 4-5 or not settled; red ≥6, sharp, or limping). **Pain that changes the gait ends the run: walk home.**

| Area | Typical pattern | Coach action | Stop running and refer |
|---|---|---|---|
| **Shin** | Diffuse inner-shin soreness that eases once warm (MTSS-like) | Cut km 30-50%, flat/soft routes, no new speed or hills, calf work, cross-train | **Focal** bony tenderness, pain on single-leg hop, rest/night pain, or pain building during runs: possible bone stress injury (more likely with low energy availability or a past stress fracture) |
| **Achilles / calf** | Morning stiffness; pain at the start of runs that warms up; worse after hills or speed | Hold or cut volume; drop hills and speed; heavy slow calf raises 3×/week (bent and straight knee), no deep heel drops for insertional pain. Running with pain ≤5/10 that settles by next morning is acceptable (Silbernagel 2007 [RCT]) | Sudden "kicked" pop with weakness: **emergency** (rupture?). Swelling or no improvement in 2-3 weeks: physio |
| **Front of knee** | Pain on downhills, stairs, squats, long sitting | Cut volume and downhills; hip + knee strengthening is first-line (Crossley 2016 consensus [PS]); raise step rate 5-10% (less knee energy absorption: Heiderscheit 2011 [RCT]) | Swelling, locking, giving way |
| **Outer knee** (ITB-type) | Lateral knee pain at a predictable distance | Keep runs below onset distance; avoid camber and long downhills; hip abductor work | No improvement in 2-3 weeks |
| **Heel / arch** | First-step morning heel pain | Reduce volume; calf raises with toes elevated; check recent shoe changes | Rest pain, swelling, or no improvement in 4-6 weeks |
| **Hip / groin / buttock** | Deep groin or buttock pain with running or hopping | Stop running | **Always refer**: femoral neck and pelvic bone stress injuries are high-risk |

Load rules:
- Amber → no progression; cut the next runs 20-50%, drop quality and hills, re-check in 48 h.
- Speed and hills load tendons and bone more than easy km: they are the first thing to drop and the last to return (Warden 2021).
- Keep fitness with bike, rower, ski erg, elliptical or pool running at the planned duration and effort.
- Return with run/walk and §4 rules from ~50% volume.

## 11. Running with lifting and HIIT

This section owns the concurrent-training evidence; the weekly scheduling rules (hard-day budget, spacing, pairings) live in `conditioning.md` §10.

**Evidence:**
- Concurrent training doesn't blunt hypertrophy or max strength; explosive strength is blunted mainly in same-session designs (not at ≥3 h apart); running vs cycling made no difference (Schumann 2022, 43 studies [MA]). In **trained** lifters, same-session work blunted lower-body 1RM (ES -0.66; separate sessions -0.10) (Petré 2021 [MA]). Strength first gives better lower-body strength (Eddens 2018 [MA]).
- Strength training improves running economy 2-8% and time trials (Blagrove 2018 [MA]). Heavy (≥80% 1RM) and heavy + plyometric work help most; plyometrics aid economy mainly at ≤12 km/h, heavy lifting at faster speeds; light circuits and isometrics did little (Llanos-Lagos 2024 [MA]).
- **Injury:** strength work cut sports injuries overall (Lauersen 2014, RR 0.32 [MA]), but in runners prevention programmes worked only when supervised (Wu 2024, 9 RCTs [MA]); an unsupervised plan didn't cut marathon injuries (Toresdahl 2019 [RCT]). Sell strength for performance, not as injury insurance.

**Running-specific rules** (with `conditioning.md` §10):
1. Same day: hard run and heavy legs 3-6 h apart (intermediate+), priority first; easy runs pair with anything (after upper body, or 3-6 h after legs).
2. At ≥3 runs or ≥30 km/week, keep lower-body strength at 2 sessions/week, 6-12 hard sets per muscle, 3-8 reps at 2-3 RIR (heavy), plus calf and hip work. Upper body unaffected.
3. Plyometrics for experienced runners: 1-2×/week, 40-80 low-intensity contacts (pogos, skips, bounds) on a strength day; skip with pain or in peak-volume weeks.

## 12. Logging and progress signals

- **Log per run:** type, km, duration, average pace, RPE; optional HR, elevation, pain 0-10 (during and next morning).
- **Before prescribing a run**, find the longest run of the last 30 days and the 3-4-week average km.
- **Progress:** faster pace at the same HR on easy runs; less HR drift on long runs; the same T/I session ≥1 RPE easier; time-trial PRs.
- **Warning signs:** easy HR up ≥5-10 bpm at the same pace for a week, heavy legs 3+ runs, pain trending up, high resting HR. Cut back a week (-30%, easy only); check sleep, food, stress.
- Session load = sRPE × minutes (Foster 2001); watch single-session spikes, not just weekly totals.
