import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as core from "../src/core.js";
import { getExercise } from "../src/catalog.js";
import { PLAN_JSON_SPEC, PLAN_EXAMPLE } from "../src/prompts/plan.js";
import { PLAN_RULES } from "../src/knowledge/plan.js";
import { FIXTURE, buildSessions, chronological, pythonAvailable, runPython, daysBefore } from "./fixtures/a-trainer-harness.mjs";

const EXPECTED = JSON.parse(readFileSync(new URL("./fixtures/a-trainer-expected.json", import.meta.url), "utf8"));
const TODAY = "2026-11-07"; // a Saturday; its week starts Sunday 2026-11-01
const close = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg}: ${a} vs ${b}`);

// ------------------------------------------------------------------ trainer.py parity
/** Compare core.js on the fixture (dated relative to `today`) against parsed trainer.py results. */
function assertMatchesTrainer(py, today) {
  const sessions = buildSessions(today);
  // per-exposure e1RM + PR announcement (trainer.py `log`)
  const chron = chronological();
  chron.forEach(({ ex, exp }, i) => {
    const s = sessions[i];
    const expLog = py.log[i];
    assert.equal(expLog.name, ex.name);
    const { value } = core.sessionE1rm(s.strength[0].sets);
    assert.equal(value, expLog.best, `${ex.name} ${exp.daysAgo}d e1RM`);
    const pr = core.detectPrs(s, sessions.slice(0, i)).find((p) => p.kind === "e1rm");
    assert.equal(pr?.previous ?? null, expLog.prPrevious, `${ex.name} ${exp.daysAgo}d PR`);
    if (pr) assert.equal(pr.value, expLog.best);
  });
  // next-session targets (trainer.py `next`)
  for (const ex of FIXTURE.exercises) {
    const want = py.next[ex.name];
    const got = core.nextTarget(sessions, { exerciseId: ex.exerciseId, reps: ex.range, targetRir: ex.rir, incrementKg: ex.inc, progression: ex.model }, { today });
    assert.equal(got.reason, want.reason, `${ex.name} reason (${got.note})`);
    if (want.loadKg != null) assert.equal(got.loadKg, want.loadKg, `${ex.name} load`);
    if (want.reps != null) assert.equal(got.reps, want.reps, `${ex.name} reps`);
    assert.deepEqual([...got.flags].sort(), [...want.flags].sort(), `${ex.name} flags`);
  }
  // report: best reliable e1RM, exposure count, stall / fatigue flags, hard sets per muscle
  for (const ex of FIXTURE.exercises) {
    const want = py.report.lifts[ex.name];
    const st = core.exerciseStats(sessions, ex.exerciseId);
    assert.equal(st.exposures, want.n, `${ex.name} exposures`);
    assert.equal(st.bestE1rm, want.best, `${ex.name} best`);
    assert.deepEqual(st.flags, want.flags, `${ex.name} flags`);
  }
  const last7 = core.weeklySetsPerMuscle(sessions, { from: daysBefore(today, 6), to: today });
  const all = core.weeklySetsPerMuscle(sessions, { from: daysBefore(today, FIXTURE.reportWeeks * 7), to: today });
  for (const [m, want] of Object.entries(py.report.muscles)) {
    close(last7[m] || 0, want.last7, 0.051, `${m} last 7 days`);
    close((all[m] || 0) / FIXTURE.reportWeeks, want.avg, 0.051, `${m} avg/week`);
  }
}

test("core matches trainer.py results frozen in fixtures/a-trainer-expected.json", () => {
  assertMatchesTrainer(EXPECTED, TODAY);
  // sanity: the fixture exercises every progression branch
  const reasons = new Set(Object.values(EXPECTED.next).map((n) => n.reason));
  for (const r of ["add_load", "add_reps", "reduce", "reset", "layoff"]) assert.ok(reasons.has(r), r);
  assert.ok(Object.values(EXPECTED.report.lifts).some((l) => l.flags.includes("stall")));
  assert.ok(Object.values(EXPECTED.report.lifts).some((l) => l.flags.includes("fatigue")));
});

test("core matches a live trainer.py run", { skip: !pythonAvailable() && "python3 or trainer.py not available" }, () => {
  const live = runPython();
  assert.deepEqual({ log: live.log, next: live.next, report: live.report },
    { log: EXPECTED.log, next: EXPECTED.next, report: EXPECTED.report }, "trainer.py changed: regenerate a-trainer-expected.json");
  assertMatchesTrainer(live, live.today);
});

// ------------------------------------------------------------------ numbers & dates
test("e1rm: Epley on reps + RIR", () => {
  assert.equal(core.e1rm(100, 5), 100 * (1 + 5 / 30));
  assert.equal(core.e1rm(100, 5, 2), 100 * (1 + 7 / 30));
  assert.equal(core.e1rm(100, 1), 100);
  assert.equal(core.e1rm(100, 1, 0), 100);
  assert.equal(core.e1rm(0, 5), null);
  assert.equal(core.e1rm(100, 0), null);
  assert.equal(core.e1rm(null, 5), null);
});

test("sessionE1rm reliability rules", () => {
  const w = (loadKg, reps, rir = null, extra = {}) => ({ type: "work", loadKg, bodyweight: false, reps, rir, ...extra });
  assert.deepEqual(core.sessionE1rm([w(100, 5, 2), w(100, 5, 1)]), { value: 123.3, reliability: "ok" });
  // RIR-logged sets win over unlogged ones even when the unlogged one estimates higher
  assert.deepEqual(core.sessionE1rm([w(100, 8), w(100, 5, 1)]), { value: 120, reliability: "ok" });
  assert.equal(core.sessionE1rm([w(100, 5)]).reliability, "no_rir");
  assert.deepEqual(core.sessionE1rm([w(50, 15, 2)]), { value: 78.3, reliability: "high_rep" });
  assert.equal(core.sessionE1rm([w(50, 15, 2), w(60, 8, 2)]).value, 60 * (1 + 10 / 30));
  assert.deepEqual(core.sessionE1rm([w(null, 10, 2, { bodyweight: true })]), { value: null, reliability: "none" });
  assert.deepEqual(core.sessionE1rm([w(100, 5, 2, { type: "warmup" })]), { value: null, reliability: "none" });
  assert.deepEqual(core.sessionE1rm([]), { value: null, reliability: "none" });
});

test("roundTo / pctLoads (ties to even like Python)", () => {
  assert.equal(core.roundTo(81.2, 2.5), 80);
  assert.equal(core.roundTo(81.3, 2.5), 82.5);
  assert.equal(core.roundTo(81.25, 2.5), 80); // 32.5 → 32 (even)
  assert.equal(core.roundTo(83.75, 2.5), 85); // 33.5 → 34
  assert.equal(core.roundTo(0.3, 0.1), 0.3);
  assert.equal(core.roundTo(7, 0), 7);
  assert.deepEqual(core.pctLoads(150, [70, 85]), [{ pct: 70, raw: 105, rounded: 105 }, { pct: 85, raw: 127.5, rounded: 127.5 }]);
  assert.deepEqual(core.pctLoads(117, [80], 5), [{ pct: 80, raw: 93.6, rounded: 95 }]);
});

test("pace and duration helpers", () => {
  assert.equal(core.paceSecPerKm(10, 3000), 300);
  assert.equal(core.paceSecPerKm(8.2, 2715), 331);
  assert.equal(core.paceSecPerKm(0, 100), null);
  assert.equal(core.formatPace(332), "5:32/km");
  assert.equal(core.formatPace(359.6), "6:00/km");
  assert.equal(core.formatPace(null), "");
  assert.equal(core.parseDuration("45:30"), 2730);
  assert.equal(core.parseDuration("1:02:10"), 3730);
  assert.equal(core.parseDuration("45"), 2700);
  assert.equal(core.parseDuration(45), 2700);
  assert.equal(core.parseDuration("1h 5m"), 3900);
  assert.equal(core.parseDuration("90s"), 90);
  assert.equal(core.parseDuration("50 min"), 3000);
  assert.equal(core.parseDuration("12:75"), null);
  assert.equal(core.parseDuration("soon"), null);
  assert.equal(core.parseDuration(""), null);
  assert.equal(core.formatDuration(2730), "45:30");
  assert.equal(core.formatDuration(3730), "1:02:10");
  assert.equal(core.formatDuration(5), "0:05");
  assert.equal(core.formatDuration(null), "");
});

test("dates: local today, Sunday week start, signed day differences", () => {
  assert.equal(core.todayISO(new Date(2026, 10, 7, 23, 59)), "2026-11-07");
  assert.equal(core.todayISO(new Date(2026, 0, 3)), "2026-01-03");
  assert.equal(core.weekStartOf("2026-11-07"), "2026-11-01");
  assert.equal(core.weekStartOf("2026-11-01"), "2026-11-01");
  assert.equal(core.weekStartOf("2026-11-02"), "2026-11-01");
  assert.equal(core.weekStartOf("2026-03-01"), "2026-03-01");
  assert.equal(core.weekStartOf("2027-01-01"), "2026-12-27");
  assert.equal(core.weekStartOf("bad"), null);
  assert.equal(core.daysBetween("2026-11-01", "2026-11-07"), 6);
  assert.equal(core.daysBetween("2026-11-07", "2026-11-01"), -6);
  assert.equal(core.daysBetween("2026-03-28", "2026-04-04"), 7, "across DST");
});

test("paceZones reproduces the VDOT pace table in knowledge/plan.js", () => {
  const src = readFileSync(new URL("../src/knowledge/plan.js", import.meta.url), "utf8");
  const rows = [...src.matchAll(/^\d+:00=(\d+)\|(\d+)\|(\d+)\|(\d+)\|(\d+)-(\d+)\|(\d+)\|(\d+)\|(\d+)\|(\d+)\|(\d+)-(\d+)\|(\d+)-(\d+)\|(\d+)-(\d+)$/gm)].map((m) => m.slice(1).map(Number));
  assert.ok(rows.length >= 15, "pace table found");
  for (const [s5, s10, shm, sm, e1, e2, mp, hmp, p10, p5, t1, t2, i1, i2, rr1, rr2] of rows) {
    const z = core.paceZones({ distanceKm: 5, timeSec: s5 });
    const tag = `5K ${s5}s`;
    assert.deepEqual(z.easy, [e1, e2], `${tag} E`);
    assert.deepEqual(z.threshold, [t1, t2], `${tag} T`);
    assert.deepEqual(z.interval, [i1, i2], `${tag} I`);
    close(z.repetition[0], rr1, 2, `${tag} R fast`);
    close(z.repetition[1], rr2, 2, `${tag} R slow`);
    assert.equal(z.marathon, mp, `${tag} Mp`);
    assert.equal(z.half, hmp, `${tag} HMp`);
    assert.equal(z.tenK, p10, `${tag} 10Kp`);
    assert.equal(z.fiveK, p5, `${tag} 5Kp`);
    // the same fitness from any race distance in that row gives the same zones (±1 s)
    for (const [km, sec] of [[10, s10], [21.0975, shm], [42.195, sm]]) {
      const y = core.paceZones({ distanceKm: km, timeSec: sec });
      close(y.threshold[0], t1, 1, `${tag} from ${km} km`);
      close(y.vdot, z.vdot, 0.15, `${tag} vdot from ${km} km`);
    }
  }
  assert.equal(core.paceZones({ distanceKm: 5, timeSec: 1200 }).vdot, 49.8);
  assert.equal(core.paceZones({ distanceKm: 0, timeSec: 100 }), null);
  assert.equal(core.paceZones({}), null);
});

// ------------------------------------------------------------------ strength helpers
const S = (date, entries, extra = {}) => core.normalizeSession({ id: `s-${date}-${Math.random().toString(36).slice(2, 6)}`, date, strength: entries, ...extra }, { today: TODAY });

test("exposures: chronological, work sets only, name fallback, missed sessions skipped", () => {
  const sessions = [
    S("2026-11-03", [{ exerciseId: "bench_press", sets: [{ type: "warmup", loadKg: 40, reps: 10 }, "80x8@2", "80x8@2"] }]),
    S("2026-10-30", [{ name: "bench", sets: ["77.5x8@2"] }]),
    S("2026-11-01", [{ exerciseId: "back_squat", sets: ["100x5"] }]),
    { ...S("2026-11-05", [{ exerciseId: "bench_press", sets: ["80x9@2"] }]), status: "missed" },
  ];
  const ex = core.exposures(sessions, "bench_press");
  assert.deepEqual(ex.map((e) => e.date), ["2026-10-30", "2026-11-03"]);
  assert.equal(ex[1].sets.length, 2);
  assert.ok(ex.every((e) => e.sets.every((s) => s.type === "work")));
  assert.deepEqual(Object.keys(ex[0]).sort(), ["date", "sessionId", "sets"]);
  assert.deepEqual(core.exposures(sessions, "deadlift"), []);
});

test("nextTarget: other branches (no history, linear add, rpe, none, AMRAP, bodyweight add load)", () => {
  const item = (o) => ({ exerciseId: "bench_press", sets: 3, reps: "8-12", targetRir: 2, incrementKg: 2.5, progression: "double", loadKg: null, ...o });
  const none = core.nextTarget([], item({ loadKg: 60 }), { today: TODAY });
  assert.equal(none.reason, "no_history");
  assert.equal(none.loadKg, 60);
  assert.match(none.note, /Calibrate/);

  const sq = [S("2026-11-04", [{ exerciseId: "back_squat", sets: ["100x5@2", "100x5@2", "100x5@2"] }])];
  const lin = core.nextTarget(sq, { exerciseId: "back_squat", reps: "5", targetRir: 2, incrementKg: 5, progression: "linear" }, { today: TODAY });
  assert.deepEqual([lin.reason, lin.loadKg, lin.reps], ["add_load", 105, "5"]);

  const rpeSessions = [S("2026-11-04", [{ exerciseId: "back_squat", sets: ["100x5@4", "100x5@4"] }])];
  const up = core.nextTarget(rpeSessions, { exerciseId: "back_squat", reps: "5", targetRir: 2, incrementKg: 2.5, progression: "rpe" }, { today: TODAY });
  assert.deepEqual([up.reason, up.loadKg], ["rpe_increase", 105]); // 2 RIR easier → +5 %
  const hold = core.nextTarget(rpeSessions, { exerciseId: "back_squat", reps: "5", targetRir: 4, progression: "rpe" }, { today: TODAY });
  assert.deepEqual([hold.reason, hold.loadKg], ["rpe_hold", 100]);
  const down = core.nextTarget([S("2026-11-04", [{ exerciseId: "back_squat", sets: ["100x5@0"] }])], { exerciseId: "back_squat", reps: "5", targetRir: 2, progression: "rpe" }, { today: TODAY });
  assert.deepEqual([down.reason, down.loadKg], ["rpe_reduce", 95]);

  const fixed = core.nextTarget(sq, { exerciseId: "back_squat", reps: "5", loadKg: 90, progression: "none" }, { today: TODAY });
  assert.deepEqual([fixed.reason, fixed.loadKg, fixed.reps], ["no_progression", 90, "5"]);

  const amrap = core.nextTarget(sq, { exerciseId: "back_squat", reps: "AMRAP", progression: "double" }, { today: TODAY });
  assert.deepEqual([amrap.reason, amrap.loadKg, amrap.reps], ["repeat", 100, "AMRAP"]);

  const pu = [S("2026-11-04", [{ exerciseId: "pull_up", sets: ["bw+5x12@2", "bw+5x12@2"] }])];
  const bw = core.nextTarget(pu, { exerciseId: "pull_up", reps: "8-12", targetRir: 2, incrementKg: 2.5 }, { today: TODAY });
  assert.deepEqual([bw.reason, bw.loadKg, bw.reps], ["add_load", 7.5, "8"]);
  assert.equal(typeof bw.note, "string");
});

test("nextTarget: owner feedback (easy bump, hard hold, hard twice reduce, hard + pain protocol)", () => {
  const item = { exerciseId: "bench_press", sets: 3, reps: "8-12", targetRir: 2, incrementKg: 2.5, progression: "double" };
  const at = (date, sets, feedback, extra) => S(date, [{ exerciseId: "bench_press", sets, feedback }], extra);
  // all sets within 1 rep of the top + "easy" → add the increment (without feedback it would be add_reps)
  const nearTop = ["80x11@2", "80x11@2", "80x12@2"];
  const plain = core.nextTarget([at("2026-11-04", nearTop)], item, { today: TODAY });
  assert.equal(plain.reason, "add_reps");
  const easy = core.nextTarget([at("2026-11-04", nearTop, "easy")], item, { today: TODAY });
  assert.deepEqual([easy.reason, easy.loadKg, easy.reps], ["add_load", 82.5, "8"]);
  assert.ok(easy.flags.includes("feedback_easy"));
  // "easy" but 2 reps short: progress as normal (add reps)
  assert.equal(core.nextTarget([at("2026-11-04", ["80x10@2", "80x10@2"], "easy")], item, { today: TODAY }).reason, "add_reps");
  // fixed reps "5" missed by one + easy → add load
  const five = core.nextTarget([S("2026-11-04", [{ exerciseId: "back_squat", sets: ["100x5@2", "100x5@2", "100x4@2"], feedback: "easy" }])],
    { exerciseId: "back_squat", reps: "5", targetRir: 2, incrementKg: 2.5, progression: "double" }, { today: TODAY });
  assert.deepEqual([five.reason, five.loadKg], ["add_load", 102.5]);
  // "hard" holds the load even when every set hit the top
  const top = ["80x12@2", "80x12@2", "80x12@2"];
  assert.equal(core.nextTarget([at("2026-11-04", top)], item, { today: TODAY }).reason, "add_load");
  const hard = core.nextTarget([at("2026-11-04", top, "hard")], item, { today: TODAY });
  assert.deepEqual([hard.reason, hard.loadKg, hard.reps], ["feedback_hold", 80, "12"]);
  assert.ok(hard.flags.includes("feedback_hard"));
  // "hard" twice in a row → −5-10 %
  const twice = core.nextTarget([at("2026-10-31", top, "hard"), at("2026-11-04", top, "hard")], item, { today: TODAY });
  assert.equal(twice.reason, "feedback_reduce");
  assert.ok(twice.loadKg < 80 && twice.loadKg >= 72, `reduced load ${twice.loadKg}`);
  // "fine" in between resets the streak
  assert.equal(core.nextTarget([at("2026-10-31", top, "hard"), at("2026-11-02", top, "fine"), at("2026-11-04", top, "hard")], item, { today: TODAY }).reason, "feedback_hold");
  // "hard" + pain → pain protocol (no progression)
  const pain = core.nextTarget([at("2026-11-04", top, "hard", { pain: [{ area: "shoulder", score: 4 }] })], item, { today: TODAY });
  assert.deepEqual([pain.reason, pain.loadKg], ["pain_protocol", 80]);
  assert.match(pain.note, /pain protocol/);
  // bodyweight: hard holds reps, easy near the top adds load
  const pu = (sets, feedback) => [S("2026-11-04", [{ exerciseId: "pull_up", sets, feedback }])];
  const puItem = { exerciseId: "pull_up", reps: "8-12", targetRir: 2, incrementKg: 2.5 };
  assert.deepEqual([core.nextTarget(pu(["bwx10@2", "bwx10@2"], "hard"), puItem, { today: TODAY }).reason], ["feedback_hold"]);
  assert.equal(core.nextTarget(pu(["bwx11@2", "bwx12@2"], "easy"), puItem, { today: TODAY }).reason, "add_load");
});

test("normalizeSession keeps and validates feedback and reviewedAt", () => {
  const s = core.normalizeSession({
    strength: [{ exerciseId: "back_squat", sets: ["100x5"], feedback: "hard" }, { exerciseId: "bench_press", sets: ["80x8"], feedback: "Tough" },
      { exerciseId: "deadlift", sets: ["140x5"], feedback: "meh" }, { exerciseId: "barbell_row", sets: ["60x10"], feedback: "OK" }],
    conditioning: [{ format: "AMRAP", description: "x", feedback: "easy" }, { format: "EMOM", description: "y" }],
    reviewedAt: "2026-11-07T10:00:00.000Z",
  }, { today: TODAY });
  assert.deepEqual(s.strength.map((e) => e.feedback), ["hard", "hard", null, "fine"]);
  assert.deepEqual(s.conditioning.map((c) => c.feedback), ["easy", null]);
  assert.equal(s.reviewedAt, "2026-11-07T10:00:00.000Z");
  assert.equal(core.normalizeSession({}).reviewedAt, null);
  assert.deepEqual(core.FEEDBACK_VALUES, ["easy", "fine", "hard"]);
  assert.equal(core.normalizeFeedback(" too easy "), "easy");
  assert.equal(core.normalizeFeedback(3), null);
});

test("exerciseStats shape", () => {
  const sessions = buildSessions(TODAY);
  const st = core.exerciseStats(sessions, "bench_press");
  assert.equal(st.exposures, 4);
  assert.equal(st.last.date, daysBefore(TODAY, 15));
  assert.equal(st.last.display, "80×12@2,12@2,12@1");
  assert.deepEqual(st.trend.map((t) => t.reliability), ["ok", "ok", "ok", "high_rep"]);
  assert.equal(st.flag, null);
  assert.equal(core.exerciseStats(sessions, "lat_pulldown").flag, "fatigue");
  assert.equal(core.exerciseStats(sessions, "incline_dumbbell_press").flag, "stall");
  assert.deepEqual(core.exerciseStats([], "deadlift"), { exposures: 0, last: null, bestE1rm: null, trend: [], flag: null, flags: [] });
});

test("detectPrs: reps at load and running", () => {
  const prior = [S("2026-11-01", [{ exerciseId: "pull_up", sets: ["bwx8@1"] }, { exerciseId: "bench_press", sets: ["100x5@0"] }])];
  const now = S("2026-11-05", [{ exerciseId: "pull_up", sets: ["bwx10@1"] }, { exerciseId: "bench_press", sets: ["100x6"] }]);
  const prs = core.detectPrs(now, prior);
  assert.deepEqual(prs.find((p) => p.exerciseId === "pull_up"), { exerciseId: "pull_up", kind: "reps_at_load", value: 10, previous: 8, loadKg: 0 });
  assert.equal(prs.find((p) => p.exerciseId === "bench_press").kind, "e1rm"); // 100×6 (no RIR) beats 100×5@0
  const run = (date, km, sec, runType = "easy") => core.normalizeSession({ id: `r${date}`, date, run: { runType, distanceKm: km, durationSec: sec } });
  const runs = [run("2026-10-20", 10, 3300), run("2026-10-25", 5, 1600), run("2026-10-27", 6, 1500, "intervals")];
  const r = core.detectPrs(run("2026-11-01", 10.5, 3360), runs);
  assert.deepEqual(r.map((p) => p.kind).sort(), ["distance", "pace"]);
  assert.deepEqual(r.find((p) => p.kind === "pace"), { exerciseId: null, kind: "pace", value: 320, previous: 330 });
  assert.deepEqual(core.detectPrs(run("2026-11-01", 3, 900), runs), [], "short run: no comparable pace, no distance PR");
  assert.deepEqual(core.detectPrs(run("2026-11-01", 12, 4000), []), [], "first run is not a PR");
});

// ------------------------------------------------------------------ realistic 4-week history
function history4w(today = TODAY) {
  const out = [];
  let n = 0;
  const add = (daysAgo, o) => out.push(core.normalizeSession({ id: `h${n++}`, date: daysBefore(today, daysAgo), readiness: 3 + (n % 3), sessionRpe: 7 + (n % 2), durationMin: 55, ...o }, { today }));
  for (let w = 0; w < 4; w++) {
    const base = 27 - w * 7, bump = w * 2.5;
    add(base, { title: "Upper A", type: "strength", strength: [
      { exerciseId: "bench_press", sets: [`${80 + bump}x8@2`, `${80 + bump}x8@2`, `${80 + bump}x7@1`] },
      { exerciseId: "barbell_row", sets: [`${70 + bump}x10@2`, `${70 + bump}x10@2`, `${70 + bump}x9@2`] },
      { exerciseId: "overhead_press", sets: ["45x8@2", "45x8@2"] },
      { exerciseId: "pull_up", sets: ["bwx8@2", "bwx8@2", "bwx7@1"] },
      { exerciseId: "lateral_raise", sets: ["10x15@1", "10x15@1", "10x14@0"] },
      { exerciseId: "dumbbell_curl", sets: ["14x12@1", "14x11@1"] }] });
    add(base - 1, { title: "Easy run", run: { runType: "easy", distanceKm: 6 + w, durationSec: (6 + w) * 345 } });
    add(base - 2, { title: "Lower A", type: "strength", strength: [
      { exerciseId: "back_squat", sets: [`${100 + bump * 2}x5@2`, `${100 + bump * 2}x5@2`, `${100 + bump * 2}x5@1`] },
      { exerciseId: "romanian_deadlift", sets: ["90x8@2", "90x8@2", "90x8@2"] },
      { exerciseId: "bulgarian_split_squat", sets: ["20x10@2", "20x10@2"] },
      { exerciseId: "seated_leg_curl", sets: ["45x12@1", "45x12@1"] },
      { exerciseId: "standing_calf_raise", sets: ["80x12@1", "80x12@1"] },
      { exerciseId: "plank", sets: ["bwx45", "bwx45"] }] }, );
    add(base - 4, { title: "Metcon", type: "conditioning", conditioning: [{ format: "AMRAP", description: "12 min: 10 wall balls, 10 KB swings, 200 m row", result: { rounds: 5 + w, reps: 12 } , rpe: 8 }],
      pain: w === 3 ? [{ area: "left knee", score: 3, when: "after" }] : [] });
    add(base - 5, { title: "Long run", run: { runType: "long", distanceKm: 10 + w, durationSec: (10 + w) * 355 } });
    if (w === 2) add(base - 6, { status: "missed", missedReason: "travel", title: "Upper B" });
  }
  return out;
}
const PROFILE = {
  version: 1, onboarded: true, name: "Sam",
  schedule: { daysPerWeek: 4, minutesPerSession: 60, preferredDays: [], notes: "" },
  equipment: { defaultLocationId: "gym", locations: [
    { id: "gym", name: "Gym", items: ["barbell", "plates", "squat_rack", "adjustable_bench", "dumbbells", "cable_machine", "lat_pulldown", "leg_press", "leg_curl", "pullup_bar", "kettlebell", "rower", "wall_ball", "plyo_box", "treadmill", "calf_machine"] },
    { id: "home", name: "Home", items: ["dumbbells", "bands", "outdoor_route"] }] },
  injuries: [{ area: "left knee", status: "current", painScore: 3 }],
  goals: { primary: "strength", modalities: { strength: true, running: true, conditioning: true } },
  experience: { running: { currentWeeklyKm: 15, longestRecentRunKm: 10, easyPaceSecPerKm: 345 } },
  preferences: { likes: [], dislikes: ["leg_extension", "burpees"] },
};

test("weeklySetsPerMuscle and plannedSetsPerMuscle", () => {
  const sessions = [S("2026-11-03", [
    { exerciseId: "bench_press", sets: ["warm 40x10", "80x8@2", "80x8@5", "80x8"] }, // @5 is not a hard set; bad token dropped
    { exerciseId: "barbell_row", sets: ["70x10@2"] }])];
  const t = core.weeklySetsPerMuscle(sessions, { from: "2026-11-01", to: "2026-11-07" });
  assert.deepEqual(t, { chest: 2, triceps: 1, front_delts: 1, upper_back: 1, lats: 1, biceps: 0.5, rear_delts: 0.5, lower_back: 0.5 });
  assert.deepEqual(core.weeklySetsPerMuscle(sessions, { from: "2026-11-04" }), {});
  const plan = { workouts: [{ id: "W1", blocks: [{ kind: "strength", items: [{ exerciseId: "back_squat", sets: 3 }, { exerciseId: "lateral_raise", sets: 4 }] }, { kind: "warmup", minutes: 8, items: [] }] }] };
  assert.deepEqual(core.plannedSetsPerMuscle(plan), { quads: 3, glutes: 3, adductors: 1.5, lower_back: 1.5, side_delts: 4 });
});

test("runningLoad: Sunday weeks, oldest first", () => {
  const rl = core.runningLoad(history4w(), { weeks: 6, today: TODAY });
  assert.equal(rl.length, 6);
  assert.equal(rl[5].weekStart, "2026-11-01");
  assert.equal(rl[0].weekStart, "2026-09-27");
  assert.deepEqual(rl.map((w) => w.km), [0, 0, 16, 18, 20, 22]);
  assert.deepEqual(rl[5], { weekStart: "2026-11-01", km: 22, longestKm: 13, runs: 2, minutes: Math.round((9 * 345 + 13 * 355) / 60) });
});

test("adherence: distinct done days vs plan, prorated, missed by reason", () => {
  const h = history4w();
  const a = core.adherence(h, PROFILE, { weeks: 4, today: TODAY });
  assert.equal(a.done, 20);
  assert.equal(a.expected, 16);
  assert.equal(a.pct, 125);
  assert.deepEqual(a.missedByReason, { travel: 1 });
  const fresh = core.adherence([core.normalizeSession({ date: TODAY, type: "strength" })], { schedule: { daysPerWeek: 3 } }, { today: TODAY });
  assert.deepEqual(fresh, { done: 1, expected: 3, pct: 33, missedByReason: {} });
  assert.equal(core.adherence([], {}, { today: TODAY }).pct, null);
});

test("trainingSummary is compact (≤ 4 KB) and informative", () => {
  const sum = core.trainingSummary(history4w(), PROFILE, { weeks: 4, today: TODAY });
  const json = JSON.stringify(sum);
  assert.ok(json.length <= 4096, `${json.length} bytes`);
  assert.equal(sum.asOf, TODAY);
  assert.equal(sum.last.date, daysBefore(TODAY, 1));
  assert.equal(sum.adherence.expected, 16);
  assert.ok(sum.byType.strength === 8 && sum.byType.run === 8 && sum.byType.conditioning === 4);
  const bench = sum.lifts.find((l) => l.id === "bench_press");
  assert.equal(bench.n, 4);
  assert.ok(bench.e1rm > bench.first, "trend up");
  assert.ok(sum.lifts.length <= 8);
  assert.deepEqual(sum.run.kmByWeek, [16, 18, 20, 22]);
  assert.equal(sum.run.longestKm, 13);
  assert.equal(sum.conditioning.n, 4);
  assert.ok(sum.conditioning.recent[0].includes("AMRAP"));
  assert.deepEqual(sum.pain.map((p) => p.area), ["left knee"]);
  assert.ok(sum.readiness >= 3 && sum.srpe >= 7);
  assert.ok(sum.setsPerMuscleWk.chest > 0);
  const empty = core.trainingSummary([], PROFILE, { today: TODAY });
  assert.equal(empty.last, null);
  assert.deepEqual(empty.lifts, []);
});

// ------------------------------------------------------------------ equipment
test("availableEquipment / exerciseAllowed", () => {
  const gym = core.availableEquipment(PROFILE);
  assert.ok(gym.has("barbell") && gym.has("bench"), "default location + adjustable_bench implies bench");
  assert.ok(core.availableEquipment(PROFILE, "home").has("bands"));
  assert.equal(core.availableEquipment(PROFILE, "nowhere").size, 0);
  assert.equal(core.availableEquipment(null).size, 0);
  assert.deepEqual(core.exerciseAllowed("bench_press", gym), { ok: true, missing: [], anyOf: [] });
  const home = core.exerciseAllowed("bench_press", core.availableEquipment(PROFILE, "home"));
  assert.equal(home.ok, false);
  assert.deepEqual(home.missing, ["barbell", "squat_rack", "bench"]);
  assert.equal(core.exerciseAllowed("push_up", []).ok, true);
  assert.equal(core.exerciseAllowed("lat_pulldown", ["cable_machine"]).ok, true);
  assert.equal(core.exerciseAllowed("nope", gym).unknown, true);
});

test("findSubstitutes: same pattern/muscles, equipment, dislikes, injuries", () => {
  const home = ["dumbbells", "bands", "pullup_bar"];
  const subs = core.findSubstitutes("bench_press", home, PROFILE);
  assert.equal(subs.length, 3);
  for (const id of subs) {
    assert.equal(getExercise(id).pattern, "h_push", id);
    assert.ok(core.exerciseAllowed(id, home).ok, id);
  }
  assert.ok(subs.includes("push_up") || subs.includes("dumbbell_floor_press"));
  const quad = core.findSubstitutes("leg_press", ["leg_extension", "dumbbells"], PROFILE, { limit: 10 });
  assert.ok(!quad.includes("leg_extension"), "disliked");
  // current knee injury ranks deep-knee-flexion options last
  const sq = core.findSubstitutes("back_squat", ["dumbbells", "kettlebell", "leg_press", "hip_thrust_machine"], PROFILE, { limit: 3 });
  assert.ok(sq.length === 3);
  const noInjury = core.findSubstitutes("back_squat", ["dumbbells"], { preferences: { dislikes: [] } }, { limit: 2 });
  assert.equal(getExercise(noInjury[0]).pattern, "squat");
  assert.deepEqual(core.findSubstitutes("nope", [], PROFILE), []);
});

// ------------------------------------------------------------------ plans
function goodPlan() {
  return {
    id: "2026-11-08", status: "draft", weekStart: "2026-11-08", createdAt: "2026-11-07T10:00:00Z", approvedAt: null,
    focus: "Strength base + easy running", rationale: "…",
    workouts: [
      { id: "W1", title: "Upper", type: "strength", locationId: "gym", estMinutes: 55, intent: "", blocks: [
        { kind: "warmup", minutes: 8, items: [{ name: "Row easy", detail: "5 min" }] },
        { kind: "strength", items: [
          { exerciseId: "bench_press", name: "Bench Press", sets: 3, reps: "8-12", targetRir: 2, loadKg: 82.5, restSec: 150, progression: "double", incrementKg: 2.5, alternatives: ["dumbbell_bench_press"], supersetGroup: null },
          { exerciseId: "barbell_row", name: "Barbell Row", sets: 3, reps: "8-12", targetRir: 2, loadKg: 75, restSec: 120, progression: "double", incrementKg: 2.5, alternatives: ["dumbbell_row"], supersetGroup: null },
          { exerciseId: "overhead_press", name: "OHP", sets: 3, reps: "6-10", targetRir: 2, loadKg: 45, progression: "double", alternatives: ["dumbbell_shoulder_press"] },
          { exerciseId: "lat_pulldown", sets: 3, reps: "10-12", targetRir: 2, loadKg: 55, progression: "double", alternatives: ["pull_up"] },
          { exerciseId: "dumbbell_bench_press", sets: 3, reps: "10-12", targetRir: 1, loadKg: 26, progression: "double", alternatives: ["push_up"], supersetGroup: "A" },
          { exerciseId: "chin_up", sets: 3, reps: "6-10", targetRir: 1, loadKg: null, progression: "double", alternatives: ["lat_pulldown"], supersetGroup: "A" }] }] },
      { id: "W2", title: "Easy run", type: "run", locationId: "home", estMinutes: 40, intent: "", blocks: [
        { kind: "run", runType: "easy", warmupMin: 0, cooldownMin: 0, totalKm: 6, segments: [], notes: "" }] },
      { id: "W3", title: "Lower", type: "strength", locationId: "gym", estMinutes: 55, intent: "", blocks: [
        { kind: "warmup", minutes: 8, items: [] },
        { kind: "strength", items: [
          { exerciseId: "back_squat", sets: 3, reps: "5", targetRir: 2, loadKg: 110, progression: "linear", incrementKg: 5, alternatives: ["leg_press"] },
          { exerciseId: "romanian_deadlift", sets: 3, reps: "8-10", targetRir: 2, loadKg: 90, progression: "double", alternatives: ["dumbbell_romanian_deadlift"] },
          { exerciseId: "hip_thrust", sets: 3, reps: "8-12", targetRir: 2, loadKg: 80, progression: "double", alternatives: ["glute_bridge"] },
          { exerciseId: "seated_leg_curl", sets: 3, reps: "10-15", targetRir: 1, loadKg: 45, progression: "double", alternatives: ["nordic_curl"] },
          { exerciseId: "standing_calf_raise", sets: 3, reps: "10-15", targetRir: 1, loadKg: 80, progression: "double", alternatives: ["single_leg_calf_raise"] }] }] },
      { id: "W4", title: "Long run", type: "run", locationId: "home", estMinutes: 70, intent: "", blocks: [
        { kind: "run", runType: "long", warmupMin: 0, cooldownMin: 0, totalKm: 11, segments: [{ reps: 1, distanceM: 11000, durationSec: null, target: { paceSecPerKm: [345, 375], hrZone: 2, rpe: 3 }, recoverySec: 0, recoveryType: "walk" }], notes: "" }] },
    ],
    weeklyTargets: { runKm: 17, conditioningSessions: 0, strengthSetsPerMuscle: {} }, notes: [], validation: null,
  };
}
const OK_PROFILE = { ...PROFILE, injuries: [], schedule: { daysPerWeek: 4, minutesPerSession: 60 } };
const codes = (issues) => [...new Set(issues.map((i) => i.code))].sort();

test("estimateWorkoutMinutes", () => {
  const p = goodPlan();
  // 8 + (3+3+3+3)×2.75 + 3×2.75×0.7 (h_push superset) + 3×2.75×0.7 (v_pull superset) = 8 + 33 + 11.55
  assert.equal(core.estimateWorkoutMinutes(p.workouts[0]), 53);
  assert.equal(core.estimateWorkoutMinutes(p.workouts[1]), 36, "6 km × default 6:00/km");
  assert.equal(core.estimateWorkoutMinutes(p.workouts[1], { easyPaceSecPerKm: 300 }), 30);
  assert.equal(core.estimateWorkoutMinutes(p.workouts[3]), Math.round(11 * 360 / 60), "segment pace mid 360");
  const intervals = { blocks: [{ kind: "run", runType: "intervals", warmupMin: 15, cooldownMin: 10, segments: [{ reps: 6, distanceM: 800, target: { paceSecPerKm: [240, 250] }, recoverySec: 90 }] }] };
  assert.equal(core.estimateWorkoutMinutes(intervals), Math.round(25 + (6 * (0.8 * 245 + 90)) / 60));
  const cond = (b) => core.estimateWorkoutMinutes({ blocks: [b] });
  assert.equal(cond({ kind: "conditioning", format: "AMRAP", minutes: 12, items: [] }), 12);
  assert.equal(cond({ kind: "conditioning", format: "FOR_TIME", timeCapMin: 15, items: [] }), 15);
  assert.equal(cond({ kind: "conditioning", format: "TABATA", workSec: 20, restSec: 10, items: [] }), 4);
  assert.equal(cond({ kind: "conditioning", format: "RFT", rounds: 5, items: [{ exerciseId: "burpee", reps: 10 }, { exerciseId: "row_cal", calories: 15 }] }), 8);
  assert.equal(core.estimateWorkoutMinutes({ blocks: [{ kind: "strength", items: [{ exerciseId: "lateral_raise", sets: 4 }, { exerciseId: "mystery", sets: 2 }] }] }), 11);
  assert.equal(core.estimateWorkoutMinutes(null), 0);
});

test("validatePlan accepts a sound plan and reports stats", () => {
  const v = core.validatePlan(goodPlan(), { profile: OK_PROFILE, sessions: history4w("2026-11-07"), today: TODAY });
  assert.deepEqual(v.errors, [], JSON.stringify(v.errors));
  assert.equal(v.ok, true);
  assert.deepEqual(Object.keys(v.stats).sort(), ["conditioningCount", "longestRunKm", "minutesByWorkout", "runKm", "setsPerMuscle"]);
  assert.equal(v.stats.runKm, 17);
  assert.equal(v.stats.longestRunKm, 11);
  assert.equal(v.stats.conditioningCount, 0);
  assert.equal(v.stats.minutesByWorkout.W1, 53);
  assert.equal(v.stats.setsPerMuscle.chest, 6);
  for (const i of [...v.errors, ...v.warnings]) assert.deepEqual(Object.keys(i).sort(), ["code", "message", "path", "workoutId"]);
});

test("validatePlan: every error code", () => {
  const ctx = { profile: OK_PROFILE, sessions: history4w(), today: TODAY };
  const check = (mutate, code, extraCtx = {}) => {
    const p = goodPlan();
    mutate(p);
    const v = core.validatePlan(p, { ...ctx, ...extraCtx });
    assert.equal(v.ok, false, code);
    assert.ok(v.errors.some((e) => e.code === code), `${code} not in ${JSON.stringify(v.errors)}`);
    return v;
  };
  // SCHEMA
  check((p) => { p.weekStart = "2026-11-09"; }, "SCHEMA");
  check((p) => { p.workouts[0].blocks[1].items[0].sets = 0; }, "SCHEMA");
  check((p) => { p.workouts[1].type = "swim"; }, "SCHEMA");
  check((p) => { p.workouts[2].id = "W1"; }, "SCHEMA");
  check((p) => { p.workouts[3].blocks[0].runType = "jog"; }, "SCHEMA");
  check((p) => { p.workouts[0].blocks.push({ kind: "conditioning", format: "WOD", items: [{ exerciseId: "burpee" }] }); }, "SCHEMA");
  assert.equal(core.validatePlan(null).errors[0].code, "SCHEMA");
  assert.equal(core.validatePlan({ weekStart: "2026-11-08", workouts: [] }).errors[0].code, "SCHEMA");
  // UNKNOWN_EXERCISE (item and alternative)
  const u = check((p) => { p.workouts[0].blocks[1].items[0].exerciseId = "flux_capacitor_press"; }, "UNKNOWN_EXERCISE");
  assert.equal(u.errors.find((e) => e.code === "UNKNOWN_EXERCISE").path, "workouts[0].blocks[1].items[0].exerciseId");
  assert.equal(u.errors.find((e) => e.code === "UNKNOWN_EXERCISE").workoutId, "W1");
  check((p) => { p.workouts[0].blocks[1].items[1].alternatives = ["nope"]; }, "UNKNOWN_EXERCISE");
  // EQUIPMENT_MISSING (strength at home; conditioning item; run with no surface anywhere)
  check((p) => { p.workouts[0].locationId = "home"; }, "EQUIPMENT_MISSING");
  check((p) => { p.workouts[1].blocks.push({ kind: "conditioning", format: "AMRAP", minutes: 10, items: [{ exerciseId: "ski_cal", calories: 10 }] }); }, "EQUIPMENT_MISSING");
  check(() => {}, "EQUIPMENT_MISSING", { profile: { ...OK_PROFILE, equipment: { defaultLocationId: "gym", locations: [{ id: "gym", items: ["barbell", "squat_rack", "adjustable_bench", "dumbbells", "lat_pulldown", "leg_curl", "calf_machine"] }, { id: "home", items: [] }] } } });
  // DISLIKED_EXERCISE (id and free text)
  check((p) => { p.workouts[2].blocks[1].items[3].exerciseId = "leg_extension"; }, "DISLIKED_EXERCISE");
  check((p) => { p.workouts[1].blocks.push({ kind: "conditioning", format: "EMOM", minutes: 10, items: [{ exerciseId: "burpee", reps: 10 }] }); }, "DISLIKED_EXERCISE");
  // WORKOUT_COUNT
  check((p) => { p.workouts.pop(); }, "WORKOUT_COUNT");
  // TOO_LONG (> 60 + 15)
  check((p) => { p.workouts[0].blocks[1].items.forEach((it) => { it.sets = 5; }); }, "TOO_LONG");
  // RUN_RAMP: recent avg 20 km/wk → cap max(23, 25) = 25
  check((p) => { p.workouts[1].blocks[0].totalKm = 15; }, "RUN_RAMP");
  // LONG_RUN_SPIKE: recent longest 13 km → spike above max(16.9, 16)
  const spike = check((p) => { p.workouts[3].blocks[0].totalKm = 17.5; p.workouts[3].blocks[0].segments = []; p.workouts[1].blocks[0].totalKm = 4; }, "LONG_RUN_SPIKE");
  assert.ok(!spike.errors.some((e) => e.code === "RUN_RAMP"));
  // no history: baseline from the profile (15 km/wk, longest 10)
  check((p) => { p.workouts[1].blocks[0].totalKm = 10; }, "RUN_RAMP", { sessions: [] });
});

test("validatePlan: warnings", () => {
  const ctx = { profile: OK_PROFILE, sessions: history4w(), today: TODAY };
  const warns = (mutate, extra = {}) => { const p = goodPlan(); mutate(p); return core.validatePlan(p, { ...ctx, ...extra }).warnings; };
  const low = warns((p) => { p.workouts[2].blocks[1].items.splice(1, 3); });
  assert.ok(low.some((w) => w.code === "VOLUME_LOW" && w.path.endsWith("hamstrings")));
  const high = warns((p) => { p.workouts[0].blocks[1].items.push({ exerciseId: "cable_fly", sets: 12, reps: "12-15", alternatives: ["pec_deck"] }, { exerciseId: "dumbbell_fly", sets: 6, reps: "12", alternatives: ["cable_fly"] }); });
  assert.ok(high.some((w) => w.code === "VOLUME_HIGH" && w.path.endsWith("chest")));
  const inj = warns(() => {}, { profile: { ...OK_PROFILE, injuries: [{ area: "Left knee", status: "current" }] } });
  assert.ok(inj.some((w) => w.code === "INJURY_CONFLICT" && w.workoutId === "W3"));
  assert.ok(!warns(() => {}, { profile: { ...OK_PROFILE, injuries: [{ area: "knee", status: "past" }] } }).some((w) => w.code === "INJURY_CONFLICT"));
  const adj = warns((p) => { p.workouts[1].blocks[0].runType = "intervals"; });
  assert.ok(adj.some((w) => w.code === "HARD_DAYS_ADJACENT" && w.workoutId === "W3"), "intervals then heavy legs");
  assert.ok(!adj.some((w) => w.code === "HARD_DAYS_ADJACENT" && w.workoutId === "W2"), "upper day then intervals is fine");
  const easy = warns((p) => { p.workouts[1].blocks[0].runType = "tempo"; p.workouts[3].blocks[0].runType = "threshold"; });
  assert.ok(easy.some((w) => w.code === "NO_REST_RUN_EASY"));
  const alt = warns((p) => { p.workouts[0].blocks[1].items[0].alternatives = []; p.workouts[0].blocks[1].items[1].alternatives = ["seated_cable_row"]; p.workouts[0].locationId = "gym"; });
  assert.ok(alt.some((w) => w.code === "MISSING_ALTERNATIVES" && w.path === "workouts[0].blocks[1].items[0].alternatives"));
  assert.ok(!alt.some((w) => w.path === "workouts[0].blocks[1].items[1].alternatives"), "cable row is usable");
  const base = warns(() => {});
  assert.deepEqual(codes(base).filter((c) => c !== "VOLUME_LOW"), ["HARD_DAYS_ADJACENT"], JSON.stringify(base));
  assert.deepEqual(base.filter((w) => w.code === "HARD_DAYS_ADJACENT").map((w) => w.workoutId), ["W4"], "heavy legs then the long run");
});

test("validatePlan: TOO_VERBOSE warning for over-long plan text", () => {
  const ctx = { profile: OK_PROFILE, sessions: history4w(), today: TODAY };
  const L = core.PLAN_TEXT_LIMITS;
  assert.deepEqual([L.focusChars, L.rationaleChars, L.rationaleSentences, L.intentChars, L.itemNoteWords, L.prepDetailWords], [60, 220, 2, 90, 8, 6]);
  const verbose = (mutate) => { const p = goodPlan(); mutate(p); return core.validatePlan(p, ctx); };
  assert.ok(!verbose(() => {}).warnings.some((w) => w.code === "TOO_VERBOSE"), "concise plan passes");
  // within limits: exactly at the edges
  const edge = verbose((p) => {
    p.focus = "x".repeat(60);
    p.rationale = "Squat e1RM up 3%. Runs held at 20 km.";
    p.workouts[0].intent = "y".repeat(90);
    p.workouts[0].blocks[1].items[0].notes = "one two three four five six seven eight";
    p.workouts[0].blocks[0].items[0].detail = "5 min easy, then leg swings";
  });
  assert.ok(!edge.warnings.some((w) => w.code === "TOO_VERBOSE"), JSON.stringify(edge.warnings.filter((w) => w.code === "TOO_VERBOSE")));
  const v = verbose((p) => {
    p.focus = "Build squat and bench volume while keeping all runs very easy and conversational";
    p.rationale = "One. Two. Three sentences is one too many.";
    p.notes = ["n".repeat(140)];
    p.workouts[0].intent = "This session exists to progress the bench press and the row while keeping the shoulders healthy and fresh.";
    p.workouts[0].blocks[1].items[0].notes = "Pause one second on the chest and keep the shoulder blades pinned";
    p.workouts[0].blocks[1].items[1].notes = "Brace hard, pull to the lower ribs, no body english at all please";
    p.workouts[0].blocks[0].items[0].detail = "five minutes easy rowing to raise the heart rate";
    p.workouts[1].blocks.push({ kind: "conditioning", format: "AMRAP", minutes: 8, items: [{ exerciseId: "air_squat", reps: 10 }], targetRpe: 7, scaling: "s".repeat(120), notes: "" });
  });
  assert.equal(v.ok, v.errors.length === 0, "warnings never fail a plan");
  assert.ok(!v.errors.some((e) => e.code === "TOO_VERBOSE"), "TOO_VERBOSE is a warning");
  const tv = v.warnings.filter((w) => w.code === "TOO_VERBOSE");
  const plan = tv.find((w) => w.workoutId === null);
  assert.equal(plan.path, "focus");
  assert.match(plan.message, /focus 80\/60 chars/);
  assert.match(plan.message, /rationale .*3\/2 sentences/);
  assert.match(plan.message, /1 plan note over 100 chars/);
  const w1 = tv.find((w) => w.workoutId === "W1");
  assert.equal(w1.path, "workouts[0].intent");
  assert.match(w1.message, /intent \d+\/90 chars/);
  assert.match(w1.message, /2 item notes over 8 words/);
  assert.match(w1.message, /1 warm-up\/cool-down item too long/);
  const w2 = tv.find((w) => w.workoutId === "W2");
  assert.equal(w2.path, "workouts[1].blocks[1].scaling");
  assert.equal(tv.length, 3, "one issue for the plan text + one per wordy workout");
  assert.deepEqual(Object.keys(w1).sort(), ["code", "message", "path", "workoutId"]);
  assert.equal(v.warnings.at(-1).code, "TOO_VERBOSE", "listed after the training warnings");
  const long = verbose((p) => { p.rationale = "r".repeat(221) + "."; });
  assert.ok(long.warnings.some((w) => w.code === "TOO_VERBOSE" && w.path === "rationale"));
});

test("plan brevity: rules, JSON spec and example agree with PLAN_TEXT_LIMITS", () => {
  const L = core.PLAN_TEXT_LIMITS;
  assert.ok(Buffer.byteLength(PLAN_RULES, "utf8") <= 40 * 1024, "PLAN_RULES ≤ 40 KB");
  for (const t of [`≤ ${L.focusChars} char`, `≤ ${L.rationaleChars} char`, `≤ ${L.intentChars} char`, `≤ ${L.itemNoteWords} words`, `≤ ${L.prepDetailWords} words`]) {
    assert.ok(PLAN_RULES.includes(t), `PLAN_RULES mentions ${t}`);
    assert.ok(PLAN_JSON_SPEC.includes(t), `PLAN_JSON_SPEC mentions ${t}`);
  }
  assert.ok(!/2-5 sentences/.test(PLAN_RULES + PLAN_JSON_SPEC));
  const example = { ...JSON.parse(PLAN_EXAMPLE), weekStart: "2026-11-08" };
  const v = core.validatePlan(example, {});
  assert.deepEqual(v.warnings.filter((w) => w.code === "TOO_VERBOSE"), [], "the example obeys the limits");
});

// ------------------------------------------------------------------ logging a planned workout
test("sessionFromWorkout: strength items prefilled from nextTarget", () => {
  const sessions = history4w();
  const plan = goodPlan();
  const w = plan.workouts[0];
  const d = core.sessionFromWorkout(w, { sessions, today: TODAY, planId: plan.id });
  assert.deepEqual([d.id, d.date, d.planId, d.workoutId, d.title, d.type, d.status, d.createdBy, d.durationMin], [null, TODAY, plan.id, "W1", "Upper", "strength", "done", "manual", 55]);
  assert.deepEqual([d.run, d.conditioning, d.pain, d.prs], [null, [], [], []]);
  assert.equal(d.strength.length, 6, "warm-up items are not logged");
  for (const [i, it] of w.blocks[1].items.entries()) {
    const ex = d.strength[i];
    const t = core.nextTarget(sessions, it, { today: TODAY });
    assert.equal(ex.exerciseId, it.exerciseId);
    assert.equal(ex.sets.length, it.sets, `${it.exerciseId} planned set count`);
    assert.ok(ex.sets.every((st) => st.type === "work" && st.rir === it.targetRir), `${it.exerciseId} rir`);
    assert.equal(ex.sets[0].loadKg, t.loadKg ?? it.loadKg, `${it.exerciseId} target load`);
    assert.equal(ex.target.reason, t.reason);
    assert.equal(ex.target.reps, it.reps);
  }
  const bench = d.strength[0];
  assert.equal(bench.name, "Bench Press");
  assert.equal(bench.sets[0].bodyweight, false);
  const chin = d.strength.find((x) => x.exerciseId === "chin_up");
  assert.ok(chin.sets.every((st) => st.bodyweight), "chin-up is a bodyweight movement");
  // normalizeSession-ready: keeps the sets, drops the plan targets
  const n = core.normalizeSession(d, { today: TODAY });
  assert.deepEqual(n.strength[0].sets, bench.sets);
  assert.equal("target" in n.strength[0], false);
  assert.deepEqual([n.planId, n.workoutId, n.createdBy, n.type], [plan.id, "W1", "manual", "strength"]);
  assert.ok(Array.isArray(core.detectPrs(n, sessions)));
});

test("sessionFromWorkout: per-set reps, ranges, AMRAP and no history", () => {
  const last = core.normalizeSession({ date: "2026-11-03", strength: [{ exerciseId: "bench_press", sets: ["80x9@2", "80x9@2", "80x8@2"] }] }, { today: TODAY });
  const item = { exerciseId: "bench_press", sets: 3, reps: "8-12", targetRir: 2, loadKg: null, progression: "double", incrementKg: 2.5 };
  const w = { id: "W1", title: "Push", type: "strength", blocks: [{ kind: "strength", items: [item, { exerciseId: "push_up", sets: 2, reps: "AMRAP", targetRir: null }, { exerciseId: "overhead_press", sets: 2, reps: "6-10", targetRir: "1-2" }] }] };
  const d = core.sessionFromWorkout(w, { sessions: [last], today: TODAY });
  assert.equal(core.nextTarget([last], item, { today: TODAY }).reps, "10/10/9");
  assert.deepEqual(d.strength[0].sets.map((st) => [st.loadKg, st.reps, st.rir]), [[80, 10, 2], [80, 10, 2], [80, 9, 2]]);
  assert.deepEqual(d.strength[1].sets.map((st) => [st.loadKg, st.reps, st.rir, st.bodyweight]), [[null, null, null, true], [null, null, null, true]], "AMRAP leaves reps blank");
  assert.deepEqual(d.strength[2].sets.map((st) => [st.loadKg, st.reps, st.rir]), [[null, 6, 1], [null, 6, 1]], "no history: bottom of range, load blank");
  assert.equal(d.strength[2].target.reason, "no_history");
  assert.ok(d.durationMin > 0, "estimated when estMinutes is missing");
});

test("sessionFromWorkout: run and conditioning blocks", () => {
  const plan = goodPlan();
  const long = core.sessionFromWorkout(plan.workouts[3], { today: TODAY, planId: plan.id });
  assert.equal(long.type, "run");
  assert.deepEqual([long.run.runType, long.run.distanceKm, long.run.durationSec, long.run.avgPaceSecPerKm, long.run.rpe], ["long", 11, 3960, 360, 3]);
  assert.deepEqual(long.run.target.paceSecPerKm, [345, 375]);
  assert.equal(core.normalizeSession(long).run.distanceKm, 11);
  const hybrid = {
    id: "W5", title: "Squat + metcon", type: "hybrid", estMinutes: 50, blocks: [
      { kind: "strength", items: [{ exerciseId: "back_squat", sets: 3, reps: "5", targetRir: 2, loadKg: 100 }] },
      { kind: "conditioning", format: "AMRAP", minutes: 12, items: [{ exerciseId: "wall_ball", reps: 10, loadKg: 6 }, { exerciseId: "burpee", reps: 8 }], targetRpe: 8, scaling: "Lighter ball", notes: "" },
      { kind: "run", runType: "intervals", warmupMin: 10, cooldownMin: 5, segments: [{ reps: 4, distanceM: 400, target: { paceSecPerKm: [250, 260], rpe: 8 }, recoverySec: 90, recoveryType: "jog" }] },
    ],
  };
  const d = core.sessionFromWorkout(hybrid, { today: TODAY, profile: { experience: { running: { easyPaceSecPerKm: 330 } } } });
  assert.equal(d.type, "hybrid");
  assert.deepEqual(d.strength[0].sets.map((st) => [st.loadKg, st.reps]), [[100, 5], [100, 5], [100, 5]]);
  assert.equal(d.conditioning.length, 1);
  const c = d.conditioning[0];
  assert.equal(c.format, "AMRAP");
  assert.match(c.description, /^12 min AMRAP: 10 Wall Ball Shot @ 6 kg, 8 Burpee$/);
  assert.deepEqual(c.result, { rounds: null, reps: null, timeSec: null, calories: null, completed: true });
  assert.deepEqual([c.rpe, c.scaled, c.target.scaling], [8, false, "Lighter ball"]);
  assert.equal(d.run.runType, "intervals");
  assert.equal(d.run.rpe, 8);
  assert.ok(d.run.distanceKm > 1.6 && d.run.durationSec > 15 * 60, JSON.stringify(d.run));
  const none = core.sessionFromWorkout(null, { today: TODAY });
  assert.deepEqual([none.type, none.strength, none.run, none.workoutId, none.date], ["other", [], null, null, TODAY]);
  const mob = core.sessionFromWorkout({ id: "W6", title: "Mobility", type: "mobility", blocks: [{ kind: "mobility", minutes: 20, items: [{ name: "Hips", detail: "90/90" }] }] }, { today: TODAY });
  assert.deepEqual([mob.type, mob.durationMin, mob.strength.length], ["mobility", 20, 0]);
});

// ------------------------------------------------------------------ sessions
test("normalizeSession fills defaults and maps names", () => {
  const s = core.normalizeSession({ date: "2026-11-05", strength: [{ name: "DB bench", sets: ["30x10@2*2", { load: 32, reps: 8, rpe: 9 }] }, { name: "pullups", sets: ["bw+10x6@1"] }, { name: "space lift", sets: [{ loadKg: 5, reps: 3 }] }] }, { today: TODAY, now: new Date("2026-11-05T12:00:00Z") });
  assert.equal(s.type, "strength");
  assert.equal(s.status, "done");
  assert.equal(s.strength[0].exerciseId, "dumbbell_bench_press");
  assert.equal(s.strength[0].name, "DB bench");
  assert.deepEqual(s.strength[0].sets, [
    { type: "work", loadKg: 30, bodyweight: false, reps: 10, rir: 2 }, { type: "work", loadKg: 30, bodyweight: false, reps: 10, rir: 2 },
    { type: "work", loadKg: 32, bodyweight: false, reps: 8, rir: 1 }]);
  assert.deepEqual(s.strength[1], { exerciseId: "pull_up", name: "pullups", sets: [{ type: "work", loadKg: 10, bodyweight: true, reps: 6, rir: 1 }], feedback: null });
  assert.equal(s.strength[2].exerciseId, null);
  for (const k of ["id", "planId", "workoutId", "missedReason", "readiness", "sessionRpe", "run", "durationMin"]) assert.equal(s[k], null, k);
  assert.deepEqual([s.pain, s.conditioning, s.prs], [[], [], []]);
  assert.equal(s.createdBy, "chat");
  assert.equal(s.createdAt, "2026-11-05T12:00:00.000Z");
  assert.ok(s.title.length > 0);

  const run = core.normalizeSession({ run: { distanceKm: 8.2, duration: "45:15" }, readiness: 7, sessionRpe: 6 }, { today: TODAY });
  assert.equal(run.date, TODAY);
  assert.equal(run.type, "run");
  assert.deepEqual([run.run.durationSec, run.run.avgPaceSecPerKm, run.run.runType, run.durationMin], [2715, 331, "easy", 45]);
  assert.equal(run.readiness, 5, "clamped");
  assert.equal(core.normalizeSession({ run: { distanceKm: 5, pace: "5:00/km" } }).run.durationSec, 1500);

  const hy = core.normalizeSession({ strength: [{ exerciseId: "back_squat", reps: [5, 5, 4], loadKg: 100, rir: 1 }], conditioning: [{ format: "for time", description: "21-15-9", result: { time: "8:30" } }] });
  assert.equal(hy.type, "hybrid");
  assert.equal(hy.strength[0].sets.length, 3);
  assert.deepEqual(hy.strength[0].sets.map((x) => x.reps), [5, 5, 4]);
  assert.deepEqual(hy.conditioning[0].result, { rounds: null, reps: null, timeSec: 510, calories: null, completed: true });
  assert.equal(hy.conditioning[0].format, "FOR_TIME");

  const missed = core.normalizeSession({ status: "missed", missedReason: "sick", pain: [{ area: "knee", score: 12 }] });
  assert.deepEqual([missed.status, missed.missedReason, missed.type, missed.pain[0].score, missed.pain[0].when], ["missed", "sick", "other", 10, "during"]);
  assert.equal(core.normalizeSession(null).type, "other");
});

// ------------------------------------------------------------------ rotation
test("rotation: nextWorkout / markWorkoutDone", () => {
  const plan = { ...goodPlan(), status: "agreed" };
  let state = { rotation: { planId: null, done: [] } };
  assert.equal(core.nextWorkout(plan, state).id, "W1", "rotation from another plan counts as empty");
  assert.equal(core.nextWorkout({ ...plan, status: "draft" }, state), null);
  let rot = core.markWorkoutDone(state, plan, "W1");
  assert.deepEqual(rot, { planId: plan.id, done: ["W1"] });
  state = { rotation: rot };
  assert.equal(core.nextWorkout(plan, state).id, "W2");
  rot = core.markWorkoutDone(state, plan, "W3"); // out of order is fine; W2 stays up next
  assert.deepEqual(core.markWorkoutDone({ rotation: rot }, plan, "W3"), rot, "no duplicates");
  assert.deepEqual(core.markWorkoutDone({ rotation: rot }, plan, "W9"), rot, "unknown id ignored");
  assert.equal(core.nextWorkout(plan, { rotation: rot }).id, "W2");
  rot = ["W2", "W4"].reduce((r, id) => core.markWorkoutDone({ rotation: r }, plan, id), rot);
  assert.equal(core.nextWorkout(plan, { rotation: rot }), null, "week complete");
  assert.ok(Object.isFrozen(plan) === false && state.rotation.done.length === 1, "inputs not mutated");
});

// ------------------------------------------------------------------ live (in-progress) workout
test("live workout: stepValue clamps, rounds and steps from empty", () => {
  assert.equal(core.stepValue(100, 2.5), 102.5);
  assert.equal(core.stepValue("100", -2.5), 97.5);
  assert.equal(core.stepValue(null, 2.5), 2.5, "bodyweight + 2.5 kg");
  assert.equal(core.stepValue("", -2.5), 0, "never below min");
  assert.equal(core.stepValue(1, -1, { min: 1 }), 1);
  assert.equal(core.stepValue(10, 1, { min: 1, max: 10 }), 10);
  assert.equal(core.stepValue(0.1, 0.2), 0.3, "no float noise");
});

test("live workout: liveProgress and liveSessionInput log only ticked work", () => {
  const live = {
    planId: "p1", workoutId: "W1", title: "Lower A", type: "hybrid", date: "2026-11-07", startedAt: 0, plannedMin: 60,
    readiness: 4, sessionRpe: "7", notes: " good ", pain: [{ area: " Knee ", score: 2, when: "during" }, { area: "", score: 5 }],
    strength: [
      { exerciseId: "back_squat", name: "Back squat", feedback: "Hard", sets: [
        { loadKg: 100, reps: 5, rir: 2, done: true }, { loadKg: "97.5", reps: "5", rir: "", done: true }, { loadKg: 100, reps: 5, rir: 2, done: false },
      ] },
      { exerciseId: "pull_up", name: "Pull-up", sets: [{ loadKg: null, reps: 8, rir: null, bodyweight: true, done: true }] },
      { exerciseId: "leg_press", name: "Leg press", sets: [{ loadKg: 160, reps: 12, done: false }] },
    ],
    run: { runType: "tempo", distanceKm: 5, durationSec: 1500, rpe: 7, done: false },
    conditioning: [{ format: "AMRAP", description: "12 min", result: { rounds: 5, reps: 3 }, rpe: 8, feedback: "easy", done: true }],
  };
  assert.deepEqual(core.liveProgress(live), { done: 4, total: 7, sets: 5, setsDone: 3 });
  const s = core.liveSessionInput(live, { now: 48 * 60000 });
  assert.equal(s.status, "partial");
  assert.equal(s.durationMin, 48, "elapsed minutes");
  assert.deepEqual(s.strength.map((e) => [e.exerciseId, e.sets.length, e.feedback]), [["back_squat", 2, "hard"], ["pull_up", 1, null]]);
  assert.deepEqual(s.strength[0].sets[1], { type: "work", loadKg: 97.5, bodyweight: false, reps: 5, rir: null });
  assert.equal(s.strength[1].sets[0].bodyweight, true);
  assert.equal(s.run, null, "unticked run left out");
  assert.equal(s.conditioning.length, 1);
  assert.deepEqual(s.conditioning[0].result, { rounds: 5, reps: 3, timeSec: null, calories: null, completed: true });
  assert.deepEqual([s.sessionRpe, s.notes, s.pain], [7, "good", [{ area: "knee", score: 2, when: "during" }]]);
  assert.equal(core.liveSessionInput(live, { now: 2 * 60000 }).durationMin, 60, "too short a timer falls back to the plan estimate");
  assert.equal(core.liveSessionInput({ ...live, durationMin: "55" }, { now: 2 * 60000 }).durationMin, 55, "explicit minutes win");

  const all = { ...live, strength: live.strength.map((e) => ({ ...e, sets: e.sets.map((x) => ({ ...x, done: true })) })), run: { ...live.run, done: true } };
  const full = core.liveSessionInput(all, { now: 60 * 60000 });
  assert.equal(full.status, "done");
  assert.equal(full.run.avgPaceSecPerKm, 300);
  const norm = core.normalizeSession(full, { today: "2026-11-07" });
  assert.equal(norm.strength.length, 3);
  assert.equal(norm.type, "hybrid");
});
