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

/** Prefix of an app event (ChatMessage role "event", e.g. "Plan approved") when it is shown to Claude. */
export const EVENT_PREFIX = "[App event]";
/** Appended to an owner message whose reply failed with nothing kept, so Claude knows it went unanswered. */
export const UNANSWERED_NOTE = "[App note: this message got no reply because of an app error.]";
/** Last line of the instructions turn; marks where the conversation starts if turns get merged. */
export const INSTRUCTIONS_END = "# End of instructions and app data. The conversation follows.";

/**
 * True for the `/clear` composer command (handled by the UI, never sent to Claude).
 * @param {unknown} text
 * @returns {boolean}
 */
export function isClearCommand(text) {
  return /^\/clear\s*$/i.test(String(text ?? "").trim());
}

/** Mode lines, also read by sample-mock.js to pick a script. */
export const MODE_LINE = Object.freeze({
  chat: "Mode: chat",
  onboarding: "Mode: onboarding",
  review: "Mode: post-workout review",
});

/** Used only when knowledge.REVIEW_RULES is empty. */
export const FALLBACK_REVIEW_RULES = [
  "The owner just logged a planned workout. In ≤120 words: one specific win; for each exercise they tagged easy/fine/hard, what it means for next time (quote the app's next targets);",
  "then whether the rest of this week's workouts need changes. Make only small, justified changes with update_plan_workout (never to done workouts) and explain each in one line; otherwise say the week stays as planned.",
].join("\n");

/** The user turn that starts a post-workout review (the owner's "Mark as done" tap; nothing they typed). */
export const REVIEW_START_TURN =
  "[App event] The owner just marked this workout done from the Plan tab. Review it now: the win, what each tagged exercise means for next time, " +
  "and whether the remaining workouts this week need changes (make them with update_plan_workout if so). Keep it short.";

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
 * @param {{ mode: "chat"|"onboarding"|"review", toolNames?: string[] }} opts
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
  if (mode === "review") {
    lines.push("This is an automatic post-workout review the app started when the owner saved the workout. Your reply appears in the Coach chat.");
    lines.push(toolNames.length
      ? `Tools you can call: ${toolNames.join(", ")}. update_plan_workout changes one remaining workout per call; each change is saved at once and shown to the owner with Undo. Never change done workouts.`
      : "Tools are unavailable in this view: suggest changes in words only and say the owner can ask you in chat to apply them.");
    return lines.join("\n");
  }
  if (toolNames.length) {
    lines.push(`Tools you can call: ${toolNames.join(", ")}. Call them when they help; results are compact. Writes are saved immediately and the owner can undo them from the chat.`);
    if (mode === "onboarding") {
      lines.push("Save each answered round with update_profile before asking the next round. When the intake is complete, call update_profile with {\"onboarded\": true}, then request_plan for the first plan if that tool is listed, and tell the owner to tap Generate plan.");
    } else {
      lines.push("When the owner reports a workout, call log_session (one call per session) and then reply with a short comment using the returned PRs and next targets. Do not log the same session twice: earlier assistant turns note what was already saved.");
      if (toolNames.includes("update_plan_workout")) lines.push("Small changes to remaining workouts of this week's agreed plan (after feedback, pain or low readiness) go through update_plan_workout; done workouts are locked.");
      if (toolNames.includes("log_wellness")) lines.push("When the owner types readiness metrics (training readiness, sleep score, HRV, body battery, resting HR, stress), save them with log_wellness.");
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
 * @param {{ mode: "chat"|"onboarding"|"review", rules: string, snapshot: string, toolNames?: string[], maxBytes?: number }} opts
 * @returns {string}
 */
export function buildInstructionsTurn({ mode, rules, snapshot, toolNames = [], maxBytes = CHAT_BUDGETS.instructionsBytes }) {
  const preamble = buildAppPreamble({ mode, toolNames });
  const fallback = mode === "onboarding" ? FALLBACK_ONBOARDING_RULES : mode === "review" ? FALLBACK_REVIEW_RULES : FALLBACK_CHAT_RULES;
  const ruleText = String(rules ?? "").trim() || fallback;
  const head = `${preamble}\n\n# Coaching rules\n${ruleText}\n\n# App data (current)\n`;
  const tail = `\n\n${INSTRUCTIONS_END}`;
  const headCut = truncateBytes(head, Math.floor(maxBytes * 0.75));
  const room = maxBytes - utf8Bytes(headCut) - utf8Bytes(tail);
  return headCut + truncateBytes(String(snapshot ?? "").trim() || "(no data yet)", Math.max(0, room)) + tail;
}

function actionsNote(actions) {
  const list = Array.isArray(actions) ? actions.filter(isPlainObject) : [];
  if (!list.length) return "";
  return "[saved by the app: " + list.map((a) => `${a.type}${a.label ? ` "${clip(a.label, 60)}"` : ""}${a.ref ? ` ref=${a.ref}` : ""}`).join("; ") + "]";
}

/** A stored reply that failed (it carries an error code). */
const isFailedReply = (m) => m?.role === "assistant" && typeof m.error === "string" && m.error.length > 0;

/**
 * Convert stored ChatMessages (oldest → newest) into sample turns for the history window:
 * the last `maxMessages`, then oldest dropped until ≤ maxBytes. Never returns empty content or another role.
 * - failed replies are never replayed as text; if their tools saved something, only that note is kept
 *   (so a retry doesn't double-log); an owner message left unanswered by a failure is marked with UNANSWERED_NOTE;
 * - "event" lines (e.g. "Plan approved") become user-side notes "[App event] …";
 * - `/clear` commands and messages of unknown roles are dropped.
 * Consecutive same-role turns are left for normalizeTurns() to merge.
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
  let lastUser = null; // the most recent owner turn not yet answered
  for (const m of list) {
    const text = typeof m.text === "string" ? m.text.trim() : "";
    if (m.role === "user") {
      if (!text || isClearCommand(text)) continue;
      lastUser = { role: "user", content: truncateBytes(text, messageBytes) };
      turns.push(lastUser);
    } else if (m.role === "assistant") {
      const note = actionsNote(m.actions);
      if (isFailedReply(m)) {
        if (note) {
          turns.push({ role: "assistant", content: `(the reply failed; ${note.slice(1, -1)})` });
          lastUser = null;
        } else if (lastUser && !lastUser.content.endsWith(UNANSWERED_NOTE)) {
          lastUser.content = `${truncateBytes(lastUser.content, messageBytes - utf8Bytes(UNANSWERED_NOTE) - 1)}\n${UNANSWERED_NOTE}`;
        }
        continue;
      }
      const content = [text ? truncateBytes(text, messageBytes - utf8Bytes(note) - 2) : "", note].filter(Boolean).join("\n");
      if (content) {
        turns.push({ role: "assistant", content });
        lastUser = null;
      }
    } else if (m.role === "event") {
      if (text) turns.push({ role: "user", content: `${EVENT_PREFIX} ${clip(text, 300)}` });
    }
  }
  let total = turns.reduce((n, t) => n + utf8Bytes(t.content), 0);
  while (turns.length && total > maxBytes) total -= utf8Bytes(turns.shift().content);
  return turns;
}

/**
 * Make a turn list valid for sample.d.ts: only user/assistant roles (anything else becomes a user-side note),
 * no empty content, consecutive same-role turns merged (blank line between), starting and ending on a user turn
 * (leading assistant turns are dropped; a trailing assistant turn is dropped). Returns [] when nothing is left.
 * The one exception to merging: the leading instructions turn (it ends with INSTRUCTIONS_END) stays its own
 * turn, as sample.d.ts documents ("a leading instructions turn before the viewer's first message").
 * @param {Array<{ role: string, content: string }>} turns
 * @param {{ keepFirst?: boolean }} [opts] keepFirst: never merge into the first turn (the instructions turn)
 * @returns {{ role: "user"|"assistant", content: string }[]}
 */
export function normalizeTurns(turns, { keepFirst = false } = {}) {
  const out = [];
  for (const t of Array.isArray(turns) ? turns : []) {
    if (!isPlainObject(t)) continue;
    const content = typeof t.content === "string" ? t.content.trim() : "";
    if (!content) continue;
    const role = t.role === "assistant" ? "assistant" : "user";
    const body = t.role === "user" || t.role === "assistant" ? content : `${EVENT_PREFIX} ${content}`;
    const prev = out[out.length - 1];
    const sealed = prev && ((keepFirst && out.length === 1) || prev.content.endsWith(INSTRUCTIONS_END));
    if (prev && prev.role === role && !sealed) prev.content = `${prev.content}\n\n${body}`;
    else out.push({ role, content: body });
  }
  while (out.length && out[0].role !== "user") out.shift();
  while (out.length && out[out.length - 1].role !== "user") out.pop();
  return out;
}

/**
 * Full turn array for a chat call: [instructions, ...history, newUserMessage], normalized (see normalizeTurns).
 * The history's trailing copy of the same owner text (a manual retry) and failed replies after it are dropped.
 * @param {{ instructions: string, history: object[], userText: string, budgets?: Partial<typeof CHAT_BUDGETS> }} opts
 * @returns {{ role: "user"|"assistant", content: string }[]}
 */
export function buildChatTurns({ instructions, history, userText, budgets = {} }) {
  const b = { ...CHAT_BUDGETS, ...budgets };
  const user = truncateBytes(String(userText ?? "").trim() || "(empty message)", b.userMessageBytes);
  const msgs = (Array.isArray(history) ? history : []).filter(isPlainObject);
  let end = msgs.length;
  while (end > 0 && isFailedReply(msgs[end - 1]) && !actionsNote(msgs[end - 1].actions)) end -= 1;
  if (end > 0 && msgs[end - 1].role === "user" && String(msgs[end - 1].text ?? "").trim() === String(userText ?? "").trim()) {
    msgs.splice(end - 1, msgs.length - end + 1);
  }
  const hist = historyToTurns(msgs, { maxMessages: b.historyMessages, maxBytes: b.historyBytes, messageBytes: b.messageBytes });
  return normalizeTurns([
    { role: "user", content: truncateBytes(String(instructions ?? "").trim() || "(no instructions)", b.instructionsBytes) },
    ...hist,
    { role: "user", content: user },
  ], { keepFirst: true });
}

/** The user turn that opens onboarding (the owner tapped Start; nothing they typed). */
export const ONBOARDING_START_TURN =
  "[App event] The owner just tapped Start on the welcome screen. Greet them in one or two sentences, say how the intake works " +
  "(a few short rounds, about 5 minutes, answers saved as you go, everything editable later), then ask the first round of questions.";
