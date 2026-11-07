#!/usr/bin/env python3
"""trainer.py - logging and calculation engine for the personal-trainer skill.

Standard library only. Data lives in $FITNESS_HOME or ~/fitness-coach (override with --home).

Commands:
  init      create the data folder from templates (never overwrites)
  status    date anchoring: today, recent sessions with days-ago, check-in due?
  log       append sets for one exercise:  log "Bench Press" 80x8@2 80x8@2 80x7@1
  session   append a session row (done / partial / missed)
  body      append a bodyweight entry
  e1rm      estimated 1RM calculator (Epley, RIR-adjusted)
  plan-volume  planned weekly sets per muscle and session minutes from plan.md
  pct       percentage loads rounded to available plates/dumbbells
  next      next-session target for an exercise (double or linear progression)
  report    adherence, e1RM trends, stall/fatigue flags, PRs, weekly sets per muscle, bodyweight trend
"""
from __future__ import annotations

import argparse
import csv
import datetime as dt
import os
import re
import shutil
import signal
import sys
from collections import defaultdict
from pathlib import Path

SKILL_DIR = Path(__file__).resolve().parent.parent
ASSETS = SKILL_DIR / "assets"

SETS_HEADER = ["date", "session", "exercise", "set", "type", "load", "unit", "reps", "rir", "notes"]
SESSIONS_HEADER = ["date", "session", "status", "duration_min", "readiness", "srpe", "reason", "notes"]
BODY_HEADER = ["date", "weight", "unit", "waist_cm", "notes"]
EXERCISES_HEADER = ["exercise", "pattern", "primary", "secondary"]

# Built-in muscle map: exercise (lowercase) -> (pattern, primary muscles, secondary muscles).
# Users can extend/override with exercises.csv in their data folder.
MUSCLE_MAP = {
    # squat pattern
    "back squat": ("squat", "quads;glutes", "adductors;lower back"),
    "squat": ("squat", "quads;glutes", "adductors;lower back"),
    "front squat": ("squat", "quads", "glutes;upper back"),
    "safety bar squat": ("squat", "quads;glutes", "upper back"),
    "goblet squat": ("squat", "quads", "glutes"),
    "hack squat": ("squat", "quads", "glutes"),
    "leg press": ("squat", "quads", "glutes"),
    "smith squat": ("squat", "quads", "glutes"),
    "box squat": ("squat", "quads;glutes", "adductors"),
    "belt squat": ("squat", "quads", "glutes"),
    # hinge
    "deadlift": ("hinge", "glutes;hamstrings;lower back", "quads;upper back;forearms"),
    "conventional deadlift": ("hinge", "glutes;hamstrings;lower back", "quads;upper back;forearms"),
    "sumo deadlift": ("hinge", "glutes;adductors", "quads;hamstrings;lower back"),
    "trap bar deadlift": ("hinge", "glutes;quads", "hamstrings;lower back;upper back"),
    "romanian deadlift": ("hinge", "hamstrings;glutes", "lower back"),
    "rdl": ("hinge", "hamstrings;glutes", "lower back"),
    "stiff leg deadlift": ("hinge", "hamstrings", "glutes;lower back"),
    "good morning": ("hinge", "hamstrings;lower back", "glutes"),
    "hip thrust": ("hinge", "glutes", "hamstrings"),
    "glute bridge": ("hinge", "glutes", "hamstrings"),
    "kettlebell swing": ("hinge", "glutes;hamstrings", "lower back"),
    "back extension": ("hinge", "lower back;glutes", "hamstrings"),
    "single leg rdl": ("hinge", "hamstrings;glutes", ""),
    # single leg
    "bulgarian split squat": ("lunge", "quads;glutes", "adductors"),
    "split squat": ("lunge", "quads;glutes", "adductors"),
    "reverse lunge": ("lunge", "quads;glutes", "adductors"),
    "walking lunge": ("lunge", "quads;glutes", "adductors"),
    "lunge": ("lunge", "quads;glutes", "adductors"),
    "step up": ("lunge", "quads;glutes", ""),
    # horizontal push
    "bench press": ("horizontal push", "chest", "triceps;front delts"),
    "barbell bench press": ("horizontal push", "chest", "triceps;front delts"),
    "dumbbell bench press": ("horizontal push", "chest", "triceps;front delts"),
    "incline bench press": ("horizontal push", "chest;front delts", "triceps"),
    "incline dumbbell press": ("horizontal push", "chest;front delts", "triceps"),
    "close grip bench press": ("horizontal push", "triceps;chest", "front delts"),
    "machine chest press": ("horizontal push", "chest", "triceps;front delts"),
    "floor press": ("horizontal push", "chest;triceps", "front delts"),
    "push up": ("horizontal push", "chest", "triceps;front delts"),
    "dip": ("horizontal push", "chest;triceps", "front delts"),
    "dips": ("horizontal push", "chest;triceps", "front delts"),
    # vertical push
    "overhead press": ("vertical push", "front delts", "triceps;side delts"),
    "ohp": ("vertical push", "front delts", "triceps;side delts"),
    "dumbbell shoulder press": ("vertical push", "front delts", "triceps;side delts"),
    "machine shoulder press": ("vertical push", "front delts", "triceps;side delts"),
    "landmine press": ("vertical push", "front delts;chest", "triceps"),
    # horizontal pull
    "barbell row": ("horizontal pull", "upper back;lats", "biceps;rear delts;lower back"),
    "bent over row": ("horizontal pull", "upper back;lats", "biceps;rear delts;lower back"),
    "dumbbell row": ("horizontal pull", "lats;upper back", "biceps;rear delts"),
    "chest supported row": ("horizontal pull", "upper back;lats", "biceps;rear delts"),
    "seated cable row": ("horizontal pull", "upper back;lats", "biceps;rear delts"),
    "cable row": ("horizontal pull", "upper back;lats", "biceps;rear delts"),
    "seal row": ("horizontal pull", "upper back;lats", "biceps;rear delts"),
    "inverted row": ("horizontal pull", "upper back;lats", "biceps;rear delts"),
    "t bar row": ("horizontal pull", "upper back;lats", "biceps;rear delts"),
    # vertical pull
    "pull up": ("vertical pull", "lats", "biceps;upper back"),
    "chin up": ("vertical pull", "lats;biceps", "upper back"),
    "lat pulldown": ("vertical pull", "lats", "biceps;upper back"),
    "assisted pull up": ("vertical pull", "lats", "biceps;upper back"),
    # isolation
    "lateral raise": ("isolation", "side delts", ""),
    "cable lateral raise": ("isolation", "side delts", ""),
    "rear delt fly": ("isolation", "rear delts", "upper back"),
    "face pull": ("isolation", "rear delts;upper back", ""),
    "chest fly": ("isolation", "chest", ""),
    "cable fly": ("isolation", "chest", ""),
    "pec deck": ("isolation", "chest", ""),
    "bicep curl": ("isolation", "biceps", "forearms"),
    "biceps curl": ("isolation", "biceps", "forearms"),
    "dumbbell curl": ("isolation", "biceps", "forearms"),
    "barbell curl": ("isolation", "biceps", "forearms"),
    "incline curl": ("isolation", "biceps", ""),
    "hammer curl": ("isolation", "biceps;forearms", ""),
    "triceps pushdown": ("isolation", "triceps", ""),
    "tricep pushdown": ("isolation", "triceps", ""),
    "overhead triceps extension": ("isolation", "triceps", ""),
    "skull crusher": ("isolation", "triceps", ""),
    "leg extension": ("isolation", "quads", ""),
    "leg curl": ("isolation", "hamstrings", ""),
    "seated leg curl": ("isolation", "hamstrings", ""),
    "lying leg curl": ("isolation", "hamstrings", ""),
    "nordic curl": ("isolation", "hamstrings", ""),
    "calf raise": ("isolation", "calves", ""),
    "standing calf raise": ("isolation", "calves", ""),
    "seated calf raise": ("isolation", "calves", ""),
    "hip abduction": ("isolation", "glutes", ""),
    "adductor machine": ("isolation", "adductors", ""),
    "shrug": ("isolation", "upper back", ""),
    # core / carry
    "plank": ("core", "abs", ""),
    "side plank": ("core", "abs", ""),
    "ab wheel": ("core", "abs", ""),
    "hanging leg raise": ("core", "abs", "forearms"),
    "cable crunch": ("core", "abs", ""),
    "dead bug": ("core", "abs", ""),
    "pallof press": ("core", "abs", ""),
    "farmer carry": ("carry", "forearms;upper back", "abs"),
    "farmers carry": ("carry", "forearms;upper back", "abs"),
    "suitcase carry": ("carry", "abs;forearms", ""),
}

SET_TOKEN = re.compile(
    r"^(?P<load>bw(?:[+-]\d+(?:\.\d+)?)?|\d+(?:\.\d+)?)x(?P<reps>\d+)(?:@(?P<rir>\d+(?:\.\d+)?))?(?:\*(?P<mult>\d+))?$",
    re.IGNORECASE,
)


# ---------------------------------------------------------------- helpers
def home_dir(args) -> Path:
    h = getattr(args, "home", None) or os.environ.get("FITNESS_HOME") or "~/fitness-coach"
    return Path(h).expanduser().resolve()


def norm(name: str) -> str:
    n = name.strip().lower().replace("-", " ").replace("_", " ")
    n = re.sub(r"[^a-z0-9 ]", "", n)
    return re.sub(r"\s+", " ", n)


def parse_date(s: str | None) -> dt.date:
    if not s:
        return dt.date.today()
    s = s.strip().lower()
    if s == "today":
        return dt.date.today()
    if s == "yesterday":
        return dt.date.today() - dt.timedelta(days=1)
    return dt.date.fromisoformat(s)


def ensure_csv(path: Path, header: list[str]) -> None:
    if not path.exists():
        path.parent.mkdir(parents=True, exist_ok=True)
        with path.open("w", newline="") as f:
            csv.writer(f).writerow(header)


def append_rows(path: Path, header: list[str], rows: list[dict]) -> None:
    ensure_csv(path, header)
    with path.open("a", newline="") as f:
        w = csv.DictWriter(f, fieldnames=header, extrasaction="ignore")
        for r in rows:
            w.writerow(r)


def read_rows(path: Path) -> list[dict]:
    if not path.exists():
        return []
    with path.open(newline="") as f:
        return [r for r in csv.DictReader(f) if any((v or "").strip() for v in r.values())]


def fnum(x) -> float | None:
    try:
        return float(x)
    except (TypeError, ValueError):
        return None


def epley(load: float, reps: float, rir: float = 0.0) -> float:
    total = reps + (rir or 0)
    if total <= 1:
        return load
    return load * (1 + total / 30.0)


def fmt(x: float | None, nd: int = 1) -> str:
    if x is None:
        return "-"
    s = f"{x:.{nd}f}"
    return s.rstrip("0").rstrip(".") if "." in s else s


def round_to(x: float, step: float) -> float:
    return round(x / step) * step if step > 0 else x


def load_muscle_map(home: Path) -> dict:
    m = dict(MUSCLE_MAP)
    for r in read_rows(home / "exercises.csv"):
        key = norm(r.get("exercise", ""))
        if key:
            m[key] = (r.get("pattern", ""), r.get("primary", ""), r.get("secondary", ""))
    return m


def lookup_muscles(mmap: dict, exercise: str):
    key = norm(exercise)
    if key in mmap:
        return mmap[key]
    # try singular / plural and partial match on known names (longest first)
    alt = key[:-1] if key.endswith("s") else key + "s"
    if alt in mmap:
        return mmap[alt]
    for k in sorted(mmap, key=len, reverse=True):
        if re.search(rf"\b{re.escape(k)}\b", key):
            return mmap[k]
    return None


def work_sets(rows: list[dict]) -> list[dict]:
    return [r for r in rows if (r.get("type") or "work").strip().lower() not in ("warmup", "warm-up", "w")]


def set_e1rm(r: dict) -> float | None:
    load = fnum(r.get("load"))
    reps = fnum(r.get("reps"))
    if load is None or reps is None or reps <= 0 or load <= 0:
        return None
    return epley(load, reps, fnum(r.get("rir")) or 0.0)


def session_e1rm(rs: list[dict]) -> tuple[float, str]:
    """Best e1RM of one exposure, plus a reliability tag.

    - Uses only sets with logged RIR when any exist (blank RIR would otherwise count as 0 and
      look like a regression next to RIR-logged sessions).
    - Prefers sets with reps+RIR <= 12, where Epley is reasonably accurate.
    Tag: "" = reliable, "norir" = no RIR logged (assumed 0), "hirep" = only >12 reps-to-failure sets.
    """
    pool = [r for r in rs if set_e1rm(r)]
    if not pool:
        return 0.0, "none"
    with_rir = [r for r in pool if fnum(r.get("rir")) is not None]
    tag = ""
    if with_rir:
        pool = with_rir
    else:
        tag = "norir"
    ok = [r for r in pool if (fnum(r["reps"]) or 0) + (fnum(r.get("rir")) or 0) <= 12]
    if ok:
        pool = ok
    else:
        tag = "hirep"
    return max(set_e1rm(r) for r in pool), tag


def fmt_sets(rs: list[dict]) -> str:
    """Compact display: 107.5x5,5,4@0 (groups consecutive sets with the same load)."""
    out, cur_load, reps = [], None, []
    for r in rs:
        rep = r["reps"] + (f"@{r['rir']}" if r.get("rir") else "")
        if r["load"] == cur_load:
            reps.append(rep)
        else:
            if cur_load is not None:
                out.append(f"{cur_load}x{','.join(reps)}")
            cur_load, reps = r["load"], [rep]
    if cur_load is not None:
        out.append(f"{cur_load}x{','.join(reps)}")
    return " / ".join(out)


def exposures(sets: list[dict], exercise: str) -> list[tuple[dt.date, list[dict]]]:
    """Group work sets for one exercise by (date, session) in chronological order."""
    key = norm(exercise)
    groups: dict[tuple, list] = defaultdict(list)
    for r in work_sets(sets):
        if norm(r.get("exercise", "")) == key:
            groups[(r["date"], r.get("session", ""))].append(r)
    out = []
    for (d, _s), rs in sorted(groups.items(), key=lambda kv: kv[0]):
        out.append((dt.date.fromisoformat(d), sorted(rs, key=lambda r: int(fnum(r.get("set")) or 0))))
    return out


def day_summary(sessions: list[dict], sets: list[dict]) -> dict:
    """Merge sessions.csv and sets.csv into one record per training date.

    status: 'done' if any work was logged or a done/partial row exists, else 'missed'.
    """
    days: dict[str, dict] = {}

    def slot(d):
        return days.setdefault(d, {"status": None, "sessions": set(), "exercises": set(), "reason": ""})

    for r in sessions:
        s = slot(r["date"])
        st = (r.get("status") or "done").strip()
        if r.get("session"):
            s["sessions"].add(r["session"])
        if st == "missed":
            s["status"] = s["status"] or "missed"
            s["reason"] = r.get("reason") or s["reason"]
        else:
            s["status"] = "partial" if st == "partial" and s["status"] != "done" else "done"
    for r in sets:
        s = slot(r["date"])
        s["exercises"].add(r["exercise"])
        if r.get("session"):
            s["sessions"].add(r["session"])
        if s["status"] in (None, "missed"):
            s["status"] = "done"
    return days


# ---------------------------------------------------------------- commands
def cmd_init(args):
    home = home_dir(args)
    home.mkdir(parents=True, exist_ok=True)
    (home / "checkins").mkdir(exist_ok=True)
    (home / "archive").mkdir(exist_ok=True)
    created = []
    for name, header in (("sets.csv", SETS_HEADER), ("sessions.csv", SESSIONS_HEADER),
                         ("body.csv", BODY_HEADER), ("exercises.csv", EXERCISES_HEADER)):
        p = home / name
        if not p.exists():
            ensure_csv(p, header)
            created.append(name)
    for tpl, target in (("profile-template.md", "profile.md"), ("plan-template.md", "plan.md"),
                        ("decisions-template.md", "decisions.md")):
        src, dst = ASSETS / tpl, home / target
        if not dst.exists() and src.exists():
            shutil.copy(src, dst)
            created.append(target)
    print(f"Data home: {home}")
    print("Created: " + (", ".join(created) if created else "nothing (already initialized)"))


def cmd_log(args):
    home = home_dir(args)
    date = parse_date(args.date)
    unit = args.unit
    existing = read_rows(home / "sets.csv")
    n_prev = sum(1 for r in existing if r["date"] == date.isoformat()
                 and norm(r["exercise"]) == norm(args.exercise) and r.get("session", "") == (args.session or ""))
    rows, idx = [], n_prev
    for kind, tokens in (("warmup", args.warmup or []), ("work", args.sets)):
        for tok in tokens:
            m = SET_TOKEN.match(tok.strip())
            if not m:
                sys.exit(f"Could not parse set '{tok}'. Use LOADxREPS[@RIR][*N], e.g. 100x8@2 or 100x8@2*3 or bw+10x6")
            load = m.group("load").lower()
            mult = int(m.group("mult") or 1)
            for _ in range(mult):
                idx += 1
                rows.append({
                    "date": date.isoformat(), "session": args.session or "", "exercise": args.exercise.strip(),
                    "set": idx, "type": "warmup" if kind == "warmup" else (args.type or "work"),
                    "load": load, "unit": unit, "reps": m.group("reps"), "rir": m.group("rir") or "",
                    "notes": args.notes or "",
                })
    append_rows(home / "sets.csv", SETS_HEADER, rows)
    work = [r for r in rows if r["type"] != "warmup"]
    best, tag = session_e1rm(work)
    # PR check vs history (reliable estimates only: RIR-aware, <=12 reps-to-failure)
    hist = [session_e1rm(rs) for _, rs in exposures(existing, args.exercise)]
    prev_best = max((v for v, t in hist if t not in ("hirep", "none")), default=0)
    if tag in ("hirep", "none"):
        prev_best = 0  # don't announce PRs from unreliable estimates
    msg = f"Logged {len(work)} work set(s) + {len(rows) - len(work)} warm-up(s) of {args.exercise} on {date}."
    if best:
        msg += f" Best e1RM this session: {fmt(best)} {unit}."
        if prev_best and best > prev_best:
            msg += f" NEW e1RM PR (previous {fmt(prev_best)})."
    print(msg)


def cmd_session(args):
    home = home_dir(args)
    date = parse_date(args.date)
    append_rows(home / "sessions.csv", SESSIONS_HEADER, [{
        "date": date.isoformat(), "session": args.session or "", "status": args.status,
        "duration_min": args.duration or "", "readiness": args.readiness or "", "srpe": args.srpe or "",
        "reason": args.reason or "", "notes": args.notes or "",
    }])
    print(f"Session logged: {date} {args.session or ''} status={args.status}")


def cmd_body(args):
    home = home_dir(args)
    date = parse_date(args.date)
    append_rows(home / "body.csv", BODY_HEADER, [{
        "date": date.isoformat(), "weight": args.weight, "unit": args.unit,
        "waist_cm": args.waist or "", "notes": args.notes or "",
    }])
    print(f"Bodyweight logged: {date} {args.weight} {args.unit}")


def cmd_e1rm(args):
    e = epley(args.load, args.reps, args.rir)
    total = args.reps + args.rir
    print(f"e1RM ≈ {fmt(e)} (Epley, reps {fmt(args.reps)} + RIR {fmt(args.rir)})")
    if total > 12:
        print("Note: estimates from >12 reps-to-failure are unreliable; use for trend only.")
    print("Approx loads from this e1RM:")
    for reps in (1, 3, 5, 8, 10, 12):
        for rir in (2,):
            load = e / (1 + (reps + rir) / 30.0) if reps + rir > 1 else e
            print(f"  {reps} reps @ RIR {rir}: ~{fmt(load)}")


def parse_plan(text: str) -> dict[str, list[tuple[str, int]]]:
    """Extract {day heading: [(exercise, sets), ...]} from plan.md markdown tables.

    A row counts when its 'Sets × Reps' cell starts with a number followed by x/×, e.g. '3 × 8-12'.
    """
    days: dict[str, list] = {}
    day = None
    for line in text.splitlines():
        if line.startswith("### "):
            day = line[4:].strip()
            continue
        if day is None or not line.strip().startswith("|"):
            continue
        cells = [c.strip() for c in line.strip().strip("|").split("|")]
        if len(cells) < 3:
            continue
        m = re.match(r"^(\d+)\s*[×xX]", cells[2])
        if not m:
            continue
        name = re.sub(r"\(.*?\)|\*\*ss\*\*|\bss\b", "", cells[1]).strip()
        days.setdefault(day, []).append((name, int(m.group(1))))
    return days


def cmd_plan_volume(args):
    home = home_dir(args)
    path = Path(args.file) if args.file else home / "plan.md"
    if not path.exists():
        sys.exit(f"No plan at {path}")
    days = parse_plan(path.read_text(errors="ignore"))
    if not days:
        sys.exit("No exercise rows found (expects '### Day ...' headings and tables with a 'Sets × Reps' column).")
    mmap = load_muscle_map(home)
    tally, unknown = defaultdict(float), set()
    print(f"# Planned volume: {path.name} (each '### Day' counted once per week)\n")
    print("| Day | Working sets | Est. minutes (incl. ~8 min warm-up) |")
    print("|---|---|---|")
    for day, rows in days.items():
        minutes, total = 8.0, 0
        for name, n in rows:
            total += n
            info = lookup_muscles(mmap, name)
            if not info:
                unknown.add(name)
                minutes += n * 2.0
                continue
            pattern, prim, sec = info
            minutes += n * (1.75 if pattern in ("isolation", "core") else 2.75)
            for mus in filter(None, (x.strip() for x in prim.split(";"))):
                tally[mus] += n
            for mus in filter(None, (x.strip() for x in sec.split(";"))):
                tally[mus] += 0.5 * n
        print(f"| {day} | {total} | ~{minutes:.0f} |")
    print("\n## Weekly hard sets per muscle (primary 1, secondary 0.5)")
    print("| Muscle | Sets/week | Note |")
    print("|---|---|---|")
    for mus in sorted(tally, key=lambda m: -tally[m]):
        v = tally[mus]
        note = "low (<6)" if v < 6 else ("high (>20)" if v > 20 else "")
        print(f"| {mus} | {fmt(v)} | {note} |")
    if unknown:
        print(f"\nUnmapped (not counted; add to exercises.csv): {', '.join(sorted(unknown))}")
    print("\nSupersets save time; minutes are a rough upper estimate. Targets: novice 6-10, intermediate 10-20 "
          "(small muscles like side/rear delts and arms often less if they get indirect work).")


def cmd_pct(args):
    for p in args.percents:
        raw = args.base * p / 100.0
        print(f"{fmt(p)}% of {fmt(args.base)} = {fmt(raw, 2)} → rounded to {fmt(round_to(raw, args.inc))} "
              f"(increment {fmt(args.inc)})")


def cmd_next(args):
    home = home_dir(args)
    sets = read_rows(home / "sets.csv")
    ex = exposures(sets, args.exercise)
    if not ex:
        print(f"No history for '{args.exercise}'. Calibration: work up to a load that leaves ~3 RIR at "
              f"{args.range.split('-')[0]} reps; record it and progress from there.")
        return
    lo, hi = (int(x) for x in args.range.split("-"))
    target_rir = args.rir
    inc = args.inc
    last_date, last = ex[-1]
    loads = [fnum(r["load"]) for r in last if fnum(r["load"]) is not None]
    reps = [int(fnum(r["reps"]) or 0) for r in last]
    rirs = [fnum(r.get("rir")) for r in last]
    days_ago = (dt.date.today() - last_date).days
    top_load = max(loads) if loads else None
    desc = ", ".join(f"{r['load']}x{r['reps']}" + (f"@{r['rir']}" if r.get('rir') else "") for r in last)
    print(f"Last {args.exercise}: {last_date} ({days_ago} days ago): {desc}")

    # under-effort / over-effort relative to target RIR (only when RIR was logged)
    known_rir = [x for x in rirs if x is not None]
    min_rir = min(known_rir) if known_rir else None

    if top_load is None:  # bodyweight-only movement: progress reps
        if min(reps) >= hi:
            print(f"Next: all sets hit {hi}. Add load (e.g. bw+{fmt(inc)}) or a harder variation; reset to {lo} reps.")
        else:
            print(f"Next: same variation, aim +1 rep per set toward {hi} (keep ~{fmt(target_rir)} RIR).")
        return

    # layoff discount
    if days_ago >= 21:
        factor = 0.85 if days_ago < 42 else 0.75
        print(f"Layoff of {days_ago} days: restart at ~{fmt(round_to(top_load * factor, inc))} "
              f"({int(factor * 100)}%), ~3 RIR, fewer sets; rebuild over 2-4 weeks.")
        return

    if min_rir is not None and min_rir < target_rir - 1:
        print(f"Effort note: a set reached RIR {fmt(min_rir)} vs target {fmt(target_rir)}. Don't add load yet; "
              f"consolidate first (and check readiness/pain notes).")
    notes = {r.get("notes", "").strip() for r in last if r.get("notes", "").strip()}
    if notes:
        print("Notes from last session: " + " | ".join(sorted(notes)))
        if any(w in " ".join(notes).lower() for w in ("pain", "hurt", "ache", "sore", "injur")):
            print("Pain was noted: the pain protocol (traffic light) overrides this progression suggestion.")

    if args.model == "linear":
        hit = all(r >= hi for r in reps)
        if hit and min_rir is not None and min_rir < target_rir - 1:
            print(f"Next: repeat {fmt(top_load)} for {len(reps)}x{hi}: reps were hit but effort overshot the target.")
        elif hit:
            print(f"Next: {fmt(top_load + inc)} for {len(reps)}x{hi} (linear +{fmt(inc)}).")
        else:
            misses = 1
            if len(ex) >= 2:
                prev_reps = [int(fnum(r["reps"]) or 0) for r in ex[-2][1]]
                prev_load = max((fnum(r["load"]) or 0) for r in ex[-2][1])
                if prev_load == top_load and not all(r >= hi for r in prev_reps):
                    misses = 2
            if misses >= 2:
                print(f"Missed target twice at {fmt(top_load)}: reset ~10% to {fmt(round_to(top_load * 0.9, inc))} "
                      f"and rebuild, or switch this lift to double progression.")
            else:
                print(f"Next: repeat {fmt(top_load)} for {len(reps)}x{hi}.")
        return

    # double progression
    all_top = all(r >= hi for r in reps)
    effort_ok = min_rir is None or min_rir >= target_rir - 1
    if all_top and effort_ok:
        new = round_to(top_load + inc, inc) if inc else top_load
        print(f"Next: {fmt(new)} for {len(reps)}x{lo} (all sets hit {hi}: add {fmt(inc)}, reset to bottom of range).")
    elif min(reps) < lo:
        # two consecutive sub-range sessions at same load -> reduce
        prev_bad = False
        if len(ex) >= 2:
            p = ex[-2][1]
            p_load = max((fnum(r["load"]) or 0) for r in p)
            prev_bad = p_load == top_load and min(int(fnum(r["reps"]) or 0) for r in p) < lo
        if prev_bad:
            print(f"Below {lo} reps twice at {fmt(top_load)}: drop 5-10% to ~{fmt(round_to(top_load * 0.93, inc))} "
                  f"and rebuild. Check sleep, stress, deficit and whether the jump was too big.")
        else:
            print(f"Next: repeat {fmt(top_load)}; aim for ≥{lo} reps on every set (one bad day is noise).")
    else:
        tgt = [min(r + 1, hi) for r in reps]
        print(f"Next: stay at {fmt(top_load)}, aim for {'/'.join(map(str, tgt))} reps (@~{fmt(target_rir)} RIR).")


def cmd_status(args):
    home = home_dir(args)
    today = dt.date.today()
    print(f"Today: {today.isoformat()} ({today.strftime('%A')}), ISO week {today.isocalendar()[1]}")
    print(f"Data home: {home}" + ("" if home.exists() else "  (NOT INITIALIZED: run init / onboarding)"))
    if not home.exists():
        return
    sessions = read_rows(home / "sessions.csv")
    sets = read_rows(home / "sets.csv")
    for fname, marker in (("profile.md", "YYYY-MM-DD"), ("plan.md", "<block name>")):
        fp = home / fname
        if not fp.exists():
            print(f"WARNING: {fname} missing.")
        elif marker in fp.read_text(errors="ignore"):
            print(f"WARNING: {fname} is still an unfilled template: complete it with the client (infer from logs, then confirm).")
    days = day_summary(sessions, sets)
    recent = sorted(days.items(), reverse=True)[:8]
    if recent:
        print("Recent days (newest first):")
        for d, info in recent:
            dd = dt.date.fromisoformat(d)
            extra = []
            if info["sessions"]:
                extra.append("/".join(sorted(info["sessions"])))
            if info["reason"]:
                extra.append(f"reason: {info['reason']}")
            print(f"  {d} {dd.strftime('%a')} ({(today - dd).days}d ago) [{info['status']}] "
                  + (f"({'; '.join(extra)}) " if extra else "") + ", ".join(sorted(info["exercises"])))
        last_done = max((dt.date.fromisoformat(d) for d, i in days.items() if i["status"] != "missed"),
                        default=None)
        if last_done:
            print(f"Days since last training session: {(today - last_done).days}")
    else:
        print("No sessions logged yet.")
    seen = days
    # check-in due?
    ck = sorted((home / "checkins").glob("*.md")) if (home / "checkins").exists() else []
    last_ck = None
    for p in ck:
        try:  # files are named YYYY-MM-DD.md; fall back to modification time
            d = dt.date.fromisoformat(p.stem[:10])
        except ValueError:
            d = dt.date.fromtimestamp(p.stat().st_mtime)
        last_ck = max(last_ck or dt.date.min, d)
    since = last_ck or dt.date.min
    n_since = sum(1 for d, i in seen.items() if dt.date.fromisoformat(d) > since and i["status"] != "missed")
    days_since_ck = (today - last_ck).days if last_ck else None
    due = (days_since_ck is None or days_since_ck >= 7) and n_since >= 3
    print(f"Last check-in: {last_ck or 'never'}; sessions since: {n_since}; check-in due: {'YES' if due else 'no'}")


def cmd_report(args):
    home = home_dir(args)
    today = dt.date.today()
    start = today - dt.timedelta(weeks=args.weeks)
    sets = read_rows(home / "sets.csv")
    sessions = read_rows(home / "sessions.csv")
    body = read_rows(home / "body.csv")
    mmap = load_muscle_map(home)
    print(f"# Training report: {start} → {today} ({args.weeks} weeks)\n")

    # adherence
    in_win = [r for r in sessions if start <= dt.date.fromisoformat(r["date"]) <= today]
    days = {d: i for d, i in day_summary(sessions, sets).items()
            if start <= dt.date.fromisoformat(d) <= today}
    done = sum(1 for i in days.values() if i["status"] in ("done", "partial"))
    missed = [i for i in days.values() if i["status"] == "missed"]
    planned = done + len(missed)
    print("## Adherence")
    if planned:
        print(f"- Training days completed: {done}/{planned} logged ({100 * done / planned:.0f}%), "
              f"≈{done / args.weeks:.1f} sessions/week")
        if missed:
            reasons = defaultdict(int)
            for i in missed:
                reasons[i["reason"] or "unspecified"] += 1
            print("- Missed by reason: " + ", ".join(f"{k} ×{v}" for k, v in reasons.items()))
        if args.planned:
            exp = args.planned * args.weeks
            print(f"- Versus plan ({fmt(args.planned)}/week × {args.weeks} weeks = {fmt(exp)}): {done}/{fmt(exp)} "
                  f"({100 * done / exp:.0f}%)" + ("  ← below 80%: fix plan fit before content" if done / exp < 0.8 else ""))
        else:
            print("- Note: counts only misses that were logged; pass --planned <sessions per week> "
                  "for adherence against the plan.")
    else:
        print("- No sessions in window.")
    srpe = [(fnum(r.get("srpe")), fnum(r.get("duration_min"))) for r in in_win]
    loads = [a * b for a, b in srpe if a and b]
    if loads:
        print(f"- Avg session load (sRPE×min): {fmt(sum(loads) / len(loads), 0)}")
    rd = [fnum(r.get("readiness")) for r in in_win if fnum(r.get("readiness"))]
    if rd:
        half = len(rd) // 2 or 1
        print(f"- Readiness avg {fmt(sum(rd) / len(rd))}/5 (first half {fmt(sum(rd[:half]) / half)}, "
              f"recent {fmt(sum(rd[half:] or rd) / len(rd[half:] or rd))})")
    print()

    # per-exercise trends
    print("## Lifts (work sets; e1RM = Epley with reps+RIR)")
    names = sorted({r["exercise"] for r in work_sets(sets)
                    if start <= dt.date.fromisoformat(r["date"]) <= today}, key=str.lower)
    if not names:
        print("- No work sets in this window.\n")
    flags = []
    if names:
        print("| Exercise | Exposures | Last session | e1RM first → last | Best (reliable) | Flag |")
        print("|---|---|---|---|---|---|")
    for name in names:
        ex = exposures(sets, name)
        win = [(d, rs) for d, rs in ex if start <= d <= today]
        series = [session_e1rm(rs) for _, rs in ex]
        e_win = [session_e1rm(rs) for _, rs in win]
        last_rs = win[-1][1]
        top_s = fmt_sets(last_rs)
        flag = ""
        last_tag = series[-1][1]
        # compare like with like: same tag as the latest exposure, never high-rep estimates
        comp = [v for v, t in series if t == last_tag and t not in ("hirep", "none")]
        if len(comp) >= 4 and series[-1][1] == last_tag:
            prior_best = max(comp[:-3])
            if max(comp[-3:]) <= prior_best:
                flag = "STALL (no e1RM gain in last 3 comparable exposures)"
            ref = max(comp[-4:-1])
            if ref and comp[-1] <= 0.95 * ref:
                flag = (flag + "; " if flag else "") + "FATIGUE? (last e1RM ≥5% below recent)"
        if flag:
            flags.append(f"{name}: {flag}")
        tagnote = {"norir": " (no RIR)", "hirep": " (high-rep est.)"}
        first_last = (f"{fmt(e_win[0][0])} → {fmt(e_win[-1][0])}{tagnote.get(e_win[-1][1], '')}"
                      if any(v for v, _ in e_win) else "reps only")
        reliable = [v for v, t in series if t not in ("hirep", "none")]
        best = fmt(max(reliable)) if reliable else "-"
        print(f"| {name} | {len(win)} | {top_s} | {first_last} | {best} | {flag} |")
    print()

    # PRs in window
    prs = []
    for name in names:
        ex = exposures(sets, name)
        best = 0.0
        for d, rs in ex:
            e, tag = session_e1rm(rs)
            if tag in ("hirep", "none"):
                continue
            if e > best:
                if best and start <= d <= today:
                    prs.append(f"{d} {name}: e1RM {fmt(e)} (prev {fmt(best)})")
                best = e
    if prs:
        print("## PRs in window")
        for p in prs:
            print(f"- {p}")
        print()

    # weekly hard sets per muscle (last 7 days and average per week over the window)
    def muscle_sets(since: dt.date, until: dt.date):
        tally = defaultdict(float)
        unknown = set()
        for r in work_sets(sets):
            d = dt.date.fromisoformat(r["date"])
            if not (since <= d <= until):
                continue
            rir = fnum(r.get("rir"))
            if rir is not None and rir > 4:
                continue  # not a hard set
            info = lookup_muscles(mmap, r["exercise"])
            if not info:
                unknown.add(r["exercise"])
                continue
            _, prim, sec = info
            for m in filter(None, (x.strip() for x in prim.split(";"))):
                tally[m] += 1
            for m in filter(None, (x.strip() for x in sec.split(";"))):
                tally[m] += 0.5
        return tally, unknown

    last7, unk = muscle_sets(today - dt.timedelta(days=6), today)
    allw, unk2 = muscle_sets(start, today)
    print("## Hard sets per muscle (primary 1, secondary 0.5; RIR ≤4 or unlogged)")
    muscles = sorted(set(last7) | set(allw))
    if muscles:
        print("| Muscle | Last 7 days | Avg / week in window |")
        print("|---|---|---|")
        for m in muscles:
            print(f"| {m} | {fmt(last7.get(m, 0))} | {fmt(allw.get(m, 0) / args.weeks)} |")
    else:
        print("- No sets in window.")
    if unk | unk2:
        print(f"- Unmapped exercises (add to exercises.csv to count them): {', '.join(sorted(unk | unk2))}")
    print()

    # bodyweight
    bw = sorted(((dt.date.fromisoformat(r["date"]), fnum(r["weight"]), r.get("unit", "")) for r in body
                 if fnum(r.get("weight"))), key=lambda t: t[0])
    if bw:
        print("## Bodyweight")

        def avg7(end: dt.date):
            vals = [w for d, w, _ in bw if end - dt.timedelta(days=6) <= d <= end]
            return sum(vals) / len(vals) if vals else None

        now_avg = avg7(today)
        prev_avg = avg7(today - dt.timedelta(days=7))
        unit = bw[-1][2]
        print(f"- 7-day average: {fmt(now_avg)} {unit}" if now_avg else f"- Last entry: {bw[-1][1]} {unit} on {bw[-1][0]}")
        if now_avg and prev_avg:
            ch = now_avg - prev_avg
            print(f"- Change vs previous 7 days: {ch:+.2f} {unit} ({100 * ch / prev_avg:+.2f}% BW/week)")
        print()

    # recent notes (pain, cues, context) from sessions and sets
    note_rows = []
    for r in in_win:
        if (r.get("notes") or "").strip():
            note_rows.append((r["date"], f"session: {r['notes'].strip()}"))
    seen_notes = set()
    for r in sets:
        n = (r.get("notes") or "").strip()
        if n and start <= dt.date.fromisoformat(r["date"]) <= today and (r["date"], r["exercise"], n) not in seen_notes:
            seen_notes.add((r["date"], r["exercise"], n))
            note_rows.append((r["date"], f"{r['exercise']}: {n}"))
    if note_rows:
        print("## Recent notes")
        for d, n in sorted(note_rows, reverse=True)[:8]:
            flag = " ⚠" if any(w in n.lower() for w in ("pain", "hurt", "ache", "injur")) else ""
            print(f"- {d} {n}{flag}")
        print()

    print("## Flags")
    if flags:
        for f in flags:
            print(f"- {f}")
        print("- Before acting: check adherence, sleep, stress, calorie deficit, technique (cheapest first).")
    else:
        print("- None.")


# ---------------------------------------------------------------- main
def main():
    if hasattr(signal, "SIGPIPE"):  # quiet exit when piped into head/less (not available on Windows)
        signal.signal(signal.SIGPIPE, signal.SIG_DFL)
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--home", help="data folder (default $FITNESS_HOME or ~/fitness-coach)")
    sub = p.add_subparsers(dest="cmd", required=True)

    sub.add_parser("init", help="create data folder")
    sub.add_parser("status", help="date anchoring and recent sessions")

    lg = sub.add_parser("log", help="append sets for one exercise")
    lg.add_argument("exercise")
    lg.add_argument("sets", nargs="+", help="LOADxREPS[@RIR][*N], e.g. 100x8@2 100x8@2*2 bw+10x6@1")
    lg.add_argument("--warmup", nargs="*", help="warm-up sets, same syntax")
    lg.add_argument("--date", help="YYYY-MM-DD, 'today' (default) or 'yesterday'")
    lg.add_argument("--session", help="plan session id, e.g. W2-D1 or 'Upper A'")
    lg.add_argument("--unit", default="kg", choices=["kg", "lb"])
    lg.add_argument("--type", default="work", help="work | amrap | drop | backoff | top")
    lg.add_argument("--notes")

    se = sub.add_parser("session", help="append a session row")
    se.add_argument("--status", default="done", choices=["done", "partial", "missed"])
    se.add_argument("--date")
    se.add_argument("--session")
    se.add_argument("--duration", type=int, help="minutes")
    se.add_argument("--readiness", type=int, choices=range(1, 6), help="1-5 pre-session readiness")
    se.add_argument("--srpe", type=float, help="session RPE 1-10")
    se.add_argument("--reason", help="for missed/partial: travel|time|sick|pain|motivation|other")
    se.add_argument("--notes")

    bo = sub.add_parser("body", help="append bodyweight")
    bo.add_argument("weight", type=float)
    bo.add_argument("--unit", default="kg", choices=["kg", "lb"])
    bo.add_argument("--waist", type=float, help="waist in cm")
    bo.add_argument("--date")
    bo.add_argument("--notes")

    e = sub.add_parser("e1rm", help="estimated 1RM")
    e.add_argument("load", type=float)
    e.add_argument("reps", type=float)
    e.add_argument("--rir", type=float, default=0.0)

    n = sub.add_parser("next", help="next-session target")
    n.add_argument("exercise")
    n.add_argument("--range", default="8-12", help="rep range lo-hi (for linear: use e.g. 5-5)")
    n.add_argument("--rir", type=float, default=2.0, help="target RIR")
    n.add_argument("--inc", type=float, default=2.5, help="smallest practical load increment")
    n.add_argument("--model", default="double", choices=["double", "linear"])

    pc = sub.add_parser("pct", help="percentage loads, rounded to available increments")
    pc.add_argument("base", type=float, help="reference load (e.g. e1RM or working weight)")
    pc.add_argument("percents", type=float, nargs="+", help="e.g. 80 90")
    pc.add_argument("--inc", type=float, default=2.5, help="smallest available increment")

    pv = sub.add_parser("plan-volume", help="weekly sets per muscle + session time of plan.md")
    pv.add_argument("--file", help="plan file (default <home>/plan.md)")

    r = sub.add_parser("report", help="progress report")
    r.add_argument("--weeks", type=int, default=4)
    r.add_argument("--planned", type=float, help="planned sessions per week (from plan.md) for true adherence")

    args = p.parse_args()
    {"init": cmd_init, "status": cmd_status, "log": cmd_log, "session": cmd_session, "body": cmd_body,
     "e1rm": cmd_e1rm, "next": cmd_next, "pct": cmd_pct, "plan-volume": cmd_plan_volume, "report": cmd_report}[args.cmd](args)


if __name__ == "__main__":
    main()
