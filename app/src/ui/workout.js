// Live workout sheet: the Plan tab's "Start" opens it at the start of a workout and the owner fills it in at the
// gym, set by set. Every planned set is prefilled with today's target (core.sessionFromWorkout / nextTarget) and
// ticked with one tap; tapping the value opens steppers (±increment kg, ±1 rep, RIR) on a numeric keyboard.
// The in-progress draft is kept per plan workout in localStorage (a per-viewer convenience, CONTRACT §2), so
// closing the sheet or reloading never loses it; the Plan card then offers "Resume" and "Discard".
// Finish logs only the ticked work (core.liveSessionInput) through quicklog.saveLoggedSession, which advances the
// rotation and starts the coach's post-workout review, exactly like the old "Mark as done" save.
// Styles: the "live workout sheet" section of styles.css.

import {
  h, icon, button, replaceChildren, openSheet, toast, inlineConfirm, segmented, fmtKg, fmtKm, fmtPace, fmtClock,
  plural, safe, lsGet, lsSet, errorText,
} from "./components.js";
import { exerciseName, prettifyId } from "./ops.js";
import { swapOptions, swappableItems } from "../swap.js";
import { saveLoggedSession, workoutDraft, feedbackControl, actionToast } from "./quicklog.js";

const STORE_KEY = "pt.liveWorkouts.v1";
const MAX_AGE_MS = 7 * 24 * 3600 * 1000;
/** Window event fired whenever a live draft is saved, discarded or finished (the Plan tab re-renders). */
export const LIVE_EVENT = "pt:live-workout";

const FORMAT_LABEL = { AMRAP: "AMRAP", EMOM: "EMOM", FOR_TIME: "For time", RFT: "Rounds for time", INTERVALS: "Intervals", TABATA: "Tabata", CHIPPER: "Chipper" };
const TIMED_FORMATS = new Set(["FOR_TIME", "RFT", "CHIPPER"]);
const PAIN_WHEN = [["during", "During"], ["after", "After"], ["next_morning", "Next morning"]];

// ---------------------------------------------------------------------------------------------
// Draft storage (localStorage, with an in-memory fallback when storage is blocked)

let memDrafts = {};

function readAll() {
  const raw = lsGet(STORE_KEY);
  if (raw == null) return { ...memDrafts };
  try {
    const v = JSON.parse(raw);
    return v && typeof v === "object" && !Array.isArray(v) ? v : {};
  } catch {
    return {};
  }
}

function writeAll(all) {
  memDrafts = { ...all };
  lsSet(STORE_KEY, Object.keys(all).length ? JSON.stringify(all) : null);
}

const keyOf = (planId, workoutId) => `${planId}|${workoutId}`;

function notify() {
  safe(() => window.dispatchEvent(new CustomEvent(LIVE_EVENT)), null);
}

/**
 * The in-progress draft of a plan workout, or null. Drafts untouched for a week are dropped.
 * @param {string} planId
 * @param {string} workoutId
 * @returns {any|null}
 */
export function liveDraftFor(planId, workoutId) {
  if (!planId || !workoutId) return null;
  const all = readAll();
  const k = keyOf(planId, workoutId);
  const d = all[k];
  if (!d || typeof d !== "object" || d.v !== 1) return null;
  if (Date.now() - (Number(d.updatedAt) || Number(d.startedAt) || 0) > MAX_AGE_MS) {
    delete all[k];
    writeAll(all);
    return null;
  }
  return d;
}

function putDraft(d) {
  const all = readAll();
  all[d.key] = { ...d, updatedAt: Date.now() };
  writeAll(all);
}

/**
 * Delete the in-progress draft of a plan workout.
 * @param {string} planId
 * @param {string} workoutId
 */
export function discardLiveDraft(planId, workoutId) {
  const all = readAll();
  delete all[keyOf(planId, workoutId)];
  writeAll(all);
  notify();
}

/**
 * Short elapsed text for a draft: "12 min", "1 h 05".
 * @param {any} d
 * @returns {string}
 */
export function liveElapsedText(d) {
  const min = Math.max(0, Math.floor((Date.now() - (Number(d?.startedAt) || Date.now())) / 60000));
  return min < 60 ? `${min} min` : `${Math.floor(min / 60)} h ${String(min % 60).padStart(2, "0")}`;
}

// ---------------------------------------------------------------------------------------------
// A new live draft from the plan workout

function newLive(ctx, plan, workout) {
  const s = workoutDraft(ctx, plan, workout);
  const slots = swappableItems(workout).filter((x) => x.kind === "strength" && (x.item?.exerciseId || x.item?.name));
  const blocks = workout.blocks || [];
  const condBlocks = blocks.map((b, i) => (b?.kind === "conditioning" ? i : -1)).filter((i) => i >= 0);
  const ssCount = {};
  const ssTag = (slot) => {
    const g = slot?.item?.supersetGroup;
    if (!g) return null;
    const k = `${slot.blockIndex}:${g}`;
    ssCount[k] = (ssCount[k] || 0) + 1;
    return `${g}${ssCount[k]}`;
  };
  const now = Date.now();
  return {
    v: 1,
    key: keyOf(plan.id, workout.id),
    planId: plan.id,
    workoutId: workout.id,
    title: s.title,
    type: s.type,
    date: s.date,
    startedAt: now,
    updatedAt: now,
    plannedMin: s.durationMin ?? null,
    readiness: null,
    sessionRpe: null,
    durationMin: null,
    notes: "",
    pain: [],
    strength: (s.strength || []).map((ex, i) => ({
      exerciseId: ex.exerciseId,
      name: exerciseName(ctx.catalog, ex.exerciseId, ex.name),
      itemIndex: slots[i]?.itemIndex ?? null,
      blockIndex: slots[i]?.blockIndex ?? null,
      ssGroup: slots[i]?.item?.supersetGroup || null,
      ssTag: ssTag(slots[i]),
      incKg: Number(slots[i]?.item?.incrementKg) > 0 ? Number(slots[i].item.incrementKg) : 2.5,
      bw: Boolean(ex.sets?.[0]?.bodyweight),
      target: ex.target || null,
      feedback: null,
      open: i === 0,
      swappedFrom: null,
      sets: (ex.sets || []).map((st) => ({ loadKg: st.loadKg ?? null, reps: st.reps ?? null, rir: st.rir ?? null, bodyweight: Boolean(st.bodyweight), done: false, edited: false })),
    })),
    checks: {}, // warm-up / cool-down / mobility checklists: { [blockIndex]: [bool per item] }
    run: s.run ? {
      blockIndex: blocks.findIndex((b) => b?.kind === "run"),
      runType: s.run.runType || "easy",
      distanceKm: s.run.distanceKm ?? null,
      durationSec: s.run.durationSec ?? null,
      avgHr: null,
      rpe: s.run.rpe ?? null,
      target: s.run.target || null,
      done: false,
    } : null,
    conditioning: (s.conditioning || []).map((c, k) => ({ ...c, blockIndex: condBlocks[k] ?? null, result: { ...(c.result || {}) }, feedback: null, done: false })),
  };
}

/**
 * Block header [title, sub] in the Plan tab's wording (plan.js blockView): STRENGTH, RUN · tempo · 7 km,
 * AMRAP · 12 min, WARM-UP · 8 min, …
 */
function blockHeading(b) {
  if (b.kind === "strength") return ["Strength", ""];
  if (b.kind === "run") return ["Run", [prettifyId(b.runType || "run"), b.totalKm ? fmtKm(b.totalKm) : null].filter(Boolean).join(" · ")];
  if (b.kind === "conditioning") {
    const shape = [];
    if (b.format === "RFT" && b.rounds) shape.push(`${b.rounds} rounds`);
    else if (b.rounds && b.format !== "AMRAP") shape.push(plural(b.rounds, "round"));
    if (b.minutes) shape.push(`${b.minutes} min`);
    if (b.workSec || b.restSec) shape.push(`${b.workSec || 0} s on / ${b.restSec || 0} s off`);
    if (b.timeCapMin) shape.push(`cap ${b.timeCapMin} min`);
    if (b.targetRpe) shape.push(`RPE ${b.targetRpe}`);
    return [FORMAT_LABEL[b.format] || b.format || "Conditioning", shape.join(" · ")];
  }
  const title = { warmup: "Warm-up", cooldown: "Cool-down", mobility: "Mobility" }[b.kind] || prettifyId(b.kind);
  return [title, b.minutes ? `${b.minutes} min` : ""];
}

function parseNum(v) {
  if (v === "" || v == null) return null;
  const n = Number(String(v).replace(",", ".").trim());
  return Number.isFinite(n) ? n : null;
}

// ---------------------------------------------------------------------------------------------
// The sheet

/**
 * Open (or resume) the live workout sheet for a plan workout.
 * @param {any} ctx
 * @param {any} plan
 * @param {any} workout
 * @param {{ note?: string }} [opts] note: a line shown at the top (e.g. why "As planned" needs input)
 */
export function openLiveWorkout(ctx, plan, workout, { note = "" } = {}) {
  const { store, core, catalog, coach } = ctx;
  if (!store || !plan || !workout || document.getElementById("live-workout-sheet")) return;
  let live = liveDraftFor(plan.id, workout.id);
  const resumed = Boolean(live);
  if (!live) {
    live = newLive(ctx, plan, workout);
    putDraft(live);
    notify();
  }
  let touched = false; // anything entered this time
  let editing = null; // { ei, si, hint }
  let finished = false; // finished or discarded: don't keep a draft on close
  let confirming = false; // the "not everything ticked" confirm in the footer
  let saving = false;
  const exNodes = [];

  const persist = () => {
    touched = true;
    putDraft(live);
  };

  // ---- sheet + head --------------------------------------------------------------------------
  const sheet = openSheet({
    title: live.title || workout.title || workout.id,
    id: "live-workout-sheet",
    class: "ws-sheet",
    backdropClose: false,
    onClose,
    build: (api) => {
      api.form = h("form", { class: "ws", id: "ws-form", novalidate: true, onSubmit: (e) => { e.preventDefault(); finish(); } });
      return api.form;
    },
  });
  const form = sheet.form;
  const head = sheet.dialog.querySelector(".sheet-head");
  const titleEl = head.querySelector(".sheet-title");
  const timeEl = h("span", { class: "ws-time num", role: "timer", "aria-label": "Elapsed time" }, "0:00");
  const countEl = h("span", { class: "ws-count num" });
  const barFill = h("span", {});
  const headText = h("div", { class: "ws-headtext" },
    h("p", { class: "ws-status" }, h("span", { class: "ws-dot", "aria-hidden": "true" }), h("span", { class: "ws-state" }, "In progress"), timeEl, countEl),
  );
  head.insertBefore(headText, titleEl);
  headText.appendChild(titleEl);
  head.appendChild(h("div", { class: "ws-bar", "aria-hidden": "true" }, barFill));
  const announcer = h("p", { class: "visually-hidden", "aria-live": "polite" });
  head.appendChild(announcer);
  const say = (t) => { announcer.textContent = t; };

  const tick = () => { timeEl.textContent = fmtClock(Math.floor((Date.now() - live.startedAt) / 1000)); };
  tick();
  const timer = setInterval(tick, 1000);

  // keyboard: keep the focused field visible above it
  const vv = window.visualViewport;
  const onVV = () => {
    const a = document.activeElement;
    if (a && sheet.body.contains(a) && a.matches("input, textarea, select")) requestAnimationFrame(() => a.scrollIntoView({ block: "nearest" }));
  };
  vv?.addEventListener("resize", onVV);
  const onHide = () => { if (!finished) putDraft(live); };
  window.addEventListener("pagehide", onHide);

  // ---- footer --------------------------------------------------------------------------------
  const errEl = h("p", { class: "form-error ws-error", role: "alert", hidden: true });
  const actionsEl = h("div", { class: "ws-actions" });
  replaceChildren(sheet.footer, errEl, actionsEl);
  sheet.footer.hidden = false;

  function footerDefault() {
    confirming = false;
    replaceChildren(actionsEl,
      button({ id: "ws-close", label: "Close", kind: "ghost", onClick: () => sheet.close() }),
      button({ id: "ws-finish", label: "Finish workout", icon: "check", kind: "primary", type: "submit", class: "btn-lg ws-finish", disabled: saving, onClick: (e) => { e.preventDefault(); finish(); } }),
    );
  }

  function showError(msg) {
    errEl.hidden = !msg;
    errEl.textContent = msg || "";
  }

  // ---- status --------------------------------------------------------------------------------
  function refreshStatus() {
    const p = core.liveProgress(live);
    countEl.textContent = p.total ? `${p.done}/${p.total}` : "";
    countEl.setAttribute("aria-label", p.total ? `${p.done} of ${p.total} done` : "");
    barFill.style.width = `${p.total ? Math.round((p.done / p.total) * 100) : 0}%`;
  }

  // ---- render --------------------------------------------------------------------------------
  function render(focusId) {
    const scroll = sheet.body.scrollTop;
    exNodes.length = 0;
    const blocks = workout.blocks || [];
    const parts = [];
    let runShown = false;
    blocks.forEach((b, bi) => {
      if (!b || typeof b !== "object") return;
      if (b.kind === "strength") {
        const idx = live.strength.map((e, i) => (e.blockIndex === bi ? i : -1)).filter((i) => i >= 0);
        if (idx.length) parts.push(blockSection(b, bi, strengthGroups(idx)));
      } else if (b.kind === "run") {
        if (live.run && !runShown && (live.run.blockIndex == null || live.run.blockIndex === bi || live.run.blockIndex < 0)) {
          runShown = true;
          parts.push(blockSection(b, bi, runCard()));
        }
      } else if (b.kind === "conditioning") {
        const ci = live.conditioning.findIndex((c, k) => (c.blockIndex ?? k) === bi);
        if (ci >= 0) parts.push(blockSection(b, bi, condCard(ci, b)));
      } else if ((b.items || []).length) {
        parts.push(blockSection(b, bi, checklist(b, bi)));
      }
    });
    // anything not tied to a plan block (a draft from an older version): keep it loggable at the end
    const orphans = live.strength.map((e, i) => (e.blockIndex == null || !blocks[e.blockIndex] ? i : -1)).filter((i) => i >= 0);
    if (orphans.length) parts.push(blockSection({ kind: "strength" }, "x", strengthGroups(orphans)));
    if (live.run && !runShown) parts.push(blockSection({ kind: "run", runType: live.run.runType }, "x", runCard()));
    replaceChildren(form,
      note ? h("p", { class: "ws-note-banner" }, icon("alert", { size: 18 }), h("span", {}, note)) : null,
      readinessRow(),
      parts,
      wrapUp(),
    );
    sheet.body.scrollTop = scroll;
    refreshStatus();
    if (focusId) focusSoon(focusId);
  }

  function blockSection(b, bi, content) {
    const [title, sub] = blockHeading(b);
    const id = `ws-blk-${bi}`;
    return h("section", { class: ["ws-blk", `ws-blk-${b.kind}`], "aria-labelledby": id },
      h("h4", { class: "block-title ws-blk-title", id }, title, sub ? h("span", { class: "block-sub num" }, sub) : null),
      content,
    );
  }

  /** Exercise cards in plan order; consecutive exercises of one superset share a bracket. */
  function strengthGroups(idx) {
    const out = [];
    for (let k = 0; k < idx.length; k++) {
      const ex = live.strength[idx[k]];
      if (!ex.ssGroup) {
        out.push(exNodes[idx[k]] = exerciseCard(idx[k]));
        continue;
      }
      const members = [];
      while (k < idx.length && live.strength[idx[k]].ssGroup === ex.ssGroup) members.push(idx[k++]);
      k -= 1;
      out.push(h("div", { class: "ws-superset", role: "group", "aria-label": `Superset ${ex.ssGroup}` },
        h("p", { class: "ws-mini-label ws-ss-label" }, `Superset ${ex.ssGroup} · alternate sets`),
        members.map((i) => (exNodes[i] = exerciseCard(i))),
      ));
    }
    return h("div", { class: "ws-section" }, out);
  }

  /** Warm-up / cool-down / mobility items as a tickable checklist (kept in the draft, noted on Finish). */
  function checklist(b, bi) {
    const items = b.items || [];
    if (!live.checks) live.checks = {};
    const ticks = Array.isArray(live.checks[bi]) ? live.checks[bi] : (live.checks[bi] = items.map(() => false));
    return h("ul", { class: "ws-checklist" }, items.map((it, k) => {
      const name = it.name || exerciseName(catalog, it.exerciseId);
      const btn = h("button", {
        type: "button",
        class: "ws-tick",
        id: `ws-b${bi}-i${k}`,
        "aria-pressed": String(Boolean(ticks[k])),
        onClick: () => {
          ticks[k] = !ticks[k];
          btn.setAttribute("aria-pressed", String(ticks[k]));
          persist();
        },
      },
        h("span", { class: "ws-tick-box", "aria-hidden": "true" }, icon("check", { size: 18 })),
        h("span", { class: "ws-tick-text" },
          h("span", { class: "li-name" }, name),
          it.detail ? h("span", { class: "li-detail num" }, ` · ${it.detail}`) : null,
        ),
      );
      return h("li", {}, btn);
    }));
  }

  /** "Warm-up done. Cool-down: 1/3 done." for the session notes. */
  function checklistNotes() {
    const out = [];
    (workout.blocks || []).forEach((b, bi) => {
      const ticks = live.checks?.[bi];
      if (!Array.isArray(ticks) || !ticks.length || ["strength", "run", "conditioning"].includes(b?.kind)) return;
      const n = ticks.filter(Boolean).length;
      if (!n) return;
      const [title] = blockHeading(b);
      out.push(n === ticks.length ? `${title} done.` : `${title}: ${n}/${ticks.length} done.`);
    });
    return out.join(" ");
  }

  function focusSoon(id) {
    requestAnimationFrame(() => form.querySelector(`#${CSS.escape(id)}`)?.focus({ preventScroll: false }));
  }

  function rerenderEx(ei, focusId) {
    const old = exNodes[ei];
    const next = exerciseCard(ei);
    if (old?.isConnected) old.replaceWith(next);
    exNodes[ei] = next;
    refreshStatus();
    if (focusId) focusSoon(focusId);
  }

  // ---- readiness + warm-up -------------------------------------------------------------------
  function readinessRow() {
    return h("div", { class: "ws-ready" },
      h("span", { class: "ws-mini-label", id: "ws-ready-label" }, "Readiness"),
      segmented({
        id: "ws-readiness",
        label: "Readiness today, 1 drained to 5 great",
        options: [1, 2, 3, 4, 5].map((n) => ({ value: String(n), label: String(n) })),
        value: live.readiness == null ? "" : String(live.readiness),
        onChange: (v) => {
          live.readiness = live.readiness === Number(v) ? null : Number(v);
          if (live.readiness == null) form.querySelector("#ws-readiness")?.setValue("");
          persist();
        },
      }),
      h("span", { class: "ws-ready-hint", "aria-hidden": "true" }, "1 drained · 5 great"),
    );
  }

  // ---- strength ------------------------------------------------------------------------------
  function rxText(ex) {
    const t = ex.target;
    if (!t) return "";
    const rx = [`${t.sets} × ${t.reps || "?"}`, t.targetRir != null ? `@ RIR ${t.targetRir}` : null].filter(Boolean).join(" ");
    const load = t.loadKg != null ? `${fmtKg(t.loadKg)} kg` : ex.bw ? "bodyweight" : "pick a load";
    return `${rx} · ${load}`;
  }

  function setLabel(ex, st) {
    const load = st.loadKg != null ? fmtKg(st.loadKg) : ex.bw ? "BW" : "—";
    return [
      h("span", { class: "ws-v-load" }, load, st.loadKg != null ? h("small", {}, "kg") : null),
      h("span", { class: "ws-v-x", "aria-hidden": "true" }, "×"),
      h("span", { class: "ws-v-reps" }, st.reps != null ? String(st.reps) : "—"),
      st.rir != null ? h("span", { class: "ws-v-rir" }, `RIR ${fmtKg(st.rir)}`) : null,
    ];
  }

  function setSpeech(ex, st) {
    const load = st.loadKg != null ? `${fmtKg(st.loadKg)} kg` : ex.bw ? "bodyweight" : "no load yet";
    return `${load} × ${st.reps != null ? `${st.reps} reps` : "no reps yet"}${st.rir != null ? `, RIR ${st.rir}` : ""}`;
  }

  function refreshSetRows(ei) {
    const ex = live.strength[ei];
    ex.sets.forEach((st, si) => {
      const val = form.querySelector(`#ws-${ei}-${si}-val`);
      if (val) {
        replaceChildren(val, setLabel(ex, st));
        val.setAttribute("aria-label", `Set ${si + 1}: ${setSpeech(ex, st)}. Edit`);
      }
      form.querySelector(`#ws-${ei}-${si}-check`)?.setAttribute("aria-label", `Set ${si + 1} done: ${setSpeech(ex, st)}`);
    });
  }

  function exerciseCard(ei) {
    const ex = live.strength[ei];
    const done = ex.sets.filter((s) => s.done).length;
    const complete = ex.sets.length > 0 && done === ex.sets.length;
    const bodyId = `ws-ex-${ei}-body`;
    const headBtn = h("button", {
      type: "button",
      class: "ws-ex-head",
      id: `ws-ex-${ei}-head`,
      "aria-expanded": String(Boolean(ex.open)),
      "aria-controls": bodyId,
      onClick: () => {
        ex.open = !ex.open;
        if (!ex.open && editing?.ei === ei) editing = null;
        putDraft(live);
        rerenderEx(ei, `ws-ex-${ei}-head`);
      },
    },
      h("span", { class: "ws-ex-text" },
        h("span", { class: "ws-ex-name" }, ex.ssTag ? h("span", { class: "ss-tag" }, ex.ssTag) : null, h("span", { class: "ws-ex-label" }, ex.name), ex.swappedFrom ? h("span", { class: "sw-mark" }, "Swapped") : null),
        h("span", { class: "ws-ex-rx num" }, rxText(ex)),
      ),
      h("span", { class: ["ws-count-pill", "num", complete && "is-complete", done > 0 && !complete && "is-partial"], "aria-label": `${done} of ${plural(ex.sets.length, "set")} done` },
        complete ? icon("check", { size: 16 }) : null, `${done}/${ex.sets.length}`),
      h("span", { class: "ws-chev", "aria-hidden": "true" }, icon("chevron", { size: 20 })),
    );
    const card = h("article", { class: ["ws-card", "ws-ex", ex.open && "is-open", complete && "is-complete"], id: `ws-ex-${ei}` }, headBtn);
    if (!ex.open) return card;

    const t = ex.target;
    const body = h("div", { class: "ws-ex-body", id: bodyId },
      t?.note && t.reason !== "progress" ? h("p", { class: "ws-hint" }, t.note) : null,
      t?.restSec ? h("p", { class: "ws-rest num" }, icon("clock", { size: 16 }), `Rest ${t.restSec >= 120 && t.restSec % 60 === 0 ? `${t.restSec / 60} min` : `${t.restSec} s`}`) : null,
      ex.sets.length ? h("ol", { class: "ws-sets", "aria-label": `${ex.name} sets` }, ex.sets.map((st, si) => setRow(ei, si))) : h("p", { class: "ws-hint" }, "No sets. Add one below."),
      h("div", { class: "ws-tools" },
        button({ id: `ws-ex-${ei}-addset`, label: "Add set", icon: "plus", kind: "quiet", small: true, onClick: () => addSet(ei) }),
        done === 0 && ex.itemIndex != null ? button({ id: `ws-ex-${ei}-swap`, label: "Swap", kind: "quiet", small: true, ariaLabel: `Swap ${ex.name} for today`, onClick: () => openSwap(ei) }) : null,
      ),
      h("div", { class: "ws-fb" },
        h("span", { class: "ws-mini-label", "aria-hidden": "true" }, "How did it feel?"),
        feedbackControl({ id: `ws-ex-${ei}-fb`, label: ex.name, value: ex.feedback, onChange: (v) => { ex.feedback = v; persist(); } }),
      ),
    );
    card.appendChild(body);
    return card;
  }

  function setRow(ei, si) {
    const ex = live.strength[ei];
    const st = ex.sets[si];
    const isEditing = editing?.ei === ei && editing?.si === si;
    const editorId = `ws-${ei}-${si}-editor`;
    return h("li", { class: ["ws-set", st.done && "is-done", isEditing && "is-editing"] },
      h("span", { class: "ws-set-n num", "aria-hidden": "true" }, String(si + 1)),
      h("button", {
        type: "button",
        class: "ws-val num",
        id: `ws-${ei}-${si}-val`,
        "aria-expanded": String(isEditing),
        "aria-controls": isEditing ? editorId : null,
        "aria-label": `Set ${si + 1}: ${setSpeech(ex, st)}. Edit`,
        onClick: () => {
          editing = isEditing ? null : { ei, si };
          // Steppers first: focusing a field would pop the keyboard over the sheet on every edit. Only a value
          // that is still missing gets the field (and the keyboard) straight away.
          const missing = st.loadKg == null && !ex.bw ? "load" : st.reps == null ? "reps" : null;
          rerenderEx(ei, isEditing ? `ws-${ei}-${si}-val` : `ws-${ei}-${si}-${missing || "ok"}`);
        },
      }, setLabel(ex, st)),
      h("button", {
        type: "button",
        class: "ws-check",
        id: `ws-${ei}-${si}-check`,
        "aria-pressed": String(Boolean(st.done)),
        "aria-label": `Set ${si + 1} done: ${setSpeech(ex, st)}`,
        onClick: () => toggleSet(ei, si),
      }, icon("check", { size: 24 })),
      isEditing ? setEditor(ei, si, editorId) : null,
    );
  }

  function setEditor(ei, si, editorId) {
    const ex = live.strength[ei];
    const st = ex.sets[si];
    const pre = `ws-${ei}-${si}`;
    const onSet = (field, v) => {
      st[field] = v;
      st.edited = true;
      for (let j = si + 1; j < ex.sets.length; j++) if (!ex.sets[j].done && !ex.sets[j].edited) ex.sets[j][field] = v;
      refreshSetRows(ei);
      persist();
    };
    return h("div", { class: "ws-editor", id: editorId, role: "group", "aria-label": `Edit set ${si + 1}` },
      stepper({ id: `${pre}-load`, label: "Load", unit: "kg", value: st.loadKg, step: ex.incKg, min: 0, max: 1000, inputmode: "decimal", placeholder: ex.bw ? "BW" : "kg", onSet: (v) => onSet("loadKg", v) }),
      stepper({ id: `${pre}-reps`, label: "Reps", value: st.reps, step: 1, min: 0, max: 200, inputmode: "numeric", placeholder: "0", onSet: (v) => onSet("reps", v == null ? null : Math.trunc(v)) }),
      stepper({ id: `${pre}-rir`, label: "RIR", unit: "opt.", value: st.rir, step: 1, min: 0, max: 10, inputmode: "decimal", placeholder: "–", onSet: (v) => onSet("rir", v) }),
      editing?.hint ? h("p", { class: "ws-edit-hint", role: "alert" }, editing.hint) : null,
      h("div", { class: "ws-editor-actions" },
        button({ id: `${pre}-dup`, label: "Duplicate", icon: "copy", kind: "ghost", small: true, onClick: () => duplicateSet(ei, si) }),
        button({ id: `${pre}-remove`, label: "Remove", icon: "trash", kind: "ghost", small: true, class: "ws-remove", onClick: () => removeSet(ei, si) }),
        button({ id: `${pre}-ok`, label: st.done ? "Close" : "Set done", icon: st.done ? null : "check", kind: st.done ? "secondary" : "primary", small: true, onClick: () => (st.done ? closeEditor(ei, si) : toggleSet(ei, si)) }),
      ),
    );
  }

  function stepper({ id, label, unit = "", value, step, min, max, inputmode, placeholder, onSet }) {
    const inp = h("input", {
      id,
      class: "input input-num ws-step-input",
      type: "text",
      inputmode,
      enterkeyhint: "done",
      autocomplete: "off",
      value: value ?? "",
      placeholder,
      onInput: (e) => onSet(parseNum(e.target.value)),
      onFocus: (e) => safe(() => e.target.select(), null),
      onKeydown: (e) => { if (e.key === "Enter") { e.preventDefault(); e.target.blur(); } },
    });
    const bump = (dir) => {
      const v = core.stepValue(parseNum(inp.value), dir * step, { min, max });
      inp.value = fmtKg(v);
      onSet(v);
    };
    return h("div", { class: "ws-step" },
      h("label", { class: "ws-step-label", for: id }, label, unit ? h("small", {}, ` ${unit}`) : null),
      h("button", { type: "button", class: "ws-step-btn", id: `${id}-minus`, "aria-label": `${label} minus ${fmtKg(step)}`, onClick: () => bump(-1) }, icon("minus", { size: 22 })),
      inp,
      h("button", { type: "button", class: "ws-step-btn", id: `${id}-plus`, "aria-label": `${label} plus ${fmtKg(step)}`, onClick: () => bump(1) }, icon("plus", { size: 22 })),
    );
  }

  function closeEditor(ei, si) {
    editing = null;
    rerenderEx(ei, `ws-${ei}-${si}-val`);
  }

  function toggleSet(ei, si) {
    const ex = live.strength[ei];
    const st = ex.sets[si];
    showError("");
    if (st.done) {
      st.done = false;
      persist();
      say(`Set ${si + 1} not done`);
      rerenderEx(ei, `ws-${ei}-${si}-check`);
      return;
    }
    const miss = st.reps == null ? "reps" : !ex.bw && st.loadKg == null ? "load" : null;
    if (miss) {
      editing = { ei, si, hint: miss === "reps" ? "Enter the reps you did, then tick the set." : "Enter the load you used (0 for an empty machine), then tick the set." };
      rerenderEx(ei, `ws-${ei}-${si}-${miss}`);
      return;
    }
    st.done = true;
    const wasEditing = editing?.ei === ei && editing?.si === si;
    if (wasEditing) editing = null;
    say(`Set ${si + 1} done, ${setSpeech(ex, st)}`);
    if (ex.sets.every((s) => s.done)) {
      const next = live.strength.findIndex((e, i) => i > ei && e.sets.some((s) => !s.done));
      if (next >= 0 && !live.strength[next].open) {
        live.strength[next].open = true;
        rerenderEx(next);
      }
    }
    persist();
    rerenderEx(ei, wasEditing ? `ws-${ei}-${si}-val` : `ws-${ei}-${si}-check`);
  }

  function addSet(ei) {
    const ex = live.strength[ei];
    const last = ex.sets[ex.sets.length - 1];
    ex.sets.push({ loadKg: last?.loadKg ?? ex.target?.loadKg ?? null, reps: last?.reps ?? null, rir: last?.rir ?? null, bodyweight: ex.bw, done: false, edited: false });
    persist();
    say(`Set ${ex.sets.length} added`);
    rerenderEx(ei, `ws-${ei}-${ex.sets.length - 1}-check`);
  }

  function duplicateSet(ei, si) {
    const ex = live.strength[ei];
    ex.sets.splice(si + 1, 0, { ...ex.sets[si], done: false, edited: true });
    editing = null;
    persist();
    say(`Set ${si + 2} added`);
    rerenderEx(ei, `ws-${ei}-${si + 1}-check`);
  }

  function removeSet(ei, si) {
    const ex = live.strength[ei];
    const [removed] = ex.sets.splice(si, 1);
    editing = null;
    persist();
    rerenderEx(ei, ex.sets.length ? `ws-${ei}-${Math.min(si, ex.sets.length - 1)}-val` : `ws-ex-${ei}-addset`);
    toast({
      text: `Removed set ${si + 1} · ${ex.name}`,
      action: {
        label: "Undo",
        fn: () => {
          if (!sheet.dialog.isConnected) return;
          ex.sets.splice(Math.min(si, ex.sets.length), 0, removed);
          persist();
          rerenderEx(ei, `ws-${ei}-${si}-val`);
        },
      },
    });
  }

  // ---- swap (today only) ---------------------------------------------------------------------
  function openSwap(ei) {
    const ex = live.strength[ei];
    const slot = swappableItems(workout)[ex.itemIndex];
    if (!slot) return;
    const item = { ...slot.item, exerciseId: ex.exerciseId, name: ex.name };
    const options = safe(() => swapOptions(item, { profile: ctx.data.profile, plan, workoutId: workout.id, kind: "strength", core, catalog, limit: 8 }), []) || [];
    let picked = false;
    openSheet({
      title: `Swap ${ex.name}`,
      id: "ws-swap-sheet",
      onClose: () => { if (!picked) focusSoon(`ws-ex-${ei}-swap`); },
      build: (api) => h("div", { class: "sw-sheet" },
        h("p", { class: "sw-keep" }, "For today's log only. Your plan stays the same; to change it, use Swap on the Plan tab."),
        options.length
          ? h("ul", { class: "picker-results sw-list", "aria-label": "Suggested swaps" }, options.map((o, i) => h("li", {}, h("button", {
            type: "button",
            class: "picker-item sw-option",
            id: `ws-swap-opt-${i}`,
            onClick: () => {
              picked = true;
              api.close();
              applySwapToday(ei, slot.item, o.exerciseId);
            },
          }, h("span", { class: "sw-opt-text" }, h("span", { class: "picker-name" }, o.name), h("span", { class: "sw-reason" }, o.reason)), h("span", { class: "sw-opt-go", "aria-hidden": "true" }, icon("arrow", { size: 18 }))))))
          : h("p", { class: "picker-empty" }, "No close match with your equipment."),
      ),
    });
  }

  function applySwapToday(ei, planItem, exerciseId) {
    const ex = live.strength[ei];
    const name = exerciseName(catalog, exerciseId);
    const one = safe(() => core.sessionFromWorkout({ id: workout.id, title: live.title, blocks: [{ kind: "strength", items: [{ ...planItem, exerciseId, name, loadKg: null, alternatives: [] }] }] }, {
      sessions: ctx.data.sessions, today: ctx.today(), planId: plan.id, profile: ctx.data.profile,
    }).strength[0], null);
    if (!one) return;
    ex.swappedFrom = ex.swappedFrom || ex.exerciseId;
    ex.exerciseId = one.exerciseId;
    ex.name = name;
    ex.bw = Boolean(one.sets?.[0]?.bodyweight);
    ex.target = one.target;
    ex.sets = one.sets.map((st) => ({ loadKg: st.loadKg ?? null, reps: st.reps ?? null, rir: st.rir ?? null, bodyweight: Boolean(st.bodyweight), done: false, edited: false }));
    ex.open = true;
    editing = null;
    persist();
    rerenderEx(ei, `ws-ex-${ei}-head`);
    toast({ text: `Swapped to ${name} for today` });
  }

  // ---- run -----------------------------------------------------------------------------------
  function clockInputs(idBase, sec, label, onSet) {
    const s = Number(sec) > 0 ? Math.round(Number(sec)) : null;
    const minEl = h("input", { id: `${idBase}-min`, class: "input input-num", type: "text", inputmode: "numeric", autocomplete: "off", placeholder: "min", value: s != null ? String(Math.floor(s / 60)) : "", "aria-label": `${label} minutes` });
    const secEl = h("input", { id: `${idBase}-sec`, class: "input input-num", type: "text", inputmode: "numeric", autocomplete: "off", placeholder: "ss", value: s != null ? String(s % 60).padStart(2, "0") : "", "aria-label": `${label} seconds` });
    const read = () => {
      const m = parseNum(minEl.value);
      const ss = parseNum(secEl.value);
      onSet(m == null && ss == null ? null : Math.max(0, Math.round((m || 0) * 60 + (ss || 0))));
    };
    minEl.addEventListener("input", read);
    secEl.addEventListener("input", read);
    for (const el of [minEl, secEl]) el.addEventListener("focus", () => safe(() => el.select(), null));
    return h("div", { class: "field" },
      h("label", { class: "field-label", for: `${idBase}-min` }, label, h("small", { class: "ws-unit" }, " mm:ss")),
      h("div", { class: "ws-clock" }, minEl, h("span", { class: "ws-colon", "aria-hidden": "true" }, ":"), secEl),
    );
  }

  function blockCheck(id, done, label, onClick) {
    return h("button", { type: "button", class: "ws-check ws-check-block", id, "aria-pressed": String(Boolean(done)), "aria-label": label, onClick }, icon("check", { size: 24 }));
  }

  function runCard() {
    const r = live.run;
    const t = r.target || {};
    const tPace = Array.isArray(t.paceSecPerKm) && t.paceSecPerKm.length
      ? `${t.paceSecPerKm.filter(Boolean).map((p) => fmtPace(core, p).replace("/km", "")).join("–")}/km` : null;
    const rx = [t.distanceKm ? fmtKm(t.distanceKm) : null, t.durationSec ? `~${fmtClock(t.durationSec)}` : null, tPace, t.rpe ? `RPE ${t.rpe}` : null].filter(Boolean).join(" · ");
    const paceEl = h("output", { class: "ws-pace num", id: "ws-run-pace" });
    const updatePace = () => {
      const pace = r.distanceKm > 0 && r.durationSec > 0 ? core.paceSecPerKm(r.distanceKm, r.durationSec) : null;
      paceEl.textContent = pace ? fmtPace(core, pace) : "–";
    };
    updatePace();
    const card = h("article", { class: ["ws-card", "ws-block", r.done && "is-complete"], id: "ws-run" });
    const fill = () => replaceChildren(card,
      h("div", { class: "ws-block-head" },
        h("div", { class: "ws-ex-text" },
          h("p", { class: "ws-mini-label" }, "Target"),
          h("p", { class: "ws-run-rx num" }, rx || prettifyId(r.runType)),
        ),
        blockCheck("ws-run-check", r.done, r.done ? "Run done. Tap to undo" : "Run done", () => {
          showError("");
          if (!r.done && !(r.distanceKm > 0) && !(r.durationSec > 0)) {
            showError("Enter the run distance or time, then tick it.");
            focusSoon("ws-run-km");
            return;
          }
          r.done = !r.done;
          persist();
          say(r.done ? "Run done" : "Run not done");
          card.classList.toggle("is-complete", r.done);
          fill();
          refreshStatus();
          focusSoon("ws-run-check");
        }),
      ),
      h("div", { class: "ws-grid" },
        h("div", { class: "field" },
          h("label", { class: "field-label", for: "ws-run-km" }, "Distance", h("small", { class: "ws-unit" }, " km")),
          h("input", { id: "ws-run-km", class: "input input-num", type: "text", inputmode: "decimal", autocomplete: "off", placeholder: "km", value: r.distanceKm ?? "", onInput: (e) => { r.distanceKm = parseNum(e.target.value); updatePace(); persist(); }, onFocus: (e) => safe(() => e.target.select(), null) }),
        ),
        clockInputs("ws-run-time", r.durationSec, "Time", (v) => { r.durationSec = v; updatePace(); persist(); }),
      ),
      h("div", { class: "ws-grid" },
        h("div", { class: "ws-pace-row" }, h("span", { class: "ws-mini-label" }, "Pace"), paceEl),
        h("div", { class: "field" },
          h("label", { class: "field-label", for: "ws-run-hr" }, "Avg HR", h("small", { class: "ws-unit" }, " opt.")),
          h("input", { id: "ws-run-hr", class: "input input-num", type: "text", inputmode: "numeric", autocomplete: "off", placeholder: "bpm", value: r.avgHr ?? "", onInput: (e) => { r.avgHr = parseNum(e.target.value); persist(); } }),
        ),
      ),
      stepper({ id: "ws-run-rpe", label: "RPE", value: r.rpe, step: 1, min: 1, max: 10, inputmode: "numeric", placeholder: "–", onSet: (v) => { r.rpe = v; persist(); } }),
    );
    fill();
    return card;
  }

  // ---- conditioning --------------------------------------------------------------------------
  function condCard(ci, block = null) {
    const c = live.conditioning[ci];
    const t = c.target || {};
    const pre = `ws-c${ci}`;
    const head = [FORMAT_LABEL[c.format] || "Conditioning", t.minutes ? `${t.minutes} min` : null, t.rounds && c.format !== "AMRAP" ? plural(t.rounds, "round") : null, t.timeCapMin ? `cap ${t.timeCapMin} min` : null, t.targetRpe ? `RPE ${t.targetRpe}` : null].filter(Boolean);
    const res = c.result || (c.result = {});
    const numField = (id, label, key, placeholder) => h("div", { class: "field" },
      h("label", { class: "field-label", for: id }, label),
      h("input", { id, class: "input input-num", type: "text", inputmode: "numeric", autocomplete: "off", placeholder, value: res[key] ?? "", onInput: (e) => { res[key] = parseNum(e.target.value); persist(); }, onFocus: (e) => safe(() => e.target.select(), null) }),
    );
    const timed = TIMED_FORMATS.has(c.format);
    const card = h("article", { class: ["ws-card", "ws-block", c.done && "is-complete"], id: pre });
    const fill = () => replaceChildren(card,
      h("div", { class: "ws-block-head" },
        (block?.items || []).length
          ? h("ul", { class: "plain-list movements ws-moves" }, block.items.map((it) => h("li", {},
            [it.reps ? `${it.reps}` : null, it.calories ? `${it.calories} cal` : null, it.distanceM ? `${it.distanceM} m` : null, it.durationSec ? `${it.durationSec} s` : null].some(Boolean)
              ? h("span", { class: "mv-amt num" }, [it.reps ? `${it.reps}` : null, it.calories ? `${it.calories} cal` : null, it.distanceM ? `${it.distanceM} m` : null, it.durationSec ? `${it.durationSec} s` : null].filter(Boolean).join(" "))
              : null,
            h("span", { class: "li-name" }, it.name || exerciseName(catalog, it.exerciseId)),
            it.loadKg ? h("span", { class: "li-detail num" }, ` · ${fmtKg(it.loadKg)} kg`) : null,
          )))
          : h("div", { class: "ws-ex-text" }, h("p", { class: "ws-desc" }, c.description || head[0])),
        blockCheck(`${pre}-check`, c.done, c.done ? `${head[0]} done. Tap to undo` : `${head[0]} done`, () => {
          showError("");
          c.done = !c.done;
          persist();
          say(c.done ? `${head[0]} done` : `${head[0]} not done`);
          card.classList.toggle("is-complete", c.done);
          fill();
          refreshStatus();
          focusSoon(`${pre}-check`);
        }),
      ),
      t.scaling ? h("p", { class: "ws-hint" }, h("strong", {}, "Scaling "), t.scaling) : null,
      c.format === "AMRAP"
        ? h("div", { class: "ws-grid" }, numField(`${pre}-rounds`, "Rounds", "rounds", "0"), numField(`${pre}-reps`, "+ Reps", "reps", "0"))
        : timed
          ? h("div", { class: "ws-grid" }, clockInputs(`${pre}-time`, res.timeSec, "Time", (v) => { res.timeSec = v; persist(); }), numField(`${pre}-rounds`, "Rounds", "rounds", t.rounds ? String(t.rounds) : "0"))
          : h("div", { class: "ws-grid" }, numField(`${pre}-rounds`, "Rounds", "rounds", t.rounds ? String(t.rounds) : "0"), numField(`${pre}-cal`, "Calories", "calories", "opt.")),
      stepper({ id: `${pre}-rpe`, label: "RPE", value: c.rpe, step: 1, min: 1, max: 10, inputmode: "numeric", placeholder: "–", onSet: (v) => { c.rpe = v; persist(); } }),
      h("div", { class: "check-row" },
        h("label", { class: "check", for: `${pre}-scaled` }, h("input", { id: `${pre}-scaled`, type: "checkbox", checked: c.scaled, onChange: (e) => { c.scaled = e.target.checked; persist(); } }), h("span", {}, "Scaled")),
        timed || t.timeCapMin ? h("label", { class: "check", for: `${pre}-capped` }, h("input", { id: `${pre}-capped`, type: "checkbox", checked: res.completed === false, onChange: (e) => { res.completed = !e.target.checked; persist(); } }), h("span", {}, "Hit the time cap")) : null,
      ),
      h("div", { class: "ws-fb" },
        h("span", { class: "ws-mini-label", "aria-hidden": "true" }, "How did it feel?"),
        feedbackControl({ id: `${pre}-fb`, label: head[0], value: c.feedback, onChange: (v) => { c.feedback = v; persist(); } }),
      ),
    );
    fill();
    return card;
  }

  // ---- wrap-up -------------------------------------------------------------------------------
  function wrapUp() {
    const discardHost = h("div", { class: "ws-discard" });
    const discardBtn = button({
      id: "ws-discard",
      label: "Discard workout",
      icon: "trash",
      kind: "danger-ghost",
      small: true,
      onClick: () => inlineConfirm(discardHost, {
        text: "Discard this workout? Everything you entered is deleted and nothing is logged.",
        confirmLabel: "Discard workout",
        idPrefix: "ws-discard",
        onConfirm: () => {
          finished = true;
          discardLiveDraft(live.planId, live.workoutId);
          sheet.close();
          toast({ text: `Discarded · ${live.title}` });
        },
      }),
    });
    discardHost.appendChild(discardBtn);
    const elapsedMin = Math.round((Date.now() - live.startedAt) / 60000);
    return h("section", { class: "ws-wrap", "aria-labelledby": "ws-wrap-title" },
      h("h3", { class: "ws-wrap-title", id: "ws-wrap-title" }, "Wrap-up"),
      stepper({ id: "ws-srpe", label: "Session RPE", value: live.sessionRpe, step: 1, min: 1, max: 10, inputmode: "numeric", placeholder: "–", onSet: (v) => { live.sessionRpe = v; persist(); } }),
      h("div", { class: "ws-grid" },
        h("div", { class: "field" },
          h("label", { class: "field-label", for: "ws-minutes" }, "Minutes"),
          h("input", { id: "ws-minutes", class: "input input-num", type: "text", inputmode: "numeric", autocomplete: "off", placeholder: elapsedMin >= 5 ? String(elapsedMin) : String(live.plannedMin ?? ""), value: live.durationMin ?? "", onInput: (e) => { live.durationMin = parseNum(e.target.value); persist(); } }),
        ),
        h("div", { class: "field" },
          h("label", { class: "field-label", for: "ws-date" }, "Date"),
          h("input", { id: "ws-date", class: "input", type: "date", value: live.date, max: ctx.today(), onInput: (e) => { live.date = e.target.value; persist(); } }),
        ),
      ),
      h("p", { class: "field-hint" }, "Leave minutes empty to use the timer."),
      h("div", { class: "field" },
        h("label", { class: "field-label", for: "ws-notes" }, "Notes"),
        h("textarea", { id: "ws-notes", class: "input textarea", rows: "2", placeholder: "Anything the coach should know?", onInput: (e) => { live.notes = e.target.value; persist(); } }, live.notes || ""),
      ),
      painEdit(),
      discardHost,
    );
  }

  function painEdit() {
    return h("div", { class: "pain-edit" },
      h("span", { class: "field-label" }, "Pain or niggles"),
      live.pain.map((p, pi) => h("div", { class: "pain-row" },
        h("input", { id: `ws-pain-${pi}-area`, class: "input", value: p.area, placeholder: "Area, e.g. knee", "aria-label": "Pain area", onInput: (e) => { p.area = e.target.value; persist(); } }),
        h("select", { id: `ws-pain-${pi}-score`, class: "input select input-num", "aria-label": "Pain score out of 10", onChange: (e) => { p.score = Number(e.target.value); persist(); } },
          Array.from({ length: 11 }, (_, n) => h("option", { value: String(n), selected: Number(p.score) === n }, `${n}/10`))),
        h("select", { id: `ws-pain-${pi}-when`, class: "input select", "aria-label": "When", onChange: (e) => { p.when = e.target.value; persist(); } },
          PAIN_WHEN.map(([v, l]) => h("option", { value: v, selected: p.when === v }, l))),
        button({ id: `ws-pain-${pi}-remove`, icon: "close", kind: "ghost", small: true, ariaLabel: "Remove pain entry", onClick: () => { live.pain.splice(pi, 1); persist(); render(); } }),
      )),
      button({ id: "ws-pain-add", label: "Add pain entry", icon: "plus", kind: "quiet", small: true, onClick: () => { live.pain.push({ area: "", score: 2, when: "during" }); persist(); render(`ws-pain-${live.pain.length - 1}-area`); } }),
    );
  }

  // ---- finish --------------------------------------------------------------------------------
  function unticked() {
    const sets = live.strength.reduce((a, e) => a + e.sets.filter((s) => !s.done).length, 0);
    const blocks = [live.run, ...live.conditioning].filter((b) => b && !b.done).length;
    return { sets, blocks };
  }

  async function finish({ force = false } = {}) {
    if (saving) return;
    showError("");
    const input = core.liveSessionInput(live, { now: Date.now() });
    const ticked = checklistNotes();
    if (ticked) input.notes = [input.notes, ticked].filter(Boolean).join("\n");
    if (!input.date) {
      showError("Pick a date in Wrap-up.");
      focusSoon("ws-date");
      return;
    }
    if (!input.strength.length && !input.run && !input.conditioning.length) {
      showError("Nothing is ticked yet. Tick the sets you did, or Close to carry on later.");
      return;
    }
    const left = unticked();
    if (!force && (left.sets || left.blocks)) {
      confirming = true;
      const what = [left.sets ? plural(left.sets, "set") : null, left.blocks ? plural(left.blocks, "block") : null].filter(Boolean).join(" and ");
      replaceChildren(actionsEl, h("div", { class: "confirm ws-confirm", role: "group", "aria-label": "Finish with unticked work" },
        h("p", { class: "confirm-text" }, `${what} not ticked. ${left.sets + left.blocks === 1 ? "It won't" : "They won't"} be logged, and the workout is saved as partial.`),
        h("div", { class: "confirm-actions" },
          button({ id: "ws-finish-back", label: "Keep going", kind: "ghost", onClick: () => { footerDefault(); focusSoon("ws-finish"); } }),
          button({ id: "ws-finish-anyway", label: "Finish anyway", kind: "primary", onClick: () => finish({ force: true }) }),
        ),
      ));
      requestAnimationFrame(() => document.getElementById("ws-finish-back")?.focus());
      return;
    }
    saving = true;
    actionsEl.querySelectorAll("button").forEach((b) => { b.disabled = true; });
    try {
      await saveLoggedSession(ctx, input, { view: true, review: true });
      finished = true;
      discardLiveDraft(live.planId, live.workoutId);
      sheet.close();
    } catch (err) {
      saving = false;
      showError(errorText(coach, err));
      if (confirming) footerDefault();
      actionsEl.querySelectorAll("button").forEach((b) => { b.disabled = false; });
    }
  }

  function onClose() {
    clearInterval(timer);
    vv?.removeEventListener("resize", onVV);
    window.removeEventListener("pagehide", onHide);
    if (finished) return;
    if (!touched && !resumed && Date.now() - live.startedAt < 120000) {
      // opened and closed without entering anything: not started
      discardLiveDraft(live.planId, live.workoutId);
      return;
    }
    putDraft(live);
    notify();
    actionToast({ text: `Kept · ${live.title} · resume it from Plan`, actions: [], timeout: 5000 });
  }

  footerDefault();
  render();
  if (resumed) say(`Resumed ${live.title}`);
}
