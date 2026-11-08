// Owner: Agent D. App shell: header, tab bar, hash routing, problems banner, theme, and the shared
// data hub (one store subscription per stream, fanned out to the views). See CONTRACT.md §7.

import { h, icon, replaceChildren, safe, toUnsub, lsGet, lsSet, localISO } from "./components.js";
import { mountChat } from "./chat.js";
import { mountHistory } from "./history.js";
import { mountPlan } from "./plan.js";
import { openSettings } from "./settings.js";

/** UI version shown in Settings. */
export const APP_VERSION = "1.0.0";

const ROUTES = ["coach", "history", "plan"];
const THEME_KEY = "pt.theme";
const TAB_KEY = "pt.lastTab";

const STATE_DEFAULTS = {
  schemaVersion: 1,
  settings: { theme: "system", chatTier: "default", reviewAfterWorkout: true },
  rotation: { planId: null, done: [] },
  onboarding: { status: "not_started" },
  pendingPlanRequest: null,
};

const PROBLEM_COPY = {
  not_signed_in: {
    title: "You're not signed in",
    text: "Your training log is saved to your Claude account. Sign in to Claude, then reopen this page.",
  },
  db_unavailable: {
    title: "Storage isn't available here",
    text: "This view can't save or load your log. Open the page in the Claude app to use it.",
  },
  sample_unavailable: {
    title: "The coach is offline in this view",
    text: "Chat and plan generation need Claude. You can still browse and log workouts by hand.",
  },
  not_granted: {
    title: "The coach isn't allowed yet",
    text: "Allow this page to use Claude in the Claude app to chat with the coach. Logging by hand still works.",
  },
  no_user: {
    title: "No account found",
    text: "Sign in to Claude to save your training log.",
  },
};

/**
 * Apply a theme choice to <html>: "system" removes data-theme, "light"/"dark" set it.
 * Also remembers it in localStorage for first paint.
 * @param {"system" | "light" | "dark"} theme
 */
export function applyTheme(theme) {
  const root = document.documentElement;
  if (theme === "light" || theme === "dark") root.setAttribute("data-theme", theme);
  else root.removeAttribute("data-theme");
  lsSet(THEME_KEY, theme === "light" || theme === "dark" ? theme : null);
}

/** Apply the theme saved for first paint (call before the runtime resolves). */
export function applySavedTheme() {
  const t = lsGet(THEME_KEY);
  if (t === "light" || t === "dark") document.documentElement.setAttribute("data-theme", t);
}

/**
 * Render the instant loading shell (used if index.html's static shell was replaced).
 * @param {HTMLElement} root
 */
export function paintLoading(root) {
  if (root.querySelector(".boot")) return;
  replaceChildren(root, h("div", { class: "boot", role: "status" },
    h("div", { class: "boot-mark", "aria-hidden": "true" }, icon("dumbbell", { size: 28 })),
    h("p", { class: "boot-text" }, "Loading your training log…"),
  ));
}

/**
 * Render a fatal error (the runtime itself failed to start).
 * @param {HTMLElement} root
 * @param {any} err
 */
export function renderFatal(root, err) {
  replaceChildren(root, h("div", { class: "boot boot-error", role: "alert" },
    h("div", { class: "boot-mark", "aria-hidden": "true" }, icon("alert", { size: 28 })),
    h("h1", { class: "boot-title" }, "The app couldn't start"),
    h("p", { class: "boot-text" }, "Reload the page to try again. If it keeps happening, the app may be mid-update."),
    h("p", { class: "boot-detail" }, String(err?.message || err?.code || err || "")),
  ));
}

/**
 * Mount the whole app into `root`.
 * @param {HTMLElement} root
 * @param {{ runtime: any, store: any, coach: any, core: any, catalog: any }} deps
 * @returns {{ unmount: () => void }}
 */
export function mountApp(root, { runtime, store, coach, core, catalog }) {
  const unsubs = [];
  const listeners = new Map(); // key -> Set<fn>

  /** Shared context handed to every view. */
  const ctx = {
    runtime,
    store,
    coach,
    core,
    catalog,
    data: {
      profile: null,
      state: structuredClone(STATE_DEFAULTS),
      plans: [],
      sessions: [],
      loaded: { profile: false, state: false, plans: false, sessions: false },
    },
    route: "coach",
    /** Subscribe to hub updates for some keys. Returns an unsubscribe. */
    on(keys, fn) {
      for (const k of keys) {
        if (!listeners.has(k)) listeners.set(k, new Set());
        listeners.get(k).add(fn);
      }
      return () => keys.forEach((k) => listeners.get(k)?.delete(fn));
    },
    nav,
    today: () => safe(() => core.todayISO(), "") || localISO(),
    agreedPlan: () => ctx.data.plans.find((p) => p?.status === "agreed") || null,
    draftPlan: () => ctx.data.plans.find((p) => p?.status === "draft") || null,
    coachStatus: () => {
      if (!coach) return { available: false, reason: store ? "sample_unavailable" : "no_user" };
      return safe(() => coach.status(), { available: true, reason: null }) || { available: true, reason: null };
    },
    isOnboarding: () => !ctx.data.profile?.onboarded,
    weekStartOf: (iso) => safe(() => core.weekStartOf(iso), "") || sundayFallback(iso),
    openSettings: () => openSettings(ctx),
    applyTheme,
    /** Filled in by the views. */
    chat: null,
    plan: null,
    history: null,
  };

  function emit(key) {
    for (const fn of listeners.get(key) || []) {
      try {
        fn(key);
      } catch (err) {
        reportError(err);
      }
    }
  }

  // ---- data hub: one subscription per stream -------------------------------------------------
  if (store) {
    hook("profile", () => store.profile.subscribe((p) => setData("profile", p ?? null)), () => store.profile.get());
    hook("state", () => store.state.subscribe((s) => setData("state", withStateDefaults(s))), () => store.state.get(), withStateDefaults);
    hook("plans", () => store.plans.subscribe((list) => setData("plans", asList(list))), () => store.plans.list({ limit: 20 }), asList);
    hook("sessions", () => store.sessions.subscribe((list) => setData("sessions", asList(list)), { limit: 500 }), () => store.sessions.list({ limit: 500 }), asList);
  }

  function hook(key, subscribe, get, map = (x) => x) {
    try {
      unsubs.push(toUnsub(subscribe()));
    } catch (err) {
      reportError(err);
    }
    // Fallback initial read in case the first snapshot is slow.
    Promise.resolve()
      .then(get)
      .then((v) => {
        if (!ctx.data.loaded[key]) setData(key, map(v));
      })
      .catch(() => {
        if (!ctx.data.loaded[key]) setData(key, ctx.data[key]);
      });
  }

  function setData(key, value) {
    ctx.data[key] = value;
    ctx.data.loaded[key] = true;
    if (key === "state") syncTheme(value);
    emit(key);
  }

  function syncTheme(state) {
    const theme = state?.settings?.theme || "system";
    applyTheme(theme);
  }

  // ---- shell -------------------------------------------------------------------------------
  const settingsBtn = h("button", {
    type: "button",
    class: "btn btn-icon btn-header",
    id: "open-settings",
    "aria-label": "Settings",
    onClick: () => ctx.openSettings(),
  }, icon("settings", { size: 22 }));

  // Coach tab only: clear the conversation (in-page confirm owned by chat.js).
  const clearChatBtn = h("button", {
    type: "button",
    class: "btn btn-icon btn-header",
    id: "clear-chat",
    "aria-label": "Clear chat",
    title: "Clear chat",
    hidden: true,
    onClick: () => ctx.chat?.confirmClear?.(),
  }, icon("trash", { size: 20 }));

  const header = h("header", { class: "topbar" },
    h("div", { class: "topbar-inner" },
      h("div", { class: "brand" },
        h("span", { class: "brand-mark", "aria-hidden": "true" }, icon("dumbbell", { size: 20 })),
        h("span", { class: "brand-name" }, "Personal Trainer"),
        runtime?.mode === "mock" ? h("span", { class: "dev-tag", title: "Dev mode: simulated coach, data in this browser" }, "Dev") : null,
      ),
      h("div", { class: "topbar-actions" }, clearChatBtn, settingsBtn),
    ),
  );

  const problemsEl = h("div", { class: "problems", hidden: true });
  const views = {
    coach: h("section", { class: "view view-coach", id: "view-coach", "aria-label": "Coach", hidden: true }),
    history: h("section", { class: "view view-history", id: "view-history", "aria-label": "History", hidden: true }),
    plan: h("section", { class: "view view-plan", id: "view-plan", "aria-label": "Plan", hidden: true }),
  };
  const main = h("main", { class: "main", id: "main" }, problemsEl, views.coach, views.history, views.plan);

  const tabDefs = [
    { route: "coach", label: "Coach", icon: "coach" },
    { route: "history", label: "History", icon: "history" },
    { route: "plan", label: "Plan", icon: "plan" },
  ];
  const tabs = tabDefs.map((t) =>
    h("a", { class: "tab", href: `#${t.route}`, id: `tab-${t.route}`, dataset: { route: t.route } },
      icon(t.icon, { size: 24 }),
      h("span", { class: "tab-label" }, t.label),
      h("span", { class: "tab-badge", hidden: true, "aria-hidden": "true" }),
    ),
  );
  const tabbar = h("nav", { class: "tabbar", "aria-label": "Sections" }, h("div", { class: "tabbar-inner" }, tabs));

  const shell = h("div", { class: "shell" }, header, main, tabbar);
  replaceChildren(root, shell);

  // ---- problems ----------------------------------------------------------------------------
  function renderProblems() {
    const codes = new Set(Array.isArray(runtime?.problems) ? runtime.problems : []);
    if (!store) codes.add(runtime?.uid ? "db_unavailable" : "not_signed_in");
    const status = ctx.coachStatus();
    if (store && !status.available && status.reason && !codes.has("sample_unavailable")) codes.add(status.reason);
    const items = [...codes].filter((c) => PROBLEM_COPY[c] || c);
    problemsEl.hidden = !items.length;
    replaceChildren(problemsEl, items.map((c) => {
      const copy = PROBLEM_COPY[c] || { title: "Something isn't available", text: `This view reported "${c}".` };
      return h("div", { class: "problem", role: "status" },
        icon("alert", { size: 20 }),
        h("div", { class: "problem-copy" }, h("strong", {}, copy.title), h("span", {}, copy.text)),
      );
    }));
  }
  renderProblems();

  // ---- views -------------------------------------------------------------------------------
  const mounted = {};
  const mounters = { coach: mountChat, history: mountHistory, plan: mountPlan };
  for (const r of ROUTES) {
    try {
      mounted[r] = mounters[r](views[r], ctx);
    } catch (err) {
      reportError(err);
      replaceChildren(views[r], h("div", { class: "empty" }, h("h3", { class: "empty-title" }, "This tab failed to load"), h("p", { class: "empty-text" }, String(err?.message || err))));
    }
  }

  // tab badge: plan has a draft waiting
  const planBadge = tabs[2].querySelector(".tab-badge");
  unsubs.push(ctx.on(["plans", "state"], () => {
    const hasDraft = Boolean(ctx.draftPlan());
    const pending = Boolean(ctx.data.state?.pendingPlanRequest);
    planBadge.hidden = !(hasDraft || pending);
    tabs[2].setAttribute("aria-label", hasDraft ? "Plan, draft waiting" : "Plan");
  }));

  // ---- routing -----------------------------------------------------------------------------
  function routeFromHash() {
    const r = String(location.hash || "").replace(/^#/, "");
    return ROUTES.includes(r) ? r : null;
  }

  function nav(route) {
    if (!ROUTES.includes(route)) route = "coach";
    if (location.hash !== `#${route}`) location.hash = route;
    else show(route);
  }

  function show(route) {
    const changed = ctx.route !== route;
    ctx.route = route;
    clearChatBtn.hidden = route !== "coach" || !store;
    for (const r of ROUTES) {
      views[r].hidden = r !== route;
      tabs[ROUTES.indexOf(r)].toggleAttribute("aria-current", r === route);
      if (r === route) tabs[ROUTES.indexOf(r)].setAttribute("aria-current", "page");
    }
    lsSet(TAB_KEY, route);
    document.documentElement.dataset.route = route;
    if (changed && route !== "coach") window.scrollTo({ top: 0 });
    mounted[route]?.show?.();
  }

  const onHash = () => show(routeFromHash() || "coach");
  window.addEventListener("hashchange", onHash);
  unsubs.push(() => window.removeEventListener("hashchange", onHash));
  const initial = routeFromHash() || (ROUTES.includes(lsGet(TAB_KEY)) ? lsGet(TAB_KEY) : "coach");
  ctx.route = null;
  show(initial);

  // ---- viewport (keyboard) tracking --------------------------------------------------------
  const vv = window.visualViewport;
  if (vv) {
    const onVV = () => {
      const kb = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
      document.documentElement.style.setProperty("--kb", `${Math.round(kb)}px`);
      document.documentElement.style.setProperty("--vvh", `${Math.round(vv.height)}px`);
      document.documentElement.classList.toggle("kb-open", kb > 80);
    };
    vv.addEventListener("resize", onVV);
    vv.addEventListener("scroll", onVV);
    onVV();
    unsubs.push(() => {
      vv.removeEventListener("resize", onVV);
      vv.removeEventListener("scroll", onVV);
    });
  }

  return {
    unmount() {
      for (const r of ROUTES) safe(() => mounted[r]?.teardown?.(), null);
      unsubs.splice(0).forEach((u) => safe(u, null));
      listeners.clear();
    },
  };
}

function withStateDefaults(s) {
  const src = s && typeof s === "object" ? s : {};
  return {
    ...STATE_DEFAULTS,
    ...src,
    settings: { ...STATE_DEFAULTS.settings, ...(src.settings || {}) },
    rotation: { ...STATE_DEFAULTS.rotation, ...(src.rotation || {}), done: Array.isArray(src.rotation?.done) ? src.rotation.done : [] },
    onboarding: { ...STATE_DEFAULTS.onboarding, ...(src.onboarding || {}) },
  };
}

function asList(v) {
  if (Array.isArray(v)) return v;
  if (Array.isArray(v?.items)) return v.items;
  if (Array.isArray(v?.docs)) return v.docs.map((d) => (typeof d?.data === "function" ? d.data() : d));
  return [];
}

function sundayFallback(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || ""));
  const d = m ? new Date(+m[1], +m[2] - 1, +m[3]) : new Date();
  d.setDate(d.getDate() - d.getDay());
  return localISO(d);
}

function reportError(err) {
  // Surface programming errors in the console without crashing the shell.
  // eslint-disable-next-line no-console
  console.error(err);
}
