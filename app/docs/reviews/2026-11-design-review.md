# Design / UI / UX review (2026-11)

Scope: `app/src/ui/**` and `app/index.html`. I reviewed the partial edits from the earlier pass (commit 9b6b0b6), fixed the requests from the architecture review (§3), and walked the dev app with Playwright. Viewports were 390×844 and 375×667, light and dark, at deviceScaleFactor 2, covering mock mode, seeded data, first run and `?mockfail=`. The identity stays as it was: dark scoreboard header, plate-blue accent, Archivo condensed with IBM Plex Sans. Element ids are unchanged, apart from new ones. The page-frame rules still hold: tokens in both themes, no alert/confirm, `[hidden]`, hash routes only, and no innerHTML with model or user text.

## The earlier pass (9b6b0b6): kept, repaired

**Kept:**
- The Clear-chat button is hidden while the chat is empty.
- Mid-stream bold markers are closed (`closeOpenBold`).
- Toasts sit at the bottom, in thumb reach, and move inside the top open sheet so Undo stays tappable.
- The review strip is docked under the header.
- Settled plan cards take one row.
- The "BW" target for bodyweight lifts.
- The draft shows "Workout N:" issue labels, hides `TOO_VERBOSE`, and has a "Go to this week's workouts" link.
- Chips and toast actions are 44 px.
- Set-row edits no longer open the keyboard unless a value is missing.

**Repaired:**
- **P1: a toast inside a sheet covered the sheet's footer buttons.** `placeToastHost` measured the footer before it was shown, so the offset was 0, and the toast hid Save and Delete. Now each sheet watches its footer with a ResizeObserver and sets `--foot-h`, and the toast host sits above that.
- **P2: the Clear-chat button stayed after a clear.** The only remaining message was the "Chat cleared" event, so the chat never counted as empty. Event lines no longer count.
- **P2: tap-to-expand note lines were 33–37 px tall.** The hit area is now 44 px, with no change to the layout.

## Architecture-review requests (§3)

| # | Request | Done |
|---|---|---|
| a | `coach.rememberChat()` before every clear | All three paths (header button, `/clear`, Settings) go through `clearChat()` or `clearDirect()`, which call the new `rememberBeforeClear()`. While it runs, the confirm sheet shows a spinner with "Saving summary…", and Cancel becomes "Skip summary", which aborts the call. A failed or skipped summary never blocks the clear; the toast then reads "Chat cleared · no summary saved" (or "· summary skipped"). The confirm copy now says the coach saves a summary first. I followed the brief ("still clear, show a short note") rather than the review's "Clear anyway?" prompt. |
| b | Unmissable mock mode | The small "Dev" tag is gone. A full-width, hazard-striped amber band reads "DEMO MODE · fake coach, data only in this browser". It is part of the sticky header on every screen, so it shows over sheets too. A new `--banner-h` token keeps the docked review strip and scroll margins clear of it. Its text contrast is 8.2:1 in both themes. |
| c | `core.unmarkWorkoutDone` in the rotation undos | The new `ops.unmarkRotation()` is used by `ops.removeSession` (History delete), `chat.undoLogged` (action-card Undo) and the `quicklog.advanceRotation` undo (Plan "Done as planned", Skip, and finishing the workout sheet). Undo takes the workout out of the *current* rotation, so workouts logged in between stay done. Restoring a session re-marks it with `markWorkoutDone`. Checked in the browser: as-planned then Undo goes 2→1; chat Undo goes 1→0, and Restore goes back to 1; History delete goes 1→0, and Undo goes back to 1. |
| d | Dead History "plan mode" form | Removed: `planDraft`, `planHead`, all `fromPlan` branches, the target hints and the `workoutDraft` import. |

## Late requests from the logic agent

- **Training block on the plan card.** `plan.block = { week, phase }` shows as a small tag after the eyebrow, e.g. "Wk 3 · Build". A deload week uses the amber caution style. The tag is hidden when the field is absent, which is the case for the seed data, so the screenshots don't show it.
- **Previous plan in validation.** Re-validation after a swap, and the draft fallback, now pass `previousPlan`, as `brain.generatePlan` does: the agreed plan for a draft, or the newest earlier agreed/archived plan for the agreed one. This keeps `DELOAD_NOT_REDUCED` after a swap.

## Audit findings

| Rank | Finding | Status |
|---|---|---|
| P0 | Mock data could pass for the real log (small grey "Dev" tag). | Fixed (band) |
| P1 | Toast covered the sheet footer (Save, Delete, Finish). | Fixed |
| P1 | The header title truncated to "PERSONAL TRAI…" on Coach once the Clear button showed. | Fixed: moving the tag out of the header frees the room; the full title fits at 375 px. |
| P1 | Error copy outside the chat said "Your message is saved; tap Retry" on the Plan failure panel and in toasts, where there is no message and no Retry button. | Fixed: `errorText(coach, err, { inChat })`. The Coach error line keeps the chat copy; elsewhere `upstream_error`, `rate_limited` and `session_expired` read "…then try again". |
| P1 | Clear chat gave no progress while the summary call ran, and the faded disabled button looked broken. | Fixed: `.btn.is-busy` keeps its colour and shows a spinner. The sheet's confirm has no inner box and uses two equal buttons. Tapping the backdrop no longer closes it. |
| P2 | Tap-to-expand lines were under 44 px. | Fixed (except the one-line workout intent, which is 33 px; making it taller crowded the card divider). |
| P2 | At 375×667, the Coach dock (chips + composer) and the tab bar take about 40% of the screen. | Left: the chips are a contract requirement. They already hide while typing and while the coach replies. |
| P2 | The Coach still shows Undo for an assistant reply after the plan changed. | Left: that is brain's `planChangeActive`, out of scope. |
| P2 | The mock's replies print raw ids (`bench_press: 3×5 @RIR…`). | Left: mock data, not the UI. |
| — | Dark-mode contrast. | Passes AA. The lowest pairs are ink-3 on surface-2: 4.59:1 light, 5.27:1 dark. |
| — | Overflow, console errors, reduced motion, focus rings. | No horizontal overflow on any walked screen in either size or theme, and no console errors. The global reduced-motion rule covers the new spinner and toast. Focus rings are unchanged and visible. |

Checked and fine, unchanged:
- **Shell:** problem banners.
- **Onboarding:** welcome panel, then a chat with "Answer your coach".
- **Coach:** streaming with the timer, Stop, and action cards with Undo and View.
- **History:** week groups and summaries, filters, detail sheet, delete confirm, Add form validation, Run and HIIT forms.
- **Plan:** Up next card with Start, "Done as planned" and Skip; swap sheet; generation progress; failure panel with the faster-model retry and its detail line.
- **Other:** empty Plan and History states, the workout sheet, the post-workout review toast, and Settings.

Not re-tested in this pass: keyboard-over-input behaviour. The `kb-open` and `--vvh` handling and the sheet footer compaction are unchanged from the previous pass.

## Verification

- `npm test`: 260 passing.
- `npm run build`: passes.
- Playwright walks: no console errors and no horizontal overflow.

## Screenshots

`docs/screens/` is refreshed: coach, history and plan (light and dark), onboarding (light and dark), the workout sheet, the swap sheet, and the new clear-chat confirm. Older captures from the earlier pass are kept: `plan-done-*`, `review-*`, `swap-*` and `workout-sheet-after-*`. They predate the demo band.
