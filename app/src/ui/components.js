// Owner: Agent D. Shared DOM helpers, icons, formatting and small widgets for the UI.
// Everything builds DOM nodes with textContent / attributes; nothing here uses innerHTML.

const SVG_NS = "http://www.w3.org/2000/svg";

/**
 * Create an element. `attrs` keys: class, text, dataset, style (object), hidden, on<Event> handlers,
 * any other key becomes an attribute (booleans toggle presence). Children may be nodes, strings,
 * numbers, arrays, or null/false (skipped).
 * @param {string} tag
 * @param {Record<string, any>} [attrs]
 * @param {...any} children
 * @returns {HTMLElement}
 */
export function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [key, val] of Object.entries(attrs || {})) {
    if (val == null || val === false) continue;
    if (key === "class") el.className = Array.isArray(val) ? val.filter(Boolean).join(" ") : val;
    else if (key === "text") el.textContent = String(val);
    else if (key === "dataset") Object.assign(el.dataset, val);
    else if (key === "style" && typeof val === "object") Object.assign(el.style, val);
    else if (key === "hidden") el.hidden = Boolean(val);
    else if (key === "value" && "value" in el) el.value = val;
    else if (key === "checked" && "checked" in el) el.checked = Boolean(val);
    else if (key.startsWith("on") && typeof val === "function") el.addEventListener(key.slice(2).toLowerCase(), val);
    else if (val === true) el.setAttribute(key, "");
    else el.setAttribute(key, String(val));
  }
  append(el, children);
  return el;
}

/**
 * Append children (flattening arrays, skipping null/false) to a node.
 * @param {Node} el
 * @param {any[]} children
 * @returns {Node}
 */
export function append(el, children) {
  for (const c of children.flat(Infinity)) {
    if (c == null || c === false || c === true) continue;
    el.appendChild(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return el;
}

/**
 * Remove all children of a node and append new ones.
 * @param {Node} el
 * @param {...any} children
 * @returns {Node}
 */
export function replaceChildren(el, ...children) {
  while (el.firstChild) el.removeChild(el.firstChild);
  return append(el, children);
}

// ---------------------------------------------------------------------------------------------
// Icons: 24×24 stroke icons built from static path data.

const ICONS = {
  coach: [["path", { d: "M4 5h16v11H10l-4.5 3.5V16H4z" }], ["path", { d: "M8 9.5h8M8 12.5h5" }]],
  history: [["path", { d: "M9 6h11M9 12h11M9 18h11" }], ["path", { d: "M4.5 6h.01M4.5 12h.01M4.5 18h.01", "stroke-width": "3" }]],
  plan: [["rect", { x: "3.5", y: "5", width: "17", height: "15.5", rx: "1.5" }], ["path", { d: "M3.5 10h17M8 3v4M16 3v4" }], ["path", { d: "M7.5 14h3v3h-3z" }]],
  settings: [["path", { d: "M4 7h9M17 7h3M4 17h3M11 17h9" }], ["circle", { cx: "15", cy: "7", r: "2.2" }], ["circle", { cx: "9", cy: "17", r: "2.2" }]],
  plus: [["path", { d: "M12 5v14M5 12h14" }]],
  minus: [["path", { d: "M5 12h14" }]],
  copy: [["rect", { x: "8.5", y: "8.5", width: "11", height: "11", rx: "1.5" }], ["path", { d: "M15.5 8.5V5.5a1 1 0 0 0-1-1h-9a1 1 0 0 0-1 1v9a1 1 0 0 0 1 1h3" }]],
  close: [["path", { d: "M6 6l12 12M18 6 6 18" }]],
  chevron: [["path", { d: "m6 9 6 6 6-6" }]],
  check: [["path", { d: "m5 12.5 4.5 4.5L19.5 7" }]],
  play: [["path", { d: "M8 5.5v13l10.5-6.5z" }]],
  stop: [["rect", { x: "7", y: "7", width: "10", height: "10", rx: "1", fill: "currentColor", stroke: "none" }]],
  send: [["path", { d: "M12 19V5M5.5 11.5 12 5l6.5 6.5" }]],
  undo: [["path", { d: "M9 14 4 9l5-5" }], ["path", { d: "M4 9h10.5a5.5 5.5 0 0 1 0 11H11" }]],
  trash: [["path", { d: "M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" }]],
  edit: [["path", { d: "M4 20h4L19 9l-4-4L4 16v4z" }], ["path", { d: "m13.5 6.5 4 4" }]],
  alert: [["path", { d: "M12 4 21 20H3z" }], ["path", { d: "M12 10v4.5M12 17.2h.01" }]],
  search: [["circle", { cx: "11", cy: "11", r: "6.5" }], ["path", { d: "m20 20-4.4-4.4" }]],
  clock: [["circle", { cx: "12", cy: "12", r: "8.5" }], ["path", { d: "M12 7.5V12l3 2" }]],
  pr: [["path", { d: "m6 18 6-6 6 6M6 11l6-6 6 6" }]],
  refresh: [["path", { d: "M19.5 12a7.5 7.5 0 1 1-2.2-5.3" }], ["path", { d: "M19.5 4.5v4h-4" }]],
  download: [["path", { d: "M12 4v11M7 10.5l5 5 5-5M5 20h14" }]],
  arrow: [["path", { d: "M5 12h14M13 6l6 6-6 6" }]],
  dumbbell: [["path", { d: "M6.5 7v10M3.5 9.5v5M17.5 7v10M20.5 9.5v5M6.5 12h11" }]],
  bolt: [["path", { d: "M13 3 5 13.5h6L10.5 21 19 10h-6z" }]],
  run: [["path", { d: "M4 19h6l2-4 4 2v3M13 7.5l-3 3.5 3.5 3M15.5 10.5l2.5 2.5H21" }], ["circle", { cx: "15.5", cy: "4.8", r: "1.8" }]],
  dot: [["circle", { cx: "12", cy: "12", r: "4", fill: "currentColor", stroke: "none" }]],
};

/**
 * Build an inline SVG icon (decorative, aria-hidden).
 * @param {keyof typeof ICONS | string} name
 * @param {{ size?: number, class?: string }} [opts]
 * @returns {SVGSVGElement}
 */
export function icon(name, { size = 22, class: cls = "" } = {}) {
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("width", String(size));
  svg.setAttribute("height", String(size));
  svg.setAttribute("fill", "none");
  svg.setAttribute("stroke", "currentColor");
  svg.setAttribute("stroke-width", "2");
  svg.setAttribute("stroke-linecap", "round");
  svg.setAttribute("stroke-linejoin", "round");
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("focusable", "false");
  svg.setAttribute("class", ["icon", cls].filter(Boolean).join(" "));
  for (const [tag, attrs] of ICONS[name] || ICONS.dot) {
    const node = document.createElementNS(SVG_NS, tag);
    for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
    svg.appendChild(node);
  }
  return svg;
}

// ---------------------------------------------------------------------------------------------
// Buttons and small widgets

/**
 * A button. kind: "primary" | "secondary" | "ghost" | "danger" | "quiet".
 * @param {{ label?: string, icon?: string, kind?: string, onClick?: Function, id?: string, small?: boolean,
 *           ariaLabel?: string, disabled?: boolean, type?: string, class?: string }} opts
 * @returns {HTMLButtonElement}
 */
export function button({ label = "", icon: ic = null, kind = "secondary", onClick, id, small = false, ariaLabel, disabled = false, type = "button", class: cls = "" } = {}) {
  const b = h("button", {
    type,
    id,
    class: ["btn", `btn-${kind}`, small && "btn-sm", !label && "btn-icon", cls],
    "aria-label": ariaLabel || (!label ? ariaLabel : null),
    disabled,
    onClick,
  });
  if (ic) b.appendChild(icon(ic, { size: small ? 18 : 20 }));
  if (label) b.appendChild(h("span", { text: label }));
  return b;
}

/**
 * Segmented control (radio-like buttons).
 * @param {{ id: string, label: string, options: {value: string, label: string}[], value: string,
 *           onChange: (value: string) => void }} opts
 * @returns {HTMLElement & { setValue: (v: string) => void }}
 */
export function segmented({ id, label, options, value, onChange }) {
  const wrap = h("div", { class: "segmented", role: "radiogroup", "aria-label": label, id });
  const btns = options.map((o) =>
    h("button", {
      type: "button",
      role: "radio",
      id: `${id}-${o.value}`,
      class: "seg",
      "aria-checked": String(o.value === value),
      onClick: () => {
        set(o.value);
        onChange?.(o.value);
      },
    }, o.label),
  );
  function set(v) {
    btns.forEach((b, i) => b.setAttribute("aria-checked", String(options[i].value === v)));
  }
  append(wrap, btns);
  wrap.addEventListener("keydown", (e) => {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
    const idx = btns.indexOf(document.activeElement);
    if (idx < 0) return;
    const next = btns[(idx + (e.key === "ArrowRight" ? 1 : btns.length - 1)) % btns.length];
    next.focus();
    next.click();
    e.preventDefault();
  });
  wrap.setValue = set;
  return wrap;
}

/**
 * A small status pill.
 * @param {string} text
 * @param {string} [kind] e.g. "strength" | "run" | "conditioning" | "pr" | "pain" | "warn" | "error" | "ok" | "next"
 * @returns {HTMLElement}
 */
export function pill(text, kind = "neutral") {
  return h("span", { class: `pill pill-${kind}` }, text);
}

/**
 * Type pill for a Session/Workout type, with the plate-colour marker.
 * @param {string} type
 * @returns {HTMLElement}
 */
export function typePill(type) {
  const t = TYPE_LABEL[type] ? type : "other";
  return h("span", { class: `pill pill-type type-${t}` }, h("span", { class: "plate-dot", "aria-hidden": "true" }), TYPE_LABEL[t]);
}

/** Display names for workout/session types. */
export const TYPE_LABEL = {
  strength: "Strength",
  run: "Run",
  conditioning: "HIIT",
  hybrid: "Hybrid",
  mobility: "Mobility",
  other: "Other",
};

/**
 * Empty-state block.
 * @param {{ title: string, text?: string, actions?: Node[], icon?: string }} opts
 * @returns {HTMLElement}
 */
export function emptyState({ title, text, actions = [], icon: ic }) {
  return h("div", { class: "empty" },
    ic ? h("div", { class: "empty-icon" }, icon(ic, { size: 28 })) : null,
    h("h3", { class: "empty-title" }, title),
    text ? h("p", { class: "empty-text" }, text) : null,
    actions.length ? h("div", { class: "empty-actions" }, actions) : null,
  );
}

/**
 * An inline error line with an optional Retry button.
 * @param {{ text: string, onRetry?: Function, retryLabel?: string }} opts
 * @returns {HTMLElement}
 */
export function errorLine({ text, onRetry, retryLabel = "Retry" }) {
  return h("div", { class: "error-line", role: "alert" },
    icon("alert", { size: 18 }),
    h("span", { class: "error-text" }, text),
    onRetry ? button({ label: retryLabel, icon: "refresh", kind: "secondary", small: true, onClick: onRetry }) : null,
  );
}

/**
 * Replace the contents of `host` with an in-page confirmation. Restores the original children on cancel.
 * @param {HTMLElement} host
 * @param {{ text: string, confirmLabel: string, danger?: boolean, onConfirm: () => any, idPrefix?: string }} opts
 */
export function inlineConfirm(host, { text, confirmLabel, danger = true, onConfirm, idPrefix = "confirm" }) {
  const previous = Array.from(host.childNodes);
  const restore = () => {
    replaceChildren(host, previous);
    previous.find((n) => n instanceof HTMLElement && n.matches("button"))?.focus();
  };
  const yes = button({
    id: `${idPrefix}-yes`,
    label: confirmLabel,
    kind: danger ? "danger" : "primary",
    onClick: async () => {
      yes.disabled = true;
      try {
        await onConfirm();
      } finally {
        if (host.isConnected) restore();
      }
    },
  });
  const no = button({ id: `${idPrefix}-no`, label: "Cancel", kind: "ghost", onClick: restore });
  replaceChildren(host, h("div", { class: "confirm", role: "group", "aria-label": text },
    h("p", { class: "confirm-text" }, text),
    h("div", { class: "confirm-actions" }, no, yes),
  ));
  no.focus();
}

// ---------------------------------------------------------------------------------------------
// Sheets (modal bottom sheets built on <dialog>)

let sheetCount = 0;

/**
 * Open a modal bottom sheet. `build(api)` returns the body content.
 * `backdropClose: false` keeps the sheet open on a tap outside it (for sheets you fill in over time).
 * @param {{ title: string, build: (api: SheetApi) => Node | Node[], onClose?: Function, wide?: boolean, id?: string, backdropClose?: boolean, class?: string }} opts
 * @returns {SheetApi}
 * @typedef {{ close: () => void, setTitle: (t: string) => void, body: HTMLElement, dialog: HTMLDialogElement, footer: HTMLElement }} SheetApi
 */
export function openSheet({ title, build, onClose, id, backdropClose = true, class: cls = "" }) {
  sheetCount += 1;
  const titleId = `sheet-title-${sheetCount}`;
  const titleEl = h("h2", { class: "sheet-title", id: titleId }, title);
  const body = h("div", { class: "sheet-body" });
  const footer = h("div", { class: "sheet-footer", hidden: true });
  const dialog = h("dialog", { class: ["sheet", cls], "aria-labelledby": titleId, id });
  const closeBtn = button({ icon: "close", kind: "ghost", ariaLabel: "Close", onClick: () => api.close(), class: "sheet-close" });
  append(dialog, [h("div", { class: "sheet-panel" },
    h("div", { class: "sheet-grip", "aria-hidden": "true" }),
    h("header", { class: "sheet-head" }, titleEl, closeBtn),
    body,
    footer,
  )]);
  let closed = false;
  const api = {
    body,
    footer,
    dialog,
    setTitle: (t) => { titleEl.textContent = t; },
    close: () => {
      if (closed) return;
      closed = true;
      if (dialog.open) dialog.close();
      dialog.remove();
      if (!document.querySelector("dialog.sheet[open]")) document.documentElement.classList.remove("sheet-open");
      onClose?.();
    },
  };
  dialog.addEventListener("cancel", (e) => { e.preventDefault(); api.close(); });
  dialog.addEventListener("click", (e) => { if (backdropClose && e.target === dialog) api.close(); });
  const content = build(api);
  append(body, [content]);
  if (footer.childNodes.length) footer.hidden = false;
  document.body.appendChild(dialog);
  document.documentElement.classList.add("sheet-open");
  try {
    dialog.showModal();
  } catch {
    dialog.setAttribute("open", "");
  }
  return api;
}

// ---------------------------------------------------------------------------------------------
// Toasts

/**
 * Show a short toast above the tab bar, optionally with an action (e.g. Undo).
 * @param {{ text: string, action?: { label: string, fn: Function }, timeout?: number, kind?: string }} opts
 * @returns {() => void} dismiss
 */
export function toast({ text, action, timeout = 6000, kind = "info" }) {
  let host = document.getElementById("toast-host");
  if (!host) {
    host = h("div", { id: "toast-host", class: "toast-host", "aria-live": "polite" });
    document.body.appendChild(host);
  }
  const el = h("div", { class: `toast toast-${kind}`, role: "status" }, h("span", { class: "toast-text" }, text));
  let timer = null;
  const dismiss = () => {
    clearTimeout(timer);
    el.remove();
  };
  if (action) {
    el.appendChild(h("button", {
      type: "button",
      class: "toast-action",
      onClick: async () => {
        dismiss();
        await action.fn();
      },
    }, action.label));
  }
  host.replaceChildren(el);
  timer = setTimeout(dismiss, timeout);
  return dismiss;
}

// ---------------------------------------------------------------------------------------------
// Timers

/**
 * An elapsed-time ticker for long calls.
 * @param {(ms: number) => void} onTick
 * @returns {{ start: () => void, stop: () => number, elapsed: () => number }}
 */
export function createTicker(onTick) {
  let t0 = 0;
  let id = null;
  return {
    start() {
      t0 = Date.now();
      clearInterval(id);
      onTick(0);
      id = setInterval(() => onTick(Date.now() - t0), 1000);
    },
    stop() {
      clearInterval(id);
      id = null;
      return Date.now() - t0;
    },
    elapsed: () => (t0 ? Date.now() - t0 : 0),
  };
}

// ---------------------------------------------------------------------------------------------
// Formatting

const WD = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MO = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/**
 * Parse a local ISO date (YYYY-MM-DD) as a local Date at midnight.
 * @param {string} iso
 * @returns {Date | null}
 */
export function parseISODate(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || ""));
  if (!m) return null;
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

/**
 * Local ISO date of a Date (or of now).
 * @param {Date} [d]
 * @returns {string}
 */
export function localISO(d = new Date()) {
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/**
 * Local ISO date of an ISO timestamp.
 * @param {string} ts
 * @returns {string}
 */
export function dateOfTs(ts) {
  const d = new Date(ts);
  return Number.isNaN(d.getTime()) ? "" : localISO(d);
}

/**
 * Add days to a local ISO date.
 * @param {string} iso
 * @param {number} n
 * @returns {string}
 */
export function addDays(iso, n) {
  const d = parseISODate(iso) || new Date();
  d.setDate(d.getDate() + n);
  return localISO(d);
}

/**
 * Sunday-start week of a local ISO date (UI fallback; prefer core.weekStartOf).
 * @param {string} iso
 * @returns {string}
 */
export function sundayOf(iso) {
  const d = parseISODate(iso) || new Date();
  d.setDate(d.getDate() - d.getDay());
  return localISO(d);
}

/**
 * "Tue 3 Nov".
 * @param {string} iso
 * @returns {string}
 */
export function fmtDate(iso) {
  const d = parseISODate(iso);
  if (!d) return "";
  return `${WD[d.getDay()]} ${d.getDate()} ${MO[d.getMonth()]}`;
}

/**
 * Parts for a calendar tab: { wd: "TUE", day: "3", mon: "NOV" }.
 * @param {string} iso
 * @returns {{ wd: string, day: string, mon: string }}
 */
export function dateParts(iso) {
  const d = parseISODate(iso);
  if (!d) return { wd: "", day: "", mon: "" };
  return { wd: WD[d.getDay()], day: String(d.getDate()), mon: MO[d.getMonth()] };
}

/**
 * "Today" / "Yesterday" / "Tue 3 Nov".
 * @param {string} iso
 * @param {string} today
 * @returns {string}
 */
export function fmtRelDay(iso, today) {
  if (iso === today) return "Today";
  if (iso === addDays(today, -1)) return "Yesterday";
  return fmtDate(iso);
}

/**
 * "1 – 7 Nov" or "29 Nov – 5 Dec" for a week starting at `start`.
 * @param {string} start
 * @returns {string}
 */
export function fmtWeekRange(start) {
  const a = parseISODate(start);
  if (!a) return "";
  const b = new Date(a);
  b.setDate(b.getDate() + 6);
  if (a.getMonth() === b.getMonth()) return `${a.getDate()} – ${b.getDate()} ${MO[b.getMonth()]}`;
  return `${a.getDate()} ${MO[a.getMonth()]} – ${b.getDate()} ${MO[b.getMonth()]}`;
}

/**
 * Format a kg number without trailing zeros: 102.5, 100, 7.25.
 * @param {number | null | undefined} kg
 * @returns {string}
 */
export function fmtKg(kg) {
  if (kg == null || Number.isNaN(Number(kg))) return "";
  return String(Math.round(Number(kg) * 100) / 100);
}

/**
 * Elapsed ms → "0:12" / "1:05" / "1:02:03".
 * @param {number} ms
 * @returns {string}
 */
export function fmtElapsed(ms) {
  return fmtClock(Math.floor((ms || 0) / 1000));
}

/**
 * Seconds → "m:ss" or "h:mm:ss".
 * @param {number | null | undefined} sec
 * @returns {string}
 */
export function fmtClock(sec) {
  if (sec == null || !Number.isFinite(Number(sec))) return "";
  const s = Math.max(0, Math.round(Number(sec)));
  const hh = Math.floor(s / 3600);
  const mm = Math.floor((s % 3600) / 60);
  const ss = String(s % 60).padStart(2, "0");
  return hh ? `${hh}:${String(mm).padStart(2, "0")}:${ss}` : `${mm}:${ss}`;
}

/**
 * Seconds of rest → "90 s" / "2 min" / "2:30".
 * @param {number | null | undefined} sec
 * @returns {string}
 */
export function fmtRest(sec) {
  if (!sec) return "";
  if (sec < 120 && sec % 60 !== 0) return `${sec} s`;
  if (sec % 60 === 0) return `${sec / 60} min`;
  return fmtClock(sec);
}

/**
 * Pace (sec per km) → "5:32/km". Uses core.formatPace when available.
 * @param {any} core
 * @param {number | null | undefined} sec
 * @returns {string}
 */
export function fmtPace(core, sec) {
  if (!sec || !Number.isFinite(Number(sec))) return "";
  const viaCore = safe(() => core.formatPace(sec), "");
  return viaCore || `${fmtClock(sec)}/km`;
}

/**
 * Km → "8.2 km" (one decimal unless whole).
 * @param {number | null | undefined} km
 * @returns {string}
 */
export function fmtKm(km) {
  if (km == null || !Number.isFinite(Number(km))) return "";
  const v = Math.round(Number(km) * 10) / 10;
  return `${v} km`;
}

/**
 * Pluralise: plural(3, "session") → "3 sessions".
 * @param {number} n
 * @param {string} word
 * @param {string} [pluralWord]
 * @returns {string}
 */
export function plural(n, word, pluralWord) {
  return `${n} ${n === 1 ? word : pluralWord || `${word}s`}`;
}

/**
 * Run a function, returning a fallback on throw (used around cross-module calls).
 * @template T
 * @param {() => T} fn
 * @param {T} fallback
 * @returns {T}
 */
export function safe(fn, fallback) {
  try {
    const v = fn();
    return v === undefined ? fallback : v;
  } catch {
    return fallback;
  }
}

/**
 * Normalise an unsubscribe handle (function or object with unsubscribe) into a function.
 * @param {any} handle
 * @returns {() => void}
 */
export function toUnsub(handle) {
  if (typeof handle === "function") return handle;
  if (handle && typeof handle.unsubscribe === "function") return () => handle.unsubscribe();
  return () => {};
}

/**
 * Text for an error from a coach/store call.
 * @param {any} coach
 * @param {any} err  a code string or an error-ish object
 * @returns {string}
 */
export function errorText(coach, err) {
  const code = typeof err === "string" ? err : err?.code || "upstream_error";
  const viaCoach = safe(() => coach?.errorCopy?.(code), "");
  if (viaCoach) return viaCoach;
  return FALLBACK_ERRORS[code] || FALLBACK_ERRORS.upstream_error;
}

const FALLBACK_ERRORS = {
  no_user: "You need to be signed in to Claude to save this.",
  not_granted: "This page isn't allowed to use Claude. Allow it in the Claude app to use the coach.",
  rate_limited: "Too many requests right now. Wait a minute, then try again.",
  session_expired: "Your Claude session expired. Sign in again, then retry.",
  refused: "The coach couldn't answer that. Try rephrasing.",
  empty_completion: "The coach returned nothing. Try asking in a different way.",
  invalid_json: "The plan came back malformed. Try again.",
  prompt_too_large: "Too much context for one request. Try a shorter message.",
  upstream_error: "Couldn't reach the coach. Check your connection and try again.",
};

// ---------------------------------------------------------------------------------------------
// localStorage conveniences (never required)

/**
 * Read a localStorage value safely.
 * @param {string} key
 * @returns {string | null}
 */
export function lsGet(key) {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

/**
 * Write (or remove when value is null) a localStorage value safely.
 * @param {string} key
 * @param {string | null} value
 */
export function lsSet(key, value) {
  try {
    if (value == null) window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, value);
  } catch {
    /* storage unavailable: conveniences only */
  }
}

/** True on touch-first devices, where Enter should insert a newline instead of sending. */
export function isCoarsePointer() {
  return safe(() => window.matchMedia("(pointer: coarse)").matches, false);
}

/** True when the user prefers reduced motion. */
export function reducedMotion() {
  return safe(() => window.matchMedia("(prefers-reduced-motion: reduce)").matches, false);
}
