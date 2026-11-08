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
  rules: 42 * 1024,
  profile: 12000,
  memory: 6000,
  trainingSummary: 5000,
  sessions: 14000,
  targets: 5000,
  previousPlan: 16000,
  draft: 24000,
  instruction: 2000,
  allowed: 26000,
  total: 200 * 1024,
});

/**
 * The exact Plan JSON shape Claude must return (CONTRACT §4), minus the fields the app fills
 * (id, status, weekStart, createdAt, approvedAt, weeklyTargets, validation).
 */
export const PLAN_JSON_SPEC = `Reply with ONLY one JSON object, no prose before or after. Use null for unknown numbers and [] for empty lists. No other keys.
{
  "focus": string,              // one line, ≤ 60 chars
  "rationale": string,          // ≤ 2 short sentences, ≤ 220 chars, citing 1-2 recent history numbers above
  "workouts": [Workout],        // exactly the required number, in rotation order (the order they should be done)
  "notes": [string]             // ≤ 5 notes, each ≤ 100 chars: deload hints, swaps, safety reminders
}
Workout = { "id": "W1" | "W2" | …, "title": string, "type": "strength" | "run" | "conditioning" | "hybrid" | "mobility",
            "locationId": one of the owner's location ids, "estMinutes": number, "intent": string (1 sentence, ≤ 90 chars), "blocks": [Block] }
Block is one of:
  { "kind": "warmup" | "cooldown" | "mobility", "minutes": number, "items": [ { "name": short string, "detail": string ≤ 6 words } ] }
  { "kind": "strength", "items": [StrengthItem] }
  { "kind": "conditioning", "format": "AMRAP" | "EMOM" | "FOR_TIME" | "RFT" | "INTERVALS" | "TABATA" | "CHIPPER",
    "minutes": number|null, "rounds": number|null, "timeCapMin": number|null, "workSec": number|null, "restSec": number|null,
    "items": [CondItem], "targetRpe": number|null, "scaling": string (one line, keeps the stimulus, ≤ 100 chars), "notes": string (the intended stimulus, ≤ 100 chars) }
  { "kind": "run", "runType": "easy" | "long" | "tempo" | "threshold" | "intervals" | "hills" | "fartlek" | "recovery" | "strides" | "race",
    "warmupMin": number|null, "cooldownMin": number|null, "totalKm": number,
    "segments": [ { "reps": number, "distanceM": number|null, "durationSec": number|null,
                    "target": { "paceSecPerKm": [lo, hi] | null, "hrZone": number|null, "rpe": number|null },
                    "recoverySec": number|null, "recoveryType": "jog" | "walk" | "stand" | null } ],
    "notes": string (≤ 100 chars or "") }
StrengthItem = { "exerciseId": allowed id, "name": string, "sets": number, "reps": string ("8-12" | "5" | "AMRAP"),
                 "targetRir": number|null, "loadKg": number|null, "restSec": number, "progression": "linear" | "double" | "rpe" | "none",
                 "incrementKg": number|null, "tempo": string|null, "notes": string (≤ 8 words or ""), "alternatives": [allowed ids], "supersetGroup": "A" | "B" | null }
CondItem = { "exerciseId": allowed id, "name": string, "reps": number|null, "calories": number|null, "distanceM": number|null,
             "durationSec": number|null, "loadKg": number|null, "notes": string (≤ 8 words or "") }   // unused fields null
Rules for the JSON:
- Every exerciseId and every alternatives entry MUST come from the provided exercise list for that workout's locationId. Never invent ids.
- Paces are seconds per km (paceSecPerKm [lo, hi]); take them from the app-computed paces above, never convert yourself.
- loadKg: copy the app-computed target when one is listed for that exercise; otherwise null (the app computes it from history). Never estimate.
- Give each strength item 1-2 alternatives from the allowed list.
- estMinutes must fit the session length; the app re-checks durations, equipment, run ramp and weekly volume.
- totalKm is the run's whole distance including warm-up and cool-down.
- Be brief (the app flags TOO_VERBOSE): the owner reads this on a phone. Never restate numbers the fields already hold
  (sets, reps, RIR, rest, load, pace) in notes; say each cue or safety reminder once in the whole plan, not in every workout.`;

/** A compact example showing the shape (not content to copy). */
export const PLAN_EXAMPLE = JSON.stringify({
  focus: "Wk 3 build: squat and bench up, runs easy",
  rationale: "Squat e1RM +3% with RIR on target: loads up. Runs held at 12 km, no pain: long run +1 km.",
  workouts: [
    {
      id: "W1", title: "Lower A", type: "strength", locationId: "gym", estMinutes: 55, intent: "Heavy squat; legs fresh for W3",
      blocks: [
        { kind: "warmup", minutes: 8, items: [{ name: "Bike", detail: "5 min easy" }, { name: "Leg swings", detail: "10/side" }] },
        { kind: "strength", items: [
          { exerciseId: "back_squat", name: "Back squat", sets: 3, reps: "5", targetRir: 2, loadKg: 102.5, restSec: 180, progression: "linear", incrementKg: 2.5, tempo: null, notes: "ramp: bar×10, ~50%×5, ~75%×3", alternatives: ["goblet_squat"], supersetGroup: null },
        ] },
      ],
    },
    {
      id: "W2", title: "Easy run + strides", type: "run", locationId: "gym", estMinutes: 40, intent: "Aerobic base",
      blocks: [
        { kind: "run", runType: "easy", warmupMin: 0, cooldownMin: 0, totalKm: 6, segments: [
          { reps: 1, distanceM: 6000, durationSec: null, target: { paceSecPerKm: [360, 390], hrZone: 2, rpe: 3 }, recoverySec: null, recoveryType: null },
        ], notes: "Conversational; slower is fine" },
      ],
    },
  ],
  notes: ["Swap W1 and W2 if legs are sore"],
});

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
 * Mirrors validatePlan's rules: weekly km ≤ max(avg × 1.15, avg + 5); one run ≤ max(longest × 1.3, longest + 3).
 * @param {{ avgWeeklyKm?: number, longestKm?: number, weeks?: number }} load
 * @returns {{ text: string, weeklyCapKm: number, longRunCapKm: number }}
 */
export function runCaps(load) {
  const avg = Number(load?.avgWeeklyKm) || 0;
  const longest = Number(load?.longestKm) || 0;
  const weeklyCapKm = Math.floor(Math.max(avg * 1.15, avg + 5) * 10) / 10;
  const longRunCapKm = Math.floor(Math.max(longest * 1.3, longest + 3) * 10) / 10;
  const text = `recent average ${fmtNum(avg)} km/week over the last ${load?.weeks ?? 4} weeks; longest recent run ${fmtNum(longest)} km. ` +
    `Caps this week: weekly total ≤ ${fmtNum(weeklyCapKm)} km; any single run ≤ ${fmtNum(longRunCapKm)} km.`;
  return { text, weeklyCapKm, longRunCapKm };
}

function formatTargets(targets) {
  const list = (Array.isArray(targets) ? targets : []).filter(isPlainObject);
  return list.map((t) => `- ${t.exerciseId}: ${t.loadKg !== null && t.loadKg !== undefined ? `${fmtNum(t.loadKg)} kg` : "no load yet"}${t.reps ? ` × ${t.reps}` : ""}${t.note ? ` (${clip(t.note, 100)})` : ""}`).join("\n");
}

function planJsonForPrompt(plan, maxBytes) {
  if (!isPlainObject(plan)) return "";
  const { validation, createdAt, approvedAt, ...rest } = plan;
  return truncateBytes(JSON.stringify(compactValue(rest) ?? {}), maxBytes);
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
 * @param {{ avgWeeklyKm: number, longestKm: number, weeks: number }} [d.runLoad]
 * @param {object} [d.previousPlan]
 * @param {string[]} [d.previousDone] workout ids done in the previous plan
 * @param {object} [d.draft] the draft to revise (revise mode)
 * @param {string} [d.instruction]
 * @param {string} [d.pacesText] formatted easy pace / race / pace zones (see formatPaces)
 * @param {object[]} d.allowedLocations see formatAllowedExercises
 * @param {object} [d.digest] progress.progressionDigest result; leads the prompt and overrides profile baselines
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
    ...(isPlainObject(d.digest) ? [ADAPT_INSTRUCTION] : []),
  ].join("\n");
  const fromHistory = isPlainObject(d.digest) && d.digest.basis === "history";
  const runLogged = fromHistory && d.digest.run?.logged === true;

  const sessions = (Array.isArray(d.recentSessions) ? d.recentSessions : [])
    .map((s) => formatSessionCompact(s, { notesChars: 100, withId: false })).join("\n");
  const prev = isPlainObject(d.previousPlan)
    ? `${formatPlanOverview(d.previousPlan, { done: d.previousDone, label: "Previous plan" })}\n` +
      (d.previousPlan.workouts || []).map(formatWorkout).join("\n\n")
    : "";

  const sections = [
    { title: DIGEST_HEADING, body: isPlainObject(d.digest) ? formatDigest(d.digest) : "", maxBytes: B.digest },
    { title: "Coaching rules", body: String(d.rules ?? "").trim() || "Plan evidence-based training across the owner's modalities: progressive overload, 10-20 hard sets per muscle per week for strength goals, ~80% easy running, hard/easy alternation, scale conditioning to experience.", maxBytes: B.rules },
    { title: PROFILE_HEADING, body: (fromHistory ? "Constraints and goals; onboarding baselines with logged history were removed (the digest wins).\n" : "") +
      "```json\n" + JSON.stringify(compactValue(profileForPlan(d.profile, d.digest)) ?? {}) + "\n```", maxBytes: B.profile },
    { title: "Coach memory", body: d.memoryText ?? "", maxBytes: B.memory },
    { title: "Training summary (computed by the app)", body: d.trainingSummary ? compactJson(d.trainingSummary) : "No history yet.", maxBytes: B.trainingSummary },
    { title: RUN_CAPS_HEADING, body: runCaps(d.runLoad).text },
    { title: "Sessions, last 14 days (oldest first)", body: sessions || "None logged.", maxBytes: B.sessions },
    { title: "App-computed next targets (copy into loadKg)", body: formatTargets(d.targets), maxBytes: B.targets },
    { title: "Previous plan", body: prev, maxBytes: B.previousPlan },
    { title: "Current draft to revise (JSON)", body: revise ? planJsonForPrompt(d.draft, B.draft) : "", maxBytes: B.draft },
    { title: "Owner's instruction", body: clip(d.instruction ?? "", 1500) || (revise ? "(none: fix anything that looks off)" : "(none)"), maxBytes: B.instruction },
    { title: runLogged ? "Running paces from the onboarding profile (fallback only: the digest's logged paces win)" : "Running paces (computed by the app)", body: d.pacesText ?? "", maxBytes: 2000 },
    { title: `${ALLOWED_HEADING}: the provided exercise list (the only exerciseIds you may use, by location and movement pattern)`, body: formatAllowedExercises(d.allowedLocations) },
    { title: "Plan JSON spec (output format)", body: `${PLAN_JSON_SPEC}\n\nExample of the shape (not the content):\n${PLAN_EXAMPLE}` },
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
    ? "basis \"history\": plan from these numbers. week = last week's completion; strength[].next = the app's next target (kg/reps); adjustments = what to do per scope (follow them; kg/kmMax/longMax are limits); baselines = profile fallbacks only for items without history."
    : "basis \"profile\": no logged sessions yet. Calibration week from profile baselines (see adjustments and baselines).";
  return `${key}\n\`\`\`json\n${JSON.stringify(digest)}\n\`\`\``;
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
 * @param {{ avgWeeklyKm: number, longestKm: number, weeks: number }} [d.runLoad]
 * @param {object[]} d.allowedLocations
 * @param {string[]} [d.locationIds]
 * @returns {string}
 */
export function buildRepairPrompt(d) {
  const errors = (Array.isArray(d.errors) ? d.errors : []).filter(isPlainObject).slice(0, 30);
  const problems = errors.map((e) => `- [${e.code}]${e.workoutId ? ` ${e.workoutId}` : ""}${e.path ? ` ${e.path}` : ""}: ${clip(e.message, 200)}`).join("\n");
  const minutes = Number(d.minutesPerSession) || null;
  const header = [
    REPAIR_PROMPT_MARKER,
    "The training plan JSON below failed the app's validator. Fix ONLY the listed problems and keep everything else the same.",
    "Reply with ONLY the complete corrected plan as one JSON object of the same shape.",
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
    { title: "Plan to fix (JSON)", body: planJsonForPrompt(d.plan, 60000) },
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
