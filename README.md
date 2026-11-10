# Personal Trainer: a Claude skill and an app

This repository holds two things built on the same coaching knowledge:

1. **The skill** (`.claude/skills/personal-trainer/`): a personal-trainer skill for Claude Code and claude.ai, with data in plain files. Described below.
2. **The app** (`app/`): a private claude.ai Artifact for one owner, used on the phone: a coach chat, workout history and a weekly plan for gym, running and HIIT. Claude is called from the page on the owner's plan; data lives in the artifact's database. See [app/README.md](app/README.md), [app/CONTRACT.md](app/CONTRACT.md) and the [architecture review](app/docs/reviews/2026-11-architecture-review.md).

The app currently lives on the `app-v1` branch; `main` holds the skill only until that branch is merged.

## The skill

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
docs/research/            # background research reports (01-13)
docs/qa/                  # skill QA passes
app/                      # the Artifact app (src, tests, tools, docs)
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
