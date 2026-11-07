// Post-session coach comment prompt (owner: Agent B).

import { clip, compactJson, fmtNum, formatSessionCompact, isPlainObject } from "./util.js";

/** First line of the comment prompt (also lets sample-mock.js recognise it). */
export const COMMENT_PROMPT_MARKER = "[Personal Trainer · session comment]";
/** Hard cap on the saved comment. */
export const COMMENT_MAX_WORDS = 80;

/**
 * Cut text to at most `maxWords` words, ending on a sentence end when one is close, else with "…".
 * @param {string} text
 * @param {number} [maxWords]
 * @returns {string}
 */
export function clampWords(text, maxWords = COMMENT_MAX_WORDS) {
  const words = String(text ?? "").trim().split(/\s+/).filter(Boolean);
  if (words.length <= maxWords) return words.join(" ");
  const cut = words.slice(0, maxWords).join(" ");
  const lastStop = Math.max(cut.lastIndexOf(". "), cut.lastIndexOf("! "), cut.lastIndexOf("? "));
  if (lastStop > cut.length * 0.6) return cut.slice(0, lastStop + 1);
  return cut.replace(/[,;:\s]+$/, "") + "…";
}

/**
 * Build the comment prompt for one logged session.
 * @param {object} d
 * @param {string} d.rules knowledge.COMMENT_RULES
 * @param {object} d.session
 * @param {object} [d.profile]
 * @param {object} [d.plannedWorkout] the plan workout it matched, if any
 * @param {Array<{ exerciseId: string, bestE1rm?: number, flag?: string|null, lastDate?: string }>} [d.exerciseStats]
 * @param {Array<{ exerciseId: string, loadKg: number|null, reps?: number|string, note?: string }>} [d.nextTargets]
 * @param {object[]} [d.previousSessions] a few earlier sessions, newest first
 * @returns {string}
 */
export function buildCommentPrompt(d) {
  const goals = isPlainObject(d.profile?.goals) ? d.profile.goals : {};
  const stats = (Array.isArray(d.exerciseStats) ? d.exerciseStats : []).filter(isPlainObject)
    .map((s) => `- ${s.exerciseId}: best e1RM ${s.bestE1rm ? `${fmtNum(s.bestE1rm)} kg` : "n/a"}${s.flag ? `, flag ${s.flag}` : ""}`).join("\n");
  const targets = (Array.isArray(d.nextTargets) ? d.nextTargets : []).filter(isPlainObject)
    .map((t) => `- ${t.exerciseId}: ${t.loadKg !== null && t.loadKg !== undefined ? `${fmtNum(t.loadKg)} kg` : "no load"}${t.reps ? ` × ${t.reps}` : ""}${t.note ? ` (${clip(t.note, 80)})` : ""}`).join("\n");
  const prev = (Array.isArray(d.previousSessions) ? d.previousSessions : []).slice(0, 3)
    .map((s) => formatSessionCompact(s, { notesChars: 60, withId: false })).join("\n");
  const rules = String(d.rules ?? "").trim() ||
    "Start with one specific win, add one useful observation, end with the next target. Plain, warm, direct. If pain ≥ 4/10 or a red flag appears, put that first.";
  return [
    COMMENT_PROMPT_MARKER,
    "You are the owner's personal coach. Write a short comment on the session below for their training log.",
    `Rules: ${rules}`,
    `Length: at most ${COMMENT_MAX_WORDS} words, one paragraph, plain text (no lists, no headings). Use only the numbers given; never compute new ones.`,
    "",
    `Goals: ${clip(goals.primary || "not set", 120)}${goals.modalities ? ` · modalities ${compactJson(goals.modalities)}` : ""}`,
    "",
    "Session:",
    formatSessionCompact(d.session, { notesChars: 300, withId: false }),
    d.plannedWorkout ? `\nPlanned workout: ${clip(d.plannedWorkout.title, 60)} (${d.plannedWorkout.id})` : "",
    stats ? `\nExercise stats (computed by the app):\n${stats}` : "",
    targets ? `\nNext targets (computed by the app):\n${targets}` : "",
    prev ? `\nEarlier sessions (newest first):\n${prev}` : "",
  ].filter((x) => x !== "").join("\n");
}
