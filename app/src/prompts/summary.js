// Rolling chat summary (CoachMemory.summary) prompt and marker helpers (owner: Agent B).

import { clip, isPlainObject, truncateBytes } from "./util.js";

/** First line of the summary prompt (also lets sample-mock.js recognise it). */
export const SUMMARY_PROMPT_MARKER = "[Personal Trainer · memory summary]";
/** CoachMemory.summary is ≤ 2,000 chars; the text part is kept below this to leave room for the marker. */
export const SUMMARY_MAX_CHARS = 1900;
/** Messages newer than the last summary before a new summary is due (CONTRACT §5.4). */
export const SUMMARY_STALE_AFTER = 40;

const MARKER_RE = /^\[through ([^\]\n]+)\]\n?/;

/**
 * Split a stored summary into its "summarized through" timestamp and the text.
 * The app stores `[through <ts>]` as the first line so it knows which messages are already summarized
 * (CoachMemory has no separate field for it).
 * @param {string} stored
 * @returns {{ throughTs: string|null, text: string }}
 */
export function parseSummary(stored) {
  const s = String(stored ?? "");
  const m = s.match(MARKER_RE);
  return m ? { throughTs: m[1].trim(), text: s.slice(m[0].length).trim() } : { throughTs: null, text: s.trim() };
}

/**
 * Compose the stored summary: marker line + text (text cut to SUMMARY_MAX_CHARS).
 * @param {string} text
 * @param {string|null} throughTs
 * @returns {string}
 */
export function composeSummary(text, throughTs) {
  const body = clip(String(text ?? "").trim(), SUMMARY_MAX_CHARS);
  return throughTs ? `[through ${throughTs}]\n${body}` : body;
}

/**
 * Build the quick-tier summarization prompt.
 * @param {{ previousSummary: string, messages: object[], today: string, maxBytes?: number }} d
 * @returns {string}
 */
export function buildSummaryPrompt({ previousSummary, messages, today, maxBytes = 40000 }) {
  const transcript = (Array.isArray(messages) ? messages : []).filter(isPlainObject)
    .map((m) => {
      const who = m.role === "assistant" ? "Coach" : m.role === "event" ? "App" : "Owner";
      const acts = Array.isArray(m.actions) && m.actions.length ? ` [saved: ${m.actions.map((a) => a?.label || a?.type).join("; ")}]` : "";
      const day = typeof m.ts === "string" ? m.ts.slice(0, 10) + " " : "";
      return `${day}${who}: ${clip(m.text ?? "", 600)}${acts}`;
    })
    .filter((line) => line.trim())
    .join("\n");
  return [
    SUMMARY_PROMPT_MARKER,
    `Today is ${today}. You maintain the long-term memory of a personal coach. Update the summary below with the older chat excerpt that follows, so the coach can drop that excerpt.`,
    `Keep durable facts: goals and their changes, injuries and pain trends, preferences and dislikes, decisions agreed, schedule or equipment changes, open questions and promises. Drop small talk and anything already stored as workout numbers. Note dates for changes.`,
    `Reply with ONLY the updated summary as plain text, at most ${SUMMARY_MAX_CHARS} characters, terse bullet-style lines starting with "- ".`,
    "",
    "Current summary:",
    previousSummary ? clip(previousSummary, 2000) : "(empty)",
    "",
    "Older chat excerpt (oldest first):",
    truncateBytes(transcript, maxBytes),
  ].join("\n");
}
