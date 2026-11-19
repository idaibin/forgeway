import {
  CODEX_POST_TOOL_USE_VERSION,
  CODEX_POST_TOOL_USE_SOURCE,
  decodeCodexPostToolUse,
  createCodexPostToolUseIntakeAuthorizer,
  recordCodexPostToolUse
} from "./codex-post-tool-use.mjs";
import {
  buildPackageManifest,
  createPackageManifest,
  packageManifestCanonicalHash,
  validatePackageManifest
} from "./package-manifest.mjs";
import {
  DeliveryStore,
  createDeliveryStore,
  projectPolicy,
  validateGatePolicy
} from "./store.mjs";
import {
  DESIGN_COMPLETENESS_CAPABILITY,
  DESIGN_COMPLETENESS_CLAIM_REF,
  DESIGN_COMPLETENESS_CONSUMER_VERSION,
  DESIGN_COMPLETENESS_FAILURE_CODES,
  DESIGN_COMPLETENESS_POLICY_VERSION,
  DESIGN_MD_CLI_VERSION,
  DESIGN_MD_SPEC_COMMIT,
  createDesignCompletenessAuthorizer,
  designCompletenessGatePredicate,
  evaluateDesignCompletenessObservation
} from "./design-completeness.mjs";
import {
  TYPED_ARTIFACT_INPUT_CONSUMER_VERSION,
  TYPED_ARTIFACT_INPUT_VALIDATOR_ID,
  TYPED_ARTIFACT_INPUT_FAILURE_CODES,
  createAcceptedArtifactValidator,
  createTypedArtifactInputAuthorizer,
  evaluateTypedArtifactInputObservation,
  typedArtifactInputGatePredicate
} from "./typed-artifact-input.mjs";
import {
  PROTOCOL_CONTRACT_CLAIMS,
  PROTOCOL_CONTRACT_POLICY_VERSION,
  protocolContractGatePredicates
} from "./protocol-contracts.mjs";
import {
  canonicalJson,
  canonicalize,
  deepFreeze,
  sha256,
  STATES,
  OBSERVATION_KINDS,
  ENVIRONMENTS
} from "./utils.mjs";

/**
 * Root machine API for the Delivery Graph v2 core. All returned records are
 * immutable snapshots; mutations are represented by new events/records.
 */
export {
  CODEX_POST_TOOL_USE_VERSION,
  CODEX_POST_TOOL_USE_SOURCE,
  decodeCodexPostToolUse,
  createCodexPostToolUseIntakeAuthorizer,
  recordCodexPostToolUse,
  DeliveryStore,
  createDeliveryStore,
  buildPackageManifest,
  createPackageManifest,
  packageManifestCanonicalHash,
  validatePackageManifest,
  validateGatePolicy,
  projectPolicy,
  DESIGN_COMPLETENESS_CAPABILITY,
  DESIGN_COMPLETENESS_CLAIM_REF,
  DESIGN_COMPLETENESS_CONSUMER_VERSION,
  DESIGN_COMPLETENESS_FAILURE_CODES,
  DESIGN_COMPLETENESS_POLICY_VERSION,
  DESIGN_MD_CLI_VERSION,
  DESIGN_MD_SPEC_COMMIT,
  createDesignCompletenessAuthorizer,
  designCompletenessGatePredicate,
  evaluateDesignCompletenessObservation,
  TYPED_ARTIFACT_INPUT_CONSUMER_VERSION,
  TYPED_ARTIFACT_INPUT_VALIDATOR_ID,
  TYPED_ARTIFACT_INPUT_FAILURE_CODES,
  createAcceptedArtifactValidator,
  createTypedArtifactInputAuthorizer,
  evaluateTypedArtifactInputObservation,
  typedArtifactInputGatePredicate,
  PROTOCOL_CONTRACT_CLAIMS,
  PROTOCOL_CONTRACT_POLICY_VERSION,
  protocolContractGatePredicates,
  canonicalJson,
  canonicalize,
  deepFreeze,
  sha256,
  STATES,
  OBSERVATION_KINDS,
  ENVIRONMENTS
};

export const api = Object.freeze({
  CODEX_POST_TOOL_USE_VERSION,
  CODEX_POST_TOOL_USE_SOURCE,
  decodeCodexPostToolUse,
  createCodexPostToolUseIntakeAuthorizer,
  recordCodexPostToolUse,
  DeliveryStore,
  createDeliveryStore,
  buildPackageManifest,
  createPackageManifest,
  packageManifestCanonicalHash,
  validatePackageManifest,
  validateGatePolicy,
  projectPolicy,
  DESIGN_COMPLETENESS_CAPABILITY,
  DESIGN_COMPLETENESS_CLAIM_REF,
  DESIGN_COMPLETENESS_CONSUMER_VERSION,
  DESIGN_COMPLETENESS_FAILURE_CODES,
  DESIGN_COMPLETENESS_POLICY_VERSION,
  DESIGN_MD_CLI_VERSION,
  DESIGN_MD_SPEC_COMMIT,
  createDesignCompletenessAuthorizer,
  designCompletenessGatePredicate,
  evaluateDesignCompletenessObservation,
  TYPED_ARTIFACT_INPUT_CONSUMER_VERSION,
  TYPED_ARTIFACT_INPUT_VALIDATOR_ID,
  TYPED_ARTIFACT_INPUT_FAILURE_CODES,
  createAcceptedArtifactValidator,
  createTypedArtifactInputAuthorizer,
  evaluateTypedArtifactInputObservation,
  typedArtifactInputGatePredicate,
  PROTOCOL_CONTRACT_CLAIMS,
  PROTOCOL_CONTRACT_POLICY_VERSION,
  protocolContractGatePredicates,
  canonicalJson,
  canonicalize,
  deepFreeze,
  sha256,
  STATES,
  OBSERVATION_KINDS,
  ENVIRONMENTS
});

export default api;
