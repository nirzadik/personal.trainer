// Regenerates a-trainer-expected.json from the real trainer.py (Agent A).
// Run from app/:  node tests/fixtures/a-gen-trainer-expected.mjs
import { writeFileSync } from "node:fs";
import { runPython } from "./a-trainer-harness.mjs";

const r = runPython();
const out = {
  generatedBy: "node tests/fixtures/a-gen-trainer-expected.mjs  (python3 .claude/skills/personal-trainer/scripts/trainer.py --home <tmp> init / log / next / report --weeks 8)",
  generatedOn: r.today,
  note: "Results depend only on days-ago offsets, so tests replay them against any fixed 'today'.",
  log: r.log, next: r.next, report: r.report,
};
writeFileSync(new URL("./a-trainer-expected.json", import.meta.url), JSON.stringify(out, null, 2) + "\n");
console.log("wrote a-trainer-expected.json");
