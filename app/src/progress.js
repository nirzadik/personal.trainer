// Adaptive planning digest (owner: Agent P). See CONTRACT-v2.md "src/progress.js".
//
// Pure: no DOM, no platform calls. Turns last week's logged training (vs the plan it belonged to), wellness
// entries and the profile into a compact object the plan prompt leads with, ending in rule-derived
// `adjustments` (progress / hold / repeat / deload / reduce_volume / swap / return / calibrate).
// Decision rules and sources: docs/research/08-adaptive-planning.md.

import {
  adherence, daysBetween, exerciseStats, exposures, formatPace, nextTarget, paceSecPerKm, runningLoad, todayISO, weekStartOf,
} from "./core.js";

/** Byte budget of the digest JSON. */
export const DIGEST_MAX_BYTES = 6000;

/** Every action an adjustment hint can carry. */
export const DIGEST_ACTIONS = Object.freeze(["progress", "hold", "repeat", "deload", "reduce_volume", "swap", "return", "calibrate"]);

/** Thresholds of the decision rules (docs/research/08-adaptive-planning.md §7). */
export const DIGEST_RULES = Object.freeze({
  completeProgressPct: 85,   // ≥ this share of planned workouts done → progress as planned
  completeRepeatPct: 50,     // < this → repeat last week (no increases anywhere)
  gapReturnDays: 10,         // days since the last session → "return" week (volume −30 %)
  readinessLow: 50,          // device training readiness (0-100) 7-day mean below this = a fatigue signal (Garmin "Low" band < 50)
  readinessPoor: 25,         // below this = deload on its own (Garmin "Poor" band)
  hrvLowDays: 3,             // ≥ this many low/poor HRV-status days in 7 = a fatigue signal (trend, not a single day)
  sessionReadinessLow: 2,    // session readiness (1-5) mean ≤ this = a fatigue signal
  srpeHigh: 8.5,             // mean session RPE ≥ this = a fatigue signal
  painSignal: 4,             // pain ≥ 4/10 = a signal (and a swap for the affected exercise / reduce for running)
  fatigueSignalsDeload: 2,   // ≥ this many independent signals → deload week; 1 → hold
  buildWeeksDeloadDue: 6,    // consecutive non-deload plans → deload due
  runProgressPct: 90,        // completed / planned run km ≥ this → may progress volume
  runHoldPct: 75,            // < this → rebuild from completed km, no increase
  paceSlowTolerance: 0.02,   // quality run slower than the slow end of its target by > 2 % → hold paces
  runRampPct: 0.10,          // weekly km ≤ +10 % of the completed base
  longRunRampPct: 0.10,      // single run ≤ +10 % of the 30-day longest (Frandsen et al. 2025); short runs round down (5 → 5.5 km)
});

const R = DIGEST_RULES;
const isObj = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
const n = (x) => (typeof x === "number" ? (Number.isFinite(x) ? x : null) : x == null || x === "" ? null : Number.isFinite(Number(x)) ? Number(x) : null);
const r1 = (x) => (x == null ? null : Math.round(x * 10) / 10);
const mean = (xs) => { const v = xs.filter((x) => x != null); return v.length ? r1(v.reduce((a, b) => a + b, 0) / v.length) : null; };
const isWarm = (s) => /^(warmup|warm-up|warm up|w)$/i.test(String(s?.type ?? "").trim());
const clipS = (s, max) => { const t = String(s ?? "").replace(/\s+/g, " ").trim(); return t.length > max ? `${t.slice(0, max - 1)}…` : t; };
const QUALITY = new Set(["tempo", "threshold", "intervals", "hills", "fartlek", "race"]);
const CONTINUOUS = new Set(["easy", "long", "recovery", "tempo", "threshold", "race"]);
const RANK = { calibrate: 0, progress: 1, return: 2, hold: 3, repeat: 3, reduce_volume: 4, swap: 5, deload: 6 };

function addDays(iso, d) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso ?? ""));
  if (!m) return iso;
  return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]) + d * 86400000).toISOString().slice(0, 10);
}
function sortAsc(sessions) {
  return (Array.isArray(sessions) ? sessions : []).filter(isObj)
    .slice().sort((a, b) => String(a.date).localeCompare(String(b.date)) || String(a.createdAt ?? "").localeCompare(String(b.createdAt ?? "")));
}
function fmtPace(sec) { try { return formatPace(sec); } catch { return null; } }
function paceRange(t) { return Array.isArray(t) && t.length === 2 && n(t[0]) && n(t[1]) ? [Math.min(n(t[0]), n(t[1])), Math.max(n(t[0]), n(t[1]))] : null; }
function fmtRange(r) { return r ? `${fmtPace(r[0])?.replace("/km", "")}-${fmtPace(r[1])}` : null; }
function safe(fn, fallback = null) { try { const v = fn(); return v === undefined ? fallback : v; } catch { return fallback; } }

/** The plan the owner trained on most recently: agreed/archived, weekStart ≤ today, newest. */
function lastPlanOf(plans, today, sessionsAsc = []) {
  const list = (Array.isArray(plans) ? plans : []).filter((p) => isObj(p) && p.status !== "draft" && Array.isArray(p.workouts) && String(p.weekStart ?? "") <= today);
  list.sort((a, b) => String(b.weekStart).localeCompare(String(a.weekStart)) || (a.status === "agreed" ? -1 : b.status === "agreed" ? 1 : 0)
    || String(b.approvedAt ?? b.createdAt ?? "").localeCompare(String(a.approvedAt ?? a.createdAt ?? "")));
  // A plan that only just started (≤ 1 day) with nothing logged against it says nothing yet: judge the one before it.
  const [first, second] = list;
  if (first && second && (daysBetween(first.weekStart, today) ?? 9) <= 1
    && !sessionsAsc.some((s) => s.planId === first.id || s.date >= first.weekStart)) return second;
  return first ?? null;
}
function buildWeeksSinceDeload(plans, today) {
  const list = (Array.isArray(plans) ? plans : []).filter((p) => isObj(p) && p.status !== "draft" && String(p.weekStart ?? "") <= today)
    .sort((a, b) => String(b.weekStart).localeCompare(String(a.weekStart)));
  const seen = new Set();
  let count = 0;
  for (const p of list) {
    if (seen.has(p.weekStart)) continue;
    seen.add(p.weekStart);
    if (/deload|cutback|recovery week/i.test(`${p.focus ?? ""} ${(p.notes ?? []).join(" ")}`)) break;
    count++;
  }
  return count;
}
function planStrengthItems(plan) {
  const map = new Map();
  for (const w of plan?.workouts ?? []) for (const b of w?.blocks ?? []) {
    if (b?.kind !== "strength") continue;
    for (const it of b.items ?? []) if (isObj(it) && it.exerciseId && !map.has(it.exerciseId)) map.set(it.exerciseId, { ...it, workoutId: w.id });
  }
  return map;
}
function sessionEntryIds(s) { return (s?.strength ?? []).map((e) => e?.exerciseId).filter(Boolean); }
function feedbackOf(sessionsAsc, exerciseId) {
  const out = [];
  for (const s of sessionsAsc) {
    if (s.status === "missed") continue;
    for (const e of s.strength ?? []) {
      if (e?.exerciseId !== exerciseId || !(e.sets ?? []).some((x) => !isWarm(x))) continue;
      out.push({ date: s.date, fb: ["easy", "fine", "hard"].includes(e.feedback) ? e.feedback : null, pain: Math.max(0, ...(s.pain ?? []).map((p) => n(p?.score) ?? 0)) });
    }
  }
  return out;
}

// ---------------------------------------------------------------- week completion

function weekSection(plan, sessionsAsc, profile, today) {
  const ws = plan?.weekStart && /^\d{4}-\d{2}-\d{2}$/.test(plan.weekStart) ? plan.weekStart : addDays(today, -6);
  const we = addDays(ws, 6) < today ? addDays(ws, 6) : today;
  const inWeek = sessionsAsc.filter((s) => (plan && s.planId === plan.id) || (s.date >= ws && s.date <= we));
  const workouts = Array.isArray(plan?.workouts) ? plan.workouts : [];
  const planned = workouts.length || n(profile?.schedule?.daysPerWeek) || 0;
  let done = 0, partial = 0;
  const doneIds = new Set();
  for (const s of inWeek) {
    if (s.status === "missed") continue;
    if (s.workoutId && workouts.some((w) => w.id === s.workoutId)) {
      if (doneIds.has(s.workoutId)) continue;
      doneIds.add(s.workoutId);
    }
    if (s.status === "partial") partial++; else done++;
  }
  const missedWhy = {};
  for (const s of inWeek) if (s.status === "missed") missedWhy[s.missedReason || "unspecified"] = (missedWhy[s.missedReason || "unspecified"] || 0) + 1;
  // A plan week that is still running (the owner reviews a workout or asks for next week before day 7) is judged
  // against the share of workouts due so far, not the whole week: 1 of 4 on Monday is on track, not "25 %".
  const inProgress = Boolean(plan && workouts.length) && addDays(ws, 6) > today && doneIds.size < workouts.length;
  const expected = inProgress ? Math.min(planned, Math.floor((planned * ((daysBetween(ws, we) ?? 0) + 1)) / 7)) : planned;
  const credited = Math.min(expected, done + partial * 0.5);
  const notDone = workouts.filter((w) => !doneIds.has(w.id)).map((w) => `${w.id} ${clipS(w.title, 24)}`);
  const active = inWeek.filter((s) => s.status !== "missed");
  const last = [...sessionsAsc].reverse().find((s) => s.status !== "missed" && s.date <= today);
  return {
    plan: plan?.id ?? null, from: ws, to: we, planned, ...(inProgress ? { inProgress: true, expected } : {}), done, partial,
    missed: Object.values(missedWhy).reduce((a, b) => a + b, 0),
    pct: expected ? Math.round((100 * credited) / expected) : null,
    ...(notDone.length && workouts.length ? { notDone: notDone.slice(0, 7) } : {}),
    ...(Object.keys(missedWhy).length ? { missedWhy } : {}),
    srpe: mean(active.map((s) => n(s.sessionRpe))),
    readiness: mean(active.map((s) => n(s.readiness))),
    daysSinceLast: last ? daysBetween(last.date, today) : null,
  };
}

// ---------------------------------------------------------------- wellness

function wellnessSection(wellness, today) {
  const entries = (Array.isArray(wellness) ? wellness : []).filter((e) => isObj(e) && typeof e.date === "string" && e.date <= today);
  if (!entries.length) return null;
  const cur = entries.filter((e) => e.date >= addDays(today, -6));
  const prev = entries.filter((e) => e.date >= addDays(today, -13) && e.date < addDays(today, -6));
  if (!cur.length) return { days: 0, note: "no entries in the last 7 days" };
  const hrvLow = cur.filter((e) => ["low", "poor"].includes(e.hrvStatus)).length;
  const hrvUnbalanced = cur.filter((e) => e.hrvStatus === "unbalanced").length;
  const out = {
    days: cur.length,
    readiness: mean(cur.map((e) => n(e.trainingReadiness))),
    readinessPrev: mean(prev.map((e) => n(e.trainingReadiness))),
    sleepScore: mean(cur.map((e) => n(e.sleepScore))),
    sleepH: mean(cur.map((e) => n(e.sleepHours))),
    hrvMs: mean(cur.map((e) => n(e.hrvMs))),
    hrvMsPrev: mean(prev.map((e) => n(e.hrvMs))),
    restingHr: mean(cur.map((e) => n(e.restingHr))),
    restingHrPrev: mean(prev.map((e) => n(e.restingHr))),
    stress: mean(cur.map((e) => n(e.stress))),
    hrvLow, hrvUnbalanced,
  };
  for (const k of Object.keys(out)) if (out[k] == null || (k.startsWith("hrv") && out[k] === 0 && k !== "hrvMs")) delete out[k];
  return out;
}

/** Independent recovery signals; each one names its evidence. */
function fatigueSignals({ week, well, strengthRows, painMax }) {
  const sig = [];
  let severe = false;
  if (well && well.readiness != null) {
    if (well.readiness < R.readinessPoor) { sig.push(`device readiness ${well.readiness}/100 (poor)`); severe = true; }
    else if (well.readiness < R.readinessLow) sig.push(`device readiness ${well.readiness}/100 (low)`);
  }
  if (well && (well.hrvLow ?? 0) >= R.hrvLowDays) sig.push(`HRV low/poor on ${well.hrvLow} of ${well.days} days`);
  if (week.readiness != null && week.readiness <= R.sessionReadinessLow) sig.push(`session readiness ${week.readiness}/5`);
  if (week.srpe != null && week.srpe >= R.srpeHigh) sig.push(`session RPE avg ${week.srpe}`);
  const trained = strengthRows.filter((r) => r.n > 0);
  const strained = trained.filter((r) => r.fb?.[r.fb.length - 1] === "hard" || r.flag === "fatigue");
  if (strained.length >= 2) sig.push(`${strained.length} lifts felt hard or show fatigue`);
  if (painMax >= R.painSignal) sig.push(`pain ${painMax}/10`);
  return { signals: sig, severe };
}

// ---------------------------------------------------------------- strength

function strengthSection({ sessionsAsc, plan, profile, today, weeks, weekCtx }) {
  const items = planStrengthItems(plan);
  const from = addDays(today, -7 * weeks + 1);
  const recentIds = [];
  for (const s of sessionsAsc) if (s.status !== "missed" && s.date >= from && s.date <= today) for (const id of sessionEntryIds(s)) if (!recentIds.includes(id)) recentIds.push(id);
  const ids = [...new Set([...items.keys(), ...recentIds])].slice(0, 12);
  const known = new Map((profile?.experience?.knownLifts ?? []).filter((l) => isObj(l) && l.exerciseId).map((l) => [l.exerciseId, l]));
  const rows = [];
  for (const id of ids) {
    const planned = items.get(id) ?? null;
    const ex = safe(() => exposures(sessionsAsc, id), []);
    const st = ex.length ? safe(() => exerciseStats(sessionsAsc, id)) : null;
    const lastReps = ex.length ? ex[ex.length - 1].sets.map((s) => n(s.reps)).filter((x) => x != null) : [];
    const item = planned ?? { exerciseId: id, reps: lastReps.length ? String(Math.max(...lastReps)) : "8-12", targetRir: 2, progression: "double", incrementKg: 2.5 };
    const tgt = safe(() => nextTarget(sessionsAsc, item, { today }));
    const fb = feedbackOf(sessionsAsc, id);
    const row = {
      id, n: ex.length,
      ...(st?.last ? { last: clipS(st.last.display, 60), date: st.last.date } : {}),
      ...(fb.some((f) => f.fb) ? { fb: fb.slice(-2).map((f) => f.fb) } : {}),
      ...(st?.trend?.length ? { e1rm: st.trend.slice(-4).map((t) => t.e1rm) } : {}),
      ...(st?.flag ? { flag: st.flag } : {}),
      ...(planned ? { plan: `${planned.sets ?? "?"}×${planned.reps ?? "?"}@${planned.targetRir ?? "?"} ${planned.progression ?? ""}`.trim() } : {}),
      ...(tgt ? { next: { kg: tgt.loadKg ?? null, reps: tgt.reps ?? null, reason: tgt.reason ?? null } } : {}),
    };
    const trainedLastWeek = ex.some((x) => x.date >= weekCtx.from && x.date <= weekCtx.to);
    row._decision = strengthDecision({ row, tgt, fb, planned, trainedLastWeek, known: known.get(id), weekCtx, today, ex });
    rows.push(row);
  }
  return rows;
}

function strengthDecision({ row, tgt, fb, planned, trainedLastWeek, known, weekCtx, today, ex }) {
  const reason = tgt?.reason ?? null;
  const flags = Array.isArray(tgt?.flags) ? tgt.flags : [];
  const last = fb[fb.length - 1] ?? null;
  const prev = fb[fb.length - 2] ?? null;
  const kg = tgt?.loadKg ?? null;
  if (!ex.length) {
    if (known && n(known.loadKg)) return { act: "calibrate", kg: null, why: `no logs yet: profile baseline ${known.loadKg}×${known.reps ?? "?"}${known.rir != null ? `@${known.rir}` : ""} as a start, ~3 RIR` };
    return { act: "calibrate", kg: null, why: "no logs yet: work up to ~3 RIR" };
  }
  if (last?.fb === "hard" && last.pain >= R.painSignal) return { act: "swap", kg: null, why: `felt hard with pain ${last.pain}/10: pain-free variant or range` };
  if (flags.includes("pain") && last?.pain >= R.painSignal) return { act: "swap", kg: null, why: `pain ${last.pain}/10 last time: pain-free variant, recalibrate` };
  if (row.flag === "fatigue") return { act: "deload", kg: kg ?? null, why: "e1RM down ≥5% at same effort: −10% load, fewer sets" };
  if (last?.fb === "hard" && prev?.fb === "hard") {
    const top = n(lastTopLoad(ex));
    return { act: "deload", kg: top ? Math.round((top * 0.925) / 2.5) * 2.5 : kg, why: "felt hard twice in a row: −5-10% load" };
  }
  if (reason === "reduce" || reason === "reset" || reason === "rpe_reduce") return { act: "deload", kg, why: `missed targets (${reason}): use the reduced load` };
  if (reason === "layoff") return { act: "return", kg, why: "long gap: restart at the reduced load, ~3 RIR" };
  if (last?.fb === "hard") return { act: "hold", kg: lastTopLoad(ex) ?? kg, why: "felt hard last time: hold the load, same reps" };
  if (row.flag === "stall") {
    return ex.length >= 8
      ? { act: "swap", kg: null, why: "stalled over many exposures: close variant or new rep scheme" }
      : { act: "hold", kg, why: "stall: +1-2 sets if fresh, or change rep scheme" };
  }
  if (planned && !trainedLastWeek && weekCtx.planned && !weekCtx.inProgress) return { act: "repeat", kg, why: "not trained last week: repeat its target" };
  if (reason === "effort_hold" || flags.includes("effort_overshoot")) return { act: "hold", kg, why: "effort overshot target RIR: consolidate" };
  if (["add_load", "add_reps", "rpe_increase"].includes(reason)) return { act: "progress", kg, why: reason === "add_reps" ? "add reps at this load" : "targets hit: add load" };
  if (reason === "repeat" || reason === "rpe_hold") {
    if (last?.fb === "easy") return { act: "progress", kg, why: "felt easy: progress as planned" };
    return { act: "hold", kg, why: "repeat the load, beat the reps" };
  }
  return { act: "hold", kg, why: reason ? `core: ${reason}` : "keep" };
}
function lastTopLoad(ex) {
  const last = ex[ex.length - 1];
  const loads = (last?.sets ?? []).filter((s) => !s.bodyweight).map((s) => n(s.loadKg)).filter((x) => x > 0);
  return loads.length ? Math.max(...loads) : null;
}

// ---------------------------------------------------------------- running

function runSection({ sessionsAsc, plan, profile, today, weekCtx }) {
  const weeksRows = safe(() => runningLoad(sessionsAsc, { weeks: 4, today }), []);
  const runs = sessionsAsc.filter((s) => s.status !== "missed" && n(s.run?.distanceKm) > 0 && s.date <= today);
  const blocks = [];
  for (const w of plan?.workouts ?? []) for (const b of w?.blocks ?? []) if (b?.kind === "run") blocks.push({ workoutId: w.id, block: b });
  const wantsRunning = !!profile?.goals?.modalities?.running || blocks.length > 0;
  if (!runs.length) {
    if (!wantsRunning) return null;
    const r = profile?.experience?.running ?? {};
    return { logged: false, baseline: { weeklyKm: n(r.currentWeeklyKm), longestKm: n(r.longestRecentRunKm), easyPace: n(r.easyPaceSecPerKm) ? fmtPace(n(r.easyPaceSecPerKm)) : null } };
  }
  const inWeek = runs.filter((s) => (plan && s.planId === plan.id) || (s.date >= weekCtx.from && s.date <= weekCtx.to));
  const doneKm = r1(inWeek.reduce((a, s) => a + n(s.run.distanceKm), 0));
  const planKm = blocks.length ? r1(blocks.reduce((a, x) => a + (n(x.block.totalKm) || 0), 0)) : null;
  // mid-week the planned km are not due yet: no completion share, and the base looks at the last full week too
  const pct = planKm && !weekCtx.inProgress ? Math.round((100 * doneKm) / planKm) : null;
  const lastFullKm = weekCtx.inProgress && weeksRows.length >= 2 ? weeksRows[weeksRows.length - 2].km : 0;
  const longest30 = r1(Math.max(0, ...runs.filter((s) => s.date >= addDays(today, -29)).map((s) => n(s.run.distanceKm))));
  const kmWk = weeksRows.map((w) => w.km);
  const avg4 = kmWk.length ? r1(kmWk.reduce((a, b) => a + b, 0) / kmWk.length) : 0;
  const easy = runs.filter((s) => s.date >= addDays(today, -27) && ["easy", "long", "recovery"].includes(s.run.runType))
    .map((s) => n(s.run.avgPaceSecPerKm) ?? safe(() => paceSecPerKm(s.run.distanceKm, s.run.durationSec))).filter((x) => x > 0);
  const easySec = easy.length ? Math.round(easy.reduce((a, b) => a + b, 0) / easy.length) : null;

  // quality runs vs their planned target
  const quality = [];
  for (const s of inWeek) {
    const planned = blocks.find((x) => x.workoutId === s.workoutId && (!plan || s.planId === plan.id))?.block ?? null;
    const type = s.run.runType || planned?.runType || null;
    if (!QUALITY.has(type) && !(planned && QUALITY.has(planned.runType))) continue;
    const segs = (planned?.segments ?? []).filter((g) => paceRange(g?.target?.paceSecPerKm));
    const main = segs.sort((a, b) => paceRange(a.target.paceSecPerKm)[0] - paceRange(b.target.paceSecPerKm)[0])[0] ?? null;
    const target = main ? paceRange(main.target.paceSecPerKm) : null;
    const actual = n(s.run.avgPaceSecPerKm) ?? safe(() => paceSecPerKm(s.run.distanceKm, s.run.durationSec));
    const comparable = CONTINUOUS.has(type) && target && actual;
    const slow = comparable ? actual > target[1] * (1 + R.paceSlowTolerance) : false;
    const fast = comparable ? actual < target[0] : false;
    const hard = n(s.run.rpe) != null && n(s.run.rpe) >= 9 && type !== "race";
    quality.push({ date: s.date, type, ...(target ? { target: fmtRange(target) } : {}), ...(actual ? { actual: fmtPace(Math.round(actual)) } : {}),
      ...(n(s.run.rpe) != null ? { rpe: n(s.run.rpe) } : {}), ...(slow ? { slow: true } : {}), ...(fast ? { fast: true } : {}), ...(hard ? { hard: true } : {}) });
  }
  const pain = Math.max(0, ...inWeek.flatMap((s) => (s.pain ?? []).map((p) => n(p?.score) ?? 0)));
  return {
    logged: true, kmWk, avg4, doneKm, ...(planKm != null ? { planKm, ...(pct != null ? { pct } : {}) } : {}), ...(lastFullKm ? { lastFullKm } : {}), longest30,
    ...(easySec ? { easyPace: fmtPace(easySec), easySec } : {}),
    ...(quality.length ? { quality: quality.slice(-4) } : {}),
    ...(pain ? { pain } : {}),
  };
}

function runDecision(run, weekAct) {
  if (!run) return null;
  if (!run.logged) return { act: "calibrate", why: "no logged runs: start from profile baseline km, easy runs only" };
  const base = Math.max(run.doneKm || 0, run.avg4 || 0, run.lastFullKm || 0);
  const longCapProgress = Math.floor(run.longest30 * (1 + R.longRunRampPct) * 10 + 1e-9) / 10;
  if ((run.pain ?? 0) >= R.painSignal) return { act: "reduce_volume", kmMax: r1(base * 0.7), longMax: run.longest30, why: `run pain ${run.pain}/10: −30% km, easy only` };
  const slowQ = (run.quality ?? []).filter((q) => q.slow || q.hard);
  const fastQ = (run.quality ?? []).filter((q) => q.fast && !q.hard);
  const paceHint = slowQ.length
    ? { pace: "hold", paceWhy: `${slowQ[0].type} ran ${slowQ[0].actual ?? "?"} vs ${slowQ[0].target ?? "target"}${slowQ[0].hard ? ", RPE ≥9" : ""}: keep paces, don't speed up` }
    : fastQ.length ? { pace: "hold", paceWhy: "quality ran faster than target: keep paces until a new race/time trial" } : {};
  if (weekAct === "deload") return { act: "deload", kmMax: r1(base * 0.7), longMax: r1(run.longest30 * 0.8), why: "deload week: −30% km, easy + strides", ...paceHint };
  if (run.pct != null && run.pct < R.runHoldPct) {
    return { act: "repeat", kmMax: r1(Math.max(run.doneKm || 0, run.avg4 || 0)), longMax: run.longest30, why: `${run.doneKm} of ${run.planKm} km done: rebuild from completed km, no increase`, ...paceHint };
  }
  if (weekAct === "hold" || weekAct === "reduce_volume" || weekAct === "repeat" || weekAct === "return" || slowQ.length) {
    const km = weekAct === "reduce_volume" || weekAct === "return" ? r1(base * 0.7) : r1(base);
    return { act: weekAct === "reduce_volume" || weekAct === "return" ? "reduce_volume" : "hold", kmMax: km, longMax: run.longest30,
      why: slowQ.length && !["reduce_volume", "return"].includes(weekAct) ? "quality runs came in slow: hold volume and paces" : "recovery signals: no km increase", ...paceHint };
  }
  if (run.pct == null || run.pct >= R.runProgressPct) {
    return { act: "progress", kmMax: r1(base * (1 + R.runRampPct)), longMax: longCapProgress, why: `completed ${run.doneKm} km${run.planKm ? ` of ${run.planKm}` : ""}: ≤+10% km, long run ≤${longCapProgress} km`, ...paceHint };
  }
  return { act: "hold", kmMax: r1(base), longMax: run.longest30, why: `${run.pct}% of planned km: hold`, ...paceHint };
}

// ---------------------------------------------------------------- conditioning

function conditioningSection({ sessionsAsc, plan, profile, weekCtx }) {
  const planned = [];
  for (const w of plan?.workouts ?? []) for (const b of w?.blocks ?? []) if (b?.kind === "conditioning") planned.push({ workoutId: w.id, block: b });
  const all = sessionsAsc.filter((s) => s.status !== "missed" && (s.conditioning ?? []).length);
  const wants = !!profile?.goals?.modalities?.conditioning || planned.length > 0;
  if (!all.length) return wants ? { logged: false, experience: profile?.experience?.conditioning?.experience ?? null } : null;
  const inWeek = all.filter((s) => (plan && s.planId === plan.id) || (s.date >= weekCtx.from && s.date <= weekCtx.to));
  const recent = inWeek.slice(-3).map((s) => {
    const c = s.conditioning[0] ?? {};
    const res = c.result ?? {};
    const target = planned.find((p) => p.workoutId === s.workoutId)?.block?.targetRpe ?? null;
    const rpe = n(c.rpe) ?? n(s.sessionRpe);
    return { date: s.date, fmt: c.format ?? null, ...(res.completed === false ? { incomplete: true } : {}), ...(c.scaled ? { scaled: true } : {}),
      ...(rpe != null ? { rpe } : {}), ...(target != null ? { targetRpe: target } : {}) };
  });
  return { logged: true, planned: planned.length || null, done: inWeek.length, recent, ...(weekCtx.inProgress ? { inProgress: true } : {}) };
}
function conditioningDecision(cond, weekAct) {
  if (!cond) return null;
  if (!cond.logged) return { act: "calibrate", why: cond.experience === "regular" ? "no logs: moderate metcon, RPE ≤7" : "no logs: newcomer ramp (short, RPE ≤6-7)" };
  if (weekAct === "deload") return { act: "deload", why: "deload week: half the volume, RPE ≤7" };
  const over = cond.recent.filter((r) => r.incomplete || (r.rpe != null && (r.targetRpe != null ? r.rpe >= r.targetRpe + 2 : r.rpe >= 9.5)));
  if (over.length) return { act: "hold", why: "a metcon was unfinished or far above target RPE: same dose" };
  if (cond.planned && cond.done < cond.planned && !cond.inProgress) return { act: "repeat", why: `${cond.done} of ${cond.planned} done: repeat, no increase` };
  if (["hold", "repeat", "reduce_volume", "return"].includes(weekAct)) return { act: "hold", why: "recovery or completion signals: same dose" };
  if (cond.recent.some((r) => r.scaled)) return { act: "progress", why: "done at target effort but scaled: reduce scaling one step" };
  return { act: "progress", why: "done at target effort: +1 round or +2-3 min (≤+20% time domain)" };
}

// ---------------------------------------------------------------- main

/**
 * Compact progression digest for the plan prompt: last week vs its plan, per-exercise history and next targets,
 * run volume and paces vs plan, conditioning results, pain, readiness/wellness, and rule-derived adjustments.
 * Logged data wins over onboarding baselines; profile baselines appear only under `baselines` for exercises or
 * modalities without history.
 * @param {object} args
 * @param {object[]} [args.sessions] Session[] (any order)
 * @param {object[]} [args.plans] Plan[] (any order; drafts ignored)
 * @param {object[]} [args.wellness] WellnessEntry[] (optional; fields may be missing)
 * @param {object} [args.profile]
 * @param {string} [args.today] YYYY-MM-DD
 * @param {number} [args.weeks=2] look-back window for per-exercise rows and trends
 * @returns {object} ≤ DIGEST_MAX_BYTES of JSON: { v, asOf, basis, week, signals, strength, run, conditioning, pain, wellness, adjustments, baselines }
 */
export function progressionDigest({ sessions = [], plans = [], wellness = [], profile = {}, today, weeks = 2 } = {}) {
  const t = typeof today === "string" && /^\d{4}-\d{2}-\d{2}$/.test(today) ? today : todayISO();
  const w = Math.max(1, Math.min(8, Number(weeks) || 2));
  const sessionsAsc = sortAsc(sessions).filter((s) => String(s.date) <= t);
  const hasHistory = sessionsAsc.some((s) => s.status !== "missed");
  const plan = lastPlanOf(plans, t, sessionsAsc);
  const week = weekSection(plan, sessionsAsc, profile, t);
  const well = wellnessSection(wellness, t);
  const strengthRows = hasHistory || plan ? strengthSection({ sessionsAsc, plan, profile, today: t, weeks: w, weekCtx: week }) : [];

  const painFrom = addDays(t, -13);
  const pain = [];
  for (const s of sessionsAsc) if (s.date >= painFrom) for (const p of s.pain ?? []) if (n(p?.score) > 0) pain.push({ date: s.date, area: clipS(p.area, 20), score: n(p.score) });
  const painMax = Math.max(0, ...pain.filter((p) => p.date >= addDays(t, -6)).map((p) => p.score));

  // ----- week-level decision
  const { signals, severe } = fatigueSignals({ week, well, strengthRows, painMax });
  const deloadDue = buildWeeksSinceDeload(plans, t) >= R.buildWeeksDeloadDue;
  let weekAct, weekWhy;
  if (!hasHistory) { weekAct = "calibrate"; weekWhy = "no logged sessions: calibration week from profile baselines"; }
  else if (severe || signals.length >= R.fatigueSignalsDeload || (deloadDue && signals.length >= 1)) {
    weekAct = "deload"; weekWhy = `${signals.join("; ")}${deloadDue ? "; deload due" : ""}: ~50% sets, RIR 3-4, loads −10-20%`;
  } else if (week.daysSinceLast != null && week.daysSinceLast >= R.gapReturnDays) {
    weekAct = "return"; weekWhy = `${week.daysSinceLast} days since last session: −30% volume, loads per targets`;
  } else if (week.pct != null && week.pct < R.completeRepeatPct) {
    const sick = (week.missedWhy?.sick ?? 0) + (week.missedWhy?.pain ?? 0) > 0;
    weekAct = sick ? "reduce_volume" : "repeat";
    weekWhy = `${week.done + week.partial} of ${week.expected ?? week.planned} done${week.inProgress ? " so far" : ""}${sick ? " (sick/pain)" : ""}: repeat last week's targets, no increases${sick ? ", −30% volume" : ""}`;
  } else if (week.pct != null && week.pct < R.completeProgressPct) {
    weekAct = "repeat";
    weekWhy = `${week.done + week.partial} of ${week.expected ?? week.planned} done${week.inProgress ? " so far" : ""}: put missed key lifts first, no added volume${week.missedWhy?.time ? "; condense (trim accessories)" : ""}`;
  } else if (signals.length === 1) { weekAct = "hold"; weekWhy = `${signals[0]}: hold volume, no extra load jumps`; }
  else { weekAct = "progress"; weekWhy = `${week.inProgress ? `week in progress, ${week.done + week.partial} of ${week.planned} done so far` : `${week.pct ?? 100}% done`}, recovery fine: progress per targets${deloadDue ? "; deload due soon" : ""}`; }

  // per-exercise: the week decision caps the exercise decision
  const adjustments = [{ scope: "week", act: weekAct, why: weekWhy }];
  for (const row of strengthRows) {
    let d = row._decision;
    if (weekAct === "deload" && RANK[d.act] < RANK.deload && d.act !== "calibrate") d = { act: "deload", kg: null, why: "deload week: RIR 3-4, ~50% sets" };
    else if (["reduce_volume", "return"].includes(weekAct) && d.act === "progress") d = { ...d, act: "hold", why: `${d.why}; week is ${weekAct.replace("_", " ")}: hold` };
    else if (weekAct === "hold" && d.act === "progress" && signals.some((s) => /readiness|HRV|RPE/.test(s))) d = { ...d, act: "hold", why: `${d.why}; low recovery: hold` };
    adjustments.push({ scope: "strength", id: row.id, act: d.act, ...(d.kg != null ? { kg: d.kg } : {}), ...(row.next?.reps && d.act !== "swap" ? { reps: row.next.reps } : {}), why: clipS(d.why, 90) });
    delete row._decision;
  }
  const run = runSection({ sessionsAsc, plan, profile, today: t, weekCtx: week });
  const rd = runDecision(run, weekAct);
  if (rd) adjustments.push({ scope: "run", ...rd });
  const cond = conditioningSection({ sessionsAsc, plan, profile, weekCtx: week });
  const cd = conditioningDecision(cond, weekAct);
  if (cd) adjustments.push({ scope: "conditioning", ...cd });

  // profile baselines only where there is no history
  const baselines = {};
  const historyIds = new Set(strengthRows.filter((r) => r.n > 0).map((r) => r.id));
  const loggedIds = new Set(sessionsAsc.flatMap(sessionEntryIds));
  const lifts = (profile?.experience?.knownLifts ?? []).filter((l) => isObj(l) && l.exerciseId && !historyIds.has(l.exerciseId) && !loggedIds.has(l.exerciseId))
    .slice(0, 8).map((l) => ({ id: l.exerciseId, kg: n(l.loadKg), reps: n(l.reps), rir: n(l.rir) }));
  if (lifts.length) baselines.lifts = lifts;
  if (run && !run.logged) { baselines.running = run.baseline; delete run.baseline; }
  if (!hasHistory && profile?.experience?.level) baselines.level = profile.experience.level;

  const ad4 = hasHistory ? safe(() => adherence(sessionsAsc, profile, { weeks: 4, today: t })) : null;
  const digest = {
    v: 1, asOf: t, basis: hasHistory ? "history" : "profile",
    week: { ...week, ...(ad4?.pct != null ? { adherence4wPct: ad4.pct } : {}), thisWeekStart: weekStartOf(t) },
    ...(signals.length ? { signals } : {}),
    ...(deloadDue ? { deloadDue: true } : {}),
    ...(strengthRows.length ? { strength: strengthRows } : {}),
    ...(run ? { run } : {}),
    ...(cond ? { conditioning: cond } : {}),
    ...(pain.length ? { pain: pain.slice(-6) } : {}),
    ...(well ? { wellness: well } : {}),
    adjustments,
    ...(Object.keys(baselines).length ? { baselines } : {}),
  };
  for (const k of Object.keys(digest.week)) if (digest.week[k] == null) delete digest.week[k];
  return fitBudget(digest);
}

/** Trim the least decision-relevant detail until the JSON fits DIGEST_MAX_BYTES. */
function fitBudget(d) {
  const size = () => new TextEncoder().encode(JSON.stringify(d)).length;
  const steps = [
    () => { for (const r of d.strength ?? []) if (r.e1rm) r.e1rm = r.e1rm.slice(-2); },
    () => { if (d.run?.quality) d.run.quality = d.run.quality.slice(-2); if (d.pain) d.pain = d.pain.slice(-3); },
    () => { for (const r of d.strength ?? []) { delete r.plan; delete r.date; } },
    () => { if (d.strength) d.strength = d.strength.slice(0, 8); },
    () => { for (const a of d.adjustments) if (a.why) a.why = clipS(a.why, 60); },
    () => { if (d.strength) for (const r of d.strength) { delete r.e1rm; delete r.fb; } },
    () => { d.adjustments = d.adjustments.filter((a) => a.scope !== "strength" || a.act !== "progress"); },
    () => { delete d.strength; },
  ];
  for (const step of steps) { if (size() <= DIGEST_MAX_BYTES) break; step(); }
  return d;
}
