// Regression tests for the 2026-11 architecture review (docs/reviews/2026-11-architecture-review.md).
// One test per bug found; real core, catalog, store (on the mock db) and brain, with a scripted `sample`.

import test from "node:test";
import assert from "node:assert/strict";

import * as core from "../src/core.js";
import * as catalog from "../src/catalog.js";
import * as knowledge from "../src/knowledge/index.js";
import { createStore, defaultAppState } from "../src/store.js";
import { createMockDb } from "../src/store-mock.js";
import { createCoach, planWeekStart, sameSessionContent } from "../src/brain.js";
import { progressionDigest } from "../src/progress.js";
import { runCaps } from "../src/prompts/plan.js";
import { formatMemory } from "../src/prompts/context.js";
import { selectNotes } from "../src/prompts/util.js";
import { parseSummary } from "../src/prompts/summary.js";
import { getRuntime, isDevHost } from "../src/env.js";

const TODAY = "2026-11-09"; // a Monday; the week started on Sunday 2026-11-08
const NOW = () => new Date(2026, 10, 9, 12, 0, 0);

const squat = (date, load, reps, extra = {}) => ({
  id: `${date}-sq`, date, type: "strength", status: "done", createdAt: `${date}T10:00:00.000Z`,
  strength: [{ exerciseId: "back_squat", name: "Back squat", sets: reps.map((r) => ({ type: "work", loadKg: load, bodyweight: false, reps: r, rir: 2 })) }], ...extra,
});

const PROFILE = {
  onboarded: true, name: "Sam",
  goals: { primary: "strength", modalities: { strength: true, running: true, conditioning: false } },
  schedule: { daysPerWeek: 3, minutesPerSession: 60 },
  equipment: { defaultLocationId: "gym", locations: [{ id: "gym", name: "Gym", items: ["barbell", "plates", "squat_rack", "bench", "adjustable_bench", "dumbbells", "pullup_bar", "outdoor_route"] }] },
  experience: { level: "intermediate", running: { currentWeeklyKm: null, longestRecentRunKm: null } },
  preferences: { likes: [], dislikes: [] }, injuries: [],
};
const item = (exerciseId, reps = "5") => ({ exerciseId, name: catalog.getExercise(exerciseId).name, sets: 3, reps, targetRir: 2, loadKg: null, restSec: 150, progression: "double", incrementKg: 2.5, alternatives: [], supersetGroup: null });
const PLAN = {
  weekStart: "2026-11-08", focus: "Base", rationale: "r", notes: [],
  workouts: [
    { id: "W1", title: "Lower", type: "strength", locationId: "gym", estMinutes: 45, intent: "squat", blocks: [{ kind: "strength", items: [item("back_squat")] }] },
    { id: "W2", title: "Upper", type: "strength", locationId: "gym", estMinutes: 45, intent: "press", blocks: [{ kind: "strength", items: [item("bench_press", "8-10")] }] },
    { id: "W3", title: "Easy run", type: "run", locationId: "gym", estMinutes: 35, intent: "aerobic", blocks: [{ kind: "run", runType: "easy", totalKm: 5, warmupMin: 0, cooldownMin: 0, segments: [], notes: "" }] },
  ],
};

/** A sample stub whose script may run the offered tools: script(input, options, n, runTool). */
function scripted(script) {
  const calls = [];
  const runTool = (options) => async (name, input) => {
    const tool = (options.tools ?? []).find((t) => t.name === name);
    assert.ok(tool, `tool ${name} offered`);
    try { return await tool.execute(input, { signal: new AbortController().signal }); } catch (e) { return `Error: ${e.message}`; }
  };
  const fn = async (input, options = {}) => { calls.push({ verb: "sample", input, options }); return script(input, options, calls.length, runTool(options)); };
  fn.json = async (input, options = {}) => { calls.push({ verb: "json", input, options }); return script(input, options, calls.length, runTool(options)); };
  fn.limits = async () => ({ maxPromptBytes: 262144, tools: { maxCount: 16 }, modelTiers: ["default", "complex", "quick"] });
  fn.calls = calls;
  return fn;
}

async function setup({ sample, sessions = [], plan = PLAN, profile = PROFILE } = {}) {
  const db = createMockDb();
  const store = createStore(db, "u1", { now: NOW });
  await store.profile.set(profile);
  let agreed = null;
  if (plan) {
    const { plan: draft } = await store.plans.saveDraft(plan);
    agreed = (await store.plans.approve(draft.id)).plan;
  }
  for (const s of sessions) await store.sessions.add(s);
  const coach = createCoach({ runtime: { sample, uid: "u1" }, store, core, catalog, knowledge, now: NOW });
  return { db, store, coach, agreed };
}

/** Run one chat send in which Claude calls the given tools in order; resolves the tool results. */
async function callTools(ctx, toolCalls) {
  const results = [];
  ctx.sampleScript.fn = async (input, options, n, runTool) => {
    for (const [name, input2] of toolCalls) results.push(await runTool(name, input2));
    return { text: "ok", truncated: false };
  };
  const res = await ctx.coach.send(`msg ${Math.random()}`);
  return { res, results };
}
async function chatSetup(opts = {}) {
  const sampleScript = { fn: async () => ({ text: "ok" }) };
  const sample = scripted((...a) => sampleScript.fn(...a));
  const ctx = await setup({ ...opts, sample });
  return { ...ctx, sample, sampleScript };
}

// ---------------------------------------------------------------- core

test("trainingSummary: sets per muscle average over the weeks with history, not always 4", () => {
  const sessions = [squat("2026-11-05", 100, [5, 5, 5]), squat("2026-11-08", 100, [5, 5, 5])];
  const s = core.trainingSummary(sessions, PROFILE, { weeks: 4, today: TODAY });
  assert.equal(s.setsPerMuscleWk.quads, 6, "6 squat sets in the first (only) week = 6 / week, not 1.5");
  const old = [squat("2026-10-13", 100, [5, 5, 5]), ...sessions];
  assert.equal(core.trainingSummary(old, PROFILE, { weeks: 4, today: TODAY }).setsPerMuscleWk.quads, 2.5, "9 sets over the full 4-week window (rounded to 0.5)");
});

test("normalizeSession: unreadable duration or readiness stay null (were 0 min and readiness 1)", () => {
  const s = core.normalizeSession({ type: "strength", durationMin: "a while", readiness: "meh" }, { today: TODAY });
  assert.equal(s.durationMin, null);
  assert.equal(s.readiness, null);
  assert.equal(core.normalizeSession({ durationMin: "45", readiness: "4" }, { today: TODAY }).durationMin, 45);
  assert.equal(core.normalizeSession({ durationMin: "45", readiness: "4" }, { today: TODAY }).readiness, 4);
});

test("validatePlan: a lifter's first running week is not capped at 3 km (RUN_RAMP floor), but still capped", () => {
  const sessions = [squat("2026-10-20", 100, [5, 5, 5]), squat("2026-11-03", 100, [5, 5, 5])];
  const plan = JSON.parse(JSON.stringify({ ...PLAN, id: "p", status: "draft" }));
  plan.workouts[2].blocks[0].totalKm = 6;
  const ok = core.validatePlan(plan, { profile: PROFILE, sessions, today: TODAY });
  assert.ok(!ok.errors.some((e) => e.code === "RUN_RAMP"), JSON.stringify(ok.errors));
  plan.workouts[2].blocks[0].totalKm = 12;
  assert.ok(core.validatePlan(plan, { profile: PROFILE, sessions, today: TODAY }).errors.some((e) => e.code === "RUN_RAMP"));
});

test("unmarkWorkoutDone removes one id from the current rotation and leaves another plan's rotation alone", () => {
  const plan = { id: "p1", workouts: [{ id: "W1" }, { id: "W2" }] };
  assert.deepEqual(core.unmarkWorkoutDone({ rotation: { planId: "p1", done: ["W1", "W2"] } }, plan, "W1"), { planId: "p1", done: ["W2"] });
  assert.deepEqual(core.unmarkWorkoutDone({ rotation: { planId: "p2", done: ["W1"] } }, plan, "W1"), { planId: "p2", done: ["W1"] });
  assert.deepEqual(core.unmarkWorkoutDone({}, plan, "W1"), { planId: null, done: [] });
});

test("injury → jointStress map has one source (core.injuryTags), used by swap.js", () => {
  const tags = core.injuryTags({ injuries: [{ area: "Left knee", status: "current" }, { area: "shoulder", status: "past" }] });
  assert.equal(tags.length, 1);
  assert.ok(tags[0].tags.has("knee_flexion_deep"));
});

// ---------------------------------------------------------------- progression digest

test("digest: a plan week still in progress is judged against the workouts due so far", () => {
  const plans = [{ ...PLAN, id: "2026-11-08", status: "agreed" }];
  const sessions = [
    squat("2026-11-02", 97.5, [5, 5, 5]),
    { id: "r0", date: "2026-11-04", type: "run", status: "done", createdAt: "2026-11-04T07:00:00Z", run: { runType: "easy", distanceKm: 5, durationSec: 1800 } },
    squat("2026-11-09", 100, [5, 5, 5], { planId: "2026-11-08", workoutId: "W1" }),
  ];
  const d = progressionDigest({ sessions, plans, profile: PROFILE, today: TODAY });
  assert.equal(d.week.inProgress, true);
  assert.equal(d.week.planned, 3);
  assert.equal(d.week.expected, 0, "day 2 of 7 with 3 workouts: none is overdue yet");
  const week = d.adjustments.find((a) => a.scope === "week");
  assert.equal(week.act, "progress", week.why);
  assert.match(week.why, /in progress/);
  const run = d.adjustments.find((a) => a.scope === "run");
  assert.notEqual(run.act, "repeat", "0 of 5 planned km on Monday is not a missed run week");
  assert.equal(d.run.pct, undefined);
  assert.ok(run.kmMax >= 5, "the base includes the last full week (5 km), not only this week's 0 km");
  assert.notEqual(d.adjustments.find((a) => a.scope === "strength" && a.id === "bench_press").act, "repeat", "W2 is still to come, not skipped");

  // the same data on the last day of the week: now 1 of 3 really is low completion
  const end = progressionDigest({ sessions, plans, profile: PROFILE, today: "2026-11-14" });
  assert.equal(end.week.inProgress, undefined);
  assert.equal(end.week.pct, 33);
  assert.notEqual(end.adjustments.find((a) => a.scope === "week").act, "progress");
});

// ---------------------------------------------------------------- plan generation

test("planWeekStart: never more than one week ahead, however early plans are approved", () => {
  const thisWeek = "2026-11-08";
  assert.equal(planWeekStart(null, thisWeek), thisWeek);
  assert.equal(planWeekStart({ weekStart: "2026-11-01" }, thisWeek), thisWeek);
  assert.equal(planWeekStart({ weekStart: "2026-11-08" }, thisWeek), "2026-11-15");
  assert.equal(planWeekStart({ weekStart: "2026-11-15" }, thisWeek), "2026-11-15", "was 2026-11-22: each early approval pushed the week further out");
});

test("generatePlan: a JSON reply without workouts is rejected (no empty draft is saved)", async () => {
  const sample = scripted(async () => ({ note: "I cannot plan this" }));
  const { coach, store } = await setup({ sample });
  await assert.rejects(coach.generatePlan(), (e) => e.code === "invalid_json" && /no workouts/.test(e.message));
  assert.equal(await store.plans.getDraft(), null);
  assert.equal((await store.state.get()).lastPlanError.code, "invalid_json");
});

test("plan prompt run caps: profile baseline when no runs are logged; never 'single run ≤ 0 km'", async () => {
  assert.doesNotMatch(runCaps({ avgWeeklyKm: 0, longestKm: 0, weeks: 4 }).text, /≤ 0 km/);
  assert.equal(runCaps({ avgWeeklyKm: 0, longestKm: 0 }).weeklyCapKm, 8, "same first-week floor as core.RUN_LIMITS");
  assert.equal(core.RUN_LIMITS.weeklyStartKm, 8);
  const sample = scripted(async () => ({ workouts: [] }));
  const profile = { ...PROFILE, experience: { ...PROFILE.experience, running: { currentWeeklyKm: 20, longestRecentRunKm: 9 } } };
  const { coach } = await setup({ sample, profile, plan: null });
  await coach.generatePlan().catch(() => {});
  const prompt = sample.calls[0].input;
  assert.match(prompt, /recent average 20 km\/week from the onboarding profile/);
  assert.match(prompt, /weekly total ≤ 23 km; any single run ≤ 9\.9 km/);
});

// ---------------------------------------------------------------- log_session

test("log_session: a future date and an exact duplicate are refused with the fix", async () => {
  const ctx = await chatSetup();
  const session = { sessionType: "strength", workoutId: "next", strength: [{ exerciseId: "back_squat", sets: [{ loadKg: 100, reps: 5, rir: 2 }] }] };
  const first = await callTools(ctx, [["log_session", session]]);
  assert.ok(first.results[0].id, JSON.stringify(first.results[0]));
  const again = await callTools(ctx, [["log_session", session], ["log_session", { ...session, date: "2027-01-01" }]]);
  assert.match(again.results[0], /^Error: Already logged as /);
  assert.match(again.results[1], /^Error: date 2027-01-01 is in the future/);
  assert.equal((await ctx.store.sessions.list()).length, 1);
  assert.deepEqual((await ctx.store.state.get()).rotation.done, ["W1"]);
});

test("sameSessionContent ignores titles and notes; empty sessions only match on the same planned workout", () => {
  const a = core.normalizeSession({ date: TODAY, type: "run", run: { distanceKm: 5, durationSec: 1500 }, title: "A", notes: "x" }, { today: TODAY });
  const b = core.normalizeSession({ date: TODAY, type: "run", run: { distanceKm: 5, durationSec: 1500 }, title: "B" }, { today: TODAY });
  assert.equal(sameSessionContent(a, b), true);
  assert.equal(sameSessionContent(a, { ...b, run: { ...b.run, distanceKm: 6 } }), false);
  const miss = (workoutId) => core.normalizeSession({ date: TODAY, type: "other", status: "missed", workoutId, planId: workoutId ? "p" : null }, { today: TODAY });
  assert.equal(sameSessionContent(miss(null), miss(null)), false, "two unplanned missed days are not duplicates");
  assert.equal(sameSessionContent(miss("W1"), miss("W1")), true);
});

test("log_session: a skip (missed + workoutId) moves Up next on, like the Plan tab's Skip", async () => {
  const ctx = await chatSetup();
  const { results } = await callTools(ctx, [["log_session", { sessionType: "strength", status: "missed", missedReason: "time", workoutId: "W1" }]]);
  assert.match(results[0].upNext, /^W2 /);
  assert.deepEqual((await ctx.store.state.get()).rotation.done, ["W1"]);
  // a missed day without a workout id changes nothing in the rotation
  await callTools(ctx, [["log_session", { sessionType: "other", status: "missed", missedReason: "sick" }]]);
  assert.deepEqual((await ctx.store.state.get()).rotation.done, ["W1"]);
});

test("undo of an earlier log keeps later workouts done (rotation undo is not a snapshot restore)", async () => {
  const ctx = await chatSetup();
  const one = await callTools(ctx, [["log_session", { sessionType: "strength", workoutId: "W1", strength: [{ exerciseId: "back_squat", sets: [{ loadKg: 100, reps: 5 }] }] }]]);
  await callTools(ctx, [["log_session", { sessionType: "strength", workoutId: "W2", strength: [{ exerciseId: "bench_press", sets: [{ loadKg: 60, reps: 8 }] }] }]]);
  assert.deepEqual((await ctx.store.state.get()).rotation.done, ["W1", "W2"]);
  await one.res.actions.find((a) => a.type === "logged_session").undo();
  assert.deepEqual((await ctx.store.state.get()).rotation.done, ["W2"], "was []: undoing W1 also un-did W2");
  assert.equal((await ctx.store.sessions.list()).length, 1);
});

test("log_session: PRs of a back-dated session compare only with sessions up to its date", async () => {
  const ctx = await chatSetup({ sessions: [squat("2026-10-20", 100, [5, 5, 5]), squat("2026-11-08", 120, [5, 5, 5])] });
  const { results } = await callTools(ctx, [["log_session", { sessionType: "strength", date: "2026-10-27", strength: [{ exerciseId: "back_squat", sets: [{ loadKg: 105, reps: 5, rir: 2 }] }] }]]);
  assert.equal(results[0].prs.length, 1, "105×5 beat everything logged up to 2026-10-27");
  assert.equal(results[0].prs[0].kind, "e1rm");
});

test("update_profile: a new body weight is also recorded as a weigh-in", async () => {
  const ctx = await chatSetup();
  const { res } = await callTools(ctx, [["update_profile", { patch: { weightKg: 81.5 } }]]);
  assert.deepEqual(await ctx.store.body.list(), [{ date: TODAY, kg: 81.5 }]);
  await res.actions[0].undo();
  assert.deepEqual(await ctx.store.body.list(), []);
});

// ---------------------------------------------------------------- coach memory

test("selectNotes keeps old standing facts (injury, preference, goal) that 'the newest 20' forgot", () => {
  const notes = [
    { id: "a", date: "2026-06-01", kind: "injury", text: "Left knee: no deep lunges after the 2025 meniscus tear" },
    { id: "b", date: "2026-06-02", kind: "preference", text: "Hates burpees" },
    ...Array.from({ length: 40 }, (_, i) => ({ id: `i${i}`, date: "2026-10-01", kind: "insight", text: `insight number ${i}` })),
    { id: "dup", date: "2026-11-01", kind: "preference", text: "hates burpees" },
  ];
  const picked = selectNotes(notes);
  assert.ok(picked.some((n) => n.id === "a"), "the old injury note is still in the prompt");
  assert.ok(picked.some((n) => n.id === "dup") && !picked.some((n) => n.id === "b"), "duplicates collapse to the newest");
  assert.equal(picked.filter((n) => n.kind === "insight").length, 12);
  assert.equal(picked[picked.length - 1].id, "dup", "oldest → newest");
  const tight = selectNotes(notes, { maxBytes: 300 });
  assert.ok(tight.some((n) => n.id === "a") && tight.length < picked.length, "over budget: commentary goes first, standing facts stay");
  const text = formatMemory({ summary: "- trains mornings", notes });
  assert.match(text, /^Summary: - trains mornings/);
  assert.match(text, /\[injury\] Left knee/);
});

test("rememberChat folds unsummarized messages into the summary (one quick call) so Clear chat forgets wording, not facts", async () => {
  const sample = scripted(async (input, options) => {
    assert.equal(options.modelTier, "quick");
    assert.equal(options.tools, undefined);
    assert.match(input, /I can only train before 7am/);
    return { text: "- trains before 7am from now on" };
  });
  const { coach, store } = await setup({ sample });
  assert.deepEqual(await coach.rememberChat(), { summarized: 0 }, "nothing said yet: no call");
  assert.equal(sample.calls.length, 0);
  await store.chat.append({ role: "user", text: "From now on I can only train before 7am" });
  await store.chat.append({ role: "assistant", text: "Noted, mornings it is." });
  assert.deepEqual(await coach.rememberChat(), { summarized: 2 });
  assert.equal(sample.calls.length, 1);
  const { text, throughTs } = parseSummary((await store.coach.get()).summary);
  assert.equal(text, "- trains before 7am from now on");
  assert.ok(throughTs);
  await store.chat.clear();
  assert.equal(parseSummary((await store.coach.get()).summary).text, text, "the summary survives the clear");
  assert.deepEqual(await coach.rememberChat(), { summarized: 0 });
  assert.equal(sample.calls.length, 1, "already summarized: no second call");
});

// ---------------------------------------------------------------- store

test("store: documents written by an older app version read back with the current shape", async () => {
  const db = createMockDb();
  const store = createStore(db, "u1", { now: NOW });
  await db.doc("data/users/u1/log/sessions/2026-10-01-old001").set({ id: "2026-10-01-old001", date: "2026-10-01", type: "strength", status: "done", title: "v1", strength: [{ exerciseId: "back_squat", sets: [] }] });
  await db.doc("data/users/u1/plans/weeks/2026-09-27").set({ id: "2026-09-27", status: "agreed", weekStart: "2026-09-27", workouts: [{ id: "W1", title: "A", type: "strength", blocks: [] }] });
  await db.doc("data/users/u1/state").set({ schemaVersion: 1, rotation: { planId: "2026-09-27", done: [] } });
  const [s] = await store.sessions.list();
  assert.equal(s.reviewedAt, null);
  assert.deepEqual([s.pain, s.conditioning, s.prs, s.run, s.coachComment], [[], [], [], null, ""]);
  assert.deepEqual(await store.sessions.get("2026-10-01-old001"), s);
  const plan = await store.plans.getAgreed();
  assert.deepEqual([plan.changeLog, plan.notes, plan.validation, plan.approvedAt], [[], [], null, null]);
  assert.deepEqual(plan.weeklyTargets, { runKm: null, conditioningSessions: null, strengthSetsPerMuscle: {} });
  assert.deepEqual((await store.plans.get("2026-09-27")).changeLog, []);
  const state = await store.state.get();
  assert.equal(state.lastPlanError, null);
  assert.equal(state.settings.reviewAfterWorkout, true);
  assert.equal(defaultAppState().lastPlanError, null);
  // nothing was rewritten on read
  assert.equal((await db.doc("data/users/u1/log/sessions/2026-10-01-old001").get()).data().reviewedAt, undefined);
  // and the export stays byte-faithful to what is stored
  assert.equal((await store.exportAll()).data.sessions[0].reviewedAt, undefined);
});

test("importAll: a write failure part-way restores the previous data and says so", async () => {
  const inner = createMockDb();
  let failOn = null;
  const db = {
    collection: (p) => inner.collection(p),
    doc: (p) => {
      const ref = inner.doc(p);
      return {
        id: ref.id, path: ref.path,
        get: () => ref.get(),
        set: (data) => {
          if (failOn && p.endsWith(failOn)) { failOn = null; return Promise.reject({ code: "unavailable", message: "network down" }); }
          return ref.set(data);
        },
        update: (data) => ref.update(data),
        delete: () => ref.delete(),
        onSnapshot: (...a) => ref.onSnapshot(...a),
        collection: (c) => ref.collection(c),
      };
    },
  };
  const store = createStore(db, "u1", { now: NOW });
  await store.profile.update({ name: "Before" });
  await store.sessions.add(squat("2026-11-01", 100, [5]));
  const backup = await store.exportAll();
  backup.data.profile.name = "After";
  backup.data.sessions = [{ ...backup.data.sessions[0], id: "2026-11-02-new001", date: "2026-11-02" }];
  failOn = "2026-11-02-new001";
  await assert.rejects(store.importAll(backup), (e) => e.code === "unavailable" && e.rolledBack === true && /previous data is back/.test(e.message));
  assert.equal((await store.profile.get()).name, "Before");
  assert.deepEqual((await store.sessions.list()).map((s) => s.date), ["2026-11-01"]);
  // the same import succeeds once writes work again
  await store.importAll(backup);
  assert.equal((await store.profile.get()).name, "After");
});

// ---------------------------------------------------------------- env

test("env: the mocks only start on a dev host; a re-hosted copy without window.claude explains instead", async () => {
  assert.equal(isDevHost(undefined), true, "Node tests");
  assert.equal(isDevHost({ hostname: "localhost", protocol: "http:", search: "" }), true);
  assert.equal(isDevHost({ hostname: "", protocol: "file:", search: "" }), true);
  assert.equal(isDevHost({ hostname: "example.com", protocol: "https:", search: "?mock" }), true);
  assert.equal(isDevHost({ hostname: "example.com", protocol: "https:", search: "" }), false);
  const rt = await getRuntime({ claude: undefined, location: { hostname: "example.com", protocol: "https:", search: "" } });
  assert.equal(rt.mode, "live");
  assert.equal(rt.db, null);
  assert.deepEqual(rt.problems, ["db_unavailable", "not_signed_in", "sample_unavailable"]);
  assert.equal((await getRuntime({ claude: undefined, location: { hostname: "localhost", protocol: "http:", search: "" } })).mode, "mock");
});
