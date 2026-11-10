// Owner: Agent D. Coach tab: chat with streaming, tool activity, action cards, onboarding welcome.
// Model text is rendered through markdown.js (DOM building only).

import {
  h, icon, button, append, replaceChildren, createTicker, fmtElapsed, fmtRelDay, dateOfTs,
  errorText, safe, toUnsub, lsGet, lsSet, isCoarsePointer, toast, reducedMotion, openSheet,
} from "./components.js";
import { renderMarkdown } from "./markdown.js";
import { unmarkRotation } from "./ops.js";

const DRAFT_KEY = "pt.chatDraft";
const RECENT_COUNT = 80;
const CLEAR_RE = /^\/clear\s*$/i;
/** Shown in every clear-chat confirmation (Coach tab, Settings, /clear). */
export const CLEAR_CHAT_COPY = "The coach saves a short summary of this chat to its memory, then the messages are deleted. Your profile, plans and workout history stay.";
const CLEARED_EVENT = "Chat cleared. The coach's memory, your profile, plans and history are kept.";
const SUGGESTIONS = [
  { label: "What's my workout today?", send: "What's my workout today?" },
  { label: "Log a workout", prefill: "Today I did " },
  { label: "How's my progress?", send: "How's my progress?" },
];

const TOOL_COPY = {
  update_profile: "Updating your profile",
  get_plan: "Checking your plan",
  get_history: "Looking at your history",
  log_session: "Logging the workout",
  update_session: "Updating the workout",
  add_coach_note: "Saving a note",
  get_exercise_info: "Looking up the exercise",
  request_plan: "Preparing a plan request",
  update_plan_workout: "Adjusting your plan",
  log_wellness: "Saving your readiness",
};

/**
 * Mount the Coach tab.
 * @param {HTMLElement} el
 * @param {any} ctx shared app context (see app.js)
 * @returns {{ show: () => void, teardown: () => void }}
 */
export function mountChat(el, ctx) {
  const { store, coach } = ctx;
  const unsubs = [];

  /** @type {any[]} */ let older = [];
  let clearing = false;
  /** @type {any[]} */ let todayMsgs = [];
  let todayDate = ctx.today();
  let dayUnsub = () => {};
  let loaded = false;

  /** Current in-flight call. */
  let inflight = null; // { kind, text, ctl, stream, tools: Map, sinceTs, done, stopped }
  /** Last error not represented by a persisted message. */
  let lastError = null; // { code, sinceTs, retry }
  /** Locally kept partial answer after Stop. */
  let stopped = null; // { text, sinceTs }
  let firstShow = true;

  // ---- DOM ---------------------------------------------------------------------------------
  const onboardingBar = h("div", { class: "onboard-bar", hidden: true },
    h("span", { class: "onboard-dot", "aria-hidden": "true" }),
    h("span", {}, "Setting up. Answer the coach's questions; you can stop and pick up later."),
  );
  const list = h("div", { class: "chat-list", role: "log", "aria-live": "off", "aria-label": "Conversation" });
  const welcome = h("div", { class: "welcome", hidden: true });
  const streamEl = h("div", { class: "msg msg-coach msg-stream", hidden: true, "aria-live": "polite" });
  const errorEl = h("div", { class: "chat-error", hidden: true });
  const thread = h("div", { class: "chat-thread" }, onboardingBar, list, welcome, streamEl, errorEl);

  const chips = h("div", { class: "chips", role: "group", "aria-label": "Suggestions" },
    SUGGESTIONS.map((s, i) => h("button", {
      type: "button",
      class: "chip",
      id: `chat-chip-${i}`,
      onClick: () => {
        if (s.send) send(s.send);
        else prefill(s.prefill);
      },
    }, s.label)),
  );

  const input = h("textarea", {
    id: "chat-input",
    class: "composer-input",
    rows: "1",
    placeholder: "Message your coach",
    "aria-label": "Message your coach",
    enterkeyhint: isCoarsePointer() ? "enter" : "send",
    autocomplete: "off",
  });
  const sendBtn = h("button", { type: "submit", class: "btn btn-primary btn-icon composer-send", id: "chat-send", "aria-label": "Send" }, icon("send", { size: 22 }));
  const stopBtn = h("button", { type: "button", class: "btn btn-stop composer-stop", id: "chat-stop", "aria-label": "Stop the coach", hidden: true, onClick: () => inflight?.ctl.abort() },
    icon("stop", { size: 18 }), h("span", {}, "Stop"));
  const composer = h("form", { class: "composer", id: "chat-composer", onSubmit: (e) => { e.preventDefault(); submit(); } },
    input, sendBtn, stopBtn);
  const offline = h("p", { class: "composer-offline", hidden: true });
  const dock = h("div", { class: "composer-dock" }, h("div", { class: "composer-dock-inner" }, chips, composer, offline));

  append(el, [thread, dock]);

  // composer height → padding so the last message clears the dock
  // (the page-level copy lifts toasts above the dock). When the dock grows (the suggestion chips come back
  // after a reply) and the reader is at the bottom, stay there so the last action card is not covered.
  const ro = typeof ResizeObserver === "function" ? new ResizeObserver(() => {
    const px = `${Math.ceil(dock.getBoundingClientRect().height)}px`;
    const stick = !el.hidden && nearBottom();
    el.style.setProperty("--dock-h", px);
    document.documentElement.style.setProperty("--dock-h", px);
    if (stick) scrollToBottom();
  }) : null;
  ro?.observe(dock);
  unsubs.push(() => ro?.disconnect());

  // restore unsent draft
  const savedDraft = lsGet(DRAFT_KEY);
  if (savedDraft) input.value = savedDraft;

  input.addEventListener("input", () => {
    autoGrow();
    lsSet(DRAFT_KEY, input.value || null);
    renderChrome();
  });
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey && !e.isComposing && !isCoarsePointer()) {
      e.preventDefault();
      submit();
    }
  });
  input.addEventListener("focus", () => document.documentElement.classList.add("composing"));
  input.addEventListener("blur", () => document.documentElement.classList.remove("composing"));

  function autoGrow() {
    input.style.height = "auto";
    input.style.height = `${Math.min(input.scrollHeight, 168)}px`;
  }

  // ---- data --------------------------------------------------------------------------------
  function loadRecent({ replaceToday = false } = {}) {
    return Promise.resolve()
      .then(() => store.chat.recent(RECENT_COUNT))
      .then((msgs) => {
        const arr = Array.isArray(msgs) ? msgs : [];
        older = arr.filter((m) => msgDate(m) !== todayDate);
        if (replaceToday || !todayMsgs.length) todayMsgs = arr.filter((m) => msgDate(m) === todayDate);
      })
      .catch(() => {})
      .finally(() => {
        loaded = true;
        render({ stick: true });
      });
  }

  if (store) {
    loadRecent();
    subscribeToday();
  } else {
    loaded = true;
  }

  function subscribeToday() {
    dayUnsub();
    try {
      dayUnsub = toUnsub(store.chat.subscribeDay(todayDate, (day) => {
        todayMsgs = Array.isArray(day) ? day : Array.isArray(day?.messages) ? day.messages : [];
        render();
      }));
    } catch {
      dayUnsub = () => {};
    }
  }

  function checkDayRollover() {
    const t = ctx.today();
    if (t !== todayDate && store) {
      older = [...older, ...todayMsgs];
      todayMsgs = [];
      todayDate = t;
      subscribeToday();
    }
  }

  unsubs.push(() => dayUnsub());
  unsubs.push(ctx.on(["profile", "state", "sessions", "plans"], () => render()));

  function msgDate(m) {
    return dateOfTs(m?.ts) || todayDate;
  }

  function allMessages() {
    const byId = new Map();
    for (const m of [...older, ...todayMsgs]) if (m && m.id) byId.set(m.id, m);
    return [...byId.values()].sort((a, b) => String(a.ts).localeCompare(String(b.ts)));
  }

  // ---- rendering ---------------------------------------------------------------------------
  const nodeCache = new Map(); // id -> { sig, el }
  let streamRaf = 0;

  function nearBottom() {
    const doc = document.documentElement;
    return window.innerHeight + window.scrollY >= doc.scrollHeight - 160;
  }

  function scrollToBottom() {
    requestAnimationFrame(() => {
      window.scrollTo({ top: document.documentElement.scrollHeight, behavior: "instant" in window ? "instant" : "auto" });
    });
  }

  function render({ stick = false } = {}) {
    if (el.hidden && !stick) {
      renderList();
      renderChrome();
      return;
    }
    const wasBottom = nearBottom();
    renderList();
    renderChrome();
    if (stick || wasBottom) scrollToBottom();
  }

  function renderList() {
    const msgs = allMessages();
    // optimistic user bubble until the persisted one arrives
    const pendingUser = inflight?.text && !msgs.some((m) => m.role === "user" && m.ts >= inflight.sinceTs && m.text === inflight.text)
      ? { id: "__pending_user", role: "user", text: inflight.text, ts: inflight.sinceTs, pending: true }
      : null;
    const visible = pendingUser ? [...msgs, pendingUser] : msgs;

    const frag = [];
    let lastDate = null;
    const lastMsg = msgs[msgs.length - 1] || null;
    const lastPlanReqId = [...msgs].reverse().find((m) => (m.actions || []).some((a) => a.type === "plan_request"))?.id;
    for (const m of visible) {
      const d = msgDate(m);
      if (d !== lastDate) {
        frag.push(h("div", { class: "day-sep" }, h("span", {}, fmtRelDay(d, todayDate))));
        lastDate = d;
      }
      frag.push(messageNode(m, { isLast: m === lastMsg && !inflight, isLastPlanReq: m.id === lastPlanReqId }));
    }
    // a persisted answer has arrived for the current/just-finished call: drop the local copies
    if (stopped && msgs.some((m) => m.role === "assistant" && m.ts >= stopped.sinceTs)) stopped = null;
    if (stopped && !inflight) {
      frag.push(h("div", { class: "msg msg-coach msg-stopped" },
        h("div", { class: "md" }, renderMarkdown(stopped.text)),
        h("p", { class: "msg-note" }, "Stopped"),
      ));
    }
    replaceChildren(list, frag);
  }

  function messageNode(m, { isLast, isLastPlanReq }) {
    const sig = JSON.stringify([m.text, m.actions, m.error, m.errorDetail, isLast, isLastPlanReq, actionStateSig(m), m.pending]);
    const cached = nodeCache.get(m.id);
    if (cached && cached.sig === sig) return cached.el;
    let node;
    if (m.role === "user") {
      node = h("div", { class: ["msg", "msg-user", m.pending && "is-pending"] },
        h("div", { class: "bubble" }, m.text));
    } else if (m.role === "event") {
      node = h("div", { class: "msg-event", role: "note" }, h("span", {}, m.text));
    } else {
      node = h("div", { class: "msg msg-coach" },
        m.text ? h("div", { class: "md" }, renderMarkdown(m.text)) : null,
        actionCards(m, { isLastPlanReq }),
        m.error && m.error !== "cancelled"
          ? h("div", { class: "msg-error" }, errorLineFor(m.error, isLast ? () => retryFrom(m) : null, m.errorDetail))
          : null,
      );
    }
    nodeCache.set(m.id, { sig, el: node });
    return node;
  }

  function actionStateSig(m) {
    const acts = m.actions || [];
    if (!acts.length) return "";
    return acts.map((a) => {
      if (a.type === "logged_session" || a.type === "updated_session") return sessionExists(a.ref) ? "1" : "0";
      if (a.type === "plan_request") return `${Boolean(ctx.data.state?.pendingPlanRequest)}${Boolean(ctx.plan?.isBusy?.())}`;
      if (a.type === "plan_change") return planChangeLive(a.ref) ? "1" : "0";
      return "";
    }).join(",");
  }

  function sessionExists(id) {
    if (!id) return false;
    if (!ctx.data.loaded.sessions) return true;
    return ctx.data.sessions.some((s) => s.id === id);
  }

  function actionCards(m, { isLastPlanReq }) {
    const acts = Array.isArray(m.actions) ? m.actions : [];
    if (!acts.length) return null;
    return h("div", { class: "actions" }, acts.map((a, idx) => actionCard(m, a, idx, { isLastPlanReq })));
  }

  function actionCard(m, a, idx, { isLastPlanReq }) {
    const id = `act-${m.id}-${idx}`;
    if (a.type === "logged_session") {
      const exists = sessionExists(a.ref);
      return h("div", { class: ["action-card", "action-logged", !exists && "is-undone"] },
        h("span", { class: "action-icon" }, icon(exists ? "check" : "undo", { size: 18 })),
        h("span", { class: "action-label" }, exists ? a.label || "Logged workout" : `Removed · ${stripPrefix(a.label)}`),
        exists ? h("span", { class: "action-btns" },
          button({ id: `${id}-undo`, label: "Undo", kind: "quiet", small: true, onClick: (e) => undoLogged(a.ref, e.currentTarget) }),
          button({ id: `${id}-view`, label: "View", kind: "quiet", small: true, onClick: () => viewSession(a.ref) }),
        ) : null,
      );
    }
    if (a.type === "updated_session") {
      const exists = sessionExists(a.ref);
      return h("div", { class: "action-card" },
        h("span", { class: "action-icon" }, icon("edit", { size: 18 })),
        h("span", { class: "action-label" }, a.label || "Updated workout"),
        exists ? h("span", { class: "action-btns" },
          button({ id: `${id}-view`, label: "View", kind: "quiet", small: true, onClick: () => viewSession(a.ref) })) : null,
      );
    }
    if (a.type === "plan_change") {
      const live = planChangeLive(a.ref);
      return h("div", { class: ["action-card", "action-planchange", !live && "is-undone"] },
        h("span", { class: "action-icon" }, icon(live ? "plan" : "undo", { size: 18 })),
        h("span", { class: "action-label" },
          h("strong", {}, live ? "Plan changed" : "Plan change undone"),
          h("span", { class: "action-sub" }, a.label || "Workout adjusted"),
        ),
        h("span", { class: "action-btns" },
          live ? button({ id: `${id}-undo`, label: "Undo", kind: "quiet", small: true, onClick: (e) => undoPlanChange(a.ref, e.currentTarget) }) : null,
          button({ id: `${id}-open`, label: "Plan", kind: "quiet", small: true, onClick: () => ctx.nav("plan") }),
        ),
      );
    }
    if (a.type === "plan_request") {
      const pending = ctx.data.state?.pendingPlanRequest;
      const busy = Boolean(ctx.plan?.isBusy?.());
      const live = isLastPlanReq && pending;
      return h("div", { class: ["action-card", "action-plan", live && "is-live"] },
        h("span", { class: "action-icon" }, icon("plan", { size: 18 })),
        h("span", { class: "action-label" },
          h("strong", {}, pending?.kind === "revise" ? "Plan changes requested" : "New plan requested"),
          pending?.instruction && live ? h("span", { class: "action-sub" }, pending.instruction) : a.label && !live ? h("span", { class: "action-sub" }, a.label) : null,
        ),
        h("span", { class: "action-btns" },
          live && !busy
            ? button({ id: `${id}-gen`, label: pending.kind === "revise" ? "Revise plan" : "Generate plan", icon: "bolt", kind: "primary", small: true, onClick: () => ctx.plan?.generate({ kind: pending.kind, instruction: pending.instruction, fromRequest: true }) })
            : button({ id: `${id}-open`, label: busy ? "Generating…" : "Open Plan", kind: "quiet", small: true, onClick: () => ctx.nav("plan") }),
        ),
      );
    }
    const ic = a.type === "updated_profile" ? "settings" : a.type === "coach_note" ? "edit" : a.type === "logged_wellness" ? "bolt" : "check";
    return h("div", { class: "action-card action-quiet" },
      h("span", { class: "action-icon" }, icon(ic, { size: 18 })),
      h("span", { class: "action-label" }, a.label || defaultActionLabel(a.type)),
    );
  }

  function stripPrefix(label) {
    return String(label || "workout").replace(/^Logged\s*·\s*/i, "");
  }

  function defaultActionLabel(type) {
    return { updated_profile: "Profile updated", coach_note: "Noted", logged_wellness: "Wellness saved" }[type] || "Done";
  }

  function errorLineFor(code, onRetry, detail) {
    const line = h("div", { class: "error-line", role: "alert" },
      icon("alert", { size: 18 }),
      h("span", { class: "error-text" }, errorText(coach, code, { inChat: true })),
      onRetry && retryable(code) ? button({ label: "Retry", icon: "refresh", kind: "secondary", small: true, onClick: onRetry, disabled: Boolean(inflight) }) : null,
    );
    if (!detail) return line;
    // The platform's developer message, kept so failures can be debugged (textContent only).
    return h("div", { class: "error-block" }, line, h("p", { class: "error-detail" }, `${code}: ${String(detail).slice(0, 300)}`));
  }

  function retryable(code) {
    return !["not_granted", "sampling_disabled", "not_declared", "capability_disabled", "capability_removed"].includes(code);
  }

  function renderStream() {
    streamRaf = 0;
    if (!inflight) {
      streamEl.hidden = true;
      return;
    }
    const wasBottom = nearBottom();
    streamEl.hidden = false;
    const hasText = Boolean(inflight.stream);
    const tools = [...inflight.tools.values()];
    const elapsed = fmtElapsed(Date.now() - inflight.t0);
    replaceChildren(streamEl,
      h("div", { class: ["thinking", hasText && "is-writing"] },
        h("span", { class: "pulse", "aria-hidden": "true" }),
        h("span", { class: "thinking-label" }, inflight.done ? "Saving…" : hasText ? "Writing" : "Thinking…"),
        h("span", { class: "thinking-time num", "aria-label": `elapsed ${elapsed}` }, elapsed),
      ),
      tools.length ? h("ul", { class: "tool-lines" }, tools.map((t) =>
        h("li", { class: `tool-line tool-${t.phase}` },
          t.phase === "done" ? icon("check", { size: 16 }) : t.phase === "error" ? icon("alert", { size: 16 }) : h("span", { class: "tool-spin", "aria-hidden": "true" }),
          h("span", {}, t.label || TOOL_COPY[t.name] || t.name),
        ))) : null,
      hasText ? h("div", { class: "md" }, renderMarkdown(closeOpenBold(inflight.stream))) : null,
    );
    if (wasBottom) scrollToBottom();
  }

  /** Mid-stream, a "**bold" whose closing marker has not arrived yet would show its asterisks: close it. */
  function closeOpenBold(text) {
    const nl = text.lastIndexOf("\n");
    const last = text.slice(nl + 1);
    if ((last.match(/\*\*/g) || []).length % 2 === 0) return text;
    return text.slice(0, nl + 1) + (last.endsWith("**") ? last.slice(0, -2) : `${last}**`);
  }

  function scheduleStream() {
    if (!streamRaf) streamRaf = requestAnimationFrame(renderStream);
  }

  function renderChrome() {
    const status = ctx.coachStatus();
    const onboarding = ctx.isOnboarding();
    const obStatus = ctx.data.state?.onboarding?.status || "not_started";
    const msgs = allMessages();
    const showWelcome = Boolean(store) && ctx.data.loaded.profile && onboarding && obStatus !== "in_progress" && !inflight;
    welcome.hidden = !showWelcome;
    if (showWelcome) renderWelcome(status);
    onboardingBar.hidden = !(onboarding && obStatus === "in_progress" && ctx.data.loaded.profile);

    // error line not represented by a persisted message
    const persistedErr = lastError && msgs.some((m) => m.role === "assistant" && m.error && m.ts >= lastError.sinceTs);
    errorEl.hidden = !lastError || Boolean(persistedErr) || Boolean(inflight);
    if (!errorEl.hidden) replaceChildren(errorEl, errorLineFor(lastError.code, lastError.retry, lastError.detail));

    // composer
    const canChat = Boolean(coach) && status.available !== false;
    dock.hidden = showWelcome;
    composer.hidden = !canChat;
    offline.hidden = canChat;
    if (!canChat) {
      offline.textContent = !store
        ? "Sign in to Claude to chat with your coach."
        : "The coach isn't available in this view. You can still log workouts in History.";
    }
    input.placeholder = onboarding ? "Answer your coach" : "Message your coach";
    const busy = Boolean(inflight);
    sendBtn.hidden = busy;
    stopBtn.hidden = !busy;
    sendBtn.disabled = !input.value.trim();
    chips.hidden = busy || onboarding || !canChat || Boolean(input.value.trim()) || !loaded;
    ctx.chatEmpty = !msgs.some((m) => m.role === "user" || m.role === "assistant");
    ctx.refreshChrome?.();
  }

  function renderWelcome(status) {
    const canStart = Boolean(coach) && status.available !== false;
    const startBtn = button({
      id: "onboarding-start",
      label: "Start",
      icon: "arrow",
      kind: "primary",
      class: "btn-lg",
      disabled: !canStart,
      onClick: () => startOnboarding(),
    });
    replaceChildren(welcome,
      h("p", { class: "eyebrow" }, "Welcome"),
      h("h2", { class: "welcome-title" }, "Let's set up your training"),
      h("p", { class: "welcome-lede" }, "Your coach asks a few questions, then plans each week around your goals, your schedule and the equipment you actually have. You log workouts by telling the coach what you did."),
      h("ol", { class: "steps" },
        step("Safety check", "Seven quick health questions before any training advice."),
        step("Goals and schedule", "Strength, running, HIIT, or a mix. How many days, how long."),
        step("Equipment and experience", "What you can use where you train, and what you've lifted or run lately."),
      ),
      h("div", { class: "welcome-cta" },
        startBtn,
        h("p", { class: "welcome-note" }, canStart
          ? "About five minutes. Each reply uses your Claude plan, and nothing runs until you tap."
          : "The coach needs Claude, which isn't available in this view."),
      ),
    );
  }

  function step(title, text) {
    return h("li", { class: "step" }, h("strong", {}, title), h("span", {}, text));
  }

  // ---- actions -----------------------------------------------------------------------------
  function prefill(text) {
    input.value = text;
    lsSet(DRAFT_KEY, text);
    autoGrow();
    renderChrome();
    input.focus();
    const end = input.value.length;
    safe(() => input.setSelectionRange(end, end), null);
  }

  function submit() {
    const text = input.value.trim();
    if (!text || inflight) return;
    input.value = "";
    lsSet(DRAFT_KEY, null);
    autoGrow();
    if (CLEAR_RE.test(text)) {
      confirmClear(); // a command for the app, never sent to Claude
      renderChrome();
      return;
    }
    send(text);
  }

  // ---- clear chat --------------------------------------------------------------------------
  /** Open the in-page confirmation (a small sheet) for clearing the conversation. */
  function confirmClear() {
    if (!store) return;
    if (inflight || clearing) {
      toast({ text: "Wait for the coach to finish, then clear the chat." });
      return;
    }
    openSheet({
      title: "Clear chat?",
      id: "clear-chat-sheet",
      backdropClose: false,
      build: (api) => {
        let ctl = null;
        const yes = button({
          id: "clear-chat-yes",
          label: "Clear chat",
          icon: "trash",
          kind: "danger",
          onClick: async () => {
            yes.disabled = true;
            ctl = new AbortController();
            yes.classList.add("is-busy");
            replaceChildren(yes, h("span", { class: "tool-spin", "aria-hidden": "true" }), h("span", {}, "Saving summary…"));
            no.querySelector("span").textContent = "Skip summary";
            await clearChat({ signal: ctl.signal });
            ctl = null;
            api.close();
          },
        });
        // Before the tap: Cancel. While the summary call runs: skip it (abort) and clear straight away.
        const no = button({ id: "clear-chat-no", label: "Cancel", kind: "ghost", onClick: () => (ctl ? ctl.abort() : api.close()) });
        setTimeout(() => no.focus(), 0);
        return h("div", { class: "confirm" },
          h("p", { class: "confirm-text" }, CLEAR_CHAT_COPY),
          h("div", { class: "confirm-actions" }, no, yes),
        );
      },
    });
  }

  /**
   * Fold the chat into the coach's memory (coach.rememberChat: at most one quick call), then delete the conversation
   * (store.chat.clear), show a "Chat cleared" event and offer Undo. A failed or skipped summary does not block the
   * clear; the toast says so. Coach memory, profile, plans and history are not touched.
   * @param {{ signal?: AbortSignal }} [opts]
   * @returns {Promise<boolean>} true when cleared
   */
  async function clearChat({ signal } = {}) {
    if (!store || inflight || clearing) return false;
    clearing = true;
    try {
      const note = await rememberBeforeClear(coach, signal);
      const res = await store.chat.clear();
      older = [];
      todayMsgs = [];
      nodeCache.clear();
      lastError = null;
      stopped = null;
      checkDayRollover();
      const ev = await Promise.resolve(safe(() => store.chat.append({ role: "event", text: CLEARED_EVENT, actions: [], error: null }), null)).catch(() => null);
      render({ stick: true });
      toast({
        text: note ? `Chat cleared · ${note}` : "Chat cleared",
        timeout: 8000,
        action: {
          label: "Undo",
          fn: async () => {
            try {
              await ev?.undo?.();
              await res?.undo?.();
              nodeCache.clear();
              await loadRecent({ replaceToday: true });
            } catch (err) {
              toast({ text: errorText(coach, err), kind: "error" });
            }
          },
        },
      });
      return true;
    } catch (err) {
      toast({ text: errorText(coach, err), kind: "error" });
      return false;
    } finally {
      clearing = false;
    }
  }

  async function send(text) {
    if (inflight || !coach) return;
    if (CLEAR_RE.test(String(text ?? "").trim())) { confirmClear(); return; }
    checkDayRollover();
    await run("send", text, (opts) => coach.send(text, opts));
  }

  async function startOnboarding() {
    if (inflight || !coach) return;
    checkDayRollover();
    if (store && ctx.data.state?.onboarding?.status !== "in_progress") {
      safe(() => store.state.update({ onboarding: { ...(ctx.data.state?.onboarding || {}), status: "in_progress" } }), null)?.catch?.(() => {});
    }
    await run("onboard", "", (opts) => coach.startOnboarding(opts));
  }

  function retryFrom(m) {
    const msgs = allMessages();
    const idx = msgs.indexOf(m);
    const prevUser = [...msgs.slice(0, idx)].reverse().find((x) => x.role === "user");
    if (prevUser?.text) send(prevUser.text);
    else if (ctx.isOnboarding()) startOnboarding();
  }

  async function run(kind, text, call) {
    const ctl = new AbortController();
    const sinceTs = new Date(Date.now() - 1000).toISOString();
    const ticker = createTicker(() => scheduleStream());
    inflight = { kind, text, ctl, stream: "", tools: new Map(), sinceTs, t0: Date.now(), done: false };
    lastError = null;
    stopped = null;
    render({ stick: true });
    ticker.start();
    renderStream();
    const retry = () => (kind === "send" ? send(text) : startOnboarding());
    let partial = "";
    try {
      const res = await call({
        signal: ctl.signal,
        onText: (u) => {
          if (!inflight) return;
          inflight.stream = typeof u?.text === "string" ? u.text : inflight.stream + (u?.delta || "");
          scheduleStream();
        },
        onTool: (t) => {
          if (!inflight || !t) return;
          const key = `${t.name}:${[...inflight.tools.keys()].filter((k) => k.startsWith(`${t.name}:`) && inflight.tools.get(k).phase !== "start").length}`;
          inflight.tools.set(key, { name: t.name, phase: t.phase || "start", label: t.label });
          scheduleStream();
        },
      });
      partial = res?.text || inflight.stream;
      if (res?.error && res.error !== "cancelled") lastError = { code: res.error, sinceTs, retry, detail: res.errorDetail };
      if (res?.error === "cancelled" && partial) stopped = { text: partial, sinceTs };
    } catch (err) {
      partial = err?.text || inflight?.stream || "";
      if (err?.code === "cancelled") {
        if (partial) stopped = { text: partial, sinceTs };
      } else {
        lastError = { code: err?.code || "upstream_error", sinceTs, retry, detail: typeof err?.message === "string" ? err.message : "" };
        if (partial && err?.code !== "refused") stopped = { text: partial, sinceTs };
      }
    } finally {
      ticker.stop();
    }
    // settle: keep the streamed answer on screen until the persisted message shows up
    if (inflight) {
      inflight.done = true;
      inflight.stream = inflight.stream || partial;
      renderStream();
    }
    const deadline = Date.now() + 2500;
    while (Date.now() < deadline && !lastError && !stopped && !allMessages().some((m) => m.role === "assistant" && m.ts >= sinceTs)) {
      await new Promise((r) => setTimeout(r, 120));
    }
    if (!lastError && !stopped && !allMessages().some((m) => m.role === "assistant" && m.ts >= sinceTs) && partial) {
      // the reply was not persisted (e.g. storage failed); keep it visible locally
      stopped = { text: partial, sinceTs, notSaved: true };
    }
    inflight = null;
    renderStream();
    render({ stick: !el.hidden });
  }

  async function undoLogged(sessionId, btn) {
    if (!store || !sessionId) return;
    if (btn) btn.disabled = true;
    try {
      const s = ctx.data.sessions.find((x) => x.id === sessionId) || (await store.sessions.get(sessionId));
      const res = await store.sessions.remove(sessionId);
      const rotUndo = await unmarkRotation(ctx, s);
      await safe(() => store.chat.append({ role: "event", text: `Removed ${s?.title || "the logged workout"}`, actions: [], error: null }), null);
      toast({
        text: "Workout removed",
        action: {
          label: "Restore",
          fn: async () => {
            await res?.undo?.();
            await rotUndo?.();
          },
        },
      });
    } catch (err) {
      toast({ text: errorText(coach, err), kind: "error" });
      if (btn) btn.disabled = false;
    }
  }

  /** Is a plan_change action still applied (its entry is in the plan's change log)? */
  function planChangeLive(ref) {
    if (!ref) return false;
    if (!ctx.data.loaded.plans) return true;
    if (typeof coach?.planChangeActive === "function") return coach.planChangeActive(ref, ctx.data.plans);
    return false;
  }

  async function undoPlanChange(ref, btn) {
    if (!coach?.undoPlanChange) return;
    if (btn) btn.disabled = true;
    try {
      const res = await coach.undoPlanChange(ref);
      toast({ text: res?.undone > 1 ? `Plan change undone (with ${res.undone - 1} later change${res.undone > 2 ? "s" : ""} to that workout)` : "Plan change undone" });
    } catch (err) {
      toast({ text: err?.message && err.code === "invalid_argument" ? err.message : errorText(coach, err), kind: "error" });
      if (btn) btn.disabled = false;
    }
  }

  function viewSession(id) {
    ctx.nav("history");
    ctx.history?.openSession(id);
  }

  // public API for other views
  ctx.chat = {
    prefill: (text) => {
      ctx.nav("coach");
      setTimeout(() => prefill(text), 0);
    },
    send: (text) => {
      ctx.nav("coach");
      send(text);
    },
    isBusy: () => Boolean(inflight),
    /** Ask to clear the conversation (in-page confirm). */
    confirmClear: () => confirmClear(),
    /** Clear the conversation now (the caller already confirmed). @returns {Promise<boolean>} */
    clear: () => clearChat(),
  };

  autoGrow();
  render({ stick: true });

  return {
    show() {
      checkDayRollover();
      render({ stick: firstShow });
      firstShow = false;
      if (reducedMotion()) document.documentElement.classList.add("rm");
    },
    teardown() {
      inflight?.ctl.abort();
      unsubs.splice(0).forEach((u) => safe(u, null));
    },
  };
}

/**
 * coach.rememberChat before a clear. Never throws: resolves null when the summary was saved (or there was nothing
 * new), or a short note for the "Chat cleared" toast when it was skipped or failed.
 * @param {any} coach
 * @param {AbortSignal} [signal]
 * @returns {Promise<string|null>}
 */
export async function rememberBeforeClear(coach, signal) {
  if (typeof coach?.rememberChat !== "function") return "no summary saved";
  try {
    await coach.rememberChat({ signal });
    return null;
  } catch {
    return signal?.aborted ? "summary skipped" : "no summary saved";
  }
}
