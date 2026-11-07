// Chat tool definitions as Claude sees them: name, description, JSON Schema (owner: Agent B).
// The `execute` implementations live in brain.js; this file is static data so it stays reviewable.

const NUM = { type: "number" };
const NUM_OR_NULL = { type: ["number", "null"] };
const STR = { type: "string" };
const DATE = { type: "string", description: "YYYY-MM-DD" };
const SESSION_TYPES = ["strength", "run", "conditioning", "hybrid", "mobility", "other"];
const RUN_TYPES = ["easy", "long", "tempo", "threshold", "intervals", "hills", "fartlek", "recovery", "strides", "race"];
const COND_FORMATS = ["AMRAP", "EMOM", "FOR_TIME", "RFT", "INTERVALS", "TABATA", "CHIPPER"];

/** Kinds accepted by add_coach_note (CoachMemory.notes[].kind). */
export const NOTE_KINDS = ["insight", "decision", "injury", "preference", "goal"];

/**
 * Tool specs keyed by name. `startLabel` is the UI label while the tool runs.
 * Descriptions are all Claude knows about a tool, so they say what it does, what it returns and when to use it.
 * @type {Record<string, { name: string, description: string, inputSchema: object, startLabel: string }>}
 */
export const TOOL_SPECS = {
  log_session: {
    name: "log_session",
    startLabel: "Logging workout…",
    description:
      "Save a workout the owner reports (or a missed day with status \"missed\"). Expand set notation: \"100x5,5,4\" = 3 sets; \"3x8 @60\" = 3 sets of 8 at 60 kg. " +
      "Use exerciseId when known, else name (the app maps names). Set workoutId to the planned id, or \"next\" when they did the up-next workout; omit for unplanned sessions. " +
      "The app computes pace, PRs and the rotation. Returns {id, prs, nextTargets, upNext}. Log only what the owner said; never invent numbers.",
    inputSchema: {
      type: "object",
      properties: {
        session: {
          type: "object",
          properties: {
            date: { type: "string", description: "YYYY-MM-DD, default today" },
            title: STR,
            type: { enum: SESSION_TYPES },
            status: { enum: ["done", "partial", "missed"] },
            missedReason: { enum: ["travel", "time", "sick", "pain", "motivation", "other"] },
            workoutId: { type: "string", description: "W1…, \"next\", or omit" },
            durationMin: NUM,
            strength: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  exerciseId: STR,
                  name: STR,
                  sets: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        loadKg: NUM_OR_NULL,
                        reps: NUM,
                        rir: NUM_OR_NULL,
                        type: { enum: ["work", "warmup"] },
                        bodyweight: { type: "boolean" },
                      },
                      required: ["reps"],
                    },
                  },
                },
              },
            },
            run: {
              type: "object",
              properties: {
                runType: { enum: RUN_TYPES },
                distanceKm: NUM, durationSec: NUM, avgHr: NUM, elevationM: NUM, rpe: NUM,
                splits: { type: "array", items: NUM, description: "sec per km" },
              },
            },
            conditioning: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  format: { enum: COND_FORMATS },
                  description: STR,
                  result: {
                    type: "object",
                    properties: { rounds: NUM, reps: NUM, timeSec: NUM, calories: NUM, completed: { type: "boolean" } },
                  },
                  scaled: { type: "boolean" },
                  rpe: NUM,
                  notes: STR,
                },
              },
            },
            pain: {
              type: "array",
              items: {
                type: "object",
                properties: { area: STR, score: { type: "number", description: "0-10" }, when: { enum: ["during", "after", "next_morning"] } },
              },
            },
            readiness: { type: "number", description: "1-5" },
            sessionRpe: { type: "number", description: "1-10" },
            notes: STR,
          },
          required: ["type"],
        },
      },
      required: ["session"],
    },
  },

  get_plan: {
    name: "get_plan",
    startLabel: "Checking the plan…",
    description:
      "Read the training plan. which=\"next\": the up-next workout of the agreed plan in full, with app-computed target load/reps for every strength item (quote these numbers as given). " +
      "which=\"agreed\" or \"draft\": that plan's overview; add workoutId to get one workout in full.",
    inputSchema: {
      type: "object",
      properties: {
        which: { enum: ["next", "agreed", "draft"] },
        workoutId: STR,
      },
      required: ["which"],
    },
  },

  update_profile: {
    name: "update_profile",
    startLabel: "Updating profile…",
    description:
      "Save changes to the owner's profile: screening, goals, schedule, equipment, experience, injuries, preferences, basics. Deep-merges `patch`; arrays replace, except " +
      "equipment.locations (merged by id) and injuries (merged by area). Equipment items must be EQUIPMENT ids from the context. Paces and race times may be \"mm:ss\" strings. Returns a short summary of what changed.",
    inputSchema: {
      type: "object",
      properties: {
        patch: {
          type: "object",
          description: "Partial Profile, e.g. {\"schedule\":{\"daysPerWeek\":4}} or {\"equipment\":{\"locations\":[{\"id\":\"home\",\"name\":\"Home\",\"items\":[\"dumbbells\",\"bench\"],\"dumbbellMaxKg\":30}]}}",
          properties: {
            name: STR, age: NUM, sex: STR, heightCm: NUM, weightKg: NUM,
            screening: { type: "object", description: "answers{heartCondition,chestPain,dizziness,chronicCondition,medications,boneJoint,supervisedOnly: bool}, pregnant, notes, outcome: cleared|cleared_with_modifications|needs_clearance" },
            injuries: { type: "array", items: { type: "object", description: "{area, status: current|past, painScore, aggravators, notes}" } },
            goals: { type: "object", description: "primary, secondary[], why, success12w, targetDate, modalities{strength,running,conditioning: bool}, event{type,distanceKm,date,goalTimeSec}|null" },
            schedule: { type: "object", description: "daysPerWeek, minutesPerSession, preferredDays[], notes" },
            equipment: { type: "object", description: "defaultLocationId, locations[{id,name,items[],dumbbellMaxKg,kettlebellsKg[],notes}]" },
            experience: { type: "object", description: "level: novice|late_novice|intermediate|advanced, trainingAgeYears, running{currentWeeklyKm,longestRecentRunKm,recentRace{distanceKm,timeSec,date},easyPaceSecPerKm}, conditioning{experience: none|some|regular}, knownLifts[{exerciseId,loadKg,reps,rir,date}]" },
            preferences: { type: "object", description: "likes[], dislikes[] (exerciseIds or text), tone, logging" },
            onboarded: { type: "boolean" },
          },
        },
      },
      required: ["patch"],
    },
  },

  get_history: {
    name: "get_history",
    startLabel: "Reading history…",
    description:
      "Logged sessions, newest first, as compact lines (sets as load×reps with RIR, runs with pace). Filter by date range or type. " +
      "With exerciseId: only sessions containing it, plus app-computed stats (best e1RM, recent trend, stall/fatigue flag).",
    inputSchema: {
      type: "object",
      properties: {
        from: DATE,
        to: DATE,
        type: { enum: SESSION_TYPES },
        exerciseId: STR,
        limit: { type: "number", description: "default 8, max 20" },
      },
    },
  },

  update_session: {
    name: "update_session",
    startLabel: "Updating workout…",
    description:
      "Correct a logged session by id (from log_session, history or context), or save coachComment. Top-level fields in `patch` replace; send the full strength array when changing sets. Returns the updated compact line.",
    inputSchema: {
      type: "object",
      properties: {
        id: STR,
        patch: { type: "object", description: "Session fields to replace, e.g. {\"sessionRpe\":8} or {\"coachComment\":\"…\"}" },
      },
      required: ["id", "patch"],
    },
  },

  request_plan: {
    name: "request_plan",
    startLabel: "Preparing plan request…",
    description:
      "Queue a plan request: kind \"generate\" for next week's plan, \"revise\" to change the current draft. This only shows the owner a Generate button; a separate step writes the plan. " +
      "Put the owner's wishes in instruction. Never write a full plan in chat.",
    inputSchema: {
      type: "object",
      properties: {
        kind: { enum: ["generate", "revise"] },
        instruction: { type: "string", description: "≤ 400 chars" },
      },
      required: ["kind"],
    },
  },

  add_coach_note: {
    name: "add_coach_note",
    startLabel: "Saving note…",
    description:
      "Save one durable fact to long-term memory (≤ 300 chars): an insight, decision, injury, preference or goal that matters in future weeks. Use sparingly; profile fields go in update_profile.",
    inputSchema: {
      type: "object",
      properties: {
        kind: { enum: NOTE_KINDS },
        text: STR,
      },
      required: ["kind", "text"],
    },
  },

  get_exercise_info: {
    name: "get_exercise_info",
    startLabel: "Looking up exercise…",
    description:
      "Look up an exercise by name or id. Returns the catalog entry (id, pattern, muscles, equipment), whether the owner's equipment allows it at each location (with missing items), and up to 3 allowed substitutes.",
    inputSchema: {
      type: "object",
      properties: { query: STR },
      required: ["query"],
    },
  },
};

/** Chat-mode tools in priority order (kept first when `limits().tools.maxCount` is smaller). */
export const CHAT_TOOL_ORDER = [
  "log_session", "get_plan", "update_profile", "get_history",
  "update_session", "request_plan", "add_coach_note", "get_exercise_info",
];

/** Onboarding-mode tools: centred on update_profile. */
export const ONBOARDING_TOOL_ORDER = ["update_profile", "get_exercise_info", "request_plan"];
