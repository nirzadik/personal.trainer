// Owner: Agent C. See CONTRACT.md §4 and §5.3.
//
// The app's data layer over the `db` capability. Everything lives under the
// viewer's private subtree `data/users/<uid>/`:
//
//   data/users/<uid>/profile                    Profile
//   data/users/<uid>/coach                      CoachMemory
//   data/users/<uid>/state                      AppState
//   data/users/<uid>/body                       { entries: [{ date, kg }] }   (≤ 400, oldest first)
//   data/users/<uid>/plans/weeks/<planId>       Plan
//   data/users/<uid>/log/sessions/<sessionId>   Session
//   data/users/<uid>/chat/days/<YYYY-MM-DD>     { date, messages }            (≤ 300 per day)
//
// Rules this module enforces for its callers:
//   - Writes to one document are serialized (per-path promise queue), and a
//     read-modify-write runs inside that queue, so concurrent calls never lose
//     each other's changes and the "one write at a time per document" rule of
//     db.d.ts holds.
//   - Every mutating method resolves `{ ...result, undo }`. `undo()` reverts that
//     one change: patches are reverted field by field (later changes to other
//     fields survive), appended items are removed by id (and anything the cap
//     evicted comes back), added docs are deleted, removed/replaced docs restored.
//     `undo` is idempotent.
//   - Rejections are `{ code, message }`. Db errors pass through unchanged; the
//     store adds `no_user`, `db_unavailable`, `not_found`, `invalid_argument`
//     (bad input, including path-grammar TypeErrors) and `internal`.
//   - Getters return plain, mutable deep copies, filled with defaults.

const UNSAFE_KEYS = new Set(["__proto__", "constructor", "prototype"]);
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const SEGMENT_RE = /^[A-Za-z0-9_\-.~:@+]+$/;
const NOTE_KINDS = ["insight", "decision", "injury", "preference", "goal"];
const CHAT_ROLES = ["user", "assistant", "event"];
const KEEP = Symbol("keep");
const DELETE = Symbol("delete");
const encoder = new TextEncoder();

/** Caps the store applies. */
export const LIMITS = Object.freeze({
  coachNotes: 200,
  noteChars: 1000,
  summaryChars: 2000,
  bodyEntries: 400,
  chatMessagesPerDay: 300,
  messageChars: 20000,
  /** Byte budget for capped-list docs, safely under the 256 KiB document cap. */
  docBudgetBytes: 250 * 1024,
});

/** `format` field of a backup produced by exportAll(). */
export const BACKUP_FORMAT = "personal-trainer-backup";
/** Current backup schema version. */
export const BACKUP_VERSION = 1;

// ---------------------------------------------------------------------------
// defaults (CONTRACT §4)

/** A fresh Profile with every field at its default (§4). @returns {object} */
export function defaultProfile() {
  return {
    version: 1, onboarded: false,
    name: "", age: null, sex: null, heightCm: null, weightKg: null,
    screening: {
      answers: { heartCondition: null, chestPain: null, dizziness: null, chronicCondition: null, medications: null, boneJoint: null, supervisedOnly: null },
      pregnant: null, notes: "", outcome: null, screenedAt: null,
    },
    injuries: [],
    goals: {
      primary: "", secondary: [], why: "", success12w: "", targetDate: null,
      modalities: { strength: true, running: false, conditioning: false },
      event: null,
    },
    schedule: { daysPerWeek: 3, minutesPerSession: 60, preferredDays: [], notes: "" },
    equipment: {
      defaultLocationId: "gym",
      locations: [{ id: "gym", name: "Gym", items: [], dumbbellMaxKg: null, kettlebellsKg: [], notes: "" }],
    },
    experience: {
      level: null, trainingAgeYears: null,
      running: { currentWeeklyKm: null, longestRecentRunKm: null, recentRace: null, easyPaceSecPerKm: null },
      conditioning: { experience: null },
      knownLifts: [],
    },
    preferences: { likes: [], dislikes: [], tone: "direct", logging: "standard" },
    updatedAt: "",
  };
}

/** A fresh, empty CoachMemory (§4). @returns {object} */
export function defaultCoachMemory() {
  return { summary: "", notes: [], updatedAt: "" };
}

/** A fresh AppState (§4). @returns {object} */
export function defaultAppState() {
  return {
    schemaVersion: 1,
    settings: { theme: "system", chatTier: "default" },
    rotation: { planId: null, done: [] },
    onboarding: { status: "not_started" },
    pendingPlanRequest: null,
  };
}

/**
 * A Session with every top-level field at its default (§4); sessions.add()
 * fills missing fields from this. `id`, `date`, `createdAt`, `updatedAt` are
 * assigned by the store.
 * @returns {object}
 */
export function defaultSession() {
  return {
    id: "", date: "", planId: null, workoutId: null, title: "", type: "other", status: "done",
    missedReason: null, durationMin: null, readiness: null, sessionRpe: null, notes: "",
    pain: [], strength: [], conditioning: [], run: null, prs: [],
    coachComment: "", createdBy: "manual", createdAt: "", updatedAt: "",
  };
}

function defaultPlanFields() {
  return {
    focus: "", rationale: "", workouts: [],
    weeklyTargets: { runKm: null, conditioningSessions: null, strengthSetsPerMuscle: {} },
    notes: [], validation: null,
  };
}

// ---------------------------------------------------------------------------
// errors

class StoreError extends Error {
  constructor(code, message = code) {
    super(message);
    this.name = "StoreError";
    this.code = code;
    Object.defineProperty(this, "message", { value: message, enumerable: true, writable: true, configurable: true });
  }
}
const invalid = (message) => new StoreError("invalid_argument", message);

/** Db errors (anything with a string `code`) pass through unchanged. */
function toStoreError(e) {
  if (e && typeof e === "object" && typeof e.code === "string") return e;
  if (e instanceof TypeError) return new StoreError("invalid_argument", e.message);
  return new StoreError("internal", e?.message ? String(e.message) : String(e));
}

// ---------------------------------------------------------------------------
// plain-JSON helpers

function isPlainObject(v) {
  if (v === null || typeof v !== "object") return false;
  const proto = Object.getPrototypeOf(v);
  return proto === Object.prototype || proto === null;
}

/** Deep copy as plain JSON; drops `undefined` and unsafe keys. */
function toJson(v) {
  if (v === undefined) return undefined;
  return JSON.parse(JSON.stringify(v), (k, x) => (UNSAFE_KEYS.has(k) ? undefined : x));
}
const clone = toJson;

/** Nested plain objects merge, everything else (arrays included) replaces. Returns a new object. */
function deepMerge(base, patch) {
  const out = isPlainObject(base) ? { ...base } : {};
  for (const [k, v] of Object.entries(patch)) {
    if (v === undefined || UNSAFE_KEYS.has(k)) continue;
    out[k] = isPlainObject(v) && isPlainObject(out[k]) ? deepMerge(out[k], v) : clone(v);
  }
  return out;
}

const withDefaults = (defaults, stored) => (stored === undefined || stored === null ? defaults : deepMerge(defaults, stored));

/** Record what `patch` will overwrite in `base`, so it can be put back. */
function inversePatch(base, patch, prefix = [], out = []) {
  for (const [k, v] of Object.entries(patch)) {
    if (v === undefined || UNSAFE_KEYS.has(k)) continue;
    const had = isPlainObject(base) && Object.hasOwn(base, k);
    const old = had ? base[k] : undefined;
    if (isPlainObject(v) && isPlainObject(old)) inversePatch(old, v, [...prefix, k], out);
    else out.push({ path: [...prefix, k], had, value: had ? clone(old) : undefined });
  }
  return out;
}

function applyInverse(doc, ops) {
  const out = clone(doc) ?? {};
  for (const { path, had, value } of ops) {
    let node = out;
    for (const k of path.slice(0, -1)) {
      if (!isPlainObject(node[k])) node[k] = {};
      node = node[k];
    }
    const last = path[path.length - 1];
    if (had) node[last] = clone(value);
    else delete node[last];
  }
  return out;
}

function deepEqual(a, b) {
  if (a === b) return true;
  if (typeof a !== typeof b || a === null || b === null || typeof a !== "object") return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const ka = Object.keys(a);
  const kb = Object.keys(b);
  return ka.length === kb.length && ka.every((k) => Object.hasOwn(b, k) && deepEqual(a[k], b[k]));
}

const byteSize = (v) => encoder.encode(JSON.stringify(v)).length;

/** Append `item`, keeping the newest `cap` items. */
function appendCapped(list, item, cap) {
  const next = [...list, item];
  const evicted = next.length > cap ? next.splice(0, next.length - cap) : [];
  return { list: next, evicted };
}

/** Drop the oldest items of `doc[key]` until the doc fits the byte budget. Mutates doc; returns dropped items. */
function fitToBudget(doc, key, budget = LIMITS.docBudgetBytes) {
  const dropped = [];
  while (doc[key].length > 1 && byteSize(doc) > budget) dropped.push(doc[key].shift());
  return dropped;
}

/** Undo for a capped append: remove `id`, put evicted items back in front, keep the newest `cap`. */
function restoreList(list, id, evicted, cap) {
  const kept = list.filter((x) => x?.id !== id);
  const ids = new Set(kept.map((x) => x?.id));
  const next = [...evicted.filter((x) => !ids.has(x?.id)), ...kept];
  return next.length > cap ? next.slice(next.length - cap) : next;
}

// ---------------------------------------------------------------------------
// dates & ids

const pad2 = (n) => String(n).padStart(2, "0");
const localDate = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;

function isISODate(s) {
  if (typeof s !== "string" || !DATE_RE.test(s)) return false;
  const [y, m, d] = s.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  return dt.getFullYear() === y && dt.getMonth() === m - 1 && dt.getDate() === d;
}

function addDays(iso, n) {
  const [y, m, d] = iso.split("-").map(Number);
  return localDate(new Date(y, m - 1, d + n));
}

function randomChars(n) {
  const alphabet = "abcdefghijklmnopqrstuvwxyz0123456789";
  const bytes = new Uint8Array(n);
  if (globalThis.crypto?.getRandomValues) globalThis.crypto.getRandomValues(bytes);
  else for (let i = 0; i < n; i++) bytes[i] = Math.floor(Math.random() * 256);
  let out = "";
  for (const b of bytes) out += alphabet[b % alphabet.length];
  return out;
}

function checkSegment(id, what) {
  if (typeof id !== "string" || !SEGMENT_RE.test(id) || id === "." || id === "..") {
    throw invalid(`${what} must be a single path segment (letters, digits, _ - . ~ : @ +), got ${JSON.stringify(id)}`);
  }
  return id;
}

function checkDate(date, what) {
  if (!isISODate(date)) throw invalid(`${what} must be a YYYY-MM-DD date, got ${JSON.stringify(date)}`);
  return date;
}

// ---------------------------------------------------------------------------
// sorting

const desc = (a, b) => (a < b ? 1 : a > b ? -1 : 0);
const sortSessions = (list) => list.sort((a, b) => desc(a.date ?? "", b.date ?? "") || desc(a.createdAt ?? "", b.createdAt ?? ""));
const sortPlans = (list) => list.sort((a, b) => desc(a.weekStart ?? "", b.weekStart ?? "") || desc(a.createdAt ?? "", b.createdAt ?? ""));

async function pool(tasks, size) {
  let next = 0;
  const worker = async () => {
    while (next < tasks.length) {
      const task = tasks[next++];
      await task();
    }
  };
  await Promise.all(Array.from({ length: Math.min(size, tasks.length) }, worker));
}

// ---------------------------------------------------------------------------
// the store

/**
 * Create the data layer (CONTRACT §5.3).
 *
 * Subscriptions call `cb(value, metadata)` where metadata is the db snapshot's
 * `{ fromCache, hasPendingWrites }`; pass `{ onError }` as the last argument to
 * hear a terminal db error. Each `subscribe*` call holds one db listener (the
 * platform allows 64 per view); call the returned function to stop.
 *
 * @param {object|null} db    the `db` capability (or createMockDb())
 * @param {string|null} uid   `await user.id()`; null → every method rejects `{ code: "no_user" }`
 * @param {{ now?: () => Date }} [options]  clock override (tests)
 * @returns {Store}
 */
export function createStore(db, uid, { now = () => new Date() } = {}) {
  const store = buildStore(db, uid, now);
  if (!uid) return disableStore(store, "no_user", "No signed-in user: data can't be saved.");
  if (!db) return disableStore(store, "db_unavailable", "Storage is not available in this view.");
  return store;
}

/** @typedef {ReturnType<typeof buildStore>} Store */

function buildStore(db, uid, now) {
  const base = `data/users/${uid}`;
  const P = {
    profile: `${base}/profile`,
    coach: `${base}/coach`,
    state: `${base}/state`,
    body: `${base}/body`,
    plans: `${base}/plans/weeks`,
    sessions: `${base}/log/sessions`,
    chat: `${base}/chat/days`,
  };
  const planPath = (id) => `${P.plans}/${checkSegment(id, "plan id")}`;
  const sessionPath = (id) => `${P.sessions}/${checkSegment(id, "session id")}`;
  const dayPath = (date) => `${P.chat}/${checkDate(date, "chat date")}`;
  const today = () => localDate(now());
  const nowISO = () => now().toISOString();
  const newId = (prefix) => `${prefix}_${now().getTime().toString(36)}${randomChars(6)}`;

  // -- per-document write queue -------------------------------------------
  const queues = new Map();
  function serial(key, task) {
    const prev = queues.get(key) ?? Promise.resolve();
    const run = prev.then(task);
    const tail = run.then(() => {}, () => {});
    queues.set(key, tail);
    tail.then(() => { if (queues.get(key) === tail) queues.delete(key); });
    return run;
  }

  async function readDoc(path) {
    const snap = await db.doc(path).get();
    return snap.exists ? snap.data() : undefined;
  }

  /**
   * Read-modify-write one document inside its queue. `fn(prev)` returns the new
   * body, DELETE, or KEEP. `prev` is frozen db data (or undefined).
   */
  function rmw(path, fn) {
    return serial(path, async () => {
      const ref = db.doc(path);
      const snap = await ref.get();
      const prev = snap.exists ? snap.data() : undefined;
      const next = fn(prev);
      if (next === KEEP) return { prev, next: prev, changed: false };
      if (next === DELETE) {
        if (prev !== undefined) await ref.delete();
        return { prev, next: undefined, changed: prev !== undefined };
      }
      const body = toJson(next);
      await ref.set(body);
      return { prev, next: body, changed: true };
    });
  }

  /** Put a document back to `body` (undefined → delete). */
  const restoreDoc = (path, body) => rmw(path, () => (body === undefined ? DELETE : body));

  function makeUndo(fn) {
    let running = null;
    return () => {
      running ??= (async () => {
        try { await fn(); } catch (e) { running = null; throw toStoreError(e); }
      })();
      return running;
    };
  }
  const noUndo = async () => {};

  /** Wrap an async method: map every rejection to `{ code, message }`. */
  const guard = (fn) => async (...args) => {
    try { return await fn(...args); } catch (e) { throw toStoreError(e); }
  };

  function subscribeDoc(path, map, cb, { onError } = {}) {
    if (typeof cb !== "function") throw new TypeError("subscribe(cb): cb must be a function");
    return db.doc(path).onSnapshot(
      (snap) => cb(map(snap.exists ? snap.data() : undefined), snap.metadata),
      onError ? (e) => onError(toStoreError(e)) : undefined,
    );
  }

  function subscribeQuery(query, map, cb, { onError } = {}) {
    if (typeof cb !== "function") throw new TypeError("subscribe(cb): cb must be a function");
    return query.onSnapshot(
      (snap) => cb(map(snap.docs.map((d) => clone(d.data()))), snap.metadata),
      onError ? (e) => onError(toStoreError(e)) : undefined,
    );
  }

  /** Deep-merge `patch` into a singleton doc (missing → defaults). Undo reverts only the patched fields. */
  async function patchSingleton(path, defaults, patch, { stamp }) {
    if (!isPlainObject(patch)) throw invalid("patch must be an object");
    const p = toJson(patch);
    if (stamp) p.updatedAt = nowISO();
    let inverse = [];
    const { prev, next } = await rmw(path, (cur) => {
      const current = withDefaults(defaults(), cur);
      inverse = inversePatch(current, p);
      return deepMerge(current, p);
    });
    const undo = makeUndo(() => rmw(path, (cur) => {
      const reverted = applyInverse(withDefaults(defaults(), cur), inverse);
      // The doc did not exist before and nothing else changed it: remove it again.
      return prev === undefined && deepEqual(reverted, defaults()) ? DELETE : reverted;
    }));
    return { value: withDefaults(defaults(), next), undo };
  }

  // -- profile ----------------------------------------------------------------
  const profile = {
    /** @returns {Promise<object>} Profile, defaults filled in */
    get: guard(async () => withDefaults(defaultProfile(), clone(await readDoc(P.profile)))),
    /** Replace the whole profile. @returns {Promise<{profile, undo}>} */
    set: guard(async (p) => {
      if (!isPlainObject(p)) throw invalid("profile must be an object");
      const { prev, next } = await rmw(P.profile, () => ({ ...toJson(p), updatedAt: nowISO() }));
      return { profile: withDefaults(defaultProfile(), next), undo: makeUndo(() => restoreDoc(P.profile, prev)) };
    }),
    /** Deep-merge a patch (arrays replace). @returns {Promise<{profile, undo}>} */
    update: guard(async (patch) => {
      const { value, undo } = await patchSingleton(P.profile, defaultProfile, patch, { stamp: true });
      return { profile: value, undo };
    }),
    /** @returns {() => void} unsubscribe */
    subscribe: (cb, opts) => subscribeDoc(P.profile, (d) => withDefaults(defaultProfile(), clone(d)), cb, opts),
  };

  // -- coach memory ---------------------------------------------------------
  const coach = {
    /** @returns {Promise<object>} CoachMemory, defaults if missing */
    get: guard(async () => withDefaults(defaultCoachMemory(), clone(await readDoc(P.coach)))),
    /**
     * Append a note (newest last; keeps the newest 200).
     * @param {{ kind: string, text: string }} note  unknown kinds become "insight"
     * @returns {Promise<{ note, coach, undo }>}
     */
    addNote: guard(async ({ kind, text } = {}) => {
      const body = String(text ?? "").trim();
      if (!body) throw invalid("note text is empty");
      const note = { id: newId("n"), date: today(), kind: NOTE_KINDS.includes(kind) ? kind : "insight", text: body.slice(0, LIMITS.noteChars) };
      let evicted = [];
      const { next } = await rmw(P.coach, (cur) => {
        const doc = withDefaults(defaultCoachMemory(), clone(cur));
        const r = appendCapped(doc.notes, note, LIMITS.coachNotes);
        doc.notes = r.list;
        doc.updatedAt = nowISO();
        evicted = [...r.evicted, ...fitToBudget(doc, "notes")];
        return doc;
      });
      const undo = makeUndo(() => rmw(P.coach, (cur) => {
        if (!cur) return KEEP;
        const doc = withDefaults(defaultCoachMemory(), clone(cur));
        doc.notes = restoreList(doc.notes, note.id, evicted, LIMITS.coachNotes);
        return doc;
      }));
      return { note, coach: withDefaults(defaultCoachMemory(), next), undo };
    }),
    /** Replace the rolling summary (truncated to 2,000 chars). @returns {Promise<{ coach, undo }>} */
    setSummary: guard(async (text) => {
      const summary = String(text ?? "").slice(0, LIMITS.summaryChars);
      const { value, undo } = await patchSingleton(P.coach, defaultCoachMemory, { summary }, { stamp: true });
      return { coach: value, undo };
    }),
    /** @returns {() => void} unsubscribe */
    subscribe: (cb, opts) => subscribeDoc(P.coach, (d) => withDefaults(defaultCoachMemory(), clone(d)), cb, opts),
  };

  // -- app state ------------------------------------------------------------
  const state = {
    /** @returns {Promise<object>} AppState, defaults filled in */
    get: guard(async () => withDefaults(defaultAppState(), clone(await readDoc(P.state)))),
    /** Deep-merge a patch (arrays replace). @returns {Promise<{ state, undo }>} */
    update: guard(async (patch) => {
      const { value, undo } = await patchSingleton(P.state, defaultAppState, patch, { stamp: false });
      return { state: value, undo };
    }),
    /** @returns {() => void} unsubscribe */
    subscribe: (cb, opts) => subscribeDoc(P.state, (d) => withDefaults(defaultAppState(), clone(d)), cb, opts),
  };

  // -- body weight ----------------------------------------------------------
  const body = {
    /**
     * Record a weigh-in. One entry per date (a second one replaces it); entries
     * stay sorted oldest → newest, capped at 400.
     * @param {{ date?: string, kg: number }} entry  date defaults to today
     * @returns {Promise<{ entry, entries, undo }>}
     */
    add: guard(async ({ date = today(), kg } = {}) => {
      checkDate(date, "date");
      const value = Number(kg);
      if (!Number.isFinite(value) || value <= 0) throw invalid(`kg must be a positive number, got ${JSON.stringify(kg)}`);
      const entry = { date, kg: value };
      let replaced = null;
      let evicted = [];
      const { prev, next } = await rmw(P.body, (cur) => {
        const entries = (cur?.entries ?? []).filter((e) => {
          if (e.date !== date) return true;
          replaced = e;
          return false;
        });
        entries.push(entry);
        entries.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
        evicted = entries.length > LIMITS.bodyEntries ? entries.splice(0, entries.length - LIMITS.bodyEntries) : [];
        return { ...clone(cur ?? {}), entries };
      });
      const undo = makeUndo(() => rmw(P.body, (cur) => {
        let entries = (cur?.entries ?? []).filter((e) => e.date !== date);
        if (replaced) entries.push(replaced);
        const dates = new Set(entries.map((e) => e.date));
        entries.push(...evicted.filter((e) => !dates.has(e.date)));
        entries.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
        if (entries.length > LIMITS.bodyEntries) entries = entries.slice(entries.length - LIMITS.bodyEntries);
        return entries.length === 0 && prev === undefined ? DELETE : { ...clone(cur ?? {}), entries };
      }));
      return { entry, entries: clone(next.entries), undo };
    }),
    /** @returns {Promise<Array<{date, kg}>>} oldest → newest */
    list: guard(async () => clone((await readDoc(P.body))?.entries ?? [])),
  };

  // -- plans ----------------------------------------------------------------
  const plansColl = () => db.collection(P.plans);
  const PLANS_LOCK = `${P.plans}#lock`; // serializes saveDraft / approve against each other

  async function plansWhereStatus(status) {
    const snap = await plansColl().where("status", "==", status).get();
    return sortPlans(snap.docs.map((d) => clone(d.data())));
  }

  const plans = {
    /** @returns {Promise<object|null>} */
    get: guard(async (id) => clone(await readDoc(planPath(id))) ?? null),
    /** The agreed plan (newest if several). @returns {Promise<object|null>} */
    getAgreed: guard(async () => (await plansWhereStatus("agreed"))[0] ?? null),
    /** The current draft. @returns {Promise<object|null>} */
    getDraft: guard(async () => (await plansWhereStatus("draft"))[0] ?? null),
    /** Plans newest first (by weekStart, then createdAt). @returns {Promise<object[]>} */
    list: guard(async ({ limit } = {}) => {
      let q = plansColl().orderBy("weekStart", "desc");
      if (limit != null) q = q.limit(limit);
      return sortPlans((await q.get()).docs.map((d) => clone(d.data())));
    }),
    /**
     * Save a new draft, replacing (deleting) any previous draft. The store
     * assigns `id` = weekStart, or `weekStart-2`, `-3`… when that week already
     * has plans; sets status "draft", createdAt, approvedAt null. A missing
     * weekStart defaults to the next Sunday after today.
     * @returns {Promise<{ plan, replaced: string[], undo }>}
     */
    saveDraft: guard(async (plan) => {
      if (!isPlainObject(plan)) throw invalid("plan must be an object");
      let weekStart = plan.weekStart;
      if (weekStart == null || weekStart === "") {
        const t = today();
        const [y, m, d] = t.split("-").map(Number);
        weekStart = addDays(t, 7 - new Date(y, m - 1, d).getDay());
      }
      checkDate(weekStart, "plan.weekStart");
      return serial(PLANS_LOCK, async () => {
        const [sameWeek, drafts] = await Promise.all([
          plansColl().where("weekStart", "==", weekStart).get(),
          plansWhereStatus("draft"),
        ]);
        // weekStart, then weekStart-2, -3…: one past the highest suffix used for that week.
        let n = 1;
        for (const d of sameWeek.docs) {
          if (d.id === weekStart) n = Math.max(n, 2);
          const m = d.id.startsWith(`${weekStart}-`) ? d.id.slice(weekStart.length + 1).match(/^(\d+)$/) : null;
          if (m) n = Math.max(n, Number(m[1]) + 1);
        }
        let id = n === 1 ? weekStart : `${weekStart}-${n}`;
        while (await readDoc(planPath(id))) id = `${weekStart}-${++n}`; // id taken by a doc with another weekStart
        const doc = {
          ...defaultPlanFields(), ...toJson(plan),
          id, status: "draft", weekStart, createdAt: nowISO(), approvedAt: null,
        };
        await rmw(planPath(id), () => doc);
        const replaced = drafts.filter((d) => d.id !== id);
        for (const old of replaced) await rmw(planPath(old.id), () => DELETE);
        const undo = makeUndo(() => serial(PLANS_LOCK, async () => {
          const cur = await readDoc(planPath(id));
          if (!cur || cur.status !== "draft") return; // since replaced or approved: leave the drafts alone
          await rmw(planPath(id), () => DELETE);
          for (const old of replaced) await rmw(planPath(old.id), (cur) => (cur ? KEEP : old));
        }));
        return { plan: clone(doc), replaced: replaced.map((d) => d.id), undo };
      });
    }),
    /**
     * Approve a plan: it becomes "agreed" (approvedAt now), any other agreed plan
     * becomes "archived", and state.rotation = { planId: id, done: [] }.
     * Approving the already-agreed plan is a no-op (`alreadyAgreed: true`).
     * Rejects `not_found` for an unknown id.
     * @returns {Promise<{ plan, archived: string[], state, alreadyAgreed?: boolean, undo }>}
     */
    approve: guard(async (id) => {
      const path = planPath(id);
      return serial(PLANS_LOCK, async () => {
        const target = await readDoc(path);
        if (!target) throw new StoreError("not_found", `No plan with id "${id}"`);
        if (target.status === "agreed") {
          return { plan: clone(target), archived: [], state: await state.get(), alreadyAgreed: true, undo: noUndo };
        }
        const previous = (await plansWhereStatus("agreed")).filter((p) => p.id !== id);
        for (const p of previous) {
          await rmw(planPath(p.id), (cur) => (cur ? { ...clone(cur), status: "archived" } : KEEP));
        }
        const approvedAt = nowISO();
        const { next } = await rmw(path, (cur) => {
          if (!cur) throw new StoreError("not_found", `No plan with id "${id}"`);
          return { ...clone(cur), status: "agreed", approvedAt };
        });
        const st = await patchSingleton(P.state, defaultAppState, { rotation: { planId: id, done: [] } }, { stamp: false });
        const undo = makeUndo(() => serial(PLANS_LOCK, async () => {
          await st.undo();
          await rmw(path, (cur) => (cur ? { ...clone(cur), status: target.status, approvedAt: target.approvedAt ?? null } : KEEP));
          for (const p of previous) {
            await rmw(planPath(p.id), (cur) => (cur ? { ...clone(cur), status: "agreed" } : KEEP));
          }
        }));
        return { plan: clone(next), archived: previous.map((p) => p.id), state: st.value, undo };
      });
    }),
    /**
     * Plans newest first (the newest `limit`, default 50, by weekStart).
     * @param {(plans: object[], meta: object) => void} cb
     * @param {{ limit?: number, onError?: Function }} [opts]
     * @returns {() => void} unsubscribe
     */
    subscribe: (cb, { limit = 50, onError } = {}) =>
      subscribeQuery(plansColl().orderBy("weekStart", "desc").limit(limit), sortPlans, cb, { onError }),
  };

  // -- sessions ---------------------------------------------------------------
  const sessionsColl = () => db.collection(P.sessions);

  function sessionsQuery({ from, to, type, limit } = {}) {
    let q = sessionsColl();
    if (from != null) q = q.where("date", ">=", checkDate(from, "from"));
    if (to != null) q = q.where("date", "<=", checkDate(to, "to"));
    if (Array.isArray(type) ? type.length > 0 : type != null) {
      q = Array.isArray(type) ? q.where("type", "in", type) : q.where("type", "==", type);
    }
    q = q.orderBy("date", "desc");
    if (limit != null) q = q.limit(limit);
    return q;
  }

  const sessions = {
    /**
     * Log a session. The store assigns `id` (`<date>-<6 random a-z0-9>`),
     * createdAt and updatedAt; missing fields come from defaultSession(); date
     * defaults to today. Does not touch the rotation.
     * @returns {Promise<{ id, session, undo }>}
     */
    add: guard(async (session) => {
      if (!isPlainObject(session)) throw invalid("session must be an object");
      const input = toJson(session);
      const date = checkDate(input.date ?? today(), "session.date");
      const ts = nowISO();
      for (let attempt = 0; attempt < 5; attempt++) {
        const id = `${date}-${randomChars(6)}`;
        const doc = { ...defaultSession(), ...input, id, date, createdAt: ts, updatedAt: ts };
        const { prev } = await rmw(sessionPath(id), (cur) => (cur ? KEEP : doc));
        if (prev) continue; // id collision: try another
        return { id, session: clone(doc), undo: makeUndo(() => rmw(sessionPath(id), () => DELETE)) };
      }
      throw new StoreError("internal", "Could not allocate a session id");
    }),
    /** @returns {Promise<object|null>} */
    get: guard(async (id) => clone(await readDoc(sessionPath(id))) ?? null),
    /**
     * Deep-merge a patch (arrays replace); `id` and `createdAt` can't change.
     * Rejects `not_found` for an unknown id. Undo reverts only the patched fields.
     * @returns {Promise<{ session, undo }>}
     */
    update: guard(async (id, patch) => {
      if (!isPlainObject(patch)) throw invalid("patch must be an object");
      const path = sessionPath(id);
      const p = toJson(patch);
      delete p.id;
      delete p.createdAt;
      p.updatedAt = nowISO();
      let inverse = [];
      const { next } = await rmw(path, (cur) => {
        if (!cur) throw new StoreError("not_found", `No session with id "${id}"`);
        inverse = inversePatch(cur, p);
        return deepMerge(cur, p);
      });
      const undo = makeUndo(() => rmw(path, (cur) => (cur ? applyInverse(cur, inverse) : KEEP)));
      return { session: clone(next), undo };
    }),
    /**
     * Delete a session (idempotent). Undo puts it back.
     * @returns {Promise<{ removed: boolean, session: object|null, undo }>}
     */
    remove: guard(async (id) => {
      const path = sessionPath(id);
      const { prev } = await rmw(path, (cur) => (cur ? DELETE : KEEP));
      if (!prev) return { removed: false, session: null, undo: noUndo };
      return { removed: true, session: clone(prev), undo: makeUndo(() => rmw(path, (cur) => (cur ? KEEP : prev))) };
    }),
    /**
     * Sessions newest first (date, then createdAt).
     * @param {{ from?: string, to?: string, type?: string|string[], limit?: number }} [filter]
     *   from/to inclusive YYYY-MM-DD; type one Session.type or a list of them
     * @returns {Promise<object[]>}
     */
    list: guard(async (filter = {}) => sortSessions((await sessionsQuery(filter).get()).docs.map((d) => clone(d.data())))),
    /**
     * Live sessions, newest first.
     * @param {(sessions: object[], meta: object) => void} cb
     * @param {{ limit?: number, from?: string, to?: string, type?: string|string[], onError?: Function }} [opts]
     * @returns {() => void} unsubscribe
     */
    subscribe: (cb, { onError, ...filter } = {}) => subscribeQuery(sessionsQuery(filter), sortSessions, cb, { onError }),
  };

  // -- chat -------------------------------------------------------------------
  const daysColl = () => db.collection(P.chat);
  const dayOf = (date, d) => ({ date, messages: clone(d?.messages ?? []) });

  const chat = {
    /**
     * Append a message to today's day doc. Assigns `id` and `ts`; fills
     * `actions: []`, `error: null`. Keeps the newest 300 messages of the day
     * (and under the doc size cap).
     * @param {{ role: "user"|"assistant"|"event", text: string, actions?: object[], error?: string|null }} message
     * @returns {Promise<{ message, date, undo }>}
     */
    append: guard(async (message) => {
      if (!isPlainObject(message)) throw invalid("message must be an object");
      if (!CHAT_ROLES.includes(message.role)) throw invalid(`message.role must be one of ${CHAT_ROLES.join(", ")}`);
      const date = today();
      const msg = {
        ...toJson(message),
        id: newId("m"),
        ts: nowISO(),
        role: message.role,
        text: String(message.text ?? "").slice(0, LIMITS.messageChars),
        actions: Array.isArray(message.actions) ? toJson(message.actions) : [],
        error: message.error ?? null,
      };
      const path = dayPath(date);
      let evicted = [];
      const { prev } = await rmw(path, (cur) => {
        const doc = { ...clone(cur ?? {}), date, messages: clone(cur?.messages ?? []) };
        const r = appendCapped(doc.messages, msg, LIMITS.chatMessagesPerDay);
        doc.messages = r.list;
        evicted = [...r.evicted, ...fitToBudget(doc, "messages")];
        return doc;
      });
      const undo = makeUndo(() => rmw(path, (cur) => {
        if (!cur) return KEEP;
        const messages = restoreList(cur.messages ?? [], msg.id, evicted, LIMITS.chatMessagesPerDay);
        return messages.length === 0 && prev === undefined ? DELETE : { ...clone(cur), messages };
      }));
      return { message: clone(msg), date, undo };
    }),
    /**
     * The last `n` messages across days, oldest → newest.
     * @param {number} [n=24]
     * @returns {Promise<object[]>}
     */
    recent: guard(async (n = 24) => {
      if (!(n > 0)) return [];
      const PAGE = 7;
      let collected = [];
      let before = null;
      for (;;) {
        let q = daysColl().orderBy("date", "desc").limit(PAGE);
        if (before) q = q.where("date", "<", before);
        const snap = await q.get();
        for (const d of snap.docs) {
          const data = d.data();
          collected = [...(data.messages ?? []), ...collected];
          before = data.date ?? d.id;
          if (collected.length >= n) break;
        }
        if (collected.length >= n || snap.size < PAGE) break;
      }
      return clone(collected.slice(-n));
    }),
    /** One day's messages. @returns {Promise<{ date, messages }>} */
    getDay: guard(async (date) => dayOf(date, await readDoc(dayPath(date)))),
    /**
     * Live messages of one day (missing day → `{ date, messages: [] }`).
     * Re-subscribe when the day changes.
     * @returns {() => void} unsubscribe
     */
    subscribeDay: (date, cb, opts) => subscribeDoc(dayPath(date), (d) => dayOf(date, d), cb, opts),
    /**
     * Dates that have chat, newest first.
     * @param {{ limit?: number }} [opts]
     * @returns {Promise<string[]>}
     */
    days: guard(async ({ limit } = {}) => {
      let q = daysColl().orderBy("date", "desc");
      if (limit != null) q = q.limit(limit);
      return (await q.get()).docs.map((d) => d.data().date ?? d.id);
    }),
    /**
     * Delete every chat day doc (the whole conversation). Nothing else is touched: coach memory
     * (summary, notes), profile, plans, sessions and state stay as they are.
     * `undo` puts the deleted messages back; messages written since the clear are kept (merged by id, in ts order).
     * @returns {Promise<{ days: number, messages: number, undo: () => Promise<void> }>}
     */
    clear: guard(async () => {
      const snap = await daysColl().get();
      const removed = snap.docs.map((d) => ({ id: d.id, data: clone(d.data()) }));
      await pool(removed.map((r) => () => rmw(`${P.chat}/${r.id}`, () => DELETE)), 4);
      const undo = makeUndo(() => pool(removed.map((r) => () => rmw(`${P.chat}/${r.id}`, (cur) => {
        const before = Array.isArray(r.data?.messages) ? r.data.messages : [];
        if (!cur) return r.data;
        const ids = new Set(before.map((m) => m?.id));
        const since = (Array.isArray(cur.messages) ? cur.messages : []).filter((m) => !ids.has(m?.id));
        const merged = [...before, ...since].sort((a, b) => String(a?.ts ?? "").localeCompare(String(b?.ts ?? "")));
        return { ...clone(cur), ...clone(r.data), messages: merged.slice(-LIMITS.chatMessagesPerDay) };
      })), 4));
      return { days: removed.length, messages: removed.reduce((n, r) => n + (r.data?.messages?.length ?? 0), 0), undo };
    }),
  };

  // -- backup -----------------------------------------------------------------
  const allDocs = async (coll) => (await coll.get()).docs.map((d) => clone(d.data()));
  const byKey = (key) => (a, b) => (a[key] < b[key] ? -1 : a[key] > b[key] ? 1 : 0);

  async function exportAll() {
    const [p, c, s, b, planList, sessionList, dayList] = await Promise.all([
      readDoc(P.profile), readDoc(P.coach), readDoc(P.state), readDoc(P.body),
      allDocs(plansColl()), allDocs(sessionsColl()), allDocs(daysColl()),
    ]);
    return {
      format: BACKUP_FORMAT,
      version: BACKUP_VERSION,
      exportedAt: nowISO(),
      data: {
        profile: clone(p) ?? null,
        coach: clone(c) ?? null,
        state: clone(s) ?? null,
        body: clone(b) ?? null,
        plans: planList.sort(byKey("id")),
        sessions: sessionList.sort((x, y) => byKey("date")(x, y) || byKey("id")(x, y)),
        chat: dayList.sort(byKey("date")),
      },
    };
  }

  function parseBackup(json) {
    let backup = json;
    if (typeof backup === "string") {
      try { backup = JSON.parse(backup); } catch { throw invalid("The backup is not valid JSON."); }
    }
    if (!isPlainObject(backup) || backup.format !== BACKUP_FORMAT) throw invalid("This is not a Personal Trainer backup file.");
    if (!Number.isInteger(backup.version) || backup.version < 1 || backup.version > BACKUP_VERSION) {
      throw invalid(`Unsupported backup version ${JSON.stringify(backup.version)}.`);
    }
    const d = backup.data;
    if (!isPlainObject(d)) throw invalid("The backup has no data.");
    const out = {};
    for (const key of ["profile", "coach", "state", "body"]) {
      if (d[key] != null && !isPlainObject(d[key])) throw invalid(`backup data.${key} must be an object or null`);
      out[key] = d[key] == null ? null : toJson(d[key]);
    }
    const list = (key, check) => {
      const arr = d[key] ?? [];
      if (!Array.isArray(arr)) throw invalid(`backup data.${key} must be an array`);
      const seen = new Set();
      return arr.map((item, i) => {
        if (!isPlainObject(item)) throw invalid(`backup data.${key}[${i}] must be an object`);
        const id = check(item, i);
        if (seen.has(id)) throw invalid(`backup data.${key} has a duplicate id "${id}"`);
        seen.add(id);
        return toJson(item);
      });
    };
    out.plans = list("plans", (x, i) => checkSegment(x.id, `backup data.plans[${i}].id`));
    out.sessions = list("sessions", (x, i) => {
      checkDate(x.date, `backup data.sessions[${i}].date`);
      return checkSegment(x.id, `backup data.sessions[${i}].id`);
    });
    out.chat = list("chat", (x, i) => {
      if (!Array.isArray(x.messages)) throw invalid(`backup data.chat[${i}].messages must be an array`);
      return checkDate(x.date, `backup data.chat[${i}].date`);
    });
    for (const doc of [out.profile, out.coach, out.state, out.body, ...out.plans, ...out.sessions, ...out.chat]) {
      if (doc && byteSize(doc) > 256 * 1024) throw invalid("A document in the backup is larger than 256 KiB.");
    }
    return out;
  }

  /** Make the stored data exactly `data` (singletons, plans, sessions, chat days). */
  async function replaceAll(data) {
    const [planIds, sessionIds, dayIds] = await Promise.all(
      [plansColl(), sessionsColl(), daysColl()].map(async (c) => (await c.get()).docs.map((d) => d.id)),
    );
    const tasks = [];
    for (const key of ["profile", "coach", "state", "body"]) {
      tasks.push(() => rmw(P[key], () => (data[key] ? data[key] : DELETE)));
    }
    const sync = (items, existing, idOf, pathOf) => {
      const keep = new Set(items.map(idOf));
      for (const item of items) tasks.push(() => rmw(pathOf(idOf(item)), () => item));
      for (const id of existing) if (!keep.has(id)) tasks.push(() => rmw(pathOf(id), () => DELETE));
    };
    sync(data.plans, planIds, (x) => x.id, planPath);
    sync(data.sessions, sessionIds, (x) => x.id, sessionPath);
    sync(data.chat, dayIds, (x) => x.date, dayPath);
    await pool(tasks, 4); // a few writes at a time (the db limits concurrent writes)
  }

  const IMPORT_LOCK = `${base}#import`;

  return {
    profile,
    coach,
    state,
    body,
    plans,
    sessions,
    chat,
    /**
     * Snapshot of everything as a versioned backup object (JSON-serializable):
     * `{ format: "personal-trainer-backup", version: 1, exportedAt, data: { profile, coach, state, body, plans, sessions, chat } }`.
     * Stringify it for downloads.save().
     * @returns {Promise<object>}
     */
    exportAll: guard(exportAll),
    /**
     * Replace ALL stored data with a backup (object or JSON string from
     * exportAll()). Validates everything before writing. Undo restores the data
     * as it was before the import.
     * @returns {Promise<{ counts: { plans, sessions, chatDays }, undo }>}
     */
    importAll: guard(async (json) => {
      const data = parseBackup(json);
      return serial(IMPORT_LOCK, async () => {
        const before = await exportAll();
        await replaceAll(data);
        return {
          counts: { plans: data.plans.length, sessions: data.sessions.length, chatDays: data.chat.length },
          undo: makeUndo(() => serial(IMPORT_LOCK, () => replaceAll(before.data))),
        };
      });
    }),
  };
}

/** Same shape as a store; async methods reject `{ code }`, subscriptions report it to `onError`. */
function disableStore(store, code, message) {
  const disable = (obj) => {
    const out = {};
    for (const [key, value] of Object.entries(obj)) {
      if (typeof value === "function" && key.startsWith("subscribe")) {
        out[key] = (...args) => {
          const opts = args.find((a) => a && typeof a === "object" && typeof a.onError === "function");
          if (opts) setTimeout(() => opts.onError(new StoreError(code, message)), 0);
          return () => {};
        };
      } else if (typeof value === "function") {
        out[key] = async () => { throw new StoreError(code, message); };
      } else if (isPlainObject(value)) {
        out[key] = disable(value);
      }
    }
    return out;
  };
  return disable(store);
}
