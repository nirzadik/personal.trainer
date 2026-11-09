# 07: HIIT / CrossFit-style conditioning and hybrid weekly scheduling

Research date: 2026-11-07. Purpose: source material for `references/conditioning.md` and the app's `knowledge/plan.js` / `chat.js`.

**Method and network note.** WebSearch only. After www.nhs.uk failed DNS in this session's network policy, no further hosts were fetched. Claims come from search-result abstracts and summaries, plus standard texts I know but could not re-read here: NSCA Essentials of Strength Training & Conditioning (4th ed.) and the CrossFit Level 1 Training Guide.

Confidence tags:
- **[V]**: confirmed this session from an abstract, a journal record or several consistent summaries.
- **[K]**: well-established content from a primary or standard source, not re-read here.
- **[P]**: practitioner convention or heuristic.
- **[!]**: weak, conflicting or commercially interested evidence.

---

## 1. Formats and definitions

- **AMRAP, EMOM, For Time, RFT, chipper** [K]: standard CrossFit-style formats, defined in the CrossFit L1 Training Guide. The official guide is a free 255-page PDF [V that it exists; content not re-read]. Its core idea: "constantly varied functional movements performed at high intensity", balanced across **modal domains** (M = monostructural/metabolic conditioning, G = gymnastics, W = weightlifting) and **time domains** [K]. Scaling preserves the stimulus, and "the workout is for everyone" [V, secondary study guide].
- **Tabata et al. 1996 (MSSE 28:1327-1330)** [V]:
  - 7-8 × 20 s at about 170% VO2max with 10 s rest, about 4 min, on a mechanically braked cycle ergometer, 5 days/week for 6 weeks, vs 60 min at 70% VO2max.
  - Intermittent training raised anaerobic capacity by 28% and VO2max similarly to the continuous group.
  - The sample was small (moderately trained male students), and gains plateaued after about 3-4 weeks [V secondary].
  - Practical implication: "Tabata" with burpees or thrusters at a self-selected effort isn't the original stimulus. True Tabata intensity belongs on an ergometer.
- **HIT taxonomy (Buchheit & Laursen 2013, Sports Med 43:313-338)** [V]:
  - long intervals (about 45 s-4 min)
  - short intervals (<45 s)
  - repeated-sprint training (≤10 s)
  - sprint interval training (20-30 s all-out)
  - The review lists ≥9 variables to manipulate. Formats with similar high-intensity time can strain the neuromuscular and musculoskeletal system very differently, so modality and rest matter, not just duration.

## 2. Work:rest and energy systems

- **NSCA table (Haff & Triplett, Essentials of S&C)** [V via secondary sources; K]:

| Primary system | Duration | Intensity | Work:rest |
|---|---|---|---|
| Phosphagen | 5-10 s | 90-100% max power | 1:12-1:20 |
| Fast glycolysis | 15-30 s | 75-90% | 1:3-1:5 |
| Fast glycolysis + oxidative | 1-3 min | 30-75% | 1:3-1:4 |
| Oxidative | >3 min | 20-30% max power | 1:1-1:3 |

- These ratios target *performance-specific repeatability*. Formats like Tabata (2:1) and 30/30s deliberately use incomplete rest to emphasize aerobic power and lactate tolerance, so they don't fit the table [V].
- **Norwegian 4×4** [K, already in `references/programming.md` §8]: 4 × 4 min at 85-95% HRmax with 3 min active recovery (Helgerud 2007). Versus no-exercise controls, HIIT raised VO2max by about +5.5 ml/kg/min and continuous endurance training by about +4.9; head to head, HIIT added a possibly small +1.2 ± 0.9 ml/kg/min (Milanović 2015, 28 trials, 723 adults; abstract checked 2026-11-08) [V].

**Skill rules:**
- Pick the energy-system target, then use the matching work:rest.
- Sprints: 6-10 s with ≥60-120 s rest.
- Glycolytic: 20-60 s at 1:3-1:5.
- VO2max: 2-5 min at about 1:1-1:0.5, or 30/30s.
- Threshold: 5-20 min with short rest.

## 3. Frequency and intensity dose

- No ACSM primary guideline on HIIT frequency was found this session [!]. Commercial summaries attribute "start with one HIIT workout a week" to ACSM [V secondary, unverified].
- Recovery between HIIT sessions: 24-72 h in various sources [V, inconsistent].
- **Les Mills / Gottschall (presented at ACSM 2018)** [V, !]:
  - 35 active adults training >8 h/week.
  - Proposed an upper limit of about 30-40 min/week above 90% HRmax; beyond that, overreaching signs (saliva cortisol/testosterone).
  - Small, industry-funded, and the lead researcher is affiliated with the company. Use it only as a sensible ceiling.
- Sprint-interval frequency studies in soccer players and older adults found 1-3 sessions/week gave similar gains [V], so low frequency still works.

**Skill rules** [P]:
- Newcomers: 1 session/week for 2 weeks, then 2.
- Most hybrid athletes: 2.
- Regular CrossFit-style trainees: 2-3 hard ones (more if some are moderate).
- ≥48 h between hard conditioning days for the same patterns.
- About 30-40 min/week at >90% HRmax.
- HIIT counts toward the weekly hard-day budget.

## 4. Injury epidemiology (CrossFit / HIFT)

- **2021 meta-analysis (German Journal of Sports Medicine)** [V]: prevalence 30.3% (95% CI 25.3-35.3); incidence **3.20 per 1,000 h** (2.06-4.34). Sites: spine 26.8%, shoulder 25.9%, knee 15.8%.
- **Rodríguez et al. 2020** [V]: incidence 0.2-18.9 per 1,000 h across studies. Shoulder 26%, spine 24% (about 80% of those lower back), knee 18%.
- **Dominski et al. 2018** [V]: 1.94-3.1 per 1,000 h. Shoulder > back > knee.
- **Shoulder-specific review** [V]: 0.74-1.16 shoulder injuries per 1,000 h. Overhead positions above 90° of abduction are the most injury-prone. Kipping pull-ups, ring dips and muscle-ups are flagged as higher shoulder risk. Weightlifting and powerlifting movements account for most injuries.
- Comparison: rates are similar to recreational weightlifting and lower than running (7.7-17.8/1,000 h; see 06-running.md §4) [V]. The evidence is mostly retrospective and low-certainty.

**Skill rules:** gate high-skill gymnastics and Olympic lifts (§6). Keep heavy and complex lifts out of fatigue. Watch shoulder and low-back volume.

## 5. Exertional rhabdomyolysis in HIFT

- **Systematic review (Apunts 2024)** [V]: 26 studies, 63 HIFT-related exertional rhabdomyolysis cases. Listed contributors: metabolic myopathy, obesity, smoking, statins, dehydration, heat, prior heat illness, sickle-cell trait. Unaccustomed strenuous exercise was the only shared factor in a cluster of 3 cases at one gym.
- **Hopkins et al. 2019 case series** (11 patients, one academic institution) [V]: called CrossFit-associated ER a "significant risk", and called for risk-factor research.
- **Case reports** [V]: rhabdo after a single CrossFit session in someone returning after a few weeks off; beginners doing extensive sessions without warm-up. The authors describe it as "potentially preventable" through awareness and graded volume.
- **CHAMP/USU Clinical Practice Guideline for ER, updated Sept 2025** [V, already in 04-safety-special-pops.md §1c]:
  - Warning signs: disproportionate pain, swelling or weakness; dark urine or low urine output; pain >5-7 days.
  - Dark urine is not required for the diagnosis.
- **Mechanism** [K]: unaccustomed eccentric loading (GHD sit-ups, jumping pull-ups and negatives, high-rep push-ups and squats), especially in heat or when dehydrated.

**Skill rules** [P; numbers are heuristics, no tested thresholds exist]:
- Ramp-in for newcomers and returners:
  - Weeks 1-2: 8-12 min of metcon work, RPE ≤7, ≤30-50 reps of any movement per session (≤20-30 for eccentric-heavy movements). No chippers, GHD sit-ups or to-failure formats.
  - Weeks 3-4: 12-20 min, ≤75 reps per movement.
  - Then: ≤20-30% volume increase per week. New movements start at ≤20-30 reps.
- Red-flag symptoms mean same-day care.

## 6. Skill prerequisites and scaling

- **Kipping pull-ups:** there is no injury research on strict-pull-up thresholds [V]. Coach and physio sources suggest 3-5, 5-10, or "10 strict" before kipping [V, conflicting]. One coach argues that shoulder mobility and scapular control at the bottom of the swing matter as much as the number [V]. A history of shoulder injury without rehab, or current pain, are reasons not to kip [V].
- **Skill rule** [P]: ≥5 strict pull-ups + pain-free shoulders + a competent hollow/arch swing before kipping. Muscle-ups and butterfly pull-ups only for proficient kippers with ≥8-10 strict pull-ups. Olympic lifts under fatigue only for those with coached technique, at ≤60% 1RM. Otherwise use DB/KB variants.
- **Scaling** [K/P]: preserve the stimulus. Ladder: load → reps → movement → range/standard → time cap. Barbell cycling loads about 30-50% 1RM for sets of ≥10; 50-70% for sets of ≤5. Equal-time substitution for monostructural work (≈2 min ≈ 400 m run ≈ 500 m row ≈ 1,000 m BikeErg).
- Typical CrossFit "Rx" loads (24/16 kg KB, 9/6 kg wall ball, 43/30 kg thruster, 22.5/15 kg DB) [K]: reference values for experienced athletes, not defaults.

## 7. Hybrid weekly scheduling

- **Interference evidence** (see 03-programming-science.md §7.1 and 06-running.md §10) [V]:
  - Schumann 2022: small interference for explosive strength, mostly same-session.
  - Running > cycling (Wilson 2012).
  - Strength first in the same session is better for lower-body dynamic strength (Eddens 2018).
  - Separating sessions by ≥6 h, or onto different days, minimizes the effect.
  - A 2024 network meta-analysis (secondary summary only) found the strongest interference with same-session training or very high endurance volume [V secondary, !].
- **Coaching templates** [V secondary; P]:
  - 3 lifting + 3 running sessions plus a rest day for recreational hybrids.
  - One HIIT session/week kept away from heavy legs, plus a long zone 2 session on the weekend.
  - "Hard days hard": stack a hard run (AM) and lift (PM, ≥6 h) so easy days stay easy. This is debated: some coaches advise never pairing heavy squats or deadlifts with hard intervals on the same day.
- **Skill synthesis** [P]:
  - Classify sessions as Hard, Moderate or Easy.
  - Cap hard sessions at about 2/3/4 per week for novice/intermediate/advanced.
  - No consecutive hard sessions for the same tissues or system, and ≤2 hard days in a row.
  - Heavy legs never in the 24 h before a quality or long run.
  - Allowed combinations are in `references/conditioning.md` §10.
  - Lower-body strength at about 6-12 hard sets/muscle/week once running is ≥3 runs or ≥30 km/week, or conditioning is ≥2 sessions/week.
  - Each modality: about 2×/week to progress, 1×/week to maintain [K, consistent with strength maintenance (programming.md §3) and running consistency principles].

## Sources

- Tabata 1996: https://pmc.ncbi.nlm.nih.gov/articles/PMC3772611 (secondary review citing it); https://www.jssm.org/jssm-12-612.xml-Fulltext
- Buchheit & Laursen 2013 (HIT Part I): https://www.britishcanoeingawarding.org.uk/resource/high-intensity-interval-training-solutions-to-the-programming-puzzle/
- NSCA work:rest (secondary): https://www.themovementsystem.com/blog/nsca-cscs-work-to-rest-ratios ; https://open-exam-prep.com/study-guides/nsca-cpt/cardio-technique/cardio-energy-systems
- Les Mills HIIT ceiling: https://www.lesmills.com/us/articles/how-much-hiit-to-recommend ; https://www.americanspa.com/fitness-studies/new-research-highlights-benefits-risks-hiit-training
- HIIT frequency (commercial summaries, !): https://www.sweat.com/blogs/fitness/how-to-do-hiit-for-beginners
- CrossFit injury meta-analysis 2021: https://www.germanjournalsportsmedicine.com/archive/archive-2021/issue-7/musculoskeletal-injuries-in-crossfitr-a-systematic-review-and-meta-analysis-of-injury-rates-and-locations/ ; Dominski 2018: https://saber.unioeste.br/index.php/cadernoedfisica/article/view/25138 ; https://scielo.br/j/fp/a/zvwyyP8rMr89m5HmqnWdG3N/?lang=en
- Rhabdomyolysis in HIFT: https://www.apunts.org/en-beyond-intensity-a-systematic-review-articulo-S2666506924000154 ; case series: https://paulogentil.com/pdf/CrossFit%20and%20rhabdomyolysis%20-%20A%20case%20series%20of%2011%20patients%20presenting%20at%20a%20single%20academic%20institution.pdf ; https://pmc.ncbi.nlm.nih.gov/articles/PMC7872485 ; CHAMP guideline: https://champ.usuhs.edu/sites/default/files/2025-09/WHEC_Clinical_Practice_Guidelines_ER.pdf
- Kipping prerequisites (coaching, !): https://blog.crossoversymmetry.com/?p=288 ; https://thebarbellphysio.com/shoulder-pain-with-kipping-pull-ups/ ; https://catalystathletics.com/article/91/The-Kipping-Pull-up-How-to-Do-It-Safely-and-Use-it-in-Traini
- CrossFit L1 guide: https://www.crossfit.com/l1-training-guide/
- Hybrid scheduling (secondary): https://www.athletedata.health/guides/hybrid-athlete-training ; https://trainasone.com/faqs/2025/how-can-i-minimise-the-interference-effect-when-im-doing-both-running-and-strength-training

## Verification gaps

- No consensus guideline exists for HIIT weekly frequency or for rhabdo-safe volume caps. All caps here are heuristics.
- The CrossFit L1 guide's exact time-domain and template wording was not re-read.
- The NSCA table values come from secondary sources and should be checked against the 4th edition.
- The equal-time conversions between ergometers are rough. Individual pacing differs by ±30%.
