import { realpath } from "node:fs/promises";
import { prepareInstall, applyInstall, verifyPreparedInstall } from "../../scripts/install-skill.mjs";
import { assert, freeze, hash, text } from "./common.mjs";

const candidates = new WeakMap();
const pendingActivations = new Map();
async function authorized(host, binding, effects) {
  assert(typeof host?.authorize === "function", "MAINTENANCE_HOST_REQUIRED");
  const grant = await host.authorize(binding);
  assert(grant?.granted === true && grant.binding_sha256 === hash(binding) && text(grant.authorization_ref), "MAINTENANCE_AUTHORIZATION_REQUIRED");
  for (const kind of ["user_effects", "host_effects", "capability_effects"]) assert(Array.isArray(grant[kind]) && effects.every(effect => grant[kind].includes(effect)), "MAINTENANCE_AUTHORIZATION_INTERSECTION");
  return grant;
}

// Production callers supply their own trusted, native source/lease/activation
// bridge. Nothing is loaded from repository JSON or selected by executable path.
export async function prepareDistributionCandidate({ source, target, runningRoot, host, runtimeDependencies = true }) {
  assert(typeof host?.verifySource === "function" && typeof host.acquireLease === "function", "MAINTENANCE_HOST_REQUIRED");
  assert(text(runningRoot), "MAINTENANCE_RUNNING_ROOT_REQUIRED");
  const running = await realpath(runningRoot);
  let plan = await prepareInstall(source, target, { runningRoot: running, runtimeDependencies });
  const sourceEvidence = await host.verifySource({ source, snapshot_sha256: plan.snapshot_sha256 });
  assert(sourceEvidence?.verified === true && sourceEvidence.snapshot_sha256 === plan.snapshot_sha256 && text(sourceEvidence.identity) && text(sourceEvidence.revision) && text(sourceEvidence.evidence_ref), "MAINTENANCE_SOURCE_UNVERIFIED");
  const fixedSnapshot = plan.snapshot_sha256;
  plan = await prepareInstall(source, target, { runningRoot: running, runtimeDependencies, sourceIdentity: { identity: sourceEvidence.identity, revision: sourceEvidence.revision, evidence_ref: sourceEvidence.evidence_ref } });
  assert(plan.snapshot_sha256 === fixedSnapshot, "MAINTENANCE_SOURCE_STALE");
  const binding = freeze({ effect: "prepare-install", target: plan.target, running_root: running, source: sourceEvidence, snapshot_sha256: plan.snapshot_sha256, effects: ["install", ...(plan.runtime_dependency_management ? ["dependency-refresh"] : [])] });
  const lease = await host.acquireLease(binding);
  assert(lease?.exclusive === true && typeof lease.isCurrent === "function" && typeof lease.release === "function", "MAINTENANCE_SINGLE_WRITER_REQUIRED");
  try {
    const authorization = await authorized(host, binding, binding.effects);
    assert(await lease.isCurrent(), "MAINTENANCE_LEASE_LOST");
    const result = await applyInstall(plan, { checkpoint: async () => assert(await lease.isCurrent(), "MAINTENANCE_LEASE_LOST") });
    assert(await lease.isCurrent(), "MAINTENANCE_LEASE_LOST");
    await verifyPreparedInstall(plan);
    const candidate = freeze({ status: "prepared", target: plan.target, source: sourceEvidence, snapshot_sha256: plan.snapshot_sha256, authorization_ref: authorization.authorization_ref, loaded: "not-verified", behavior: "not-verified", runtime: result.status });
    candidates.set(candidate, { plan, binding, activated: false });
    return candidate;
  } finally { await lease.release(); }
}

export async function activateDistributionCandidate(candidate, host) {
  const state = candidates.get(candidate);
  assert(state, "MAINTENANCE_CANDIDATE_RECOLLECT_REQUIRED");
  if (state.activated) return { status: "reconciliation-required", reason: "activation-already-submitted", replayed: false };
  if (!["activateOnce", "readActivationState", "readActivationBinding", "observeLoaded", "observeBehavior", "acquireLease"].every(key => typeof host?.[key] === "function")) return { status: "prepared", reason: "native-activation-unavailable", loaded: "not-verified" };
  const activationBinding = await host.readActivationBinding(candidate);
  assert(activationBinding && text(activationBinding.owner_id) && text(activationBinding.identity) && text(activationBinding.before_sha256), "MAINTENANCE_ACTIVATION_BINDING_REQUIRED");
  const ownerKey = hash({ owner_id: activationBinding.owner_id, host_identity: activationBinding.identity });
  assert(!pendingActivations.has(ownerKey), "MAINTENANCE_ACTIVATION_RECONCILIATION_REQUIRED");
  const operationId = hash({ candidate_sha256: candidate.snapshot_sha256, target: candidate.target, owner_id: activationBinding.owner_id, host_identity: activationBinding.identity });
  const binding = freeze({ operation_id: operationId, effect: "activate", candidate_sha256: candidate.snapshot_sha256, target: candidate.target, running_root: state.binding.running_root, host_binding: activationBinding });
  const lease = await host.acquireLease(binding);
  assert(lease?.exclusive === true && typeof lease.isCurrent === "function" && typeof lease.release === "function", "MAINTENANCE_SINGLE_WRITER_REQUIRED");
  let releaseOnExit = true;
  try {
    assert(!pendingActivations.has(ownerKey), "MAINTENANCE_ACTIVATION_RECONCILIATION_REQUIRED");
    await authorized(host, binding, ["activate"]);
    assert(await lease.isCurrent(), "MAINTENANCE_LEASE_LOST");
    assert(hash(await host.readActivationBinding(candidate)) === hash(activationBinding), "MAINTENANCE_ACTIVATION_STALE");
    await verifyPreparedInstall(state.plan);
    const previous = await host.readActivationState(binding);
    if (previous?.state !== "not-submitted") return { status: "reconciliation-required", reason: "native-activation-may-have-run", replayed: false };
    assert(hash(await host.readActivationBinding(candidate)) === hash(activationBinding), "MAINTENANCE_ACTIVATION_STALE");
    assert(await lease.isCurrent(), "MAINTENANCE_LEASE_LOST");
    // Mark before invocation: an uncertain native call is reconciled, never replayed.
    state.activated = true;
    releaseOnExit = false;
    pendingActivations.set(ownerKey, { binding, lease, candidate });
    try {
      // Native host MUST atomically compare host_binding and fence this lease
      // in the same transaction as deduplicating operation_id and activation.
      const receipt = await host.activateOnce(binding, lease);
      assert(receipt?.status === "committed" && receipt.writer_stopped === true && receipt.binding_sha256 === hash(binding), "MAINTENANCE_ACTIVATION_RECEIPT_REQUIRED");
      pendingActivations.delete(ownerKey); releaseOnExit = true;
    } catch { return { status: "partial", reason: "activation-outcome-unknown", operation_id: operationId, reconciliation_required: true, replayed: false }; }
    const loaded = await host.observeLoaded(binding);
    const behavior = await host.observeBehavior(binding);
    const verified = loaded?.snapshot_sha256 === candidate.snapshot_sha256 && loaded.target === candidate.target && text(loaded.session_id) && text(loaded.evidence_ref) && behavior?.passed === true && text(behavior.evidence_ref);
    return { status: verified ? "verified" : "not-verified", loaded, behavior, evidence_scope: "host-provided; M5 requires separate live environment evidence" };
  } finally { if (releaseOnExit) await lease.release(); }
}

// Never retry an unknown native submission. Only trusted owner readback may
// prove its writer stopped, including after a host-side durable recovery.
export async function reconcileDistributionActivation(candidate, host) {
  const pending = [...pendingActivations.entries()].find(([, item]) => item.candidate === candidate);
  assert(pending && typeof host?.readActivationState === "function", "MAINTENANCE_ACTIVATION_RECONCILIATION_REQUIRED");
  const [key, item] = pending;
  const observed = await host.readActivationState(item.binding);
  assert(observed?.writer_stopped === true && observed.binding_sha256 === hash(item.binding) && ["committed", "not-applied"].includes(observed.state) && text(observed.evidence_ref), "MAINTENANCE_ACTIVATION_WRITER_UNCONFIRMED");
  await item.lease.release(); pendingActivations.delete(key);
  return { status: "recollect-required", state: observed.state, operation_id: item.binding.operation_id, replayed: false };
}
