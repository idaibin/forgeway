import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { projectNextAction, readStageRegistry } from "../../skills/forgeway/tooling/workflow-stage.mjs";

const cli = fileURLToPath(new URL("../../skills/forgeway/tooling/workflow-stage.mjs", import.meta.url));
const basis = "a".repeat(40);
const fingerprint = "sha256:" + "b".repeat(64);
function run(...args) {
  return spawnSync(process.execPath, [cli, "standalone", ...args], { encoding: "utf8" });
}
for (const [goal, stage, identity] of [["review", "review", basis], ["verify", "verification", fingerprint]]) {
  const result = run(goal, identity);
  assert.equal(result.status, 0, result.stderr);
  const projection = JSON.parse(result.stdout);
  assert.equal(projection.stage_id, stage);
  assert.equal(projection.basis, identity);
  assert.equal(projection.maximum_effect, "read-only");
  assert.equal(projection.authorizes_execution, false);
  const next = projectNextAction(readStageRegistry(), {
    schema_version: "forgeway-workflow-state/1", run_id: "run:example",
    run_input_package_id: "pkg:input", goal, basis: { fingerprint }, stage_states: []
  });
  assert.equal(next.selected_stage.stage_id, "project-discovery");
  assert.equal(next.authorizes_execution, false);
}
for (const args of [["deliver", basis], ["review", "HEAD"], ["verify"], ["verify", basis, "--output", "unused"]]) {
  assert.equal(run(...args).status, 2);
}
