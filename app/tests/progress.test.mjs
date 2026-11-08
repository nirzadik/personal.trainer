// Tests for src/progress.js (progressionDigest) and the digest-led plan prompt (owner: Agent P).

import test from "node:test";
import assert from "node:assert/strict";

import { progressionDigest, DIGEST_MAX_BYTES, DIGEST_ACTIONS } from "../src/progress.js";
import { buildPlanPrompt, profileForPlan, ADAPT_INSTRUCTION, DIGEST_HEADING, PLAN_PROMPT_MARKER, PROFILE_HEADING } from "../src/prompts/plan.js";
import { PLAN_RULES } from "../src/knowledge/plan.js";
import { createCoach } from "../src/brain.js";
import { createMockSample } from "../src/sample-mock.js";
import * as core from "../src/core.js";
import * as catalog from "../src/catalog.js";
import * as knowledge from "../src/knowledge/index.js";

const TODAY = "2026-11-07"; // Saturday; the plan week started Sunday 2026-11-01
const bytes = (v) => Buffer.byteLength(JSON.stringify(v), "utf8");
const adj = (d, scope, id) => d.adjustments.find((a) => a.scope === scope && (id === undefined || a.id === id));

function profile(over = {}) {
  return {
    version: 1, onboarded: true, name: "Sam",
    goals: { primary: "strength + 10k", modalities: { strength: true, running: true, conditioning: true } },
    schedule: { daysPerWeek: 4, minutesPerSession: 60 },
    equipment: { defaultLocationId: "gym", locations: [{ id: "gym", name: "Gym", items: ["barbell", "plates", "squat_rack", "bench", "dumbbells", "outdoor_route", "rower"] }] },
    experience: {
      level: "intermediate",
      running: { currentWeeklyKm: 30, longestRecentRunKm: 14, easyPaceSecPerKm: 330 },
      conditioning: { experience: "some" },
      knownLifts: [{ exerciseId: "back_squat", loadKg: 80, reps: 5, rir: 2 }, { exerciseId: "deadlift", loadKg: 140, reps: 5, rir: 2 }],
    },
    preferences: { likes: [], dislikes: [] },
    injuries: [],
    ...over,
  };
}

function plan(id, weekStart, status = "agreed") {
  return {
    id, status, weekStart, focus: "Build", rationale: "", notes: [],
    workouts: [
      { id: "W1", title: "Lower A", type: "strength", locationId: "gym", blocks: [{ kind: "strength", items: [
        { exerciseId: "back_squat", name: "Back squat", sets: 3, reps: "5", targetRir: 2, loadKg: 100, progression: "linear", incrementKg: 2.5, alternatives: [] },
      ] }] },
      { id: "W2", title: "Tempo", type: "run", locationId: "gym", blocks: [{ kind: "run", runType: "tempo", totalKm: 8, segments: [
        { reps: 1, distanceM: 1500, target: { paceSecPerKm: [360, 380] } },
        { reps: 1, distanceM: 5000, target: { paceSecPerKm: [300, 310] } },
      ] }] },
      { id: "W3", title: "Upper A", type: "strength", locationId: "gym", blocks: [{ kind: "strength", items: [
        { exerciseId: "bench_press", name: "Bench press", sets: 3, reps: "8-10", targetRir: 2, loadKg: 70, progression: "double", incrementKg: 2.5, alternatives: [] },
      ] }] },
      { id: "W4", title: "Easy run + metcon", type: "hybrid", locationId: "gym", blocks: [
        { kind: "run", runType: "easy", totalKm: 6, segments: [{ reps: 1, distanceM: 6000, target: { paceSecPerKm: [330, 350] } }] },
        { kind: "conditioning", format: "AMRAP", minutes: 10, targetRpe: 7, items: [{ exerciseId: "burpee", name: "Burpee", reps: 10 }] },
      ] },
    ],
  };
}

let seq = 0;
function sq(date, planId, load, reps, rir, feedback = null, extra = {}) {
  return { id: `s${++seq}`, date, planId, workoutId: "W1", type: "strength", status: "done", createdAt: `${date}T10:00:00Z`,
    strength: [{ exerciseId: "back_squat", name: "Back squat", feedback, sets: reps.map((r) => ({ type: "work", loadKg: load, reps: r, rir })) }], ...extra };
}
function bench(date, planId, load, reps, rir, feedback = null) {
  return { id: `s${++seq}`, date, planId, workoutId: "W3", type: "strength", status: "done", createdAt: `${date}T10:00:00Z`,
    strength: [{ exerciseId: "bench_press", name: "Bench press", feedback, sets: reps.map((r) => ({ type: "work", loadKg: load, reps: r, rir })) }] };
}
function run(date, planId, workoutId, runType, km, paceSec, rpe = 6) {
  return { id: `s${++seq}`, date, planId, workoutId, type: "run", status: "done", createdAt: `${date}T07:00:00Z`,
    run: { runType, distanceKm: km, durationSec: Math.round(km * paceSec), avgPaceSecPerKm: paceSec, rpe } };
}
function metcon(date, planId, rpe = 7, completed = true) {
  return { id: `s${++seq}`, date, planId, workoutId: "W4", type: "hybrid", status: "done", createdAt: `${date}T18:00:00Z`,
    conditioning: [{ format: "AMRAP", description: "10 min burpees", result: { rounds: 8, completed }, scaled: false, rpe }] };
}
function missed(date, planId, workoutId, reason = "time") {
  return { id: `s${++seq}`, date, planId, workoutId, type: "other", status: "missed", missedReason: reason, createdAt: `${date}T20:00:00Z` };
}

/** Last week (plan P0, 10-25) and this week (plan P1, 11-01) both completed. */
function fullHistory({ tempoPace = 305, squatFb = [null, null], benchFb = [null, null] } = {}) {
  return [
    sq("2026-10-26", "P0", 97.5, [5, 5, 5], 2, squatFb[0]),
    run("2026-10-27", "P0", "W2", "tempo", 8, 305),
    bench("2026-10-29", "P0", 70, [9, 9, 8], 2, benchFb[0]),
    run("2026-10-31", "P0", "W4", "easy", 6, 340), metcon("2026-10-31", "P0"),
    sq("2026-11-02", "P1", 100, [5, 5, 5], 2, squatFb[1]),
    run("2026-11-03", "P1", "W2", "tempo", 8, tempoPace),
    bench("2026-11-05", "P1", 70, [10, 10, 10], 2, benchFb[1]),
    run("2026-11-06", "P1", "W4", "easy", 6, 340), metcon("2026-11-06", "P1"),
  ];
}
const PLANS = [{ ...plan("P0", "2026-10-25", "archived") }, plan("P1", "2026-11-01")];

test("week fully done → progress: week, lifts (next targets), run (≤ +10 %), conditioning", () => {
  const d = progressionDigest({ sessions: fullHistory(), plans: PLANS, profile: profile(), today: TODAY });
  assert.equal(d.basis, "history");
  assert.equal(d.week.plan, "P1");
  assert.equal(d.week.planned, 4);
  assert.equal(d.week.pct, 100);
  assert.equal(adj(d, "week").act, "progress");
  const squat = adj(d, "strength", "back_squat");
  assert.equal(squat.act, "progress");
  assert.equal(squat.kg, 102.5, "linear +2.5 from 100×5×3");
  const b = adj(d, "strength", "bench_press");
  assert.equal(b.act, "progress");
  assert.equal(b.kg, 72.5, "double progression: all sets at the top of 8-10");
  const r = adj(d, "run");
  assert.equal(r.act, "progress");
  assert.equal(d.run.doneKm, 14);
  assert.ok(r.kmMax <= Math.max(d.run.doneKm, d.run.avg4) * 1.1 + 0.05);
  assert.equal(r.longMax, 8.8, "long run ≤ 30-day longest × 1.1");
  assert.equal(adj(d, "conditioning").act, "progress");
  assert.equal(d.baselines.lifts.some((l) => l.id === "back_squat"), false, "a lift with history never falls back to the profile");
  assert.ok(d.baselines.lifts.some((l) => l.id === "deadlift"), "a lift without history keeps its profile baseline");
  for (const a of d.adjustments) assert.ok(DIGEST_ACTIONS.includes(a.act), a.act);
  assert.ok(bytes(d) <= DIGEST_MAX_BYTES);
});

test("missed sessions → repeat (condense) and untrained lifts repeat their target", () => {
  const s = fullHistory().filter((x) => !(x.planId === "P1" && x.workoutId !== "W1"));
  s.push(missed("2026-11-03", "P1", "W2"), missed("2026-11-05", "P1", "W3"));
  const d = progressionDigest({ sessions: s, plans: PLANS, profile: profile(), today: TODAY });
  assert.equal(d.week.done, 1);
  assert.equal(d.week.missed, 2);
  assert.equal(d.week.pct, 25);
  assert.equal(adj(d, "week").act, "repeat");
  assert.match(adj(d, "week").why, /1 of 4 done/);
  assert.equal(adj(d, "strength", "bench_press").act, "repeat", "bench was not trained last week");
  assert.ok(d.week.notDone.some((x) => x.startsWith("W3")));
  const r = adj(d, "run");
  assert.equal(r.act, "repeat");
  assert.ok(r.kmMax <= d.run.avg4 + 0.05, "rebuild from completed km, never the planned 14 km");

  const half = fullHistory().filter((x) => !(x.planId === "P1" && x.workoutId === "W3"));
  const d2 = progressionDigest({ sessions: half, plans: PLANS, profile: profile(), today: TODAY });
  assert.equal(d2.week.pct, 75);
  assert.equal(adj(d2, "week").act, "repeat");
  assert.equal(adj(d2, "strength", "back_squat").act, "progress", "a lift that was trained still progresses");
});

test("sick week → reduce volume; long gap → return", () => {
  const s = fullHistory().filter((x) => x.planId !== "P1");
  s.push(sq("2026-11-02", "P1", 100, [5, 5, 5], 2), missed("2026-11-03", "P1", "W2", "sick"), missed("2026-11-04", "P1", "W3", "sick"));
  assert.equal(adj(progressionDigest({ sessions: s, plans: PLANS, profile: profile(), today: TODAY }), "week").act, "reduce_volume");
  const old = fullHistory().filter((x) => x.planId === "P0");
  const d = progressionDigest({ sessions: old, plans: [PLANS[0]], profile: profile(), today: "2026-11-14" });
  assert.equal(adj(d, "week").act, "return");
});

test("hard feedback: once → hold the load, twice → −5-10 %", () => {
  const once = progressionDigest({ sessions: fullHistory({ squatFb: ["fine", "hard"] }), plans: PLANS, profile: profile(), today: TODAY });
  const h = adj(once, "strength", "back_squat");
  assert.equal(h.act, "hold");
  assert.equal(h.kg, 100);
  assert.equal(adj(once, "week").act, "progress", "one hard lift is local, not a week-level signal");

  const twice = progressionDigest({ sessions: fullHistory({ squatFb: ["hard", "hard"] }), plans: PLANS, profile: profile(), today: TODAY });
  const t2 = adj(twice, "strength", "back_squat");
  assert.equal(t2.act, "deload");
  assert.ok(t2.kg >= 90 && t2.kg <= 95, `${t2.kg}`);
  assert.deepEqual(twice.strength.find((r) => r.id === "back_squat").fb, ["hard", "hard"]);
});

test("low readiness + hard lifts → deload week; low readiness alone → hold", () => {
  const wellness = ["2026-11-02", "2026-11-03", "2026-11-04", "2026-11-05", "2026-11-06", "2026-11-07"]
    .map((date) => ({ date, trainingReadiness: 35, sleepScore: 55, hrvStatus: "low", source: "garmin" }));
  const d = progressionDigest({ sessions: fullHistory({ squatFb: [null, "hard"], benchFb: [null, "hard"] }), plans: PLANS, wellness, profile: profile(), today: TODAY });
  assert.equal(adj(d, "week").act, "deload");
  assert.ok(d.signals.length >= 2);
  assert.equal(adj(d, "strength", "back_squat").act, "deload");
  assert.equal(adj(d, "strength", "bench_press").act, "deload");
  assert.equal(adj(d, "run").act, "deload");
  assert.equal(d.wellness.readiness, 35);

  const mild = wellness.map((e) => ({ ...e, hrvStatus: "balanced" }));
  const d2 = progressionDigest({ sessions: fullHistory(), plans: PLANS, wellness: mild, profile: profile(), today: TODAY });
  assert.equal(adj(d2, "week").act, "hold");
  assert.equal(adj(d2, "strength", "back_squat").act, "hold", "progress is capped to hold on a low-readiness week");
  assert.equal(adj(d2, "run").act, "hold");

  const poor = wellness.map((e) => ({ ...e, trainingReadiness: 15, hrvStatus: "balanced" }));
  assert.equal(adj(progressionDigest({ sessions: fullHistory(), plans: PLANS, wellness: poor, profile: profile(), today: TODAY }), "week").act, "deload");
});

test("runs completed slower than target → hold paces and volume", () => {
  const d = progressionDigest({ sessions: fullHistory({ tempoPace: 330 }), plans: PLANS, profile: profile(), today: TODAY });
  const q = d.run.quality.find((x) => x.date === "2026-11-03");
  assert.equal(q.slow, true);
  assert.equal(q.target, "5:00-5:10/km");
  const r = adj(d, "run");
  assert.equal(r.act, "hold");
  assert.equal(r.pace, "hold");
  assert.match(r.paceWhy, /keep paces/);
  assert.ok(r.kmMax <= Math.max(d.run.doneKm, d.run.avg4) + 0.05);
  assert.equal(d.run.easyPace, "5:40/km", "the logged easy pace, not the profile's 5:30");
});

test("first week, no history → profile baselines and calibration", () => {
  const d = progressionDigest({ sessions: [], plans: [], profile: profile(), today: TODAY });
  assert.equal(d.basis, "profile");
  assert.equal(adj(d, "week").act, "calibrate");
  assert.deepEqual(d.baselines.lifts.map((l) => l.id), ["back_squat", "deadlift"]);
  assert.equal(d.baselines.lifts[0].kg, 80);
  assert.equal(d.baselines.running.weeklyKm, 30);
  assert.equal(d.baselines.level, "intermediate");
  assert.equal(adj(d, "run").act, "calibrate");
  assert.equal(adj(d, "conditioning").act, "calibrate");
  assert.equal(d.strength, undefined);
});

test("a plan that started today with nothing logged is skipped: judge last week's plan", () => {
  const plans = [plan("P1", "2026-11-01", "archived"), plan("P2", "2026-11-08")];
  const d = progressionDigest({ sessions: fullHistory(), plans, profile: profile(), today: "2026-11-08" });
  assert.equal(d.week.plan, "P1");
  assert.equal(adj(d, "week").act, "progress");
});

test("digest stays ≤ 6 KB with a big history", () => {
  const ids = ["back_squat", "bench_press", "barbell_row", "romanian_deadlift", "overhead_press", "lat_pulldown", "pull_up", "deadlift",
    "goblet_squat", "dumbbell_bench_press", "leg_press", "leg_curl", "leg_extension", "lateral_raise", "face_pull"].filter((id) => catalog.getExercise(id));
  const sessions = [];
  for (let w = 0; w < 6; w++) for (let dday = 0; dday < 5; dday++) {
    const date = core.todayISO(new Date(Date.UTC(2026, 8, 27 + w * 7 + dday, 12)));
    sessions.push({ id: `b${w}${dday}`, date, status: "done", type: "strength", sessionRpe: 7, readiness: 4,
      pain: [{ area: "knee", score: 2, when: "during" }],
      strength: ids.map((id) => ({ exerciseId: id, feedback: "fine", sets: [{ type: "work", loadKg: 50 + w, reps: 8, rir: 2 }, { type: "work", loadKg: 50 + w, reps: 8, rir: 2 }] })) });
    sessions.push(run(date, null, null, "intervals", 7, 300, 8));
  }
  const d = progressionDigest({ sessions, plans: PLANS, profile: profile(), today: TODAY });
  assert.ok(bytes(d) <= DIGEST_MAX_BYTES, `${bytes(d)} bytes`);
  assert.ok(d.adjustments.length >= 3);
});

test("accepts missing / odd inputs without throwing", () => {
  const d = progressionDigest();
  assert.equal(d.basis, "profile");
  const d2 = progressionDigest({ sessions: [null, { date: "2026-11-01" }], plans: [null, { status: "draft" }], wellness: [{ date: "x" }], profile: null, today: TODAY });
  assert.equal(typeof d2.basis, "string");
});

// ---------------------------------------------------------------- plan prompt

function promptArgs(digest, prof = profile()) {
  return {
    rules: PLAN_RULES, today: TODAY, weekStart: "2026-11-08", workoutCount: 4, minutesPerSession: 60, profile: prof,
    trainingSummary: { adherence: { pct: 100 } }, recentSessions: [], targets: [], runLoad: { avgWeeklyKm: 14, longestKm: 8, weeks: 4 },
    allowedLocations: [{ id: "gym", name: "Gym", exercises: [{ id: "back_squat", pattern: "squat" }] }], digest,
  };
}

test("plan prompt leads with the digest and the override instruction; superseded baselines are removed", () => {
  const digest = progressionDigest({ sessions: fullHistory(), plans: PLANS, profile: profile(), today: TODAY });
  const p = buildPlanPrompt(promptArgs(digest));
  assert.ok(p.startsWith(PLAN_PROMPT_MARKER));
  assert.ok(p.includes(ADAPT_INSTRUCTION));
  assert.match(p, /override the onboarding baselines/);
  const iDigest = p.indexOf(`# ${DIGEST_HEADING}`);
  assert.ok(iDigest > 0, "digest section present");
  assert.ok(iDigest < p.indexOf("# Coaching rules"), "digest comes before the rules");
  assert.ok(iDigest < p.indexOf(`# ${PROFILE_HEADING}`), "digest comes before the profile");
  assert.ok(p.includes('"basis":"history"'));
  assert.ok(p.includes('"id":"back_squat","act":"progress","kg":102.5'));
  // profile: the squat baseline (80 kg) is gone, deadlift (no history) stays, constraints stay
  const prof = JSON.parse(p.slice(p.indexOf("```json", p.indexOf(`# ${PROFILE_HEADING}`)) + 7, p.indexOf("```", p.indexOf("```json", p.indexOf(`# ${PROFILE_HEADING}`)) + 7)));
  assert.deepEqual(prof.experience.knownLifts.map((l) => l.exerciseId), ["deadlift"]);
  assert.equal(prof.experience.running.currentWeeklyKm, undefined);
  assert.ok(prof.equipment.locations[0].items.includes("barbell"));
  assert.ok(Buffer.byteLength(PLAN_RULES, "utf8") <= 40 * 1024);
  assert.match(PLAN_RULES, /Never reset to onboarding baselines/);
});

test("profileForPlan keeps the profile intact without history", () => {
  const prof = profile();
  assert.equal(profileForPlan(prof, progressionDigest({ profile: prof, today: TODAY })), prof);
  assert.equal(profileForPlan(prof, null), prof);
});

test("coach.generatePlan computes the digest from the store and sends it in the plan prompt", async () => {
  const sessions = fullHistory();
  const prof = profile();
  const prompts = [];
  const mock = createMockSample({ delayMs: 0 });
  const sample = Object.assign((...a) => mock(...a), {
    json: (input, options) => { prompts.push(input); return mock.json(input, options); },
    limits: () => mock.limits(),
  });
  let saved = null;
  const store = {
    profile: { get: async () => prof, subscribe: () => () => {} },
    coach: { get: async () => ({ summary: "", notes: [] }) },
    state: { get: async () => ({ rotation: { planId: "P1", done: ["W1", "W2", "W3", "W4"] } }), update: async () => ({}) },
    plans: {
      getAgreed: async () => PLANS[1], getDraft: async () => null, list: async () => [...PLANS].reverse(),
      saveDraft: async (p) => { saved = { ...p, id: "2026-11-08" }; return { plan: saved, undo: async () => {} }; },
    },
    sessions: { list: async () => [...sessions].reverse() },
    wellness: { list: async () => [{ date: "2026-11-06", trainingReadiness: 80, hrvStatus: "balanced" }] },
  };
  const coach = createCoach({ runtime: { sample, uid: "u1" }, store, core, catalog, knowledge, now: () => new Date(2026, 10, 7, 9) });
  await coach.generatePlan();
  assert.ok(saved, "draft saved");
  const p = typeof prompts[0] === "string" ? prompts[0] : JSON.stringify(prompts[0]);
  assert.ok(p.includes(DIGEST_HEADING));
  assert.ok(p.includes("ADAPT FROM LAST WEEK, NOT FROM ONBOARDING"));
  assert.ok(p.includes('"plan":"P1"'));
  assert.ok(p.includes('"wellness":{"days":1,"readiness":80'));
  assert.ok(p.indexOf(DIGEST_HEADING) < p.indexOf("# Coaching rules"));

  // Without store.wellness (added by another agent) it still works.
  delete store.wellness;
  prompts.length = 0;
  await coach.generatePlan();
  assert.ok(String(prompts[0]).includes(DIGEST_HEADING));
});
