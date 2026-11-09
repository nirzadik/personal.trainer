// Tests for brain.js, prompts/*.js and sample-mock.js (owner: Agent B).
// Uses in-test stubs for store/core/catalog so they run regardless of other modules' progress.

import test from "node:test";
import assert from "node:assert/strict";

import { createCoach, errorCopy, SAMPLE_ERROR_CODES } from "../src/brain.js";
import { createMockSample, parseWorkoutReport } from "../src/sample-mock.js";
import {
  buildChatTurns, buildInstructionsTurn, historyToTurns, normalizeTurns, CHAT_BUDGETS, MODE_LINE, UNANSWERED_NOTE, INSTRUCTIONS_END,
} from "../src/prompts/chat.js";
import { buildContextSnapshot } from "../src/prompts/context.js";
import { buildPlanPrompt, expandPlan, PLAN_PROMPT_MARKER, REPAIR_PROMPT_MARKER } from "../src/prompts/plan.js";
import { SUMMARY_PROMPT_MARKER, parseSummary } from "../src/prompts/summary.js";
import { COMMENT_PROMPT_MARKER, clampWords } from "../src/prompts/comment.js";
import {
  TOOL_SPECS, CHAT_TOOL_ORDER, ONBOARDING_TOOL_ORDER, REVIEW_TOOL_ORDER, checkToolSchema, checkToolSpec, SCHEMA_KEYWORDS, SCHEMA_TYPES, RESERVED_PROPERTY_NAMES,
} from "../src/prompts/tools.js";
import { truncateBytes, utf8Bytes } from "../src/prompts/util.js";

// ---------- stubs ----------

const TODAY = "2026-11-07"; // a Saturday
const clone = (v) => (v === undefined ? undefined : JSON.parse(JSON.stringify(v)));
const isObj = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
function deepMerge(a, b) {
  const out = { ...(isObj(a) ? a : {}) };
  for (const [k, v] of Object.entries(b ?? {})) out[k] = isObj(v) && isObj(out[k]) ? deepMerge(out[k], v) : clone(v);
  return out;
}

const CATALOG = {
  EQUIPMENT: { barbell: { name: "Barbell" }, plates: { name: "Plates" }, squat_rack: { name: "Rack" }, bench: { name: "Bench" }, dumbbells: { name: "Dumbbells" }, pullup_bar: { name: "Pull-up bar" }, outdoor_route: { name: "Outdoor route" }, rower: { name: "Rower" } },
  EXERCISES: [
    { id: "back_squat", name: "Back squat", pattern: "squat", modality: ["strength"], primary: ["quads"], equipment: { all: ["barbell", "squat_rack"], any: [] } },
    { id: "goblet_squat", name: "Goblet squat", pattern: "squat", modality: ["strength"], primary: ["quads"], equipment: { all: [], any: ["dumbbells", "kettlebell"] } },
    { id: "bench_press", name: "Bench press", pattern: "h_push", modality: ["strength"], primary: ["chest"], equipment: { all: ["barbell", "bench"], any: [] } },
    { id: "deadlift", name: "Deadlift", pattern: "hinge", modality: ["strength"], primary: ["hamstrings"], equipment: { all: ["barbell"], any: [] } },
    { id: "pull_up", name: "Pull-up", pattern: "v_pull", modality: ["strength"], primary: ["lats"], equipment: { all: ["pullup_bar"], any: [] } },
    { id: "barbell_row", name: "Barbell row", pattern: "h_pull", modality: ["strength"], primary: ["upper_back"], equipment: { all: ["barbell"], any: [] } },
    { id: "leg_press", name: "Leg press", pattern: "squat", modality: ["strength"], primary: ["quads"], equipment: { all: ["leg_press"], any: [] } },
    { id: "burpee", name: "Burpee", pattern: "plyo", modality: ["conditioning"], primary: ["quads"], equipment: { all: [], any: [] } },
    { id: "rower", name: "Rower", pattern: "cardio", modality: ["cardio"], primary: [], equipment: { all: ["rower"], any: [] } },
  ],
  getExercise(id) { return this.EXERCISES.find((e) => e.id === id) ?? null; },
  findExercise(q) {
    const s = String(q).toLowerCase();
    return this.EXERCISES.find((e) => e.id === s || e.name.toLowerCase() === s) ?? this.EXERCISES.find((e) => s.includes(e.id.split("_")[0]) || e.name.toLowerCase().includes(s)) ?? null;
  },
  searchExercises(q) { return this.EXERCISES.filter((e) => e.name.toLowerCase().includes(String(q).toLowerCase())).slice(0, 5); },
};
for (const k of ["getExercise", "findExercise", "searchExercises"]) CATALOG[k] = CATALOG[k].bind(CATALOG);

function makeCore(overrides = {}) {
  return {
    todayISO: () => TODAY,
    weekStartOf: () => "2026-11-01",
    nextWorkout: (plan, state) => {
      const done = state?.rotation?.planId === plan.id ? state.rotation.done ?? [] : [];
      return plan.workouts.find((w) => !done.includes(w.id)) ?? null;
    },
    markWorkoutDone: (state, plan, id) => ({ planId: plan.id, done: [...new Set([...(state?.rotation?.planId === plan.id ? state.rotation.done : []), id])] }),
    nextTarget: (sessions, item) => ({ loadKg: 102.5, reps: 5, note: `+2.5 kg on ${item.exerciseId}` }),
    normalizeSession: (s) => ({
      ...s,
      strength: (s.strength ?? []).map((e) => ({ ...e, exerciseId: e.exerciseId ?? CATALOG.findExercise(e.name)?.id ?? null })),
    }),
    detectPrs: () => [],
    trainingSummary: () => ({ adherence: { pct: 90 }, lastSessionDate: "2026-11-05" }),
    availableEquipment: (profile, locId) => new Set(profile.equipment.locations.find((l) => l.id === locId)?.items ?? []),
    exerciseAllowed: (id, set) => {
      const ex = CATALOG.getExercise(id);
      if (!ex) return { ok: false, missing: [] };
      const missing = ex.equipment.all.filter((e) => !set.has(e));
      const anyOk = !ex.equipment.any.length || ex.equipment.any.some((e) => set.has(e));
      return { ok: !missing.length && anyOk, missing };
    },
    findSubstitutes: () => ["goblet_squat"],
    exerciseStats: () => ({ exposures: 3, bestE1rm: 116.7, trend: [], flag: null }),
    runningLoad: () => [{ km: 10, longestKm: 6 }, { km: 12, longestKm: 7 }],
    validatePlan: (plan) => {
      const known = new Set(CATALOG.EXERCISES.map((e) => e.id));
      const errors = [];
      plan.workouts.forEach((w) => w.blocks.forEach((b, bi) => (b.items ?? []).forEach((it, ii) => {
        if (b.kind === "strength" && !known.has(it.exerciseId)) errors.push({ code: "UNKNOWN_EXERCISE", workoutId: w.id, path: `blocks[${bi}].items[${ii}]`, message: `Unknown exercise ${it.exerciseId}` });
      })));
      return { ok: !errors.length, errors, warnings: [], stats: { setsPerMuscle: { quads: 6 }, runKm: 0, conditioningCount: 0 } };
    },
    ...overrides,
  };
}

const KNOWLEDGE = {
  CHAT_RULES: "CHAT_RULES_MARKER: coach well.",
  ONBOARDING_RULES: "ONBOARDING_RULES_MARKER: intake in rounds.",
  PLAN_RULES: "PLAN_RULES_MARKER: use the Plan JSON spec below and the provided exercise list.",
  COMMENT_RULES: "COMMENT_RULES_MARKER: win, observation, next target.",
};

const AGREED = {
  id: "2026-11-01", status: "agreed", weekStart: "2026-11-01", focus: "Strength base", rationale: "r", notes: [],
  workouts: [
    { id: "W1", title: "Lower A", type: "strength", locationId: "gym", estMinutes: 50, intent: "squat", blocks: [{ kind: "strength", items: [{ exerciseId: "back_squat", name: "Back squat", sets: 3, reps: "5", targetRir: 2, loadKg: 100, restSec: 180, progression: "linear", alternatives: [] }] }] },
    { id: "W2", title: "Upper A", type: "strength", locationId: "gym", estMinutes: 50, intent: "press", blocks: [{ kind: "strength", items: [{ exerciseId: "bench_press", name: "Bench press", sets: 3, reps: "8-12", targetRir: 2, loadKg: null, restSec: 120, progression: "double", alternatives: [] }] }] },
  ],
};

function profileOf(extra = {}) {
  return deepMerge({
    version: 1, onboarded: true, name: "Sam",
    goals: { primary: "Get stronger", modalities: { strength: true, running: false, conditioning: false } },
    schedule: { daysPerWeek: 2, minutesPerSession: 60, preferredDays: [], notes: "" },
    equipment: { defaultLocationId: "gym", locations: [{ id: "gym", name: "Gym", items: ["barbell", "plates", "squat_rack", "bench", "pullup_bar"], dumbbellMaxKg: null, kettlebellsKg: [], notes: "" }] },
    experience: { level: "intermediate", running: {}, conditioning: {}, knownLifts: [] },
    preferences: { likes: [], dislikes: [] },
    injuries: [],
  }, extra);
}

function makeStore({ profile = profileOf(), plans = [AGREED], sessions = [], chat = [], state = {}, coach = {} } = {}) {
  const d = {
    profile: clone(profile),
    coach: { summary: "", notes: [], ...clone(coach) },
    state: deepMerge({ schemaVersion: 1, settings: { theme: "system", chatTier: "default" }, rotation: { planId: AGREED.id, done: [] }, onboarding: { status: "done" }, pendingPlanRequest: null }, state),
    plans: clone(plans),
    sessions: clone(sessions),
    chat: clone(chat),
  };
  const writes = [];
  let seq = 0;
  const snap = (key) => { const prev = clone(d[key]); return async () => { d[key] = prev; writes.push(`undo:${key}`); }; };
  const store = {
    _data: d,
    _writes: writes,
    profile: {
      get: async () => clone(d.profile),
      update: async (patch) => { const undo = snap("profile"); d.profile = deepMerge(d.profile, patch); writes.push("profile.update"); return { profile: clone(d.profile), undo }; },
      subscribe: () => () => {},
    },
    coach: {
      get: async () => clone(d.coach),
      addNote: async ({ kind, text }) => { const undo = snap("coach"); const note = { id: `n${++seq}`, date: TODAY, kind, text }; d.coach.notes.push(note); writes.push("coach.addNote"); return { note, undo }; },
      setSummary: async (text) => { const undo = snap("coach"); d.coach.summary = String(text).slice(0, 2000); writes.push("coach.setSummary"); return { coach: clone(d.coach), undo }; },
    },
    state: {
      get: async () => clone(d.state),
      update: async (patch) => { const undo = snap("state"); d.state = deepMerge(d.state, patch); writes.push("state.update"); return { state: clone(d.state), undo }; },
    },
    plans: {
      getAgreed: async () => clone(d.plans.find((p) => p.status === "agreed") ?? null),
      getDraft: async () => clone(d.plans.find((p) => p.status === "draft") ?? null),
      list: async () => clone(d.plans),
      saveDraft: async (plan) => {
        const undo = snap("plans");
        const saved = { ...clone(plan), id: `${plan.weekStart}-${++seq}`, status: "draft" };
        d.plans = d.plans.filter((p) => p.status !== "draft").concat(saved);
        writes.push("plans.saveDraft");
        return { plan: clone(saved), replaced: [], undo };
      },
    },
    sessions: {
      add: async (s) => { const undo = snap("sessions"); const id = `${s.date}-abc${++seq}`; d.sessions.push({ ...clone(s), id }); writes.push("sessions.add"); return { id, session: { ...clone(s), id }, undo }; },
      get: async (id) => clone(d.sessions.find((s) => s.id === id) ?? null),
      update: async (id, patch) => { const undo = snap("sessions"); const i = d.sessions.findIndex((s) => s.id === id); d.sessions[i] = deepMerge(d.sessions[i], patch); writes.push("sessions.update"); return { session: clone(d.sessions[i]), undo }; },
      list: async ({ limit = 1000 } = {}) => clone([...d.sessions].sort((a, b) => b.date.localeCompare(a.date))).slice(0, limit),
    },
    chat: {
      append: async (m) => { const msg = { ...clone(m), id: `m${++seq}`, ts: `2026-11-07T10:${String(seq).padStart(2, "0")}:00.000Z` }; d.chat.push(msg); writes.push("chat.append"); return { message: msg, undo: async () => {} }; },
      recent: async (n = 24) => clone(d.chat.slice(-n)),
    },
  };
  return store;
}

/** A scripted sample stub: `script(input, options, n)` decides each call; records calls and in-tool calls. */
function scriptedSample(script, { limits } = {}) {
  let inTool = 0;
  const calls = [];
  const violations = [];
  const runTool = async (options, name, input) => {
    const tool = options.tools.find((t) => t.name === name);
    assert.ok(tool, `tool ${name} offered`);
    inTool += 1;
    try { return await tool.execute(input, { signal: new AbortController().signal }); } catch (e) { return `Error: ${e.message}`; } finally { inTool -= 1; }
  };
  const fn = async (input, options = {}) => {
    if (inTool) violations.push("sample");
    calls.push({ verb: "sample", input, options });
    return script(input, options, calls.length, { runTool: (n, i) => runTool(options, n, i) });
  };
  fn.json = async (input, options = {}) => {
    if (inTool) violations.push("json");
    calls.push({ verb: "json", input, options });
    return script(input, options, calls.length, { runTool: (n, i) => runTool(options, n, i) });
  };
  fn.limits = async () => limits ?? { maxPromptBytes: 262144, tools: { maxCount: 16 }, modelTiers: ["default", "complex", "quick"] };
  fn.calls = calls;
  fn.violations = violations;
  return fn;
}

function coachWith({ sample, store = makeStore(), core = makeCore(), uid = "u1" } = {}) {
  return { coach: createCoach({ runtime: { sample, uid }, store, core, catalog: CATALOG, knowledge: KNOWLEDGE, now: () => new Date("2026-11-07T10:00:00Z") }), store, sample };
}

function assertValidTurns(turns) {
  assert.ok(Array.isArray(turns) && turns.length >= 2);
  assert.equal(turns[0].role, "user");
  assert.equal(turns[turns.length - 1].role, "user");
  for (const t of turns) {
    assert.ok(t.role === "user" || t.role === "assistant");
    assert.ok(typeof t.content === "string" && t.content.trim().length > 0);
  }
}

// ---------- prompts: turn construction and budgets ----------

test("history window: ≤ 24 messages, ≤ 30 KB, oldest dropped, no empty turns", () => {
  const msgs = [];
  for (let i = 0; i < 60; i++) msgs.push({ role: i % 2 ? "assistant" : "user", text: `msg ${i} ` + "x".repeat(3000), actions: [], error: null });
  const turns = historyToTurns(msgs);
  assert.ok(turns.length <= CHAT_BUDGETS.historyMessages);
  assert.ok(turns.reduce((n, t) => n + utf8Bytes(t.content), 0) <= CHAT_BUDGETS.historyBytes);
  assert.match(turns[turns.length - 1].content, /^msg 59 /); // newest kept
  assert.ok(!turns.some((t) => t.content.startsWith("msg 35 "))); // oldest dropped
});

test("history: failed replies keep only their saved actions, unanswered messages are marked, events become user notes", () => {
  const turns = historyToTurns([
    { role: "user", text: "did squats" },
    { role: "assistant", text: "partial that must not be replayed", actions: [{ type: "logged_session", label: "Logged · Lower A", ref: "s1" }], error: "upstream_error" },
    { role: "user", text: "hello" },
    { role: "assistant", text: "", actions: [], error: "rate_limited" },
    { role: "event", text: "Plan approved" },
    { role: "user", text: "/clear" },
    { role: "system", text: "never a role" },
  ]);
  assert.equal(turns.length, 4);
  assert.equal(turns[1].role, "assistant");
  assert.ok(!turns[1].content.includes("partial"));
  assert.match(turns[1].content, /logged_session "Logged · Lower A" ref=s1/);
  assert.equal(turns[2].content, `hello\n${UNANSWERED_NOTE}`);
  assert.equal(turns[3].content, "[App event] Plan approved");
  assert.ok(turns.every((t) => t.role === "user" || t.role === "assistant"));
});

test("buildChatTurns starts and ends with user, drops a duplicated trailing user turn (manual retry)", () => {
  const turns = buildChatTurns({ instructions: "RULES", history: [{ role: "user", text: "hi" }, { role: "assistant", text: "hey" }, { role: "user", text: "same" }], userText: "same" });
  assertValidTurns(turns);
  assert.deepEqual(turns.map((t) => t.content), ["RULES", "hi", "hey", "same"]);
});

test("instructions turn stays ≤ 40 KB even with huge rules and data", () => {
  const huge = "y".repeat(30000);
  const snapshot = buildContextSnapshot({
    mode: "chat", today: TODAY, weekday: "Saturday",
    profile: profileOf({ goals: { why: huge } }),
    coach: { summary: huge, notes: Array.from({ length: 200 }, (_, i) => ({ date: TODAY, kind: "insight", text: `note ${i} ${"z".repeat(280)}` })) },
    agreedPlan: AGREED, state: { rotation: { planId: AGREED.id, done: [] } }, nextWorkout: AGREED.workouts[0],
    trainingSummary: { blob: huge }, recentSessions: Array.from({ length: 10 }, (_, i) => ({ date: TODAY, title: `S${i}`, type: "strength", notes: huge })),
  });
  assert.ok(utf8Bytes(snapshot) <= 26000);
  const turn = buildInstructionsTurn({ mode: "chat", rules: "r".repeat(20000), snapshot, toolNames: CHAT_TOOL_ORDER });
  assert.ok(utf8Bytes(turn) <= CHAT_BUDGETS.instructionsBytes, `instructions ${utf8Bytes(turn)} bytes`);
  assert.ok(turn.startsWith(MODE_LINE.chat));
  assert.match(snapshot, /Notes \(oldest → newest\)/);
  assert.ok(!snapshot.includes("note 179 "), "only the last 20 notes are included");
});

test("truncateBytes never splits a code point", () => {
  const s = truncateBytes("é".repeat(100) + "🏋️".repeat(50), 101);
  assert.ok(utf8Bytes(s) <= 101);
  assert.ok(!s.includes("�"));
});

test("tool specs: 10 chat tools, unique names, descriptions ≤ 1 KB, schemas ≤ 4 KB", () => {
  assert.equal(CHAT_TOOL_ORDER.length, 10);
  assert.equal(new Set(CHAT_TOOL_ORDER).size, 10);
  assert.equal(CHAT_TOOL_ORDER[0], "log_session", "log_session is never dropped first");
  for (const name of [...CHAT_TOOL_ORDER, ...ONBOARDING_TOOL_ORDER, ...REVIEW_TOOL_ORDER]) {
    const spec = TOOL_SPECS[name];
    assert.ok(spec, name);
    assert.ok(utf8Bytes(spec.description) <= 1024, `${name} description`);
    assert.ok(utf8Bytes(JSON.stringify(spec.inputSchema)) <= 4096, `${name} schema ${utf8Bytes(JSON.stringify(spec.inputSchema))}`);
    assert.equal(spec.inputSchema.type, "object");
  }
  assert.ok(ONBOARDING_TOOL_ORDER.includes("update_profile"));
  assert.ok(!ONBOARDING_TOOL_ORDER.includes("log_session"));
});

// ---------- chat with the mock sample ----------

test("send: log_session via the mock advances the rotation, streams, reports tools and persists actions", async () => {
  const sample = createMockSample({ delayMs: 0, chunkMs: 0 });
  const { coach, store } = coachWith({ sample });
  const updates = [];
  const tools = [];
  const res = await coach.send("did today's workout: 100x5,5,4 squats, knee 3/10", {
    onText: (u) => updates.push(u), onTool: (e) => tools.push(`${e.name}:${e.phase}`),
  });
  assert.equal(res.error, null);
  assert.ok(res.text.includes("Back squat"));
  // streaming guarantees: text grows, text === prev + delta, last equals result
  for (let i = 1; i < updates.length; i++) assert.equal(updates[i].text, updates[i - 1].text + updates[i].delta);
  assert.equal(updates.at(-1).text, res.text);
  assert.deepEqual(tools, ["log_session:start", "log_session:done"]);
  // stored session + rotation
  const s = store._data.sessions[0];
  assert.equal(s.workoutId, "W1");
  assert.equal(s.planId, AGREED.id);
  assert.deepEqual(s.strength[0].sets.map((x) => x.reps), [5, 5, 4]);
  assert.deepEqual(s.pain, [{ area: "knee", score: 3, when: "during" }]);
  assert.deepEqual(store._data.state.rotation.done, ["W1"]);
  // call shape
  const call = sample.calls[0];
  assertValidTurns(call.input);
  assert.equal(call.cache, undefined, "cache is omitted when tools are passed");
  assert.equal(call.modelTier, "default");
  assert.equal(call.toolNames.length, 10);
  assert.ok(call.input[0].content.includes("CHAT_RULES_MARKER"));
  // persisted messages: user then assistant with a plain action (no functions)
  const [u, a] = store._data.chat;
  assert.equal(u.role, "user");
  assert.equal(a.role, "assistant");
  assert.equal(a.actions[0].type, "logged_session");
  assert.equal(a.actions[0].ref, s.id);
  assert.equal(a.actions[0].undo, undefined);
  // the in-memory action can undo session + rotation together
  assert.equal(typeof res.actions[0].undo, "function");
  await res.actions[0].undo();
  assert.equal(store._data.sessions.length, 0);
  assert.deepEqual(store._data.state.rotation.done, []);
});

test("send: quick chat tier and the tools.maxCount limit are respected", async () => {
  const sample = scriptedSample(async () => ({ text: "ok", truncated: false }), { limits: { maxPromptBytes: 262144, tools: { maxCount: 3 }, modelTiers: ["default", "quick"] } });
  const { coach } = coachWith({ sample, store: makeStore({ state: { settings: { chatTier: "quick" } } }) });
  const res = await coach.send("hi");
  assert.equal(res.error, null);
  const opts = sample.calls[0].options;
  assert.equal(opts.modelTier, "quick");
  assert.equal(opts.tools.length, 3);
  assert.deepEqual(opts.tools.map((t) => t.name), CHAT_TOOL_ORDER.slice(0, 3));
  assert.equal("cache" in opts, false, "cache must not be passed with tools");
});

test("send: no tools are passed when limits() reports none", async () => {
  const sample = scriptedSample(async () => ({ text: "ok" }), { limits: { maxPromptBytes: 262144 } });
  const { coach } = coachWith({ sample });
  await coach.send("hi");
  assert.equal(sample.calls[0].options.tools, undefined);
  assert.match(sample.calls[0].input[0].content, /Tools are unavailable/);
});

test("request_plan sets pendingPlanRequest and makes no nested Claude call", async () => {
  const sample = createMockSample({ delayMs: 0, chunkMs: 0 });
  const { coach, store } = coachWith({ sample });
  const res = await coach.send("make me a plan for next week with more running");
  assert.equal(res.error, null);
  assert.equal(sample.calls.length, 1);
  assert.equal(store._data.state.pendingPlanRequest.kind, "generate");
  assert.match(store._data.state.pendingPlanRequest.instruction, /more running/);
  assert.equal(res.actions[0].type, "plan_request");
});

test("no Claude call happens inside any tool", async () => {
  const sample = scriptedSample(async (input, options, n, { runTool }) => {
    await runTool("get_plan", { which: "next" });
    await runTool("get_history", { exerciseId: "back_squat" });
    const logged = await runTool("log_session", { session: { type: "strength", workoutId: "next", strength: [{ name: "squat", sets: [{ loadKg: 100, reps: 5, rir: 2 }] }] } });
    await runTool("update_session", { id: logged.id, patch: { sessionRpe: 8 } });
    await runTool("update_profile", { patch: { schedule: { daysPerWeek: 4 } } });
    await runTool("add_coach_note", { kind: "goal", text: "Wants a 5k under 25 min" });
    await runTool("get_exercise_info", { query: "bench" });
    await runTool("request_plan", { kind: "revise", instruction: "more pulling" });
    return { text: "done" };
  });
  const { coach, store } = coachWith({ sample });
  const res = await coach.send("do everything");
  assert.equal(res.error, null);
  assert.deepEqual(sample.violations, []);
  assert.equal(sample.calls.length, 1);
  assert.deepEqual(res.actions.map((a) => a.type), ["logged_session", "updated_session", "updated_profile", "coach_note", "plan_request"]);
  assert.equal(store._data.sessions[0].sessionRpe, 8);
  assert.equal(store._data.profile.schedule.daysPerWeek, 4);
  assert.equal(store._data.state.pendingPlanRequest.kind, "generate", "revise without a draft becomes generate");
});

test("tool results stay compact and get_plan next carries app-computed targets", async () => {
  let planResult;
  const sample = scriptedSample(async (input, options, n, { runTool }) => {
    planResult = await runTool("get_plan", { which: "next" });
    return { text: "ok" };
  });
  const { coach } = coachWith({ sample });
  await coach.send("what's today?");
  assert.ok(utf8Bytes(JSON.stringify(planResult)) < 4096);
  assert.match(planResult.workout, /back_squat.*target 102\.5 kg × 5/);
  assert.equal(planResult.position, "1 of 2");
});

test("tool errors go back to Claude as thrown errors and an onTool error event", async () => {
  let out;
  const events = [];
  const sample = scriptedSample(async (input, options, n, { runTool }) => {
    out = await runTool("update_session", { id: "missing", patch: { notes: "x" } });
    return { text: "sorry" };
  });
  const { coach } = coachWith({ sample });
  const res = await coach.send("fix it", { onTool: (e) => events.push(e.phase) });
  assert.equal(res.error, null);
  assert.match(out, /^Error: No session with id missing/);
  assert.deepEqual(events, ["start", "error"]);
});

// ---------- onboarding ----------

test("onboarding: reduced tool set, update_profile saves rounds and finishing sets onboarded + state done", async () => {
  const sample = scriptedSample(async (input, options, n, { runTool }) => {
    assert.ok(input[0].content.startsWith(MODE_LINE.onboarding));
    assert.ok(input[0].content.includes("ONBOARDING_RULES_MARKER"));
    assert.deepEqual(options.tools.map((t) => t.name), ONBOARDING_TOOL_ORDER);
    const r1 = await runTool("update_profile", { patch: {
      goals: { primary: "Run a 10k", modalities: { running: true } },
      equipment: { locations: [{ id: "home", name: "Home", items: ["dumbbells", "spaceship"] }] },
      experience: { running: { easyPaceSecPerKm: "6:10", recentRace: { distanceKm: 5, timeSec: "27:30" } }, knownLifts: [{ name: "Back squat", loadKg: 80, reps: 5 }] },
    } });
    assert.ok(r1.notes.some((x) => x.includes("spaceship")));
    const r2 = await runTool("update_profile", { patch: { onboarded: true } });
    assert.equal(r2.onboarded, true);
    return { text: "All set!" };
  });
  const store = makeStore({ profile: profileOf({ onboarded: false }), state: { onboarding: { status: "not_started" } } });
  const { coach } = coachWith({ sample, store });
  assert.equal(coach.isOnboarding(), true);
  const res = await coach.send("I want to run a 10k, I have dumbbells at home");
  assert.equal(res.error, null);
  const p = store._data.profile;
  assert.equal(p.onboarded, true);
  assert.equal(store._data.state.onboarding.status, "done");
  assert.deepEqual(p.equipment.locations.map((l) => l.id), ["gym", "home"], "locations merged by id");
  assert.deepEqual(p.equipment.locations[1].items, ["dumbbells"], "unknown equipment ids dropped");
  assert.equal(p.experience.running.easyPaceSecPerKm, 370, "mm:ss pace converted");
  assert.equal(p.experience.running.recentRace.timeSec, 1650);
  assert.equal(p.experience.knownLifts[0].exerciseId, "back_squat", "lift name mapped to id");
  assert.equal(coach.isOnboarding(), false);
  assert.equal(res.actions.at(-1).label, "Onboarding complete");
});

test("startOnboarding: first coach message from a Start tap, persisted, state in_progress", async () => {
  const sample = createMockSample({ delayMs: 0, chunkMs: 0 });
  const store = makeStore({ profile: profileOf({ onboarded: false, screening: { outcome: null } }), state: { onboarding: { status: "not_started" } } });
  const { coach } = coachWith({ sample, store });
  const res = await coach.startOnboarding({});
  assert.equal(res.error, null);
  assert.match(res.text, /Quick health check/);
  assertValidTurns(sample.calls[0].input);
  assert.equal(store._data.state.onboarding.status, "in_progress");
  assert.equal(store._data.chat.length, 1);
  assert.equal(store._data.chat[0].role, "assistant");
});

// ---------- plans ----------

function planWith(exerciseId) {
  return {
    focus: "f", rationale: "r", notes: [],
    workouts: [
      { id: "W1", title: "A", type: "strength", estMinutes: 50, blocks: [{ kind: "strength", items: [{ exerciseId, sets: 3, reps: "5", targetRir: 2, loadKg: null, restSec: 120, progression: "linear" }] }] },
      { id: "W2", title: "B", type: "strength", estMinutes: 50, blocks: [{ kind: "strength", items: [{ exerciseId: "deadlift", sets: 3, reps: "5", targetRir: 2, loadKg: null, restSec: 120, progression: "linear" }] }] },
    ],
  };
}

test("generatePlan: invalid plan → one repair call listing issues → saveDraft with validation", async () => {
  const progress = [];
  const sample = scriptedSample(async (input, options, n) => (n === 1 ? planWith("moon_squat") : planWith("back_squat")));
  const { coach, store } = coachWith({ sample });
  const { plan, validation } = await coach.generatePlan({ instruction: "more squats", onProgress: (p) => progress.push(p.phase) });
  assert.equal(sample.calls.length, 2);
  for (const c of sample.calls) {
    assert.equal(c.verb, "json");
    assert.equal(c.options.modelTier, "complex");
    assert.equal(c.options.cache, false);
    assert.equal(c.options.tools, undefined);
  }
  const prompt = sample.calls[0].input;
  assert.ok(prompt.startsWith(PLAN_PROMPT_MARKER));
  assert.ok(prompt.includes("PLAN_RULES_MARKER"));
  assert.ok(prompt.includes("Plan JSON spec"));
  assert.ok(prompt.includes("the provided exercise list"));
  assert.ok(prompt.includes("more squats"));
  assert.ok(prompt.includes("exactly 2 workouts"));
  const allowedSection = prompt.split("# Allowed exercises")[1].split("\n# ")[0];
  assert.match(allowedSection, /^: the provided exercise list/);
  assert.match(allowedSection, /squat: back_squat\n/);
  assert.ok(!allowedSection.includes("leg_press"), "exercises needing missing equipment are not offered");
  assert.ok(!allowedSection.includes("goblet_squat"), "needs dumbbells, which the gym lacks");
  assert.match(prompt, /back_squat: 102\.5 kg × 5/, "app-computed targets are passed in");
  const repair = sample.calls[1].input;
  assert.ok(repair.startsWith(REPAIR_PROMPT_MARKER));
  assert.match(repair, /\[UNKNOWN_EXERCISE\] W1 blocks\[0\]\.items\[0\]: Unknown exercise moon_squat/);
  assert.equal(validation.ok, true);
  assert.equal(plan.status, "draft");
  assert.equal(plan.weekStart, "2026-11-08", "next week after the agreed plan's week");
  assert.equal(plan.workouts[0].blocks[0].items[0].name, "Back squat", "names filled from catalog");
  assert.deepEqual(plan.weeklyTargets.strengthSetsPerMuscle, { quads: 6 });
  assert.equal(store._data.plans.filter((p) => p.status === "draft").length, 1);
  assert.deepEqual(store._data.plans.find((p) => p.status === "draft").validation, validation);
  assert.deepEqual(progress, ["preparing", "generating", "validating", "repairing", "saving", "done"]);
});

test("generatePlan: still invalid after the repair → no third call, draft saved with its errors", async () => {
  const sample = scriptedSample(async () => planWith("moon_squat"));
  const { coach, store } = coachWith({ sample, store: makeStore({ state: { pendingPlanRequest: { kind: "generate", instruction: "", createdAt: "x" } } }) });
  const { validation } = await coach.generatePlan();
  assert.equal(sample.calls.length, 2);
  assert.equal(validation.ok, false);
  assert.equal(validation.errors[0].code, "UNKNOWN_EXERCISE");
  assert.equal(store._data.state.pendingPlanRequest, null, "the request is consumed");
});

test("generatePlan: falls back to the default tier when complex is absent", async () => {
  const sample = scriptedSample(async () => planWith("back_squat"), { limits: { maxPromptBytes: 262144, modelTiers: ["default", "quick"] } });
  const { coach } = coachWith({ sample });
  await coach.generatePlan();
  assert.equal(sample.calls[0].options.modelTier, "default");
});

test("generatePlan: errors reject {code}; nothing is saved and nothing is retried", async () => {
  for (const code of ["invalid_json", "rate_limited", "cancelled"]) {
    const sample = scriptedSample(async () => { throw { code, message: code }; });
    const { coach, store } = coachWith({ sample });
    await assert.rejects(coach.generatePlan(), (e) => e.code === code);
    assert.equal(sample.calls.length, 1, `${code}: called once`);
    assert.ok(!store._writes.includes("plans.saveDraft"));
  }
});

test("reviseDraft: sends the current draft and the instruction", async () => {
  const draft = { ...clone(AGREED), id: "2026-11-08", status: "draft", weekStart: "2026-11-08", focus: "DRAFT_FOCUS" };
  const sample = scriptedSample(async () => planWith("back_squat"));
  const { coach } = coachWith({ sample, store: makeStore({ plans: [AGREED, draft] }) });
  const { plan } = await coach.reviseDraft("swap bench for rows");
  assert.match(sample.calls[0].input, /Current draft to revise \(JSON\)\n.*DRAFT_FOCUS/);
  assert.match(sample.calls[0].input, /swap bench for rows/);
  assert.equal(plan.weekStart, "2026-11-08");
});

test("generatePlan with the mock sample returns a valid plan built from the allowed list", async () => {
  const sample = createMockSample({ delayMs: 0, chunkMs: 0 });
  const { coach } = coachWith({ sample, store: makeStore({ profile: profileOf({ schedule: { daysPerWeek: 3 } }) }) });
  const { plan, validation } = await coach.generatePlan();
  assert.equal(validation.ok, true);
  assert.equal(plan.workouts.length, 3);
  const ids = plan.workouts.flatMap((w) => w.blocks.flatMap((b) => (b.kind === "strength" ? b.items.map((i) => i.exerciseId) : [])));
  assert.ok(ids.length > 0);
  const allowed = new Set(["back_squat", "bench_press", "deadlift", "pull_up", "barbell_row", "burpee"]);
  for (const id of ids) assert.ok(allowed.has(id), id);
});

// ---------- error handling ----------

test("not_granted: send resolves {error}, persists an error reply, status flips, later sends don't call Claude", async () => {
  const sample = scriptedSample(async () => { throw { code: "not_granted", message: "declined" }; });
  const { coach, store } = coachWith({ sample });
  const res = await coach.send("hi");
  assert.equal(res.error, "not_granted");
  assert.deepEqual(coach.status(), { available: false, reason: "not_granted", code: "not_granted" });
  const last = store._data.chat.at(-1);
  assert.equal(last.role, "assistant");
  assert.equal(last.error, "not_granted");
  const again = await coach.send("hello?");
  assert.equal(again.error, "not_granted");
  assert.equal(sample.calls.length, 1);
});

test("rate_limited: resolved once, kept partial text, never retried; status stays available", async () => {
  const sample = scriptedSample(async () => { throw { code: "rate_limited", message: "limit", text: "Partial ans" }; });
  const { coach, store } = coachWith({ sample });
  const res = await coach.send("hi");
  assert.equal(res.error, "rate_limited");
  assert.equal(res.text, "Partial ans");
  assert.equal(sample.calls.length, 1);
  assert.equal(coach.status().available, true);
  assert.equal(store._data.chat.at(-1).text, "Partial ans");
  // manual retry with the same text does not duplicate the user message
  await coach.send("hi");
  assert.equal(store._data.chat.filter((m) => m.role === "user").length, 1);
  assert.equal(sample.calls.length, 2);
});

test("refused: partial text is withdrawn", async () => {
  const sample = scriptedSample(async () => { throw { code: "refused", message: "no", text: "should vanish" }; });
  const { coach } = coachWith({ sample });
  const res = await coach.send("hi");
  assert.equal(res.error, "refused");
  assert.equal(res.text, "");
});

test("cancelled: aborting the mock mid-stream resolves {error: 'cancelled'} with the partial text", async () => {
  const sample = createMockSample({ delayMs: 0, chunkMs: 5 });
  const { coach, store } = coachWith({ sample });
  const ctl = new AbortController();
  const res = await coach.send("tell me about protein", { signal: ctl.signal, onText: ({ text }) => { if (text.length > 10) ctl.abort(); } });
  assert.equal(res.error, "cancelled");
  assert.ok(res.text.length > 10);
  assert.equal(store._data.chat.at(-1).error, "cancelled");
});

test("sample unavailable or no user: status explains, send resolves an error without calling", async () => {
  const { coach } = coachWith({ sample: null });
  assert.deepEqual(coach.status(), { available: false, reason: "sample_unavailable", code: "sample_unavailable" });
  const res = await coach.send("hi");
  assert.equal(res.error, "sample_unavailable");
  await assert.rejects(coach.generatePlan(), (e) => e.code === "sample_unavailable");

  const sample = scriptedSample(async () => ({ text: "x" }));
  const noUser = coachWith({ sample, uid: null });
  assert.equal(noUser.coach.status().reason, "no_user");
  assert.equal((await noUser.coach.send("hi")).error, "no_user");
  assert.equal(sample.calls.length, 0);
});

test("errorCopy covers every sample error code and the store codes", () => {
  const fallback = errorCopy("something_new");
  for (const code of SAMPLE_ERROR_CODES) {
    const text = errorCopy(code);
    assert.ok(text && text.length > 3, code);
    if (code !== "upstream_error") assert.notEqual(text, fallback, code);
  }
  for (const code of ["no_user", "db_unavailable", "not_found", "invalid_argument", "internal", "resource_exhausted", "quota_exceeded", "unavailable", "revoked", "sample_unavailable"]) {
    assert.notEqual(errorCopy(code), fallback, code);
  }
});

// ---------- summarization ----------

function oldChat(n) {
  return Array.from({ length: n }, (_, i) => ({ id: `m${i}`, ts: `2026-11-0${1 + Math.floor(i / 30)}T08:${String(i % 60).padStart(2, "0")}:00.000Z`, role: i % 2 ? "assistant" : "user", text: `old message ${i}`, actions: [], error: null }));
}

test("summary: a stale summary triggers one quick-tier summarization before the main call", async () => {
  const sample = scriptedSample(async (input, options, n) => (n === 1 ? { text: "- likes mornings" } : { text: "main reply" }));
  const { coach, store } = coachWith({ sample, store: makeStore({ chat: oldChat(70) }) });
  const res = await coach.send("hi");
  assert.equal(res.error, null);
  assert.equal(sample.calls.length, 2);
  assert.ok(sample.calls[0].input.startsWith(SUMMARY_PROMPT_MARKER));
  assert.equal(sample.calls[0].options.modelTier, "quick");
  assert.equal(sample.calls[0].options.tools, undefined);
  const { throughTs, text } = parseSummary(store._data.coach.summary);
  assert.equal(text, "- likes mornings");
  assert.ok(throughTs, "marker stored");
  assert.ok(sample.calls[1].input[0].content.includes("- likes mornings"));
  assert.ok(!sample.calls[1].input[0].content.includes("[through "), "marker stripped from the prompt");
});

test("summary: not run when ≤ 40 messages are newer than the last summary", async () => {
  const chat = oldChat(70);
  const sample = scriptedSample(async () => ({ text: "main" }));
  const { coach } = coachWith({ sample, store: makeStore({ chat, coach: { summary: `[through ${chat[40].ts}]\n- old facts` } }) });
  await coach.send("hi");
  assert.equal(sample.calls.length, 1);
});

test("summary: a rate_limited summary ends the send without the main call", async () => {
  const sample = scriptedSample(async () => { throw { code: "rate_limited", message: "x" }; });
  const { coach } = coachWith({ sample, store: makeStore({ chat: oldChat(70) }) });
  const res = await coach.send("hi");
  assert.equal(res.error, "rate_limited");
  assert.equal(sample.calls.length, 1);
});

// ---------- comments ----------

test("commentOnSession: quick tier, ≤ 80 words, saved to the session", async () => {
  const session = { id: "2026-11-06-aaa111", date: "2026-11-06", planId: AGREED.id, workoutId: "W1", title: "Lower A", type: "strength", status: "done", strength: [{ exerciseId: "back_squat", sets: [{ type: "work", loadKg: 100, reps: 5, rir: 2 }] }], pain: [] };
  const sample = scriptedSample(async () => ({ text: Array.from({ length: 120 }, (_, i) => `word${i}`).join(" ") }));
  const { coach, store } = coachWith({ sample, store: makeStore({ sessions: [session] }) });
  const text = await coach.commentOnSession(session.id);
  assert.ok(text.split(/\s+/).length <= 80);
  assert.equal(store._data.sessions[0].coachComment, text);
  const call = sample.calls[0];
  assert.ok(call.input.startsWith(COMMENT_PROMPT_MARKER));
  assert.ok(call.input.includes("COMMENT_RULES_MARKER"));
  assert.match(call.input, /back_squat: 102\.5 kg × 5/);
  assert.equal(call.options.modelTier, "quick");
  assert.equal(call.options.cache, false);
  await assert.rejects(coach.commentOnSession("nope"), (e) => e.code === "not_found");
});

test("clampWords keeps short text and cuts long text", () => {
  assert.equal(clampWords("Nice work today."), "Nice work today.");
  assert.ok(clampWords("a ".repeat(200), 80).split(/\s+/).length <= 80);
});

// ---------- the mock itself ----------

test("mock: limits shape, input validation and abort", async () => {
  const sample = createMockSample({ delayMs: 0, chunkMs: 0 });
  assert.deepEqual(await sample.limits(), { maxPromptBytes: 262144, tools: { maxCount: 16 }, modelTiers: ["default", "complex", "quick"] });
  await assert.rejects(sample([{ role: "assistant", content: "x" }, { role: "user", content: "y" }]), (e) => e.code === "invalid_request");
  await assert.rejects(sample([{ role: "user", content: "" }]), (e) => e.code === "invalid_request");
  await assert.rejects(sample("hi", { tools: [{ name: "t", description: "d", execute() {} }], cache: true }), (e) => e.code === "invalid_request");
  await assert.rejects(sample("x".repeat(262145)), (e) => e.code === "prompt_too_large");
  const ctl = new AbortController();
  ctl.abort();
  await assert.rejects(sample("hi", { signal: ctl.signal }), (e) => e.code === "cancelled");
  await assert.rejects(sample([{ role: "user", content: "Mode: chat" }, { role: "user", content: "!fail upstream_error" }]), (e) => e.code === "upstream_error");
  const r = await sample("hello there");
  assert.equal(typeof r.text, "string");
  assert.equal(r.truncated, false);
});

test("mock: json() builds a plan with the requested workout count from a plan prompt", async () => {
  const sample = createMockSample({ delayMs: 0, chunkMs: 0 });
  const profile = profileOf({ schedule: { daysPerWeek: 4, minutesPerSession: 45 }, goals: { modalities: { strength: true, running: true } }, equipment: { locations: [{ id: "gym", name: "Gym", items: ["barbell", "plates", "squat_rack", "bench", "pullup_bar", "outdoor_route"] }] } });
  const prompt = buildPlanPrompt({
    rules: "", today: TODAY, weekStart: "2026-11-08", workoutCount: 4, minutesPerSession: 45, profile,
    runLoad: { avgWeeklyKm: 10, longestKm: 6, weeks: 4 },
    allowedLocations: [{ id: "gym", name: "Gym", exercises: CATALOG.EXERCISES.filter((e) => e.id !== "leg_press") }],
  });
  const plan = expandPlan(await sample.json(prompt, { modelTier: "complex", cache: false })); // the mock replies compactly
  assert.equal(plan.workouts.length, 4);
  assert.deepEqual(plan.workouts.map((w) => w.type), ["strength", "run", "strength", "run"]);
  const runKm = plan.workouts.flatMap((w) => w.blocks).filter((b) => b.kind === "run").reduce((n, b) => n + b.totalKm, 0);
  assert.ok(runKm <= 15, `run km ${runKm} within the cap`);
  for (const w of plan.workouts) assert.ok(w.estMinutes <= 45 + 15, `${w.id} ${w.estMinutes} min`);
});

test("mock: parseWorkoutReport reads sets, runs and pain", () => {
  const a = parseWorkoutReport("did 100x5,5,4 squats, knee 3/10").session;
  assert.equal(a.strength[0].exerciseId, "back_squat");
  assert.deepEqual(a.strength[0].sets.map((s) => [s.loadKg, s.reps]), [[100, 5], [100, 5], [100, 4]]);
  assert.deepEqual(a.pain, [{ area: "knee", score: 3, when: "during" }]);
  const b = parseWorkoutReport("ran 8.2 km in 45:10, felt easy").session;
  assert.equal(b.type, "run");
  assert.equal(b.run.distanceKm, 8.2);
  assert.equal(b.run.durationSec, 2710);
  const c = parseWorkoutReport("3x8 @60 bench").session;
  assert.deepEqual(c.strength[0].sets.map((s) => [s.loadKg, s.reps]), [[60, 8], [60, 8], [60, 8]]);
});

// ---------- integration with the real modules (skipped while any is still a skeleton) ----------

async function realModules() {
  try {
    const [core, catalog, knowledge, storeMod, storeMock] = await Promise.all([
      import("../src/core.js"), import("../src/catalog.js"), import("../src/knowledge/index.js"), import("../src/store.js"), import("../src/store-mock.js"),
    ]);
    core.todayISO();
    if (!catalog.EXERCISES.length || !knowledge.CHAT_RULES) return null;
    storeMock.createMockDb();
    return { core, catalog, knowledge, createStore: storeMod.createStore, createMockDb: storeMock.createMockDb };
  } catch {
    return null;
  }
}
const REAL = await realModules();

test("integration: onboarding → plan → today → log with real core, catalog, store and knowledge", { skip: REAL ? false : "other modules not implemented yet" }, async () => {
  const { core, catalog, knowledge, createStore, createMockDb } = REAL;
  const store = createStore(createMockDb(), "u1");
  const sample = createMockSample({ delayMs: 0, chunkMs: 0 });
  const coach = createCoach({ runtime: { sample, uid: "u1" }, store, core, catalog, knowledge });
  assert.equal((await coach.startOnboarding({})).error, null);
  for (const a of ["no to all", "get stronger and run a 10k", "4 days, 60 min", "commercial gym, also run outside", "intermediate, 3 years, 15 km a week"]) {
    assert.equal((await coach.send(a)).error, null, a);
  }
  assert.equal(coach.isOnboarding(), false);
  assert.equal((await store.state.get()).onboarding.status, "done");
  const { plan, validation } = await coach.generatePlan();
  assert.deepEqual(validation.errors, [], JSON.stringify(validation.errors));
  assert.equal(plan.workouts.length, 4);
  await store.plans.approve(plan.id);
  const today = await coach.send("what's my workout today?");
  assert.match(today.text, /back_squat|bench_press|deadlift/);
  const logged = await coach.send("did today's workout: 100x5,5,4 squats, knee 3/10");
  assert.equal(logged.actions[0]?.type, "logged_session");
  assert.deepEqual((await store.state.get()).rotation.done, [plan.workouts[0].id]);
  for (const c of sample.calls) if (Array.isArray(c.input)) assert.ok(utf8Bytes(c.input[0].content) <= CHAT_BUDGETS.instructionsBytes);
});

// ---------- regression: every chat send failed with invalid_request after onboarding (live, 2026-11-07) ----------

/** An independent walk of the conservative JSON Schema subset (does not reuse checkToolSchema). */
function walkSchema(node, path, problems) {
  const allowedKeys = new Set(["type", "properties", "required", "items", "enum", "description"]);
  assert.ok(isObj(node), `${path} is an object`);
  for (const k of Object.keys(node)) if (!allowedKeys.has(k)) problems.push(`${path}: keyword ${k}`);
  if (typeof node.type !== "string" || !["object", "array", "string", "number", "integer", "boolean"].includes(node.type)) problems.push(`${path}: type ${JSON.stringify(node.type)}`);
  if ("description" in node && (typeof node.description !== "string" || utf8Bytes(node.description) > 1024)) problems.push(`${path}: description`);
  if ("enum" in node && (node.type !== "string" || !node.enum.every((v) => typeof v === "string"))) problems.push(`${path}: enum`);
  if (node.type === "object") {
    for (const [name, sub] of Object.entries(node.properties ?? {})) {
      if (RESERVED_PROPERTY_NAMES.includes(name)) problems.push(`${path}: property named ${name}`);
      walkSchema(sub, `${path}.${name}`, problems);
    }
    for (const r of node.required ?? []) if (!(r in (node.properties ?? {}))) problems.push(`${path}: required ${r} undeclared`);
  } else if (node.type === "array") {
    if (!isObj(node.items)) problems.push(`${path}: array without items`);
    else walkSchema(node.items, `${path}[]`, problems);
  } else if ("properties" in node || "items" in node || "required" in node) problems.push(`${path}: structure on a scalar`);
}

test("tool schemas: conservative subset only (no type arrays, null, oneOf/anyOf/$ref, keyword-named fields), ≤ 4 KB pretty, descriptions ≤ 1 KB", () => {
  for (const [name, spec] of Object.entries(TOOL_SPECS)) {
    const problems = [];
    walkSchema(spec.inputSchema, name, problems);
    assert.deepEqual(problems, [], name);
    assert.equal(spec.inputSchema.type, "object");
    assert.ok(utf8Bytes(JSON.stringify(spec.inputSchema, null, 2)) <= 4096, `${name} pretty size ${utf8Bytes(JSON.stringify(spec.inputSchema, null, 2))}`);
    assert.ok(utf8Bytes(spec.description) <= 1024, `${name} description`);
    assert.match(spec.name, /^[A-Za-z0-9_-]{1,128}$/);
    assert.deepEqual(checkToolSpec(spec), [], name);
    assert.ok(!/"type":\s*(\[|"null")/.test(JSON.stringify(spec.inputSchema)), `${name} has a type array or null type`);
  }
  assert.deepEqual(SCHEMA_KEYWORDS, ["type", "properties", "required", "items", "enum", "description"]);
  assert.ok(SCHEMA_TYPES.includes("object"));
});

test("checkToolSchema rejects the constructs the platform may refuse", () => {
  const ok = { type: "object", properties: { a: { type: "number" } }, required: ["a"] };
  assert.deepEqual(checkToolSchema(ok), []);
  const bad = [
    { type: "object", properties: { a: { type: ["number", "null"] } } },
    { type: "object", properties: { a: { type: "null" } } },
    { type: "object", properties: { a: { anyOf: [{ type: "string" }, { type: "number" }] } } },
    { type: "object", properties: { a: { $ref: "#/x" } } },
    { type: "object", properties: { a: { type: "string" } }, additionalProperties: false },
    { type: "object", properties: { type: { type: "string" } } },
    { type: "object", properties: { a: { enum: ["x", "y"] } } },
    { type: "object", properties: { a: { type: "array" } } },
    { type: "object", required: ["missing"] },
    { type: "object", properties: { a: { type: "string", description: "x".repeat(5000) } } },
    { type: "string" },
  ];
  for (const s of bad) assert.ok(checkToolSchema(s).length > 0, JSON.stringify(s).slice(0, 80));
});

test("mock enforces the platform's invalid_request rules (roles, empty turns, schemas, cache with tools)", async () => {
  const sample = createMockSample({ delayMs: 0, chunkMs: 0 });
  const tool = (inputSchema) => ({ name: "t", description: "d", inputSchema, execute() { return "ok"; } });
  const rejects = (p, re) => assert.rejects(p, (e) => e.code === "invalid_request" && (!re || re.test(e.message)));
  await rejects(sample([{ role: "user", content: "x" }, { role: "event", content: "Plan approved" }, { role: "user", content: "y" }]), /role "event"/);
  await rejects(sample([{ role: "user", content: "x" }, { role: "assistant", content: "" }, { role: "user", content: "y" }]), /empty content/);
  await rejects(sample([{ role: "user", content: "x" }, { role: "assistant", content: "y" }]), /start and end/);
  await rejects(sample("hi", { tools: [tool({ type: "object", properties: { a: { type: ["number", "null"] } } })] }), /inputSchema refused/);
  await rejects(sample("hi", { tools: [tool({ type: "object", properties: { a: { type: "number" } } })], cache: { gcTime: 1000 } }));
  await rejects(sample("hi", { signal: new AbortController() }));
  await rejects(sample("hi", { modelTier: "turbo" }));
  await rejects(sample("hi", { tools: Array.from({ length: 17 }, (_, i) => ({ ...tool(), name: `t${i}` })) }));
  const ok = await sample("hi", { tools: [tool({ type: "object", properties: { a: { type: "number" } } })], cache: false });
  assert.equal(typeof ok.text, "string");
});

/** The live timeline, with synthetic text: onboarding chat, plan approved event, /clear and failed empty replies. */
function liveTimeline() {
  let n = 0;
  const m = (role, text, extra = {}) => ({ id: `m${++n}`, ts: `2026-11-07T09:${String(n).padStart(2, "0")}:00.000Z`, role, text, actions: [], error: null, ...extra });
  return [
    m("assistant", "Hi, I'm your coach. First, seven quick safety questions."),
    m("user", "all no"),
    m("assistant", "Thanks, saved. Round 2: goals?", { actions: [{ type: "updated_profile", label: "Profile updated · screening", ref: null }] }),
    m("user", "strength plus endurance, 5 days"),
    m("assistant", "Your intake is done and saved.", { actions: [{ type: "plan_request", label: "Plan requested", ref: "generate" }, { type: "updated_profile", label: "Onboarding complete", ref: null }] }),
    m("event", "Plan approved: Week 1 calibration"),
    m("user", "/clear"),
    m("assistant", "", { error: "invalid_request" }),
    m("user", "im starting my workout"),
    m("assistant", "", { error: "invalid_request" }),
    m("user", "Today I did workout number 1"),
    m("assistant", "", { error: "invalid_request" }),
    m("assistant", "", { error: "invalid_request" }),
  ];
}

function assertPlatformValid(call) {
  assertValidTurns(call.input);
  for (let i = 2; i < call.input.length; i++) assert.notEqual(call.input[i].role, call.input[i - 1].role, `turns ${i - 1}/${i} share a role`);
  assert.ok(call.input[0].content.endsWith(INSTRUCTIONS_END));
  for (const t of call.options?.tools ?? []) assert.deepEqual(checkToolSpec(t), [], t.name);
  if (call.options?.tools) assert.equal("cache" in call.options, false);
}

test("regression: after onboarding + plan approved + failed empty replies, the next send builds valid turns and tools", async () => {
  const mock = createMockSample({ delayMs: 0, chunkMs: 0 });
  const calls = [];
  const sample = async (input, options) => { calls.push({ input, options }); return mock(input, options); };
  sample.json = mock.json;
  sample.limits = mock.limits;
  const store = makeStore({ chat: liveTimeline() });
  const { coach } = coachWith({ sample, store });

  const res = await coach.send("What's my workout today?");
  assert.equal(res.error, null, res.errorDetail);
  const call = calls[0];
  assertPlatformValid(call);
  assert.equal(call.options.tools.length, 10);
  const contents = call.input.map((t) => t.content);
  assert.ok(contents.some((c) => c.includes("[App event] Plan approved: Week 1 calibration")));
  assert.ok(!contents.some((c) => /^\/clear$/m.test(c)), "/clear never reaches Claude");
  assert.ok(contents.some((c) => c.includes(`Today I did workout number 1\n${UNANSWERED_NOTE}`)));
  assert.equal(call.input.at(-1).content.split("\n\n").at(-1), "What's my workout today?");
  assert.ok(!call.input.some((t) => t.role === "assistant" && /invalid_request/.test(t.content)));

  // a manual retry of the last failed message is not stored twice and works
  const before = store._data.chat.filter((x) => x.role === "user").length;
  const retry = await coach.send("Today I did workout number 1");
  assert.equal(retry.error, null);
  assertPlatformValid(calls[1]);
  assert.equal(store._data.chat.filter((x) => x.role === "user").length, before + 1); // only the first new message was added
});

test("regression: a stored event right before the new message is merged into the final user turn", () => {
  const turns = buildChatTurns({
    instructions: `RULES\n\n${INSTRUCTIONS_END}`,
    history: [{ role: "assistant", text: "hello" }, { role: "event", text: "Plan approved: W1" }, { role: "assistant", text: "", error: "upstream_error" }],
    userText: "next?",
  });
  assert.deepEqual(turns.map((t) => t.role), ["user", "assistant", "user"]);
  assert.equal(turns[2].content, "[App event] Plan approved: W1\n\nnext?");
});

test("normalizeTurns: other roles become notes, empties dropped, same roles merged, starts/ends on user", () => {
  const out = normalizeTurns([
    { role: "assistant", content: "lead" }, { role: "user", content: "a" }, { role: "user", content: "b" },
    { role: "event", content: "x" }, { role: "assistant", content: "  " }, { role: "assistant", content: "c" }, { role: "assistant", content: "trail" },
  ]);
  assert.deepEqual(out, [{ role: "user", content: "a\n\nb\n\n[App event] x" }]);
  assert.deepEqual(normalizeTurns([{ role: "user", content: `I\n${INSTRUCTIONS_END}` }, { role: "user", content: "q" }]).length, 2);
  assert.deepEqual(normalizeTurns([]), []);
});

test("a rejected call keeps code and message: errorDetail (≤ 300 chars) is stored and returned", async () => {
  const long = "tools[0].inputSchema: Claude's API refused the schema: " + "x".repeat(600);
  const sample = scriptedSample(async () => { throw { code: "invalid_request", message: long }; });
  const { coach, store } = coachWith({ sample });
  const res = await coach.send("hi");
  assert.equal(res.error, "invalid_request");
  assert.ok(res.errorDetail.startsWith("tools[0].inputSchema"));
  const saved = store._data.chat.at(-1);
  assert.equal(saved.role, "assistant");
  assert.equal(saved.error, "invalid_request");
  assert.ok(saved.errorDetail.length <= 300 && saved.errorDetail.startsWith("tools[0]"));
  // the failed reply is excluded from the next call's turns
  const sample2 = scriptedSample(async () => ({ text: "ok" }));
  const again = createCoach({ runtime: { sample: sample2, uid: "u1" }, store, core: makeCore(), catalog: CATALOG, knowledge: KNOWLEDGE, now: () => new Date("2026-11-07T10:00:00Z") });
  await again.send("hello again");
  assert.deepEqual(sample2.calls[0].input.map((t) => t.role), ["user", "user"]);
  assert.match(sample2.calls[0].input[1].content, /^hi\n\[App note.*\n\nhello again$/s);
});

test("/clear is a UI command: never stored, never sent to Claude", async () => {
  const sample = scriptedSample(async () => ({ text: "ok" }));
  const { coach, store } = coachWith({ sample });
  const res = await coach.send("  /clear ");
  assert.equal(res.command, "clear");
  assert.equal(res.error, null);
  assert.equal(sample.calls.length, 0);
  assert.equal(store._data.chat.length, 0);
});

test("log_session accepts the keyword-free flat tool input and maps it to a Session", async () => {
  const { sessionFromToolInput } = await import("../src/brain.js");
  const s = sessionFromToolInput({
    sessionType: "hybrid", workoutTitle: "Full body", workoutId: "next",
    strength: [{ name: "Back squat", sets: [{ reps: 5, warmup: true }, { loadKg: 100, reps: 5, rir: 2 }] }],
    conditioning: [{ metconFormat: "AMRAP", summary: "12 min burpees", rounds: 5, completed: true }],
  });
  assert.equal(s.type, "hybrid");
  assert.equal(s.title, "Full body");
  assert.deepEqual(s.strength[0].sets, [{ reps: 5, type: "warmup", loadKg: null, rir: null }, { loadKg: 100, reps: 5, rir: 2, type: "work" }]);
  assert.deepEqual(s.conditioning[0], { format: "AMRAP", description: "12 min burpees", result: { rounds: 5, completed: true } });
  assert.equal(sessionFromToolInput({ session: { type: "run" } }).type, "run");
  assert.equal(sessionFromToolInput({}), null);
});

test("after store.chat.clear() the next send starts fresh and works (real store)", { skip: REAL ? false : "other modules not implemented yet" }, async () => {
  const { createStore, createMockDb } = REAL;
  const now = () => new Date("2026-11-07T10:00:00Z");
  const store = createStore(createMockDb(), "u1", { now });
  await store.profile.update(profileOf());
  for (const msg of liveTimeline()) await store.chat.append(msg);
  const coachMem = await store.coach.addNote({ kind: "goal", text: "Squat 120" });
  const sample = scriptedSample(async () => ({ text: "Fresh start." }));
  const coach = createCoach({ runtime: { sample, uid: "u1" }, store, core: makeCore(), catalog: CATALOG, knowledge: KNOWLEDGE, now });
  const { undo } = await store.chat.clear();
  assert.deepEqual(await store.chat.recent(50), []);
  const res = await coach.send("hello");
  assert.equal(res.error, null);
  assert.deepEqual(sample.calls[0].input.map((t) => t.role), ["user", "user"]);
  assert.equal(sample.calls[0].input[1].content, "hello");
  assert.match(sample.calls[0].input[0].content, /Squat 120/, "long-term memory still in the context");
  assert.ok(coachMem.note || coachMem.id || coachMem.undo);
  await undo();
  assert.ok((await store.chat.recent(50)).length >= liveTimeline().length);
});

// ---------- v2 (Agent F): exercise feedback, update_plan_workout, log_wellness, post-workout review ----------

/** makeStore plus the v2 store surface: plans.get / plans.update and wellness. */
function makeStoreV2(opts = {}) {
  const store = makeStore(opts);
  const d = store._data;
  d.wellness = clone(opts.wellness ?? []);
  store.plans.get = async (id) => clone(d.plans.find((p) => p.id === id) ?? null);
  store.plans.update = async (id, patch) => {
    const i = d.plans.findIndex((p) => p.id === id);
    if (i < 0) throw { code: "not_found", message: "no plan" };
    const prev = clone(d.plans[i]);
    d.plans[i] = { ...d.plans[i], ...clone(patch), updatedAt: "now" };
    store._writes.push("plans.update");
    return { plan: clone(d.plans[i]), undo: async () => { d.plans[i] = prev; store._writes.push("undo:plans"); } };
  };
  store.wellness = {
    add: async (e) => {
      const prev = clone(d.wellness);
      const i = d.wellness.findIndex((x) => x.date === e.date);
      const merged = { ...(i >= 0 ? d.wellness[i] : {}), ...clone(e) };
      if (i >= 0) d.wellness[i] = merged; else d.wellness.push(merged);
      store._writes.push("wellness.add");
      return { entry: clone(merged), undo: async () => { d.wellness = prev; } };
    },
    list: async ({ from, to } = {}) => clone(d.wellness.filter((x) => (!from || x.date >= from) && (!to || x.date <= to))),
  };
  return store;
}

/** A chat send whose Claude calls one tool with `input` and replies "ok"; resolves { res, out, store, coach }. */
async function sendWithTool(name, input, { store = makeStoreV2(), core = makeCore() } = {}) {
  let out;
  const sample = scriptedSample(async (inp, options, n, { runTool }) => {
    out = await runTool(name, input);
    return { text: "ok", truncated: false };
  });
  const { coach } = coachWith({ sample, store, core });
  const res = await coach.send("please do it");
  return { res, out, store, coach, sample };
}

test("log_session schema takes per-exercise and metcon feedback; feedback reaches the stored session", async () => {
  const strengthItems = TOOL_SPECS.log_session.inputSchema.properties.strength.items.properties;
  assert.deepEqual(strengthItems.feedback.enum, ["easy", "fine", "hard"]);
  assert.deepEqual(TOOL_SPECS.log_session.inputSchema.properties.conditioning.items.properties.feedback.enum, ["easy", "fine", "hard"]);
  for (const name of ["log_session", "update_plan_workout", "log_wellness", "update_session"]) assert.deepEqual(checkToolSpec(TOOL_SPECS[name]), [], name);
  const { res, store } = await sendWithTool("log_session", {
    sessionType: "strength", workoutId: "next",
    strength: [{ exerciseId: "back_squat", sets: [{ loadKg: 100, reps: 5 }], feedback: "hard" }],
  });
  assert.equal(res.error, null);
  assert.equal(store._data.sessions[0].strength[0].feedback, "hard");
});

test("mock: 'squats felt hard' logs feedback; 'mark bench as hard' tags it later and trims the next workout", async () => {
  const mock = createMockSample({ delayMs: 0, chunkMs: 0 });
  const store = makeStoreV2();
  const { coach } = coachWith({ sample: mock, store });
  const r1 = await coach.send("did today's workout: 100x5,5,4 squats, felt hard");
  assert.equal(r1.error, null, r1.errorDetail);
  assert.equal(store._data.sessions[0].strength[0].feedback, "hard");
  const logCall = mock.toolCalls.find((c) => c.name === "log_session");
  assert.equal(logCall.input.strength[0].feedback, "hard");
  // later: tag via update_session, then the coach adjusts the up-next workout (W2: bench 3 sets → 2)
  store._data.sessions[0].strength.push({ exerciseId: "bench_press", name: "Bench press", sets: [{ type: "work", loadKg: 80, reps: 8, rir: 1 }] });
  const r2 = await coach.send("mark bench as hard");
  assert.equal(r2.error, null, r2.errorDetail);
  assert.equal(store._data.sessions[0].strength[1].feedback, "hard");
  assert.deepEqual(r2.actions.map((a) => a.type), ["updated_session", "plan_change"]);
  assert.equal(store._data.plans[0].workouts[1].blocks[0].items[0].sets, 2);
});

test("update_session: feedback patch tags exercises without resending sets", async () => {
  const store = makeStoreV2({ sessions: [{ id: "s1", date: TODAY, title: "Lower A", type: "strength", strength: [{ exerciseId: "back_squat", name: "Back squat", sets: [{ type: "work", loadKg: 100, reps: 5 }] }], conditioning: [{ format: "AMRAP", description: "x", result: {} }] }] });
  const { out } = await sendWithTool("update_session", { sessionId: "s1", patch: { feedback: [{ exerciseId: "Back squat", feedback: "tough" }, { exerciseId: "metcon", feedback: "easy" }] } }, { store });
  assert.equal(store._data.sessions[0].strength[0].feedback, "hard");
  assert.equal(store._data.sessions[0].strength[0].sets[0].loadKg, 100, "sets kept");
  assert.equal(store._data.sessions[0].conditioning[0].feedback, "easy");
  assert.ok(out.feedback.tagged.length === 2);
  const bad = await sendWithTool("update_session", { sessionId: "s1", patch: { feedback: [{ exerciseId: "deadlift", feedback: "hard" }] } }, { store });
  assert.match(String(bad.out), /^Error: No exercise matched/);
});

test("update_plan_workout: changes a remaining workout, records a change log, and undo restores it", async () => {
  const { res, out, store, coach } = await sendWithTool("update_plan_workout", {
    workoutId: "W2", reason: "bench felt hard", changes: [{ exerciseId: "bench_press", sets: 2, targetRir: 3 }],
  });
  assert.equal(res.error, null);
  assert.equal(out.ok, true);
  assert.deepEqual(out.changed, ["Bench press 3→2 sets", "Bench press RIR 2→3"]);
  const plan = store._data.plans[0];
  assert.equal(plan.workouts[1].blocks[0].items[0].sets, 2);
  assert.equal(plan.changeLog.length, 1);
  assert.equal(plan.changeLog[0].before.blocks[0].items[0].sets, 3);
  const act = res.actions.find((a) => a.type === "plan_change");
  assert.match(act.label, /^W2 Upper A: Bench press 3→2 sets/);
  assert.equal(act.ref, `${AGREED.id}#${plan.changeLog[0].id}`);
  const persisted = store._data.chat.at(-1).actions[0];
  assert.deepEqual(Object.keys(persisted).sort(), ["label", "ref", "type"]);
  assert.equal(coach.planChangeActive(act.ref, store._data.plans), true);
  // undo through the coach (what the chat card calls)
  const u = await coach.undoPlanChange(act.ref);
  assert.equal(u.undone, 1);
  assert.equal(store._data.plans[0].workouts[1].blocks[0].items[0].sets, 3);
  assert.equal(store._data.plans[0].workouts[1].blocks[0].items[0].targetRir, 2);
  assert.deepEqual(store._data.plans[0].changeLog, []);
  assert.equal(coach.planChangeActive(act.ref, store._data.plans), false);
  await assert.rejects(coach.undoPlanChange(act.ref), (e) => e.code === "not_found");
});

test("update_plan_workout: swaps (equipment-checked), moves, and refuses done workouts", async () => {
  const swap = await sendWithTool("update_plan_workout", { workoutId: "W2", reason: "shoulder", changes: [{ exerciseId: "bench_press", swapTo: "pull_up" }], moveTo: 1 });
  assert.equal(swap.out.ok, true, JSON.stringify(swap.out));
  const plan = swap.store._data.plans[0];
  assert.deepEqual(plan.workouts.map((w) => w.id), ["W2", "W1"]);
  const item = plan.workouts[0].blocks[0].items[0];
  assert.deepEqual([item.exerciseId, item.name, item.loadKg, item.alternatives[0]], ["pull_up", "Pull-up", null, "bench_press"]);
  // undo puts it back at its old position
  await swap.coach.undoPlanChange(swap.res.actions[0].ref);
  assert.deepEqual(swap.store._data.plans[0].workouts.map((w) => w.id), ["W1", "W2"]);

  const noEq = await sendWithTool("update_plan_workout", { workoutId: "W2", reason: "x", changes: [{ exerciseId: "bench_press", swapTo: "leg_press" }] });
  assert.match(String(noEq.out), /isn't possible with the equipment/);
  assert.ok(!noEq.store._writes.includes("plans.update"));

  const doneStore = makeStoreV2({ state: { rotation: { planId: AGREED.id, done: ["W1"] } } });
  const done = await sendWithTool("update_plan_workout", { workoutId: "W1", reason: "x", changes: [{ exerciseId: "back_squat", sets: 2 }] }, { store: doneStore });
  assert.match(String(done.out), /W1 is already done or skipped/);
  assert.ok(!doneStore._writes.includes("plans.update"));
  // a session logged against W2 locks it too, and undo of an earlier change to it is refused
  const s2 = makeStoreV2();
  const first = await sendWithTool("update_plan_workout", { workoutId: "W2", reason: "x", changes: [{ exerciseId: "bench_press", sets: 2 }] }, { store: s2 });
  s2._data.sessions.push({ id: "x1", date: TODAY, planId: AGREED.id, workoutId: "W2", status: "done", strength: [] });
  await assert.rejects(first.coach.undoPlanChange(first.res.actions[0].ref), (e) => e.code === "invalid_argument" && /already done/.test(e.message));
});

test("update_plan_workout: changes that add validation errors are rejected and returned to Claude", async () => {
  const core = makeCore({
    validatePlan: (plan) => {
      const sets = plan.workouts.find((w) => w.id === "W2")?.blocks[0]?.items[0]?.sets ?? 0;
      const errors = sets > 4 ? [{ code: "TOO_LONG", workoutId: "W2", path: "", message: "W2 is ~95 min (limit 75)" }] : [];
      return { ok: !errors.length, errors, warnings: [], stats: {} };
    },
  });
  const { out, store, res } = await sendWithTool("update_plan_workout", { workoutId: "W2", reason: "more volume", changes: [{ exerciseId: "bench_press", sets: 6 }] }, { core });
  assert.equal(out.ok, false);
  assert.deepEqual(out.issues, ["TOO_LONG: W2 is ~95 min (limit 75)"]);
  assert.ok(!store._writes.includes("plans.update"));
  assert.ok(!res.actions.some((a) => a.type === "plan_change"));
  // missing store.plans.update → a clear tool error
  const old = makeStore();
  const r = await sendWithTool("update_plan_workout", { workoutId: "W2", reason: "x", changes: [{ exerciseId: "bench_press", sets: 2 }] }, { store: old });
  assert.match(String(r.out), /Plan editing isn't available/);
});

test("log_wellness: saves typed or pasted metrics with a baseline-aware readiness light; guards a missing store.wellness", async () => {
  const prior = [3, 4, 5, 6].map((d) => ({ date: `2026-11-0${d}`, trainingReadiness: 80, sleepScore: 85 }));
  const store = makeStoreV2({ wellness: prior });
  const { res, out } = await sendWithTool("log_wellness", { trainingReadiness: 62, sleepScore: 78, hrvStatus: "balanced" }, { store });
  assert.equal(res.error, null);
  assert.equal(out.ok, true);
  assert.equal(out.readiness.light, "amber", "62 is 18 below this owner's usual 80");
  assert.equal(out.readiness.readinessBaseline, 80);
  assert.match(out.readiness.guidance, /warm-up/);
  const saved = store._data.wellness.find((e) => e.date === TODAY);
  assert.deepEqual([saved.trainingReadiness, saved.sleepScore, saved.hrvStatus, saved.source], [62, 78, "balanced", "manual"]);
  assert.equal(res.actions[0].type, "logged_wellness");
  assert.match(res.actions[0].label, /^Wellness · today · readiness 62 · sleep 78/);
  // pasted block; explicit fields win
  const p = await sendWithTool("log_wellness", { pasted: "Training Readiness 20\nSleep score 55\nBody Battery 30\nResting HR 58", restingHr: 57 });
  const e = p.store._data.wellness[0];
  assert.deepEqual([e.trainingReadiness, e.sleepScore, e.bodyBattery, e.restingHr], [20, 55, 30, 57]);
  assert.equal(p.out.readiness.light, "red");
  // no wellness store
  const none = await sendWithTool("log_wellness", { trainingReadiness: 50 }, { store: makeStore() });
  assert.match(String(none.out), /Wellness logging isn't available/);
  // the next chat context shows the latest entry
  const sample = scriptedSample(async () => ({ text: "hi" }));
  const { coach } = coachWith({ sample, store });
  await coach.send("hello");
  assert.match(sample.calls[0].input[0].content, /## Wellness[^\n]*\nLatest \(today\): 2026-11-07: readiness 62, sleep 78, HRV balanced/);
});

test("mock: 'readiness 62, sleep 78' is saved through log_wellness", async () => {
  const mock = createMockSample({ delayMs: 0, chunkMs: 0 });
  const store = makeStoreV2();
  const { coach } = coachWith({ sample: mock, store });
  const res = await coach.send("readiness 62, sleep 78");
  assert.equal(res.error, null, res.errorDetail);
  assert.deepEqual(mock.toolCalls.map((c) => c.name), ["log_wellness"]);
  assert.deepEqual(mock.toolCalls[0].input, { trainingReadiness: 62, sleepScore: 78 });
  assert.deepEqual([store._data.wellness[0].trainingReadiness, store._data.wellness[0].sleepScore], [62, 78]);
  assert.match(res.text, /Saved: readiness 62, sleep 78/);
});

function reviewStore() {
  const session = {
    id: "2026-11-07-aaa", date: TODAY, planId: AGREED.id, workoutId: "W1", title: "Lower A", type: "strength", status: "done",
    strength: [{ exerciseId: "back_squat", name: "Back squat", sets: [5, 5, 4].map((reps) => ({ type: "work", loadKg: 100, reps, rir: 1 })), feedback: "hard" }],
    conditioning: [], pain: [], prs: [], notes: "",
  };
  return makeStoreV2({ sessions: [session], state: { rotation: { planId: AGREED.id, done: ["W1"] } } });
}

test("reviewWorkout: one default-tier call with review tools, plan change with undo, event + reply persisted, reviewedAt set", async () => {
  const store = reviewStore();
  let refused;
  const sample = scriptedSample(async (input, options, n, { runTool }) => {
    refused = await runTool("update_plan_workout", { workoutId: "W1", reason: "x", changes: [{ exerciseId: "back_squat", sets: 2 }] });
    await runTool("update_plan_workout", { workoutId: "W2", reason: "squat felt hard", changes: [{ exerciseId: "bench_press", sets: 2 }] });
    return { text: "**Win:** done. Squat felt hard: hold 100 kg. I trimmed W2." };
  });
  const { coach } = coachWith({ sample, store });
  const tools = [];
  const res = await coach.reviewWorkout("2026-11-07-aaa", { onTool: (t) => tools.push(`${t.name}:${t.phase}`) });
  assert.equal(res.error, null, res.errorDetail);
  assert.equal(sample.calls.length, 1, "exactly one call");
  const call = sample.calls[0];
  assert.equal(call.options.modelTier, "default");
  assert.equal(call.options.cache, undefined, "cache omitted with tools (cache:false is requested)");
  assert.deepEqual(call.options.tools.map((t) => t.name), REVIEW_TOOL_ORDER);
  assertValidTurns(call.input);
  const instr = call.input[0].content;
  assert.match(instr, /Mode: post-workout review/);
  assert.match(instr, /- back_squat: hard/);
  assert.match(instr, /Remaining workouts of plan 2026-11-01[^\n]*\nW2 · Upper A/);
  assert.match(instr, /Done or skipped workouts \(locked, never change\)\n- W1 Lower A/);
  assert.match(instr, /back_squat: next 102.5 kg × 5/);
  assert.match(String(refused), /W1 is already done/);
  assert.deepEqual(tools, ["update_plan_workout:start", "update_plan_workout:error", "update_plan_workout:start", "update_plan_workout:done"]);
  // stored: event line, then the reply with the plan_change action
  const [ev, msg] = store._data.chat.slice(-2);
  assert.equal(ev.role, "event");
  assert.match(ev.text, /Logged Lower A from the Plan tab \(felt: Back squat hard\)/);
  assert.equal(msg.role, "assistant");
  assert.equal(msg.actions[0].type, "plan_change");
  assert.ok(store._data.sessions[0].reviewedAt);
  assert.equal(store._data.plans[0].workouts[1].blocks[0].items[0].sets, 2);
  await res.actions[0].undo();
  assert.equal(store._data.plans[0].workouts[1].blocks[0].items[0].sets, 3);
});

test("reviewWorkout: errors and Stop resolve with a code; nothing persisted without changes; unknown session", async () => {
  const store = reviewStore();
  const ctl = new AbortController();
  const sample = scriptedSample(async () => { throw { code: "cancelled", message: "stopped" }; });
  const { coach } = coachWith({ sample, store });
  const before = store._data.chat.length;
  const res = await coach.reviewWorkout("2026-11-07-aaa", { signal: ctl.signal });
  assert.equal(res.error, "cancelled");
  assert.equal(store._data.chat.filter((m) => m.role === "assistant").length, 0);
  assert.equal(store._data.chat.length, before + 1, "only the event line");
  assert.equal(store._data.sessions[0].reviewedAt, undefined);
  assert.equal((await coach.reviewWorkout("nope")).error, "not_found");
  const off = coachWith({ sample: null, store }).coach;
  assert.equal((await off.reviewWorkout("2026-11-07-aaa")).error, "sample_unavailable");
});

test("reviewWorkout with the mock sample calls update_plan_workout once and writes a review", async () => {
  const mock = createMockSample({ delayMs: 0, chunkMs: 0 });
  const store = reviewStore();
  const { coach } = coachWith({ sample: mock, store });
  const res = await coach.reviewWorkout("2026-11-07-aaa");
  assert.equal(res.error, null, res.errorDetail);
  assert.deepEqual(mock.toolCalls.map((c) => c.name), ["update_plan_workout"]);
  assert.equal(mock.toolCalls[0].input.workoutId, "W2");
  assert.match(res.text, /\*\*Back squat\*\* felt hard: we hold the load \(next 102.5 kg × 5\)/);
  assert.match(res.text, /I trimmed \*\*W2\*\*/);
  assert.equal(res.actions[0].type, "plan_change");
});

test("reviewWorkout end-to-end with real core, store and knowledge", { skip: REAL ? false : "other modules not implemented yet" }, async () => {
  const { core, catalog, knowledge, createStore, createMockDb } = REAL;
  assert.ok(Buffer.byteLength(knowledge.CHAT_RULES) <= 14 * 1024, `CHAT_RULES ${Buffer.byteLength(knowledge.CHAT_RULES)} B`);
  assert.ok(Buffer.byteLength(knowledge.REVIEW_RULES) <= 3 * 1024);
  const store = createStore(createMockDb(), "u1");
  if (typeof store.plans.update !== "function") return;
  await store.profile.update(profileOf({ schedule: { daysPerWeek: 3 } }));
  const sample = createMockSample({ delayMs: 0, chunkMs: 0 });
  const coach = createCoach({ runtime: { sample, uid: "u1" }, store, core, catalog, knowledge });
  const { plan } = await coach.generatePlan();
  await store.plans.approve(plan.id);
  const agreed = await store.plans.getAgreed();
  const w = agreed.workouts[0];
  const draft = core.sessionFromWorkout(w, { sessions: [], planId: agreed.id, profile: await store.profile.get() });
  draft.strength.forEach((e, i) => { e.feedback = i === 0 ? "hard" : "fine"; e.sets.forEach((s) => { if (s.loadKg == null && !s.bodyweight) s.loadKg = 40; }); });
  const added = await store.sessions.add(core.normalizeSession(draft));
  await store.state.update({ rotation: core.markWorkoutDone(await store.state.get(), agreed, w.id) });
  const res = await coach.reviewWorkout(added.id ?? added.session.id);
  assert.equal(res.error, null, res.errorDetail);
  assert.ok((await store.sessions.get(added.id ?? added.session.id)).reviewedAt);
  const after = await store.plans.getAgreed();
  assert.equal(res.actions.length, 1, res.text);
  assert.equal(res.actions[0].type, "plan_change");
  assert.equal(after.changeLog.length, 1);
  assert.notDeepEqual(after.workouts, agreed.workouts);
  await coach.undoPlanChange(res.actions[0].ref);
  assert.deepEqual((await store.plans.getAgreed()).workouts, agreed.workouts);
});
