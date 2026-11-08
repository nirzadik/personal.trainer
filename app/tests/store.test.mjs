// Owner: Agent C. Tests for src/store-mock.js, src/store.js and src/env.js.
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { createMockDb, seedDevData, buildSeedBackup, SEED_EXERCISE_IDS, MOCK_DB_STORAGE_KEY } from "../src/store-mock.js";
import {
  createStore, defaultProfile, defaultCoachMemory, defaultAppState, defaultSession, LIMITS, BACKUP_FORMAT,
} from "../src/store.js";
import { getRuntime } from "../src/env.js";

const UID = "u_test";
const ROOT = `data/users/${UID}`;
const wait = (ms = 5) => new Promise((resolve) => setTimeout(resolve, ms));

/** A controllable clock; starts Saturday 2026-11-07 10:00 local time. */
function clock(start = "2026-11-07T10:00:00") {
  let t = new Date(start).getTime();
  const now = () => new Date(t);
  now.set = (iso) => { t = new Date(iso).getTime(); };
  now.advance = (ms) => { t += ms; };
  return now;
}

function setup({ now = clock(), ...dbOptions } = {}) {
  const db = createMockDb({ strictWrites: true, ...dbOptions });
  return { db, store: createStore(db, UID, { now }), now };
}

/** Collect callback deliveries. */
function recorder() {
  const calls = [];
  const fn = (value, meta) => calls.push({ value, meta });
  return { calls, fn, last: () => calls[calls.length - 1] };
}

function memoryStorage() {
  const map = new Map();
  return {
    map,
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: (k) => map.delete(k),
  };
}

/** Key paths of `obj`, descending only where `shape` (the defaults) has a non-empty plain object. */
function keyPaths(obj, shape = obj, prefix = "") {
  return Object.entries(obj).flatMap(([k, v]) => {
    const s = shape?.[k];
    const nested = s && typeof s === "object" && !Array.isArray(s) && Object.keys(s).length && v && typeof v === "object";
    return nested ? keyPaths(v, s, `${prefix}${k}.`) : [`${prefix}${k}`];
  });
}

// ===========================================================================
describe("mock db: path grammar", () => {
  const db = createMockDb();

  test("parity: doc needs even, collection odd segments (TypeError naming the count)", () => {
    assert.throws(() => db.doc(`data/users/${UID}`), { name: "TypeError", message: /even number of segments, got 3/ });
    assert.throws(() => db.collection(`${ROOT}/profile`), { name: "TypeError", message: /odd number of segments, got 4/ });
    assert.equal(db.doc(`${ROOT}/profile`).id, "profile");
    assert.equal(db.collection(ROOT).doc("profile").path, `${ROOT}/profile`);
  });

  test("builders on refs keep parity", () => {
    const deck = db.doc(`${ROOT}/profile`).collection("decks").doc("d1");
    assert.equal(deck.path, `${ROOT}/profile/decks/d1`);
    assert.throws(() => db.doc(`${ROOT}/profile`).collection("a/b"), TypeError);
    assert.throws(() => db.collection(`${ROOT}/plans/weeks`).doc("a/b"), TypeError);
  });

  test("segment rules", () => {
    for (const bad of ["", "a//b", "/a/b", "a/b/", "a/..", "a/.", "a/b c", "a/é", `a/${"x".repeat(201)}`, Array(18).fill("a").join("/")]) {
      assert.throws(() => db.doc(bad), TypeError, `expected TypeError for ${JSON.stringify(bad)}`);
    }
    assert.doesNotThrow(() => db.doc("a_b-c.d~e:f@g+h/2026-11-07"));
  });

  test("an un-awaited id is rejected synchronously", () => {
    assert.throws(() => db.doc(Promise.resolve("x")), { name: "TypeError", message: /Promise/ });
    assert.throws(() => db.collection(`data/users/${Promise.resolve("x")}`), TypeError);
  });

  test("collection.doc() mints a fresh id", () => {
    const a = db.collection("things").doc();
    const b = db.collection("things").doc();
    assert.match(a.id, /^[A-Za-z0-9]{20}$/);
    assert.notEqual(a.id, b.id);
  });
});

// ===========================================================================
describe("mock db: documents", () => {
  test("set / get / frozen data / missing docs", async () => {
    const db = createMockDb();
    const ref = db.doc("c/d");
    const missing = await ref.get();
    assert.equal(missing.exists, false);
    assert.equal(missing.data(), undefined);
    await ref.set({ a: 1, nested: { list: [1, 2] } });
    const snap = await ref.get();
    assert.equal(snap.exists, true);
    assert.deepEqual(snap.data(), { a: 1, nested: { list: [1, 2] } });
    assert.ok(Object.isFrozen(snap) && Object.isFrozen(snap.data()) && Object.isFrozen(snap.data().nested.list));
    assert.deepEqual(snap.metadata, { fromCache: false, hasPendingWrites: false });
    assert.equal(await ref.get(), snap, "unchanged doc → same snapshot object");
  });

  test("set copies its input", async () => {
    const db = createMockDb();
    const body = { list: [1] };
    await db.doc("c/d").set(body);
    body.list.push(2);
    assert.deepEqual((await db.doc("c/d").get()).data(), { list: [1] });
  });

  test("update merges nested objects, replaces arrays; requires the doc", async () => {
    const db = createMockDb();
    const ref = db.doc("c/d");
    await assert.rejects(ref.update({ a: 1 }), { code: "invalid_argument" });
    await ref.set({ a: { x: 1, y: 2 }, list: [1, 2, 3], keep: true });
    await ref.update({ a: { y: 20, z: 30 }, list: [9] });
    assert.deepEqual((await ref.get()).data(), { a: { x: 1, y: 20, z: 30 }, list: [9], keep: true });
  });

  test("invalid bodies reject invalid_argument", async () => {
    const db = createMockDb();
    const ref = db.doc("c/d");
    let deep = {};
    const root = deep;
    for (let i = 0; i < 33; i++) deep = deep.n = {};
    const bad = [[1, 2], null, "text", { a: undefined }, { a: NaN }, { a: new Date() }, { a: () => 1 }, root, { big: "x".repeat(256 * 1024) }];
    for (const body of bad) await assert.rejects(ref.set(body), { code: "invalid_argument" });
    assert.equal((await ref.get()).exists, false);
  });

  test("delete is idempotent; failNext injects errors", async () => {
    const db = createMockDb();
    await db.doc("c/d").set({ a: 1 });
    await db.doc("c/d").delete();
    await db.doc("c/d").delete();
    assert.equal((await db.doc("c/d").get()).exists, false);
    db.__mock.failNext("quota_exceeded");
    await assert.rejects(db.doc("c/e").set({ a: 1 }), (e) => e.code === "quota_exceeded" && typeof e.message === "string");
    await db.doc("c/e").set({ a: 1 });
  });

  test("strictWrites rejects overlapping writes to one document", async () => {
    const db = createMockDb({ strictWrites: true });
    const first = db.doc("c/d").set({ a: 1 });
    await assert.rejects(db.doc("c/d").set({ a: 2 }), { code: "resource_exhausted" });
    await first;
    await Promise.all([db.doc("c/x").set({ a: 1 }), db.doc("c/y").set({ a: 1 })]); // different docs are fine
  });

  test("persistence to a Storage-like object; reset clears it", async () => {
    const storage = memoryStorage();
    const db1 = createMockDb({ persist: storage });
    await db1.doc("c/d").set({ a: 1 });
    assert.ok(storage.map.has(MOCK_DB_STORAGE_KEY));
    const db2 = createMockDb({ persist: storage });
    assert.deepEqual((await db2.doc("c/d").get()).data(), { a: 1 });
    db2.__mock.reset();
    assert.equal(storage.map.has(MOCK_DB_STORAGE_KEY), false);
    assert.equal(db2.__mock.count(), 0);
    storage.setItem(MOCK_DB_STORAGE_KEY, "{not json");
    assert.equal(createMockDb({ persist: storage }).__mock.count(), 0, "corrupt storage → empty db");
    assert.doesNotThrow(() => createMockDb({ persist: "localStorage" }), "no localStorage in Node → in-memory");
  });
});

// ===========================================================================
describe("mock db: queries", () => {
  async function fill() {
    const db = createMockDb();
    const c = db.collection("s");
    await c.doc("a").set({ date: "2026-11-01", type: "run", km: 5, tags: ["easy"] });
    await c.doc("b").set({ date: "2026-11-03", type: "strength", tags: [] });
    await c.doc("c").set({ date: "2026-11-02", type: "run", km: 8, tags: ["long", "easy"] });
    await c.doc("d").set({ type: "other" }); // no date
    await db.doc("s/a/sub/x").set({ date: "2026-12-01", type: "run" }); // nested: not a child of "s"
    return { db, c };
  }
  const ids = (snap) => snap.docs.map((d) => d.id);

  test("no orderBy → id order; direct children only", async () => {
    const { c } = await fill();
    const snap = await c.get();
    assert.deepEqual(ids(snap), ["a", "b", "c", "d"]);
    assert.equal(snap.size, 4);
    assert.equal(snap.empty, false);
    assert.deepEqual(snap.docChanges().map((x) => [x.type, x.newIndex]), [["added", 0], ["added", 1], ["added", 2], ["added", 3]]);
  });

  test("operators", async () => {
    const { c } = await fill();
    assert.deepEqual(ids(await c.where("type", "==", "run").get()), ["a", "c"]);
    assert.deepEqual(ids(await c.where("type", "!=", "run").get()), ["b", "d"]);
    assert.deepEqual(ids(await c.where("date", ">=", "2026-11-02").get()), ["b", "c"]);
    assert.deepEqual(ids(await c.where("date", "<", "2026-11-02").get()), ["a"]);
    assert.deepEqual(ids(await c.where("km", ">", 5).get()), ["c"]);
    assert.deepEqual(ids(await c.where("type", "in", ["strength", "other"]).get()), ["b", "d"]);
    assert.deepEqual(ids(await c.where("type", "not-in", ["run"]).get()), ["b", "d"]);
    assert.deepEqual(ids(await c.where("tags", "array-contains", "easy").get()), ["a", "c"]);
    assert.deepEqual(ids(await c.where("date", ">=", "2026-11-01").where("date", "<=", "2026-11-02").get()), ["a", "c"]);
  });

  test("orderBy (missing field last) and limit window", async () => {
    const { c } = await fill();
    assert.deepEqual(ids(await c.orderBy("date", "desc").get()), ["b", "c", "a", "d"]);
    assert.deepEqual(ids(await c.orderBy("date").get()), ["a", "c", "b", "d"]);
    assert.deepEqual(ids(await c.orderBy("date", "desc").limit(2).get()), ["b", "c"]);
  });

  test("builders are pure", async () => {
    const { c } = await fill();
    const runs = c.where("type", "==", "run");
    runs.limit(1);
    assert.equal((await runs.get()).size, 2);
  });

  test("invalid queries reject invalid_argument (get) or hit the error callback (onSnapshot)", async () => {
    const { c } = await fill();
    let q = c;
    for (let i = 0; i < 11; i++) q = q.where("km", ">", i);
    const bad = [q, c.orderBy("a").orderBy("b"), c.limit(0), c.limit(1001), c.where("a", "~", 1), c.where("a", "in", []), c.orderBy("a", "up")];
    for (const query of bad) await assert.rejects(query.get(), { code: "invalid_argument" });
    const errors = [];
    const unsub = c.limit(0).onSnapshot(() => assert.fail("no snapshot expected"), (e) => errors.push(e.code));
    await wait();
    assert.deepEqual(errors, ["invalid_argument"]);
    unsub();
  });

  test("add() creates a doc under a generated id", async () => {
    const db = createMockDb();
    const ref = await db.collection("x").add({ a: 1 });
    assert.match(ref.path, /^x\/[A-Za-z0-9]{20}$/);
    assert.deepEqual((await ref.get()).data(), { a: 1 });
  });
});

// ===========================================================================
describe("mock db: onSnapshot", () => {
  test("doc listener: async first delivery, changes, unsubscribe", async () => {
    const db = createMockDb();
    const rec = recorder();
    const unsub = db.doc("c/d").onSnapshot((s) => rec.fn(s));
    assert.equal(rec.calls.length, 0, "never synchronous");
    await wait();
    assert.equal(rec.calls.length, 1);
    assert.equal(rec.last().value.exists, false);
    await db.doc("c/d").set({ a: 1 });
    await wait();
    assert.equal(rec.calls.length, 2);
    assert.deepEqual(rec.last().value.data(), { a: 1 });
    await db.doc("c/other").set({ a: 1 }); // unrelated doc: no delivery
    await wait();
    assert.equal(rec.calls.length, 2);
    unsub();
    unsub(); // idempotent
    await db.doc("c/d").set({ a: 2 });
    await wait();
    assert.equal(rec.calls.length, 2, "no delivery after unsubscribe");
  });

  test("query listener: docChanges with indexes; unchanged docs keep identity", async () => {
    const db = createMockDb();
    const c = db.collection("s");
    await c.doc("a").set({ n: 1 });
    await c.doc("b").set({ n: 2 });
    const snaps = [];
    const unsub = c.orderBy("n").onSnapshot((s) => snaps.push(s));
    await wait();
    assert.deepEqual(snaps[0].docChanges().map((x) => x.type), ["added", "added"]);
    await Promise.all([c.doc("a").set({ n: 3 }), c.doc("c").set({ n: 0 })]); // a moves after b and changes; c is new and first
    await db.__mock.flush();
    const last = snaps[snaps.length - 1];
    assert.deepEqual(last.docs.map((d) => d.id), ["c", "b", "a"]);
    const byType = Object.fromEntries(last.docChanges().map((x) => [x.doc.id, [x.type, x.oldIndex, x.newIndex]]));
    assert.deepEqual(byType, { c: ["added", -1, 0], a: ["modified", 0, 2] });
    assert.equal(last.docs[1], snaps[0].docs[1], "b unchanged → same snapshot object");
    await c.doc("b").delete();
    await db.__mock.flush();
    const removal = snaps[snaps.length - 1].docChanges();
    assert.equal(removal.length, 1);
    assert.equal(removal[0].type, "removed");
    assert.equal(removal[0].newIndex, -1);
    assert.deepEqual(removal[0].doc.data(), { n: 2 }, "removed change carries the last body");
    unsub();
  });

  test("subscription cap: the 65th listener gets resource_exhausted", async () => {
    const db = createMockDb();
    const unsubs = Array.from({ length: 64 }, (_, i) => db.doc(`c/d${i}`).onSnapshot(() => {}));
    const errors = [];
    db.doc("c/x").onSnapshot(() => assert.fail("should not deliver"), (e) => errors.push(e.code));
    await wait();
    assert.deepEqual(errors, ["resource_exhausted"]);
    unsubs.forEach((u) => u());
    const ok = recorder();
    const u = db.doc("c/x").onSnapshot(ok.fn);
    await wait();
    assert.equal(ok.calls.length, 1, "slots free again after unsubscribing");
    u();
  });

  test("latency: own writes show hasPendingWrites, then are confirmed", async () => {
    const db = createMockDb({ latencyMs: 20 });
    const metas = [];
    const unsub = db.doc("c/d").onSnapshot((s) => metas.push([s.exists, s.metadata.hasPendingWrites]));
    await wait(30);
    const write = db.doc("c/d").set({ a: 1 });
    await wait(5);
    assert.deepEqual(metas[metas.length - 1], [true, true], "visible at once, pending");
    await write;
    await wait(5);
    assert.deepEqual(metas[metas.length - 1], [true, false], "confirmed");
    unsub();
  });
});

// ===========================================================================
describe("store: no user / no db", () => {
  function asyncMethods(store, prefix = "") {
    return Object.entries(store).flatMap(([k, v]) => {
      if (typeof v === "function") return k.startsWith("subscribe") ? [] : [[`${prefix}${k}`, v]];
      return v && typeof v === "object" ? asyncMethods(v, `${prefix}${k}.`) : [];
    });
  }

  test("uid null → every method rejects no_user; subscriptions report it", async () => {
    const store = createStore(createMockDb(), null);
    const methods = asyncMethods(store);
    assert.ok(methods.length >= 25, `found ${methods.length} methods`);
    for (const [name, fn] of methods) await assert.rejects(fn({}), { code: "no_user" }, name);
    const errors = [];
    const unsub = store.sessions.subscribe(() => assert.fail("no data"), { onError: (e) => errors.push(e.code) });
    store.chat.subscribeDay("2026-11-07", () => {}, { onError: (e) => errors.push(e.code) });
    assert.equal(typeof unsub, "function");
    await wait();
    assert.deepEqual(errors, ["no_user", "no_user"]);
  });

  test("db null → db_unavailable", async () => {
    const store = createStore(null, UID);
    await assert.rejects(store.profile.get(), { code: "db_unavailable" });
  });
});

// ===========================================================================
describe("store: profile", () => {
  test("defaults when missing; lives at data/users/<uid>/profile", async () => {
    const { store, db } = setup();
    assert.deepEqual(await store.profile.get(), defaultProfile());
    await store.profile.update({ name: "Alex" });
    assert.ok(`${ROOT}/profile` in db.__mock.dump());
  });

  test("update deep-merges objects, replaces arrays, stamps updatedAt", async () => {
    const { store, now } = setup();
    await store.profile.update({ goals: { primary: "Get strong", secondary: ["a", "b"] } });
    const { profile } = await store.profile.update({
      goals: { modalities: { running: true }, secondary: ["c"] },
      equipment: { locations: [{ id: "home", name: "Home", items: ["dumbbells"], dumbbellMaxKg: 24, kettlebellsKg: [], notes: "" }] },
    });
    assert.equal(profile.goals.primary, "Get strong");
    assert.deepEqual(profile.goals.secondary, ["c"]);
    assert.deepEqual(profile.goals.modalities, { strength: true, running: true, conditioning: false });
    assert.equal(profile.equipment.defaultLocationId, "gym");
    assert.deepEqual(profile.equipment.locations.map((l) => l.id), ["home"]);
    assert.equal(profile.updatedAt, now().toISOString());
    assert.deepEqual(await store.profile.get(), profile);
  });

  test("undo reverts only that update's fields", async () => {
    const { store } = setup();
    const a = await store.profile.update({ name: "Alex", schedule: { daysPerWeek: 4 } });
    await store.profile.update({ age: 34, schedule: { minutesPerSession: 45 } });
    await a.undo();
    await a.undo(); // idempotent
    const p = await store.profile.get();
    assert.equal(p.name, "");
    assert.equal(p.age, 34);
    assert.deepEqual(p.schedule, { ...defaultProfile().schedule, minutesPerSession: 45 });
  });

  test("undo of the first-ever update removes the doc again", async () => {
    const { store, db } = setup();
    const { undo } = await store.profile.update({ onboarded: true });
    await undo();
    assert.equal(`${ROOT}/profile` in db.__mock.dump(), false);
  });

  test("set replaces; undo restores the previous profile", async () => {
    const { store } = setup();
    await store.profile.update({ name: "Old", age: 50 });
    const { profile, undo } = await store.profile.set({ ...defaultProfile(), name: "New" });
    assert.equal(profile.name, "New");
    assert.equal(profile.age, null);
    await undo();
    const p = await store.profile.get();
    assert.equal(p.name, "Old");
    assert.equal(p.age, 50);
  });

  test("rejects non-object patches and ignores prototype keys", async () => {
    const { store } = setup();
    await assert.rejects(store.profile.update("x"), { code: "invalid_argument" });
    await store.profile.update(JSON.parse('{"__proto__": {"polluted": true}, "name": "A"}'));
    assert.equal({}.polluted, undefined);
    assert.equal((await store.profile.get()).name, "A");
  });

  test("getters return mutable copies", async () => {
    const { store } = setup();
    await store.profile.update({ name: "A" });
    const p = await store.profile.get();
    p.injuries.push({ area: "knee" });
    assert.deepEqual((await store.profile.get()).injuries, []);
  });

  test("subscribe delivers defaults, then changes, with metadata", async () => {
    const { store, db } = setup();
    const rec = recorder();
    const unsub = store.profile.subscribe(rec.fn);
    await wait();
    assert.deepEqual(rec.calls[0].value, defaultProfile());
    assert.deepEqual(rec.calls[0].meta, { fromCache: false, hasPendingWrites: false });
    await store.profile.update({ name: "Live" });
    await db.__mock.flush();
    assert.equal(rec.last().value.name, "Live");
    unsub();
  });
});

// ===========================================================================
describe("store: coach memory", () => {
  test("defaults, addNote, kind fallback, empty text", async () => {
    const { store } = setup();
    assert.deepEqual(await store.coach.get(), defaultCoachMemory());
    const { note, coach } = await store.coach.addNote({ kind: "decision", text: "  Repeat 77.5 kg  " });
    assert.match(note.id, /^n_/);
    assert.equal(note.date, "2026-11-07");
    assert.equal(note.text, "Repeat 77.5 kg");
    assert.deepEqual(coach.notes, [note]);
    assert.equal((await store.coach.addNote({ kind: "weird", text: "x" })).note.kind, "insight");
    await assert.rejects(store.coach.addNote({ kind: "goal", text: "   " }), { code: "invalid_argument" });
  });

  test("keeps the newest 200 notes; undo brings the evicted one back", async () => {
    const { store, db } = setup();
    const notes = Array.from({ length: 200 }, (_, i) => ({ id: `n${i}`, date: "2026-11-01", kind: "insight", text: `note ${i}` }));
    await db.doc(`${ROOT}/coach`).set({ summary: "", notes, updatedAt: "" });
    const { note, coach, undo } = await store.coach.addNote({ kind: "goal", text: "newest" });
    assert.equal(coach.notes.length, LIMITS.coachNotes);
    assert.equal(coach.notes[0].id, "n1");
    assert.equal(coach.notes[199].id, note.id);
    await undo();
    assert.deepEqual((await store.coach.get()).notes, notes);
  });

  test("setSummary truncates to 2,000 chars; undo restores", async () => {
    const { store } = setup();
    await store.coach.setSummary("first");
    const { coach, undo } = await store.coach.setSummary("x".repeat(2500));
    assert.equal(coach.summary.length, 2000);
    await undo();
    assert.equal((await store.coach.get()).summary, "first");
  });
});

// ===========================================================================
describe("store: state", () => {
  test("defaults, deep merge with array replace, undo", async () => {
    const { store } = setup();
    assert.deepEqual(await store.state.get(), defaultAppState());
    await store.state.update({ rotation: { planId: "2026-11-01", done: ["W1", "W2"] } });
    const { state, undo } = await store.state.update({ rotation: { done: ["W1"] }, settings: { theme: "dark" } });
    assert.deepEqual(state.rotation, { planId: "2026-11-01", done: ["W1"] });
    assert.deepEqual(state.settings, { theme: "dark", chatTier: "default" });
    await undo();
    const s = await store.state.get();
    assert.deepEqual(s.rotation.done, ["W1", "W2"]);
    assert.equal(s.settings.theme, "system");
  });
});

// ===========================================================================
describe("store: body", () => {
  test("sorted entries, one per date, undo restores a replaced entry", async () => {
    const { store } = setup();
    await store.body.add({ date: "2026-11-05", kg: 82 });
    await store.body.add({ date: "2026-11-01", kg: 82.5 });
    const { entries, undo } = await store.body.add({ date: "2026-11-05", kg: 81.6 });
    assert.deepEqual(entries, [{ date: "2026-11-01", kg: 82.5 }, { date: "2026-11-05", kg: 81.6 }]);
    await undo();
    assert.deepEqual(await store.body.list(), [{ date: "2026-11-01", kg: 82.5 }, { date: "2026-11-05", kg: 82 }]);
    assert.equal((await store.body.add({ kg: 80 })).entry.date, "2026-11-07", "date defaults to today");
    await assert.rejects(store.body.add({ date: "2026-11-05", kg: -1 }), { code: "invalid_argument" });
    await assert.rejects(store.body.add({ date: "11/05/2026", kg: 80 }), { code: "invalid_argument" });
  });

  test("capped at 400, newest last; undo restores the evicted entry", async () => {
    const { store, db } = setup();
    const entries = Array.from({ length: 400 }, (_, i) => {
      const d = new Date(2025, 0, 1 + i);
      return { date: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`, kg: 80 };
    });
    await db.doc(`${ROOT}/body`).set({ entries });
    const r = await store.body.add({ date: "2026-11-07", kg: 79 });
    assert.equal(r.entries.length, 400);
    assert.equal(r.entries[0].date, entries[1].date);
    assert.deepEqual(r.entries[399], { date: "2026-11-07", kg: 79 });
    await r.undo();
    assert.deepEqual(await store.body.list(), entries);
  });
});

// ===========================================================================
describe("store: plans", () => {
  const plan = (weekStart, focus = "f") => ({ weekStart, focus, rationale: "r", workouts: [{ id: "W1", title: "A", type: "strength", blocks: [] }] });

  test("saveDraft assigns ids, replaces the previous draft; undo puts it back", async () => {
    const { store } = setup();
    const first = await store.plans.saveDraft({ ...plan("2026-11-08"), id: "ignored", status: "agreed" });
    assert.equal(first.plan.id, "2026-11-08");
    assert.equal(first.plan.status, "draft");
    assert.equal(first.plan.approvedAt, null);
    assert.deepEqual(first.replaced, []);
    const second = await store.plans.saveDraft(plan("2026-11-08", "regenerated"));
    assert.equal(second.plan.id, "2026-11-08-2");
    assert.deepEqual(second.replaced, ["2026-11-08"]);
    assert.equal(await store.plans.get("2026-11-08"), null);
    assert.equal((await store.plans.getDraft()).focus, "regenerated");
    assert.equal((await store.plans.saveDraft(plan("2026-11-08"))).plan.id, "2026-11-08-3");
    const list = await store.plans.list();
    assert.deepEqual(list.map((p) => p.id), ["2026-11-08-3"]);
    await second.undo(); // stale: its draft was replaced since, so nothing changes
    assert.equal(await store.plans.get("2026-11-08"), null);
    assert.ok(await store.plans.get("2026-11-08-3"));
  });

  test("saveDraft undo restores the replaced draft", async () => {
    const { store } = setup();
    await store.plans.saveDraft(plan("2026-11-08", "one"));
    const two = await store.plans.saveDraft(plan("2026-11-15", "two"));
    assert.deepEqual(two.replaced, ["2026-11-08"]);
    await two.undo();
    const draft = await store.plans.getDraft();
    assert.equal(draft.id, "2026-11-08");
    assert.equal(draft.focus, "one");
    assert.equal(await store.plans.get("2026-11-15"), null);
  });

  test("missing weekStart defaults to the next Sunday; bad weekStart rejects", async () => {
    const { store } = setup(); // Saturday 2026-11-07
    assert.equal((await store.plans.saveDraft({ focus: "x" })).plan.weekStart, "2026-11-08");
    await assert.rejects(store.plans.saveDraft({ weekStart: "next week" }), { code: "invalid_argument" });
  });

  test("approve: draft → agreed, previous agreed → archived, rotation reset; undo restores all", async () => {
    const { store, now } = setup();
    const a = await store.plans.saveDraft(plan("2026-11-01", "A"));
    await store.plans.approve(a.plan.id);
    await store.state.update({ rotation: { done: ["W1"] } });
    const b = await store.plans.saveDraft(plan("2026-11-08", "B"));
    now.advance(60_000);
    const res = await store.plans.approve(b.plan.id);
    assert.equal(res.plan.status, "agreed");
    assert.equal(res.plan.approvedAt, now().toISOString());
    assert.deepEqual(res.archived, ["2026-11-01"]);
    assert.deepEqual(res.state.rotation, { planId: "2026-11-08", done: [] });
    assert.equal((await store.plans.get("2026-11-01")).status, "archived");
    assert.equal((await store.plans.getAgreed()).id, "2026-11-08");
    assert.equal(await store.plans.getDraft(), null);
    assert.deepEqual((await store.plans.list()).map((p) => [p.id, p.status]), [["2026-11-08", "agreed"], ["2026-11-01", "archived"]]);
    assert.equal((await store.plans.list({ limit: 1 })).length, 1);

    await res.undo();
    assert.equal((await store.plans.get("2026-11-08")).status, "draft");
    assert.equal((await store.plans.get("2026-11-08")).approvedAt, null);
    assert.equal((await store.plans.get("2026-11-01")).status, "agreed");
    assert.deepEqual((await store.state.get()).rotation, { planId: "2026-11-01", done: ["W1"] });
  });

  test("approve edge cases: unknown id, already agreed, same-week regenerate", async () => {
    const { store } = setup();
    await assert.rejects(store.plans.approve("2026-01-04"), { code: "not_found" });
    await assert.rejects(store.plans.approve("bad/id"), { code: "invalid_argument" });
    const a = await store.plans.saveDraft(plan("2026-11-01"));
    await store.plans.approve(a.plan.id);
    const again = await store.plans.approve(a.plan.id);
    assert.equal(again.alreadyAgreed, true);
    const redo = await store.plans.saveDraft(plan("2026-11-01", "mid-week replan"));
    assert.equal(redo.plan.id, "2026-11-01-2");
    assert.deepEqual(redo.replaced, [], "the agreed plan is not a draft");
    assert.equal((await store.plans.getAgreed()).id, "2026-11-01");
  });

  test("subscribe: all plans newest first", async () => {
    const { store, db } = setup();
    const rec = recorder();
    const unsub = store.plans.subscribe(rec.fn);
    await store.plans.saveDraft(plan("2026-11-01"));
    await store.plans.approve("2026-11-01");
    await store.plans.saveDraft(plan("2026-11-08"));
    await db.__mock.flush();
    assert.deepEqual(rec.last().value.map((p) => [p.id, p.status]), [["2026-11-08", "draft"], ["2026-11-01", "agreed"]]);
    unsub();
  });
});

// ===========================================================================
describe("store: sessions", () => {
  const run = (date, extra = {}) => ({ date, title: "Run", type: "run", run: { runType: "easy", distanceKm: 5, durationSec: 1800 }, ...extra });

  test("add assigns id/timestamps and defaults; undo deletes", async () => {
    const { store, now } = setup();
    const { id, session, undo } = await store.sessions.add({ date: "2026-11-05", title: "Upper A", type: "strength", id: "x" });
    assert.match(id, /^2026-11-05-[a-z0-9]{6}$/);
    assert.equal(session.id, id);
    assert.equal(session.createdAt, now().toISOString());
    assert.deepEqual(Object.keys(session).sort(), Object.keys(defaultSession()).sort());
    assert.deepEqual(await store.sessions.get(id), session);
    await undo();
    assert.equal(await store.sessions.get(id), null);
    assert.match((await store.sessions.add({ title: "today" })).id, /^2026-11-07-/);
    await assert.rejects(store.sessions.add({ date: "2026-13-01" }), { code: "invalid_argument" });
    await assert.rejects(store.sessions.get("a/b"), { code: "invalid_argument" });
  });

  test("update deep-merges (arrays replace); undo reverts; unknown id → not_found", async () => {
    const { store, now } = setup();
    const { id } = await store.sessions.add({
      date: "2026-11-05", type: "strength", notes: "orig",
      strength: [{ exerciseId: "bench_press", name: "Bench", sets: [{ type: "work", loadKg: 80, bodyweight: false, reps: 5, rir: 2 }] }],
      run: { distanceKm: 1, durationSec: 300 },
    });
    now.advance(1000);
    const { session, undo } = await store.sessions.update(id, { strength: [], run: { distanceKm: 2 }, coachComment: "Nice", id: "hack" });
    assert.equal(session.id, id);
    assert.deepEqual(session.strength, []);
    assert.deepEqual(session.run, { distanceKm: 2, durationSec: 300 });
    assert.equal(session.updatedAt, now().toISOString());
    await store.sessions.update(id, { notes: "edited later" });
    await undo();
    const s = await store.sessions.get(id);
    assert.equal(s.strength.length, 1);
    assert.equal(s.coachComment, "");
    assert.equal(s.notes, "edited later", "later edits survive");
    await assert.rejects(store.sessions.update("2026-01-01-nopeno", { notes: "x" }), { code: "not_found" });
  });

  test("remove; undo restores; removing a missing id is a no-op", async () => {
    const { store } = setup();
    const { id, session } = await store.sessions.add(run("2026-11-02"));
    const r = await store.sessions.remove(id);
    assert.equal(r.removed, true);
    assert.equal(await store.sessions.get(id), null);
    await r.undo();
    assert.deepEqual(await store.sessions.get(id), session);
    const none = await store.sessions.remove("2026-01-01-zzzzzz");
    assert.equal(none.removed, false);
    await none.undo();
  });

  test("list: filters, newest first, ties by createdAt", async () => {
    const { store, now } = setup();
    await store.sessions.add(run("2026-11-01"));
    await store.sessions.add({ date: "2026-11-03", type: "strength", title: "S1" });
    now.advance(1000);
    await store.sessions.add({ date: "2026-11-03", type: "conditioning", title: "C1" });
    await store.sessions.add(run("2026-11-06"));
    const all = await store.sessions.list();
    assert.deepEqual(all.map((s) => s.date), ["2026-11-06", "2026-11-03", "2026-11-03", "2026-11-01"]);
    assert.equal(all[1].title, "C1", "same date: newest createdAt first");
    assert.deepEqual((await store.sessions.list({ from: "2026-11-02", to: "2026-11-03" })).map((s) => s.title), ["C1", "S1"]);
    assert.deepEqual((await store.sessions.list({ type: "run" })).map((s) => s.date), ["2026-11-06", "2026-11-01"]);
    assert.deepEqual((await store.sessions.list({ type: ["strength", "conditioning"] })).map((s) => s.title), ["C1", "S1"]);
    assert.equal((await store.sessions.list({ limit: 2 })).length, 2);
    await assert.rejects(store.sessions.list({ from: "yesterday" }), { code: "invalid_argument" });
  });

  test("subscribe: live, newest first, limited", async () => {
    const { store, db } = setup();
    const rec = recorder();
    const unsub = store.sessions.subscribe(rec.fn, { limit: 2 });
    await wait();
    assert.deepEqual(rec.last().value, []);
    await store.sessions.add(run("2026-11-01"));
    await store.sessions.add(run("2026-11-05"));
    await store.sessions.add(run("2026-11-03"));
    await db.__mock.flush();
    assert.deepEqual(rec.last().value.map((s) => s.date), ["2026-11-05", "2026-11-03"]);
    unsub();
  });
});

// ===========================================================================
describe("store: chat", () => {
  test("append assigns id and ts, writes today's day doc; role validated", async () => {
    const { store, db, now } = setup();
    const { message, date } = await store.chat.append({ role: "user", text: "What's my workout today?", id: "mine", ts: "old" });
    assert.equal(date, "2026-11-07");
    assert.match(message.id, /^m_/);
    assert.equal(message.ts, now().toISOString());
    assert.deepEqual(message.actions, []);
    assert.equal(message.error, null);
    const doc = db.__mock.dump()[`${ROOT}/chat/days/2026-11-07`];
    assert.deepEqual(doc, { date: "2026-11-07", messages: [message] });
    await assert.rejects(store.chat.append({ role: "system", text: "x" }), { code: "invalid_argument" });
  });

  test("recent(n) spans days oldest → newest; days() newest first; getDay", async () => {
    const { store, now } = setup({ now: clock("2026-10-20T09:00:00") });
    const texts = [];
    for (let day = 0; day < 10; day++) {
      for (let i = 0; i < (day % 3) + 1; i++) {
        const text = `d${day}m${i}`;
        texts.push(text);
        await store.chat.append({ role: i % 2 ? "assistant" : "user", text });
        now.advance(60_000);
      }
      now.advance(24 * 3600_000);
    }
    assert.deepEqual((await store.chat.recent(4)).map((m) => m.text), texts.slice(-4));
    assert.deepEqual((await store.chat.recent(100)).map((m) => m.text), texts, "pages through more than 7 days");
    assert.deepEqual(await store.chat.recent(0), []);
    const days = await store.chat.days();
    assert.equal(days.length, 10);
    assert.equal(days[0], "2026-10-29");
    assert.deepEqual(await store.chat.days({ limit: 2 }), ["2026-10-29", "2026-10-28"]);
    assert.deepEqual((await store.chat.getDay("2026-10-20")).messages.map((m) => m.text), ["d0m0"]);
    assert.deepEqual(await store.chat.getDay("2026-01-01"), { date: "2026-01-01", messages: [] });
  });

  test("a new day starts a new doc", async () => {
    const { store, now } = setup({ now: clock("2026-11-06T23:59:00") });
    await store.chat.append({ role: "user", text: "late" });
    now.advance(2 * 60_000);
    const { date } = await store.chat.append({ role: "assistant", text: "early" });
    assert.equal(date, "2026-11-07");
    assert.deepEqual((await store.chat.recent(2)).map((m) => m.text), ["late", "early"]);
  });

  test("cap 300 per day; undo restores the evicted message; undo of the only message deletes the day", async () => {
    const { store, db } = setup();
    const messages = Array.from({ length: 300 }, (_, i) => ({ id: `m${i}`, ts: "2026-11-07T08:00:00.000Z", role: "user", text: `${i}`, actions: [], error: null }));
    await db.doc(`${ROOT}/chat/days/2026-11-07`).set({ date: "2026-11-07", messages });
    const { undo } = await store.chat.append({ role: "event", text: "Plan approved" });
    const day = await store.chat.getDay("2026-11-07");
    assert.equal(day.messages.length, LIMITS.chatMessagesPerDay);
    assert.equal(day.messages[0].id, "m1");
    assert.equal(day.messages[299].text, "Plan approved");
    await undo();
    assert.deepEqual((await store.chat.getDay("2026-11-07")).messages, messages);

    const fresh = setup();
    const only = await fresh.store.chat.append({ role: "user", text: "hi" });
    await only.undo();
    assert.deepEqual(await fresh.store.chat.days(), []);
  });

  test("clear() deletes every chat day and nothing else; undo restores them and keeps newer messages", async () => {
    const { store, db, now } = setup({ now: clock("2026-11-05T09:00:00") });
    await store.chat.append({ role: "user", text: "old day" });
    now.set("2026-11-07T09:00:00");
    await store.chat.append({ role: "user", text: "hi" });
    await store.chat.append({ role: "assistant", text: "", error: "invalid_request" });
    await store.coach.addNote({ kind: "goal", text: "Squat 120 kg" });
    await store.coach.setSummary("Long-term summary");
    await store.profile.update({ name: "Sam" });
    const others = Object.entries(db.__mock.dump()).filter(([p]) => !p.includes("/chat/"));

    const res = await store.chat.clear();
    assert.equal(res.days, 2);
    assert.equal(res.messages, 3);
    assert.deepEqual(await store.chat.days(), []);
    assert.deepEqual(await store.chat.recent(10), []);
    assert.deepEqual(Object.entries(db.__mock.dump()).filter(([p]) => !p.includes("/chat/")), others, "memory, profile etc. untouched");
    assert.equal((await store.coach.get()).summary, "Long-term summary");

    now.advance(60_000);
    await store.chat.append({ role: "event", text: "Chat cleared" });
    await res.undo();
    assert.deepEqual((await store.chat.recent(10)).map((m) => m.text), ["old day", "hi", "", "Chat cleared"]);
    assert.deepEqual(await store.chat.days(), ["2026-11-07", "2026-11-05"]);

    const empty = setup();
    const r2 = await empty.store.chat.clear();
    assert.equal(r2.days, 0);
    await r2.undo();
    assert.deepEqual(await empty.store.chat.days(), []);
  });

  test("a day doc stays under the 256 KiB cap by dropping its oldest messages", async () => {
    const { store, db } = setup();
    for (let i = 0; i < 30; i++) await store.chat.append({ role: "assistant", text: `${i} ${"x".repeat(10_000)}` });
    const doc = db.__mock.dump()[`${ROOT}/chat/days/2026-11-07`];
    assert.ok(JSON.stringify(doc).length <= LIMITS.docBudgetBytes);
    assert.ok(doc.messages.length < 30);
    assert.match(doc.messages[doc.messages.length - 1].text, /^29 /);
  });

  test("subscribeDay delivers the day, then appends", async () => {
    const { store, db } = setup();
    const rec = recorder();
    const unsub = store.chat.subscribeDay("2026-11-07", rec.fn);
    await wait();
    assert.deepEqual(rec.calls[0].value, { date: "2026-11-07", messages: [] });
    await store.chat.append({ role: "user", text: "hello" });
    await db.__mock.flush();
    assert.deepEqual(rec.last().value.messages.map((m) => m.text), ["hello"]);
    unsub();
  });
});

// ===========================================================================
describe("store: backup", () => {
  test("export → import into another user round-trips exactly", async () => {
    const a = setup();
    await seedDevData(a.store, { now: new Date(2026, 10, 7, 12) });
    const backup = await a.store.exportAll();
    assert.equal(backup.format, BACKUP_FORMAT);
    assert.equal(backup.version, 1);
    const db = createMockDb({ strictWrites: true });
    const b = createStore(db, "u_other");
    const { counts } = await b.importAll(JSON.stringify(backup));
    assert.deepEqual(counts, { plans: 3, sessions: backup.data.sessions.length, chatDays: backup.data.chat.length });
    assert.deepEqual((await b.exportAll()).data, backup.data);
    assert.ok(Object.keys(db.__mock.dump()).every((p) => p.startsWith("data/users/u_other/")));
  });

  test("import replaces everything; undo restores the previous data", async () => {
    const { store } = setup();
    const extra = await store.sessions.add({ date: "2026-11-06", title: "Mine" });
    await store.profile.update({ name: "Before" });
    const before = await store.exportAll();
    const fixture = JSON.parse(readFileSync(new URL("./fixtures/c-backup-v1.json", import.meta.url), "utf8"));
    const { counts, undo } = await store.importAll(fixture);
    assert.deepEqual(counts, { plans: 1, sessions: 2, chatDays: 1 });
    assert.equal(await store.sessions.get(extra.id), null);
    const p = await store.profile.get();
    assert.equal(p.name, "Sam");
    assert.equal(p.experience.level, null, "partial profile gets defaults on read");
    assert.equal((await store.plans.getAgreed()).id, "2026-10-25");
    assert.deepEqual((await store.sessions.list()).map((s) => s.id), ["2026-10-29-zz9yx8", "2026-10-27-abc123"]);
    assert.equal((await store.state.get()).settings.theme, "dark");
    assert.deepEqual((await store.chat.recent(5)).map((m) => m.id), ["m_fx1", "m_fx2"]);
    await undo();
    const after = await store.exportAll();
    assert.deepEqual(after.data, before.data);
  });

  test("invalid backups are rejected before anything is written", async () => {
    const { store } = setup();
    await store.profile.update({ name: "Keep" });
    const good = await store.exportAll();
    const bad = [
      "{nope",
      { format: "other", version: 1, data: {} },
      { ...good, version: 99 },
      { ...good, data: { ...good.data, sessions: [{ id: "a/b", date: "2026-11-01" }] } },
      { ...good, data: { ...good.data, sessions: [{ id: "x", date: "nope" }] } },
      { ...good, data: { ...good.data, plans: [{ id: "p" }, { id: "p" }] } },
      { ...good, data: { ...good.data, chat: [{ date: "2026-11-01" }] } },
    ];
    for (const json of bad) await assert.rejects(store.importAll(json), { code: "invalid_argument" });
    assert.equal((await store.profile.get()).name, "Keep");
  });
});

// ===========================================================================
describe("store: serialization and errors", () => {
  test("concurrent writes to one doc are serialized and none is lost", async () => {
    const { store, db } = setup(); // strictWrites: any overlap would reject
    const results = await Promise.all(Array.from({ length: 25 }, (_, i) => store.coach.addNote({ kind: "insight", text: `n${i}` })));
    const notes = (await store.coach.get()).notes;
    assert.equal(notes.length, 25);
    assert.deepEqual(notes.map((n) => n.text), results.map((r) => r.note.text), "call order kept");
    await Promise.all([
      store.profile.update({ name: "A" }),
      store.profile.update({ age: 30 }),
      store.profile.update({ goals: { primary: "P" } }),
      store.chat.append({ role: "user", text: "1" }),
      store.chat.append({ role: "assistant", text: "2" }),
    ]);
    const p = await store.profile.get();
    assert.deepEqual([p.name, p.age, p.goals.primary], ["A", 30, "P"]);
    assert.deepEqual((await store.chat.recent(2)).map((m) => m.text), ["1", "2"]);
    assert.equal(db.__mock.stats().maxConcurrentWritesPerDoc, 1);
  });

  test("concurrent undo and writes stay consistent", async () => {
    const { store } = setup();
    const a = await store.coach.addNote({ text: "a" });
    await Promise.all([a.undo(), store.coach.addNote({ text: "b" }), a.undo()]);
    assert.deepEqual((await store.coach.get()).notes.map((n) => n.text), ["b"]);
  });

  test("db errors pass through unchanged; the queue keeps going after a failure", async () => {
    const { store, db } = setup();
    db.__mock.failNext("quota_exceeded");
    await assert.rejects(store.sessions.add({ date: "2026-11-01" }), (e) => e.code === "quota_exceeded" && /simulated/.test(e.message));
    db.__mock.failNext("unavailable");
    const failing = store.profile.update({ name: "lost" });
    const next = store.profile.update({ age: 41 });
    await assert.rejects(failing, { code: "unavailable" });
    await next;
    assert.equal((await store.profile.get()).age, 41);
  });

  test("subscription errors reach onError", async () => {
    const { store } = setup();
    const errors = [];
    store.sessions.subscribe(() => {}, { limit: 5000, onError: (e) => errors.push(e.code) });
    await wait();
    assert.deepEqual(errors, ["invalid_argument"]);
  });
});

// ===========================================================================
describe("seedDevData", () => {
  const NOW = new Date(2026, 10, 7, 12); // Saturday

  test("seeds a complete, schema-shaped dataset once", async () => {
    const { store, db } = setup();
    const res = await seedDevData(store, { now: NOW });
    assert.equal(res.seeded, true);
    assert.deepEqual(await seedDevData(store, { now: NOW }), { seeded: false });

    const profile = await store.profile.get();
    assert.equal(profile.onboarded, true);
    assert.deepEqual(profile.goals.modalities, { strength: true, running: true, conditioning: true });
    const gym = profile.equipment.locations.find((l) => l.id === profile.equipment.defaultLocationId);
    for (const id of ["barbell", "squat_rack", "bench", "dumbbells", "kettlebell", "pullup_bar", "plyo_box", "wall_ball", "rower"]) {
      assert.ok(gym.items.includes(id), `gym has ${id}`);
    }
    const raw = buildSeedBackup(NOW).data;
    assert.deepEqual(keyPaths(raw.profile, defaultProfile()).sort(), keyPaths(defaultProfile()).sort(), "profile has exactly the §4 fields");
    assert.deepEqual(keyPaths(raw.state, defaultAppState()).sort(), keyPaths(defaultAppState()).sort());
    assert.deepEqual(Object.keys(raw.coach).sort(), Object.keys(defaultCoachMemory()).sort());

    const agreed = await store.plans.getAgreed();
    assert.equal(agreed.weekStart, "2026-11-01");
    assert.equal(new Date(2026, 10, 1).getDay(), 0, "week starts on Sunday");
    assert.equal(agreed.workouts.length, profile.schedule.daysPerWeek);
    const state = await store.state.get();
    assert.deepEqual(state.rotation, { planId: agreed.id, done: ["W1", "W2", "W3"] });

    const sessions = await store.sessions.list();
    assert.ok(sessions.length >= 10);
    assert.ok(sessions.every((s) => s.date <= "2026-11-07" && s.date >= "2026-10-18"));
    assert.ok(sessions.every((s) => keyPaths(s, defaultSession()).sort().join() === keyPaths(defaultSession()).sort().join()));
    assert.ok(sessions.some((s) => s.strength.some((l) => l.sets.some((x) => x.type === "work" && typeof x.rir === "number"))));
    assert.ok(sessions.some((s) => s.run?.avgPaceSecPerKm > 0 && s.run.splits.length));
    assert.ok(sessions.some((s) => s.conditioning.length && s.conditioning[0].result.completed));
    assert.ok(sessions.some((s) => s.status === "missed" && s.missedReason));
    assert.ok(sessions.some((s) => s.pain.length));

    const used = new Set();
    for (const p of await store.plans.list()) {
      for (const w of p.workouts) for (const b of w.blocks) for (const it of b.items ?? []) if (it.exerciseId) { used.add(it.exerciseId); it.alternatives?.forEach((x) => used.add(x)); }
    }
    for (const s of sessions) s.strength.forEach((l) => used.add(l.exerciseId));
    assert.deepEqual([...used].filter((id) => !SEED_EXERCISE_IDS.includes(id)), []);

    assert.ok((await store.coach.get()).notes.length >= 3);
    assert.ok((await store.chat.recent(50)).length > 0);
    for (const [path, doc] of Object.entries(db.__mock.dump())) {
      assert.ok(path.startsWith(`${ROOT}/`));
      assert.ok(JSON.stringify(doc).length < 256 * 1024);
    }
  });

  test("on a Sunday nothing lands in the future", async () => {
    const sunday = new Date(2026, 10, 8, 9);
    const { data } = buildSeedBackup(sunday);
    const today = "2026-11-08";
    assert.ok(data.sessions.every((s) => s.date <= today));
    assert.ok(data.chat.every((d) => d.date <= today));
    assert.equal(data.plans.find((p) => p.status === "agreed").weekStart, today);
    assert.deepEqual(data.state.rotation.done, []);
  });
});

// ===========================================================================
describe("env.getRuntime", () => {
  test("Node (no window) → mock runtime with working capabilities", async () => {
    const rt = await getRuntime();
    assert.equal(rt.mode, "mock");
    assert.equal(rt.uid, "dev-user");
    assert.equal(await rt.user.id(), "dev-user");
    assert.equal(rt.problems.includes("sample_unavailable"), rt.sample === null);
    assert.ok(!rt.problems.includes("db_unavailable") && !rt.problems.includes("not_signed_in"));
    const store = createStore(rt.db, rt.uid);
    await store.profile.update({ name: "Dev" });
    assert.equal((await store.profile.get()).name, "Dev");
    assert.deepEqual(await rt.dev.seed(), { seeded: false }, "already has data");
    await rt.dev.reset();
    assert.equal(rt.db.__mock.count(), 0);
  });

  test("mock downloads validates like the real one", async () => {
    const { downloads } = await getRuntime({ forceMock: true });
    assert.deepEqual(await downloads.save({ filename: "backup.json", data: "{}" }), { status: "saved" });
    await assert.rejects(downloads.save({ filename: "backup.exe", data: "x" }), { code: "rejected_extension" });
    await assert.rejects(downloads.save({ filename: "backup.json", data: "" }), { code: "bad_request" });
    assert.deepEqual(downloads.__mock.saved().map((s) => s.filename), ["backup.json"]);
  });

  function fakeClaude(caps, uid = "u_live") {
    const calls = [];
    return {
      calls,
      use: async (name) => {
        calls.push(name);
        const cap = caps[name];
        if (cap instanceof Error) throw cap;
        if (name === "user" && cap === undefined) return { id: async () => uid };
        return cap ?? null;
      },
    };
  }

  test("live: all capabilities present", async () => {
    const sample = async () => ({});
    const db = createMockDb();
    const downloads = { save: async () => ({ status: "saved" }) };
    const claude = fakeClaude({ sample, db, downloads });
    const rt = await getRuntime({ claude });
    assert.equal(rt.mode, "live");
    assert.equal(rt.sample, sample);
    assert.equal(rt.db, db);
    assert.equal(rt.downloads, downloads);
    assert.equal(rt.uid, "u_live");
    assert.deepEqual(rt.problems, []);
    assert.equal(rt.dev, null);
    assert.deepEqual(claude.calls.sort(), ["db", "downloads", "sample", "user"]);
  });

  test("live: missing pieces become problems, never rejections", async () => {
    const rt = await getRuntime({ claude: fakeClaude({ user: { id: async () => null }, sample: new Error("boom") }) });
    assert.equal(rt.mode, "live");
    assert.equal(rt.uid, null);
    assert.equal(rt.downloads, null);
    assert.deepEqual(rt.problems, ["db_unavailable", "not_signed_in", "sample_unavailable"]);
    const noUse = await getRuntime({ claude: {} });
    assert.equal(noUse.mode, "live");
    assert.deepEqual(noUse.problems, ["db_unavailable", "not_signed_in", "sample_unavailable"]);
  });

  test("forceMock wins over a present window.claude", async () => {
    const rt = await getRuntime({ forceMock: true, claude: fakeClaude({}) });
    assert.equal(rt.mode, "mock");
  });
});

// ===========================================================================
// v2 (Agent S): plans.update and the wellness namespace (CONTRACT-v2).
describe("store v2: plans.update", () => {
  const plan = (weekStart, focus = "f") => ({
    weekStart, focus, rationale: "r",
    workouts: [{ id: "W1", title: "A", type: "strength", blocks: [{ kind: "strength", items: [{ exerciseId: "back_squat", name: "Back Squat", sets: 3, reps: "5", loadKg: 100 }] }] }],
  });

  test("replaces top-level fields (workouts as a whole), stamps updatedAt; undo restores", async () => {
    const { store, now } = setup();
    const { plan: draft } = await store.plans.saveDraft(plan("2026-11-08"));
    now.advance(60_000);
    const workouts = [{ id: "W1", title: "A", type: "strength", blocks: [{ kind: "strength", items: [{ exerciseId: "leg_press", name: "Leg Press", sets: 3, reps: "5", loadKg: null }] }] }];
    const res = await store.plans.update(draft.id, { workouts, weeklyTargets: { runKm: 5 } });
    assert.equal(res.plan.updatedAt, now().toISOString());
    assert.deepEqual(res.plan.workouts, workouts);
    assert.deepEqual(res.plan.weeklyTargets, { runKm: 5 }, "top-level fields replace, no deep merge");
    assert.equal(res.plan.status, "draft");
    const stored = await store.plans.get(draft.id);
    assert.equal(stored.workouts[0].blocks[0].items[0].exerciseId, "leg_press");
    await res.undo();
    const back = await store.plans.get(draft.id);
    assert.deepEqual(back.workouts, draft.workouts);
    assert.deepEqual(back.weeklyTargets, draft.weeklyTargets);
    assert.equal(Object.hasOwn(back, "updatedAt"), false, "a field the plan did not have is removed again");
    await res.undo(); // idempotent
  });

  test("works on the agreed plan; ignores id/status/createdAt; undo keeps a later approval", async () => {
    const { store } = setup();
    const { plan: a } = await store.plans.saveDraft(plan("2026-11-01"));
    const res = await store.plans.update(a.id, { focus: "swapped", id: "x", status: "archived", createdAt: "nope" });
    assert.equal(res.plan.id, a.id);
    assert.equal(res.plan.status, "draft");
    assert.equal(res.plan.createdAt, a.createdAt);
    await store.plans.approve(a.id);
    const agreed = await store.plans.update(a.id, { notes: ["n"] });
    assert.equal(agreed.plan.status, "agreed");
    assert.deepEqual(agreed.plan.notes, ["n"]);
    await res.undo();
    const cur = await store.plans.get(a.id);
    assert.equal(cur.focus, "f");
    assert.equal(cur.status, "agreed", "the approval after the update survives its undo");
    assert.deepEqual(cur.notes, ["n"]);
  });

  test("unknown id → not_found; bad input → invalid_argument; no user → no_user", async () => {
    const { store } = setup();
    await assert.rejects(store.plans.update("2026-01-04", { focus: "x" }), { code: "not_found" });
    await assert.rejects(store.plans.update("bad/id", { focus: "x" }), { code: "invalid_argument" });
    await assert.rejects(store.plans.update("2026-01-04", null), { code: "invalid_argument" });
    await assert.rejects(createStore(createMockDb(), null).plans.update("2026-11-01", {}), { code: "no_user" });
  });

  test("concurrent updates to one plan are serialized and none is lost", async () => {
    const { store } = setup();
    const { plan: d } = await store.plans.saveDraft(plan("2026-11-08"));
    await Promise.all([
      store.plans.update(d.id, { focus: "one" }),
      store.plans.update(d.id, { rationale: "two" }),
      store.plans.update(d.id, { notes: ["three"] }),
    ]);
    const cur = await store.plans.get(d.id);
    assert.deepEqual([cur.focus, cur.rationale, cur.notes], ["one", "two", ["three"]]);
  });
});

describe("store v2: wellness", () => {
  test("add fills every field, lives at data/users/<uid>/wellness; list oldest first with a range", async () => {
    const { store, db } = setup();
    const { entry } = await store.wellness.add({ date: "2026-11-06", sleepScore: 80, hrvStatus: "Balanced", bogus: 1 });
    assert.deepEqual(entry, {
      date: "2026-11-06", trainingReadiness: null, sleepScore: 80, sleepHours: null, hrvStatus: "balanced", hrvMs: null,
      bodyBattery: null, restingHr: null, stress: null, notes: null, source: "manual",
    });
    await store.wellness.add({ trainingReadiness: 55, source: "garmin" }); // today = 2026-11-07
    await store.wellness.add({ date: "2026-11-01", restingHr: 52 });
    assert.ok(db.__mock.dump()[`${ROOT}/wellness`]);
    assert.deepEqual((await store.wellness.list()).map((e) => e.date), ["2026-11-01", "2026-11-06", "2026-11-07"]);
    assert.deepEqual((await store.wellness.list({ from: "2026-11-02", to: "2026-11-06" })).map((e) => e.date), ["2026-11-06"]);
    assert.equal((await store.wellness.list({ from: "2026-11-07" }))[0].source, "garmin");
    await assert.rejects(store.wellness.list({ from: "soon" }), { code: "invalid_argument" });
  });

  test("same date merges (null keeps the stored value); undo restores the previous entry", async () => {
    const { store } = setup();
    await store.wellness.add({ date: "2026-11-06", sleepScore: 80, sleepHours: 7.5, notes: "  slept ok " });
    const res = await store.wellness.add({ date: "2026-11-06", sleepScore: 60, sleepHours: null, stress: 30, source: "garmin" });
    assert.equal(res.entry.sleepScore, 60);
    assert.equal(res.entry.sleepHours, 7.5);
    assert.equal(res.entry.stress, 30);
    assert.equal(res.entry.notes, "slept ok");
    assert.equal(res.entry.source, "garmin");
    assert.equal((await store.wellness.list()).length, 1);
    await res.undo();
    const [e] = await store.wellness.list();
    assert.deepEqual([e.sleepScore, e.stress, e.source], [80, null, "manual"]);
  });

  test("undo of the first-ever entry removes the doc again", async () => {
    const { store, db } = setup();
    const res = await store.wellness.add({ date: "2026-11-06", bodyBattery: 70 });
    await res.undo();
    assert.equal(db.__mock.dump()[`${ROOT}/wellness`], undefined);
    assert.deepEqual(await store.wellness.list(), []);
  });

  test("validation: ranges, hrvStatus enum, empty entries, bad dates", async () => {
    const { store } = setup();
    for (const bad of [
      { sleepScore: 101 }, { trainingReadiness: -1 }, { sleepHours: 30 }, { restingHr: "fast" },
      { hrvStatus: "great" }, {}, { notes: "   " }, { date: "2026-02-30", stress: 10 }, null,
    ]) await assert.rejects(store.wellness.add(bad), { code: "invalid_argument" }, JSON.stringify(bad));
    assert.equal((await store.wellness.add({ sleepScore: "77" })).entry.sleepScore, 77, "numeric strings are accepted");
  });

  test("capped at 400 entries, newest last; undo brings the evicted one back", async () => {
    const { store, db } = setup();
    const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    const entries = Array.from({ length: LIMITS.wellnessEntries }, (_, i) => ({ date: iso(new Date(2025, 0, 1 + i)), stress: 10, source: "manual" }));
    await db.doc(`${ROOT}/wellness`).set({ entries });
    const oldest = entries[0].date;
    const res = await store.wellness.add({ date: "2026-11-07", stress: 20 });
    const list = await store.wellness.list();
    assert.equal(list.length, LIMITS.wellnessEntries);
    assert.equal(list[0].date, entries[1].date);
    assert.equal(list.at(-1).date, "2026-11-07");
    await res.undo();
    const back = await store.wellness.list();
    assert.equal(back.length, LIMITS.wellnessEntries);
    assert.equal(back[0].date, oldest);
  });

  test("concurrent adds are serialized; subscribe delivers entries oldest first", async () => {
    const { store, db } = setup();
    const rec = recorder();
    const unsub = store.wellness.subscribe(rec.fn);
    await Promise.all([
      store.wellness.add({ date: "2026-11-05", stress: 1 }),
      store.wellness.add({ date: "2026-11-03", stress: 2 }),
      store.wellness.add({ date: "2026-11-05", sleepScore: 3 }),
    ]);
    await db.__mock.flush();
    const last = rec.last().value;
    assert.deepEqual(last.map((e) => e.date), ["2026-11-03", "2026-11-05"]);
    assert.deepEqual([last[1].stress, last[1].sleepScore], [1, 3]);
    unsub();
  });

  test("backup: wellness round-trips; an older backup without it leaves wellness alone", async () => {
    const { store } = setup();
    await store.wellness.add({ date: "2026-11-06", sleepScore: 81 });
    const backup = await store.exportAll();
    assert.equal(backup.data.wellness.entries[0].sleepScore, 81);
    const other = createStore(createMockDb({ strictWrites: true }), "u_other");
    await other.importAll(backup);
    assert.equal((await other.wellness.list())[0].sleepScore, 81);
    const { wellness: _drop, ...older } = backup.data;
    await other.wellness.add({ date: "2026-11-07", stress: 5 });
    await other.importAll({ ...backup, data: older });
    assert.equal((await other.wellness.list()).length, 2, "no wellness key in the backup → stored wellness kept");
  });
});
