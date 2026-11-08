// Owner: Agent C. See CONTRACT.md §5.3 and §8.
//
// An in-memory stand-in for the platform `db` capability
// (app/docs/runtime-types/db.d.ts), covering the surface store.js uses, plus
// `seedDevData(store)` for dev mode. It mirrors the real contract closely
// enough that code which works against it should work live:
//   - path grammar checks that THROW TypeError synchronously (parity, charset,
//     "." / "..", 200-byte segments, 1000-byte / 16-segment paths)
//   - async verbs that reject `{ code, message }` (invalid_argument for bad
//     bodies, a 256 KiB / 32-level body, update() on a missing doc, bad queries)
//   - frozen snapshots and data; an unchanged document is the same object
//     across deliveries
//   - onSnapshot: first delivery async, then on every change, coalesced;
//     docChanges() with added / modified / removed and indexes; 64-listener cap
//   - optional latency (own writes delivered with hasPendingWrites: true, then
//     confirmed) and optional strict one-write-at-a-time checking
// Non-standard helpers live on `db.__mock` (flush, reset, dump, failNext, stats).

import { BACKUP_FORMAT, BACKUP_VERSION } from "./store.js";

/** localStorage key used by `createMockDb({ persist: "localStorage" })`. */
export const MOCK_DB_STORAGE_KEY = "personal-trainer.mock-db.v1";

const MAX_DOC_BYTES = 256 * 1024;
const MAX_DEPTH = 32;
const MAX_SEGMENTS = 16;
const MAX_PATH_BYTES = 1000;
const MAX_SEGMENT_BYTES = 200;
const MAX_SUBSCRIPTIONS = 64;
const MAX_FILTERS = 10;
const MAX_IN_VALUES = 30;
const SEGMENT_RE = /^[A-Za-z0-9_\-.~:@+]+$/;
const OPS = new Set(["==", "!=", "<", "<=", ">", ">=", "in", "not-in", "array-contains"]);
const AUTO_ID_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

const encoder = new TextEncoder();
const byteLength = (s) => encoder.encode(s).length;

class MockDbError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "DbError";
    this.code = code;
    // Enumerable, so `{ ...err }` and JSON keep both fields like a plain `{code, message}`.
    Object.defineProperty(this, "message", { value: message, enumerable: true, writable: true, configurable: true });
  }
}
const dbError = (code, message) => new MockDbError(code, message);

// ---------------------------------------------------------------------------
// helpers

function isPlainObject(v) {
  if (v === null || typeof v !== "object") return false;
  const proto = Object.getPrototypeOf(v);
  return proto === Object.prototype || proto === null;
}

function deepFreeze(v) {
  if (v && typeof v === "object" && !Object.isFrozen(v)) {
    Object.freeze(v);
    for (const x of Object.values(v)) deepFreeze(x);
  }
  return v;
}

const clone = (v) => (v === undefined ? undefined : JSON.parse(JSON.stringify(v)));
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function randomChars(n, alphabet) {
  const bytes = new Uint8Array(n);
  if (globalThis.crypto?.getRandomValues) globalThis.crypto.getRandomValues(bytes);
  else for (let i = 0; i < n; i++) bytes[i] = Math.floor(Math.random() * 256);
  let out = "";
  for (const b of bytes) out += alphabet[b % alphabet.length];
  return out;
}

function rethrowAsync(err) {
  if (typeof globalThis.reportError === "function") globalThis.reportError(err);
  else setTimeout(() => { throw err; }, 0);
}

/**
 * Validate a path against the db.d.ts grammar. Throws TypeError like the
 * real builders do.
 * @param {unknown} path
 * @param {"document"|"collection"} kind
 * @param {string} caller  name used in the message, e.g. "db.doc"
 * @returns {string[]} segments
 */
function checkPath(path, kind, caller) {
  if (typeof path !== "string") {
    const hint = path && typeof path.then === "function" ? " (got a Promise: await the id first)" : ` (got ${path === null ? "null" : typeof path})`;
    throw new TypeError(`${caller}(): path must be a string${hint}`);
  }
  const segs = path.split("/");
  if (segs.length > MAX_SEGMENTS) throw new TypeError(`${caller}("${path}"): at most ${MAX_SEGMENTS} segments, got ${segs.length}`);
  if (byteLength(path) > MAX_PATH_BYTES) throw new TypeError(`${caller}(): path is longer than ${MAX_PATH_BYTES} bytes`);
  for (const s of segs) {
    if (s === "") throw new TypeError(`${caller}("${path}"): empty segment (leading, trailing or doubled "/")`);
    if (s === "." || s === "..") throw new TypeError(`${caller}("${path}"): "${s}" is not a valid segment`);
    if (!SEGMENT_RE.test(s)) throw new TypeError(`${caller}("${path}"): segment "${s}" may only use letters, digits and _ - . ~ : @ +`);
    if (byteLength(s) > MAX_SEGMENT_BYTES) throw new TypeError(`${caller}("${path}"): a segment is longer than ${MAX_SEGMENT_BYTES} bytes`);
  }
  const even = segs.length % 2 === 0;
  if (kind === "document" && !even) {
    throw new TypeError(`${caller}("${path}"): a document path needs an even number of segments, got ${segs.length}`);
  }
  if (kind === "collection" && even) {
    throw new TypeError(`${caller}("${path}"): a collection path needs an odd number of segments, got ${segs.length}`);
  }
  return segs;
}

function isDocPath(path) {
  try { checkPath(path, "document", "load"); return true; } catch { return false; }
}

/** Throws invalid_argument unless `v` is plain JSON (no undefined, NaN, Dates, class instances…). */
function checkJson(v, depth, at) {
  if (v === null || typeof v === "string" || typeof v === "boolean") return;
  if (typeof v === "number") {
    if (!Number.isFinite(v)) throw dbError("invalid_argument", `non-finite number at ${at || "<root>"}`);
    return;
  }
  const isArr = Array.isArray(v);
  if (!isArr && !isPlainObject(v)) {
    throw dbError("invalid_argument", `unsupported value (${v === undefined ? "undefined" : typeof v}) at ${at || "<root>"}`);
  }
  if (depth > MAX_DEPTH) throw dbError("invalid_argument", `document is nested more than ${MAX_DEPTH} levels deep (at ${at})`);
  if (isArr) v.forEach((x, i) => checkJson(x, depth + 1, `${at}[${i}]`));
  else for (const [k, x] of Object.entries(v)) checkJson(x, depth + 1, at ? `${at}.${k}` : k);
}

/** Validate a body and return its frozen JSON copy. */
function freezeBody(data) {
  if (!isPlainObject(data)) throw dbError("invalid_argument", "a document body must be a plain JSON object");
  checkJson(data, 1, "");
  const json = JSON.stringify(data);
  const bytes = byteLength(json);
  if (bytes > MAX_DOC_BYTES) throw dbError("invalid_argument", `document is ${bytes} bytes; at most ${MAX_DOC_BYTES} (256 KiB)`);
  return deepFreeze(JSON.parse(json));
}

/** db.update semantics: nested plain objects merge recursively, anything else replaces. */
function mergeDeep(base, patch) {
  const out = { ...base };
  for (const [k, v] of Object.entries(patch)) {
    out[k] = isPlainObject(v) && isPlainObject(out[k]) ? mergeDeep(out[k], v) : v;
  }
  return out;
}

function typeRank(v) {
  if (v === null) return 0;
  if (typeof v === "boolean") return 1;
  if (typeof v === "number") return 2;
  if (typeof v === "string") return 3;
  if (Array.isArray(v)) return 4;
  return 5;
}

function compareValues(a, b) {
  const ra = typeRank(a);
  const rb = typeRank(b);
  if (ra !== rb) return ra - rb;
  if (ra >= 4) {
    const ja = JSON.stringify(a);
    const jb = JSON.stringify(b);
    return ja < jb ? -1 : ja > jb ? 1 : 0;
  }
  return a < b ? -1 : a > b ? 1 : 0;
}

function deepEqual(a, b) {
  if (a === b) return true;
  if (typeof a !== typeof b || a === null || b === null || typeof a !== "object") return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const ka = Object.keys(a);
  const kb = Object.keys(b);
  return ka.length === kb.length && ka.every((k) => Object.hasOwn(b, k) && deepEqual(a[k], b[k]));
}

function matchFilter(data, { field, op, value }) {
  const has = Object.hasOwn(data, field);
  if (!has) return false;
  const v = data[field];
  switch (op) {
    case "==": return deepEqual(v, value);
    case "!=": return !deepEqual(v, value);
    case "<": return typeRank(v) === typeRank(value) && compareValues(v, value) < 0;
    case "<=": return typeRank(v) === typeRank(value) && compareValues(v, value) <= 0;
    case ">": return typeRank(v) === typeRank(value) && compareValues(v, value) > 0;
    case ">=": return typeRank(v) === typeRank(value) && compareValues(v, value) >= 0;
    case "in": return value.some((x) => deepEqual(v, x));
    case "not-in": return !value.some((x) => deepEqual(v, x));
    case "array-contains": return Array.isArray(v) && v.some((x) => deepEqual(x, value));
    default: return false;
  }
}

function queryProblem(q) {
  if (q.filters.length > MAX_FILTERS) return `at most ${MAX_FILTERS} where() filters per query`;
  for (const f of q.filters) {
    if (typeof f.field !== "string" || !f.field) return "where(): field must be a non-empty string";
    if (!OPS.has(f.op)) return `where(): unsupported operator "${f.op}"`;
    if (f.value === undefined) return `where("${f.field}"): value is undefined`;
    if ((f.op === "in" || f.op === "not-in") && (!Array.isArray(f.value) || f.value.length === 0 || f.value.length > MAX_IN_VALUES)) {
      return `where("${f.field}", "${f.op}"): value must be an array of 1-${MAX_IN_VALUES} items`;
    }
  }
  if (q.orders.length > 1) return "at most one orderBy() per query";
  const o = q.orders[0];
  if (o && (typeof o.field !== "string" || !o.field)) return "orderBy(): field must be a non-empty string";
  if (o && o.dir !== "asc" && o.dir !== "desc") return `orderBy("${o.field}"): dir must be "asc" or "desc"`;
  if (q.limit != null && !(Number.isInteger(q.limit) && q.limit >= 1 && q.limit <= 1000)) return "limit(n): n must be an integer from 1 to 1000";
  return null;
}

function comparator(order) {
  return (a, b) => {
    if (order) {
      const ha = Object.hasOwn(a.data, order.field);
      const hb = Object.hasOwn(b.data, order.field);
      if (ha !== hb) return ha ? -1 : 1; // documents missing the field sort last
      if (ha) {
        const c = compareValues(a.data[order.field], b.data[order.field]);
        if (c) return order.dir === "desc" ? -c : c;
      }
    }
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  };
}

const metadata = (hasPendingWrites) => Object.freeze({ fromCache: false, hasPendingWrites });
const change = (type, doc, oldIndex, newIndex) => Object.freeze({ type, doc, oldIndex, newIndex });

function diffDocs(prev, next) {
  const prevIndex = new Map(prev.map((d, i) => [d.id, i]));
  const nextIndex = new Map(next.map((d, i) => [d.id, i]));
  const out = [];
  prev.forEach((d, i) => { if (!nextIndex.has(d.id)) out.push(change("removed", d, i, -1)); });
  next.forEach((d, i) => {
    if (!prevIndex.has(d.id)) out.push(change("added", d, -1, i));
    else {
      const old = prev[prevIndex.get(d.id)];
      if (old.data() !== d.data()) out.push(change("modified", d, prevIndex.get(d.id), i));
    }
  });
  return out;
}

function querySnapshot(docs, meta, changes) {
  const frozenDocs = Object.freeze(docs.slice());
  const frozenChanges = Object.freeze(changes);
  return Object.freeze({
    docs: frozenDocs,
    size: frozenDocs.length,
    empty: frozenDocs.length === 0,
    docChanges: () => frozenChanges,
    metadata: meta,
  });
}

function resolveStorage(persist) {
  if (!persist) return null;
  if (persist === "localStorage") {
    try {
      const ls = globalThis.localStorage;
      return ls && typeof ls.getItem === "function" ? ls : null;
    } catch {
      return null; // blocked storage (private mode, sandbox)
    }
  }
  return typeof persist.getItem === "function" && typeof persist.setItem === "function" ? persist : null;
}

// ---------------------------------------------------------------------------
// the mock

/**
 * Create an in-memory `db` implementing the db.d.ts surface used by store.js:
 * `db.doc(path)` → get / set / update / delete / onSnapshot / collection, and
 * `db.collection(path)` → doc / add / where / orderBy / limit / get / onSnapshot.
 *
 * @param {object} [options]
 * @param {null|"localStorage"|{getItem:Function,setItem:Function,removeItem?:Function}} [options.persist]
 *   `"localStorage"` (dev only) or any Storage-like object; every confirmed
 *   write saves the whole store. Storage errors are swallowed.
 * @param {number} [options.latencyMs=0]  simulated round trip. When > 0, own
 *   writes are visible at once with `hasPendingWrites: true` and confirmed
 *   after the delay (the write promise resolves then).
 * @param {boolean} [options.strictWrites=false]  reject an overlapping write to
 *   a document that already has one in flight (`resource_exhausted`), to catch
 *   violations of "one write at a time per document".
 * @param {string} [options.storageKey]  storage key (default {@link MOCK_DB_STORAGE_KEY}).
 * @returns {object} a frozen db with `doc`, `collection` and the dev-only `__mock`
 *   helpers: `flush()` (await pending writes and deliveries), `reset()`,
 *   `dump()`, `failNext(code, times)`, `stats()`, `count()`.
 */
export function createMockDb({ persist = null, latencyMs = 0, strictWrites = false, storageKey = MOCK_DB_STORAGE_KEY } = {}) {
  const storage = resolveStorage(persist);
  /** @type {Map<string, Entry>} confirmed documents */
  const committed = new Map();
  /** @type {Map<string, Entry>} own writes not yet confirmed (only with latency) */
  const pending = new Map();
  const listeners = new Set();
  const inFlight = new Map();
  const failures = [];
  const stats = { reads: 0, writes: 0, maxConcurrentWritesPerDoc: 0, persistErrors: 0 };
  let flushTimer = null;

  /** @typedef {{ id: string, path: string, data: object|null, pending: boolean, snap: object|null }} Entry */
  const makeEntry = (path, data, isPending) => ({ id: path.slice(path.lastIndexOf("/") + 1), path, data, pending: isPending, snap: null });
  const current = (path) => pending.get(path) ?? committed.get(path);

  function docSnapshot(path, entry) {
    if (entry && entry.data !== null) {
      if (!entry.snap) {
        const body = entry.data;
        entry.snap = Object.freeze({ id: entry.id, exists: true, data: () => body, metadata: metadata(entry.pending) });
      }
      return entry.snap;
    }
    return Object.freeze({ id: path.slice(path.lastIndexOf("/") + 1), exists: false, data: () => undefined, metadata: metadata(!!entry?.pending) });
  }

  // -- persistence ----------------------------------------------------------
  if (storage) {
    try {
      const raw = storage.getItem(storageKey);
      const saved = raw ? JSON.parse(raw) : null;
      for (const [path, body] of Object.entries(saved?.docs ?? {})) {
        if (isDocPath(path) && isPlainObject(body)) committed.set(path, makeEntry(path, deepFreeze(body), false));
      }
    } catch {
      // corrupt or unreadable storage: start empty
    }
  }

  function persistNow() {
    if (!storage) return;
    try {
      const docs = {};
      for (const [path, entry] of committed) docs[path] = entry.data;
      storage.setItem(storageKey, JSON.stringify({ version: 1, docs }));
    } catch {
      stats.persistErrors++;
    }
  }

  function takeFailure() {
    if (failures.length) {
      const code = failures.shift();
      throw dbError(code, `simulated ${code} (db.__mock.failNext)`);
    }
  }

  // -- delivery -------------------------------------------------------------
  function scheduleFlush() {
    if (!flushTimer) flushTimer = setTimeout(flush, 0);
  }

  function notify(path) {
    const parent = path.slice(0, path.lastIndexOf("/"));
    for (const l of listeners) {
      if (l.kind === "doc" ? l.path === path : l.query.path === parent) l.dirty = true;
    }
    scheduleFlush();
  }

  function flush() {
    flushTimer = null;
    for (const l of [...listeners]) {
      if (!l.dirty || !listeners.has(l)) continue;
      l.dirty = false;
      if (l.kind === "doc") deliverDoc(l);
      else deliverQuery(l);
    }
  }

  function safeCall(fn, arg) {
    try { fn(arg); } catch (err) { rethrowAsync(err); }
  }

  function deliverDoc(l) {
    const entry = current(l.path);
    const token = entry && entry.data !== null ? docSnapshot(l.path, entry) : entry?.pending ? "missing-pending" : "missing";
    if (l.delivered && token === l.last) return;
    l.delivered = true;
    l.last = token;
    safeCall(l.next, typeof token === "string" ? docSnapshot(l.path, entry) : token);
  }

  function evaluate(q) {
    const prefix = q.path + "/";
    const matched = [];
    let hasPendingWrites = false;
    for (const path of new Set([...committed.keys(), ...pending.keys()])) {
      if (!path.startsWith(prefix) || path.indexOf("/", prefix.length) !== -1) continue; // direct children only
      if (pending.has(path)) hasPendingWrites = true;
      const entry = current(path);
      if (!entry || entry.data === null) continue;
      if (q.filters.every((f) => matchFilter(entry.data, f))) matched.push(entry);
    }
    matched.sort(comparator(q.orders[0]));
    const windowed = q.limit != null ? matched.slice(0, q.limit) : matched;
    return { docs: windowed.map((e) => docSnapshot(e.path, e)), hasPendingWrites };
  }

  function deliverQuery(l) {
    const { docs, hasPendingWrites } = evaluate(l.query);
    const prev = l.lastDocs;
    if (prev && prev.length === docs.length && prev.every((d, i) => d === docs[i]) && l.lastPending === hasPendingWrites) return;
    const changes = diffDocs(prev ?? [], docs);
    l.lastDocs = docs;
    l.lastPending = hasPendingWrites;
    safeCall(l.next, querySnapshot(docs, metadata(hasPendingWrites), changes));
  }

  function listen(l, error) {
    if (typeof l.next !== "function") throw new TypeError("onSnapshot(next, error): next must be a function");
    let dead = false;
    const fail = (e) => {
      if (dead) return;
      dead = true;
      if (typeof error === "function") safeCall(error, e);
      else rethrowAsync(e);
    };
    const problem = l.kind === "query" ? queryProblem(l.query) : null;
    if (problem || listeners.size >= MAX_SUBSCRIPTIONS) {
      const e = problem ? dbError("invalid_argument", problem) : dbError("resource_exhausted", `at most ${MAX_SUBSCRIPTIONS} active subscriptions per view`);
      setTimeout(() => fail(e), 0);
      return () => { dead = true; };
    }
    Object.assign(l, { dirty: true, delivered: false, last: undefined, lastDocs: null, lastPending: false });
    listeners.add(l);
    scheduleFlush();
    return () => { dead = true; listeners.delete(l); };
  }

  // -- writes ---------------------------------------------------------------
  async function write(path, kind, data) {
    await null; // verbs are always async
    takeFailure();
    let body = null;
    let patch = null;
    if (kind === "set") body = freezeBody(data);
    if (kind === "update") {
      if (!isPlainObject(data)) throw dbError("invalid_argument", "update(): the patch must be a plain JSON object");
      checkJson(data, 1, "");
      patch = clone(data);
      const base = current(path);
      if (!base || base.data === null) {
        throw dbError("invalid_argument", `update() needs an existing document; "${path}" does not exist (use set() to create it)`);
      }
      body = freezeBody(mergeDeep(base.data, patch)); // latency-compensated view, size-checked
    }
    const n = inFlight.get(path) ?? 0;
    if (strictWrites && n > 0) {
      throw dbError("resource_exhausted", `overlapping writes to "${path}": await each write before starting the next`);
    }
    inFlight.set(path, n + 1);
    stats.writes++;
    stats.maxConcurrentWritesPerDoc = Math.max(stats.maxConcurrentWritesPerDoc, n + 1);
    let mine = null;
    if (latencyMs > 0) {
      mine = makeEntry(path, body, true);
      pending.set(path, mine);
      notify(path);
    }
    try {
      await sleep(latencyMs); // also for 0: a write is in flight for at least one task
      if (kind === "update") {
        // Server semantics: merge into the document as it is when the write lands.
        const base = committed.get(path);
        if (!base) throw dbError("invalid_argument", `update() needs an existing document; "${path}" was deleted`);
        body = freezeBody(mergeDeep(base.data, patch));
      }
      if (body === null) committed.delete(path);
      else committed.set(path, makeEntry(path, body, false));
      persistNow();
    } finally {
      if (mine && pending.get(path) === mine) pending.delete(path);
      const left = (inFlight.get(path) ?? 1) - 1;
      if (left > 0) inFlight.set(path, left);
      else inFlight.delete(path);
      notify(path);
    }
  }

  // -- refs -----------------------------------------------------------------
  function docRef(path, caller = "db.doc") {
    const segs = checkPath(path, "document", caller);
    return Object.freeze({
      id: segs[segs.length - 1],
      path,
      async get() {
        await null;
        takeFailure();
        stats.reads++;
        if (latencyMs > 0) await sleep(latencyMs);
        return docSnapshot(path, current(path));
      },
      set: (data) => write(path, "set", data),
      update: (data) => write(path, "update", data),
      delete: () => write(path, "delete"),
      onSnapshot: (next, error) => listen({ kind: "doc", path, next }, error),
      collection(sub) {
        if (typeof sub !== "string") throw new TypeError("doc.collection(path): path must be a string");
        return collRef(`${path}/${sub}`, "doc.collection");
      },
    });
  }

  function makeQuery(q) {
    return {
      where: (field, op, value) => Object.freeze(makeQuery({ ...q, filters: [...q.filters, { field, op, value }] })),
      orderBy: (field, dir = "asc") => Object.freeze(makeQuery({ ...q, orders: [...q.orders, { field, dir }] })),
      limit: (n) => Object.freeze(makeQuery({ ...q, limit: n })),
      async get() {
        await null;
        takeFailure();
        const problem = queryProblem(q);
        if (problem) throw dbError("invalid_argument", problem);
        stats.reads++;
        if (latencyMs > 0) await sleep(latencyMs);
        const { docs, hasPendingWrites } = evaluate(q);
        return querySnapshot(docs, metadata(hasPendingWrites), docs.map((d, i) => change("added", d, -1, i)));
      },
      onSnapshot: (next, error) => listen({ kind: "query", query: q, next }, error),
    };
  }

  function collRef(path, caller = "db.collection") {
    checkPath(path, "collection", caller);
    const ref = {
      ...makeQuery({ path, filters: [], orders: [], limit: null }),
      path,
      doc(id) {
        const docId = id === undefined ? randomChars(20, AUTO_ID_ALPHABET) : id;
        if (typeof docId !== "string") throw new TypeError("collection.doc(id): id must be a string");
        return docRef(`${path}/${docId}`, "collection.doc");
      },
      async add(data) {
        const doc = ref.doc();
        await doc.set(data);
        return doc;
      },
    };
    return Object.freeze(ref);
  }

  const mock = Object.freeze({
    /** Resolve once every in-flight write is confirmed and every delivery has run. */
    async flush() {
      do { await sleep(Math.max(1, latencyMs)); } while (inFlight.size > 0 || flushTimer);
    },
    /** Erase every document (and the persisted copy); listeners see the removals. */
    reset() {
      committed.clear();
      pending.clear();
      try { storage?.removeItem?.(storageKey); } catch { /* ignore */ }
      for (const l of listeners) l.dirty = true;
      scheduleFlush();
    },
    /** Plain copy of every confirmed document: `{ [path]: body }`. */
    dump: () => Object.fromEntries([...committed].map(([p, e]) => [p, clone(e.data)])),
    /** Make the next `times` verb calls reject with `code` (default "unavailable"). */
    failNext(code = "unavailable", times = 1) {
      for (let i = 0; i < times; i++) failures.push(code);
    },
    /** Counters: reads, writes, maxConcurrentWritesPerDoc, persistErrors. */
    stats: () => ({ ...stats }),
    /** Number of confirmed documents. */
    count: () => committed.size,
  });

  return Object.freeze({
    doc: (path) => docRef(path, "db.doc"),
    collection: (path) => collRef(path, "db.collection"),
    __mock: mock,
  });
}

// ---------------------------------------------------------------------------
// dev seed

const pad2 = (n) => String(n).padStart(2, "0");
const isoDate = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
function addDays(iso, n) {
  const [y, m, d] = iso.split("-").map(Number);
  return isoDate(new Date(y, m - 1, d + n));
}
function at(iso, hh, mm = 0) {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d, hh, mm).toISOString();
}
const seedId = () => randomChars(6, "abcdefghijklmnopqrstuvwxyz0123456789");

const GYM_ITEMS = [
  "barbell", "plates", "squat_rack", "bench", "adjustable_bench", "dumbbells", "kettlebell",
  "cable_machine", "lat_pulldown", "seated_row", "leg_press", "leg_curl", "leg_extension",
  "pullup_bar", "dip_bars", "bands", "plyo_box", "jump_rope", "medicine_ball", "wall_ball",
  "ab_wheel", "rower", "assault_bike", "treadmill",
];

/** Exercise ids the seed assumes exist in catalog.js (Agent A). */
export const SEED_EXERCISE_IDS = Object.freeze([
  "back_squat", "bench_press", "deadlift", "romanian_deadlift", "overhead_press", "barbell_row",
  "pull_up", "lat_pulldown", "dumbbell_bench_press", "leg_press", "kettlebell_swing", "burpee",
  "box_jump", "wall_ball", "rower",
]);

const strengthItem = (exerciseId, name, sets, reps, targetRir, loadKg, restSec, progression, incrementKg, alternatives, extra = {}) => ({
  exerciseId, name, sets, reps, targetRir, loadKg, restSec, progression, incrementKg,
  tempo: null, notes: "", alternatives, supersetGroup: null, ...extra,
});
const condItem = (exerciseId, name, fields) => ({
  exerciseId, name, reps: null, calories: null, distanceM: null, durationSec: null, loadKg: null, notes: "", ...fields,
});

function seedPlan({ weekStart, status, w }) {
  const id = weekStart;
  const created = at(addDays(weekStart, -1), 10, 0);
  const run = w.run;
  return {
    id, status, weekStart, createdAt: created, approvedAt: at(addDays(weekStart, -1), 10, 6),
    focus: w.focus,
    rationale: w.rationale,
    workouts: [
      {
        id: "W1", title: "Lower A: Squat", type: "strength", locationId: "gym", estMinutes: 60,
        intent: "Heavy squat exposure plus hinge volume. Stop a set if the knee goes above 3/10.",
        blocks: [
          { kind: "warmup", minutes: 8, items: [
            { name: "Easy bike or row", detail: "4 min" },
            { name: "Leg swings + bodyweight squats", detail: "2 × 10" },
            { name: "Squat ramp", detail: `bar × 8, 60 kg × 5, ${w.squat - 20} kg × 3` },
          ] },
          { kind: "strength", items: [
            strengthItem("back_squat", "Back squat", 3, "5", 2, w.squat, 180, "linear", 2.5, ["leg_press"]),
            strengthItem("romanian_deadlift", "Romanian deadlift", 3, "8-10", 2, w.rdl, 120, "double", 5, ["deadlift"], { tempo: "3-1-1" }),
            strengthItem("leg_press", "Leg press", 3, "10-12", 2, w.legPress, 90, "double", 10, ["back_squat"]),
          ] },
          { kind: "cooldown", minutes: 4, items: [{ name: "Walk + hip flexor stretch", detail: "4 min" }] },
        ],
      },
      {
        id: "W2", title: "Upper A: Bench", type: "strength", locationId: "gym", estMinutes: 60,
        intent: "Bench strength with balanced pulling; overhead press and pull-ups paired to save time.",
        blocks: [
          { kind: "warmup", minutes: 6, items: [
            { name: "Band pull-aparts", detail: "2 × 15" },
            { name: "Bench ramp", detail: `bar × 10, 50 kg × 5, ${w.bench - 15} kg × 3` },
          ] },
          { kind: "strength", items: [
            strengthItem("bench_press", "Bench press", 3, "5", 2, w.bench, 180, "linear", 2.5, ["dumbbell_bench_press"]),
            strengthItem("barbell_row", "Barbell row", 3, "8", 2, w.row, 120, "double", 2.5, ["lat_pulldown"]),
            strengthItem("overhead_press", "Overhead press", 3, "6-8", 2, w.ohp, 90, "double", 2.5, [], { supersetGroup: "A" }),
            strengthItem("pull_up", "Pull-up", 3, "6-8", 2, null, 90, "double", 0, ["lat_pulldown"], { supersetGroup: "A", notes: "Bodyweight; add 2.5 kg once 3 × 8 at 2 RIR" }),
          ] },
        ],
      },
      {
        id: "W3", title: run.title, type: "run", locationId: "outdoors", estMinutes: run.estMinutes,
        intent: run.intent,
        blocks: [{
          kind: "run", runType: run.runType, warmupMin: run.warmupMin, cooldownMin: run.cooldownMin, totalKm: run.totalKm,
          segments: run.segments, notes: run.notes,
        }],
      },
      {
        id: "W4", title: "Pull + Metcon", type: "hybrid", locationId: "gym", estMinutes: 60,
        intent: "Heavy pull, then a short mixed-modal piece at RPE 8. Box jumps step down to spare the knee and Achilles.",
        blocks: [
          { kind: "warmup", minutes: 6, items: [
            { name: "Row easy", detail: "3 min" },
            { name: "Deadlift ramp", detail: `60 kg × 5, 100 kg × 3, ${w.deadlift - 20} kg × 1` },
          ] },
          { kind: "strength", items: [
            strengthItem("deadlift", "Deadlift", 3, "3", 2, w.deadlift, 180, "linear", 5, ["romanian_deadlift"]),
            strengthItem("lat_pulldown", "Lat pulldown", 3, "10-12", 2, w.pulldown, 90, "double", 2.5, ["pull_up"]),
            strengthItem("dumbbell_bench_press", "Dumbbell bench press", 3, "10", 2, w.dbBench, 90, "double", 2, ["bench_press"], { notes: "Load is per dumbbell" }),
          ] },
          w.metcon,
          { kind: "cooldown", minutes: 4, items: [{ name: "Easy walk, then breathe down", detail: "4 min" }] },
        ],
      },
    ],
    weeklyTargets: { runKm: run.totalKm, conditioningSessions: 1, strengthSetsPerMuscle: {} },
    notes: w.notes,
    validation: null,
  };
}

const amrapMetcon = (minutes) => ({
  kind: "conditioning", format: "AMRAP", minutes, rounds: null, timeCapMin: null, workSec: null, restSec: null,
  items: [
    condItem("kettlebell_swing", "Kettlebell swing", { reps: 15, loadKg: 24 }),
    condItem("box_jump", "Box jump", { reps: 10, notes: "60 cm, step down" }),
    condItem("wall_ball", "Wall ball", { reps: 12, loadKg: 9 }),
  ],
  targetRpe: 8, scaling: "16 kg swings; step-ups instead of box jumps; 6 kg ball", notes: "Steady pace you could hold for one more round",
});

const rftMetcon = {
  kind: "conditioning", format: "RFT", minutes: null, rounds: 5, timeCapMin: 18, workSec: null, restSec: null,
  items: [
    condItem("rower", "Row", { distanceM: 250 }),
    condItem("burpee", "Burpee", { reps: 10 }),
    condItem("kettlebell_swing", "Kettlebell swing", { reps: 10, loadKg: 24 }),
  ],
  targetRpe: 8, scaling: "200 m row; 6 burpees; 16 kg swings", notes: "Short and fast: unbroken sets, rest only on the row",
};

const runSeg = (reps, distanceM, pace, rpe, recoverySec = null, recoveryType = null, durationSec = null) => ({
  reps, distanceM, durationSec, target: { paceSecPerKm: pace, hrZone: null, rpe }, recoverySec, recoveryType,
});

const SEED_WEEKS = [
  {
    squat: 95, rdl: 80, legPress: 150, bench: 75, row: 65, ohp: 45, deadlift: 130, pulldown: 55, dbBench: 28,
    focus: "Week 1: set baselines across lifting, running and conditioning",
    rationale: "First week after onboarding. Loads start at about 2 RIR from your known lifts (squat 95 × 5, bench 75 × 5, deadlift 130 × 3). Running starts at your current 5-6 km easy runs; conditioning is one short AMRAP to gauge your engine.",
    run: {
      title: "Easy run 5.5 km", estMinutes: 40, runType: "easy", warmupMin: 0, cooldownMin: 0, totalKm: 5.5,
      intent: "Conversational pace, nose-breathing for most of it.",
      segments: [runSeg(1, 5500, [360, 385], 4)], notes: "Walk breaks are fine",
    },
    metcon: amrapMetcon(12),
    notes: ["Baseline week"],
  },
  {
    squat: 97.5, rdl: 85, legPress: 160, bench: 77.5, row: 67.5, ohp: 45, deadlift: 135, pulldown: 57.5, dbBench: 28,
    focus: "Week 2: small load jumps, a little more running",
    rationale: "All week-1 work sets landed at 2 RIR, so the barbell lifts go up 2.5-5 kg. Easy-run distance moves from 5.5 to 6 km (under a 15 % ramp). The metcon switches to rounds for time to train pacing.",
    run: {
      title: "Easy run 6 km", estMinutes: 40, runType: "easy", warmupMin: 0, cooldownMin: 0, totalKm: 6,
      intent: "Easy aerobic volume.",
      segments: [runSeg(1, 6000, [360, 385], 4)], notes: "",
    },
    metcon: rftMetcon,
    notes: [],
  },
  {
    squat: 100, rdl: 87.5, legPress: 170, bench: 77.5, row: 70, ohp: 47.5, deadlift: 140, pulldown: 60, dbBench: 30,
    focus: "Week 3: squat to 100 kg, first tempo run, keep the knee quiet",
    rationale: "Squat moved 95 → 97.5 kg at 2 RIR, so linear progression continues. Bench ground out 5, 5, 4 at 77.5 kg on 5 h sleep, so we repeat 77.5 kg before adding load. You missed Thursday's run, so weekly km holds near 7 rather than ramping, and easy runs at RPE 4 earn a first short tempo block.",
    run: {
      title: "Tempo run 7 km", estMinutes: 45, runType: "tempo", warmupMin: 12, cooldownMin: 10, totalKm: 7,
      intent: "Comfortably hard for 3 km: short sentences only.",
      segments: [runSeg(1, 3000, [325, 340], 7)], notes: "Warm-up and cool-down at easy pace",
    },
    metcon: amrapMetcon(14),
    notes: ["Repeat bench load", "Knee: step down from box jumps"],
  },
];

const work = (loadKg, reps, rir) => ({ type: "work", loadKg, bodyweight: false, reps, rir });
const warm = (loadKg, reps) => ({ type: "warmup", loadKg, bodyweight: false, reps, rir: null });
const bodyweight = (reps, rir) => ({ type: "work", loadKg: null, bodyweight: true, reps, rir });
const lift = (exerciseId, name, sets) => ({ exerciseId, name, sets });

function seedSession(date, fields) {
  const ts = at(date, 19, 10);
  return {
    id: `${date}-${seedId()}`, date, planId: null, workoutId: null, title: "", type: "other", status: "done",
    missedReason: null, durationMin: null, readiness: null, sessionRpe: null, notes: "", pain: [],
    strength: [], conditioning: [], run: null, prs: [], coachComment: "", createdBy: "chat",
    createdAt: ts, updatedAt: ts, ...fields,
  };
}

function seedSessions(ws) {
  const w2 = addDays(ws, -14);
  const w1 = addDays(ws, -7);
  const [p2, p1, p0] = [w2, w1, ws];
  return [
    // --- two weeks ago (plan p2)
    seedSession(addDays(w2, 1), {
      planId: p2, workoutId: "W1", title: "Lower A: Squat", type: "strength", durationMin: 58, readiness: 4, sessionRpe: 7,
      strength: [
        lift("back_squat", "Back squat", [warm(20, 8), warm(60, 5), warm(75, 3), work(95, 5, 2), work(95, 5, 2), work(95, 5, 2)]),
        lift("romanian_deadlift", "Romanian deadlift", [work(80, 10, 3), work(80, 10, 2), work(80, 10, 2)]),
        lift("leg_press", "Leg press", [work(150, 12, 2), work(150, 12, 2), work(150, 11, 2)]),
      ],
      coachComment: "Clean start: every squat set at 2 RIR. Next time 97.5 kg × 5.",
    }),
    seedSession(addDays(w2, 3), {
      planId: p2, workoutId: "W2", title: "Upper A: Bench", type: "strength", durationMin: 62, readiness: 4, sessionRpe: 7,
      strength: [
        lift("bench_press", "Bench press", [warm(20, 10), warm(50, 5), warm(60, 3), work(75, 5, 2), work(75, 5, 2), work(75, 5, 1)]),
        lift("barbell_row", "Barbell row", [work(65, 8, 2), work(65, 8, 2), work(65, 8, 2)]),
        lift("overhead_press", "Overhead press", [work(45, 8, 2), work(45, 7, 1), work(45, 6, 1)]),
        lift("pull_up", "Pull-up", [bodyweight(7, 2), bodyweight(6, 1), bodyweight(6, 1)]),
      ],
    }),
    seedSession(addDays(w2, 4), {
      planId: p2, workoutId: "W3", title: "Easy run 5.5 km", type: "run", durationMin: 34, readiness: 4, sessionRpe: 4,
      run: { runType: "easy", distanceKm: 5.5, durationSec: 2035, avgPaceSecPerKm: 370, avgHr: 142, elevationM: 35, rpe: 4, splits: [374, 371, 369, 368, 366] },
      coachComment: "Right in the easy zone. Keep these conversational.",
    }),
    seedSession(addDays(w2, 6), {
      planId: p2, workoutId: "W4", title: "Pull + Metcon", type: "hybrid", durationMin: 61, readiness: 3, sessionRpe: 8,
      strength: [
        lift("deadlift", "Deadlift", [warm(60, 5), warm(100, 3), work(130, 3, 2), work(130, 3, 2), work(130, 3, 2)]),
        lift("lat_pulldown", "Lat pulldown", [work(55, 12, 2), work(55, 11, 2), work(55, 10, 2)]),
        lift("dumbbell_bench_press", "Dumbbell bench press", [work(28, 10, 2), work(28, 10, 2), work(28, 9, 1)]),
      ],
      conditioning: [{
        format: "AMRAP", description: "12 min AMRAP: 15 KB swings (24 kg), 10 box jumps (60 cm), 12 wall balls (9 kg)",
        result: { rounds: 5, reps: 8, timeSec: null, calories: null, completed: true }, scaled: false, rpe: 8, notes: "",
      }],
    }),
    // --- last week (plan p1)
    seedSession(w1, {
      title: "Easy weekend run", type: "run", durationMin: 43, readiness: 5, sessionRpe: 4, createdBy: "manual",
      run: { runType: "easy", distanceKm: 7, durationSec: 2555, avgPaceSecPerKm: 365, avgHr: 145, elevationM: 60, rpe: 4, splits: [372, 368, 366, 364, 362, 361, 362] },
      notes: "Extra run with a friend, not on the plan",
    }),
    seedSession(addDays(w1, 1), {
      planId: p1, workoutId: "W1", title: "Lower A: Squat", type: "strength", durationMin: 60, readiness: 4, sessionRpe: 8,
      strength: [
        lift("back_squat", "Back squat", [warm(20, 8), warm(60, 5), warm(77.5, 3), work(97.5, 5, 2), work(97.5, 5, 2), work(97.5, 5, 1)]),
        lift("romanian_deadlift", "Romanian deadlift", [work(85, 10, 2), work(85, 9, 2), work(85, 9, 2)]),
        lift("leg_press", "Leg press", [work(160, 12, 2), work(160, 11, 2), work(160, 10, 2)]),
      ],
      prs: [{ exerciseId: "back_squat", kind: "e1rm", value: 120.3, previous: 117.2 }],
      coachComment: "Squat e1RM up to about 120 kg. Last set slipped to 1 RIR; that's fine, the load holds at +2.5 kg next week.",
    }),
    seedSession(addDays(w1, 2), {
      planId: p1, workoutId: "W2", title: "Upper A: Bench", type: "strength", durationMin: 65, readiness: 2, sessionRpe: 9,
      strength: [
        lift("bench_press", "Bench press", [warm(20, 10), warm(50, 5), warm(62.5, 3), work(77.5, 5, 1), work(77.5, 5, 1), work(77.5, 4, 0)]),
        lift("barbell_row", "Barbell row", [work(67.5, 8, 2), work(67.5, 8, 2), work(67.5, 8, 1)]),
        lift("overhead_press", "Overhead press", [work(45, 8, 2), work(45, 8, 1), work(45, 7, 1)]),
        lift("pull_up", "Pull-up", [bodyweight(8, 2), bodyweight(7, 1), bodyweight(6, 1)]),
      ],
      notes: "Slept 5 h. Bench felt heavy from the first rep.",
      coachComment: "Tough day on short sleep. We'll repeat 77.5 kg rather than chase a jump.",
    }),
    seedSession(addDays(w1, 4), {
      planId: p1, workoutId: "W3", title: "Easy run 6 km", type: "run", status: "missed", missedReason: "time",
      notes: "Work ran late",
    }),
    seedSession(addDays(w1, 6), {
      planId: p1, workoutId: "W4", title: "Pull + Metcon", type: "hybrid", durationMin: 63, readiness: 4, sessionRpe: 9,
      strength: [
        lift("deadlift", "Deadlift", [warm(60, 5), warm(100, 3), work(135, 3, 2), work(135, 3, 2), work(135, 3, 1)]),
        lift("lat_pulldown", "Lat pulldown", [work(57.5, 12, 2), work(57.5, 11, 2), work(57.5, 10, 1)]),
        lift("dumbbell_bench_press", "Dumbbell bench press", [work(28, 10, 2), work(28, 10, 2), work(28, 10, 1)]),
      ],
      conditioning: [{
        format: "RFT", description: "5 rounds for time: 250 m row, 10 burpees, 10 KB swings (24 kg)",
        result: { rounds: 5, reps: null, timeSec: 812, calories: null, completed: true }, scaled: false, rpe: 9, notes: "Burpees slowed a lot in round 4",
      }],
      coachComment: "13:32 under the 18 min cap. Next time aim for even splits instead of a fast first round.",
    }),
    // --- this week (plan p0)
    seedSession(addDays(ws, 1), {
      planId: p0, workoutId: "W1", title: "Lower A: Squat", type: "strength", durationMin: 59, readiness: 4, sessionRpe: 8,
      strength: [
        lift("back_squat", "Back squat", [warm(20, 8), warm(60, 5), warm(80, 3), work(100, 5, 2), work(100, 5, 2), work(100, 5, 1)]),
        lift("romanian_deadlift", "Romanian deadlift", [work(87.5, 10, 2), work(87.5, 10, 2), work(87.5, 9, 2)]),
        lift("leg_press", "Leg press", [work(170, 12, 2), work(170, 11, 2), work(170, 11, 1)]),
      ],
      pain: [{ area: "knee", score: 3, when: "during" }],
      notes: "Left knee 3/10 on the last squat set, gone by the time I left.",
      prs: [{ exerciseId: "back_squat", kind: "e1rm", value: 123.3, previous: 120.3 }],
      coachComment: "First 100 kg × 5 × 3, a new best. Knee at 3/10 that settles is OK; tell me if it climbs.",
    }),
    seedSession(addDays(ws, 3), {
      planId: p0, workoutId: "W2", title: "Upper A: Bench", type: "strength", durationMin: 61, readiness: 4, sessionRpe: 7,
      strength: [
        lift("bench_press", "Bench press", [warm(20, 10), warm(50, 5), warm(62.5, 3), work(77.5, 5, 2), work(77.5, 5, 2), work(77.5, 5, 1)]),
        lift("barbell_row", "Barbell row", [work(70, 8, 2), work(70, 8, 2), work(70, 8, 2)]),
        lift("overhead_press", "Overhead press", [work(47.5, 7, 2), work(47.5, 6, 1), work(47.5, 6, 1)]),
        lift("pull_up", "Pull-up", [bodyweight(8, 2), bodyweight(8, 1), bodyweight(7, 1)]),
      ],
      coachComment: "Same 77.5 kg, 5, 5, 5 this time with reps to spare. That's the green light for 80 kg.",
    }),
    seedSession(addDays(ws, 4), {
      planId: p0, workoutId: "W3", title: "Tempo run 7 km", type: "run", durationMin: 40, readiness: 4, sessionRpe: 7,
      run: { runType: "tempo", distanceKm: 7.2, durationSec: 2400, avgPaceSecPerKm: 333, avgHr: 158, elevationM: 40, rpe: 7, splits: [350, 345, 328, 326, 327, 330, 324] },
    }),
  ];
}

function seedChat(ws, sessions) {
  const lower = sessions.find((s) => s.date === addDays(ws, 1));
  const tempo = sessions.find((s) => s.date === addDays(ws, 4));
  const msg = (date, hh, mm, role, text, actions = []) => ({ id: `m_${seedId()}${seedId()}`, ts: at(date, hh, mm), role, text, actions, error: null });
  const sunday = ws;
  const monday = addDays(ws, 1);
  const thursday = addDays(ws, 4);
  return [
    { date: addDays(ws, -1), messages: [
      msg(addDays(ws, -1), 10, 6, "event", `Plan approved · week of ${ws}`),
    ] },
    { date: sunday, messages: [
      msg(sunday, 9, 12, "user", "What's my workout tomorrow?"),
      msg(sunday, 9, 12, "assistant", "Up next is **Lower A: Squat**:\n\n- Back squat 3 × 5 @ 2 RIR, **100 kg**\n- Romanian deadlift 3 × 8-10, 87.5 kg\n- Leg press 3 × 10-12, 170 kg\n\nAbout 60 minutes. Stop a set if the knee goes above 3/10."),
    ] },
    { date: monday, messages: [
      msg(monday, 19, 8, "user", "Did lower A. Squats 100x5,5,5 last set 1 RIR. RDL 87.5 for 10,10,9, leg press 170 12,11,11. Knee 3/10 on the last squat set, fine after."),
      msg(monday, 19, 9, "assistant", "Logged **Lower A: Squat**. 100 kg × 5 × 3 is a new best (e1RM ≈ 123 kg).\n\nKnee: 3/10 that settles after the session is in the OK zone. Keep next week's load and tell me if it climbs above 3.\n\nUp next: **Upper A: Bench**.",
        [{ type: "logged_session", label: "Logged · Lower A: Squat · 3 exercises", ref: lower?.id ?? null },
          { type: "coach_note", label: "Noted: knee 3/10 on squats", ref: null }]),
    ] },
    { date: thursday, messages: [
      msg(thursday, 18, 40, "user", "tempo done, 7.2k in 40:00, felt strong"),
      msg(thursday, 18, 41, "assistant", "Logged **Tempo run 7 km**: 7.2 km at 5:33/km. The 3 km tempo block averaged about 5:27/km, right in the 5:25-5:40 target.\n\nOne left this week: **Pull + Metcon**.",
        [{ type: "logged_session", label: "Logged · Tempo run 7 km · 7.2 km", ref: tempo?.id ?? null }]),
    ] },
  ];
}

/**
 * Build the dev seed as a store backup (see store.exportAll()).
 * @param {Date} [now]
 * @returns {object} backup `{ format, version, exportedAt, data }`
 */
export function buildSeedBackup(now = new Date()) {
  const today = isoDate(now);
  const ws = addDays(today, -now.getDay()); // Sunday that starts this week
  const notAfterToday = (x) => x.date <= today;
  const sessions = seedSessions(ws).filter(notAfterToday);
  const plans = SEED_WEEKS.map((w, i) => seedPlan({ weekStart: addDays(ws, (i - 2) * 7), status: i === 2 ? "agreed" : "archived", w }));
  const agreed = plans[2];
  const done = [...new Set(sessions.filter((s) => s.planId === agreed.id && s.status !== "missed" && s.workoutId).map((s) => s.workoutId))];
  const start = addDays(ws, -15);
  const raceDate = addDays(ws, 84);

  const profile = {
    version: 1, onboarded: true,
    name: "Alex", age: 34, sex: "male", heightCm: 180, weightKg: 82,
    screening: {
      answers: { heartCondition: false, chestPain: false, dizziness: false, chronicCondition: false, medications: false, boneJoint: false, supervisedOnly: false },
      pregnant: null, notes: "Old left-knee patellar tendon flare (2024), resolved.", outcome: "cleared", screenedAt: at(start, 20, 0),
    },
    injuries: [{ area: "knee", status: "past", painScore: 0, aggravators: ["deep lunges", "repeated jumping"], notes: "Left patellar tendon flare-up in 2024, fully resolved.", updatedAt: at(start, 20, 0) }],
    goals: {
      primary: "Get stronger on the big lifts while running a sub-50 min 10K",
      secondary: ["Better conditioning for pickup basketball", "Stay injury-free"],
      why: "Feel athletic at 35, not just strong",
      success12w: "Squat 110 × 5, bench 85 × 5, 10K under 50:00",
      targetDate: raceDate,
      modalities: { strength: true, running: true, conditioning: true },
      event: { type: "race", distanceKm: 10, date: raceDate, goalTimeSec: 2970 },
    },
    schedule: { daysPerWeek: 4, minutesPerSession: 60, preferredDays: ["mon", "wed", "thu", "sat"], notes: "Thursday evenings sometimes get cut short by work" },
    equipment: {
      defaultLocationId: "gym",
      locations: [
        { id: "gym", name: "Gym", items: GYM_ITEMS, dumbbellMaxKg: 40, kettlebellsKg: [12, 16, 20, 24, 32], notes: "Commercial gym, two racks" },
        { id: "outdoors", name: "Outdoors", items: ["outdoor_route"], dumbbellMaxKg: null, kettlebellsKg: [], notes: "Flat 5 km river loop" },
      ],
    },
    experience: {
      level: "intermediate", trainingAgeYears: 3,
      running: { currentWeeklyKm: 12, longestRecentRunKm: 8, recentRace: { distanceKm: 5, timeSec: 1410, date: addDays(ws, -60) }, easyPaceSecPerKm: 370 },
      conditioning: { experience: "some" },
      knownLifts: [
        { exerciseId: "back_squat", loadKg: 95, reps: 5, rir: 2, date: start },
        { exerciseId: "bench_press", loadKg: 75, reps: 5, rir: 2, date: start },
        { exerciseId: "deadlift", loadKg: 130, reps: 3, rir: 2, date: start },
        { exerciseId: "overhead_press", loadKg: 45, reps: 8, rir: 2, date: start },
      ],
    },
    preferences: { likes: ["deadlift", "kettlebell_swing"], dislikes: ["long treadmill runs"], tone: "direct", logging: "standard" },
    updatedAt: at(start, 20, 5),
  };

  const coach = {
    summary: "Alex, 34, intermediate lifter (3 years) adding running and conditioning. Goals: stronger big lifts and a sub-50 10K in about 12 weeks. Trains 4×/week for 60 min at a commercial gym, runs outdoors. Past left patellar tendon flare (2024): watch the knee on squats and box jumps. Likes direct, brief coaching. Bench stalled at 77.5 kg after poor sleep in week 2, then moved well in week 3.",
    notes: [
      { id: "n_seed01", date: start, kind: "goal", text: `10K race on ${raceDate}; goal 49:30.` },
      { id: "n_seed02", date: start, kind: "preference", text: "Prefers barbell lifts; dislikes long treadmill runs, so runs go outdoors." },
      { id: "n_seed03", date: addDays(ws, -5), kind: "decision", text: "Bench 77.5 kg went 5, 5, 4 at 0 RIR on 5 h sleep: repeat 77.5 kg next week before adding load." },
      { id: "n_seed04", date: addDays(ws, -3), kind: "insight", text: "Missed the Thursday run because of work: keep Thursday sessions short or movable." },
      { id: "n_seed05", date: addDays(ws, 1), kind: "injury", text: "Left knee 3/10 during the last 100 kg squat set; settled after. Monitor, keep box jumps step-down." },
    ].filter(notAfterToday),
    updatedAt: at(today, 8, 0),
  };

  const state = {
    schemaVersion: 1,
    settings: { theme: "system", chatTier: "default" },
    rotation: { planId: agreed.id, done },
    onboarding: { status: "done" },
    pendingPlanRequest: null,
  };

  const body = {
    entries: [
      { date: addDays(ws, -20), kg: 82.6 },
      { date: addDays(ws, -13), kg: 82.4 },
      { date: addDays(ws, -6), kg: 82.1 },
      { date: addDays(ws, 1), kg: 81.9 },
    ].filter(notAfterToday),
  };

  const chat = seedChat(ws, sessions).filter(notAfterToday);

  return {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    exportedAt: now.toISOString(),
    data: { profile, coach, state, body, plans, sessions, chat },
  };
}

/**
 * Fill an empty store with about three weeks of realistic data: an onboarded
 * profile (gym + outdoors locations; strength, running and conditioning on),
 * coach memory, body weights, two archived plans and the agreed plan for the
 * current (Sunday-start) week, strength / run / hybrid sessions with RIR,
 * pace and metcon results, one missed session, one pain note, and a little chat.
 * Dates are relative to `now`. Does nothing unless the store is empty,
 * unless `force` is set (then it replaces everything).
 *
 * @param {object} store  a Store from createStore()
 * @param {{ force?: boolean, now?: Date }} [options]
 * @returns {Promise<{ seeded: boolean, counts?: object }>}
 */
export async function seedDevData(store, { force = false, now = new Date() } = {}) {
  if (!force) {
    const { data } = await store.exportAll();
    const empty = !data.profile && !data.coach && !data.state && !data.body && !data.plans.length && !data.sessions.length && !data.chat.length;
    if (!empty) return { seeded: false };
  }
  const { counts } = await store.importAll(buildSeedBackup(now));
  return { seeded: true, counts };
}
