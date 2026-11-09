# Personal Trainer App: Build Contract (v1)

This is the single source of truth for every agent building the app. If something here is ambiguous, pick the simplest reading that fits the goals, do it, and **say so in your final report**. Never edit a file you don't own (see §3). You may read any file.

---

## 1. What we are building

This is a personal fitness-coach app for one person, the owner. It runs on their iPhone inside the Claude app, as a **claude.ai Artifact**: one HTML page hosted on claude.ai. An AI coach (Claude, called from the page on the owner's own Claude Pro plan) plans and tracks **gym/strength, running, and HIIT/CrossFit-style conditioning** workouts. It only uses exercises the owner's equipment allows.

The app has three tabs:
1. **Coach** (home): a chat with the coach. This tab is used to ask for today's workout, report what was done ("did 100x5,5,4 squats, knee 3/10"), and change goals. First launch runs a **guided onboarding chat** covering screening, goals, schedule, **equipment** and experience.
2. **History**: every logged workout (strength sets, runs, metcons), with the coach's comments. It supports manual add, edit and delete.
3. **Plan**: the current week's workouts, in **rotation** order (see below). A **Generate next week** button asks the coach, on the most capable tier (Opus), to produce next week's plan. The new plan appears as a **draft** that the owner approves. Nothing is automated; every Claude call starts from a tap.

Decisions already made:
- Language: English UI.
- Units: kg (distance in km).
- Week starts on **Sunday**.
- **Rotation**: a plan is an ordered list of N workouts, normally N = days per week. "Up next" is the first workout not yet done. A missed day shifts nothing. Each logged session that matches a workout advances the rotation.
- Theme follows the iPhone setting by default, with a **toggle** for system, light or dark.
- Plan generation uses `modelTier: "complex"` (Opus). Chat uses `"default"`, and a setting can switch it to `"quick"` for speed.

Knowledge source: the evidence-based skill in `/.claude/skills/personal-trainer/` (SKILL.md + references) and the research in `/docs/research/`. Running and conditioning knowledge is being added by Agent F.

---

## 2. Runtime facts (read these, they shape everything)

The page runs inside Claude's sandboxed viewer and reaches the platform **only** through `window.claude.use(name)`. The authoritative type definitions are in `app/docs/runtime-types/*.d.ts`, and **you must read the ones for your area**.

- **`sample`** (`sample.d.ts`) calls Claude on the viewer's account.
  - **Every call is memoryless.** There is no system prompt. Standing instructions go in a leading `user` turn, and turns must start and end with `user`. The page re-sends context each call.
  - Max 256 KiB input text.
  - `options.tools`: page functions Claude may call. Each round is a separate paid request; keep tool results small, at most 32 KB and ideally under 4 KB. `execute` aborts after 150 s.
  - Calls with tools are never cached. Don't pass `cache` with `tools`. Pass `cache: false` for chat.
  - `sample.json()` returns parsed JSON.
  - `sample.limits()` reports `tools.maxCount` and `modelTiers`.
  - The first call per page load shows a consent dialog, so **only call on a user tap**. Never call from a loop or timer, and never auto-retry.
  - Timing: the default tier with tools takes 30-90 s; the complex tier can take 1-3 min. Show "Thinking…", elapsed time and a Stop button (`AbortController`, new per call).
  - Errors are one rejected `{code, message, text?}`. Branch on `code`.
- **`db`** (`db.d.ts`) is a Firestore-like document store that persists across republishes.
  - Documents have even path segments, collections odd.
  - A document is at most 256 KiB, with at most 25,000 docs per artifact.
  - No transactions; writes are last-writer-wins. One write at a time per document.
  - `onSnapshot` gives live updates. Subscribe once per query; at most 64 subscriptions.
- **`user`** (`user.d.ts`): `await user.id()` is the owner's opaque id. All data lives under the private subtree `data/users/<uid>/`.
- **`downloads`** (`downloads.d.ts`): `downloads.save({filename, data})` offers a file, used for the JSON backup.
- `claude.use(x)` resolves `null` when unavailable. That happens after up to 10 s in a non-Claude host such as local dev, where `window.claude` is simply undefined. **Design for absence.**

Declared capabilities at publish:
```js
{ sample: {}, db: { rules: [{ path: "", read: "owner", write: "owner" }] }, user: {}, downloads: true }
```

Page-frame rules, which apply to the final page:
- No `alert`, `confirm` or `prompt`; build confirmations in-page.
- No external fetch.
- Fonts come only from Google Fonts. No other external CSS or JS, except pinned CDN scripts if truly needed (avoid).
- `localStorage` only for conveniences (theme for first paint, last tab, unsent draft), wrapped in try/catch.
- Hash routing may use only `#coach`, `#history`, `#plan`.
- No `<!doctype>/<html>/<head>/<body>` tags in the published file; the platform wraps it. Put `<title>` and `<meta name="claude:viewport-fit-sides" content="cover">` at the top.

---

## 3. Files, tech, ownership

Plain **vanilla JavaScript ES modules**: no framework, no runtime dependencies. Node 22 is available. Dev-only dependency: `esbuild`, for bundling, owned by the integrator. Tests use `node --test` from `app/`.

```
app/
├── CONTRACT.md                 integrator
├── package.json                integrator     (scripts: test, build, dev)
├── tools/build.mjs             integrator     (bundles to dist/personal-trainer.html)
├── docs/runtime-types/*.d.ts   reference only
├── index.html                  D   dev entry: loads src/ui/styles.css + src/main.js (type=module)
├── src/
│   ├── main.js                 D   bootstrap (see §9)
│   ├── ui/**                   D   app.js, chat.js, history.js, plan.js, settings.js, components.js, styles.css, ...
│   ├── core.js                 A   pure logic (no DOM, no platform calls)
│   ├── catalog.js              A   equipment + exercise catalog
│   ├── env.js                  C   runtime detection, real vs mock capabilities
│   ├── store.js                C   data layer over db
│   ├── store-mock.js           C   in-memory db implementing the db.d.ts surface used
│   ├── brain.js                B   the coach: chat, onboarding, plan generation, comments
│   ├── prompts/*.js            B   prompt builders (context snapshot, plan JSON spec, ...)
│   ├── sample-mock.js          B   fake `sample` for dev/tests (streaming, tools, json)
│   └── knowledge/*.js          F   condensed coaching knowledge as exported strings
└── tests/
    ├── core.test.mjs, catalog.test.mjs       A
    ├── store.test.mjs                         C
    ├── brain.test.mjs                         B
    └── fixtures/                              A (shared fixtures; others may add their own files prefixed with their letter)
```
Outside `app/`, Agent F also owns:
- `/.claude/skills/personal-trainer/references/running.md` (new)
- `/.claude/skills/personal-trainer/references/conditioning.md` (new)
- `/docs/research/06-running.md`
- `/docs/research/07-conditioning.md` (new)
- small pointer edits in `/.claude/skills/personal-trainer/SKILL.md` (reference list + Mode 2 mentions)

Skeleton files with the exported signatures already exist. **Replace your own skeletons**, keeping the export names and signatures. While others' modules are still skeletons, code against this contract. Your tests may use small local stubs inside your own test files.

Code standards:
- JSDoc on every export.
- No global state except in `main.js`.
- Dates are local ISO `YYYY-MM-DD`; timestamps are ISO strings.
- All weights are in kg as numbers.
- No `console.log` noise in shipped code.
- Do **not** `git commit`. The integrator commits.

---

## 4. Data model (db paths under `data/users/<uid>/`)

All writes go through `store.js`. Path parity: `data/users/<uid>` is a collection, so `profile` is a doc.

| Path | Kind | Content |
|---|---|---|
| `data/users/<uid>/profile` | doc | `Profile` |
| `data/users/<uid>/coach` | doc | `CoachMemory` |
| `data/users/<uid>/state` | doc | `AppState` |
| `data/users/<uid>/body` | doc | `{ entries: [{date, kg}] }` (capped at 400, newest last) |
| `data/users/<uid>/plans/weeks/<planId>` | doc | `Plan` (`planId` = weekStart date, with `-2`, `-3`… on regenerate) |
| `data/users/<uid>/log/sessions/<sessionId>` | doc | `Session` (`sessionId` = `<date>-<6 random [a-z0-9]>`) |
| `data/users/<uid>/chat/days/<YYYY-MM-DD>` | doc | `{ date, messages: [ChatMessage] }` (at most 300 per day; older days stay) |

### Profile
```js
{
  version: 1, onboarded: false,
  name: "", age: null, sex: null, heightCm: null, weightKg: null,
  screening: { answers: { heartCondition, chestPain, dizziness, chronicCondition, medications, boneJoint, supervisedOnly }, // booleans | null
               pregnant: null, notes: "", outcome: null /* "cleared" | "cleared_with_modifications" | "needs_clearance" */, screenedAt: null },
  injuries: [ { area, status /* "current" | "past" */, painScore, aggravators, notes, updatedAt } ],
  goals: { primary: "", secondary: [], why: "", success12w: "", targetDate: null,
           modalities: { strength: true, running: false, conditioning: false },
           event: null /* { type: "race", distanceKm, date, goalTimeSec } */ },
  schedule: { daysPerWeek: 3, minutesPerSession: 60, preferredDays: [], notes: "" },
  equipment: { defaultLocationId: "gym",
               locations: [ { id: "gym", name: "Gym", items: ["barbell", ...] /* EQUIPMENT ids */,
                              dumbbellMaxKg: null, kettlebellsKg: [], notes: "" } ] },
  experience: { level: null /* "novice" | "late_novice" | "intermediate" | "advanced" */, trainingAgeYears: null,
                running: { currentWeeklyKm: null, longestRecentRunKm: null, recentRace: null /* {distanceKm, timeSec, date} */, easyPaceSecPerKm: null },
                conditioning: { experience: null /* "none" | "some" | "regular" */ },
                knownLifts: [ { exerciseId, loadKg, reps, rir, date } ] },
  preferences: { likes: [], dislikes: [] /* exerciseIds or free text */, tone: "direct", logging: "standard" },
  updatedAt: ""
}
```

### CoachMemory (the coach's long-term memory)
```js
{ summary: "",            // ≤ 2,000 chars rolling summary of older chat and key facts
  notes: [ { id, date, kind /* "insight" | "decision" | "injury" | "preference" | "goal" */, text } ],  // keep newest 200
  updatedAt: "" }
```

### AppState
```js
{ schemaVersion: 1,
  settings: { theme: "system" /* | "light" | "dark" */, chatTier: "default" /* | "quick" */ },
  rotation: { planId: null, done: [] /* workoutIds completed in the current plan */ },
  onboarding: { status: "not_started" /* | "in_progress" | "done" */ },
  pendingPlanRequest: null /* { kind: "generate" | "revise", instruction, createdAt } */ }
```

### Plan
```js
{ id, status: "draft" | "agreed" | "archived", weekStart: "YYYY-MM-DD" /* a Sunday */,
  createdAt, approvedAt: null,
  focus: "one line",
  rationale: "≤ 2 short sentences (≤ 220 chars), referencing recent history",
  workouts: [ Workout ],            // rotation order
  weeklyTargets: { runKm: null, conditioningSessions: null, strengthSetsPerMuscle: {} },
  notes: [],
  validation: null /* last core.validatePlan result */ }

Workout = { id: "W1", title, type: "strength" | "run" | "conditioning" | "hybrid" | "mobility",
            locationId, estMinutes, intent: "why this session", blocks: [Block] }

Block =
 | { kind: "warmup" | "cooldown" | "mobility", minutes, items: [ { name, detail } ] }
 | { kind: "strength", items: [ StrengthItem ] }
 | { kind: "conditioning", format: "AMRAP" | "EMOM" | "FOR_TIME" | "RFT" | "INTERVALS" | "TABATA" | "CHIPPER",
     minutes, rounds, timeCapMin, workSec, restSec, items: [ CondItem ], targetRpe, scaling, notes }
 | { kind: "run", runType: "easy" | "long" | "tempo" | "threshold" | "intervals" | "hills" | "fartlek" | "recovery" | "strides" | "race",
     warmupMin, cooldownMin, totalKm,
     segments: [ { reps, distanceM, durationSec, target: { paceSecPerKm: [lo, hi] | null, hrZone: null, rpe: null },
                   recoverySec, recoveryType /* "jog" | "walk" | "stand" */ } ],
     notes }

StrengthItem = { exerciseId, name, sets, reps /* "8-12" | "5" | "AMRAP" */, targetRir, loadKg /* number | null */,
                 restSec, progression: "linear" | "double" | "rpe" | "none", incrementKg, tempo, notes,
                 alternatives: [exerciseId], supersetGroup /* "A" | null */ }
CondItem     = { exerciseId, name, reps, calories, distanceM, durationSec, loadKg, notes }   // unused fields null
```

### Session (logged workout)
```js
{ id, date, planId, workoutId, title, type /* as Workout.type, or "other" */, status: "done" | "partial" | "missed",
  missedReason /* "travel" | "time" | "sick" | "pain" | "motivation" | "other" | null */,
  durationMin, readiness /* 1-5 | null */, sessionRpe /* 1-10 | null */, notes,
  pain: [ { area, score /* 0-10 */, when /* "during" | "after" | "next_morning" */ } ],
  strength: [ { exerciseId, name, sets: [ { type: "warmup" | "work", loadKg /* number | null */, bodyweight: false, reps, rir /* number | null */ } ] } ],
  conditioning: [ { format, description, result: { rounds, reps, timeSec, calories, completed }, scaled, rpe, notes } ],
  run: null /* or { runType, distanceKm, durationSec, avgPaceSecPerKm, avgHr, elevationM, rpe, splits: [secPerKm] } */,
  prs: [ { exerciseId, kind: "e1rm" | "reps_at_load" | "distance" | "pace", value, previous } ],
  coachComment: "", createdBy: "chat" | "manual", createdAt, updatedAt }
```

### ChatMessage
```js
{ id, ts, role: "user" | "assistant" | "event", text,
  actions: [ { type: "logged_session" | "updated_session" | "updated_profile" | "coach_note" | "plan_request",
               label, ref /* e.g. sessionId */ } ],   // "event" = system line such as "Plan approved"
  error: null /* sample error code if the reply failed */,
  errorDetail: null /* the sample error message, ≤ 300 chars, for diagnosis */ }
```

---

## 5. Module interfaces

### 5.1 `catalog.js` (A)
```js
export const EQUIPMENT      // { [id]: { name, group: "free_weights" | "machines" | "bodyweight" | "cardio" | "conditioning" | "other" } }
export const MUSCLES        // ["chest","front_delts","side_delts","rear_delts","upper_back","lats","lower_back","biceps","triceps","forearms","quads","hamstrings","glutes","adductors","calves","abs"]
export const EXERCISES      // [ Exercise ]  ≥ 180 entries covering gym strength, bodyweight, kettlebell, CrossFit/HIIT movements, cardio machines
export function getExercise(id)            // Exercise | null
export function findExercise(nameOrId)     // fuzzy: "bench", "DB bench press", "pull-ups", "row cal" → Exercise | null
export function searchExercises(query, { equipment, modality, limit = 20 } = {})  // ranked list
```
`Exercise = { id, name, aliases: [], modality: ["strength"] | ["conditioning"] | ["strength","conditioning"] | ["cardio"], pattern, primary: [muscles], secondary: [muscles], equipment: { all: [ids], any: [ids] }, jointStress: [], unit: "load_reps" | "reps" | "time" | "distance" | "calories", skill: 1-5, alternatives: [ids] }`.

`pattern` is one of: `squat`, `hinge`, `lunge`, `h_push`, `v_push`, `h_pull`, `v_pull`, `carry`, `core`, `isolation`, `plyo`, `olympic`, `gymnastics`, `cardio`.

**EQUIPMENT ids**, the minimum set (A may add more, never rename):
`barbell, plates, squat_rack, bench, adjustable_bench, dumbbells, kettlebell, cable_machine, lat_pulldown, seated_row, leg_press, leg_curl, leg_extension, hack_squat, smith_machine, chest_press_machine, shoulder_press_machine, pec_deck, calf_machine, hip_thrust_machine, trap_bar, landmine, ez_bar, pullup_bar, dip_bars, rings, trx, bands, plyo_box, jump_rope, medicine_ball, wall_ball, slam_ball, sandbag, sled, ghd, ab_wheel, rower, assault_bike, bike, ski_erg, treadmill, outdoor_route, track`.

Bodyweight-only exercises have empty equipment. `outdoor_route` means "can run outside".

### 5.2 `core.js` (A): pure functions, no I/O
```js
// numbers & dates
export function e1rm(loadKg, reps, rir = 0)                       // Epley on (reps + rir); reps + rir ≤ 1 → load
export function sessionE1rm(sets)                                 // { value, reliability: "ok" | "no_rir" | "high_rep" | "none" } (same rules as trainer.py session_e1rm)
export function roundTo(x, inc)
export function pctLoads(baseKg, pcts, inc = 2.5)                 // [{ pct, raw, rounded }]
export function paceSecPerKm(distanceKm, durationSec)
export function formatPace(secPerKm)                              // "5:32/km"
export function parseDuration(str)                                // "45:30" | "1:02:10" | "45" (minutes) → seconds
export function formatDuration(sec)
export function todayISO(now = new Date())
export function weekStartOf(dateISO)                              // Sunday-start, ISO date
export function daysBetween(aISO, bISO)

// strength history & progression (port of scripts/trainer.py)
export function exposures(sessions, exerciseId)                   // [{ date, sessionId, sets }] chronological, work sets only
export function nextTarget(sessions, item, { today } = {})       // item = StrengthItem → { loadKg, reps, note, reason }
                                                                  //   double / linear / rpe, layoff discount, effort overshoot, pain note
export function exerciseStats(sessions, exerciseId)               // { exposures, last, bestE1rm, trend: [{ date, e1rm, reliability }], flag: null | "stall" | "fatigue" }
export function detectPrs(session, priorSessions)                 // Session.prs[] (strength e1RM / reps-at-load, run distance / pace)

// aggregates
export function weeklySetsPerMuscle(sessions, { from, to })       // { muscle: sets } fractional (primary 1, secondary 0.5), hard work sets only (rir ≤ 4 or null)
export function plannedSetsPerMuscle(plan)                        // same for a Plan (strength blocks)
export function runningLoad(sessions, { weeks = 6, today } = {})  // [{ weekStart, km, longestKm, runs, minutes }] oldest → newest
export function adherence(sessions, profile, { weeks = 4, today } = {})  // { done, expected, pct, missedByReason }
export function trainingSummary(sessions, profile, { weeks = 4, today } = {})
      // compact object for prompts (keep JSON ≤ 4 KB): adherence, sessions per type, top lift trends + flags,
      // run km per week + longest run, conditioning count, pain flags (recent), readiness/sRPE averages, last session date

// equipment & plans
export function availableEquipment(profile, locationId)           // Set of equipment ids
export function exerciseAllowed(exerciseId, equipmentSet)         // { ok, missing: [] }
export function findSubstitutes(exerciseId, equipmentSet, profile, { limit = 3 } = {})  // [exerciseId] same pattern / primary muscles, respects dislikes
export function estimateWorkoutMinutes(workout)
export function validatePlan(plan, { profile, sessions = [], today } = {})
      // { ok, errors: [Issue], warnings: [Issue], stats: { setsPerMuscle, minutesByWorkout, runKm, longestRunKm, conditioningCount } }
      // Issue = { code, workoutId, path, message }
      // errors:   SCHEMA (missing or invalid fields), UNKNOWN_EXERCISE, EQUIPMENT_MISSING, DISLIKED_EXERCISE, WORKOUT_COUNT (≠ daysPerWeek),
      //           TOO_LONG (est > minutesPerSession + 15), RUN_RAMP (planned km > max(base × 1.1, base + 3); base = max(4-week avg, last week's km)),
      //           LONG_RUN_SPIKE (gross: a run > 30-day longest × 1.3 and > +3 km)
      // warnings: LONG_RUN_SPIKE (a run > 30-day longest × 1.1 and > +1 km; Frandsen 2025), VOLUME_LOW / VOLUME_HIGH (vs 6 / 22 sets), INJURY_CONFLICT (jointStress vs injuries), HARD_DAYS_ADJACENT, NO_REST_RUN_EASY (< 70 % easy running), MISSING_ALTERNATIVES, COND_NO_STIMULUS (conditioning block without a stimulus note), COND_REPEAT (consecutive metcons with the same format + dominant M/G/W element), COND_TIME_DOMAIN (≥ 2 metcons all in one time domain)
export function normalizeSession(input, { today } = {})           // fills defaults, maps names → exerciseIds via catalog.findExercise, computes run pace

// rotation
export function nextWorkout(plan, state)                          // first Workout whose id ∉ state.rotation.done (plan must be the agreed one), or null
export function markWorkoutDone(state, plan, workoutId)           // → new rotation object
```
A must make `core.js` results match `/.claude/skills/personal-trainer/scripts/trainer.py` for the shared logic (e1RM reliability, double/linear progression, stall/fatigue). Prove it in tests with a fixture.

### 5.3 `env.js`, `store.js`, `store-mock.js` (C)
```js
// env.js
export async function getRuntime({ forceMock = false } = {})
  // → { mode: "live" | "mock", sample, db, user, downloads, uid, problems: [] }
  // live when window.claude?.use exists: await use("sample" | "db" | "user" | "downloads") concurrently; uid = await user?.id()
  // mock when window.claude is absent or forceMock: db = createMockDb({ persist: "localStorage" }), sample = createMockSample() (B), uid = "dev-user"
  // problems: e.g. ["db_unavailable", "not_signed_in", "sample_unavailable"] so the UI can explain

// store-mock.js
export function createMockDb({ persist = null } = {})
  // implements the subset of db.d.ts the store uses: doc().get/set/update/delete/onSnapshot/collection,
  // collection().doc/add/where/orderBy/limit/get/onSnapshot. Async, snapshot shapes per db.d.ts, frozen data.

// store.js
export function createStore(db, uid)    // → Store
Store = {
  profile:  { get(), set(p), update(patch) /* deep merge, arrays replace */, subscribe(cb) },
  coach:    { get() /* defaults if missing */, addNote({ kind, text }), setSummary(text), subscribe(cb) },
  state:    { get() /* defaults */, update(patch), subscribe(cb) },
  body:     { add({ date, kg }), list() },
  plans:    { get(id), getAgreed(), getDraft(), list({ limit }), saveDraft(plan) /* status "draft", replaces previous draft */,
              approve(id) /* draft → agreed, previous agreed → archived, state.rotation = { planId: id, done: [] } */,
              subscribe(cb) /* all plans newest first */ },
  sessions: { add(session), get(id), update(id, patch), remove(id), list({ from, to, type, limit }) /* newest first */,
              subscribe(cb, { limit }) },
  chat:     { append(message) /* to today's day doc, assigns id + ts */, recent(n) /* oldest → newest across days */,
              subscribeDay(date, cb), days({ limit }) },
  exportAll(), importAll(json),
}
```
**Every mutating method** resolves to `{ ...result, undo: async () => void }`. `undo` restores the previous state (delete what was added, restore what was overwritten). Writes to one doc are serialized internally. Live path: everything under `data/users/<uid>/`. If `uid` is null, every method rejects `{ code: "no_user" }`.

### 5.4 `brain.js`, `prompts/*`, `sample-mock.js` (B)
```js
export function createCoach({ runtime, store, core, catalog, knowledge })   // → Coach
Coach = {
  status(),                                  // { available, reason } (reason: "sample_unavailable" | "not_granted" | "no_user" | null)
  isOnboarding(),                            // !profile?.onboarded
  send(text, { signal, onText, onTool } = {}),
      // persists the user message, runs sample() with chat tools, streams via onText({ text }),
      // reports tool activity via onTool({ name, phase: "start" | "done" | "error", label }),
      // persists the assistant reply with actions[], resolves { text, actions, error }
      // onboarding mode while not onboarded: ONBOARDING_RULES + an update_profile-centred tool set; finishes by setting profile.onboarded = true
  startOnboarding({ signal, onText }),       // first coach message (called from a "Start" tap)
  generatePlan({ instruction = "", signal, onProgress } = {}),
      // sample.json, modelTier "complex", cache: false. Prompt = PLAN_RULES + profile + coach memory + trainingSummary
      //   + last 14 days of sessions (compact) + previous plan + instruction + the Plan JSON spec.
      // core.validatePlan → if errors: ONE repair call with the issues. Then store.plans.saveDraft(plan with validation).
      // resolves { plan, validation }
  reviseDraft(instruction, { signal, onProgress }),   // same as generatePlan with the current draft + instruction
  commentOnSession(sessionId, { signal }),            // quick tier, ≤ 80 words, saves session.coachComment, resolves text
  errorCopy(code),                                    // short user-facing message per sample/store error code
}

// sample-mock.js
export function createMockSample({ delayMs = 400 } = {})
  // behaves like the sample function in sample.d.ts: streaming onText, signal abort → {code: "cancelled"}, tools (keyword-scripted:
  // "did/done/logged" → calls log_session with a parsed example; "today/next" → get_plan; onboarding → update_profile), .json() returns a valid
  // Plan for the stored profile built from the catalog, .limits() → { maxPromptBytes: 262144, tools: { maxCount: 16 }, modelTiers: ["default", "complex", "quick"] }
```
**Chat tools** (at most 8; check `limits().tools.maxCount`). Descriptions should be crisp, results compact. Each one that writes data records a ChatMessage action.

| Tool | Input | Does |
|---|---|---|
| `update_profile` | `{ patch }` | deep-merge into profile (onboarding, goal or equipment changes) → short summary |
| `get_plan` | `{ which: "next" \| "agreed" \| "draft" }` | `next` = next workout in rotation with `core.nextTarget` filled for each strength item |
| `get_history` | `{ from?, to?, type?, exerciseId?, limit? = 8 }` | compact sessions (+ `exerciseStats` when exerciseId) |
| `log_session` | `{ session }` | `core.normalizeSession`, `core.detectPrs`, store add, advance rotation if `workoutId` (infer "next" when the user says they did today's workout) → `{ id, prs, nextTargets }` |
| `update_session` | `{ id, patch }` | corrections, coach comment |
| `add_coach_note` | `{ kind, text }` | long-term memory |
| `get_exercise_info` | `{ query }` | catalog match + allowed with the owner's equipment? + substitutes |
| `request_plan` | `{ kind: "generate" \| "revise", instruction }` | sets `state.pendingPlanRequest`; the UI shows a "Generate" button card. **No nested Claude call inside a tool.** |

**Context snapshot** (in the leading instructions turn):
- today's date and weekday
- compact profile JSON
- coach summary + last 20 notes
- agreed plan overview + the full next workout with targets
- `core.trainingSummary`
- last 3 sessions, compact
- equipment list

Budgets:
- instructions turn ≤ 40 KB
- chat history = last 24 messages, ≤ 30 KB
- when older messages exist and the summary is stale (> 40 new messages since last summary), run a quick summarization before the main call **only as part of a user-initiated send**

### 5.5 `knowledge/*.js` (F)
```js
// knowledge/index.js re-exports all of these
export const CHAT_RULES          // ≤ 14 KB: coaching voice (OARS, autonomy), safety red flags + pain traffic light + referral, scope,
                                 //   logging behaviour, how to use the tools, never invent numbers, use the owner's equipment only
export const ONBOARDING_RULES    // ≤ 7 KB: conversational intake in rounds: PAR-Q+ (7 questions), goals across modalities
                                 //   (gym / running / HIIT), schedule, equipment per location using EQUIPMENT ids (ask what exists; offer common
                                 //   bundles: commercial gym, home gym, dumbbells only, bodyweight + running), experience (lifts, weekly km,
                                 //   recent race, conditioning), dislikes, injuries; save via update_profile after each round; then set onboarded
export const PLAN_RULES          // ≤ 40 KB: weekly planning across modalities: strength dose / splits / progression; running (easy-pace share,
                                 //   long run share, weekly ramp, quality sessions, paces from a recent race, HR zones, beginner run/walk);
                                 //   conditioning / HIIT (formats, time domains, work:rest, scaling, frequency, rhabdo-safe ramp for newcomers);
                                 //   hybrid scheduling (hard/easy, keep intervals away from heavy legs, interference), deload / layoff rules,
                                 //   equipment constraint (only exercises whose equipment is available), progression from history
export const COMMENT_RULES       // ≤ 2 KB: post-session comment style (win, one observation, next target)
export const KNOWLEDGE_VERSION   // e.g. "2026-11-07"
```

---

## 6. Prompting rules (B and F)
- The coach never does mental math. It uses tool results and core-computed targets, so pass numbers in.
- The coach uses only exercises available with the owner's equipment. Plans are validated in code anyway.
- Safety red flags (chest pain, fainting, rhabdo signs, …) override everything. Reply with the action, no training content.
- The coach co-designs: offer choices, explain briefly, respect the owner's decisions. Plans are drafts until approved.
- The coach is concise: phone-sized replies, short paragraphs, bullet lists for workouts.
- Markdown subset rendered by the UI: `**bold**`, `*italic*`, `- ` lists, `1. ` lists, `### ` headings, simple `| table |`, and `` `code` ``. No HTML.

---

## 7. UI requirements (D)

**Design direction:** a training log and coach app for daily use at the gym, so it must be readable mid-workout. Take an athletic, purposeful look of your own: strong condensed display type for numbers and titles, a clean body face, generous tap targets (≥ 44 px), and data in tabular numerals. Avoid the clichés listed in the design rules: cream + terracotta, near-black + acid green, purple/blue gradients, Inter or Space Grotesk, emoji as icons, everything rounded and shadowed.

Follow the page rules in §2:
- color tokens on `:root`, with dark values under `@media (prefers-color-scheme: dark) :root:not([data-theme="light"])` and `:root[data-theme="dark"]`
- `body` background from a token
- side gutters `max(16px, env(safe-area-inset-left/right))`
- the bottom tab bar adds `env(safe-area-inset-bottom)`
- the sticky header uses `top: env(safe-area-inset-top, 0px)`, with a `body::before` band
- `[hidden]` used for visibility, `prefers-reduced-motion` respected, visible focus states

Screens:
- **Shell:** sticky header with the app name "Personal Trainer" and a settings button. Bottom tab bar: Coach · History · Plan. Hash routes `#coach`, `#history`, `#plan`. Renders instantly with a loading state before the runtime resolves. Explains problems (`not_signed_in`, `db_unavailable`, `sample_unavailable`) in plain words.
- **Coach (chat):**
  - message list with a streaming assistant bubble and a "Thinking… 0:12" elapsed timer
  - Stop button
  - auto-growing composer; Enter sends on desktop, the button sends on phone
  - suggestion chips: "What's my workout today?", "Log a workout", "How's my progress?"
  - action cards under replies, e.g. "Logged · Upper A · 4 exercises" with **Undo** and **View** (jumps to History); a plan-request card with a **Generate plan** button
  - markdown subset rendering (§6), safe: textContent-based, never innerHTML with model text
  - error line per `coach.errorCopy(code)` with a **Retry** button (manual)
  - **Onboarding:** when not onboarded, a welcome panel explaining the app plus a **Start** button → `coach.startOnboarding()`. Then a normal chat until done.
- **History:**
  - week groups (Sunday start), newest first, each with a week summary (sessions, run km)
  - filter chips All / Strength / Run / HIIT
  - session cards: date, title, type pill, key metrics (top sets like `100×5`, or run `8.2 km · 5:31/km`, or metcon result), PR badge, pain flag, comment snippet
  - tap → detail sheet: full sets table, run splits, metcon details, notes, coach comment, with **Edit**, **Ask coach to comment**, and **Delete** (in-page confirm)
  - **Add workout** manual form: type selector. Strength rows use an exercise picker (catalog search filtered by the owner's equipment) plus sets `load × reps @ RIR`. Run has distance, duration (→ pace), type and RPE. HIIT has format, description and result. Common fields: date, duration, readiness, RPE, notes, pain.
- **Plan:**
  - agreed plan: focus, rationale (collapsible), workouts in rotation order with status Done / **Up next** / Later
  - workout cards expand to blocks: strength table with sets × reps @ RIR, target load from `core.nextTarget`, rest, alternatives; run segments with paces; conditioning format, movements and scaling; warm-up items
  - draft section (if any): rationale, validation warnings or errors as chips, **Approve**, **Ask for changes** (switches to Coach with a prefilled composer), **Regenerate**
  - primary button **Generate next week** → progress view with elapsed timer, a note "this uses the most capable model and can take 1-3 minutes", and Stop
  - empty states for "no plan yet" (finish onboarding first) and "week complete"
- **Settings sheet:**
  - theme (System / Light / Dark), applied via `data-theme` on `<html>`, saved to `state.settings.theme` and localStorage for first paint
  - coach speed (Smart = default tier / Fast = quick tier)
  - equipment summary, editable via coach
  - **Download backup** (downloads capability; hidden if null)
  - **Restart onboarding** (confirm)
  - app version
- Mobile-first at 390-430 px width, and fine on desktop with a max content width of about 720 px.

D verifies with Playwright (preinstalled, `require('playwright')`). Take screenshots at 390×844 in light and dark of each tab against the mocks, saved to `app/docs/screens/`.

---

## 8. Mock / dev mode
- `cd app && python3 -m http.server 8080`, then open `http://localhost:8080/index.html`. `window.claude` is absent, so `env.getRuntime()` returns mocks automatically.
- The mock db persists to localStorage in dev only (`persist: "localStorage"`), with a "Reset dev data" button in settings shown only in mock mode.
- Fixture seed for dev: `store-mock` exposes `seedDevData(store)`. C writes it, with about 3 weeks of mixed sessions and an agreed plan, using real catalog ids. It is used only in mock mode when the db is empty and the URL has `?seed`.

## 9. Bootstrap (`main.js`, D)
```js
import { getRuntime } from "./env.js";
import { createStore } from "./store.js";
import { createCoach } from "./brain.js";
import * as core from "./core.js";
import * as catalog from "./catalog.js";
import * as knowledge from "./knowledge/index.js";
import { mountApp } from "./ui/app.js";
// paint the shell immediately, then:
const runtime = await getRuntime();
const store = runtime.uid ? createStore(runtime.db, runtime.uid) : null;
const coach = store ? createCoach({ runtime, store, core, catalog, knowledge }) : null;
mountApp(document.getElementById("app"), { runtime, store, coach, core, catalog });
```

## 10. Definition of done (every agent)
1. Your files implement this contract. `node --test` passes for your tests (A, B, C).
2. No edits outside your owned files.
3. Final report (≤ 300 words): what you built, deviations or ambiguities you resolved, known gaps, and anything another module must provide that's missing.
