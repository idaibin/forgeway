// Synthetic evidence using the real ledger. No reviewer, approval host or Git effects.
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readStageRegistry } from "../../skills/forgeway/tooling/workflow-stage.mjs";
import { projectDispatch } from "../../skills/forgeway/tooling/workflow-dispatch.mjs";
import { createDeliveryStore, createPackageManifest } from "../../skills/forgeway/tooling/delivery/index.mjs";

const directory = mkdtempSync(join(tmpdir(), "forgeway-review-reopen-"));
const filename = join(directory, "ledger.sqlite");
const claim = "stage:review:exit:independent-review-result-recorded";
let store, snapshot;
try {
  store = createDeliveryStore({ filename, authorizeObservation: () => ({ granted: true, receipt: "fixture:allowed" }) });
  const pkg = hex => store.registerPackage(createPackageManifest({ repository_id: "fixture:review-reopen", files: [],
    basis: { head_sha: hex.repeat(40) } }));
  const before = pkg("1"), after = pkg("2");
  const { run_id } = store.createRun({ capability_id: "fixture", input_basis_package_id: before.package_id,
    policy: { policy_id: "fixture", version: 1, failure_behavior: { missing: "not-verified", negative: "unsatisfied", stale: "stale" },
      predicates: { review: { applicable: true, mode: "all", missing_state: "not-verified", negative_state: "unsatisfied",
        stale_state: "stale", requirements: [{ id: "review-finding", kind: "review-finding", min_count: 1,
          outcomes: ["satisfied"], package_binding: "result", claim_refs: [claim] }] } } } });
  const attempt = p => store.createAttempt({ run_id, status: "succeeded", result_package_id: p.package_id });
  const review = (a, p, count) => store.recordObservation({ run_id, attempt_id: a.attempt_id, result_package_id: p.package_id,
    kind: "review-finding", claim_refs: [claim], producer: { capability_id: "repository.change.review", capability_version: "1", session_id: "fixture:reviewer" },
    collector: { id: "fixture", version: "1" }, permission: { mode: "read-only", granted: true, authorization_ref: "fixture:allowed" },
    payload: { reviewed_package_id: p.package_id, finding_count: count, blocking_count: count, summary: "synthetic result" } });
  const gate = ledger => ledger.projectPredicates({ run_id, report: { verdict: "PASS" } }).predicates.review;
  const a = attempt(before), negative = review(a, before, 1);
  assert.equal(gate(store).state, "unsatisfied");
  review(a, before, 0);
  assert.equal(gate(store).state, "unsatisfied", "a same-package positive cannot erase a blocker");
  const blocked = { status: "blocked", goal: "deliver", selected_stage: { stage_id: "review" } };
  const storeMustNotBeRead = new Proxy({}, { get() { assert.fail("blocked dispatch looked up its inputs"); } });
  const view = projectDispatch(blocked, readStageRegistry(), {}, storeMustNotBeRead);
  assert.equal(view.status, "blocked");
  assert.equal(view.dispatch.status, "not-dispatched");
  assert.equal(view.authorizes_execution, false);

  const b = attempt(after);
  assert.equal(gate(store).state, "stale");
  const positive = review(b, after, 0), expected = gate(store);
  assert.equal(expected.state, "satisfied");
  assert.deepEqual(expected.observation_ids, [positive.observation_id]);
  assert.ok(expected.stale_observation_ids.includes(negative.observation_id));
  store.close();
  store = undefined;

  snapshot = createDeliveryStore({ filename, readOnly: true, copySnapshot: true });
  assert.deepEqual(gate(snapshot), expected);
  assert.equal(snapshot.getObservation(negative.observation_id).outcome, "unsatisfied");
  console.log("verified review block, non-dispatch, stale evidence and reopen");
} finally {
  snapshot?.close();
  store?.close();
  rmSync(directory, { recursive: true, force: true });
}
