// Plan generation prompts: Plan JSON spec, compact example, allowed-exercise list, repair prompt (owner: Agent B).

import { formatPlanOverview, formatWorkout } from "./context.js";
import {
  clip, compactJson, compactValue, fmtDuration as fmtDurationLocal, fmtNum, fmtPace as fmtPaceLocal, formatSessionCompact,
  isPlainObject, joinSections, truncateBytes, utf8Bytes, weekdayName,
} from "./util.js";

/** First line of every plan prompt (also lets sample-mock.js recognise it). */
export const PLAN_PROMPT_MARKER = "[Personal Trainer · plan request]";
/** First line of every repair prompt. */
export const REPAIR_PROMPT_MARKER = "[Personal Trainer · plan repair]";
/** Heading of the allowed-exercise section (parsed by sample-mock.js). */
export const ALLOWED_HEADING = "Allowed exercises";
/** Heading of the profile JSON section (parsed by sample-mock.js). */
export const PROFILE_HEADING = "Owner profile (JSON)";
/** Heading of the run caps line (parsed by sample-mock.js). */
export const RUN_CAPS_HEADING = "Running load (computed by the app)";

/** Heading of the progression digest section, the first section of every plan prompt (owner: Agent P). */
export const DIGEST_HEADING = "Progression digest: last week's logged training vs its plan (computed by the app; plan FROM this)";

/**
 * Standing instruction placed in the plan prompt header: logged progress overrides onboarding baselines.
 * Exported so tests (and the repair path) can check it verbatim.
 */
export const ADAPT_INSTRUCTION = [
  "ADAPT FROM LAST WEEK, NOT FROM ONBOARDING. When the digest's basis is \"history\", logged performance and the digest override the onboarding baselines (profile.experience.knownLifts, running baselines, experience level) for every exercise and modality that has history.",
  "Use the profile for constraints (equipment, schedule, injuries, goals, dislikes) and only as a fallback for exercises or modalities without history (the digest lists those under baselines).",
  "Continue the progression: keep last week's core exercises unless a digest adjustment says swap, or a stall rule applies; follow each adjustment (progress, hold, repeat, deload, reduce_volume, swap, return, calibrate) and its kg / km limits.",
  "In the rationale (≤ 2 short sentences) say what changed vs last week and why, citing the digest.",
].join("\n");

/** Byte budgets of the plan prompt sections. */
export const PLAN_BUDGETS = Object.freeze({
  digest: 7000,
  rules: 40 * 1024,         // = the PLAN_RULES cap (knowledge/plan.js, ~36 KB)
  profile: 12000,
  memory: 6000,
  trainingSummary: 5000,
  sessions: 14000,
  targets: 5000,
  previousPlan: 16000,
  draft: 24000,
  instruction: 2000,
  allowed: 26000,
  total: 176 * 1024,        // hard ceiling ≈ 45k tokens; a realistic prompt is ~65 KB (≈ 16k tokens)
});

/**
 * The Plan JSON shape Claude must return (CONTRACT §4), minus the fields the app fills
 * (id, status, weekStart, createdAt, approvedAt, weeklyTargets, validation), in the COMPACT form:
 * one line, every null / "" / [] field and every field at its stated default omitted. `expandPlan`
 * restores the full CONTRACT shape. Live failure 2026-11-09: a pretty-printed plan with every null
 * field (~26 KB) on the complex tier was cut off; the compact form is ~45-55 % smaller.
 */
export const PLAN_JSON_SPEC = `Reply with ONLY one JSON object, compact on ONE line (no indentation or line breaks), no prose, no code fence.
OMIT every field that would be null, "" or [], and every field marked ? when at its default (=…): the app fills them in. Never write null.
Plan = {"focus": ≤ 60 chars, "rationale": ≤ 2 short sentences ≤ 220 chars citing 1-2 history numbers, "block"?=digest.block: {"week": block week n, "phase": "build"|"deload"|"test" (a build week with a test)|"taper"|"race"|"return"} (write it when yours differs), "workouts": [Workout] exactly the required number in rotation order, "notes"?: [≤ 5 strings ≤ 100 chars: the minimum version, swaps, safety]}
Workout = {"id"?="W1","W2"… by position, "title", "type"?="strength"|"run"|"conditioning" by its one main block kind, "hybrid" with 2+ kinds, else "mobility", "locationId"?=the default location, "estMinutes", "intent": 1 sentence ≤ 90 chars, "blocks": [Block]}
Block is one of:
 {"kind": "warmup"|"cooldown"|"mobility", "minutes", "items": [{"name", "detail"?: ≤ 6 words}]}
 {"kind": "strength", "items": [StrengthItem]}
 {"kind": "conditioning", "format": "AMRAP"|"EMOM"|"FOR_TIME"|"RFT"|"INTERVALS"|"TABATA"|"CHIPPER", "minutes"?, "rounds"?, "timeCapMin"?, "workSec"?, "restSec"?, "items": [CondItem], "targetRpe"?, "scaling": one line, keeps the stimulus, ≤ 100 chars, "notes": the stimulus, ≤ 100 chars}
 {"kind": "run", "runType": "easy"|"long"|"tempo"|"threshold"|"intervals"|"hills"|"fartlek"|"recovery"|"strides"|"race", "warmupMin"?=0, "cooldownMin"?=0, "totalKm" (whole run), "segments": [Segment], "notes"?: ≤ 100 chars}
Segment = {"reps"?=1, "distanceM" or "durationSec", "target"?: {"paceSecPerKm"?: [lo, hi], "hrZone"?, "rpe"?}, "recoverySec"?, "recoveryType"?: "jog"|"walk"|"stand"}
StrengthItem = {"exerciseId", "name"?=catalog name (omit), "sets", "reps": string "8-12"|"5"|"AMRAP", "targetRir"?, "loadKg"?, "restSec", "progression"?="double" (|"linear"|"rpe"|"none"), "incrementKg"?, "tempo"?, "notes"?: ≤ 8 words, "alternatives": [1-2 ids], "supersetGroup"?: "A"|"B"}
CondItem = {"exerciseId", "name"?=catalog name (omit), "reps"?, "calories"?, "distanceM"?, "durationSec"?, "loadKg"?, "notes"?: ≤ 8 words}
- Every exerciseId and alternatives entry MUST come from the provided exercise list for that workout's locationId. Never invent ids.
- loadKg: copy the app-computed target when one is listed, else omit it. paceSecPerKm: from the app-computed paces (s/km). Never estimate or convert.
- Be brief (the app flags TOO_VERBOSE): never restate numbers the fields hold (sets, reps, RIR, rest, load, pace) in notes; each cue once per plan.`;

/** The example plan in the full CONTRACT shape (tests round-trip it through compactPlan / expandPlan). */
export const PLAN_EXAMPLE_FULL = Object.freeze({
  focus: "Wk 3 build: squat and bench up, runs easy",
  rationale: "Squat e1RM +3% with RIR on target: loads up. Runs held at 12 km, no pain: long run +1 km.",
  block: { week: 3, phase: "build" },
  workouts: [
    {
      id: "W1", title: "Lower A", type: "strength", locationId: "gym", estMinutes: 55, intent: "Heavy squat; legs fresh for W3",
      blocks: [
        { kind: "warmup", minutes: 8, items: [{ name: "Bike", detail: "5 min easy" }, { name: "Leg swings", detail: "10/side" }] },
        { kind: "strength", items: [
          { exerciseId: "back_squat", name: "Back Squat", sets: 3, reps: "5", targetRir: 2, loadKg: 102.5, restSec: 180, progression: "linear", incrementKg: 2.5, tempo: null, notes: "ramp: bar×10, ~50%×5, ~75%×3", alternatives: ["goblet_squat"], supersetGroup: null },
          { exerciseId: "romanian_deadlift", name: "Romanian Deadlift", sets: 3, reps: "8-10", targetRir: 2, loadKg: null, restSec: 120, progression: "double", incrementKg: 2.5, tempo: null, notes: "", alternatives: ["good_morning"], supersetGroup: null },
        ] },
      ],
    },
    {
      id: "W2", title: "Easy run", type: "run", locationId: "gym", estMinutes: 40, intent: "Aerobic base",
      blocks: [
        { kind: "run", runType: "easy", warmupMin: 0, cooldownMin: 0, totalKm: 6, segments: [
          { reps: 1, distanceM: 6000, durationSec: null, target: { paceSecPerKm: [360, 390], hrZone: 2, rpe: null }, recoverySec: null, recoveryType: null },
        ], notes: "Conversational; slower is fine" },
      ],
    },
  ],
  notes: ["Swap W1 and W2 if legs are sore"],
});

const PLAN_KEYS = Object.freeze(["id", "status", "weekStart", "createdAt", "approvedAt", "weeklyTargets", "validation"]);
const T_PLAN = [["focus", ""], ["rationale", ""], ["block", null], ["workouts", []], ["notes", []]];

/** Plan.block.phase values (PLAN_JSON_SPEC). "test" is a build week that holds a test; the others are reduced or special weeks. */
export const PLAN_BLOCK_PHASES = Object.freeze(["build", "deload", "test", "taper", "race", "return"]);
const PHASE_SYNONYMS = {
  build: "build", base: "build", accumulation: "build", "race-specific": "build", "race specific": "build", peak: "build", intensification: "build",
  deload: "deload", "deload week": "deload", cutback: "deload", recovery: "deload",
  test: "test", testing: "test", "test week": "test",
  taper: "taper", race: "race", "race week": "race", return: "return", "return week": "return",
};

/**
 * Plan.block = { week, phase } in a fixed shape, or null: week an integer 1-52 (a "Wk 3" string is read), phase one
 * of PLAN_BLOCK_PHASES (a few synonyms mapped). Missing parts come from `fallback` (typically digest.block), then
 * week 1 / phase "build"; neither readable and no fallback → null.
 * @param {unknown} v
 * @param {unknown} [fallback]
 * @returns {{ week: number, phase: string }|null}
 */
export function normalizePlanBlock(v, fallback = null) {
  const fb = fallback != null && fallback !== v ? normalizePlanBlock(fallback) : null;
  if (!isPlainObject(v)) return fb;
  const ph = PHASE_SYNONYMS[String(v.phase ?? "").trim().toLowerCase()] ?? null;
  const m = /\d+/.exec(String(v.week ?? ""));
  const wk = m ? Number(m[0]) : null;
  const week = wk != null && wk >= 1 ? Math.min(52, wk) : null;
  if (!ph && week == null) return fb;
  return { week: week ?? fb?.week ?? 1, phase: ph ?? fb?.phase ?? "build" };
}
const T_WORKOUT = [["id", null], ["title", ""], ["type", null], ["locationId", null], ["estMinutes", null], ["intent", ""], ["blocks", []]];
const T_PREP = [["kind", null], ["minutes", null], ["items", []]];
const T_PREP_ITEM = [["name", ""], ["detail", ""]];
const T_STRENGTH = [["kind", null], ["items", []]];
const T_STRENGTH_ITEM = [["exerciseId", null], ["name", ""], ["sets", null], ["reps", ""], ["targetRir", null], ["loadKg", null], ["restSec", null],
  ["progression", "double"], ["incrementKg", null], ["tempo", null], ["notes", ""], ["alternatives", []], ["supersetGroup", null]];
const T_COND = [["kind", null], ["format", null], ["minutes", null], ["rounds", null], ["timeCapMin", null], ["workSec", null], ["restSec", null],
  ["items", []], ["targetRpe", null], ["scaling", ""], ["notes", ""]];
const T_COND_ITEM = [["exerciseId", null], ["name", ""], ["reps", null], ["calories", null], ["distanceM", null], ["durationSec", null], ["loadKg", null], ["notes", ""]];
const T_RUN = [["kind", null], ["runType", null], ["warmupMin", 0], ["cooldownMin", 0], ["totalKm", null], ["segments", []], ["notes", ""]];
const T_SEGMENT = [["reps", 1], ["distanceM", null], ["durationSec", null], ["target", null], ["recoverySec", null], ["recoveryType", null]];
const T_TARGET = [["paceSecPerKm", null], ["hrZone", null], ["rpe", null]];

/** Template keys in order with defaults; `null` / undefined input values take the default; unknown keys are kept after. */
function fill(obj, template, map = {}) {
  const src = isPlainObject(obj) ? obj : {};
  const out = {};
  for (const [k, def] of template) {
    const v = src[k];
    const val = v === undefined || v === null ? (Array.isArray(def) ? [] : def) : v;
    out[k] = map[k] ? map[k](val, src) : val;
  }
  for (const [k, v] of Object.entries(src)) if (!(k in out)) out[k] = v;
  return out;
}
const list = (v, fn) => (Array.isArray(v) ? v : []).map((x) => (isPlainObject(x) ? fn(x) : x));
const BLOCK_TEMPLATES = { strength: T_STRENGTH, conditioning: T_COND, run: T_RUN, warmup: T_PREP, cooldown: T_PREP, mobility: T_PREP };

function inferType(blocks) {
  const kinds = new Set(blocks.map((b) => b?.kind));
  const main = ["strength", "run", "conditioning"].filter((k) => kinds.has(k));
  return main.length > 1 ? "hybrid" : main[0] ?? "mobility";
}

/**
 * Restore a compact plan reply (fields omitted at their defaults, see PLAN_JSON_SPEC) to the full CONTRACT §4 shape:
 * every Workout / Block / item field present (null, "", [] or the stated default), strength reps as strings,
 * workout ids W1… by position, a missing type inferred from the block kinds, names from `nameOf`, missing locationIds from `defaultLocationId`. A full plan passes
 * through unchanged (values kept, keys reordered). A `{ plan: {...} }` wrapper is unwrapped. App-owned keys are kept.
 * `block` is normalized (normalizePlanBlock); an omitted block ("block"?=digest.block) takes `opts.block` (no key
 * when there is neither, so an older plan passes through unchanged).
 * @param {unknown} raw
 * @param {{ nameOf?: (exerciseId: string) => string|null|undefined, defaultLocationId?: string, block?: object|null }} [opts]
 * @returns {object}
 */
export function expandPlan(raw, { nameOf, defaultLocationId, block: defaultBlock = null } = {}) {
  let p = raw;
  if (isPlainObject(p?.plan) && Array.isArray(p.plan.workouts)) p = p.plan;
  if (!isPlainObject(p)) p = {};
  const named = (it) => (typeof it.name === "string" && it.name.trim() ? it.name : (typeof nameOf === "function" && it.exerciseId ? nameOf(String(it.exerciseId)) || String(it.exerciseId) : String(it.exerciseId ?? "")));
  const block = (b) => {
    const t = BLOCK_TEMPLATES[b.kind];
    if (!t) return b;
    if (b.kind === "strength") {
      return fill(b, t, { items: (v) => list(v, (it) => fill({ ...it, name: named(it) }, T_STRENGTH_ITEM, {
        reps: (r) => (typeof r === "number" ? String(r) : r),
      })) });
    }
    if (b.kind === "conditioning") return fill(b, t, { items: (v) => list(v, (it) => fill({ ...it, name: named(it) }, T_COND_ITEM)) });
    if (b.kind === "run") {
      return fill(b, t, { segments: (v) => list(v, (sg) => fill(sg, T_SEGMENT, { target: (tg) => fill(tg, T_TARGET) })) });
    }
    return fill(b, t, { items: (v) => list(v, (it) => fill(it, T_PREP_ITEM)) });
  };
  const workouts = list(p.workouts, (w) => {
    const blocks = list(w.blocks, block);
    return fill(w, T_WORKOUT, {
      blocks: () => blocks,
      type: (v) => v ?? inferType(blocks),
      locationId: (v) => v ?? defaultLocationId ?? null,
    });
  }).map((w, i) => (isPlainObject(w) && !(typeof w.id === "string" && w.id.trim()) ? { ...w, id: `W${i + 1}` } : w));
  const out = fill(p, T_PLAN, { workouts: () => workouts, block: (v) => normalizePlanBlock(v, defaultBlock) });
  if (out.block === null && !("block" in p)) delete out.block; // an older plan without a block stays as it was
  return out;
}

/**
 * The inverse of expandPlan: drop app-owned keys and every field at its default (null, "", [], progression
 * "double", reps 1, warmupMin/cooldownMin 0, positional workout ids, a type the blocks imply, catalog names, the
 * default location).
 * Used for the example, the draft / plan-to-fix JSON in prompts, and the mock's replies.
 * @param {object} plan
 * @param {{ nameOf?: (exerciseId: string) => string|null|undefined, defaultLocationId?: string }} [opts]
 * @returns {object}
 */
export function compactPlan(plan, { nameOf, defaultLocationId } = {}) {
  if (!isPlainObject(plan)) return {};
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  const strip = (obj, template, map = {}) => {
    const out = {};
    const defs = new Map(template);
    for (const [k, v0] of Object.entries(obj)) {
      if (v0 === undefined || v0 === null) continue;
      const v = map[k] ? map[k](v0, obj) : v0;
      if (v === undefined || v === null || v === "" || (Array.isArray(v) && !v.length)) continue;
      if (defs.has(k) && same(v, defs.get(k))) continue;
      out[k] = v;
    }
    return out;
  };
  const catalogName = (it) => (typeof nameOf === "function" && it.exerciseId ? nameOf(String(it.exerciseId)) : undefined);
  const nameMap = { name: (n, it) => (catalogName(it) && String(n).trim().toLowerCase() === String(catalogName(it)).trim().toLowerCase() ? undefined : n) };
  const block = (b) => {
    const t = BLOCK_TEMPLATES[b.kind];
    if (!t) return b;
    if (b.kind === "strength") return strip(b, t, { items: (v) => list(v, (it) => strip(it, T_STRENGTH_ITEM, nameMap)) });
    if (b.kind === "conditioning") return strip(b, t, { items: (v) => list(v, (it) => strip(it, T_COND_ITEM, nameMap)) });
    if (b.kind === "run") {
      return strip(b, t, { segments: (v) => list(v, (sg) => strip(sg, T_SEGMENT, {
        target: (tg) => { const c = isPlainObject(tg) ? strip(tg, T_TARGET) : undefined; return c && Object.keys(c).length ? c : undefined; },
      })) });
    }
    return strip(b, t, { items: (v) => list(v, (it) => strip(it, T_PREP_ITEM)) });
  };
  const rest = Object.fromEntries(Object.entries(plan).filter(([k]) => !PLAN_KEYS.includes(k)));
  return strip(rest, T_PLAN, {
    workouts: (v) => list(v, (w) => strip(w, T_WORKOUT, {
      blocks: (bs) => list(bs, block),
      type: (ty) => (Array.isArray(w.blocks) && ty === inferType(w.blocks) ? undefined : ty),
      locationId: (id) => (defaultLocationId && id === defaultLocationId ? undefined : id),
    })).map((w, i) => (isPlainObject(w) && w.id === `W${i + 1}` ? (({ id, ...x }) => x)(w) : w)),
  });
}

/** A compact example showing the shape (not content to copy): names, defaults and nulls omitted. */
export const PLAN_EXAMPLE = JSON.stringify(compactPlan(PLAN_EXAMPLE_FULL, {
  nameOf: (id) => ({ back_squat: "Back Squat", romanian_deadlift: "Romanian Deadlift" })[id],
}));

const PATTERN_ORDER = ["squat", "hinge", "lunge", "h_push", "v_push", "h_pull", "v_pull", "carry", "core", "isolation", "plyo", "olympic", "gymnastics", "cardio"];

function sameAsId(name, id) {
  const norm = (s) => String(s ?? "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  return norm(name) === norm(id);
}

/**
 * Compact allowed-exercise text, one block per distinct location list, grouped by movement pattern:
 * "## gym (Gym)\nsquat: back_squat, goblet_squat, hack_squat (Hack squat machine)\n…".
 * @param {Array<{ id: string, name?: string, exercises: Array<{ id: string, name?: string, pattern?: string }> }>} locations
 * @param {number} [maxBytes]
 * @returns {string}
 */
export function formatAllowedExercises(locations, maxBytes = PLAN_BUDGETS.allowed) {
  const locs = (Array.isArray(locations) ? locations : []).filter(isPlainObject);
  if (!locs.length) return "(no exercise catalog available: use common exercise ids in snake_case)";
  const blocks = new Map(); // body → [location labels]
  for (const loc of locs) {
    const byPattern = new Map();
    for (const ex of Array.isArray(loc.exercises) ? loc.exercises : []) {
      if (!isPlainObject(ex) || !ex.id) continue;
      const p = ex.pattern || "other";
      if (!byPattern.has(p)) byPattern.set(p, []);
      byPattern.get(p).push(sameAsId(ex.name, ex.id) || !ex.name ? ex.id : `${ex.id} (${clip(ex.name, 40)})`);
    }
    const patterns = [...byPattern.keys()].sort((a, b) => {
      const ia = PATTERN_ORDER.indexOf(a), ib = PATTERN_ORDER.indexOf(b);
      return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib) || a.localeCompare(b);
    });
    const body = patterns.length
      ? patterns.map((p) => `${p}: ${byPattern.get(p).join(", ")}`).join("\n")
      : "(none: bodyweight movements only, if listed elsewhere)";
    const label = `${loc.id}${loc.name ? ` (${clip(loc.name, 30)})` : ""}`;
    if (!blocks.has(body)) blocks.set(body, []);
    blocks.get(body).push(label);
  }
  const text = [...blocks.entries()].map(([body, labels]) => `## location ${labels.join(", ")}\n${body}`).join("\n\n");
  return truncateBytes(text, maxBytes);
}

/**
 * Running-load caps line, computed in code so the model never does the arithmetic.
 * Mirrors core.RUN_LIMITS / validatePlan: weekly km ≤ max(base × 1.1, base + 3) with base = max(average, last week);
 * any single run ≤ 30-day longest × 1.1 (warning above; error above × 1.3 and +3 km).
 * @param {{ avgWeeklyKm?: number, lastWeekKm?: number, longestKm?: number, weeks?: number, source?: "log"|"profile" }} load
 * @returns {{ text: string, weeklyCapKm: number, longRunCapKm: number }}
 */
export function runCaps(load) {
  const avg = Number(load?.avgWeeklyKm) || 0;
  const base = Math.max(avg, Number(load?.lastWeekKm) || 0);
  const longest = Number(load?.longestKm) || 0;
  // same formula as core.validatePlan (RUN_LIMITS): +10 %, or +3 km at low volume, never below a first week's 8 km
  const weeklyCapKm = Math.floor(Math.max(base * 1.1, base + 3, 8) * 10 + 1e-9) / 10;
  const longRunCapKm = Math.floor(longest * 1.1 * 10 + 1e-9) / 10;
  const source = load?.source === "profile" ? "from the onboarding profile (no runs logged yet)" : `over the last ${load?.weeks ?? 4} weeks`;
  // No longest-run baseline (nothing logged, nothing in the profile): no single-run number, never "≤ 0 km".
  const single = longest > 0
    ? `any single run ≤ ${fmtNum(longRunCapKm)} km${longest < 10 ? " (short runs: round down)" : ""}`
    : "no recent run to cap single runs from: start with short easy runs or run/walk (the beginner rules)";
  const text = `recent average ${fmtNum(avg)} km/week ${source}` +
    `${base > avg ? `, last week ${fmtNum(base)} km` : ""}; longest run in the last 30 days ${longest > 0 ? `${fmtNum(longest)} km` : "none"}. ` +
    `Caps this week: weekly total ≤ ${fmtNum(weeklyCapKm)} km; ${single}. The digest's kmMax/longMax win when lower.`;
  return { text, weeklyCapKm, longRunCapKm };
}

/**
 * App-computed next targets, one line per exercise with a load; exercises without one share a single line
 * (their identical "calibrate" notes said the same thing for every lift).
 */
function formatTargets(targets) {
  const items = (Array.isArray(targets) ? targets : []).filter(isPlainObject);
  const loaded = items.filter((t) => t.loadKg !== null && t.loadKg !== undefined);
  const open = items.filter((t) => t.loadKg === null || t.loadKg === undefined);
  const lines = loaded.map((t) => `- ${t.exerciseId}: ${fmtNum(t.loadKg)} kg${t.reps ? ` × ${t.reps}` : ""}${t.note ? ` (${clip(t.note, 100)})` : ""}`);
  if (open.length) {
    const calib = open.filter((t) => /^No history yet\b|calibrat/i.test(String(t.note ?? "")));
    const other = open.filter((t) => !calib.includes(t));
    if (calib.length) lines.push(`- no load yet, calibrate (work up to ~3 RIR at the bottom of the rep range; err light; loadKg omitted): ${calib.map((t) => `${t.exerciseId}${t.reps ? ` ×${t.reps}` : ""}`).join(", ")}`);
    for (const t of other) lines.push(`- ${t.exerciseId}: no load yet${t.reps ? ` × ${t.reps}` : ""}${t.note ? ` (${clip(t.note, 100)})` : ""}`);
  }
  return lines.join("\n");
}

function planJsonForPrompt(plan, maxBytes, opts) {
  if (!isPlainObject(plan)) return "";
  return truncateBytes(JSON.stringify(compactPlan(plan, opts)), maxBytes);
}

/** Profile copy for the prompt: drops bookkeeping keys and an all-"no" screening (outcome and notes kept). */
function profileForPrompt(profile) {
  if (!isPlainObject(profile)) return profile;
  const { version, onboarded, updatedAt, ...rest } = profile;
  const sc = rest.screening;
  if (isPlainObject(sc) && isPlainObject(sc.answers) && Object.values(sc.answers).every((v) => v === false)) {
    const { answers, ...scRest } = sc;
    rest.screening = { ...scRest, answers: "all no" };
  }
  return rest;
}

/** True when a ### / ## section of the rules applies (see tailorPlanRules). */
const RULE_SECTION_RE = /^(#{2,3}) (\d+(?:\.\d+)?)\b/;

/**
 * PLAN_RULES cut to what can apply to this owner this week, so the prompt stays small (live failure 2026-11-09:
 * the complex-tier answer was cut off). Only sections that cannot apply are dropped, each replaced by nothing or
 * a one-line pointer; every rule that could apply is sent verbatim:
 * - §4 Running when running is not a selected modality; §5 Conditioning when conditioning is not;
 * - §4.8 Race builds and taper without an event (goals.event);
 * - §4.2's pace table when no race, time trial or event goal time is known, or app-computed pace zones already
 *   cover it and there is no event goal time;
 * - §6.4 template rotations for other day counts than schedule.daysPerWeek;
 * - the §2 pregnancy line for a male or not-pregnant owner, the age line for an owner aged 18-64.
 * @param {string} rules
 * @param {{ profile?: object, daysPerWeek?: number, paceZonesGiven?: boolean, loggedRace?: boolean }} ctx
 * @returns {string}
 */
export function tailorPlanRules(rules, { profile, daysPerWeek, paceZonesGiven = false, loggedRace = false } = {}) {
  const text = String(rules ?? "");
  if (!text.includes("## 4. Running")) return text; // custom / test rules: leave as they are
  const mods = isPlainObject(profile?.goals?.modalities) ? profile.goals.modalities : {};
  const event = isPlainObject(profile?.goals?.event) ? profile.goals.event : null;
  const race = profile?.experience?.running?.recentRace;
  const hasRace = isPlainObject(race) && Number(race.timeSec) > 0;
  const eventGoal = Boolean(event && Number(event.goalTimeSec) > 0);
  const paceTable = eventGoal || loggedRace || (hasRace && !paceZonesGiven);
  const drop = new Set();
  if (mods.running === false) drop.add("4");
  if (mods.conditioning === false) drop.add("5");
  if (!event) drop.add("4.8");
  const lines = text.split("\n");
  const out = [];
  let skipLevel = 0; // heading depth being skipped (0 = none)
  let inTable = false;
  let section = "";
  for (const line of lines) {
    const m = RULE_SECTION_RE.exec(line);
    if (m) {
      const depth = m[1].length;
      if (skipLevel && depth <= skipLevel) skipLevel = 0;
      section = m[2];
      if (!skipLevel && drop.has(section)) { skipLevel = depth; continue; }
    }
    if (skipLevel) continue;
    if (section === "4.2" && !paceTable) {
      if (line.startsWith("```")) {
        if (!inTable) out.push("(Pace table omitted: no race, time trial or event goal time to look up, or the app already computed the zones above. Use the app-computed paces, else rpe and the talk test.)");
        inTable = !inTable;
        continue;
      }
      if (inTable || /^(Prefer the app-computed|Marathon predictions)/.test(line) || /^- (Event goal pace|Returning runners: 1 row)/.test(line)) continue;
    }
    if (section === "2") {
      if (/^- \*\*Pregnancy\*\*/.test(line) && (profile?.sex === "male" || profile?.screening?.pregnant === false)) continue;
      const age = Number(profile?.age);
      if (/^- \*\*Age ≥65:\*\*/.test(line) && age >= 18 && age < 65) continue;
    }
    if (section === "6.4" && Number(daysPerWeek) >= 3 && Number(daysPerWeek) <= 6) {
      const day = /^- \*\*(\d) days/.exec(line);
      if (day && Number(day[1]) !== Number(daysPerWeek)) continue;
    }
    out.push(line);
  }
  return out.join("\n");
}

/**
 * A previous-plan workout trimmed for the plan prompt (continuity, not a template): warm-up / cool-down items,
 * display names and strength cues are dropped, other notes clipped; exercises, doses, run and metcon shapes stay.
 * @param {object} w
 * @returns {object}
 */
function slimWorkout(w) {
  if (!isPlainObject(w)) return w;
  const blocks = (Array.isArray(w.blocks) ? w.blocks : []).map((b) => {
    if (!isPlainObject(b)) return b;
    if (["warmup", "cooldown", "mobility"].includes(b.kind)) return { kind: b.kind, minutes: b.minutes, items: [] };
    if (b.kind === "strength") return { ...b, items: (b.items ?? []).map((it) => (isPlainObject(it) ? { ...it, name: "", notes: "" } : it)) };
    if (b.kind === "conditioning") return { ...b, scaling: clip(b.scaling ?? "", 60) };
    if (b.kind === "run") return { ...b, notes: clip(b.notes ?? "", 40) };
    return b;
  });
  return { ...w, intent: clip(w.intent ?? "", 90), blocks };
}

/**
 * Build the plan-generation prompt (one string for sample.json).
 * @param {object} d
 * @param {string} d.rules knowledge.PLAN_RULES
 * @param {string} d.today
 * @param {string} d.weekStart Sunday the plan starts
 * @param {number} d.workoutCount required number of workouts (schedule.daysPerWeek)
 * @param {number} [d.minutesPerSession]
 * @param {object} d.profile
 * @param {string} [d.memoryText] coach summary + notes, already formatted
 * @param {object} [d.trainingSummary]
 * @param {object[]} [d.recentSessions] last 14 days, any order
 * @param {object[]} [d.targets] [{exerciseId, loadKg, reps, note}] app-computed next targets
 * @param {{ avgWeeklyKm: number, lastWeekKm?: number, longestKm: number, weeks: number }} [d.runLoad]
 * @param {object} [d.previousPlan]
 * @param {string[]} [d.previousDone] workout ids done in the previous plan
 * @param {object} [d.draft] the draft to revise (revise mode)
 * @param {string} [d.instruction]
 * @param {string} [d.pacesText] formatted easy pace / race / pace zones (see formatPaces)
 * @param {object[]} d.allowedLocations see formatAllowedExercises
 * @param {object} [d.digest] progress.progressionDigest result; leads the prompt and overrides profile baselines
 * @param {(exerciseId: string) => string|null} [d.nameOf] catalog names (omitted from the compact draft JSON)
 * @returns {string}
 */
export function buildPlanPrompt(d) {
  const B = PLAN_BUDGETS;
  const revise = isPlainObject(d.draft);
  const minutes = Number(d.minutesPerSession) || null;
  const task = revise
    ? `Revise the current DRAFT plan below according to the owner's instruction. Keep what they did not ask to change. Output the complete revised plan.`
    : `Write the owner's training plan for the week starting Sunday ${d.weekStart}.`;
  const header = [
    PLAN_PROMPT_MARKER,
    `You are the owner's coach in the Personal Trainer app. ${task}`,
    `Today: ${d.today} (${weekdayName(d.today)}). Plan week starts: ${d.weekStart}.`,
    `Required: exactly ${d.workoutCount} workouts (schedule.daysPerWeek) in rotation order${minutes ? `, each estMinutes ≤ ${minutes} (session length ${minutes} min; the hard limit is ${minutes + 15})` : ""}.`,
    "The plan is a draft the owner approves. Use only numbers given here; the app computed them.",
    ...(isPlainObject(d.digest) && d.digest.basis === "history" ? [ADAPT_INSTRUCTION] : []),
  ].join("\n");
  const fromHistory = isPlainObject(d.digest) && d.digest.basis === "history";
  const planOpts = { nameOf: d.nameOf, defaultLocationId: d.profile?.equipment?.defaultLocationId };
  const recent = Array.isArray(d.recentSessions) ? d.recentSessions : [];
  const rules = tailorPlanRules(String(d.rules ?? ""), {
    profile: d.profile, daysPerWeek: d.workoutCount, paceZonesGiven: /pace zones:/.test(String(d.pacesText ?? "")),
    loggedRace: recent.some((s) => s?.run?.runType === "race" || /time trial|\brace\b|parkrun/i.test(String(s?.title ?? ""))),
  });
  const runLogged = fromHistory && d.digest.run?.logged === true;

  const sessions = recent
    .map((s) => formatSessionCompact(s, { notesChars: 100, withId: false })).join("\n");
  const prev = isPlainObject(d.previousPlan)
    ? `${formatPlanOverview(d.previousPlan, { done: d.previousDone, label: "Previous plan" })}\n` +
      (d.previousPlan.workouts || []).map((w) => formatWorkout(slimWorkout(w))).join("\n\n")
    : "";

  const sections = [
    { title: DIGEST_HEADING, body: isPlainObject(d.digest) ? formatDigest(d.digest) : "", maxBytes: B.digest },
    { title: "Coaching rules", body: rules.trim() || "Plan evidence-based training across the owner's modalities: progressive overload, 10-20 hard sets per muscle per week for strength goals, ~80% easy running, hard/easy alternation, scale conditioning to experience.", maxBytes: B.rules },
    { title: PROFILE_HEADING, body: (fromHistory ? "Constraints and goals; onboarding baselines with logged history were removed (the digest wins).\n" : "") +
      "```json\n" + JSON.stringify(compactValue(profileForPrompt(profileForPlan(d.profile, d.digest))) ?? {}) + "\n```", maxBytes: B.profile },
    { title: "Coach memory", body: d.memoryText ?? "", maxBytes: B.memory },
    { title: "Training summary (computed by the app)", body: d.trainingSummary ? compactJson(d.trainingSummary) : "No history yet.", maxBytes: B.trainingSummary },
    { title: RUN_CAPS_HEADING, body: runCaps(d.runLoad).text },
    { title: "Sessions, last 14 days (oldest first)", body: sessions || "None logged.", maxBytes: B.sessions },
    { title: "App-computed next targets (copy into loadKg)", body: formatTargets(d.targets), maxBytes: B.targets },
    { title: "Previous plan", body: prev, maxBytes: B.previousPlan },
    { title: "Current draft to revise (JSON)", body: revise ? planJsonForPrompt(d.draft, B.draft, planOpts) : "", maxBytes: B.draft },
    { title: "Owner's instruction", body: clip(d.instruction ?? "", 1500) || (revise ? "(none: fix anything that looks off)" : "(none)"), maxBytes: B.instruction },
    { title: runLogged ? "Running paces from the onboarding profile (fallback only: the digest's logged paces win)" : "Running paces (computed by the app)", body: d.pacesText ?? "", maxBytes: 2000 },
    { title: `${ALLOWED_HEADING}: the provided exercise list (the only exerciseIds you may use, by location and movement pattern)`, body: formatAllowedExercises(d.allowedLocations) },
    { title: "Plan JSON spec (output format)", body: `${PLAN_JSON_SPEC}\n\nExample of the compact shape (not the content):\n${PLAN_EXAMPLE}` },
  ];
  const room = B.total - utf8Bytes(header) - 4;
  return `${header}\n\n${joinSections(sections, room, "# ")}`;
}

/**
 * The digest as prompt text: one JSON line plus a reading key, so the model can follow the adjustments.
 * @param {object} digest progress.progressionDigest result
 * @returns {string}
 */
export function formatDigest(digest) {
  if (!isPlainObject(digest)) return "";
  const key = digest.basis === "history"
    ? "basis \"history\": plan from these numbers. week = the latest plan week's completion (week.inProgress: that week is still running, so done is judged against week.expected = workouts due so far; workouts not yet done are simply still to come); strength[].next = the app's next target (kg/reps); adjustments = what to do per scope (follow them; kg/kmMax/longMax are limits; run downWeek = the §4.3 down week); baselines = profile fallbacks only for items without history."
    : "basis \"profile\": no logged sessions yet. Calibration week from profile baselines (see adjustments and baselines).";
  const blockKey = " block = the week you are writing, counted by the app (not from focus text): block.week is its block week (\"Wk N\" in focus), block.phase the expected phase, weeksSinceDeload the build weeks since the last deload; the plan's \"block\" field defaults to it." +
    (isPlainObject(digest.event) ? " event = the race timeline for this week (weeksOut, taperFrom, stage base|build|race-specific|taper|race week|post-race; §4.8)." : "");
  return `${key}${isPlainObject(digest.block) ? blockKey : ""}\n\`\`\`json\n${JSON.stringify(groupAdjustments(digest))}\n\`\`\``;
}

/**
 * Strength adjustments that say the same thing (same act, no kg, same why: typically "calibrate … ~3 RIR" for every
 * lift in a first week) become one entry with `ids` (their reps are in digest.strength[].next). Others are unchanged.
 * @param {object} digest
 * @returns {object}
 */
function groupAdjustments(digest) {
  const adj = Array.isArray(digest?.adjustments) ? digest.adjustments : null;
  if (!adj) return digest;
  const groups = new Map();
  const out = [];
  for (const a of adj) {
    if (!isPlainObject(a) || a.scope !== "strength" || a.kg != null || !a.id) { out.push(a); continue; }
    const key = `${a.act}|${a.why ?? ""}`;
    if (!groups.has(key)) { const g = { scope: "strength", ids: [], act: a.act, why: a.why }; groups.set(key, g); out.push(g); }
    groups.get(key).ids.push(a.id);
  }
  const flat = out.map((a) => (Array.isArray(a?.ids) && a.ids.length === 1
    ? adj.find((x) => x?.scope === "strength" && x.id === a.ids[0] && x.act === a.act) ?? a : a));
  return { ...digest, adjustments: flat };
}

/**
 * Profile copy for the plan prompt. With logged history (digest.basis "history"), onboarding baselines that
 * the history supersedes are removed: knownLifts for exercises with logged sets, and running baselines when
 * runs are logged. Constraints (equipment, schedule, injuries, goals, preferences) are untouched.
 * @param {object} profile
 * @param {object} [digest]
 * @returns {object}
 */
export function profileForPlan(profile, digest) {
  if (!isPlainObject(profile) || !isPlainObject(digest) || digest.basis !== "history") return profile;
  const exp = isPlainObject(profile.experience) ? { ...profile.experience } : null;
  if (!exp) return profile;
  const keep = new Set((digest.baselines?.lifts ?? []).map((l) => l?.id));
  if (Array.isArray(exp.knownLifts)) {
    const kept = exp.knownLifts.filter((l) => keep.has(l?.exerciseId));
    if (kept.length !== exp.knownLifts.length) exp.knownLiftsNote = "baselines for lifts with logged history removed: use the digest";
    exp.knownLifts = kept;
  }
  if (digest.run?.logged === true && isPlainObject(exp.running)) {
    const { currentWeeklyKm, longestRecentRunKm, ...rest } = exp.running;
    exp.running = { ...rest, note: "weekly/longest km from onboarding superseded by logged runs (digest.run)" };
  }
  return { ...profile, experience: exp };
}

/**
 * Build the single repair prompt sent when core.validatePlan reports errors.
 * Memoryless, so it repeats the constraints, the allowed list and the spec.
 * @param {object} d
 * @param {object} d.plan the plan that failed (as returned by Claude, normalized)
 * @param {Array<{ code: string, workoutId?: string, path?: string, message: string }>} d.errors
 * @param {number} d.workoutCount
 * @param {number} [d.minutesPerSession]
 * @param {{ avgWeeklyKm: number, lastWeekKm?: number, longestKm: number, weeks: number }} [d.runLoad]
 * @param {object[]} d.allowedLocations
 * @param {string[]} [d.locationIds]
 * @param {(exerciseId: string) => string|null} [d.nameOf] catalog names (omitted from the compact plan JSON)
 * @param {string} [d.defaultLocationId]
 * @returns {string}
 */
export function buildRepairPrompt(d) {
  const errors = (Array.isArray(d.errors) ? d.errors : []).filter(isPlainObject).slice(0, 30);
  const problems = errors.map((e) => `- [${e.code}]${e.workoutId ? ` ${e.workoutId}` : ""}${e.path ? ` ${e.path}` : ""}: ${clip(e.message, 200)}`).join("\n");
  const minutes = Number(d.minutesPerSession) || null;
  const header = [
    REPAIR_PROMPT_MARKER,
    "The training plan JSON below failed the app's validator. Fix ONLY the listed problems and keep everything else the same.",
    "Reply with ONLY the complete corrected plan: one compact JSON object on one line, in the format of the spec below (omit defaults and nulls). No explanation.",
  ].join("\n");
  const sections = [
    { title: "Problems to fix", body: problems || "- (none listed)" },
    { title: "Constraints", body: [
      `- exactly ${d.workoutCount} workouts, ids W1…W${d.workoutCount}`,
      minutes ? `- each estMinutes ≤ ${minutes + 15} (aim for ≤ ${minutes})` : "",
      Array.isArray(d.locationIds) && d.locationIds.length ? `- locationId one of: ${d.locationIds.join(", ")}` : "",
      `- running: ${runCaps(d.runLoad).text}`,
      "- exerciseIds and alternatives only from the allowed list for that workout's location; to fix an id, swap in an allowed exercise of the same pattern",
    ].filter(Boolean).join("\n") },
    { title: `${ALLOWED_HEADING}: the provided exercise list (by location and movement pattern)`, body: formatAllowedExercises(d.allowedLocations) },
    { title: "Plan JSON spec (output format)", body: PLAN_JSON_SPEC },
    { title: "Plan to fix (compact JSON)", body: planJsonForPrompt(d.plan, 60000, { nameOf: d.nameOf, defaultLocationId: d.defaultLocationId }) },
  ];
  return `${header}\n\n${joinSections(sections, PLAN_BUDGETS.total, "# ")}`;
}

/**
 * Running paces as text, every pace given both formatted and in sec/km so the coach never converts:
 * "easy pace 6:10/km (370 s/km); recent race 10 km in 52:00 (5:12/km, 312 s/km); zones {…}".
 * @param {object} profile
 * @param {unknown} [zones] result of core.paceZones(recentRace) when available
 * @param {(sec: number) => string} [formatPace] core.formatPace, falls back to the local formatter
 * @returns {string}
 */
export function formatPaces(profile, zones, formatPace) {
  const fp = (s) => {
    try { const v = typeof formatPace === "function" ? formatPace(s) : null; if (typeof v === "string" && v) return v; } catch { /* fall back */ }
    return fmtPaceLocal(s);
  };
  const run = isPlainObject(profile?.experience?.running) ? profile.experience.running : {};
  const parts = [];
  const easy = Number(run.easyPaceSecPerKm);
  if (easy > 0) parts.push(`easy pace ${fp(easy)} (${Math.round(easy)} s/km)`);
  const race = isPlainObject(run.recentRace) ? run.recentRace : null;
  if (race && Number(race.distanceKm) > 0 && Number(race.timeSec) > 0) {
    const p = Number(race.timeSec) / Number(race.distanceKm);
    parts.push(`recent race ${fmtNum(race.distanceKm)} km in ${fmtDurationLocal(race.timeSec)}${race.date ? ` on ${race.date}` : ""} (${fp(p)}, ${Math.round(p)} s/km)`);
  }
  if (zones !== null && zones !== undefined) parts.push(`pace zones: ${annotatePaces(zones, fp)}`);
  return parts.join("\n");
}

/** JSON text of a value where every number in a key ending in SecPerKm / pace (or a [lo, hi] pair under one) gets its formatted pace beside it. */
function annotatePaces(value, fp) {
  const walk = (v, key) => {
    const paceKey = /pace|secperkm/i.test(String(key ?? ""));
    if (typeof v === "number" && paceKey) return `${fp(v)} (${Math.round(v)} s/km)`;
    if (Array.isArray(v)) return v.map((x) => walk(x, key));
    if (isPlainObject(v)) return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, walk(x, paceKey ? key : k)]));
    return v;
  };
  return truncateBytes(JSON.stringify(compactValue(walk(value, null)) ?? {}), 1500);
}
