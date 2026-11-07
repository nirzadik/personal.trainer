# 04 — Safety, Pain/Injury Management & Special Populations (research for AI fitness-coach skill)

Research date: 2026-11-04. Method: WebSearch only. WebFetch was blocked for acog.org, pubmed.ncbi.nlm.nih.gov and pmc.ncbi.nlm.nih.gov in this session's network policy, so I could not read primary full texts directly. Each claim below is tagged:
- **[V]**: confirmed from search results (abstract or an authoritative summary).
- **[K]**: well-established content I know from the primary source but could not re-read here. Low risk, but check exact wording before quoting it verbatim.

Each section ends with **Skill rules**, which are distilled, actionable rules for the coaching skill.

---

## 0. Scope-of-practice frame (applies to everything below)

- A trainer or coach **screens, adapts, educates and refers**. It does **not diagnose, treat injuries, prescribe medical nutrition therapy, or change medication**. (NSCA *Essentials of Personal Training*, 3rd ed., excerpt "Personal trainers and nutrition advice" [V]: https://www.nsca.com/certification/nsca-cpt/essentials-of-personal-training--3rd-edition/excerpts/personal-trainers-and-nutrition-advice/)
- An AI coach has *less* information than an in-person trainer: no vitals, no observation, and self-report only. It should therefore apply a **lower threshold for referral** and a **more conservative default** than a human trainer would.

---

## 1. Red flags: stop exercise and/or seek medical care

### 1a. ACSM pre-participation screening (Riebe et al., 2015; carried into ACSM GETP 10th/11th ed.)
- Citation: Riebe D, et al. *Updating ACSM's recommendations for exercise preparticipation health screening.* Med Sci Sports Exerc 2015;47(11):2473–2479. doi:10.1249/MSS.0000000000000664 [V]. https://digitalcommons.uri.edu/kinesiology_facpubs/180 ; trainer summary from ACE: https://www.acefitness.org/resources/pros/expert-articles/6921/new-preparticipation-screening-guidelines-what-health-and-fitness-pros-need-to-know/
- The algorithm uses three inputs: (1) current exercise participation, (2) **known cardiovascular, metabolic (diabetes types 1/2) or renal disease**, and (3) **signs or symptoms suggestive of these diseases**, together with the desired intensity. Risk-factor counting was removed [V].
- Outcomes [V/K]:
  - Inactive, no disease, no symptoms: no clearance needed. Start light to moderate and progress gradually.
  - Inactive with known disease and no symptoms: medical clearance recommended before starting.
  - **Any signs or symptoms, whether or not the person exercises regularly: STOP / do not start. Get medical clearance first.**
  - Regular exerciser with known disease and no symptoms: may continue at moderate intensity. Get clearance before vigorous work. Clearance within the past 12 months is acceptable if symptoms have not changed.
- **ACSM signs/symptoms list** [K, matches the ACE summary]:
  1. Pain or discomfort (or another anginal equivalent) in the chest, neck, jaw, arms or other areas that may be ischemic in nature
  2. Shortness of breath at rest or with mild exertion
  3. Dizziness or syncope
  4. Orthopnea or paroxysmal nocturnal dyspnea
  5. Ankle edema
  6. Palpitations or tachycardia
  7. Intermittent claudication
  8. Known heart murmur
  9. Unusual fatigue or shortness of breath with usual activities
- Validated self-screen for the public: **PAR-Q+** (2014+, updated annually, eparmedx.com). It is the tool to reference for an AI onboarding questionnaire. [K]

### 1b. Stop the session now (in-session warning signs)
Synthesized from ACSM GETP indications for terminating exercise tests [V via secondary lists; check exact thresholds in GETP 11th ed.] and general AHA/ACSM guidance [K]. Search summary: https://open-exam-prep.com/study-guides/acsm-cep/exercise-testing/test-termination (secondary).
- Chest pain, pressure or tightness, or pain radiating to arm, jaw, neck or back
- Shortness of breath out of proportion to effort, or breathlessness that does not settle with rest
- Dizziness, light-headedness, near-fainting or fainting (**syncope during exercise is always a medical referral**)
- Palpitations, racing or irregular heartbeat
- Neurological signs: confusion, ataxia or loss of coordination, slurred speech, facial droop, one-sided weakness or numbness, sudden visual loss, sudden severe "worst ever" headache. **These mean a possible stroke: call emergency services (FAST).**
- Pallor, cyanosis, cold or clammy skin, nausea with any of the above
- Heat illness signs: confusion, stopped sweating or hot dry skin, vomiting, collapse
- Sudden sharp joint or muscle pain, a "pop", acute swelling or inability to bear weight
- Hypoglycemia symptoms in people on insulin or sulfonylureas (shaky, sweaty, confused, hungry, palpitations)
- Pregnancy-specific signs (see 3b)

### 1c. Exertional rhabdomyolysis
- Source: CHAMP/USU (Uniformed Services University) *Clinical Practice Guideline for Exertional Rhabdomyolysis*, updated September 2025 [V]. https://champ.usuhs.edu/sites/default/files/2025-09/WHEC_Clinical_Practice_Guidelines_ER.pdf ; news: https://news.usuhs.edu/2025/09/life-saving-guideline-released-to.html ; 2020 version: https://champ.usuhs.edu:443/sites/default/files/2020-11/hprc_whec_clinical_practice_guideline_for_managing_er.pdf
- Warning signs [V]:
  - Muscle pain, swelling or weakness that is **disproportionate** to the work done, especially hip and shoulder girdle weakness
  - **Dark (tea or cola) urine** or reduced urine output
  - Pain lasting beyond about 5–7 days
  - Signs of compartment syndrome: tense, very swollen limb, severe pain on stretch
- **Dark urine is not required for the diagnosis**, so severe disproportionate pain plus swelling or weakness is enough to act on [V].
- Risk context [K]: unaccustomed high-volume or eccentric work (classic cases are a first spin class, "high-rep" CrossFit-style sessions, very high-rep pull-ups or squats after a layoff), heat, dehydration, recent illness, stimulants, statins, and sickle cell trait.
- **Skill rule:** after a hard session, if the user reports "extreme soreness + swollen limb, or can't straighten the arm, or dark urine", tell them to **seek same-day medical care (urgent care/ER)**. Do not tell them to "push through DOMS" or stretch it out.

### Skill rules (red flags)
1. Ask a short PAR-Q+-style screen at onboarding (heart condition, chest pain, dizziness or fainting, bone/joint problem made worse by exercise, BP or heart medications, pregnancy, any other reason).
2. Any **yes on cardiac or neurological symptoms**: no programming beyond light activity until the user confirms medical clearance.
3. **Emergency phrasing** for chest pain with SOB or sweating, stroke signs, fainting, or dark urine with severe pain: lead with "Stop and call emergency services / get urgent care now", then nothing else. Do not bury it under caveats or training tips.
4. Never interpret ECGs, BP readings or lab values beyond "that's outside the normal range, check with your doctor."

---

## 2. Training around pain

### 2a. Pain-monitoring model (Silbernagel 2007)
- Citation: Silbernagel KG, Thomeé R, Eriksson BI, Karlsson J. *Continued sports activity, using a pain-monitoring model, during rehabilitation in patients with Achilles tendinopathy: a randomized controlled study.* Am J Sports Med 2007;35(6):897–906 [V]. PEDro: https://search.pedro.org.au/search-results/record-detail/18389 ; summary: https://physicaltherapyfirst.com/blog/continued-sports-activity-using-a-pain-monitoring-model-during-rehabilitation-in-patients-with-achilles-tendinopathy/
- Rules [V/K]:
  - Pain **during** activity may reach up to **5/10** (0 = none, 10 = worst imaginable).
  - The model's figure shows **0–2 = "safe"**, **2–5 = "acceptable"** and **5–10 = "high risk"** [K].
  - Pain **after** activity may reach 5/10 but **must have settled by the next morning** (back to baseline within about 24 hours).
  - Pain and stiffness **must not increase week to week**.
- Outcome [V]: continuing Achilles-loading activity (running, jumping) under this model gave outcomes no worse than rest. Load management is better than complete rest.
- Wording caveat [V]: summaries differ on whether 5 is allowed ("≤5") or excluded ("<5"). **Recommend a conservative ≤3–4/10 for an AI coach** that cannot examine the user, with "back to baseline by next morning" as the deciding criterion.

### 2b. Traffic-light approach (NHS physiotherapy handouts)
- No single validated cut-off scheme exists [V]. NHS examples:
  - St George's (NHS) [V] https://www.stgeorges.nhs.uk/wp-content/uploads/2025/01/PHY_EGMI.pdf : Green 0–3/10; Amber 4–6/10 that settles within 2–6 h; Red 7–10/10.
  - York Hospitals (NHS) [V] https://yorkhospitals.nhs.uk/seecmsfile/?id=7866 : time-based. Green means no increase. Amber means symptoms rise but settle within about 2 h and return to baseline within 24 h, so repeat the same load after 48 h and progress only when it is green. Red means a big rise, or not back to baseline within 24 h, so regress.
- **Recommended skill version** (my synthesis, conservative):

| Light | During-exercise pain | After / next morning | Action |
|---|---|---|---|
| Green | 0–3/10, not worsening across sets | Back to baseline next morning | Continue; progress normally |
| Amber | 4–5/10, or creeping up across sets | Slightly worse, but back to baseline within 24 h | Keep load (no progression), or modify (see 2c); re-test in 48 h |
| Red | ≥6/10, sharp or stabbing, changes movement, or rising rapidly | Worse next morning, or worse week on week | Stop that exercise; regress substantially; if 2+ red sessions or no improvement in about 2 weeks → refer to physio |

### 2c. Exercise-modification levers (trainer scope)
Apply in roughly this order; change one variable at a time [K, consistent with the guidance above]:
1. **Range of motion**: limit to the pain-free or tolerable range (box squat to a higher box, floor press instead of bench, rack pulls or block pulls instead of floor deadlifts, partial ROM).
2. **Load / intensity**: reduce by roughly 20–50% or use an easier RPE (e.g., RPE 5–6).
3. **Volume / frequency**: fewer sets, more rest days between exposures of the irritated tissue.
4. **Tempo**: slow controlled eccentrics, pauses, or isometric holds. These often lower irritability and improve control.
5. **Position / variation**: neutral-grip pressing, landmine press, goblet or safety-bar squat, trap-bar deadlift, split stance, incline instead of flat.
6. **Substitution**: swap to a non-provocative exercise that trains the same pattern or muscle (e.g., leg press or step-ups for squat; cable row for barbell row; hip thrust for deadlift).
7. **Keep training everything else.** Avoid "complete rest" unless it is a red flag or acute trauma.

### 2d. Referral triggers (physio / doctor) vs. trainer-manageable
Refer when:
- There was trauma (fall, collision, "pop"), visible swelling or deformity, or inability to bear weight or use the limb
- Night pain or pain at rest that is unrelenting; fever, unexplained weight loss, or history of cancer
- Numbness, tingling, weakness, or pain radiating below the knee or elbow
- Joint locking, giving way or instability
- Pain that is not improving after about 2–3 weeks of sensible modification, or that is getting worse
- Any spine "red flags" (see 2e)

Trainer-manageable: mild, familiar, load-related aches that behave like Green/Amber and improve with modification.

### 2e. Common issues

**Low back pain (LBP)**
- Most acute non-specific LBP improves quickly. Guidelines recommend **staying active, reassurance and exercise**, not bed rest. Routine imaging is not advised without red flags. NICE NG59 (2016, updated 2020) [V via summaries]: https://www.nice.org.uk/guidance/ng59 . Lancet Low Back Pain Series 2018 (Hartvigsen; Foster) [V/K]. WHO 2023 guideline on chronic primary LBP recommends structured exercise [K].
- **Red flags requiring urgent or emergency referral** [V/K]:
  - **Cauda equina**: saddle numbness, new bladder or bowel dysfunction (retention, incontinence), bilateral sciatica, progressive leg weakness. These need **emergency** assessment.
  - Suspected malignancy, infection or fracture: history of cancer, fever, unexplained weight loss, significant trauma, osteoporosis plus sudden pain, IV drug use, immunosuppression, constant night pain.
- Trainer approach: keep moving; use hinge regressions (hip-hinge drills, RDL from blocks, KB deadlift), core endurance (McGill "big 3" as an option, not a must), walking, and gradual return to loaded flexion or extension. Avoid fear-inducing language such as "your disc is out" or "your spine is fragile" (Lancet series: back pain beliefs drive disability) [K].

**Knee pain: patellofemoral pain (PFP)**
- 2016 consensus statement from the 4th International Patellofemoral Pain Research Retreat (Crossley et al., Part 2, BJSM 2016;50:844–852) [V]: **exercise therapy is recommended to reduce pain short-term and improve function medium- to long-term; combining hip- and knee-targeted exercise is preferred over knee alone**. Short-term adjuncts include foot orthoses and patellar taping [K]. https://pure.eur.nl/en/publications/2016-patellofemoral-pain-consensus-statement-from-the-4th-interna/ ; JOSPT CPG 2019 (Willy et al.) agrees [K].
- Definition: pain around or behind the patella, aggravated by loaded knee-flexion activities such as squatting, stairs, running and prolonged sitting [V].
- Trainer levers: reduce knee-flexion depth under load temporarily (box squat, wall sit at a tolerable angle), knee-extension isometrics, leg press in a limited range, hip abductor and extensor strengthening, step-ups at a tolerable height. Manage running volume and downhill running. Progress depth as symptoms allow.

**Shoulder: subacromial / rotator-cuff-related shoulder pain (RCRSP)**
- Exercise therapy is first-line. The **CSAW trial** (Beard et al., Lancet 2018) found arthroscopic subacromial decompression no better than placebo arthroscopy, and neither reached a clinically important difference vs. no treatment [V]. https://discovery.ucl.ac.uk/id/eprint/10064005/ ; NIHR alert: https://evidence.nihr.ac.uk/alert/a-surgical-procedure-for-shoulder-pain-is-less-effective-than-previously-thought ; Littlewood commentary on RCRSP terminology: https://keele-repository.worktribe.com/OutputFile/451692
- Trainer levers: temporarily reduce overhead and end-range loaded positions (landmine press, neutral-grip DB press, incline instead of overhead); external- and internal-rotation strengthening; scapular rows; progressive loading back toward overhead. Avoid "impingement" fear language. Refer for night pain, loss of active elevation or weakness after trauma (possible tear), or no improvement in about 6 weeks.

**Tendinopathy (Achilles, patellar, gluteal, lateral elbow)**
- Tendons need **progressive load, not rest**.
- **Heavy slow resistance (HSR)**: Beyer et al. AJSM 2015 (Achilles, n=58) found HSR and eccentric training equally effective at 12 and 52 weeks, with somewhat higher satisfaction at 12 weeks for HSR [V]. https://pubmed.ncbi.nlm.nih.gov/26018970/ ; earlier Kongsgaard 2009 (patellar) found HSR better than eccentric training long-term [V via Beyer rationale].
  - Typical HSR [K]: 3×/week, 3–4 sets, about 3 s concentric / 3 s eccentric, load progressing from about 15RM to 6RM over 12 weeks.
- **Isometrics**: Rio et al. BJSM 2015 (patellar, single session, small n) reported immediate analgesia from 5 × 45 s at about 70% MVC [V/K].
  - **Current view**: Clifford et al. 2020 (BMJ Open SEM, systematic review and meta-analysis) found **isometrics were not superior to isotonic exercise** for immediate or short-term (≤12 week) pain [V]. https://www.ncbi.nlm.nih.gov/pmc/articles/PMC7406028/ . A 2025 review also found limited support for superiority [V].
  - Use isometrics as a **tolerable starting point or an in-season pain-management tool**, not as a magic analgesic.
- Practical progression [K]: isometrics (if irritable) → slow heavy isotonic (HSR) → energy-storage loading (plyometrics, hopping) → return to sport/running. Use the pain-monitoring model (2a) throughout. Avoid compressive positions early, e.g., deep hip adduction for gluteal tendinopathy and deep dorsiflexion off a step for insertional Achilles [K].
- Refer if: a sudden "kicked in the calf" sensation (possible Achilles rupture: emergency), marked swelling, or no progress in 6–12 weeks.

### Skill rules (pain)
1. Ask the user to rate pain (0–10) during activity and the next morning, and to say whether it is getting worse week on week.
2. Apply the traffic-light table. Default ceiling **≤3–4/10 that settles by next morning**.
3. Modify (ROM → load → volume → tempo → variation → substitution) before removing an exercise. Keep the rest of the program going.
4. Hand off to a physio or doctor on any 2d trigger. Use the phrase "this is worth getting assessed", **not** a diagnosis ("you have patellar tendinopathy"). It is fine to say "this pattern is often consistent with..." with a referral.

---

## 3. Special populations

### 3a. Older adults (falls, sarcopenia, power)
- **NSCA position statement** (Fragala MS, et al. *Resistance Training for Older Adults.* J Strength Cond Res 2019;33(8):2019–2052) [V]. https://www.nsca.com/media-room/press-releases/nsca-position-statement-on-resistance-training-for-older-adults ; https://pubmed.ncbi.nlm.nih.gov/31343601/
  - It aims to reduce fears and barriers [V]. Properly designed RT improves strength, **power** and neuromuscular function, including in frailty and sarcopenia [V].
  - Prescription highlights [K]: 2–3 days/week; 1–3 sets of 6–12 reps (multi-joint) at about 70–85% 1RM once technique is established, starting lighter. **Power training uses light-to-moderate loads (~30–60% 1RM) lifted with maximal intended concentric velocity**, because power declines faster than strength with age and predicts function better. Add balance and functional tasks (sit-to-stand, step-ups, carries). Supervise and progress gradually.
- **World Falls Guidelines 2022** (Montero-Odasso et al., Age Ageing 2022;51:afac205) [V]. https://bgs.org.uk/node/6848 : community-dwelling older adults should do **individualized, progressive balance-challenging and functional exercise ≥3×/week** (plus strength). All older adults should get falls-prevention advice. Higher-risk adults (fall in the past year with injury, ≥2 falls, frailty, can't get up, or syncope) need a **multifactorial clinical falls assessment**, so the coach refers.
- WHO 2020 Physical Activity Guidelines [K]: 150–300 min/week moderate activity; **multicomponent (balance + strength) activity ≥3 days/week** for adults 65+.
- **Skill rules:** ask about falls in the past 12 months, dizziness, and meds (BP meds and sedatives raise fall risk). Train near support at first. Include balance work at least 3×/week. Include power (fast concentric, light load) after a basic strength base. Refer "faller" profiles to a GP or falls clinic.

### 3b. Pregnancy & postpartum
- **ACOG Committee Opinion No. 804** (April 2020), *Physical Activity and Exercise During Pregnancy and the Postpartum Period*. Obstet Gynecol 2020;135:e178–e188 [V]. https://www.acog.org/clinical/clinical-guidance/committee-opinion/articles/2020/04/physical-activity-and-exercise-during-pregnancy-and-the-postpartum-period (not fetchable here; check ACOG's site for reaffirmation status). Summaries: https://pubmed.ncbi.nlm.nih.gov/33481513/ ; https://lamaze.org/Giving-Birth-with-Confidence/GBWC-Post/exercise-during-pregnancy-postpartum-advice-from-experts-at-acog
  - Absent complications, PA in pregnancy is **safe and desirable**. Aim for **≥150 min/week moderate aerobic activity**. Previously vigorous exercisers can generally continue with provider input [V].
  - **Warning signs: stop exercise and contact a provider** [V, multiple summaries]: vaginal bleeding; regular painful contractions; amniotic fluid leakage; dyspnea *before* exertion; dizziness; headache; chest pain; muscle weakness affecting balance; calf pain or swelling.
  - **Absolute contraindications** [K, ACOG Box]: hemodynamically significant heart disease; restrictive lung disease; incompetent cervix or cerclage; multiple gestation at risk of premature labor; persistent 2nd/3rd-trimester bleeding; placenta previa after 26 weeks; premature labor in this pregnancy; ruptured membranes; preeclampsia or gestational hypertension; severe anemia.
  - **Avoid** [K/V]: contact sports and activities with high fall risk; scuba diving; skydiving; "hot yoga" or hot Pilates and exercise in high heat and humidity; prolonged motionless standing. Avoid **prolonged supine** positions after the first trimester (venous return). Intensity: talk test or RPE about 13–14 ("somewhat hard").
  - **Postpartum** [K/V]: activity can resume gradually as soon as medically safe (within days after an uncomplicated vaginal birth; later after cesarean or complications). Pelvic floor training is encouraged. Exercise may help prevent postpartum depression [V]. Lactation is not impaired by moderate exercise.
- **Canadian 2019 guideline** (Mottola MF, Davenport MH, et al. BJSM 2018;52(21):1339–1346) [V]: ≥150 min/week moderate PA over ≥3 days; pelvic floor muscle training recommended; if light-headed or nauseous when supine, avoid supine. Absolute contraindications include uncontrolled type 1 diabetes, uncontrolled hypertension or thyroid disease, and other serious systemic disorders [V]. https://bjsm.bmj.com/content/52/21
- **Returning to running postnatal** (Goom, Donnelly & Brockwell, March 2019) [V]: no running before about **12 weeks postnatal**, and only if the woman passes load and impact tests (e.g., walking 30 min, single-leg balance 10 s, single-leg squat 10 reps each side, jog in place 1 min, forward bounds 10, hop in place 10 each side, single-leg running-man 10 each side). Screen for pelvic-floor symptoms. It is not a rigid protocol [V]. Red flags for return: urinary or fecal incontinence, heaviness or dragging (prolapse symptoms), pelvic or low back pain, ongoing bleeding beyond 8 weeks not linked to the menstrual cycle [V]. https://www.running-physio.com/postnatal-guide ; PDF: https://athleticsni.org/download/files/Returning_to_running_postnatal_guideline_for_medical_health_and_fitness_professionals_managing_this_population.05.pdf
- **Skill rules:** confirm the provider has OK'd exercise. Use the talk test. Show the warning-sign list once and re-show it if any symptom is mentioned. Do not start new high-skill or high-fall-risk sports. Postpartum: gradual return; recommend a pelvic-health physio assessment before impact or heavy lifting, especially with leaking, heaviness, pain or abdominal doming (diastasis).

### 3c. Hypertension
- **ACSM pronouncement / Pescatello et al. 2019** (*Physical Activity to Prevent and Treat Hypertension: A Systematic Review*. Med Sci Sports Exerc 51(6):1314–1323) [V]: strong evidence that PA lowers BP. **Effects are larger the higher the baseline BP** (about 5–8 mmHg in hypertensive adults) [V/K]. ACSM blog: https://www.acsm.org/news-detail/2019/06/13/featured-physical-activity-guidelines-blog-what-s-new-in-the-acsm-pronouncement-on-exercise-and-hypertension
- **AHA Scientific Statement 2023** (Paluch AE, et al. *Resistance Exercise Training in Individuals With and Without CVD: 2023 Update.* Circulation 2024;149:e217–e231) [V]: RT is **at least as safe as aerobic exercise** and lowers BP, glycemia and lipids. Combining it with aerobic training is best. https://professional.heart.org/en/science-news/resistance-exercise-training-in-individuals-with-and-without-cardiovascular-disease-2023-update/top-things-to-know
- **Edwards JJ, et al. BJSM 2023** network meta-analysis (270 RCTs) [K]: all exercise modes lower resting BP. **Isometric training (e.g., wall squats, handgrip) showed the largest reductions**. Aerobic, dynamic RT, combined and HIIT are all effective.
- **Valsalva — current view**: acute breath-holding during heavy lifts produces very large transient BP spikes; MacDougall 1985 reported over 300 mmHg in some subjects. Open-glottis breathing markedly reduces this [V: 1995 study https://pubmed.ncbi.nlm.nih.gov/7741618/ ; Linsenbardt 1992 BJSM https://bjsm.bmj.com/content/26/2/97]. There is no evidence that regular RT raises resting BP, and RT lowers it [V].
  - Practical consensus: for people with hypertension (especially uncontrolled hypertension or CVD), **avoid prolonged maximal Valsalva**. Use moderate loads (e.g., about 60–80% 1RM, RPE ≤7–8) and **exhale on exertion**. Brief bracing at submaximal loads is acceptable for controlled, cleared individuals [K].
- Thresholds [K/V mixed; verify in ACSM GETP 11th ed.]:
  - Resting **SBP ≥160 or DBP ≥100**: medical evaluation before starting or continuing anything beyond light activity.
  - Resting **≥180/110**: don't train that day; seek medical advice. Sources vary between 180/110 and 200/110 [V: Cooper Institute https://www.cooperinstitute.org/blog/hypertension-and-weight-training-secrets-for-success].
  - Beta-blockers blunt heart rate, so use RPE rather than HR zones. Alpha-blockers, calcium-channel blockers and vasodilators raise the risk of post-exercise hypotension, so use a longer cool-down [K].
- **Skill rules:** encourage exercise as treatment. Teach exhale-on-exertion and avoid max-effort grinders and long breath-holds. Use RPE for people on beta-blockers. A reported resting BP ≥180/110, or any headache, vision change or chest symptoms, means no session and see a doctor.

### 3d. Type 2 diabetes
- **ACSM consensus statement** (Kanaley JA, et al. *Exercise/Physical Activity in Individuals with Type 2 Diabetes.* Med Sci Sports Exerc 2022;54(2):353–368) [V]. https://guidelinecentral.com/guideline/1337044 ; https://www.consultant360.com/exclusive/acsm-updates-physical-activity-guidelines-type-2-diabetes
  - Aerobic training lowers HbA1c by about 0.5–0.7% [V]. The 2018 PA Guidelines generally apply [V].
  - [K]: ≥150 min/week moderate-to-vigorous aerobic activity, with **no more than 2 consecutive days off**; RT 2–3 days/week (combined training is best); break up sitting every 30 min; **post-meal walking** is effective; add flexibility and balance work for older adults.
  - **Hypoglycemia risk is mainly in people on insulin or insulin secretagogues** (sulfonylureas, possibly meglitinides). They should **carry fast-acting carbohydrate**, may need to reduce insulin or add carbohydrate *with their care team*, and should have glucagon available for severe episodes [V]. Metformin, GLP-1 RAs and SGLT2i alone rarely cause hypoglycemia [K].
  - Complications [K]: proliferative retinopathy means avoiding heavy straining, Valsalva, inverted positions and high-impact work until cleared. Peripheral neuropathy calls for daily foot checks, proper footwear, and possibly non-weight-bearing options if there are foot ulcers. Autonomic neuropathy (abnormal HR or BP response) means using RPE and getting medical clearance.
- Related thresholds (ADA 2016 Colberg position statement; T1D consensus; ISPAD 2022) [V/K]: pre-exercise glucose about 90–250/270 mg/dL is generally OK. **Ketones** (blood ≥1.5 mmol/L) must be managed before exercise. Severe hypoglycemia in the past 24 h is a contraindication. These are mainly T1D rules: https://diabetes.acponline.org/archives/2017/02/10/8.htm . For T2D (Kanaley 2022), high glucose alone is not a reason to skip exercise if the person feels well and ketones are negative [K].
- **Skill rules:** ask about medication type. If the user is on insulin or a sulfonylurea, remind them to check glucose before, during (if long) and after, carry 15–20 g fast carbs, and agree adjustments with their clinician. **The coach never adjusts doses.** Encourage post-meal walks and RT.

### 3e. Obesity
- **ACSM Position Stand** (Donnelly JE, et al. Med Sci Sports Exerc 2009;41(2):459–471) [V]: **150–250 min/week** moderate PA prevents weight gain and gives modest loss. **>250 min/week** is associated with clinically significant loss and better maintenance after loss. PA works best combined with moderate (not severe) diet restriction [V]. https://read.qxmd.com/doi/10.1249/MSS.0b013e3181949333
- Practical considerations [K]:
  - Use RT to preserve lean mass during energy restriction (especially with GLP-1 RA medications).
  - Choose lower-impact modalities early (cycling, rowing, walking, water) and manage joint load.
  - Watch for heat intolerance, chafing and equipment weight limits.
  - Adjust floor-transition and supine positions for comfort and breathing.
  - Avoid weight-centric shaming language. Track performance, steps and adherence, not just the scale.
  - Screen for associated conditions (hypertension, T2D, OSA, OA) per sections 1a, 3c and 3d.
- **Skill rule:** progress volume before intensity; aim for consistency over heroics.

### 3f. Adolescents / youth
- **2014 International Consensus on youth resistance training** (Lloyd RS, Faigenbaum AD, et al. BJSM 2014;48:498–505; endorsed by the NSCA and others) [V]. https://bjsm.bmj.com/content/48/7/498 ; NSCA 2009 position paper (Faigenbaum et al., JSCR 2009;23(5 Suppl):S60–79) [K].
  - [K]: RT is **safe and effective** for youth when **qualified supervision and appropriate progression** are in place. Injury risk is no greater than in other sports and activities. **Growth-plate damage is a myth** when training is supervised and progressed sensibly. There is no minimum age: start when the child can follow instructions (often about 7–8 years). Prioritize technique and fundamental movement skills.
  - Typical starting point: 1–2 sets of 8–15 reps at light-to-moderate load, 2–3 non-consecutive days/week, progressing to heavier loads (≥80% 1RM) only with technical competence and experience.
- **Skill rules:**
  - For users under 18, recommend supervised training (coach, PE teacher, parent awareness).
  - Emphasize technique; no maximal 1RM testing without supervision.
  - **No calorie-deficit or weight-cutting advice for minors.** Refer weight concerns to a pediatrician.
  - Be alert to disordered eating and RED-S (sections 4–6).
  - Check local age requirements for AI-service use.

### 3g. Osteoporosis / low bone mass
- **LIFTMOR RCT** (Watson SL, et al. J Bone Miner Res 2018;33(2):211–220) [V]. https://pubmed.ncbi.nlm.nih.gov/28975661/
  - Population: 101 postmenopausal women (65 ± 5 y) with low to very low bone mass.
  - Intervention: 8 months, 2×/week, 30-min **supervised high-intensity resistance and impact training** (deadlift, back squat, overhead press at **5 sets × 5 reps, >85% 1RM**, plus jumping chin-ups with drop landings), after a familiarization period of lighter loads [V/K].
  - Results: lumbar spine BMD **+2.9% vs −1.2%**; femoral neck **+0.3% vs −1.9%**; improved height and function [V]. **One minor adverse event**, and follow-up found **no vertebral fractures and improved kyphosis** [V].
  - Caveat: **highly supervised**, with progressive build-up and screening.
- **"Strong, Steady and Straight"** (UK consensus statement, Brooke-Wavell K, et al. BJSM 2022;56(15):837–846, with the Royal Osteoporosis Society) [V]. https://bjsm.bmj.com/content/56/15/837 ; https://blogs.bmj.com/bjsm/2023/10/30/steady-and-straight-uk-consensus-statement-on-physical-activity-and-exercise-for-osteoporosis/
  - **Strong**: progressive resistance training 2–3 days/week; **impact exercise** most days (e.g., about 50 moderate impacts: jogging, stamping, jumping, adapted for people with vertebral fractures) [K/V].
  - **Steady**: balance and strength for falls prevention.
  - **Straight**: spinal extension and posture work.
  - Spinal flexion: **avoid a high degree of loaded, repetitive or end-range spinal flexion** (e.g., loaded sit-ups or toe touches). Spinal movement is not banned [V].
  - Benefits generally outweigh risks; people with osteoporosis should be encouraged to exercise [V].
- **Skill rules:** encourage RT and impact training. Build load progressively and require good technique. Prefer a hip hinge with a neutral spine over loaded spinal flexion. A user with a known vertebral fracture, multiple fractures or very low BMD should start under physio or clinical-exercise supervision; LIFTMOR-style loading should only follow a supervised build-up.

### 3h. Beginners and people returning after a long break
- Strength is largely maintained for about 3 weeks of detraining, with faster decline afterwards. **Regaining is faster than the initial build ("muscle memory")**, but connective tissue and work capacity lag behind [V, trainer-level sources: NASM https://www.nasm.org/resource-center/blog/fitness/muscle-memory].
- Rhabdo and DOMS risk is highest in the **first sessions** after a layoff, especially with high-volume eccentric work (section 1c).
- **Skill rules:**
  - Session 1–2 volume should be about 30–50% of the previous working volume. Start at RPE 5–7 and leave 3+ reps in reserve.
  - Return to about 70–85% of previous loads over the first 2–4 weeks, then progress.
  - Avoid "testing" maxes early. Re-run the PAR-Q screen if health has changed during the break (new meds, surgery, pregnancy).

---

## 4. Women-specific considerations

### 4a. Menstrual cycle and training
- **McNulty KL, et al.** *The Effects of Menstrual Cycle Phase on Exercise Performance in Eumenorrheic Women: a systematic review and meta-analysis.* Sports Med 2020;50(10):1813–1827 [V]. https://www.ncbi.nlm.nih.gov/pmc/articles/PMC7497427/
  - 78 studies. The early follicular phase showed a **trivial** reduction in performance (ES −0.06). Evidence quality was low. "General guidelines on exercise performance across the MC cannot be formed". **Individualize instead** [V].
- **Colenso-Semple LM, et al.** *Current evidence shows no influence of women's menstrual cycle phase on acute strength performance or adaptations to resistance exercise training.* Front Sports Act Living 2023 (umbrella review) [V]: it is **premature** to say hormone fluctuations appreciably affect strength, hypertrophy or performance, and methods for verifying cycle phase are often poor. https://www.frontiersin.org/articles/10.3389/fspor.2023.1054542/full ; commentary: https://www.mysportscience.com/post/no-evidence-to-adapt-training-to-the-phase-of-the-menstrual-cycle
- **Current view**: **cycle-phase-based periodization lacks strong evidence**. Train consistently and adjust day-to-day for **individual symptoms** (cramps, fatigue, sleep, GI issues, heavy bleeding) using autoregulation (RPE/RIR). This applies to everyone, not only women. Tracking the cycle is useful to **spot irregularities** that may indicate low energy availability or a medical issue.
- Hormonal contraception: no strong evidence that it meaningfully affects RT adaptations [K, Elliott-Sale et al. 2020 Sports Med].
- Perimenopause and menopause [K]: RT and impact work are especially valuable for bone and muscle. Vasomotor and sleep symptoms may warrant autoregulation. HRT decisions belong to clinicians.

### 4b. RED-S / low energy availability (LEA)
- **IOC 2023 consensus statement on REDs** (Mountjoy M, et al. BJSM 2023;57(17):1073–1098) [V]. https://pubmed.ncbi.nlm.nih.gov/37752011/ ; summary: https://humanperformancealliance.org/?p=2211
  - LEA is a spectrum from "adaptable" (short-term, benign) to "problematic" (prolonged, harmful). It affects **all sexes**.
  - The **IOC REDs CAT2** clinical tool uses a 4-level traffic light (green / yellow / orange / red) for severity and sport participation. Diagnosis is **physician-led** [V]. Validation: BJSM 2025;59(1):24 https://bjsm.bmj.com/content/59/1/24
- **Indicators and warning signs** a coach can notice (CAT2 tiers per a clinician summary [V, verify against the IOC PDF]; general signs [K]):
  - **Menstrual**: missed periods. Secondary amenorrhea means ≥3 consecutive missed cycles, or more than 12 months is severe. Oligomenorrhea means cycles >35 days. Primary amenorrhea means no period by age 15.
  - **Bone**: stress fractures or bone stress injuries, especially repeated or at high-risk sites.
  - **Males**: low libido, loss of morning erections, low testosterone.
  - **General**: persistent fatigue, frequent illness, unexplained performance decline or stagnation, poor recovery, low mood or irritability, GI problems, feeling cold, dizziness, unintended weight loss, very low reported intake relative to training load, eating-disorder behaviors.
- **Skill rules:**
  - If a user reports periods stopping or becoming very irregular (not explained by pregnancy, menopause or hormonal contraception), stress fractures, or several of the general signs together with a high training load or restriction: **do not prescribe a calorie deficit or more volume**.
  - Gently recommend seeing a doctor, ideally a sports-medicine physician, and a sports dietitian.
  - Shift the coaching emphasis to adequate fueling and recovery.
  - Never present loss of periods as a normal sign of "being fit."

---

## 5. Overtraining syndrome (OTS) vs functional overreaching (FOR)

- **Joint ECSS/ACSM consensus statement** (Meeusen R, et al. *Prevention, diagnosis and treatment of the overtraining syndrome.* Eur J Sport Sci 2013;13(1):1–24; Med Sci Sports Exerc 2013;45(1):186–205) [V]. https://sportgeneeskunde.com/wp-content/uploads/Meeusen-et-al-2013-Overtraining-Consensus-ECSS-ACSM.pdf ; review: https://journal.aspetar.com/en/journals/volume-3-issue-1/overtraining-syndrome
- Kreher JB, Schwartz JB. *Overtraining syndrome: a practical guide.* Sports Health 2012;4(2):128–138 [V]. https://pmc.ncbi.nlm.nih.gov/articles/PMC3435910/

| State | Performance decrement | Recovery time | Outcome |
|---|---|---|---|
| Functional overreaching (FOR) | Short-term, planned (e.g., hard training block) | Days to about 2 weeks | **Supercompensation**: performance improves after a taper [V] |
| Non-functional overreaching (NFOR) | Longer, with psychological and other symptoms | Weeks to months | No supercompensation; performance only returns to baseline [V/K] |
| Overtraining syndrome (OTS) | **More than about 2 months**, with severe multisystem symptoms [V Kreher] | Months to years | Diagnosis of exclusion (rule out illness, anemia, thyroid, LEA/REDs, depression and infection) [V] |

- No single biomarker diagnoses OTS (hormones, performance tests, psychological tests and immune markers all fall short) [V]. Prevention means **overload combined with adequate recovery**; the danger is excessive overload plus inadequate recovery [V].
- Warning signs [V/K]:
  - Performance plateau or decline despite rest days
  - Unusually high RPE for familiar loads
  - Persistent fatigue and heavy legs
  - Disturbed sleep
  - Mood changes: irritability, apathy, depression, loss of motivation
  - Persistent soreness
  - Frequent infections
  - Loss of appetite or weight
  - Resting HR that is abnormal in **either** direction; HRV suppressed for days
  - Menstrual disturbance
- Non-training stressors (work, sleep, illness, LEA) count toward total load.
- **When to back off (skill rules):**
  1. Performance down plus ≥2 symptoms for more than about 1 week despite normal recovery: **deload** for 1 week (cut volume about 40–60%, keep some intensity) and check sleep, energy intake and life stress.
  2. No rebound after a 1–2 week deload, or symptoms persisting more than 2–3 weeks: **recommend a medical check** to rule out illness, anemia, thyroid problems, REDs or depression. Do not keep adding training.
  3. Fever or systemic illness: no training. With "above-the-neck" mild cold symptoms only, light activity is acceptable [K].
  4. Use autoregulation (RPE/RIR) and planned deloads (e.g., every 4–8 weeks, or when readiness drops).

---

## 6. Disordered eating red flags and the nutrition-advice boundary

### 6a. Boundary
- **NSCA** (*Essentials of Personal Training*, 3rd ed.) [V]: it is within a trainer's scope to **correct misinformation and give general nutrition advice** for performance, disease prevention, weight loss and weight gain, in line with public dietary guidelines. **Individualized nutrition for a medical condition is medical nutrition therapy (MNT)**, which belongs to registered dietitians or licensed nutritionists. Referral examples include diabetes, heart disease, GI disease, eating disorders, osteoporosis, elevated cholesterol, and kidney disease [V]. https://www.nsca.com/certification/nsca-cpt/essentials-of-personal-training--3rd-edition/excerpts/personal-trainers-and-nutrition-advice/
- US state laws vary; some states restrict individualized nutrition advice to licensed professionals [V]. Trainer-level summary: https://nfpt.com/food-thought-scope-practice-personal-trainer/

**Within scope for an AI coach:**
- General healthy-eating patterns and public guidelines
- Protein targets for training (e.g., about 1.6 g/kg/day, up to about 2.2)
- Hydration, and meal timing around training
- Estimating energy needs with ranges
- Moderate deficits for healthy adults (about 0.5–1% bodyweight per week)
- Evidence-based supplement basics (creatine, caffeine, vitamin D if deficient per a doctor)

**Outside scope (refer to an RD or doctor):**
- Diets to manage diseases (diabetes, CKD, IBD, celiac, PCOS, CVD, food allergies)
- Pregnancy-specific diets beyond general advice
- Any eating disorder
- Very-low-calorie diets (<800–1000 kcal/day) or medically supervised diets
- Interpreting labs
- Supplement interactions with medications
- Nutrition plans for minors aimed at weight loss

### 6b. Disordered eating / eating disorder red flags
- Screening: the **SCOFF** questionnaire (5 items; ≥2 "yes" answers raises suspicion) [V]: Sick (do you make yourself sick because you feel uncomfortably full?), Control (worry you've lost control over how much you eat?), One stone (lost more than about 6 kg in 3 months?), Fat (believe yourself fat when others say you're thin?), Food (food dominates your life?). Validation in athletes found about 94% sensitivity, but it misses some cases [V]: https://pmc.ncbi.nlm.nih.gov/articles/PMC9214368 . **An AI coach should not administer a diagnostic screen.** Use these as listening cues.
- Red flags to notice in conversation [K/V]:
  - Requests for extreme deficits (<1200 kcal or "as low as possible"), rapid weight-loss goals, or a goal weight at or below a healthy range
  - Rigid food rules, cutting out whole food groups out of fear, or guilt after eating
  - **Compensatory exercise**: "how much cardio to burn off what I ate", distress when a workout is missed, or training through injury or illness
  - Bingeing or loss-of-control eating; vomiting, laxatives, diuretics or diet pills
  - Preoccupation with weight, body checking, frequent weighing
  - Missed periods, dizziness, fainting, feeling cold all the time, hair loss
  - Secrecy around eating; very low BMI, or unexplained rapid weight change
  - Athletes in weight-class or aesthetic sports and lean-build endurance sports are at higher risk; males are under-screened [V]
- **Skill rules:**
  1. On red flags: **stop giving deficit, macro-cutting or "burn-off" advice**. Do not provide calorie numbers that would enable restriction.
  2. Respond with care and without judgment. Name the concern gently, and encourage talking to a GP or doctor and an eating-disorder-informed dietitian or therapist. Give helpline resources (US: NEDA/ANAD helpline; UK: Beat; adapt to the user's locale).
  3. If the user reports fainting, chest pain, purging several times a day, or suicidal thoughts: urgent or emergency care.
  4. Use non-weight-centric language. Offer performance, strength and well-being goals as alternatives.
  5. Do not shame or lecture, and do not refuse all engagement. Keep the user connected while redirecting toward appropriate help.

---

## 7. Responsible AI-coach disclaimers (how to phrase them without preaching)

- Context: WHO (Jan 2024) *Ethics and governance of AI for health: guidance on large multi-modal models* [V] lists patient-facing chatbot use (symptom investigation) as a key risk area. It cites **false, inaccurate or incomplete statements** and **automation bias**, and calls for transparency and well-defined tasks [V]. https://www.who.int/news/item/18-01-2024-who-releases-ai-ethics-and-governance-guidance-for-large-multi-modal-models ; publication: https://www.who.int/publications-detail-redirect/9789240084759
- Principles (synthesis):
  1. **Disclose once, clearly, at onboarding.** Example: "I'm an AI coach, not a doctor or physio. I can't examine you, so I'll suggest getting checked out when something sounds like it needs hands-on assessment."
  2. **Trigger, don't repeat.** Add safety notes only when the user's input warrants them (symptom, condition, medication, pregnancy, pain, minors). No boilerplate on every reply.
  3. **Make it actionable and specific.** Say who to see, how urgently, and what to do meanwhile. "A physio can assess this. In the meantime, swap barbell squats for box squats to a pain-free depth" beats "consult a healthcare professional before beginning any exercise program."
  4. **Scale urgency to risk:**
     - **Emergency**: one short line first ("Stop now and call emergency services."), with no training content.
     - **Urgent**: "get seen today or tomorrow".
     - **Routine**: "worth mentioning to your doctor at your next visit".
     - **Informational**: a short clause, or nothing.
  5. **Keep the user moving.** Pair a referral with a safe alternative so the disclaimer doesn't read as abandonment ("While you wait for that appointment, here's what's generally safe...").
  6. **Avoid moralizing, fear language and diagnosis.** Use "This could be a few things; a physio can tell you which" rather than "You have X" or "You could seriously injure yourself."
  7. **Respect autonomy.** State the recommendation once. If the user chooses to proceed, give the safest version (e.g., lighter load, stop rules) rather than repeating warnings. Exception: true red flags (chest pain, syncope, neuro signs, rhabdo, pregnancy warning signs, active eating-disorder risk), where the coach does not provide the training content.
  8. **Be honest about uncertainty and the evidence base.** "The research here is mixed" is better than false certainty.
- Example phrasings:
  - Pain (amber): "A 4/10 that settles by morning is usually fine to train around. Let's cap squat depth at parallel this week and see how it responds. If it's sharper, lasts into the next day, or isn't improving in a couple of weeks, get a physio to have a look."
  - Condition disclosure: "Got it. Since you're on insulin, keep fast carbs on hand and check your glucose before and after. Your diabetes team can tell you whether to adjust doses on training days. I'll keep the sessions in a steady moderate range to start."
  - Red flag: "Chest tightness with breathlessness during exercise needs medical attention. Please stop and get checked today, or call emergency services if it's severe or not easing. We can pick the program back up once you've been cleared."

---

## Source list (primary where possible)
- Riebe D et al. MSSE 2015, ACSM screening: https://digitalcommons.uri.edu/kinesiology_facpubs/180 ; ACE summary: https://www.acefitness.org/resources/pros/expert-articles/6921/new-preparticipation-screening-guidelines-what-health-and-fitness-pros-need-to-know/
- CHAMP/USU Exertional Rhabdomyolysis CPG 2025: https://champ.usuhs.edu/sites/default/files/2025-09/WHEC_Clinical_Practice_Guidelines_ER.pdf
- Silbernagel 2007 AJSM: https://search.pedro.org.au/search-results/record-detail/18389
- NHS traffic-light handouts: https://www.stgeorges.nhs.uk/wp-content/uploads/2025/01/PHY_EGMI.pdf ; https://yorkhospitals.nhs.uk/seecmsfile/?id=7866
- NICE NG59 LBP: https://www.nice.org.uk/guidance/ng59
- Crossley 2016 PFP consensus: https://pure.eur.nl/en/publications/2016-patellofemoral-pain-consensus-statement-from-the-4th-interna/
- CSAW (Beard 2018 Lancet): https://discovery.ucl.ac.uk/id/eprint/10064005/
- Beyer 2015 HSR: https://pubmed.ncbi.nlm.nih.gov/26018970/
- Clifford 2020 isometrics SR: https://www.ncbi.nlm.nih.gov/pmc/articles/PMC7406028/
- Fragala 2019 NSCA older adults: https://pubmed.ncbi.nlm.nih.gov/31343601/
- World Falls Guidelines 2022: https://bgs.org.uk/node/6848 (doi:10.1093/ageing/afac205)
- ACOG CO 804: https://www.acog.org/clinical/clinical-guidance/committee-opinion/articles/2020/04/physical-activity-and-exercise-during-pregnancy-and-the-postpartum-period ; https://pubmed.ncbi.nlm.nih.gov/33481513/
- Mottola 2018 Canadian pregnancy guideline: https://bjsm.bmj.com/content/52/21
- Goom/Donnelly/Brockwell 2019 postnatal running: https://www.running-physio.com/postnatal-guide
- Pescatello 2019 ACSM hypertension: https://www.acsm.org/news-detail/2019/06/13/featured-physical-activity-guidelines-blog-what-s-new-in-the-acsm-pronouncement-on-exercise-and-hypertension
- Paluch 2023 AHA RT statement: https://professional.heart.org/en/science-news/resistance-exercise-training-in-individuals-with-and-without-cardiovascular-disease-2023-update/top-things-to-know
- Valsalva BP studies: https://pubmed.ncbi.nlm.nih.gov/7741618/ ; https://bjsm.bmj.com/content/26/2/97
- Kanaley 2022 ACSM T2D: https://guidelinecentral.com/guideline/1337044
- Donnelly 2009 ACSM weight loss: https://read.qxmd.com/doi/10.1249/MSS.0b013e3181949333
- Lloyd 2014 youth RT consensus: https://bjsm.bmj.com/content/48/7/498
- LIFTMOR (Watson 2018 JBMR): https://pubmed.ncbi.nlm.nih.gov/28975661/
- Strong, Steady and Straight 2022: https://bjsm.bmj.com/content/56/15/837
- McNulty 2020: https://www.ncbi.nlm.nih.gov/pmc/articles/PMC7497427/
- Colenso-Semple 2023: https://www.frontiersin.org/articles/10.3389/fspor.2023.1054542/full
- Mountjoy 2023 IOC REDs: https://pubmed.ncbi.nlm.nih.gov/37752011/ ; CAT2 validation: https://bjsm.bmj.com/content/59/1/24
- Meeusen 2013 OTS consensus: https://sportgeneeskunde.com/wp-content/uploads/Meeusen-et-al-2013-Overtraining-Consensus-ECSS-ACSM.pdf
- Kreher & Schwartz 2012: https://pmc.ncbi.nlm.nih.gov/articles/PMC3435910/
- NSCA nutrition scope: https://www.nsca.com/certification/nsca-cpt/essentials-of-personal-training--3rd-edition/excerpts/personal-trainers-and-nutrition-advice/
- SCOFF in athletes: https://pmc.ncbi.nlm.nih.gov/articles/PMC9214368
- WHO 2024 LMM guidance: https://www.who.int/publications-detail-redirect/9789240084759

## Verification gaps (check before quoting verbatim)
- Exact ACOG CO 804 box wording and current reaffirmation status (acog.org was unreachable).
- ACSM GETP 11th ed.: exact resting-BP cut-offs for deferring exercise, and the exercise-termination criteria.
- Whether "≤5" or "<5" is the exact Silbernagel threshold (summaries conflict).
- Edwards 2023 BJSM isometric BP meta-analysis effect sizes (from memory; not surfaced by search).
- Exact IOC REDs CAT2 indicator wording (from a clinician summary, not the IOC PDF).
