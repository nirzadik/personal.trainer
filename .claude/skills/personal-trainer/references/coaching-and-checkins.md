# Coaching Craft: Intake, Check-ins & Adherence

The best program is the one the client actually follows. Long-term adherence comes from **autonomy** (they chose it), **competence** (they can see progress), and **relatedness** (the coach remembers them and cares). This is self-determination theory, and in exercise studies these needs predict persistence better than guilt or pressure do.

## Contents
1. Full intake questionnaire (fill over time)
2. Weekly check-in
3. Motivational interviewing toolkit
4. Habits and adherence troubleshooting
5. Stages of change
6. Goal setting

---

## 1. Full intake questionnaire

Collect the **minimum viable intake** first (see SKILL.md, Mode 1), then fill the rest of this over the first 1-2 check-ins. Long forms kill completion.

| Section | Questions |
|---|---|
| **Goals** | Primary goal and any secondary goals. Why does it matter *now*? Target date or event. What does success look like in 12 weeks? |
| **Training history** | Years of consistent training. Current routine. Known bests or working weights (e.g. 5RM squat). Technique confidence on the main lifts (1-5). Programs that worked or failed, and why. Longest consistent stretch. |
| **Schedule** | Days per week they can realistically train. Minutes per session. Preferred days and times. Travel, shifts, seasonal disruptions. |
| **Equipment** | Gym type (commercial, home, hotel, none). Inventory: barbell, rack, bench, dumbbells (max weight, increments), cables, machines, bands, pull-up bar, kettlebells, cardio equipment. |
| **Health** | PAR-Q+ items. Current pain (where, 0-10, what aggravates it). Past injuries and surgeries. Medications that affect exercise. Any restrictions from a clinician. |
| **Lifestyle** | Sleep (hours, quality). Stress (1-10). Job activity and daily steps. Other sports. Alcohol. Their nutrition approach, and whether they want nutrition guidance. |
| **Preferences** | Exercises they love or hate. Structured or flexible approach. Session feel (fast and dense, or relaxed). Coaching tone (direct or encouraging). How much they'll log. Units (kg/lb). |
| **Baselines (optional)** | Bodyweight, waist, photos (kept by them). Simple tests: push-ups to near failure, a rep max on the main lifts at about RIR 1-2 (not a true 1RM), plank time, a 1-mile walk or run time. |

Store their **"why" in their own words** in `profile.md`. When motivation dips, quote it back to them.

## 2. Weekly check-in

**When:** weekly on a fixed day, or when ≥7 days and ≥3 sessions have passed since the last check-in (`trainer.py status` shows this). It should take the client under 2 minutes; completion drops sharply after about 10 questions.

**Ask** in 1-2 messages, and let them answer in shorthand:
1. Sessions done vs planned
2. How training felt this week (1-10)
3. Energy · sleep (hours, quality) · stress (each 1-10)
4. Soreness/recovery (1-10). Any pain: where, 0-10, during and next morning?
5. Bodyweight 7-day average (if tracking), and waist
6. Nutrition on track? (only if it's in scope for them)
7. Win of the week
8. What got in the way?
9. One thing *they* want to focus on next week
10. Schedule changes coming up?

Ask conditional follow-ups only when needed. For example, low energy → ask about sleep, food and stress. Pain → run the pain protocol.

**Read for trends, not single weeks.** One bad week is life. Falling energy for three weeks with steady sleep is a signal about training load.

**Respond (OARS structure):**
1. **Reflect and summarize** what they said: "So: 3 of 4 sessions despite a brutal work week, sleep down to 6 hours, and the squat felt heavy on Thursday."
2. **Affirm** something specific: effort, consistency, or honest logging.
3. **Data:** adherence, PRs, e1RM trends, sets per muscle, weight trend. Keep it short and visual (a small table).
4. **Adjust 1-2 things max**, with the reason and a choice: "Two options: keep 4 days but cap each at 45 min, or go to 3 slightly longer sessions. I'd lean toward 3. Which fits better?"
5. **Confirm** next week's plan. Save `checkins/YYYY-MM-DD.md`, and update `plan.md` and `decisions.md` if anything changed.

**Block review (every 4-6 weeks):**
- Look at e1RM trends for the main lifts, sets per muscle vs target, bodyweight vs the goal rate, and enjoyment.
- Decide whether to continue, progress, or start a new block. Archive the old `plan.md` to `archive/`.
- Every ~12 weeks: revisit the goal itself.

**Optional per-session readiness:** before the session, readiness 1-5 (or sleep, stress and soreness each 1-5). After, session RPE 1-10 (Foster). Session load = sRPE × minutes. Watch for spikes, and for readiness that stays low.

## 3. Motivational interviewing toolkit

The spirit is partnership, acceptance, compassion and evocation. You draw out *their* reasons rather than installing yours.

- **Open questions:** "What would make training feel worth it for you?" "What got in the way this week?"
- **Affirmations:** "Three sessions in a week like that takes real commitment."
- **Reflections:**
  - Simple: repeat back what they said.
  - Complex: add the meaning underneath. "You want to get stronger, and you're also worried your back will flare up again."
- **Summaries:** collect the key points, then ask "What did I miss?"
- **Change talk** (Desire, Ability, Reasons, Need, Commitment, Activation, Taking steps): notice it and reflect it back. When they push back, don't argue. Arguing hardens resistance (the "righting reflex"). Roll with it, and explore their ambivalence.
- **Confidence ruler:** "On 0-10, how confident are you that you'll get 3 sessions in this week?" Then: "Why a 6 and not a 3?" (this draws out their strengths) and "What would make it a 7?"
- **Elicit-Provide-Elicit:** "What do you know about deloads?" → share info with permission → "How does that fit how you've been feeling?"
- **Pacing:** jumping to planning too early gets compliance without commitment. When they're ambivalent, explore first, then plan.

**Autonomy-supportive language:**
- Use "you could…", "one option is…", "what do you think about…" rather than "you must", "you should have".
- Give the reason behind every prescription: "We keep 2 reps in reserve so you can add weight next week without grinding."
- Offer real choices: exercise A or B for this slot, 3 or 4 days.
- Acknowledge feelings: "That sounds frustrating."
- Let them choose their weekly focus.

## 4. Habits & adherence troubleshooting

**Facts worth sharing:**
- On average, habits take about 66 days to become automatic (range 18-254), and exercise habits closer to about 90 (Lally 2010).
- **Missing one day doesn't reset the habit.** The norm is "never miss twice".
- If-then plans roughly double follow-through (implementation intentions, d≈0.65): "Mon/Wed/Fri at 7:00, after dropping the kids off, I drive straight to the gym."

**Levers:**
- **A stable cue:** same time, same place.
- **A minimum viable session:** "If you only have 20 minutes, do the A-block, main lift + 1 accessory." Write it into the plan.
- **Lower friction:** pack the bag the night before; keep a home or hotel version of the plan.
- **Make progress visible:** PRs, trend tables, streaks (without shaming).
- **Plan for obstacles ahead:** travel, exams, holidays.

**When adherence drops** (below about 80%, or a pattern of missed sessions):
1. Get curious, not judgmental: "What's been getting in the way?" Treat missed sessions as data.
2. **Fix the fit before the content.** Try fewer or shorter sessions, a different time of day, more enjoyable exercises, or a home option. Keep weekly hard sets roughly constant by redistributing them.
3. Program to their *demonstrated* attendance plus one day at most.
4. Never "make up" missed sessions by stacking them. Shift the week forward instead.
5. Look at the reason tags: travel → a travel template; time → minimum sessions; pain → the pain protocol; motivation → revisit their "why" and their enjoyment.

**Competence boosts:**
- Early, achievable wins in week 1-2 (calibration week, technique PRs).
- Specific positive feedback.
- Point out rep PRs, not just load PRs: "That's 2 more reps than 3 weeks ago at the same weight."

**Relatedness:**
- Remember details: their kid's name, the race they signed up for, last week's tough day.
- Follow up on what they told you.

## 5. Stages of change (transtheoretical model)

Match your approach to their readiness:
- **Precontemplation** (not considering change): raise awareness gently and respectfully. Don't push a plan.
- **Contemplation** (ambivalent): explore their pros and cons using MI. Build their confidence.
- **Preparation** (planning to start soon): co-create a small, specific plan with if-then cues.
- **Action** (<6 months of training): reinforce wins, solve problems with them, prevent relapse.
- **Maintenance** (>6 months): keep it fresh with new goals, variety and periodic tests. Plan ahead for disruptions.
- **Relapse** is normal. Treat it as learning, then restart with a smaller dose.

## 6. Goal setting

- **Outcome goals** (e.g. "squat 100 kg", "lose 5 kg") give direction. **Process goals** (e.g. "3 sessions/week", "protein at every meal", "8k steps/day") are what they control. Coach mainly on process goals.
- **SMART:** specific, measurable, achievable, relevant, time-bound. "Bench 80 kg × 5 by 1 March" beats "get stronger".
- **Building self-efficacy:** mastery experiences matter most (graded early wins). Then seeing others similar to them succeed, then encouragement, then managing emotions and arousal.
- Prefer performance and behavior goals over appearance-only goals, especially for people with a history of dieting or body-image concerns.
