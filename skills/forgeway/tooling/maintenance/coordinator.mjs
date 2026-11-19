import { randomUUID } from "node:crypto";
import path from "node:path";
import { typedArtifactValidation } from "../artifact-validation.mjs";
import { validatePackageManifest } from "../delivery/package-manifest.mjs";
import { assert, exactKeys, freeze, hash, relative, text, VERSION } from "./common.mjs";
import { isCollectedDiagnosis } from "./inspect.mjs";

const plans = new WeakSet();
const retainedLeases = new WeakMap();
function leasesFor(store) {
  if (!retainedLeases.has(store)) retainedLeases.set(store, new Map());
  return retainedLeases.get(store);
}
const CLAIMS = {
  "source-write": ["source", "behavior"],
  "install": ["installation", "dependencies"],
  "activate": ["loaded", "behavior"]
};
const contains = (scope, filename) => scope.some(entry => filename === entry || filename.startsWith(entry.replace(/\/\*\*$/u, "") + "/"));
function taskScope(task, repositoryId) {
  const basis = task.schema_version === "1.1" ? task.basis : [{ repository_id: repositoryId, commit_sha: task.basis.commit_sha }];
  assert(basis.length === 1 && basis[0].repository_id === repositoryId, "MAINTENANCE_ONE_REPOSITORY_REQUIRED");
  const paths = entries => entries.map(entry => {
    if (typeof entry === "string") return entry;
    assert(entry.repository_id === repositoryId, "MAINTENANCE_ONE_REPOSITORY_REQUIRED");
    return entry.path;
  });
  return { include: paths(task.scope.include), exclude: paths(task.scope.exclude), commit_sha: basis[0].commit_sha };
}

export function planMaintenance({ task, diagnosis, subjectId, inputPackage, effect, paths, guidanceSha256 }) {
  const validation = typedArtifactValidation("task", task);
  assert(!validation.schema_errors.length && !validation.semantic_errors.length, "MAINTENANCE_TASK_INVALID");
  assert(task.schema_version !== "1.2", "MAINTENANCE_EXECUTION_TASK_VERSION_UNAVAILABLE");
  assert(isCollectedDiagnosis(diagnosis), "MAINTENANCE_COLLECTOR_REQUIRED");
  assert(validatePackageManifest(inputPackage), "MAINTENANCE_PACKAGE_INVALID");
  const subject = diagnosis.subjects.find(item => item.id === subjectId);
  assert(subject?.kind === "component", "MAINTENANCE_COMPONENT_REQUIRED");
  assert(subject.profile === "forgeway-distribution", "MAINTENANCE_EXECUTION_PROFILE_UNAVAILABLE");
  assert(subject && subject.source.status === "observed", "MAINTENANCE_SOURCE_UNVERIFIED");
  assert(!subject.gaps.some(gap => gap.includes("mismatch")), "MAINTENANCE_EVIDENCE_CONFLICT");
  assert(subject.owners.length === 1, "MAINTENANCE_OWNER_UNAVAILABLE");
  const owner = subject.owners[0];
  assert(owner.id === task.owner.id, "MAINTENANCE_OWNER_MISMATCH");
  assert(CLAIMS[effect] && owner.effects.includes(effect), "MAINTENANCE_EFFECT_UNAVAILABLE");
  assert(subject.contract !== null && Array.isArray(subject.contract.required_peers) && !subject.gaps.includes("contract-unverified-or-incompatible"), "MAINTENANCE_CONTRACT_CONFLICT");
  assert((diagnosis.relations ?? []).filter(edge => edge.from === subjectId || edge.to === subjectId).every(edge => edge.compatible === true), "MAINTENANCE_CONTRACT_CONFLICT");
  const scope = taskScope(task, inputPackage.repository_id);
  assert(subject.source.repository_id === inputPackage.repository_id && subject.source.revision === inputPackage.basis.head_sha && subject.source.sha256 === inputPackage.aggregate_sha256, "MAINTENANCE_SOURCE_PACKAGE_MISMATCH");
  if (task.schema_version === "1.0") assert(task.basis.repository === subject.source.identity, "MAINTENANCE_TASK_REPOSITORY_MISMATCH");
  assert(scope.commit_sha === inputPackage.basis.head_sha, "MAINTENANCE_BASIS_MISMATCH");
  assert(Array.isArray(paths) && paths.length && paths.every(relative) && new Set(paths).size === paths.length, "MAINTENANCE_SCOPE_INVALID");
  assert(paths.every(filename => contains(scope.include, filename) && !contains(scope.exclude, filename)), "MAINTENANCE_SCOPE_EXPANSION");
  assert(/^[a-f0-9]{64}$/u.test(guidanceSha256), "MAINTENANCE_GUIDANCE_REQUIRED");
  const preconditions = {
    contract: subject.contract,
    compatibility: (diagnosis.relations ?? []).filter(edge => edge.from === subjectId || edge.to === subjectId),
    diagnosis_sha256: diagnosis.snapshot_sha256,
    config_sha256: diagnosis.config_sha256,
    config_file_sha256: diagnosis.config_file_sha256,
    source: subject.source,
    installed: subject.installed,
    loaded: subject.loaded,
    invocation: subject.invocation,
    owner_binding: owner.binding,
    guidance_sha256: guidanceSha256,
    input_package_id: inputPackage.package_id,
    before: paths.map(filename => ({ path: filename, file: inputPackage.files.find(file => file.path === filename) ?? null }))
  };
  const body = { schema_version: VERSION, task_id: task.id, task_sha256: hash(task), repository_id: inputPackage.repository_id, owner_id: owner.id, subject_id: subjectId, effect, paths: [...paths].sort(), claim_refs: CLAIMS[effect].map(claim => `maintenance:${claim}`), dependencies: [...task.dependencies], preconditions, authorizes_execution: false };
  const plan = freeze({ ...body, plan_sha256: hash(body) }); plans.add(plan); return plan;
}

function resultSourceRoot(basis) {
  if (basis.source_root === undefined) return undefined;
  assert(text(basis.source_root) && !basis.source_root.split("/").includes(".."), "MAINTENANCE_RESULT_SOURCE_ROOT_INVALID");
  const root = path.posix.normalize(basis.source_root).replace(/\/$/u, "");
  assert(root === "." || relative(root), "MAINTENANCE_RESULT_SOURCE_ROOT_INVALID");
  return root;
}
function validateResult(plan, before, after) {
  assert(validatePackageManifest(after), "MAINTENANCE_RESULT_INVALID");
  assert(after.repository_id === before.repository_id && after.basis.head_sha === before.basis.head_sha, "MAINTENANCE_RESULT_REPOSITORY_MISMATCH");
  assert(resultSourceRoot(after.basis) === resultSourceRoot(before.basis), "MAINTENANCE_RESULT_SOURCE_ROOT_MISMATCH");
  const allPaths = new Set([...before.files, ...after.files].map(file => file.path));
  for (const filename of allPaths) {
    const old = before.files.find(file => file.path === filename) ?? null;
    const next = after.files.find(file => file.path === filename) ?? null;
    assert(hash(old) === hash(next) || plan.paths.includes(filename), "MAINTENANCE_RESULT_SCOPE_EXPANSION");
  }
}
function hostPorts(host) {
  for (const port of ["readPreconditions", "acquireLease", "authorize", "execute", "captureResult", "observe", "completedDependencies"]) assert(typeof host?.[port] === "function", "MAINTENANCE_HOST_REQUIRED");
}

export async function executeMaintenance({ plan, inputPackage, store, policy, host, executionId = randomUUID() }) {
  assert(plans.has(plan), "MAINTENANCE_REPLAN_REQUIRED"); hostPorts(host);
  assert(text(executionId) && /^[A-Za-z0-9._:-]+$/u.test(executionId), "MAINTENANCE_EXECUTION_ID_INVALID");
  assert(inputPackage.package_id === plan.preconditions.input_package_id, "MAINTENANCE_PACKAGE_MISMATCH");
  const runId = `run:maintenance:${executionId}`, startedId = `attempt:maintenance:${executionId}:started`, terminalId = `attempt:maintenance:${executionId}:result`;
  const prior = store.getAttempt(terminalId);
  if (prior) {
    assert(prior.action.plan_sha256 === plan.plan_sha256, "MAINTENANCE_EXECUTION_CONFLICT");
    const previousObservations = store.listObservations(runId).filter(item => item.attempt_id === prior.attempt_id);
    const verified = prior.status === "succeeded" && prior.exit.execution_status === "succeeded" && plan.claim_refs.every(claim => previousObservations.some(item => item.claim_refs.length === 1 && item.claim_refs[0] === claim && item.validation.eligible && item.outcome === "satisfied"));
    return { status: prior.exit.reconciliation_required ? "partial" : verified ? (plan.effect === "install" ? "prepared" : "verified") : "not-verified", reconciliation_required: prior.exit.reconciliation_required === true, run_id: runId, attempt_id: prior.attempt_id, replayed: false, already_recorded: true };
  }
  assert(!store.getAttempt(startedId), "MAINTENANCE_RECONCILIATION_REQUIRED");
  const assertNoPending = () => {
  const attempts = store.snapshot().attempts;
  for (const previous of attempts.filter(item => item.status === "started" && item.action.repository_id === plan.repository_id)) {
    const overlaps = (previous.action.paths ?? []).some(filename => plan.paths.includes(filename));
    if (!overlaps) continue;
    const reconciled = attempts.find(item => item.action.reconciles_attempt_id === previous.attempt_id && item.exit.reconciliation_state === "before");
    const terminal = attempts.find(item => item.events.some(event => event.continues_attempt_id === previous.attempt_id));
    assert(reconciled || (terminal && !terminal.exit.reconciliation_required && previous.action.plan_sha256 !== plan.plan_sha256), "MAINTENANCE_RECONCILIATION_REQUIRED");
  }
  };
  assertNoPending();
  const lease = await host.acquireLease(freeze({ repository_id: plan.repository_id, owner_id: plan.owner_id, paths: plan.paths, plan_sha256: plan.plan_sha256 }));
  assert(lease?.exclusive === true && typeof lease.release === "function" && typeof lease.isCurrent === "function", "MAINTENANCE_SINGLE_WRITER_REQUIRED");
  let releaseOnExit = true;
  try {
    const check = async () => {
      assert(await lease.isCurrent(), "MAINTENANCE_LEASE_LOST");
      assert(hash(await host.readPreconditions(plan)) === hash(plan.preconditions), "MAINTENANCE_STALE");
      const completed = await host.completedDependencies(plan);
      assert(Array.isArray(completed), "MAINTENANCE_DEPENDENCY_PENDING");
      const completedIds = new Set();
      for (let index = 0; index < completed.length; index++) {
        const id = completed[index];
        assert(typeof id === "string", "MAINTENANCE_DEPENDENCY_PENDING"); completedIds.add(id);
      }
      assert(plan.dependencies.every(id => completedIds.has(id)), "MAINTENANCE_DEPENDENCY_PENDING");
      assert(await lease.isCurrent(), "MAINTENANCE_LEASE_LOST");
    };
    await check();
    const binding = freeze({ plan_sha256: plan.plan_sha256, task_sha256: plan.task_sha256, repository_id: plan.repository_id, owner_id: plan.owner_id, owner_binding: plan.preconditions.owner_binding, effect: plan.effect, paths: plan.paths, preconditions_sha256: hash(plan.preconditions), execution_id: executionId });
    const authority = await host.authorize(binding);
    assert(authority?.granted === true && authority.binding_sha256 === hash(binding) && text(authority.authorization_ref), "MAINTENANCE_AUTHORIZATION_REQUIRED");
    for (const scope of ["user_effects", "host_effects", "capability_effects"]) assert(Array.isArray(authority[scope]) && authority[scope].includes(plan.effect), "MAINTENANCE_AUTHORIZATION_INTERSECTION");
    await check();
    assertNoPending();
    store.registerPackage(inputPackage);
    const run = store.getRun(runId) ?? store.createRun({ run_id: runId, input_basis_package_id: inputPackage.package_id, capability_id: "forgeway.maintenance", input_refs: [plan.task_id, plan.plan_sha256], scope: plan.paths, policy, initiator: { id: plan.owner_id, kind: "trusted-host" } });
    assert(run.input_basis_package_id === inputPackage.package_id, "MAINTENANCE_EXECUTION_CONFLICT");
    store.createAttempt({ run_id: runId, attempt_id: startedId, status: "started", adapter: { id: plan.owner_id }, action: { plan_sha256: plan.plan_sha256, binding_sha256: hash(binding), repository_id: plan.repository_id, owner_id: plan.owner_id, paths: plan.paths } });
    let executionStatus, resultPackage, observations = [], failure = null;
    try {
      assert(await lease.isCurrent(), "MAINTENANCE_LEASE_LOST");
      executionStatus = (await host.execute(binding, lease))?.status;
      assert(["succeeded", "failed", "blocked", "cancelled"].includes(executionStatus), "MAINTENANCE_EXECUTION_UNKNOWN");
      assert(await lease.isCurrent(), "MAINTENANCE_LEASE_LOST");
      resultPackage = await host.captureResult(binding);
      validateResult(plan, inputPackage, resultPackage);
      for (const claim of plan.claim_refs) {
        const readback = await host.observe(binding, claim, resultPackage);
        exactKeys(readback, ["claim_ref", "status", "evidence_ref", "collector", "observed_state"]);
        const observed = { claim_ref: readback.claim_ref, status: readback.status, evidence_ref: readback.evidence_ref, collector: readback.collector, observed_state: readback.observed_state };
        assert(observed.claim_ref === claim && ["satisfied", "unsatisfied", "not-verified"].includes(observed.status) && text(observed.evidence_ref) && text(observed.collector) && text(observed.observed_state), "MAINTENANCE_OBSERVATION_INVALID");
        observations.push(observed);
      }
    } catch (error) {
      failure = "MAINTENANCE_EXECUTION_UNKNOWN";
      try {
        const code = error?.code;
        if (text(code)) failure = code;
      } catch { /* Diagnostic access cannot erase the original host failure. */ }
    }
    if (!resultPackage || failure) {
      releaseOnExit = false; leasesFor(store).set(startedId, lease);
      const attempt = store.createAttempt({ run_id: runId, attempt_id: terminalId, status: "failed", adapter: { id: plan.owner_id }, action: { plan_sha256: plan.plan_sha256 }, events: [{ continues_attempt_id: startedId }], exit: { maintenance_status: "partial", reason: failure ?? "result-unavailable", reconciliation_required: true } });
      return { status: "partial", run_id: runId, attempt_id: attempt.attempt_id, reason: failure, reconciliation_required: true };
    }
    store.registerPackage(resultPackage);
    const passed = observations.every(observed => observed.status === "satisfied") && executionStatus === "succeeded";
    const status = passed ? (plan.effect === "install" ? "prepared" : "verified") : "not-verified";
    const attempt = store.createAttempt({ run_id: runId, attempt_id: terminalId, result_package_id: resultPackage.package_id, status: passed ? "succeeded" : "failed", adapter: { id: plan.owner_id }, action: { plan_sha256: plan.plan_sha256 }, events: [{ continues_attempt_id: startedId }], exit: { execution_status: executionStatus, maintenance_status: "not-verified", evidence_requires_projection: true } });
    const recorded = observations.map(observed => store.recordObservation({ run_id: runId, attempt_id: attempt.attempt_id, result_package_id: resultPackage.package_id, kind: "runtime-observation", environment: "local", claim_refs: [observed.claim_ref], producer: { capability_id: "forgeway.maintenance", capability_version: "1.0.0", actor: plan.owner_id }, collector: { id: observed.collector, version: "1.0.0" }, permission: { mode: plan.effect, granted: true, authorization_ref: authority.authorization_ref }, limitations: ["Host-specific evidence; not a claim of M5 portability"], payload: { check_id: observed.claim_ref, observed_state: observed.observed_state, status: observed.status, evidence_ref: observed.evidence_ref, binding_sha256: hash(binding) } }));
    return { status: recorded.every(item => item.validation.eligible) ? status : "not-verified", run_id: runId, attempt_id: attempt.attempt_id, result_package_id: resultPackage.package_id, observations: recorded, replayed: false };
  } finally { if (releaseOnExit) await lease.release(); }
}

// Reconciliation never executes the old action. A trusted native owner must
// establish that its writer stopped and the exact before-state still holds.
export async function reconcileMaintenanceExecution({ store, attemptId, host }) {
  const attempt = store.getAttempt(attemptId);
  assert(attempt?.status === "started" && typeof host?.reconcile === "function", "MAINTENANCE_RECONCILIATION_REQUIRED");
  const readback = await host.reconcile(attempt);
  assert(readback?.writer_stopped === true && readback.binding_sha256 === attempt.action.binding_sha256 && text(readback.evidence_ref), "MAINTENANCE_WRITER_UNCONFIRMED");
  assert(readback.input_package_id === store.getRun(attempt.run_id).input_basis_package_id, "MAINTENANCE_RECONCILIATION_PACKAGE_MISMATCH");
  assert(readback.state === "before", "MAINTENANCE_RECOVERY_CONFLICT_OR_ALREADY_APPLIED");
  const recorded = store.createAttempt({ run_id: attempt.run_id, status: "cancelled", action: { reconciles_attempt_id: attemptId }, exit: { reconciliation_state: "before", evidence_ref: readback.evidence_ref } });
  if (leasesFor(store).has(attemptId)) { await leasesFor(store).get(attemptId).release(); leasesFor(store).delete(attemptId); }
  return { status: "safe-to-replan", attempt_id: recorded.attempt_id };
}
