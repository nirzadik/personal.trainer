// Agent A test helper (not a test file): runs the skill's trainer.py on the cross-check fixture and parses
// its output, and builds the equivalent Session[] for core.js. Used by core.test.mjs and by
// a-gen-trainer-expected.mjs (which freezes the Python results into a-trainer-expected.json).
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { normalizeSession, todayISO } from "../../src/core.js";

const HERE = dirname(fileURLToPath(import.meta.url));
export const TRAINER_PY = join(HERE, "../../../.claude/skills/personal-trainer/scripts/trainer.py");
export const FIXTURE = JSON.parse(readFileSync(join(HERE, "a-trainer-crosscheck.json"), "utf8"));

/** ISO date `n` days before `todayIso` (UTC arithmetic on calendar dates). */
export function daysBefore(todayIso, n) {
  const [y, m, d] = todayIso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d - n)).toISOString().slice(0, 10);
}

/** All exposures in chronological order: [{ ex, exp, index }] (index = per-fixture session counter). */
export function chronological(fixture = FIXTURE) {
  const list = [];
  fixture.exercises.forEach((ex) => ex.exposures.forEach((exp) => list.push({ ex, exp })));
  list.sort((a, b) => b.exp.daysAgo - a.exp.daysAgo);
  return list.map((x, index) => ({ ...x, index }));
}

/** The fixture as core Sessions (one session per exposure), oldest first. */
export function buildSessions(todayIso, fixture = FIXTURE) {
  return chronological(fixture).map(({ ex, exp, index }) => {
    const warm = normalizeSession({ strength: [{ name: ex.name, sets: exp.warmup || [] }] }).strength[0]?.sets || [];
    return normalizeSession({
      id: `fx-${String(index).padStart(2, "0")}`,
      date: daysBefore(todayIso, exp.daysAgo),
      type: "strength",
      notes: exp.notes || "",
      pain: exp.pain || [],
      strength: [{ name: ex.name, sets: [...warm.map((s) => ({ ...s, type: "warmup" })), ...exp.sets] }],
      createdAt: `2026-01-01T00:00:${String(index).padStart(2, "0")}.000Z`,
    }, { today: todayIso });
  });
}

const num = (s) => (s == null ? null : Number(s));

/** Parse one `trainer.py next` output into { reason, loadKg, reps, flags }. */
export function parseNext(out) {
  const flags = [];
  let r = { reason: null, loadKg: null, reps: null };
  for (const line of out.split("\n").map((l) => l.trim())) {
    let m;
    if (/^Effort note/.test(line)) flags.push("effort_overshoot");
    else if (/^Pain was noted/.test(line)) flags.push("pain");
    else if (/^No history/.test(line)) r = { reason: "no_history", loadKg: null, reps: null };
    else if ((m = /^Layoff of \d+ days: restart at ~([\d.]+)/.exec(line))) { r = { reason: "layoff", loadKg: num(m[1]), reps: null }; flags.push("layoff"); }
    else if (/^Next: all sets hit \d+\. Add load/.test(line)) r = { reason: "add_load", loadKg: null, reps: null };
    else if (/^Next: same variation/.test(line)) r = { reason: "add_reps", loadKg: null, reps: null };
    else if ((m = /^Next: repeat ([\d.]+) for \d+x(\d+): reps were hit but effort/.exec(line))) r = { reason: "effort_hold", loadKg: num(m[1]), reps: m[2] };
    else if ((m = /^Next: ([\d.]+) for \d+x(\d+) \(linear/.exec(line))) r = { reason: "add_load", loadKg: num(m[1]), reps: m[2] };
    else if ((m = /^Missed target twice at [\d.]+: reset ~10% to ([\d.]+)/.exec(line))) r = { reason: "reset", loadKg: num(m[1]), reps: null };
    else if ((m = /^Next: repeat ([\d.]+) for \d+x(\d+)\.$/.exec(line))) r = { reason: "repeat", loadKg: num(m[1]), reps: m[2] };
    else if ((m = /^Next: ([\d.]+) for \d+x(\d+) \(all sets hit/.exec(line))) r = { reason: "add_load", loadKg: num(m[1]), reps: m[2] };
    else if ((m = /^Below (\d+) reps twice at [\d.]+: drop 5-10% to ~([\d.]+)/.exec(line))) r = { reason: "reduce", loadKg: num(m[2]), reps: m[1] };
    else if ((m = /^Next: repeat ([\d.]+); aim for ≥(\d+)/.exec(line))) r = { reason: "repeat", loadKg: num(m[1]), reps: m[2] };
    else if ((m = /^Next: stay at ([\d.]+), aim for ([\d/]+) reps/.exec(line))) r = { reason: "add_reps", loadKg: num(m[1]), reps: m[2] };
  }
  return { ...r, flags };
}

/** Parse `trainer.py report` into { lifts: {name: {n, best, flags}}, muscles: {muscle_id: {last7, avg}} }. */
export function parseReport(out) {
  const lifts = {}, muscles = {};
  let section = "";
  for (const line of out.split("\n")) {
    if (line.startsWith("## ")) { section = line; continue; }
    if (!line.startsWith("|") || /^\|\s*(Exercise|Muscle|---)/.test(line)) continue;
    const c = line.split("|").slice(1, -1).map((s) => s.trim());
    if (section.startsWith("## Lifts")) {
      lifts[c[0]] = { n: Number(c[1]), best: c[4] === "-" ? null : Number(c[4]),
        flags: [/STALL/.test(c[5]) && "stall", /FATIGUE/.test(c[5]) && "fatigue"].filter(Boolean) };
    } else if (section.startsWith("## Hard sets")) {
      muscles[c[0].replace(/ /g, "_")] = { last7: Number(c[1]), avg: Number(c[2]) };
    }
  }
  return { lifts, muscles };
}

/** True when python3 and the skill script are available. */
export function pythonAvailable() {
  if (!existsSync(TRAINER_PY)) return false;
  return spawnSync("python3", ["--version"], { encoding: "utf8" }).status === 0;
}

/**
 * Run trainer.py over the fixture in a temp data home, with dates relative to the real local today
 * (trainer.py always uses date.today()). Returns parsed results.
 */
export function runPython(fixture = FIXTURE) {
  const home = mkdtempSync(join(tmpdir(), "a-trainer-"));
  const today = todayISO();
  const py = (...args) => {
    const r = spawnSync("python3", [TRAINER_PY, "--home", home, ...args], { encoding: "utf8" });
    if (r.status !== 0) throw new Error(`trainer.py ${args.join(" ")} failed: ${r.stderr}`);
    return r.stdout;
  };
  try {
    py("init");
    const log = [];
    for (const { ex, exp, index } of chronological(fixture)) {
      const args = ["log", ex.name, ...exp.sets, "--date", daysBefore(today, exp.daysAgo), "--session", `S${index}`];
      if (exp.warmup?.length) args.push("--warmup", ...exp.warmup);
      if (exp.notes) args.push("--notes", exp.notes);
      const out = py(...args);
      const best = /Best e1RM this session: ([\d.]+)/.exec(out);
      const pr = /NEW e1RM PR \(previous ([\d.]+)\)/.exec(out);
      log.push({ name: ex.name, daysAgo: exp.daysAgo, best: best ? Number(best[1]) : null, prPrevious: pr ? Number(pr[1]) : null });
    }
    const next = {};
    for (const ex of fixture.exercises) {
      next[ex.name] = parseNext(py("next", ex.name, "--range", ex.range.includes("-") ? ex.range : `${ex.range}-${ex.range}`,
        "--rir", String(ex.rir), "--inc", String(ex.inc), "--model", ex.model));
    }
    const report = parseReport(py("report", "--weeks", String(fixture.reportWeeks)));
    return { today, log, next, report };
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
}
