// Pure training logic (owner: Agent A). See CONTRACT.md §5.2.
// No DOM, no platform calls. Strength progression / e1RM / stall rules are a faithful port of
// .claude/skills/personal-trainer/scripts/trainer.py (proved by tests/core.test.mjs).
import { EXERCISES, getExercise, findExercise, expandEquipment, equipmentCheck } from "./catalog.js";

// ================================================================== numbers & dates
const num = (x) => (typeof x === "number" ? (Number.isFinite(x) ? x : null) : x == null || x === "" ? null : Number.isFinite(Number(x)) ? Number(x) : null);
const r1 = (x) => (x == null ? null : Math.round(x * 10) / 10);
const r2 = (x) => (x == null ? null : Math.round(x * 100) / 100);
const clean = (x) => Number.parseFloat(x.toFixed(10));

/**
 * Epley estimated 1RM using reps-to-failure = reps + RIR. When reps + RIR ≤ 1 the load itself is returned.
 * @param {number} loadKg
 * @param {number} reps
 * @param {number} [rir=0]
 * @returns {number|null} unrounded estimate, or null for a non-positive load or reps
 */
export function e1rm(loadKg, reps, rir = 0) {
  const load = num(loadKg), r = num(reps);
  if (load == null || r == null || load <= 0 || r <= 0) return null;
  const total = r + (num(rir) || 0);
  return total <= 1 ? load : load * (1 + total / 30);
}

function setE1rm(s) {
  if (!s || s.bodyweight) return null; // trainer.py: "bw" loads are not numeric → no e1RM
  return e1rm(s.loadKg, s.reps, s.rir);
}
const hasRir = (s) => num(s?.rir) != null;
const isWarmup = (s) => /^(warmup|warm-up|warm up|w)$/i.test(String(s?.type ?? "").trim());

/** Raw port of trainer.py session_e1rm → { value (unrounded, 0 when none), tag } */
function sessionE1rmRaw(sets) {
  let pool = (sets || []).filter((s) => !isWarmup(s) && setE1rm(s));
  if (!pool.length) return { value: 0, tag: "none" };
  let tag = "ok";
  const withRir = pool.filter(hasRir);
  if (withRir.length) pool = withRir;
  else tag = "no_rir";
  const ok = pool.filter((s) => num(s.reps) + (num(s.rir) || 0) <= 12);
  if (ok.length) pool = ok;
  else tag = "high_rep";
  return { value: Math.max(...pool.map(setE1rm)), tag };
}
const unreliable = (tag) => tag === "high_rep" || tag === "none";

/**
 * Best e1RM of one exposure plus a reliability tag (trainer.py session_e1rm rules): uses only RIR-logged
 * sets when any exist ("no_rir" when none are), prefers sets with reps + RIR ≤ 12 ("high_rep" when only
 * longer sets exist). Warm-ups and bodyweight sets are ignored.
 * @param {Array<{type?: string, loadKg: number|null, bodyweight?: boolean, reps: number, rir: number|null}>} sets
 * @returns {{ value: number|null, reliability: "ok"|"no_rir"|"high_rep"|"none" }} value rounded to 0.1 kg
 */
export function sessionE1rm(sets) {
  const { value, tag } = sessionE1rmRaw(sets);
  return { value: tag === "none" ? null : r1(value), reliability: tag };
}

/**
 * Round to the nearest increment (ties to even, like Python's round(), so results match trainer.py).
 * @param {number} x
 * @param {number} inc
 * @returns {number}
 */
export function roundTo(x, inc) {
  if (!(inc > 0) || !Number.isFinite(x)) return x;
  const q = x / inc, f = Math.floor(q);
  const n = Math.abs(q - f - 0.5) < 1e-9 ? (f % 2 === 0 ? f : f + 1) : Math.round(q);
  return clean(n * inc);
}

/**
 * Percentage loads of a base (e1RM or working weight), rounded to the available increment.
 * @param {number} baseKg
 * @param {number[]} pcts e.g. [70, 80, 90]
 * @param {number} [inc=2.5]
 * @returns {Array<{pct: number, raw: number, rounded: number}>}
 */
export function pctLoads(baseKg, pcts, inc = 2.5) {
  return (pcts || []).map((pct) => {
    const raw = (baseKg * pct) / 100;
    return { pct, raw: r2(raw), rounded: roundTo(raw, inc) };
  });
}

/**
 * Average pace.
 * @param {number} distanceKm
 * @param {number} durationSec
 * @returns {number|null} whole seconds per km
 */
export function paceSecPerKm(distanceKm, durationSec) {
  const d = num(distanceKm), t = num(durationSec);
  if (!(d > 0) || !(t > 0)) return null;
  return Math.round(t / d);
}

/**
 * @param {number|null} secPerKm
 * @returns {string} "5:32/km", or "" when unknown
 */
export function formatPace(secPerKm) {
  const s = num(secPerKm);
  if (!(s > 0)) return "";
  const total = Math.round(s);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}/km`;
}

/**
 * Parse a duration to seconds. "45:30" = mm:ss, "1:02:10" = h:mm:ss, a bare number ("45" or 45) = minutes.
 * Also accepts unit forms: "1h 5m", "45 min", "90s", "1:05h"-free text like "50min".
 * @param {string|number} str
 * @returns {number|null} seconds
 */
export function parseDuration(str) {
  if (typeof str === "number") return Number.isFinite(str) && str >= 0 ? Math.round(str * 60) : null;
  const s = String(str ?? "").trim().toLowerCase();
  if (!s) return null;
  if (/^\d+(\.\d+)?$/.test(s)) return Math.round(Number(s) * 60);
  if (/^\d+(:\d{1,2}){1,2}(\.\d+)?$/.test(s)) {
    const parts = s.split(":").map(Number);
    if (parts.slice(1).some((p) => p >= 60)) return null;
    return Math.round(parts.reduce((acc, p) => acc * 60 + p, 0));
  }
  const re = /(\d+(?:\.\d+)?)\s*(h|hr|hrs|hours?|m|mins?|minutes?|s|secs?|seconds?)\b/g;
  let total = 0, matched = "", m;
  while ((m = re.exec(s))) {
    const v = Number(m[1]);
    total += m[2].startsWith("h") ? v * 3600 : m[2].startsWith("m") ? v * 60 : v;
    matched += m[0];
  }
  return matched && s.replace(re, "").replace(/[\s,and]+/g, "") === "" ? Math.round(total) : null;
}

/**
 * @param {number|null} sec
 * @returns {string} "45:30", "1:02:10", or "" when unknown
 */
export function formatDuration(sec) {
  const v = num(sec);
  if (v == null || v < 0) return "";
  const t = Math.round(v), h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60), s = t % 60;
  const ss = String(s).padStart(2, "0");
  return h ? `${h}:${String(m).padStart(2, "0")}:${ss}` : `${m}:${ss}`;
}

// Daniels/Gilbert running equations (VDOT).
const vdotPct = (t) => 0.8 + 0.1894393 * Math.exp(-0.012778 * t) + 0.2989558 * Math.exp(-0.1932605 * t);
const vo2AtSpeed = (v) => -4.6 + 0.182258 * v + 0.000104 * v * v; // v in m/min
const speedAtVo2 = (o) => (-0.182258 + Math.sqrt(0.182258 ** 2 + 4 * 0.000104 * (4.6 + o))) / (2 * 0.000104);
const vdotOf = (meters, sec) => vo2AtSpeed(meters / (sec / 60)) / vdotPct(sec / 60);
function raceSec(vdot, meters) { // time whose VDOT equals `vdot` (bisection; VDOT falls as time grows)
  let lo = 30, hi = 60 * 60 * 12;
  for (let i = 0; i < 80; i++) { const mid = (lo + hi) / 2; if (vdotOf(meters, mid) > vdot) lo = mid; else hi = mid; }
  return (lo + hi) / 2;
}

/**
 * Training paces from a race or time trial (Daniels VDOT equations), matching the pace table in
 * knowledge/plan.js §4.2: E = 70-62 % VDOT, T = 88.5-86.5 %, I = 100-97.5 %, R = 107-104 %, race paces from
 * equivalent race times. All paces are whole seconds per km; ranges are [fast, slow].
 * @param {{ distanceKm: number, timeSec: number }} race
 * @returns {{ vdot: number, easy: number[], marathon: number, half: number, tenK: number, fiveK: number,
 *   threshold: number[], interval: number[], repetition: number[] } | null} null for invalid input
 */
export function paceZones({ distanceKm, timeSec } = {}) {
  const d = num(distanceKm), t = num(timeSec);
  if (!(d >= 1) || !(t > 0)) return null;
  const v = vdotOf(d * 1000, t);
  if (!(v > 0) || !Number.isFinite(v)) return null;
  const at = (f) => Math.round(60000 / speedAtVo2(v * f));
  const race = (km) => Math.round(raceSec(v, km * 1000) / km);
  return {
    vdot: r1(v),
    easy: [at(0.70), at(0.62)],
    marathon: race(42.195), half: race(21.0975), tenK: race(10), fiveK: race(5),
    threshold: [at(0.885), at(0.865)],
    interval: [at(1.0), at(0.975)],
    repetition: [at(1.07), at(1.04)],
  };
}

/**
 * Local calendar date.
 * @param {Date} [now=new Date()]
 * @returns {string} YYYY-MM-DD
 */
export function todayISO(now = new Date()) {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

function isoToUtc(iso) {
  if (iso instanceof Date) iso = todayISO(iso);
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso ?? ""));
  return m ? Date.UTC(+m[1], +m[2] - 1, +m[3]) : NaN;
}
function utcToIso(ms) { return new Date(ms).toISOString().slice(0, 10); }
function addDays(iso, n) { return utcToIso(isoToUtc(iso) + n * 86400000); }
const isIso = (s) => typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(isoToUtc(s));

/**
 * The Sunday on or before a date (weeks start on Sunday).
 * @param {string|Date} dateISO
 * @returns {string|null} YYYY-MM-DD
 */
export function weekStartOf(dateISO) {
  const ms = isoToUtc(dateISO);
  if (Number.isNaN(ms)) return null;
  return utcToIso(ms - new Date(ms).getUTCDay() * 86400000);
}

/**
 * Whole days from a to b (positive when b is later).
 * @param {string} aISO
 * @param {string} bISO
 * @returns {number|null}
 */
export function daysBetween(aISO, bISO) {
  const a = isoToUtc(aISO), b = isoToUtc(bISO);
  return Number.isNaN(a) || Number.isNaN(b) ? null : Math.round((b - a) / 86400000);
}

// ================================================================== strength history & progression
const activeSessions = (sessions) => (sessions || []).filter((s) => s && s.status !== "missed");
function sortSessions(sessions) {
  return [...(sessions || [])].filter(Boolean).sort((a, b) =>
    String(a.date).localeCompare(String(b.date)) || String(a.createdAt ?? "").localeCompare(String(b.createdAt ?? "")) || String(a.id ?? "").localeCompare(String(b.id ?? "")));
}
function entryId(entry) {
  if (entry?.exerciseId && getExercise(entry.exerciseId)) return entry.exerciseId;
  return findExercise(entry?.exerciseId || entry?.name, { modality: "strength" })?.id ?? entry?.exerciseId ?? null;
}

/** exposures with the session attached (internal) */
function exposuresDetailed(sessions, exerciseId) {
  const out = [];
  for (const s of sortSessions(activeSessions(sessions))) {
    const sets = [];
    for (const entry of s.strength || []) {
      if (entryId(entry) !== exerciseId) continue;
      for (const set of entry.sets || []) if (!isWarmup(set)) sets.push(set);
    }
    if (sets.length) out.push({ date: s.date, sessionId: s.id ?? null, sets, session: s });
  }
  return out;
}

/**
 * Work sets of one exercise grouped per session, oldest first (trainer.py exposures). Missed sessions and
 * warm-up sets are excluded; entries without an id are matched by name via catalog.findExercise.
 * @param {object[]} sessions Session[]
 * @param {string} exerciseId
 * @returns {Array<{date: string, sessionId: string|null, sets: object[]}>}
 */
export function exposures(sessions, exerciseId) {
  return exposuresDetailed(sessions, exerciseId).map(({ date, sessionId, sets }) => ({ date, sessionId, sets }));
}

function parseRange(reps) {
  const m = /(\d+)\s*(?:[-–—]|to)\s*(\d+)/.exec(String(reps ?? ""));
  if (m) return { lo: Math.min(+m[1], +m[2]), hi: Math.max(+m[1], +m[2]) };
  const one = /(\d+)/.exec(String(reps ?? ""));
  return one ? { lo: +one[1], hi: +one[1] } : null;
}
function parseTargetRir(x) {
  if (typeof x === "number") return x;
  const nums = String(x ?? "").match(/\d+(\.\d+)?/g);
  return nums ? Math.min(...nums.map(Number)) : 2;
}
const fmtN = (x) => (x == null ? "-" : String(r1(x)));
const PAIN_WORDS = /pain|hurt|ache|sore|injur/i;

function painNote(session) {
  const pains = (session?.pain || []).filter((p) => num(p?.score) > 0);
  if (pains.length) return pains.map((p) => `${p.area || "pain"} ${p.score}/10`).join(", ");
  return PAIN_WORDS.test(session?.notes || "") ? "noted in session notes" : null;
}

/**
 * Next-session target for a StrengthItem (port of trainer.py `next`): double progression (default),
 * linear, rpe (autoregulated: ±~2.5 % per RIR point vs target) or none. Applies the layoff discount
 * (≥ 21 days: 85 %, ≥ 42 days: 75 %), an effort-overshoot hold and a pain reminder.
 * @param {object[]} sessions Session[]
 * @param {object} item StrengthItem { exerciseId, sets, reps "8-12"|"5"|"AMRAP", targetRir, loadKg, progression, incrementKg }
 * @param {{ today?: string }} [opts]
 * @returns {{ loadKg: number|null, reps: string, note: string, reason: string, flags: string[] }}
 *   reason: no_history | layoff | add_load | add_reps | repeat | reduce | reset | effort_hold |
 *   rpe_increase | rpe_hold | rpe_reduce | no_progression. reps is a string ("8", "9/9/8", "AMRAP").
 *   flags may contain "effort_overshoot", "pain", "layoff".
 */
export function nextTarget(sessions, item, { today } = {}) {
  const day = today || todayISO();
  const id = item?.exerciseId && getExercise(item.exerciseId) ? item.exerciseId : entryId(item || {});
  const range = parseRange(item?.reps);
  const lo = range?.lo ?? null, hi = range?.hi ?? null;
  const targetRir = parseTargetRir(item?.targetRir);
  const inc = num(item?.incrementKg) ?? 2.5;
  const model = ["double", "linear", "rpe", "none"].includes(item?.progression) ? item.progression : "double";
  const prescribed = String(item?.reps ?? (lo ?? ""));
  const flags = [];
  const result = (loadKg, reps, reason, notes) => ({ loadKg: loadKg == null ? null : clean(loadKg), reps: String(reps), note: notes.filter(Boolean).join(" "), reason, flags });

  const ex = exposuresDetailed(sessions, id);
  if (!ex.length) {
    return result(num(item?.loadKg), prescribed, "no_history",
      [`No history yet. Calibrate: work up to a load that leaves ~3 RIR at ${lo ?? "the prescribed"} reps; log it and progress from there.`]);
  }
  if (model === "none") return result(num(item?.loadKg), prescribed, "no_progression", ["No progression rule: use the prescribed load and reps."]);

  const last = ex[ex.length - 1];
  const loaded = last.sets.filter((s) => !s.bodyweight && num(s.loadKg) > 0);
  const reps = last.sets.map((s) => Math.trunc(num(s.reps) || 0));
  const rirs = last.sets.map((s) => num(s.rir)).filter((x) => x != null);
  const minRir = rirs.length ? Math.min(...rirs) : null;
  const daysAgo = daysBetween(last.date, day) ?? 0;
  const topLoad = loaded.length ? Math.max(...loaded.map((s) => num(s.loadKg))) : null;
  const nSets = reps.length;
  const notes = [];
  const pain = painNote(last.session);

  // bodyweight-only movement: progress reps (trainer.py has no layoff rule here; we add a caution note)
  if (topLoad == null) {
    const added = Math.max(0, ...last.sets.map((s) => num(s.loadKg) || 0));
    if (daysAgo >= 21) { flags.push("layoff"); notes.push(`${daysAgo} days since last time: ease back in at ~3 RIR with fewer sets.`); }
    if (pain) { flags.push("pain"); notes.push(`Pain was noted (${pain}): the pain protocol (traffic light) overrides this progression suggestion.`); }
    if (hi != null && Math.min(...reps) >= hi) {
      return result(added + inc, lo, "add_load", [`All sets hit ${hi}. Add load (e.g. +${fmtN(inc)} kg) or a harder variation; reset to ${lo} reps.`, ...notes]);
    }
    const tgt = hi != null ? reps.map((r) => Math.min(r + 1, hi)).join("/") : prescribed;
    return result(added || null, tgt, "add_reps", [`Same variation, aim +1 rep per set toward ${hi ?? "a new best"} (keep ~${fmtN(targetRir)} RIR).`, ...notes]);
  }

  if (daysAgo >= 21) {
    const factor = daysAgo < 42 ? 0.85 : 0.75;
    flags.push("layoff");
    return result(roundTo(topLoad * factor, inc), lo ?? prescribed, "layoff",
      [`Layoff of ${daysAgo} days: restart at ~${fmtN(roundTo(topLoad * factor, inc))} kg (${Math.round(factor * 100)}%), ~3 RIR, fewer sets; rebuild over 2-4 weeks.`]);
  }

  const overshoot = minRir != null && minRir < targetRir - 1;
  if (overshoot) {
    flags.push("effort_overshoot");
    notes.push(`Effort note: a set reached RIR ${fmtN(minRir)} vs target ${fmtN(targetRir)}. Don't add load yet; consolidate first (and check readiness/pain notes).`);
  }
  if (pain) { flags.push("pain"); notes.push(`Pain was noted (${pain}): the pain protocol (traffic light) overrides this progression suggestion.`); }

  if (lo == null) { // AMRAP or unparseable reps: hold load, beat the rep count
    return result(topLoad, prescribed, "repeat", [`Repeat ${fmtN(topLoad)} kg; aim to beat last time's best of ${Math.max(...reps)} reps.`, ...notes]);
  }

  if (model === "linear") {
    const hit = reps.every((r) => r >= hi);
    if (hit && overshoot) return result(topLoad, hi, "effort_hold", [`Repeat ${fmtN(topLoad)} kg for ${nSets}×${hi}: reps were hit but effort overshot the target.`, ...notes]);
    if (hit) return result(topLoad + inc, hi, "add_load", [`${fmtN(topLoad + inc)} kg for ${nSets}×${hi} (linear +${fmtN(inc)}).`, ...notes]);
    let misses = 1;
    if (ex.length >= 2) {
      const prev = ex[ex.length - 2].sets;
      const prevLoad = Math.max(...prev.map((s) => (s.bodyweight ? 0 : num(s.loadKg) || 0)));
      if (prevLoad === topLoad && !prev.every((s) => Math.trunc(num(s.reps) || 0) >= hi)) misses = 2;
    }
    if (misses >= 2) {
      const reset = roundTo(topLoad * 0.9, inc);
      return result(reset, hi, "reset", [`Missed target twice at ${fmtN(topLoad)} kg: reset ~10% to ${fmtN(reset)} and rebuild, or switch this lift to double progression.`, ...notes]);
    }
    return result(topLoad, hi, "repeat", [`Repeat ${fmtN(topLoad)} kg for ${nSets}×${hi}.`, ...notes]);
  }

  if (model === "rpe" && minRir != null) {
    const diff = minRir - targetRir;
    if (diff >= 1 && Math.min(...reps) >= lo) {
      const pct = Math.min(0.1, 0.025 * diff);
      const next = Math.max(roundTo(topLoad * (1 + pct), inc), topLoad + inc);
      return result(next, hi, "rpe_increase", [`Effort was ${fmtN(diff)} RIR easier than target: add ~${Math.round(pct * 100)}% → ${fmtN(next)} kg.`, ...notes]);
    }
    if (diff <= -2) {
      const next = roundTo(topLoad * 0.95, inc);
      return result(next, hi, "rpe_reduce", [`Effort overshot the target by ${fmtN(-diff)} RIR: drop ~5% to ${fmtN(next)} kg.`, ...notes]);
    }
    return result(topLoad, hi, "rpe_hold", [`On target: repeat ${fmtN(topLoad)} kg @ ~${fmtN(targetRir)} RIR.`, ...notes]);
  }

  // double progression (default; rpe without logged RIR falls back here)
  const allTop = reps.every((r) => r >= hi);
  const effortOk = minRir == null || minRir >= targetRir - 1;
  if (allTop && effortOk) {
    const next = inc ? roundTo(topLoad + inc, inc) : topLoad;
    return result(next, lo, "add_load", [`${fmtN(next)} kg for ${nSets}×${lo} (all sets hit ${hi}: add ${fmtN(inc)}, reset to bottom of range).`, ...notes]);
  }
  if (Math.min(...reps) < lo) {
    let prevBad = false;
    if (ex.length >= 2) {
      const p = ex[ex.length - 2].sets;
      const pLoad = Math.max(...p.map((s) => (s.bodyweight ? 0 : num(s.loadKg) || 0)));
      prevBad = pLoad === topLoad && Math.min(...p.map((s) => Math.trunc(num(s.reps) || 0))) < lo;
    }
    if (prevBad) {
      const next = roundTo(topLoad * 0.93, inc);
      return result(next, lo, "reduce", [`Below ${lo} reps twice at ${fmtN(topLoad)} kg: drop 5-10% to ~${fmtN(next)} and rebuild. Check sleep, stress, deficit and whether the jump was too big.`, ...notes]);
    }
    return result(topLoad, lo, "repeat", [`Repeat ${fmtN(topLoad)} kg; aim for ≥${lo} reps on every set (one bad day is noise).`, ...notes]);
  }
  const tgt = reps.map((r) => Math.min(r + 1, hi)).join("/");
  return result(topLoad, tgt, "add_reps", [`Stay at ${fmtN(topLoad)} kg, aim for ${tgt} reps (@~${fmtN(targetRir)} RIR).`, ...notes]);
}

/** trainer.py fmt_sets with ×: "100×5,5,4@1 / 90×8" */
function fmtSets(sets) {
  const out = [];
  let cur, reps = [];
  for (const s of sets) {
    const load = s.bodyweight ? (num(s.loadKg) ? `BW${num(s.loadKg) > 0 ? "+" : ""}${num(s.loadKg)}` : "BW") : String(num(s.loadKg) ?? "-");
    const rep = `${s.reps}${hasRir(s) ? `@${num(s.rir)}` : ""}`;
    if (load === cur) reps.push(rep);
    else { if (cur !== undefined) out.push(`${cur}×${reps.join(",")}`); cur = load; reps = [rep]; }
  }
  if (cur !== undefined) out.push(`${cur}×${reps.join(",")}`);
  return out.join(" / ");
}

/** trainer.py report flags: compare like with like (same reliability tag as the latest exposure). */
function stallFatigue(series) {
  const flags = [];
  if (!series.length) return flags;
  const lastTag = series[series.length - 1].tag;
  const comp = series.filter((p) => p.tag === lastTag && !unreliable(p.tag)).map((p) => p.value);
  if (comp.length >= 4) {
    const priorBest = Math.max(...comp.slice(0, -3));
    if (Math.max(...comp.slice(-3)) <= priorBest) flags.push("stall");
    const ref = Math.max(...comp.slice(-4, -1));
    if (ref && comp[comp.length - 1] <= 0.95 * ref) flags.push("fatigue");
  }
  return flags;
}

/**
 * History stats for one exercise (trainer.py report row).
 * @param {object[]} sessions Session[]
 * @param {string} exerciseId
 * @returns {{ exposures: number, last: {date: string, sessionId: string|null, sets: object[], display: string}|null,
 *   bestE1rm: number|null, trend: Array<{date: string, e1rm: number|null, reliability: string}>,
 *   flag: null|"stall"|"fatigue", flags: string[] }} bestE1rm uses reliable estimates only; flag is "fatigue"
 *   when both stall and fatigue apply (flags lists both).
 */
export function exerciseStats(sessions, exerciseId) {
  const ex = exposuresDetailed(sessions, exerciseId);
  const series = ex.map((x) => sessionE1rmRaw(x.sets));
  const reliable = series.filter((p) => !unreliable(p.tag)).map((p) => p.value);
  const flags = stallFatigue(series);
  const last = ex.length ? ex[ex.length - 1] : null;
  return {
    exposures: ex.length,
    last: last ? { date: last.date, sessionId: last.sessionId, sets: last.sets, display: fmtSets(last.sets) } : null,
    bestE1rm: reliable.length ? r1(Math.max(...reliable)) : null,
    trend: ex.map((x, i) => ({ date: x.date, e1rm: series[i].tag === "none" ? null : r1(series[i].value), reliability: series[i].tag })),
    flag: flags.includes("fatigue") ? "fatigue" : flags.includes("stall") ? "stall" : null,
    flags,
  };
}

const NON_CONTINUOUS = new Set(["intervals", "strides", "hills", "fartlek"]);

/**
 * PRs set by a session versus prior sessions: strength e1RM (reliable estimates only, never on a first
 * exposure, as trainer.py `log`), reps-at-load (when no e1RM PR for that lift; bodyweight sets count by
 * added load), run distance, and run pace (continuous runs vs prior runs of 90-115 % of the distance).
 * @param {object} session Session
 * @param {object[]} priorSessions Session[] (the session itself is skipped by id)
 * @returns {Array<{exerciseId: string|null, kind: "e1rm"|"reps_at_load"|"distance"|"pace", value: number, previous: number, loadKg?: number}>}
 */
export function detectPrs(session, priorSessions) {
  if (!session || session.status === "missed") return [];
  const prior = activeSessions(priorSessions).filter((s) => !(session.id && s.id === session.id));
  const prs = [];
  const byEx = new Map();
  for (const entry of session.strength || []) {
    const id = entryId(entry);
    if (!id) continue;
    byEx.set(id, [...(byEx.get(id) || []), ...(entry.sets || []).filter((s) => !isWarmup(s))]);
  }
  for (const [id, sets] of byEx) {
    const cur = sessionE1rmRaw(sets);
    const hist = exposuresDetailed(prior, id);
    let hadE1rmPr = false;
    if (!unreliable(cur.tag)) {
      const prev = Math.max(0, ...hist.map((x) => sessionE1rmRaw(x.sets)).filter((p) => !unreliable(p.tag)).map((p) => p.value));
      if (prev && cur.value > prev) { prs.push({ exerciseId: id, kind: "e1rm", value: r1(cur.value), previous: r1(prev) }); hadE1rmPr = true; }
    }
    if (hadE1rmPr) continue;
    const key = (s) => `${s.bodyweight ? "bw" : ""}${num(s.loadKg) ?? 0}`;
    const best = new Map();
    for (const x of hist) for (const s of x.sets) best.set(key(s), Math.max(best.get(key(s)) ?? 0, num(s.reps) || 0));
    let cand = null;
    for (const s of sets) {
      const prev = best.get(key(s));
      const reps = num(s.reps) || 0;
      if (prev && reps > prev && (!cand || (num(s.loadKg) ?? 0) > cand.loadKg)) cand = { exerciseId: id, kind: "reps_at_load", value: reps, previous: prev, loadKg: num(s.loadKg) ?? 0 };
    }
    if (cand) prs.push(cand);
  }
  const run = session.run;
  const km = num(run?.distanceKm);
  if (km > 0) {
    const runs = prior.map((s) => s.run).filter((r) => num(r?.distanceKm) > 0);
    if (runs.length) {
      const longest = Math.max(...runs.map((r) => num(r.distanceKm)));
      if (km > longest) prs.push({ exerciseId: null, kind: "distance", value: r2(km), previous: r2(longest) });
    }
    const pace = num(run.avgPaceSecPerKm) ?? paceSecPerKm(km, run.durationSec);
    if (pace && km >= 1 && !NON_CONTINUOUS.has(run.runType)) {
      const comparable = runs.filter((r) => !NON_CONTINUOUS.has(r.runType) && num(r.distanceKm) >= 0.9 * km && num(r.distanceKm) <= 1.15 * km)
        .map((r) => num(r.avgPaceSecPerKm) ?? paceSecPerKm(r.distanceKm, r.durationSec)).filter(Boolean);
      if (comparable.length && pace < Math.min(...comparable)) prs.push({ exerciseId: null, kind: "pace", value: pace, previous: Math.min(...comparable) });
    }
  }
  return prs;
}

// ================================================================== aggregates
function addMuscles(tally, ex, n) {
  for (const m of ex.primary) tally[m] = (tally[m] || 0) + n;
  for (const m of ex.secondary) tally[m] = (tally[m] || 0) + 0.5 * n;
}
const inRange = (d, from, to) => (!from || d >= from) && (!to || d <= to);

/**
 * Hard work sets per muscle over [from, to] (inclusive; open when omitted): primary muscle 1, secondary 0.5;
 * a hard set is a work set with RIR ≤ 4 or not logged (trainer.py report).
 * @param {object[]} sessions
 * @param {{ from?: string, to?: string }} [range]
 * @returns {Record<string, number>}
 */
export function weeklySetsPerMuscle(sessions, { from, to } = {}) {
  const tally = {};
  for (const s of activeSessions(sessions)) {
    if (!inRange(s.date, from, to)) continue;
    for (const entry of s.strength || []) {
      const ex = getExercise(entryId(entry));
      if (!ex) continue;
      const hard = (entry.sets || []).filter((x) => !isWarmup(x) && !(num(x.rir) != null && num(x.rir) > 4)).length;
      if (hard) addMuscles(tally, ex, hard);
    }
  }
  return tally;
}

/**
 * Planned weekly sets per muscle from a Plan's strength blocks (primary 1, secondary 0.5).
 * @param {object} plan
 * @returns {Record<string, number>}
 */
export function plannedSetsPerMuscle(plan) {
  const tally = {};
  for (const w of plan?.workouts || []) {
    for (const b of w?.blocks || []) {
      if (b?.kind !== "strength") continue;
      for (const it of b.items || []) {
        const ex = getExercise(it?.exerciseId) || findExercise(it?.name, { modality: "strength" });
        const n = num(it?.sets) || 0;
        if (ex && n > 0) addMuscles(tally, ex, n);
      }
    }
  }
  return tally;
}

/**
 * Weekly running totals for the `weeks` Sunday-start weeks ending with today's week.
 * @param {object[]} sessions
 * @param {{ weeks?: number, today?: string }} [opts]
 * @returns {Array<{weekStart: string, km: number, longestKm: number, runs: number, minutes: number}>} oldest → newest
 */
export function runningLoad(sessions, { weeks = 6, today } = {}) {
  const thisWeek = weekStartOf(today || todayISO());
  const rows = [];
  for (let i = weeks - 1; i >= 0; i--) rows.push({ weekStart: addDays(thisWeek, -7 * i), km: 0, longestKm: 0, runs: 0, minutes: 0 });
  const byWeek = new Map(rows.map((r) => [r.weekStart, r]));
  for (const s of activeSessions(sessions)) {
    const km = num(s.run?.distanceKm);
    if (!(km > 0)) continue;
    const row = byWeek.get(weekStartOf(s.date));
    if (!row) continue;
    row.km += km;
    row.longestKm = Math.max(row.longestKm, km);
    row.runs += 1;
    row.minutes += num(s.run.durationSec) ? num(s.run.durationSec) / 60 : num(s.durationMin) || 0;
  }
  for (const r of rows) { r.km = r1(r.km); r.longestKm = r1(r.longestKm); r.minutes = Math.round(r.minutes); }
  return rows;
}

/**
 * Adherence over the last `weeks` × 7 days: distinct training days done (done/partial) vs
 * daysPerWeek × weeks, prorated to the weeks since the first logged session.
 * @param {object[]} sessions
 * @param {object} profile
 * @param {{ weeks?: number, today?: string }} [opts]
 * @returns {{ done: number, expected: number, pct: number|null, missedByReason: Record<string, number> }}
 */
export function adherence(sessions, profile, { weeks = 4, today } = {}) {
  const day = today || todayISO();
  const start = addDays(day, -7 * weeks + 1);
  const all = (sessions || []).filter(Boolean);
  const first = all.map((s) => s.date).filter(isIso).sort()[0];
  const effStart = first && first > start ? first : start;
  const activeWeeks = first ? Math.min(weeks, Math.max(1, Math.ceil(((daysBetween(effStart, day) ?? 0) + 1) / 7))) : weeks;
  const win = all.filter((s) => inRange(s.date, start, day));
  const done = new Set(win.filter((s) => s.status !== "missed").map((s) => s.date)).size;
  const missedByReason = {};
  for (const s of win) if (s.status === "missed") { const k = s.missedReason || "unspecified"; missedByReason[k] = (missedByReason[k] || 0) + 1; }
  const perWeek = num(profile?.schedule?.daysPerWeek) || 0;
  const expected = perWeek * activeWeeks;
  return { done, expected, pct: expected ? Math.round((100 * done) / expected) : null, missedByReason };
}

const avg = (xs) => (xs.length ? r1(xs.reduce((a, b) => a + b, 0) / xs.length) : null);

/**
 * Compact history digest for prompts (JSON stays well under 4 KB for a realistic 4-week history).
 * Keys: asOf, weeks, last {date, daysAgo, type, title}, adherence {done, expected, pct, missed},
 * byType {type: n}, lifts [{id, n, last, e1rm, first, best, flag?}] (≤ 8, most-trained first),
 * run {kmByWeek, longestKm, runs, avgPace?}, conditioning {n, recent [..]}, pain [{date, area, score}] (14 days),
 * readiness / srpe averages, setsPerMuscleWk (average per week), prs (count in window).
 * @param {object[]} sessions
 * @param {object} profile
 * @param {{ weeks?: number, today?: string }} [opts]
 * @returns {object}
 */
export function trainingSummary(sessions, profile, { weeks = 4, today } = {}) {
  const day = today || todayISO();
  const start = addDays(day, -7 * weeks + 1);
  const sorted = sortSessions(sessions);
  const win = sorted.filter((s) => inRange(s.date, start, day));
  const done = win.filter((s) => s.status !== "missed");
  const lastS = [...sorted].reverse().find((s) => s.status !== "missed" && s.date <= day);
  const ad = adherence(sessions, profile, { weeks, today: day });
  const byType = {};
  for (const s of done) byType[s.type || "other"] = (byType[s.type || "other"] || 0) + 1;

  const liftCount = new Map();
  for (const s of done) for (const e of s.strength || []) { const id = entryId(e); if (id && (e.sets || []).some((x) => !isWarmup(x))) liftCount.set(id, (liftCount.get(id) || 0) + 1); }
  const lifts = [...liftCount.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([id, n]) => {
    const st = exerciseStats(sorted.filter((s) => s.date <= day), id);
    const inWin = st.trend.filter((t) => t.date >= start && t.e1rm != null);
    const o = { id, n, last: st.last?.display ?? null };
    if (inWin.length) { o.e1rm = inWin[inWin.length - 1].e1rm; o.first = inWin[0].e1rm; }
    if (st.bestE1rm != null) o.best = st.bestE1rm;
    if (st.flag) o.flag = st.flag;
    return o;
  });

  const rl = runningLoad(sessions, { weeks, today: day });
  const runs = done.filter((s) => num(s.run?.distanceKm) > 0);
  const easyPaces = runs.filter((s) => ["easy", "long", "recovery"].includes(s.run.runType)).map((s) => num(s.run.avgPaceSecPerKm) ?? paceSecPerKm(s.run.distanceKm, s.run.durationSec)).filter(Boolean);
  const run = { kmByWeek: rl.map((w) => w.km), longestKm: Math.max(0, ...rl.map((w) => w.longestKm)), runs: runs.length };
  if (easyPaces.length) run.easyPace = formatPace(Math.round(easyPaces.reduce((a, b) => a + b, 0) / easyPaces.length));

  const condSessions = done.filter((s) => (s.conditioning || []).length);
  const recent = condSessions.slice(-3).map((s) => {
    const c = s.conditioning[0];
    const r = c.result || {};
    const res = r.timeSec ? formatDuration(r.timeSec) : r.rounds != null ? `${r.rounds}r${r.reps ? `+${r.reps}` : ""}` : r.calories ? `${r.calories}cal` : "";
    return `${s.date} ${c.format || ""} ${String(c.description || "").slice(0, 40)}${res ? ` = ${res}` : ""}${c.scaled ? " (scaled)" : ""}`.replace(/\s+/g, " ").trim();
  });

  const painFrom = addDays(day, -13);
  const pain = [];
  for (const s of sorted) if (inRange(s.date, painFrom, day)) for (const p of s.pain || []) if (num(p?.score) > 0) pain.push({ date: s.date, area: p.area, score: num(p.score) });

  const spm = weeklySetsPerMuscle(sessions, { from: start, to: day });
  const setsPerMuscleWk = {};
  for (const [m, v] of Object.entries(spm)) setsPerMuscleWk[m] = Math.round((v / weeks) * 2) / 2;

  return {
    asOf: day, weeks,
    last: lastS ? { date: lastS.date, daysAgo: daysBetween(lastS.date, day), type: lastS.type, title: String(lastS.title || "").slice(0, 40) } : null,
    adherence: { done: ad.done, expected: ad.expected, pct: ad.pct, missed: ad.missedByReason },
    byType,
    lifts,
    run,
    conditioning: { n: condSessions.length, recent },
    pain: pain.slice(-6),
    readiness: avg(done.map((s) => num(s.readiness)).filter((x) => x != null)),
    srpe: avg(done.map((s) => num(s.sessionRpe)).filter((x) => x != null)),
    setsPerMuscleWk,
    prs: done.reduce((n, s) => n + (s.prs || []).length, 0),
  };
}

// ================================================================== equipment & plans
const toEquipSet = (e) => expandEquipment(e instanceof Set ? e : Array.isArray(e) ? e : []);

/**
 * Equipment at a location (default location when omitted), with implied items (e.g. adjustable bench → bench).
 * @param {object} profile
 * @param {string} [locationId]
 * @returns {Set<string>}
 */
export function availableEquipment(profile, locationId) {
  const eq = profile?.equipment;
  const locs = Array.isArray(eq?.locations) ? eq.locations : [];
  const loc = locs.find((l) => l?.id === (locationId || eq?.defaultLocationId)) || (!locationId ? locs[0] : null);
  return expandEquipment(loc?.items || []);
}

/**
 * Can this exercise be done with this equipment? Bodyweight exercises are always ok.
 * @param {string} exerciseId
 * @param {Set<string>|string[]} equipmentSet
 * @returns {{ ok: boolean, missing: string[], anyOf: string[], unknown?: true }} missing lists required ids
 *   that are absent plus the "one of" group when none of it is there (anyOf repeats that group)
 */
export function exerciseAllowed(exerciseId, equipmentSet) {
  const ex = getExercise(exerciseId);
  if (!ex) return { ok: false, missing: [], anyOf: [], unknown: true };
  return equipmentCheck(ex, toEquipSet(equipmentSet));
}

const INJURY_MAP = [
  [/knee|patell|menisc|acl|mcl|quad tendon/, ["knee_flexion_deep", "impact"]],
  [/back|lumbar|spine|spinal|disc|sciatic/, ["spinal_axial", "spinal_flexion", "hinge_loaded"]],
  [/shoulder|rotator|labrum|\bac\b/, ["overhead", "shoulder_extension", "kipping"]],
  [/elbow|tennis|golfer/, ["elbow", "grip"]],
  [/wrist|hand|carpal|thumb/, ["wrist_extension", "grip"]],
  [/hip|groin/, ["hip_flexion_deep"]],
  [/ankle|achilles|calf|calves|shin|foot|feet|plantar|heel/, ["impact", "ankle_dorsiflexion"]],
  [/neck|cervical/, ["spinal_axial", "overhead"]],
];
function injuryTags(profile) {
  const out = [];
  for (const inj of profile?.injuries || []) {
    if (inj?.status && inj.status !== "current") continue;
    const area = String(inj?.area || "").toLowerCase();
    const tags = new Set();
    for (const [re, t] of INJURY_MAP) if (re.test(area)) t.forEach((x) => tags.add(x));
    if (tags.size) out.push({ area: inj.area, tags });
  }
  return out;
}
function dislikedIds(profile) {
  const ids = new Set(), texts = [];
  for (const d of profile?.preferences?.dislikes || []) {
    if (typeof d !== "string" || !d.trim()) continue;
    const ex = getExercise(d) || findExercise(d);
    if (ex) ids.add(ex.id);
    else texts.push(d.trim().toLowerCase());
  }
  return { ids, texts, has: (ex) => ids.has(ex.id) || texts.some((t) => ex.name.toLowerCase().includes(t)) };
}

/**
 * Substitutes doable with the given equipment: listed alternatives first, then same pattern and
 * overlapping primary muscles, similar skill; never disliked, current-injury conflicts ranked last.
 * @param {string} exerciseId
 * @param {Set<string>|string[]} equipmentSet
 * @param {object} [profile]
 * @param {{ limit?: number }} [opts]
 * @returns {string[]} exercise ids
 */
export function findSubstitutes(exerciseId, equipmentSet, profile, { limit = 3 } = {}) {
  const base = getExercise(exerciseId) || findExercise(exerciseId);
  if (!base) return [];
  const eq = toEquipSet(equipmentSet);
  const dis = dislikedIds(profile);
  const likes = new Set((profile?.preferences?.likes || []).map((l) => (getExercise(l) || findExercise(l))?.id).filter(Boolean));
  const inj = injuryTags(profile);
  const scored = [];
  for (const ex of EXERCISES) {
    if (ex.id === base.id || dis.has(ex) || !equipmentCheck(ex, eq).ok) continue;
    const altIdx = base.alternatives.indexOf(ex.id);
    const samePattern = ex.pattern === base.pattern;
    const shared = ex.primary.filter((m) => base.primary.includes(m)).length;
    if (altIdx < 0 && !(samePattern && shared) && shared < Math.max(1, base.primary.length)) continue;
    let s = 0;
    if (altIdx >= 0) s += 40 - altIdx;
    if (samePattern) s += 30;
    s += (25 * shared) / new Set([...ex.primary, ...base.primary]).size;
    s += 5 * ex.secondary.filter((m) => base.secondary.includes(m)).length / Math.max(1, base.secondary.length);
    if (ex.modality.some((m) => base.modality.includes(m))) s += 5;
    s -= 3 * Math.abs(ex.skill - base.skill);
    if (likes.has(ex.id)) s += 10;
    if (inj.some((i) => ex.jointStress.some((t) => i.tags.has(t)))) s -= 40;
    scored.push({ id: ex.id, s });
  }
  return scored.sort((a, b) => b.s - a.s).slice(0, limit).map((x) => x.id);
}

const COMPOUND_PATTERNS = new Set(["squat", "hinge", "lunge", "h_push", "v_push", "h_pull", "v_pull", "carry", "olympic", "gymnastics", "plyo"]);
const DEFAULT_PACE = 360; // s/km when a run has no target pace and the profile gives none

function runBlockKm(b, easyPace) {
  const total = num(b?.totalKm);
  if (total > 0) return total;
  let km = 0;
  for (const seg of b?.segments || []) {
    const reps = num(seg?.reps) || 1;
    const pace = paceMid(seg) || easyPace;
    km += reps * ((num(seg?.distanceM) || 0) / 1000 || (num(seg?.durationSec) || 0) / pace);
  }
  return km;
}
function paceMid(seg) {
  const p = seg?.target?.paceSecPerKm;
  if (Array.isArray(p) && p.length) { const v = p.map(num).filter(Boolean); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null; }
  return num(p);
}
function runBlockMinutes(b, easyPace) {
  const warm = (num(b.warmupMin) || 0) + (num(b.cooldownMin) || 0);
  let segSec = 0, segKm = 0;
  for (const seg of b.segments || []) {
    const reps = num(seg?.reps) || 1;
    const pace = paceMid(seg) || easyPace;
    const dist = (num(seg?.distanceM) || 0) / 1000;
    const dur = num(seg?.durationSec) || dist * pace;
    segSec += reps * (dur + (num(seg?.recoverySec) || 0));
    segKm += reps * (dist || dur / pace);
  }
  const total = num(b.totalKm) || 0;
  const restKm = Math.max(0, total - segKm - (warm * 60) / easyPace);
  return warm + (segSec + restKm * easyPace) / 60;
}
function condItemSec(it) {
  const dist = num(it?.distanceM) || 0;
  return (num(it?.durationSec) || 0) + (num(it?.reps) || 0) * 3 + (num(it?.calories) || 0) * 4 + (dist / 1000) * 300;
}
function condBlockMinutes(b) {
  if (num(b.minutes) > 0) return num(b.minutes);
  if (num(b.timeCapMin) > 0) return num(b.timeCapMin);
  const rounds = num(b.rounds) || (b.format === "TABATA" ? 8 : 1);
  if (num(b.workSec) > 0) return (rounds * (num(b.workSec) + (num(b.restSec) || 0))) / 60;
  const roundSec = (b.items || []).reduce((a, it) => a + condItemSec(it), 0);
  return roundSec ? (rounds * roundSec) / 60 : 15;
}

/**
 * Estimated workout minutes: warm-up / cooldown / mobility minutes (defaults 8 / 5 / 10 when missing),
 * strength 2.75 min per compound set and 1.75 per isolation/core set (2.0 unknown; superset items ×0.7),
 * run blocks from segment durations or distance × target pace (else easy pace) plus warm-up/cool-down,
 * conditioning from minutes / timeCapMin / rounds × (work + rest) / an item-based round estimate.
 * @param {object} workout
 * @param {{ easyPaceSecPerKm?: number }} [opts]
 * @returns {number} whole minutes
 */
export function estimateWorkoutMinutes(workout, { easyPaceSecPerKm } = {}) {
  const easy = num(easyPaceSecPerKm) || DEFAULT_PACE;
  let total = 0;
  for (const b of workout?.blocks || []) {
    if (!b) continue;
    if (b.kind === "warmup" || b.kind === "cooldown" || b.kind === "mobility") {
      total += num(b.minutes) ?? { warmup: 8, cooldown: 5, mobility: 10 }[b.kind];
    } else if (b.kind === "strength") {
      const groups = {};
      for (const it of b.items || []) if (it?.supersetGroup) groups[it.supersetGroup] = (groups[it.supersetGroup] || 0) + 1;
      for (const it of b.items || []) {
        const ex = getExercise(it?.exerciseId) || findExercise(it?.name);
        const per = !ex ? 2.0 : COMPOUND_PATTERNS.has(ex.pattern) ? 2.75 : 1.75;
        total += (num(it?.sets) || 0) * per * (it?.supersetGroup && groups[it.supersetGroup] > 1 ? 0.7 : 1);
      }
    } else if (b.kind === "run") {
      total += runBlockMinutes(b, easy);
    } else if (b.kind === "conditioning") {
      total += condBlockMinutes(b);
    }
  }
  return Math.round(total);
}

const WORKOUT_TYPES = ["strength", "run", "conditioning", "hybrid", "mobility"];
const BLOCK_KINDS = ["warmup", "cooldown", "mobility", "strength", "conditioning", "run"];
const COND_FORMATS = ["AMRAP", "EMOM", "FOR_TIME", "RFT", "INTERVALS", "TABATA", "CHIPPER"];
const RUN_TYPES = ["easy", "long", "tempo", "threshold", "intervals", "hills", "fartlek", "recovery", "strides", "race"];
const PROGRESSIONS = ["linear", "double", "rpe", "none"];
const EASY_RUNS = new Set(["easy", "long", "recovery", "strides"]);
const QUALITY_RUNS = new Set(["tempo", "threshold", "intervals", "hills", "race", "fartlek", "long"]);
const MAJOR_MUSCLES = ["chest", "upper_back", "lats", "quads", "hamstrings", "glutes"];
const RUN_SURFACES = ["outdoor_route", "track", "treadmill"];
const NON_EXERCISE = /^(rest|transition|recover|recovery|walk rest)\b/i;

/** Recent running baseline before a reference week (4 weeks, trimmed to weeks since the first log). */
function runBaseline(sessions, profile, refWeekStart) {
  const rl = runningLoad(sessions, { weeks: 4, today: addDays(refWeekStart, -1) });
  const first = (sessions || []).map((s) => s?.date).filter(isIso).sort()[0];
  const weeks = first ? rl.filter((w) => w.weekStart >= weekStartOf(first)) : [];
  const profKm = num(profile?.experience?.running?.currentWeeklyKm);
  const profLong = num(profile?.experience?.running?.longestRecentRunKm);
  const anyRun = weeks.some((w) => w.runs);
  if (!weeks.length || !anyRun) {
    if (profKm == null && profLong == null && !weeks.length) return null;
    return { avgKm: profKm ?? 0, longestKm: profLong ?? 0 };
  }
  const avgKm = weeks.reduce((a, w) => a + w.km, 0) / weeks.length;
  const longest = Math.max(...weeks.map((w) => w.longestKm));
  return { avgKm: weeks.length < 2 && profKm != null ? Math.max(avgKm, profKm) : avgKm, longestKm: weeks.length < 2 && profLong != null ? Math.max(longest, profLong) : longest };
}

/**
 * Validate a Plan against the schema, catalog, owner profile and recent history.
 * errors: SCHEMA, UNKNOWN_EXERCISE, EQUIPMENT_MISSING, DISLIKED_EXERCISE, WORKOUT_COUNT, TOO_LONG,
 *   RUN_RAMP (planned km > max(avg × 1.15, avg + 5)), LONG_RUN_SPIKE (> longest × 1.3 and > longest + 3 km).
 * warnings: VOLUME_LOW (< 6 sets, major muscles), VOLUME_HIGH (> 22), INJURY_CONFLICT, HARD_DAYS_ADJACENT,
 *   NO_REST_RUN_EASY (< 70 % easy km), MISSING_ALTERNATIVES.
 * Equipment checks need profile.equipment.locations; run baselines come from sessions in the 4 weeks before
 * plan.weekStart (falling back to profile.experience.running); both run checks are skipped when nothing is known.
 * @param {object} plan
 * @param {{ profile?: object, sessions?: object[], today?: string }} [opts]
 * @returns {{ ok: boolean, errors: object[], warnings: object[], stats: { setsPerMuscle: object,
 *   minutesByWorkout: Record<string, number>, runKm: number, longestRunKm: number, conditioningCount: number } }}
 *   Issue = { code, workoutId, path, message }
 */
export function validatePlan(plan, { profile = null, sessions = [], today } = {}) {
  const errors = [], warnings = [];
  const err = (code, workoutId, path, message) => errors.push({ code, workoutId: workoutId ?? null, path, message });
  const warn = (code, workoutId, path, message) => warnings.push({ code, workoutId: workoutId ?? null, path, message });
  const stats = { setsPerMuscle: {}, minutesByWorkout: {}, runKm: 0, longestRunKm: 0, conditioningCount: 0 };
  if (!plan || typeof plan !== "object" || Array.isArray(plan)) {
    err("SCHEMA", null, "", "Plan must be an object.");
    return { ok: false, errors, warnings, stats };
  }
  if (!isIso(plan.weekStart)) err("SCHEMA", null, "weekStart", "weekStart must be a YYYY-MM-DD date.");
  else if (weekStartOf(plan.weekStart) !== plan.weekStart) err("SCHEMA", null, "weekStart", `weekStart ${plan.weekStart} is not a Sunday.`);
  if (plan.status != null && !["draft", "agreed", "archived"].includes(plan.status)) err("SCHEMA", null, "status", `Invalid status "${plan.status}".`);
  const workouts = Array.isArray(plan.workouts) ? plan.workouts : null;
  if (!workouts || !workouts.length) {
    err("SCHEMA", null, "workouts", "Plan needs a non-empty workouts array.");
    return { ok: false, errors, warnings, stats };
  }

  const hasEquip = Array.isArray(profile?.equipment?.locations) && profile.equipment.locations.length > 0;
  const anySurface = hasEquip && profile.equipment.locations.some((l) => (l?.items || []).some((i) => i === "outdoor_route" || i === "track"));
  const dis = dislikedIds(profile);
  const inj = injuryTags(profile);
  const easyPace = num(profile?.experience?.running?.easyPaceSecPerKm) || DEFAULT_PACE;
  const seen = new Set();
  let easyKm = 0, totalRunKm = 0;
  const hardness = [];

  const checkExercise = (w, path, id, name, eq, kind) => {
    let ex = id ? getExercise(id) : null;
    if (!ex && !id && name && NON_EXERCISE.test(name)) return null;
    if (!ex && !id) ex = findExercise(name);
    if (!ex) { err("UNKNOWN_EXERCISE", w.id, path, `Unknown exercise "${id || name || "?"}" (use a catalog id).`); return null; }
    if (eq) {
      const chk = equipmentCheck(ex, eq);
      if (!chk.ok) err("EQUIPMENT_MISSING", w.id, path, `${ex.name} needs ${chk.missing.join(chk.anyOf.length ? " / " : ", ")} at ${w.locationId || "this location"}.`);
    }
    if (dis.has(ex)) err("DISLIKED_EXERCISE", w.id, path, `${ex.name} is on the owner's dislike list.`);
    for (const i of inj) {
      const hit = ex.jointStress.filter((t) => i.tags.has(t));
      if (hit.length) warn("INJURY_CONFLICT", w.id, path, `${ex.name} (${hit.join(", ")}) may aggravate the ${i.area} injury.`);
    }
    return ex;
  };

  workouts.forEach((w, wi) => {
    const wp = `workouts[${wi}]`;
    if (!w || typeof w !== "object") { err("SCHEMA", null, wp, "Workout must be an object."); hardness.push({}); return; }
    if (typeof w.id !== "string" || !w.id) err("SCHEMA", null, `${wp}.id`, "Workout id is required.");
    else if (seen.has(w.id)) err("SCHEMA", w.id, `${wp}.id`, `Duplicate workout id ${w.id}.`);
    else seen.add(w.id);
    if (typeof w.title !== "string" || !w.title.trim()) err("SCHEMA", w.id, `${wp}.title`, "Workout title is required.");
    if (!WORKOUT_TYPES.includes(w.type)) err("SCHEMA", w.id, `${wp}.type`, `Invalid workout type "${w.type}".`);
    if (!Array.isArray(w.blocks) || !w.blocks.length) { err("SCHEMA", w.id, `${wp}.blocks`, "Workout needs a non-empty blocks array."); hardness.push({}); return; }
    const eq = hasEquip ? availableEquipment(profile, w.locationId) : null;
    if (hasEquip && w.locationId && !profile.equipment.locations.some((l) => l?.id === w.locationId)) err("SCHEMA", w.id, `${wp}.locationId`, `Unknown location "${w.locationId}".`);
    const h = { quality: false, legs: 0 };
    w.blocks.forEach((b, bi) => {
      const bp = `${wp}.blocks[${bi}]`;
      if (!b || !BLOCK_KINDS.includes(b.kind)) { err("SCHEMA", w.id, `${bp}.kind`, `Invalid block kind "${b?.kind}".`); return; }
      if (b.kind === "strength") {
        if (!Array.isArray(b.items) || !b.items.length) { err("SCHEMA", w.id, `${bp}.items`, "Strength block needs items."); return; }
        b.items.forEach((it, ii) => {
          const ip = `${bp}.items[${ii}]`;
          if (!it || typeof it !== "object") { err("SCHEMA", w.id, ip, "Item must be an object."); return; }
          if (!it.exerciseId && !it.name) err("SCHEMA", w.id, `${ip}.exerciseId`, "exerciseId is required.");
          if (!Number.isInteger(num(it.sets)) || num(it.sets) < 1) err("SCHEMA", w.id, `${ip}.sets`, "sets must be a positive integer.");
          if (it.reps == null || String(it.reps).trim() === "") err("SCHEMA", w.id, `${ip}.reps`, "reps is required (e.g. \"8-12\", \"5\", \"AMRAP\").");
          if (it.targetRir != null && num(it.targetRir) == null && typeof it.targetRir !== "string") err("SCHEMA", w.id, `${ip}.targetRir`, "targetRir must be a number.");
          if (it.loadKg != null && num(it.loadKg) == null) err("SCHEMA", w.id, `${ip}.loadKg`, "loadKg must be a number or null.");
          if (it.progression != null && !PROGRESSIONS.includes(it.progression)) err("SCHEMA", w.id, `${ip}.progression`, `Invalid progression "${it.progression}".`);
          const ex = (it.exerciseId || it.name) ? checkExercise(w, `${ip}.exerciseId`, it.exerciseId, it.name, eq, "strength") : null;
          if (ex && ["squat", "hinge", "lunge", "olympic"].includes(ex.pattern)) h.legs += num(it.sets) || 0;
          const alts = Array.isArray(it.alternatives) ? it.alternatives : [];
          let usable = 0;
          alts.forEach((a, ai) => {
            const ax = getExercise(a);
            if (!ax) err("UNKNOWN_EXERCISE", w.id, `${ip}.alternatives[${ai}]`, `Unknown alternative "${a}".`);
            else if (!eq || equipmentCheck(ax, eq).ok) usable++;
          });
          if (!usable) warn("MISSING_ALTERNATIVES", w.id, `${ip}.alternatives`, `${ex?.name || it.name || "Item"} has no usable alternatives.`);
        });
      } else if (b.kind === "conditioning") {
        h.quality = true;
        if (!COND_FORMATS.includes(b.format)) err("SCHEMA", w.id, `${bp}.format`, `Invalid conditioning format "${b.format}".`);
        if (!Array.isArray(b.items) || !b.items.length) { err("SCHEMA", w.id, `${bp}.items`, "Conditioning block needs items."); return; }
        b.items.forEach((it, ii) => {
          const ip = `${bp}.items[${ii}]`;
          if (!it || (!it.exerciseId && !it.name)) { err("SCHEMA", w.id, ip, "Conditioning item needs exerciseId."); return; }
          checkExercise(w, `${ip}.exerciseId`, it.exerciseId, it.name, eq, "conditioning");
        });
      } else if (b.kind === "run") {
        if (!RUN_TYPES.includes(b.runType)) err("SCHEMA", w.id, `${bp}.runType`, `Invalid runType "${b.runType}".`);
        if (b.segments != null && !Array.isArray(b.segments)) err("SCHEMA", w.id, `${bp}.segments`, "segments must be an array.");
        const km = runBlockKm(b, easyPace);
        if (!(km > 0) && !(b.segments || []).length) err("SCHEMA", w.id, `${bp}.totalKm`, "Run block needs totalKm or segments.");
        if (eq && !RUN_SURFACES.some((s) => eq.has(s)) && !anySurface) err("EQUIPMENT_MISSING", w.id, bp, `No running surface (outdoor_route, track or treadmill) at ${w.locationId || "this location"}.`);
        stats.runKm += km;
        stats.longestRunKm = Math.max(stats.longestRunKm, km);
        totalRunKm += km;
        if (EASY_RUNS.has(b.runType)) easyKm += km;
        else {
          const segKm = (b.segments || []).reduce((a, s) => a + (num(s?.reps) || 1) * ((num(s?.distanceM) || 0) / 1000), 0);
          const wcKm = (((num(b.warmupMin) || 0) + (num(b.cooldownMin) || 0)) * 60) / easyPace;
          easyKm += num(b.totalKm) > 0 ? Math.max(0, Math.min(km, wcKm, km - segKm)) : 0;
        }
        if (QUALITY_RUNS.has(b.runType)) h.quality = true;
      }
    });
    if (w.blocks.some((b) => b?.kind === "conditioning")) stats.conditioningCount += 1;
    const minutes = estimateWorkoutMinutes(w, { easyPaceSecPerKm: easyPace });
    if (w.id) stats.minutesByWorkout[w.id] = minutes;
    const cap = num(profile?.schedule?.minutesPerSession);
    if (cap && minutes > cap + 15) err("TOO_LONG", w.id, wp, `Estimated ${minutes} min exceeds the ${cap} min session (+15 allowed).`);
    hardness.push(h);
  });

  const perWeek = num(profile?.schedule?.daysPerWeek);
  if (perWeek && workouts.length !== perWeek) err("WORKOUT_COUNT", null, "workouts", `Plan has ${workouts.length} workouts but the owner trains ${perWeek} days/week.`);

  stats.runKm = r1(stats.runKm);
  stats.longestRunKm = r1(stats.longestRunKm);
  if (totalRunKm > 0) {
    const ref = isIso(plan.weekStart) ? weekStartOf(plan.weekStart) : weekStartOf(today || todayISO());
    const base = runBaseline(sessions, profile, ref);
    if (base) {
      const cap = Math.max(base.avgKm * 1.15, base.avgKm + 5);
      if (totalRunKm > cap + 1e-9) err("RUN_RAMP", null, "workouts", `Planned ${r1(totalRunKm)} km/week vs recent ~${r1(base.avgKm)} km/week (max ${r1(cap)}).`);
      if (stats.longestRunKm > base.longestKm * 1.3 && stats.longestRunKm > base.longestKm + 3) {
        err("LONG_RUN_SPIKE", null, "workouts", `Longest planned run ${stats.longestRunKm} km vs recent longest ${r1(base.longestKm)} km (max ${r1(Math.max(base.longestKm * 1.3, base.longestKm + 3))}).`);
      }
    }
    if (easyKm / totalRunKm < 0.7) warn("NO_REST_RUN_EASY", null, "workouts", `Only ${Math.round((100 * easyKm) / totalRunKm)}% of planned running is easy (aim ≥ 70%).`);
  }

  stats.setsPerMuscle = plannedSetsPerMuscle(plan);
  const hasStrength = workouts.some((w) => (w?.blocks || []).some((b) => b?.kind === "strength"));
  if (hasStrength) {
    if (profile?.goals?.modalities?.strength !== false) {
      for (const m of MAJOR_MUSCLES) {
        const v = stats.setsPerMuscle[m] || 0;
        if (v < 6) warn("VOLUME_LOW", null, `stats.setsPerMuscle.${m}`, `${m}: ${v} sets/week (< 6).`);
      }
    }
    for (const [m, v] of Object.entries(stats.setsPerMuscle)) if (v > 22) warn("VOLUME_HIGH", null, `stats.setsPerMuscle.${m}`, `${m}: ${v} sets/week (> 22).`);
  }

  for (let i = 0; i + 1 < hardness.length; i++) {
    const a = hardness[i], b = hardness[i + 1];
    const heavyA = a.legs >= 4, heavyB = b.legs >= 4;
    if ((a.quality && b.quality) || (a.quality && heavyB) || (heavyA && b.quality)) {
      warn("HARD_DAYS_ADJACENT", workouts[i + 1]?.id, `workouts[${i + 1}]`,
        `${workouts[i]?.id} and ${workouts[i + 1]?.id} are back-to-back hard sessions (intense run/conditioning or heavy legs).`);
    }
  }
  return { ok: errors.length === 0, errors, warnings, stats };
}

// ================================================================== session normalization
const SET_TOKEN = /^(bw(?:[+-]\d+(?:\.\d+)?)?|\d+(?:\.\d+)?)\s*[x×]\s*(\d+)(?:\s*@\s*(\d+(?:\.\d+)?))?(?:\s*\*\s*(\d+))?$/i;
const MISSED_REASONS = ["travel", "time", "sick", "pain", "motivation", "other"];
const SESSION_TYPES = [...WORKOUT_TYPES, "other"];
const clamp = (x, lo, hi) => (x == null ? null : Math.min(hi, Math.max(lo, x)));

function normSet(s, defaults = {}) {
  if (typeof s === "string") {
    const m = SET_TOKEN.exec(s.trim());
    if (!m) return [];
    const load = m[1].toLowerCase();
    const bw = load.startsWith("bw");
    const one = { type: defaults.type || "work", loadKg: bw ? (load.length > 2 ? Number(load.slice(2)) : null) : Number(load), bodyweight: bw, reps: Number(m[2]), rir: m[3] != null ? Number(m[3]) : null };
    return Array.from({ length: Number(m[4] || 1) }, () => ({ ...one }));
  }
  if (!s || typeof s !== "object") return [];
  const loadRaw = s.loadKg ?? s.load ?? s.weight ?? s.kg ?? defaults.loadKg ?? null;
  const bwLoad = typeof loadRaw === "string" && /^bw/i.test(loadRaw.trim());
  let rir = num(s.rir ?? defaults.rir);
  if (rir == null && num(s.rpe) != null) rir = Math.max(0, 10 - num(s.rpe));
  const reps = num(s.reps ?? defaults.reps);
  if (reps == null) return [];
  return [{
    type: isWarmup(s) ? "warmup" : "work",
    loadKg: bwLoad ? num(loadRaw.trim().slice(2)) : num(loadRaw),
    bodyweight: Boolean(s.bodyweight ?? defaults.bodyweight) || bwLoad,
    reps: Math.round(reps),
    rir,
  }];
}
function normStrength(entry) {
  if (!entry || typeof entry !== "object") return null;
  const ex = (entry.exerciseId && getExercise(entry.exerciseId)) || findExercise(entry.exerciseId || entry.name, { modality: "strength" });
  let sets = [];
  if (Array.isArray(entry.sets)) sets = entry.sets.flatMap((s) => normSet(s));
  else if (typeof entry.sets === "string") sets = entry.sets.split(/[\s,]+/).flatMap((t) => normSet(t));
  else {
    const count = num(entry.sets) || (Array.isArray(entry.reps) ? entry.reps.length : 1);
    const reps = Array.isArray(entry.reps) ? entry.reps : Array.from({ length: count }, () => entry.reps);
    sets = reps.flatMap((r) => normSet({ reps: r }, entry));
  }
  return { exerciseId: ex?.id ?? (entry.exerciseId || null), name: String(entry.name || ex?.name || entry.exerciseId || ""), sets };
}
function normDurationSec(v) {
  if (v == null || v === "") return null;
  if (typeof v === "number") return Number.isFinite(v) ? Math.round(v) : null;
  return parseDuration(v);
}

/**
 * Fill Session defaults (CONTRACT §4) and clean a loosely-shaped input: maps exercise names to catalog ids
 * (catalog.findExercise), accepts set strings ("100x5@2", "100x5@2*3", "bw+10x6"), rpe → rir, duration
 * strings, computes run pace (or duration from pace), infers type and a default title.
 * Does not assign an id when missing (id stays null).
 * @param {object} input
 * @param {{ today?: string, now?: Date }} [opts]
 * @returns {object} Session
 */
export function normalizeSession(input, { today, now } = {}) {
  const i = input && typeof input === "object" ? input : {};
  const strength = (Array.isArray(i.strength) ? i.strength : []).map(normStrength).filter((e) => e && (e.sets.length || e.exerciseId));
  const conditioning = (Array.isArray(i.conditioning) ? i.conditioning : []).filter((c) => c && typeof c === "object").map((c) => {
    const r = c.result && typeof c.result === "object" ? c.result : {};
    const fmt = String(c.format || "").toUpperCase().replace(/[\s-]+/g, "_");
    return {
      format: COND_FORMATS.includes(fmt) ? fmt : fmt || null,
      description: String(c.description || ""),
      result: { rounds: num(r.rounds), reps: num(r.reps), timeSec: normDurationSec(r.timeSec ?? r.time), calories: num(r.calories), completed: r.completed == null ? true : Boolean(r.completed) },
      scaled: Boolean(c.scaled), rpe: clamp(num(c.rpe), 1, 10), notes: String(c.notes || ""),
    };
  });
  let run = null;
  if (i.run && typeof i.run === "object") {
    const r = i.run;
    const distanceKm = num(r.distanceKm) ?? (num(r.distanceM) != null ? num(r.distanceM) / 1000 : num(r.distance));
    let durationSec = normDurationSec(r.durationSec ?? r.duration);
    if (durationSec == null && num(r.durationMin) != null) durationSec = Math.round(num(r.durationMin) * 60);
    let pace = typeof r.avgPaceSecPerKm === "string" ? parseDuration(r.avgPaceSecPerKm.replace(/\/km$/, "")) : num(r.avgPaceSecPerKm ?? r.paceSecPerKm);
    if (pace == null && typeof r.pace === "string") pace = parseDuration(r.pace.replace(/\/km$/, ""));
    if (pace == null) pace = paceSecPerKm(distanceKm, durationSec);
    if (durationSec == null && pace && distanceKm) durationSec = Math.round(pace * distanceKm);
    run = {
      runType: RUN_TYPES.includes(r.runType) ? r.runType : "easy",
      distanceKm: distanceKm == null ? null : r2(distanceKm), durationSec, avgPaceSecPerKm: pace ? Math.round(pace) : null,
      avgHr: num(r.avgHr), elevationM: num(r.elevationM), rpe: clamp(num(r.rpe), 1, 10),
      splits: (Array.isArray(r.splits) ? r.splits : []).map((x) => (typeof x === "string" ? parseDuration(x) : num(x))).filter((x) => x != null),
    };
  }
  let type = SESSION_TYPES.includes(i.type) ? i.type : null;
  if (!type) {
    const kinds = [strength.length && "strength", run && "run", conditioning.length && "conditioning"].filter(Boolean);
    type = kinds.length > 1 ? "hybrid" : kinds[0] || "other";
  }
  const status = ["done", "partial", "missed"].includes(i.status) ? i.status : "done";
  let durationMin = typeof i.durationMin === "string" ? (parseDuration(i.durationMin) ?? null) / 60 : num(i.durationMin);
  if (durationMin == null && run?.durationSec) durationMin = run.durationSec / 60;
  const title = String(i.title || "").trim() || (
    type === "run" ? `${run.runType[0].toUpperCase()}${run.runType.slice(1)} run${run.distanceKm ? ` ${run.distanceKm} km` : ""}`
    : type === "conditioning" ? `${conditioning[0]?.format || "Conditioning"}`.replace("_", " ")
    : type === "strength" ? strength.slice(0, 2).map((e) => e.name).join(" + ") || "Strength"
    : type === "hybrid" ? "Hybrid session" : status === "missed" ? "Missed session" : "Session");
  const stamp = (now instanceof Date ? now : new Date()).toISOString();
  return {
    id: i.id ?? null,
    date: isIso(i.date) ? i.date : today || todayISO(),
    planId: i.planId ?? null,
    workoutId: i.workoutId ?? null,
    title,
    type,
    status,
    missedReason: status === "done" ? null : MISSED_REASONS.includes(i.missedReason) ? i.missedReason : status === "missed" ? "other" : null,
    durationMin: durationMin == null ? null : Math.round(durationMin),
    readiness: i.readiness == null ? null : clamp(Math.round(num(i.readiness)), 1, 5),
    sessionRpe: clamp(num(i.sessionRpe ?? i.rpe), 1, 10),
    notes: String(i.notes || ""),
    pain: (Array.isArray(i.pain) ? i.pain : []).filter((p) => p && p.area).map((p) => ({
      area: String(p.area), score: clamp(num(p.score) ?? 0, 0, 10), when: ["during", "after", "next_morning"].includes(p.when) ? p.when : "during",
    })),
    strength,
    conditioning,
    run,
    prs: Array.isArray(i.prs) ? i.prs : [],
    coachComment: String(i.coachComment || ""),
    createdBy: i.createdBy === "manual" ? "manual" : "chat",
    createdAt: i.createdAt || stamp,
    updatedAt: i.updatedAt || i.createdAt || stamp,
  };
}

// ================================================================== rotation
/**
 * Up-next workout: the first workout (rotation order) not yet done. Only for the agreed plan; a rotation
 * belonging to another plan counts as nothing done.
 * @param {object} plan
 * @param {object} state AppState
 * @returns {object|null} Workout, or null when the plan is not agreed or the week is complete
 */
export function nextWorkout(plan, state) {
  if (!plan || plan.status !== "agreed" || !Array.isArray(plan.workouts)) return null;
  const rot = state?.rotation;
  const done = rot && rot.planId === plan.id && Array.isArray(rot.done) ? rot.done : [];
  return plan.workouts.find((w) => w && !done.includes(w.id)) || null;
}

/**
 * Rotation after completing a workout (no duplicates; resets when the rotation belonged to another plan;
 * unknown workout ids leave it unchanged).
 * @param {object} state AppState
 * @param {object} plan
 * @param {string} workoutId
 * @returns {{ planId: string, done: string[] }}
 */
export function markWorkoutDone(state, plan, workoutId) {
  const rot = state?.rotation;
  const same = rot && rot.planId === plan?.id && Array.isArray(rot.done);
  const done = same ? [...rot.done] : [];
  if ((plan?.workouts || []).some((w) => w?.id === workoutId) && !done.includes(workoutId)) done.push(workoutId);
  return { planId: plan?.id ?? null, done };
}
