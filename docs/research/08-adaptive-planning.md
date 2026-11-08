# 08: Adaptive weekly planning (next week from last week's logged progress)

Research date: 2026-11-08. Purpose: decision rules for `app/src/progress.js` (`progressionDigest`) and the "Adapting from last week" part of `app/src/knowledge/plan.js` (PLAN_RULES §0).

The owner asked: "when the agent plans a week, base it on last week's progress, and don't keep going back to the profile from onboarding."

**Method and network note.** WebSearch only. No pages were fetched: hosts in this environment are unreliable, so claims rest on search-result abstracts and summaries, plus standard texts I know but did not re-read here. Confidence tags (same as 07):
- **[V]**: confirmed this session from an abstract, a journal record or several consistent summaries.
- **[K]**: well-established content from a primary or standard source, not re-read here.
- **[P]**: practitioner convention or heuristic.
- **[!]**: weak, conflicting or commercially interested evidence.

---

## 1. Why logged data overrides onboarding baselines

- Onboarding numbers are a single self-report, often weeks old ("squat about 80×5", "about 30 km/week"). Logged sets carry load, reps and RIR from the actual week. Every evidence-based progression model, including double progression, linear progression, RIR/RPE autoregulation and VDOT-based paces, progresses from the **most recent performance**, not from an intake estimate [K].
- **Current fitness sets the paces.** Daniels' system sets training paces from present ability, meaning a recent race or time trial, and re-derives them as fitness changes. It doesn't use goal paces [V, secondary summaries; several low-quality copies].
- **Individualising load progression from performance is practical and reliable.** So is adjusting intensity and volume from RIR-based RPE. A 2020 review (Helms et al., J Hum Kinet) found preliminary evidence that both improve performance [V].
- **The profile still binds** for things logs can't change: equipment, schedule (days and minutes), injuries and screening outcome, goals, modalities, event date, and dislikes [K, CONTRACT]. The profile is also the fallback for any exercise or modality with no history. A first plan, a new exercise or a first run all mean calibration from the profile [P].

Rule: once an exercise or modality has logged history, the digest and the logs win. The profile baseline for it is removed from the plan prompt (`profileForPlan`).

## 2. Strength: autoregulation and double progression

- **Zourdos et al. 2016 (JSCR):** the RIR-based RPE scale tracks velocity strongly (r ≈ -0.88 in experienced squatters). It's a practical way to regulate daily load. Novices were less accurate near 1RM [V]. RIR estimates are accurate to about 1 rep within 0-3 RIR, and more accurate on sets of 12 reps or fewer and late in the set [V, SBS review].
- **Helms et al. 2018 (JSCR):** "RPE stops", meaning back-off sets until the target RPE, autoregulated volume effectively [V]. The app uses the simpler hold/progress logic; it doesn't add sets automatically.
- **Load change per RIR point.** No primary source was found for an exact percentage per RIR point. `core.nextTarget` (rpe mode) uses about 2.5% per point, capped at 10%. That's a practitioner convention [P/!].
- **Double progression** [K]: hold the load until every set reaches the top of the rep range at the target RIR, then add the smallest increment and go back to the bottom of the range. Below the bottom of the range twice at the same load means reduce 5-10% [K, trainer.py port].
- **Linear progression** [K]: add load each exposure when the reps are hit. Two misses at the same load means reset about 10%.
- **Subjective "this felt hard" feedback.** Self-reported measures (fatigue, soreness, sleep) respond to training load more sensitively than common objective markers (Saw et al. 2016, BJSM) [V title/abstract via citations; full text not read]. Composite readiness scores predict less well than individual items [V, Gaelic football study].
  - App rule: one "hard" means hold the load.
  - Two "hard" in a row means −5-10%.
  - "Hard" plus pain ≥4/10 means a pain-free variant or range (the pain protocol).
  - "Easy" means progress as normal [P; matches CONTRACT-v2 for core.nextTarget].
- **Stall flag** (no e1RM gain over 3-4 exposures) [K]:
  - First check recovery.
  - If fresh: +1-2 sets or a new rep scheme.
  - After about 8 or more exposures without progress: a close variant (swap).
- **Fatigue flag** (e1RM down ≥5% at the same effort) means deload [K].

## 3. Volume landmarks and when to add or cut sets (RP-style)

- **Volume landmarks** (Israetel / Renaissance Periodization) [V, RP article + secondary summaries; framework not independently validated, so treat as P]:
  - MEV is the start of a mesocycle.
  - Add about 1 set per muscle per week through MAV.
  - Deload at MRV.
- **Signals.** RP scores pump, workload and soreness after each session and uses them to decide the next week. Strong signals mean +2-3 sets; poor performance means a recovery session or deload. When 2 or more signals degrade together (missed reps, lingering soreness, poor pumps, rising RPE with flat performance), the trainee is likely at or past MRV [V secondary, P].
- **App translation** [P]:
  - The app doesn't auto-add sets.
  - It holds volume when one recovery signal is present.
  - It deloads when 2 or more independent signals coincide.
  - Adding a set stays a model choice ("change 1-2 things"), and only on progress weeks.

## 4. Missed sessions and partial weeks

- There's no consensus rule. Coaching sources broadly agree [V, secondary/coaching sources]:
  - **One missed session:** skip it and continue, don't cram it in.
  - **A missed or mostly missed week:** repeat it, or ease back in.
  - **2-4 weeks off:** a ramp-up week.
  - **More than a month:** a conservative restart.
  - Strength lifters often repeat the week after missing several sessions (5/3/1 practice) [P].
- **Rotation model** (CONTRACT): a missed day shifts nothing, and progress is per exposure. A lift that was trained can still progress even if other sessions were missed. A lift that wasn't trained repeats its target [P].
- **Layoff discounts already in core** [K, trainer.py]: ≥21 days means about 85% load, ≥42 days about 75%. Rhabdomyolysis risk is highest in the first high-volume sessions back [K].
- **Sick weeks:** return with reduced volume [K, ACSM return-to-training convention].

## 5. Readiness, HRV and device scores

- **Kiviniemi et al. 2007 (EJAP):** high-intensity sessions only on days when RMSSD was not below baseline. This produced equal or better VO2max gains than a fixed plan in 26 subjects [V secondary].
- **Vesterinen et al. 2016 (MSSE):** 40 recreational runners. HRV-guided runners did fewer moderate/high-intensity sessions (13.2 vs 17.7) and improved 3000 m time (+2.1%, p=0.004). The fixed-plan group didn't improve significantly (+1.1%). The between-group effect was small (ES 0.42) [V].
- **Meta-analysis (Granero-Gallegos et al. 2020):** HRV-guided training gave a larger VO2max effect than predefined training. The reported effect sizes are inconsistent within the paper [V/!].
- **Plews et al. (elite triathletes):** use a **7-day rolling mean of ln RMSSD** with a smallest worthwhile change, not single days. The 7-day mean fell before non-functional overreaching. At least 3 valid readings a week are needed [V].
- **Strength:** an RCT in older women (de Oliveira et al. 2024, Front Physiol) found no advantage of HRV-guided resistance training over a fixed plan [V]. Flexible "choose the session by readiness" periodization improved leg-press gains in beginners (McNamara & Stearne 2010) [V; units conflict across summaries].
- **Garmin Training Readiness** (official manual) [V]:
  - Inputs: sleep score (last night), recovery time, HRV status, acute load, sleep history (3 nights) and stress history (3 days).
  - Bands: Prime 95-100, High 75-94, Moderate 50-74, Low 25-49, Poor 1-24.
  - The weighting isn't published [!].
- **Session RPE** (Foster 1998, MSSE) [V]: session RPE × minutes is the internal load. Strain (load × monotony) above individual thresholds is linked to illness. The often-quoted monotony cutoff of 2.0 is secondary [!].
- **App rules** [P, built on the above]:
  - Readiness is a **trend** input: the 7-day mean, never a single day.
  - A mean below 50 (Garmin "Low") counts as one fatigue signal.
  - Low/poor HRV status on 3 or more of 7 days counts as one signal.
  - A mean session readiness of 2/5 or less counts as one signal.
  - A mean session RPE of 8.5 or more counts as one signal.
  - Two or more lifts that felt hard or show the fatigue flag count as one signal.
  - Pain of 4/10 or more counts as one signal.
  - **One signal means hold.** Volume stays the same, and lifts marked "progress" are capped to "hold" when the signal is readiness, HRV or RPE.
  - **Two or more signals, or a "Poor" mean below 25, mean deload.**
  - On its own, device readiness never overrides good logged performance unless it's "Poor". This reflects the small and mixed evidence for strength.

## 6. Running and conditioning progression

- **Build from completed volume** [K/P]. The base for next week is the larger of last week's **completed** km and the 4-week average, never last week's planned km. That keeps a missed long run from being "banked".
- **Frandsen et al. 2025 (BJSM; 5,205 runners, Garmin data)** [V]:
  - Injury rate rose when a single run exceeded the longest run of the last 30 days by more than 10%. Hazard ratios: 1.64 for spikes of 10-30%, 1.52 for 30-100%, 2.28 for over 100%.
  - The week-to-week ratio showed no relationship, and the ACWR showed a negative one.
  - App rule: long run ≤ 30-day longest × 1.1 (+1 km allowed under 8 km).
  - Weekly km stays capped as in `validatePlan` and aims for ≤ +10% [K convention].
- **Paces** [K Daniels, P]:
  - Quality runs that came in more than 2% slower than the slow end of their target, or at RPE 9 or more, mean hold paces and volume. Don't speed up.
  - Quality runs that came in faster than target mean keep the paces until a new race or time trial re-derives them.
  - Easy runs slower than planned are fine, and the logged easy pace replaces the profile's.
  - Completion under 75% of planned km means repeat at completed km.
  - Pain of 4/10 or more on a run means −30% km, easy runs only.
- **Conditioning** [P, from 07-conditioning]:
  - An unfinished metcon, or one at RPE 2 or more points above target, means the same dose next week.
  - Completed at target effort means progress: +1 round or +2-3 min (≤ +20% time domain), or one step less scaling.
  - Missed metcons mean repeat.
  - No history means the newcomer ramp.

## 7. Encoded decision rules (`DIGEST_RULES` in progress.js)

| Scope | Condition | Action |
|---|---|---|
| week | no logged sessions | `calibrate` (profile baselines) |
| week | ≥2 fatigue signals, or readiness mean < 25, or deload due (≥6 build plans) + ≥1 signal | `deload` (~50% sets, RIR 3-4, −10-20%) |
| week | ≥10 days since last session | `return` (−30% volume) |
| week | < 50% of planned workouts done | `repeat`, or `reduce_volume` if missed for sick/pain |
| week | 50-84% done | `repeat`: missed key lifts first, no added volume; condense if "time" |
| week | 1 fatigue signal | `hold` |
| week | ≥85% done, no signals | `progress` |
| strength | no exposures | `calibrate` (profile knownLift as a start if present) |
| strength | hard + pain ≥4, or pain ≥4 last time | `swap` (pain-free variant) |
| strength | fatigue flag, or hard twice | `deload` (−5-10%) |
| strength | core reason reduce/reset/rpe_reduce | `deload` (use the reduced load) |
| strength | layoff | `return` |
| strength | hard once | `hold` (same load) |
| strength | stall (<8 exposures / ≥8) | `hold` (+sets or new scheme) / `swap` |
| strength | in plan but not trained last week | `repeat` |
| strength | effort overshoot | `hold` |
| strength | add_load / add_reps / rpe_increase, or repeat + "easy" | `progress` |
| run | no runs logged | `calibrate` |
| run | pain ≥4 | `reduce_volume` (km × 0.7) |
| run | week deload | `deload` (km × 0.7, long × 0.8) |
| run | < 75% of planned km | `repeat` at completed km |
| run | week hold/repeat/return/reduce, or slow quality | `hold` (or `reduce_volume`) + `pace: hold` |
| run | ≥ 90% of planned km | `progress`: kmMax = base × 1.1, longMax = longest30 × 1.1 |
| conditioning | none logged / unfinished or RPE ≥ target+2 / missed / scaled / on target | `calibrate` / `hold` / `repeat` / `progress` (less scaling) / `progress` (+1 round) |

The week decision caps the per-exercise one. On a deload week every lift deloads. On return or reduce weeks, "progress" becomes "hold". The model receives these as `adjustments` and is told to follow them and say in the rationale what changed versus last week.

## 8. Sources

- Helms ER et al. 2020. Methods for regulating and monitoring resistance training. J Hum Kinet. https://openrepository.aut.ac.nz/items/b67c0527-5e33-45d9-886c-746d3a659ea0
- Helms ER et al. 2018. RPE as a method of volume autoregulation within a periodized program. JSCR. https://ro.ecu.edu.au/ecuworkspost2013/4719
- Zourdos MC et al. 2016. Novel resistance training-specific RPE scale measuring repetitions in reserve. JSCR. https://openrepository.aut.ac.nz/items/efef3b25-6701-4fb5-bb82-55fcd2a26027/full
- Stronger by Science, Reps in reserve review. https://www.strongerbyscience.com/reps-in-reserve
- Renaissance Periodization, Training volume landmarks for muscle growth. https://rpstrength.com/training-volume-landmarks-muscle-growth/
- Vesterinen V et al. 2016. Individual endurance training prescription with HRV. MSSE. https://jyx.jyu.fi/jyx/Record/jyx_123456789_50625
- Granero-Gallegos A et al. 2020. HRV-guided training meta-analysis. IJERPH 17:7999. https://pmc.ncbi.nlm.nih.gov/articles/PMC7663087
- Plews DJ et al., HRV monitoring of training adaptation (7-day rolling ln RMSSD; compliance). https://openrepository.aut.ac.nz/items/d7b41d29-e92e-4acf-90ea-ed68d84d6c73 ; https://www.pubmed.gov/24334285/
- de Oliveira et al. 2024. HRV-individualised resistance training in older women. Front Physiol. https://www.frontiersin.org/journals/physiology/articles/10.3389/fphys.2024.1472702/text
- McNamara JM, Stearne DJ 2010. Flexible nonlinear periodization in a beginner college weight training class. JSCR. https://lida.sport-iat.de/ta/Record/4019534?lng=en
- Garmin, Training Readiness (owner's manual). https://www8.garmin.com/manuals/webhelp/GUID-31D23DBB-57C2-4DF7-A0C9-8D1A00AB4BE7/EN-US/GUID-C21BE0C8-A08E-4DA1-B6C6-2E0E2DDDB372.html
- Foster C 1998. Monitoring training in athletes with reference to overtraining syndrome. MSSE (sRPE, monotony, strain). Mini-review: https://frontiersin.org/articles/10.3389/fnins.2017.00612/full
- Saw AE et al. 2016. Monitoring the athlete training response: subjective self-reported measures trump commonly used objective measures. BJSM (cited via https://core.ac.uk/download/430162031.pdf).
- Frandsen JSB et al. 2025. How much running is too much? Identifying high-risk running sessions in a 5200-person cohort. BJSM 59:1203-1210. https://pure.au.dk/portal/en/publications/how-much-running-is-too-much-identifying-high-risk-running-sessio/ ; https://blogs.bmj.com/bjsm/?p=11751
- Daniels' Running Formula (VDOT paces from current fitness) [K]; calculator summary: https://rundida.com/tools/training-pace/
- Missed-workout coaching guidance: https://trainright.com/missed-workouts-guide-to-adjusting-training/ ; https://barbell-logic.com/missed-workouts-strength-training/ ; https://forum.barbellmedicine.com/t/might-miss-1-2-sessions-out-of-3-this-week-move-on-or-repeat-the-week/10608
