// Plan generation robustness (live failure 2026-11-09: "Generate next week" failed on the complex tier, nothing kept).
// Compact Plan JSON (expandPlan / compactPlan), prompt size on an owner-like fixture, state.lastPlanError,
// the faster-model path, effort, and the mock's simulated cut-off / usage-limit failures.

import test from "node:test";
import assert from "node:assert/strict";

import * as core from "../src/core.js";
import * as catalog from "../src/catalog.js";
import * as knowledge from "../src/knowledge/index.js";
import { createStore } from "../src/store.js";
import { createMockDb } from "../src/store-mock.js";
import { createCoach, isCutOff } from "../src/brain.js";
import { createMockSample } from "../src/sample-mock.js";
import {
  PLAN_EXAMPLE, PLAN_EXAMPLE_FULL, PLAN_JSON_SPEC, REPAIR_PROMPT_MARKER, compactPlan, expandPlan, tailorPlanRules,
} from "../src/prompts/plan.js";
import { PLAN_RULES } from "../src/knowledge/plan.js";
import { AGREED, PROFILE, STATE, TODAY } from "./fixtures/plan-owner-like.mjs";

const UID = "u1";
const bytes = (s) => Buffer.byteLength(String(s), "utf8");
const clone = (v) => JSON.parse(JSON.stringify(v));
const nameOf = (id) => catalog.getExercise(id)?.name;
const APP_KEYS = ["id", "status", "weekStart", "createdAt", "approvedAt", "weeklyTargets", "validation"];
const modelPart = (plan) => Object.fromEntries(Object.entries(plan).filter(([k]) => !APP_KEYS.includes(k)));

async function ownerLike({ sample = createMockSample({ delayMs: 0, chunkMs: 0 }), state = {} } = {}) {
  const db = createMockDb();
  await db.doc(`data/users/${UID}/profile`).set(clone(PROFILE));
  await db.doc(`data/users/${UID}/state`).set({ ...clone(STATE), ...state });
  await db.doc(`data/users/${UID}/plans/weeks/${AGREED.id}`).set(clone(AGREED));
  const store = createStore(db, UID);
  const calls = [];
  const spy = Object.assign((input, opts) => sample(input, opts), sample, {
    json: (input, opts) => { calls.push({ input, opts }); return sample.json(input, opts); },
    limits: sample.limits,
  });
  const coach = createCoach({
    runtime: { sample: spy, uid: UID }, store, core: { ...core, todayISO: () => TODAY }, catalog, knowledge,
    now: () => new Date(`${TODAY}T18:00:00Z`),
  });
  return { coach, store, sample, calls };
}

const STRENGTH_KEYS = ["exerciseId", "name", "sets", "reps", "targetRir", "loadKg", "restSec", "progression", "incrementKg", "tempo", "notes", "alternatives", "supersetGroup"];
const COND_ITEM_KEYS = ["exerciseId", "name", "reps", "calories", "distanceM", "durationSec", "loadKg", "notes"];
const COND_KEYS = ["kind", "format", "minutes", "rounds", "timeCapMin", "workSec", "restSec", "items", "targetRpe", "scaling", "notes"];
const RUN_KEYS = ["kind", "runType", "warmupMin", "cooldownMin", "totalKm", "segments", "notes"];
const SEGMENT_KEYS = ["reps", "distanceM", "durationSec", "target", "recoverySec", "recoveryType"];

function assertFullShape(plan) {
  for (const k of ["focus", "rationale", "workouts", "notes"]) assert.ok(k in plan, k);
  for (const w of plan.workouts) {
    for (const k of ["id", "title", "type", "locationId", "estMinutes", "intent", "blocks"]) assert.ok(k in w, `${w.id}.${k}`);
    for (const b of w.blocks) {
      if (b.kind === "strength") for (const it of b.items) assert.deepEqual(Object.keys(it), STRENGTH_KEYS);
      if (b.kind === "conditioning") {
        assert.deepEqual(Object.keys(b), COND_KEYS);
        for (const it of b.items) assert.deepEqual(Object.keys(it), COND_ITEM_KEYS);
      }
      if (b.kind === "run") {
        assert.deepEqual(Object.keys(b), RUN_KEYS);
        for (const s of b.segments) {
          assert.deepEqual(Object.keys(s), SEGMENT_KEYS);
          assert.deepEqual(Object.keys(s.target), ["paceSecPerKm", "hrZone", "rpe"]);
        }
      }
      if (["warmup", "cooldown", "mobility"].includes(b.kind)) for (const it of b.items) assert.deepEqual(Object.keys(it), ["name", "detail"]);
    }
  }
}

// ---------- compact format ----------

test("compact output is normalized back to the full CONTRACT shape and validates", () => {
  const compact = JSON.parse(PLAN_EXAMPLE);
  assert.ok(!PLAN_EXAMPLE.includes("null") && !PLAN_EXAMPLE.includes("[]") && !PLAN_EXAMPLE.includes('""'), "the example omits nulls and empties");
  assert.ok(!PLAN_EXAMPLE.includes("\n"), "one line");
  const full = expandPlan(compact, { nameOf: (id) => ({ back_squat: "Back Squat", romanian_deadlift: "Romanian Deadlift" })[id], defaultLocationId: "gym" });
  assert.deepEqual(full, clone(PLAN_EXAMPLE_FULL));
  assertFullShape(full);

  // a hand-written compact reply with every omission the spec allows
  const reply = { focus: "Wk 2", rationale: "r", workouts: [
    { title: "Lower", estMinutes: 50, intent: "i", blocks: [{ kind: "strength", items: [{ exerciseId: "back_squat", sets: 3, reps: 5, restSec: 180, alternatives: ["front_squat"] }] }] },
    { title: "Run", estMinutes: 30, intent: "i", blocks: [{ kind: "run", runType: "easy", totalKm: 4, segments: [{ distanceM: 4000 }] }] },
    { title: "Metcon", locationId: "gym", estMinutes: 30, intent: "i", blocks: [{ kind: "conditioning", format: "AMRAP", minutes: 12, items: [{ exerciseId: "burpee", reps: 10 }], scaling: "s", notes: "n" }] },
  ] };
  const p = expandPlan(reply, { nameOf, defaultLocationId: "home" });
  assertFullShape(p);
  assert.deepEqual(p.workouts.map((w) => [w.id, w.type, w.locationId]), [["W1", "strength", "home"], ["W2", "run", "home"], ["W3", "conditioning", "gym"]]);
  const sq = p.workouts[0].blocks[0].items[0];
  assert.equal(sq.reps, "5", "numeric reps become a string");
  assert.equal(sq.name, nameOf("back_squat"));
  assert.equal(sq.progression, "double");
  assert.equal(sq.loadKg, null);
  assert.deepEqual(p.workouts[1].blocks[0].segments[0], { reps: 1, distanceM: 4000, durationSec: null, target: { paceSecPerKm: null, hrZone: null, rpe: null }, recoverySec: null, recoveryType: null });
  assert.equal(p.workouts[1].blocks[0].warmupMin, 0);
  assert.deepEqual(p.notes, []);
  const v = core.validatePlan({ ...p, weekStart: "2026-11-08" }, { profile: PROFILE, sessions: [], today: TODAY });
  assert.deepEqual(v.errors.filter((e) => e.code === "SCHEMA"), [], JSON.stringify(v.errors));

  // a full (old-format) reply passes through unchanged
  const legacy = modelPart(AGREED);
  assert.deepEqual(expandPlan(legacy, { nameOf, defaultLocationId: "home" }), clone(legacy));
});

test("compactPlan → expandPlan round-trips the owner-like plan and saves bytes", () => {
  const full = expandPlan(modelPart(AGREED), { nameOf, defaultLocationId: "home" });
  const compact = compactPlan(full, { nameOf, defaultLocationId: "home" });
  const back = expandPlan(clone(compact), { nameOf, defaultLocationId: "home" });
  // names equal to the catalog name (case aside) come back as the catalog's spelling
  const norm = (pl) => JSON.parse(JSON.stringify(pl, (k, v) => (k === "name" && typeof v === "string" ? v.toLowerCase() : v)));
  assert.deepEqual(norm(back), norm(full));
  const pretty = bytes(JSON.stringify(full, null, 2)), oneLine = bytes(JSON.stringify(full)), small = bytes(JSON.stringify(compact));
  assert.ok(small <= pretty * 0.6, `compact ${small} B vs pretty full ${pretty} B`);
  assert.ok(small < oneLine, `compact ${small} B vs one-line full ${oneLine} B`);
});

test("output size: the mock's 5-workout plan is ≥ 40 % smaller compact than in the old full format", async () => {
  const { coach, calls } = await ownerLike();
  const { plan } = await coach.generatePlan();
  assert.equal(plan.workouts.length, 5);
  assertFullShape(plan);
  const full = modelPart(plan);
  const compact = compactPlan(full, { nameOf, defaultLocationId: "home" });
  const old = bytes(JSON.stringify(full, null, 2)); // what the old spec (shown pretty-printed, nulls everywhere) invited
  const now = bytes(JSON.stringify(compact));
  assert.ok(now <= old * 0.6, `compact ${now} B vs old ${old} B`);
  assert.ok(now <= bytes(JSON.stringify(full)) * 0.8, "also ≥ 20 % below the full shape on one line");
  assert.equal(calls.length, 1);
});

// ---------- prompt ----------

test("plan prompt on the owner-like fixture stays ≤ 50 KB and asks for compact JSON", async () => {
  const { coach, calls } = await ownerLike();
  await coach.generatePlan();
  const prompt = calls[0].input;
  assert.ok(bytes(prompt) <= 50 * 1024, `${bytes(prompt)} bytes`);
  assert.match(prompt, /compact on ONE line/);
  assert.match(prompt, /OMIT every field that would be null/);
  assert.ok(prompt.includes(PLAN_EXAMPLE));
  // rules kept: every section heading that applies is still there
  for (const h of ["## 0. Inputs", "## 1. Hard constraints", "## 2. Safety gating", "### 3.4 Loads and progression", "### 4.4 Long run", "### 4.6 Beginners",
    "### 5.6 Newcomer ramp-in", "### 6.4 Template rotations", "## 8. Writing it", "## 9. Self-check"]) assert.ok(prompt.includes(h), h);
  assert.match(prompt, /- \*\*5 days:\*\*/);
  assert.doesNotMatch(prompt, /- \*\*4 days:\*\*/, "other day counts' templates are not sent");
  assert.doesNotMatch(prompt, /### 4\.8 Race builds/, "no event: no race-build section");
  assert.doesNotMatch(prompt, /16:00=960/, "no race or event goal: no pace table");
  assert.doesNotMatch(prompt, /"screenedAt".*"heartCondition"/, "all-no screening answers are collapsed");
});

test("tailorPlanRules drops only what cannot apply", () => {
  const base = { profile: PROFILE, daysPerWeek: 5 };
  const r = tailorPlanRules(PLAN_RULES, base);
  // every kept line is verbatim from PLAN_RULES
  const original = new Set(PLAN_RULES.split("\n"));
  for (const line of r.split("\n")) if (!line.startsWith("(Pace table omitted")) assert.ok(original.has(line), line);
  assert.ok(bytes(r) < bytes(PLAN_RULES) - 4000);
  const withEvent = tailorPlanRules(PLAN_RULES, { ...base, profile: { ...PROFILE, goals: { ...PROFILE.goals, event: { type: "race", distanceKm: 10, date: "2027-03-01", goalTimeSec: 3000 } } } });
  assert.match(withEvent, /### 4\.8 Race builds/);
  assert.match(withEvent, /16:00=960/, "event goal time: the pace table is needed");
  const withRace = tailorPlanRules(PLAN_RULES, { ...base, profile: { ...PROFILE, experience: { ...PROFILE.experience, running: { recentRace: { distanceKm: 5, timeSec: 1500 } } } } });
  assert.match(withRace, /16:00=960/, "a race without app-computed zones keeps the table");
  assert.doesNotMatch(tailorPlanRules(PLAN_RULES, { ...base, profile: { ...PROFILE, experience: { running: { recentRace: { distanceKm: 5, timeSec: 1500 } } } }, paceZonesGiven: true }), /16:00=960/);
  const noRun = tailorPlanRules(PLAN_RULES, { ...base, profile: { ...PROFILE, goals: { modalities: { strength: true, running: false, conditioning: true } } } });
  assert.doesNotMatch(noRun, /## 4\. Running|### 4\.1/);
  assert.match(noRun, /## 5\. Conditioning/);
  const older = tailorPlanRules(PLAN_RULES, { ...base, profile: { ...PROFILE, age: 70, sex: "female", screening: {} } });
  assert.match(older, /Age ≥65/);
  assert.match(older, /Pregnancy/);
  assert.equal(tailorPlanRules("custom rules", base), "custom rules");
});

// ---------- failures: diagnosability, no retries, cut-off copy ----------

test("invalid_json cut-off: rejected once with detail, persisted as state.lastPlanError, nothing saved", async () => {
  const sample = createMockSample({ delayMs: 0, chunkMs: 0 });
  sample.failNext({ code: "invalid_json", verb: "json" });
  const { coach, store, calls } = await ownerLike({ sample });
  let err;
  await coach.generatePlan().catch((e) => { err = e; });
  assert.equal(err.code, "invalid_json");
  assert.equal(err.cutOff, true);
  assert.equal(calls.length, 1, "never retried");
  assert.ok(err.text.length > 100, "the partial reply is kept");
  const d = err.detail;
  assert.deepEqual(Object.keys(d).sort(), ["at", "code", "cutOff", "elapsedMs", "kind", "message", "phase", "streamedChars", "tier"]);
  assert.equal(d.tier, "complex");
  assert.equal(d.phase, "generating");
  assert.equal(d.streamedChars, err.text.length);
  assert.ok(d.message.length <= 300 && /cut short/.test(d.message));
  assert.equal(typeof d.elapsedMs, "number");
  const st = await store.state.get();
  assert.deepEqual(st.lastPlanError, d, "persisted for diagnosis");
  assert.equal(await store.plans.getDraft(), null);
});

test("rate_limited: persisted, not cut-off, no retry", async () => {
  const sample = createMockSample({ delayMs: 0, chunkMs: 0 });
  sample.failNext({ code: "rate_limited", message: "x".repeat(500) });
  const { coach, store, calls } = await ownerLike({ sample });
  const err = await coach.generatePlan().catch((e) => e);
  assert.equal(err.code, "rate_limited");
  assert.equal(err.cutOff, false);
  assert.equal(calls.length, 1);
  const st = await store.state.get();
  assert.equal(st.lastPlanError.code, "rate_limited");
  assert.equal(st.lastPlanError.streamedChars, 0);
  assert.equal(st.lastPlanError.message.length, 300, "message capped at 300 chars");
});

test("lastPlanError is cleared on success; Stop does not overwrite it", async () => {
  const sample = createMockSample({ delayMs: 0, chunkMs: 0 });
  const stale = { code: "invalid_json", message: "cut short", elapsedMs: 300000, streamedChars: 20000, tier: "complex", at: "2026-11-09T10:00:00.000Z" };
  const { coach, store } = await ownerLike({ sample, state: { lastPlanError: stale } });
  const ctl = new AbortController();
  ctl.abort();
  await assert.rejects(coach.generatePlan({ signal: ctl.signal }), (e) => e.code === "cancelled");
  assert.deepEqual((await store.state.get()).lastPlanError, stale, "Stop is not a failure");
  await coach.generatePlan();
  assert.equal((await store.state.get()).lastPlanError, null);
});

test("complex tier gets effort medium; 'Try with the faster model' uses the default tier without effort", async () => {
  const { coach, calls } = await ownerLike();
  await coach.generatePlan();
  assert.equal(calls[0].opts.modelTier, "complex");
  assert.equal(calls[0].opts.effort, "medium");
  assert.equal(calls[0].opts.cache, false);
  await coach.generatePlan({ modelTier: "default" });
  assert.equal(calls[1].opts.modelTier, "default");
  assert.equal(calls[1].opts.effort, undefined);
  await coach.generatePlan({ modelTier: "quick" }); // not a plan tier: falls back to complex
  assert.equal(calls[2].opts.modelTier, "complex");
});

test("faster-model failure records tier default; reviseDraft gets the same handling", async () => {
  const sample = createMockSample({ delayMs: 0, chunkMs: 0 });
  const { coach, store, calls } = await ownerLike({ sample });
  await coach.generatePlan(); // a draft to revise
  sample.failNext({ code: "upstream_error", verb: "json", partial: 0.3 });
  const err = await coach.reviseDraft("swap bench for rows", { modelTier: "default" }).catch((e) => e);
  assert.equal(err.code, "upstream_error");
  assert.equal(err.cutOff, true, "dropped mid-answer counts as cut off");
  assert.equal(err.detail.kind, "revise");
  assert.equal(err.detail.tier, "default");
  assert.equal((await store.state.get()).lastPlanError.kind, "revise");
  assert.equal(calls.length, 2);
  // the draft JSON in the revise prompt is compact too
  const { plan } = await coach.reviseDraft("more rows");
  assert.ok(plan);
  const draftJson = calls[2].input.split("# Current draft to revise (JSON)\n")[1].split("\n# ")[0];
  assert.ok(!draftJson.includes("null") && !draftJson.includes('"validation"'), "compact draft, no app fields");
});

test("repair call: compact plan-to-fix JSON, compact format, only the corrected plan; a cut-off repair keeps the first plan", async () => {
  const sample = createMockSample({ delayMs: 0, chunkMs: 0 });
  const { store } = await ownerLike({ sample });
  const calls = [];
  const spy = Object.assign((i, o) => sample(i, o), sample, {
    json: (i, o) => {
      calls.push({ input: i, opts: o });
      if (calls.length === 2) sample.failNext({ code: "invalid_json", verb: "json" }); // the repair is cut off
      return sample.json(i, o);
    },
    limits: sample.limits,
  });
  let n = 0;
  const coach = createCoach({
    runtime: { sample: spy, uid: UID }, store, catalog, knowledge, now: () => new Date(`${TODAY}T18:00:00Z`),
    core: { ...core, todayISO: () => TODAY, validatePlan: (p, o) => {
      const v = core.validatePlan(p, o);
      return n++ === 0 ? { ...v, ok: false, errors: [{ code: "UNKNOWN_EXERCISE", workoutId: "W1", path: "blocks[1].items[0]", message: "Unknown exercise" }] } : v;
    } },
  });
  const { plan, validation } = await coach.generatePlan();
  assert.equal(calls.length, 2, "one repair call, no retry after it failed");
  const repair = calls[1].input;
  assert.ok(repair.startsWith(REPAIR_PROMPT_MARKER));
  assert.match(repair, /Reply with ONLY the complete corrected plan: one compact JSON object on one line/);
  assert.ok(repair.includes(PLAN_JSON_SPEC));
  const fix = repair.split("# Plan to fix (compact JSON)\n")[1];
  assert.ok(fix && !fix.includes("null") && !fix.includes('"validation"'), "the plan to fix is compact");
  assert.equal(calls[1].opts.effort, "medium");
  assert.equal(plan.workouts.length, 5, "the first plan is kept");
  assert.equal(validation.errors[0].code, "UNKNOWN_EXERCISE");
  assert.equal((await store.state.get()).lastPlanError ?? null, null, "a saved draft is a success");
});

test("isCutOff: invalid_json (cut short or unparseable partial) and mid-answer upstream errors", () => {
  assert.equal(isCutOff("invalid_json", "The reply was cut short by the length limit", "{\"a\":", 5), true);
  assert.equal(isCutOff("invalid_json", "no JSON value", "{\"focus\":\"x\",\"workouts\":[{", 30), true);
  assert.equal(isCutOff("invalid_json", "no JSON value", "Sorry, I can't.", 15), false);
  assert.equal(isCutOff("upstream_error", "connection", "", 0), false);
  assert.equal(isCutOff("upstream_error", "connection", "{", 1200), true);
  assert.equal(isCutOff("rate_limited", "usage limit", "{", 1200), false);
});

// ---------- the mock simulates the platform failures ----------

test("mock: failNext invalid_json streams a partial reply then rejects like the length cut-off; rate_limited rejects at once", async () => {
  const sample = createMockSample({ delayMs: 0, chunkMs: 0 });
  sample.failNext({ code: "invalid_json", verb: "json", partial: 0.5 });
  let streamed = "";
  const prompt = "[Personal Trainer · plan request]\nRequired: exactly 3 workouts";
  const e1 = await sample.json(prompt, { onText: ({ text }) => { streamed = text; } }).catch((e) => e);
  assert.equal(e1.code, "invalid_json");
  assert.match(e1.message, /cut short/);
  assert.equal(e1.text, streamed);
  assert.ok(e1.text.startsWith("{") && e1.text.length > 50);
  assert.throws(() => JSON.parse(e1.text));
  const ok = await sample.json(prompt);
  assert.equal(ok.workouts.length, 3, "one failure only");
  assert.ok(!JSON.stringify(ok).includes("null"), "the mock replies in the compact format");
  sample.failNext("rate_limited");
  const e2 = await sample("hi").catch((e) => e);
  assert.equal(e2.code, "rate_limited");
  assert.equal(e2.text, undefined);
  const e3 = await sample.json(`${prompt}\n# Owner's instruction\n!fail invalid_json`).catch((e) => e);
  assert.equal(e3.code, "invalid_json", "the !fail instruction works for plan prompts too");
  assert.ok(e3.text.length > 0);
});
