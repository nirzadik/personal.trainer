// Owner: Agent S. Tests for src/swap.js (CONTRACT-v2).
import { describe, test } from "node:test";
import assert from "node:assert/strict";

import * as core from "../src/core.js";
import * as catalog from "../src/catalog.js";
import { swapOptions, applySwap, swappableItems } from "../src/swap.js";

const deps = { core, catalog };

/** A home location with dumbbells, a bench, an air bike and a pull-up bar. */
function profileWith({ items = ["dumbbells", "adjustable_bench", "assault_bike", "pullup_bar"], injuries = [], dislikes = [] } = {}) {
  return {
    equipment: {
      defaultLocationId: "home",
      locations: [
        { id: "home", name: "Home", items },
        { id: "gym", name: "Gym", items: ["barbell", "plates", "squat_rack", "bench", "leg_press", "rower", "dumbbells"] },
      ],
    },
    injuries,
    preferences: { likes: [], dislikes },
  };
}

const squat = () => ({ exerciseId: "back_squat", name: "Back Squat", sets: 3, reps: "5", targetRir: 2, loadKg: 100, restSec: 180, progression: "linear", incrementKg: 2.5, tempo: null, notes: "Brace", alternatives: ["front_squat", "goblet_squat"], supersetGroup: null });

function plan() {
  return {
    id: "2026-11-08", status: "agreed", weekStart: "2026-11-08",
    workouts: [
      {
        id: "W1", title: "Lower + engine", type: "hybrid", locationId: "home", estMinutes: 50,
        blocks: [
          { kind: "warmup", minutes: 5, items: [{ name: "Bike", detail: "easy" }] },
          { kind: "strength", items: [squat(), { exerciseId: "dumbbell_romanian_deadlift", name: "Dumbbell Romanian Deadlift", sets: 3, reps: "8-10", targetRir: 2, loadKg: 24, alternatives: [] }] },
          { kind: "conditioning", format: "EMOM", minutes: 10, items: [
            { exerciseId: "assault_bike_cal", name: "Air Bike (calories)", reps: null, calories: 12, distanceM: null, durationSec: null, loadKg: null, notes: null },
            { exerciseId: "burpee", name: "Burpee", reps: 10, calories: null, distanceM: null, durationSec: null, loadKg: null, notes: null },
          ] },
          { kind: "strength", items: [{ exerciseId: "pull_up", name: "Pull-Up", sets: 3, reps: "AMRAP", targetRir: 1, loadKg: null, alternatives: [] }] },
        ],
      },
      { id: "W2", title: "Gym", type: "strength", locationId: "gym", blocks: [{ kind: "strength", items: [squat()] }] },
    ],
  };
}

const ids = (opts) => opts.map((o) => o.exerciseId);
const ex = (id) => catalog.getExercise(id);

describe("swappableItems", () => {
  test("flat index over strength and conditioning items in block order", () => {
    const list = swappableItems(plan().workouts[0]);
    assert.deepEqual(list.map((x) => [x.itemIndex, x.kind, x.item.exerciseId]), [
      [0, "strength", "back_squat"],
      [1, "strength", "dumbbell_romanian_deadlift"],
      [2, "conditioning", "assault_bike_cal"],
      [3, "conditioning", "burpee"],
      [4, "strength", "pull_up"],
    ]);
    assert.deepEqual(swappableItems(null), []);
  });
});

describe("swapOptions", () => {
  test("every option is doable with the workout location's equipment", () => {
    const p = plan();
    const item = p.workouts[0].blocks[1].items[0];
    const profile = profileWith();
    const eq = core.availableEquipment(profile, "home");
    const opts = swapOptions(item, { profile, plan: p, ...deps });
    assert.ok(opts.length > 3 && opts.length <= 8);
    for (const o of opts) {
      assert.equal(core.exerciseAllowed(o.exerciseId, eq).ok, true, o.exerciseId);
      assert.equal(o.equipmentOk, true);
      assert.ok(ex(o.exerciseId).modality.includes("strength"), `${o.exerciseId} is a strength exercise`);
    }
    assert.ok(!ids(opts).includes("front_squat"), "barbell alternative filtered out at home");
    assert.ok(!ids(opts).includes("back_squat"), "never the item itself");
    // The same item in the gym workout gets the gym's kit.
    const gymItem = p.workouts[1].blocks[0].items[0];
    assert.equal(swapOptions(gymItem, { profile, plan: p, ...deps })[0].exerciseId, "front_squat");
  });

  test("the item's own alternatives rank first, with a reason", () => {
    const p = plan();
    const opts = swapOptions(p.workouts[0].blocks[1].items[0], { profile: profileWith(), plan: p, ...deps });
    assert.equal(opts[0].exerciseId, "goblet_squat");
    assert.match(opts[0].reason, /^Coach's alternative · your equipment$/);
    assert.equal(opts[0].name, "Goblet Squat");
    assert.ok(opts.slice(1).every((o) => !/Coach's alternative/.test(o.reason)));
    assert.ok(opts.some((o) => /^Same pattern · (your|no) equipment/.test(o.reason)));
  });

  test("dislikes are excluded (by id or free text)", () => {
    const p = plan();
    const item = p.workouts[0].blocks[1].items[0];
    const opts = swapOptions(item, { profile: profileWith({ dislikes: ["goblet_squat", "wall sit"] }), plan: p, ...deps });
    assert.ok(!ids(opts).includes("goblet_squat"));
    assert.ok(!ids(opts).includes("wall_sit"));
    assert.ok(opts.length > 0);
  });

  test("options that load a current injury are ranked last and flagged", () => {
    const p = plan();
    const item = p.workouts[0].blocks[1].items[0];
    const opts = swapOptions(item, { profile: profileWith({ injuries: [{ area: "Left knee", status: "current", painScore: 3 }] }), plan: p, ...deps, limit: 20 });
    const firstCaution = opts.findIndex((o) => o.caution);
    assert.ok(firstCaution > 0, "safe options exist and come first");
    assert.ok(opts.slice(firstCaution).every((o) => o.caution === "left knee"), "no safe option after a flagged one");
    assert.ok(opts.slice(0, firstCaution).every((o) => !ex(o.exerciseId).jointStress.includes("knee_flexion_deep")));
    const goblet = opts.find((o) => o.exerciseId === "goblet_squat");
    assert.ok(goblet && goblet.caution, "the coach's alternative is still offered, just later");
    assert.match(goblet.reason, /careful: left knee/);
    // A past injury changes nothing.
    const past = swapOptions(item, { profile: profileWith({ injuries: [{ area: "knee", status: "past" }] }), plan: p, ...deps });
    assert.equal(past[0].exerciseId, "goblet_squat");
  });

  test("conditioning items swap within their modality", () => {
    const p = plan();
    const bike = p.workouts[0].blocks[2].items[0];
    const bikeOpts = swapOptions(bike, { profile: profileWith(), plan: p, ...deps });
    assert.ok(bikeOpts.length > 0);
    assert.equal(bikeOpts[0].exerciseId, "bike_cal", "a same-unit machine first");
    for (const o of bikeOpts) assert.ok(ex(o.exerciseId).modality.some((m) => m === "conditioning" || m === "cardio"), o.exerciseId);
    const burpee = p.workouts[0].blocks[2].items[1];
    const burpeeOpts = swapOptions(burpee, { profile: profileWith(), plan: p, ...deps });
    assert.ok(burpeeOpts.length > 0);
    for (const o of burpeeOpts) assert.ok(ex(o.exerciseId).modality.includes("conditioning"), o.exerciseId);
    assert.ok(!ids(burpeeOpts).includes("assault_bike_cal"), "exercises already in the workout are not offered");
    assert.ok(!ids(burpeeOpts).includes("burpee_box_jump_over"), "needs a plyo box");
    // A strength-and-conditioning movement in a metcon only gets conditioning movements back.
    const swing = swapOptions({ exerciseId: "kettlebell_swing", name: "Kettlebell swing", reps: 15 }, { profile: profileWith({ items: ["kettlebell", "dumbbells", "cable_machine"] }), kind: "conditioning", ...deps, limit: 20 });
    assert.ok(swing.length > 0);
    for (const o of swing) assert.ok(ex(o.exerciseId).modality.includes("conditioning"), o.exerciseId);
  });

  test("works without a plan (hints) and for items with only a name", () => {
    const profile = profileWith();
    const byKind = swapOptions({ exerciseId: "row_cal", name: "Row", calories: 15 }, { profile, kind: "conditioning", ...deps });
    assert.ok(ids(byKind).includes("assault_bike_cal"));
    assert.ok(!ids(byKind).includes("row_cal"));
    const named = swapOptions({ exerciseId: null, name: "goblet squats", sets: 3, reps: "10" }, { profile, ...deps });
    assert.ok(named.length > 0 && !ids(named).includes("goblet_squat"));
    assert.deepEqual(swapOptions(null, { profile, ...deps }), []);
    assert.equal(swapOptions(squat(), { profile, ...deps, limit: 3 }).length, 3);
  });
});

describe("applySwap", () => {
  test("replaces id and name, keeps the prescription, clears the load, old id first in alternatives", () => {
    const p = plan();
    const before = JSON.stringify(p);
    const next = applySwap(p, "W1", 0, "goblet_squat", { catalog });
    assert.equal(JSON.stringify(p), before, "input untouched");
    const it = next.workouts[0].blocks[1].items[0];
    assert.equal(it.exerciseId, "goblet_squat");
    assert.equal(it.name, "Goblet Squat");
    assert.deepEqual([it.sets, it.reps, it.targetRir, it.restSec, it.progression, it.notes], [3, "5", 2, 180, "linear", "Brace"]);
    assert.equal(it.loadKg, null);
    assert.deepEqual(it.alternatives, ["back_squat", "front_squat"], "old id first; the new id is not its own alternative");
    assert.equal(it.swappedFrom, "back_squat");
    assert.equal(next.workouts[1].blocks[0].items[0].exerciseId, "back_squat", "other workouts untouched");
  });

  test("itemIndex is flat across strength and conditioning blocks", () => {
    const p = plan();
    const cond = applySwap(p, "W1", 3, "jump_squat", { catalog });
    const burpee = cond.workouts[0].blocks[2].items[1];
    assert.equal(burpee.exerciseId, "jump_squat");
    assert.equal(burpee.reps, 10, "conditioning amounts kept");
    assert.deepEqual(burpee.alternatives, ["burpee"]);
    const last = applySwap(p, "W1", 4, "lat_pulldown", { catalog });
    assert.equal(last.workouts[0].blocks[3].items[0].exerciseId, "lat_pulldown");
    assert.equal(last.workouts[0].blocks[1].items[0].exerciseId, "back_squat");
  });

  test("swapping back to the original clears the marker; a no-op swap returns an equal plan", () => {
    const p = plan();
    const once = applySwap(p, "W1", 0, "goblet_squat", { catalog });
    const twice = applySwap(once, "W1", 0, "dumbbell_front_squat", { catalog });
    assert.equal(twice.workouts[0].blocks[1].items[0].swappedFrom, "back_squat", "keeps the originally planned exercise");
    const back = applySwap(twice, "W1", 0, "back_squat", { catalog });
    const it = back.workouts[0].blocks[1].items[0];
    assert.equal(it.exerciseId, "back_squat");
    assert.equal(Object.hasOwn(it, "swappedFrom"), false);
    assert.deepEqual(it.alternatives, ["dumbbell_front_squat", "goblet_squat", "front_squat"]);
    assert.deepEqual(applySwap(p, "W1", 0, "back_squat", { catalog }), p);
  });

  test("bad workout, index or exercise → invalid_argument", () => {
    const p = plan();
    assert.throws(() => applySwap(p, "W9", 0, "goblet_squat", { catalog }), { code: "invalid_argument" });
    assert.throws(() => applySwap(p, "W1", 5, "goblet_squat", { catalog }), { code: "invalid_argument" });
    assert.throws(() => applySwap(p, "W1", -1, "goblet_squat", { catalog }), { code: "invalid_argument" });
    assert.throws(() => applySwap(p, "W1", 0, "no_such_lift", { catalog }), { code: "invalid_argument" });
    assert.throws(() => applySwap(null, "W1", 0, "goblet_squat", { catalog }), { code: "invalid_argument" });
  });

  test("a swapped plan still passes the plan check's exercise/equipment rules", () => {
    const p = plan();
    const next = applySwap(p, "W2", 0, "leg_press", { catalog });
    const v = core.validatePlan(next, { profile: profileWith() });
    assert.ok(!v.errors.some((e) => e.code === "UNKNOWN_EXERCISE" || (e.code === "EQUIPMENT_MISSING" && e.workoutId === "W2")), JSON.stringify(v.errors));
  });
});
