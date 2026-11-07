// Owner: Agent D. Bootstrap (CONTRACT.md §9). The only module with global state.
import { getRuntime } from "./env.js";
import { createStore } from "./store.js";
import { createCoach } from "./brain.js";
import * as core from "./core.js";
import * as catalog from "./catalog.js";
import * as knowledge from "./knowledge/index.js";
import { mountApp, applySavedTheme, paintLoading, renderFatal } from "./ui/app.js";

// paint the shell immediately (index.html also ships a static loading shell), then:
const root = document.getElementById("app");
applySavedTheme();
paintLoading(root);

try {
  const runtime = await getRuntime();
  const store = runtime.uid ? createStore(runtime.db, runtime.uid) : null;
  let coach = null;
  try {
    coach = store ? createCoach({ runtime, store, core, catalog, knowledge }) : null;
  } catch (err) {
    console.error(err); // the app still works for manual logging without a coach
  }
  mountApp(root, { runtime, store, coach, core, catalog });
} catch (err) {
  console.error(err);
  renderFatal(root, err);
}
