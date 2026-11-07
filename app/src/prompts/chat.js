// Chat turn construction: instructions turn, history window, onboarding starter (owner: Agent B).
// Every call is memoryless (sample.d.ts): the turn array starts with the instructions (a user turn)
// and ends with the owner's new message (a user turn).

import { clip, isPlainObject, truncateBytes, utf8Bytes } from "./util.js";

/** Budgets from CONTRACT §5.4 (bytes, UTF-8). */
export const CHAT_BUDGETS = Object.freeze({
  instructionsBytes: 40 * 1024,
  historyMessages: 24,
  historyBytes: 30 * 1024,
  messageBytes: 6000,      // any single history message
  userMessageBytes: 16000, // the new message
});

/** Mode lines, also read by sample-mock.js to pick a script. */
export const MODE_LINE = Object.freeze({
  chat: "Mode: chat",
  onboarding: "Mode: onboarding",
});

/** Used only when knowledge.CHAT_RULES is empty (e.g. skeleton during development). */
export const FALLBACK_CHAT_RULES = [
  "You are a warm, direct, evidence-based personal coach for gym strength, running and HIIT/conditioning.",
  "Safety first: chest pain, fainting, severe shortness of breath, dark urine after hard training or sharp/worsening pain → stop training advice, tell them what to do (stop, seek medical care) and nothing else.",
  "Pain traffic light: 0-3/10 during and settling by next morning = OK; 4-5 = modify; ≥ 6 or worsening = stop that movement and refer if it persists.",
  "Co-design: offer choices, explain briefly, respect the owner's decisions. Use only exercises their equipment allows.",
  "Log what the owner reports with the tools; never invent numbers; quote app-computed targets as given.",
].join("\n");

/** Used only when knowledge.ONBOARDING_RULES is empty. */
export const FALLBACK_ONBOARDING_RULES = [
  "Run a short, friendly intake in rounds, one round per message, saving each round with update_profile before moving on:",
  "1) Health screening (PAR-Q+ style yes/no: heart condition, chest pain, dizziness/fainting, chronic condition, medications, bone/joint problem, told to train only under supervision; pregnancy if relevant). Any yes → advise medical clearance and set outcome accordingly.",
  "2) Goals across gym strength, running and HIIT/conditioning (primary goal, why, what success in 12 weeks looks like, any event or race).",
  "3) Schedule: days per week, minutes per session, preferred days.",
  "4) Equipment per location using EQUIPMENT ids (offer bundles: commercial gym, home gym, dumbbells only, bodyweight + running).",
  "5) Experience: training age, known lifts, weekly km and a recent race, conditioning experience; injuries; likes and dislikes.",
  "When all rounds are saved, summarise the profile in a few bullets, call update_profile with {\"onboarded\": true}, then request_plan {kind: \"generate\"} and tell them to tap Generate plan.",
].join("\n");

/**
 * App-level instructions that wrap the coaching rules: what the app is, how replies render,
 * how to use the tools. Kept short; the coaching content comes from knowledge/*.js.
 * @param {{ mode: "chat"|"onboarding", toolNames?: string[] }} opts
 * @returns {string}
 */
export function buildAppPreamble({ mode, toolNames = [] }) {
  const lines = [
    MODE_LINE[mode] ?? MODE_LINE.chat,
    "You are the coach inside the owner's Personal Trainer app (iPhone, Claude app). This turn holds your standing instructions and the app's current data; the owner's messages follow.",
    "The app has three tabs: Coach (this chat), History (logged workouts) and Plan (this week's workouts in rotation order: \"up next\" is the first workout not done; a missed day shifts nothing).",
    "Units: kg and km. Weeks start on Sunday.",
    "Write phone-sized replies: short paragraphs, bullet lists for workouts. Markdown subset only: **bold**, *italic*, - lists, 1. lists, ### headings, simple | tables |, `code`. No HTML, no links.",
    "Never do mental math: use the numbers in this context and in tool results (targets, e1RM, paces, km). If a number is missing, say so or ask.",
  ];
  if (toolNames.length) {
    lines.push(`Tools you can call: ${toolNames.join(", ")}. Call them when they help; results are compact. Writes are saved immediately and the owner can undo them from the chat.`);
    if (mode === "onboarding") {
      lines.push("Save each answered round with update_profile before asking the next round. When the intake is complete, call update_profile with {\"onboarded\": true}, then request_plan for the first plan if that tool is listed, and tell the owner to tap Generate plan.");
    } else {
      lines.push("When the owner reports a workout, call log_session (one call per session) and then reply with a short comment using the returned PRs and next targets. Do not log the same session twice: earlier assistant turns note what was already saved.");
      lines.push("Plans are written by a separate, more capable step: use request_plan, then tell the owner to tap Generate plan. Never write a whole week's plan in chat.");
    }
  } else {
    lines.push("Tools are unavailable in this view: you cannot save or look anything up. Say so if the owner asks you to log or change something, and suggest the History tab's Add workout form.");
  }
  return lines.join("\n");
}

/**
 * Build the leading instructions turn: app preamble + coaching rules + context snapshot, ≤ maxBytes.
 * The rules are never cut below the snapshot: the snapshot is trimmed first.
 * @param {{ mode: "chat"|"onboarding", rules: string, snapshot: string, toolNames?: string[], maxBytes?: number }} opts
 * @returns {string}
 */
export function buildInstructionsTurn({ mode, rules, snapshot, toolNames = [], maxBytes = CHAT_BUDGETS.instructionsBytes }) {
  const preamble = buildAppPreamble({ mode, toolNames });
  const fallback = mode === "onboarding" ? FALLBACK_ONBOARDING_RULES : FALLBACK_CHAT_RULES;
  const ruleText = String(rules ?? "").trim() || fallback;
  const head = `${preamble}\n\n# Coaching rules\n${ruleText}\n\n# App data (current)\n`;
  const headCut = truncateBytes(head, Math.floor(maxBytes * 0.75));
  const room = maxBytes - utf8Bytes(headCut);
  return headCut + truncateBytes(String(snapshot ?? ""), Math.max(0, room));
}

function actionsNote(actions) {
  const list = Array.isArray(actions) ? actions.filter(isPlainObject) : [];
  if (!list.length) return "";
  return "[saved by the app: " + list.map((a) => `${a.type}${a.label ? ` "${clip(a.label, 60)}"` : ""}${a.ref ? ` ref=${a.ref}` : ""}`).join("; ") + "]";
}

/**
 * Convert stored ChatMessages (oldest → newest) into sample turns for the history window:
 * the last `maxMessages`, then oldest dropped until ≤ maxBytes. Never returns empty content.
 * - assistant replies carry a short note of what their tools saved (so retries don't double-log);
 * - failed replies with no text and no actions are skipped;
 * - "event" lines (e.g. "Plan approved") become user turns marked as app events.
 * @param {object[]} messages
 * @param {{ maxMessages?: number, maxBytes?: number, messageBytes?: number }} [opts]
 * @returns {{ role: "user"|"assistant", content: string }[]}
 */
export function historyToTurns(messages, {
  maxMessages = CHAT_BUDGETS.historyMessages,
  maxBytes = CHAT_BUDGETS.historyBytes,
  messageBytes = CHAT_BUDGETS.messageBytes,
} = {}) {
  const list = (Array.isArray(messages) ? messages : []).filter(isPlainObject).slice(-maxMessages);
  const turns = [];
  for (const m of list) {
    const text = String(m.text ?? "").trim();
    if (m.role === "user") {
      if (text) turns.push({ role: "user", content: truncateBytes(text, messageBytes) });
    } else if (m.role === "assistant") {
      const note = actionsNote(m.actions);
      let body = text;
      if (m.error) body = text ? `${text}\n(reply interrupted: ${m.error})` : (note ? `(reply interrupted: ${m.error})` : "");
      const content = [body ? truncateBytes(body, messageBytes - utf8Bytes(note) - 2) : "", note].filter(Boolean).join("\n");
      if (content) turns.push({ role: "assistant", content });
    } else if (m.role === "event") {
      if (text) turns.push({ role: "user", content: `[app event] ${clip(text, 300)}` });
    }
  }
  let total = turns.reduce((n, t) => n + utf8Bytes(t.content), 0);
  while (turns.length && total > maxBytes) total -= utf8Bytes(turns.shift().content);
  return turns;
}

/**
 * Full turn array for a chat call: [instructions, ...history, newUserMessage].
 * Starts and ends with a user turn; a trailing history copy of the same user text (a manual retry) is dropped.
 * @param {{ instructions: string, history: object[], userText: string, budgets?: Partial<typeof CHAT_BUDGETS> }} opts
 * @returns {{ role: "user"|"assistant", content: string }[]}
 */
export function buildChatTurns({ instructions, history, userText, budgets = {} }) {
  const b = { ...CHAT_BUDGETS, ...budgets };
  const hist = historyToTurns(history, { maxMessages: b.historyMessages, maxBytes: b.historyBytes, messageBytes: b.messageBytes });
  const user = truncateBytes(String(userText ?? "").trim() || "(empty message)", b.userMessageBytes);
  const last = hist[hist.length - 1];
  if (last && last.role === "user" && last.content === user) hist.pop();
  return [
    { role: "user", content: truncateBytes(String(instructions ?? "").trim() || "(no instructions)", b.instructionsBytes) },
    ...hist,
    { role: "user", content: user },
  ];
}

/** The user turn that opens onboarding (the owner tapped Start; nothing they typed). */
export const ONBOARDING_START_TURN =
  "[app event] The owner just tapped Start on the welcome screen. Greet them in one or two sentences, say how the intake works " +
  "(a few short rounds, about 5 minutes, answers saved as you go, everything editable later), then ask the first round of questions.";
