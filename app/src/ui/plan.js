// Owner: Agent D. Plan tab: agreed plan in rotation order (Done / Up next / Later) with targets from
// core.nextTarget, Start (live workout sheet, Resume / Discard while in progress) / Done as planned / Skip per workout (logged sessions link to History),
// the draft with validation chips and Approve / Ask for changes / Regenerate, and plan generation with an
// elapsed timer and Stop. Styles: the "plan quick-log" section of styles.css.
// v2 (Agent S): a Swap control on every strength and conditioning movement (agreed plan and draft) that
// opens a sheet of swap options + an equipment-filtered catalog search; styles in "v2: swap".

import {
  h, icon, button, append, replaceChildren, pill, typePill, emptyState, inlineConfirm, toast, openSheet,
  createTicker, fmtElapsed, fmtWeekRange, fmtKg, fmtRest, fmtPace, fmtKm, fmtRelDay, plural, safe, errorText, TYPE_LABEL,
} from "./components.js";
import { exerciseName, prettifyId, equipmentSet } from "./ops.js";
import { swapOptions, applySwap, swappableItems } from "../swap.js";
import { openWorkoutLog } from "./history.js";
import { MISSED_REASONS, findLoggedSession, logAsPlanned, missingForDirectSave, skipWorkout, workoutDraft } from "./quicklog.js";
import { LIVE_EVENT, liveDraftFor, liveElapsedText, discardLiveDraft } from "./workout.js";

const SVG_NS = "http://www.w3.org/2000/svg";

/**
 * Two opposing arrows (the Swap icon; components.js has none).
 * @param {number} [size]
 * @returns {SVGSVGElement}
 */
function swapIcon(size = 18) {
  const svg = document.createElementNS(SVG_NS, "svg");
  for (const [k, v] of Object.entries({ viewBox: "0 0 24 24", width: size, height: size, fill: "none", stroke: "currentColor", "stroke-width": "2", "stroke-linecap": "round", "stroke-linejoin": "round", "aria-hidden": "true", focusable: "false", class: "icon" })) svg.setAttribute(k, String(v));
  for (const d of ["M4 8h14M14 4l4 4-4 4", "M20 16H6M10 12l-4 4 4 4"]) {
    const path = document.createElementNS(SVG_NS, "path");
    path.setAttribute("d", d);
    svg.appendChild(path);
  }
  return svg;
}

/** Text longer than this gets a one-line clamp that expands on tap. */
const CLAMP_CHARS = 38;

/**
 * One-line text (ellipsis via .pl-line) that expands on tap when long.
 * @param {string} text
 * @param {string} cls
 * @param {Node} [lead] optional leading node (e.g. a bold label)
 * @returns {HTMLElement}
 */
function lineClamp(text, cls, lead = null) {
  const t = String(text || "");
  if (t.length <= CLAMP_CHARS) return h("p", { class: cls }, lead, t);
  const el = h("p", { class: [cls, "pl-line"], role: "button", tabindex: "0", "aria-expanded": "false", title: t }, lead, t);
  const toggle = () => el.setAttribute("aria-expanded", String(el.classList.toggle("is-open")));
  el.addEventListener("click", toggle);
  el.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      toggle();
    }
  });
  return el;
}

const STAGE_COPY = {
  context: "Gathering your profile and history",
  prompt: "Gathering your profile and history",
  generating: "Writing the plan",
  sampling: "Writing the plan",
  validating: "Checking volume, equipment and run ramp",
  repair: "Fixing what the checker flagged",
  repairing: "Fixing what the checker flagged",
  saving: "Saving the draft",
};

/**
 * One small line describing a failed plan call, for diagnosis: "invalid_json · 4:12 · 18,240 chars streamed ·
 * complex · <platform message>".
 * @param {{ code: string, message?: string, elapsedMs?: number, streamedChars?: number, tier?: string|null, at?: string }} d
 * @returns {string}
 */
export function planErrorDetail(d) {
  if (!d || typeof d !== "object") return "";
  const parts = [d.code];
  if (Number.isFinite(d.elapsedMs)) parts.push(fmtElapsed(d.elapsedMs));
  if (Number.isFinite(d.streamedChars)) parts.push(d.streamedChars > 0 ? `${d.streamedChars.toLocaleString("en-US")} chars streamed` : "nothing streamed");
  if (d.tier) parts.push(`${d.tier} model`);
  const msg = String(d.message || "").trim();
  if (msg && msg !== d.code) parts.push(msg.length > 300 ? `${msg.slice(0, 299)}…` : msg);
  return parts.filter(Boolean).join(" · ");
}

/**
 * Mount the Plan tab.
 * @param {HTMLElement} el
 * @param {any} ctx
 * @returns {{ show: () => void, teardown: () => void }}
 */
export function mountPlan(el, ctx) {
  const { store, coach } = ctx;
  const unsubs = [];
  const expanded = new Set(); // `${planId}:${workoutId}`
  const touched = new Set(); // plans whose expansion the user changed
  const skipping = new Map(); // `${planId}:${workoutId}` → { reason, notes } while the Skip panel is open
  const busy = new Set(); // workouts with a one-tap save in flight
  let swapping = false; // a swap write is in flight
  let job = null; // { kind, ctl, ticker, t0, progress, tier } while running; { kind, error, detail, cutOff, retry, retryFaster } after a failure
  let dismissedErrorAt = null; // state.lastPlanError.at the owner dismissed in this view (the db record is kept)
  let showAllIssues = false;

  const sub = h("p", { class: "view-sub num" });
  const head = h("div", { class: "view-head" }, h("div", { class: "view-head-text" }, h("h1", { class: "view-title" }, "Plan"), sub));
  const jobEl = h("div", { class: "gen-host" });
  const draftEl = h("div", { class: "draft-host" });
  const agreedEl = h("div", { class: "agreed-host" });
  append(el, [head, jobEl, draftEl, agreedEl]);

  unsubs.push(ctx.on(["plans", "state", "sessions", "profile"], () => render()));
  // live (in-progress) workouts: re-render when a draft changes; keep the "Resume · 12 min" labels current
  const onLive = () => render();
  window.addEventListener(LIVE_EVENT, onLive);
  unsubs.push(() => window.removeEventListener(LIVE_EVENT, onLive));
  const liveTimer = setInterval(() => {
    for (const elx of el.querySelectorAll("[data-live-key]")) {
      const [p, w] = elx.dataset.liveKey.split("|");
      const d = liveDraftFor(p, w);
      if (d) elx.textContent = liveElapsedText(d);
    }
  }, 30000);
  unsubs.push(() => clearInterval(liveTimer));

  function coachReady() {
    return Boolean(coach) && ctx.coachStatus().available !== false;
  }

  // ---- generation ----------------------------------------------------------------------------
  async function generate({ kind = "generate", instruction = "", fromRequest = false, modelTier } = {}) {
    if (job && !job.error) return;
    if (!coachReady()) {
      toast({ text: "The coach isn't available in this view.", kind: "error" });
      return;
    }
    ctx.nav("plan");
    const ctl = new AbortController();
    const ticker = createTicker(() => renderJob());
    job = { kind, ctl, ticker, t0: Date.now(), progress: "", error: null, retry: null, tier: modelTier || null };
    renderJob();
    render();
    ticker.start();
    window.scrollTo({ top: 0 });
    const onProgress = (p) => {
      if (!job) return;
      job.progress = typeof p === "string" ? p : p?.label || p?.message || STAGE_COPY[p?.stage] || STAGE_COPY[p?.phase] || job.progress;
      renderJob();
    };
    try {
      const opts = { signal: ctl.signal, onProgress, ...(modelTier ? { modelTier } : {}) };
      const res = kind === "revise" && ctx.draftPlan()
        ? await coach.reviseDraft(instruction, opts)
        : await coach.generatePlan({ instruction, ...opts });
      ticker.stop();
      job = null;
      if (fromRequest || ctx.data.state?.pendingPlanRequest) {
        Promise.resolve(safe(() => store.state.update({ pendingPlanRequest: null }), null)).catch(() => {});
      }
      const errs = res?.validation?.errors?.length || 0;
      toast({ text: errs ? `Draft ready · ${plural(errs, "issue")} to review` : "Draft ready to review" });
    } catch (err) {
      ticker.stop();
      if (err?.code === "cancelled") job = null;
      else {
        const again = (tier) => { job = null; generate({ kind, instruction, fromRequest, ...(tier ? { modelTier: tier } : {}) }); };
        job = {
          kind, error: err?.code || "upstream_error", detail: err?.detail || null, cutOff: Boolean(err?.cutOff ?? err?.detail?.cutOff),
          tier: modelTier || null, retry: () => again(modelTier), retryFaster: () => again("default"),
        };
        dismissedErrorAt = err?.detail?.at ?? null; // this view shows it already; a reload shows the stored copy
      }
    }
    renderJob();
    render();
  }

  function renderJob() {
    if (!job) {
      const last = storedPlanError();
      // after a reload: the stored failure (a revise needs its instruction again, so it only offers Dismiss)
      const regen = last?.kind !== "revise";
      replaceChildren(jobEl, last ? errorPanel({
        kind: regen ? "generate" : "revise", error: last.code, detail: last, cutOff: Boolean(last.cutOff),
        retry: regen ? () => generate({ kind: "generate" }) : null,
        retryFaster: regen ? () => generate({ kind: "generate", modelTier: "default" }) : null,
      }) : null);
      return;
    }
    if (job.error) {
      replaceChildren(jobEl, errorPanel(job));
      return;
    }
    const elapsed = Date.now() - job.t0;
    replaceChildren(jobEl, h("div", { class: "gen-panel", role: "status", "aria-live": "polite" },
      h("div", { class: "gen-top" },
        h("div", {},
          h("p", { class: "gen-title" }, job.kind === "revise" ? "Revising the draft" : "Building next week"),
          h("p", { class: "gen-progress" }, job.progress || "Thinking…"),
        ),
        h("span", { class: "gen-timer num", "aria-label": `elapsed ${fmtElapsed(elapsed)}` }, fmtElapsed(elapsed)),
      ),
      h("div", { class: "gen-bar", "aria-hidden": "true" }, h("span", {})),
      h("p", { class: "gen-note" }, job.tier === "default"
        ? "Using the faster model. This usually takes under a minute. You can switch tabs while it works."
        : "This uses the most capable model and can take 1–3 minutes. You can switch tabs while it works."),
      button({ id: "gen-stop", label: "Stop", icon: "stop", kind: "stop", onClick: () => job?.ctl?.abort() }),
    ));
  }

  /** state.lastPlanError worth showing after a reload: not dismissed here, recent, and no draft saved since. */
  function storedPlanError() {
    const e = ctx.data.state?.lastPlanError;
    if (!e || typeof e !== "object" || !e.code || e.dismissed || e.at === dismissedErrorAt) return null;
    const at = Date.parse(e.at);
    if (!Number.isFinite(at) || Date.now() - at > 24 * 3600 * 1000) return null;
    const draft = ctx.draftPlan();
    if (draft && Date.parse(draft.createdAt) > at) return null;
    return e;
  }

  /** The failed-generation panel: code-specific copy and buttons, plus the platform detail in small text. */
  function errorPanel(j) {
    const code = j.error;
    const d = j.detail;
    const cutOff = j.cutOff || code === "invalid_json";
    const fasterTried = (d?.tier || j.tier) === "default";
    let text;
    let actions;
    if (code === "rate_limited") {
      text = "You've hit your Claude usage limit. Try again after it resets.";
      actions = [];
    } else if (cutOff) {
      text = "The plan was cut off before it finished.";
      actions = [
        j.retry ? button({ id: "gen-retry", label: "Try again", icon: "refresh", kind: "secondary", small: true, onClick: j.retry }) : null,
        fasterTried || !j.retryFaster ? null : button({ id: "gen-retry-fast", label: "Try with the faster model", icon: "bolt", kind: "secondary", small: true, onClick: j.retryFaster }),
      ];
    } else {
      text = errorText(coach, code);
      actions = [j.retry ? button({ id: "gen-retry", label: "Try again", icon: "refresh", kind: "secondary", small: true, onClick: j.retry }) : null];
    }
    const dismiss = () => {
      const stored = ctx.data.state?.lastPlanError;
      dismissedErrorAt = stored?.at ?? dismissedErrorAt;
      if (stored && !stored.dismissed) Promise.resolve(safe(() => store?.state?.update({ lastPlanError: { dismissed: true } }), null)).catch(() => {});
      job = null;
      renderJob();
      render();
    };
    return h("div", { class: "gen-panel is-error", role: "alert" },
      h("p", { class: "gen-title" }, j.kind === "revise" ? "The revision didn't finish" : "The plan didn't finish"),
      h("div", { class: "error-block" },
        h("div", { class: "error-line" }, icon("alert", { size: 18 }), h("span", { class: "error-text" }, text)),
        d ? h("p", { class: "error-detail num", id: "gen-error-detail" }, planErrorDetail(d)) : null,
      ),
      h("div", { class: "gen-actions" },
        ...actions.filter(Boolean),
        button({ id: "gen-dismiss", label: "Dismiss", kind: "ghost", small: true, onClick: dismiss }),
      ),
    );
  }

  ctx.plan = {
    generate,
    isBusy: () => Boolean(job && !job.error),
  };

  // ---- render --------------------------------------------------------------------------------
  function render() {
    if (!job) renderJob(); // a stored state.lastPlanError (after a reload) appears once state has loaded
    if (!store) {
      sub.textContent = "";
      replaceChildren(draftEl);
      replaceChildren(agreedEl, emptyState({ title: "Your plan needs an account", text: "Sign in to Claude to build and follow a weekly plan.", icon: "plan" }));
      return;
    }
    if (!ctx.data.loaded.plans || !ctx.data.loaded.profile || !ctx.data.loaded.state) {
      sub.textContent = "Loading…";
      replaceChildren(agreedEl, h("div", { class: "skeleton-list", "aria-hidden": "true" }, [0, 1, 2].map(() => h("div", { class: "skeleton-card" }))));
      return;
    }
    const agreed = ctx.agreedPlan();
    const draft = ctx.draftPlan();
    const onboarded = Boolean(ctx.data.profile?.onboarded);
    sub.textContent = agreed ? `Week of ${fmtWeekRange(agreed.weekStart)}` : draft ? "Draft waiting for you" : "";

    replaceChildren(draftEl, draft ? draftSection(draft) : null);

    if (!agreed) {
      if (draft) {
        replaceChildren(agreedEl);
        return;
      }
      if (!onboarded) {
        replaceChildren(agreedEl, emptyState({
          title: "No plan yet",
          text: "Finish setting up with your coach first. Your plan is built from your goals, schedule and equipment.",
          icon: "plan",
          actions: [button({ id: "plan-go-coach", label: "Go to Coach", icon: "arrow", kind: "primary", onClick: () => ctx.nav("coach") })],
        }));
        return;
      }
      replaceChildren(agreedEl, emptyState({
        title: "No plan yet",
        text: "Generate your first week. The coach builds it from your profile, then you review and approve it.",
        icon: "plan",
        actions: [generateButton("Generate first week")],
      }));
      return;
    }
    replaceChildren(agreedEl, agreedSection(agreed, { showGenerate: !draft }));
  }

  function generateButton(label = "Generate next week") {
    const busy = Boolean(job && !job.error);
    return button({
      id: "plan-generate",
      label: busy ? "Generating…" : label,
      icon: "bolt",
      kind: "primary",
      class: "btn-lg btn-block",
      disabled: busy || !coachReady(),
      onClick: () => generate({ kind: "generate", instruction: ctx.data.state?.pendingPlanRequest?.kind === "generate" ? ctx.data.state.pendingPlanRequest.instruction || "" : "" }),
    });
  }

  function rotationOf(plan) {
    const st = ctx.data.state;
    const done = st?.rotation?.planId === plan.id ? st.rotation.done || [] : [];
    let next = safe(() => ctx.core.nextWorkout(plan, st), undefined);
    if (next === undefined) next = (plan.workouts || []).find((w) => !done.includes(w.id)) || null;
    if (st?.rotation?.planId !== plan.id) next = plan.workouts?.[0] || null;
    return { done, next };
  }

  function agreedSection(plan, { showGenerate }) {
    const { done, next } = rotationOf(plan);
    const workouts = plan.workouts || [];
    const doneCount = workouts.filter((w) => done.includes(w.id)).length;
    const complete = workouts.length > 0 && doneCount >= workouts.length;
    if (!touched.has(plan.id) && ctx.data.loaded.state) {
      // auto-expand only the current "Up next" until the user opens or closes cards themselves
      for (const k of [...expanded]) if (k.startsWith(`${plan.id}:`)) expanded.delete(k);
      if (next) expanded.add(`${plan.id}:${next.id}`);
    }

    const progress = h("div", { class: "rotation", role: "img", "aria-label": `${doneCount} of ${workouts.length} workouts done` },
      workouts.map((w) => h("span", { class: ["rot-seg", done.includes(w.id) && "is-done", next?.id === w.id && "is-next"] })));

    return h("section", { class: "plan-agreed", "aria-label": "This week's plan" },
      complete ? h("div", { class: "banner banner-ok" },
        icon("check", { size: 20 }),
        h("div", {}, h("strong", {}, "Week complete"), h("span", {}, ` All ${workouts.length} workouts done. Generate next week when you're ready.`)),
      ) : null,
      h("header", { class: "plan-head" },
        h("p", { class: "eyebrow" }, "Agreed plan"),
        h("h2", { class: ["plan-focus", String(plan.focus || "").length > 48 && "is-long"] }, plan.focus || "This week"),
        h("p", { class: "plan-meta num" }, `${doneCount} of ${plural(workouts.length, "workout")} done${next && !complete ? ` · Up next: ${next.title}` : ""}`),
        progress,
      ),
      plan.rationale ? h("details", { class: "rationale", id: `rationale-${plan.id}` },
        h("summary", {}, h("span", {}, "Why this plan"), icon("chevron", { size: 18 })),
        h("p", {}, plan.rationale),
      ) : null,
      targetsRow(plan),
      h("ol", { class: "workouts" }, workouts.map((w, i) => {
        const logged = done.includes(w.id) ? findLoggedSession(ctx, plan, w.id) : null;
        return h("li", {}, workoutCard(plan, w, i, {
          status: done.includes(w.id) ? (logged?.status === "missed" ? "skipped" : "done") : next?.id === w.id ? "next" : "later",
          withTargets: true,
          logged,
        }));
      })),
      showGenerate ? h("div", { class: "plan-cta" }, generateButton(complete ? "Generate next week" : "Generate next week"),
        h("p", { class: "field-hint" }, "Uses the most capable model. You'll review the draft before it replaces this plan.")) : null,
    );
  }

  function targetsRow(plan) {
    const t = plan.weeklyTargets || {};
    const sets = Object.entries(t.strengthSetsPerMuscle || {}).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]);
    const items = [];
    if (t.runKm) items.push(["Run", fmtKm(t.runKm)]);
    if (t.conditioningSessions) items.push(["HIIT", plural(t.conditioningSessions, "session")]);
    const strengthCount = (plan.workouts || []).filter((w) => w.type === "strength" || w.type === "hybrid").length;
    if (strengthCount) items.push(["Strength", plural(strengthCount, "day")]);
    if (!items.length && !sets.length) return null;
    return h("div", { class: "targets" },
      items.length ? h("dl", { class: "facts facts-inline" }, items.map(([k, v]) => h("div", { class: "fact" }, h("dt", {}, k), h("dd", { class: "num" }, v)))) : null,
      sets.length ? h("details", { class: "volume" },
        h("summary", {}, h("span", {}, "Weekly sets per muscle"), icon("chevron", { size: 18 })),
        h("ul", { class: "volume-list" }, sets.map(([m, v]) => h("li", { class: "volume-row" },
          h("span", { class: "volume-name" }, prettifyId(m)),
          h("span", { class: "volume-bar", "aria-hidden": "true" }, h("span", { style: { width: `${Math.min(100, (v / 22) * 100)}%` } })),
          h("span", { class: "volume-val num" }, fmtKg(v)),
        ))),
      ) : null,
    );
  }

  function workoutCard(plan, w, idx, { status, withTargets, logged = null }) {
    const key = `${plan.id}:${w.id}`;
    const isOpen = expanded.has(key);
    const bodyId = `wbody-${plan.id}-${w.id}`.replace(/[^\w-]/g, "_");
    const statusPill = status === "done" ? h("span", { class: "pill pill-ok" }, icon("check", { size: 14 }), "Done")
      : status === "skipped" ? pill("Skipped", "neutral")
      : status === "next" ? pill("Up next", "next")
      : status === "later" ? pill("Later", "neutral") : null;
    // Logging actions (agreed plan only): visible under the head for Up next / Done / Skipped, inside the body for Later.
    const canLog = withTargets && Boolean(store) && plan.status === "agreed";
    const actionsInBody = canLog && status === "later" && !skipping.has(key) && !liveDraftFor(plan.id, w.id);
    const actions = () => (canLog ? workoutActions(plan, w, idx, status, logged) : null);
    const loc = (ctx.data.profile?.equipment?.locations || []).find((l) => l.id === w.locationId)?.name;
    const meta = [TYPE_LABEL[w.type] || prettifyId(w.type), w.estMinutes ? `${w.estMinutes} min` : null, loc].filter(Boolean).join(" · ");
    const body = h("div", { class: "workout-body", id: bodyId, hidden: !isOpen });
    const sw = swapContext(plan, w, status);
    const fill = () => fillBody(body, w, withTargets, actionsInBody ? actions() : null, sw);
    if (isOpen) fill();
    const toggle = h("button", {
      type: "button",
      class: "workout-head",
      id: `whead-${bodyId}`,
      "aria-expanded": String(isOpen),
      "aria-controls": bodyId,
      onClick: () => {
        touched.add(plan.id);
        if (expanded.has(key)) expanded.delete(key);
        else expanded.add(key);
        const open = expanded.has(key);
        toggle.setAttribute("aria-expanded", String(open));
        body.hidden = !open;
        if (open && !body.childNodes.length) fill();
      },
    },
      h("span", { class: "w-index num", "aria-hidden": "true" }, String(idx + 1)),
      h("span", { class: "w-text" },
        h("span", { class: "w-title" }, w.title || w.id),
        h("span", { class: "w-meta" }, meta),
      ),
      statusPill,
      h("span", { class: "w-chev", "aria-hidden": "true" }, icon("chevron", { size: 20 })),
    );
    return h("article", { class: ["workout-card", `is-${status || "draft"}`], id: `wcard-${bodyId}` }, toggle, canLog && !actionsInBody ? actions() : null, body);
  }

  function fillBody(body, w, withTargets, footer = null, sw = null) {
    replaceChildren(body,
      w.intent ? lineClamp(w.intent, "w-intent") : null,
      (w.blocks || []).map((b) => blockView(b, withTargets, sw)),
      footer,
    );
  }

  // ---- swap (v2) -------------------------------------------------------------------------------
  /**
   * Swap state for one workout card: null when swapping isn't allowed (no store, archived plan, or a
   * workout already done / skipped). Otherwise maps each swappable item to its flat index.
   */
  function swapContext(plan, w, status) {
    if (!store || !["draft", "agreed"].includes(plan.status)) return null;
    if (status === "done" || status === "skipped") return null;
    const index = new Map(swappableItems(w).map((x) => [x.item, x.itemIndex]));
    return { plan, w, index };
  }

  function swapControl(sw, it) {
    const idx = sw?.index.get(it);
    if (idx == null) return null;
    const name = it.name || exerciseName(ctx.catalog, it.exerciseId);
    const draftBusy = sw.plan.status === "draft" && Boolean(job && !job.error);
    const b = h("button", {
      type: "button",
      class: "btn btn-secondary btn-sm sw-btn",
      id: swapButtonId(sw.plan, sw.w, idx),
      "aria-label": `Swap ${name}`,
      "aria-haspopup": "dialog",
      disabled: swapping || draftBusy,
      title: draftBusy ? "Wait for the revision to finish" : null,
      onClick: () => openSwapSheet(sw.plan, sw.w, idx),
    }, swapIcon(18), h("span", {}, "Swap"));
    return b;
  }

  function swapButtonId(plan, w, idx) {
    return `sw-${plan.id}-${w.id}-${idx}`.replace(/[^\w-]/g, "_");
  }

  function swappedMark(it) {
    if (!it?.swappedFrom) return null;
    const was = exerciseName(ctx.catalog, it.swappedFrom);
    return h("span", { class: "sw-mark", title: `Swapped from ${was}` }, "Swapped", h("span", { class: "visually-hidden" }, ` from ${was}`));
  }

  function prescription(it, kind) {
    if (kind === "strength") return [`${it.sets} × ${it.reps}`, it.targetRir != null ? `@ RIR ${it.targetRir}` : null].filter(Boolean).join(" ");
    return [it.reps ? `${it.reps} reps` : null, it.calories ? `${it.calories} cal` : null, it.distanceM ? `${it.distanceM} m` : null, it.durationSec ? `${it.durationSec} s` : null].filter(Boolean).join(" · ");
  }

  function openSwapSheet(plan, w, idx) {
    const slot = swappableItems(w)[idx];
    if (!slot) return;
    const it = slot.item;
    const name = it.name || exerciseName(ctx.catalog, it.exerciseId);
    const returnFocus = swapButtonId(plan, w, idx);
    const profile = ctx.data.profile;
    const options = safe(() => swapOptions(it, { profile, plan, workoutId: w.id, kind: slot.kind, core: ctx.core, catalog: ctx.catalog, limit: 8 }), []) || [];
    const eq = equipmentSet(ctx, w.locationId);
    const mods = slot.kind === "strength" ? ["strength"] : ["conditioning", "cardio"];
    const inWorkout = new Set(swappableItems(w).map((x) => x.item?.exerciseId).filter(Boolean));
    let chosen = false;

    openSheet({
      title: `Swap ${name}`,
      id: "swap-sheet",
      onClose: () => { if (!chosen) requestAnimationFrame(() => document.getElementById(returnFocus)?.focus()); },
      build: (api) => {
        const pick = (exerciseId) => {
          if (chosen) return;
          chosen = true;
          api.close();
          doSwap(plan.id, w.id, idx, exerciseId, returnFocus);
        };
        const optionButton = (o, i, prefix) => h("li", {}, h("button", {
          type: "button",
          class: ["picker-item", "sw-option", o.caution && "is-caution"],
          id: `${prefix}-${i}`,
          onClick: () => pick(o.exerciseId),
        },
          h("span", { class: "sw-opt-text" },
            h("span", { class: "picker-name" }, o.name),
            h("span", { class: "sw-reason" }, o.reason),
          ),
          h("span", { class: "sw-opt-go", "aria-hidden": "true" }, icon("arrow", { size: 18 })),
        ));

        const rx = prescription(it, slot.kind);
        const keep = h("p", { class: "sw-keep" },
          rx ? h("span", { class: "num" }, `Keeps ${rx}. `) : null,
          slot.kind === "strength" ? "The target load resets, so pick a load on your first set." : "Check the amount suits the new movement.",
        );

        const suggested = options.length
          ? h("ul", { class: "picker-results sw-list", id: "sw-suggested", "aria-label": "Suggested swaps" }, options.map((o, i) => optionButton(o, i, "sw-opt")))
          : h("p", { class: "picker-empty" }, "No close match with your equipment. Search the full list below.");

        const results = h("ul", { class: "picker-results sw-list", id: "sw-results", "aria-label": "Search results", "aria-live": "polite" });
        const search = h("input", {
          id: "sw-search",
          class: "input",
          type: "search",
          placeholder: slot.kind === "strength" ? "Search: press, row, lunge…" : "Search: bike, burpee, wall ball…",
          autocomplete: "off",
          enterkeyhint: "search",
          "aria-controls": "sw-results",
          onInput: () => fill(),
          onKeydown: (e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              results.querySelector("button")?.click();
            }
          },
        });
        function fill() {
          const q = search.value.trim();
          if (!q) {
            replaceChildren(results);
            return;
          }
          const found = (safe(() => ctx.catalog.searchExercises(q, { equipment: eq.size ? eq : null, modality: mods, limit: 30 }), []) || [])
            .filter((e) => e.id !== it.exerciseId && !inWorkout.has(e.id))
            .filter((e) => !eq.size || safe(() => ctx.core.exerciseAllowed(e.id, eq).ok, true))
            .slice(0, 12);
          const items = found.map((e, i) => optionButton({
            exerciseId: e.id,
            name: e.name,
            reason: [(e.primary || []).slice(0, 2).map(prettifyId).join(", "), eq.size ? "your equipment" : null].filter(Boolean).join(" · "),
          }, i, "sw-hit"));
          replaceChildren(results, items.length ? items : h("li", { class: "picker-empty" }, eq.size ? "No match with your equipment." : "No match."));
        }
        const locName = (profile?.equipment?.locations || []).find((l) => l.id === (w.locationId || profile?.equipment?.defaultLocationId))?.name;
        return h("div", { class: "sw-sheet" },
          keep,
          h("section", { class: "sw-section", "aria-labelledby": "sw-suggested-title" },
            h("h3", { class: "field-label", id: "sw-suggested-title" }, "Suggested"),
            suggested,
          ),
          h("section", { class: "sw-section" },
            h("label", { class: "field-label", for: "sw-search" }, "Search all exercises"),
            search,
            h("p", { class: "field-hint" }, eq.size ? `Only what your ${locName || "saved"} equipment allows.` : "Tell the coach your equipment to filter this list."),
            results,
          ),
        );
      },
    });
  }

  async function doSwap(planId, workoutId, idx, exerciseId, focusId) {
    if (swapping) return;
    const plan = (ctx.data.plans || []).find((p) => p?.id === planId);
    const w = plan?.workouts?.find((x) => x.id === workoutId);
    const old = w ? swappableItems(w)[idx]?.item : null;
    if (!plan || !old) {
      toast({ text: "That plan changed. Try the swap again.", kind: "error" });
      return;
    }
    const oldName = old.name || exerciseName(ctx.catalog, old.exerciseId);
    let next;
    try {
      next = applySwap(plan, workoutId, idx, exerciseId, { catalog: ctx.catalog });
    } catch (err) {
      toast({ text: err?.message || "Couldn't swap that exercise.", kind: "error" });
      return;
    }
    const newName = swappableItems(next.workouts.find((x) => x.id === workoutId))[idx].item.name;
    const patch = { workouts: next.workouts };
    if (plan.validation != null || plan.status === "draft") {
      const v = safe(() => ctx.core.validatePlan(next, { profile: ctx.data.profile, sessions: ctx.data.sessions, today: ctx.today() }), null);
      if (v) patch.validation = v;
    }
    swapping = true;
    render();
    try {
      const res = await store.plans.update(planId, patch);
      toast({
        text: `Swapped ${oldName} → ${newName}`,
        action: res?.undo ? {
          label: "Undo",
          fn: async () => {
            try {
              await res.undo();
              toast({ text: `Back to ${oldName}` });
            } catch (err) {
              toast({ text: errorText(coach, err), kind: "error" });
            }
          },
        } : undefined,
      });
    } catch (err) {
      toast({ text: errorText(coach, err), kind: "error" });
    } finally {
      swapping = false;
      render();
      setTimeout(() => document.getElementById(focusId)?.focus({ preventScroll: true }), 120);
    }
  }

  // ---- logging from the plan -------------------------------------------------------------------
  function workoutActions(plan, w, idx, status, logged) {
    const key = `${plan.id}:${w.id}`;
    const slug = `${idx + 1}`;
    const skip = skipping.get(key);
    if (skip) return skipPanel(plan, w, key, slug, skip);
    const viewBtn = logged ? button({
      id: `w${slug}-view`,
      label: "View in History",
      icon: "arrow",
      kind: "quiet",
      small: true,
      onClick: () => {
        ctx.nav("history");
        ctx.history?.openSession(logged.id);
      },
    }) : null;
    if (status === "done" || status === "skipped") {
      const what = status === "skipped"
        ? `Skipped${logged?.missedReason ? ` · ${(MISSED_REASONS.find(([v]) => v === logged.missedReason)?.[1] || logged.missedReason).toLowerCase()}` : ""}`
        : logged ? `Logged ${relDay(logged.date)}` : "Done";
      return h("div", { class: "w-actions w-actions-logged" },
        h("span", { class: "w-logged num" }, what),
        viewBtn,
        status === "skipped" ? button({ id: `w${slug}-done`, label: "Log it", icon: "check", kind: "ghost", small: true, onClick: () => openWorkoutLog(ctx, plan, w) }) : null,
      );
    }
    const isBusy = busy.has(key);
    const live = liveDraftFor(plan.id, w.id);
    if (live) {
      const host = h("div", { class: ["w-actions", "w-live", status === "next" && "is-next"] });
      const p = safe(() => ctx.core.liveProgress(live), null);
      replaceChildren(host,
        h("p", { class: "w-live-status num" },
          h("span", { class: "ws-dot", "aria-hidden": "true" }),
          h("span", {}, "In progress · ", h("span", { "data-live-key": `${plan.id}|${w.id}` }, liveElapsedText(live)), p?.total ? ` · ${p.done}/${p.total} done` : null)),
        h("div", { class: "btn-row" },
          button({ id: `w${slug}-resume`, label: "Resume", icon: "play", kind: "primary", small: true, onClick: () => openWorkoutLog(ctx, plan, w) }),
          button({
            id: `w${slug}-discard`,
            label: "Discard",
            kind: "ghost",
            small: true,
            onClick: () => inlineConfirm(host, {
              text: `Discard ${w.title || w.id}? The sets you entered are deleted and nothing is logged.`,
              confirmLabel: "Discard workout",
              idPrefix: `w${slug}-discard`,
              onConfirm: () => {
                discardLiveDraft(plan.id, w.id);
                toast({ text: `Discarded · ${w.title || w.id}` });
              },
            }),
          }),
        ),
      );
      return host;
    }
    return h("div", { class: ["w-actions", status === "next" && "is-next"] },
      button({ id: `w${slug}-done`, label: "Start", icon: "play", kind: status === "next" ? "primary" : "secondary", small: true, disabled: isBusy, onClick: () => openWorkoutLog(ctx, plan, w) }),
      button({ id: `w${slug}-asplanned`, label: "As planned", ariaLabel: `Done exactly as planned: log ${w.title || w.id} with the planned values`, kind: "secondary", small: true, disabled: isBusy, onClick: () => doneAsPlanned(plan, w, key) }),
      button({ id: `w${slug}-skip`, label: "Skip", kind: "ghost", small: true, disabled: isBusy, onClick: () => { skipping.set(key, { reason: "time", notes: "" }); render(); focusLater(`#w${slug}-skip-reason-time`); } }),
    );
  }

  function relDay(iso) {
    const rel = fmtRelDay(iso, ctx.today());
    return /^(Today|Yesterday)$/.test(rel) ? rel.toLowerCase() : rel;
  }

  function focusLater(sel) {
    requestAnimationFrame(() => el.querySelector(sel)?.focus());
  }

  async function doneAsPlanned(plan, w, key) {
    if (busy.has(key)) return;
    const missing = missingForDirectSave(safe(() => workoutDraft(ctx, plan, w), null));
    if (missing.length) {
      openWorkoutLog(ctx, plan, w, { note: `Add ${missing.slice(0, 2).join(" and ")}${missing.length > 2 ? " and more" : ""}: the plan has no number for it yet.` });
      return;
    }
    busy.add(key);
    render();
    try {
      const saved = await logAsPlanned(ctx, plan, w);
      if (!saved) openWorkoutLog(ctx, plan, w);
    } catch (err) {
      toast({ text: errorText(coach, err), kind: "error" });
    } finally {
      busy.delete(key);
      render();
    }
  }

  function skipPanel(plan, w, key, slug, skip) {
    const chips = MISSED_REASONS.map(([v, label]) => h("button", {
      type: "button",
      class: "chip",
      id: `w${slug}-skip-reason-${v}`,
      "aria-pressed": String(skip.reason === v),
      onClick: (e) => {
        skip.reason = v;
        for (const b of e.currentTarget.parentNode.children) b.setAttribute("aria-pressed", String(b === e.currentTarget));
      },
    }, label));
    const confirmBtn = button({
      id: `w${slug}-skip-confirm`,
      label: "Skip workout",
      kind: "secondary",
      small: true,
      onClick: async () => {
        confirmBtn.disabled = true;
        try {
          await skipWorkout(ctx, plan, w, skip);
          skipping.delete(key);
        } catch (err) {
          confirmBtn.disabled = false;
          toast({ text: errorText(coach, err), kind: "error" });
        }
        render();
      },
    });
    return h("div", { class: "w-actions w-skip", role: "group", "aria-label": `Skip ${w.title || w.id}` },
      h("p", { class: "field-label" }, "Why skip it?"),
      h("div", { class: "pl-reasons" }, chips),
      h("input", { id: `w${slug}-skip-note`, class: "input", type: "text", value: skip.notes, placeholder: "Note (optional)", "aria-label": "Skip note", autocomplete: "off", onInput: (e) => { skip.notes = e.target.value; } }),
      h("p", { class: "field-hint" }, "Logged as missed in History. Up next moves on."),
      h("div", { class: "btn-row" },
        confirmBtn,
        button({ id: `w${slug}-skip-cancel`, label: "Cancel", kind: "ghost", small: true, onClick: () => { skipping.delete(key); render(); } }),
      ),
    );
  }

  function blockView(b, withTargets, sw = null) {
    if (b.kind === "strength") return strengthBlock(b, withTargets, sw);
    if (b.kind === "run") return runBlock(b);
    if (b.kind === "conditioning") return condBlock(b, sw);
    const title = { warmup: "Warm-up", cooldown: "Cool-down", mobility: "Mobility" }[b.kind] || prettifyId(b.kind);
    return h("section", { class: `block block-${b.kind}` },
      h("h4", { class: "block-title" }, title, b.minutes ? h("span", { class: "block-sub num" }, `${b.minutes} min`) : null),
      h("ul", { class: "plain-list" }, (b.items || []).map((it) => h("li", {},
        h("span", { class: "li-name" }, it.name || exerciseName(ctx.catalog, it.exerciseId)),
        it.detail ? h("span", { class: "li-detail" }, ` · ${it.detail}`) : null,
      ))),
    );
  }

  function strengthBlock(b, withTargets, sw = null) {
    const groupCounts = {};
    return h("section", { class: "block block-strength" },
      h("h4", { class: "block-title" }, "Strength"),
      h("ul", { class: "lifts" }, (b.items || []).map((it) => {
        let tag = null;
        if (it.supersetGroup) {
          groupCounts[it.supersetGroup] = (groupCounts[it.supersetGroup] || 0) + 1;
          tag = `${it.supersetGroup}${groupCounts[it.supersetGroup]}`;
        }
        const rx = [`${it.sets} × ${it.reps}`, it.targetRir != null ? `@ RIR ${it.targetRir}` : null].filter(Boolean).join(" ");
        const extra = [it.restSec ? `rest ${fmtRest(it.restSec)}` : null, it.tempo ? `tempo ${it.tempo}` : null].filter(Boolean).join(" · ");
        const target = withTargets ? safe(() => ctx.core.nextTarget(ctx.data.sessions, it, { today: ctx.today() }), null) : null;
        const tLoad = target?.loadKg ?? it.loadKg ?? null;
        const tReps = target?.reps ?? null;
        const alts = (it.alternatives || []).map((id) => exerciseName(ctx.catalog, id)).filter(Boolean);
        const swapBtn = swapControl(sw, it);
        return h("li", { class: ["lift", it.swappedFrom && "is-swapped"] },
          h("div", { class: "lift-main" },
            h("p", { class: "lift-name" }, tag ? h("span", { class: "ss-tag" }, tag) : null, it.name || exerciseName(ctx.catalog, it.exerciseId), swappedMark(it)),
            h("p", { class: "lift-rx num" }, rx, extra ? h("span", { class: "lift-extra" }, ` · ${extra}`) : null),
            it.notes ? lineClamp(it.notes, "lift-note lift-cue") : null,
            target?.note && target.note !== it.notes ? lineClamp(target.note, "lift-note") : null,
            alts.length ? h("p", { class: "lift-alts" }, h("span", { class: "alts-label" }, "Alternatives"), ` ${alts.join(", ")}`) : null,
          ),
          withTargets || tLoad != null || swapBtn ? h("div", { class: "lift-side" },
            withTargets || tLoad != null ? h("div", { class: "lift-target", title: target?.reason || "" },
              h("span", { class: "target-label" }, "Target"),
              h("span", { class: "target-val num" }, tLoad != null ? `${fmtKg(tLoad)}` : "—", tLoad != null ? h("span", { class: "target-unit" }, "kg") : null),
              tReps != null ? h("span", { class: "target-reps num" }, `× ${tReps}`) : h("span", { class: "target-reps num" }, tLoad == null ? "pick a load" : `× ${it.reps}`),
            ) : null,
            swapBtn,
          ) : null,
        );
      })),
    );
  }

  function paceRange(t) {
    if (!t) return "";
    const parts = [];
    if (Array.isArray(t.paceSecPerKm) && t.paceSecPerKm.length) {
      const [lo, hi] = t.paceSecPerKm;
      const a = fmtPace(ctx.core, lo).replace("/km", "");
      const b = hi && hi !== lo ? fmtPace(ctx.core, hi).replace("/km", "") : "";
      parts.push(b ? `${a}–${b}/km` : `${a}/km`);
    }
    if (t.hrZone) parts.push(String(t.hrZone).toUpperCase().startsWith("Z") ? String(t.hrZone).toUpperCase() : `Zone ${t.hrZone}`);
    if (t.rpe) parts.push(`RPE ${t.rpe}`);
    return parts.join(" · ");
  }

  function runBlock(b) {
    const head = [prettifyId(b.runType || "run"), b.totalKm ? fmtKm(b.totalKm) : null].filter(Boolean).join(" · ");
    const rows = [];
    if (b.warmupMin) rows.push(h("li", { class: "seg-row" }, h("span", { class: "seg-what" }, "Warm-up"), h("span", { class: "seg-how num" }, `${b.warmupMin} min easy`)));
    for (const s of b.segments || []) {
      const amount = s.distanceM ? (s.distanceM >= 1000 && s.distanceM % 100 === 0 ? `${s.distanceM / 1000} km` : `${s.distanceM} m`) : s.durationSec ? fmtRest(s.durationSec).replace(" s", " s") : "";
      const what = `${s.reps && s.reps > 1 ? `${s.reps} × ` : ""}${amount}`;
      const rec = s.recoverySec ? `${fmtRest(s.recoverySec)} ${s.recoveryType || "jog"}` : "";
      rows.push(h("li", { class: "seg-row" },
        h("span", { class: "seg-what num" }, what || "Run"),
        h("span", { class: "seg-how num" }, [paceRange(s.target), rec ? `then ${rec}` : null].filter(Boolean).join(" · ") || "easy effort"),
      ));
    }
    if (b.cooldownMin) rows.push(h("li", { class: "seg-row" }, h("span", { class: "seg-what" }, "Cool-down"), h("span", { class: "seg-how num" }, `${b.cooldownMin} min easy`)));
    return h("section", { class: "block block-run" },
      h("h4", { class: "block-title" }, "Run", h("span", { class: "block-sub num" }, head)),
      rows.length ? h("ul", { class: "segments" }, rows) : null,
      b.notes ? lineClamp(b.notes, "block-note") : null,
    );
  }

  function condBlock(b, sw = null) {
    const fmt = { AMRAP: "AMRAP", EMOM: "EMOM", FOR_TIME: "For time", RFT: "Rounds for time", INTERVALS: "Intervals", TABATA: "Tabata", CHIPPER: "Chipper" }[b.format] || b.format || "Conditioning";
    const shape = [];
    if (b.format === "RFT" && b.rounds) shape.push(`${b.rounds} rounds`);
    else if (b.rounds && b.format !== "AMRAP") shape.push(plural(b.rounds, "round"));
    if (b.minutes) shape.push(`${b.minutes} min`);
    if (b.workSec || b.restSec) shape.push(`${b.workSec || 0} s on / ${b.restSec || 0} s off`);
    if (b.timeCapMin) shape.push(`cap ${b.timeCapMin} min`);
    if (b.targetRpe) shape.push(`RPE ${b.targetRpe}`);
    return h("section", { class: "block block-cond" },
      h("h4", { class: "block-title" }, fmt, shape.length ? h("span", { class: "block-sub num" }, shape.join(" · ")) : null),
      h("ul", { class: "plain-list movements" }, (b.items || []).map((it) => {
        const amount = [
          it.reps ? `${it.reps}` : null,
          it.calories ? `${it.calories} cal` : null,
          it.distanceM ? `${it.distanceM} m` : null,
          it.durationSec ? `${it.durationSec} s` : null,
        ].filter(Boolean).join(" ");
        const swapBtn = swapControl(sw, it);
        const text = [
          amount ? h("span", { class: "mv-amt num" }, amount) : null,
          h("span", { class: "li-name" }, it.name || exerciseName(ctx.catalog, it.exerciseId)),
          swappedMark(it),
          it.loadKg ? h("span", { class: "li-detail num" }, ` · ${fmtKg(it.loadKg)} kg`) : null,
          it.notes ? h("span", { class: "li-detail" }, ` · ${it.notes}`) : null,
        ];
        return swapBtn
          ? h("li", { class: ["mv-row", it.swappedFrom && "is-swapped"] }, h("span", { class: "mv-text" }, text), swapBtn)
          : h("li", {}, text);
      })),
      b.scaling ? lineClamp(b.scaling, "block-note", h("strong", {}, "Scaling ")) : null,
      b.notes ? lineClamp(b.notes, "block-note") : null,
    );
  }

  // ---- draft ---------------------------------------------------------------------------------
  function draftSection(plan) {
    const v = plan.validation || safe(() => ctx.core.validatePlan(plan, { profile: ctx.data.profile, sessions: ctx.data.sessions, today: ctx.today() }), null) || { errors: [], warnings: [] };
    const issues = [
      ...(v.errors || []).map((i) => ({ ...i, level: "error" })),
      ...(v.warnings || []).map((i) => ({ ...i, level: "warn" })),
    ];
    const shown = showAllIssues ? issues : issues.slice(0, 4);
    const busy = Boolean(job && !job.error);
    const actions = h("div", { class: "draft-actions" });
    const approve = button({
      id: "draft-approve",
      label: "Approve",
      icon: "check",
      kind: "primary",
      disabled: busy,
      onClick: () => {
        const errs = (v.errors || []).length;
        if (errs) {
          inlineConfirm(actions, {
            text: `The checker flagged ${plural(errs, "problem")} in this draft. Approve it anyway?`,
            confirmLabel: "Approve anyway",
            danger: false,
            idPrefix: "draft-approve",
            onConfirm: () => doApprove(plan),
          });
        } else doApprove(plan);
      },
    });
    append(actions, [
      approve,
      button({ id: "draft-changes", label: "Ask for changes", icon: "coach", kind: "secondary", disabled: busy, onClick: () => ctx.chat?.prefill("Change the draft plan: ") }),
      button({ id: "draft-regenerate", label: "Regenerate", icon: "refresh", kind: "ghost", disabled: busy || !coachReady(), onClick: () => generate({ kind: "generate" }) }),
    ]);

    return h("section", { class: "plan-draft", "aria-label": "Draft plan" },
      h("header", { class: "plan-head" },
        h("p", { class: "eyebrow eyebrow-draft" }, "Draft · needs your OK"),
        h("h2", { class: ["plan-focus", String(plan.focus || "").length > 48 && "is-long"] }, plan.focus || "Next week"),
        h("p", { class: "plan-meta num" }, [`Week of ${fmtWeekRange(plan.weekStart)}`, plural((plan.workouts || []).length, "workout")].join(" · ")),
      ),
      issues.length ? h("div", { class: "issues" },
        h("ul", { class: "issue-list", "aria-label": "Plan check" }, shown.map((i) => h("li", { class: `issue issue-${i.level}` },
          icon(i.level === "error" ? "alert" : "dot", { size: 16 }),
          h("span", {}, i.workoutId ? h("strong", {}, `${i.workoutId} `) : null, i.message || prettifyId(i.code)),
        ))),
        issues.length > 4 ? button({ id: "draft-issues-more", label: showAllIssues ? "Show fewer" : `Show all ${issues.length}`, kind: "quiet", small: true, onClick: () => { showAllIssues = !showAllIssues; render(); } }) : null,
      ) : h("p", { class: "issue-clear" }, icon("check", { size: 16 }), "Passed the plan check: equipment, volume, session length and run ramp."),
      plan.rationale ? h("p", { class: "draft-rationale" }, plan.rationale) : null,
      targetsRow(plan),
      h("ol", { class: "workouts" }, (plan.workouts || []).map((w, i) => h("li", {}, workoutCard(plan, w, i, { status: null, withTargets: false })))),
      actions,
    );
  }

  async function doApprove(plan) {
    try {
      const res = await store.plans.approve(plan.id);
      await Promise.resolve(safe(() => store.chat.append({ role: "event", text: `Plan approved: ${plan.focus || "next week"}`, actions: [], error: null }), null)).catch(() => {});
      toast({ text: "Plan approved", action: res?.undo ? { label: "Undo", fn: () => res.undo() } : undefined });
      window.scrollTo({ top: 0 });
    } catch (err) {
      toast({ text: errorText(coach, err), kind: "error" });
    }
  }

  render();
  return {
    show() {
      render();
    },
    teardown() {
      job?.ctl?.abort();
      job?.ticker?.stop();
      unsubs.splice(0).forEach((u) => safe(u, null));
    },
  };
}
