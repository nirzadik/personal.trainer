// Shared, deterministic helpers for prompt building (owner: Agent B).
// Pure functions only: no I/O, no platform calls, no imports of other agents' modules.

const encoder = typeof TextEncoder !== "undefined" ? new TextEncoder() : null;

/** Marker appended where text was cut to fit a budget. */
export const TRUNCATION_MARK = " …[truncated]";

/**
 * UTF-8 byte length of a string (what sample.d.ts limits are measured in).
 * @param {string} str
 * @returns {number}
 */
export function utf8Bytes(str) {
  const s = String(str ?? "");
  if (encoder) return encoder.encode(s).length;
  let n = 0;
  for (const ch of s) {
    const c = ch.codePointAt(0);
    n += c < 0x80 ? 1 : c < 0x800 ? 2 : c < 0x10000 ? 3 : 4;
  }
  return n;
}

/**
 * Cut a string so its UTF-8 size is at most `maxBytes`, never splitting a code point.
 * Appends `marker` when anything was removed (the marker counts toward the budget).
 * @param {string} str
 * @param {number} maxBytes
 * @param {string} [marker]
 * @returns {string}
 */
export function truncateBytes(str, maxBytes, marker = TRUNCATION_MARK) {
  const s = String(str ?? "");
  if (utf8Bytes(s) <= maxBytes) return s;
  const room = Math.max(0, maxBytes - utf8Bytes(marker));
  let out = "";
  let used = 0;
  for (const ch of s) {
    const b = utf8Bytes(ch);
    if (used + b > room) break;
    out += ch;
    used += b;
  }
  return utf8Bytes(marker) <= maxBytes ? out + marker : out;
}

/**
 * Cut a string to at most `maxChars` characters (code points), adding "…" when cut.
 * @param {string} str
 * @param {number} maxChars
 * @returns {string}
 */
export function clip(str, maxChars) {
  const s = String(str ?? "").trim();
  const chars = Array.from(s);
  if (chars.length <= maxChars) return s;
  return chars.slice(0, Math.max(0, maxChars - 1)).join("").trimEnd() + "…";
}

/**
 * Recursively drop null / undefined / "" / [] / {} values (keeps 0 and false).
 * Returns undefined when nothing is left.
 * @param {unknown} value
 * @returns {unknown}
 */
export function compactValue(value) {
  if (value === null || value === undefined) return undefined;
  if (typeof value === "string") return value.trim() === "" ? undefined : value;
  if (typeof value === "number") return Number.isFinite(value) ? value : undefined;
  if (typeof value !== "object") return value;
  if (Array.isArray(value)) {
    const arr = value.map(compactValue).filter((v) => v !== undefined);
    return arr.length ? arr : undefined;
  }
  const out = {};
  for (const [k, v] of Object.entries(value)) {
    const c = compactValue(v);
    if (c !== undefined) out[k] = c;
  }
  return Object.keys(out).length ? out : undefined;
}

/**
 * JSON for prompts: compacted (no empties), single line, cut to `maxBytes`.
 * @param {unknown} value
 * @param {number} [maxBytes]
 * @returns {string}
 */
export function compactJson(value, maxBytes = Infinity) {
  const json = JSON.stringify(compactValue(value) ?? {});
  return Number.isFinite(maxBytes) ? truncateBytes(json, maxBytes) : json;
}

/**
 * Deep clone of plain JSON data.
 * @template T
 * @param {T} value
 * @returns {T}
 */
export function cloneJson(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

/**
 * True for plain objects (not arrays, not null).
 * @param {unknown} v
 * @returns {v is Record<string, unknown>}
 */
export function isPlainObject(v) {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

/**
 * Validate a local ISO date string `YYYY-MM-DD`.
 * @param {unknown} s
 * @returns {boolean}
 */
export function isIsoDate(s) {
  return typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s + "T00:00:00Z"));
}

/**
 * Add days to an ISO date (calendar arithmetic in UTC, so no DST surprises).
 * @param {string} iso YYYY-MM-DD
 * @param {number} days
 * @returns {string}
 */
export function addDaysISO(iso, days) {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

/**
 * English weekday name of an ISO date.
 * @param {string} iso
 * @returns {string}
 */
export function weekdayName(iso) {
  return WEEKDAYS[new Date(iso + "T00:00:00Z").getUTCDay()] ?? "";
}

/**
 * Local ISO date of a Date (fallback when core.todayISO is unavailable).
 * @param {Date} [d]
 * @returns {string}
 */
export function localISODate(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/**
 * Sunday-start week of an ISO date (fallback when core.weekStartOf is unavailable).
 * @param {string} iso
 * @returns {string}
 */
export function sundayOf(iso) {
  const dow = new Date(iso + "T00:00:00Z").getUTCDay();
  return addDaysISO(iso, -dow);
}

/**
 * Format seconds as m:ss or h:mm:ss.
 * @param {number} sec
 * @returns {string}
 */
export function fmtDuration(sec) {
  const s = Math.round(Number(sec));
  if (!Number.isFinite(s) || s < 0) return "";
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = String(s % 60).padStart(2, "0");
  return h ? `${h}:${String(m).padStart(2, "0")}:${r}` : `${m}:${r}`;
}

/**
 * Format a pace in seconds per km as "5:32/km".
 * @param {number} secPerKm
 * @returns {string}
 */
export function fmtPace(secPerKm) {
  const t = fmtDuration(secPerKm);
  return t ? `${t}/km` : "";
}

/**
 * Format a number without float noise (max 2 decimals).
 * @param {number} n
 * @returns {string}
 */
export function fmtNum(n) {
  const x = Number(n);
  if (!Number.isFinite(x)) return "";
  return String(Math.round(x * 100) / 100);
}

/**
 * Compact text for a list of strength sets: work sets grouped by load,
 * e.g. "100×5,5,4 RIR 2/1/0" or "BW×12,10". Warm-ups are skipped unless no work sets exist.
 * @param {Array<{type?: string, loadKg?: number|null, bodyweight?: boolean, reps?: number, rir?: number|null}>} sets
 * @returns {string}
 */
export function fmtSets(sets) {
  const all = Array.isArray(sets) ? sets.filter(Boolean) : [];
  const work = all.filter((s) => s.type !== "warmup");
  const list = work.length ? work : all;
  if (!list.length) return "";
  const groups = [];
  for (const s of list) {
    const load = s.bodyweight || s.loadKg === null || s.loadKg === undefined
      ? (s.loadKg ? `BW+${fmtNum(s.loadKg)}` : "BW")
      : fmtNum(s.loadKg);
    const last = groups[groups.length - 1];
    if (last && last.load === load) last.reps.push(s.reps ?? "?");
    else groups.push({ load, reps: [s.reps ?? "?"] });
  }
  let text = groups.map((g) => `${g.load}×${g.reps.join(",")}`).join(" ");
  const rirs = list.map((s) => (s.rir === null || s.rir === undefined ? null : s.rir));
  if (rirs.some((r) => r !== null)) {
    const uniq = new Set(rirs.map(String));
    text += uniq.size === 1 ? ` RIR ${rirs[0]}` : ` RIR ${rirs.map((r) => (r === null ? "?" : r)).join("/")}`;
  }
  if (!work.length) text += " (warm-up)";
  return text;
}

/**
 * Compact, human-readable lines for one logged Session (used in prompts and tool results).
 * Example: "2026-11-05 · Upper A [strength, W1, done] · 55 min · sRPE 7\n  bench_press 80×8,8,7 RIR 2/2/1; …"
 * @param {object} session
 * @param {{ notesChars?: number, commentChars?: number, withId?: boolean }} [opts]
 * @returns {string}
 */
export function formatSessionCompact(session, { notesChars = 140, commentChars = 0, withId = true } = {}) {
  if (!isPlainObject(session)) return "";
  const s = session;
  const tags = [s.type, s.workoutId, s.status && s.status !== "done" ? s.status : null, s.missedReason]
    .filter(Boolean).join(", ");
  const head = [
    `${s.date ?? "?"} · ${clip(s.title || s.type || "Session", 60)}${tags ? ` [${tags}]` : ""}`,
    s.durationMin ? `${fmtNum(s.durationMin)} min` : null,
    s.readiness ? `readiness ${s.readiness}/5` : null,
    s.sessionRpe ? `sRPE ${s.sessionRpe}` : null,
    withId && s.id ? `id ${s.id}` : null,
  ].filter(Boolean).join(" · ");
  const lines = [head];
  if (Array.isArray(s.strength) && s.strength.length) {
    lines.push("  " + s.strength
      .map((ex) => `${ex.exerciseId || clip(ex.name, 30) || "?"} ${fmtSets(ex.sets)}${ex.feedback ? ` [felt ${ex.feedback}]` : ""}`.trim())
      .join("; "));
  }
  if (isPlainObject(s.run)) {
    const r = s.run;
    const pace = r.avgPaceSecPerKm || (r.distanceKm && r.durationSec ? r.durationSec / r.distanceKm : null);
    lines.push("  run " + [
      r.runType, r.distanceKm ? `${fmtNum(r.distanceKm)} km` : null,
      r.durationSec ? fmtDuration(r.durationSec) : null, pace ? `(${fmtPace(pace)})` : null,
      r.avgHr ? `HR ${r.avgHr}` : null, r.rpe ? `RPE ${r.rpe}` : null,
    ].filter(Boolean).join(" "));
  }
  if (Array.isArray(s.conditioning) && s.conditioning.length) {
    for (const c of s.conditioning.slice(0, 3)) {
      const res = isPlainObject(c.result) ? c.result : {};
      const result = [
        res.rounds !== null && res.rounds !== undefined ? `${res.rounds} rds` : null,
        res.reps ? `${res.reps} reps` : null,
        res.timeSec ? fmtDuration(res.timeSec) : null,
        res.calories ? `${res.calories} cal` : null,
        res.completed === false ? "not finished" : null,
      ].filter(Boolean).join(" + ");
      lines.push(`  ${c.format || "metcon"}: ${clip(c.description, 120)}${result ? ` → ${result}` : ""}${c.scaled ? " (scaled)" : ""}${c.rpe ? ` RPE ${c.rpe}` : ""}${c.feedback ? ` [felt ${c.feedback}]` : ""}`);
    }
  }
  if (Array.isArray(s.pain) && s.pain.length) {
    lines.push("  pain: " + s.pain.map((p) => `${p.area} ${p.score}/10${p.when ? ` ${p.when}` : ""}`).join(", "));
  }
  if (Array.isArray(s.prs) && s.prs.length) {
    lines.push("  PRs: " + s.prs.slice(0, 4).map((p) => `${p.exerciseId || ""} ${p.kind} ${fmtNum(p.value)}${p.previous ? ` (prev ${fmtNum(p.previous)})` : ""}`.trim()).join("; "));
  }
  if (s.notes && notesChars > 0) lines.push(`  notes: ${clip(s.notes, notesChars)}`);
  if (s.coachComment && commentChars > 0) lines.push(`  coach: ${clip(s.coachComment, commentChars)}`);
  return lines.join("\n");
}

/**
 * Join sections ("## Title\nbody") skipping empty bodies, each cut to its own byte budget,
 * then the whole cut to `maxBytes`.
 * @param {Array<{ title: string, body: string, maxBytes?: number }>} sections
 * @param {number} maxBytes
 * @param {string} [prefix] heading prefix, default "## "
 * @returns {string}
 */
export function joinSections(sections, maxBytes, prefix = "## ") {
  const parts = [];
  for (const sec of sections) {
    const body = String(sec.body ?? "").trim();
    if (!body) continue;
    const cut = sec.maxBytes ? truncateBytes(body, sec.maxBytes) : body;
    parts.push(`${prefix}${sec.title}\n${cut}`);
  }
  return truncateBytes(parts.join("\n\n"), maxBytes);
}

/**
 * Sort sessions oldest → newest by date, then createdAt (stable, non-mutating).
 * @param {object[]} sessions
 * @returns {object[]}
 */
export function sortSessionsAsc(sessions) {
  return (Array.isArray(sessions) ? sessions.filter(isPlainObject) : [])
    .map((s, i) => ({ s, i }))
    .sort((a, b) => String(a.s.date ?? "").localeCompare(String(b.s.date ?? ""))
      || String(a.s.createdAt ?? "").localeCompare(String(b.s.createdAt ?? ""))
      || a.i - b.i)
    .map((x) => x.s);
}

/** Note kinds that stay relevant however old they are (standing facts), versus running commentary. */
const STANDING_NOTE_KINDS = ["injury", "preference", "goal"];

/**
 * Choose which CoachMemory notes go into a prompt. The store keeps 200 notes; a prompt has room for far fewer, and
 * "the newest 20" silently forgets an injury or preference noted months ago once enough small insights pile up.
 * So: standing facts (injury, preference, goal) keep the newest `perStandingKind` each, running commentary
 * (insight, decision, anything else) the newest `recent`; exact duplicate texts collapse to the newest; the result
 * is trimmed from the OLDEST commentary first to fit `maxBytes`, and returned oldest → newest.
 * @param {object[]} notes CoachMemory.notes (oldest → newest)
 * @param {{ recent?: number, perStandingKind?: number, maxBytes?: number, noteChars?: number }} [opts]
 * @returns {object[]}
 */
export function selectNotes(notes, { recent = 12, perStandingKind = 8, maxBytes = 4000, noteChars = 300 } = {}) {
  const list = (Array.isArray(notes) ? notes : []).filter((n) => isPlainObject(n) && String(n.text ?? "").trim());
  const seenText = new Set();
  const picked = [];
  const left = { other: recent };
  for (const k of STANDING_NOTE_KINDS) left[k] = perStandingKind;
  for (let i = list.length - 1; i >= 0; i--) {
    const n = list[i];
    const bucket = STANDING_NOTE_KINDS.includes(n.kind) ? n.kind : "other";
    const key = String(n.text).trim().toLowerCase();
    if (left[bucket] <= 0 || seenText.has(key)) continue;
    seenText.add(key);
    left[bucket] -= 1;
    picked.push({ i, n, standing: bucket !== "other" });
  }
  const size = (x) => utf8Bytes(clip(x.n.text, noteChars)) + 28;
  let total = picked.reduce((a, x) => a + size(x), 0);
  // over budget: drop the oldest commentary first, then the oldest standing facts
  for (const standing of [false, true]) {
    for (let k = picked.length - 1; k >= 0 && total > maxBytes; k--) {
      if (picked[k].standing !== standing) continue;
      total -= size(picked[k]);
      picked.splice(k, 1);
    }
  }
  return picked.sort((a, b) => a.i - b.i).map((x) => x.n);
}
