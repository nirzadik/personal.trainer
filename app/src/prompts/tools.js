// Chat tool definitions as Claude sees them: name, description, JSON Schema (owner: Agent B).
// The `execute` implementations live in brain.js; this file is static data so it stays reviewable.

const NUM = { type: "number" };
const STR = { type: "string" };
const BOOL = { type: "boolean" };
const DATE = { type: "string", description: "YYYY-MM-DD" };
const SESSION_TYPES = ["strength", "run", "conditioning", "hybrid", "mobility", "other"];
const RUN_TYPES = ["easy", "long", "tempo", "threshold", "intervals", "hills", "fartlek", "recovery", "strides", "race"];
const COND_FORMATS = ["AMRAP", "EMOM", "FOR_TIME", "RFT", "INTERVALS", "TABATA", "CHIPPER"];
const MISSED_REASONS = ["travel", "time", "sick", "pain", "motivation", "other"];
const strEnum = (values, description) => ({ type: "string", enum: values, ...(description ? { description } : {}) });

// Every inputSchema below sticks to a conservative JSON Schema subset that any tool API accepts:
// single `type` strings, `properties`, `required`, `items`, `enum` (strings, with type "string") and `description`.
// No type arrays, no null types (optional fields are simply omitted), no oneOf/anyOf/allOf/$ref, no
// additionalProperties, and no property NAMED like a schema keyword (type, title, format, description, id, …):
// naive schema walkers read those as keywords. checkToolSchema() enforces this; tests and the mock run it.

/** Value lists brain.js validates against (some are given to Claude as descriptions to keep schemas small). */
export const TOOL_ENUMS = Object.freeze({ SESSION_TYPES, RUN_TYPES, COND_FORMATS, MISSED_REASONS });

/** Kinds accepted by add_coach_note (CoachMemory.notes[].kind). */
export const NOTE_KINDS = ["insight", "decision", "injury", "preference", "goal"];

/** Schema keywords this app may use. */
export const SCHEMA_KEYWORDS = Object.freeze(["type", "properties", "required", "items", "enum", "description"]);
/** Allowed values of `type`. */
export const SCHEMA_TYPES = Object.freeze(["object", "array", "string", "number", "integer", "boolean"]);
/** Property names that must not be used because they are JSON Schema keywords (any draft). */
export const RESERVED_PROPERTY_NAMES = Object.freeze([
  "type", "title", "description", "format", "items", "properties", "required", "enum", "const", "default", "examples",
  "pattern", "minimum", "maximum", "exclusiveMinimum", "exclusiveMaximum", "multipleOf", "minLength", "maxLength",
  "minItems", "maxItems", "uniqueItems", "contains", "minProperties", "maxProperties", "additionalProperties",
  "patternProperties", "propertyNames", "dependencies", "dependentRequired", "dependentSchemas", "oneOf", "anyOf",
  "allOf", "not", "if", "then", "else", "id", "definitions", "nullable", "readOnly", "writeOnly", "deprecated",
  "contentMediaType", "contentEncoding", "discriminator", "example",
]);
/** Size caps (bytes, UTF-8): sample.d.ts says ≤ 4 KB per schema and ≤ 1 KB per tool description. */
export const SCHEMA_LIMITS = Object.freeze({ schemaBytes: 4096, descriptionBytes: 1024, propertyDescriptionBytes: 300, maxDepth: 8 });

const PROPERTY_NAME_RE = /^[A-Za-z][A-Za-z0-9_]{0,63}$/;
const utf8 = (s) => (typeof TextEncoder !== "undefined" ? new TextEncoder().encode(String(s)).length : String(s).length);

/**
 * Check one tool inputSchema against the conservative subset above.
 * Size is measured on the JSON pretty-printed with 2 spaces, so it stays under 4 KB however the platform counts.
 * @param {unknown} schema
 * @returns {string[]} problems (empty = OK)
 */
export function checkToolSchema(schema) {
  const problems = [];
  const isObj = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
  if (!isObj(schema)) return ["inputSchema must be an object"];
  if (schema.type !== "object") problems.push("root type must be \"object\"");
  let size = Infinity;
  try { size = utf8(JSON.stringify(schema, null, 2)); } catch { problems.push("schema is not JSON-serializable"); }
  if (size > SCHEMA_LIMITS.schemaBytes) problems.push(`schema is ${size} bytes pretty-printed (max ${SCHEMA_LIMITS.schemaBytes})`);
  const walk = (node, path, depth) => {
    if (!isObj(node)) { problems.push(`${path} must be a schema object`); return; }
    if (depth > SCHEMA_LIMITS.maxDepth) { problems.push(`${path} is nested too deeply`); return; }
    for (const k of Object.keys(node)) if (!SCHEMA_KEYWORDS.includes(k)) problems.push(`${path} uses unsupported keyword "${k}"`);
    if (typeof node.type !== "string") problems.push(`${path}.type must be one string`);
    else if (!SCHEMA_TYPES.includes(node.type)) problems.push(`${path}.type "${node.type}" is not allowed`);
    if ("description" in node && (typeof node.description !== "string" || !node.description.trim() ||
        utf8(node.description) > (depth === 0 ? SCHEMA_LIMITS.descriptionBytes : SCHEMA_LIMITS.propertyDescriptionBytes))) {
      problems.push(`${path}.description must be a short non-empty string`);
    }
    if ("enum" in node) {
      if (node.type !== "string") problems.push(`${path}.enum needs type "string"`);
      if (!Array.isArray(node.enum) || !node.enum.length || node.enum.some((v) => typeof v !== "string" || !v) || new Set(node.enum).size !== node.enum.length) {
        problems.push(`${path}.enum must be a non-empty list of unique strings`);
      }
    }
    if (node.type === "object") {
      if ("items" in node) problems.push(`${path}: items on an object`);
      if ("properties" in node && !isObj(node.properties)) problems.push(`${path}.properties must be an object`);
      const props = isObj(node.properties) ? node.properties : {};
      for (const [name, sub] of Object.entries(props)) {
        if (!PROPERTY_NAME_RE.test(name)) problems.push(`${path}: property name "${name}" is not a plain identifier`);
        if (RESERVED_PROPERTY_NAMES.includes(name)) problems.push(`${path}: property name "${name}" is a schema keyword`);
        walk(sub, `${path}.${name}`, depth + 1);
      }
      if ("required" in node) {
        if (!Array.isArray(node.required) || node.required.some((r) => typeof r !== "string" || !(r in props)) || new Set(node.required).size !== node.required.length) {
          problems.push(`${path}.required must list unique declared properties`);
        }
      }
    } else {
      if ("properties" in node || "required" in node) problems.push(`${path}: properties/required on a non-object`);
      if (node.type === "array") {
        if (!("items" in node)) problems.push(`${path}: array without items`);
        else walk(node.items, `${path}[]`, depth + 1);
      } else if ("items" in node) problems.push(`${path}: items on a non-array`);
    }
  };
  walk(schema, "inputSchema", 0);
  return problems;
}

/**
 * Check a whole tool definition as sample.d.ts describes it (name, description, inputSchema).
 * @param {{ name?: unknown, description?: unknown, inputSchema?: unknown }} tool
 * @returns {string[]} problems (empty = OK)
 */
export function checkToolSpec(tool) {
  const problems = [];
  if (typeof tool?.name !== "string" || !/^[A-Za-z0-9_-]{1,128}$/.test(tool.name)) problems.push("name must be 1-128 of A-Z a-z 0-9 _ -");
  if (typeof tool?.description !== "string" || !tool.description.trim() || utf8(tool.description) > SCHEMA_LIMITS.descriptionBytes) {
    problems.push("description must be 1 B-1 KB");
  }
  if (tool?.inputSchema !== undefined) problems.push(...checkToolSchema(tool.inputSchema));
  return problems;
}

/**
 * Tool specs keyed by name. `startLabel` is the UI label while the tool runs.
 * Descriptions are all Claude knows about a tool, so they say what it does, what it returns and when to use it.
 * Field names avoid schema keywords (sessionType, workoutTitle, metconFormat, summary, sessionId); brain.js maps
 * them back to the stored Session shape and also accepts the plain names.
 * @type {Record<string, { name: string, description: string, inputSchema: object, startLabel: string }>}
 */
export const TOOL_SPECS = {
  log_session: {
    name: "log_session",
    startLabel: "Logging workout…",
    description:
      "Save a workout the owner reports (or a missed day with status \"missed\"). Expand set notation: \"100x5,5,4\" = 3 sets; \"3x8 @60\" = 3 sets of 8 at 60 kg. " +
      "Use exerciseId when known, else name (the app maps names). Set workoutId to the planned id, or \"next\" when they did the up-next workout; omit for unplanned sessions. " +
      "Omit any number the owner did not give. The app computes pace, PRs and the rotation. Returns {id, prs, nextTargets, upNext}. Log only what the owner said; never invent numbers.",
    // Flat (no `session` wrapper) to keep the schema small; brain.js also accepts { session: {...} }.
    inputSchema: {
      type: "object",
      properties: {
        date: { type: "string", description: "YYYY-MM-DD, default today" },
        workoutTitle: STR,
        sessionType: strEnum(SESSION_TYPES),
        status: strEnum(["done", "partial", "missed"]),
        missedReason: { type: "string", description: MISSED_REASONS.join("|") },
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
                    loadKg: { type: "number", description: "omit for bodyweight" },
                    reps: NUM,
                    rir: { type: "number", description: "reps in reserve; omit if not given" },
                    warmup: { type: "boolean", description: "true for a warm-up set" },
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
            runType: { type: "string", description: RUN_TYPES.join("|") },
            distanceKm: NUM, durationSec: NUM, avgHr: NUM, rpe: NUM,
            splits: { type: "array", items: NUM, description: "sec per km" },
          },
        },
        conditioning: {
          type: "array",
          items: {
            type: "object",
            properties: {
              metconFormat: { type: "string", description: COND_FORMATS.join("|") },
              summary: { type: "string", description: "what the workout was" },
              rounds: NUM, reps: NUM, timeSec: NUM, calories: NUM,
              completed: BOOL, scaled: BOOL, rpe: NUM,
            },
          },
        },
        pain: {
          type: "array",
          items: {
            type: "object",
            properties: { area: STR, score: { type: "number", description: "0-10" }, when: strEnum(["during", "after", "next_morning"]) },
          },
        },
        readiness: { type: "number", description: "1-5" },
        sessionRpe: { type: "number", description: "1-10" },
        notes: STR,
      },
      required: ["sessionType"],
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
        which: strEnum(["next", "agreed", "draft"]),
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
            onboarded: BOOL,
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
      "Logged sessions, newest first, as compact lines (sets as load×reps with RIR, runs with pace). Filter by date range or sessionType. " +
      "With exerciseId: only sessions containing it, plus app-computed stats (best e1RM, recent trend, stall/fatigue flag).",
    inputSchema: {
      type: "object",
      properties: {
        from: DATE,
        to: DATE,
        sessionType: strEnum(SESSION_TYPES),
        exerciseId: STR,
        limit: { type: "number", description: "default 8, max 20" },
      },
    },
  },

  update_session: {
    name: "update_session",
    startLabel: "Updating workout…",
    description:
      "Correct a logged session by sessionId (the id from log_session, history or context), or save coachComment. Top-level fields in `patch` replace; send the full strength array when changing sets. Returns the updated compact line.",
    inputSchema: {
      type: "object",
      properties: {
        sessionId: STR,
        patch: { type: "object", description: "Session fields to replace, e.g. {\"sessionRpe\":8} or {\"coachComment\":\"…\"}" },
      },
      required: ["sessionId", "patch"],
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
        kind: strEnum(["generate", "revise"]),
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
        kind: strEnum(NOTE_KINDS),
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
