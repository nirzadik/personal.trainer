// Owner: Agent D. Plan tab: agreed plan in rotation order (Done / Up next / Later) with targets from
// core.nextTarget, the draft with validation chips and Approve / Ask for changes / Regenerate, and
// plan generation with an elapsed timer and Stop.

import {
  h, icon, button, append, replaceChildren, pill, typePill, emptyState, errorLine, inlineConfirm, toast,
  createTicker, fmtElapsed, fmtWeekRange, fmtKg, fmtRest, fmtPace, fmtKm, plural, safe, errorText, TYPE_LABEL,
} from "./components.js";
import { exerciseName, prettifyId } from "./ops.js";

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
  let job = null; // { kind, ctl, ticker, t0, progress, error, retry }
  let showAllIssues = false;

  const sub = h("p", { class: "view-sub num" });
  const head = h("div", { class: "view-head" }, h("div", { class: "view-head-text" }, h("h1", { class: "view-title" }, "Plan"), sub));
  const jobEl = h("div", { class: "gen-host" });
  const draftEl = h("div", { class: "draft-host" });
  const agreedEl = h("div", { class: "agreed-host" });
  append(el, [head, jobEl, draftEl, agreedEl]);

  unsubs.push(ctx.on(["plans", "state", "sessions", "profile"], () => render()));

  function coachReady() {
    return Boolean(coach) && ctx.coachStatus().available !== false;
  }

  // ---- generation ----------------------------------------------------------------------------
  async function generate({ kind = "generate", instruction = "", fromRequest = false } = {}) {
    if (job && !job.error) return;
    if (!coachReady()) {
      toast({ text: "The coach isn't available in this view.", kind: "error" });
      return;
    }
    ctx.nav("plan");
    const ctl = new AbortController();
    const ticker = createTicker(() => renderJob());
    job = { kind, ctl, ticker, t0: Date.now(), progress: "", error: null, retry: null };
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
      const res = kind === "revise" && ctx.draftPlan()
        ? await coach.reviseDraft(instruction, { signal: ctl.signal, onProgress })
        : await coach.generatePlan({ instruction, signal: ctl.signal, onProgress });
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
      else job = { kind, error: err?.code || "upstream_error", retry: () => { job = null; generate({ kind, instruction, fromRequest }); } };
    }
    renderJob();
    render();
  }

  function renderJob() {
    if (!job) {
      replaceChildren(jobEl);
      return;
    }
    if (job.error) {
      replaceChildren(jobEl, h("div", { class: "gen-panel is-error" },
        h("p", { class: "gen-title" }, job.kind === "revise" ? "The revision didn't finish" : "The plan didn't finish"),
        errorLine({ text: errorText(coach, job.error), onRetry: job.retry }),
        button({ id: "gen-dismiss", label: "Dismiss", kind: "ghost", small: true, onClick: () => { job = null; renderJob(); render(); } }),
      ));
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
      h("p", { class: "gen-note" }, "This uses the most capable model and can take 1–3 minutes. You can switch tabs while it works."),
      button({ id: "gen-stop", label: "Stop", icon: "stop", kind: "stop", onClick: () => job?.ctl?.abort() }),
    ));
  }

  ctx.plan = {
    generate,
    isBusy: () => Boolean(job && !job.error),
  };

  // ---- render --------------------------------------------------------------------------------
  function render() {
    if (!store) {
      sub.textContent = "";
      replaceChildren(draftEl);
      replaceChildren(agreedEl, emptyState({ title: "Your plan needs an account", text: "Sign in to Claude to build and follow a weekly plan.", icon: "plan" }));
      return;
    }
    if (!ctx.data.loaded.plans || !ctx.data.loaded.profile) {
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
        h("h2", { class: "plan-focus" }, plan.focus || "This week"),
        h("p", { class: "plan-meta num" }, `${doneCount} of ${plural(workouts.length, "workout")} done${next && !complete ? ` · Up next: ${next.title}` : ""}`),
        progress,
      ),
      plan.rationale ? h("details", { class: "rationale", id: `rationale-${plan.id}` },
        h("summary", {}, h("span", {}, "Why this plan"), icon("chevron", { size: 18 })),
        h("p", {}, plan.rationale),
      ) : null,
      targetsRow(plan),
      h("ol", { class: "workouts" }, workouts.map((w, i) => h("li", {}, workoutCard(plan, w, i, {
        status: done.includes(w.id) ? "done" : next?.id === w.id ? "next" : "later",
        withTargets: true,
      })))),
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

  function workoutCard(plan, w, idx, { status, withTargets }) {
    const key = `${plan.id}:${w.id}`;
    const isOpen = expanded.has(key);
    const bodyId = `wbody-${plan.id}-${w.id}`.replace(/[^\w-]/g, "_");
    const statusPill = status === "done" ? h("span", { class: "pill pill-ok" }, icon("check", { size: 14 }), "Done")
      : status === "next" ? pill("Up next", "next")
      : status === "later" ? pill("Later", "neutral") : null;
    const loc = (ctx.data.profile?.equipment?.locations || []).find((l) => l.id === w.locationId)?.name;
    const meta = [TYPE_LABEL[w.type] || prettifyId(w.type), w.estMinutes ? `${w.estMinutes} min` : null, loc].filter(Boolean).join(" · ");
    const body = h("div", { class: "workout-body", id: bodyId, hidden: !isOpen });
    if (isOpen) fillBody(body, w, withTargets);
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
        if (open && !body.childNodes.length) fillBody(body, w, withTargets);
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
    return h("article", { class: ["workout-card", `is-${status || "draft"}`] }, toggle, body);
  }

  function fillBody(body, w, withTargets) {
    replaceChildren(body,
      w.intent ? h("p", { class: "w-intent" }, w.intent) : null,
      (w.blocks || []).map((b) => blockView(b, withTargets)),
    );
  }

  function blockView(b, withTargets) {
    if (b.kind === "strength") return strengthBlock(b, withTargets);
    if (b.kind === "run") return runBlock(b);
    if (b.kind === "conditioning") return condBlock(b);
    const title = { warmup: "Warm-up", cooldown: "Cool-down", mobility: "Mobility" }[b.kind] || prettifyId(b.kind);
    return h("section", { class: `block block-${b.kind}` },
      h("h4", { class: "block-title" }, title, b.minutes ? h("span", { class: "block-sub num" }, `${b.minutes} min`) : null),
      h("ul", { class: "plain-list" }, (b.items || []).map((it) => h("li", {},
        h("span", { class: "li-name" }, it.name || exerciseName(ctx.catalog, it.exerciseId)),
        it.detail ? h("span", { class: "li-detail" }, ` · ${it.detail}`) : null,
      ))),
    );
  }

  function strengthBlock(b, withTargets) {
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
        return h("li", { class: "lift" },
          h("div", { class: "lift-main" },
            h("p", { class: "lift-name" }, tag ? h("span", { class: "ss-tag" }, tag) : null, it.name || exerciseName(ctx.catalog, it.exerciseId)),
            h("p", { class: "lift-rx num" }, rx, extra ? h("span", { class: "lift-extra" }, ` · ${extra}`) : null),
            target?.note || it.notes ? h("p", { class: "lift-note" }, target?.note || it.notes) : null,
            alts.length ? h("p", { class: "lift-alts" }, h("span", { class: "alts-label" }, "Swap"), ` ${alts.join(", ")}`) : null,
          ),
          withTargets || tLoad != null ? h("div", { class: "lift-target", title: target?.reason || "" },
            h("span", { class: "target-label" }, "Target"),
            h("span", { class: "target-val num" }, tLoad != null ? `${fmtKg(tLoad)}` : "—", tLoad != null ? h("span", { class: "target-unit" }, "kg") : null),
            tReps != null ? h("span", { class: "target-reps num" }, `× ${tReps}`) : h("span", { class: "target-reps num" }, tLoad == null ? "pick a load" : `× ${it.reps}`),
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
      b.notes ? h("p", { class: "block-note" }, b.notes) : null,
    );
  }

  function condBlock(b) {
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
        return h("li", {},
          amount ? h("span", { class: "mv-amt num" }, amount) : null,
          h("span", { class: "li-name" }, it.name || exerciseName(ctx.catalog, it.exerciseId)),
          it.loadKg ? h("span", { class: "li-detail num" }, ` · ${fmtKg(it.loadKg)} kg`) : null,
          it.notes ? h("span", { class: "li-detail" }, ` · ${it.notes}`) : null,
        );
      })),
      b.scaling ? h("p", { class: "block-note" }, h("strong", {}, "Scaling "), b.scaling) : null,
      b.notes ? h("p", { class: "block-note" }, b.notes) : null,
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
        h("h2", { class: "plan-focus" }, plan.focus || "Next week"),
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
