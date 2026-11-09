// Synthetic owner-like fixture for plan-generation tests (no real person's data): an intermediate hybrid
// athlete training 5 days/week, 75 min, a home gym with 16 equipment ids plus an empty "Gym" location, all three
// modalities, no logged sessions yet, and an agreed 5-workout calibration plan written in the verbose style a
// first plan tends to have (long notes, every null field present). Shape matches the live failure of 2026-11-09.

export const TODAY = "2026-11-09"; // a Monday

export const PROFILE = {
  version: 1, onboarded: true, name: "Alex", age: 34, sex: "male", heightCm: 180, weightKg: 78,
  screening: {
    answers: { heartCondition: false, chestPain: false, dizziness: false, chronicCondition: false, medications: false, boneJoint: false, supervisedOnly: false },
    pregnant: false, notes: "All screening answers no. No current pain.", outcome: "cleared", screenedAt: "2026-11-05",
  },
  injuries: [],
  goals: {
    primary: "Strength combined with endurance", secondary: ["Run easier at the same heart rate"], why: "Feel fit", success12w: "Lift more and run easier",
    targetDate: null, modalities: { strength: true, running: true, conditioning: true }, event: null,
  },
  schedule: { daysPerWeek: 5, minutesPerSession: 75, preferredDays: [], notes: "5 sessions a week including at least 1 run. 60-90 min per session." },
  equipment: {
    defaultLocationId: "home",
    locations: [
      { id: "gym", name: "Gym", items: [], dumbbellMaxKg: null, kettlebellsKg: [], notes: "" },
      {
        id: "home", name: "Home gym", dumbbellMaxKg: 30, kettlebellsKg: [20], notes: "Runs outdoors. DBs 2.5-30 kg. HR watch.",
        items: ["dumbbells", "kettlebell", "barbell", "plates", "squat_rack", "bench", "adjustable_bench", "dip_bars", "pullup_bar", "parallettes",
          "rower", "bike", "landmine", "jump_rope", "wall_ball", "outdoor_route"],
      },
    ],
  },
  experience: {
    level: "intermediate", trainingAgeYears: 6,
    running: { currentWeeklyKm: null, longestRecentRunKm: 5, recentRace: null, easyPaceSecPerKm: 370 },
    conditioning: { experience: "regular", notes: "Years of CrossFit-style classes. No double unders yet." },
    knownLifts: [{ exerciseId: "bench_press", loadKg: 85, reps: 5 }, { exerciseId: "back_squat", loadKg: 105, reps: 5 }],
  },
  preferences: { likes: [], dislikes: [], tone: "direct", logging: "standard" },
  updatedAt: "2026-11-05T19:00:00.000Z",
};

export const STATE = {
  schemaVersion: 1, settings: { theme: "system", chatTier: "default" },
  rotation: { planId: "2026-11-01", done: [] }, onboarding: { status: "done" }, pendingPlanRequest: null,
};

const CUE = "Calibration: work up to a weight that leaves about 3 reps in reserve; err light on the first sets.";
const si = (exerciseId, name, sets, reps, restSec, extra = {}) => ({
  exerciseId, name, sets, reps, targetRir: 3, loadKg: null, restSec, progression: "double", incrementKg: 2.5, tempo: null,
  notes: CUE, alternatives: [], supersetGroup: null, ...extra,
});
const ci = (exerciseId, name, extra = {}) => ({ exerciseId, name, reps: null, calories: null, distanceM: null, durationSec: null, loadKg: null, notes: "", ...extra });
const warm = (minutes, ...items) => ({ kind: "warmup", minutes, items: items.map(([name, detail]) => ({ name, detail })) });

/** The agreed plan for the week before the one being generated (stored shape, every field present). */
export const AGREED = {
  id: "2026-11-01", status: "agreed", weekStart: "2026-11-01", createdAt: "2026-11-05T19:10:00.000Z", approvedAt: "2026-11-05T19:20:00.000Z",
  focus: "Week 1 calibration: find loads at RIR 3, one easy run, moderate metcons",
  rationale: "No history yet, so this week calibrates loads at about 3 RIR. One easy 3 km run starts the run base under the app's cap.",
  workouts: [
    { id: "W1", title: "Full body A (squat focus)", type: "strength", locationId: "home", estMinutes: 60,
      intent: "Calibrate squat, bench, row and RDL loads at RIR 3. This is the week's first hard day, followed by an easy day.",
      blocks: [
        warm(10, ["Rower", "4 min easy"], ["Leg swings", "10 per side, both directions"], ["Goblet squat hold", "3 x 20 s deep squat pry"]),
        { kind: "strength", items: [
          si("back_squat", "Back squat", 3, "5", 180, { progression: "rpe", alternatives: ["front_squat", "box_squat"] }),
          si("bench_press", "Bench press", 3, "5", 180, { progression: "rpe", alternatives: ["dumbbell_bench_press", "floor_press"] }),
          si("chest_supported_row", "Chest-supported dumbbell row", 3, "8-12", 120, { alternatives: ["dumbbell_row", "barbell_row"] }),
          si("romanian_deadlift", "Romanian deadlift", 3, "8", 150, { tempo: "3010", alternatives: ["dumbbell_romanian_deadlift"] }),
          si("nordic_curl", "Nordic hamstring curl", 2, "3-5", 120, { tempo: "4010", alternatives: ["single_leg_rdl"], notes: "Anchor your heels under a loaded barbell in the rack; lower slowly." }),
          si("plank", "Plank", 2, "30-45", 60, { targetRir: 2, progression: "none", incrementKg: null, alternatives: ["dead_bug", "hollow_hold"], notes: "Reps are seconds." }),
        ] },
      ] },
    { id: "W2", title: "Easy run 3 km + skill", type: "hybrid", locationId: "home", estMinutes: 45,
      intent: "An easy aerobic day after the heavy W1. It starts the run base under the app's 3 km cap and adds rope practice.",
      blocks: [
        warm(5, ["Brisk walk", "3 min"], ["Drills", "A-skips, high knees, butt kicks"]),
        { kind: "run", runType: "easy", warmupMin: 0, cooldownMin: 0, totalKm: 3, segments: [
          { reps: 1, distanceM: 3000, durationSec: null, target: { paceSecPerKm: [370, 400], hrZone: 2, rpe: 3 }, recoverySec: null, recoveryType: null },
        ], notes: "Keep your watch in zone 2 at a full-sentence talk pace. Easy pace is a ceiling." },
        { kind: "conditioning", format: "EMOM", minutes: 10, rounds: null, timeCapMin: null, workSec: null, restSec: null,
          items: [ci("single_under", "Single-under", { reps: 20 }), ci("double_under", "Double-under attempts", { reps: 5 })], targetRpe: 4,
          scaling: "If every double-under attempt fails, swap them for 5 power jumps.", notes: "Skill practice, not a workout: stay fresh." },
        { kind: "strength", items: [si("dead_bug", "Dead bug", 3, "8-10", 45, { targetRir: 2, progression: "none", incrementKg: null, alternatives: ["bird_dog", "hollow_hold"], notes: "Reps are per side." })] },
        { kind: "cooldown", minutes: 5, items: [{ name: "Calf stretch", detail: "2 x 30 s per side" }, { name: "Hip flexor stretch", detail: "2 x 30 s per side" }] },
      ] },
    { id: "W3", title: "Upper + 12-min AMRAP", type: "hybrid", locationId: "home", estMinutes: 60,
      intent: "Calibrate overhead press and pull-up loads, then a lower-body and cyclical AMRAP that avoids pressing and pulling.",
      blocks: [
        warm(10, ["Bike", "4 min easy"], ["Arm circles and band dislocates", "10 each"], ["Scap pull-ups", "2 x 8"]),
        { kind: "strength", items: [
          si("overhead_press", "Overhead press", 3, "6-8", 90, { progression: "rpe", supersetGroup: "A", alternatives: ["dumbbell_shoulder_press", "landmine_press"] }),
          si("pull_up", "Pull-up", 3, "5-8", 90, { incrementKg: null, supersetGroup: "A", alternatives: ["chin_up", "negative_pull_up"], notes: "Strict reps with a full hang at the bottom." }),
          si("incline_dumbbell_press", "Incline dumbbell press", 3, "8-12", 75, { supersetGroup: "B", alternatives: ["incline_bench_press", "dumbbell_bench_press"] }),
          si("dumbbell_row", "One-arm dumbbell row", 3, "8-12", 75, { supersetGroup: "B", alternatives: ["chest_supported_row"] }),
          si("lateral_raise", "Dumbbell lateral raise", 2, "12-15", 60, { targetRir: 2, alternatives: ["upright_row"], notes: "Light and controlled; no swinging." }),
          si("dumbbell_curl", "Dumbbell curl", 2, "10-15", 60, { targetRir: 2, alternatives: ["hammer_curl"], notes: "Short on time: do A1/A2 and the AMRAP only." }),
        ] },
        { kind: "conditioning", format: "AMRAP", minutes: 12, rounds: null, timeCapMin: null, workSec: null, restSec: null,
          items: [ci("bike_cal", "Bike calories", { calories: 12 }), ci("air_squat", "Air squat", { reps: 15 }), ci("sit_up", "Sit-up", { reps: 10 })], targetRpe: 7,
          scaling: "Bike 9 calories, 10 air squats, 8 sit-ups per round; or keep the reps and accept fewer rounds.", notes: "Hard but steady: same pace every round." },
      ] },
    { id: "W4", title: "Full body B (hinge focus)", type: "strength", locationId: "home", estMinutes: 55,
      intent: "Calibrate deadlift and single-leg loads and give chest and back their second exposure of the week.",
      blocks: [
        warm(10, ["Rower", "4 min easy"], ["Cat-camel and hip hinge drill", "10 each"], ["Walking lunges", "10 bodyweight"]),
        { kind: "strength", items: [
          si("deadlift", "Deadlift", 3, "5", 180, { progression: "rpe", alternatives: ["sumo_deadlift", "rack_pull"] }),
          si("bulgarian_split_squat", "Bulgarian split squat", 3, "8-10", 90, { alternatives: ["split_squat", "reverse_lunge"], notes: "Reps are per leg; start with light dumbbells." }),
          si("dumbbell_bench_press", "Dumbbell bench press", 3, "8-12", 75, { tempo: "3010", supersetGroup: "A", alternatives: ["floor_press"] }),
          si("chin_up", "Chin-up", 3, "6-10", 75, { incrementKg: null, supersetGroup: "A", alternatives: ["pull_up"], notes: "Strict reps with a full hang at the bottom." }),
          si("farmer_carry", "Farmer's carry", 3, "1", 60, { targetRir: null, progression: "none", incrementKg: null, alternatives: ["suitcase_carry"], notes: "About 40 m per carry with heavy dumbbells. Walk tall." }),
          si("hanging_leg_raise", "Hanging leg raise", 2, "8-12", 60, { targetRir: 2, incrementKg: null, alternatives: ["hanging_knee_raise"], notes: "Controlled, no kip." }),
        ] },
      ] },
    { id: "W5", title: "Row/bike intervals + zone 2", type: "conditioning", locationId: "home", estMinutes: 60,
      intent: "Moderate aerobic intervals plus a zone 2 block for a lower heart rate at a given pace, kept moderate for W1.",
      blocks: [
        warm(8, ["Rower", "4 min easy"], ["Bike", "2 min easy"], ["Build-ups", "2 x 20 s at interval effort"]),
        { kind: "conditioning", format: "INTERVALS", minutes: 25, rounds: 5, timeCapMin: null, workSec: 180, restSec: 120,
          items: [ci("rower", "Rower", { durationSec: 180 }), ci("bike_erg", "Bike", { durationSec: 180 })], targetRpe: 7,
          scaling: "Cut to 4 rounds, or shorten the work to 2 min, keeping the RPE at 7.", notes: "Aerobic power: strong but repeatable efforts." },
        { kind: "conditioning", format: "INTERVALS", minutes: 20, rounds: 1, timeCapMin: null, workSec: 1200, restSec: null,
          items: [ci("bike_erg", "Bike", { durationSec: 1200 })], targetRpe: 4,
          scaling: "Cut to 15 min if you are short on time.", notes: "Zone 2: nasal breathing, full sentences." },
        { kind: "cooldown", minutes: 5, items: [{ name: "Hip flexor stretch", detail: "2 x 30 s per side" }, { name: "Thoracic opener", detail: "2 x 30 s" }] },
      ] },
  ],
  weeklyTargets: { runKm: 3, conditioningSessions: 3, strengthSetsPerMuscle: {} },
  notes: ["Calibration week: log the load you reach on every lift so next week can progress from it."],
  validation: null,
};
