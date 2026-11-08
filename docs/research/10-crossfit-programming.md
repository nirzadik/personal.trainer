# 10: How CrossFit programs its daily workouts, and what the app takes from it

Research date: 2026-11-08. Purpose: improve the app's HIIT/metcon programming (`references/conditioning.md` §12, `app/src/knowledge/plan.js` §5.9, `app/src/knowledge/chat.js`, the conditioning warnings in `core.validatePlan`).

**Access and method.**
- **Could not fetch:** `www.crossfit.com/workout` and `games.crossfit.com` both failed DNS (ENOTFOUND) under this session's network policy. Per policy I stopped fetching after the second failure. To read the live workout pages, those hosts need to be allowed in the session's network settings.
- **What I used:** WebSearch result summaries of CrossFit's own pages (essays on the theoretical hierarchy, constantly varied programming, variance, heavy days, scaling and retesting; the 2003 CrossFit Journal template reprint; daily workout archive entries), third-party study guides for the L1/L3 courses, affiliate blogs, and peer-reviewed benchmark-norm papers. I also used my own background knowledge of the CrossFit Level 1 Training Guide and the 2003 "Theoretical Template" article, which I could not re-read here.
- **Copyright:** principles are summarized in my own words. No workouts or long passages are copied. Named benchmarks are mentioned by name only.

Confidence tags (same as `07-conditioning.md`):
- **[V]**: confirmed this session from search summaries of the primary page, or from several consistent sources.
- **[K]**: well-known content from a primary source (L1 guide, CrossFit Journal) that I could not re-read here.
- **[P]**: practitioner convention or a third-party study guide; plausible, not authoritative.
- **[!]**: unverified, conflicting, or a theory rather than evidence.

---

## 1. Definition and goal

- CrossFit defines its method as "constantly varied functional movements performed at high intensity". Its stated aim is broad, general work capacity across **time domains** and **modal domains** [V: CrossFit essays "Constantly Varied Programming", "Variance is Good", "Defining CrossFit, Part 3"; K: L1 guide].
- **Varied is not random.** CrossFit's own essay says it explicitly [V]. Variance covers movement, load, time domain/workout length, reps, rest and metabolic pathway [V: 2003 template reprint summary]. "Routine is the enemy" is the slogan [V].
- **Intensity is relative.** The same workout serves very different people, who differ "in degree, not kind", so the load and volume are scaled while the intended stimulus is kept [K: L1 guide; V: CrossFit scaling articles].

## 2. Theoretical hierarchy of development

- Nutrition at the base, then metabolic conditioning (monostructural "cardio"), gymnastics (body control and range), weightlifting and throwing (controlling external objects, power), and sport at the top [V: CrossFit essay "Theoretical Hierarchy of Development", from the 2002 "What Is Fitness?"].
- The order reflects foundational dependence, skill, and loosely the order in which to develop [V]. CrossFit itself frames it as a diagnostic tool [V, L3 study guide]. It is a teaching model, not a tested theory; some coaches critique its labels [!].
- **App mapping:** already implicit. Nutrition basics are in scope for chat; aerobic and anaerobic capacity are built first (the newcomer ramp); bodyweight skills are gated before kipping and Olympic lifts under fatigue (skill gates).

## 3. The modal template and the day types

- **Three modalities:** M = monostructural/metabolic conditioning (run, row, bike, ski, rope), G = gymnastics (bodyweight), W = weightlifting (external loads, including kettlebells, medicine balls and odd objects) [K; V, L1 study-guide summaries].
- **Three day types** [V: 2003 template reprint's "workout structure" table headings; K for the detail]:
  - **Single-element days:** one modality, with the element itself as the priority. M is typically a longer, steady effort, G a single skill practised at high quality, W a single lift worked heavy at low reps.
  - **Two-element days (couplets):** usually 2 movements alternated for 3-5 rounds for time, at high intensity. These are **task priority**: fixed work, and the score is time.
  - **Three-element days (triplets):** 3 movements repeated for a fixed time (about 20 minutes in the original) at moderate, sustainable loads. These are **time priority**: fixed clock, and the score is rounds.
- **Rotation:** the template spreads M, G and W across single, couplet and triplet days in a repeating cycle (described as 12 days for the 3-on/1-off version), so each element leads in turn [V, study guide; exact sequence P]. One study guide gives the order as M/G/W singles, then MG/MW/GW pairs, then MGW. I could not check that against the original table, so I treat the exact sequence as **[P]**.
- **Most daily workouts are couplets and triplets** [P: coaching write-ups; the original article favours them, not re-read]. The search did not confirm a specific share or a "10-20 min" norm [!].
- **Why it works (mechanism, my synthesis):**
  - Rotating which element leads stops one tissue, pattern or energy system being trained hard every day.
  - Couplets let the intensity go high because few movements dilute it.
  - Triplets spread fatigue so a longer, moderate effort is possible.
  - Single-element days give space for skill and heavy loading that would degrade under metabolic fatigue.

## 4. Rest cycle

- The original rhythm is **3 days on, 1 day off**. Glassman noted its drawback: it doesn't line up with a 5-day working week, so **5 on, 2 off** variants exist (study-guide figures: about 75% vs 71% training days) [V: template reprint summary, study guide, affiliate posts].
- Affiliates explain the rest day as part of the design: athletes can push the third day hard because recovery comes next [V, affiliate blog].
- A third-party L3 guide flags people training 6 days a week on 3-on/1-off as at risk of non-functional overreaching [P].
- **App mapping:** the app already has a stricter hard/easy budget (≤2-4 hard days, never 3 hard in a row, alternate H with M/E). I map the rest cycle onto those rules instead of adding a second layer.

## 5. Time domains and loading

- **Pathway time domains:** phosphagen (about 10 s), glycolytic (to about 2 min), oxidative (>2 min) [P, L1 study guide; K]. Workouts vary across short, medium and long efforts, and workout length is explicitly part of variance [V].
- **Heavy days:** CrossFit's own essay argues heavy days are needed for everyone. A true heavy day uses small sets (about 1-5 reps) and roughly 7-25 total working reps [V: CrossFit "Heavy Days"].
- **App mapping:** the app's strength days already cover heavy work. In metcons the lesson is to vary the loading: mostly light and fast, now and then a short, heavier couplet, placed so it doesn't fight that week's heavy strength days.

## 6. Daily page structure: stimulus and scaling

- Modern mainsite posts typically pair the workout with notes on **stimulus and strategy** (how it should feel, the target time or pacing), **scaling** guidance, and separate **intermediate** and **beginner** versions. Some posts say intermediates can do it as written; others reduce box height or dumbbell load. Beginner versions reduce load or reps or change the implement [V: search summaries of several crossfit.com/workout pages; the exact headings vary by era].
- CrossFit's professional-training material on scaling: fit the athlete's current level **while preserving the intended stimulus**. Feel, loading, timing, volume and movement pattern all matter to that, and many intermediates need scaling to hit the stimulus [V].
- **Why it works:** writing the intent down turns scaling from "make it easier" into "keep it the same workout". If the Rx version would take a newcomer three times as long, it no longer trains what it was meant to. The stimulus line also gives the athlete a self-check mid-workout.
- **App mapping:** each conditioning block's `notes` states the stimulus (≤100 chars, new COND_NO_STIMULUS warning). `scaling` says what to change and the target it protects. The chat coach explains a metcon's intent and scales it on request.

## 7. Avoiding repeated patterns

- Variance is planned across days: modality, movements, time domain, load and rep scheme all change, and the template's rotation means an element rarely leads twice in a row [V, variance essays; P, coaching write-ups on "constant variance, not randomness"].
- The L3 material frames this as auditing programming over weeks for gaps and overemphasis [P, third-party guide].
- **App mapping:** new validatePlan warnings:
  - **COND_REPEAT:** consecutive metcons with the same format and the same dominant M/G/W element.
  - **COND_TIME_DOMAIN:** two or more metcons in a week, all in one time domain.
  - In PLAN_RULES: vs the previous plan, change at least one of format, time domain or leading element per metcon slot.

## 8. Benchmarks and retesting

- **The Girls** (Fran, Grace, Helen, Cindy and others) and **Hero workouts** (named for fallen service members and first responders) are fixed workouts reposted over time. They give a common language and a way to measure progress [V: CrossFit "15 Benchmarks" article, barbend/Morning Chalk Up history, vendor and affiliate posts].
- **Retesting has been "core to the methodology"** [V: CrossFit essay]. Mainsite posts often say to compare against an earlier date [K].
- **How often:** coaches suggest a repeat or benchmark every 1-2 weeks somewhere in a program [P: CrossFit "Ask a Coach"]. Retesting any one benchmark every 3-6 months is a common convention [P].
- **Different benchmarks test different things:** Fran and Grace are short and glycolytic, Cindy is longer bodyweight endurance [V, plus a physiology-predictor study, OAJSM 2015]. Normative data exist for Fran, Grace, Helen, Filthy Fifty and Fight Gone Bad (Sports Med Open 2018, self-reported) [V].
- Repeating Open workouts improved scores in 7 of 9 [V: medRxiv preprint 2023, not peer reviewed].
- **App mapping:** every 6-12 weeks, outside the newcomer ramp, repeat a logged metcon exactly (same movements, loads, standards and cap), noted "Benchmark: beat <last score>". Benchmarks are built from the owner's equipment; we use the *shape* of a named benchmark rather than a named workout their kit can't do.

## 9. Warm-ups

- The L1 approach: a general warm-up (raise heart rate, mobility), then a specific warm-up that rehearses the day's movements at light load and builds toward working intensity [K].
- **App mapping:** PLAN_RULES §7 already does this (raise → movement prep → 1-2 build-ups). No change.

## 10. What I deliberately did not adopt

- **"Rx" as a default.** Mainsite loads and high-skill gymnastics are for experienced athletes. The app keeps its scaling ladder, skill gates and newcomer ramp (rhabdomyolysis risk is highest with unaccustomed volume).
- **5-6 high-intensity days a week** for an owner who also lifts and runs. The hard/easy budget wins.
- **Copying named workouts.** Short named references are fine in prose, but generated plans build their own metcons from the owner's equipment.
- **A strict 12-day M/G/W sequence.** Not verified, and the app plans weekly rotations with strength and running days in between. Only the principle (rotate which element leads) is encoded.

## 11. Changes made in the app (summary)

- `references/conditioning.md`:
  - §1: "varied ≠ random" and a written-stimulus principle.
  - §3: loading variety and how INTERVALS map to time domains.
  - §6: tiered scaling that keeps the stimulus.
  - §11: benchmark construction.
  - New §12: the modal template, the weekly rotation rules, the rest cycle, the hierarchy, and what not to adopt.
- `app/src/knowledge/plan.js` (PLAN_RULES): tightened elsewhere to make room for the new §5.9 "Weekly metcon design" (stimulus note, deliberate variety within the week and vs last week, M/G/W rotation, light vs heavy loading, stimulus-preserving scaling, benchmark retests, rest rhythm), plus matching §8 and §9 lines. Stays ≤40 KiB.
- `app/src/knowledge/chat.js` (CHAT_RULES): the coach explains a metcon's intent, scales it to keep the stimulus with the owner's equipment, and retests benchmarks exactly. Stays ≤14 KiB.
- `app/src/prompts/plan.js`: the conditioning `notes` field in the JSON spec is now "the intended stimulus".
- `app/src/core.js` validatePlan: new warnings COND_NO_STIMULUS, COND_REPEAT and COND_TIME_DOMAIN (warnings only).
  - M/G/W: cardio pattern = M; loaded equipment = W; otherwise G.
  - Time domains: sprint ≤5, short ≤10, medium ≤20, long >20 min. INTERVALS use the work bout, TABATA counts as sprint, and capped formats use the cap.
- `app/src/catalog.js`: added step_back_burpee, burpee_broad_jump, lateral_burpee_over_dumbbell, dumbbell_man_maker and box_pike_push_up (an HSPU progression). The other commonly needed ids already existed.

## Sources

CrossFit (primary; reached via search summaries only):
- [A Theoretical Template for CrossFit's Programming](https://games.crossfit.com/article/theoretical-template-crossfits-programming), with the CrossFit Journal reprint [06_03_CF_Template.pdf](https://library.crossfit.com/free/pdf/06_03_CF_Template.pdf)
- [Theoretical Hierarchy of Development](https://www.crossfit.com/essentials/theoretical-hierarchy-of-development)
- [Constantly Varied Programming](https://www.crossfit.com/essentials/constantly-varied-programming)
- [Variance is Good](https://crossfit.com/essentials/variance-crossfit-good)
- [Defining CrossFit, Part 3: Variance](https://crossfit.com/essentials/defining-crossfit-part-3-variance)
- [What is a CrossFit Workout?](https://www.crossfit.com/essentials/what-is-a-crossfit-workout)
- [Heavy Days](https://crossfit.com/essentials/heavy-days)
- [Professional Training: Scaling, Part 2](https://crossfit.com/essentials/professional-training-scaling-part-2)
- [Scaling for intermediate athletes](https://www.crossfit.com/pro-coach/crossfit-scaling-intermediate-athletes)
- [Programming Basics Part 1](https://crossfit.com/pro-coach/programming-basics-part-1) and [Part 2](https://crossfit.com/pro-coach/programming-basics-part-2)
- [15 Benchmark Workouts](https://www.crossfit.com/essentials/crossfit-15-benchmarks)
- [The Picture of Progress](https://crossfit.com/essentials/progress-over-perfection)
- [Ask a Coach: test/retest workouts](https://www.crossfit.com/pro-coach/ask-a-coach-test-retest-workouts)
- Workout archive pages, e.g. [2024/01](https://www.crossfit.com/workout/2024/01) and [2024/07/02](https://www.crossfit.com/workout/2024/07/02)

Secondary:
- [open-exam-prep: L1 §9.1, MGW template](https://open-exam-prep.com/study-guides/crossfit-l1/programming-design/programming-mgw) and [L3 §2.3, sequencing for GPP](https://open-exam-prep.com/study-guides/crossfit-l3/programming-design/programming-gpp-sequencing) [P]
- [CrossFit Roots: Three On One Off](https://crossfitroots.com/?p=7642) [P]
- [Box Life: couplets and triplets](https://boxlifemagazine.com/why-the-majority-of-your-workouts-should-be-couplets-and-triplets/) [P]
- [Breaking Muscle: constant variance, not randomness](https://breakingmuscle.com/how-to-create-constant-variance-and-not-randomness-at-your-crossfit-box/) [P]
- [BarBend: "Girls" at the Games](https://barbend.com/?p=244790)

Research:
- [Mangine et al. 2018, Sports Med Open: normative values for CrossFit benchmarks](https://sportsmedicine-open.springeropen.com/articles/10.1186/s40798-018-0156-x)
- [Butcher et al. 2015, OAJSM: physiological predictors of benchmark performance](https://pmc.ncbi.nlm.nih.gov/articles/PMC4527742)
- [medRxiv 2023: repeated Open workouts](https://medrxiv.org/content/10.1101/2023.03.22.23287575v1) (preprint)
