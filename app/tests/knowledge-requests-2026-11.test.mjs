// Code-support requests of the 2026-11 knowledge review (docs/reviews/2026-11-knowledge-review.md):
// Plan.block and the deload counter, deloadDue → deload, digest.block, pattern frequency, rotation wrap-around,
// rep tests, the run down week and the race timeline; plus the DELOAD_NOT_REDUCED warning.

import test from "node:test";
import assert from "node:assert/strict";

import * as core from "../src/core.js";
import { buildWeeksSinceDeload, eventTimeline, progressionDigest } from "../src/progress.js";
import {
  PLAN_BLOCK_PHASES, PLAN_EXAMPLE, PLAN_JSON_SPEC, buildPlanPrompt, compactPlan, expandPlan, formatDigest, normalizePlanBlock,
} from "../src/prompts/plan.js";

const TODAY = "2026-11-07"; // Saturday; the latest plan week started Sunday 2026-11-01
const adj = (d, scope, id) => d.adjustments.find((a) => a.scope === scope && (id === undefined || a.id === id));
const addDays = (iso, n) => new Date(Date.parse(`${iso}T00:00:00Z`) + n * 86400000).toISOString().slice(0, 10);

function profile(over = {}) {
  return {
    goals: { modalities: { strength: true, running: true, conditioning: false }, event: null },
    schedule: { daysPerWeek: 1, minutesPerSession: 60 },
    experience: { level: "intermediate", running: { currentWeeklyKm: 10, longestRecentRunKm: 6 } },
    injuries: [], preferences: { likes: [], dislikes: [] },
    ...over,
  };
}
/** A one-workout squat plan for the week starting `weekStart`. */
function plan(weekStart, { focus = "Build", notes = [], block, status = "archived", progression = "linear" } = {}) {
  return {
    id: weekStart, status, weekStart, focus, notes, ...(block !== undefined ? { block } : {}),
    workouts: [{ id: "W1", title: "Squat", type: "strength", locationId: "gym", blocks: [{ kind: "strength", items: [
      { exerciseId: "back_squat", name: "Back squat", sets: 3, reps: "5", targetRir: 2, loadKg: 100, progression, incrementKg: 2.5, alternatives: [] },
    ] }] }],
  };
}
/** Six weekly plans ending with the agreed plan of 2026-11-01. */
const sixPlans = (over = () => ({})) => [0, 1, 2, 3, 4, 5].map((i) => {
  const ws = addDays("2026-11-01", -7 * (5 - i));
  return plan(ws, { status: i === 5 ? "agreed" : "archived", ...over(i) });
});
let seq = 0;
function squat(date, load, reps, rir = 2, planId = "2026-11-01") {
  return { id: `q${++seq}`, date, planId, workoutId: "W1", type: "strength", status: "done", createdAt: `${date}T10:00:00Z`,
    strength: [{ exerciseId: "back_squat", name: "Back squat", sets: reps.map((r, i) => ({ type: "work", loadKg: Array.isArray(load) ? load[i] : load, reps: r, rir: Array.isArray(rir) ? rir[i] : rir })) }] };
}
const easyHistory = () => [squat("2026-10-26", 97.5, [5, 5, 5], 2, "2026-10-25"), squat("2026-11-02", 100, [5, 5, 5])];

// ---------------------------------------------------------------- 1. Plan.block and the deload counter

test("deload counter: plain words in notes no longer reset it; block.phase does; old plans fall back to focus", () => {
  // the request's example: a note "deload next week" used to stop the count
  assert.equal(buildWeeksSinceDeload(sixPlans((i) => (i === 4 ? { notes: ["Deload next week if sleep stays poor"] } : {})), TODAY), 6);
  // older plans without block: a deload focus still ends the block
  assert.equal(buildWeeksSinceDeload(sixPlans((i) => (i === 3 ? { focus: "Deload: half the sets" } : {})), TODAY), 2);
  // with block, the phase decides and the focus words do not
  assert.equal(buildWeeksSinceDeload(sixPlans((i) => (i === 3 ? { focus: "Build", block: { week: 4, phase: "deload" } } : {})), TODAY), 2);
  assert.equal(buildWeeksSinceDeload(sixPlans((i) => (i === 3 ? { focus: "Deload talk in focus", block: { week: 4, phase: "build" } } : {})), TODAY), 6);
  // return, taper and race weeks also end a block; a test week is a build week
  for (const phase of ["return", "taper", "race"]) assert.equal(buildWeeksSinceDeload(sixPlans((i) => (i === 4 ? { block: { week: 1, phase } } : {})), TODAY), 1, phase);
  assert.equal(buildWeeksSinceDeload(sixPlans((i) => (i === 4 ? { block: { week: 5, phase: "test" } } : {})), TODAY), 6);
  // drafts and future plans do not count; two plans of one week count once
  const ps = sixPlans();
  ps.push({ ...plan("2026-11-08", { status: "draft" }) }, { ...plan("2026-11-01", { status: "archived" }), id: "2026-11-01-2" });
  assert.equal(buildWeeksSinceDeload(ps, TODAY), 6);
});

test("normalizePlanBlock: fixed shape, synonyms, fallback", () => {
  assert.deepEqual(PLAN_BLOCK_PHASES, ["build", "deload", "test", "taper", "race", "return"]);
  assert.deepEqual(normalizePlanBlock({ week: 3, phase: "build" }), { week: 3, phase: "build" });
  assert.deepEqual(normalizePlanBlock({ week: "Wk 4", phase: "Deload" }), { week: 4, phase: "deload" });
  assert.deepEqual(normalizePlanBlock({ phase: "cutback" }, { week: 7, phase: "deload" }), { week: 7, phase: "deload" });
  assert.deepEqual(normalizePlanBlock({ week: 2 }), { week: 2, phase: "build" });
  assert.deepEqual(normalizePlanBlock(null, { week: 2, phase: "build", weeksSinceDeload: 1 }), { week: 2, phase: "build" });
  assert.equal(normalizePlanBlock({ phase: "nonsense" }), null);
  assert.equal(normalizePlanBlock(undefined), null);
});

test("expandPlan: block defaults to the digest's, is normalized, survives compactPlan; old plans stay unchanged", () => {
  const reply = { focus: "Wk 2", rationale: "r", workouts: [{ title: "Run", estMinutes: 30, intent: "i", blocks: [{ kind: "run", runType: "easy", totalKm: 4, segments: [] }] }] };
  assert.deepEqual(expandPlan(reply, { block: { week: 2, phase: "build", weeksSinceDeload: 1, deloadDue: false } }).block, { week: 2, phase: "build" });
  assert.deepEqual(expandPlan({ ...reply, block: { week: 7, phase: "deload" } }, { block: { week: 7, phase: "build" } }).block, { week: 7, phase: "deload" }, "the model's own block wins");
  assert.equal("block" in expandPlan(reply), false, "no block and no default: no key (older plans pass through)");
  const full = expandPlan({ ...reply, block: { week: 3, phase: "test" } });
  assert.deepEqual(compactPlan(full).block, { week: 3, phase: "test" });
  assert.match(PLAN_EXAMPLE, /"block":\{"week":3,"phase":"build"\}/);
  assert.match(PLAN_JSON_SPEC, /"block"\?=digest\.block/);
  assert.doesNotMatch(PLAN_JSON_SPEC, /deload hints/, "the spec no longer invites deload words in notes");
});

// ---------------------------------------------------------------- 2 + 3. deloadDue → deload; digest.block

test("deloadDue without fatigue signals sets the deload week itself; digest.block carries the count", () => {
  const d = progressionDigest({ sessions: easyHistory(), plans: sixPlans(), profile: profile(), today: TODAY });
  assert.equal(d.signals, undefined, "no fatigue signals");
  assert.equal(d.deloadDue, true);
  assert.deepEqual(d.block, { week: 7, phase: "deload", weeksSinceDeload: 6, deloadDue: true });
  const w = adj(d, "week");
  assert.equal(w.act, "deload");
  assert.match(w.why, /6 build weeks since the last deload/);
  assert.doesNotMatch(w.why, /deload due soon/);
  assert.equal(adj(d, "strength", "back_squat").act, "deload");

  // five build weeks: not due yet, block week 6
  const five = progressionDigest({ sessions: easyHistory(), plans: sixPlans().slice(1), profile: profile(), today: TODAY });
  assert.deepEqual(five.block, { week: 6, phase: "build", weeksSinceDeload: 5, deloadDue: false });
  assert.equal(adj(five, "week").act, "progress");

  // after a deload week: Wk 1 of a new block
  const after = progressionDigest({ sessions: easyHistory(), plans: sixPlans((i) => (i === 5 ? { block: { week: 7, phase: "deload" } } : {})), profile: profile(), today: TODAY });
  assert.deepEqual(after.block, { week: 1, phase: "build", weeksSinceDeload: 0, deloadDue: false });

  // first plan, no history: Wk 1
  assert.deepEqual(progressionDigest({ profile: profile(), today: TODAY }).block, { week: 1, phase: "build", weeksSinceDeload: 0, deloadDue: false });
});

test("deloadDue: the novice exception (linear progression, no hold or fatigue flag) keeps building", () => {
  const novice = profile({ experience: { level: "novice" } });
  const d = progressionDigest({ sessions: easyHistory(), plans: sixPlans(), profile: novice, today: TODAY });
  assert.equal(adj(d, "week").act, "progress");
  assert.match(adj(d, "week").why, /novice still progressing linearly/);
  assert.equal(d.block.phase, "build");
  assert.equal(d.block.deloadDue, true);
  // a hold on the lift ends the exception
  const hard = easyHistory();
  hard[1].strength[0].feedback = "hard";
  assert.equal(adj(progressionDigest({ sessions: hard, plans: sixPlans(), profile: novice, today: TODAY }), "week").act, "deload");
  // not on linear progression: no exception
  const dbl = sixPlans((i) => ({ progression: "double" }));
  assert.equal(adj(progressionDigest({ sessions: easyHistory(), plans: dbl, profile: novice, today: TODAY }), "week").act, "deload");
});

test("the digest key tells the model to use digest.block, not the previous focus", () => {
  const d = progressionDigest({ sessions: easyHistory(), plans: sixPlans(), profile: profile(), today: TODAY });
  const text = formatDigest(d);
  assert.match(text, /block = the week you are writing, counted by the app \(not from focus text\)/);
  assert.match(text, /"block":\{"week":7,"phase":"deload","weeksSinceDeload":6,"deloadDue":true\}/);
});

// ---------------------------------------------------------------- 8. race timeline

test("eventTimeline: base → build → race-specific → taper → race week → post-race", () => {
  const ev = { type: "race", distanceKm: 10, date: "2027-03-07" }; // a Sunday; taper from 2027-02-25
  const stage = (ws) => eventTimeline(ev, ws)?.stage ?? null;
  assert.equal(stage("2026-11-08"), "base");
  assert.equal(stage("2026-12-27"), "build", "≤ 10 weeks out");
  assert.equal(stage("2027-01-31"), "race-specific", "≤ 6 weeks before the taper");
  assert.equal(stage("2027-02-28"), "taper");
  assert.equal(stage("2027-03-07"), "race week");
  assert.equal(stage("2027-03-14"), "post-race");
  assert.equal(stage("2027-03-21"), null, "more than a week past");
  assert.deepEqual(eventTimeline(ev, "2027-02-28"), { date: "2027-03-07", km: 10, weeksOut: 1, taperFrom: "2027-02-25", stage: "taper" });
  assert.equal(eventTimeline({ distanceKm: 42.2, date: "2027-03-07" }, "2027-02-14").stage, "taper", "marathon: 3-week taper");
  assert.equal(eventTimeline(null, "2027-02-14"), null);
  assert.equal(eventTimeline({ date: "soon" }, "2027-02-14"), null);
});

test("digest.event and the taper: block.phase taper, and a due deload is left to the taper", () => {
  const p = profile({ goals: { modalities: { strength: true, running: true }, event: { type: "race", distanceKm: 10, date: "2026-11-15" } } });
  const d = progressionDigest({ sessions: easyHistory(), plans: sixPlans(), profile: p, today: TODAY, planWeekStart: "2026-11-08" });
  assert.equal(d.event.stage, "taper");
  assert.equal(d.block.phase, "taper");
  assert.equal(adj(d, "week").act, "progress");
  assert.match(adj(d, "week").why, /the taper replaces it/);
  const race = progressionDigest({ sessions: easyHistory(), plans: sixPlans().slice(1), profile: p, today: TODAY, planWeekStart: "2026-11-15" });
  assert.equal(race.block.phase, "race");
  // default plan week: the latest plan covers this week → next Sunday
  assert.equal(progressionDigest({ sessions: easyHistory(), plans: sixPlans(), profile: p, today: TODAY }).event.stage, "taper");
});

// ---------------------------------------------------------------- 7. run down week

function runs(kmByWeek) {
  const out = [];
  kmByWeek.forEach((km, i) => {
    const ws = addDays("2026-10-18", 7 * i);
    out.push({ id: `r${++seq}`, date: addDays(ws, 2), type: "run", status: "done", createdAt: `${addDays(ws, 2)}T07:00:00Z`,
      run: { runType: "easy", distanceKm: km / 2, durationSec: Math.round((km / 2) * 360), avgPaceSecPerKm: 360, rpe: 4 } });
    out.push({ id: `r${++seq}`, date: addDays(ws, 5), type: "run", status: "done", createdAt: `${addDays(ws, 5)}T07:00:00Z`,
      run: { runType: "long", distanceKm: km / 2, durationSec: Math.round((km / 2) * 360), avgPaceSecPerKm: 360, rpe: 4 } });
  });
  return out;
}

test("run down week: three level or rising weeks of completed km → −20-30 %, long run ~80 %", () => {
  const d = progressionDigest({ sessions: runs([10, 11, 12]), plans: [], profile: profile(), today: TODAY });
  assert.deepEqual(d.run.kmWk.slice(-3), [10, 11, 12]);
  const r = adj(d, "run");
  assert.equal(r.act, "reduce_volume");
  assert.equal(r.downWeek, true);
  assert.equal(r.kmMax, 9.6);
  assert.equal(r.longMax, 4.8);
  assert.match(r.why, /down week/);
  // a drop inside the three weeks (a down week already happened): progress
  const after = progressionDigest({ sessions: runs([12, 9, 12]), plans: [], profile: profile(), today: TODAY });
  assert.equal(adj(after, "run").act, "progress");
  assert.equal(adj(after, "run").downWeek, undefined);
  // only two weeks of running: no down week yet
  assert.equal(adj(progressionDigest({ sessions: runs([0, 11, 12]).filter((s) => s.run.distanceKm > 0), plans: [], profile: profile(), today: TODAY }), "run").act, "progress");
  // mid-week the current week is still filling up: the three full weeks before it are judged
  const mid = progressionDigest({ sessions: runs([10, 11, 12, 3]).filter((s) => s.date <= "2026-11-10"), plans: [], profile: profile(), today: "2026-11-10" });
  assert.equal(adj(mid, "run").downWeek, true);
});

// ---------------------------------------------------------------- 4, 5 and the deload warning: validatePlan

const strengthW = (id, ids, sets = 3) => ({ id, title: id, type: "strength", locationId: null, estMinutes: 50, intent: "", blocks: [{ kind: "strength", items: ids.map((exerciseId) => ({
  exerciseId, sets, reps: "5", targetRir: 2, loadKg: null, restSec: 120, progression: "double", alternatives: [] })) }] });
const runW = (id, runType, km = 6) => ({ id, title: id, type: "run", locationId: null, estMinutes: 40, intent: "", blocks: [{ kind: "run", runType, totalKm: km, segments: [] }] });
const vplan = (workouts, extra = {}) => ({ weekStart: "2026-11-08", focus: "f", rationale: "r", workouts, notes: [], ...extra });
const warnCodes = (p, opts = {}) => core.validatePlan(p, { profile: null, sessions: [], today: TODAY, ...opts }).warnings;

test("PATTERN_FREQUENCY: a main pattern once a week despite ≥ 2 strength workouts", () => {
  const fullBodyAB = vplan([strengthW("W1", ["back_squat", "bench_press", "barbell_row"]), strengthW("W2", ["romanian_deadlift", "overhead_press", "lat_pulldown"])]);
  assert.deepEqual(warnCodes(fullBodyAB).filter((w) => w.code === "PATTERN_FREQUENCY"), []);
  const upperLower = vplan([strengthW("W1", ["bench_press", "barbell_row"]), strengthW("W2", ["back_squat", "romanian_deadlift"])]);
  const ul = warnCodes(upperLower).filter((w) => w.code === "PATTERN_FREQUENCY");
  assert.equal(ul.length, 3);
  assert.match(ul[0].message, /1 of 2 strength workouts/);
  // four strength workouts: squat and hinge are checked apart
  const ulx2 = vplan([strengthW("W1", ["bench_press", "barbell_row"]), strengthW("W2", ["back_squat", "romanian_deadlift"]),
    strengthW("W3", ["overhead_press", "lat_pulldown"]), strengthW("W4", ["back_squat"])]);
  const f4 = warnCodes(ulx2).filter((w) => w.code === "PATTERN_FREQUENCY");
  assert.deepEqual(f4.map((w) => w.message.split(" ")[0]), ["hinge"]);
  // one strength workout, or strength not a goal: no check
  assert.deepEqual(warnCodes(vplan([strengthW("W1", ["bench_press"]), runW("W2", "easy")])).filter((w) => w.code === "PATTERN_FREQUENCY"), []);
  assert.deepEqual(warnCodes(upperLower, { profile: { goals: { modalities: { strength: false } } } }).filter((w) => w.code === "PATTERN_FREQUENCY"), []);
});

test("HARD_DAYS_ADJACENT wraps last → first (≥ 4 workouts), except after the long run", () => {
  const wrap = (last) => warnCodes(vplan([runW("W1", "intervals"), strengthW("W2", ["bench_press"]), strengthW("W3", ["barbell_row"]), last]))
    .filter((w) => w.code === "HARD_DAYS_ADJACENT");
  const t = wrap(runW("W4", "tempo"));
  assert.deepEqual(t.map((w) => w.workoutId), ["W1"]);
  assert.match(t[0].message, /W4 and W1 .* rotation starts again/);
  assert.deepEqual(wrap(runW("W4", "long", 10)), [], "the long run last is the accepted boundary");
  assert.deepEqual(wrap(runW("W4", "easy")), []);
  const three = warnCodes(vplan([runW("W1", "intervals"), strengthW("W2", ["bench_press"]), runW("W3", "tempo")])).filter((w) => w.code === "HARD_DAYS_ADJACENT");
  assert.deepEqual(three, [], "3-day rotations run on non-consecutive days");
});

test("DELOAD_NOT_REDUCED: block.phase deload with strength sets not cut vs the previous plan", () => {
  const prev = vplan([strengthW("W1", ["back_squat", "bench_press", "barbell_row"], 4), strengthW("W2", ["romanian_deadlift", "overhead_press", "lat_pulldown"], 4)]);
  const same = { ...prev, block: { week: 7, phase: "deload" } };
  const w = warnCodes(same, { previousPlan: prev }).filter((x) => x.code === "DELOAD_NOT_REDUCED");
  assert.equal(w.length, 1);
  assert.match(w[0].message, /24 strength sets vs 24/);
  const half = { ...vplan([strengthW("W1", ["back_squat", "bench_press", "barbell_row"], 2), strengthW("W2", ["romanian_deadlift", "overhead_press", "lat_pulldown"], 2)]), block: { week: 7, phase: "deload" } };
  assert.deepEqual(warnCodes(half, { previousPlan: prev }).filter((x) => x.code === "DELOAD_NOT_REDUCED"), []);
  assert.deepEqual(warnCodes({ ...prev, block: { week: 3, phase: "build" } }, { previousPlan: prev }).filter((x) => x.code === "DELOAD_NOT_REDUCED"), []);
  assert.deepEqual(warnCodes(same).filter((x) => x.code === "DELOAD_NOT_REDUCED"), [], "no previous plan: nothing to compare");
});

// ---------------------------------------------------------------- 6. rep tests

test("rep test: a last set well above the planned reps feeds e1RM and the next target sensibly", () => {
  const hist = [
    squat("2026-10-05", 100, [5, 5, 5]), squat("2026-10-12", 102.5, [5, 5, 5]), squat("2026-10-19", 105, [5, 5, 5]),
    squat("2026-10-26", 107.5, [5, 5, 11], [2, 2, 1]), // "max reps, 1 in reserve" on the last set
  ];
  const test1 = core.exerciseStats(hist, "back_squat");
  assert.equal(test1.bestE1rm, Math.round(107.5 * (1 + 12 / 30) * 10) / 10, "the test set raises the best e1RM");
  assert.equal(test1.trend.at(-1).e1rm, Math.round(107.5 * (1 + 7 / 30) * 10) / 10, "the trend compares like with like");
  // the normal session after the test is not read as fatigue (or a stall)
  const after = core.exerciseStats([...hist, squat("2026-11-02", 110, [5, 5, 5])], "back_squat");
  assert.equal(after.flag, null, JSON.stringify(after.trend));

  // next target after the test: progress as usual, never a jump from the test's e1RM
  const lin = core.nextTarget(hist, { exerciseId: "back_squat", sets: 3, reps: "5", targetRir: 2, progression: "linear", incrementKg: 2.5 }, { today: TODAY });
  assert.deepEqual([lin.reason, lin.loadKg, lin.flags.includes("effort_overshoot")], ["add_load", 110, false]);
  const rpeHist = [squat("2026-10-26", 100, [5, 5, 10], [3, 3, 1])];
  const rpe = core.nextTarget(rpeHist, { exerciseId: "back_squat", sets: 3, reps: "5", targetRir: 2, progression: "rpe", incrementKg: 2.5 }, { today: TODAY });
  assert.equal(rpe.reason, "rpe_increase", "effort is judged on the regular sets, not the test set");
  assert.ok(rpe.loadKg <= 102.5, `${rpe.loadKg}`);
  const dblHist = [squat("2026-10-26", 60, [10, 10, 16], [2, 2, 1])];
  const dbl = core.nextTarget(dblHist, { exerciseId: "back_squat", sets: 3, reps: "8-10", targetRir: 2, progression: "double", incrementKg: 2.5 }, { today: TODAY });
  assert.deepEqual([dbl.reason, dbl.loadKg, dbl.reps], ["add_load", 62.5, "8"]);
  // the digest passes the normal progression on
  const d = progressionDigest({ sessions: [...hist, squat("2026-11-02", 110, [5, 5, 5])], plans: [plan("2026-11-01", { status: "agreed" })], profile: profile(), today: TODAY });
  assert.equal(adj(d, "strength", "back_squat").act, "progress");
  assert.equal(adj(d, "strength", "back_squat").kg, 112.5);
});

test("withoutRepTest: only a clearly longer last set at a similar load is a test", () => {
  const s = (loadKg, reps) => ({ type: "work", loadKg, reps, rir: 2 });
  assert.equal(core.withoutRepTest([s(100, 5), s(100, 5), s(100, 11)]).length, 2);
  assert.equal(core.withoutRepTest([s(100, 5), s(100, 5), s(100, 7)]).length, 3, "+2 reps is not a test");
  assert.equal(core.withoutRepTest([s(100, 5), s(100, 5), s(60, 15)]).length, 3, "a light back-off set is not a test");
  assert.equal(core.withoutRepTest([s(100, 5), s(100, 12)]).length, 2, "needs two regular sets");
});

// ---------------------------------------------------------------- prompt

test("plan prompt: digest.block in the digest, notes no longer invite deload hints", () => {
  const d = progressionDigest({ sessions: easyHistory(), plans: sixPlans(), profile: profile(), today: TODAY });
  const prompt = buildPlanPrompt({ rules: "rules", today: TODAY, weekStart: "2026-11-08", workoutCount: 1, profile: profile(), digest: d, allowedLocations: [] });
  assert.match(prompt, /"block":\{"week":7,"phase":"deload"/);
  assert.match(prompt, /"block"\?=digest\.block/);
  assert.doesNotMatch(prompt, /deload hints/);
});
