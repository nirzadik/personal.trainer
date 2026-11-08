# 12: CrossFit.com workout analysis (90-day coded sample) and conditioning evidence check

Research date: 2026-11-08. Purpose: replace snippet-based claims in `10-crossfit-programming.md` with what CrossFit.com actually publishes, check the conditioning claims against peer-reviewed sources, and rebuild `references/conditioning.md`.

Confidence tags:
- **[D]**: measured directly from the coded sample in this document.
- **[CF]**: read this session in CrossFit's own primary text (L1 Training Guide 2020 PDF, the 2003 CrossFit Journal template reprint, crossfit.com articles).
- **[R]**: peer-reviewed source; full abstract read this session (marked R) or via search-result summary only (marked R-s).
- **[P]**: practitioner heuristic; **[!]** weak, conflicting or unverified.

## 1. Method

- **Sample:** every daily post on CrossFit.com from **2026-08-11 to 2026-11-08 (90 consecutive days: 64 training days, 26 rest days)**. I also read 2026-07-27 to 08-10 (15 more days) to check the rest-day pattern over 105 days, but they are not in the statistics.
- **Access:** the HTML archive pages (`/workout/YYYY/MM/DD`) are client-rendered and often arrive without the workout. The page's own script fetches the same URL as JSON (`wods.wodRaw`), so I requested that JSON. Raw files went to the scratchpad's download folder; parsing scripts lived in a separate folder and ran with `python3 -I`. Nothing downloaded was executed.
- **Coding (manual, one coder):** for each day: rest or not; format (FT = single pass For Time incl. descending ladders; RFT; AMRAP; INT = intervals, EMOM-style, "each for time" or repeated AMRAP blocks; CHIP = long list once through; STR = strength/heavy only; TWO = conditioning + strength part; TEAM); modalities present (M/G/W, the 2003 template's definitions: jump rope = M, external load = W); distinct movements; estimated Rx/intermediate time domain from the published stimulus notes (targets, caps, splits), or from the clock for fixed-time formats (≤5, 6-10, 11-20, >20 min; and for the brief's bands, S <8, M 8-20, L >20); conditioning load (N unloaded, L/M/H by CrossFit's own unbroken-reps definitions: light ≥20, moderate 6-19, heavy ≤5); named benchmark (Girl, Hero, other benchmark); "compare to" retest link; competition (Community Cup / Service Cup); how the intermediate and beginner versions differ (L load, V volume, S substitution, R range/standard, = same as Rx).
- **Limits:** one coder; time domains are estimates for an intermediate-to-Rx athlete; the sample spans late summer to autumn and includes 6 community-competition workouts (9%), which may shift the mix. Workout texts are not reproduced: only codes and aggregate statistics, with benchmark names.

## 2. Sample statistics [D]

| Measure | Result (n = 64 training days unless stated) |
|---|---|
| Training : rest | 64 : 26 (71% training). Rest days were **always Thursday and Sunday** (all 15 weeks in the 105 days read): Mon-Wed on, Thu off, Fri-Sat on, Sun off. Never >3 training days in a row. |
| Format | For Time 30%, RFT 20%, chipper 5% (task priority 55%); strength-only 14%; intervals 14%; AMRAP 11%; two-part 5%; team 2% |
| Movements per day | single 17%, couplet 42%, triplet 25%, 4+ 16% (conditioning only, n=55: single 9%, couplet 47%, triplet 25%, 4+ 18%) |
| Modalities per day | one 33%, two 52%, three 16%. Most common: G+W 27%, W only 20% (mostly strength days), M+G+W 16%, M+W 14%, M+G 11%, M only 6%, G only 6% |
| Modality present | W 77%, G 59%, M 47% |
| Time domain, conditioning (n=55) | ≤5 min 5%, 6-10 min 18%, 11-20 min 55%, >20 min 22%. Brief's bands: short <8 15%, medium 8-20 62%, long >20 24%. Median 15 min, IQR 11-20, range 5-50 |
| Strength/heavy days | 9 (14%); ≥1 per week in 9 of 13 weeks; heavy-loaded conditioning on 6 more days. Heavy exposure (strength day or heavy metcon) 1-2/week in 12 of 13 weeks |
| Conditioning load (n=55) | unloaded 27%, light 29%, moderate 33%, heavy 11% |
| Stimulus notes | 64/64 (100%). 39/55 conditioning pieces (71%) gave a fixed clock or a numeric time/split target; the rest described the domain in words ("sprint", "long grind") or relied on a benchmark's known time. 32/55 cued load by set size ("first set unbroken", "sets of 5", "2-3 sets") |
| Scaling tiers | intermediate and beginner versions on 64/64. Intermediate "same as Rx" 27% (all 9 strength days plus erg/run intervals and some benchmarks). When changed, intermediate cut load 64%, volume 55%, substituted 28%, changed range/standard 15%. Beginner "same as Rx" 11% (heavy days with relative load and a few interval days); when changed, beginner cut volume 81%, substituted 70%, cut load 63%, changed range/standard 7% |
| Typical scaled loads | intermediate ≈ 60-70% of Rx (e.g. 50→35 lb DB, 135→95 lb bar); beginner ≈ 35-45% (e.g. 50→20 lb DB, 135→45 lb bar); beginner volume about 30-70% of Rx; the time target stays the same |
| Named benchmarks | 13 days (20%): Girls 5 (Fran, Grace, Diane, Nancy, Linda) + 1 Elizabeth variant; Hero 1 (Small); other benchmarks 5 (Fight Gone Bad ×2, Andi, CrossFit Total, Olympic Total); tribute team workout 1 (LGOP). Several unnamed days were described as "a spin on" a Girl or Hero (Nancy, DT) |
| Retests ("compare to") | 20 days (31%, ≈1.5/week). Gap to the linked attempt: median ≈ 8.5 months, range 56 days-15 years; shortest were strength lifts (front squat 56 days) and Fight Gone Bad (67 days); Linda 91 days |
| Consecutive training-day pairs (n=38) | same format 6, same modality set 1, same time domain 9, **same format + modalities + time domain 0**, two strength days in a row 0, two >20-min pieces in a row 1 |
| Rest-bounded blocks (n=26: 12 of 3 days, 14 of 2) | 23/26 contained ≥2 different time domains (heavy counted as one); 9/26 contained a strength day |
| Weekly shape (12 full weeks) | ≈1 heavy day, ≈1 long or aerobic-interval piece, 0-2 short pieces, 2-4 medium couplets/triplets; Monday was often an M-led interval or test day |
| Explicit day-to-day sequencing in notes | 5 notes referenced the previous day or deliberate overlap (e.g. "after two days of upper-body pulling and pushing, lower body and midline"; "intentional pulling redundancy"; "if you did yesterday's workout, expect your legs to feel it") |
| Eccentric-heavy volume in beginner versions | beginners were still given 25-30 jumping pull-ups (2 days) and 50 sit-ups as a GHD substitute (1 day), above our ramp-in caps |

## 3. What CrossFit's own texts say, and why the sample looks like this [CF]

- **2003 template (CrossFit Journal reprint, read in full):** the 12-day 3-on/1-off table is **M | GW | MGW | off | G | WM | GWM | off | W | MG | WMG | off**. Each 3-day block goes single → couplet → triplet, and the single-element lead rotates M → G → W. Single days are long slow distance (M), one skill practised (G) or one heavy low-rep lift (W), with recovery not limiting. Couplets are task priority, usually 3-5 rounds (most often 5) for time, at moderate-to-high intensity, where work:rest management is critical and "the first round is hard but possible". Triplets are time priority, ~20 min for rounds at light-to-moderate load. The 5-on/2-off table runs single, couplet, triplet, couplet, single each week with the same rotation. The article says the template is "as much descriptive as prescriptive" and **did not generate** the daily workouts.
- **Current cadence:** an Essentials article still describes the mainsite as 3 on/1 off. The sample instead shows a fixed 5-on/2-off week split 3+2 (Thu and Sun off). So the "3 on/1 off" claim describes the method's origin, not current practice.
- **Programming Basics, Parts 1-2 (CrossFit Education):** variance is applied to load (unloaded; light ≥~20 unbroken; moderate ~6-20; heavy ~1-5), volume (reps <50 / 50-200 / >200; distance <800 m / 0.8-3.2 km / >3.2 km), movement function and modality, and time (very short <5 min and heavy days, short 5-10, moderate 11-20, long 20+). Most workouts are 8-15 min, couplets/triplets, complementary pairings and high-power movements, mostly task priority. Duration is estimated per movement → per round → × rounds, plus transitions and fatigue. Their GPP week: 1 heavy, 1 short, 1 long, 3 classic; review the last 1-2 weeks of programming for gaps (e.g. no long pieces, no monostructural work, no floor pulls) before planning the next.
- **Heavy Days:** at least weekly or every other cycle; sets of 1-5, about 7-25 total working reps.
- **L1 Training Guide (2020), scaling:** "preserve the stimulus" (movements + time domain + load). For beginners, halve intensity and/or volume for at least 2 weeks and scale significantly for at least a month. Scale load first: the first round must be completed without failure, and newer athletes often use <50% of Rx. Times should be "relatively similar" to advanced athletes' (Fran should take several minutes, not 15). Substitute movements last, matching upper/lower, function, range of motion and plane. Stop or reduce load when form becomes unsafe.
- **L1, rhabdomyolysis:** follow mechanics → consistency → intensity; limit movements that prolong the eccentric phase (jumping pull-ups, full-range GHD sit-ups); avoid "progressive scaling"; educate on symptoms. The highest-risk athletes are those fit from other training, returners after a layoff, and experienced athletes who jump outside their norm. "Multiple months" at scaled loads is normal.
- **Ask a Coach: test/retest:** program a repeat or benchmark weekly or every two weeks, or use testing blocks; vary which tests are repeated. This matches the 31% retest rate observed.

## 4. Evidence check of conditioning claims

| Claim in old conditioning.md | Verdict | Evidence |
|---|---|---|
| ≥48 h between hard sessions for the same patterns | **Supported** (48-72 h) | Timón 2019 (Biol Sport, n=12): performance, CK, transaminases and glucose back to baseline by 48 h [R-s]. 2026 microcycle study (Sports, n=14): CMJ, grip and perceived recovery reduced at 24 h, baseline by 48 h [R]. 68-study scoping review (BMC SSMR 2024): 48-72 h, with physiological markers lagging performance [R] |
| 2-3 HIIT sessions/week for most | **Supported, weak** | Meta-analyses in athletes and adolescents: 3/week often significant, 2/week sometimes not, no clear frequency effect for sprint intervals; total weekly dose matters more [R-s]. No ACSM primary guideline found (as in 07) |
| ≤30-40 min/week >90% HRmax | **Weak** [!] | Single small, industry-funded study. Kept as a ceiling, tagged [P] |
| Work:rest by energy system | **Supported as convention** | NSCA table; Buchheit & Laursen 2013. NMA 2026 (19 studies, 240 athletes): no HIIT structure clearly superior for time ≥90% VO2max, so choose by feasibility [R] |
| Rhabdo drivers: unaccustomed volume, eccentrics, heat, etc. | **Supported (case-level)** | Hopkins 2019: 11 of 523 CrossFit-injured patients at one centre (2.1%), mostly male, mean age ~35 [R-s]; 26-study HIFT review (63 cases) and CHAMP 2025 (from 07). Case series include both first-session novices and experienced athletes [R-s]. L1 adds that fit newcomers and returners are highest risk [CF] |
| Newcomers need a ramp | **Supported** | Larsen 2020 (Sports, prospective, n=168 novices, 8-week start-up): 9.5 injuries/1,000 h vs 0.74-3.3 in experienced cohorts [R-s]. L1: halve for ≥2 weeks, scale ≥1 month [CF] |
| Concurrent interference small | **Supported, nuanced** | Schumann 2022 (Sports Med, 1,090 participants): no interference for max strength or hypertrophy overall; small interference within the same session; explosive strength may be blunted (Lundberg 2022) [R-s]. Petré 2021: trained lifters' lower-body strength can be impaired [R-s] |
| Injury sites (spine, shoulder, knee; 3.2/1,000 h) | Unchanged | 2021 meta-analysis (from 07) |
| "Original cycle runs M, G, W singles, then pairs, then triplets" | **Wrong** | Actual 2003 table above. A 2020 peer-reviewed systematic review ("CrossFit Training Strategies from the Perspective of Concurrent Training") gives yet another order (W, GW, GM, WGM, G, WG, M), so the error is common [CF] |
| Mainsite "3 on, 1 off (or 5/2)" | **Outdated** | Current mainsite: fixed Mon-Wed / Fri-Sat, Thu and Sun off [D] |

Not re-verified: Milanović 2015 (Springer blocked). Note for `07`/`programming.md` owners: from memory, that meta-analysis reports HIIT ≈ +5.5 ml/kg/min vs continuous ≈ +4.9, a difference of about 1 ml/kg/min, not "+5.5 more than" continuous as `07-conditioning.md` §2 states [K, check].

## 5. What changed in `references/conditioning.md`

- **Added §2, a design recipe:** stimulus → time band (CrossFit's ≤5 / 5-10 / 11-20 / >20) → task vs time priority → time-estimation method → movement functions and volume bands → load as unbroken-set size → scaling. Each step carries observed mainsite proportions.
- **Rewrote scaling (§7):** the ladder now follows the L1 order with numbers (load first, newcomers <50% Rx, beginners halved ≥2 weeks); observed tier ratios (intermediate ≈60-70%, beginner ≈35-45% of Rx load); a "no progressive scaling" rule.
- **New §9, weekly rotation for 1-4 metcons/week,** derived from the observed week shape and the GPP template, with strength days counted as the heavy day and the long run as the long day. Rotation rules use the corrected template order.
- **New limited-equipment substitution table (§6),** with DB/KB and bodyweight/outdoor columns, swapped by equal time.
- **Evidence tags and corrections:** ≥48 h now cites 3 studies (48-72 h); frequency is "2-3, dose > frequency"; the novice injury rate and highest-risk groups were added to the ramp-in; concurrent-training numbers updated; the rest-rhythm claim corrected; the wrong template sequence removed.
- **Cut:** the essay-style §12 (merged into §2, §9 and §11), duplicate scaling text, the 6-day template row and examples. Size 24,104 → 21,983 bytes. §10 (hybrid scheduling) keeps its number because `SKILL.md` refers to it.

## 6. Corrections made to `10-crossfit-programming.md`

The access note now says the pages were read in this pass. The §3 rotation sequence is replaced with the verified table. §3's "couplets/triplets majority" and the 8-15 min norm are now [CF]/[D]. §4's rest cycle now records the current Thu/Sun pattern. §10's "strict 12-day sequence not verified" is updated. Each change points here.

## 7. Per-day coding

Columns: date, format, modalities / distinct movements, time domain (S/M/L, H = heavy strength) ~estimated minutes, load (N/L/M/H), tags, intermediate / beginner scaling (L load, V volume, S substitution, R range; = as Rx).

| Day | Format | Mod / n | Time | Load | Tags | Int / Beg |
|---|---|---|---|---|---|---|
| 08-11 Tue | FT | M / 1 | L ~20 | N | retest | = / V |
| 08-12 Wed | FT | GW / 2 | M ~12 | M |  | SL / SL |
| 08-13 Thu | rest | | | | | |
| 08-14 Fri | STR | W / 3 | H | H | bench retest cup | = / = |
| 08-15 Sat | TEAM | MGW / 7 | L ~40 | M | tribute | L / VSL |
| 08-16 Sun | rest | | | | | |
| 08-17 Mon | CHIP | MGW / 3 | M ~15 | L |  | VL / VSL |
| 08-18 Tue | FT | GW / 2 | M ~12 | M |  | VL / VSL |
| 08-19 Wed | RFT | MGW / 3 | L ~24 | L |  | VRL / VSRL |
| 08-20 Thu | rest | | | | | |
| 08-21 Fri | INT | MGW / 5 | M ~16 | M |  | cup / VL |
| 08-22 Sat | FT | GW / 3 | M ~12 | H |  | SL / SVL |
| 08-23 Sun | rest | | | | | |
| 08-24 Mon | STR | W / 1 | H | H | retest | = / = |
| 08-25 Tue | INT | MGW / 4 | L ~24 | L |  | SL / VSL |
| 08-26 Wed | RFT | MG / 3 | M ~17 | N |  | VR / VRS |
| 08-27 Thu | rest | | | | | |
| 08-28 Fri | RFT | MGW / 3 | L ~22 | L | cup | VSL / VSL |
| 08-29 Sat | FT | GW / 2 | M ~12 | H | girl-var | SL / VSL |
| 08-30 Sun | rest | | | | | |
| 08-31 Mon | INT | MGW / 5 | M ~17 | L | bench retest | = / SL |
| 09-01 Tue | STR | W / 1 | H | H | retest | = / L |
| 09-02 Wed | AMRAP | GW / 2 | M ~10 | L |  | VR / SVR |
| 09-03 Thu | rest | | | | | |
| 09-04 Fri | TWO | MW / 2 | S ~6 | L+H |  | V / VL |
| 09-05 Sat | RFT | MG / 4 | M ~14 | N |  | V / VS |
| 09-06 Sun | rest | | | | | |
| 09-07 Mon | STR | W / 1 | H | H | retest | = / = |
| 09-08 Tue | FT | MW / 3 | M ~15 | M |  | L / VSL |
| 09-09 Wed | FT | GW / 2 | S ~7 | M |  | = / S |
| 09-10 Thu | rest | | | | | |
| 09-11 Fri | CHIP | W / 4 | L ~30 | L | bench retest | VL / VL |
| 09-12 Sat | AMRAP | G / 2 | M ~12 | N |  | S / S |
| 09-13 Sun | rest | | | | | |
| 09-14 Mon | TWO | MW / 2 | S ~7 | H |  | = / V |
| 09-15 Tue | AMRAP | GW / 6 | M ~8 | L | cup | SL / SVL |
| 09-16 Wed | TWO | MW / 2 | M ~15 | M+H | cup | L / VL |
| 09-17 Thu | rest | | | | | |
| 09-18 Fri | CHIP | GW / 4 | L ~22 | L | cup | RL / VSL |
| 09-19 Sat | FT | MW / 2 | S ~5 | L | cup | SL / VSL |
| 09-20 Sun | rest | | | | | |
| 09-21 Mon | FT | W / 1 | S ~5 | M | girl retest | L / L |
| 09-22 Tue | RFT | MGW / 3 | M ~10 | L |  | VL / VSL |
| 09-23 Wed | AMRAP | G / 2 | M ~15 | N |  | V / VS |
| 09-24 Thu | rest | | | | | |
| 09-25 Fri | AMRAP | MG / 3 | M ~20 | N |  | SV / SV |
| 09-26 Sat | STR | W / 3 | H | H |  | = / VS |
| 09-27 Sun | rest | | | | | |
| 09-28 Mon | INT | M / 1 | L ~36 | N | retest | V / V |
| 09-29 Tue | RFT | GW / 3 | M ~11 | L |  | SL / VSL |
| 09-30 Wed | STR | W / 2 | H | H | bench retest | = / V |
| 10-01 Thu | rest | | | | | |
| 10-02 Fri | FT | GW / 2 | S ~7 | M |  | SL / SL |
| 10-03 Sat | FT | GW / 2 | M ~12 | M |  | L / SV |
| 10-04 Sun | rest | | | | | |
| 10-05 Mon | FT | GW / 2 | S ~5 | L | girl retest | V / VSL |
| 10-06 Tue | FT | MG / 3 | L ~30 | N |  | VR / VS |
| 10-07 Wed | RFT | GW / 2 | M ~12 | M |  | L / VL |
| 10-08 Thu | rest | | | | | |
| 10-09 Fri | FT | MGW / 3 | M ~16 | M |  | VR / VSL |
| 10-10 Sat | STR | W / 1 | H | H | retest | = / = |
| 10-11 Sun | rest | | | | | |
| 10-12 Mon | INT | MW / 2 | L ~25 | H |  | = / = |
| 10-13 Tue | RFT | MG / 3 | L ~22 | N |  | V / VS |
| 10-14 Wed | FT | GW / 2 | M ~15 | H |  | VL / VSL |
| 10-15 Thu | rest | | | | | |
| 10-16 Fri | RFT | MW / 2 | M ~14 | L | girl retest | L / VL |
| 10-17 Sat | RFT | GW / 2 | M ~11 | M |  | VL / VSL |
| 10-18 Sun | rest | | | | | |
| 10-19 Mon | INT | MW / 2 | M ~20 | M |  | VL / VL |
| 10-20 Tue | RFT | G / 2 | M ~16 | N |  | VR / SV |
| 10-21 Wed | STR | W / 1 | H | H | retest | = / = |
| 10-22 Thu | rest | | | | | |
| 10-23 Fri | FT | GW / 2 | S ~7 | M | girl retest | VL / VSL |
| 10-24 Sat | FT | MW / 2 | M ~9 | M |  | VL / VL |
| 10-25 Sun | rest | | | | | |
| 10-26 Mon | INT | M / 1 | M ~18 | N | retest | = / V |
| 10-27 Tue | FT | W / 3 | L ~25 | M | girl retest | L / VL |
| 10-28 Wed | AMRAP | G / 2 | M ~9 | N |  | S / S |
| 10-29 Thu | rest | | | | | |
| 10-30 Fri | FT | W / 2 | M ~13 | M |  | L / VSL |
| 10-31 Sat | RFT | MG / 4 | L ~50 | N | hero retest | V / VSR |
| 11-01 Sun | rest | | | | | |
| 11-02 Mon | INT | M / 1 | M ~16 | N |  | = / = |
| 11-03 Tue | RFT | MG / 3 | M ~12 | N |  | VS / VS |
| 11-04 Wed | AMRAP | GW / 2 | M ~12 | H |  | VL / SL |
| 11-05 Thu | rest | | | | | |
| 11-06 Fri | INT | MGW / 5 | M ~17 | L | bench retest | = / L |
| 11-07 Sat | STR | W / 1 | H | H | retest | = / S |
| 11-08 Sun | rest | | | | | |

## 8. Sources

CrossFit (primary, read this session):
- Daily workouts, JSON for `https://www.crossfit.com/workout/2026/08/11` … `/2026/11/08` (browse: https://www.crossfit.com/workout)
- Glassman 2003, A Theoretical Template for CrossFit's Programming: https://library.crossfit.com/free/pdf/06_03_CF_Template.pdf
- CrossFit Level 1 Training Guide (2020): https://library.crossfit.com/free/pdf/CFJ_English_Level1_TrainingGuide.pdf (scaling, pp. 77-79; responsible training and rhabdomyolysis, pp. 151-153; "What Is Fitness?", pp. 30-31; "Fundamentals, Virtuosity and Mastery", pp. 158-159)
- Programming Basics, Part 1: https://www.crossfit.com/pro-coach/programming-basics-part-1 ; Part 2: https://www.crossfit.com/pro-coach/programming-basics-part-2
- Heavy Days: https://www.crossfit.com/essentials/heavy-days
- Professional Training: Scaling, Part 2: https://www.crossfit.com/essentials/professional-training-scaling-part-2
- Scaling for intermediate athletes: https://www.crossfit.com/pro-coach/crossfit-scaling-intermediate-athletes
- Ask a Coach, test/retest workouts: https://www.crossfit.com/pro-coach/ask-a-coach-test-retest-workouts
- What Is a CrossFit Workout?: https://www.crossfit.com/essentials/what-is-a-crossfit-workout
- Variance Is Good: https://www.crossfit.com/essentials/variance-crossfit-good ; Constantly Varied Programming: https://www.crossfit.com/essentials/constantly-varied-programming

Peer-reviewed:
- Physical demands and physiological responses to CrossFit, scoping review, BMC Sports Sci Med Rehabil 2024;16:196 [R]: https://pmc.ncbi.nlm.nih.gov/articles/PMC11414238/
- Time-course of recovery after a strength-power CrossFit microcycle, Sports 2026;14(7):300 [R]: https://pmc.ncbi.nlm.nih.gov/articles/PMC13419358/
- HIIT protocol structures and time ≥90% VO2max, network meta-analysis, BMC Sports Sci Med Rehabil 2026;18:336 [R]: https://pmc.ncbi.nlm.nih.gov/articles/PMC13390209/
- CrossFit training strategies from the perspective of concurrent training, systematic review, J Sports Sci Med 2020 [R]: https://pmc.ncbi.nlm.nih.gov/articles/PMC7675627/
- Timón et al. 2019, 48-hour recovery after two CrossFit workouts, Biol Sport 36:283-289 [R-s]: https://pubmed.ncbi.nlm.nih.gov/31624423/
- Hopkins et al. 2019, CrossFit and rhabdomyolysis, 11-patient case series [R-s]: https://pubmed.ncbi.nlm.nih.gov/30846355/
- Larsen et al. 2020, injuries in novices in an 8-week CrossFit start-up, Sports 8(2):21 [R-s]: https://pmc.ncbi.nlm.nih.gov/articles/PMC7077206/
- Schumann et al. 2022, compatibility of concurrent aerobic and strength training, Sports Med 52:601-612 [R-s]: https://link.springer.com/article/10.1007/s40279-021-01587-7
- HIIT frequency, athletes, network meta-analysis [R-s]: https://pmc.ncbi.nlm.nih.gov/articles/PMC12218014/ ; sprint-interval repetitions meta-analysis [R-s]: https://pmc.ncbi.nlm.nih.gov/articles/PMC13385658/
- Exertional rhabdomyolysis, population-based study (HIIT 9.6% of cases) [R-s]: https://pmc.ncbi.nlm.nih.gov/articles/PMC8011646/
- Carried over from `07-conditioning.md`: Tabata 1996; Buchheit & Laursen 2013; 2021 CrossFit injury meta-analysis; Apunts 2024 HIFT rhabdomyolysis review; CHAMP 2025 guideline.

Access notes: pubmed.ncbi.nlm.nih.gov search returned a CAPTCHA after the first query, and PMC7077206 did too; link.springer.com was refused by the proxy. Those items rely on search-result summaries ([R-s]).
