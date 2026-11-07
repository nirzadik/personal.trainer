// A fake `sample` capability for dev mode and tests (owner: Agent B). See CONTRACT.md §5.4 and sample.d.ts.
//
// Behaves like the real function where the app can observe it: one promise per call, streaming `onText`
// ({ text, delta }, text grows, blank line between rounds), `signal` abort → reject { code: "cancelled", text? },
// tools whose `execute` really runs (keyword-scripted), `.json()` returning a valid Plan for plan prompts,
// `.limits()`, and input validation that rejects `invalid_request` like the platform does.
//
// Dev helpers: type "!fail <code>" in the chat to make the next reply fail with that sample error code.
// `mock.calls` and `mock.toolCalls` record what was asked (for tests and debugging).

import { MODE_LINE } from "./prompts/chat.js";
import { ALLOWED_HEADING, PLAN_PROMPT_MARKER, PROFILE_HEADING, REPAIR_PROMPT_MARKER, RUN_CAPS_HEADING } from "./prompts/plan.js";
import { SUMMARY_PROMPT_MARKER } from "./prompts/summary.js";
import { COMMENT_PROMPT_MARKER } from "./prompts/comment.js";

/**
 * Exercise ids the mock falls back to when neither the prompt nor the catalog lists any.
 * They are ids A's catalog is expected to contain.
 */
export const MOCK_FALLBACK_EXERCISES = Object.freeze({
  back_squat: "squat", bench_press: "h_push", deadlift: "hinge", pull_up: "v_pull", overhead_press: "v_push",
  barbell_row: "h_pull", kettlebell_swing: "hinge", burpee: "plyo", rower: "cardio",
});

const LIMITS = Object.freeze({ maxPromptBytes: 262144, tools: Object.freeze({ maxCount: 16 }), modelTiers: Object.freeze(["default", "complex", "quick"]) });
const TOOL_NAME_RE = /^[A-Za-z0-9_-]{1,128}$/;
const ABORTED = Symbol("aborted");
const encoder = new TextEncoder();

const PREFERRED = {
  squat: ["back_squat", "goblet_squat", "front_squat", "leg_press", "hack_squat", "air_squat"],
  hinge: ["deadlift", "romanian_deadlift", "trap_bar_deadlift", "hip_thrust", "dumbbell_romanian_deadlift", "kettlebell_deadlift", "glute_bridge"],
  lunge: ["bulgarian_split_squat", "walking_lunge", "reverse_lunge", "step_up", "lunge"],
  h_push: ["bench_press", "dumbbell_bench_press", "incline_dumbbell_press", "push_up", "machine_chest_press"],
  v_push: ["overhead_press", "dumbbell_shoulder_press", "pike_push_up", "landmine_press"],
  h_pull: ["barbell_row", "dumbbell_row", "seated_cable_row", "chest_supported_row", "inverted_row"],
  v_pull: ["pull_up", "lat_pulldown", "chin_up", "assisted_pull_up", "band_pulldown"],
  core: ["plank", "hanging_knee_raise", "dead_bug", "ab_wheel_rollout", "pallof_press", "side_plank"],
  isolation: ["dumbbell_curl", "triceps_pushdown", "lateral_raise", "seated_leg_curl", "standing_calf_raise", "face_pull"],
};
const CONDITIONING_PREFERRED = [
  "kettlebell_swing", "burpee", "rower", "wall_ball", "box_jump", "assault_bike", "air_squat", "push_up",
  "thruster", "double_under", "single_under", "mountain_climber", "ski_erg", "dumbbell_snatch", "jumping_jack",
];
const EQUIPMENT_BUNDLES = {
  commercial: ["barbell", "plates", "squat_rack", "bench", "adjustable_bench", "dumbbells", "kettlebell", "cable_machine", "lat_pulldown", "seated_row", "leg_press", "leg_curl", "leg_extension", "pullup_bar", "dip_bars", "plyo_box", "jump_rope", "wall_ball", "medicine_ball", "bands", "ab_wheel", "rower", "assault_bike", "treadmill"],
  home: ["barbell", "plates", "squat_rack", "adjustable_bench", "dumbbells", "kettlebell", "pullup_bar", "bands", "jump_rope"],
  dumbbells: ["dumbbells", "adjustable_bench"],
  bodyweight: [],
};
const NAME_TO_ID = [
  [/front squat/, "front_squat"], [/goblet/, "goblet_squat"], [/squat/, "back_squat"], [/incline/, "incline_dumbbell_press"],
  [/db bench|dumbbell bench/, "dumbbell_bench_press"], [/bench/, "bench_press"], [/rdl|romanian/, "romanian_deadlift"],
  [/deadlift|dead lift/, "deadlift"], [/overhead|ohp|shoulder press|military/, "overhead_press"], [/pull ?-?ups?|chin/, "pull_up"],
  [/pulldown/, "lat_pulldown"], [/db row|dumbbell row/, "dumbbell_row"], [/row/, "barbell_row"], [/lunge/, "walking_lunge"],
  [/hip thrust/, "hip_thrust"], [/swing/, "kettlebell_swing"], [/curl/, "dumbbell_curl"], [/dip/, "dip"], [/push ?-?ups?/, "push_up"],
];

// ---------- small utils ----------

const isObj = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
const bytes = (s) => encoder.encode(String(s)).length;
const round1 = (x) => Math.round(x * 10) / 10;
const roundHalf = (x) => Math.round(x * 2) / 2;
const titleCase = (id) => String(id).replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());
const fail = (code, message) => ({ code, message });
function fmtTime(sec) {
  const s = Math.round(sec);
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), r = String(s % 60).padStart(2, "0");
  return h ? `${h}:${String(m).padStart(2, "0")}:${r}` : `${m}:${r}`;
}
function parseClock(str) {
  const parts = String(str).split(":").map(Number);
  if (parts.some((n) => !Number.isFinite(n))) return null;
  return parts.length === 3 ? parts[0] * 3600 + parts[1] * 60 + parts[2] : parts.length === 2 ? parts[0] * 60 + parts[1] : parts[0] * 60;
}
function sleep(ms, signal) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) { reject(ABORTED); return; }
    const onAbort = () => { clearTimeout(timer); reject(ABORTED); };
    const timer = setTimeout(() => { signal?.removeEventListener?.("abort", onAbort); resolve(); }, Math.max(0, ms));
    signal?.addEventListener?.("abort", onAbort, { once: true });
  });
}
function hashOf(s) {
  let h = 0;
  for (const ch of String(s)) h = (h * 31 + ch.codePointAt(0)) >>> 0;
  return h;
}

// ---------- validation (mirrors the platform's invalid_request rules the app could hit) ----------

function validateCall(input, options, verb) {
  if (options !== undefined && !isObj(options)) throw fail("invalid_request", "options must be a plain object");
  const o = options ?? {};
  if (typeof input === "string") {
    if (!input.trim()) throw fail("invalid_request", "input is empty");
  } else if (Array.isArray(input)) {
    if (!input.length) throw fail("invalid_request", "input has no turns");
    input.forEach((t, i) => {
      if (!isObj(t) || (t.role !== "user" && t.role !== "assistant")) throw fail("invalid_request", `turn ${i} has an invalid role`);
      if (typeof t.content !== "string" || !t.content.trim()) throw fail("invalid_request", `turn ${i} has empty content`);
    });
    if (input[0].role !== "user" || input[input.length - 1].role !== "user") throw fail("invalid_request", "turns must start and end with a user turn");
  } else {
    throw fail("invalid_request", "input must be a string or an array of turns");
  }
  const text = typeof input === "string" ? input : input.map((t) => t.content).join("");
  if (bytes(text) > LIMITS.maxPromptBytes) throw fail("prompt_too_large", `input is ${bytes(text)} bytes`);
  if (o.onText !== undefined && typeof o.onText !== "function") throw fail("invalid_request", "onText must be a function");
  if (o.signal !== undefined && !(typeof o.signal === "object" && o.signal && "aborted" in o.signal)) throw fail("invalid_request", "signal must be an AbortSignal (pass ctl.signal)");
  if (o.modelTier !== undefined && ![...LIMITS.modelTiers, "inherit"].includes(o.modelTier)) throw fail("invalid_request", `unknown modelTier ${o.modelTier}`);
  if (o.cache !== undefined && !(typeof o.cache === "boolean" || isObj(o.cache))) throw fail("invalid_request", "cache must be true, false or {gcTime, refresh}");
  if (o.tools !== undefined) {
    if (!Array.isArray(o.tools)) throw fail("invalid_request", "tools must be an array");
    if (o.tools.length > LIMITS.tools.maxCount) throw fail("invalid_request", `at most ${LIMITS.tools.maxCount} tools`);
    if (o.cache !== undefined && o.cache !== false) throw fail("invalid_request", "cache cannot be used with tools (pass cache: false or omit it)");
    const names = new Set();
    o.tools.forEach((t, i) => {
      if (!isObj(t) || !TOOL_NAME_RE.test(String(t.name))) throw fail("invalid_request", `tools[${i}].name is invalid`);
      if (names.has(t.name)) throw fail("invalid_request", `tools[${i}].name is not unique`);
      names.add(t.name);
      if (typeof t.description !== "string" || !t.description.trim() || bytes(t.description) > 1024) throw fail("invalid_request", `tools[${i}].description must be 1 B-1 KB`);
      if (t.inputSchema !== undefined && (!isObj(t.inputSchema) || t.inputSchema.type !== "object" || bytes(JSON.stringify(t.inputSchema)) > 4096)) throw fail("invalid_request", `tools[${i}].inputSchema must be an object schema ≤ 4 KB`);
      if (typeof t.execute !== "function") throw fail("invalid_request", `tools[${i}].execute must be a function`);
    });
  }
  void verb;
}

// ---------- prompt reading ----------

function promptParts(input) {
  if (typeof input === "string") return { instructions: "", lastUser: input, turns: [{ role: "user", content: input }], whole: input };
  return {
    instructions: input[0].content,
    lastUser: input[input.length - 1].content,
    turns: input,
    whole: input.map((t) => t.content).join("\n\n"),
  };
}

function sectionBody(text, heading) {
  const i = text.indexOf(heading);
  if (i < 0) return "";
  const start = text.indexOf("\n", i);
  if (start < 0) return "";
  const rest = text.slice(start + 1);
  const next = rest.search(/\n#{1,2} /);
  return next < 0 ? rest : rest.slice(0, next);
}

function parseProfileFromPrompt(text) {
  const body = sectionBody(text, PROFILE_HEADING);
  const m = body.match(/```json\n([\s\S]*?)\n```/);
  if (m) { try { return JSON.parse(m[1]); } catch { /* fall through */ } }
  const onboarding = text.match(/## Owner profile \(full JSON[^\n]*\n(\{[^\n]*\})/);
  if (onboarding) { try { return JSON.parse(onboarding[1]); } catch { /* fall through */ } }
  const chat = text.match(/## Owner profile \(JSON\)\n(\{[^\n]*\})/);
  if (chat) { try { return JSON.parse(chat[1]); } catch { /* fall through */ } }
  return null;
}

/** → [{ locations: [ids], byPattern: { pattern: [ids] } }] */
function parseAllowed(text) {
  const i = text.indexOf(`# ${ALLOWED_HEADING}`);
  if (i < 0) return [];
  const rest = text.slice(i);
  const end = rest.slice(2).search(/\n# /);
  const body = end < 0 ? rest : rest.slice(0, end + 2);
  const out = [];
  let cur = null;
  for (const line of body.split("\n")) {
    const loc = line.match(/^## location (.+)$/);
    if (loc) {
      cur = { locations: loc[1].split(/,\s*(?![^(]*\))/).map((s) => s.replace(/\s*\(.*\)$/, "").trim()), byPattern: {} };
      out.push(cur);
      continue;
    }
    const row = line.match(/^([a-z_]+): (.+)$/);
    if (row && cur) cur.byPattern[row[1]] = row[2].split(/,\s*(?![^(]*\))/).map((s) => s.replace(/\s*\(.*\)$/, "").trim()).filter(Boolean);
  }
  return out;
}

async function catalogAllowed(catalogOpt, profile) {
  let cat = catalogOpt;
  if (!cat) { try { cat = await import("./catalog.js"); } catch { cat = null; } }
  const exercises = Array.isArray(cat?.EXERCISES) ? cat.EXERCISES : [];
  const items = new Set((profile?.equipment?.locations ?? []).flatMap((l) => (Array.isArray(l?.items) ? l.items : [])));
  const byPattern = {};
  for (const ex of exercises) {
    if (!isObj(ex) || !ex.id) continue;
    const all = ex.equipment?.all ?? [], any = ex.equipment?.any ?? [];
    if (items.size && !(all.every((e) => items.has(e)) && (!any.length || any.some((e) => items.has(e))))) continue;
    (byPattern[ex.pattern || "other"] ??= []).push(ex.id);
  }
  if (Object.keys(byPattern).length) return byPattern;
  const fb = {};
  for (const [id, p] of Object.entries(MOCK_FALLBACK_EXERCISES)) (fb[p] ??= []).push(id);
  return fb;
}

// ---------- plan building ----------

function pickFrom(byPattern, pattern, variant, used) {
  const ids = byPattern[pattern] ?? [];
  if (!ids.length) return null;
  const pref = (PREFERRED[pattern] ?? []).filter((id) => ids.includes(id) && !used.has(id));
  const pool = [...pref, ...ids.filter((id) => !pref.includes(id) && !used.has(id))];
  return pool.length ? pool[Math.min(variant, pool.length - 1)] : null;
}

function strengthItem(id, byPattern, pattern, main) {
  const alternatives = (byPattern[pattern] ?? []).filter((x) => x !== id).slice(0, 2);
  return {
    exerciseId: id, name: titleCase(id), sets: 3, reps: main ? "5" : "8-12", targetRir: 2, loadKg: null,
    restSec: main ? 180 : 90, progression: main ? "linear" : "double", incrementKg: main ? 2.5 : 2, tempo: null,
    notes: "", alternatives, supersetGroup: null,
  };
}

function buildMockPlan({ workoutCount, minutes, profile, allowedBlocks, catalogPatterns, weeklyCapKm, longRunCapKm, instruction }) {
  const locs = Array.isArray(profile?.equipment?.locations) ? profile.equipment.locations : [];
  const defLoc = profile?.equipment?.defaultLocationId || locs[0]?.id || allowedBlocks[0]?.locations?.[0] || "gym";
  const block = allowedBlocks.find((b) => b.locations.includes(defLoc)) ?? allowedBlocks[0];
  const byPattern = block?.byPattern ?? catalogPatterns ?? {};
  const locationId = block?.locations?.includes(defLoc) ? defLoc : (block?.locations?.[0] ?? defLoc);
  const items = new Set(locs.flatMap((l) => (Array.isArray(l?.items) ? l.items : [])));
  const canRun = ["outdoor_route", "treadmill", "track"].some((x) => items.has(x));
  const runLoc = locs.find((l) => ["outdoor_route", "treadmill", "track"].some((x) => l?.items?.includes(x)))?.id ?? locationId;
  const mods = profile?.goals?.modalities ?? { strength: true };
  const kinds = [];
  if (mods.strength !== false) kinds.push("strength");
  if (mods.running && canRun) kinds.push("run");
  if (mods.conditioning) kinds.push("conditioning");
  if (!kinds.length) kinds.push("strength");
  const n = Math.min(7, Math.max(1, workoutCount || 3));
  const types = Array.from({ length: n }, (_, i) => kinds[i % kinds.length]);
  const strengthDays = types.filter((t) => t === "strength").length;
  const runDays = types.filter((t) => t === "run").length;
  const len = Math.max(20, minutes || 60);
  const itemCount = Math.min(6, Math.max(2, Math.floor((len - 12) / 10)));
  const templates = strengthDays >= 4
    ? [["Upper A", ["h_push", "h_pull", "v_push", "v_pull", "isolation", "core"]], ["Lower A", ["squat", "hinge", "lunge", "core", "isolation", "h_pull"]]]
    : [["Full body A", ["squat", "h_push", "h_pull", "hinge", "core", "isolation"]], ["Full body B", ["hinge", "v_push", "v_pull", "lunge", "core", "isolation"]]];
  const pace = Number(profile?.experience?.running?.easyPaceSecPerKm) || 405;
  const budget = Math.max(2, (weeklyCapKm || 5) * 0.9);
  const longKm = runDays >= 2 ? Math.max(1.5, roundHalf(Math.min(longRunCapKm || 4, budget * 0.4))) : 0;
  const otherKm = runDays ? Math.max(1.5, roundHalf(Math.min(longRunCapKm || 4, (budget - longKm) / Math.max(1, runDays - (longKm ? 1 : 0))))) : 0;
  const condIds = CONDITIONING_PREFERRED.filter((id) => Object.values(byPattern).some((ids) => ids.includes(id)));
  for (const id of ["burpee", "kettlebell_swing", "rower"]) if (condIds.length < 3 && !condIds.includes(id) && Object.values(byPattern).some((ids) => ids.includes(id))) condIds.push(id);
  if (condIds.length < 2) condIds.push(...["burpee", "air_squat"].filter((x) => !condIds.includes(x)));

  let s = 0, r = 0, c = 0;
  const workouts = types.map((type, i) => {
    const id = `W${i + 1}`;
    const warmup = { kind: "warmup", minutes: 8, items: [{ name: "Easy cardio", detail: "5 min, nose breathing" }, { name: "Ramp-up sets", detail: "2-3 lighter sets of the first lift" }] };
    if (type === "strength") {
      const [title, patterns] = templates[s % templates.length];
      const variant = Math.floor(s / templates.length) % 2;
      s += 1;
      const used = new Set();
      const list = [];
      for (const p of patterns) {
        if (list.length >= itemCount) break;
        const ex = pickFrom(byPattern, p, variant, used);
        if (!ex) continue;
        used.add(ex);
        list.push(strengthItem(ex, byPattern, p, list.length < 2));
      }
      for (const p of Object.keys(byPattern)) {
        if (list.length >= Math.min(2, itemCount)) break;
        const ex = pickFrom(byPattern, p, 0, used);
        if (ex) { used.add(ex); list.push(strengthItem(ex, byPattern, p, false)); }
      }
      const est = Math.min(len, 8 + list.reduce((m, it) => m + Math.ceil((it.sets * (it.restSec + 40)) / 60), 0));
      return { id, title: s > templates.length ? `${title.replace(/ [AB]$/, "")} ${variant ? "B" : "A"}` : title, type, locationId, estMinutes: est, intent: "Main lifts first at RIR 2; add load when every set hits the top of the range.", blocks: [warmup, { kind: "strength", items: list }] };
    }
    if (type === "run") {
      r += 1;
      const isLong = longKm && r === runDays;
      const km = isLong ? longKm : otherKm;
      const est = Math.min(len, Math.ceil((km * pace) / 60) + 5);
      return {
        id, title: isLong ? "Long easy run" : "Easy run", type, locationId: runLoc, estMinutes: est,
        intent: isLong ? "Build aerobic endurance at a conversational pace." : "Easy aerobic volume; you should be able to talk.",
        blocks: [{
          kind: "run", runType: isLong ? "long" : "easy", warmupMin: null, cooldownMin: null, totalKm: km,
          segments: [{ reps: 1, distanceM: Math.round(km * 1000), durationSec: null, target: { paceSecPerKm: [pace - 15, pace + 15], hrZone: 2, rpe: 3 }, recoverySec: null, recoveryType: null }],
          notes: "Walk breaks are fine; keep it easy.",
        }],
      };
    }
    c += 1;
    const amrap = Math.max(8, Math.min(16, len - 20));
    const condItems = condIds.slice(0, 3).map((ex, k) => ({
      exerciseId: ex, name: titleCase(ex), reps: ex === "rower" || ex === "assault_bike" || ex === "ski_erg" ? null : [10, 12, 15][k] ?? 10,
      calories: ex === "rower" || ex === "assault_bike" || ex === "ski_erg" ? 12 : null, distanceM: null, durationSec: null, loadKg: null, notes: "",
    }));
    return {
      id, title: c > 1 ? "Conditioning B" : "Conditioning A", type: "conditioning", locationId, estMinutes: 8 + amrap + 5,
      intent: "Steady, repeatable effort; finish able to keep talking in short sentences.",
      blocks: [warmup, { kind: "conditioning", format: "AMRAP", minutes: amrap, rounds: null, timeCapMin: null, workSec: null, restSec: null, items: condItems, targetRpe: 7, scaling: "Cut reps by a third or slow the pace; keep moving.", notes: "" },
        { kind: "cooldown", minutes: 5, items: [{ name: "Walk", detail: "3 min" }, { name: "Stretch", detail: "hips and calves" }] }],
    };
  });
  const goal = profile?.goals?.primary || "general fitness";
  return {
    focus: `${n}-day ${kinds.join(" + ")} week for ${String(goal).slice(0, 50)}`,
    rationale: `Built around your goal (${String(goal).slice(0, 60)}) and ${n} sessions of about ${len} minutes. Main lifts sit at RIR 2 so loads can climb steadily${runDays ? ", and running stays easy and within this week's km cap" : ""}.${instruction ? ` You asked: "${String(instruction).slice(0, 80)}".` : ""}`,
    workouts,
    notes: ["Mock plan (dev mode): generated without Claude.", "Swap any exercise for a listed alternative if it doesn't feel right."],
  };
}

// ---------- chat scripts ----------

function exerciseIdFor(name) {
  const n = String(name ?? "").toLowerCase();
  for (const [re, id] of NAME_TO_ID) if (re.test(n)) return id;
  return null;
}

/** Parse "did 100x5,5,4 squats, knee 3/10" style reports into a log_session `session`. */
export function parseWorkoutReport(text) {
  const t = String(text ?? "");
  const lower = t.toLowerCase();
  const strength = [];
  const re = /(\d+(?:\.\d+)?)\s*(?:kg\s*)?[x×]\s*(\d+(?:\s*,\s*\d+)*)(?:\s*(?:@|at)\s*(\d+(?:\.\d+)?)\s*(?:kg)?)?\s*(?:of\s+|on\s+)?([a-z][a-z\- ]*?)?(?=\s*(?:[,.;]|\band\b|\bthen\b|\bwith\b|$))/gi;
  for (const m of t.matchAll(re)) {
    let name = (m[4] ?? "").trim();
    if (!name) {
      const before = t.slice(0, m.index).toLowerCase().replace(/\b(did|i|just|today|and|then|some|my)\b/g, " ").trim().split(/[\s,]+/).slice(-2).join(" ");
      name = before;
    }
    if (!name) continue;
    const a = Number(m[1]);
    const reps = m[2].split(",").map((x) => Number(x.trim())).filter(Number.isFinite);
    const sets = m[3] ? Array.from({ length: Math.min(10, a) }, () => ({ type: "work", loadKg: Number(m[3]), reps: reps[0], rir: null })) : reps.map((rp) => ({ type: "work", loadKg: a, reps: rp, rir: null }));
    strength.push({ exerciseId: exerciseIdFor(name), name, sets });
  }
  const rir = lower.match(/\brir\s*(\d)/);
  const rpe = lower.match(/\brpe\s*(\d{1,2})/);
  for (const ex of strength) for (const st of ex.sets) st.rir = rir ? Number(rir[1]) : null;
  let run = null;
  const runM = lower.match(/(\d+(?:\.\d+)?)\s*(?:k|km)\b(?:[^0-9]{0,20}?(?:in|,)\s*(\d+(?::\d{2}){1,2}|\d+\s*min))?/);
  if (runM && /\b(ran|run|jog|km|5k|10k)\b/.test(lower)) {
    const durationSec = runM[2] ? (runM[2].includes(":") ? parseClock(runM[2]) : Number(runM[2].replace(/\D/g, "")) * 60) : null;
    run = { runType: /tempo/.test(lower) ? "tempo" : /interval/.test(lower) ? "intervals" : /long/.test(lower) ? "long" : "easy", distanceKm: Number(runM[1]), durationSec };
  }
  const conditioning = [];
  const fmt = lower.match(/\b(amrap|emom|for time|tabata|chipper|metcon|wod|hiit)\b/);
  if (fmt) {
    const rounds = lower.match(/(\d+)\s*(?:rounds|rds)/);
    const format = { amrap: "AMRAP", emom: "EMOM", "for time": "FOR_TIME", tabata: "TABATA", chipper: "CHIPPER" }[fmt[1]] ?? "AMRAP";
    conditioning.push({ format, description: t.slice(0, 160), result: { rounds: rounds ? Number(rounds[1]) : null, reps: null, timeSec: null, calories: null, completed: true }, scaled: /scaled/.test(lower), rpe: rpe ? Number(rpe[1]) : null, notes: "" });
  }
  const pain = [];
  for (const m of lower.matchAll(/\b(knee|back|lower back|shoulder|hip|ankle|elbow|wrist|neck|hamstring|calf|achilles|foot)\b[^0-9/]{0,15}(\d{1,2})\s*\/\s*10/g)) {
    pain.push({ area: m[1], score: Math.min(10, Number(m[2])), when: /after/.test(lower) ? "after" : "during" });
  }
  const parsedSomething = strength.length || run || conditioning.length;
  if (!parsedSomething) {
    strength.push({ exerciseId: "back_squat", name: "Back squat", sets: [5, 5, 5].map((reps) => ({ type: "work", loadKg: 100, reps, rir: 2 })) });
  }
  const kinds = [strength.length && "strength", run && "run", conditioning.length && "conditioning"].filter(Boolean);
  const wid = lower.match(/\bw(\d)\b/);
  const session = {
    type: kinds.length > 1 ? "hybrid" : kinds[0],
    status: /\bpartial|cut short|only did\b/.test(lower) ? "partial" : "done",
    ...(wid ? { workoutId: `W${wid[1]}` } : /\b(today'?s|the plan|my workout|the workout|planned|up next|session)\b/.test(lower) || !parsedSomething ? { workoutId: "next" } : {}),
    ...(strength.length ? { strength } : {}),
    ...(run ? { run } : {}),
    ...(conditioning.length ? { conditioning } : {}),
    ...(pain.length ? { pain } : {}),
    ...(rpe && !conditioning.length ? { sessionRpe: Number(rpe[1]) } : {}),
    notes: t.slice(0, 200),
  };
  return { session, parsedSomething: Boolean(parsedSomething) };
}

function asObj(result) {
  if (isObj(result)) return result;
  if (typeof result === "string") { try { const v = JSON.parse(result); return isObj(v) ? v : { text: result }; } catch { return { text: result }; } }
  return { text: String(result) };
}

function describeSession(session) {
  const lines = [];
  for (const ex of session.strength ?? []) {
    const work = ex.sets.map((st) => st.reps).join(", ");
    const load = ex.sets[0]?.loadKg;
    lines.push(`- **${titleCase(ex.exerciseId || ex.name)}** ${load ? `${load} kg × ` : ""}${work}`);
  }
  if (session.run) lines.push(`- **Run** ${session.run.distanceKm} km${session.run.durationSec ? ` in ${fmtTime(session.run.durationSec)}` : ""}`);
  for (const cd of session.conditioning ?? []) lines.push(`- **${cd.format}**${cd.result?.rounds ? ` ${cd.result.rounds} rounds` : ""}`);
  return lines.join("\n");
}

function painAdvice(pain) {
  if (!pain?.length) return "";
  const worst = pain.reduce((a, b) => (b.score > a.score ? b : a));
  if (worst.score <= 3) return `${titleCase(worst.area)} at ${worst.score}/10 is in the green zone. Keep an eye on it: if it climbs above 3 or is worse tomorrow morning, tell me and we'll adjust.`;
  if (worst.score <= 5) return `${titleCase(worst.area)} at ${worst.score}/10 is amber. Next time cut the load or range that provokes it, and check how it feels tomorrow morning.`;
  return `${titleCase(worst.area)} at ${worst.score}/10 is too high to train through. Stop the movements that provoke it and get it checked if it doesn't settle within a few days.`;
}

const ONBOARDING_QUESTIONS = {
  screening: "### Quick health check\nAnswer yes or no to each:\n1. Has a doctor ever said you have a heart condition or high blood pressure?\n2. Do you feel chest pain at rest, in daily life, or when active?\n3. Have you lost balance from dizziness, or lost consciousness, in the last 12 months?\n4. Do you have another chronic medical condition?\n5. Do you take prescribed medication for a chronic condition?\n6. Do you have a bone, joint or soft-tissue problem that exercise could make worse?\n7. Has a doctor said you should only exercise under medical supervision?",
  goals: "### Goals\nWhat do you most want from training over the next 12 weeks: gym strength, running, HIIT/conditioning, or a mix? Any race or event coming up?",
  schedule: "### Schedule\nHow many days a week can you train, and about how long per session? Any days that work best?",
  equipment: "### Equipment\nWhere do you train and what's there? Pick the closest:\n- **Commercial gym**: barbells, racks, machines, cardio\n- **Home gym**: rack, barbell, dumbbells\n- **Dumbbells only**: tell me the heaviest pair\n- **Bodyweight + running**",
  experience: "### Experience\nHow long have you been training? Any recent numbers you know (like squat 100×5), your weekly running km, and how familiar HIIT/CrossFit-style workouts are?",
};

function onboardingStep(profile) {
  if (!profile) return null;
  if (!profile.screening?.outcome) return "screening";
  if (!profile.goals?.primary) return "goals";
  if (!profile.schedule?.notes && !(profile.schedule?.preferredDays ?? []).length) return "schedule";
  const locs = profile.equipment?.locations ?? [];
  if (!locs.some((l) => (l?.items ?? []).length || l?.notes)) return "equipment";
  if (!profile.experience?.level) return "experience";
  return "done";
}

function onboardingPatch(step, answer) {
  const a = String(answer ?? "");
  const lower = a.toLowerCase();
  if (step === "screening") {
    const yes = /\byes\b/.test(lower);
    const answers = Object.fromEntries(["heartCondition", "chestPain", "dizziness", "chronicCondition", "medications", "boneJoint", "supervisedOnly"].map((k) => [k, false]));
    if (yes) answers.boneJoint = true;
    return { screening: { answers, notes: yes ? a.slice(0, 160) : "", outcome: yes ? "cleared_with_modifications" : "cleared" } };
  }
  if (step === "goals") {
    const modalities = {
      strength: /strength|lift|gym|muscle|strong|squat|bench/.test(lower),
      running: /run|5k|10k|marathon|half|race|jog/.test(lower),
      conditioning: /hiit|crossfit|conditioning|metcon|fitness|cardio/.test(lower),
    };
    if (!Object.values(modalities).some(Boolean)) modalities.strength = true;
    const km = lower.match(/(\d+(?:\.\d+)?)\s*k(?:m)?\b/);
    return { goals: { primary: a.trim().slice(0, 90) || "Get fitter and stronger", modalities, ...(km && modalities.running ? { event: { type: "race", distanceKm: Number(km[1]), date: null, goalTimeSec: null } } : {}) } };
  }
  if (step === "schedule") {
    const days = lower.match(/(\d)\s*(?:x|days?|times|sessions)/);
    const mins = lower.match(/(\d{2,3})\s*(?:min|minutes|mins)/) ?? (/\b(an|one|1) hour\b/.test(lower) ? [null, "60"] : null);
    const preferredDays = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"].filter((d) => lower.includes(d) || lower.includes(d.slice(0, 3) + " "));
    return { schedule: { daysPerWeek: days ? Number(days[1]) : 3, minutesPerSession: mins ? Number(mins[1]) : 60, preferredDays, notes: a.trim().slice(0, 120) || "flexible" } };
  }
  if (step === "equipment") {
    const bundle = /bodyweight|no equipment|nothing/.test(lower) ? "bodyweight" : /home/.test(lower) ? "home" : /dumbbell/.test(lower) && !/gym/.test(lower) ? "dumbbells" : "commercial";
    const items = [...EQUIPMENT_BUNDLES[bundle]];
    if (/run|outside|outdoor|road|park/.test(lower) || bundle === "bodyweight") items.push("outdoor_route");
    const db = lower.match(/(\d{1,2})\s*kg/);
    const name = { commercial: "Gym", home: "Home gym", dumbbells: "Home", bodyweight: "Anywhere" }[bundle];
    return { equipment: { defaultLocationId: "gym", locations: [{ id: "gym", name, items, dumbbellMaxKg: db ? Number(db[1]) : null, kettlebellsKg: [], notes: bundle === "bodyweight" ? "bodyweight + running" : "" }] } };
  }
  if (step === "experience") {
    const level = /advanced|competit/.test(lower) ? "advanced" : /intermediate|few years|\b[3-9] years/.test(lower) ? "intermediate" : /new|beginner|never|just start|novice/.test(lower) ? "novice" : "late_novice";
    const years = lower.match(/(\d+(?:\.\d+)?)\s*years?/);
    const km = lower.match(/(\d+(?:\.\d+)?)\s*km/);
    return {
      experience: {
        level, trainingAgeYears: years ? Number(years[1]) : null,
        running: { currentWeeklyKm: km ? Number(km[1]) : null, longestRecentRunKm: null, recentRace: null, easyPaceSecPerKm: null },
        conditioning: { experience: /crossfit|hiit|regular/.test(lower) ? "regular" : /some|bit|little/.test(lower) ? "some" : "none" },
      },
    };
  }
  return { onboarded: true };
}

// ---------- the mock ----------

/**
 * Create a fake `sample` function with `.json()` and `.limits()`, matching sample.d.ts behaviour closely enough
 * for dev mode and tests. Pass `delayMs: 0, chunkMs: 0` in tests for speed.
 * @param {object} [opts]
 * @param {number} [opts.delayMs] "thinking" time before the first text, ms
 * @param {number} [opts.chunkMs] delay between streamed chunks, ms
 * @param {object} [opts.catalog] catalog module to use when a JSON prompt carries no allowed-exercise list
 *   (otherwise `./catalog.js` is imported lazily; if it is empty, MOCK_FALLBACK_EXERCISES are used)
 * @returns {Function & { json: Function, limits: Function, calls: object[], toolCalls: object[] }}
 */
export function createMockSample({ delayMs = 400, chunkMs = 25, catalog = null } = {}) {
  const calls = [];
  const toolCalls = [];

  async function run(verb, input, options) {
    await Promise.resolve(); // never settle synchronously
    validateCall(input, options, verb);
    const o = options ?? {};
    const signal = o.signal;
    if (signal?.aborted) throw { code: "cancelled", message: "The signal was already aborted." };
    const parts = promptParts(input);
    calls.push({ verb, modelTier: o.modelTier ?? "default", cache: o.cache, toolNames: (o.tools ?? []).map((t) => t.name), bytes: bytes(parts.whole), input });

    const state = { text: "" };
    const write = async (chunk) => {
      if (!chunk) return;
      const piece = state.text ? `\n\n${chunk}` : chunk;
      const tokens = piece.match(/\s*\S+/g) ?? [piece];
      for (let i = 0; i < tokens.length; i += 3) {
        await sleep(chunkMs, signal);
        const delta = tokens.slice(i, i + 3).join("");
        state.text += delta;
        if (typeof o.onText === "function" && !signal?.aborted) { try { o.onText({ text: state.text, delta }); } catch { /* like the platform: reported, ignored */ } }
      }
    };
    const tools = new Map((o.tools ?? []).map((t) => [t.name, t]));
    const callTool = async (name, toolInput) => {
      const tool = tools.get(name);
      if (!tool) return null;
      await sleep(Math.round(delayMs / 2), signal);
      toolCalls.push({ name, input: toolInput });
      const ctl = new AbortController();
      const onAbort = () => ctl.abort();
      signal?.addEventListener?.("abort", onAbort, { once: true });
      try {
        const exec = Promise.resolve().then(() => tool.execute(JSON.parse(JSON.stringify(toolInput)), { signal: ctl.signal }));
        const aborted = new Promise((_, reject) => { if (signal) signal.addEventListener("abort", () => reject(ABORTED), { once: true }); });
        const out = await Promise.race([exec, aborted]);
        const json = JSON.stringify(out ?? null);
        return bytes(json) > 32 * 1024 ? "Error: tool result over 32 KB" : out;
      } catch (err) {
        if (err === ABORTED) throw err;
        return `Error: ${err?.message ?? String(err)}`;
      } finally {
        signal?.removeEventListener?.("abort", onAbort);
        ctl.abort();
      }
    };

    try {
      await sleep(o.modelTier === "quick" ? Math.round(delayMs / 4) : delayMs, signal);
      const forced = parts.lastUser.match(/!fail\s+([a-z_]+)/);
      if (forced) {
        throw { code: forced[1], message: `Mock failure requested (${forced[1]}).`, ...(state.text ? { text: state.text } : {}) };
      }
      if (verb === "json") {
        const value = await jsonAnswer(parts, o);
        const raw = JSON.stringify(value);
        for (let i = 0; i < raw.length; i += 400) {
          await sleep(chunkMs, signal);
          const delta = raw.slice(i, i + 400);
          state.text += delta;
          if (typeof o.onText === "function" && !signal?.aborted) { try { o.onText({ text: state.text, delta }); } catch { /* ignored */ } }
        }
        return value;
      }
      await textAnswer(parts, o, { write, callTool, tools });
      if (!state.text.trim()) throw { code: "empty_completion", message: "Mock produced no text." };
      return { text: state.text, truncated: false, modelTierApplied: o.modelTier && o.modelTier !== "inherit" ? o.modelTier : "default" };
    } catch (err) {
      if (err === ABORTED || signal?.aborted) throw { code: "cancelled", message: "The call was cancelled.", ...(state.text ? { text: state.text } : {}) };
      if (isObj(err) && typeof err.code === "string") throw err;
      throw { code: "upstream_error", message: String(err?.message ?? err), ...(state.text ? { text: state.text } : {}) };
    }
  }

  async function jsonAnswer(parts, o) {
    const text = parts.whole;
    if (text.includes(PLAN_PROMPT_MARKER) || text.includes(REPAIR_PROMPT_MARKER)) {
      let profile = parseProfileFromPrompt(text);
      if (!profile && text.includes(REPAIR_PROMPT_MARKER)) profile = null;
      const count = Number(text.match(/exactly (\d+) workouts/)?.[1]) || Number(profile?.schedule?.daysPerWeek) || 3;
      const minutes = Number(text.match(/session length (\d+) min/)?.[1]) || Number(profile?.schedule?.minutesPerSession) ||
        (Number(text.match(/each estMinutes ≤ (\d+)/)?.[1]) || 75) - 15;
      const allowedBlocks = parseAllowed(text);
      const caps = text.match(/weekly total ≤ ([\d.]+) km; any single run ≤ ([\d.]+) km/);
      const catalogPatterns = allowedBlocks.length ? null : await catalogAllowed(catalog, profile);
      const instruction = sectionBody(text, "# Owner's instruction").trim().replace(/^\((none)[^)]*\)$/, "");
      const repairProfile = profile ?? (() => {
        const planJson = sectionBody(text, "# Plan to fix (JSON)").trim();
        try { const p = JSON.parse(planJson); return { schedule: { daysPerWeek: count }, equipment: { defaultLocationId: p.workouts?.[0]?.locationId } }; } catch { return null; }
      })();
      return buildMockPlan({
        workoutCount: count, minutes, profile: profile ?? repairProfile ?? {}, allowedBlocks, catalogPatterns,
        weeklyCapKm: caps ? Number(caps[1]) : 5, longRunCapKm: caps ? Number(caps[2]) : 3, instruction,
      });
    }
    void o;
    if (/JSON array/i.test(text)) return [];
    return { ok: true, note: "mock JSON reply" };
  }

  async function textAnswer(parts, o, { write, callTool, tools }) {
    const whole = parts.whole;
    if (whole.startsWith(SUMMARY_PROMPT_MARKER)) {
      const lines = (whole.split("Older chat excerpt (oldest first):")[1] ?? "").split("\n").filter((l) => l.trim());
      const prev = (whole.match(/Current summary:\n([\s\S]*?)\n\nOlder chat excerpt/)?.[1] ?? "").trim();
      await write([prev && prev !== "(empty)" ? prev : "", `- Condensed ${lines.length} older chat lines (mock summary).`,
        "- Owner prefers short, direct replies; keep sessions within the planned time."].filter(Boolean).join("\n"));
      return;
    }
    if (whole.startsWith(COMMENT_PROMPT_MARKER)) {
      const session = whole.split("Session:\n")[1]?.split("\n")[0] ?? "";
      const title = session.split(" · ")[1]?.replace(/\s*\[.*$/, "") || "this session";
      const pain = whole.match(/pain: (\w[\w ]*?) (\d+)\/10/);
      const target = whole.match(/Next targets \(computed by the app\):\n- ([^\n]+)/);
      await write([
        `Good work getting ${title} done and logged.`,
        pain ? (Number(pain[2]) <= 3 ? `${titleCase(pain[1])} at ${pain[2]}/10 stays in the green zone; keep watching it.` : `${titleCase(pain[1])} at ${pain[2]}/10 needs care: ease off what provokes it.`) : "Effort looked well judged for this point in the week.",
        target ? `Next time: ${target[1]}.` : "Next time, aim for the targets in your plan.",
      ].join(" "));
      return;
    }

    const mode = parts.instructions.includes(MODE_LINE.onboarding) ? "onboarding" : parts.instructions.includes(MODE_LINE.chat) ? "chat" : "plain";
    const user = parts.lastUser;
    const lower = user.toLowerCase();

    if (mode === "onboarding") {
      const profile = parseProfileFromPrompt(parts.instructions);
      const step = onboardingStep(profile) ?? "screening";
      if (user.startsWith("[app event]") || !tools.has("update_profile")) {
        await write(`Hi${profile?.name ? ` ${profile.name}` : ""}! I'm your coach. We'll set you up in a few short rounds (about 5 minutes). I save as we go, and you can change anything later.\n\n${ONBOARDING_QUESTIONS[step === "done" ? "screening" : step]}`);
        return;
      }
      if (step === "done") {
        await callTool("update_profile", { patch: { onboarded: true } });
        await write("You're all set. Ask me for your first plan whenever you're ready.");
        return;
      }
      const patch = onboardingPatch(step, user);
      const res = asObj(await callTool("update_profile", { patch }));
      const order = ["screening", "goals", "schedule", "equipment", "experience"];
      const next = order[order.indexOf(step) + 1];
      if (res.text?.startsWith?.("Error")) { await write(`Sorry, I couldn't save that (${res.text}). Could you say it another way?`); return; }
      if (step === "screening" && patch.screening.outcome !== "cleared") {
        await write("Thanks. Since you answered yes to something, check with your doctor before hard training; until then we'll keep things moderate and avoid anything that aggravates it.");
      }
      if (next) {
        await write(`Got it, saved.\n\n${ONBOARDING_QUESTIONS[next]}`);
        return;
      }
      await callTool("update_profile", { patch: { onboarded: true } });
      const queued = tools.has("request_plan") && (await callTool("request_plan", { kind: "generate", instruction: `First plan: ${profile?.goals?.primary || "general fitness"}` })) !== null;
      await write([
        "That's everything, thanks. Here's what I have:",
        `- **Goal**: ${profile?.goals?.primary || "as discussed"}`,
        `- **Schedule**: ${profile?.schedule?.daysPerWeek ?? 3} days × ${profile?.schedule?.minutesPerSession ?? 60} min`,
        `- **Equipment**: ${(profile?.equipment?.locations?.[0]?.name) || "saved"}`,
        "",
        queued ? "I've queued your first plan: tap **Generate plan** below (it takes 1-3 minutes)." : "When you're ready, ask me for your first plan, or open **Plan** and tap **Generate next week**.",
      ].join("\n"));
      return;
    }

    const can = (name) => tools.has(name);
    if (/\b(did|done|logged|finished|completed|ran|just ran|smashed)\b/.test(lower)) {
      const { session } = parseWorkoutReport(user);
      if (!can("log_session")) { await write("I can't save workouts from this view. Use **History → Add workout** and I'll comment on it there."); return; }
      await write("Nice, logging that now.");
      const res = asObj(await callTool("log_session", { session }));
      if (res.text?.startsWith?.("Error")) { await write(`I couldn't log it: ${res.text.replace(/^Error:\s*/, "")}. Want to try again with the sets spelled out?`); return; }
      const lines = ["Logged:", describeSession(session)];
      if (res.prs?.length) lines.push("", `**New PR${res.prs.length > 1 ? "s" : ""}**: ${res.prs.map((p) => `${titleCase(p.exerciseId ?? "")} ${p.kind} ${p.value}`).join(", ")}`);
      if (res.nextTargets?.length) lines.push("", "**Next time**", ...res.nextTargets.map((x) => `- ${titleCase(x.exerciseId)}: ${x.loadKg ?? "same"} kg × ${x.reps ?? "target reps"}${x.note ? ` (${x.note})` : ""}`));
      const pa = painAdvice(session.pain);
      if (pa) lines.push("", pa);
      if (res.upNext) lines.push("", res.upNext === "rotation complete" ? "That completes this week's rotation. Want me to request next week's plan?" : `Up next: **${res.upNext}**.`);
      await write(lines.join("\n"));
      return;
    }
    if (/\b(new plan|next week|generate|make me a plan|plan for|program)\b/.test(lower) && can("request_plan")) {
      await callTool("request_plan", { kind: /change|revise|tweak|adjust/.test(lower) ? "revise" : "generate", instruction: user.slice(0, 300) });
      await write("Done, I've queued that. Tap **Generate plan** below: it uses the most capable model and takes 1-3 minutes. You'll get a draft to approve.");
      return;
    }
    if (/\b(today|next workout|what'?s my workout|up next|what should i do|workout)\b/.test(lower) && can("get_plan")) {
      const res = await callTool("get_plan", { which: "next" });
      const r = asObj(res);
      if (typeof res === "string" || !r.workout) { await write(`${r.text ?? "There's no plan yet."}\n\nWant me to request one?`); return; }
      const [head, ...rest] = String(r.workout).split("\n");
      await write([`### ${head.replace(/^W\d+ · /, "")}`, ...rest.filter((l) => !l.startsWith("intent:")), "", `Workout ${r.position} this week. Tell me how it goes and I'll log it.`].join("\n"));
      return;
    }
    if (/\b(progress|history|how am i|how'?s my|trend|stats|last week)\b/.test(lower) && can("get_history")) {
      const exId = exerciseIdFor(lower);
      const r = asObj(await callTool("get_history", exId ? { exerciseId: exId, limit: 5 } : { limit: 5 }));
      const sessions = Array.isArray(r.sessions) ? r.sessions : [];
      if (!sessions.length) { await write("Nothing logged yet. Tell me about your next workout and I'll start tracking."); return; }
      const lines = [`Your last ${sessions.length} session${sessions.length > 1 ? "s" : ""}:`, ...sessions.map((s) => `- ${String(s).split("\n")[0].replace(/ · id \S+$/, "")}`)];
      if (r.stats?.bestE1rm) lines.push("", `Best estimated 1RM for ${titleCase(exId)}: **${r.stats.bestE1rm} kg**${r.stats.flag ? ` (flag: ${r.stats.flag})` : ""}.`);
      lines.push("", "Consistency is the main driver right now. Keep stacking sessions.");
      await write(lines.join("\n"));
      return;
    }
    if (/\b(swap|substitute|instead of|alternative|replace)\b/.test(lower) && can("get_exercise_info")) {
      const q = lower.split(/\b(?:swap|substitute|instead of|alternative to|alternative for|replace)\b/)[1]?.replace(/[?.!]/g, "").replace(/\b(for|the|my|with|out)\b/g, " ").trim().split(/\s+/).slice(0, 3).join(" ") || "squat";
      const r = asObj(await callTool("get_exercise_info", { query: q }));
      if (r.found === false) { await write(`I couldn't find "${q}". Did you mean ${(r.suggestions ?? []).slice(0, 3).join(", ") || "something else"}?`); return; }
      const ok = (r.allowed ?? []).filter((a) => a.ok).map((a) => a.location);
      await write([`**${r.name ?? q}**${ok.length ? ` works with your equipment (${ok.join(", ")}).` : " isn't possible with your equipment."}`, "",
        ...(r.substitutes?.length ? [`Good swaps: ${r.substitutes.join(", ")}.`, "", "Want me to put one of these in your next plan?"] : ["I don't have a close swap for it with your equipment. Want me to keep it in the plan?"])].join("\n"));
      return;
    }
    if (/\b(remember|note that|keep in mind|fyi)\b/.test(lower) && can("add_coach_note")) {
      await callTool("add_coach_note", { kind: /hurt|pain|injur/.test(lower) ? "injury" : /prefer|like|hate|dislike/.test(lower) ? "preference" : "insight", text: user.slice(0, 280) });
      await write("Noted. I'll keep that in mind when planning.");
      return;
    }
    const replies = [
      "Good question. Short version:\n- Keep most sets 1-3 reps short of failure.\n- Add load only when every set hits the top of the rep range.\n- Sleep and protein (about 1.6 g/kg) do the rest.\n\nWant me to apply this to your next plan?",
      "Here's how I'd approach it:\n1. Keep this week's plan as is.\n2. Note how you feel after each session (readiness 1-5).\n3. We adjust next week from what you log.\n\nAnything specific you'd like to change?",
      "Makes sense. If it's about today, ask me for **today's workout**; if it's about the bigger picture, I can request a new plan with your changes.",
    ];
    await write(mode === "plain" ? `Mock reply: ${user.slice(0, 200)}` : replies[hashOf(user) % replies.length]);
  }

  /**
   * Fake sample(): resolves { text, truncated, modelTierApplied } or rejects { code, message, text? }.
   * @param {string|Array<{role: string, content: string}>} input
   * @param {object} [options]
   */
  const mockSample = (input, options) => run("sample", input, options);
  /** Fake sample.json(): resolves the parsed value (a Plan for plan/repair prompts). */
  mockSample.json = (input, options) => run("json", input, options);
  /** Fake sample.limits(). */
  mockSample.limits = async () => ({ maxPromptBytes: LIMITS.maxPromptBytes, tools: { maxCount: LIMITS.tools.maxCount }, modelTiers: [...LIMITS.modelTiers] });
  mockSample.calls = calls;
  mockSample.toolCalls = toolCalls;
  return mockSample;
}
