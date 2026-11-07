# Data Format

All data lives in the data home: `$FITNESS_HOME`, defaulting to `~/fitness-coach/`. Files are plain text so the user can read, edit, back up or version them. Dates are always ISO (`YYYY-MM-DD`).

**Ground rules:**
- **CSV logs are append-only.** To correct a mistake, append a corrected row and add a note (`corrects 2026-11-02 set 3`). If the user explicitly asks, edit the CSV in place, after showing them the row. Never fabricate or "fill in" rows the user didn't report.
- **Markdown files** (`profile.md`, `plan.md`) are edited in place. Each meaningful change gets an entry in `decisions.md`.
- **Prefer `trainer.py`** for writing CSV rows, so the format stays valid. If you write rows by hand, follow the headers below exactly.

## File tree
```
~/fitness-coach/
├── profile.md          # assets/profile-template.md
├── plan.md             # assets/plan-template.md: the ONE active plan
├── decisions.md        # newest-first changelog
├── sets.csv
├── sessions.csv
├── body.csv
├── exercises.csv       # optional muscle map additions
├── checkins/2026-11-04.md
└── archive/plan-v1-2026-09-01.md
```

## sets.csv: one row per set
```
date,session,exercise,set,type,load,unit,reps,rir,notes
2026-11-02,W3-D1,Bench Press,1,warmup,40,kg,10,,
2026-11-02,W3-D1,Bench Press,2,work,82.5,kg,8,2,
2026-11-02,W3-D1,Bench Press,3,work,82.5,kg,8,1,
2026-11-02,W3-D1,Pull Up,1,work,bw+10,kg,6,2,
2026-11-02,W3-D1,Plank,1,work,bw,kg,45,,reps column = seconds for holds
```

| Field | Meaning |
|---|---|
| `session` | The plan day id (`W3-D1`, `Upper A`) or empty |
| `exercise` | A consistent display name; trends group by name (case- and punctuation-insensitive), so keep names stable |
| `type` | `warmup` (excluded from volume and e1RM), `work`, `top`, `backoff`, `amrap`, `drop` |
| `load` | A number, or `bw` / `bw+10` / `bw-20` (assisted). e1RM is computed only for numeric loads |
| `rir` | Reps in reserve, 0-5. RPE ≈ 10 − RIR. Leave empty if unknown |

`trainer.py log` syntax: `LOADxREPS[@RIR][*N]`, for example `100x5@2*3` (3 sets), `bw+10x6@1`, or `60x12`.

## sessions.csv: one row per session (or missed session)
```
date,session,status,duration_min,readiness,srpe,reason,notes
2026-11-02,W3-D1,done,62,4,8,,felt strong
2026-11-04,W3-D2,missed,,,,travel,work trip
2026-11-06,W3-D3,partial,30,2,6,time,main lifts only
```
- `status`: done, partial or missed.
- `readiness`: 1-5, before the session. `srpe`: session RPE 1-10, after the session.
- `reason` (for missed or partial): travel, time, sick, pain, motivation or other.

## body.csv
```
date,weight,unit,waist_cm,notes
2026-11-04,81.4,kg,84,morning fasted
```
Weigh under the same conditions each time (morning, after the bathroom, before eating). Read the 7-day average, never a single day.

## exercises.csv (optional)
```
exercise,pattern,primary,secondary
Zercher Squat,squat,quads;glutes,upper back;abs
```
Separate multiple muscles with semicolons. This file overrides the built-in map.

## decisions.md entry
```
## 2026-11-04: Bench: hold load, deload next week
- What: Bench stays at 82.5 kg; week 5 becomes a deload (sets −50%, RIR 3-4).
- Why: e1RM down 7% over 2 sessions at higher RPE; readiness 2/5; sleep ~6 h (check-in).
- Watch: bench e1RM back to ≥115 by W6-D1; sleep ≥7 h.
```

## Plan prescriptions
Every exercise row in `plan.md` needs: exercise | sets × reps (or range) | target RIR and/or load | rest | progression rule | alternatives. A client should be able to run it without asking a question.
