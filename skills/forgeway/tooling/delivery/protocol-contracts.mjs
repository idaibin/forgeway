import { deepFreeze } from "./utils.mjs";

export const PROTOCOL_CONTRACT_POLICY_VERSION = "forgeway-protocol-contracts/2";

export const PROTOCOL_CONTRACT_CLAIMS = Object.freeze({
  businessRules: "gate:protocol-business-rules-confirmed",
  authority: "gate:protocol-authority-selected",
  automation: "gate:protocol-automation-executed",
  structure: "gate:protocol-structure-valid",
  sourceConformance: "gate:protocol-source-conformant",
  businessExposure: "gate:protocol-business-exposure-valid",
  compatibility: "gate:protocol-compatibility-valid",
  consumerCoverage: "gate:protocol-consumer-coverage-valid",
  lifecycle: "gate:protocol-lifecycle-complete",
  deterministicGeneration: "gate:protocol-generation-deterministic"
});

function predicate(id, kind, claimRef, applicable) {
  return {
    applicable,
    missing_state: "not-verified",
    negative_state: "unsatisfied",
    stale_state: "stale",
    mode: "all",
    requirements: [{
      id,
      kind,
      environments: ["local"],
      claim_refs: [claimRef],
      outcomes: ["satisfied"],
      min_count: 1,
      package_binding: "result"
    }]
  };
}

export function protocolContractGatePredicates({
  applicable = true,
  authorityStrategy,
  phase,
  hasGeneratedDerivatives = false
} = {}) {
  if (typeof applicable !== "boolean") {
    throw new Error(`Unsupported protocol applicability: ${applicable}`);
  }
  if (typeof hasGeneratedDerivatives !== "boolean") {
    throw new Error(`Unsupported generated derivative flag: ${hasGeneratedDerivatives}`);
  }
  if (applicable && !["contract-first", "code-first"].includes(authorityStrategy)) {
    throw new Error(`Unsupported protocol authority strategy: ${authorityStrategy}`);
  }
  if (applicable && !["design", "implementation"].includes(phase)) {
    throw new Error(`Unsupported protocol phase: ${phase}`);
  }

  const deterministicGenerationRequired = applicable
    && (authorityStrategy === "code-first" || hasGeneratedDerivatives);
  const sourceConformanceRequired = applicable
    && (authorityStrategy === "code-first" || phase === "implementation");

  return deepFreeze({
    "protocol-business-rules": predicate(
      "business-rules-confirmed",
      "source-assertion",
      PROTOCOL_CONTRACT_CLAIMS.businessRules,
      applicable
    ),
    "protocol-authority": predicate(
      "authority-selected",
      "source-assertion",
      PROTOCOL_CONTRACT_CLAIMS.authority,
      applicable
    ),
    "protocol-automation": predicate(
      "protocol-automation-executed",
      "command-execution",
      PROTOCOL_CONTRACT_CLAIMS.automation,
      applicable
    ),
    "protocol-structure": predicate(
      "openapi-structure-valid",
      "artifact-validation",
      PROTOCOL_CONTRACT_CLAIMS.structure,
      applicable
    ),
    "protocol-source-conformance": predicate(
      "source-conformance-valid",
      "artifact-validation",
      PROTOCOL_CONTRACT_CLAIMS.sourceConformance,
      sourceConformanceRequired
    ),
    "protocol-business-exposure": predicate(
      "business-exposure-valid",
      "artifact-validation",
      PROTOCOL_CONTRACT_CLAIMS.businessExposure,
      applicable
    ),
    "protocol-compatibility": predicate(
      "compatibility-valid",
      "artifact-validation",
      PROTOCOL_CONTRACT_CLAIMS.compatibility,
      applicable
    ),
    "protocol-consumer-coverage": predicate(
      "consumer-coverage-valid",
      "artifact-validation",
      PROTOCOL_CONTRACT_CLAIMS.consumerCoverage,
      applicable
    ),
    "protocol-lifecycle": predicate(
      "lifecycle-complete",
      "artifact-validation",
      PROTOCOL_CONTRACT_CLAIMS.lifecycle,
      applicable
    ),
    "protocol-deterministic-generation": predicate(
      "generation-deterministic",
      "command-execution",
      PROTOCOL_CONTRACT_CLAIMS.deterministicGeneration,
      deterministicGenerationRequired
    )
  });
}
