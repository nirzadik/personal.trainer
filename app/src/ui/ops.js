// Owner: Agent D. Store operations shared by several views (keeps rotation consistent with the log).

import { safe } from "./components.js";

/**
 * Remove a logged session and, if it advanced the current rotation, take its workout back out
 * of `state.rotation.done`. Resolves `{ undo }` restoring both.
 * @param {any} ctx app context
 * @param {string} sessionId
 * @param {{ event?: boolean }} [opts] event: append a chat "event" line
 * @returns {Promise<{ session: any, undo: () => Promise<void> }>}
 */
export async function removeSession(ctx, sessionId, { event = false } = {}) {
  const { store } = ctx;
  const session = ctx.data.sessions.find((x) => x.id === sessionId) || (await safe(() => store.sessions.get(sessionId), null));
  const res = await store.sessions.remove(sessionId);
  const rotUndo = await unmarkRotation(ctx, session);
  if (event) {
    await Promise.resolve(safe(() => store.chat.append({ role: "event", text: `Removed ${session?.title || "a logged workout"}`, actions: [], error: null }), null)).catch(() => {});
  }
  return {
    session,
    undo: async () => {
      await res?.undo?.();
      await rotUndo?.();
    },
  };
}

/**
 * Take a removed session's workout back out of the current rotation (core.unmarkWorkoutDone), when it counted there.
 * Workouts logged in between stay done. Resolves an undo that marks it done again (core.markWorkoutDone), or null
 * when the rotation did not change.
 * @param {any} ctx
 * @param {{ workoutId?: string, planId?: string }|null} session
 * @returns {Promise<null | (() => Promise<void>)>}
 */
export async function unmarkRotation(ctx, session) {
  const { store, core } = ctx;
  const workoutId = session?.workoutId;
  const rot = ctx.data.state?.rotation;
  if (!workoutId || !rot?.planId || (session.planId && session.planId !== rot.planId) || !rot.done?.includes(workoutId)) return null;
  const plan = ctx.data.plans.find((p) => p?.id === rot.planId) || { id: rot.planId, workouts: [] };
  const rotation = safe(() => core.unmarkWorkoutDone(ctx.data.state, plan, workoutId), null)
    || { ...rot, done: rot.done.filter((id) => id !== workoutId) };
  await store.state.update({ rotation });
  return async () => {
    const st = ctx.data.state;
    if (st?.rotation?.planId !== plan.id) return; // a newer plan started meanwhile: nothing to put back
    const again = safe(() => core.markWorkoutDone(st, plan, workoutId), null);
    if (again && again.done.includes(workoutId)) await store.state.update({ rotation: again });
  };
}

/**
 * Advance the rotation for a manually logged session that matches a workout of the agreed plan.
 * @param {any} ctx
 * @param {string} planId
 * @param {string} workoutId
 * @returns {Promise<any>} the store result (with undo) or null
 */
export async function markDone(ctx, planId, workoutId) {
  const { store, core } = ctx;
  const plan = ctx.data.plans.find((p) => p.id === planId);
  const state = ctx.data.state;
  if (!plan || !workoutId || state?.rotation?.planId !== planId) return null;
  let rotation = safe(() => core.markWorkoutDone(state, plan, workoutId), null);
  if (!rotation) {
    const done = state.rotation.done.includes(workoutId) ? state.rotation.done : [...state.rotation.done, workoutId];
    rotation = { ...state.rotation, done };
  }
  if (rotation?.rotation) rotation = rotation.rotation;
  return store.state.update({ rotation });
}

/**
 * Exercise display name from an id via the catalog, falling back to the stored name or the id.
 * @param {any} catalog
 * @param {string} id
 * @param {string} [fallback]
 * @returns {string}
 */
export function exerciseName(catalog, id, fallback) {
  return fallback || safe(() => catalog.getExercise(id)?.name, "") || prettifyId(id);
}

/**
 * "back_squat" → "Back squat".
 * @param {string} id
 * @returns {string}
 */
export function prettifyId(id) {
  const s = String(id || "").replace(/[_-]+/g, " ").trim();
  return s ? s[0].toUpperCase() + s.slice(1) : "";
}

/**
 * Equipment ids available at a location (or the default location) as a Set.
 * @param {any} ctx
 * @param {string} [locationId]
 * @returns {Set<string>}
 */
export function equipmentSet(ctx, locationId) {
  const profile = ctx.data.profile;
  const loc = locationId || profile?.equipment?.defaultLocationId;
  const viaCore = safe(() => ctx.core.availableEquipment(profile, loc), null);
  if (viaCore instanceof Set) return viaCore;
  if (Array.isArray(viaCore)) return new Set(viaCore);
  const location = (profile?.equipment?.locations || []).find((l) => l.id === loc) || profile?.equipment?.locations?.[0];
  return new Set(location?.items || []);
}
