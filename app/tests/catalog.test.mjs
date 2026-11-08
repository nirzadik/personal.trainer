import test from "node:test";
import assert from "node:assert/strict";
import {
  EQUIPMENT, MUSCLES, EXERCISES, PATTERNS, JOINT_STRESS, EQUIPMENT_IMPLIES,
  getExercise, findExercise, searchExercises, normalizeName, expandEquipment, equipmentCheck,
} from "../src/catalog.js";

const CONTRACT_EQUIPMENT = "barbell plates squat_rack bench adjustable_bench dumbbells kettlebell cable_machine lat_pulldown seated_row leg_press leg_curl leg_extension hack_squat smith_machine chest_press_machine shoulder_press_machine pec_deck calf_machine hip_thrust_machine trap_bar landmine ez_bar pullup_bar dip_bars rings trx bands plyo_box jump_rope medicine_ball wall_ball slam_ball sandbag sled ghd ab_wheel rower assault_bike bike ski_erg treadmill outdoor_route track".split(" ");
const UNITS = ["load_reps", "reps", "time", "distance", "calories"];
const MODALITIES = [["strength"], ["conditioning"], ["strength", "conditioning"], ["cardio"]].map((m) => m.join("+"));

test("EQUIPMENT has every contract id with a valid group", () => {
  for (const id of CONTRACT_EQUIPMENT) assert.ok(EQUIPMENT[id], `missing equipment ${id}`);
  for (const [id, e] of Object.entries(EQUIPMENT)) {
    assert.ok(e.name, id);
    assert.ok(["free_weights", "machines", "bodyweight", "cardio", "conditioning", "other"].includes(e.group), id);
  }
  for (const [k, v] of Object.entries(EQUIPMENT_IMPLIES)) for (const x of [k, ...v]) assert.ok(EQUIPMENT[x], x);
});

test("MUSCLES matches the contract list", () => {
  assert.deepEqual([...MUSCLES], ["chest", "front_delts", "side_delts", "rear_delts", "upper_back", "lats", "lower_back", "biceps", "triceps", "forearms", "quads", "hamstrings", "glutes", "adductors", "calves", "abs"]);
});

test("EXERCISES: ≥180 entries, unique ids, valid fields and references", () => {
  assert.ok(EXERCISES.length >= 180, `only ${EXERCISES.length}`);
  const ids = new Set(EXERCISES.map((e) => e.id));
  assert.equal(ids.size, EXERCISES.length, "duplicate ids");
  for (const e of EXERCISES) {
    assert.match(e.id, /^[a-z0-9_]+$/, e.id);
    assert.ok(e.name && Array.isArray(e.aliases), e.id);
    assert.ok(MODALITIES.includes(e.modality.join("+")), `${e.id} modality ${e.modality}`);
    assert.ok(PATTERNS.includes(e.pattern), `${e.id} pattern ${e.pattern}`);
    assert.ok(e.primary.length > 0, `${e.id} has no primary muscle`);
    for (const m of [...e.primary, ...e.secondary]) assert.ok(MUSCLES.includes(m), `${e.id} muscle ${m}`);
    for (const q of [...e.equipment.all, ...e.equipment.any]) assert.ok(EQUIPMENT[q], `${e.id} equipment ${q}`);
    for (const j of e.jointStress) assert.ok(JOINT_STRESS.includes(j), `${e.id} jointStress ${j}`);
    assert.ok(UNITS.includes(e.unit), `${e.id} unit`);
    assert.ok(Number.isInteger(e.skill) && e.skill >= 1 && e.skill <= 5, `${e.id} skill`);
    for (const a of e.alternatives) { assert.ok(ids.has(a), `${e.id} alternative ${a}`); assert.notEqual(a, e.id); }
  }
  assert.ok(Object.isFrozen(EXERCISES) && Object.isFrozen(EXERCISES[0].primary), "catalog is frozen");
});

test("ids used by other modules (C's dev seed) exist", () => {
  for (const id of ["back_squat", "bench_press", "deadlift", "romanian_deadlift", "overhead_press", "barbell_row", "pull_up", "lat_pulldown",
    "dumbbell_bench_press", "leg_press", "kettlebell_swing", "burpee", "box_jump", "wall_ball", "rower"]) {
    assert.ok(getExercise(id), `missing ${id}`);
  }
});

test("catalog covers gym, bodyweight, kettlebell, CrossFit/HIIT and cardio", () => {
  const need = ["thruster", "wall_ball", "burpee", "box_jump", "double_under", "single_under", "kettlebell_swing", "devil_press",
    "toes_to_bar", "kipping_pull_up", "chest_to_bar_pull_up", "bar_muscle_up", "ring_muscle_up", "power_clean", "hang_power_clean",
    "squat_clean", "power_snatch", "hang_power_snatch", "clean_and_jerk", "sled_push", "sandbag_carry", "sandbag_over_shoulder",
    "row_cal", "assault_bike_cal", "ski_cal", "bike_cal", "shuttle_run", "run", "rower", "treadmill_run", "turkish_get_up",
    "kettlebell_snatch", "handstand_push_up", "rope_climb", "air_squat", "push_up", "plank"];
  for (const id of need) assert.ok(getExercise(id), id);
  const byMod = (m) => EXERCISES.filter((e) => e.modality.includes(m)).length;
  assert.ok(byMod("strength") > 120 && byMod("conditioning") > 60 && byMod("cardio") >= 10);
  assert.deepEqual(getExercise("air_squat").equipment, { all: [], any: [] }, "bodyweight → empty equipment");
});

test("CrossFit-style scaling variants: equipment, pattern and lookup", () => {
  const exp = {
    step_back_burpee: ["plyo", { all: [], any: [] }], burpee_broad_jump: ["plyo", { all: [], any: [] }],
    lateral_burpee_over_dumbbell: ["plyo", { all: ["dumbbells"], any: [] }], dumbbell_man_maker: ["olympic", { all: ["dumbbells"], any: [] }],
    box_pike_push_up: ["v_push", { all: [], any: ["plyo_box", "bench"] }],
  };
  for (const [id, [pattern, equipment]] of Object.entries(exp)) {
    const e = getExercise(id);
    assert.ok(e && e.modality.includes("conditioning"), id);
    assert.equal(e.pattern, pattern, id);
    assert.deepEqual(e.equipment, equipment, id);
  }
  assert.ok(!getExercise("step_back_burpee").jointStress.includes("impact"), "the low-impact burpee scale");
  assert.ok(getExercise("box_pike_push_up").jointStress.includes("overhead"));
  assert.ok(equipmentCheck(getExercise("box_pike_push_up"), expandEquipment(["adjustable_bench"])).ok, "a bench works as the box");
  const cases = { "step back burpees": "step_back_burpee", "burpee broad jumps": "burpee_broad_jump", "burpee over dumbbell": "lateral_burpee_over_dumbbell",
    "man makers": "dumbbell_man_maker", "feet elevated pike push up": "box_pike_push_up", burpees: "burpee", "pike push ups": "pike_push_up" };
  for (const [q, id] of Object.entries(cases)) assert.equal(findExercise(q)?.id, id, `"${q}"`);
});

test("no two exercises share a normalized name/alias", () => {
  const seen = new Map();
  for (const e of EXERCISES) for (const k of [e.name, ...e.aliases]) {
    const key = normalizeName(k).join(" ");
    assert.ok(!seen.has(key) || seen.get(key) === e.id, `"${k}" → ${seen.get(key)} and ${e.id}`);
    seen.set(key, e.id);
  }
});

test("getExercise", () => {
  assert.equal(getExercise("bench_press").name, "Bench Press");
  assert.equal(getExercise("nope"), null);
  assert.equal(getExercise(undefined), null);
});

test("normalizeName handles case, plurals, abbreviations, compounds, quantities", () => {
  assert.deepEqual(normalizeName("DB Bench Presses"), ["dumbbell", "bench", "press"]);
  assert.deepEqual(normalizeName("Pull-ups"), ["pull", "up"]);
  assert.deepEqual(normalizeName("pullups"), ["pull", "up"]);
  assert.deepEqual(normalizeName("Row 500m"), ["row"]);
  assert.deepEqual(normalizeName("Farmer's walks"), ["farmer", "walk"]);
  assert.deepEqual(normalizeName("KBS"), ["kettlebell", "swing"]);
  assert.deepEqual(normalizeName("C&J"), ["clean", "jerk"]);
});

test("findExercise fuzzy matching", () => {
  const cases = {
    bench: "bench_press", "DB bench press": "dumbbell_bench_press", "db bench": "dumbbell_bench_press", "pull-ups": "pull_up",
    pullups: "pull_up", "Pull Up": "pull_up", "row cal": "row_cal", "cal row": "row_cal", "bulgarian split squats": "bulgarian_split_squat",
    "split squat bulgarian": "bulgarian_split_squat", "bulgarain split squat": "bulgarian_split_squat", squats: "back_squat",
    "BB squat": "back_squat", deadlifts: "deadlift", rdl: "romanian_deadlift", "db rdl": "dumbbell_romanian_deadlift",
    "kb swings": "kettlebell_swing", KBS: "kettlebell_swing", "wall balls": "wall_ball", T2B: "toes_to_bar", "toes to bar": "toes_to_bar",
    DUs: "double_under", "double unders": "double_under", "single-unders": "single_under", "C&J": "clean_and_jerk",
    "power cleans": "power_clean", "hang clean": "hang_power_clean", HSPU: "handstand_push_up", "sled push": "sled_push",
    "shuttle runs": "shuttle_run", "echo bike cals": "assault_bike_cal", "assault bike": "assault_bike", burpees: "burpee",
    "box jumps": "box_jump", thrusters: "thruster", "db thrusters": "dumbbell_thruster", "lat pull down": "lat_pulldown",
    "skull crushers": "skull_crusher", "farmers walk": "farmer_carry", "incline db press": "incline_dumbbell_press", "ski erg": "ski_erg",
    "row 500m": "rower", "kipping pullups": "kipping_pull_up", "muscle-ups": "bar_muscle_up", OHP: "overhead_press",
    "bicep curls": "dumbbell_curl", "leg curls": "seated_leg_curl", "calf raises": "standing_calf_raise", "devils press": "devil_press",
    "Bench Press": "bench_press", "Incline Dumbbell Press": "incline_dumbbell_press", "back-squat": "back_squat", wall_ball: "wall_ball",
  };
  for (const [q, id] of Object.entries(cases)) assert.equal(findExercise(q)?.id, id, `"${q}"`);
  assert.equal(findExercise("zumba"), null);
  assert.equal(findExercise(""), null);
  assert.equal(findExercise(null), null);
  // modality preference: "rows" alone is the erg, but a strength context prefers barbell rows
  assert.equal(findExercise("rows")?.id, "rower");
  assert.equal(findExercise("rows", { modality: "strength" })?.id, "barbell_row");
});

test("searchExercises ranks, filters by equipment and modality, respects limit", () => {
  assert.equal(searchExercises("bench")[0].id, "bench_press");
  assert.equal(searchExercises("db bench")[0].id, "dumbbell_bench_press");
  assert.equal(searchExercises("bul", { limit: 1 })[0].id, "bulgarian_split_squat", "prefix typing");
  const home = new Set(["dumbbells", "pullup_bar", "bands"]);
  const r = searchExercises("press", { equipment: home, limit: 50 });
  assert.ok(r.length > 0);
  for (const e of r) assert.ok(equipmentCheck(e, home).ok, e.id);
  assert.ok(!r.some((e) => e.id === "bench_press"));
  assert.ok(searchExercises("squat", { equipment: [], limit: 50 }).every((e) => !e.equipment.all.length && !e.equipment.any.length));
  const cond = searchExercises("", { modality: "conditioning", limit: 0 });
  assert.ok(cond.length > 60 && cond.every((e) => e.modality.includes("conditioning")));
  assert.equal(searchExercises("", { limit: 0 }).length, EXERCISES.length);
  assert.equal(searchExercises("").length, 20);
  assert.equal(searchExercises("", { limit: 5 }).length, 5);
  const chest = searchExercises("chest", { limit: 5 });
  assert.ok(chest.every((e) => e.primary.includes("chest")), chest.map((e) => e.id).join());
  assert.ok(searchExercises("legs", { limit: 10 }).every((e) => e.primary.some((m) => ["quads", "hamstrings", "glutes", "calves"].includes(m))));
  assert.deepEqual(searchExercises("zzzz"), []);
});

test("equipment helpers: implications and any-groups", () => {
  assert.ok(expandEquipment(["adjustable_bench"]).has("bench"));
  assert.ok(expandEquipment(new Set(["wall_ball"])).has("medicine_ball"));
  assert.ok(equipmentCheck(getExercise("dumbbell_bench_press"), ["dumbbells", "adjustable_bench"]).ok);
  const miss = equipmentCheck(getExercise("bench_press"), ["barbell"]);
  assert.equal(miss.ok, false);
  assert.deepEqual(miss.missing, ["squat_rack", "bench"]);
  const any = equipmentCheck(getExercise("goblet_squat"), []);
  assert.deepEqual(any, { ok: false, missing: ["dumbbells", "kettlebell"], anyOf: ["dumbbells", "kettlebell"] });
  assert.ok(equipmentCheck(getExercise("goblet_squat"), ["kettlebell"]).ok);
  assert.ok(equipmentCheck(getExercise("burpee"), []).ok);
});
