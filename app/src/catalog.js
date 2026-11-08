// Equipment + exercise catalog (owner: Agent A). See CONTRACT.md §5.1.
// Pure data and lookup helpers: no DOM, no platform calls.

/**
 * Equipment the owner can list per location. Ids are stable: add new ones, never rename.
 * Note: barbell-family lifts list only the bar (plates are implied); `adjustable_bench` implies `bench`
 * (see EQUIPMENT_IMPLIES).
 * @type {Readonly<Record<string, {name: string, group: "free_weights"|"machines"|"bodyweight"|"cardio"|"conditioning"|"other"}>>}
 */
export const EQUIPMENT = deepFreeze({
  // free weights + stations
  barbell: { name: "Barbell", group: "free_weights" },
  plates: { name: "Weight plates", group: "free_weights" },
  squat_rack: { name: "Squat rack / power rack", group: "free_weights" },
  bench: { name: "Flat bench", group: "free_weights" },
  adjustable_bench: { name: "Adjustable (incline) bench", group: "free_weights" },
  dumbbells: { name: "Dumbbells", group: "free_weights" },
  kettlebell: { name: "Kettlebell(s)", group: "free_weights" },
  trap_bar: { name: "Trap / hex bar", group: "free_weights" },
  landmine: { name: "Landmine", group: "free_weights" },
  ez_bar: { name: "EZ curl bar", group: "free_weights" },
  safety_squat_bar: { name: "Safety squat bar", group: "free_weights" },
  // machines
  cable_machine: { name: "Cable machine", group: "machines" },
  lat_pulldown: { name: "Lat pulldown machine", group: "machines" },
  seated_row: { name: "Seated row machine", group: "machines" },
  leg_press: { name: "Leg press", group: "machines" },
  leg_curl: { name: "Leg curl machine", group: "machines" },
  leg_extension: { name: "Leg extension machine", group: "machines" },
  hack_squat: { name: "Hack squat machine", group: "machines" },
  smith_machine: { name: "Smith machine", group: "machines" },
  chest_press_machine: { name: "Chest press machine", group: "machines" },
  shoulder_press_machine: { name: "Shoulder press machine", group: "machines" },
  pec_deck: { name: "Pec deck / rear delt machine", group: "machines" },
  calf_machine: { name: "Calf raise machine", group: "machines" },
  hip_thrust_machine: { name: "Hip thrust machine", group: "machines" },
  belt_squat: { name: "Belt squat machine", group: "machines" },
  assisted_pullup_machine: { name: "Assisted pull-up machine", group: "machines" },
  hip_ab_adductor: { name: "Hip abduction / adduction machine", group: "machines" },
  // bodyweight / gymnastics
  pullup_bar: { name: "Pull-up bar", group: "bodyweight" },
  dip_bars: { name: "Dip bars", group: "bodyweight" },
  rings: { name: "Gymnastic rings", group: "bodyweight" },
  trx: { name: "Suspension trainer (TRX)", group: "bodyweight" },
  parallettes: { name: "Parallettes", group: "bodyweight" },
  // conditioning tools
  plyo_box: { name: "Plyo box", group: "conditioning" },
  jump_rope: { name: "Jump rope", group: "conditioning" },
  medicine_ball: { name: "Medicine ball", group: "conditioning" },
  wall_ball: { name: "Wall ball (soft med ball + target)", group: "conditioning" },
  slam_ball: { name: "Slam ball", group: "conditioning" },
  sandbag: { name: "Sandbag", group: "conditioning" },
  sled: { name: "Sled / prowler", group: "conditioning" },
  battle_rope: { name: "Battle rope", group: "conditioning" },
  climbing_rope: { name: "Climbing rope", group: "conditioning" },
  weight_vest: { name: "Weight vest", group: "conditioning" },
  // cardio
  rower: { name: "Rowing machine", group: "cardio" },
  assault_bike: { name: "Air bike (Assault / Echo)", group: "cardio" },
  bike: { name: "Stationary bike", group: "cardio" },
  ski_erg: { name: "SkiErg", group: "cardio" },
  treadmill: { name: "Treadmill", group: "cardio" },
  stair_climber: { name: "Stair climber", group: "cardio" },
  elliptical: { name: "Elliptical", group: "cardio" },
  outdoor_route: { name: "Can run outside", group: "cardio" },
  track: { name: "Running track", group: "cardio" },
  pool: { name: "Swimming pool", group: "cardio" },
  // other
  bands: { name: "Resistance bands", group: "other" },
  ghd: { name: "GHD", group: "other" },
  hyperextension_bench: { name: "45° back extension bench", group: "other" },
  ab_wheel: { name: "Ab wheel", group: "other" },
  foam_roller: { name: "Foam roller", group: "other" },
});

/**
 * Equipment that implies other equipment (an adjustable bench works as a flat bench, a wall ball is a
 * medicine ball). Applied by expandEquipment().
 * @type {Readonly<Record<string, string[]>>}
 */
export const EQUIPMENT_IMPLIES = deepFreeze({
  adjustable_bench: ["bench"],
  wall_ball: ["medicine_ball"],
  safety_squat_bar: ["barbell"],
});

/** Muscle ids used for volume counting (primary = 1 set, secondary = 0.5). */
export const MUSCLES = Object.freeze(["chest", "front_delts", "side_delts", "rear_delts", "upper_back", "lats", "lower_back", "biceps", "triceps", "forearms", "quads", "hamstrings", "glutes", "adductors", "calves", "abs"]);

/** Movement patterns (Exercise.pattern). */
export const PATTERNS = Object.freeze(["squat", "hinge", "lunge", "h_push", "v_push", "h_pull", "v_pull", "carry", "core", "isolation", "plyo", "olympic", "gymnastics", "cardio"]);

/**
 * jointStress vocabulary (what an exercise loads; core.validatePlan maps injuries onto these):
 * knee_flexion_deep, hip_flexion_deep, spinal_axial (axial loading), spinal_flexion (loaded flexion),
 * hinge_loaded (loaded hip hinge / bent-over position), overhead, shoulder_extension (deep dips, bench bottom,
 * pullovers), kipping, wrist_extension, elbow, grip, impact (jumping, running), ankle_dorsiflexion.
 */
export const JOINT_STRESS = Object.freeze(["knee_flexion_deep", "hip_flexion_deep", "spinal_axial", "spinal_flexion", "hinge_loaded", "overhead", "shoulder_extension", "kipping", "wrist_extension", "elbow", "grip", "impact", "ankle_dorsiflexion"]);

// ------------------------------------------------------------------ exercise data
const S = ["strength"], C = ["conditioning"], SC = ["strength", "conditioning"], CARDIO = ["cardio"];

/**
 * Compact entry builder.
 * @param {string} id
 * @param {string} name
 * @param {string} pattern
 * @param {string} primary    space-separated MUSCLES ids
 * @param {string} secondary  space-separated MUSCLES ids
 * @param {string} equip      "all1 all2 / any1 any2": ids before "/" are all required, ids after it are alternatives (one needed)
 * @param {{m?: string[], u?: string, k?: number, js?: string, alt?: string, aka?: string}} [o]
 *   m modality, u unit, k skill 1-5, js jointStress tags, alt alternative ids, aka comma-separated aliases
 */
function ex(id, name, pattern, primary, secondary, equip, o = {}) {
  const [all = "", any = ""] = equip.split("/");
  const modality = o.m || S;
  const equipment = { all: words(all), any: words(any) };
  const noEquipment = !equipment.all.length && !equipment.any.length;
  const unit = o.u || (modality === CARDIO ? "distance" : modality === C ? "reps" : noEquipment ? "reps" : "load_reps");
  const skill = o.k || ({ isolation: 1, core: 1, cardio: 1, olympic: 4, gymnastics: 4 }[pattern] ?? 2);
  return {
    id, name,
    aliases: (o.aka || "").split(",").map((s) => s.trim()).filter(Boolean),
    modality: [...modality],
    pattern,
    primary: words(primary),
    secondary: words(secondary),
    equipment,
    jointStress: words(o.js),
    unit,
    skill,
    alternatives: words(o.alt),
  };
}
function words(s) { return (s || "").trim().split(/\s+/).filter(Boolean); }

const KFD = "knee_flexion_deep";

/**
 * The exercise catalog. Exercise = { id, name, aliases, modality, pattern, primary, secondary,
 * equipment: { all, any }, jointStress, unit, skill, alternatives } (CONTRACT §5.1). Frozen.
 * @type {ReadonlyArray<object>}
 */
export const EXERCISES = deepFreeze([
  // ---------------------------------------------------------------- squat
  ex("back_squat", "Back Squat", "squat", "quads glutes", "adductors lower_back", "barbell squat_rack", { k: 3, js: `${KFD} spinal_axial hip_flexion_deep`, alt: "front_squat safety_bar_squat hack_squat leg_press goblet_squat", aka: "squat, barbell squat, barbell back squat, high bar squat, low bar squat, bb squat" }),
  ex("front_squat", "Front Squat", "squat", "quads", "glutes upper_back", "barbell squat_rack", { m: SC, k: 4, js: `${KFD} spinal_axial wrist_extension`, alt: "back_squat goblet_squat hack_squat dumbbell_front_squat", aka: "barbell front squat, bb front squat" }),
  ex("safety_bar_squat", "Safety Bar Squat", "squat", "quads glutes", "upper_back adductors", "safety_squat_bar squat_rack", { js: `${KFD} spinal_axial`, alt: "back_squat front_squat belt_squat leg_press", aka: "ssb squat, safety squat bar squat" }),
  ex("box_squat", "Box Squat", "squat", "quads glutes", "adductors", "barbell squat_rack / plyo_box bench", { js: "spinal_axial", alt: "back_squat goblet_squat leg_press", aka: "barbell box squat" }),
  ex("pause_squat", "Pause Squat", "squat", "quads glutes", "adductors lower_back", "barbell squat_rack", { k: 3, js: `${KFD} spinal_axial`, alt: "back_squat front_squat goblet_squat", aka: "paused squat, paused back squat" }),
  ex("overhead_squat", "Overhead Squat", "squat", "quads glutes", "upper_back side_delts abs", "barbell", { m: SC, k: 5, js: `overhead ${KFD} wrist_extension`, alt: "front_squat goblet_squat back_squat", aka: "ohs, barbell overhead squat" }),
  ex("zercher_squat", "Zercher Squat", "squat", "quads glutes", "upper_back abs", "barbell", { k: 3, js: `${KFD} spinal_axial`, alt: "front_squat goblet_squat" }),
  ex("goblet_squat", "Goblet Squat", "squat", "quads", "glutes", "/ dumbbells kettlebell", { m: SC, k: 1, js: KFD, alt: "dumbbell_front_squat leg_press air_squat front_squat", aka: "db goblet squat, kb goblet squat, kettlebell goblet squat, dumbbell goblet squat, heels elevated goblet squat" }),
  ex("dumbbell_front_squat", "Dumbbell Front Squat", "squat", "quads", "glutes", "dumbbells", { m: SC, js: KFD, alt: "goblet_squat kettlebell_front_squat front_squat", aka: "db squat, dumbbell squat, db front squat" }),
  ex("kettlebell_front_squat", "Kettlebell Front Squat", "squat", "quads", "glutes abs", "kettlebell", { m: SC, js: KFD, alt: "goblet_squat dumbbell_front_squat", aka: "kb squat, kb front squat, double kettlebell front squat, front rack kettlebell squat" }),
  ex("hack_squat", "Hack Squat", "squat", "quads", "glutes", "hack_squat", { k: 1, js: KFD, alt: "leg_press back_squat smith_squat belt_squat", aka: "machine hack squat" }),
  ex("leg_press", "Leg Press", "squat", "quads", "glutes", "leg_press", { k: 1, js: KFD, alt: "hack_squat back_squat belt_squat goblet_squat", aka: "45 degree leg press, leg press machine" }),
  ex("smith_squat", "Smith Machine Squat", "squat", "quads", "glutes", "smith_machine", { k: 1, js: `${KFD} spinal_axial`, alt: "hack_squat leg_press back_squat", aka: "smith squat" }),
  ex("belt_squat", "Belt Squat", "squat", "quads", "glutes", "belt_squat", { k: 1, js: KFD, alt: "leg_press hack_squat goblet_squat" }),
  ex("landmine_squat", "Landmine Squat", "squat", "quads", "glutes abs", "landmine", { k: 1, alt: "goblet_squat front_squat" }),
  ex("air_squat", "Air Squat", "squat", "quads", "glutes", "", { m: SC, k: 1, alt: "goblet_squat jump_squat wall_sit", aka: "bodyweight squat, bw squat, air squats" }),
  ex("wall_sit", "Wall Sit", "squat", "quads", "glutes", "", { u: "time", k: 1, alt: "air_squat goblet_squat leg_extension", aka: "wall squat, wall squat hold" }),
  ex("sissy_squat", "Sissy Squat", "squat", "quads", "", "", { k: 3, js: KFD, alt: "leg_extension goblet_squat" }),
  ex("sandbag_squat", "Sandbag Squat", "squat", "quads glutes", "upper_back abs", "sandbag", { m: SC, js: KFD, alt: "goblet_squat front_squat", aka: "bear hug squat, sandbag bear hug squat" }),
  ex("thruster", "Barbell Thruster", "squat", "quads glutes front_delts", "triceps upper_back abs", "barbell", { m: SC, k: 3, js: `overhead ${KFD} wrist_extension`, alt: "dumbbell_thruster kettlebell_thruster wall_ball front_squat", aka: "thruster, bb thruster" }),
  ex("dumbbell_thruster", "Dumbbell Thruster", "squat", "quads glutes front_delts", "triceps abs", "dumbbells", { m: SC, js: `overhead ${KFD}`, alt: "thruster kettlebell_thruster wall_ball", aka: "db thruster" }),
  ex("kettlebell_thruster", "Kettlebell Thruster", "squat", "quads glutes front_delts", "triceps abs", "kettlebell", { m: SC, js: `overhead ${KFD}`, alt: "dumbbell_thruster thruster wall_ball", aka: "kb thruster" }),
  ex("wall_ball", "Wall Ball Shot", "squat", "quads glutes front_delts", "triceps abs", "/ wall_ball medicine_ball", { m: C, js: `overhead ${KFD}`, alt: "thruster dumbbell_thruster med_ball_clean", aka: "wall ball, wall balls, wb, wall ball shots" }),
  // ---------------------------------------------------------------- hinge
  ex("deadlift", "Deadlift", "hinge", "glutes hamstrings lower_back", "quads upper_back forearms", "barbell", { m: SC, k: 3, js: "spinal_axial hinge_loaded grip", alt: "trap_bar_deadlift romanian_deadlift sumo_deadlift dumbbell_deadlift kettlebell_deadlift", aka: "conventional deadlift, barbell deadlift, bb deadlift, dl" }),
  ex("sumo_deadlift", "Sumo Deadlift", "hinge", "glutes adductors", "quads hamstrings lower_back", "barbell", { k: 3, js: "spinal_axial hinge_loaded grip hip_flexion_deep", alt: "deadlift trap_bar_deadlift", aka: "sumo dl" }),
  ex("trap_bar_deadlift", "Trap Bar Deadlift", "hinge", "glutes quads", "hamstrings lower_back upper_back", "trap_bar", { js: "spinal_axial grip", alt: "deadlift sumo_deadlift dumbbell_deadlift", aka: "hex bar deadlift, trap bar dl, hex bar dl" }),
  ex("romanian_deadlift", "Romanian Deadlift", "hinge", "hamstrings glutes", "lower_back", "barbell", { js: "hinge_loaded grip", alt: "dumbbell_romanian_deadlift stiff_leg_deadlift good_morning back_extension hip_thrust", aka: "rdl, barbell rdl, bb rdl, barbell romanian deadlift" }),
  ex("dumbbell_romanian_deadlift", "Dumbbell Romanian Deadlift", "hinge", "hamstrings glutes", "lower_back", "dumbbells", { js: "hinge_loaded grip", alt: "romanian_deadlift single_leg_rdl kettlebell_deadlift back_extension", aka: "db rdl, dumbbell rdl" }),
  ex("stiff_leg_deadlift", "Stiff-Leg Deadlift", "hinge", "hamstrings", "glutes lower_back", "barbell", { js: "hinge_loaded spinal_axial grip", alt: "romanian_deadlift dumbbell_romanian_deadlift", aka: "sldl, stiff legged deadlift" }),
  ex("single_leg_rdl", "Single-Leg Romanian Deadlift", "hinge", "hamstrings glutes", "", "/ dumbbells kettlebell", { alt: "dumbbell_romanian_deadlift romanian_deadlift single_leg_glute_bridge", aka: "single leg rdl, sl rdl, one leg rdl" }),
  ex("dumbbell_deadlift", "Dumbbell Deadlift", "hinge", "glutes hamstrings", "quads lower_back forearms", "dumbbells", { m: SC, k: 1, js: "hinge_loaded grip", alt: "kettlebell_deadlift trap_bar_deadlift dumbbell_romanian_deadlift", aka: "db deadlift" }),
  ex("kettlebell_deadlift", "Kettlebell Deadlift", "hinge", "glutes hamstrings", "quads lower_back", "kettlebell", { k: 1, js: "hinge_loaded", alt: "dumbbell_deadlift dumbbell_romanian_deadlift kettlebell_swing", aka: "kb deadlift" }),
  ex("good_morning", "Good Morning", "hinge", "hamstrings lower_back", "glutes", "barbell squat_rack", { k: 3, js: "spinal_axial hinge_loaded", alt: "romanian_deadlift back_extension", aka: "good mornings, barbell good morning" }),
  ex("rack_pull", "Rack Pull", "hinge", "glutes lower_back upper_back", "hamstrings forearms", "barbell squat_rack", { js: "spinal_axial grip", alt: "deadlift trap_bar_deadlift", aka: "block pull, rack pulls" }),
  ex("hip_thrust", "Barbell Hip Thrust", "hinge", "glutes", "hamstrings", "barbell bench", { alt: "machine_hip_thrust dumbbell_hip_thrust glute_bridge", aka: "hip thrust, bb hip thrust" }),
  ex("dumbbell_hip_thrust", "Dumbbell Hip Thrust", "hinge", "glutes", "hamstrings", "dumbbells bench", { k: 1, alt: "hip_thrust glute_bridge single_leg_glute_bridge", aka: "db hip thrust" }),
  ex("machine_hip_thrust", "Machine Hip Thrust", "hinge", "glutes", "hamstrings", "hip_thrust_machine", { k: 1, alt: "hip_thrust glute_bridge", aka: "glute drive, hip thrust machine" }),
  ex("glute_bridge", "Glute Bridge", "hinge", "glutes", "hamstrings", "", { k: 1, alt: "hip_thrust single_leg_glute_bridge", aka: "bridge, hip bridge" }),
  ex("single_leg_glute_bridge", "Single-Leg Glute Bridge", "hinge", "glutes", "hamstrings", "", { k: 1, alt: "glute_bridge hip_thrust", aka: "single leg bridge, sl glute bridge" }),
  ex("kettlebell_swing", "Kettlebell Swing", "hinge", "glutes hamstrings", "lower_back", "kettlebell", { m: SC, js: "hinge_loaded grip", alt: "american_kettlebell_swing kettlebell_deadlift cable_pull_through", aka: "kb swing, russian kettlebell swing, russian swing, kbs, swing" }),
  ex("american_kettlebell_swing", "American Kettlebell Swing", "hinge", "glutes hamstrings", "lower_back front_delts", "kettlebell", { m: C, js: "overhead hinge_loaded grip", alt: "kettlebell_swing dumbbell_snatch", aka: "american swing, american kb swing, overhead kettlebell swing" }),
  ex("back_extension", "Back Extension", "hinge", "lower_back glutes", "hamstrings", "/ hyperextension_bench ghd", { k: 1, alt: "good_morning romanian_deadlift hip_thrust bird_dog", aka: "hyperextension, 45 degree back extension, roman chair back extension, back raise" }),
  ex("cable_pull_through", "Cable Pull-Through", "hinge", "glutes hamstrings", "", "cable_machine", { k: 1, alt: "kettlebell_swing romanian_deadlift band_pull_through", aka: "pull through, cable pull through" }),
  ex("band_pull_through", "Band Pull-Through", "hinge", "glutes hamstrings", "", "bands", { k: 1, u: "reps", alt: "cable_pull_through glute_bridge" }),
  ex("sandbag_over_shoulder", "Sandbag Over Shoulder", "hinge", "glutes hamstrings lower_back", "upper_back quads", "sandbag", { m: SC, k: 3, js: "hinge_loaded spinal_flexion grip", alt: "sandbag_clean deadlift kettlebell_swing", aka: "sandbag to shoulder, sandbag ground to shoulder, d ball over shoulder, stone to shoulder" }),
  ex("sumo_deadlift_high_pull", "Sumo Deadlift High Pull", "hinge", "glutes hamstrings upper_back", "side_delts quads", "/ barbell kettlebell", { m: C, js: "hinge_loaded", alt: "kettlebell_swing hang_power_clean", aka: "sdhp, sumo high pull" }),
  // ---------------------------------------------------------------- lunge / single leg
  ex("bulgarian_split_squat", "Bulgarian Split Squat", "lunge", "quads glutes", "adductors", "", { u: "load_reps", js: KFD, alt: "split_squat reverse_lunge step_up single_leg_press", aka: "rear foot elevated split squat, rfess, bss, db bulgarian split squat, dumbbell bulgarian split squat, bulgarian squat" }),
  ex("split_squat", "Split Squat", "lunge", "quads glutes", "adductors", "", { u: "load_reps", k: 1, js: KFD, alt: "bulgarian_split_squat reverse_lunge step_up", aka: "static lunge, db split squat, dumbbell split squat" }),
  ex("reverse_lunge", "Reverse Lunge", "lunge", "quads glutes", "adductors", "", { u: "load_reps", k: 1, js: KFD, alt: "split_squat walking_lunge step_up", aka: "db reverse lunge, dumbbell reverse lunge" }),
  ex("lunge", "Forward Lunge", "lunge", "quads glutes", "adductors", "", { u: "load_reps", k: 1, js: KFD, alt: "reverse_lunge walking_lunge split_squat", aka: "lunge, front lunge" }),
  ex("walking_lunge", "Walking Lunge", "lunge", "quads glutes", "adductors", "", { m: SC, u: "load_reps", k: 1, js: KFD, alt: "reverse_lunge dumbbell_walking_lunge split_squat", aka: "lunge walk" }),
  ex("dumbbell_walking_lunge", "Dumbbell Walking Lunge", "lunge", "quads glutes", "adductors forearms", "dumbbells", { m: SC, js: `${KFD} grip`, alt: "walking_lunge reverse_lunge barbell_reverse_lunge", aka: "db walking lunge, db lunge, dumbbell lunge" }),
  ex("barbell_reverse_lunge", "Barbell Reverse Lunge", "lunge", "quads glutes", "adductors", "barbell squat_rack", { k: 3, js: `${KFD} spinal_axial`, alt: "reverse_lunge bulgarian_split_squat", aka: "barbell lunge, front rack lunge" }),
  ex("overhead_walking_lunge", "Overhead Walking Lunge", "lunge", "quads glutes", "side_delts upper_back abs", "/ plates dumbbells barbell kettlebell", { m: C, k: 3, js: `overhead ${KFD}`, alt: "walking_lunge dumbbell_walking_lunge", aka: "overhead lunge, plate overhead lunge, ohl" }),
  ex("step_up", "Step-Up", "lunge", "quads glutes", "", "", { u: "load_reps", k: 1, alt: "dumbbell_step_up reverse_lunge split_squat", aka: "box step up, bench step up" }),
  ex("dumbbell_step_up", "Dumbbell Step-Up", "lunge", "quads glutes", "forearms", "dumbbells / plyo_box bench", { k: 1, alt: "step_up bulgarian_split_squat", aka: "db step up, weighted step up" }),
  ex("dumbbell_box_step_over", "Dumbbell Box Step-Over", "lunge", "quads glutes", "forearms", "dumbbells plyo_box", { m: C, alt: "step_up box_jump_over dumbbell_step_up", aka: "db box step over, box step over" }),
  ex("lateral_lunge", "Lateral Lunge", "lunge", "adductors quads glutes", "", "", { u: "load_reps", k: 1, alt: "cossack_squat reverse_lunge", aka: "side lunge" }),
  ex("cossack_squat", "Cossack Squat", "lunge", "adductors quads", "glutes", "", { k: 3, js: `${KFD} hip_flexion_deep`, alt: "lateral_lunge goblet_squat" }),
  ex("pistol_squat", "Pistol Squat", "lunge", "quads glutes", "abs", "", { m: SC, k: 4, js: KFD, alt: "skater_squat bulgarian_split_squat step_up", aka: "pistol, single leg squat" }),
  ex("skater_squat", "Skater Squat", "lunge", "quads glutes", "", "", { k: 3, js: KFD, alt: "pistol_squat bulgarian_split_squat" }),
  ex("single_leg_press", "Single-Leg Leg Press", "lunge", "quads glutes", "adductors", "leg_press", { k: 1, alt: "bulgarian_split_squat step_up leg_press", aka: "single leg press, one leg press" }),
  // ---------------------------------------------------------------- horizontal push
  ex("bench_press", "Bench Press", "h_push", "chest", "triceps front_delts", "barbell squat_rack bench", { js: "shoulder_extension", alt: "dumbbell_bench_press machine_chest_press smith_bench_press push_up floor_press", aka: "bench, barbell bench press, flat bench, flat bench press, bb bench, paused bench press" }),
  ex("incline_bench_press", "Incline Bench Press", "h_push", "chest front_delts", "triceps", "barbell squat_rack adjustable_bench", { js: "shoulder_extension", alt: "incline_dumbbell_press machine_chest_press landmine_press", aka: "incline barbell bench press, incline bench, incline press" }),
  ex("close_grip_bench_press", "Close-Grip Bench Press", "h_push", "triceps chest", "front_delts", "barbell squat_rack bench", { js: "wrist_extension elbow", alt: "dip dumbbell_bench_press skull_crusher diamond_push_up", aka: "cgbp, close grip bench" }),
  ex("floor_press", "Floor Press", "h_push", "chest triceps", "front_delts", "barbell squat_rack", { alt: "dumbbell_floor_press bench_press", aka: "barbell floor press" }),
  ex("dumbbell_floor_press", "Dumbbell Floor Press", "h_push", "chest triceps", "front_delts", "dumbbells", { k: 1, alt: "dumbbell_bench_press push_up floor_press", aka: "db floor press" }),
  ex("dumbbell_bench_press", "Dumbbell Bench Press", "h_push", "chest", "triceps front_delts", "dumbbells bench", { js: "shoulder_extension", alt: "bench_press machine_chest_press push_up dumbbell_floor_press", aka: "db bench, db bench press, dumbbell press, dumbbell chest press, flat dumbbell press" }),
  ex("incline_dumbbell_press", "Incline Dumbbell Press", "h_push", "chest front_delts", "triceps", "dumbbells adjustable_bench", { alt: "incline_bench_press dumbbell_bench_press machine_chest_press", aka: "incline db press, incline dumbbell bench press, db incline press" }),
  ex("machine_chest_press", "Machine Chest Press", "h_push", "chest", "triceps front_delts", "chest_press_machine", { k: 1, alt: "dumbbell_bench_press bench_press push_up", aka: "chest press, seated chest press, chest press machine" }),
  ex("smith_bench_press", "Smith Machine Bench Press", "h_push", "chest", "triceps front_delts", "smith_machine bench", { k: 1, alt: "bench_press dumbbell_bench_press machine_chest_press", aka: "smith bench, smith bench press" }),
  ex("push_up", "Push-Up", "h_push", "chest", "triceps front_delts abs", "", { m: SC, k: 1, js: "wrist_extension", alt: "incline_push_up dumbbell_bench_press machine_chest_press ring_push_up", aka: "pushup, press up, weighted push up" }),
  ex("incline_push_up", "Incline Push-Up", "h_push", "chest", "triceps front_delts", "", { m: SC, k: 1, js: "wrist_extension", alt: "push_up dumbbell_bench_press", aka: "elevated push up, hands elevated push up" }),
  ex("hand_release_push_up", "Hand-Release Push-Up", "h_push", "chest", "triceps front_delts abs", "", { m: C, js: "wrist_extension", alt: "push_up burpee", aka: "hrpu, hand release push up" }),
  ex("diamond_push_up", "Diamond Push-Up", "h_push", "triceps chest", "front_delts", "", { js: "wrist_extension elbow", alt: "close_grip_bench_press bench_dip triceps_pushdown", aka: "close grip push up, triangle push up" }),
  ex("deficit_push_up", "Deficit Push-Up", "h_push", "chest", "triceps front_delts", "", { js: "wrist_extension shoulder_extension", alt: "push_up dumbbell_bench_press" }),
  ex("ring_push_up", "Ring Push-Up", "h_push", "chest", "triceps front_delts abs", "/ rings trx", { k: 3, alt: "push_up dumbbell_bench_press", aka: "trx push up, suspension push up" }),
  ex("dip", "Dip", "h_push", "chest triceps", "front_delts", "dip_bars", { m: SC, js: "shoulder_extension", alt: "bench_dip close_grip_bench_press ring_dip dumbbell_bench_press", aka: "dips, parallel bar dip, chest dip, bar dip, weighted dip" }),
  ex("ring_dip", "Ring Dip", "h_push", "chest triceps", "front_delts", "rings", { m: SC, k: 4, js: "shoulder_extension", alt: "dip bench_dip", aka: "ring dips" }),
  ex("bench_dip", "Bench Dip", "h_push", "triceps", "chest front_delts", "", { k: 1, js: "shoulder_extension", alt: "dip triceps_pushdown diamond_push_up", aka: "chair dip, tricep dip, triceps dip" }),
  // ---------------------------------------------------------------- vertical push
  ex("overhead_press", "Overhead Press", "v_push", "front_delts", "triceps side_delts", "barbell squat_rack", { m: SC, k: 3, js: "overhead spinal_axial", alt: "dumbbell_shoulder_press machine_shoulder_press landmine_press push_press", aka: "ohp, military press, strict press, barbell overhead press, standing press, shoulder press, barbell shoulder press" }),
  ex("push_press", "Push Press", "v_push", "front_delts triceps", "quads side_delts", "barbell squat_rack", { m: SC, k: 3, js: "overhead spinal_axial", alt: "overhead_press dumbbell_push_press push_jerk", aka: "barbell push press" }),
  ex("dumbbell_shoulder_press", "Dumbbell Shoulder Press", "v_push", "front_delts", "triceps side_delts", "dumbbells", { js: "overhead", alt: "overhead_press machine_shoulder_press landmine_press arnold_press kettlebell_press", aka: "db shoulder press, db ohp, dumbbell overhead press, seated dumbbell press, seated db press" }),
  ex("arnold_press", "Arnold Press", "v_push", "front_delts", "side_delts triceps", "dumbbells", { js: "overhead", alt: "dumbbell_shoulder_press machine_shoulder_press" }),
  ex("kettlebell_press", "Kettlebell Press", "v_push", "front_delts", "triceps side_delts abs", "kettlebell", { js: "overhead", alt: "dumbbell_shoulder_press landmine_press", aka: "kb press, kettlebell overhead press, kb strict press" }),
  ex("machine_shoulder_press", "Machine Shoulder Press", "v_push", "front_delts", "triceps side_delts", "shoulder_press_machine", { k: 1, js: "overhead", alt: "dumbbell_shoulder_press landmine_press overhead_press", aka: "shoulder press machine" }),
  ex("landmine_press", "Landmine Press", "v_push", "front_delts chest", "triceps", "landmine", { alt: "dumbbell_shoulder_press incline_bench_press", aka: "half kneeling landmine press, single arm landmine press" }),
  ex("dumbbell_push_press", "Dumbbell Push Press", "v_push", "front_delts triceps", "quads side_delts", "dumbbells", { m: SC, js: "overhead", alt: "push_press dumbbell_shoulder_press dumbbell_thruster", aka: "db push press" }),
  ex("pike_push_up", "Pike Push-Up", "v_push", "front_delts", "triceps upper_back", "", { m: SC, js: "overhead wrist_extension", alt: "dumbbell_shoulder_press handstand_push_up", aka: "pike pushup, elevated pike push up" }),
  ex("box_pike_push_up", "Box Pike Push-Up", "v_push", "front_delts triceps", "upper_back", "/ plyo_box bench", { m: SC, k: 3, js: "overhead wrist_extension", alt: "pike_push_up handstand_push_up dumbbell_push_press", aka: "feet elevated pike push up, box pike, pike push up on box, hspu progression" }),
  ex("handstand_push_up", "Handstand Push-Up", "v_push", "front_delts triceps", "upper_back", "", { m: SC, k: 4, js: "overhead wrist_extension spinal_axial", alt: "pike_push_up dumbbell_shoulder_press overhead_press", aka: "hspu, strict handstand push up, kipping handstand push up, wall handstand push up" }),
  // ---------------------------------------------------------------- horizontal pull
  ex("barbell_row", "Barbell Row", "h_pull", "upper_back lats", "biceps rear_delts lower_back", "barbell", { js: "hinge_loaded grip", alt: "dumbbell_row chest_supported_row seated_cable_row pendlay_row t_bar_row", aka: "bent over row, bent over barbell row, bb row, barbell bent over row" }),
  ex("pendlay_row", "Pendlay Row", "h_pull", "upper_back lats", "biceps rear_delts lower_back", "barbell", { k: 3, js: "hinge_loaded grip", alt: "barbell_row dumbbell_row" }),
  ex("dumbbell_row", "Dumbbell Row", "h_pull", "lats upper_back", "biceps rear_delts", "dumbbells", { k: 1, alt: "chest_supported_row seated_cable_row barbell_row inverted_row", aka: "db row, one arm dumbbell row, single arm dumbbell row, one arm db row, kroc row" }),
  ex("chest_supported_row", "Chest-Supported Dumbbell Row", "h_pull", "upper_back lats", "biceps rear_delts", "dumbbells adjustable_bench", { k: 1, alt: "seated_cable_row dumbbell_row machine_row", aka: "chest supported row, incline dumbbell row, incline db row, seal row" }),
  ex("seated_cable_row", "Seated Cable Row", "h_pull", "upper_back lats", "biceps rear_delts", "/ seated_row cable_machine", { k: 1, alt: "chest_supported_row dumbbell_row machine_row barbell_row", aka: "cable row, seated row, low row" }),
  ex("machine_row", "Machine Row", "h_pull", "upper_back lats", "biceps rear_delts", "seated_row", { k: 1, alt: "seated_cable_row chest_supported_row", aka: "chest supported machine row, hammer strength row, plate loaded row" }),
  ex("t_bar_row", "T-Bar Row", "h_pull", "upper_back lats", "biceps rear_delts lower_back", "landmine", { js: "hinge_loaded grip", alt: "barbell_row chest_supported_row", aka: "landmine row" }),
  ex("inverted_row", "Inverted Row", "h_pull", "upper_back lats", "biceps rear_delts", "/ squat_rack smith_machine rings trx", { m: SC, k: 1, alt: "ring_row dumbbell_row seated_cable_row", aka: "bodyweight row, australian pull up, body row" }),
  ex("ring_row", "Ring Row", "h_pull", "upper_back lats", "biceps rear_delts", "/ rings trx", { m: SC, k: 1, alt: "inverted_row dumbbell_row band_row", aka: "trx row, suspension row" }),
  ex("renegade_row", "Renegade Row", "h_pull", "lats upper_back", "abs chest triceps", "dumbbells", { m: SC, js: "wrist_extension", alt: "dumbbell_row plank" }),
  ex("band_row", "Band Row", "h_pull", "upper_back lats", "biceps rear_delts", "bands", { k: 1, u: "reps", alt: "ring_row seated_cable_row", aka: "banded row, resistance band row" }),
  // ---------------------------------------------------------------- vertical pull
  ex("pull_up", "Pull-Up", "v_pull", "lats", "biceps upper_back", "/ pullup_bar rings", { m: SC, k: 3, js: "grip", alt: "lat_pulldown chin_up band_assisted_pull_up assisted_pull_up jumping_pull_up", aka: "pullup, strict pull up, weighted pull up" }),
  ex("chin_up", "Chin-Up", "v_pull", "lats biceps", "upper_back", "/ pullup_bar rings", { m: SC, js: "grip", alt: "pull_up lat_pulldown band_assisted_pull_up", aka: "chinup, chins, underhand pull up, weighted chin up" }),
  ex("kipping_pull_up", "Kipping Pull-Up", "v_pull", "lats", "biceps upper_back abs", "pullup_bar", { m: C, k: 3, js: "grip kipping", alt: "pull_up jumping_pull_up ring_row", aka: "kip pull up, kipping pullup" }),
  ex("butterfly_pull_up", "Butterfly Pull-Up", "v_pull", "lats", "biceps upper_back abs", "pullup_bar", { m: C, k: 4, js: "grip kipping", alt: "kipping_pull_up pull_up", aka: "butterfly, butterfly pullup" }),
  ex("chest_to_bar_pull_up", "Chest-to-Bar Pull-Up", "v_pull", "lats upper_back", "biceps", "pullup_bar", { m: C, k: 4, js: "grip kipping", alt: "kipping_pull_up pull_up", aka: "chest to bar, c2b, ctb" }),
  ex("jumping_pull_up", "Jumping Pull-Up", "v_pull", "lats", "biceps upper_back quads", "pullup_bar", { m: C, k: 1, js: "grip", alt: "band_assisted_pull_up ring_row" }),
  ex("band_assisted_pull_up", "Band-Assisted Pull-Up", "v_pull", "lats", "biceps upper_back", "pullup_bar bands", { m: SC, alt: "pull_up lat_pulldown negative_pull_up", aka: "banded pull up" }),
  ex("negative_pull_up", "Negative Pull-Up", "v_pull", "lats", "biceps upper_back", "pullup_bar", { alt: "band_assisted_pull_up lat_pulldown", aka: "pull up negative, eccentric pull up" }),
  ex("assisted_pull_up", "Assisted Pull-Up Machine", "v_pull", "lats", "biceps upper_back", "assisted_pullup_machine", { k: 1, alt: "lat_pulldown band_assisted_pull_up", aka: "assisted pull up, assisted chin up, machine assisted pull up" }),
  ex("lat_pulldown", "Lat Pulldown", "v_pull", "lats", "biceps upper_back", "/ lat_pulldown cable_machine", { k: 1, alt: "pull_up assisted_pull_up band_pulldown straight_arm_pulldown", aka: "pulldown, wide grip pulldown, cable pulldown, close grip pulldown" }),
  ex("band_pulldown", "Band Pulldown", "v_pull", "lats", "biceps", "bands", { k: 1, u: "reps", alt: "lat_pulldown band_assisted_pull_up" }),
  ex("dumbbell_pullover", "Dumbbell Pullover", "v_pull", "lats chest", "triceps", "dumbbells bench", { js: "overhead shoulder_extension", alt: "straight_arm_pulldown lat_pulldown", aka: "pullover, db pullover" }),
  ex("rope_climb", "Rope Climb", "gymnastics", "lats biceps forearms", "upper_back abs", "climbing_rope", { m: C, js: "grip", alt: "pull_up chin_up dead_hang", aka: "legless rope climb" }),
  ex("bar_muscle_up", "Bar Muscle-Up", "gymnastics", "lats triceps", "chest biceps upper_back abs", "pullup_bar", { m: C, k: 5, js: "kipping grip shoulder_extension", alt: "chest_to_bar_pull_up dip pull_up", aka: "bmu, muscle up" }),
  ex("ring_muscle_up", "Ring Muscle-Up", "gymnastics", "lats triceps", "chest biceps upper_back abs", "rings", { m: C, k: 5, js: "kipping grip shoulder_extension", alt: "bar_muscle_up ring_dip pull_up", aka: "rmu" }),
  // ---------------------------------------------------------------- carry / sled
  ex("farmer_carry", "Farmer's Carry", "carry", "forearms upper_back", "abs", "/ dumbbells kettlebell trap_bar", { m: SC, u: "distance", k: 1, js: "grip", alt: "suitcase_carry front_rack_carry sandbag_carry", aka: "farmers walk, farmer walk, farmers carry, trap bar carry" }),
  ex("suitcase_carry", "Suitcase Carry", "carry", "abs forearms", "", "/ dumbbells kettlebell", { m: SC, u: "distance", k: 1, js: "grip", alt: "farmer_carry side_plank" }),
  ex("front_rack_carry", "Front Rack Carry", "carry", "abs upper_back", "forearms", "/ kettlebell dumbbells", { m: SC, u: "distance", k: 1, alt: "farmer_carry sandbag_carry", aka: "kettlebell front rack carry, front rack walk" }),
  ex("overhead_carry", "Overhead Carry", "carry", "front_delts abs", "side_delts upper_back triceps", "/ dumbbells kettlebell plates", { m: SC, u: "distance", js: "overhead", alt: "farmer_carry front_rack_carry", aka: "overhead walk, waiter walk" }),
  ex("sandbag_carry", "Sandbag Carry", "carry", "upper_back abs", "biceps forearms quads", "sandbag", { m: SC, u: "distance", k: 1, alt: "farmer_carry front_rack_carry", aka: "bear hug carry, sandbag bear hug carry" }),
  ex("sled_push", "Sled Push", "carry", "quads glutes", "calves", "sled", { m: SC, u: "distance", k: 1, alt: "sled_drag walking_lunge", aka: "prowler push, prowler" }),
  ex("sled_drag", "Sled Drag", "carry", "quads glutes hamstrings", "calves upper_back", "sled", { m: SC, u: "distance", k: 1, alt: "sled_push walking_lunge", aka: "sled pull, backward sled drag, reverse sled drag" }),
  // ---------------------------------------------------------------- core
  ex("plank", "Plank", "core", "abs", "", "", { u: "time", alt: "dead_bug ab_wheel_rollout hollow_hold side_plank", aka: "front plank, forearm plank" }),
  ex("side_plank", "Side Plank", "core", "abs", "", "", { u: "time", alt: "suitcase_carry plank pallof_press" }),
  ex("copenhagen_plank", "Copenhagen Plank", "core", "adductors", "abs", "", { u: "time", k: 2, alt: "adductor_machine side_plank", aka: "copenhagen, copenhagen adductor" }),
  ex("ab_wheel_rollout", "Ab Wheel Rollout", "core", "abs", "lats", "ab_wheel", { u: "reps", k: 2, alt: "plank hollow_hold dead_bug", aka: "ab wheel, ab rollout, rollout, ab roller" }),
  ex("hanging_leg_raise", "Hanging Leg Raise", "core", "abs", "forearms", "pullup_bar", { u: "reps", k: 2, js: "grip", alt: "hanging_knee_raise toes_to_bar v_up", aka: "leg raise" }),
  ex("hanging_knee_raise", "Hanging Knee Raise", "core", "abs", "forearms", "pullup_bar", { m: SC, u: "reps", js: "grip", alt: "hanging_leg_raise sit_up lying_leg_raise", aka: "knee raise, hanging knee tuck, knee tuck" }),
  ex("toes_to_bar", "Toes-to-Bar", "core", "abs", "lats forearms", "pullup_bar", { m: C, k: 3, js: "grip kipping", alt: "knees_to_elbows hanging_knee_raise v_up ghd_sit_up", aka: "t2b, ttb" }),
  ex("knees_to_elbows", "Knees-to-Elbows", "core", "abs", "lats forearms", "pullup_bar", { m: C, k: 2, js: "grip kipping", alt: "toes_to_bar hanging_knee_raise", aka: "k2e" }),
  ex("cable_crunch", "Cable Crunch", "core", "abs", "", "cable_machine", { js: "spinal_flexion", alt: "crunch ab_wheel_rollout", aka: "kneeling cable crunch, rope crunch" }),
  ex("crunch", "Crunch", "core", "abs", "", "", { js: "spinal_flexion", alt: "cable_crunch dead_bug", aka: "ab crunch" }),
  ex("bicycle_crunch", "Bicycle Crunch", "core", "abs", "", "", { js: "spinal_flexion", alt: "crunch russian_twist" }),
  ex("sit_up", "Sit-Up", "core", "abs", "", "", { m: SC, js: "spinal_flexion", alt: "crunch v_up ghd_sit_up", aka: "situp, abmat sit up" }),
  ex("ghd_sit_up", "GHD Sit-Up", "core", "abs", "quads", "ghd", { m: C, k: 3, js: "spinal_flexion", alt: "sit_up v_up", aka: "ghd situp" }),
  ex("v_up", "V-Up", "core", "abs", "", "", { m: SC, k: 2, js: "spinal_flexion", alt: "sit_up hollow_rock", aka: "v sit" }),
  ex("lying_leg_raise", "Lying Leg Raise", "core", "abs", "", "", { alt: "hanging_knee_raise dead_bug", aka: "floor leg raise" }),
  ex("dead_bug", "Dead Bug", "core", "abs", "", "", { alt: "bird_dog plank", aka: "deadbug" }),
  ex("bird_dog", "Bird Dog", "core", "abs lower_back", "glutes", "", { alt: "dead_bug plank back_extension" }),
  ex("hollow_hold", "Hollow Hold", "core", "abs", "", "", { u: "time", k: 2, alt: "plank dead_bug hollow_rock", aka: "hollow body hold, hollow" }),
  ex("hollow_rock", "Hollow Rock", "core", "abs", "", "", { m: SC, k: 2, alt: "hollow_hold v_up" }),
  ex("pallof_press", "Pallof Press", "core", "abs", "", "/ cable_machine bands", { alt: "side_plank suitcase_carry dead_bug", aka: "band pallof press, anti rotation press" }),
  ex("russian_twist", "Russian Twist", "core", "abs", "", "", { js: "spinal_flexion", alt: "pallof_press cable_woodchop", aka: "med ball russian twist" }),
  ex("cable_woodchop", "Cable Woodchop", "core", "abs", "front_delts", "/ cable_machine bands", { alt: "pallof_press russian_twist landmine_rotation", aka: "woodchop, wood chop, cable wood chop" }),
  ex("landmine_rotation", "Landmine Rotation", "core", "abs", "front_delts", "landmine", { k: 2, alt: "cable_woodchop russian_twist", aka: "landmine twist, landmine rainbow" }),
  ex("l_sit", "L-Sit", "core", "abs", "triceps quads", "", { u: "time", k: 3, alt: "hollow_hold hanging_knee_raise", aka: "l sit hold, lsit" }),
  ex("mountain_climber", "Mountain Climber", "core", "abs", "front_delts quads", "", { m: C, js: "wrist_extension", alt: "plank burpee high_knees" }),
  ex("bear_crawl", "Bear Crawl", "core", "abs front_delts", "quads", "", { m: C, u: "distance", js: "wrist_extension", alt: "mountain_climber plank" }),
  ex("turkish_get_up", "Turkish Get-Up", "core", "abs front_delts", "glutes upper_back triceps", "kettlebell", { u: "load_reps", k: 4, js: "overhead", alt: "overhead_carry side_plank", aka: "tgu, get up, kettlebell get up" }),
  // ---------------------------------------------------------------- isolation
  ex("lateral_raise", "Dumbbell Lateral Raise", "isolation", "side_delts", "", "dumbbells", { alt: "cable_lateral_raise band_lateral_raise", aka: "lateral raise, side raise, db lateral raise, side lateral raise, lat raise" }),
  ex("cable_lateral_raise", "Cable Lateral Raise", "isolation", "side_delts", "", "cable_machine", { alt: "lateral_raise band_lateral_raise" }),
  ex("band_lateral_raise", "Band Lateral Raise", "isolation", "side_delts", "", "bands", { u: "reps", alt: "lateral_raise cable_lateral_raise" }),
  ex("front_raise", "Front Raise", "isolation", "front_delts", "", "/ dumbbells plates cable_machine", { alt: "lateral_raise dumbbell_shoulder_press", aka: "plate front raise, db front raise, dumbbell front raise" }),
  ex("upright_row", "Upright Row", "isolation", "side_delts upper_back", "biceps", "/ barbell dumbbells ez_bar cable_machine", { alt: "lateral_raise cable_lateral_raise", aka: "barbell upright row, cable upright row" }),
  ex("rear_delt_fly", "Rear Delt Fly", "isolation", "rear_delts", "upper_back", "dumbbells", { alt: "reverse_pec_deck face_pull band_pull_apart", aka: "reverse fly, bent over reverse fly, rear delt raise, db rear delt fly" }),
  ex("reverse_pec_deck", "Reverse Pec Deck", "isolation", "rear_delts", "upper_back", "pec_deck", { alt: "rear_delt_fly face_pull", aka: "reverse fly machine, rear delt machine" }),
  ex("face_pull", "Face Pull", "isolation", "rear_delts upper_back", "", "/ cable_machine bands", { alt: "rear_delt_fly band_pull_apart reverse_pec_deck", aka: "cable face pull, band face pull, rope face pull" }),
  ex("band_pull_apart", "Band Pull-Apart", "isolation", "rear_delts upper_back", "", "bands", { u: "reps", alt: "face_pull rear_delt_fly", aka: "pull apart" }),
  ex("external_rotation", "Cable External Rotation", "isolation", "rear_delts", "", "/ cable_machine bands dumbbells", { alt: "face_pull band_pull_apart", aka: "external rotation, band external rotation, rotator cuff external rotation" }),
  ex("shrug", "Shrug", "isolation", "upper_back", "", "/ barbell dumbbells trap_bar", { js: "grip", alt: "farmer_carry", aka: "barbell shrug, dumbbell shrug, db shrug, trap bar shrug" }),
  ex("dumbbell_fly", "Dumbbell Fly", "isolation", "chest", "", "dumbbells bench", { js: "shoulder_extension", alt: "cable_fly pec_deck", aka: "db fly, dumbbell flye, chest fly, flye" }),
  ex("cable_fly", "Cable Fly", "isolation", "chest", "", "cable_machine", { alt: "pec_deck dumbbell_fly", aka: "cable crossover, cable flye, cable chest fly" }),
  ex("pec_deck", "Pec Deck", "isolation", "chest", "", "pec_deck", { alt: "cable_fly dumbbell_fly", aka: "machine fly, pec fly, butterfly machine" }),
  ex("barbell_curl", "Barbell Curl", "isolation", "biceps", "forearms", "barbell", { js: "elbow", alt: "ez_bar_curl dumbbell_curl cable_curl", aka: "bb curl, straight bar curl, barbell bicep curl" }),
  ex("ez_bar_curl", "EZ-Bar Curl", "isolation", "biceps", "forearms", "ez_bar", { alt: "barbell_curl dumbbell_curl cable_curl", aka: "ez curl" }),
  ex("dumbbell_curl", "Dumbbell Curl", "isolation", "biceps", "forearms", "dumbbells", { alt: "hammer_curl cable_curl barbell_curl incline_dumbbell_curl band_curl", aka: "bicep curl, biceps curl, db curl, curl, dumbbell bicep curl, alternating curl" }),
  ex("hammer_curl", "Hammer Curl", "isolation", "biceps forearms", "", "dumbbells", { alt: "dumbbell_curl cable_curl", aka: "db hammer curl, rope hammer curl" }),
  ex("incline_dumbbell_curl", "Incline Dumbbell Curl", "isolation", "biceps", "", "dumbbells adjustable_bench", { alt: "dumbbell_curl cable_curl", aka: "incline curl, incline db curl" }),
  ex("preacher_curl", "Preacher Curl", "isolation", "biceps", "", "adjustable_bench / ez_bar dumbbells barbell", { js: "elbow", alt: "ez_bar_curl dumbbell_curl cable_curl", aka: "ez bar preacher curl, db preacher curl" }),
  ex("cable_curl", "Cable Curl", "isolation", "biceps", "forearms", "cable_machine", { alt: "dumbbell_curl ez_bar_curl", aka: "cable bicep curl" }),
  ex("band_curl", "Band Curl", "isolation", "biceps", "forearms", "bands", { u: "reps", alt: "dumbbell_curl cable_curl" }),
  ex("triceps_pushdown", "Triceps Pushdown", "isolation", "triceps", "", "cable_machine", { alt: "overhead_triceps_extension skull_crusher band_pushdown bench_dip", aka: "tricep pushdown, rope pushdown, cable pushdown, triceps rope pushdown" }),
  ex("overhead_triceps_extension", "Overhead Triceps Extension", "isolation", "triceps", "", "/ dumbbells cable_machine ez_bar kettlebell", { js: "overhead elbow", alt: "triceps_pushdown skull_crusher", aka: "overhead tricep extension, french press, db overhead extension, cable overhead extension" }),
  ex("skull_crusher", "Skull Crusher", "isolation", "triceps", "", "bench / ez_bar barbell dumbbells", { js: "elbow", alt: "overhead_triceps_extension triceps_pushdown close_grip_bench_press", aka: "skullcrusher, lying triceps extension" }),
  ex("dumbbell_kickback", "Dumbbell Kickback", "isolation", "triceps", "", "dumbbells", { alt: "triceps_pushdown overhead_triceps_extension", aka: "tricep kickback, triceps kickback" }),
  ex("band_pushdown", "Band Pushdown", "isolation", "triceps", "", "bands", { u: "reps", alt: "triceps_pushdown bench_dip" }),
  ex("leg_extension", "Leg Extension", "isolation", "quads", "", "leg_extension", { alt: "sissy_squat goblet_squat wall_sit", aka: "quad extension" }),
  ex("seated_leg_curl", "Seated Leg Curl", "isolation", "hamstrings", "", "leg_curl", { alt: "lying_leg_curl nordic_curl glute_ham_raise romanian_deadlift", aka: "leg curl, hamstring curl, seated hamstring curl" }),
  ex("lying_leg_curl", "Lying Leg Curl", "isolation", "hamstrings", "", "leg_curl", { alt: "seated_leg_curl nordic_curl", aka: "prone leg curl" }),
  ex("nordic_curl", "Nordic Hamstring Curl", "isolation", "hamstrings", "", "", { k: 3, alt: "seated_leg_curl glute_ham_raise romanian_deadlift", aka: "nordic curl, nordics, nordic hamstring" }),
  ex("glute_ham_raise", "Glute-Ham Raise", "isolation", "hamstrings", "glutes calves", "ghd", { k: 3, u: "reps", alt: "nordic_curl seated_leg_curl", aka: "ghr" }),
  ex("standing_calf_raise", "Standing Calf Raise", "isolation", "calves", "", "/ calf_machine smith_machine dumbbells", { js: "ankle_dorsiflexion", alt: "seated_calf_raise single_leg_calf_raise leg_press_calf_raise", aka: "calf raise, machine calf raise" }),
  ex("seated_calf_raise", "Seated Calf Raise", "isolation", "calves", "", "calf_machine", { js: "ankle_dorsiflexion", alt: "standing_calf_raise single_leg_calf_raise" }),
  ex("single_leg_calf_raise", "Single-Leg Calf Raise", "isolation", "calves", "", "", { u: "load_reps", js: "ankle_dorsiflexion", alt: "standing_calf_raise leg_press_calf_raise", aka: "single leg calf raise, calf raise off step, one leg calf raise" }),
  ex("leg_press_calf_raise", "Leg Press Calf Raise", "isolation", "calves", "", "leg_press", { js: "ankle_dorsiflexion", alt: "standing_calf_raise seated_calf_raise", aka: "calf press" }),
  ex("hip_abduction", "Hip Abduction Machine", "isolation", "glutes", "", "/ hip_ab_adductor cable_machine", { alt: "band_lateral_walk cable_kickback", aka: "hip abduction, abductor machine, seated abduction" }),
  ex("adductor_machine", "Hip Adduction Machine", "isolation", "adductors", "", "/ hip_ab_adductor cable_machine", { alt: "copenhagen_plank lateral_lunge", aka: "adductor machine, hip adduction, adductors" }),
  ex("band_lateral_walk", "Banded Lateral Walk", "isolation", "glutes", "", "bands", { u: "reps", alt: "hip_abduction", aka: "monster walk, lateral band walk, band walk, side step" }),
  ex("cable_kickback", "Cable Glute Kickback", "isolation", "glutes", "hamstrings", "cable_machine", { alt: "hip_thrust glute_bridge", aka: "glute kickback, cable kickback" }),
  ex("straight_arm_pulldown", "Straight-Arm Pulldown", "isolation", "lats", "", "/ cable_machine lat_pulldown", { alt: "dumbbell_pullover lat_pulldown", aka: "straight arm pulldown, lat prayer, cable pullover" }),
  ex("wrist_curl", "Wrist Curl", "isolation", "forearms", "", "/ dumbbells barbell", { alt: "dead_hang farmer_carry", aka: "forearm curl" }),
  ex("reverse_curl", "Reverse Curl", "isolation", "forearms biceps", "", "/ ez_bar barbell dumbbells", { js: "elbow", alt: "hammer_curl" }),
  ex("dead_hang", "Dead Hang", "isolation", "forearms", "lats", "pullup_bar", { u: "time", js: "grip", alt: "farmer_carry", aka: "bar hang" }),
  // ---------------------------------------------------------------- plyometrics / HIIT bodyweight
  ex("jump_squat", "Jump Squat", "plyo", "quads glutes", "calves", "", { m: SC, js: "impact", alt: "air_squat box_jump broad_jump", aka: "squat jump, jumping squat" }),
  ex("box_jump", "Box Jump", "plyo", "quads glutes", "calves", "plyo_box", { m: SC, js: "impact", alt: "jump_squat broad_jump step_up" }),
  ex("box_jump_over", "Box Jump-Over", "plyo", "quads glutes", "calves", "plyo_box", { m: C, js: "impact", alt: "box_jump dumbbell_box_step_over burpee", aka: "bjo" }),
  ex("burpee", "Burpee", "plyo", "quads chest", "glutes triceps front_delts abs", "", { m: C, k: 1, js: "impact wrist_extension", alt: "mountain_climber jump_squat push_up", aka: "chest to floor burpee" }),
  ex("step_back_burpee", "Step-Back Burpee", "plyo", "quads chest", "glutes triceps abs", "", { m: C, k: 1, js: "wrist_extension", alt: "burpee push_up mountain_climber", aka: "no jump burpee, step out burpee, scaled burpee" }),
  ex("burpee_broad_jump", "Burpee Broad Jump", "plyo", "quads glutes chest", "hamstrings calves triceps", "", { m: C, k: 2, js: "impact wrist_extension", alt: "burpee broad_jump", aka: "burpee long jump" }),
  ex("lateral_burpee_over_dumbbell", "Lateral Burpee Over Dumbbell", "plyo", "quads chest", "glutes triceps calves", "dumbbells", { m: C, k: 1, js: "impact wrist_extension", alt: "burpee bar_facing_burpee", aka: "burpee over dumbbell, burpee over db, lateral burpee" }),
  ex("burpee_box_jump_over", "Burpee Box Jump-Over", "plyo", "quads glutes chest", "calves triceps", "plyo_box", { m: C, js: "impact wrist_extension", alt: "burpee box_jump_over", aka: "bbjo" }),
  ex("bar_facing_burpee", "Bar-Facing Burpee", "plyo", "quads chest", "glutes triceps", "barbell", { m: C, k: 1, js: "impact wrist_extension", alt: "burpee", aka: "bfb, burpee over bar, burpee over the bar" }),
  ex("burpee_pull_up", "Burpee Pull-Up", "plyo", "lats quads chest", "biceps triceps", "pullup_bar", { m: C, js: "impact grip", alt: "burpee jumping_pull_up" }),
  ex("broad_jump", "Broad Jump", "plyo", "glutes quads", "hamstrings calves", "", { m: SC, js: "impact", alt: "box_jump jump_squat", aka: "standing long jump" }),
  ex("tuck_jump", "Tuck Jump", "plyo", "quads", "calves abs", "", { m: C, js: "impact", alt: "jump_squat box_jump" }),
  ex("jumping_lunge", "Jumping Lunge", "plyo", "quads glutes", "calves", "", { m: C, js: `impact ${KFD}`, alt: "reverse_lunge jump_squat", aka: "jump lunge, split jump" }),
  ex("lateral_bound", "Lateral Bound", "plyo", "glutes quads", "adductors calves", "", { m: SC, js: "impact", alt: "skater_squat broad_jump", aka: "skater jump, skaters" }),
  ex("jumping_jack", "Jumping Jack", "plyo", "calves", "side_delts quads", "", { m: C, k: 1, js: "impact", alt: "high_knees single_under", aka: "star jump" }),
  ex("high_knees", "High Knees", "plyo", "quads", "calves abs", "", { m: C, u: "time", k: 1, js: "impact", alt: "jumping_jack mountain_climber" }),
  ex("single_under", "Single-Under", "cardio", "calves", "quads front_delts forearms", "jump_rope", { m: C, js: "impact", alt: "jumping_jack double_under", aka: "single unders, jump rope, skipping, su, rope skipping" }),
  ex("double_under", "Double-Under", "cardio", "calves", "quads front_delts forearms", "jump_rope", { m: C, k: 3, js: "impact", alt: "single_under jumping_jack", aka: "du, dubs" }),
  ex("med_ball_slam", "Ball Slam", "plyo", "lats abs", "front_delts triceps glutes", "slam_ball", { m: C, k: 1, js: "spinal_flexion", alt: "kettlebell_swing burpee", aka: "slam ball, med ball slam, medicine ball slam, slams" }),
  ex("med_ball_clean", "Medicine Ball Clean", "olympic", "glutes quads", "upper_back", "/ medicine_ball slam_ball", { m: C, k: 2, js: KFD, alt: "wall_ball sandbag_clean kettlebell_swing", aka: "med ball clean, mb clean" }),
  ex("rotational_med_ball_throw", "Rotational Medicine Ball Throw", "plyo", "abs", "glutes front_delts", "medicine_ball", { m: SC, alt: "cable_woodchop russian_twist", aka: "med ball rotational throw, med ball side throw" }),
  ex("devil_press", "Devil Press", "olympic", "glutes hamstrings front_delts", "chest triceps upper_back quads", "dumbbells", { m: C, k: 3, js: "overhead hinge_loaded impact wrist_extension", alt: "dumbbell_snatch burpee dumbbell_thruster", aka: "devils press" }),
  ex("dumbbell_man_maker", "Dumbbell Man Maker", "olympic", "glutes quads front_delts chest", "triceps upper_back hamstrings abs", "dumbbells", { m: C, k: 3, js: "overhead hinge_loaded wrist_extension", alt: "devil_press dumbbell_thruster renegade_row", aka: "man maker, db man maker" }),
  ex("battle_rope", "Battle Rope Waves", "cardio", "front_delts", "forearms abs", "battle_rope", { m: C, u: "time", js: "grip", alt: "assault_bike_cal ski_cal", aka: "battle ropes, rope waves, battle rope slam" }),
  ex("shuttle_run", "Shuttle Run", "cardio", "quads hamstrings", "glutes calves", "", { m: C, u: "distance", js: "impact", alt: "sprint high_knees row_cal", aka: "shuttle sprint, suicides, beep test" }),
  ex("sprint", "Sprint", "cardio", "hamstrings glutes", "quads calves", "/ outdoor_route track treadmill", { m: C, u: "distance", k: 2, js: "impact", alt: "hill_sprint assault_bike_cal row_cal shuttle_run", aka: "sprint interval, 100m sprint, 200m sprint" }),
  ex("hill_sprint", "Hill Sprint", "cardio", "glutes hamstrings", "quads calves", "outdoor_route", { m: C, u: "distance", k: 2, js: "impact", alt: "sprint sled_push", aka: "hill repeat" }),
  // ---------------------------------------------------------------- olympic lifting + implements
  ex("power_clean", "Power Clean", "olympic", "glutes hamstrings quads", "upper_back lower_back", "barbell", { m: SC, js: "wrist_extension hinge_loaded grip", alt: "hang_power_clean dumbbell_hang_clean kettlebell_clean", aka: "barbell power clean" }),
  ex("hang_power_clean", "Hang Power Clean", "olympic", "glutes hamstrings", "upper_back quads", "barbell", { m: SC, k: 3, js: "wrist_extension grip", alt: "power_clean dumbbell_hang_clean kettlebell_clean", aka: "hpc, hang clean" }),
  ex("squat_clean", "Squat Clean", "olympic", "quads glutes hamstrings", "upper_back lower_back", "barbell", { m: SC, k: 5, js: `${KFD} wrist_extension hinge_loaded`, alt: "power_clean front_squat", aka: "clean, full clean" }),
  ex("hang_squat_clean", "Hang Squat Clean", "olympic", "quads glutes", "upper_back hamstrings", "barbell", { m: SC, js: `${KFD} wrist_extension`, alt: "hang_power_clean squat_clean" }),
  ex("power_snatch", "Power Snatch", "olympic", "glutes hamstrings upper_back", "quads side_delts lower_back", "barbell", { m: SC, k: 5, js: "overhead wrist_extension hinge_loaded", alt: "hang_power_snatch dumbbell_snatch kettlebell_snatch" }),
  ex("hang_power_snatch", "Hang Power Snatch", "olympic", "glutes hamstrings upper_back", "side_delts quads", "barbell", { m: SC, js: "overhead wrist_extension", alt: "power_snatch dumbbell_snatch", aka: "hang snatch, hps" }),
  ex("squat_snatch", "Squat Snatch", "olympic", "quads glutes upper_back", "hamstrings side_delts abs", "barbell", { m: SC, k: 5, js: `overhead ${KFD} wrist_extension`, alt: "power_snatch overhead_squat", aka: "snatch, full snatch" }),
  ex("clean_and_jerk", "Clean and Jerk", "olympic", "quads glutes front_delts", "hamstrings upper_back triceps", "barbell", { m: SC, k: 5, js: `overhead wrist_extension ${KFD}`, alt: "power_clean push_jerk dumbbell_clean_and_jerk", aka: "c&j, cj, clean & jerk, ground to overhead, gto" }),
  ex("push_jerk", "Push Jerk", "olympic", "front_delts triceps", "quads glutes", "barbell squat_rack", { m: SC, js: "overhead spinal_axial", alt: "push_press split_jerk", aka: "jerk" }),
  ex("split_jerk", "Split Jerk", "olympic", "front_delts triceps", "quads glutes", "barbell squat_rack", { m: SC, k: 5, js: "overhead spinal_axial", alt: "push_jerk push_press" }),
  ex("cluster", "Cluster", "olympic", "quads glutes front_delts", "hamstrings triceps upper_back", "barbell", { m: C, k: 5, js: `overhead ${KFD} wrist_extension`, alt: "thruster squat_clean", aka: "squat clean thruster" }),
  ex("dumbbell_snatch", "Dumbbell Snatch", "olympic", "glutes hamstrings", "front_delts side_delts upper_back", "dumbbells", { m: SC, k: 2, js: "overhead", alt: "kettlebell_snatch power_snatch american_kettlebell_swing", aka: "db snatch, alternating dumbbell snatch, single arm db snatch" }),
  ex("dumbbell_hang_clean", "Dumbbell Hang Clean", "olympic", "glutes hamstrings", "upper_back quads biceps", "dumbbells", { m: SC, k: 2, alt: "hang_power_clean kettlebell_clean", aka: "db hang clean, db power clean, dumbbell power clean" }),
  ex("dumbbell_clean_and_jerk", "Dumbbell Clean and Jerk", "olympic", "glutes quads front_delts", "hamstrings triceps", "dumbbells", { m: C, k: 3, js: "overhead", alt: "clean_and_jerk dumbbell_hang_clean dumbbell_push_press", aka: "db clean and jerk, db c&j, dumbbell ground to overhead" }),
  ex("kettlebell_snatch", "Kettlebell Snatch", "olympic", "glutes hamstrings", "front_delts upper_back", "kettlebell", { m: SC, k: 3, js: "overhead grip", alt: "dumbbell_snatch american_kettlebell_swing", aka: "kb snatch" }),
  ex("kettlebell_clean", "Kettlebell Clean", "olympic", "glutes hamstrings", "upper_back biceps", "kettlebell", { m: SC, k: 2, alt: "dumbbell_hang_clean kettlebell_swing", aka: "kb clean" }),
  ex("kettlebell_clean_and_press", "Kettlebell Clean and Press", "olympic", "glutes front_delts", "hamstrings triceps", "kettlebell", { m: SC, k: 2, js: "overhead", alt: "dumbbell_clean_and_jerk kettlebell_press", aka: "kb clean and press" }),
  ex("sandbag_clean", "Sandbag Clean", "olympic", "glutes hamstrings", "upper_back quads biceps", "sandbag", { m: C, k: 2, js: "hinge_loaded", alt: "sandbag_over_shoulder power_clean kettlebell_clean" }),
  // ---------------------------------------------------------------- gymnastics
  ex("handstand_walk", "Handstand Walk", "gymnastics", "front_delts", "triceps abs upper_back", "", { m: C, u: "distance", k: 5, js: "overhead wrist_extension", alt: "wall_walk bear_crawl handstand_hold", aka: "handstand walking, hs walk" }),
  ex("handstand_hold", "Handstand Hold", "gymnastics", "front_delts", "triceps abs", "", { u: "time", k: 3, js: "overhead wrist_extension", alt: "pike_push_up wall_walk", aka: "wall handstand, handstand" }),
  ex("wall_walk", "Wall Walk", "gymnastics", "front_delts", "triceps abs upper_back", "", { m: C, k: 3, js: "overhead wrist_extension", alt: "handstand_hold pike_push_up bear_crawl", aka: "wall climb" }),
  // ---------------------------------------------------------------- cardio: running + machines
  ex("run", "Run", "cardio", "quads hamstrings calves", "glutes", "/ outdoor_route track treadmill", { m: CARDIO, js: "impact", alt: "treadmill_run bike_erg rower elliptical", aka: "running, jog, jogging, easy run, outdoor run, road run" }),
  ex("treadmill_run", "Treadmill Run", "cardio", "quads hamstrings calves", "glutes", "treadmill", { m: CARDIO, js: "impact", alt: "run incline_walk elliptical", aka: "treadmill, treadmill running" }),
  ex("incline_walk", "Incline Treadmill Walk", "cardio", "calves glutes", "hamstrings quads", "treadmill", { m: CARDIO, u: "time", alt: "walk stair_climber", aka: "incline walk, treadmill walk" }),
  ex("walk", "Walk", "cardio", "calves", "quads glutes", "", { m: CARDIO, alt: "incline_walk bike_erg", aka: "walking, brisk walk, hike, hiking" }),
  ex("rower", "Rowing Machine", "cardio", "upper_back lats quads", "hamstrings glutes biceps", "rower", { m: CARDIO, k: 2, alt: "ski_erg bike_erg assault_bike", aka: "row, rowing, rower, erg, row erg, concept 2 row, indoor rowing, row meters" }),
  ex("row_cal", "Row (calories)", "cardio", "upper_back lats quads", "hamstrings glutes", "rower", { m: C, u: "calories", k: 2, alt: "ski_cal assault_bike_cal bike_cal", aka: "row calories, calorie row, cal row, row for calories" }),
  ex("ski_erg", "SkiErg", "cardio", "lats triceps", "abs upper_back", "ski_erg", { m: CARDIO, k: 2, alt: "rower assault_bike", aka: "ski erg, ski, skiing, ski meters" }),
  ex("ski_cal", "Ski (calories)", "cardio", "lats triceps", "abs", "ski_erg", { m: C, u: "calories", k: 2, alt: "row_cal assault_bike_cal", aka: "ski calories, calorie ski, cal ski, ski erg calories" }),
  ex("assault_bike", "Air Bike", "cardio", "quads", "front_delts hamstrings glutes", "assault_bike", { m: CARDIO, u: "time", alt: "bike_erg rower ski_erg", aka: "assault bike, echo bike, airdyne, fan bike" }),
  ex("assault_bike_cal", "Air Bike (calories)", "cardio", "quads", "front_delts hamstrings glutes", "assault_bike", { m: C, u: "calories", alt: "bike_cal row_cal ski_cal", aka: "assault bike calories, assault bike cal, echo bike calories, echo bike cal, air bike cal" }),
  ex("bike_erg", "Stationary Bike", "cardio", "quads", "glutes hamstrings calves", "/ bike assault_bike", { m: CARDIO, u: "time", alt: "assault_bike rower elliptical", aka: "bike, cycling, spin bike, exercise bike, bike erg, indoor cycling, spin" }),
  ex("bike_cal", "Bike (calories)", "cardio", "quads", "glutes hamstrings", "/ bike assault_bike", { m: C, u: "calories", alt: "assault_bike_cal row_cal", aka: "bike calories, calorie bike, cal bike" }),
  ex("stair_climber", "Stair Climber", "cardio", "quads glutes", "calves", "stair_climber", { m: CARDIO, u: "time", alt: "incline_walk step_up", aka: "stairmaster, stair machine, stepmill" }),
  ex("elliptical", "Elliptical", "cardio", "quads glutes", "hamstrings", "elliptical", { m: CARDIO, u: "time", alt: "bike_erg run", aka: "cross trainer, elliptical trainer" }),
  ex("swim", "Swim", "cardio", "lats", "front_delts triceps upper_back", "pool", { m: CARDIO, k: 2, alt: "rower", aka: "swimming, laps" }),
]);

// ------------------------------------------------------------------ name normalization
const PHRASES = { // raw tokens checked before singularizing
  kbs: "kettlebell swing", dus: "double under", dubs: "double under", sus: "single under", wbs: "wall ball",
  cals: "calorie", calories: "calorie", bss: "bulgarian split squat", lbs: "",
};
const ABBREV = {
  db: "dumbbell", dumbell: "dumbbell", kb: "kettlebell", bb: "barbell", cal: "calorie",
  hspu: "handstand push up", t2b: "toe to bar", ttb: "toe to bar", c2b: "chest to bar", ctb: "chest to bar",
  k2e: "knee to elbow", du: "double under", su: "single under", wb: "wall ball", sdhp: "sumo deadlift high pull",
  ohs: "overhead squat", ohp: "overhead press", rdl: "romanian deadlift", sldl: "stiff leg deadlift",
  rfess: "rear foot elevated split squat", tgu: "turkish get up", hpc: "hang power clean", cj: "clean and jerk",
  bmu: "bar muscle up", rmu: "ring muscle up", bfb: "bar facing burpee", bbjo: "burpee box jump over",
  bjo: "box jump over", ghr: "glute ham raise", hrpu: "hand release push up", cgbp: "close grip bench press",
  ssb: "safety squat bar", dl: "deadlift", hs: "handstand", flye: "fly", bw: "bodyweight",
};
const SPLIT = {
  pullup: "pull up", chinup: "chin up", pushup: "push up", situp: "sit up", stepup: "step up", muscleup: "muscle up",
  getup: "get up", pulldown: "pull down", pushdown: "push down", pullover: "pull over", deadbug: "dead bug",
  skullcrusher: "skull crusher", wallball: "wall ball", skierg: "ski erg", bikeerg: "bike erg", lsit: "l sit",
  vup: "v up", rollout: "roll out", pullthrough: "pull through",
};
const JOIN = { "dead lift": "deadlift", "dumb bell": "dumbbell", "kettle bell": "kettlebell", "bar bell": "barbell" };
const STOP = new Set(["and", "the", "a", "an", "of", "with", "to", "on", "for", "in", "x", "kg", "lb", "km", "min", "sec"]);

function singular(t) {
  if (t === "calves") return "calf";
  if (t.length <= 2) return t;
  if (/(ss|us|is)$/.test(t)) return t;
  if (/(sses|ches|shes|xes)$/.test(t)) return t.slice(0, -2);
  if (t.endsWith("ies") && t.length > 4) return t.slice(0, -3) + "y";
  if (t.endsWith("s")) return t.slice(0, -1);
  return t;
}

/**
 * Normalize an exercise name into comparable tokens: lowercase, punctuation stripped, plurals singularized,
 * gym abbreviations expanded (DB/KB/BB, RDL, T2B, DU, HSPU, ...), compound words split ("pullups" → pull up),
 * stopwords and quantities ("500m", "3") dropped.
 * @param {string} s
 * @returns {string[]}
 */
export function normalizeName(s) {
  let str = String(s ?? "").toLowerCase()
    .replace(/\bc\s*&\s*j\b/g, " clean and jerk ")
    .replace(/&/g, " and ")
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, " ");
  for (const [k, v] of Object.entries(JOIN)) str = str.replace(new RegExp(`\\b${k}\\b`, "g"), v);
  const out = [];
  for (const raw of str.split(" ")) {
    if (!raw) continue;
    if (/^\d+(\.\d+)?[a-z]{0,3}$/.test(raw) && !/^(c2b|t2b|k2e)$/.test(raw)) continue; // quantities: 3, 500m, 20cal
    let expanded = raw in PHRASES ? PHRASES[raw] : null;
    if (expanded === null) {
      const t = singular(raw);
      expanded = ABBREV[t] ?? ABBREV[raw] ?? SPLIT[t] ?? t;
    }
    for (const tok of expanded.split(" ")) {
      if (!tok) continue;
      const t2 = SPLIT[tok] ?? tok;
      for (const w of t2.split(" ")) if (w && !STOP.has(w)) out.push(w);
    }
  }
  return out;
}

// ------------------------------------------------------------------ index + scoring
const BY_ID = new Map(EXERCISES.map((e, i) => [e.id, { e, i }]));
const INDEX = EXERCISES.map((e, i) => {
  const keys = [e.name, e.id.replace(/_/g, " "), ...e.aliases].map((k) => normalizeName(k)).filter((k) => k.length);
  return { e, i, keys };
});
const EXACT = new Map();
for (const { e, keys } of INDEX) for (const k of keys) { const s = k.join(" "); if (!EXACT.has(s)) EXACT.set(s, e); }

function osa(a, b) { // optimal string alignment distance (Levenshtein + transpositions)
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
    }
  }
  return d[a.length][b.length];
}
function tokenSim(a, b) {
  if (a === b) return 1;
  if (a.length >= 3 && b.startsWith(a)) return 0.85;
  if (b.length >= 4 && a.startsWith(b)) return 0.8;
  if (a.length >= 5 && b.length >= 5 && Math.abs(a.length - b.length) <= 1 && osa(a, b) <= 1) return 0.75;
  return 0;
}
function scoreTokens(q, k) {
  if (!q.length || !k.length) return 0;
  if (q.join(" ") === k.join(" ")) return 100;
  if (q.join("") === k.join("")) return 97;
  if ([...q].sort().join(" ") === [...k].sort().join(" ")) return 95;
  let qs = 0, ks = 0;
  for (const t of q) qs += Math.max(...k.map((u) => tokenSim(t, u)));
  for (const u of k) ks += Math.max(...q.map((t) => tokenSim(t, u)));
  const qc = qs / q.length, kc = ks / k.length;
  return qc ? 85 * qc * (0.55 + 0.45 * kc) : 0;
}
function scoreExercise(qTokens, entry) {
  let best = 0;
  for (const k of entry.keys) best = Math.max(best, scoreTokens(qTokens, k));
  return best;
}

const MUSCLE_WORDS = (() => {
  const m = new Map(MUSCLES.map((id) => [normalizeName(id.replace(/_/g, " ")).join(" "), [id]]));
  const syn = { shoulder: ["front_delts", "side_delts", "rear_delts"], delt: ["front_delts", "side_delts", "rear_delts"],
    back: ["upper_back", "lats", "lower_back"], leg: ["quads", "hamstrings", "glutes", "calves"], arm: ["biceps", "triceps", "forearms"],
    core: ["abs"], trap: ["upper_back"], pec: ["chest"], ham: ["hamstrings"], oblique: ["abs"], butt: ["glutes"], grip: ["forearms"] };
  for (const [k, v] of Object.entries(syn)) m.set(k, v);
  return m;
})();

// ------------------------------------------------------------------ equipment helpers
function toSet(equipment) {
  if (equipment instanceof Set) return equipment;
  return new Set(Array.isArray(equipment) ? equipment : []);
}

/**
 * Expand a list/Set of equipment ids with implied equipment (EQUIPMENT_IMPLIES).
 * @param {Iterable<string>|null|undefined} items
 * @returns {Set<string>}
 */
export function expandEquipment(items) {
  const out = new Set(items || []);
  for (const id of [...out]) for (const extra of EQUIPMENT_IMPLIES[id] || []) out.add(extra);
  return out;
}

/**
 * Which equipment an exercise still needs, given what is available (implications applied).
 * @param {object} exercise  Exercise
 * @param {Set<string>|string[]} equipment
 * @returns {{ ok: boolean, missing: string[], anyOf: string[] }} missing = required ids absent (plus the "any" group
 *   when none of it is available); anyOf = that unmet "any" group, else [].
 */
export function equipmentCheck(exercise, equipment) {
  const have = expandEquipment(toSet(equipment));
  const missing = exercise.equipment.all.filter((id) => !have.has(id));
  const any = exercise.equipment.any;
  const anyOf = any.length && !any.some((id) => have.has(id)) ? [...any] : [];
  return { ok: !missing.length && !anyOf.length, missing: [...missing, ...anyOf], anyOf };
}

// ------------------------------------------------------------------ public lookups
/**
 * Exercise by exact id.
 * @param {string} id
 * @returns {object|null} Exercise
 */
export function getExercise(id) {
  return BY_ID.get(id)?.e ?? null;
}

/**
 * Fuzzy lookup by id or free-text name. Handles case, plurals, hyphens, word order, DB/KB/BB and common
 * CrossFit abbreviations ("db bench", "pullups", "row cal", "bulgarian split squats", "T2B", "DUs").
 * @param {string} nameOrId
 * @param {{ modality?: string }} [opts] prefer exercises with this modality (e.g. "strength" when logging sets)
 * @returns {object|null} Exercise, or null when nothing matches well enough
 */
export function findExercise(nameOrId, opts = {}) {
  if (nameOrId == null) return null;
  const raw = String(nameOrId).trim();
  if (!raw) return null;
  const direct = getExercise(raw) || getExercise(raw.toLowerCase().replace(/[\s-]+/g, "_"));
  if (direct) return direct;
  const q = normalizeName(raw);
  if (!q.length) return null;
  const pref = opts.modality;
  const exact = EXACT.get(q.join(" "));
  if (exact && (!pref || exact.modality.includes(pref))) return exact;
  let best = null, bestScore = 0;
  for (const entry of INDEX) {
    let s = scoreExercise(q, entry);
    if (pref && !entry.e.modality.includes(pref)) s *= 0.6;
    if (s > bestScore) { best = entry.e; bestScore = s; }
  }
  if (exact && bestScore < 60) return exact;
  return bestScore >= 55 ? best : null;
}

/**
 * Ranked search for pickers. Empty query lists everything (catalog order). Also matches muscle words
 * ("chest", "back", "legs").
 * @param {string} query
 * @param {{ equipment?: Set<string>|string[]|null, modality?: string|string[]|null, limit?: number }} [opts]
 *   equipment: only exercises doable with it (implications applied); modality: keep exercises having any of these;
 *   limit: max results (0 or Infinity = all)
 * @returns {object[]} Exercises, best first
 */
export function searchExercises(query, { equipment = null, modality = null, limit = 20 } = {}) {
  const q = normalizeName(query);
  const mods = modality == null ? null : (Array.isArray(modality) ? modality : [modality]);
  const muscles = MUSCLE_WORDS.get(q.join(" "));
  const results = [];
  for (const entry of INDEX) {
    const e = entry.e;
    if (mods && !e.modality.some((m) => mods.includes(m))) continue;
    if (equipment && !equipmentCheck(e, equipment).ok) continue;
    let s = q.length ? scoreExercise(q, entry) : 1;
    if (muscles) {
      if (e.primary.some((m) => muscles.includes(m))) s = Math.max(s, 70);
      else if (e.secondary.some((m) => muscles.includes(m))) s = Math.max(s, 40);
    }
    if (s >= 25 || !q.length) results.push({ e, s, i: entry.i });
  }
  results.sort((a, b) => b.s - a.s || a.i - b.i);
  const n = !limit || limit === Infinity ? results.length : limit;
  return results.slice(0, n).map((r) => r.e);
}

function deepFreeze(o) {
  if (o && typeof o === "object" && !Object.isFrozen(o)) {
    Object.freeze(o);
    for (const v of Object.values(o)) deepFreeze(v);
  }
  return o;
}
