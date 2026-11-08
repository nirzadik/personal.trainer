// Owner: Agent D (v2 exercise feedback: Agent F). History tab: week-grouped log, filters, session detail sheet,
// manual add/edit form with optional Easy / Fine / Hard feedback per exercise and metcon.

import {
  h, icon, button, append, replaceChildren, segmented, typePill, pill, emptyState, errorLine, inlineConfirm,
  openSheet, toast, createTicker, fmtElapsed, fmtDate, dateParts, fmtWeekRange, fmtKg, fmtKm, fmtPace, fmtClock,
  plural, safe, lsGet, lsSet, errorText, addDays, TYPE_LABEL,
} from "./components.js";
import { renderMarkdown, plainText } from "./markdown.js";
import { removeSession, markDone, exerciseName, equipmentSet, prettifyId } from "./ops.js";
import { saveLoggedSession, workoutDraft, feedbackControl, feedbackLabel } from "./quicklog.js";

const FILTER_KEY = "pt.historyFilter";
const FILTERS = [
  { value: "all", label: "All" },
  { value: "strength", label: "Strength" },
  { value: "run", label: "Run" },
  { value: "conditioning", label: "HIIT" },
];

/**
 * Mount the History tab.
 * @param {HTMLElement} el
 * @param {any} ctx
 * @returns {{ show: () => void, teardown: () => void }}
 */
export function mountHistory(el, ctx) {
  const { store } = ctx;
  const unsubs = [];
  let filter = FILTERS.some((f) => f.value === lsGet(FILTER_KEY)) ? lsGet(FILTER_KEY) : "all";

  const addBtn = button({ id: "history-add", label: "Add workout", icon: "plus", kind: "primary", small: true, onClick: () => openForm(ctx, null) });
  const countEl = h("p", { class: "view-sub num" });
  const head = h("div", { class: "view-head" },
    h("div", { class: "view-head-text" }, h("h1", { class: "view-title" }, "History"), countEl),
    store ? addBtn : null,
  );
  const filters = segmented({
    id: "history-filter",
    label: "Filter workouts",
    options: FILTERS,
    value: filter,
    onChange: (v) => {
      filter = v;
      lsSet(FILTER_KEY, v);
      renderList();
    },
  });
  filters.classList.add("filter-row");
  const listEl = h("div", { class: "history-list" });
  append(el, [head, filters, listEl]);

  unsubs.push(ctx.on(["sessions", "profile"], () => renderList()));

  function matches(s) {
    if (filter === "all") return true;
    if (filter === "strength") return s.type === "strength" || (s.type === "hybrid" && s.strength?.length > 0);
    if (filter === "run") return s.type === "run" || Boolean(s.run);
    if (filter === "conditioning") return s.type === "conditioning" || (s.type === "hybrid" && s.conditioning?.length > 0);
    return true;
  }

  function renderList() {
    if (!store) {
      countEl.textContent = "";
      replaceChildren(listEl, emptyState({ title: "Your log needs an account", text: "Sign in to Claude to save and see your workouts.", icon: "history" }));
      return;
    }
    if (!ctx.data.loaded.sessions) {
      countEl.textContent = "Loading…";
      replaceChildren(listEl, h("div", { class: "skeleton-list", "aria-hidden": "true" }, [0, 1, 2].map(() => h("div", { class: "skeleton-card" }))));
      return;
    }
    const all = sortSessions(ctx.data.sessions);
    const doneCount = all.filter((s) => s.status !== "missed").length;
    countEl.textContent = all.length ? `${plural(doneCount, "workout")} logged` : "";
    const items = all.filter(matches);
    if (!all.length) {
      replaceChildren(listEl, emptyState({
        title: "No workouts yet",
        text: "Tell your coach what you did (\"did 100×5,5,4 squats\") or add a workout by hand.",
        icon: "history",
        actions: [
          button({ id: "history-empty-add", label: "Add workout", icon: "plus", kind: "secondary", onClick: () => openForm(ctx, null) }),
          button({ id: "history-empty-coach", label: "Tell the coach", kind: "ghost", onClick: () => ctx.chat?.prefill("Today I did ") }),
        ],
      }));
      return;
    }
    if (!items.length) {
      replaceChildren(listEl, emptyState({ title: `No ${FILTERS.find((f) => f.value === filter)?.label.toLowerCase()} workouts`, text: "Try another filter." }));
      return;
    }
    const today = ctx.today();
    const thisWeek = ctx.weekStartOf(today);
    const groups = new Map();
    for (const s of items) {
      const wk = ctx.weekStartOf(s.date);
      if (!groups.has(wk)) groups.set(wk, []);
      groups.get(wk).push(s);
    }
    replaceChildren(listEl, [...groups.entries()].map(([wk, ss]) => {
      const label = wk === thisWeek ? "This week" : wk === addDays(thisWeek, -7) ? "Last week" : `Week of ${fmtWeekRange(wk)}`;
      return h("section", { class: "week", "aria-label": label },
        h("header", { class: "week-head" },
          h("h2", { class: "week-title" }, label),
          h("p", { class: "week-sum num" }, weekSummary(ss)),
        ),
        h("ul", { class: "cards" }, ss.map((s) => h("li", {}, sessionCard(ctx, s)))),
      );
    }));
  }

  ctx.history = {
    openSession: (id) => {
      const open = () => {
        const s = ctx.data.sessions.find((x) => x.id === id);
        if (s) openDetail(ctx, id);
        else if (store) Promise.resolve(store.sessions.get(id)).then((x) => x && openDetail(ctx, id, x)).catch(() => {});
      };
      if (ctx.data.loaded.sessions) open();
      else setTimeout(open, 300);
    },
    openAdd: () => openForm(ctx, null),
  };

  renderList();
  return {
    show() {},
    teardown() {
      unsubs.splice(0).forEach((u) => safe(u, null));
    },
  };
}

function sortSessions(list) {
  return [...(list || [])].sort((a, b) => String(b.date).localeCompare(String(a.date)) || String(b.createdAt || "").localeCompare(String(a.createdAt || "")));
}

function weekSummary(ss) {
  const done = ss.filter((s) => s.status !== "missed");
  const km = done.reduce((t, s) => t + (Number(s.run?.distanceKm) || 0), 0);
  const prs = done.reduce((t, s) => t + (s.prs?.length || 0), 0);
  const parts = [plural(done.length, "session")];
  if (km > 0) parts.push(`${fmtKm(km)} run`);
  if (prs) parts.push(plural(prs, "PR"));
  const missed = ss.length - done.length;
  if (missed) parts.push(`${missed} missed`);
  return parts.join(" · ");
}

/** Top work set of an exercise: heaviest load, then most reps. */
function topSet(ex) {
  const work = (ex.sets || []).filter((s) => s.type !== "warmup");
  const sets = work.length ? work : ex.sets || [];
  let best = null;
  for (const s of sets) {
    if (!best || (Number(s.loadKg) || 0) > (Number(best.loadKg) || 0) || ((Number(s.loadKg) || 0) === (Number(best.loadKg) || 0) && (s.reps || 0) > (best.reps || 0))) best = s;
  }
  return best;
}

function setText(s) {
  if (!s) return "";
  const load = s.bodyweight || s.loadKg == null ? (s.loadKg ? `BW+${fmtKg(s.loadKg)}` : "BW") : fmtKg(s.loadKg);
  return `${load}×${s.reps ?? "?"}`;
}

/** One-line metrics for a session card. */
export function sessionMetrics(ctx, s) {
  const lines = [];
  if (s.status === "missed") return [`Missed${s.missedReason ? ` · ${s.missedReason}` : ""}`];
  if (s.run) {
    const r = s.run;
    const pace = r.avgPaceSecPerKm || safe(() => ctx.core.paceSecPerKm(r.distanceKm, r.durationSec), null);
    lines.push([fmtKm(r.distanceKm), pace ? fmtPace(ctx.core, pace) : "", r.durationSec ? fmtClock(r.durationSec) : ""].filter(Boolean).join(" · "));
  }
  if (s.strength?.length) {
    const parts = s.strength.slice(0, 3).map((ex) => `${shortName(exerciseName(ctx.catalog, ex.exerciseId, ex.name))} ${setText(topSet(ex))}`);
    if (s.strength.length > 3) parts.push(`+${s.strength.length - 3} more`);
    lines.push(parts.join(" · "));
  }
  for (const c of s.conditioning || []) lines.push(metconText(c));
  return lines.filter(Boolean);
}

function shortName(name) {
  return String(name || "").replace(/^(Barbell|Dumbbell)\s+/i, (m) => (m.toLowerCase().startsWith("d") ? "DB " : "")).replace(/\s*\(.*?\)\s*/g, " ").trim();
}

function metconText(c) {
  const r = c.result || {};
  const fmt = formatLabel(c.format);
  let res = "";
  if (r.timeSec) res = fmtClock(r.timeSec);
  else if (r.rounds != null) res = `${r.rounds} rds${r.reps ? ` + ${r.reps}` : ""}`;
  else if (r.reps != null) res = `${r.reps} reps`;
  if (r.calories) res = [res, `${r.calories} cal`].filter(Boolean).join(" · ");
  if (r.completed === false) res = [res, "capped"].filter(Boolean).join(" · ");
  return [fmt, res, c.scaled ? "scaled" : "Rx"].filter(Boolean).join(" · ");
}

function formatLabel(f) {
  return { AMRAP: "AMRAP", EMOM: "EMOM", FOR_TIME: "For time", RFT: "Rounds for time", INTERVALS: "Intervals", TABATA: "Tabata", CHIPPER: "Chipper" }[f] || f || "Metcon";
}

function maxPain(s) {
  return (s.pain || []).reduce((m, p) => (Number(p.score) > (m?.score ?? -1) ? p : m), null);
}

function painKind(score) {
  return score >= 6 ? "pain" : score >= 3 ? "warn" : "ok";
}

function sessionCard(ctx, s) {
  const dp = dateParts(s.date);
  const pain = maxPain(s);
  const metrics = sessionMetrics(ctx, s);
  const snippet = plainText(s.coachComment || "");
  return h("button", {
    type: "button",
    class: ["session-card", s.status === "missed" && "is-missed"],
    id: `session-${s.id}`,
    onClick: () => openDetail(ctx, s.id),
  },
    h("span", { class: "date-tab", "aria-hidden": "true" },
      h("span", { class: "date-wd" }, dp.wd),
      h("span", { class: "date-day num" }, dp.day),
      h("span", { class: "date-mon" }, dp.mon),
    ),
    h("span", { class: "session-main" },
      h("span", { class: "session-top" },
        h("span", { class: "session-title" }, s.title || TYPE_LABEL[s.type] || "Workout"),
        h("span", { class: "visually-hidden" }, `, ${fmtDate(s.date)}`),
      ),
      h("span", { class: "session-tags" },
        typePill(s.type),
        s.status === "partial" ? pill("Partial", "neutral") : null,
        s.prs?.length ? h("span", { class: "pill pill-pr" }, icon("pr", { size: 14 }), s.prs.length > 1 ? `${s.prs.length} PRs` : "PR") : null,
        pain && pain.score > 0 ? h("span", { class: `pill pill-${painKind(pain.score)}` }, `${prettifyId(pain.area)} ${pain.score}/10`) : null,
      ),
      feedbackChips(ctx, s),
      metrics.map((m) => h("span", { class: "session-metric num" }, m)),
      snippet ? h("span", { class: "session-comment" }, snippet) : null,
    ),
  );
}

/** Feedback chips for a session card: one per tagged exercise or metcon ("Squat · Hard"), at most 4. */
function feedbackChips(ctx, s) {
  if (s.status === "missed") return null;
  const tagged = [
    ...(s.strength || []).filter((ex) => feedbackLabel(ex.feedback)).map((ex) => [shortName(exerciseName(ctx.catalog, ex.exerciseId, ex.name)), ex.feedback]),
    ...(s.conditioning || []).filter((c) => feedbackLabel(c.feedback)).map((c) => [formatLabel(c.format), c.feedback]),
  ];
  if (!tagged.length) return null;
  const shown = tagged.slice(0, 4);
  return h("span", { class: "fb-chips", "aria-label": `How it felt: ${tagged.map(([n, f]) => `${n} ${f}`).join(", ")}` },
    shown.map(([name, fb]) => h("span", { class: `fb-chip fb-chip-${fb}`, "aria-hidden": "true" }, h("span", { class: "fb-chip-name" }, name), ` · ${feedbackLabel(fb)}`)),
    tagged.length > shown.length ? h("span", { class: "fb-chip fb-chip-more", "aria-hidden": "true" }, `+${tagged.length - shown.length}`) : null,
  );
}

// ---------------------------------------------------------------------------------------------
// Detail sheet

function openDetail(ctx, id, initial = null) {
  const { store, coach } = ctx;
  let commentJob = null; // { ctl, ticker, error }
  let localComment = null;
  let off = () => {};

  const sheet = openSheet({
    title: "Workout",
    onClose: () => {
      off();
      commentJob?.ctl.abort();
    },
    build: (api) => {
      const content = h("div", { class: "detail" });
      const render = () => {
        const s = ctx.data.sessions.find((x) => x.id === id) || initial;
        if (!s) {
          replaceChildren(content, emptyState({ title: "This workout was removed", text: "It's no longer in your log." }));
          api.footer.hidden = true;
          return;
        }
        api.setTitle(s.title || TYPE_LABEL[s.type] || "Workout");
        replaceChildren(content, detailBody(ctx, s, localComment, commentJob));
        renderFooter(api, s);
      };
      off = ctx.on(["sessions"], render);
      api.rerender = render;
      setTimeout(render, 0);
      return content;
    },
  });

  function renderFooter(api, s) {
    const status = ctx.coachStatus();
    const canComment = Boolean(coach) && status.available !== false;
    const row = h("div", { class: "sheet-actions" });
    append(row, [
      button({ id: "detail-edit", label: "Edit", icon: "edit", kind: "secondary", small: true, onClick: () => { sheet.close(); openForm(ctx, s); } }),
      canComment ? button({
        id: "detail-comment",
        label: s.coachComment || localComment ? "New comment" : "Ask coach",
        icon: "coach",
        kind: "secondary",
        small: true,
        disabled: Boolean(commentJob && !commentJob.error),
        onClick: () => askComment(api, s),
      }) : null,
      button({
        id: "detail-delete",
        label: "Delete",
        icon: "trash",
        kind: "danger-ghost",
        small: true,
        onClick: () => inlineConfirm(row, {
          text: "Delete this workout? If it counted toward your plan, it's taken back out of the rotation.",
          confirmLabel: "Delete",
          idPrefix: "detail-delete",
          onConfirm: async () => {
            try {
              const res = await removeSession(ctx, s.id);
              sheet.close();
              toast({ text: "Workout deleted", action: { label: "Undo", fn: () => res.undo() } });
            } catch (err) {
              toast({ text: errorText(coach, err), kind: "error" });
            }
          },
        }),
      }),
    ]);
    replaceChildren(api.footer, row);
    api.footer.hidden = false;
  }

  async function askComment(api, s) {
    if (!coach || (commentJob && !commentJob.error)) return;
    const ctl = new AbortController();
    const ticker = createTicker(() => api.rerender?.());
    commentJob = { ctl, ticker, error: null, t0: Date.now() };
    ticker.start();
    api.rerender?.();
    try {
      const text = await coach.commentOnSession(s.id, { signal: ctl.signal });
      if (typeof text === "string" && text) localComment = text;
      else if (text?.text) localComment = text.text;
      commentJob = null;
    } catch (err) {
      commentJob = err?.code === "cancelled" ? null : { error: err?.code || "upstream_error", retry: () => askComment(api, s) };
    } finally {
      ticker.stop();
    }
    if (sheet.dialog.isConnected) api.rerender?.();
  }
}

function detailBody(ctx, s, localComment, commentJob) {
  const { core, coach } = ctx;
  const facts = [
    ["Date", fmtDate(s.date)],
    s.durationMin ? ["Duration", `${s.durationMin} min`] : null,
    s.readiness ? ["Readiness", `${s.readiness}/5`] : null,
    s.sessionRpe ? ["Session RPE", `${s.sessionRpe}/10`] : null,
  ].filter(Boolean);
  const parts = [];
  parts.push(h("div", { class: "detail-tags" },
    typePill(s.type),
    s.status !== "done" ? pill(s.status === "missed" ? `Missed${s.missedReason ? ` · ${s.missedReason}` : ""}` : "Partial", "neutral") : null,
    s.createdBy === "manual" ? pill("Added by hand", "neutral") : null,
  ));
  parts.push(h("dl", { class: "facts" }, facts.map(([k, v]) => h("div", { class: "fact" }, h("dt", {}, k), h("dd", { class: "num" }, v)))));

  if (s.prs?.length) {
    parts.push(h("section", { class: "detail-sec" },
      h("h3", { class: "sec-title" }, "Personal records"),
      h("ul", { class: "pr-list" }, s.prs.map((p) => h("li", { class: "pr-item" },
        icon("pr", { size: 16 }),
        h("span", {}, prText(ctx, p)),
      ))),
    ));
  }

  if (s.strength?.length) {
    parts.push(h("section", { class: "detail-sec" },
      h("h3", { class: "sec-title" }, "Strength"),
      s.strength.map((ex) => {
        const e1 = safe(() => core.sessionE1rm(ex.sets || []), null);
        return h("div", { class: "ex-block" },
          h("div", { class: "ex-head" },
            h("h4", { class: "ex-name" }, exerciseName(ctx.catalog, ex.exerciseId, ex.name)),
            feedbackLabel(ex.feedback) ? h("span", { class: `fb-chip fb-chip-${ex.feedback}` }, `Felt ${feedbackLabel(ex.feedback).toLowerCase()}`) : null,
            e1?.value ? h("span", { class: "ex-e1rm num" }, `e1RM ${fmtKg(Math.round(e1.value * 2) / 2)} kg`) : null,
          ),
          h("div", { class: "table-scroll" },
            h("table", { class: "sets-table" },
              h("thead", {}, h("tr", {}, h("th", { scope: "col" }, "Set"), h("th", { scope: "col" }, "kg"), h("th", { scope: "col" }, "Reps"), h("th", { scope: "col" }, "RIR"))),
              h("tbody", {}, (() => {
                let n = 0;
                return (ex.sets || []).map((st) => {
                  const warm = st.type === "warmup";
                  if (!warm) n += 1;
                  return h("tr", { class: warm ? "is-warmup" : "" },
                    h("td", {}, warm ? "W" : String(n)),
                    h("td", { class: "num" }, st.bodyweight ? (st.loadKg ? `BW+${fmtKg(st.loadKg)}` : "BW") : fmtKg(st.loadKg) || "–"),
                    h("td", { class: "num" }, st.reps ?? "–"),
                    h("td", { class: "num" }, st.rir ?? "–"),
                  );
                });
              })()),
            ),
          ),
        );
      }),
    ));
  }

  if (s.run) {
    const r = s.run;
    const pace = r.avgPaceSecPerKm || safe(() => core.paceSecPerKm(r.distanceKm, r.durationSec), null);
    const runFacts = [
      ["Type", prettifyId(r.runType || "run")],
      r.distanceKm ? ["Distance", fmtKm(r.distanceKm)] : null,
      r.durationSec ? ["Time", fmtClock(r.durationSec)] : null,
      pace ? ["Pace", fmtPace(core, pace)] : null,
      r.avgHr ? ["Avg HR", `${r.avgHr} bpm`] : null,
      r.elevationM ? ["Elevation", `${r.elevationM} m`] : null,
      r.rpe ? ["RPE", `${r.rpe}/10`] : null,
    ].filter(Boolean);
    parts.push(h("section", { class: "detail-sec" },
      h("h3", { class: "sec-title" }, "Run"),
      h("dl", { class: "facts" }, runFacts.map(([k, v]) => h("div", { class: "fact" }, h("dt", {}, k), h("dd", { class: "num" }, v)))),
      r.splits?.length ? h("div", { class: "table-scroll" },
        h("table", { class: "sets-table splits" },
          h("thead", {}, h("tr", {}, h("th", { scope: "col" }, "km"), h("th", { scope: "col" }, "Pace"))),
          h("tbody", {}, r.splits.map((sp, i) => h("tr", {}, h("td", { class: "num" }, String(i + 1)), h("td", { class: "num" }, fmtPace(core, sp))))),
        )) : null,
    ));
  }

  for (const c of s.conditioning || []) {
    const r = c.result || {};
    const resFacts = [
      ["Format", formatLabel(c.format)],
      r.timeSec ? ["Time", fmtClock(r.timeSec)] : null,
      r.rounds != null ? ["Rounds", String(r.rounds)] : null,
      r.reps != null ? ["Reps", String(r.reps)] : null,
      r.calories ? ["Calories", String(r.calories)] : null,
      r.completed != null ? ["Finished", r.completed ? "Yes" : "Capped"] : null,
      ["Scaling", c.scaled ? "Scaled" : "As written"],
      c.rpe ? ["RPE", `${c.rpe}/10`] : null,
      feedbackLabel(c.feedback) ? ["Felt", feedbackLabel(c.feedback)] : null,
    ].filter(Boolean);
    parts.push(h("section", { class: "detail-sec" },
      h("h3", { class: "sec-title" }, "Conditioning"),
      c.description ? h("p", { class: "detail-text" }, c.description) : null,
      h("dl", { class: "facts" }, resFacts.map(([k, v]) => h("div", { class: "fact" }, h("dt", {}, k), h("dd", { class: "num" }, v)))),
      c.notes ? h("p", { class: "detail-text muted" }, c.notes) : null,
    ));
  }

  if (s.pain?.length) {
    parts.push(h("section", { class: "detail-sec" },
      h("h3", { class: "sec-title" }, "Pain"),
      h("div", { class: "detail-tags" }, s.pain.map((p) => pill(`${prettifyId(p.area)} ${p.score}/10${p.when ? ` · ${String(p.when).replace("_", " ")}` : ""}`, painKind(Number(p.score))))),
    ));
  }

  if (s.notes) {
    parts.push(h("section", { class: "detail-sec" }, h("h3", { class: "sec-title" }, "Notes"), h("p", { class: "detail-text" }, s.notes)));
  }

  const comment = s.coachComment || localComment;
  const commentSec = h("section", { class: "detail-sec coach-comment" }, h("h3", { class: "sec-title" }, "Coach"));
  if (commentJob && !commentJob.error) {
    commentSec.appendChild(h("div", { class: "thinking" },
      h("span", { class: "pulse", "aria-hidden": "true" }),
      h("span", { class: "thinking-label" }, "Coach is writing…"),
      h("span", { class: "thinking-time num" }, fmtElapsed(Date.now() - commentJob.t0)),
      button({ id: "detail-comment-stop", label: "Stop", icon: "stop", kind: "stop", small: true, onClick: () => commentJob.ctl.abort() }),
    ));
  } else if (comment) {
    commentSec.appendChild(h("div", { class: "md" }, renderMarkdown(comment)));
  } else {
    commentSec.appendChild(h("p", { class: "detail-text muted" }, "No comment yet. Ask the coach for a quick take on this session."));
  }
  if (commentJob?.error) commentSec.appendChild(errorLine({ text: errorText(coach, commentJob.error), onRetry: commentJob.retry }));
  parts.push(commentSec);
  return parts;
}

function prText(ctx, p) {
  const name = exerciseName(ctx.catalog, p.exerciseId, "");
  const fmtVal = (v) => (p.kind === "pace" ? fmtPace(ctx.core, v) : p.kind === "distance" ? fmtKm(v) : `${fmtKg(Math.round(v * 2) / 2)} kg`);
  const kind = { e1rm: "estimated 1RM", reps_at_load: "reps at load", distance: "longest run", pace: "fastest pace" }[p.kind] || p.kind;
  const prev = p.previous != null ? ` (was ${fmtVal(p.previous)})` : "";
  if (p.kind === "reps_at_load") return `${name}: ${p.value} reps${p.previous != null ? ` (was ${p.previous})` : ""}`;
  return `${name ? `${name} ` : ""}${kind}: ${fmtVal(p.value)}${prev}`;
}

// ---------------------------------------------------------------------------------------------
// Add / edit form

const RUN_TYPES = ["easy", "long", "tempo", "threshold", "intervals", "hills", "fartlek", "recovery", "strides", "race"];
const COND_FORMATS = ["AMRAP", "EMOM", "FOR_TIME", "RFT", "INTERVALS", "TABATA", "CHIPPER"];
const PAIN_WHEN = [["during", "During"], ["after", "After"], ["next_morning", "Next morning"]];

function formTypeOf(s) {
  if (!s) return "strength";
  if (s.type === "run" || (s.run && !s.strength?.length)) return "run";
  if (s.type === "conditioning" || (s.conditioning?.length && !s.strength?.length)) return "conditioning";
  return "strength";
}

function draftFrom(ctx, s) {
  const today = ctx.today();
  const run = s?.run || {};
  const c = s?.conditioning?.[0] || {};
  return {
    type: formTypeOf(s),
    title: s?.title || "",
    date: s?.date || today,
    status: s?.status === "partial" ? "partial" : "done",
    workoutRef: s?.workoutId && s?.planId ? `${s.planId}|${s.workoutId}` : "",
    durationMin: s?.durationMin ?? "",
    readiness: s?.readiness ?? null,
    sessionRpe: s?.sessionRpe ?? "",
    notes: s?.notes || "",
    pain: (s?.pain || []).map((p) => ({ area: p.area || "", score: p.score ?? 0, when: p.when || "during" })),
    strength: (s?.strength || []).map((ex) => ({
      exerciseId: ex.exerciseId || null,
      name: exerciseName(ctx.catalog, ex.exerciseId, ex.name),
      sets: (ex.sets || []).map((st) => ({ type: st.type || "work", loadKg: st.loadKg ?? "", reps: st.reps ?? "", rir: st.rir ?? "", bodyweight: Boolean(st.bodyweight) })),
      target: ex.target || null,
      feedback: ex.feedback || null,
    })),
    run: {
      runType: run.runType || "easy",
      distanceKm: run.distanceKm ?? "",
      duration: run.durationSec ? fmtClock(run.durationSec) : "",
      avgHr: run.avgHr ?? "",
      rpe: run.rpe ?? "",
      target: run.target || null,
    },
    condExtra: (s?.conditioning || []).slice(1),
    cond: {
      target: c.target || null,
      format: c.format || "AMRAP",
      description: c.description || "",
      rounds: c.result?.rounds ?? "",
      reps: c.result?.reps ?? "",
      time: c.result?.timeSec ? fmtClock(c.result.timeSec) : "",
      calories: c.result?.calories ?? "",
      completed: c.result?.completed ?? true,
      scaled: Boolean(c.scaled),
      rpe: c.rpe ?? "",
      feedback: c.feedback || null,
    },
  };
}

function num(v) {
  if (v === "" || v == null) return null;
  const n = Number(String(v).replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

function parseClock(ctx, str) {
  const t = String(str || "").trim();
  if (!t) return null;
  const viaCore = safe(() => ctx.core.parseDuration(t), null);
  if (Number.isFinite(viaCore) && viaCore > 0) return viaCore;
  const parts = t.split(":").map(Number);
  if (parts.some((p) => !Number.isFinite(p))) return null;
  if (parts.length === 1) return parts[0] * 60;
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  return parts[0] * 3600 + parts[1] * 60 + parts[2];
}

/**
 * Open the quick-log sheet for a workout of the agreed plan: the add form prefilled from
 * core.sessionFromWorkout (planned sets × target reps at the nextTarget load, run distance / time / RPE,
 * metcon format), with every section the workout has. Saving logs it and advances the rotation.
 * @param {any} ctx
 * @param {any} plan
 * @param {any} workout
 * @param {{ note?: string }} [opts] note: a line shown above the form (e.g. why "Done as planned" needs input)
 */
export function openWorkoutLog(ctx, plan, workout, { note = "" } = {}) {
  openForm(ctx, null, { plan, workout, note });
}

function planDraft(ctx, plan, workout) {
  const s = workoutDraft(ctx, plan, workout);
  const d = draftFrom(ctx, s);
  d.type = s.type;
  d.title = s.title;
  d.durationMin = s.durationMin ?? "";
  d.workoutRef = `${plan.id}|${workout.id}`;
  d.sections = [s.strength.length && "strength", s.run && "run", s.conditioning.length && "conditioning"].filter(Boolean);
  d.condExtra = (s.conditioning || []).slice(1).map(({ target, ...c }) => c);
  return d;
}

function openForm(ctx, existing, opts = {}) {
  const { store, core, catalog, coach } = ctx;
  if (!store) return;
  const fromPlan = opts.plan && opts.workout ? { plan: opts.plan, workout: opts.workout } : null;
  const draft = fromPlan ? planDraft(ctx, fromPlan.plan, fromPlan.workout) : draftFrom(ctx, existing);
  // A hybrid session (e.g. logged from the plan) edits every section it has; otherwise the type picker decides.
  const multi = fromPlan ? draft.sections
    : existing ? [existing.strength?.length && "strength", existing.run && "run", existing.conditioning?.length && "conditioning"].filter(Boolean) : [];
  const sectionsOf = () => (fromPlan || multi.length > 1 ? multi : [draft.type]);
  const isEdit = Boolean(existing);
  let picker = { open: !fromPlan && draft.strength.length === 0, query: "", allEquipment: false };
  let errorMsg = "";
  let saving = false;

  const sheet = openSheet({
    title: fromPlan ? `Log · ${fromPlan.workout.title || fromPlan.workout.id}` : isEdit ? "Edit workout" : "Add workout",
    id: "workout-form-sheet",
    build: (api) => {
      const form = h("form", { class: "wform", id: "workout-form", novalidate: true, onSubmit: (e) => { e.preventDefault(); save(); } });
      api.form = form;
      return form;
    },
  });
  const form = sheet.form;
  const saveBtn = button({ id: "wf-save", label: isEdit ? "Save changes" : fromPlan ? "Save" : "Save workout", icon: fromPlan ? "check" : null, kind: "primary", type: "submit", onClick: (e) => { e.preventDefault(); save(); } });
  const cancelBtn = button({ id: "wf-cancel", label: "Cancel", kind: "ghost", onClick: () => sheet.close() });
  const errEl = h("p", { class: "form-error", role: "alert", hidden: true });
  replaceChildren(sheet.footer, h("div", { class: "sheet-actions" }, errEl, cancelBtn, saveBtn));
  sheet.footer.hidden = false;

  function field(label, id, control, hint) {
    return h("div", { class: "field" }, h("label", { for: id, class: "field-label" }, label), control, hint ? h("p", { class: "field-hint" }, hint) : null);
  }

  function textInput(id, value, onInput, attrs = {}) {
    return h("input", { id, class: "input", type: "text", value: value ?? "", onInput: (e) => onInput(e.target.value), ...attrs });
  }

  function select(id, value, options, onChange) {
    return h("select", { id, class: "input select", onChange: (e) => onChange(e.target.value) },
      options.map(([v, l]) => h("option", { value: v, selected: String(v) === String(value ?? "") }, l)));
  }

  const rpeOptions = [["", "–"], ...Array.from({ length: 10 }, (_, i) => [String(i + 1), String(i + 1)])];

  function render(focusId) {
    const plan = ctx.agreedPlan();
    const workoutOptions = plan && !fromPlan ? [["", "Not from the plan"], ...plan.workouts.map((w) => [`${plan.id}|${w.id}`, `${w.id} · ${w.title}`])] : null;

    const typeSeg = fromPlan ? planHead() : multi.length > 1 ? null : segmented({
      id: "wf-type",
      label: "Workout type",
      options: [{ value: "strength", label: "Strength" }, { value: "run", label: "Run" }, { value: "conditioning", label: "HIIT" }],
      value: draft.type,
      onChange: (v) => {
        draft.type = v;
        render();
      },
    });

    const common = h("fieldset", { class: "fs" },
      h("legend", { class: "fs-legend" }, "Session"),
      h("div", { class: "grid-2" },
        field("Date", "wf-date", h("input", { id: "wf-date", class: "input", type: "date", value: draft.date, max: ctx.today(), onInput: (e) => { draft.date = e.target.value; } })),
        field("Minutes", "wf-duration", textInput("wf-duration", draft.durationMin, (v) => { draft.durationMin = v; }, { inputmode: "numeric", placeholder: "60" })),
      ),
      field("Title", "wf-title", textInput("wf-title", draft.title, (v) => { draft.title = v; }, { placeholder: defaultTitle(draft), autocomplete: "off" })),
      workoutOptions ? field("Plan workout", "wf-workout", select("wf-workout", draft.workoutRef, workoutOptions, (v) => {
        draft.workoutRef = v;
        const w = plan.workouts.find((x) => `${plan.id}|${x.id}` === v);
        if (w && !draft.title) {
          draft.title = w.title;
          const t = sheet.body.querySelector("#wf-title");
          if (t) t.value = w.title;
        }
      }), "Picking one marks it done in your rotation.") : null,
    );

    const typeSec = sectionsOf().map((sec) => (sec === "strength" ? strengthSection() : sec === "run" ? runSection() : condSection()));

    const how = h("fieldset", { class: "fs" },
      h("legend", { class: "fs-legend" }, "How it went"),
      h("div", { class: "field" },
        h("span", { class: "field-label", id: "wf-readiness-label" }, "Readiness before (1 = drained, 5 = great)"),
        segmented({
          id: "wf-readiness",
          label: "Readiness",
          options: [{ value: "", label: "–" }, ...[1, 2, 3, 4, 5].map((n) => ({ value: String(n), label: String(n) }))],
          value: draft.readiness == null ? "" : String(draft.readiness),
          onChange: (v) => { draft.readiness = v ? Number(v) : null; },
        }),
      ),
      h("div", { class: "grid-2" },
        field("Session RPE", "wf-srpe", select("wf-srpe", draft.sessionRpe, rpeOptions, (v) => { draft.sessionRpe = v; })),
        field("Status", "wf-status", select("wf-status", draft.status, [["done", "Done"], ["partial", "Partial"]], (v) => { draft.status = v; })),
      ),
      field("Notes", "wf-notes", h("textarea", { id: "wf-notes", class: "input textarea", rows: "3", placeholder: "How did it feel?", onInput: (e) => { draft.notes = e.target.value; } }, draft.notes)),
      painSection(),
    );

    replaceChildren(form, typeSeg, typeSec, common, how);
    if (fromPlan) sheet.body.classList.add("pl-quicklog");
    if (focusId) requestAnimationFrame(() => form.querySelector(`#${CSS.escape(focusId)}`)?.focus());
  }

  // ---- plan header -----------------------------------------------------------------------
  function planHead() {
    const w = fromPlan.workout;
    const idx = (fromPlan.plan.workouts || []).findIndex((x) => x.id === w.id);
    return h("div", { class: "pl-ql-head" },
      h("p", { class: "eyebrow" }, `From your plan · ${idx >= 0 ? `#${idx + 1}` : w.id}${w.type ? ` · ${TYPE_LABEL[w.type] || prettifyId(w.type)}` : ""}`),
      h("p", { class: "field-hint" }, opts.note || "Prefilled with today's targets. Change what differed, then save."),
    );
  }

  function strengthHint(t) {
    if (!t) return null;
    const rx = [`Plan ${t.sets} × ${t.reps || "?"}`, t.targetRir != null ? `@ RIR ${t.targetRir}` : null].filter(Boolean).join(" ");
    const load = t.loadKg != null ? `target ${fmtKg(t.loadKg)} kg${t.nextReps && t.nextReps !== t.reps ? ` × ${t.nextReps}` : ""}` : "pick a load";
    return h("p", { class: "field-hint pl-ql-target num", title: t.note || "" }, `${rx} · ${load}`);
  }

  // ---- strength --------------------------------------------------------------------------
  function strengthSection() {
    const rows = draft.strength.map((ex, ei) => h("div", { class: "ex-edit" },
      h("div", { class: "ex-edit-head" },
        h("span", { class: "ex-edit-name" }, ex.name || prettifyId(ex.exerciseId)),
        button({ id: `wf-ex-${ei}-remove`, icon: "close", kind: "ghost", small: true, ariaLabel: `Remove ${ex.name}`, onClick: () => { draft.strength.splice(ei, 1); render(); } }),
      ),
      strengthHint(ex.target),
      h("div", { class: "set-grid", role: "group", "aria-label": `${ex.name} sets` },
        h("span", { class: "set-h" }, "#"), h("span", { class: "set-h" }, "kg"), h("span", { class: "set-h" }, "Reps"), h("span", { class: "set-h" }, "RIR"), h("span", { class: "set-h", "aria-hidden": "true" }),
        ex.sets.map((st, si) => [
          h("button", {
            type: "button",
            class: ["set-n", st.type === "warmup" && "is-warmup"],
            id: `wf-ex-${ei}-set-${si}-type`,
            "aria-label": `Set ${si + 1}: ${st.type === "warmup" ? "warm-up" : "work"} set. Tap to toggle.`,
            onClick: () => { st.type = st.type === "warmup" ? "work" : "warmup"; render(`wf-ex-${ei}-set-${si}-type`); },
          }, st.type === "warmup" ? "W" : String(ex.sets.slice(0, si + 1).filter((x) => x.type !== "warmup").length)),
          h("input", { id: `wf-ex-${ei}-set-${si}-load`, class: "input input-num", inputmode: "decimal", value: st.loadKg ?? "", placeholder: "BW", "aria-label": `Set ${si + 1} load in kg`, onInput: (e) => { st.loadKg = e.target.value; } }),
          h("input", { id: `wf-ex-${ei}-set-${si}-reps`, class: "input input-num", inputmode: "numeric", value: st.reps ?? "", placeholder: "0", "aria-label": `Set ${si + 1} reps`, onInput: (e) => { st.reps = e.target.value; } }),
          h("input", { id: `wf-ex-${ei}-set-${si}-rir`, class: "input input-num", inputmode: "numeric", value: st.rir ?? "", placeholder: "–", "aria-label": `Set ${si + 1} reps in reserve`, onInput: (e) => { st.rir = e.target.value; } }),
          button({ id: `wf-ex-${ei}-set-${si}-remove`, icon: "close", kind: "ghost", small: true, ariaLabel: `Remove set ${si + 1}`, onClick: () => { ex.sets.splice(si, 1); render(); } }),
        ]),
      ),
      button({
        id: `wf-ex-${ei}-addset`,
        label: "Add set",
        icon: "plus",
        kind: "quiet",
        small: true,
        onClick: () => {
          const last = ex.sets[ex.sets.length - 1];
          ex.sets.push({ type: "work", loadKg: last?.loadKg ?? "", reps: last?.reps ?? "", rir: last?.rir ?? "", bodyweight: false });
          render(`wf-ex-${ei}-set-${ex.sets.length - 1}-reps`);
        },
      }),
      feedbackControl({ id: `wf-ex-${ei}-fb`, label: ex.name || prettifyId(ex.exerciseId), value: ex.feedback, onChange: (v) => { ex.feedback = v; } }),
    ));

    return h("fieldset", { class: "fs" },
      h("legend", { class: "fs-legend" }, "Exercises"),
      h("p", { class: "field-hint" }, fromPlan ? "Load × reps @ RIR per set. Empty kg = bodyweight." : "Enter each set as load × reps @ RIR (reps left in the tank). Leave kg empty for bodyweight; tap the set number to mark a warm-up."),
      rows,
      picker.open ? exercisePicker() : button({ id: "wf-add-exercise", label: "Add exercise", icon: "plus", kind: "secondary", onClick: () => { picker.open = true; render("wf-ex-search"); } }),
    );
  }

  function exercisePicker() {
    const eq = equipmentSet(ctx, null);
    const filterOn = eq.size > 0 && !picker.allEquipment;
    const results = h("ul", { class: "picker-results", id: "wf-ex-results", role: "listbox", "aria-label": "Exercises" });
    const searchEl = h("input", {
      id: "wf-ex-search",
      class: "input",
      type: "search",
      placeholder: "Search exercises: squat, row, wall ball…",
      autocomplete: "off",
      value: picker.query,
      "aria-controls": "wf-ex-results",
      onInput: (e) => { picker.query = e.target.value; fill(); },
      onKeydown: (e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          results.querySelector("button")?.click();
        }
      },
    });
    const locName = (ctx.data.profile?.equipment?.locations || []).find((l) => l.id === ctx.data.profile?.equipment?.defaultLocationId)?.name;
    const toggle = eq.size ? h("label", { class: "check", for: "wf-ex-all" },
      h("input", { id: "wf-ex-all", type: "checkbox", checked: picker.allEquipment, onChange: (e) => { picker.allEquipment = e.target.checked; render("wf-ex-search"); } }),
      h("span", {}, "Show exercises outside my equipment"),
    ) : null;

    function fill() {
      const q = picker.query.trim();
      let list;
      if (q) {
        list = safe(() => catalog.searchExercises(q, { limit: 40 }), []) || [];
      } else {
        list = suggestions(ctx).map((id) => safe(() => catalog.getExercise(id), null)).filter(Boolean);
        if (!list.length) list = (catalog.EXERCISES || []).filter((e) => (e.modality || []).includes("strength")).slice(0, 40);
      }
      if (filterOn) list = list.filter((e) => safe(() => core.exerciseAllowed(e.id, eq).ok, true));
      list = list.slice(0, 12);
      const items = list.map((e) => h("li", {}, h("button", {
        type: "button",
        class: "picker-item",
        role: "option",
        id: `wf-pick-${e.id}`,
        onClick: () => addExercise(e.id, e.name),
      }, h("span", { class: "picker-name" }, e.name), h("span", { class: "picker-meta" }, (e.primary || []).slice(0, 2).map(prettifyId).join(", ")))));
      if (q && !list.some((e) => e.name.toLowerCase() === q.toLowerCase())) {
        items.push(h("li", {}, h("button", { type: "button", class: "picker-item picker-custom", id: "wf-pick-custom", onClick: () => addExercise(null, q) },
          h("span", { class: "picker-name" }, `Add “${q}”`), h("span", { class: "picker-meta" }, "as typed"))));
      }
      if (!items.length) items.push(h("li", { class: "picker-empty" }, q ? "No match with your equipment." : "Type to search the exercise list."));
      replaceChildren(results, items);
    }
    fill();

    return h("div", { class: "picker" },
      field("Add exercise", "wf-ex-search", searchEl, filterOn ? `Showing what your ${locName || "saved"} equipment allows.` : eq.size ? "Showing all exercises." : "Tell the coach your equipment to filter this list."),
      toggle,
      results,
      draft.strength.length ? button({ id: "wf-picker-done", label: "Done adding", kind: "ghost", small: true, onClick: () => { picker = { ...picker, open: false, query: "" }; render(); } }) : null,
    );
  }

  function addExercise(id, name) {
    const last = id ? lastSetsFor(ctx, id) : null;
    const sets = last?.length
      ? last.map((st) => ({ type: "work", loadKg: st.loadKg ?? "", reps: st.reps ?? "", rir: st.rir ?? "", bodyweight: Boolean(st.bodyweight) }))
      : [{ type: "work", loadKg: "", reps: "", rir: "", bodyweight: false }];
    draft.strength.push({ exerciseId: id, name, sets });
    picker = { ...picker, open: false, query: "" };
    render(`wf-ex-${draft.strength.length - 1}-set-0-load`);
  }

  // ---- run ---------------------------------------------------------------------------------
  function runSection() {
    const r = draft.run;
    const paceEl = h("output", { class: "pace-out num", id: "wf-run-pace", for: "wf-run-km wf-run-time" });
    const updatePace = () => {
      const km = num(r.distanceKm);
      const sec = parseClock(ctx, r.duration);
      const pace = km && sec ? safe(() => core.paceSecPerKm(km, sec), null) || sec / km : null;
      paceEl.textContent = pace ? fmtPace(core, pace) : "–";
    };
    updatePace();
    const t = r.target;
    const tPace = Array.isArray(t?.paceSecPerKm) && t.paceSecPerKm.length
      ? t.paceSecPerKm.filter(Boolean).map((p) => fmtPace(core, p).replace("/km", "")).join("–") + "/km" : null;
    const runHint = t ? [`Plan ${t.distanceKm ? fmtKm(t.distanceKm) : "run"}`, t.durationSec ? `~${fmtClock(t.durationSec)}` : null, tPace, t.rpe ? `RPE ${t.rpe}` : null].filter(Boolean).join(" · ") : "";
    return h("fieldset", { class: "fs" },
      h("legend", { class: "fs-legend" }, "Run"),
      runHint ? h("p", { class: "field-hint pl-ql-target num" }, runHint) : null,
      field("Run type", "wf-run-type", select("wf-run-type", r.runType, RUN_TYPES.map((t) => [t, prettifyId(t)]), (v) => { r.runType = v; })),
      h("div", { class: "grid-2" },
        field("Distance (km)", "wf-run-km", textInput("wf-run-km", r.distanceKm, (v) => { r.distanceKm = v; updatePace(); }, { inputmode: "decimal", placeholder: "8.0" })),
        field("Time", "wf-run-time", textInput("wf-run-time", r.duration, (v) => { r.duration = v; updatePace(); }, { inputmode: "text", placeholder: "45:30", autocomplete: "off" })),
      ),
      h("div", { class: "pace-row" }, h("span", { class: "field-label" }, "Pace"), paceEl),
      h("div", { class: "grid-2" },
        field("Avg HR", "wf-run-hr", textInput("wf-run-hr", r.avgHr, (v) => { r.avgHr = v; }, { inputmode: "numeric", placeholder: "bpm" })),
        field("Run RPE", "wf-run-rpe", select("wf-run-rpe", r.rpe, rpeOptions, (v) => { r.rpe = v; })),
      ),
    );
  }

  // ---- conditioning ------------------------------------------------------------------------
  function condSection() {
    const c = draft.cond;
    return h("fieldset", { class: "fs" },
      h("legend", { class: "fs-legend" }, "HIIT / metcon"),
      c.target ? h("p", { class: "field-hint pl-ql-target" }, [c.target.targetRpe ? `Target RPE ${c.target.targetRpe}` : null, c.target.scaling ? `Scaling: ${c.target.scaling}` : null].filter(Boolean).join(" · ") || "From your plan") : null,
      field("Format", "wf-c-format", select("wf-c-format", c.format, COND_FORMATS.map((f) => [f, formatLabel(f)]), (v) => { c.format = v; })),
      field("Workout", "wf-c-desc", h("textarea", { id: "wf-c-desc", class: "input textarea", rows: "3", placeholder: "12 min AMRAP: 10 wall balls 9 kg, 10 box jumps, 200 m row", onInput: (e) => { c.description = e.target.value; } }, c.description)),
      h("div", { class: "grid-3" },
        field("Rounds", "wf-c-rounds", textInput("wf-c-rounds", c.rounds, (v) => { c.rounds = v; }, { inputmode: "numeric" })),
        field("+ Reps", "wf-c-reps", textInput("wf-c-reps", c.reps, (v) => { c.reps = v; }, { inputmode: "numeric" })),
        field("Time", "wf-c-time", textInput("wf-c-time", c.time, (v) => { c.time = v; }, { placeholder: "12:34", autocomplete: "off" })),
      ),
      h("div", { class: "grid-2" },
        field("Calories", "wf-c-cal", textInput("wf-c-cal", c.calories, (v) => { c.calories = v; }, { inputmode: "numeric" })),
        field("RPE", "wf-c-rpe", select("wf-c-rpe", c.rpe, rpeOptions, (v) => { c.rpe = v; })),
      ),
      h("div", { class: "check-row" },
        h("label", { class: "check", for: "wf-c-done" }, h("input", { id: "wf-c-done", type: "checkbox", checked: c.completed, onChange: (e) => { c.completed = e.target.checked; } }), h("span", {}, "Finished within the cap")),
        h("label", { class: "check", for: "wf-c-scaled" }, h("input", { id: "wf-c-scaled", type: "checkbox", checked: c.scaled, onChange: (e) => { c.scaled = e.target.checked; } }), h("span", {}, "Scaled")),
      ),
      feedbackControl({ id: "wf-c-fb", label: "This metcon", value: c.feedback, onChange: (v) => { c.feedback = v; } }),
    );
  }

  // ---- pain --------------------------------------------------------------------------------
  function painSection() {
    return h("div", { class: "pain-edit" },
      h("span", { class: "field-label" }, "Pain or niggles"),
      draft.pain.map((p, pi) => h("div", { class: "pain-row" },
        h("input", { id: `wf-pain-${pi}-area`, class: "input", value: p.area, placeholder: "Area, e.g. knee", "aria-label": "Pain area", onInput: (e) => { p.area = e.target.value; } }),
        h("select", { id: `wf-pain-${pi}-score`, class: "input select input-num", "aria-label": "Pain score out of 10", onChange: (e) => { p.score = Number(e.target.value); } },
          Array.from({ length: 11 }, (_, n) => h("option", { value: String(n), selected: Number(p.score) === n }, `${n}/10`))),
        h("select", { id: `wf-pain-${pi}-when`, class: "input select", "aria-label": "When", onChange: (e) => { p.when = e.target.value; } },
          PAIN_WHEN.map(([v, l]) => h("option", { value: v, selected: p.when === v }, l))),
        button({ id: `wf-pain-${pi}-remove`, icon: "close", kind: "ghost", small: true, ariaLabel: "Remove pain entry", onClick: () => { draft.pain.splice(pi, 1); render(); } }),
      )),
      button({ id: "wf-pain-add", label: "Add pain entry", icon: "plus", kind: "quiet", small: true, onClick: () => { draft.pain.push({ area: "", score: 2, when: "during" }); render(`wf-pain-${draft.pain.length - 1}-area`); } }),
    );
  }

  // ---- save --------------------------------------------------------------------------------
  function buildInput() {
    const plan = fromPlan ? fromPlan.plan : ctx.agreedPlan();
    const [planId, workoutId] = draft.workoutRef ? draft.workoutRef.split("|") : [null, null];
    const workout = fromPlan ? fromPlan.workout : plan?.workouts?.find((w) => w.id === workoutId);
    const secs = sectionsOf();
    const base = {
      date: draft.date || ctx.today(),
      title: draft.title.trim() || defaultTitle(draft),
      type: fromPlan ? fromPlan.workout.type || draft.type : draft.type,
      status: draft.status,
      planId: planId || null,
      workoutId: workoutId || null,
      durationMin: num(draft.durationMin),
      readiness: draft.readiness,
      sessionRpe: num(draft.sessionRpe),
      notes: draft.notes.trim(),
      pain: draft.pain.filter((p) => p.area.trim()).map((p) => ({ area: p.area.trim().toLowerCase(), score: Number(p.score) || 0, when: p.when })),
    };
    if (!fromPlan && workout && isEdit === false && workout.type && workout.type !== draft.type && ["hybrid", "mobility"].includes(workout.type)) base.type = workout.type;
    if (secs.includes("strength")) {
      base.strength = draft.strength.map((ex) => ({
        exerciseId: ex.exerciseId,
        name: ex.name,
        sets: ex.sets
          .filter((st) => num(st.reps) != null)
          .map((st) => ({ type: st.type, loadKg: num(st.loadKg), bodyweight: num(st.loadKg) == null || Boolean(st.bodyweight), reps: num(st.reps), rir: num(st.rir) })),
        feedback: ex.feedback || null,
      })).filter((ex) => ex.sets.length);
    }
    if (secs.includes("run")) {
      const r = draft.run;
      const km = num(r.distanceKm);
      const sec = parseClock(ctx, r.duration);
      base.run = {
        runType: r.runType,
        distanceKm: km,
        durationSec: sec,
        avgPaceSecPerKm: km && sec ? safe(() => core.paceSecPerKm(km, sec), null) || Math.round(sec / km) : null,
        avgHr: num(r.avgHr),
        elevationM: null,
        rpe: num(r.rpe),
        splits: existing?.run?.splits || [],
      };
      if (!base.durationMin && sec) base.durationMin = Math.round(sec / 60);
    }
    if (secs.includes("conditioning")) {
      const c = draft.cond;
      base.conditioning = [{
        format: c.format,
        description: c.description.trim(),
        result: { rounds: num(c.rounds), reps: num(c.reps), timeSec: parseClock(ctx, c.time), calories: num(c.calories), completed: Boolean(c.completed) },
        scaled: Boolean(c.scaled),
        rpe: num(c.rpe),
        notes: existing?.conditioning?.[0]?.notes || "",
        feedback: c.feedback || null,
      }, ...(draft.condExtra || [])];
    }
    return base;
  }

  function validate(input) {
    const secs = sectionsOf();
    if (!input.date) return "Pick a date.";
    if (fromPlan && draft.strength.some((ex) => ex.sets.some((st) => num(st.reps) == null))) return "Enter reps for every set, or remove the set.";
    if (secs.includes("strength") && !input.strength?.length && secs.length === 1) return "Add at least one exercise with reps.";
    if (secs.includes("run") && !input.run?.distanceKm && !input.run?.durationSec) return "Enter a distance or a time.";
    if (secs.includes("run") && String(draft.run.duration || "").trim() && !input.run.durationSec) return "Write the time as 45:30 or 1:02:10.";
    if (secs.includes("conditioning") && !input.conditioning[0].description) return "Describe the workout.";
    return "";
  }

  async function save() {
    if (saving) return;
    const input = buildInput();
    errorMsg = validate(input);
    errEl.hidden = !errorMsg;
    errEl.textContent = errorMsg;
    if (errorMsg) return;
    saving = true;
    saveBtn.disabled = true;
    const now = new Date().toISOString();
    try {
      let session = safe(() => core.normalizeSession(input, { today: ctx.today() }), null) || { ...input };
      session = { ...session, createdBy: existing?.createdBy || "manual" };
      const prior = ctx.data.sessions.filter((x) => x.id !== existing?.id && String(x.date) <= String(session.date));
      const prs = safe(() => core.detectPrs(session, prior), null);
      if (Array.isArray(prs)) session.prs = prs;
      if (isEdit) {
        // Patch only what the form edits, so other parts of a hybrid session survive.
        const keys = ["date", "title", "status", "planId", "workoutId", "durationMin", "readiness", "sessionRpe", "notes", "pain", "prs", ...sectionsOf()];
        const patch = { updatedAt: now };
        for (const k of keys) if (k in session) patch[k] = session[k];
        const oldType = formTypeOf(existing);
        if (multi.length > 1) {
          // keep the session's own type (hybrid)
        } else if (draft.type !== oldType) {
          patch.type = draft.type;
          patch[oldType] = oldType === "run" ? null : [];
        } else if (!["hybrid", "other", "mobility"].includes(existing.type)) {
          patch.type = draft.type;
        }
        await store.sessions.update(existing.id, patch);
        const prevRef = existing.workoutId && existing.planId ? `${existing.planId}|${existing.workoutId}` : "";
        if (draft.workoutRef && draft.workoutRef !== prevRef) await markDone(ctx, session.planId, session.workoutId);
        sheet.close();
        toast({ text: "Changes saved" });
      } else {
        await saveLoggedSession(ctx, input, fromPlan ? { view: true, review: true } : { toastText: session.prs?.length ? `Saved · ${plural(session.prs.length, "PR")}` : "Workout saved" });
        sheet.close();
      }
    } catch (err) {
      errEl.hidden = false;
      errEl.textContent = errorText(coach, err);
      saving = false;
      saveBtn.disabled = false;
    }
  }

  render(draft.type === "strength" && picker.open ? "wf-ex-search" : null);
}

function defaultTitle(draft) {
  if (draft.type === "run") return `${prettifyId(draft.run.runType)} run`;
  if (draft.type === "conditioning") return `${formatLabel(draft.cond.format)} workout`;
  return "Strength session";
}

/** Exercise ids to suggest before typing: the agreed plan's strength items, then recent lifts. */
function suggestions(ctx) {
  const ids = [];
  const plan = ctx.agreedPlan();
  for (const w of plan?.workouts || []) for (const b of w.blocks || []) if (b.kind === "strength") for (const it of b.items || []) if (it.exerciseId) ids.push(it.exerciseId);
  for (const s of ctx.data.sessions.slice(0, 20)) for (const ex of s.strength || []) if (ex.exerciseId) ids.push(ex.exerciseId);
  return [...new Set(ids)].slice(0, 12);
}

/** Work sets from the most recent exposure of an exercise (for prefilling). */
function lastSetsFor(ctx, exerciseId) {
  const ex = safe(() => ctx.core.exposures(ctx.data.sessions, exerciseId), null);
  if (Array.isArray(ex) && ex.length) return ex[ex.length - 1].sets || null;
  for (const s of sortSessions(ctx.data.sessions)) {
    const found = (s.strength || []).find((x) => x.exerciseId === exerciseId);
    if (found) return (found.sets || []).filter((st) => st.type !== "warmup");
  }
  return null;
}
