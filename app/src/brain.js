// The coach: chat, onboarding, plan generation, session comments (owner: Agent B). See CONTRACT.md §5.4.
//
// Everything platform- or data-related comes in through createCoach({ runtime, store, core, catalog, knowledge }),
// so tests can inject stubs. Claude is only ever called from a method the UI runs on a tap: never from a tool,
// a loop or a timer, and failures are never retried by code (sample.d.ts).

import {
  addDaysISO, clip, cloneJson, fmtNum, fmtSets, formatSessionCompact, isIsoDate, isPlainObject,
  localISODate, sortSessionsAsc, sundayOf, truncateBytes, utf8Bytes, weekdayName,
} from "./prompts/util.js";
import { CHAT_TOOL_ORDER, NOTE_KINDS, ONBOARDING_TOOL_ORDER, REVIEW_TOOL_ORDER, TOOL_ENUMS, TOOL_SPECS, checkToolSpec } from "./prompts/tools.js";
import { buildContextSnapshot, buildReviewSnapshot, formatPlanOverview, formatWellnessEntry, formatWorkout } from "./prompts/context.js";
import {
  CHAT_BUDGETS, ONBOARDING_START_TURN, REVIEW_START_TURN, buildChatTurns, buildInstructionsTurn, isClearCommand, normalizeTurns,
} from "./prompts/chat.js";
import { buildPlanPrompt, buildRepairPrompt, formatPaces } from "./prompts/plan.js";
import { progressionDigest } from "./progress.js";
import { SUMMARY_STALE_AFTER, buildSummaryPrompt, composeSummary, parseSummary } from "./prompts/summary.js";
import { buildCommentPrompt, clampWords } from "./prompts/comment.js";

/** Every error code sample.d.ts defines. */
export const SAMPLE_ERROR_CODES = Object.freeze([
  "invalid_request", "prompt_too_large", "images_unavailable", "tools_unavailable", "image_rejected",
  "cancelled", "not_granted", "session_expired", "sampling_disabled", "not_declared", "rate_limited",
  "refused", "empty_completion", "invalid_json", "upstream_error", "capability_disabled",
  "capability_removed", "transform_error", "queue_overflow",
]);

/** Codes after which Claude stays unusable for this view (sample.d.ts: "hide the feature, never re-ask"). */
const PERMANENT_CODES = new Set(["not_granted", "sampling_disabled", "not_declared", "capability_disabled", "capability_removed"]);
/** A failed pre-send summary with one of these ends the send (the main call would fail the same way). */
const SUMMARY_FATAL_CODES = new Set(["cancelled", "rate_limited", "session_expired", "queue_overflow", ...PERMANENT_CODES]);
const KNOWN_SAMPLE_CODES = new Set(SAMPLE_ERROR_CODES);
/** Store (store.js) and db (db.d.ts) codes that pass through unchanged. */
const STORE_CODES = new Set(["no_user", "db_unavailable", "not_found", "invalid_argument", "internal",
  "resource_exhausted", "quota_exceeded", "unavailable", "revoked"]);
const APP_CODES = new Set([...STORE_CODES, "sample_unavailable", "store_error", "no_draft"]);

const ERROR_COPY = Object.freeze({
  cancelled: "Stopped.",
  invalid_request: "The app sent a request Claude couldn't read. Try again; if it keeps happening, it's a bug in the app.",
  transform_error: "The app couldn't prepare that request. Try again; if it keeps happening, it's a bug in the app.",
  prompt_too_large: "That was too much to send in one go. Try a shorter message.",
  queue_overflow: "Too many requests piled up. Reload the page, then try again.",
  not_granted: "The coach needs permission to use Claude. Reload the page and choose Allow.",
  sampling_disabled: "Claude isn't available for this account right now.",
  not_declared: "This version of the app can't use Claude. Reload to get the latest version.",
  capability_disabled: "Claude can't be used in this view. Open the app in the Claude app.",
  capability_removed: "This Claude app version can't run the coach. Update the Claude app.",
  images_unavailable: "Images can't be sent from this view.",
  tools_unavailable: "The coach can't save or look things up in this view, so replies are chat only.",
  image_rejected: "That image couldn't be used. Try a different one.",
  rate_limited: "You've hit a usage limit. Wait a little, then tap Retry.",
  session_expired: "Your Claude session expired. Sign in again, then tap Retry.",
  refused: "The coach couldn't answer that. Try asking another way.",
  empty_completion: "The coach came back empty. Try asking a bit differently.",
  invalid_json: "The plan came back garbled. Tap Generate to try again.",
  upstream_error: "Connection problem. Your message is saved; tap Retry.",
  no_user: "You're not signed in, so nothing can be saved. Sign in to Claude and reload.",
  sample_unavailable: "The coach needs the Claude app. Open this page in Claude to chat.",
  not_found: "That workout no longer exists.",
  store_error: "Couldn't save your data. Check your connection and try again.",
  db_unavailable: "Your training data can't be reached right now, so nothing can be saved. Reload to try again.",
  invalid_argument: "The app tried to save something invalid. Try again; if it keeps happening, it's a bug in the app.",
  internal: "Something went wrong saving your data. Try again.",
  resource_exhausted: "Too many saves at once. Wait a moment, then try again.",
  quota_exceeded: "Your data storage is full. Delete some old workouts or chat, then try again.",
  unavailable: "Saving is briefly unavailable. Try again in a moment.",
  revoked: "Access to your data was withdrawn for this view. Reload the page.",
  no_draft: "There's no draft plan to change. Generate one first.",
});

/**
 * Short user-facing message for a sample or store error code. Unknown codes read as `upstream_error`.
 * @param {string} code
 * @returns {string}
 */
export function errorCopy(code) {
  return ERROR_COPY[code] ?? ERROR_COPY.upstream_error;
}

const PROGRESS_LABELS = Object.freeze({
  preparing: "Gathering your history…",
  generating: "Writing the plan…",
  validating: "Checking equipment, volume and run load…",
  repairing: "Fixing what the checks found…",
  saving: "Saving the draft…",
  done: "Draft ready",
});

const SESSION_TYPES = ["strength", "run", "conditioning", "hybrid", "mobility", "other"];
const PROFILE_KEYS = ["name", "age", "sex", "heightCm", "weightKg", "screening", "injuries", "goals", "schedule", "equipment", "experience", "preferences", "onboarded"];
const SESSION_PATCH_KEYS = ["date", "title", "type", "status", "missedReason", "durationMin", "readiness", "sessionRpe", "notes", "pain", "strength", "conditioning", "run", "coachComment"];
const TOOL_RESULT_MAX_BYTES = 12000;
const SESSIONS_FETCH_LIMIT = 300;
const SUMMARY_SCAN = 80;
const DEFAULT_TIERS = ["default", "complex", "quick"];
const MAX_TOOLS = 10;
const PLAN_CHANGELOG_MAX = 30;
const WELLNESS_NUMBERS = { trainingReadiness: [0, 100], sleepScore: [0, 100], sleepHours: [0, 24], hrvMs: [1, 300], bodyBattery: [0, 100], restingHr: [20, 200], stress: [0, 100] };
const ERROR_DETAIL_CHARS = 300;

/**
 * @typedef {{ type: string, label: string, ref: string|null, undo?: () => Promise<void> }} CoachAction
 *   `undo` is only on the in-memory result (functions are never persisted).
 * @typedef {{ text: string, actions: CoachAction[], error: string|null }} SendResult
 * @typedef {{ phase: "preparing"|"generating"|"validating"|"repairing"|"saving"|"done", label: string, chars?: number, issues?: number }} PlanProgress
 * @typedef {object} Coach
 * @property {() => { available: boolean, reason: "sample_unavailable"|"not_granted"|"no_user"|null, code: string|null }} status
 * @property {() => boolean} isOnboarding
 * @property {(text: string, opts?: { signal?: AbortSignal, onText?: (u: {text: string, delta?: string}) => void, onTool?: (e: {name: string, phase: "start"|"done"|"error", label: string}) => void }) => Promise<SendResult>} send
 * @property {(opts?: { signal?: AbortSignal, onText?: Function, onTool?: Function }) => Promise<SendResult>} startOnboarding
 * @property {(opts?: { instruction?: string, signal?: AbortSignal, onProgress?: (p: PlanProgress) => void }) => Promise<{ plan: object, validation: object|null, undo?: Function }>} generatePlan
 * @property {(instruction: string, opts?: { signal?: AbortSignal, onProgress?: (p: PlanProgress) => void }) => Promise<{ plan: object, validation: object|null, undo?: Function }>} reviseDraft
 * @property {(sessionId: string, opts?: { signal?: AbortSignal }) => Promise<string>} commentOnSession
 * @property {(sessionId: string, opts?: { signal?: AbortSignal, onText?: Function, onTool?: Function }) => Promise<SendResult>} reviewWorkout
 * @property {(ref: string) => Promise<{ plan: object, undo?: Function }>} undoPlanChange
 * @property {(ref: string, plans?: object[]) => boolean} planChangeActive
 * @property {(code: string) => string} errorCopy
 */

/**
 * Create the coach (CONTRACT §5.4).
 *
 * Failure semantics: `send` and `startOnboarding` always resolve `{ text, actions, error }`;
 * `generatePlan`, `reviseDraft` and `commentOnSession` reject `{ code, message }` (same shape as sample errors).
 *
 * @param {object} deps
 * @param {{ sample?: Function|null, uid?: string|null }} deps.runtime from env.getRuntime()
 * @param {object} deps.store from store.createStore()
 * @param {object} deps.core core.js namespace
 * @param {object} deps.catalog catalog.js namespace
 * @param {object} deps.knowledge knowledge/index.js namespace
 * @param {() => Date} [deps.now] clock, for tests
 * @returns {Coach}
 */
export function createCoach({ runtime, store, core, catalog, knowledge, now } = {}) {
  const sample = typeof runtime?.sample === "function" ? runtime.sample : null;
  const K = knowledge ?? {};
  const cat = catalog ?? {};
  const C = core ?? {};
  const clock = typeof now === "function" ? now : () => new Date();

  let deniedCode = null;      // permanent sample denial seen in this view
  let toolsBlocked = false;   // tools_unavailable seen in this view
  let noUser = !store || (isPlainObject(runtime) && "uid" in runtime && !runtime.uid);
  let profileCache;           // undefined until first load
  let limitsPromise = null;

  // ---------- small helpers ----------

  const attempt = (fn, fallback = null) => {
    try {
      const v = fn();
      return v === undefined ? fallback : v;
    } catch {
      return fallback;
    }
  };
  const soft = async (fn, fallback = null) => {
    try {
      const v = await fn();
      return v === undefined ? fallback : v;
    } catch {
      return fallback;
    }
  };
  const emit = (cb, payload) => {
    if (typeof cb !== "function") return;
    try { cb(payload); } catch { /* UI callback errors never break the coach */ }
  };
  const nowIso = () => clock().toISOString();
  const today = () => {
    const t = attempt(() => C.todayISO(clock()));
    return isIsoDate(t) ? t : localISODate(clock());
  };
  const weekStartOf = (iso) => {
    const w = attempt(() => C.weekStartOf(iso));
    return isIsoDate(w) ? w : sundayOf(iso);
  };
  const withoutUndefined = (obj) => Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined));

  function sampleError(e) {
    const raw = isPlainObject(e) && typeof e.code === "string" ? e.code : "upstream_error";
    const code = KNOWN_SAMPLE_CODES.has(raw) ? raw : "upstream_error";
    if (PERMANENT_CODES.has(code)) deniedCode = code;
    if (code === "tools_unavailable") toolsBlocked = true;
    const message = typeof e?.message === "string" && e.message.trim() ? e.message : (raw !== code ? `${raw} (unknown code)` : code);
    const out = { code, message: clip(message, 1000) };
    if (typeof e?.text === "string" && code !== "refused") out.text = e.text;
    return out;
  }
  function anyError(e) {
    if (isPlainObject(e) && typeof e.code === "string") {
      if (e.code === "no_user") noUser = true;
      return { code: KNOWN_SAMPLE_CODES.has(e.code) || APP_CODES.has(e.code) ? e.code : "store_error", message: String(e.message ?? e.code) };
    }
    return { code: "store_error", message: String(e?.message ?? e) };
  }

  function getLimits() {
    if (!limitsPromise) {
      limitsPromise = (async () => {
        const fallback = { maxPromptBytes: 262144, tools: { maxCount: 8 }, modelTiers: DEFAULT_TIERS };
        if (!sample || typeof sample.limits !== "function") return fallback;
        try {
          const l = await sample.limits();
          return isPlainObject(l) ? l : fallback;
        } catch {
          return fallback;
        }
      })();
    }
    return limitsPromise;
  }
  function tierFor(wanted, lim) {
    const tiers = Array.isArray(lim?.modelTiers) && lim.modelTiers.length ? lim.modelTiers : DEFAULT_TIERS;
    if (tiers.includes(wanted)) return wanted;
    return tiers.includes("default") ? "default" : undefined;
  }

  /**
   * Last line of defence before the platform (sample.d.ts invalid_request rules): turn arrays are re-normalized
   * (user/assistant roles only, no empty content, consecutive roles merged, start and end on user), tools are
   * dropped when malformed, and `cache` is omitted whenever tools are passed.
   */
  function safeCall(input, options) {
    const o = withoutUndefined(options ?? {});
    const turns = Array.isArray(input) ? normalizeTurns(input) : String(input ?? "");
    if (Array.isArray(o.tools)) {
      const seen = new Set();
      o.tools = o.tools.filter((t) => !checkToolSpec(t).length && typeof t.execute === "function" && !seen.has(t.name) && seen.add(t.name));
      if (!o.tools.length) delete o.tools;
    }
    if (o.tools) delete o.cache;
    if (o.signal !== undefined && !(typeof o.signal === "object" && o.signal && "aborted" in o.signal)) delete o.signal;
    if (o.onText !== undefined && typeof o.onText !== "function") delete o.onText;
    return { input: turns, options: o };
  }

  /** The one place `sample()` is called. Rejects a normalized { code, message, text? }. */
  async function callSample(input, options) {
    if (!sample) throw { code: "sample_unavailable", message: "sample is unavailable" };
    const call = safeCall(input, options);
    try {
      return await sample(call.input, call.options);
    } catch (e) {
      throw sampleError(e);
    }
  }
  /** The one place `sample.json()` is called (falls back to tolerant parsing of `sample()` on old runtimes). */
  async function callJson(input, options) {
    if (!sample) throw { code: "sample_unavailable", message: "sample is unavailable" };
    const call = safeCall(input, options);
    try {
      if (typeof sample.json === "function") return await sample.json(call.input, call.options);
      const { text } = await sample(call.input, call.options);
      const parsed = parseJsonLoose(text);
      if (parsed === undefined) throw { code: "invalid_json", message: "no JSON in reply", text };
      return parsed;
    } catch (e) {
      throw sampleError(e);
    }
  }
  function unavailableCode() {
    if (!store) return "no_user";
    const st = status();
    return st.available ? null : st.code;
  }

  // ---------- profile cache (isOnboarding is synchronous) ----------

  if (store?.profile) {
    Promise.resolve()
      .then(() => store.profile.get())
      .then((p) => { if (profileCache === undefined) profileCache = p ?? null; }, (e) => { if (e?.code === "no_user") noUser = true; });
    attempt(() => store.profile.subscribe?.((p) => { profileCache = isPlainObject(p) ? p : null; }));
  }

  // ---------- data helpers ----------

  function profileLocations(profile) {
    const locs = Array.isArray(profile?.equipment?.locations) ? profile.equipment.locations.filter((l) => isPlainObject(l) && l.id) : [];
    return locs.length ? locs : [{ id: profile?.equipment?.defaultLocationId || "gym", name: "Gym", items: [] }];
  }
  function equipmentSet(profile, locationId) {
    const s = attempt(() => C.availableEquipment(profile, locationId));
    if (s instanceof Set) return s;
    if (Array.isArray(s)) return new Set(s);
    const loc = profileLocations(profile).find((l) => l.id === locationId);
    return new Set(Array.isArray(loc?.items) ? loc.items : []);
  }
  function exerciseOk(ex, set) {
    const r = attempt(() => C.exerciseAllowed(ex.id, set));
    if (isPlainObject(r) && typeof r.ok === "boolean") return r.ok;
    const all = Array.isArray(ex.equipment?.all) ? ex.equipment.all : [];
    const any = Array.isArray(ex.equipment?.any) ? ex.equipment.any : [];
    return all.every((e) => set.has(e)) && (!any.length || any.some((e) => set.has(e)));
  }
  function isDisliked(ex, dislikes) {
    if (!dislikes.length) return false;
    const names = [ex.id, ex.name, ...(Array.isArray(ex.aliases) ? ex.aliases : [])].map((s) => String(s ?? "").toLowerCase());
    return dislikes.some((d) => names[0] === d || (d.length >= 4 && names.some((n) => n.includes(d))));
  }
  function allowedByLocation(profile) {
    const exercises = Array.isArray(cat.EXERCISES) ? cat.EXERCISES.filter((e) => isPlainObject(e) && e.id) : [];
    if (!exercises.length) return [];
    const dislikes = (Array.isArray(profile?.preferences?.dislikes) ? profile.preferences.dislikes : [])
      .map((d) => String(d).toLowerCase().trim()).filter(Boolean);
    return profileLocations(profile).map((loc) => {
      const set = equipmentSet(profile, loc.id);
      return {
        id: loc.id,
        name: loc.name,
        exercises: exercises.filter((ex) => !isDisliked(ex, dislikes) && exerciseOk(ex, set))
          .map((ex) => ({ id: ex.id, name: ex.name, pattern: ex.pattern })),
      };
    });
  }
  function exerciseName(id) {
    const ex = attempt(() => cat.getExercise?.(id));
    return isPlainObject(ex) ? ex.name : null;
  }
  function withTargets(workout, sessionsAsc, t) {
    const w = cloneJson(workout);
    for (const b of Array.isArray(w?.blocks) ? w.blocks : []) {
      if (b?.kind !== "strength" || !Array.isArray(b.items)) continue;
      for (const item of b.items) {
        const target = attempt(() => C.nextTarget(sessionsAsc, item, { today: t }));
        if (isPlainObject(target)) item.target = { loadKg: target.loadKg ?? null, reps: target.reps ?? null, note: target.note ?? target.reason ?? "" };
      }
    }
    return w;
  }
  function strengthItems(plan) {
    const map = new Map();
    for (const w of Array.isArray(plan?.workouts) ? plan.workouts : []) {
      for (const b of Array.isArray(w?.blocks) ? w.blocks : []) {
        if (b?.kind !== "strength") continue;
        for (const it of Array.isArray(b.items) ? b.items : []) {
          if (isPlainObject(it) && it.exerciseId && !map.has(it.exerciseId)) map.set(it.exerciseId, it);
        }
      }
    }
    return map;
  }
  function targetsFor(items, sessionsAsc, t, max) {
    const out = [];
    for (const item of items) {
      if (out.length >= max) break;
      const target = attempt(() => C.nextTarget(sessionsAsc, item, { today: t }));
      if (isPlainObject(target)) out.push({ exerciseId: item.exerciseId, loadKg: target.loadKg ?? null, reps: target.reps ?? null, note: clip(target.note ?? "", 90) });
    }
    return out;
  }
  function runLoadOf(sessionsAsc, t) {
    // longest run of the last 30 days (the single-run rule) and the last full week's km (the weekly base)
    const from30 = addDaysISO(t, -29);
    const recent = sessionsAsc.filter((s) => s.status !== "missed" && s.date >= from30 && s.date <= t && Number(s.run?.distanceKm) > 0);
    const longestKm = Math.max(0, ...recent.map((s) => Number(s.run.distanceKm)));
    const weeks = attempt(() => C.runningLoad(sessionsAsc, { weeks: 4, today: t }));
    if (Array.isArray(weeks) && weeks.length) {
      const km = weeks.map((w) => Number(w?.km) || 0);
      return {
        avgWeeklyKm: Math.round((km.reduce((a, b) => a + b, 0) / weeks.length) * 10) / 10,
        lastWeekKm: Math.max(0, ...km.slice(-2)), // mirrors core.validatePlan's base: the latest week (full or current)
        longestKm,
        weeks: weeks.length,
      };
    }
    const total = recent.filter((s) => s.date >= addDaysISO(t, -27)).reduce((n, s) => n + Number(s.run.distanceKm), 0);
    return { avgWeeklyKm: Math.round((total / 4) * 10) / 10, longestKm, weeks: 4 };
  }
  async function loadSessionsAsc() {
    return sortSessionsAsc(await soft(() => store.sessions.list({ limit: SESSIONS_FETCH_LIMIT }), []));
  }
  function pacesFor(profile) {
    const race = profile?.experience?.running?.recentRace;
    const zones = typeof C.paceZones === "function" && isPlainObject(race) ? attempt(() => C.paceZones(race)) : null;
    return formatPaces(profile, zones, typeof C.formatPace === "function" ? (sec) => C.formatPace(sec) : undefined);
  }
  function memoryForPrompt(coach) {
    if (!isPlainObject(coach)) return {};
    return { ...coach, summary: parseSummary(coach.summary).text };
  }
  function chainUndo(fns) {
    const list = fns.filter((f) => typeof f === "function");
    if (!list.length) return undefined;
    return async () => { for (const f of [...list].reverse()) await f(); };
  }
  const guard = (signal) => {
    if (signal?.aborted) throw new Error("Stopped by the owner before saving.");
  };
  const clampInt = (v, lo, hi, dflt) => {
    const n = Math.round(Number(v));
    return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : dflt;
  };

  // ---------- tools ----------

  function fitToolResult(result) {
    if (typeof result === "string") return truncateBytes(result, TOOL_RESULT_MAX_BYTES);
    const json = JSON.stringify(result ?? null);
    return utf8Bytes(json) <= TOOL_RESULT_MAX_BYTES ? result : truncateBytes(json, TOOL_RESULT_MAX_BYTES);
  }

  function wrapTool(name, impl, ctx) {
    const spec = TOOL_SPECS[name];
    return {
      name: spec.name,
      description: spec.description,
      inputSchema: spec.inputSchema,
      execute: async (input, context) => {
        const signal = context?.signal;
        emit(ctx.onTool, { name, phase: "start", label: spec.startLabel });
        try {
          guard(signal);
          const out = await impl(isPlainObject(input) ? input : {}, ctx, signal);
          emit(ctx.onTool, { name, phase: "done", label: out.label });
          return fitToolResult(out.result);
        } catch (err) {
          const message = clip(String(err?.message ?? err ?? "failed"), 300);
          emit(ctx.onTool, { name, phase: "error", label: `${spec.startLabel.replace(/…$/, "")} failed` });
          throw new Error(message);
        }
      },
    };
  }

  function prepareProfilePatch(patchIn, current) {
    const patch = {};
    const notes = [];
    for (const [k, v] of Object.entries(patchIn)) {
      if (!PROFILE_KEYS.includes(k)) { notes.push(`ignored unknown field ${k}`); continue; }
      patch[k] = cloneJson(v);
    }
    const equipmentIds = isPlainObject(cat.EQUIPMENT) ? Object.keys(cat.EQUIPMENT) : [];
    if ("equipment" in patch) {
      const eq = isPlainObject(patch.equipment) ? patch.equipment : {};
      const out = { ...eq };
      if (Array.isArray(eq.locations)) {
        const existing = Array.isArray(current?.equipment?.locations) ? current.equipment.locations.filter(isPlainObject) : [];
        const merged = existing.map((l) => ({ ...l }));
        for (const raw of eq.locations.filter(isPlainObject)) {
          const id = String(raw.id || raw.name || "gym").toLowerCase().trim().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "") || "gym";
          const loc = { ...raw, id };
          if (Array.isArray(loc.items)) {
            const items = [...new Set(loc.items.map((x) => String(x).trim()).filter(Boolean))];
            const unknown = equipmentIds.length ? items.filter((x) => !equipmentIds.includes(x)) : [];
            if (unknown.length) notes.push(`unknown equipment ids ignored: ${unknown.join(", ")}`);
            loc.items = equipmentIds.length ? items.filter((x) => equipmentIds.includes(x)) : items;
          }
          const i = merged.findIndex((l) => l.id === id);
          if (i >= 0) merged[i] = { ...merged[i], ...loc };
          else merged.push({ name: id[0].toUpperCase() + id.slice(1).replace(/_/g, " "), items: [], dumbbellMaxKg: null, kettlebellsKg: [], notes: "", ...loc });
        }
        out.locations = merged;
      }
      const locIds = (out.locations ?? current?.equipment?.locations ?? []).map((l) => l?.id).filter(Boolean);
      if (out.defaultLocationId && !locIds.includes(out.defaultLocationId)) {
        notes.push(`defaultLocationId ${out.defaultLocationId} is not a location; kept ${locIds[0] ?? "gym"}`);
        delete out.defaultLocationId;
      }
      if (!out.defaultLocationId && !locIds.includes(current?.equipment?.defaultLocationId) && locIds.length) out.defaultLocationId = locIds[0];
      patch.equipment = out;
    }
    if ("injuries" in patch) {
      const incoming = Array.isArray(patch.injuries) ? patch.injuries.filter(isPlainObject) : [];
      const merged = (Array.isArray(current?.injuries) ? current.injuries.filter(isPlainObject) : []).map((x) => ({ ...x }));
      for (const inj of incoming) {
        const area = String(inj.area ?? "").trim();
        if (!area) continue;
        const i = merged.findIndex((x) => String(x.area ?? "").toLowerCase() === area.toLowerCase());
        const next = { ...inj, area, updatedAt: nowIso() };
        if (i >= 0) merged[i] = { ...merged[i], ...next };
        else merged.push({ status: "current", painScore: null, aggravators: "", notes: "", ...next });
      }
      patch.injuries = merged;
    }
    if (isPlainObject(patch.screening)) {
      const outcomes = ["cleared", "cleared_with_modifications", "needs_clearance"];
      if ("outcome" in patch.screening && patch.screening.outcome !== null && !outcomes.includes(patch.screening.outcome)) {
        notes.push(`screening.outcome must be one of ${outcomes.join(", ")}`);
        delete patch.screening.outcome;
      }
      if ((patch.screening.answers || patch.screening.outcome) && !patch.screening.screenedAt) patch.screening.screenedAt = nowIso();
    }
    if (isPlainObject(patch.schedule)) {
      if ("daysPerWeek" in patch.schedule) patch.schedule.daysPerWeek = clampInt(patch.schedule.daysPerWeek, 1, 7, 3);
      if ("minutesPerSession" in patch.schedule) patch.schedule.minutesPerSession = clampInt(patch.schedule.minutesPerSession, 10, 240, 60);
    }
    if (isPlainObject(patch.experience) && "level" in patch.experience &&
        ![null, "novice", "late_novice", "intermediate", "advanced"].includes(patch.experience.level)) {
      notes.push("experience.level must be novice, late_novice, intermediate or advanced");
      delete patch.experience.level;
    }
    // Paces and race times may arrive as "mm:ss" strings; known lifts may arrive as names.
    const toSec = (v) => {
      if (typeof v === "number" || v === null) return v;
      const str = String(v).replace(/\s*(\/\s*km|min\/km|per km)\s*$/i, "").trim();
      const viaCore = attempt(() => C.parseDuration(str));
      if (Number.isFinite(viaCore)) return viaCore;
      const parts = str.split(":").map(Number);
      if (!parts.length || parts.some((n) => !Number.isFinite(n))) { notes.push(`could not read duration "${v}"`); return null; }
      return parts.length === 3 ? parts[0] * 3600 + parts[1] * 60 + parts[2] : parts.length === 2 ? parts[0] * 60 + parts[1] : parts[0] * 60;
    };
    const run = patch.experience?.running;
    if (isPlainObject(run)) {
      if ("easyPaceSecPerKm" in run) run.easyPaceSecPerKm = toSec(run.easyPaceSecPerKm);
      if (isPlainObject(run.recentRace) && "timeSec" in run.recentRace) run.recentRace.timeSec = toSec(run.recentRace.timeSec);
    }
    if (isPlainObject(patch.goals?.event) && "goalTimeSec" in patch.goals.event) patch.goals.event.goalTimeSec = toSec(patch.goals.event.goalTimeSec);
    if (Array.isArray(patch.experience?.knownLifts)) {
      patch.experience.knownLifts = patch.experience.knownLifts.filter(isPlainObject).map((l) => {
        const known = l.exerciseId && attempt(() => cat.getExercise?.(l.exerciseId));
        if (known) return l;
        const ex = attempt(() => cat.findExercise?.(String(l.exerciseId || l.name || "")));
        if (isPlainObject(ex)) return { ...l, exerciseId: ex.id };
        notes.push(`unknown lift "${l.exerciseId || l.name}" kept as given`);
        return l;
      });
    }
    if ("onboarded" in patch && typeof patch.onboarded !== "boolean") delete patch.onboarded;
    const changed = Object.keys(patch);
    if (changed.length) patch.updatedAt = nowIso();
    return { patch, notes, changed };
  }

  // ---------- plan changes (update_plan_workout) and wellness ----------

  /** Workout ids of `plan` that are done or skipped: the rotation plus any session logged against it. */
  function lockedWorkoutIds(plan, state, sessions) {
    const ids = new Set(state?.rotation?.planId === plan?.id && Array.isArray(state.rotation.done) ? state.rotation.done : []);
    for (const s of Array.isArray(sessions) ? sessions : []) {
      if (!isPlainObject(s) || !s.workoutId) continue;
      if (s.planId === plan.id || (!s.planId && plan.weekStart && String(s.date) >= String(plan.weekStart))) ids.add(s.workoutId);
    }
    return ids;
  }
  function validateAgainst(plan, profile, sessionsAsc, t) {
    const v = attempt(() => C.validatePlan(plan, { profile, sessions: sessionsAsc, today: t }));
    return isPlainObject(v) ? v : null;
  }
  const issueKey = (e) => `${e?.code}|${e?.workoutId ?? ""}|${e?.message ?? ""}`;
  function resolveExercise(query) {
    const q = String(query ?? "").trim();
    if (!q) return null;
    const ex = attempt(() => cat.getExercise?.(q)) ?? attempt(() => cat.findExercise?.(q));
    return isPlainObject(ex) ? ex : null;
  }
  /** Flat list of a workout's strength and conditioning items, in block order. */
  function workoutItems(w) {
    const out = [];
    (Array.isArray(w?.blocks) ? w.blocks : []).forEach((b, bi) => {
      if (b?.kind !== "strength" && b?.kind !== "conditioning") return;
      (Array.isArray(b.items) ? b.items : []).forEach((item, ii) => { if (isPlainObject(item)) out.push({ block: b, bi, item, ii }); });
    });
    return out;
  }
  function findItem(w, query) {
    const items = workoutItems(w);
    const q = String(query ?? "").trim();
    const lower = q.toLowerCase();
    return items.find((x) => x.item.exerciseId === q)
      ?? (() => { const ex = resolveExercise(q); return ex ? items.find((x) => x.item.exerciseId === ex.id) : null; })()
      ?? items.find((x) => String(x.item.name ?? "").toLowerCase() === lower) ?? null;
  }
  const numOr = (v) => (v === null || v === undefined || v === "" || !Number.isFinite(Number(v)) ? undefined : Number(v));
  const clampNum = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
  const nameOf = (item) => clip(item?.name || exerciseName(item?.exerciseId) || String(item?.exerciseId ?? "item"), 28);

  /**
   * Apply update_plan_workout input to a clone of `plan`. Throws Error (message for Claude) on unusable input.
   * @returns {{ plan: object, workout: object, before: object, fromIndex: number, toIndex: number, parts: string[] }}
   */
  function applyWorkoutChange(plan, input, profile) {
    const next = cloneJson(plan);
    const workouts = Array.isArray(next.workouts) ? next.workouts : [];
    const wid = String(input.workoutId ?? "").trim();
    const fromIndex = workouts.findIndex((w) => w?.id === wid);
    if (fromIndex < 0) throw new Error(`No workout ${wid || "(missing workoutId)"} in the agreed plan (has ${workouts.map((w) => w.id).join(", ")})`);
    const w = workouts[fromIndex];
    const before = cloneJson(w);
    const parts = [];
    const eq = equipmentSet(profile, w.locationId || profile?.equipment?.defaultLocationId);
    const drops = [];
    for (const ch of (Array.isArray(input.changes) ? input.changes : []).filter(isPlainObject)) {
      const hit = findItem(w, ch.exerciseId ?? ch.name);
      if (!hit) {
        throw new Error(`No item "${ch.exerciseId ?? ch.name ?? "?"}" in ${wid}; its items are ${workoutItems(w).map((x) => x.item.exerciseId).join(", ") || "none"}`);
      }
      const { item, block } = hit;
      const isStrength = block.kind === "strength";
      const label = nameOf(item);
      if (ch.drop === true) { drops.push(hit); parts.push(`dropped ${label}`); continue; }
      if (ch.swapTo) {
        const ex = resolveExercise(ch.swapTo);
        if (!ex) throw new Error(`Unknown exercise "${ch.swapTo}". Use get_exercise_info to find an allowed id.`);
        if (ex.id !== item.exerciseId) {
          if (eq.size && !exerciseOk(ex, eq)) {
            const subs = attempt(() => C.findSubstitutes(item.exerciseId, eq, profile, { limit: 3 }), []);
            throw new Error(`${ex.id} isn't possible with the equipment at ${w.locationId || "this location"}${Array.isArray(subs) && subs.length ? `; allowed swaps: ${subs.join(", ")}` : ""}`);
          }
          const old = item.exerciseId;
          item.alternatives = [old, ...(Array.isArray(item.alternatives) ? item.alternatives : [])].filter((x, i, a) => x && x !== ex.id && a.indexOf(x) === i).slice(0, 4);
          item.exerciseId = ex.id;
          item.name = ex.name;
          if (isStrength && numOr(ch.loadKg) === undefined) item.loadKg = null; // recalibrate on the new exercise
          parts.push(`${label} → ${clip(ex.name, 28)}`);
        }
      }
      const sets = numOr(ch.sets);
      if (sets !== undefined && isStrength) {
        const v = clampInt(sets, 1, 10, item.sets);
        if (v !== item.sets) { parts.push(`${nameOf(item)} ${item.sets ?? "?"}→${v} sets`); item.sets = v; }
      }
      if (ch.reps !== undefined && ch.reps !== null && String(ch.reps).trim()) {
        if (isStrength) {
          const v = clip(String(ch.reps).trim(), 12);
          if (v !== String(item.reps)) { parts.push(`${nameOf(item)} reps ${item.reps ?? "?"}→${v}`); item.reps = v; }
        } else if (numOr(ch.reps) !== undefined) {
          const v = clampInt(ch.reps, 1, 500, item.reps);
          if (v !== item.reps) { parts.push(`${nameOf(item)} ${item.reps ?? "?"}→${v} reps`); item.reps = v; }
        }
      }
      const rir = numOr(ch.targetRir);
      if (rir !== undefined && isStrength) {
        const v = clampNum(Math.round(rir), 0, 5);
        if (v !== item.targetRir) { parts.push(`${nameOf(item)} RIR ${item.targetRir ?? "?"}→${v}`); item.targetRir = v; }
      }
      const load = numOr(ch.loadKg);
      if (load !== undefined) {
        const v = load > 0 ? Math.round(clampNum(load, 0, 500) * 4) / 4 : null;
        if (v !== item.loadKg) { parts.push(`${nameOf(item)} ${v === null ? "load cleared" : `${fmtNum(v)} kg`}`); item.loadKg = v; }
      }
      const rest = numOr(ch.restSec);
      if (rest !== undefined && isStrength) {
        const v = clampInt(rest, 0, 600, item.restSec);
        if (v !== item.restSec) { parts.push(`${nameOf(item)} rest ${v}s`); item.restSec = v; }
      }
      if (typeof ch.note === "string" && ch.note.trim()) item.notes = clip(ch.note.trim(), 120);
    }
    // drop items (highest index first so the others stay valid), then empty blocks
    for (const { block, ii } of drops.sort((a, b) => b.bi - a.bi || b.ii - a.ii)) block.items.splice(ii, 1);
    w.blocks = (w.blocks ?? []).filter((b) => !((b.kind === "strength" || b.kind === "conditioning") && Array.isArray(b.items) && !b.items.length));
    const cond = (w.blocks ?? []).find((b) => b?.kind === "conditioning");
    const condMin = numOr(input.conditioningMinutes);
    const condRounds = numOr(input.conditioningRounds);
    const rpe = numOr(input.targetRpe);
    if ((condMin !== undefined || condRounds !== undefined || rpe !== undefined) && !cond) throw new Error(`${wid} has no conditioning block`);
    if (cond && condMin !== undefined) {
      const v = clampInt(condMin, 1, 90, cond.minutes);
      if (v !== cond.minutes) { parts.push(`${cond.format || "metcon"} ${cond.minutes ?? "?"}→${v} min`); cond.minutes = v; if (cond.timeCapMin && cond.timeCapMin > v) cond.timeCapMin = v; }
    }
    if (cond && condRounds !== undefined) {
      const v = clampInt(condRounds, 1, 50, cond.rounds);
      if (v !== cond.rounds) { parts.push(`${cond.format || "metcon"} ${cond.rounds ?? "?"}→${v} rounds`); cond.rounds = v; }
    }
    if (cond && rpe !== undefined) {
      const v = clampInt(rpe, 1, 10, cond.targetRpe);
      if (v !== cond.targetRpe) { parts.push(`target RPE ${v}`); cond.targetRpe = v; }
    }
    const runKm = numOr(input.runKm);
    if (runKm !== undefined) {
      const run = (w.blocks ?? []).find((b) => b?.kind === "run");
      if (!run) throw new Error(`${wid} has no run block`);
      const v = Math.round(clampNum(runKm, 0.5, 60) * 10) / 10;
      if (v !== run.totalKm) { parts.push(`run ${run.totalKm ? `${fmtNum(run.totalKm)}→` : ""}${fmtNum(v)} km`); run.totalKm = v; }
    }
    const est = numOr(input.estMinutes);
    if (est !== undefined) w.estMinutes = clampInt(est, 10, 240, w.estMinutes);
    else if (parts.length && w.estMinutes) {
      const e = attempt(() => C.estimateWorkoutMinutes(w, { easyPaceSecPerKm: profile?.experience?.running?.easyPaceSecPerKm }));
      if (Number.isFinite(e) && e > 0) w.estMinutes = Math.round(e);
    }
    let toIndex = fromIndex;
    const move = numOr(input.moveTo);
    if (move !== undefined) {
      toIndex = clampInt(move, 1, workouts.length, fromIndex + 1) - 1;
      if (toIndex !== fromIndex) {
        workouts.splice(fromIndex, 1);
        workouts.splice(toIndex, 0, w);
        parts.push(`moved to #${toIndex + 1}`);
      }
    }
    if (!w.blocks.length) throw new Error(`That would leave ${wid} empty. Keep at least one block, or tell the owner to skip it.`);
    return { plan: next, workout: w, before, fromIndex, toIndex, parts };
  }

  async function changePlanWorkout(input, ctx, signal) {
    if (typeof store.plans?.update !== "function") throw new Error("Plan editing isn't available in this app version. Describe the change instead.");
    const t = ctx.today;
    const [plan, state, sessionsDesc, profile] = await Promise.all([
      store.plans.getAgreed(), soft(() => store.state.get(), {}), soft(() => store.sessions.list({ limit: SESSIONS_FETCH_LIMIT }), []), soft(() => store.profile.get(), {}),
    ]);
    if (!isPlainObject(plan)) throw new Error("There is no agreed plan to change.");
    const wid = String(input.workoutId ?? "").trim();
    const locked = lockedWorkoutIds(plan, state, sessionsDesc);
    if (locked.has(wid)) throw new Error(`${wid} is already done or skipped, so it can't change. Only remaining workouts can: ${(plan.workouts ?? []).filter((w) => !locked.has(w.id)).map((w) => w.id).join(", ") || "none left"}.`);
    const { plan: next, workout, before, fromIndex, toIndex, parts } = applyWorkoutChange(plan, input, profile ?? {});
    if (!parts.length) throw new Error("Nothing changed: send at least one different value.");
    const sessionsAsc = sortSessionsAsc(sessionsDesc);
    const beforeV = validateAgainst(plan, profile, sessionsAsc, t);
    const afterV = validateAgainst(next, profile, sessionsAsc, t);
    const known = new Set((beforeV?.errors ?? []).map(issueKey));
    const added = (afterV?.errors ?? []).filter((e) => !known.has(issueKey(e)));
    if (added.length) {
      return {
        label: `Plan change rejected · ${wid}`,
        result: { ok: false, rejected: true, workoutId: wid, issues: added.slice(0, 6).map((e) => `${e.code}: ${clip(e.message, 160)}`), hint: "Nothing was saved. Adjust the change (e.g. fewer items, an allowed exercise, less run distance) or explain it to the owner." },
      };
    }
    const knownW = new Set((beforeV?.warnings ?? []).map(issueKey));
    const newWarnings = (afterV?.warnings ?? []).filter((e) => !knownW.has(issueKey(e))).slice(0, 4).map((e) => `${e.code}: ${clip(e.message, 140)}`);
    guard(signal);
    const reason = clip(String(input.reason ?? "").trim(), 140);
    const summary = clip(parts.join(", "), 120);
    const entry = {
      id: `c${clock().getTime().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
      at: nowIso(), workoutId: wid, before, fromIndex, toIndex, summary, reason,
    };
    const changeLog = [...(Array.isArray(plan.changeLog) ? plan.changeLog.filter(isPlainObject) : []), entry].slice(-PLAN_CHANGELOG_MAX);
    const res = await store.plans.update(plan.id, { workouts: next.workouts, validation: afterV ?? plan.validation ?? null, changeLog });
    const ref = `${plan.id}#${entry.id}`;
    const label = clip(`${wid} ${clip(workout.title || "", 24)}: ${summary}`, 110);
    ctx.actions.push({ type: "plan_change", label, ref, undo: () => undoPlanChange(ref) });
    return {
      label: `Plan updated · ${wid}`,
      result: { ok: true, workoutId: wid, changed: parts, workout: formatWorkout(workout), ...(newWarnings.length ? { warnings: newWarnings } : {}) },
    };
  }

  /** Is the plan change `ref` ("<planId>#<changeId>") still in its plan's change log (i.e. not undone)? */
  function planChangeActive(ref, plans) {
    const [planId, changeId] = String(ref ?? "").split("#");
    const plan = (Array.isArray(plans) ? plans : []).find((p) => p?.id === planId);
    return Boolean(plan && Array.isArray(plan.changeLog) && plan.changeLog.some((c) => c?.id === changeId));
  }

  /**
   * Undo one update_plan_workout change: restores that workout as it was (and its rotation position). Later
   * changes to the same workout are undone with it. Refused when the workout is done by now.
   * @param {string} ref "<planId>#<changeId>"
   * @returns {Promise<{ plan: object, undo?: Function, undone: number }>}
   */
  async function undoPlanChange(ref) {
    try {
      if (!store) throw { code: "no_user", message: "no store" };
      if (typeof store.plans?.update !== "function") throw { code: "invalid_argument", message: "Plan editing isn't available in this app version." };
      const [planId, changeId] = String(ref ?? "").split("#");
      const plan = typeof store.plans.get === "function" ? await store.plans.get(planId) : await soft(() => store.plans.getAgreed());
      if (!isPlainObject(plan) || plan.id !== planId) throw { code: "not_found", message: "That plan no longer exists." };
      const log = Array.isArray(plan.changeLog) ? plan.changeLog.filter(isPlainObject) : [];
      const at = log.findIndex((c) => c.id === changeId);
      if (at < 0) throw { code: "not_found", message: "That change was already undone." };
      const entry = log[at];
      const [state, sessionsDesc, profile] = await Promise.all([
        soft(() => store.state.get(), {}), soft(() => store.sessions.list({ limit: SESSIONS_FETCH_LIMIT }), []), soft(() => store.profile.get(), {}),
      ]);
      if (lockedWorkoutIds(plan, state, sessionsDesc).has(entry.workoutId)) {
        throw { code: "invalid_argument", message: `${entry.workoutId} is already done, so its change can't be undone.` };
      }
      const workouts = cloneJson(plan.workouts ?? []);
      const i = workouts.findIndex((w) => w?.id === entry.workoutId);
      if (i < 0) throw { code: "not_found", message: `${entry.workoutId} is no longer in the plan.` };
      workouts.splice(i, 1);
      workouts.splice(Math.min(Math.max(0, Number(entry.fromIndex) || 0), workouts.length), 0, cloneJson(entry.before));
      const removed = log.filter((c, k) => k >= at && c.workoutId === entry.workoutId);
      const changeLog = log.filter((c) => !removed.includes(c));
      const next = { ...plan, workouts };
      const validation = validateAgainst(next, profile, sortSessionsAsc(sessionsDesc), today()) ?? plan.validation ?? null;
      const res = await store.plans.update(planId, { workouts, changeLog, validation });
      return { plan: res?.plan ?? { ...next, changeLog, validation }, undo: res?.undo, undone: removed.length };
    } catch (e) {
      const err = isPlainObject(e) && typeof e.code === "string" ? e : anyError(e);
      throw { code: err.code, message: String(err.message ?? err.code) };
    }
  }

  /**
   * Readiness traffic light (docs/research/09-garmin.md): Training Readiness is the headline (sleep, HRV and Body
   * Battery only explain it), judged against the owner's own baseline (the prior 7-28 entries) when there is one.
   * Without a readiness number, sleep and HRV can make it amber at most.
   */
  function wellnessBands(e, prior = []) {
    const vals = (k) => prior.map((p) => Number(p?.[k])).filter(Number.isFinite);
    const avg = (a) => (a.length ? Math.round(a.reduce((x, y) => x + y, 0) / a.length) : null);
    const baseR = vals("trainingReadiness").length >= 3 ? avg(vals("trainingReadiness")) : null;
    const baseS = vals("sleepScore").length >= 3 ? avg(vals("sleepScore")) : null;
    const out = {};
    const explain = [];
    if (e.sleepScore != null) explain.push(`sleep ${e.sleepScore}${baseS != null ? ` (usual ${baseS})` : ""}`);
    if (e.sleepHours != null && e.sleepHours < 6) explain.push(`${e.sleepHours} h sleep`);
    if (e.hrvStatus) explain.push(`HRV ${e.hrvStatus}`);
    let light = null;
    if (e.trainingReadiness != null) {
      const r = e.trainingReadiness;
      out.readinessBaseline = baseR;
      light = r < 25 ? "red" : r < 50 ? "amber" : "green";
      if (baseR != null && light !== "red" && r <= baseR - 30) light = "red";
      else if (baseR != null && light === "green" && r <= baseR - 15) light = "amber";
      if (baseR != null && light === "amber" && r >= 40 && r >= baseR - 5) light = "green"; // normal for this owner
    } else {
      const poorSleep = (e.sleepScore != null && (e.sleepScore < 60 || (baseS != null && e.sleepScore <= baseS - 15))) || (e.sleepHours != null && e.sleepHours < 6);
      const lowHrv = ["low", "poor"].includes(e.hrvStatus);
      light = poorSleep || lowHrv ? "amber" : (e.sleepScore != null || e.hrvStatus ? "green" : null);
    }
    if (light) out.light = light;
    if (baseR == null && e.trainingReadiness != null) out.note = "Fewer than 3 earlier readings: no personal baseline yet, so this uses general bands.";
    const why = explain.length ? ` (${explain.join(", ")})` : "";
    out.guidance = light === "red"
      ? `Red${why}: switch to recovery, easy aerobic work or mobility today.`
      : light === "amber"
        ? `Amber${why}: keep intensity, trim volume ~20-30% and add 1 RIR; if they feel good after the warm-up they may train as planned.`
        : light === "green" ? "Green: train as planned." : "Not enough to judge readiness.";
    out.check = "If this contradicts how the owner feels, ask before changing anything.";
    return out;
  }

  // ---------- exercise feedback ----------

  const normFeedback = (v) => {
    const viaCore = attempt(() => C.normalizeFeedback?.(v));
    if (viaCore !== null && viaCore !== undefined) return viaCore;
    const s = typeof v === "string" ? v.trim().toLowerCase() : "";
    const syn = { tough: "hard", heavy: "hard", "too hard": "hard", ok: "fine", okay: "fine", good: "fine", light: "easy", "too easy": "easy" };
    return TOOL_ENUMS.FEEDBACK.includes(s) ? s : syn[s] ?? null;
  };
  /**
   * Apply feedback tags to a session's exercises: `fb` is [{ exerciseId | name, feedback }] or { exerciseIdOrName: feedback }.
   * "metcon" / "conditioning" (optionally with a 1-based number) targets the conditioning entries.
   * @returns {{ strength?: object[], conditioning?: object[], applied: string[], unknown: string[] }}
   */
  function applyFeedbackPatch(session, fb) {
    const pairs = Array.isArray(fb)
      ? fb.filter(isPlainObject).map((x) => [x.exerciseId ?? x.name ?? x.exercise, x.feedback ?? x.value])
      : isPlainObject(fb) ? Object.entries(fb) : [];
    const strength = cloneJson(Array.isArray(session?.strength) ? session.strength : []);
    const conditioning = cloneJson(Array.isArray(session?.conditioning) ? session.conditioning : []);
    const applied = [];
    const unknown = [];
    let sTouched = false;
    let cTouched = false;
    for (const [key, val] of pairs) {
      const k = String(key ?? "").trim();
      const v = val === null ? null : normFeedback(val);
      if (!k || (v === null && val !== null)) { unknown.push(`${k || "?"}=${val}`); continue; }
      const m = /^(metcon|conditioning|wod|hiit)\s*#?(\d+)?$/i.exec(k);
      if (m) {
        const i = m[2] ? Number(m[2]) - 1 : 0;
        if (!isPlainObject(conditioning[i])) { unknown.push(k); continue; }
        conditioning[i].feedback = v;
        cTouched = true;
        applied.push(`${conditioning[i].format || "metcon"} ${v ?? "cleared"}`);
        continue;
      }
      const ex = resolveExercise(k);
      const lower = k.toLowerCase();
      const hit = strength.find((e) => e?.exerciseId === k) ?? (ex ? strength.find((e) => e?.exerciseId === ex.id) : null)
        ?? strength.find((e) => String(e?.name ?? "").toLowerCase() === lower)
        ?? (lower.length >= 4 ? strength.find((e) => String(e?.name ?? "").toLowerCase().includes(lower)) : null);
      if (!hit) { unknown.push(k); continue; }
      hit.feedback = v;
      sTouched = true;
      applied.push(`${clip(hit.name || exerciseName(hit.exerciseId) || hit.exerciseId, 24)} ${v ?? "cleared"}`);
    }
    return { ...(sTouched ? { strength } : {}), ...(cTouched ? { conditioning } : {}), applied, unknown };
  }
  /** App-computed next targets for a session's lifts that are in the agreed plan (after a feedback change). */
  async function feedbackTargets(session, t) {
    const [agreed, all] = await Promise.all([soft(() => store.plans.getAgreed()), loadSessionsAsc()]);
    const list = sortSessionsAsc([...all.filter((s) => s.id !== session.id), session]);
    const items = strengthItems(agreed);
    return targetsFor((session.strength ?? []).map((e) => items.get(e?.exerciseId)).filter(Boolean), list, t, 8);
  }

  const IMPLS = {
    async update_profile(input, ctx, signal) {
      if (!isPlainObject(input.patch)) throw new Error("patch must be an object of Profile fields");
      const current = (await store.profile.get()) ?? {};
      const { patch, notes, changed } = prepareProfilePatch(input.patch, current);
      if (!changed.length) throw new Error(`Nothing to update${notes.length ? `: ${notes.join("; ")}` : ""}`);
      guard(signal);
      const undos = [(await store.profile.update(patch))?.undo];
      const finished = patch.onboarded === true && !current.onboarded;
      if (finished) undos.push((await store.state.update({ onboarding: { status: "done" } }))?.undo);
      const fresh = await soft(() => store.profile.get());
      if (isPlainObject(fresh)) profileCache = fresh;
      const fields = changed.filter((k) => k !== "onboarded");
      const label = finished ? "Onboarding complete" : `Profile updated · ${fields.join(", ") || "onboarding"}`;
      ctx.actions.push({ type: "updated_profile", label, ref: null, undo: chainUndo(undos) });
      return { label, result: { ok: true, updated: changed, ...(notes.length ? { notes } : {}), ...(finished ? { onboarded: true } : {}) } };
    },

    async get_plan(input, ctx) {
      const which = ["next", "agreed", "draft"].includes(input.which) ? input.which : "next";
      const state = (await soft(() => store.state.get())) ?? {};
      const plan = which === "draft" ? await store.plans.getDraft() : await store.plans.getAgreed();
      if (!plan) {
        return { label: "Checked the plan", result: which === "draft" ? "No draft plan." : "No agreed plan yet. Offer to request one with request_plan." };
      }
      const done = state.rotation?.planId === plan.id && Array.isArray(state.rotation.done) ? state.rotation.done : [];
      if (which === "next" || input.workoutId) {
        const w = which === "next" && !input.workoutId
          ? attempt(() => C.nextWorkout(plan, state))
          : (plan.workouts ?? []).find((x) => x.id === String(input.workoutId));
        if (!w) {
          return { label: "Checked the plan", result: input.workoutId ? `No workout ${input.workoutId} in that plan.` : `All ${plan.workouts?.length ?? 0} workouts of plan ${plan.id} are done. Suggest requesting next week's plan.` };
        }
        const full = which === "draft" ? w : withTargets(w, await loadSessionsAsc(), ctx.today);
        const idx = (plan.workouts ?? []).findIndex((x) => x.id === w.id);
        return {
          label: `Checked ${clip(w.title, 30)}`,
          result: { planId: plan.id, position: `${idx + 1} of ${plan.workouts?.length ?? "?"}`, done, workout: formatWorkout(full) },
        };
      }
      const v = plan.validation;
      return {
        label: "Checked the plan",
        result: {
          overview: formatPlanOverview(plan, { done: which === "agreed" ? done : [], label: which === "draft" ? "Draft plan" : "Agreed plan" }),
          rationale: clip(plan.rationale, 500),
          ...(isPlainObject(v) ? { validation: { ok: v.ok, errors: (v.errors ?? []).slice(0, 6).map((e) => e.message), warnings: (v.warnings ?? []).slice(0, 6).map((e) => e.message) } } : {}),
        },
      };
    },

    async get_history(input) {
      const limit = clampInt(input.limit ?? 8, 1, 20, 8);
      const query = {};
      if (isIsoDate(input.from)) query.from = input.from;
      if (isIsoDate(input.to)) query.to = input.to;
      const wantedType = input.sessionType ?? input.type;
      if (SESSION_TYPES.includes(wantedType)) query.type = wantedType;
      const inRange = (s) => (!query.from || s.date >= query.from) && (!query.to || s.date <= query.to) && (!query.type || s.type === query.type);
      const line = (s) => formatSessionCompact(s, { notesChars: 100, commentChars: 80 });
      if (input.exerciseId) {
        const ex = attempt(() => cat.getExercise?.(String(input.exerciseId))) ?? attempt(() => cat.findExercise?.(String(input.exerciseId)));
        const id = ex?.id ?? String(input.exerciseId);
        const all = (await store.sessions.list({ ...query, limit: SESSIONS_FETCH_LIMIT })) ?? [];
        const matching = all.filter((s) => inRange(s) && (s.strength ?? []).some((e) => e?.exerciseId === id));
        const stats = attempt(() => C.exerciseStats(sortSessionsAsc(all), id));
        return {
          label: `Read ${ex?.name ?? id} history`,
          result: { exerciseId: id, count: matching.length, sessions: matching.slice(0, limit).map(line), stats: compactStats(stats) },
        };
      }
      const list = ((await store.sessions.list({ ...query, limit })) ?? []).filter(inRange).slice(0, limit);
      return { label: "Read history", result: { count: list.length, sessions: list.map(line) } };
    },

    async log_session(input, ctx, signal) {
      const raw = sessionFromToolInput(input);
      if (!raw) throw new Error("send the session fields (sessionType, strength/run/conditioning, …)");
      const t = ctx.today;
      const [state, agreed, existing] = await Promise.all([
        soft(() => store.state.get(), {}), soft(() => store.plans.getAgreed()), soft(() => store.sessions.list({ limit: SESSIONS_FETCH_LIMIT }), []),
      ]);
      const notes = [];
      let workoutId = typeof raw.workoutId === "string" && raw.workoutId.trim() ? raw.workoutId.trim() : null;
      let planned = null;
      if (workoutId && agreed) {
        if (/^(next|today|up ?next|todays?)$/i.test(workoutId)) workoutId = attempt(() => C.nextWorkout(agreed, state))?.id ?? null;
        planned = (agreed.workouts ?? []).find((w) => w.id === workoutId) ?? null;
        if (!planned) notes.push(`workout ${raw.workoutId} is not in the agreed plan; logged as unplanned`);
      } else if (workoutId) notes.push("no agreed plan; logged as unplanned");
      const base = {
        ...raw,
        type: SESSION_TYPES.includes(raw.type) ? raw.type : (planned?.type ?? "other"),
        date: isIsoDate(raw.date) ? raw.date : t,
        title: String(raw.title ?? "").trim() || planned?.title || defaultTitle(raw.type),
        workoutId: planned ? planned.id : null,
        planId: planned ? agreed.id : null,
        status: ["done", "partial", "missed"].includes(raw.status) ? raw.status : "done",
        createdBy: "chat",
      };
      const session = C.normalizeSession(base, { today: t });
      if (!isPlainObject(session)) throw new Error("could not read that session");
      const prior = sortSessionsAsc(existing);
      session.prs = attempt(() => C.detectPrs(session, prior), Array.isArray(session.prs) ? session.prs : []);
      guard(signal);
      const res = await store.sessions.add(session);
      const id = res?.id ?? res?.session?.id ?? session.id ?? null;
      const undos = [res?.undo];
      let rotation = state?.rotation;
      if (planned && session.status !== "missed") {
        const next = attempt(() => C.markWorkoutDone(state, agreed, planned.id));
        if (isPlainObject(next)) {
          undos.push((await store.state.update({ rotation: next }))?.undo);
          rotation = next;
        }
      }
      const saved = { ...session, id };
      const after = [...prior, saved];
      const items = strengthItems(agreed);
      const nextTargets = targetsFor((saved.strength ?? []).map((e) => items.get(e?.exerciseId)).filter(Boolean), after, t, 8);
      const upNext = agreed ? attempt(() => C.nextWorkout(agreed, { ...state, rotation })) : null;
      const label = sessionLabel(saved);
      ctx.actions.push({ type: "logged_session", label, ref: id, undo: chainUndo(undos) });
      return {
        label,
        result: {
          id,
          logged: formatSessionCompact(saved, { notesChars: 80, withId: false }),
          prs: (saved.prs ?? []).slice(0, 6).map((p) => ({ exerciseId: p.exerciseId, kind: p.kind, value: p.value, previous: p.previous ?? null })),
          nextTargets,
          upNext: upNext ? `${upNext.id} ${upNext.title}` : (agreed ? "rotation complete" : null),
          ...(notes.length ? { notes } : {}),
        },
      };
    },

    async update_session(input, ctx, signal) {
      const id = String(input.sessionId ?? input.id ?? "").trim();
      if (!id) throw new Error("sessionId is required");
      if (!isPlainObject(input.patch)) throw new Error("patch must be an object");
      const existing = await store.sessions.get(id);
      if (!isPlainObject(existing)) throw new Error(`No session with id ${id}`);
      const clean = {};
      const ignored = [];
      const { feedback: fbPatch, ...restPatch } = input.patch;
      for (const [k, v] of Object.entries(restPatch)) (SESSION_PATCH_KEYS.includes(k) ? (clean[k] = cloneJson(v)) : ignored.push(k));
      let fbNote = null;
      if (fbPatch !== undefined) {
        const r = applyFeedbackPatch({ ...existing, ...clean }, fbPatch);
        if (!r.applied.length) throw new Error(`No exercise matched the feedback${r.unknown.length ? ` (${r.unknown.join(", ")})` : ""}. Exercises: ${(existing.strength ?? []).map((e) => e.exerciseId || e.name).join(", ") || "none"}`);
        if (r.strength) clean.strength = r.strength;
        if (r.conditioning) clean.conditioning = r.conditioning;
        fbNote = { tagged: r.applied, ...(r.unknown.length ? { unmatched: r.unknown } : {}) };
      }
      if (!Object.keys(clean).length) throw new Error(`Nothing to update (allowed: ${SESSION_PATCH_KEYS.join(", ")})`);
      if ("coachComment" in clean) clean.coachComment = clampWords(String(clean.coachComment ?? ""), 120);
      const merged = attempt(() => C.normalizeSession({ ...existing, ...clean }, { today: ctx.today }), { ...existing, ...clean });
      const patch = {};
      for (const k of Object.keys(clean)) patch[k] = merged[k] ?? clean[k];
      if ("strength" in clean || "run" in clean) {
        const prior = sortSessionsAsc(await soft(() => store.sessions.list({ limit: SESSIONS_FETCH_LIMIT }), []))
          .filter((s) => s.id !== id && String(s.date) <= String(merged.date));
        const prs = attempt(() => C.detectPrs({ ...merged, id }, prior));
        if (Array.isArray(prs)) patch.prs = prs;
      }
      patch.updatedAt = nowIso();
      guard(signal);
      const res = await store.sessions.update(id, patch);
      const title = clip(existing.title || existing.type || "session", 30);
      const label = Object.keys(clean).length === 1 && "coachComment" in clean ? `Comment saved · ${title}`
        : fbNote && Object.keys(restPatch).length === 0 ? `Feedback · ${title} · ${clip(fbNote.tagged.join(", "), 50)}` : `Updated · ${title}`;
      ctx.actions.push({ type: "updated_session", label, ref: id, undo: res?.undo });
      return {
        label,
        result: {
          id, updated: Object.keys(clean), session: formatSessionCompact({ ...existing, ...patch }, { notesChars: 80, commentChars: 80 }),
          ...(fbNote ? { feedback: fbNote } : {}), ...(ignored.length ? { ignored } : {}),
          ...(fbNote ? { nextTargets: await feedbackTargets({ ...existing, ...patch, id }, ctx.today) } : {}),
        },
      };
    },

    async request_plan(input, ctx, signal) {
      let kind = input.kind === "revise" ? "revise" : "generate";
      const note = [];
      if (kind === "revise" && !(await soft(() => store.plans.getDraft()))) {
        kind = "generate";
        note.push("there is no draft, so this is a request for a new plan");
      }
      const instruction = clip(String(input.instruction ?? ""), 400);
      guard(signal);
      const res = await store.state.update({ pendingPlanRequest: { kind, instruction, createdAt: nowIso() } });
      const label = kind === "revise" ? "Plan change requested" : "Plan requested";
      ctx.actions.push({ type: "plan_request", label, ref: kind, undo: res?.undo });
      return {
        label,
        result: { ok: true, kind, next: "The owner now sees a Generate plan button. Tell them to tap it (it takes 1-3 minutes). Do not write the plan yourself.", ...(note.length ? { note: note[0] } : {}) },
      };
    },

    async add_coach_note(input, ctx, signal) {
      const text = clip(String(input.text ?? ""), 300);
      if (!text) throw new Error("text is required");
      const kind = NOTE_KINDS.includes(input.kind) ? input.kind : "insight";
      guard(signal);
      const res = await store.coach.addNote({ kind, text });
      const label = `Noted · ${clip(text, 40)}`;
      ctx.actions.push({ type: "coach_note", label, ref: res?.id ?? res?.note?.id ?? null, undo: res?.undo });
      return { label, result: { ok: true, kind } };
    },

    async update_plan_workout(input, ctx, signal) {
      return changePlanWorkout(input, ctx, signal);
    },

    async log_wellness(input, ctx, signal) {
      if (typeof store.wellness?.add !== "function") throw new Error("Wellness logging isn't available in this app version; acknowledge the numbers in your reply instead.");
      const date = isIsoDate(input.date) ? input.date : ctx.today;
      if (date > ctx.today) throw new Error(`date ${date} is in the future (today is ${ctx.today})`);
      const entry = { date, source: "manual" };
      const notes = [];
      const parsed = typeof input.pasted === "string" && input.pasted.trim() ? parseWellnessText(input.pasted) : {};
      const src = { ...parsed, ...Object.fromEntries(Object.entries(input).filter(([, v]) => v !== undefined && v !== null && v !== "")) };
      for (const [k, [lo, hi]] of Object.entries(WELLNESS_NUMBERS)) {
        const v = numOr(src[k]);
        if (v === undefined) continue;
        if (v < lo || v > hi) { notes.push(`${k} ${v} ignored (expected ${lo}-${hi})`); continue; }
        entry[k] = k === "sleepHours" ? Math.round(v * 10) / 10 : Math.round(v);
      }
      if (src.hrvStatus !== undefined && src.hrvStatus !== null) {
        const hs = String(src.hrvStatus).toLowerCase().trim();
        if (TOOL_ENUMS.HRV_STATUSES.includes(hs)) entry.hrvStatus = hs;
        else notes.push(`hrvStatus "${src.hrvStatus}" ignored (use ${TOOL_ENUMS.HRV_STATUSES.join("|")})`);
      }
      if (typeof input.notes === "string" && input.notes.trim()) entry.notes = clip(input.notes.trim(), 300);
      if (Object.keys(entry).length <= 2) throw new Error(`No usable wellness values${notes.length ? `: ${notes.join("; ")}` : ""}`);
      const prior = (await soft(() => store.wellness.list?.({ from: addDaysISO(date, -28), to: addDaysISO(date, -1) }), [])) ?? [];
      guard(signal);
      const res = await store.wellness.add(entry);
      const saved = isPlainObject(res?.entry) ? res.entry : entry;
      const short = [
        saved.trainingReadiness != null ? `readiness ${saved.trainingReadiness}` : null,
        saved.sleepScore != null ? `sleep ${saved.sleepScore}` : saved.sleepHours != null ? `sleep ${saved.sleepHours} h` : null,
        saved.hrvStatus ? `HRV ${saved.hrvStatus}` : saved.hrvMs != null ? `HRV ${saved.hrvMs} ms` : null,
        saved.bodyBattery != null ? `battery ${saved.bodyBattery}` : null,
      ].filter(Boolean).slice(0, 3).join(" · ");
      const label = `Wellness · ${date === ctx.today ? "today" : date}${short ? ` · ${short}` : ""}`;
      ctx.actions.push({ type: "logged_wellness", label, ref: date, undo: res?.undo });
      return { label, result: { ok: true, saved: formatWellnessEntry(saved), readiness: wellnessBands(saved, Array.isArray(prior) ? prior.slice(-28) : []), ...(notes.length ? { notes } : {}) } };
    },

    async get_exercise_info(input) {
      const query = clip(String(input.query ?? ""), 80);
      if (!query) throw new Error("query is required");
      const ex = attempt(() => cat.getExercise?.(query)) ?? attempt(() => cat.findExercise?.(query));
      if (!isPlainObject(ex)) {
        const sugg = attempt(() => cat.searchExercises?.(query, { limit: 5 }), []);
        return {
          label: "Looked up exercise",
          result: { found: false, query, suggestions: (Array.isArray(sugg) ? sugg : []).filter(isPlainObject).map((e) => `${e.id} (${e.name})`) },
        };
      }
      const profile = (await soft(() => store.profile.get())) ?? {};
      const locs = profileLocations(profile);
      const allowed = locs.map((loc) => {
        const r = attempt(() => C.exerciseAllowed(ex.id, equipmentSet(profile, loc.id)));
        return { location: loc.id, ok: isPlainObject(r) ? !!r.ok : exerciseOk(ex, equipmentSet(profile, loc.id)), missing: Array.isArray(r?.missing) ? r.missing : [] };
      });
      const defLoc = profile?.equipment?.defaultLocationId ?? locs[0].id;
      const subs = attempt(() => C.findSubstitutes(ex.id, equipmentSet(profile, defLoc), profile, { limit: 3 }), []);
      return {
        label: `Looked up ${clip(ex.name, 30)}`,
        result: {
          id: ex.id, name: ex.name, pattern: ex.pattern, modality: ex.modality, primary: ex.primary, secondary: ex.secondary,
          equipment: ex.equipment, unit: ex.unit, skill: ex.skill, jointStress: ex.jointStress, allowed,
          substitutes: (Array.isArray(subs) ? subs : []).slice(0, 3).map((id) => (exerciseName(id) ? `${id} (${exerciseName(id)})` : String(id))),
        },
      };
    },
  };

  function makeTools(mode, ctx, maxCount) {
    const order = mode === "onboarding" ? ONBOARDING_TOOL_ORDER : mode === "review" ? REVIEW_TOOL_ORDER : CHAT_TOOL_ORDER;
    return order.filter((name) => TOOL_SPECS[name] && IMPLS[name] && !checkToolSpec(TOOL_SPECS[name]).length)
      .slice(0, Math.max(0, maxCount)).map((name) => wrapTool(name, IMPLS[name], ctx));
  }

  // ---------- chat ----------

  async function chatContext(mode, profile) {
    const t = today();
    const [coachMem, state, agreed, draft, sessionsDesc, wellness] = await Promise.all([
      soft(() => store.coach.get(), {}), soft(() => store.state.get(), {}), soft(() => store.plans.getAgreed()),
      soft(() => store.plans.getDraft()), soft(() => store.sessions.list({ limit: SESSIONS_FETCH_LIMIT }), []),
      mode === "chat" ? soft(() => store.wellness?.list?.({ from: addDaysISO(t, -13), to: t }), []) : [],
    ]);
    const sessionsAsc = sortSessionsAsc(sessionsDesc);
    const data = {
      mode, today: t, weekday: weekdayName(t), profile, coach: memoryForPrompt(coachMem),
      equipmentNames: isPlainObject(cat.EQUIPMENT) ? cat.EQUIPMENT : {},
    };
    if (mode === "chat") {
      const next = agreed ? attempt(() => C.nextWorkout(agreed, state)) : null;
      Object.assign(data, {
        agreedPlan: agreed, draftPlan: draft, state,
        nextWorkout: next ? withTargets(next, sessionsAsc, t) : null,
        trainingSummary: attempt(() => C.trainingSummary(sessionsAsc, profile, { weeks: 4, today: t })),
        recentSessions: [...sessionsAsc].reverse().slice(0, 3),
        pacesText: pacesFor(profile),
        wellness: Array.isArray(wellness) ? wellness : [],
      });
    }
    return { t, coachMem: coachMem ?? {}, state: state ?? {}, data };
  }

  function instructionsFor(mode, data, toolNames) {
    const rules = mode === "onboarding" ? K.ONBOARDING_RULES : K.CHAT_RULES;
    const head = buildInstructionsTurn({ mode, rules, snapshot: "", toolNames });
    const room = CHAT_BUDGETS.instructionsBytes - utf8Bytes(head);
    const snapshot = buildContextSnapshot(data, { maxBytes: Math.max(2000, Math.min(26000, room)) });
    return buildInstructionsTurn({ mode, rules, snapshot, toolNames });
  }

  async function maybeSummarize(prior, coachMem, lim, signal, t) {
    const older = prior.slice(0, Math.max(0, prior.length - CHAT_BUDGETS.historyMessages));
    if (!older.length) return;
    const { throughTs, text } = parseSummary(coachMem?.summary);
    const isNew = (m) => !throughTs || (typeof m.ts === "string" && m.ts > throughTs);
    const pending = older.filter(isNew);
    if (prior.filter(isNew).length <= SUMMARY_STALE_AFTER || !pending.length) return;
    const batch = pending.slice(-SUMMARY_SCAN);
    const res = await callSample(buildSummaryPrompt({ previousSummary: text, messages: batch, today: t }), {
      modelTier: tierFor("quick", lim), cache: false, signal,
    });
    const last = batch[batch.length - 1];
    const stored = composeSummary(res.text, typeof last?.ts === "string" ? last.ts : nowIso());
    await soft(() => store.coach.setSummary(stored));
    coachMem.summary = stored;
  }

  async function persistReply(text, actions, error, detail) {
    const message = { role: "assistant", text: String(text ?? ""), actions: actions.map(({ type, label, ref }) => ({ type, label, ref: ref ?? null })), error: error ?? null };
    const errorDetail = errorDetailOf(error, detail);
    if (errorDetail) message.errorDetail = errorDetail;
    await soft(() => store.chat.append(message));
  }
  function toolCount(lim) {
    if (!isPlainObject(lim?.tools) || toolsBlocked) return 0;
    const n = Number(lim.tools.maxCount);
    return Number.isFinite(n) ? Math.max(0, Math.min(MAX_TOOLS, Math.floor(n))) : MAX_TOOLS;
  }

  async function send(text, { signal, onText, onTool } = {}) {
    const userText = String(text ?? "").trim();
    const actions = [];
    if (!userText) return { text: "", actions, error: "invalid_request", errorDetail: "empty message" };
    if (isClearCommand(userText)) return { text: "", actions, error: null, command: "clear" }; // a UI command, never sent to Claude
    if (!store) return { text: "", actions, error: "no_user" };

    let prior;
    let profile;
    try {
      prior = (await store.chat.recent(CHAT_BUDGETS.historyMessages + SUMMARY_SCAN)) ?? [];
      // A manual retry re-sends the last owner message: don't store it twice (trailing failed replies are skipped).
      let k = prior.length - 1;
      while (k >= 0 && prior[k]?.role === "assistant" && prior[k].error && !(prior[k].actions ?? []).length) k -= 1;
      const isRetry = prior[k]?.role === "user" && String(prior[k].text ?? "").trim() === userText;
      if (!isRetry) await store.chat.append({ role: "user", text: userText, actions: [], error: null });
      profile = (await store.profile.get()) ?? {};
      profileCache = profile;
    } catch (e) {
      return { text: "", actions, error: anyError(e).code };
    }

    const blocked = unavailableCode();
    if (blocked) {
      await persistReply("", actions, blocked);
      return { text: "", actions, error: blocked };
    }

    const mode = profile.onboarded ? "chat" : "onboarding";
    let partial = "";
    try {
      const { t, coachMem, state, data } = await chatContext(mode, profile);
      if (mode === "onboarding" && (state.onboarding?.status ?? "not_started") === "not_started") {
        await soft(() => store.state.update({ onboarding: { status: "in_progress" } }));
      }
      const lim = await getLimits();
      try {
        await maybeSummarize(prior, coachMem, lim, signal, t);
      } catch (e) {
        if (SUMMARY_FATAL_CODES.has(e?.code)) throw e;
        // Otherwise carry on without a fresh summary; the main call is a different request, not a retry.
      }
      data.coach = memoryForPrompt(coachMem); // include a summary written just now
      const maxCount = toolCount(lim);
      const ctx = { mode, actions, onTool, today: t };
      const tools = makeTools(mode, ctx, maxCount);
      const instructions = instructionsFor(mode, data, tools.map((x) => x.name));
      const turns = buildChatTurns({ instructions, history: prior, userText });
      const res = await callSample(turns, {
        cache: false,
        modelTier: tierFor(state.settings?.chatTier === "quick" ? "quick" : "default", lim),
        signal,
        tools: tools.length ? tools : undefined,
        onText: typeof onText === "function" ? (u) => { partial = u.text; emit(onText, { text: u.text, delta: u.delta }); } : undefined,
      });
      const reply = String(res?.text ?? "");
      await persistReply(reply, actions, null);
      return { text: reply, actions, error: null };
    } catch (e) {
      const err = isPlainObject(e) && typeof e.code === "string" ? e : anyError(e);
      const kept = err.code === "refused" ? "" : (typeof err.text === "string" ? err.text : partial);
      const errorDetail = errorDetailOf(err.code, err.message);
      await persistReply(kept, actions, err.code, err.message);
      return { text: kept, actions, error: err.code, ...(errorDetail ? { errorDetail } : {}) };
    }
  }

  async function startOnboarding({ signal, onText, onTool } = {}) {
    const actions = [];
    if (!store) return { text: "", actions, error: "no_user" };
    const blocked = unavailableCode();
    if (blocked) return { text: "", actions, error: blocked };
    let partial = "";
    try {
      let profile = (await store.profile.get()) ?? {};
      if (profile.onboarded) {
        await store.profile.update({ onboarded: false, updatedAt: nowIso() }); // a restart of onboarding
        profile = { ...profile, onboarded: false };
      }
      profileCache = profile;
      await soft(() => store.state.update({ onboarding: { status: "in_progress" } }));
      const { t, state, data } = await chatContext("onboarding", profile);
      const lim = await getLimits();
      const maxCount = toolCount(lim);
      const tools = makeTools("onboarding", { mode: "onboarding", actions, onTool, today: t }, maxCount);
      const instructions = instructionsFor("onboarding", data, tools.map((x) => x.name));
      const res = await callSample([{ role: "user", content: instructions }, { role: "user", content: ONBOARDING_START_TURN }], {
        cache: false,
        modelTier: tierFor(state.settings?.chatTier === "quick" ? "quick" : "default", lim),
        signal,
        tools: tools.length ? tools : undefined,
        onText: typeof onText === "function" ? (u) => { partial = u.text; emit(onText, { text: u.text, delta: u.delta }); } : undefined,
      });
      const reply = String(res?.text ?? "");
      await persistReply(reply, actions, null);
      return { text: reply, actions, error: null };
    } catch (e) {
      const err = isPlainObject(e) && typeof e.code === "string" ? e : anyError(e);
      const kept = err.code === "refused" ? "" : (typeof err.text === "string" ? err.text : partial);
      const errorDetail = errorDetailOf(err.code, err.message);
      if (actions.length) await persistReply(kept, actions, err.code, err.message);
      return { text: kept, actions, error: err.code, ...(errorDetail ? { errorDetail } : {}) };
    }
  }

  // ---------- plans ----------

  function normalizePlan(raw, { id, weekStart, profile }) {
    let p = raw;
    if (isPlainObject(p?.plan) && Array.isArray(p.plan.workouts)) p = p.plan;
    if (!isPlainObject(p)) p = {};
    const defLoc = profile?.equipment?.defaultLocationId || profileLocations(profile)[0].id;
    const seen = new Set();
    const fillName = (it) => (isPlainObject(it) ? { ...it, name: it.name || exerciseName(it.exerciseId) || String(it.exerciseId ?? "") } : it);
    const workouts = (Array.isArray(p.workouts) ? p.workouts : []).filter(isPlainObject).map((w, i) => {
      let wid = typeof w.id === "string" && w.id.trim() ? w.id.trim() : `W${i + 1}`;
      if (seen.has(wid)) wid = `W${i + 1}${seen.has(`W${i + 1}`) ? "b" : ""}`;
      seen.add(wid);
      const blocks = (Array.isArray(w.blocks) ? w.blocks : []).filter(isPlainObject).map((b) => {
        if (b.kind === "strength") {
          return { ...b, items: (Array.isArray(b.items) ? b.items : []).map((it) => (isPlainObject(it)
            ? { ...fillName(it), alternatives: Array.isArray(it.alternatives) ? it.alternatives : [], supersetGroup: it.supersetGroup ?? null }
            : it)) };
        }
        if (b.kind === "conditioning") return { ...b, items: (Array.isArray(b.items) ? b.items : []).map(fillName) };
        return b;
      });
      return { ...w, id: wid, locationId: w.locationId || defLoc, blocks };
    });
    return {
      id, status: "draft", weekStart, createdAt: nowIso(), approvedAt: null,
      focus: clip(String(p.focus ?? ""), 140),
      rationale: clip(String(p.rationale ?? ""), 1200),
      workouts,
      weeklyTargets: { runKm: null, conditioningSessions: null, strengthSetsPerMuscle: {} },
      notes: (Array.isArray(p.notes) ? p.notes : []).map((n) => clip(String(n), 200)).filter(Boolean).slice(0, 8),
      validation: null,
    };
  }

  function weeklyTargetsOf(plan, validation) {
    const stats = isPlainObject(validation?.stats) ? validation.stats : {};
    const runBlocks = plan.workouts.flatMap((w) => w.blocks.filter((b) => b.kind === "run"));
    const summedKm = Math.round(runBlocks.reduce((n, b) => n + (Number(b.totalKm) || 0), 0) * 10) / 10;
    const condCount = plan.workouts.filter((w) => w.blocks.some((b) => b.kind === "conditioning")).length;
    const sets = isPlainObject(stats.setsPerMuscle) ? stats.setsPerMuscle : attempt(() => C.plannedSetsPerMuscle(plan), {});
    return {
      runKm: Number(stats.runKm ?? summedKm) || null,
      conditioningSessions: Number(stats.conditioningCount ?? condCount) || null,
      strengthSetsPerMuscle: isPlainObject(sets) ? sets : {},
    };
  }

  async function runPlan({ instruction = "", signal, onProgress, revise = false }) {
    const progress = (phase, extra = {}) => emit(onProgress, { phase, label: PROGRESS_LABELS[phase], ...extra });
    const blocked = unavailableCode();
    if (blocked) throw { code: blocked, message: errorCopy(blocked) };
    try {
      progress("preparing");
      const t = today();
      const [profile, coachMem, state, agreed, draft, sessionsDesc] = await Promise.all([
        store.profile.get(), soft(() => store.coach.get(), {}), soft(() => store.state.get(), {}),
        soft(() => store.plans.getAgreed()), soft(() => store.plans.getDraft()),
        soft(() => store.sessions.list({ limit: SESSIONS_FETCH_LIMIT }), []),
      ]);
      const sessionsAsc = sortSessionsAsc(sessionsDesc);
      const base = revise && isPlainObject(draft) ? draft : null;
      // Adaptive planning (Agent P): last week's logged progress leads the prompt and overrides onboarding baselines.
      const [planList, wellness] = await Promise.all([
        soft(() => store.plans.list?.({ limit: 12 }), []),
        soft(() => store.wellness?.list?.({ from: addDaysISO(today(), -27), to: today() }), []),
      ]);
      const plansForDigest = [...(Array.isArray(planList) ? planList : []), agreed].filter(isPlainObject);
      const digest = attempt(() => progressionDigest({
        sessions: sessionsAsc, plans: plansForDigest, wellness: Array.isArray(wellness) ? wellness : [], profile, today: today(), weeks: 2,
      }));
      const lim = await getLimits();
      const tier = tierFor("complex", lim);

      const thisWeek = weekStartOf(t);
      const weekStart = base?.weekStart && isIsoDate(base.weekStart) ? base.weekStart
        : (isIsoDate(agreed?.weekStart) && agreed.weekStart >= thisWeek ? addDaysISO(agreed.weekStart, 7) : thisWeek);
      const id = weekStart; // provisional: store.plans.saveDraft assigns the final id (weekStart, -2, -3…)

      const workoutCount = clampInt(profile?.schedule?.daysPerWeek, 1, 7, 3);
      const minutesPerSession = clampInt(profile?.schedule?.minutesPerSession, 10, 240, 60);
      const allowedLocations = allowedByLocation(profile);
      const runLoad = runLoadOf(sessionsAsc, t);
      const mem = memoryForPrompt(coachMem);
      const memoryText = [
        mem.summary ? `Summary: ${mem.summary}` : "",
        ...(Array.isArray(mem.notes) ? mem.notes.slice(-20) : []).map((n) => `- ${n.date ?? ""} [${n.kind}] ${clip(n.text, 300)}`),
      ].filter(Boolean).join("\n");
      const from14 = addDaysISO(t, -13);
      const previousDone = state.rotation?.planId === agreed?.id ? state.rotation?.done : [];
      const common = { workoutCount, minutesPerSession, runLoad, allowedLocations };
      const prompt = buildPlanPrompt({
        ...common,
        rules: K.PLAN_RULES, today: t, weekStart, profile, memoryText,
        trainingSummary: attempt(() => C.trainingSummary(sessionsAsc, profile, { weeks: 4, today: t })),
        recentSessions: sessionsAsc.filter((s) => s.date >= from14 && s.date <= t),
        targets: targetsFor([...strengthItems(base ?? agreed).values()], sessionsAsc, t, 40),
        previousPlan: agreed, previousDone, draft: base, instruction, pacesText: pacesFor(profile),
        digest,
      });

      progress("generating");
      let phaseNow = "generating";
      const jsonOpts = { modelTier: tier, cache: false, signal, onText: ({ text }) => progress(phaseNow, { chars: text.length }) };
      const raw = await callJson(prompt, jsonOpts);
      let plan = normalizePlan(raw, { id, weekStart, profile });

      progress("validating");
      const validate = (p) => attempt(() => C.validatePlan(p, { profile, sessions: sessionsAsc, today: t }));
      let validation = validate(plan);
      const errorCount = (v) => (Array.isArray(v?.errors) ? v.errors.length : 0);
      if (errorCount(validation) > 0) {
        phaseNow = "repairing";
        progress("repairing", { issues: errorCount(validation) });
        try {
          const raw2 = await callJson(buildRepairPrompt({
            ...common, plan, errors: validation.errors, locationIds: profileLocations(profile).map((l) => l.id),
          }), jsonOpts);
          const plan2 = normalizePlan(raw2, { id, weekStart, profile });
          const v2 = validate(plan2);
          if (plan2.workouts.length && errorCount(v2) <= errorCount(validation)) {
            plan = plan2;
            validation = v2;
          }
        } catch (e) {
          if (e?.code === "cancelled") throw e;
          // Keep the first plan: its validation errors stay visible on the draft and the owner decides.
        }
      }
      if (signal?.aborted) throw { code: "cancelled", message: "Stopped" };
      plan.validation = isPlainObject(validation) ? validation : null;
      plan.weeklyTargets = weeklyTargetsOf(plan, validation);

      progress("saving");
      const res = await store.plans.saveDraft(plan);
      let saved = plan;
      if (isPlainObject(res?.plan)) saved = res.plan;
      else if (isPlainObject(res) && Array.isArray(res.workouts)) { const { undo, ...rest } = res; saved = rest; }
      else if (typeof res?.id === "string") saved = { ...plan, id: res.id };
      if (state.pendingPlanRequest) await soft(() => store.state.update({ pendingPlanRequest: null }));
      progress("done");
      return { plan: saved, validation: plan.validation, undo: res?.undo };
    } catch (e) {
      const err = isPlainObject(e) && typeof e.code === "string" ? e : anyError(e);
      throw { code: err.code, message: String(err.message ?? err.code), ...(typeof err.text === "string" ? { text: err.text } : {}) };
    }
  }

  // ---------- comments ----------

  async function commentOnSession(sessionId, { signal } = {}) {
    const blocked = unavailableCode();
    if (blocked) throw { code: blocked, message: errorCopy(blocked) };
    try {
      const id = String(sessionId ?? "");
      const session = await store.sessions.get(id);
      if (!isPlainObject(session)) throw { code: "not_found", message: `No session ${id}` };
      const t = today();
      const [profile, agreed, all] = await Promise.all([
        soft(() => store.profile.get(), {}), soft(() => store.plans.getAgreed()), loadSessionsAsc(),
      ]);
      const prior = all.filter((s) => s.id !== id && String(s.date) <= String(session.date));
      const withThis = [...prior, session];
      const exIds = [...new Set((session.strength ?? []).map((e) => e?.exerciseId).filter(Boolean))].slice(0, 6);
      const exerciseStats = exIds.map((exId) => {
        const st = attempt(() => C.exerciseStats(withThis, exId));
        return { exerciseId: exId, bestE1rm: st?.bestE1rm ?? null, flag: st?.flag ?? null };
      });
      const items = strengthItems(agreed);
      const planned = session.planId && agreed?.id === session.planId ? (agreed.workouts ?? []).find((w) => w.id === session.workoutId) : null;
      const lim = await getLimits();
      const res = await callSample(buildCommentPrompt({
        rules: K.COMMENT_RULES, session, profile, plannedWorkout: planned, exerciseStats,
        nextTargets: targetsFor(exIds.map((x) => items.get(x)).filter(Boolean), withThis, t, 6),
        previousSessions: [...prior].reverse().slice(0, 3),
      }), { modelTier: tierFor("quick", lim), cache: false, signal });
      const text = clampWords(String(res?.text ?? "").replace(/\s+/g, " ").trim());
      if (!text) throw { code: "empty_completion", message: "empty comment" };
      if (signal?.aborted) throw { code: "cancelled", message: "Stopped" };
      await store.sessions.update(id, { coachComment: text, updatedAt: nowIso() });
      return text;
    } catch (e) {
      const err = isPlainObject(e) && typeof e.code === "string" ? e : anyError(e);
      throw { code: err.code, message: String(err.message ?? err.code) };
    }
  }

  // ---------- post-workout review ----------

  /**
   * Post-workout review (CONTRACT-v2): started by the owner's save tap on a Plan quick-log. One sample call
   * (default tier, cache false) with the review tools: Claude reviews the session and its feedback and may change
   * remaining workouts with update_plan_workout. The reply is stored as an assistant chat message (with plan_change
   * actions) after an event line, and session.reviewedAt is set. Always resolves { text, actions, error }.
   * @param {string} sessionId
   * @param {{ signal?: AbortSignal, onText?: Function, onTool?: Function }} [opts]
   * @returns {Promise<SendResult>}
   */
  async function reviewWorkout(sessionId, { signal, onText, onTool } = {}) {
    const actions = [];
    if (!store) return { text: "", actions, error: "no_user" };
    const blocked = unavailableCode();
    if (blocked) return { text: "", actions, error: blocked };
    let partial = "";
    try {
      const id = String(sessionId ?? "");
      const session = await store.sessions.get(id);
      if (!isPlainObject(session)) return { text: "", actions, error: "not_found" };
      const t = today();
      const [profile, coachMem, state, agreed, sessionsDesc, wellness, planList] = await Promise.all([
        soft(() => store.profile.get(), {}), soft(() => store.coach.get(), {}), soft(() => store.state.get(), {}),
        soft(() => store.plans.getAgreed()), soft(() => store.sessions.list({ limit: SESSIONS_FETCH_LIMIT }), []),
        soft(() => store.wellness?.list?.({ from: addDaysISO(t, -27), to: t }), []), soft(() => store.plans.list?.({ limit: 12 }), []),
      ]);
      const sessionsAsc = sortSessionsAsc([...(sessionsDesc ?? []).filter((s) => s?.id !== id), session]);
      const plan = isPlainObject(agreed) ? agreed : null;
      const locked = plan ? lockedWorkoutIds(plan, state, sessionsAsc) : new Set();
      if (plan && session.workoutId && (session.planId === plan.id || !session.planId)) locked.add(session.workoutId);
      const workouts = plan ? (plan.workouts ?? []).filter(isPlainObject) : [];
      const planned = workouts.find((w) => w.id === session.workoutId && (!session.planId || session.planId === plan?.id)) ?? null;
      const items = strengthItems(plan);
      const exercises = (session.strength ?? []).filter(isPlainObject).slice(0, 10).map((e) => {
        const item = items.get(e.exerciseId) ?? (e.exerciseId ? { exerciseId: e.exerciseId, reps: String(e.sets?.find((x) => x?.type !== "warmup")?.reps ?? ""), progression: "double" } : null);
        const target = item ? attempt(() => C.nextTarget(sessionsAsc, item, { today: t })) : null;
        return { exerciseId: e.exerciseId ?? null, name: e.name, feedback: e.feedback ?? null, target: isPlainObject(target) ? target : null };
      });
      const wl = Array.isArray(wellness) ? wellness : [];
      const digest = attempt(() => progressionDigest({
        sessions: sessionsAsc, plans: [...(Array.isArray(planList) ? planList : []), plan].filter(isPlainObject), wellness: wl, profile, today: t, weeks: 2,
      }));
      const lim = await getLimits();
      const ctx = { mode: "review", actions, onTool, today: t };
      const tools = plan ? makeTools("review", ctx, toolCount(lim)) : [];
      const toolNames = tools.map((x) => x.name);
      const head = buildInstructionsTurn({ mode: "review", rules: K.REVIEW_RULES, snapshot: "", toolNames });
      const snapshot = buildReviewSnapshot({
        today: t, weekday: weekdayName(t), profile, coach: memoryForPrompt(coachMem),
        equipmentNames: isPlainObject(cat.EQUIPMENT) ? cat.EQUIPMENT : {},
        session, plannedWorkout: planned, exercises, plan,
        remaining: workouts.filter((w) => !locked.has(w.id)).map((w) => withTargets(w, sessionsAsc, t)),
        doneWorkouts: workouts.filter((w) => locked.has(w.id)),
        digest, wellness: wl,
        trainingSummary: attempt(() => C.trainingSummary(sessionsAsc, profile, { weeks: 4, today: t })),
        pacesText: pacesFor(profile),
      }, { maxBytes: Math.max(2000, Math.min(26000, CHAT_BUDGETS.instructionsBytes - utf8Bytes(head))) });
      const instructions = buildInstructionsTurn({ mode: "review", rules: K.REVIEW_RULES, snapshot, toolNames });
      const tagged = exercises.filter((e) => e.feedback).map((e) => `${clip(e.name || e.exerciseId, 24)} ${e.feedback}`);
      await soft(() => store.chat.append({
        role: "event",
        text: clip(`Logged ${session.title || "a workout"} from the Plan tab${tagged.length ? ` (felt: ${tagged.join(", ")})` : ""}; the coach reviews it.`, 280),
        actions: [], error: null,
      }));
      const res = await callSample([{ role: "user", content: instructions }, { role: "user", content: REVIEW_START_TURN }], {
        cache: false,
        modelTier: tierFor("default", lim),
        signal,
        tools: tools.length ? tools : undefined,
        onText: typeof onText === "function" ? (u) => { partial = u.text; emit(onText, { text: u.text, delta: u.delta }); } : undefined,
      });
      const reply = String(res?.text ?? "");
      await persistReply(reply, actions, null);
      await soft(() => store.sessions.update(id, { reviewedAt: nowIso() }));
      return { text: reply, actions, error: null };
    } catch (e) {
      const err = isPlainObject(e) && typeof e.code === "string" ? e : anyError(e);
      const kept = err.code === "refused" ? "" : (typeof err.text === "string" ? err.text : partial);
      const errorDetail = errorDetailOf(err.code, err.message);
      // keep what the tools already changed visible (with Undo); a plain failure is reported by the UI only
      if (actions.length) await persistReply(kept, actions, err.code, err.message);
      return { text: kept, actions, error: err.code, ...(errorDetail ? { errorDetail } : {}) };
    }
  }

  // ---------- public ----------

  function status() {
    if (!sample) return { available: false, reason: "sample_unavailable", code: "sample_unavailable" };
    if (noUser) return { available: false, reason: "no_user", code: "no_user" };
    if (deniedCode) return { available: false, reason: "not_granted", code: deniedCode };
    return { available: true, reason: null, code: null };
  }

  return {
    status,
    isOnboarding: () => !profileCache?.onboarded,
    send,
    startOnboarding,
    generatePlan: ({ instruction = "", signal, onProgress } = {}) => runPlan({ instruction, signal, onProgress, revise: false }),
    reviseDraft: (instruction, { signal, onProgress } = {}) => runPlan({ instruction: String(instruction ?? ""), signal, onProgress, revise: true }),
    commentOnSession,
    reviewWorkout,
    undoPlanChange,
    planChangeActive,
    errorCopy,
  };
}

// ---------- module-private helpers ----------

/** `ChatMessage.errorDetail`: the platform's developer message for a failed call (≤ 300 chars), for debugging. */
function errorDetailOf(code, message) {
  if (!code || code === "cancelled") return "";
  const msg = String(message ?? "").replace(/\s+/g, " ").trim();
  if (!msg || msg === code) return "";
  return clip(msg, ERROR_DETAIL_CHARS);
}

/**
 * Map log_session's tool input (keyword-free names, flat; or the older `{ session: {...} }` shape with
 * Session field names) to a Session-shaped object for core.normalizeSession. Null when nothing usable was sent.
 * @param {object} input
 * @returns {object|null}
 */
export function sessionFromToolInput(input) {
  const src = isPlainObject(input?.session) ? input.session : input;
  if (!isPlainObject(src) || !Object.keys(src).length) return null;
  const { sessionType, workoutTitle, ...rest } = src;
  const s = { ...rest };
  if (sessionType !== undefined) s.type = sessionType;
  if (workoutTitle !== undefined) s.title = workoutTitle;
  if (s.missedReason !== undefined && s.missedReason !== null && !TOOL_ENUMS.MISSED_REASONS.includes(s.missedReason)) s.missedReason = "other";
  if (Array.isArray(s.strength)) {
    s.strength = s.strength.filter(isPlainObject).map((ex) => ({
      ...ex,
      sets: (Array.isArray(ex.sets) ? ex.sets : []).filter(isPlainObject).map(({ warmup, setType, ...st }) => ({
        ...st,
        type: st.type === "warmup" || setType === "warmup" || warmup === true ? "warmup" : "work",
        loadKg: Number.isFinite(Number(st.loadKg)) && st.loadKg !== null && st.loadKg !== "" ? Number(st.loadKg) : null,
        rir: Number.isFinite(Number(st.rir)) && st.rir !== null && st.rir !== "" ? Number(st.rir) : null,
      })),
    }));
  }
  if (Array.isArray(s.conditioning)) {
    s.conditioning = s.conditioning.filter(isPlainObject).map(({ metconFormat, summary, rounds, reps, timeSec, calories, completed, ...c }) => {
      const result = isPlainObject(c.result) ? { ...c.result } : {};
      for (const [k, v] of Object.entries({ rounds, reps, timeSec, calories, completed })) if (v !== undefined) result[k] = v;
      return { ...c, format: metconFormat ?? c.format ?? null, description: String(summary ?? c.description ?? ""), result };
    });
  }
  return s;
}

/**
 * Read a pasted block of readiness metrics (e.g. copied from Garmin Connect): "Training Readiness 62",
 * "Sleep score: 78", "Sleep 7h 20m", "HRV status Balanced", "HRV 48 ms", "Body Battery 70", "Resting HR 52", "Stress 31".
 * @param {string} text
 * @returns {object} log_wellness fields found (numbers, hrvStatus)
 */
export function parseWellnessText(text) {
  const t = String(text ?? "").replace(/\r/g, "");
  const out = {};
  const grab = (re) => { const m = re.exec(t); return m ? Number(m[1].replace(",", ".")) : undefined; };
  const set = (k, v) => { if (v !== undefined && Number.isFinite(v)) out[k] = v; };
  set("trainingReadiness", grab(/training\s*readiness[^0-9\n]{0,20}(\d{1,3})/i) ?? grab(/\breadiness[^0-9\n]{0,12}(\d{1,3})/i));
  set("sleepScore", grab(/sleep\s*score[^0-9\n]{0,12}(\d{1,3})/i) ?? grab(/\bsleep\b[^0-9\n]{0,6}(\d{2,3})(?!\s*(?:h|hr|hrs|hours|:|\.\d))/i));
  const hm = /(\d{1,2})\s*h(?:rs?|ours?)?\s*(\d{1,2})\s*m/i.exec(t);
  if (hm) set("sleepHours", Math.round((Number(hm[1]) + Number(hm[2]) / 60) * 10) / 10);
  else set("sleepHours", grab(/(\d{1,2}(?:[.,]\d)?)\s*(?:h|hrs?|hours?)\b(?:\s*(?:of\s*)?sleep|\s*slept)?/i));
  const st = /hrv(?:\s*status)?[^a-z0-9\n]{0,6}(balanced|unbalanced|low|poor)/i.exec(t);
  if (st) out.hrvStatus = st[1].toLowerCase();
  set("hrvMs", grab(/hrv[^0-9\n]{0,30}?(\d{2,3})\s*ms/i) ?? grab(/(\d{2,3})\s*ms\b/i));
  set("bodyBattery", grab(/body\s*battery[^0-9\n]{0,12}(\d{1,3})/i));
  set("restingHr", grab(/(?:resting\s*(?:hr|heart\s*rate)|rhr)[^0-9\n]{0,12}(\d{2,3})/i));
  set("stress", grab(/\bstress[^0-9\n]{0,12}(\d{1,3})/i));
  return out;
}

function defaultTitle(type) {
  return ({ strength: "Strength session", run: "Run", conditioning: "Conditioning", hybrid: "Hybrid session", mobility: "Mobility" })[type] ?? "Workout";
}

function sessionLabel(s) {
  if (s.status === "missed") return `Missed · ${clip(s.title, 30)}`;
  const detail = s.strength?.length ? `${s.strength.length} exercise${s.strength.length === 1 ? "" : "s"}`
    : s.run?.distanceKm ? `${fmtNum(s.run.distanceKm)} km`
      : s.conditioning?.length ? (s.conditioning[0]?.format ?? "metcon") : "";
  return `Logged · ${clip(s.title, 30)}${detail ? ` · ${detail}` : ""}`;
}

function compactStats(stats) {
  if (!isPlainObject(stats)) return null;
  const last = isPlainObject(stats.last) ? `${stats.last.date ?? ""} ${fmtSets(stats.last.sets)}`.trim() : stats.last ?? null;
  return {
    exposures: Array.isArray(stats.exposures) ? stats.exposures.length : stats.exposures ?? null,
    last,
    bestE1rm: stats.bestE1rm ?? null,
    trend: (Array.isArray(stats.trend) ? stats.trend : []).slice(-6).map((p) => `${p?.date} ${fmtNum(p?.e1rm)}${p?.reliability && p.reliability !== "ok" ? ` (${p.reliability})` : ""}`),
    flag: stats.flag ?? null,
  };
}

/**
 * Tolerant JSON reading (same order as sample.json): whole text, one code fence, first { or [ to last } or ].
 * @param {string} text
 * @returns {unknown} undefined when nothing parses
 */
export function parseJsonLoose(text) {
  const s = String(text ?? "").trim();
  const tryParse = (x) => { try { return JSON.parse(x); } catch { return undefined; } };
  let v = tryParse(s);
  if (v !== undefined) return v;
  const fence = s.match(/```(?:json)?\s*\n([\s\S]*?)\n?```/);
  if (fence) { v = tryParse(fence[1]); if (v !== undefined) return v; }
  const start = s.search(/[[{]/);
  const end = Math.max(s.lastIndexOf("}"), s.lastIndexOf("]"));
  return start >= 0 && end > start ? tryParse(s.slice(start, end + 1)) : undefined;
}
