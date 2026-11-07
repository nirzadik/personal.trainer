// Context snapshot for the chat instructions turn, plus workout/plan text formatters (owner: Agent B).
// Deterministic and budgeted: every section has its own byte cap and the whole is capped too.

import {
  clip, compactJson, compactValue, fmtDuration, fmtNum, fmtPace, formatSessionCompact,
  isPlainObject, joinSections, truncateBytes,
} from "./util.js";

/** Byte budgets of the snapshot sections (the total is capped separately). */
export const CONTEXT_BUDGETS = Object.freeze({
  profile: 6000,
  equipment: 3000,
  memory: 6000,
  plan: 3000,
  nextWorkout: 5000,
  trainingSummary: 4096,
  sessions: 3500,
});

/**
 * Text lines for one strength item, e.g.
 * "- back_squat (Back squat): 3×5 @RIR 2, rest 180s → target 102.5 kg × 5 (+2.5 kg) | alt front_squat".
 * @param {object} item StrengthItem (optionally with `target` = core.nextTarget result)
 * @returns {string}
 */
export function formatStrengthItem(item) {
  if (!isPlainObject(item)) return "";
  const name = item.name && item.name.toLowerCase() !== String(item.exerciseId).replace(/_/g, " ") ? ` (${clip(item.name, 40)})` : "";
  const dose = [
    `${item.sets ?? "?"}×${item.reps ?? "?"}`,
    item.targetRir !== null && item.targetRir !== undefined ? `@RIR ${item.targetRir}` : null,
    item.loadKg ? `${fmtNum(item.loadKg)} kg planned` : null,
  ].filter(Boolean).join(" ");
  const extras = [
    item.restSec ? `rest ${item.restSec}s` : null,
    item.tempo ? `tempo ${item.tempo}` : null,
    item.supersetGroup ? `superset ${item.supersetGroup}` : null,
  ].filter(Boolean).join(", ");
  let line = `- ${item.exerciseId ?? "?"}${name}: ${dose}${extras ? `, ${extras}` : ""}`;
  const t = item.target;
  if (isPlainObject(t) && (t.loadKg !== undefined || t.reps !== undefined || t.note)) {
    const tl = [t.loadKg !== null && t.loadKg !== undefined ? `${fmtNum(t.loadKg)} kg` : null, t.reps ? `× ${t.reps}` : null]
      .filter(Boolean).join(" ");
    line += ` → target ${tl || "(no load yet)"}${t.note ? ` (${clip(t.note, 90)})` : ""}`;
  }
  if (item.notes) line += ` — ${clip(item.notes, 80)}`;
  if (Array.isArray(item.alternatives) && item.alternatives.length) line += ` | alt ${item.alternatives.slice(0, 3).join(", ")}`;
  return line;
}

/**
 * Text for one Block.
 * @param {object} block
 * @returns {string}
 */
export function formatBlock(block) {
  if (!isPlainObject(block)) return "";
  const b = block;
  if (b.kind === "strength") {
    return (Array.isArray(b.items) ? b.items : []).map(formatStrengthItem).filter(Boolean).join("\n");
  }
  if (b.kind === "conditioning") {
    const shape = [
      b.format, b.minutes ? `${b.minutes} min` : null, b.rounds ? `${b.rounds} rounds` : null,
      b.timeCapMin ? `cap ${b.timeCapMin} min` : null,
      b.workSec ? `${b.workSec}s on` : null, b.restSec ? `${b.restSec}s off` : null,
    ].filter(Boolean).join(" ");
    const items = (Array.isArray(b.items) ? b.items : []).map((it) => {
      if (!isPlainObject(it)) return "";
      const amount = it.reps ? `${it.reps} ` : it.calories ? `${it.calories} cal ` : it.distanceM ? `${it.distanceM} m ` : it.durationSec ? `${it.durationSec}s ` : "";
      return `${amount}${it.exerciseId ?? clip(it.name, 30)}${it.loadKg ? ` @${fmtNum(it.loadKg)} kg` : ""}`;
    }).filter(Boolean).join(", ");
    const tail = [b.targetRpe ? `target RPE ${b.targetRpe}` : null, b.scaling ? `scaling: ${clip(b.scaling, 100)}` : null]
      .filter(Boolean).join("; ");
    return `- conditioning ${shape}: ${items}${tail ? ` (${tail})` : ""}`;
  }
  if (b.kind === "run") {
    const segs = (Array.isArray(b.segments) ? b.segments : []).map((s) => {
      if (!isPlainObject(s)) return "";
      const what = s.distanceM ? `${s.distanceM} m` : s.durationSec ? fmtDuration(s.durationSec) : "";
      const pace = Array.isArray(s.target?.paceSecPerKm) && s.target.paceSecPerKm.length === 2
        ? ` @ ${fmtDuration(s.target.paceSecPerKm[0])}-${fmtPace(s.target.paceSecPerKm[1])} (${Math.round(s.target.paceSecPerKm[0])}-${Math.round(s.target.paceSecPerKm[1])} s/km)` : "";
      const effort = [s.target?.hrZone ? `Z${s.target.hrZone}` : null, s.target?.rpe ? `RPE ${s.target.rpe}` : null].filter(Boolean).join(" ");
      const rec = s.recoverySec ? `, ${s.recoverySec}s ${s.recoveryType || "rec"}` : "";
      return `${s.reps && s.reps > 1 ? `${s.reps}× ` : ""}${what}${pace}${effort ? ` ${effort}` : ""}${rec}`;
    }).filter(Boolean).join("; ");
    const head = [b.runType || "run", b.totalKm ? `${fmtNum(b.totalKm)} km total` : null,
      b.warmupMin ? `wu ${b.warmupMin} min` : null, b.cooldownMin ? `cd ${b.cooldownMin} min` : null].filter(Boolean).join(", ");
    return `- run ${head}${segs ? `: ${segs}` : ""}${b.notes ? ` — ${clip(b.notes, 80)}` : ""}`;
  }
  // warmup / cooldown / mobility
  const items = (Array.isArray(b.items) ? b.items : [])
    .map((it) => (isPlainObject(it) ? `${clip(it.name, 40)}${it.detail ? ` ${clip(it.detail, 40)}` : ""}` : ""))
    .filter(Boolean).join("; ");
  return `- ${b.kind || "block"}${b.minutes ? ` ${b.minutes} min` : ""}${items ? `: ${items}` : ""}`;
}

/**
 * Full text of a Workout (header + blocks).
 * @param {object} workout
 * @returns {string}
 */
export function formatWorkout(workout) {
  if (!isPlainObject(workout)) return "";
  const w = workout;
  const head = `${w.id ?? "?"} · ${clip(w.title || "Workout", 60)} (${[w.type, w.estMinutes ? `${w.estMinutes} min` : null, w.locationId].filter(Boolean).join(", ")})`;
  const lines = [head];
  if (w.intent) lines.push(`intent: ${clip(w.intent, 160)}`);
  for (const b of Array.isArray(w.blocks) ? w.blocks : []) {
    const t = formatBlock(b);
    if (t) lines.push(t);
  }
  return lines.join("\n");
}

/**
 * One-line-per-workout overview of a Plan with rotation status.
 * @param {object} plan
 * @param {{ done?: string[], label?: string }} [opts]
 * @returns {string}
 */
export function formatPlanOverview(plan, { done = [], label = "Plan" } = {}) {
  if (!isPlainObject(plan)) return "";
  const doneSet = new Set(Array.isArray(done) ? done : []);
  const workouts = Array.isArray(plan.workouts) ? plan.workouts : [];
  let nextMarked = false;
  const rows = workouts.map((w) => {
    let status = "later";
    if (doneSet.has(w.id)) status = "done";
    else if (!nextMarked) { status = "UP NEXT"; nextMarked = true; }
    return `- ${w.id} ${clip(w.title, 50)} · ${w.type ?? "?"}${w.estMinutes ? ` · ${w.estMinutes} min` : ""} · ${status}`;
  });
  const head = `${label} ${plan.id ?? ""} (week of ${plan.weekStart ?? "?"}, ${plan.status ?? "?"}): ${clip(plan.focus, 120)}`;
  return [head, ...rows].join("\n");
}

function formatEquipment(profile, equipmentNames) {
  const eq = isPlainObject(profile?.equipment) ? profile.equipment : {};
  const locs = Array.isArray(eq.locations) ? eq.locations : [];
  const lines = locs.map((l) => {
    if (!isPlainObject(l)) return "";
    const items = Array.isArray(l.items) && l.items.length ? l.items.join(", ") : "bodyweight only";
    const extra = [
      l.dumbbellMaxKg ? `dumbbells up to ${fmtNum(l.dumbbellMaxKg)} kg` : null,
      Array.isArray(l.kettlebellsKg) && l.kettlebellsKg.length ? `kettlebells ${l.kettlebellsKg.map(fmtNum).join("/")} kg` : null,
      l.notes ? clip(l.notes, 100) : null,
    ].filter(Boolean).join("; ");
    const isDefault = l.id === eq.defaultLocationId ? " (default)" : "";
    return `- ${l.id} "${clip(l.name, 30)}"${isDefault}: ${items}${extra ? `; ${extra}` : ""}`;
  }).filter(Boolean);
  if (!lines.length) lines.push("- none recorded yet");
  const ids = Object.keys(isPlainObject(equipmentNames) ? equipmentNames : {});
  if (ids.length) lines.push(`Valid EQUIPMENT ids: ${ids.join(", ")}`);
  return lines.join("\n");
}

function formatMemory(coach) {
  if (!isPlainObject(coach)) return "";
  const lines = [];
  if (coach.summary) lines.push(`Summary: ${clip(coach.summary, 2000)}`);
  const notes = Array.isArray(coach.notes) ? coach.notes.slice(-20) : [];
  if (notes.length) {
    lines.push("Notes (oldest → newest):");
    for (const n of notes) if (isPlainObject(n)) lines.push(`- ${n.date ?? ""} [${n.kind ?? "note"}] ${clip(n.text, 300)}`);
  }
  return lines.join("\n");
}

function profileForPrompt(profile, mode) {
  if (!isPlainObject(profile)) return "{}";
  const { equipment, version, updatedAt, ...rest } = profile;
  if (mode === "onboarding") {
    // Show the full shape (nulls included) so the coach knows which fields to fill.
    return JSON.stringify({ ...rest, equipment });
  }
  return JSON.stringify(compactValue(rest) ?? {});
}

/**
 * Build the context snapshot placed in the leading instructions turn (CONTRACT §5.4).
 * All numbers come from the app; the snapshot is cut to `maxBytes`.
 * @param {object} data
 * @param {"chat"|"onboarding"} data.mode
 * @param {string} data.today YYYY-MM-DD
 * @param {string} data.weekday
 * @param {object} data.profile
 * @param {object} [data.coach] CoachMemory with the summary already stripped of app markers
 * @param {object} [data.equipmentNames] catalog.EQUIPMENT
 * @param {object} [data.agreedPlan]
 * @param {object} [data.draftPlan]
 * @param {object} [data.state] AppState
 * @param {object} [data.nextWorkout] Workout whose strength items carry `target`
 * @param {object} [data.trainingSummary] core.trainingSummary result
 * @param {object[]} [data.recentSessions] newest first
 * @param {string} [data.pacesText] prompts/plan.js formatPaces() output
 * @param {{ maxBytes?: number }} [opts]
 * @returns {string}
 */
export function buildContextSnapshot(data, { maxBytes = 26000 } = {}) {
  const d = isPlainObject(data) ? data : {};
  const B = CONTEXT_BUDGETS;
  const sections = [
    { title: "Today", body: `${d.today ?? "?"} (${d.weekday ?? ""})` },
    { title: d.mode === "onboarding" ? "Owner profile (full JSON, nulls = not asked yet)" : "Owner profile (JSON)",
      body: truncateBytes(profileForPrompt(d.profile, d.mode), d.mode === "onboarding" ? B.profile + 2000 : B.profile) },
    { title: "Equipment", body: formatEquipment(d.profile, d.equipmentNames), maxBytes: B.equipment },
    { title: "Coach memory", body: formatMemory(d.coach), maxBytes: B.memory },
  ];
  if (d.mode !== "onboarding") {
    const planLines = [];
    const state = isPlainObject(d.state) ? d.state : {};
    if (isPlainObject(d.agreedPlan)) planLines.push(formatPlanOverview(d.agreedPlan, { done: state.rotation?.done, label: "Agreed plan" }));
    else planLines.push("No agreed plan yet.");
    if (isPlainObject(d.draftPlan)) {
      const v = d.draftPlan.validation;
      const vText = isPlainObject(v) ? ` — validation: ${v.errors?.length ?? 0} errors, ${v.warnings?.length ?? 0} warnings` : "";
      planLines.push(`Draft plan ${d.draftPlan.id ?? ""} awaiting the owner's approval: ${clip(d.draftPlan.focus, 100)}${vText}`);
    }
    if (isPlainObject(state.pendingPlanRequest)) {
      const r = state.pendingPlanRequest;
      planLines.push(`Pending plan request (${r.kind}): ${clip(r.instruction, 200) || "no instruction"} — the owner still has to tap Generate.`);
    }
    sections.push({ title: "Plan", body: planLines.join("\n"), maxBytes: B.plan });
    sections.push({
      title: "Up next (full, with app-computed targets)",
      body: isPlainObject(d.nextWorkout) ? formatWorkout(d.nextWorkout) : (isPlainObject(d.agreedPlan) ? "All workouts in the rotation are done." : ""),
      maxBytes: B.nextWorkout,
    });
    sections.push({ title: "Running paces (computed by the app)", body: d.pacesText ?? "", maxBytes: 2000 });
    sections.push({
      title: "Training summary (computed by the app; use these numbers)",
      body: d.trainingSummary ? compactJson(d.trainingSummary) : "",
      maxBytes: B.trainingSummary,
    });
    const recent = Array.isArray(d.recentSessions) ? d.recentSessions.slice(0, 3) : [];
    sections.push({
      title: "Last 3 sessions (newest first)",
      body: recent.length ? recent.map((s) => formatSessionCompact(s, { notesChars: 120, commentChars: 100 })).join("\n") : "None logged yet.",
      maxBytes: B.sessions,
    });
  }
  return joinSections(sections, maxBytes);
}
