# 06: Running programming for recreational and hybrid athletes

Research date: 2026-11-07. Purpose: source material for `references/running.md` and the app's `knowledge/plan.js` / `chat.js`.

> **Update 2026-11-08:** many claims below were re-checked against primary papers in `13-running-sources.md`, which takes precedence. Corrections are marked inline with **[corrected]**.

**Method and network note.** WebSearch worked. WebFetch was blocked for www.nhs.uk (DNS refused by the session's network policy), so no further direct fetches were attempted. The claims below come from search-result abstracts and summaries of primary sources, plus well-established coaching texts (Daniels' Running Formula, NHS Couch to 5K) that I know but could not re-read here.

Confidence tags:
- **[V]**: confirmed this session from an abstract, a journal record or several consistent summaries.
- **[K]**: well-established content from a primary source or a standard text that I could not re-read here. Low risk, but check the wording before quoting it verbatim.
- **[P]**: practitioner convention or expert heuristic (e.g. Daniels' per-session caps). Useful defaults, not tested thresholds.
- **[C]**: computed this session (see §3).

---

## 1. Intensity distribution

- **Seiler's three-zone model** [K/V]: zone 1 is below the first lactate or ventilatory threshold (LT1/VT1); zone 2 is between the thresholds; zone 3 is above LT2/VT2. Endurance athletes accumulate about 75-80% of sessions or time in zone 1. Secondary summaries of Seiler put LT1 around 70-75% HRmax and LT2 around 85-87% HRmax [V, forum and podcast summaries; individual variation is large].
- **Polarized vs pyramidal:**
  - The 2024 Sports Medicine meta-analysis (Silva Oliveira 2024; 17 studies, n=437) found polarized training gave slightly larger VO2peak gains (SMD 0.24), only in <12-week studies and highly trained athletes, with similar TT, TTE and threshold speed [V, PMC11329428]. **[corrected]** The "81/3/15 best distribution" figure came from a secondary summary and was not found in the paper; it has been dropped.
  - In recreational runners (Muñoz et al. 2014, n=30, 10 weeks), polarized vs between-thresholds training both improved 10K time, with no significant difference between groups. In the subgroup that adhered most closely to the distribution, polarized came out ahead [V].
  - Registered trial NCT07565168 (polarized vs threshold vs pyramidal in recreational runners) has no results yet [V].
- **Interpretation:** evidence that polarized beats pyramidal for recreational runners is thin. Both share the dominant feature: **~75-80%+ easy**. Pyramidal (some threshold work) is more practical for hybrid athletes, because threshold sessions are less fatiguing than VO2max sessions.

**Skill rules:** keep ≥75-80% of weekly running time easy, counting warm-ups, cool-downs and recovery jogs. Hard running is ≤20-25%. Default to a pyramidal mix: threshold first, VO2max work in race-specific phases. The app's validator warns below 70% easy (NO_REST_RUN_EASY).

## 2. Zones: pace, heart rate, RPE

- **Daniels intensities** [K]:
  - E (easy) ≈ 59-74% VO2max, about 65-79% HRmax
  - M (marathon) ≈ 75-84% VO2max, about 80-90% HRmax
  - T (threshold) ≈ 83-88% VO2max, about 88-92% HRmax ("comfortably hard", roughly the pace one could race for ~60 min)
  - I (interval) ≈ 95-100% VO2max, 98-100% HRmax by the end of 3-5 min reps
  - R (repetition) ≈ mile race pace, faster than VO2max pace, with reps ≤2 min
- **Five-zone HR model** (Norwegian/Olympiatoppen style, as widely cited) [K, the exact band edges were not verified this session]: Z1 55-72%, Z2 72-82%, Z3 82-87%, Z4 87-92%, Z5 92-97+% HRmax. The skill uses a simplified mapping that aligns Z2 with Daniels E.
- **HRmax estimate:** Tanaka 2001, 208 − 0.7 × age [K]; Karvonen target = HRrest + % × HRR [K]. Both are already in `references/programming.md` §8.
- **Threshold-based HR (Friel)** [V, secondary]:
  - LTHR ≈ average HR over the last 20 min of a solo 30-min all-out run.
  - Running zones: Z1 <85% LTHR, Z2 85-89%, Z3 90-94%, Z4 95-99%, Z5a 100-102%, Z5b 103-106%, Z5c >106%.
  - One study (per a secondary source) found the 30-min TT was the only field test whose HR did not differ significantly from the lab value.
- **Caveats** [K]: HR lags effort by 1-2 min, drifts up in heat and over long durations, and is blunted by beta-blockers (use RPE and the talk test instead). Wrist optical HR is noisy at high intensities.

**Skill rules:** prescribe by pace + RPE + talk test. Use HR as an easy-day ceiling and for zone labels, not as the main target in intervals. Without a measured HRmax or LTHR, don't give bpm targets unless asked.

## 3. Paces from a race: VDOT table and Riegel

- **Daniels-Gilbert equations** [K formulas; C table]:
  - VO2 cost of running at v m/min = −4.60 + 0.182258 v + 0.000104 v².
  - Fraction of VO2max sustainable for t minutes = 0.8 + 0.1894393 e^(−0.012778 t) + 0.2989558 e^(−0.1932605 t).
  - VDOT = cost / fraction.
- I implemented these in Node this session.
  - The output for VDOT 50 was 19:56 / 41:20 / 1:31:31 / 3:10:40 (5K/10K/HM/M). Daniels' published table gives 19:57 / 41:21 / 1:31:35 / 3:10:49 [C, matches within seconds].
  - Training paces used: E = 62-70% VDOT (5:08-5:39/km at VDOT 50; Daniels lists about 5:07 for E), T = 88% (4:16/km), I = 97.5% (3:56/km), R = 105% (3:42/km). These match commonly published VDOT 50 values (T 4:15, I 3:55, R 89 s per 400 m) within 1-2 s [C/K].
  - The full table (5K 16:00-40:00) is in `references/running.md` §3 and in `app/src/knowledge/plan.js`.
- **Rules of thumb from the table:**
  - T ≈ 5K pace + 15-25 s/km.
  - I ≈ 5K pace − 3-8 s/km.
  - Easy ≈ 5K pace × 1.27-1.41.
  - M ≈ 5K pace × 1.13-1.16.
- **Riegel 1981** [K]: T2 = T1 × (D2/D1)^1.06, fitted on world-record performances.
- **Accuracy in recreational runners:**
  - Vickers & Vertosick 2016 (BMC Sports Sci Med Rehabil, n=2,303 survey) [V]: Riegel was well-calibrated up to the half marathon, but "dramatically underestimated" marathon time, with predictions ≥10 min too fast for half of runners. Mean squared error was 381 for Riegel vs 228 for a model using one prior race plus training volume.
  - **[corrected]** Vickers used k = 1.07 (Riegel cited 1.05-1.06 for recreational men aged 40-70 and 1.08 for elites). The "~1.16 exponent" is from a blog (Downey), not a peer-reviewed source; don't cite it.
  - Predictions improve with higher weekly mileage, and when the distances are close [V/K].
- **VDOT for a 20:00 5K:** sources disagree (≈47 vs 49.8) [V]. The equations give 49.8 [C].

**Skill rules:**
- Look paces up in the table; don't calculate.
- Use a race ≤8-12 weeks old, run all-out on a flat course.
- Between rows, use the slower row.
- For a marathon goal, add about 5% to the table time unless the runner averages ≥60 km/week and has done ≥30 km long runs.
- Slower than a ~35-min 5K: prescribe by effort.
- No race: RPE for 2-4 weeks, then a time trial.

## 4. Weekly volume, ramp rate and single-run spikes

- **Buist et al. 2008 (AJSM), GRONORUN RCT** [V]:
  - n=532 novices preparing for a 6.7 km event.
  - A graded 13-week plan (about 10%/week) vs a standard 8-week plan: injury incidence 20.8% vs 20.3%. No effect.
  - Limits: short distances; low injury rates in both arms.
- **Nielsen et al. 2014 (JOSPT)** [V]:
  - n=874 novices with GPS watches, 1-year cohort, 202 injuries.
  - Progression groups over 2 weeks: <10%, 10-30%, >30%. Overall injury rates didn't differ.
  - For "distance-related" injuries (patellofemoral pain, MTSS, etc.), >30% vs <10% gave HR 1.59 (95% CI 0.96-2.66, p=0.07).
  - Authors: novices "may be well advised" to progress <30% over 2 weeks.
- **Frandsen et al. 2025 (BJSM 59(17):1203-1210)** [V]:
  - 5,205 runners (mean age 45.8, 22% female); 588,071 Garmin-recorded sessions; 1,820 (35%) with self-reported overuse injuries.
  - Exposure: each run's distance vs the longest run in the previous 30 days.
  - Compared with no increase or ≤10%: >10-30% "small spike" HRR 1.64 (1.31-2.05); >30-100% HRR 1.52; >100% HRR 2.28 (1.50-3.48).
  - Week-to-week ratio: no relationship. ACWR: a *negative* dose-response.
  - Caveats: observational, self-reported injuries, distance only.
- **Daniels' practitioner caps** [P, via secondary study notes]:
  - Long run ≤30% of weekly mileage below 40 mi (64 km) per week; ≤25% or ≤150 min at ≥40 mi.
  - Per session: T ≤10% of weekly mileage (30 min split into bouts is fine); I ≤ the lesser of 10 km or 8%; R ≤ the lesser of 8 km or 5%, with bouts ≤2 min.
  - (One forum commenter notes the 25%/150-min figure applies to the long run, not to total easy mileage [V].)
- **Injury epidemiology:**
  - Incidence 7.7-17.8 injuries per 1,000 h of running (van Poppel 2021 review) [V].
  - **Previous injury in the last 12 months is the most consistent risk factor** (van der Worp 2015; Hulme 2017; van Poppel 2021) [V].
  - Biomechanical and musculoskeletal measures are inconsistent predictors [V].

**Skill rules:**
- Build weekly km ≤10% over the recent 3-4-week average (≤ +3-5 km at low volume). This is a sensible ceiling, not a magic number.
- **The hardest rule:** no single run >10% longer than the longest run of the past 30 days. ~~Allow a +1 km step below 8 km [P].~~ **[corrected]** Dropped: at 5 km, +1 km is a 20% spike (Frandsen's HRR 1.64 band). Round down instead.
- Cutback −20-30% every 3rd-4th week [P].
- Long run ≤30% of weekly km (≤40% at <20 km/week), ≤150 min outside marathon builds.
- The app's validator errors are looser on purpose: RUN_RAMP > max(avg × 1.15, avg + 5 km); LONG_RUN_SPIKE > longest × 1.3 and > +3 km.
- Runners with a previous injury progress at the lower end.

## 5. Quality sessions and session library

- **Strides** [V coaching sources; K]: 4-8 × 15-30 s (about 80-100 m) at roughly mile pace or 85-95% effort, smooth, with 60-90 s walk or jog recovery, 1-3×/week after easy runs. One cited study added 5-10 × 30-s strides over 40 days and found economy gains despite lower volume [V secondary; primary not identified].
- **Hill sprints** (8-12 s steep, full recovery) and **hill repeats** (30-90 s at about 5K effort, jog down) [K/P]: the low-impact power and strength-endurance staples of Lydiard- and Canova-style programs.
- **Threshold work** [K/P]: continuous tempo 15-25 min, or cruise intervals of 3-6 × 5-10 min with about 1 min jog. Daniels caps T at about 10% of weekly mileage per session.
- **VO2max intervals** [K]: 3-5 min reps at I pace, equal-time jog recovery, total ≤ the lesser of 8% of weekly km or 10 km. Beginners can start with 1-min reps.
- **Quality frequency** [K/P]: beginners get none for the first 4-8 weeks (strides after about 3-4 weeks); most recreational runners do 1/week; 2/week only with ≥4 runs and a stable base. Space them ≥48 h apart, and count the long run as hard.

## 6. Beginners: run/walk (Couch to 5K)

- **NHS Couch to 5K** [V structure; K week-by-week]:
  - 9 weeks, 3 runs/week with a rest day between, each starting with a 5-min brisk walk. It's fine to repeat a week [V].
  - Week 1 = 8 × (60 s run / 90 s walk) [V, two consistent secondary sources]. Week 9 = 30 min running [V].
  - Weeks 2-8 [K, standard C25K]: W2 6 × (90 s / 2 min); W3 2 × (90 s run, 90 s walk, 3 min run, 3 min walk); W4 3-1.5-5-2.5-3-1.5-5; W5 3 × (5/3), then 8-5-8, then 20 min; W6 5-3-8-3-5, then 10-3-10, then 25 min; W7 25 min; W8 28 min.
- **Skill rules:** use it for anyone who can't run 20-30 min continuously. Repeat the week after an RPE ≥8 session, amber pain or a missed session. Graduation = 30 min continuous at RPE ≤5, 3×/week, pain-free.

## 7. Returning runners and detraining

- Detraining [K]: VO2max falls measurably within 2-4 weeks of stopping (Mujika & Padilla 2000), but tendon and bone adaptations lag behind the aerobic recovery on return.
- Daniels-style VDOT adjustment [V via a VDOT site]: return VDOT ≈ 97.3% of the pre-break value after 2 weeks off, or 98.6% if the runner cross-trained. Longer tiers were not verified this session.
- **Skill rules** [P]: the table in `references/running.md` §7 (first week at 75-90% / 50-75% / 40-50% / 30-50% of the prior volume for breaks of 1-2 weeks / 2-4 weeks / 4-8 weeks / >8 weeks; paces 0 / 1 / 2 rows slower / re-test). After injury, require pain-free walking for 30 min and pain-free single-leg hops before running.

## 8. Taper and race-specific basics

- **Bosquet et al. 2007 (MSSE) meta-analysis**, 27 studies [V]:
  - Best taper about 2 weeks (ES 0.59), with volume exponentially reduced by 41-60% (ES 0.72).
  - Intensity and frequency maintained; reducing them had smaller or negative effects (0.33 and 0.35).
- **2023 endurance-athlete meta-analysis** (PubMed 37163550) [V]: a taper of ≤21 days, with volume progressively reduced by 41-60% and intensity and frequency unchanged.
- Race-specific peak long runs, plan lengths and weekly km [K/P]: standard coaching ranges (Daniels, Pfitzinger, Higdon), summarized in `references/running.md` §8.
- Existing skill review [V, 01-existing-skills.md §1.6]: ColinEberhardt's running coach flags marathon timelines under 8 weeks as too short, and uses 3:1 / 2:1 build-to-recovery cycles with 15-30% deloads.

## 9. Injury signs

- **Bone stress injury vs MTSS** [V]:
  - Hop test: one study gave 100% sensitivity and 45% specificity for tibial stress fracture, so it is good for ruling out, but evidence is limited.
  - In 429 infantry recruits, a positive hop test plus tibial pain and tenderness was associated with more medial tibial stress fractures; fractures occurred when the band of tenderness was ≤10 cm.
  - The belief that tenderness >5 cm suggests MTSS is common but not validated.
  - Pain progressing to rest pain suggests BSI.
  - Risk factors: sudden load jumps, prior BSI, RED-S.
  - Skill rule: focal bony tenderness, pain on hopping, rest or night pain, or worsening during runs means stop running and refer.
- **Achilles tendinopathy** [K, see `safety-and-scope.md` §4]: heavy slow resistance (Beyer 2015); pain monitoring (Silbernagel 2007). A sudden "kicked" sensation means possible rupture.
- **Patellofemoral pain** [K]: hip + knee strengthening is first-line (2016 consensus). A step-rate increase of 5-10% reduces knee loading (Heiderscheit 2011). Reduce downhill running.
- **Hip, groin and pelvic bone stress** [K]: femoral neck stress fractures are high-risk, so any deep groin pain with running or hopping is referred.

## 10. Running + strength training

- **Schumann 2022 meta-analysis (43 studies)** [V]: no meaningful interference with hypertrophy or max strength. Explosive strength is mildly attenuated, more so in same-session designs.
- **Wilson 2012** [V]: running (not cycling) interfered with hypertrophy and strength, scaling with frequency and duration. **[corrected]** The larger Schumann 2022 found no difference between running and cycling, so this claim is no longer used.
- **Eddens, van Someren & Howatson 2018 (Sports Med)**, 10 studies [V]: strength-before-endurance in the same session gave better lower-body dynamic strength (+6.91%, 95% CI 1.96-11.87). No effect on hypertrophy, static strength, VO2max or body fat. A companion 2018 J Sports Sci meta-analysis: lower-body 1RM +3.96 kg with strength first; no effect on aerobic capacity [V].
- **Blagrove, Howatson & Hayes 2018 (Sports Med) systematic review**, 24 studies [V]: running economy improved by 2-8% vs controls in 20 studies that measured it. Time-trial and sprint performance also improved, and body composition was unharmed. Recommended 2-3 strength sessions/week mixing modalities. Llanos-Lagos et al. (meta-analysis): heavy strength, plyometrics and combined methods all improve economy [V].
- **Lauersen 2014 (BJSM)**, 25 RCTs [V]: strength training RR 0.315 (0.207-0.480), i.e. injuries cut to less than 1/3 and overuse injuries almost halved. Stretching RR 0.963, no effect. The strength subgroup rests on only 4 studies, across all sports. **[corrected]** In runners specifically, Wu 2024 (9 RCTs) found no significant effect except for supervised programmes, and Toresdahl 2019 was null.
- **Scheduling** [V coaching summaries; P]: interference is greatest at 0 h separation and close to zero at about 24 h. Practical options are ≥6 h between same-day sessions, or separate days. Sources disagree on stacking heavy legs with hard runs on the same day. The skill allows it for intermediate+ (≥6 h apart) and otherwise separates them by ≥24-48 h.

**Skill rules:** the scheduling and dosing rules are in `references/running.md` §10 and `references/conditioning.md` §10.

## Sources

- Frandsen JSB et al. 2025, BJSM: https://pure.au.dk/portal/en/publications/how-much-running-is-too-much-identifying-high-risk-running-sessio/ ; BJSM blog: https://blogs.bmj.com/bjsm/?p=11751 ; summary: https://www.physiotutors.com/research/running-injury-prevention/
- Nielsen RO et al. 2014, JOSPT: https://vbn.aau.dk/da/publications/excessive-progression-in-weekly-running-distance-and-risk-of-runn (**[corrected]** PMC4842282 is the Run Clever trial protocol, not Nielsen 2014)
- Buist I et al. 2008, AJSM (GRONORUN): https://research.rug.nl/en/publications/no-effect-of-a-graded-training-program-on-the-number-of-running-r/ ; https://search.pedro.org.au/search-results/record-detail/20220
- Muñoz I et al. 2014, polarized training in recreational runners: https://abacus.universidadeuropea.com/entities/publication/e453045b-50fb-4586-89a8-a3d550db3ce1
- Polarized vs other TID meta-analysis (2024) summary: https://getfitcraft.com/science/polarized-training-research ; Stöggl & Sperlich 2015 review: https://www.frontiersin.org/journals/physiology/articles/10.3389/fphys.2015.00295/pdf ; trial registry: https://clinicaltrials.gov/study/NCT07565168
- Seiler zones (secondary): https://www.fasttalklabs.com/fast-talk/dissecting-training-zones-with-siren-seiler-and-dr-stephen-seiler/ ; https://trainerroad.com/forum/t/polarized-training-discussion-fast-talk-podcast-flo-cycling-podcast/1766/84
- Friel LTHR zones: https://www.trainingpeaks.com/learn/articles/joe-friel-s-quick-guide-to-setting-zones/
- Daniels' caps (secondary study notes): https://knowt.com/note/0d201721-f0ac-4430-b8d9-c7adc7a1000e/Daniels-Running-Formula--Comprehensive ; https://www.coachray.nz/2023/05/03/jack-daniels-running-intensity/ ; https://www.runningahead.com/forums/post/e989f57406784efdabd375505274c770
- VDOT return-from-break adjustment: https://news.vdoto2.com/?p=1285
- Vickers & Vertosick 2016, race-time prediction: https://www.ncbi.nlm.nih.gov/pmc/articles/PMC5000509/ ; Downey: https://allendowney.substack.com/p/predicting-marathon-times
- NHS Couch to 5K: https://www.nhs.uk/better-health/get-active/get-running-with-couch-to-5k/couch-to-5k-running-plan/ (blocked here; structure from https://bda.org.uk/what-is-couch-to-5k/ and https://acibademinternational.com/blog/couch-to-5k-how-the-famous-beginner-plan-works/)
- Bosquet L et al. 2007, taper meta-analysis: https://pubmed.ncbi.nlm.nih.gov/17762369/ ; 2023 endurance taper meta-analysis: https://pubmed.ncbi.nlm.nih.gov/37163550/
- Strides (coaching): https://runnersconnect.net/how-to-do-strides/
- Running injury risk factors: https://pubmed.ncbi.nlm.nih.gov/24809248/ ; https://pmc.ncbi.nlm.nih.gov/articles/PMC4338213 ; van Poppel 2021: https://core.ac.uk/download/328851521.pdf
- Bone stress / hop test: https://www.physio-network.com/blog/bone-stress-injuries/ ; https://www.physiotutors.com/wiki/hop-test/ ; https://pubmed.ncbi.nlm.nih.gov/33298373/
- Eddens 2018: https://pubmed.ncbi.nlm.nih.gov/28917030/ ; sequence meta-analysis: https://pubmed.ncbi.nlm.nih.gov/28783467/
- Blagrove 2018: https://nrl.northumbria.ac.uk/id/eprint/33742 (record); https://www.springermedicine.com/effects-of-strength-training-on-the-physiological-determinants-o/22255330
- Lauersen 2014: https://bjsm.bmj.com/content/48/11/871
- Concurrent scheduling summaries: https://marathonscience.beehiiv.com/p/43-studies-say-you-can-run-and-lift-the-same-day-here-s-how-to-sequence-it ; https://lauranorrisrunning.com/how-to-schedule-strength-training-around-running/

## Verification gaps

- The NHS C25K weeks 2-8 come from memory of the standard plan [K]. Check them against nhs.uk once that host is allowed.
- The five-zone HR band edges were not verified.
- The figures from the 2024 polarized meta-analysis come only via a secondary summary.
- Daniels' long-run and per-session caps come via study notes, not the book.
- The return-from-break tiers beyond 2 weeks are practitioner heuristics [P].
