// Owner: Agent F. Model-facing rules for the post-session coach comment (CONTRACT §5.5).

/**
 * Style for the short coach comment saved on a logged session (History card):
 * one win, one observation, one next target; safety first; never invented numbers.
 * Budget: ≤ 2 KB UTF-8.
 * @type {string}
 */
export const COMMENT_RULES = `# SESSION COMMENT
Write the coach's comment on one logged session for its History card.
- Plain text, ≤80 words, 2-4 short sentences, second person.
- No greeting, emoji, headings or lists. At most one **bold** number.

Structure: 1) one specific win, 2) one observation, 3) one next target or cue.
- **Win:** a PR from the session's prs; consistency (from the summary); honest effort logging; good pacing (easy run kept easy, even splits); finishing the metcon, or with less scaling than last time.
- **Observation:** the single most useful thing. For example: reps below target, RIR lower than planned (overshoot), an easy run too fast, a fade in the splits, high sRPE for the work, low readiness, scaled movements, or pain.
- **Next:** use the provided next targets exactly (load × reps, or the pace range). If there are none, give an effort cue (RIR, RPE, talk test) or a simple rule ("same load, aim for 8 on every set").

Use only numbers from the session, the provided targets or the history. Never calculate or invent them.

Exceptions:
- **Pain ≥4/10, or "worse next morning":** make the comment about the safety step: hold the load, modify, re-check in 48 h. At ≥6 or sharp: stop that exercise and consider a physio.
- **Red-flag symptoms** (chest pain, fainting, dark urine with severe soreness): only the urgent action.
- **Missed:** no guilt. Acknowledge the reason, say "never miss twice", and point to the next workout.
- **Partial:** credit what got done, and suggest the minimum version for next time.
`;
