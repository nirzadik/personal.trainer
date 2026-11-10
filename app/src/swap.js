// Owner: Agent S. See CONTRACT-v2.md ("src/swap.js").
//
// Pure helpers behind the Plan tab's per-exercise Swap control: which exercises can stand in for a
// planned item (ranked, filtered by the owner's equipment, dislikes removed, current injuries
// ranked last), and a plan with one item swapped. No DOM, no platform calls; `core` and `catalog`
// are passed in so this module stays decoupled from their internals (the one direct import is core's
// injury map, so the two can never drift apart).

import { injuryTags as coreInjuryTags } from "./core.js";

/** Current injuries as [{ area (lower-cased), tags }]: core's injury → jointStress map, used only to rank options. */
const injuryTags = (profile) => coreInjuryTags(profile).map((i) => ({ area: String(i.area || "").trim().toLowerCase(), tags: i.tags }));

/** Block kinds whose items can be swapped, in the order their items are indexed. */
const SWAPPABLE_BLOCKS = new Set(["strength", "conditioning"]);

const UNIT_WORD = { calories: "calories", distance: "distance", time: "time", reps: "reps", load_reps: "reps" };

function swapError(message) {
  const e = new Error(message);
  e.code = "invalid_argument";
  return e;
}

const jsonClone = (v) => (v === undefined ? undefined : JSON.parse(JSON.stringify(v)));

/**
 * The swappable items of a workout in block order (strength and conditioning blocks only). The
 * position in this list is the flat `itemIndex` that applySwap takes.
 * @param {object} workout  Workout
 * @returns {Array<{ item: object, kind: "strength"|"conditioning", blockIndex: number, indexInBlock: number, itemIndex: number }>}
 */
export function swappableItems(workout) {
  const out = [];
  (workout?.blocks || []).forEach((block, blockIndex) => {
    if (!block || !SWAPPABLE_BLOCKS.has(block.kind)) return;
    (block.items || []).forEach((item, indexInBlock) => {
      out.push({ item, kind: block.kind, blockIndex, indexInBlock, itemIndex: out.length });
    });
  });
  return out;
}


/** Disliked exercises: ids resolved through the catalog, plus free-text fragments matched against names. */
function dislikes(profile, catalog) {
  const ids = new Set();
  const texts = [];
  for (const d of profile?.preferences?.dislikes || []) {
    if (typeof d !== "string" || !d.trim()) continue;
    const ex = catalog.getExercise(d) || catalog.findExercise?.(d);
    if (ex) ids.add(ex.id);
    else texts.push(d.trim().toLowerCase());
  }
  return (ex) => ids.has(ex.id) || texts.some((t) => ex.name.toLowerCase().includes(t));
}

function equipmentFor(profile, locationId, core, catalog) {
  const viaCore = typeof core?.availableEquipment === "function" ? core.availableEquipment(profile, locationId) : null;
  if (viaCore instanceof Set) return viaCore;
  if (Array.isArray(viaCore)) return new Set(viaCore);
  const locs = profile?.equipment?.locations || [];
  const loc = locs.find((l) => l?.id === (locationId || profile?.equipment?.defaultLocationId)) || locs[0];
  return catalog.expandEquipment ? catalog.expandEquipment(loc?.items || []) : new Set(loc?.items || []);
}

function equipmentOk(ex, eq, catalog) {
  if (typeof catalog.equipmentCheck === "function") return catalog.equipmentCheck(ex, eq).ok;
  const all = ex.equipment?.all || [];
  const any = ex.equipment?.any || [];
  return all.every((id) => eq.has(id)) && (!any.length || any.some((id) => eq.has(id)));
}

/** Find the workout (and block kind) that holds `item`, by id or by reference. */
function locate(plan, item, workoutId) {
  const workouts = plan?.workouts || [];
  const byId = workoutId ? workouts.find((w) => w?.id === workoutId) : null;
  for (const w of byId ? [byId] : workouts) {
    const hit = swappableItems(w).find((x) => x.item === item);
    if (hit) return { workout: w, kind: hit.kind };
  }
  return { workout: byId || null, kind: null };
}

/**
 * Exercises that can replace a planned item, best first. Ranking: the item's own `alternatives`,
 * then `core.findSubstitutes`, then the rest of the catalog with the same movement pattern. Every
 * option is doable with the owner's equipment (at the workout's location), not disliked, not the
 * item itself or another exercise already in that workout, and in the same modality (strength items
 * get strength exercises; conditioning items get conditioning movements, and cardio machines too when
 * the planned movement is one). Options that
 * load a current injury (catalog jointStress) go last, with a "careful" reason.
 *
 * @param {object} item  StrengthItem or CondItem from the plan
 * @param {{ profile?: object, plan?: object, core: object, catalog: object, limit?: number,
 *           workoutId?: string, locationId?: string, kind?: "strength"|"conditioning" }} opts
 *   workoutId / locationId / kind are optional hints; by default they come from the workout in `plan`
 *   that holds `item` (by reference), else the default location and the item's shape.
 * @returns {Array<{ exerciseId: string, name: string, reason: string, equipmentOk: boolean, caution: string|null }>}
 *   reason e.g. "Same pattern · your equipment"; caution = the injured area an option loads, else null
 */
export function swapOptions(item, { profile = null, plan = null, core, catalog, limit = 8, workoutId = null, locationId, kind } = {}) {
  if (!item || !catalog?.getExercise) return [];
  const found = locate(plan, item, workoutId);
  const itemKind = kind || found.kind || (item.sets != null || item.targetRir !== undefined ? "strength" : "conditioning");
  const base = catalog.getExercise(item.exerciseId) || (item.name ? catalog.findExercise?.(item.name) : null) || null;
  const eq = equipmentFor(profile, locationId ?? found.workout?.locationId, core, catalog);
  const disliked = dislikes(profile, catalog);
  const injuries = injuryTags(profile);
  // Strength items get strength exercises; conditioning items get conditioning movements (plus cardio
  // machines when the planned movement is one, e.g. a 500 m row).
  const mods = itemKind === "strength" ? ["strength"] : !base || base.modality.includes("cardio") ? ["conditioning", "cardio"] : ["conditioning"];

  const exclude = new Set([item.exerciseId, base?.id].filter(Boolean));
  for (const x of swappableItems(found.workout)) if (x.item !== item && x.item?.exerciseId) exclude.add(x.item.exerciseId);

  const seen = new Set();
  const picks = [];
  const consider = (id, tier) => {
    if (picks.length >= 200 || typeof id !== "string" || seen.has(id) || exclude.has(id)) return;
    const ex = catalog.getExercise(id);
    if (!ex) return;
    seen.add(id);
    if (!(ex.modality || []).some((m) => mods.includes(m))) return;
    if (disliked(ex) || !equipmentOk(ex, eq, catalog)) return;
    const hurt = injuries.find((inj) => (ex.jointStress || []).some((t) => inj.tags.has(t)));
    picks.push({ ex, tier, caution: hurt ? hurt.area : null });
  };

  for (const id of item.alternatives || []) consider(id, 0);
  if (base) {
    let subs = [];
    try { subs = core?.findSubstitutes ? core.findSubstitutes(base.id, eq, profile, { limit: 40 }) || [] : []; } catch { subs = []; }
    for (const id of subs) consider(id, 1);
    const shared = (ex) => ex.primary.filter((m) => base.primary.includes(m)).length;
    const samePattern = (catalog.EXERCISES || [])
      .filter((ex) => ex.pattern === base.pattern)
      .map((ex, i) => ({ ex, i }))
      .sort((a, b) =>
        (itemKind === "conditioning" ? (a.ex.unit === base.unit ? 0 : 1) - (b.ex.unit === base.unit ? 0 : 1) : 0)
        || shared(b.ex) - shared(a.ex)
        || Math.abs(a.ex.skill - base.skill) - Math.abs(b.ex.skill - base.skill)
        || a.i - b.i);
    for (const { ex } of samePattern) consider(ex.id, 2);
  } else if (item.name && catalog.searchExercises) {
    for (const ex of catalog.searchExercises(item.name, { equipment: eq, modality: mods, limit: 20 })) consider(ex.id, 2);
  }

  // Stable: injury-safe options first, then by tier, then discovery order.
  const ranked = picks.map((p, i) => ({ ...p, i })).sort((a, b) => (a.caution ? 1 : 0) - (b.caution ? 1 : 0) || a.tier - b.tier || a.i - b.i);
  return ranked.slice(0, Math.max(0, limit)).map(({ ex, tier, caution }) => {
    const why = tier === 0 ? "Coach's alternative"
      : base?.alternatives?.includes(ex.id) ? "Common swap"
      : base && ex.pattern === base.pattern ? "Same pattern"
      : base && ex.primary.some((m) => base.primary.includes(m)) ? "Same muscles"
      : "Similar";
    const parts = [why];
    const noKit = !(ex.equipment?.all?.length) && !(ex.equipment?.any?.length);
    parts.push(noKit ? "no equipment" : "your equipment");
    if (itemKind === "conditioning" && base && ex.unit !== base.unit && UNIT_WORD[ex.unit] !== UNIT_WORD[base.unit]) parts.push(`counts ${UNIT_WORD[ex.unit] || ex.unit}`);
    if (caution) parts.push(`careful: ${caution}`);
    return { exerciseId: ex.id, name: ex.name, reason: parts.join(" · "), equipmentOk: true, caution };
  });
}

/**
 * A new plan with one item's exercise replaced. Sets, reps, RIR, rest, tempo, notes and the
 * conditioning amounts stay; `loadKg` becomes null (recalibrate on the new exercise); the old id goes
 * first in `alternatives` (so it is one tap to swap back). `swappedFrom` records the originally
 * planned exercise and is removed again when the item is swapped back to it. The input plan is not
 * modified.
 * @param {object} plan  Plan
 * @param {string} workoutId
 * @param {number} itemIndex  flat index over the workout's strength and conditioning items, in block order (see swappableItems)
 * @param {string} newExerciseId  catalog id
 * @param {{ catalog: object }} deps
 * @returns {object} Plan
 * @throws {Error} code "invalid_argument" for an unknown workout, index or exercise
 */
export function applySwap(plan, workoutId, itemIndex, newExerciseId, { catalog } = {}) {
  if (!plan || !Array.isArray(plan.workouts)) throw swapError("plan has no workouts");
  const ex = catalog?.getExercise?.(newExerciseId);
  if (!ex) throw swapError(`Unknown exercise "${newExerciseId}"`);
  const next = jsonClone(plan);
  const workout = next.workouts.find((w) => w?.id === workoutId);
  if (!workout) throw swapError(`No workout "${workoutId}" in this plan`);
  const slot = swappableItems(workout)[itemIndex];
  if (!Number.isInteger(itemIndex) || !slot) throw swapError(`No swappable item ${itemIndex} in workout "${workoutId}"`);
  const old = slot.item || {};
  if (old.exerciseId === ex.id) return next;
  const oldId = typeof old.exerciseId === "string" && old.exerciseId ? old.exerciseId : null;
  const alternatives = [oldId, ...(Array.isArray(old.alternatives) ? old.alternatives : [])]
    .filter((id, i, arr) => typeof id === "string" && id && id !== ex.id && arr.indexOf(id) === i);
  const replaced = { ...old, exerciseId: ex.id, name: ex.name, loadKg: null, alternatives };
  const original = old.swappedFrom || oldId;
  if (original && original !== ex.id) replaced.swappedFrom = original;
  else delete replaced.swappedFrom;
  workout.blocks[slot.blockIndex].items[slot.indexInBlock] = replaced;
  return next;
}
