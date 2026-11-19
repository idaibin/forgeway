import { deepFreeze, sha256 } from "./utils.mjs";
import { validatePackageManifest } from "./package-manifest.mjs";

export const DESIGN_COMPLETENESS_CONSUMER_VERSION = "forgeway-ui-design-completeness/1";
export const DESIGN_COMPLETENESS_CLAIM_REF = "gate:ui-design-complete";
export const DESIGN_COMPLETENESS_CAPABILITY = Object.freeze({
  capability_id: "ui.contract.specify",
  capability_version: "1.3.0"
});
export const DESIGN_COMPLETENESS_POLICY_VERSION = "ui-spec-design-completeness/1";
export const DESIGN_MD_SPEC_COMMIT = "9bf8eae67128b6cc55ad9bf86665767deb4c11cd";
export const DESIGN_MD_CLI_VERSION = "0.4.0";

export const DESIGN_COMPLETENESS_FAILURE_CODES = Object.freeze({
  ADAPTER_UNAVAILABLE: "DESIGN_COMPLETENESS_ADAPTER_UNAVAILABLE",
  CAPABILITY_UNSUPPORTED: "DESIGN_COMPLETENESS_CAPABILITY_UNSUPPORTED",
  HANDOFF_INVALID: "DESIGN_COMPLETENESS_HANDOFF_INVALID",
  PACKAGE_MISMATCH: "DESIGN_COMPLETENESS_PACKAGE_MISMATCH",
  ARTIFACT_MISSING: "DESIGN_COMPLETENESS_ARTIFACT_MISSING",
  ARTIFACT_HASH_MISMATCH: "DESIGN_COMPLETENESS_ARTIFACT_HASH_MISMATCH",
  ARTIFACT_METADATA_MISMATCH: "DESIGN_COMPLETENESS_ARTIFACT_METADATA_MISMATCH",
  FORMAT_INVALID: "DESIGN_FORMAT_INVALID",
  POLICY_UNSUPPORTED: "DESIGN_COMPLETENESS_POLICY_UNSUPPORTED",
  NOT_READY: "DESIGN_COMPLETENESS_NOT_READY",
  SOURCE_BINDING_INVALID: "DESIGN_COMPLETENESS_SOURCE_BINDING_INVALID",
  APPROVAL_BINDING_INVALID: "DESIGN_COMPLETENESS_APPROVAL_BINDING_INVALID",
  APPROVAL_STALE: "DESIGN_APPROVAL_STALE",
  APPROVAL_UNTRUSTED: "DESIGN_APPROVAL_UNTRUSTED"
});

const GOVERNED_GROUPS = Object.freeze(["colors", "typography", "spacing", "rounded", "components"]);
const SHA256 = /^[0-9a-f]{64}$/;

function denied(code, reason) {
  return deepFreeze({ granted: false, code, reason });
}

function safePath(value) {
  return typeof value === "string" && value.length > 0 &&
    !value.startsWith("/") && !value.startsWith("~") &&
    !/^[A-Za-z]:[\\/]/.test(value) && !value.includes("\\") &&
    !value.split("/").includes("..");
}

function bytes(value) {
  if (Buffer.isBuffer(value)) return value;
  if (value instanceof Uint8Array) return Buffer.from(value);
  if (typeof value === "string") return Buffer.from(value);
  return null;
}

function artifact(resultPackage, artifactPath, readArtifact) {
  if (!safePath(artifactPath)) return denied(DESIGN_COMPLETENESS_FAILURE_CODES.HANDOFF_INVALID, `invalid package-relative artifact path: ${artifactPath ?? "missing"}`);
  const entry = resultPackage?.files?.find((candidate) => candidate.path === artifactPath);
  if (!entry || entry.exists === false || !SHA256.test(entry.sha256 ?? "")) {
    return denied(DESIGN_COMPLETENESS_FAILURE_CODES.ARTIFACT_MISSING, `result package does not contain ${artifactPath}`);
  }
  let raw;
  try {
    raw = bytes(readArtifact(artifactPath));
  } catch (error) {
    return denied(DESIGN_COMPLETENESS_FAILURE_CODES.ARTIFACT_MISSING, `artifact reader failed for ${artifactPath}: ${error.message}`);
  }
  if (!raw) return denied(DESIGN_COMPLETENESS_FAILURE_CODES.ARTIFACT_MISSING, `artifact reader returned no bytes for ${artifactPath}`);
  const actual = sha256(raw);
  if (actual !== entry.sha256) return denied(DESIGN_COMPLETENESS_FAILURE_CODES.ARTIFACT_HASH_MISMATCH, `artifact bytes do not match Result Package: ${artifactPath}`);
  if (raw.byteLength !== entry.bytes) return denied(DESIGN_COMPLETENESS_FAILURE_CODES.ARTIFACT_METADATA_MISMATCH, `artifact byte length does not match Result Package: ${artifactPath}`);
  return { raw, sha256: actual };
}

function jsonArtifact(resultPackage, artifactPath, readArtifact) {
  const result = artifact(resultPackage, artifactPath, readArtifact);
  if (result.granted === false) return result;
  try {
    const value = JSON.parse(result.raw.toString("utf8"));
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("JSON root must be an object");
    return { ...result, value };
  } catch (error) {
    return denied(DESIGN_COMPLETENESS_FAILURE_CODES.HANDOFF_INVALID, `invalid JSON artifact ${artifactPath}: ${error.message}`);
  }
}

function producerStrip(value) {
  return typeof value === "string"
    ? value.replace(/^[\u0009-\u000d\u001c-\u001f\u0020\u0085\u00a0\u1680\u2000-\u200a\u2028\u2029\u202f\u205f\u3000]+|[\u0009-\u000d\u001c-\u001f\u0020\u0085\u00a0\u1680\u2000-\u200a\u2028\u2029\u202f\u205f\u3000]+$/gu, "")
    : "";
}

function trustedPrincipals(result) {
  const values = [result?.approved_by_principal_id, result?.proposer_principal_id, result?.implementer_principal_id];
  return values.every((value) => typeof value === "string" && value.length > 0) && new Set(values).size === values.length;
}

function tokenCoverage(completeness) {
  const tokenGroups = Array.isArray(completeness.token_groups) ? completeness.token_groups : [];
  const omitted = completeness.omitted_reasons && typeof completeness.omitted_reasons === "object" && !Array.isArray(completeness.omitted_reasons)
    ? completeness.omitted_reasons
    : {};
  if (new Set(tokenGroups).size !== tokenGroups.length || tokenGroups.some((group) => !GOVERNED_GROUPS.includes(group))) return false;
  if (Object.keys(omitted).some((group) => !GOVERNED_GROUPS.includes(group))) return false;
  for (const group of GOVERNED_GROUPS) {
    const hasTokens = tokenGroups.includes(group);
    const reason = omitted[group];
    const hasOmission = producerStrip(reason).length >= 12;
    if (hasTokens === hasOmission) return false;
  }
  if (completeness.shared_components === "present" && !tokenGroups.includes("components")) return false;
  if (completeness.shared_components === "unknown" && Object.hasOwn(omitted, "components")) return false;
  return ["present", "absent", "unknown"].includes(completeness.shared_components);
}

export function evaluateDesignCompletenessObservation(observation, context = {}, adapters = {}) {
  const resultPackage = context.result_package;
  if (!resultPackage || resultPackage.package_id !== observation?.result_package_id) {
    return denied(DESIGN_COMPLETENESS_FAILURE_CODES.PACKAGE_MISMATCH, "Observation must bind the exact Result Package");
  }
  try {
    validatePackageManifest(resultPackage);
  } catch (error) {
    return denied(DESIGN_COMPLETENESS_FAILURE_CODES.PACKAGE_MISMATCH, `Result Package manifest is invalid: ${error.message}`);
  }
  if (typeof adapters.readArtifact !== "function" || typeof adapters.authorizeApproval !== "function") {
    return denied(DESIGN_COMPLETENESS_FAILURE_CODES.ADAPTER_UNAVAILABLE, "explicit artifact and trusted approval adapters are required");
  }
  if (observation.kind !== "artifact-validation" ||
      observation.producer?.capability_id !== DESIGN_COMPLETENESS_CAPABILITY.capability_id ||
      observation.producer?.capability_version !== DESIGN_COMPLETENESS_CAPABILITY.capability_version ||
      !observation.claim_refs?.includes(DESIGN_COMPLETENESS_CLAIM_REF)) {
    return denied(DESIGN_COMPLETENESS_FAILURE_CODES.CAPABILITY_UNSUPPORTED, "Observation capability, kind, version, or claim ref is unsupported");
  }
  const payload = observation.payload;
  const binding = payload?.binding;
  if (payload?.validator_id !== DESIGN_COMPLETENESS_POLICY_VERSION || payload.valid !== true ||
      payload.consumer_version !== DESIGN_COMPLETENESS_CONSUMER_VERSION ||
      !SHA256.test(payload.artifact_hash ?? "") || observation.artifact_hash !== payload.artifact_hash ||
      !binding || typeof binding !== "object") {
    return denied(DESIGN_COMPLETENESS_FAILURE_CODES.HANDOFF_INVALID, "typed DESIGN completeness Observation is incomplete");
  }

  const resultArtifact = jsonArtifact(resultPackage, binding.completeness_result_path, adapters.readArtifact);
  if (resultArtifact.granted === false) return resultArtifact;
  if (resultArtifact.sha256 !== observation.artifact_hash) {
    return denied(DESIGN_COMPLETENESS_FAILURE_CODES.ARTIFACT_HASH_MISMATCH, "Observation artifact hash does not bind the completeness result bytes");
  }
  const design = artifact(resultPackage, binding.design_path, adapters.readArtifact);
  if (design.granted === false) return design;
  const source = artifact(resultPackage, binding.source_artifact_path, adapters.readArtifact);
  if (source.granted === false) return source;
  const approval = jsonArtifact(resultPackage, binding.approval_record_path, adapters.readArtifact);
  if (approval.granted === false) return approval;

  const result = resultArtifact.value;
  const completeness = result.shared_authority_completeness;
  if (result.design_path !== binding.design_path || result.design_sha256 !== design.sha256) {
    return denied(DESIGN_COMPLETENESS_FAILURE_CODES.APPROVAL_STALE, "completeness result does not bind the current DESIGN.md bytes");
  }
  if (result.official_format?.status !== "valid" || result.official_format?.result?.errors !== 0) {
    return denied(DESIGN_COMPLETENESS_FAILURE_CODES.FORMAT_INVALID, "official DESIGN.md lint did not pass");
  }
  if (result.official_format.spec_commit !== DESIGN_MD_SPEC_COMMIT || result.official_format.cli_version !== DESIGN_MD_CLI_VERSION) {
    return denied(DESIGN_COMPLETENESS_FAILURE_CODES.POLICY_UNSUPPORTED, "official DESIGN.md spec or CLI version is unsupported");
  }
  if (!completeness || completeness.policy_version !== DESIGN_COMPLETENESS_POLICY_VERSION) {
    return denied(DESIGN_COMPLETENESS_FAILURE_CODES.POLICY_UNSUPPORTED, "DESIGN completeness policy version is unsupported");
  }
  if (completeness.stage !== "adopted" || completeness.status !== "awaiting-trusted-approval-verification" ||
      !Array.isArray(completeness.errors) || completeness.errors.length !== 0 || !tokenCoverage(completeness)) {
    return denied(DESIGN_COMPLETENESS_FAILURE_CODES.NOT_READY, "local DESIGN completeness result is not ready for trusted approval verification");
  }
  if (completeness.source_artifact !== binding.source_artifact_path || completeness.source_sha256 !== source.sha256 ||
      producerStrip(completeness.source_ref).length === 0 ||
      !["approved", "verified-authority"].includes(completeness.source_status)) {
    return denied(DESIGN_COMPLETENESS_FAILURE_CODES.SOURCE_BINDING_INVALID, "selected source evidence does not close to the Result Package");
  }
  const approvalRecord = approval.value;
  if (completeness.approval_record !== binding.approval_record_path ||
      completeness.approval_record_sha256 !== approval.sha256 ||
      completeness.approval_design_sha256 !== design.sha256 ||
      approvalRecord.status !== "approved" || approvalRecord.design_sha256 !== design.sha256 ||
      completeness.approved_by !== approvalRecord.approved_by_id ||
      completeness.proposer !== approvalRecord.proposer_id ||
      completeness.implementer !== approvalRecord.implementer_id ||
      [approvalRecord.approved_by_id, approvalRecord.proposer_id, approvalRecord.implementer_id].some((value) => producerStrip(value).length === 0)) {
    return denied(DESIGN_COMPLETENESS_FAILURE_CODES.APPROVAL_BINDING_INVALID, "local approval record does not bind three named actors and exact artifact bytes");
  }

  let trusted;
  try {
    trusted = adapters.authorizeApproval(deepFreeze({
      design_sha256: design.sha256,
      result_package_id: resultPackage.package_id,
      completeness_result_sha256: resultArtifact.sha256,
      approval_record_sha256: approval.sha256,
      approved_by_id: approvalRecord.approved_by_id,
      proposer_id: approvalRecord.proposer_id,
      implementer_id: approvalRecord.implementer_id
    }));
  } catch (error) {
    return denied(DESIGN_COMPLETENESS_FAILURE_CODES.APPROVAL_UNTRUSTED, `trusted approval adapter failed: ${error.message}`);
  }
  if (!trusted || trusted.granted !== true || typeof trusted.receipt !== "string" || trusted.receipt.length === 0 ||
      trusted.design_sha256 !== design.sha256 || trusted.result_package_id !== resultPackage.package_id ||
      trusted.approval_record_sha256 !== approval.sha256 || !trustedPrincipals(trusted)) {
    return denied(DESIGN_COMPLETENESS_FAILURE_CODES.APPROVAL_UNTRUSTED, "host-trusted approval receipt is absent, lacks distinct canonical principals, or does not bind the exact design, package, and approval record");
  }
  return deepFreeze({
    granted: true,
    code: "DESIGN_COMPLETENESS_COMPLETE",
    receipt: trusted.receipt,
    design_sha256: design.sha256,
    result_package_id: resultPackage.package_id,
    completeness_result_sha256: resultArtifact.sha256,
    approval_record_sha256: approval.sha256
  });
}

export function createDesignCompletenessAuthorizer(adapters = {}) {
  return (observation, context) => {
    if (!observation?.claim_refs?.includes(DESIGN_COMPLETENESS_CLAIM_REF) && typeof adapters.fallbackAuthorizer === "function") {
      return adapters.fallbackAuthorizer(observation, context);
    }
    const result = evaluateDesignCompletenessObservation(observation, context, adapters);
    return result.granted
      ? { granted: true, receipt: result.receipt }
      : { granted: false, receipt: `forgeway:${result.code}` };
  };
}

export function designCompletenessGatePredicate({ applicable = true } = {}) {
  return deepFreeze({
    applicable,
    missing_state: "not-verified",
    negative_state: "unsatisfied",
    stale_state: "stale",
    mode: "all",
    requirements: [{
      id: "ui-design-completeness",
      kind: "artifact-validation",
      environments: ["local"],
      claim_refs: [DESIGN_COMPLETENESS_CLAIM_REF],
      outcomes: ["satisfied"],
      min_count: 1,
      package_binding: "result"
    }]
  });
}
