# Personal Trainer: a Claude skill

An evidence-based personal-trainer skill for Claude. You and Claude design a training program together. Claude saves the program to plain files, logs your workouts, and adapts the plan over time, the way a certified coach would.

## What it does
- **Onboarding.** Runs a PAR-Q+ style safety screen, then sets goals and asks about schedule, equipment, injuries and preferences. It only asks for what it needs to start.
- **Co-designed plan.** Offers 2-3 split options with a recommendation. Every exercise is written as sets × reps, effort (RIR), rest, progression rule and alternatives.
- **Workout logging.** Tracks e1RM, PRs, weekly hard sets per muscle and adherence, using a small Python tool so Claude never does the math in its head.
- **Weekly check-ins.** Applies decision rules for progression, stalls, deloads and bodyweight trends.
- **Safety and scope.** Covers red flags, a pain traffic light, special populations and referral. It never diagnoses.

The knowledge comes from ACSM, NSCA, NASM and ACE frameworks and from 2017-2025 meta-analyses. See `docs/research/` for the research notes behind the skill.

## Repository layout
```
.claude/skills/personal-trainer/
├── SKILL.md              # workflow, core rules, decision tables
├── references/           # loaded on demand: safety, programming, exercises, coaching, data format
├── scripts/trainer.py    # logging + calculations (Python 3, stdlib only)
└── assets/               # templates: profile, plan, check-in, decisions
docs/research/            # the five background research reports
```

## Install
- **Claude Code (this repo):** open the repo in Claude Code. Project skills in `.claude/skills/` load automatically.
- **Claude Code (all projects):** copy `.claude/skills/personal-trainer` to `~/.claude/skills/`.
- **claude.ai:** zip the `personal-trainer` folder (or package it as a `.skill` file) and upload it under Settings → Capabilities → Skills.

## Use
Just talk to Claude: *"Let's build a training plan together"*, *"Log today: squat 100x5,5,5 @2"*, *"What do I do today?"*, *"Weekly check-in"*.

Your data lives in `~/fitness-coach/`, or in `$FITNESS_HOME` if you set it. It stays outside this repo, and you shouldn't commit personal health data to it.

## The tracker script
```bash
python3 .claude/skills/personal-trainer/scripts/trainer.py --help
# init · status · log · session · body · e1rm · next · pct · plan-volume · report
```

## Disclaimer
This skill provides general fitness coaching. It is not medical advice, and it recommends professional assessment when something calls for it.
