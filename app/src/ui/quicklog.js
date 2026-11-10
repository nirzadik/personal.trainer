// Owner: Agent D (v2 feedback + review: Agent F). Logging planned workouts from the Plan tab: "Start" (live sheet, workout.js) /
// "Done as planned" / "Skip". Shared by plan.js (card actions) and history.js (the prefilled quick-log form). Keeps
// the session log and the rotation consistent, and every write comes with an Undo that reverts both.
// v2: the Easy / Fine / Hard feedback control, and the post-workout review the save tap starts (coach.reviewWorkout).

import { h, safe, toast, plural, errorText, button, createTicker, fmtElapsed, replaceChildren, placeToastHost } from "./components.js";

/** Exercise feedback values and labels (Session.strength[].feedback, CONTRACT-v2). */
export const FEEDBACK_OPTIONS = [
  ["easy", "Easy"],
  ["fine", "Fine"],
  ["hard", "Hard"],
];

/**
 * Optional 3-way Easy / Fine / Hard control (none selected by default; tapping the selected one clears it).
 * @param {{ id: string, label: string, value?: string|null, onChange: (v: string|null) => void }} opts
 * @returns {HTMLElement}
 */
export function feedbackControl({ id, label, value = null, onChange }) {
  let current = FEEDBACK_OPTIONS.some(([v]) => v === value) ? value : null;
  const wrap = h("div", { class: "fb-row" });
  const group = h("div", { class: "segmented fb-seg", role: "group", "aria-label": `${label}: how did it feel?`, id });
  const btns = FEEDBACK_OPTIONS.map(([v, text]) => h("button", {
    type: "button",
    class: `seg fb-${v}`,
    id: `${id}-${v}`,
    "aria-pressed": String(current === v),
    onClick: () => {
      current = current === v ? null : v;
      btns.forEach((b, i) => b.setAttribute("aria-pressed", String(FEEDBACK_OPTIONS[i][0] === current)));
      onChange?.(current);
    },
  }, text));
  group.append(...btns);
  wrap.append(h("span", { class: "fb-label", "aria-hidden": "true" }, "Felt"), group);
  return wrap;
}

/** Short chip label for a feedback value ("Hard"), or "". */
export function feedbackLabel(v) {
  return FEEDBACK_OPTIONS.find(([x]) => x === v)?.[1] || "";
}

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
  const host = placeToastHost();
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
  // Undo: take it back out of the CURRENT rotation (core.unmarkWorkoutDone), so workouts logged since stay done.
  return async () => {
    const st = ctx.data.state;
    if (st?.rotation?.planId !== plan.id) return;
    await store.state.update({ rotation: core.unmarkWorkoutDone(st, plan, workoutId) });
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
 * With `review` (a Plan quick-log save) and the "Review after each workout" setting on, the save tap also starts
 * the coach's post-workout review (startWorkoutReview).
 * @param {{ view?: boolean, toastText?: string, review?: boolean }} [opts]
 * @returns {Promise<any>} the stored session
 */
export async function saveLoggedSession(ctx, input, { view = false, toastText, review = false } = {}) {
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
  if (res?.id) session = { ...session, ...(res.session || {}), id: res.id }; // the store assigns the id
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
  if (review && session.status !== "missed" && session.workoutId && reviewEnabled(ctx)) startWorkoutReview(ctx, session);
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
  return saveLoggedSession(ctx, draft, { view: true, review: true });
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

// ---------------------------------------------------------------------------------------------
// Post-workout review (v2). Started only from a save tap; one call at a time; never retried by code.

/** @type {null | { ctl: AbortController, t0: number, title: string, ticker: any }} */
let reviewJob = null;

/**
 * Is "Review after each workout" on (state.settings.reviewAfterWorkout, default true)?
 * @param {any} ctx
 * @returns {boolean}
 */
export function reviewEnabled(ctx) {
  return ctx.data.state?.settings?.reviewAfterWorkout !== false;
}

/** @returns {boolean} true while a post-workout review is running */
export function reviewBusy() {
  return Boolean(reviewJob);
}

/**
 * Run coach.reviewWorkout for a just-saved session, with a status strip (elapsed time + Stop) shown on every tab.
 * The review lands in the Coach chat; a toast says so (with "Open Coach" when elsewhere). Errors show a toast with a
 * manual Retry. Does nothing when the coach is unavailable or a review is already running.
 * @param {any} ctx
 * @param {{ id: string, title?: string }} session
 * @returns {boolean} started
 */
export function startWorkoutReview(ctx, session) {
  const { coach } = ctx;
  if (!coach || typeof coach.reviewWorkout !== "function" || !session?.id || reviewJob) return false;
  if (ctx.coachStatus().available === false) return false;
  const title = session.title || "your workout";
  const ctl = new AbortController();
  const ticker = createTicker(() => renderReviewStrip());
  reviewJob = { ctl, t0: Date.now(), title, ticker };
  ticker.start();
  Promise.resolve()
    .then(() => coach.reviewWorkout(session.id, { signal: ctl.signal }))
    .then((res) => finish(res?.error || null, res))
    .catch((err) => finish(err?.code || "upstream_error", null));

  function finish(code, res) {
    ticker.stop();
    reviewJob = null;
    renderReviewStrip();
    const changes = (res?.actions || []).filter((a) => a.type === "plan_change").length;
    if (code === "cancelled") {
      toast({ text: changes ? `Review stopped · ${plural(changes, "plan change")} kept` : "Review stopped" });
    } else if (code) {
      toast({ text: `Review failed: ${errorText(coach, code)}`, kind: "error", timeout: 10000, action: { label: "Retry", fn: () => startWorkoutReview(ctx, session) } });
    } else {
      const text = changes ? `Coach reviewed ${title} · ${plural(changes, "plan change")}` : `Coach reviewed ${title}`;
      toast({ text, timeout: 9000, action: ctx.route !== "coach" ? { label: "Open Coach", fn: () => ctx.nav("coach") } : null });
    }
  }
  return true;
}

function renderReviewStrip() {
  let host = document.getElementById("review-host");
  if (!host) {
    host = h("div", { id: "review-host", class: "rv-host", "aria-live": "polite" });
    document.body.appendChild(host);
  }
  document.documentElement.classList.toggle("rv-on", Boolean(reviewJob));
  if (!reviewJob) {
    replaceChildren(host);
    return;
  }
  const job = reviewJob;
  const elapsed = fmtElapsed(Date.now() - job.t0);
  const existing = host.querySelector(".rv-strip");
  if (existing) {
    existing.querySelector(".rv-time").textContent = elapsed;
    return;
  }
  replaceChildren(host, h("div", { class: "rv-strip", role: "status", id: "review-status" },
    h("span", { class: "pulse", "aria-hidden": "true" }),
    h("span", { class: "rv-text" }, "Coach is reviewing your workout"),
    h("span", { class: "rv-time num", "aria-label": "elapsed" }, elapsed),
    button({ id: "review-stop", label: "Stop", icon: "stop", kind: "stop", small: true, onClick: () => job.ctl.abort() }),
  ));
}
