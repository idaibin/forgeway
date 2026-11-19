import { createDeliveryStore, createTypedArtifactInputAuthorizer,
  evaluateTypedArtifactInputObservation, deepFreeze, sha256 } from "../delivery/index.mjs";
import { validateContextProjection } from "./index.mjs";

function requireValue(condition, message, code) {
  if (condition) return;
  const error = new Error(message);
  error.code = code;
  error.exitCode = 3;
  throw error;
}

/**
 * Capture one externally owned native artifact in an explicitly selected Run.
 * The host supplies its codec/attestation; native terminal status is never a gate.
 * The returned in-memory store is owned (and closed) by the caller.
 */
export function createNativeArtifactRun({ inputPackage, resultPackage, policy, run,
  attempt, observation, adapters, nativeSessionId } = {}) {
  requireValue(typeof run?.run_id === "string" && /^run:[A-Za-z0-9._:-]+$/.test(run.run_id) &&
    run.run_id !== nativeSessionId, "an explicit Forgeway Run distinct from the native session is required", "NATIVE_RUN_ID_REQUIRED");
  requireValue(typeof nativeSessionId === "string" && nativeSessionId.length > 0 &&
    observation?.producer?.session_id === nativeSessionId,
    "native source identity must bind the Observation producer", "NATIVE_SESSION_BINDING_MISMATCH");
  requireValue(observation?.payload?.binding?.producer?.session_id === nativeSessionId,
    "native source identity must bind the artifact handoff producer", "NATIVE_SESSION_BINDING_MISMATCH");
  requireValue(observation?.permission?.granted === true &&
    typeof observation.permission.authorization_ref === "string" && observation.permission.authorization_ref.length > 0,
    "current scoped source-capture authorization is required", "NATIVE_CAPTURE_AUTHORIZATION_REQUIRED");
  requireValue(inputPackage?.basis && resultPackage?.basis && inputPackage.repository_id === resultPackage.repository_id &&
    sha256(inputPackage?.basis) === sha256(resultPackage?.basis),
    "source capture must use one fixed repository/basis", "NATIVE_CAPTURE_BASIS_MISMATCH");
  requireValue(run.input_basis_package_id === inputPackage.package_id && attempt?.run_id === run.run_id &&
    attempt.result_package_id === resultPackage.package_id && observation.run_id === run.run_id &&
    observation.attempt_id === attempt.attempt_id && observation.result_package_id === resultPackage.package_id,
    "Run, Attempt and native Observation must bind the exact Packages", "NATIVE_CAPTURE_IDENTITY_MISMATCH");
  requireValue(["succeeded", "failed", "blocked", "cancelled"].includes(attempt.status),
    "host capture status must be explicit; it cannot be inferred from native finish", "NATIVE_CAPTURE_STATUS_REQUIRED");
  const nativeAdapters = { ...adapters };
  if (typeof adapters?.validateExternalArtifact === "function") {
    nativeAdapters.validateExternalArtifact = (request) => {
      const attestation = adapters.validateExternalArtifact(request);
      if (attestation?.granted === true) {
        requireValue(request.producer?.session_id === nativeSessionId &&
          attestation.producer?.session_id === nativeSessionId,
          "native source attestation producer must bind the selected session", "NATIVE_ATTESTATION_SESSION_MISMATCH");
      }
      return attestation;
    };
  }
  const authorization = evaluateTypedArtifactInputObservation(observation, { result_package: resultPackage }, nativeAdapters);
  requireValue(authorization.granted, authorization.reason, authorization.code);
  const store = createDeliveryStore({ authorizeObservation: createTypedArtifactInputAuthorizer({
    ...nativeAdapters, owned_claim_refs: observation.claim_refs
  }) });
  try {
    store.createPackage(inputPackage);
    store.createPackage(resultPackage);
    store.registerGatePolicy(policy);
    const recordedRun = store.createRun(run);
    const recordedAttempt = store.createAttempt(attempt);
    const recordedObservation = store.recordObservation(observation);
    requireValue(recordedObservation.validation.eligible &&
      recordedObservation.validation.authorization_receipt === authorization.receipt,
      "host attestation changed during source capture", "NATIVE_CAPTURE_ATTESTATION_CHANGED");
    return { store, run: recordedRun, attempt: recordedAttempt,
      observation: recordedObservation, authorization };
  } catch (error) {
    store.close();
    throw error;
  }
}

/** Fixed, read-only UI view of a validated Context Projection; no demo fallback. */
export function exportNativeWorkspace(projection, { verifyExport } = {}) {
  validateContextProjection(projection);
  const delivery = projection.basis.delivery;
  requireValue(delivery.result_package_id && Object.keys(projection.gate_projection.predicates).length > 0,
    "a result-bound projection with gates is required", "NATIVE_EXPORT_RESULT_REQUIRED");
  requireValue(/^[0-9a-f]{64}$/.test(delivery.events_sha256 ?? ""),
    "the fixed delivery event bytes must be identified", "NATIVE_EXPORT_IDENTITY_REQUIRED");
  requireValue(typeof verifyExport === "function", "an explicit trusted host export verifier is required", "NATIVE_EXPORT_TRUST_REQUIRED");
  const request = deepFreeze({ projection_hash: projection.projection_hash,
    events_sha256: delivery.events_sha256, run_id: delivery.run_id,
    input_package_id: delivery.input_package_id, input_package_sha256: delivery.input_package_sha256,
    result_package_id: delivery.result_package_id, result_package_sha256: delivery.result_package_sha256,
    input_basis: delivery.input_basis, result_basis: delivery.result_basis });
  const attestation = verifyExport(request);
  requireValue(attestation?.granted === true && typeof attestation.receipt === "string" && attestation.receipt.length > 0 &&
    Object.entries(request).every(([key, value]) => Object.hasOwn(attestation, key) && sha256(attestation[key]) === sha256(value)),
    "host export receipt must bind the exact projection/events/Run/Packages/basis", "NATIVE_EXPORT_ATTESTATION_MISMATCH");
  const gates = Object.entries(projection.gate_projection.predicates).map(([id, gate]) => ({
    id, label: id, owner: "source gate owner", description: "Imported result-bound gate evidence",
    state: gate.state, evidence_refs: gate.observation_ids ?? [],
    limitation: ["satisfied", "not-applicable"].includes(gate.state) ? null : "Required evidence remains unavailable or ineligible."
  }));
  const workspace = { schema_version: "forgeway-product-ui/v2", mode: "fixed-native-snapshot",
    outcome: "Read the selected native artifact capture without inferring business acceptance.",
    authorizes_execution: false, view_kind: "delivery-gates",
    source: { projection_hash: projection.projection_hash, export_receipt: attestation.receipt,
      events_sha256: delivery.events_sha256 },
    run: { run_id: delivery.run_id, basis: delivery.result_basis, result_package_id: delivery.result_package_id },
    gates, summary: { satisfied: gates.filter((gate) => gate.state === "satisfied").length,
      needs_attention: gates.filter((gate) => !["satisfied", "not-applicable"].includes(gate.state)).length,
      total: gates.length } };
  return deepFreeze({ ...workspace, projection_hash: sha256(workspace) });
}
