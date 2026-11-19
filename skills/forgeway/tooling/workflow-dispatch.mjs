import { validateCapabilityRegistry } from "./capability-registry.mjs";
import { resolveCapability } from "./capability-core.mjs";
import { validateCapabilityAlignment } from "./workflow-delivery-closure.mjs";
import { validatePackageManifest } from "./delivery/package-manifest.mjs";

// Explicit metadata is bounded before recursive contract validation. It is not trusted
// host loading, permission, source authentication or actual execution evidence.
export function parseDispatchSnapshot(bytes) {
  const value = JSON.parse(bytes.toString("utf8"));
  const pending = [[value, 0]]; let nodes = 0;
  while (pending.length) {
    const [item, depth] = pending.pop();
    if (++nodes > 20000 || depth > 24 || (typeof item === "string" && item.length > 4096)) {
      throw Object.assign(new Error("dispatch snapshot limit exceeded"), { code: "WORKFLOW_DISPATCH_LIMIT" });
    }
    if (item && typeof item === "object") for (const child of Object.values(item)) pending.push([child, depth + 1]);
  }
  return value;
}

export function projectDispatch(next, registry, state, deliveryStore, { catalog, manifest, capabilityId, adapterId, snapshotHashes = {} } = {}) {
  const stage = registry.stages.find(row => row.id === next.selected_stage?.stage_id);
  const dispatch = {
    status: "not-dispatched", execution_kind: next.selected_interrupt?.execution_kind ?? stage?.execution_kind ?? null,
    execution_readiness: "not-verified", input: null, contract_resolution: null, snapshot_sha256: snapshotHashes,
    host_checks: ["applicable Product/business/API authority versions, consistency and accepted Task; unresolved conflicts return to the earliest owner", "live basis and include/exclude scope", "user scope ∩ host scope ∩ capability maximum", "source revision, installed and actually loaded identity", "host session, tools and target identity", "confirmation and environment gates", "old writer cancellation and unknown effects reconciliation", "result validation and independent acceptance"],
    authorizes_execution: false
  };
  const view = { ...next, view: "dispatch", dispatch, authorizes_execution: false };
  // Preserve stops and invalidations. No snapshot can convert them into new work.
  if (!["next-stage", "resume-running-stage"].includes(next.status)) return view;
  const run = deliveryStore.getRun(state.run_id);
  const runPackage = deliveryStore.getPackage(run.input_basis_package_id);
  const previous = (next.completed_stage_ids ?? []).map(id => state.stage_states.find(record => record.stage_id === id)).at(-1);
  const expectedInput = stage.input_from === "run-input" || (state.brownfield_admission && stage.id === "implementation")
    ? run.input_basis_package_id : previous?.stage_result_package_id;
  const attempt = next.status === "resume-running-stage" ? deliveryStore.getAttempt(next.selected_stage.attempt_ref) : null;
  const inputId = attempt ? attempt.action.stage_input_package_id : expectedInput;
  const input = inputId ? deliveryStore.getPackage(inputId) : null;
  try {
    validatePackageManifest(runPackage);
    validatePackageManifest(input);
    if (inputId !== expectedInput || input.repository_id !== runPackage.repository_id) throw new Error("stage input lineage or repository mismatch");
  } catch (cause) {
    dispatch.status = "input-invalid"; dispatch.findings = [cause.message]; return view;
  }
  // Project only explicit typed identity. A reference is not acceptance or permission.
  const taskRefs = [...new Set((run.input_refs ?? [])
    .filter(ref => ref && typeof ref === "object" && ref.kind === "task" && typeof ref.id === "string")
    .map(ref => ref.id))];
  const admittedTaskRef = state.brownfield_admission?.task_ref ?? null;
  if (admittedTaskRef && taskRefs.some(ref => ref !== admittedTaskRef)) {
    dispatch.status = "input-invalid"; dispatch.findings = ["Run Task refs conflict with Brownfield admission"]; return view;
  }
  const taskRef = admittedTaskRef ?? (taskRefs.length === 1 ? taskRefs[0] : null);
  dispatch.input = { run_id: run.run_id, run_input_package_id: runPackage.package_id, stage_input_package_id: input.package_id, aggregate_sha256: input.aggregate_sha256, repository_id: input.repository_id, task_ref: taskRef };
  if (attempt) {
    dispatch.status = "resume-existing-attempt"; dispatch.attempt_ref = attempt.attempt_id;
    dispatch.host_checks.unshift("reconcile this exact Attempt before any new dispatch"); return view;
  }
  // The existing implementation entry consumes the accepted Task produced by
  // task-planning. Earlier stages must not acquire a new Task/Ready prerequisite.
  if (!taskRef && stage.entry_conditions.includes("task-planning-complete")) {
    dispatch.host_checks.unshift("bind the current accepted Task through the original owner; absent or ambiguous Task refs do not establish implementation readiness");
  }
  if (stage.execution_kind === "host") {
    dispatch.status = "host-verification-required"; dispatch.host_adapter = stage.host_adapter; return view;
  }
  if (stage.execution_kind === "kernel") { dispatch.status = "kernel-owned"; return view; }
  const candidates = stage.capability_resolution.candidates;
  if (capabilityId && !candidates.includes(capabilityId)) {
    dispatch.status = "capability-selection-invalid"; return view;
  }
  const selected = capabilityId ?? (candidates.length === 1 ? candidates[0] : null);
  if (!selected) {
    dispatch.status = "capability-ambiguous"; dispatch.selector = stage.capability_resolution.selector;
    dispatch.candidates = candidates; return view;
  }
  dispatch.capability_id = selected;
  dispatch.capability_version = registry.capability_contracts[selected].version;
  if (!catalog) { dispatch.status = "native-discovery-required"; return view; }
  validateCapabilityRegistry(catalog);
  const findings = validateCapabilityAlignment({ ...registry, stages: [{ ...stage, capability_resolution: { candidates: [selected] } }], interrupts: [] }, catalog);
  if (findings.length) { dispatch.status = "capability-incompatible"; dispatch.findings = findings; return view; }
  if (!manifest) { dispatch.status = "adapter-metadata-required"; return view; }
  try {
    const resolution = resolveCapability(catalog.capabilities.find(row => row.capability_id === selected), manifest, { registryContract: catalog.contract_version, adapterId });
    dispatch.contract_resolution = resolution;
    dispatch.status = resolution.selection_required ? "adapter-ambiguous" : "contract-compatible";
  } catch (cause) {
    if (cause.exitCode !== 3) throw cause;
    dispatch.status = "capability-unavailable"; dispatch.findings = [cause.code];
  }
  return view;
}
