import { deepFreeze, sha256 } from "./utils.mjs";
import { validatePackageManifest } from "./package-manifest.mjs";

/** Neutral port for an artifact whose contract remains externally owned. */
export const TYPED_ARTIFACT_INPUT_CONSUMER_VERSION = "forgeway-typed-artifact-input/1";
export const TYPED_ARTIFACT_INPUT_VALIDATOR_ID = "forgeway.typed-artifact-input/1";
export const TYPED_ARTIFACT_INPUT_FAILURE_CODES = Object.freeze({
  CLAIM_NOT_OWNED: "TYPED_ARTIFACT_INPUT_CLAIM_NOT_OWNED",
  ADAPTER_UNAVAILABLE: "TYPED_ARTIFACT_INPUT_ADAPTER_UNAVAILABLE",
  PACKAGE_MISMATCH: "TYPED_ARTIFACT_INPUT_PACKAGE_MISMATCH",
  HANDOFF_INVALID: "TYPED_ARTIFACT_INPUT_HANDOFF_INVALID",
  ARTIFACT_MISSING: "TYPED_ARTIFACT_INPUT_ARTIFACT_MISSING",
  ARTIFACT_HASH_MISMATCH: "TYPED_ARTIFACT_INPUT_ARTIFACT_HASH_MISMATCH",
  ARTIFACT_METADATA_MISMATCH: "TYPED_ARTIFACT_INPUT_ARTIFACT_METADATA_MISMATCH",
  CONTRACT_UNSUPPORTED: "TYPED_ARTIFACT_INPUT_CONTRACT_UNSUPPORTED",
  ARTIFACT_INELIGIBLE: "TYPED_ARTIFACT_INPUT_ARTIFACT_INELIGIBLE",
  ATTESTATION_MISMATCH: "TYPED_ARTIFACT_INPUT_ATTESTATION_MISMATCH"
});

const SHA256 = /^[0-9a-f]{64}$/;
const denied = (code, reason) => deepFreeze({ granted: false, code, reason });
const bytes = (value) => Buffer.isBuffer(value) ? value : value instanceof Uint8Array ? Buffer.from(value) : typeof value === "string" ? Buffer.from(value) : null;
const safePath = (value) => typeof value === "string" && value.length > 0 && !value.startsWith("/") && !value.startsWith("~") && !/^[A-Za-z]:[\\/]/.test(value) && !value.includes("\\") && !value.split("/").includes("..");
const sameProducer = (left, right) => left?.capability_id === right?.capability_id && left?.capability_version === right?.capability_version;

function packageArtifact(resultPackage, artifactPath, readArtifact) {
  if (!safePath(artifactPath)) return denied(TYPED_ARTIFACT_INPUT_FAILURE_CODES.HANDOFF_INVALID, "artifact path must be package-relative");
  const entry = resultPackage.files.find((candidate) => candidate.path === artifactPath);
  if (!entry || entry.exists === false || !SHA256.test(entry.sha256 ?? "")) return denied(TYPED_ARTIFACT_INPUT_FAILURE_CODES.ARTIFACT_MISSING, "Result Package does not contain the external artifact");
  let raw;
  try { raw = bytes(readArtifact(artifactPath)); } catch (error) { return denied(TYPED_ARTIFACT_INPUT_FAILURE_CODES.ARTIFACT_MISSING, `artifact reader failed: ${error.message}`); }
  if (!raw) return denied(TYPED_ARTIFACT_INPUT_FAILURE_CODES.ARTIFACT_MISSING, "artifact reader returned no bytes");
  const artifact_sha256 = sha256(raw);
  if (artifact_sha256 !== entry.sha256) return denied(TYPED_ARTIFACT_INPUT_FAILURE_CODES.ARTIFACT_HASH_MISMATCH, "artifact bytes do not match the Result Package");
  if (raw.byteLength !== entry.bytes) return denied(TYPED_ARTIFACT_INPUT_FAILURE_CODES.ARTIFACT_METADATA_MISMATCH, "artifact byte length does not match the Result Package");
  return { raw, artifact_sha256 };
}

/**
 * Validates package closure and an opaque host attestation only. Contract
 * parsing remains entirely in validateExternalArtifact.
 */
export function evaluateTypedArtifactInputObservation(observation, context = {}, adapters = {}) {
  const resultPackage = context.result_package;
  if (!resultPackage || resultPackage.package_id !== observation?.result_package_id) return denied(TYPED_ARTIFACT_INPUT_FAILURE_CODES.PACKAGE_MISMATCH, "Observation must bind the exact Result Package");
  try { validatePackageManifest(resultPackage); } catch (error) { return denied(TYPED_ARTIFACT_INPUT_FAILURE_CODES.PACKAGE_MISMATCH, `Result Package manifest is invalid: ${error.message}`); }
  if (typeof adapters.readArtifact !== "function" || typeof adapters.validateExternalArtifact !== "function") return denied(TYPED_ARTIFACT_INPUT_FAILURE_CODES.ADAPTER_UNAVAILABLE, "explicit artifact reader and external-contract validator adapters are required");

  const payload = observation?.payload;
  const binding = payload?.binding;
  if (observation?.kind !== "artifact-validation" || payload?.validator_id !== TYPED_ARTIFACT_INPUT_VALIDATOR_ID || payload?.consumer_version !== TYPED_ARTIFACT_INPUT_CONSUMER_VERSION || payload?.valid !== true || !binding || typeof binding !== "object" || !SHA256.test(payload.artifact_hash ?? "") || observation.artifact_hash !== payload.artifact_hash || !safePath(binding.artifact_path) || typeof binding.contract_id !== "string" || binding.contract_id.length === 0 || typeof binding.contract_version !== "string" || binding.contract_version.length === 0 || typeof binding.claim_ref !== "string" || binding.claim_ref.length === 0 || !sameProducer(binding.producer, observation.producer) || !Array.isArray(observation.claim_refs) || observation.claim_refs.length !== 1 || observation.claim_refs[0] !== binding.claim_ref) {
    return denied(TYPED_ARTIFACT_INPUT_FAILURE_CODES.HANDOFF_INVALID, "typed artifact Observation must bind its contract, producer, claim, and hash");
  }
  const artifact = packageArtifact(resultPackage, binding.artifact_path, adapters.readArtifact);
  if (artifact.granted === false) return artifact;
  if (artifact.artifact_sha256 !== observation.artifact_hash) return denied(TYPED_ARTIFACT_INPUT_FAILURE_CODES.ARTIFACT_HASH_MISMATCH, "Observation artifact hash does not bind the external artifact bytes");

  const request = deepFreeze({ contract_id: binding.contract_id, contract_version: binding.contract_version, claim_ref: binding.claim_ref, producer: { ...observation.producer }, artifact_path: binding.artifact_path, artifact_sha256: artifact.artifact_sha256, result_package_id: resultPackage.package_id, artifact_bytes_base64: artifact.raw.toString("base64") });
  let attestation;
  try { attestation = adapters.validateExternalArtifact(request); } catch (error) { return denied(TYPED_ARTIFACT_INPUT_FAILURE_CODES.CONTRACT_UNSUPPORTED, `external-contract validator failed: ${error.message}`); }
  if (!attestation || attestation.granted !== true) return denied(TYPED_ARTIFACT_INPUT_FAILURE_CODES.ARTIFACT_INELIGIBLE, "external-contract validator did not attest eligibility");
  if (typeof attestation.receipt !== "string" || attestation.receipt.length === 0 || attestation.contract_id !== binding.contract_id || attestation.contract_version !== binding.contract_version || attestation.claim_ref !== binding.claim_ref || !sameProducer(attestation.producer, observation.producer) || attestation.artifact_sha256 !== artifact.artifact_sha256 || attestation.result_package_id !== resultPackage.package_id) {
    return denied(TYPED_ARTIFACT_INPUT_FAILURE_CODES.ATTESTATION_MISMATCH, "external-contract attestation must bind contract, producer, claim, artifact hash, and Result Package exactly");
  }
  return deepFreeze({ granted: true, code: "TYPED_ARTIFACT_INPUT_ACCEPTED", receipt: attestation.receipt, contract_id: binding.contract_id, contract_version: binding.contract_version, claim_ref: binding.claim_ref, artifact_sha256: artifact.artifact_sha256, result_package_id: resultPackage.package_id });
}

export function createTypedArtifactInputAuthorizer(adapters = {}) {
  if (!Array.isArray(adapters.owned_claim_refs) || adapters.owned_claim_refs.length === 0) {
    throw new Error("typed artifact input authorizer requires explicit non-empty owned_claim_refs");
  }
  const ownedClaimRefs = new Set(adapters.owned_claim_refs);
  if (ownedClaimRefs.size !== adapters.owned_claim_refs.length || ![...ownedClaimRefs].every((claimRef) => typeof claimRef === "string" && claimRef.length > 0)) {
    throw new Error("typed artifact input authorizer owned_claim_refs must contain unique non-empty strings");
  }
  return (observation, context) => {
    const ownsClaim = observation?.claim_refs?.some((claimRef) => ownedClaimRefs.has(claimRef));
    if (!ownsClaim && observation?.payload?.validator_id !== TYPED_ARTIFACT_INPUT_VALIDATOR_ID && typeof adapters.fallbackAuthorizer === "function") {
      return adapters.fallbackAuthorizer(observation, context);
    }
    // Contract/bytes validation cannot expand this authorizer's claim authority.
    if (!Array.isArray(observation?.claim_refs) || observation.claim_refs.length !== 1 || !ownedClaimRefs.has(observation.claim_refs[0])) {
      return { granted: false, receipt: `forgeway:${TYPED_ARTIFACT_INPUT_FAILURE_CODES.CLAIM_NOT_OWNED}` };
    }
    const result = evaluateTypedArtifactInputObservation(observation, context, adapters);
    return result.granted ? { granted: true, receipt: result.receipt } : { granted: false, receipt: `forgeway:${result.code}` };
  };
}

export function typedArtifactInputGatePredicate({ claim_ref, applicable = true, environments = ["local"] } = {}) {
  if (typeof claim_ref !== "string" || claim_ref.length === 0) throw new Error("typed artifact input gate predicate requires a claim_ref");
  return deepFreeze({ applicable, missing_state: "not-verified", negative_state: "unsatisfied", stale_state: "stale", mode: "all", requirements: [{ id: `typed-artifact-input:${claim_ref}`, kind: "artifact-validation", environments, claim_refs: [claim_ref], outcomes: ["satisfied"], min_count: 1, package_binding: "result" }] });
}


/**
 * Optional owner-acceptance boundary for normative machine consumers. The host
 * supplies a fixed current acceptance context and trusted CODE qualifiers; no
 * artifact JSON, status tag or successful parse authenticates an owner decision.
 * The target owner still owns semantics, unresolved dimensions and wire validation.
 * This is a disposable adapter to the existing typed-artifact port, not a ledger.
 */
export function createAcceptedArtifactValidator({ acceptance, qualifyAcceptance, validateArtifact } = {}) {
  const boundedRef = value => typeof value === "string" && value.length > 0 && value.length <= 256;
  const keys = ["owner_ref", "scope_ref", "source_basis_sha256", "result_package_id", "artifact_sha256", "contract_id", "contract_version", "purpose"];
  if (!acceptance || Object.keys(acceptance).some(key => !keys.includes(key)) || !keys.every(key => boundedRef(acceptance[key])) || !SHA256.test(acceptance.source_basis_sha256) || !SHA256.test(acceptance.artifact_sha256) || acceptance.purpose !== "normative-wire-schema" || typeof qualifyAcceptance !== "function" || typeof validateArtifact !== "function") {
    throw new Error("typed artifact acceptance requires an exact current host context and owner/validator code ports");
  }
  const current = deepFreeze({ ...acceptance });
  return request => {
    // Exact content/contract/package checks precede both professional ports.
    if (["artifact_sha256", "result_package_id", "contract_id", "contract_version"].some(key => request[key] !== current[key])) return denied("TYPED_ARTIFACT_ACCEPTANCE_STALE", "artifact does not match the current acceptance context");
    const qualificationRequest = deepFreeze({ ...request, acceptance: current });
    const decision = qualifyAcceptance(qualificationRequest);
    if (!decision || decision.status !== "authoritative" || decision.purpose !== current.purpose || !boundedRef(decision.receipt) || !Array.isArray(decision.unresolved_dimensions) || decision.unresolved_dimensions.length || keys.some(key => decision[key] !== current[key]) || decision.claim_ref !== request.claim_ref || decision.artifact_path !== request.artifact_path || !sameProducer(decision.producer, request.producer)) {
      return denied("TYPED_ARTIFACT_ACCEPTANCE_REQUIRED", "current owner acceptance for normative consumption is missing or unresolved");
    }
    // The wire validator sees the already-qualified receipt. It must still return
    // the existing exact typed-artifact attestation; lint is not owner acceptance.
    const validated = validateArtifact(deepFreeze({ ...request, acceptance_receipt: decision.receipt }));
    if (!validated || validated.granted !== true || !boundedRef(validated.receipt)) return denied("TYPED_ARTIFACT_WIRE_VALIDATION_REQUIRED", "native artifact validation did not attest eligibility");
    return deepFreeze({ ...validated, receipt: `${decision.receipt}|${validated.receipt}` });
  };
}
