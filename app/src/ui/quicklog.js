// Owner: Agent D. Logging planned workouts from the Plan tab: "Mark as done" / "Done as planned" / "Skip".
// Shared by plan.js (card actions) and history.js (the prefilled quick-log form). Keeps the session log and
// the rotation consistent, and every write comes with an Undo that reverts both.

import { h, safe, toast, plural, errorText } from "./components.js";

export const MISSED_REASONS = [
  ["time", "No time"],
  ["travel", "Travel"],
  ["sick", "Sick"],
  ["pain", "Pain"],
  ["motivation", "Motivation"],
  ["other", "Other"],
];

/**
 * Toast with several actions (components.toast takes one). Same look and host as components.toast.
 * @param {{ text: string, actions?: Array<{ label: string, ariaLabel?: string, fn: Function }>, timeout?: number, kind?: string }} opts
 * @returns {() => void} dismiss
 */
export function actionToast({ text, actions = [], timeout = 8000, kind = "info" }) {
  if (actions.length <= 1) return toast({ text, action: actions[0], timeout, kind });
  let host = document.getElementById("toast-host");
  if (!host) {
    host = h("div", { id: "toast-host", class: "toast-host", "aria-live": "polite" });
    document.body.appendChild(host);
  }
  let timer = null;
  const el = h("div", { class: `toast toast-${kind} pl-toast`, role: "status" }, h("span", { class: "toast-text" }, text));
  const dismiss = () => {
    clearTimeout(timer);
    el.remove();
  };
  for (const a of actions) {
    el.appendChild(h("button", {
      type: "button",
      class: "toast-action",
      "aria-label": a.ariaLabel || a.label,
      onClick: async () => {
        dismiss();
        await a.fn();
      },
    }, a.label));
  }
  host.replaceChildren(el);
  timer = setTimeout(dismiss, timeout);
  return dismiss;
}

/**
 * The session logged for a plan workout (done/partial preferred over missed, newest first), or null.
 * Sessions without a planId count when they are dated inside or after the plan's week.
 * @param {any} ctx
 * @param {any} plan
 * @param {string} workoutId
 * @returns {any|null}
 */
export function findLoggedSession(ctx, plan, workoutId) {
  if (!plan || !workoutId) return null;
  const list = (ctx.data.sessions || []).filter((s) => s?.workoutId === workoutId
    && (s.planId === plan.id || (!s.planId && String(s.date) >= String(plan.weekStart || ""))));
  if (!list.length) return null;
  const rank = (s) => (s.status === "missed" ? 1 : 0);
  return [...list].sort((a, b) => rank(a) - rank(b) || String(b.date).localeCompare(String(a.date)) || String(b.createdAt || "").localeCompare(String(a.createdAt || "")))[0];
}

/**
 * Prefilled Session draft for a plan workout (core.sessionFromWorkout with today's targets).
 * @param {any} ctx
 * @param {any} plan
 * @param {any} workout
 * @returns {any}
 */
export function workoutDraft(ctx, plan, workout) {
  return ctx.core.sessionFromWorkout(workout, {
    sessions: ctx.data.sessions,
    today: ctx.today(),
    planId: plan?.id ?? null,
    profile: ctx.data.profile,
  });
}

/**
 * What a draft is missing before it can be saved without the form (loads for loaded lifts, reps for AMRAP sets,
 * a run without distance and time). Empty when "Done as planned" can save it directly.
 * @param {any} draft
 * @returns {string[]}
 */
export function missingForDirectSave(draft) {
  const out = [];
  for (const ex of draft?.strength || []) {
    if ((ex.sets || []).some((st) => st.reps == null)) out.push(`reps for ${ex.name}`);
    else if ((ex.sets || []).some((st) => !st.bodyweight && st.loadKg == null)) out.push(`a load for ${ex.name}`);
  }
  if (draft?.run && !draft.run.distanceKm && !draft.run.durationSec) out.push("the run distance");
  return out;
}

/** Advance the rotation for `workoutId` of the agreed plan. Resolves an undo that takes it back out. */
async function advanceRotation(ctx, plan, workoutId) {
  const { store, core } = ctx;
  if (!plan || plan.status !== "agreed" || !workoutId || !(plan.workouts || []).some((w) => w.id === workoutId)) return null;
  const prev = ctx.data.state?.rotation || { planId: null, done: [] };
  const rotation = core.markWorkoutDone(ctx.data.state, plan, workoutId);
  const already = prev.planId === plan.id && (prev.done || []).includes(workoutId);
  if (already) return null;
  await store.state.update({ rotation });
  return async () => {
    const cur = ctx.data.state?.rotation;
    if (prev.planId !== plan.id || !cur || cur.planId !== plan.id) {
      await store.state.update({ rotation: prev });
      return;
    }
    const done = [...(cur.done || [])];
    const i = done.lastIndexOf(workoutId);
    if (i >= 0) done.splice(i, 1);
    await store.state.update({ rotation: { ...cur, done } });
  };
}

function newId(date) {
  return `${date}-${Math.random().toString(36).slice(2, 8).padEnd(6, "0")}`;
}

/**
 * Save a new manual session: core.normalizeSession + core.detectPrs, store.sessions.add, advance the rotation when it
 * belongs to the agreed plan, then a toast with Undo (removes the session and restores the rotation) and, with
 * `view`, "View in History".
 * @param {any} ctx
 * @param {any} input loosely shaped Session (normalizeSession input)
 * @param {{ view?: boolean, toastText?: string }} [opts]
 * @returns {Promise<any>} the stored session
 */
export async function saveLoggedSession(ctx, input, { view = false, toastText } = {}) {
  const { store, core } = ctx;
  const now = new Date().toISOString();
  let session = safe(() => core.normalizeSession(input, { today: ctx.today() }), null) || { ...input };
  session = { ...session, createdBy: "manual" };
  if (session.status !== "missed") {
    const prior = (ctx.data.sessions || []).filter((x) => String(x.date) <= String(session.date));
    const prs = safe(() => core.detectPrs(session, prior), null);
    if (Array.isArray(prs)) session.prs = prs;
  }
  if (!session.id) session.id = newId(session.date);
  session.createdAt = session.createdAt || now;
  session.updatedAt = now;
  const res = await store.sessions.add(session);
  const plan = session.planId ? (ctx.data.plans || []).find((p) => p.id === session.planId) : null;
  let undoRotation = null;
  try {
    undoRotation = session.workoutId ? await advanceRotation(ctx, plan, session.workoutId) : null;
  } catch (err) {
    toast({ text: errorText(ctx.coach, err), kind: "error" });
  }
  const undo = async () => {
    try {
      await res?.undo?.();
      await undoRotation?.();
      toast({ text: session.status === "missed" ? "Skip undone" : "Log undone" });
    } catch (err) {
      toast({ text: errorText(ctx.coach, err), kind: "error" });
    }
  };
  const prCount = session.prs?.length || 0;
  const text = toastText || (session.status === "missed"
    ? `Skipped · ${session.title}`
    : `${view ? "Logged" : "Saved"} · ${session.title}${prCount ? ` · ${plural(prCount, "PR")}` : ""}`);
  const actions = [{ label: "Undo", fn: undo }];
  if (view) {
    actions.push({
      label: "View in History",
      fn: () => {
        ctx.nav("history");
        ctx.history?.openSession(session.id);
      },
    });
  }
  actionToast({ text, actions });
  return session;
}

/**
 * One tap "Done as planned": saves the prefilled draft as is. Resolves null (nothing saved) when the draft is
 * missing something (see missingForDirectSave): the caller opens the form instead.
 * @param {any} ctx
 * @param {any} plan
 * @param {any} workout
 * @returns {Promise<any|null>}
 */
export async function logAsPlanned(ctx, plan, workout) {
  const draft = workoutDraft(ctx, plan, workout);
  if (missingForDirectSave(draft).length) return null;
  return saveLoggedSession(ctx, draft, { view: true });
}

/**
 * Skip a plan workout: logs a `missed` session with the reason and moves "Up next" on (the rotation counts the
 * workout as handled). Undo removes both.
 * @param {any} ctx
 * @param {any} plan
 * @param {any} workout
 * @param {{ reason?: string, notes?: string }} [opts]
 * @returns {Promise<any>}
 */
export async function skipWorkout(ctx, plan, workout, { reason = "other", notes = "" } = {}) {
  return saveLoggedSession(ctx, {
    date: ctx.today(),
    planId: plan.id,
    workoutId: workout.id,
    title: workout.title || workout.id,
    type: workout.type,
    status: "missed",
    missedReason: MISSED_REASONS.some(([v]) => v === reason) ? reason : "other",
    notes: String(notes || "").trim(),
    createdBy: "manual",
  }, { view: true });
}
