# 11 — Strength & gym sources (verification pass, Nov 2026)

Scope: verification and gap-filling for `references/programming.md` and `references/exercise-library.md`. This builds on `03-programming-science.md`, which could only read search snippets.

Confidence tags:
- **[F]** full text read this session.
- **[A]** abstract or official summary read this session.
- **[S]** secondary only (search-engine summaries, press releases, study sites). Full text was not reachable.
- **[P]** practitioner heuristic or textbook convention.

## Access notes

- **Reachable with curl:** sportrxiv.org (full PDFs), www.frontiersin.org (full text), www.strongerbyscience.com (full articles).
- **Blocked by bot checks or Cloudflare:** pmc.ncbi.nlm.nih.gov and pubmed.ncbi.nlm.nih.gov article pages (reCAPTCHA), www.acsm.org, journals.lww.com, peerj.com, bjsm.bmj.com, www.mdpi.com, www.nsca.com (all 403). These were not retried beyond one attempt, and bot checks were not circumvented.
- **link.springer.com** returned 429 (rate limited).
- **WebFetch** could not resolve hosts in this sandbox, so curl was used.
- **Consequence:** the ACSM 2026 position stand, NSCA *Essentials* tables, Travis 2020 (taper), Coleman 2024 and Rogerson 2024 remain [A]/[S]. A later pass should try them once the hosts are reachable from a browser-like client.

## Sources actually read

| Source | What it gave | Tag |
|---|---|---|
| Pelland, Remmert, Robinson, Hinson, Zourdos. Resistance training dose-response: weekly volume & frequency meta-regressions (SportRxiv v2 2024; Sports Med 2025/26). https://sportrxiv.org/index.php/server/preprint/view/460 | 67 studies, n=2,058. Fractional counting fits best. Volume to hypertrophy has a positive slope with diminishing returns and no plateau in the data. **Hypertrophy efficiency tiers:** MED 4 sets; 5-10 sets need about 6 more sets per detectable gain; 11-18 need about 8.5; 19-29 need about 10.75; 30-42 need about 12.5. Caution above about 25 sets. **Strength:** MED 1 set; detectable increments up to about 4 fractional sets/week; beyond 5, no consistent gain over the smallest detectable effect size (SDES 3.96%). Frequency: negligible for hypertrophy, positive for strength. Trained powerlifters: 1-3 direct sets/week were not enough, 3-9 were. | [F] |
| Remmert, Pelland, Robinson, Hinson, Zourdos. Per-session volume meta-regressions (SportRxiv 2025). https://sportrxiv.org/index.php/server/preprint/view/537 | The point beyond which extra sets give no detectable gain (PUOS) is about **11 fractional sets/session** for hypertrophy and about **2 direct sets/session** for strength. Data are thin at very high per-session volumes. | [F abstract + methods] |
| Robinson et al. Proximity to failure (RIR) dose-response (SportRxiv; Sports Med 2024). https://sportrxiv.org/index.php/server/preprint/view/295 | Hypertrophy rises as sets end closer to failure. For strength the slope includes zero. The analysis is exploratory with modest model fit. | [F abstract] |
| Singer et al. 2024, "Give it a rest", Front Sports Act Living 6:1429789. https://www.frontiersin.org/journals/sports-and-active-living/articles/10.3389/fspor.2024.1429789/full | Small hypertrophy benefit for rest >60 s, and nothing appreciable beyond 90 s. Failure vs non-failure did not change this. The paper says NSCA's 30-90 s guidance "warrants reconsideration". Mostly untrained subjects, with no torso-muscle data. | [F] |
| Androulakis-Korakakis et al. 2021, Front Sports Act Living 3:713655. https://www.frontiersin.org/journals/sports-and-active-living/articles/10.3389/fspor.2021.713655/full | Minimum effective dose for powerlifters: about 3-6 sets of 1-5 reps/week per lift at >80% and RPE 7.5-9.5. Singles at RPE 9-9.5 plus 2-3 back-off sets at about 80%, with a weekly squat-bench-deadlift frequency of 2-3-1. | [F abstract] |
| Helms et al. 2018, Front Physiol 9:247. https://www.frontiersin.org/journals/physiology/articles/10.3389/fphys.2018.00247/full | RPE-based loading vs %1RM over 8 weeks of DUP in trained men: similar outcomes, with small-effect odds favouring RPE for strength. | [F abstract] |
| Nuckols, "More training, more gaining" (SBS volume review). https://www.strongerbyscience.com/volume/ | Explains the Pelland analysis. The apparent strength plateau at about 5 sets comes mostly from untrained-subject studies. Within studies of trained lifters, higher volumes (about 27 vs 19 sets) gave more strength in 7 of 9 comparisons. Confidence is high up to about 25 sets/week. | [F] |
| Pritchard & Androulakis-Korakakis, "Effective strength training for the time-poor" (SBS). https://www.strongerbyscience.com/training-for-time-poor/ | Up to 1 week off: no meaningful strength loss (Travis 2022, Pritchard 2018, Weiss 2004). Bosquet 2013 meta-analysis: trivial loss in the first 4 weeks off, larger after. Volume cut about 50% maintains strength for 8 weeks (Tavares 2017). Singles-only and MED templates. Rest 3-5 min for heavy sets, 1-2 min otherwise. | [F; primary studies via review] |
| Wolf, "Heavier warm-ups are best" (SBS 2024). https://www.strongerbyscience.com/heavier-warm-ups/ | Crossover: a warm-up of 5 reps at 80% of 10RM beat 10 reps at 60% and 15 at 40% for volume over 3 × 10RM sets. Ribeiro et al.: 8 reps at about 64% 1RM beat 32%; the combination was best. Sousa 2024: a 90% warm-up beat 45%. If short on time, do 1-2 sets and keep the heavier one. | [F; primaries via review] |
| Irizarry, "Your warm-up doesn't need to be that complicated" (SBS). https://www.strongerbyscience.com/warm-up/ | Specific warm-up beats general. Short static stretching is fine when followed by dynamic or specific work. Post-activation potentiation lasts about 5-7 min, which is impractical for most lifters. | [F, expert review] |
| Wolf & Nuckols, "Longer and stronger" ROM review (SBS/MASS). https://www.strongerbyscience.com/rom/ | For hypertrophy, use the longest safe ROM and seek long-muscle-length exercises. Lengthened partials are an optional extra. For strength, train the ROM you need, mixing in some partials. | [F] |
| Nuckols, How to Squat / Deadlift / Bench guides (SBS). https://www.strongerbyscience.com/how-to-squat/ · /how-to-deadlift/ · /how-to-bench/ | **Squat:** bar off C7; toes out 15-30° with knees over toes; belly brace; the "good-morning" fault at the sticking point (cue: traps back into the bar, don't rush); buttwink fixes are goblet squats and progressive pin depth. **Deadlift:** bar slightly in front of mid-foot; narrowest grip that clears the legs; lats on ("pull the bar into your shins"). **Bench:** touch between the nipple and the bottom of the sternum; elbows somewhat tucked low, flaring through the mid-range; the high-touch-with-flared-elbows fault; bar diagonal across the palm for elbow comfort. | [F] |

## Abstract- or secondary-level sources (not full text)

| Source | Used for | Tag |
|---|---|---|
| ACSM 2026 Position Stand, Currier et al., MSSE 58(4):851-872, doi 10.1249/mss.0000000000003897 (137 reviews, >30,000 participants). Read via McMaster/ACSM press and infographic summaries in search results. | ≥2 days/week for all major muscles. Strength: about 80% 1RM × 2-3 sets/exercise. Hypertrophy: about 10 sets/muscle/week. Power: 30-70% 1RM moved fast. Failure, periodization, equipment, set structure and time under tension did not consistently impact outcomes. Bands, bodyweight and home training are effective. Adherence matters most. | [S] (full text 403) |
| Nunes et al. 2021, Eur J Sport Sci 21(2):149-157 (exercise order meta-analysis, 11 studies) | Strength gains are largest in exercises done first. Hypertrophy is unaffected by order (ES 0.03). | [A via search] |
| Ramos-Campo et al. 2024, JSCR (PMID 38595233; 14 studies, n=392) | Split and full body are equal for strength and hypertrophy when volume is equated. | [A via search] |
| Zhang, Weakley et al. 2025, Sports Med, doi 10.1007/s40279-025-02176-8 (supersets, 19 studies) | Large time-efficiency gain (secondary: about 37% shorter sessions). Chronic strength and hypertrophy are similar. Agonist-antagonist pairings keep volume; same-muscle pairings reduce it. Supersets bring more perceived exertion and muscle damage. | [S] |
| Haugen et al. 2023, BMC Sports Sci Med Rehabil (13 studies) | Free-weight vs machine: strength gains are specific to the modality; no hypertrophy difference. | [A via search] |
| Plotkin et al. 2022, PeerJ 10:e14142 | Rep progression and load progression were similar for hypertrophy, with a trivial strength edge for load progression. Trained lower body, 8 weeks. | [A via search] |
| Halperin et al. 2022, Sports Med 52:377-390 (RIR accuracy) | Lifters underpredict reps to failure by 0.95 (95% CI 0.17-1.73). Predictions are better close to failure and in shorter sets. No effect of training status. | [A via search] |
| Coleman et al. 2024, PeerJ 12:e16777 | A 1-week cessation at the midpoint of a 9-week program: no difference in hypertrophy, power or endurance; slightly worse lower-body strength; continuous training was slightly better for readiness. | [A via search] |
| Bell et al. 2023 (Delphi, Sports Med Open); Rogerson et al. 2024 (survey, n=246) | Deload definition. Deloads last 6.4 ± 1.7 days, taken every 5.6 ± 2.3 weeks. Volume falls; frequency stays unchanged. | [A via search] |
| Kubo et al. 2019, Eur J Appl Physiol 119:1933-1942 | Full squat (about 140°) vs half squat (about 90°): gluteus maximus +6.7% vs +2.2%, adductors +6.2% vs +2.7%, quadriceps similar, hamstrings unchanged in both. | [A via search] |
| Lopes et al. 2019, SAGE Open Med (elastic vs conventional; corrigendum 2020) | Similar strength gains. | [A via search] |
| NSCA "2-for-2" rule (Essentials of S&C) | Secondary study sites disagree on the lower-body increments (5-10 lb vs 10-15 lb for less-trained lifters). The file now gives the range and flags the disagreement. | [S] |
| Retained from 03 (not re-read): Schoenfeld 2017/2019, Baz-Valle 2022, Lopez 2021, Currier 2023, Refalo 2023/2024, Wolf 2023, Maeo 2021/2022, Pedrosa 2022, Kassiano 2022/2023, Moesgaard 2022, Iversen 2021, Androulakis-Korakakis 2020, Grandou 2020, Zourdos 2016, Morton 2018, Schumann 2022, Warneke 2024 | As before. | as in 03 |

## What changed vs the previous version, and why

### programming.md (21.1 KB → 24.0 KB, restructured, section numbers 1-11 kept)

**Corrected or sharpened:**
- **Weekly volume.** The vague "diminishing returns, no ceiling" now uses the actual Pelland efficiency tiers (4 sets = MED; extra sets needed per detectable gain: about 6, then 8.5, then 11). Added a caution that data above about 25 sets are thin.
- **Per-session cap.** It used to be "about 6-10 hard sets/muscle". It is now about 11 fractional sets (Remmert 2025) and a practical cap of 8-10. This matches SKILL.md's "≤8-10".
- **Strength volume.** Replaced "minimum about 3-6 heavy sets" with the Pelland/Remmert numbers (about 4-5 sets/week, about 2 direct sets/session before extra gains are undetectable). Added the caveat that this comes mostly from untrained-subject studies (Nuckols review), and kept 3-6 sets for trained powerlifters (Androulakis-Korakakis 2021).
- **Minimum-dose population.** Androulakis-Korakakis 2020 was in *trained men*. It is now labelled correctly.
- **NSCA 2-for-2 lower-body increments.** These were stated with false precision. They are now a range, with the source disagreement flagged.
- **RPE accuracy.** The text now gives Halperin 2022's actual figure (underprediction of 0.95 reps, independent of training status). The old text said accuracy improves with experience.
- **ACSM 2026.** The old file only mentioned that "adherence matters more than which model". It now has a headline box with the stand's numbers [S].
- **Layoff.** Added "≤1 week = no change" (several RCTs, via the SBS review) and the Bosquet 2013 rationale. The steps are still marked [P], and the `trainer.py` thresholds (21 d / 42 d) are unchanged.

**Added:**
- **Session design (§9):** exercise order with the Nunes 2021 rationale, a warm-up ramp table by working load (from the heavier-warm-up evidence), and per-session limits.
- **Busy lifter (§3):** a time-saver ladder with the superset meta-analysis, maintenance doses, 2- and 3-day short templates, and a minimum session.
- **Mesocycle progression (§4):** a 5-week hypertrophy and strength block example [P], a DUP option, and rep-vs-load progression (Plotkin 2022).
- **Splits (§6):** a template for each of 2-6 days, a 48 h same-muscle guide, and **home/dumbbell-only programming** with a ladder for when dumbbells are too light. ACSM 2026 and Lopes 2019 support home and band training.
- **Deloads:** the Bell definition, and a minimal deload option for busy weeks.

**Cut or compressed:**
- ACE IFT paragraph (not decision-relevant).
- NASM corrective sequence (already in `exercise-library.md` §6).
- Verbose cardio guidance (detail lives in running.md and conditioning.md).
- Duplicate myth on cardio (§8 covers it).
- Long split table.

### exercise-library.md (10.1 KB → 12.0 KB)

- **Added §2 "Picking exercises for a plan":** main vs secondary picks, stretched-position picks, stable options for near-failure work, coverage ratios, how long to keep main lifts, and free weights vs machines.
- **Added §5 technique table:** setup cues plus common faults and fixes for squat, deadlift, RDL, bench, OHP, row, pull-up, hip thrust and split squat. Based on the SBS guides and NSCA conventions, with video angles and an escalation rule.
- **Added rows and notes:** a knee-flexion row in the equipment table (a common gap in home gyms) and home-gym buying priorities.
- **Compressed §6 movement screen:** merged the tight and under-active columns. The content is the same, minus the long muscle lists.

## Open items for a later pass

- Read the ACSM 2026 full text, especially for rest intervals, rep ranges and the older-adult sections. If it gives numbers different from the press summaries, update the headline box.
- Verify the NSCA *Essentials* (4th ed.) load-increment table and the %1RM chart against the book.
- Read Travis 2020 (taper review) to firm up the peaking numbers, which are still [P].
- Check the Zhang 2025 time-saving figure (about 37%) against the paper.
