import { assert, canonicalJson, clone, deepFreeze, nowIso, sha256 } from "./utils.mjs";

export const CODEX_POST_TOOL_USE_VERSION = "1.0.0";
// Original wire pin is retained for API compatibility. The identical command input
// was also reviewed at Codex 0.165.0, commit 360319d8dee62d87e2d59fc0c21805d79519cfed.
// This is source compatibility, not runtime version detection or host activation.
export const CODEX_POST_TOOL_USE_SOURCE = "83086188ae0614bd882818ff1aa23f3194962012";
const COLLECTOR = "forgeway.codex.post-tool-use";
const INTAKE = `${COLLECTOR}.intake`;
const guardedAuthorizers = new WeakSet();
const text = value => typeof value === "string" && value.length > 0;
const same = (left, right) => canonicalJson(left) === canonicalJson(right);
const requireThat = (condition, code) => assert(condition, code, code);
const immutable = value => deepFreeze(clone(value));
const ENVELOPE = "CODEX_HOOK_ENVELOPE_INVALID";

// Public input is JSON data only, never an executable command/module/reader.
function jsonData(value, code = ENVELOPE) {
  const pending = [[value, 0]], seen = new Set(); let nodes = 0;
  while (pending.length) {
    const [item, depth] = pending.pop();
    requireThat(++nodes <= 20000 && depth <= 32, code);
    if (item === null || typeof item === "boolean" || typeof item === "string") continue;
    if (typeof item === "number") { requireThat(Number.isFinite(item), code); continue; }
    requireThat(item && typeof item === "object" && !seen.has(item), code); seen.add(item);
    requireThat(Array.isArray(item) || Object.getPrototypeOf(item) === Object.prototype || Object.getPrototypeOf(item) === null, code);
    for (const descriptor of Object.values(Object.getOwnPropertyDescriptors(item))) {
      requireThat(Object.hasOwn(descriptor, "value"), code);
      pending.push([descriptor.value, depth + 1]);
    }
  }
  requireThat(Buffer.byteLength(JSON.stringify(value)) <= 1048576, code);
  return clone(value);
}

/** Decode the pinned native PostToolUse envelope, not a generic tool-result schema. */
export function decodeCodexPostToolUse(input) {
  const value = jsonData(input);
  const required = ["cwd", "hook_event_name", "model", "permission_mode", "session_id", "tool_input", "tool_name", "tool_response", "tool_use_id", "transcript_path", "turn_id"];
  requireThat(value && !Array.isArray(value) && typeof value === "object", ENVELOPE);
  requireThat(required.every(key => Object.hasOwn(value, key)) && Object.keys(value).every(key => [...required, "agent_id", "agent_type"].includes(key)), ENVELOPE);
  requireThat(value.hook_event_name === "PostToolUse", ENVELOPE);
  requireThat(["cwd", "model", "session_id", "tool_name", "tool_use_id", "turn_id"].every(key => text(value[key])), ENVELOPE);
  requireThat(["agent_id", "agent_type"].every(key => !Object.hasOwn(value, key) || typeof value[key] === "string"), ENVELOPE);
  requireThat(value.transcript_path === null || typeof value.transcript_path === "string", ENVELOPE);
  requireThat(["default", "acceptEdits", "plan", "dontAsk", "bypassPermissions"].includes(value.permission_mode), ENVELOPE);
  return immutable(value);
}

/** Compose at the existing host-owned store boundary; intake can never satisfy a gate. */
export function createCodexPostToolUseIntakeAuthorizer(fallback = () => ({ granted: false, receipt: "host:not-authorized" })) {
  requireThat(typeof fallback === "function", "CODEX_HOOK_PORT_REQUIRED");
  const authorizer = (observation, context) => observation.collector?.id === COLLECTOR || observation.payload?.check_id === INTAKE
    ? { granted: false, receipt: "host:codex-hook-intake-ineligible" }
    : fallback(observation, context);
  guardedAuthorizers.add(authorizer);
  return authorizer;
}

function resolveBoundOperation(store, native, resolveOperation) {
  const resolution = resolveOperation(native);
  requireThat(resolution?.binding && resolution?.current, "CODEX_HOOK_BINDING_REQUIRED");
  const binding = jsonData(resolution.binding, "CODEX_HOOK_BINDING_INVALID");
  const required = ["task_ref", "run_id", "attempt_id", "stage_execution_id", "repository_id", "input_package_id", "input_aggregate_sha256", "result_package_id", "result_aggregate_sha256", "scope", "producer", "target", "expected_ref", "authorization_ref"];
  requireThat(required.every(key => Object.hasOwn(binding, key)) && Object.keys(binding).every(key => required.includes(key)), "CODEX_HOOK_BINDING_INVALID");
  requireThat(required.filter(key => !["scope", "producer", "target"].includes(key)).every(key => text(binding[key])), "CODEX_HOOK_BINDING_INVALID");
  requireThat([binding.input_aggregate_sha256, binding.result_aggregate_sha256].every(value => /^[0-9a-f]{64}$/.test(value)), "CODEX_HOOK_BINDING_INVALID");
  requireThat(binding.target?.kind === "git-remote" && text(binding.target.identity) && /^[0-9a-f]{40}$/.test(binding.target.commit_sha ?? "") && Object.keys(binding.target).every(key => ["kind", "identity", "commit_sha"].includes(key)), "CODEX_HOOK_BINDING_INVALID");
  requireThat(Array.isArray(binding.scope) && binding.producer?.capability_id === "repository.git.deliver" && ["capability_version", "actor", "session_id"].every(key => text(binding.producer[key])) && Object.keys(binding.producer).every(key => ["capability_id", "capability_version", "actor", "session_id"].includes(key)), "CODEX_HOOK_BINDING_INVALID");
  const run = store.getRun(binding.run_id), attempt = store.getAttempt(binding.attempt_id);
  const input = store.getPackage(binding.input_package_id), result = store.getPackage(binding.result_package_id);
  const tasks = [...new Set((run?.input_refs ?? []).filter(ref => ref?.kind === "task" && text(ref.id)).map(ref => ref.id))];
  const stageInput = store.getPackage(attempt?.action?.stage_input_package_id);
  requireThat(run && attempt && input && result && stageInput && tasks.length === 1 && tasks[0] === binding.task_ref
    && run.input_basis_package_id === input.package_id && attempt.run_id === run.run_id && attempt.result_package_id === result.package_id
    && [input, result, stageInput].every(pkg => pkg.repository_id === binding.repository_id)
    && input.aggregate_sha256 === binding.input_aggregate_sha256 && result.aggregate_sha256 === binding.result_aggregate_sha256
    && same(run.scope, binding.scope) && binding.producer.session_id === native.session_id
    && attempt.action?.stage_id === "delivery" && attempt.action?.stage_execution_id === binding.stage_execution_id
    && attempt.action.authorized_targets?.some(target => target.kind === binding.target.kind && target.identity === binding.target.identity
      && target.commit_sha === binding.target.commit_sha && target.ref === binding.expected_ref), "CODEX_HOOK_BINDING_MISMATCH");
  return { binding: immutable(binding), current: jsonData(resolution.current, "CODEX_HOOK_CURRENT_REJECTED"), run, attempt };
}

function requireCurrent({ binding, current, run, attempt }) {
  const latest = run.attempts.filter(item => item.action?.stage_execution_id === binding.stage_execution_id).at(-1);
  requireThat(attempt.status === "succeeded" && latest?.attempt_id === binding.attempt_id
    && current.authorized === true && current.cancelled === false && current.failed === false
    && current.current_attempt_id === binding.attempt_id && current.task_ref === binding.task_ref
    && current.authorization_ref === binding.authorization_ref, "CODEX_HOOK_CURRENT_REJECTED");
}

function confirmedReadback(readback, binding) {
  const observedAt = readback?.observed_at;
  // Date.parse alone accepts numeric/date-only strings and normalizes invalid
  // calendar days. This port deliberately requires canonical UTC ISO millis.
  const canonicalTime = typeof observedAt === "string"
    && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(observedAt)
    && Number.isFinite(Date.parse(observedAt)) && new Date(observedAt).toISOString() === observedAt;
  return readback?.status === "confirmed" && readback.identity === binding.target.identity
    && readback.commit_sha === binding.target.commit_sha && readback.ref === binding.expected_ref
    && readback.result_package_id === binding.result_package_id
    && canonicalTime;
}

function verifyReceipt(store, receipt, binding, intake, details) {
  const code = "CODEX_HOOK_RECEIPT_CONFLICT";
  requireThat(receipt.receipt_type === "delivery" && receipt.run_id === binding.run_id && receipt.attempt_id === binding.attempt_id
    && receipt.result_package_id === binding.result_package_id && same(receipt.target, binding.target)
    && same(receipt.authorization, { granted: true, actor: binding.producer.actor, reference: binding.authorization_ref })
    && confirmedReadback(receipt.readback, binding) && same(receipt.readback.details, details)
    && receipt.created_at === intake.observed_at && receipt.outcome === "satisfied", code);
  const observationId = `obs:${receipt.receipt_id.slice("receipt:".length)}`;
  const observation = store.getObservation(observationId);
  const receiptAuthorization = store.authorizeReceipt(immutable(receipt));
  requireThat(receiptAuthorization?.granted === true && text(receiptAuthorization.receipt), "CODEX_HOOK_CURRENT_REJECTED");
  const payload = { receipt_id: receipt.receipt_id, target: receipt.target, authorization: receipt.authorization, readback: receipt.readback };
  const expected = {
    schema_version: "1.0", observation_id: observationId, run_id: binding.run_id, attempt_id: binding.attempt_id,
    result_package_id: binding.result_package_id, kind: "delivery-receipt", environment: "target-like", outcome: "satisfied",
    observed_at: intake.observed_at, claim_refs: [], limitations: [], producer: binding.producer,
    collector: { id: COLLECTOR, version: CODEX_POST_TOOL_USE_VERSION },
    permission: { mode: "git-write", granted: true, authorization_ref: binding.authorization_ref }, payload,
    validation: { contract_id: "urn:forgeway:observation:delivery-receipt:v1", contract_version: "1.0", validator_id: "forgeway.delivery.observation",
      validated_at: intake.observed_at, payload_sha256: sha256(payload), result_package_aggregate_sha256: binding.result_aggregate_sha256,
      eligible: true, authorization_receipt: `receipt:${receipt.receipt_id}` }
  };
  requireThat(observation && same(observation, expected), code);
  return observationId;
}

/**
 * Synchronous, single-writer owner call. Observe one already-bound operation;
 * no subprocess, network, dynamic import, business execution or retry capability.
 * Caller must reopen and inspect the same store before claiming acceptance.
 */
export function recordCodexPostToolUse({ store, event, resolveOperation, readTarget, now = Date.now } = {}) {
  const envelope = decodeCodexPostToolUse(event);
  requireThat(typeof resolveOperation === "function" && typeof readTarget === "function", "CODEX_HOOK_PORT_REQUIRED");
  requireThat(guardedAuthorizers.has(store?.authorizeObservation), "CODEX_HOOK_INTAKE_AUTHORIZER_REQUIRED");
  const native = immutable(Object.fromEntries(["session_id", "turn_id", "tool_use_id", "tool_name"].map(key => [key, envelope[key]])));
  const eventKey = sha256({ domain: "forgeway.codex.PostToolUse/1", ...native });
  const intakeId = `obs:codex-intake:${eventKey}`, receiptId = `receipt:codex:${eventKey}`;
  const resolved = resolveBoundOperation(store, native, resolveOperation), { binding } = resolved;
  const details = { adapter_version: CODEX_POST_TOOL_USE_VERSION, event_key: eventKey, envelope_sha256: sha256(envelope), binding_sha256: sha256(binding) };
  let intake = store.getObservation(intakeId);
  if (intake) {
    requireThat(same(intake.payload?.binding, details) && intake.run_id === binding.run_id && intake.attempt_id === binding.attempt_id
      && intake.result_package_id === binding.result_package_id, "CODEX_HOOK_IMMUTABLE_CONFLICT");
    requireThat(intake.validation?.eligible === false && intake.outcome === "not-verified" && intake.kind === "runtime-observation"
      && intake.collector?.id === COLLECTOR && intake.payload.check_id === INTAKE && intake.claim_refs.length === 0
      && intake.permission.granted === false, "CODEX_HOOK_IMMUTABLE_CONFLICT");
  }
  requireCurrent(resolved);
  // Reuse the core immutable comparison even on replay; the persisted time is
  // supplied unchanged, so this verifies the entire intake without appending.
  intake = store.recordObservation({
    observation_id: intakeId, run_id: binding.run_id, attempt_id: binding.attempt_id, result_package_id: binding.result_package_id,
    kind: "runtime-observation", environment: "local", observed_at: intake?.observed_at ?? nowIso(now), claim_refs: [], producer: binding.producer,
    collector: { id: COLLECTOR, version: CODEX_POST_TOOL_USE_VERSION },
    permission: { mode: "read-only", granted: false, authorization_ref: "host:codex-hook-intake-ineligible" },
    payload: { check_id: INTAKE, observed_state: "native-event-received-not-business-success", status: "not-verified", binding: details }
  });
  requireThat(intake.validation.eligible === false, "CODEX_HOOK_INTAKE_AUTHORIZER_REQUIRED");
  let receipt = store.listReceipts(binding.run_id).find(item => item.receipt_id === receiptId);
  const existing = Boolean(receipt);
  if (!receipt) {
    const readback = jsonData(readTarget(binding), "CODEX_HOOK_READBACK_REJECTED");
    requireThat(confirmedReadback(readback, binding), "CODEX_HOOK_READBACK_REJECTED");
    const fresh = resolveBoundOperation(store, native, resolveOperation);
    requireThat(same(fresh.binding, binding), "CODEX_HOOK_IMMUTABLE_CONFLICT"); requireCurrent(fresh);
    receipt = store.createDeliveryReceipt({ receipt_id: receiptId, run_id: binding.run_id, attempt_id: binding.attempt_id,
      result_package_id: binding.result_package_id, target: binding.target,
      authorization: { granted: true, actor: binding.producer.actor, reference: binding.authorization_ref },
      readback: { status: "confirmed", identity: readback.identity, commit_sha: readback.commit_sha, ref: readback.ref,
        result_package_id: readback.result_package_id, observed_at: readback.observed_at, details },
      created_at: intake.observed_at, producer: binding.producer, collector: { id: COLLECTOR, version: CODEX_POST_TOOL_USE_VERSION },
      permission: { mode: "git-write", granted: true, authorization_ref: binding.authorization_ref }
    });
  }
  const observationId = verifyReceipt(store, receipt, binding, intake, details);
  return immutable({ status: existing ? "receipt-existing" : "receipt-recorded", receipt, intake_observation_id: intakeId,
    receipt_observation_id: observationId, authorizes_execution: false, reopen_verification_required: true });
}
