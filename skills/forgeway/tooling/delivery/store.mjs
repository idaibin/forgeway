import { mkdirSync } from "node:fs";
import { captureReadSnapshot } from "./read-snapshot.mjs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

import {
  assert,
  canonicalJson,
  clone,
  deepFreeze,
  fromSqlJson,
  id,
  normalisePolicyRef,
  nowIso,
  OBSERVATION_KINDS,
  packageIdentity,
  policyRefValue,
  sha256,
  toSqlJson
} from "./utils.mjs";
import {
  createPackageManifest,
  packageManifestCanonicalHash,
  validatePackageManifest
} from "./package-manifest.mjs";

const ATTEMPT_STATUSES = new Set(["started", "succeeded", "failed", "blocked", "cancelled"]);
const RECEIPT_READBACK = new Set(["confirmed", "negative", "not-verified"]);
const OBSERVATION_ENVIRONMENTS = new Set(["local", "target-like", "deployed", "production"]);
const OBSERVATION_OUTCOMES = new Set(["satisfied", "unsatisfied", "not-verified"]);
const EVENT_ENTITY_TYPES = Object.freeze({
  "package.created": "package",
  "policy.registered": "policy",
  "run.created": "run",
  "attempt.created": "attempt",
  "observation.recorded": "observation",
  "delivery.receipt.created": "receipt",
  "deployment.receipt.created": "receipt"
});
const OBSERVATION_VALIDATOR_ID = "forgeway.delivery.observation";
const OBSERVATION_CONTRACT_VERSION = "1.0";
const RECEIPT_OUTCOME = Object.freeze({
  confirmed: "satisfied",
  negative: "unsatisfied",
  "not-verified": "not-verified"
});
const RECEIPT_OBSERVATION_AUTHORITY = Symbol("receipt-observation-authority");
const RECEIPT_OBSERVATION_KINDS = new Set(["delivery-receipt", "deployment-receipt"]);

function ensureParent(filename) {
  if (filename === ":memory:" || filename.startsWith("file:")) return;
  mkdirSync(path.dirname(path.resolve(filename)), { recursive: true });
}

function asPublic(value) {
  return deepFreeze(clone(value));
}

function sameJson(left, right) {
  return canonicalJson(left) === canonicalJson(right);
}

function eventPayload(type, entity) {
  return { type, entity: clone(entity) };
}

function eventEntityId(entity, eventType) {
  switch (eventType) {
    case "package.created": return entity.package_id;
    case "policy.registered": return entity.policy_id && entity.version ? `${entity.policy_id}@${entity.version}` : null;
    case "run.created": return entity.run_id;
    case "attempt.created": return entity.attempt_id;
    case "observation.recorded": return entity.observation_id;
    case "delivery.receipt.created":
    case "deployment.receipt.created": return entity.receipt_id;
    default: return null;
  }
}

function eventEntityType(eventType) {
  return EVENT_ENTITY_TYPES[eventType] ?? null;
}

function assertKnownEvent(eventType, entityType) {
  const expected = eventEntityType(eventType);
  assert(expected, `unsupported event type: ${eventType}`, "EVENT_TYPE_UNKNOWN");
  assert(entityType === expected, `event entity_type does not match event_type: ${eventType} -> ${entityType}`, "EVENT_ENTITY_TYPE_MISMATCH");
}

function observationContractId(kind) {
  return `urn:forgeway:observation:${kind}:v1`;
}

function derivedObservationOutcome(kind, payload) {
  switch (kind) {
    case "source-assertion": return payload.resolved ? "satisfied" : "unsatisfied";
    case "command-execution": return payload.exit_code === 0 ? "satisfied" : "unsatisfied";
    case "artifact-validation": return payload.valid ? "satisfied" : "unsatisfied";
    case "review-finding": return payload.blocking_count === 0 ? "satisfied" : "unsatisfied";
    case "delivery-receipt":
    case "deployment-receipt": return RECEIPT_OUTCOME[payload.readback.status] ?? "not-verified";
    case "runtime-observation":
    case "production-probe": return payload.status;
    default: return "not-verified";
  }
}

function assertTypedObservationPayload(kind, payload) {
  const object = payload && typeof payload === "object" && !Array.isArray(payload) ? payload : null;
  assert(object, "observation.payload must be an object", "OBSERVATION_PAYLOAD_INVALID");
  switch (kind) {
    case "source-assertion":
      assert(typeof object.assertion_id === "string" && object.assertion_id.length > 0, "source-assertion payload.assertion_id is required", "OBSERVATION_PAYLOAD_TYPED_INVALID");
      assert(typeof object.resolved === "boolean", "source-assertion payload.resolved is required", "OBSERVATION_PAYLOAD_TYPED_INVALID");
      break;
    case "command-execution":
      assert((typeof object.command === "string" && object.command.length > 0) || (Array.isArray(object.command) && object.command.length > 0), "command-execution payload.command is required", "OBSERVATION_PAYLOAD_TYPED_INVALID");
      assert(Number.isInteger(object.exit_code), "command-execution payload.exit_code is required", "OBSERVATION_PAYLOAD_TYPED_INVALID");
      break;
    case "artifact-validation":
      assert((typeof object.artifact_id === "string" && object.artifact_id.length > 0) || /^[0-9a-f]{64}$/.test(object.artifact_hash ?? ""), "artifact-validation payload.artifact_id or artifact_hash is required", "OBSERVATION_PAYLOAD_TYPED_INVALID");
      assert(typeof object.validator_id === "string" && object.validator_id.length > 0, "artifact-validation payload.validator_id is required", "OBSERVATION_PAYLOAD_TYPED_INVALID");
      assert(typeof object.valid === "boolean", "artifact-validation payload.valid is required", "OBSERVATION_PAYLOAD_TYPED_INVALID");
      break;
    case "runtime-observation":
      assert(typeof object.check_id === "string" && object.check_id.length > 0, "runtime-observation payload.check_id is required", "OBSERVATION_PAYLOAD_TYPED_INVALID");
      assert(typeof object.observed_state === "string" && object.observed_state.length > 0, "runtime-observation payload.observed_state is required", "OBSERVATION_PAYLOAD_TYPED_INVALID");
      assert(["satisfied", "unsatisfied", "not-verified"].includes(object.status), "runtime-observation payload.status is invalid", "OBSERVATION_PAYLOAD_TYPED_INVALID");
      break;
    case "review-finding":
      assert(Number.isInteger(object.finding_count) && object.finding_count >= 0, "review-finding payload.finding_count is required", "OBSERVATION_PAYLOAD_TYPED_INVALID");
      assert(typeof object.summary === "string" && object.summary.length > 0, "review-finding payload.summary is required", "OBSERVATION_PAYLOAD_TYPED_INVALID");
      assert(Number.isInteger(object.blocking_count) && object.blocking_count >= 0 && object.blocking_count <= object.finding_count, "review-finding payload.blocking_count is required", "OBSERVATION_PAYLOAD_TYPED_INVALID");
      break;
    case "delivery-receipt":
    case "deployment-receipt":
      assert(typeof object.receipt_id === "string" && object.receipt_id.startsWith("receipt:"), `${kind} payload.receipt_id is required`, "OBSERVATION_PAYLOAD_TYPED_INVALID");
      assert(object.target && typeof object.target.kind === "string" && typeof object.target.identity === "string", `${kind} payload.target is required`, "OBSERVATION_PAYLOAD_TYPED_INVALID");
      assert(object.readback && typeof object.readback.status === "string", `${kind} payload.readback is required`, "OBSERVATION_PAYLOAD_TYPED_INVALID");
      break;
    case "production-probe":
      assert(typeof object.probe_id === "string" && object.probe_id.length > 0, "production-probe payload.probe_id is required", "OBSERVATION_PAYLOAD_TYPED_INVALID");
      assert(typeof object.target_identity === "string" && object.target_identity.length > 0, "production-probe payload.target_identity is required", "OBSERVATION_PAYLOAD_TYPED_INVALID");
      assert(typeof object.observed_state === "string" && object.observed_state.length > 0, "production-probe payload.observed_state is required", "OBSERVATION_PAYLOAD_TYPED_INVALID");
      assert(["satisfied", "unsatisfied", "not-verified"].includes(object.status), "production-probe payload.status is invalid", "OBSERVATION_PAYLOAD_TYPED_INVALID");
      break;
    default:
      assert(false, `unsupported observation kind: ${kind}`, "OBSERVATION_KIND_INVALID");
  }
}

function validateRun(run) {
  assert(run?.schema_version === "1.0", "run.schema_version must be 1.0", "RUN_SCHEMA_UNSUPPORTED");
  assert(typeof run.run_id === "string" && run.run_id.startsWith("run:"), "run_id must use the run: namespace", "RUN_ID_INVALID");
  assert(typeof run.input_basis_package_id === "string", "input_basis_package_id is required", "RUN_INPUT_PACKAGE_REQUIRED");
  assert(typeof run.capability_id === "string" && run.capability_id.length > 0, "capability_id is required", "RUN_CAPABILITY_REQUIRED");
  assert(Array.isArray(run.input_refs), "input_refs must be an array", "RUN_INPUT_REFS_INVALID");
  assert(Array.isArray(run.scope), "scope must be an array", "RUN_SCOPE_INVALID");
  for (const entry of run.scope) {
    const value = typeof entry === "string" ? entry : entry?.path;
    assert(typeof value === "string" && value.length > 0, "run scope entries must be strings or path objects", "RUN_SCOPE_INVALID");
    assert(!value.startsWith("/") && !value.startsWith("~") && !/^[A-Za-z]:[\\/]/.test(value) && !value.includes("\\") && !value.split("/").includes(".."), `run scope escapes repository root: ${value}`, "RUN_SCOPE_ESCAPE");
  }
  assert(run.policy_ref && typeof run.policy_ref === "object", "policy_ref is required", "RUN_POLICY_REQUIRED");
  assert(typeof run.policy_ref.policy_id === "string" && Number.isInteger(run.policy_ref.version), "policy_ref is invalid", "RUN_POLICY_INVALID");
  assert(run.initiator && typeof run.initiator.id === "string" && typeof run.initiator.kind === "string", "initiator is required", "RUN_INITIATOR_REQUIRED");
  assert(typeof run.created_at === "string", "created_at is required", "RUN_CREATED_AT_REQUIRED");
}

function validateAttempt(attempt) {
  assert(attempt?.schema_version === "1.0", "attempt.schema_version must be 1.0", "ATTEMPT_SCHEMA_UNSUPPORTED");
  assert(typeof attempt.attempt_id === "string" && attempt.attempt_id.startsWith("attempt:"), "attempt_id must use the attempt: namespace", "ATTEMPT_ID_INVALID");
  assert(typeof attempt.run_id === "string" && attempt.run_id.startsWith("run:"), "attempt.run_id is required", "ATTEMPT_RUN_REQUIRED");
  assert(Number.isInteger(attempt.attempt_number) && attempt.attempt_number > 0, "attempt_number must be a positive integer", "ATTEMPT_NUMBER_INVALID");
  assert(attempt.result_package_id === null || typeof attempt.result_package_id === "string", "result_package_id must be a package id or null", "ATTEMPT_RESULT_PACKAGE_INVALID");
  assert(ATTEMPT_STATUSES.has(attempt.status), `unsupported attempt status: ${attempt.status}`, "ATTEMPT_STATUS_INVALID");
}

function validateObservation(observation, { resultPackage } = {}) {
  assert(observation?.schema_version === "1.0", "observation.schema_version must be 1.0", "OBSERVATION_SCHEMA_UNSUPPORTED");
  assert(typeof observation.observation_id === "string" && observation.observation_id.startsWith("obs:"), "observation_id must use the obs: namespace", "OBSERVATION_ID_INVALID");
  assert(typeof observation.run_id === "string" && observation.run_id.startsWith("run:"), "observation.run_id is required", "OBSERVATION_RUN_REQUIRED");
  assert(typeof observation.attempt_id === "string" && observation.attempt_id.startsWith("attempt:"), "observation.attempt_id is required", "OBSERVATION_ATTEMPT_REQUIRED");
  assert(typeof observation.result_package_id === "string" && observation.result_package_id.startsWith("pkg:"), "observation.result_package_id is required", "OBSERVATION_RESULT_PACKAGE_REQUIRED");
  assert(OBSERVATION_KINDS.includes(observation.kind), `unsupported observation kind: ${observation.kind}`, "OBSERVATION_KIND_INVALID");
  assert(OBSERVATION_ENVIRONMENTS.has(observation.environment), `unsupported observation environment: ${observation.environment}`, "OBSERVATION_ENVIRONMENT_INVALID");
  assert(OBSERVATION_OUTCOMES.has(observation.outcome), `unsupported observation outcome: ${observation.outcome}`, "OBSERVATION_OUTCOME_INVALID");
  if (observation.claim_refs !== undefined) assert(Array.isArray(observation.claim_refs)
    && Array.from(observation.claim_refs).every((claim) => typeof claim === "string" && claim.length > 0)
    && new Set(observation.claim_refs).size === observation.claim_refs.length,
  "observation.claim_refs must be an array of unique non-empty strings", "OBSERVATION_CLAIM_REFS_INVALID");
  assert(observation.producer && typeof observation.producer === "object" && !Array.isArray(observation.producer), "observation.producer is required", "OBSERVATION_PRODUCER_REQUIRED");
  assert(typeof observation.producer.capability_id === "string" && observation.producer.capability_id.length > 0, "observation.producer.capability_id is required", "OBSERVATION_PRODUCER_INVALID");
  assert(typeof observation.producer.capability_version === "string" && observation.producer.capability_version.length > 0, "observation.producer.capability_version is required", "OBSERVATION_PRODUCER_INVALID");
  if (observation.kind === "review-finding") {
    assert(typeof observation.producer.session_id === "string" && observation.producer.session_id.length > 0, "review-finding producer.session_id is required", "OBSERVATION_PRODUCER_INVALID");
  }
  assert(observation.collector && typeof observation.collector === "object" && !Array.isArray(observation.collector), "observation.collector is required", "OBSERVATION_COLLECTOR_REQUIRED");
  assert(typeof observation.collector.id === "string" && observation.collector.id.length > 0 && typeof observation.collector.version === "string" && observation.collector.version.length > 0, "observation.collector id and version are required", "OBSERVATION_COLLECTOR_INVALID");
  assert(observation.permission && typeof observation.permission === "object" && !Array.isArray(observation.permission), "observation.permission is required", "OBSERVATION_PERMISSION_REQUIRED");
  assert(typeof observation.permission.mode === "string" && observation.permission.mode.length > 0, "observation.permission.mode is required", "OBSERVATION_PERMISSION_INVALID");
  assert(typeof observation.permission.granted === "boolean", "observation.permission.granted is required", "OBSERVATION_PERMISSION_INVALID");
  assert(typeof observation.permission.authorization_ref === "string" && observation.permission.authorization_ref.length > 0, "observation.permission.authorization_ref is required", "OBSERVATION_PERMISSION_INVALID");
  assertTypedObservationPayload(observation.kind, observation.payload);
  assert(observation.outcome === derivedObservationOutcome(observation.kind, observation.payload), "observation outcome does not match typed payload", "OBSERVATION_OUTCOME_MISMATCH");
  assert(observation.validation && typeof observation.validation === "object" && !Array.isArray(observation.validation), "observation.validation is required", "OBSERVATION_VALIDATION_REQUIRED");
  assert(observation.validation.contract_id === observationContractId(observation.kind), "observation.validation.contract_id does not match kind", "OBSERVATION_VALIDATION_INVALID");
  assert(observation.validation.contract_version === OBSERVATION_CONTRACT_VERSION, "observation.validation.contract_version is unsupported", "OBSERVATION_VALIDATION_INVALID");
  assert(observation.validation.validator_id === OBSERVATION_VALIDATOR_ID, "observation.validation.validator_id is unsupported", "OBSERVATION_VALIDATION_INVALID");
  assert(typeof observation.validation.validated_at === "string", "observation.validation.validated_at is required", "OBSERVATION_VALIDATION_INVALID");
  assert(observation.validation.payload_sha256 === sha256(observation.payload), "observation validation payload hash mismatch", "OBSERVATION_VALIDATION_HASH_MISMATCH");
  if (resultPackage) {
    assert(observation.validation.result_package_aggregate_sha256 === resultPackage.aggregate_sha256, "observation validation result package hash mismatch", "OBSERVATION_VALIDATION_PACKAGE_MISMATCH");
  }
  assert(typeof observation.validation.result_package_aggregate_sha256 === "string" && /^[0-9a-f]{64}$/.test(observation.validation.result_package_aggregate_sha256), "observation validation result package hash is required", "OBSERVATION_VALIDATION_INVALID");
  assert(typeof observation.validation.eligible === "boolean", "observation validation eligibility is required", "OBSERVATION_VALIDATION_ELIGIBILITY_MISMATCH");
  assert(typeof observation.validation.authorization_receipt === "string" && observation.validation.authorization_receipt.length > 0, "observation validation authorization receipt is required", "OBSERVATION_VALIDATION_ELIGIBILITY_MISMATCH");
}

function validateReceipt(receipt) {
  assert(receipt?.schema_version === "1.0", "receipt.schema_version must be 1.0", "RECEIPT_SCHEMA_UNSUPPORTED");
  assert(typeof receipt.receipt_id === "string" && receipt.receipt_id.startsWith("receipt:"), "receipt_id is invalid", "RECEIPT_ID_INVALID");
  assert(["delivery", "deployment"].includes(receipt.receipt_type), "receipt_type must be delivery or deployment", "RECEIPT_TYPE_INVALID");
  assert(typeof receipt.run_id === "string" && typeof receipt.attempt_id === "string" && typeof receipt.result_package_id === "string", "receipt references are required", "RECEIPT_REFS_INVALID");
  assert(receipt.target?.kind && receipt.target?.identity, "receipt.target kind and identity are required", "RECEIPT_TARGET_REQUIRED");
  const expectedTargetKind = receipt.receipt_type === "delivery" ? "git-remote" : "deployment-target";
  assert(receipt.target.kind === expectedTargetKind, `${receipt.receipt_type} receipt target.kind must be ${expectedTargetKind}`, "RECEIPT_TARGET_KIND_INVALID");
  assert(typeof receipt.authorization?.granted === "boolean" && typeof receipt.authorization?.actor === "string", "receipt.authorization is invalid", "RECEIPT_AUTHORIZATION_INVALID");
  assert(RECEIPT_READBACK.has(receipt.readback?.status), "receipt readback.status is invalid", "RECEIPT_READBACK_INVALID");
  if (receipt.readback.status === "confirmed") {
    assert(receipt.authorization.granted === true, "confirmed receipt requires granted authorization", "RECEIPT_CONFIRMED_UNAUTHORIZED");
    assert(receipt.readback.identity === receipt.target.identity, "confirmed receipt readback identity must match target", "RECEIPT_READBACK_IDENTITY_MISMATCH");
    assert(receipt.readback.result_package_id === receipt.result_package_id, "confirmed receipt readback must bind the result package", "RECEIPT_READBACK_PACKAGE_MISMATCH");
    if (receipt.target.kind === "git-remote") {
      assert(/^[0-9a-f]{40}$/.test(receipt.readback.commit_sha ?? ""), "confirmed git-remote receipt requires a commit_sha", "RECEIPT_COMMIT_SHA_REQUIRED");
      assert(typeof receipt.readback.ref === "string" && receipt.readback.ref.length > 0, "confirmed git-remote receipt requires a ref", "RECEIPT_REF_REQUIRED");
      if (receipt.target.commit_sha !== undefined) assert(receipt.target.commit_sha === receipt.readback.commit_sha, "confirmed git-remote commit_sha must match target", "RECEIPT_COMMIT_SHA_MISMATCH");
    } else {
      assert(typeof receipt.readback.deployment_id === "string" && receipt.readback.deployment_id.length > 0, "confirmed deployment receipt requires deployment_id", "RECEIPT_DEPLOYMENT_ID_REQUIRED");
      assert(typeof receipt.readback.environment === "string" && receipt.readback.environment.length > 0, "confirmed deployment receipt requires environment", "RECEIPT_DEPLOYMENT_ENVIRONMENT_REQUIRED");
    }
  }
  const expectedOutcome = RECEIPT_OUTCOME[receipt.readback.status];
  assert(receipt.outcome === expectedOutcome, "receipt outcome does not match authorization and readback", "RECEIPT_OUTCOME_INVALID");
}

function validateGatePolicy(policy) {
  assert(policy?.schema_version === "1.0", "gate policy schema_version must be 1.0", "POLICY_SCHEMA_UNSUPPORTED");
  assert(typeof policy.policy_id === "string" && policy.policy_id.length > 0, "policy_id is required", "POLICY_ID_REQUIRED");
  assert(Number.isInteger(policy.version) && policy.version > 0, "policy.version must be a positive integer", "POLICY_VERSION_INVALID");
  assert(policy.predicates && typeof policy.predicates === "object" && !Array.isArray(policy.predicates), "policy.predicates is required", "POLICY_PREDICATES_REQUIRED");
  assert(policy.failure_behavior && typeof policy.failure_behavior === "object", "policy.failure_behavior is required", "POLICY_FAILURE_BEHAVIOR_REQUIRED");
  for (const stateName of ["missing", "negative", "stale"]) {
    assert(typeof policy.failure_behavior[stateName] === "string", `failure_behavior.${stateName} is required`, "POLICY_FAILURE_BEHAVIOR_INVALID");
    assert(["satisfied", "unsatisfied", "not-verified", "not-applicable", "stale"].includes(policy.failure_behavior[stateName]), `failure_behavior.${stateName} is invalid`, "POLICY_FAILURE_BEHAVIOR_INVALID");
  }
  for (const [predicateName, predicate] of Object.entries(policy.predicates)) {
    assert(predicate && typeof predicate === "object" && !Array.isArray(predicate), `predicate ${predicateName} is invalid`, "POLICY_PREDICATE_INVALID");
    assert(typeof predicate.applicable === "boolean", `predicate ${predicateName}.applicable is required`, "POLICY_PREDICATE_INVALID");
    for (const stateName of ["missing_state", "negative_state", "stale_state"]) {
      assert(typeof predicate[stateName] === "string" && ["satisfied", "unsatisfied", "not-verified", "not-applicable", "stale"].includes(predicate[stateName]), `predicate ${predicateName}.${stateName} is invalid`, "POLICY_PREDICATE_STATE_INVALID");
    }
    assert(["all", "any"].includes(predicate.mode), `predicate ${predicateName}.mode must be all or any`, "POLICY_PREDICATE_MODE_INVALID");
    assert(Array.isArray(predicate.requirements) && predicate.requirements.length > 0, `predicate ${predicateName}.requirements is required`, "POLICY_REQUIREMENTS_REQUIRED");
    for (const requirement of predicate.requirements) {
      assert(OBSERVATION_KINDS.includes(requirement.kind), `policy requirement kind is invalid: ${requirement.kind}`, "POLICY_REQUIREMENT_KIND_INVALID");
      assert(Number.isInteger(requirement.min_count) && requirement.min_count > 0, "policy requirement min_count must be positive", "POLICY_REQUIREMENT_COUNT_INVALID");
      assert(Array.isArray(requirement.outcomes) && requirement.outcomes.length > 0, "policy requirement outcomes are required", "POLICY_REQUIREMENT_OUTCOMES_REQUIRED");
      assert(["result", "input", "any"].includes(requirement.package_binding), "policy requirement package_binding is invalid", "POLICY_PACKAGE_BINDING_INVALID");
      if (requirement.claim_refs !== undefined) {
        assert(Array.isArray(requirement.claim_refs) && requirement.claim_refs.length > 0 && requirement.claim_refs.every((ref) => typeof ref === "string" && ref.length > 0) && new Set(requirement.claim_refs).size === requirement.claim_refs.length, "policy requirement claim_refs must be unique non-empty strings", "POLICY_REQUIREMENT_CLAIM_REFS_INVALID");
      }
    }
  }
  return true;
}

function normalisePolicy(policy) {
  const value = clone(policy);
  value.schema_version ??= "1.0";
  validateGatePolicy(value);
  return value;
}

function normaliseRun(input, now) {
  const policyRef = normalisePolicyRef(input.policy_ref ?? input.policy?.policy_ref ?? input.policy);
  const run = {
    schema_version: "1.0",
    run_id: id("run", input.run_id),
    input_basis_package_id: packageIdentity(input.input_basis_package_id ?? input.input_basis_package),
    capability_id: input.capability_id,
    input_refs: clone(input.input_refs ?? []),
    scope: clone(input.scope ?? []),
    policy_ref: policyRef,
    initiator: clone(input.initiator ?? { id: "host", kind: "runtime" }),
    created_at: input.created_at ?? nowIso(now)
  };
  validateRun(run);
  return run;
}

function normaliseAttempt(input, run, packageExists, now, attemptNumber) {
  const resultPackage = input.result_package_id === undefined
    ? (input.result_package?.package_id ?? null)
    : input.result_package_id;
  if (resultPackage !== null) assert(packageExists(resultPackage), `result package does not exist: ${resultPackage}`, "ATTEMPT_RESULT_PACKAGE_UNKNOWN");
  const attempt = {
    schema_version: "1.0",
    attempt_id: id("attempt", input.attempt_id),
    run_id: run.run_id,
    attempt_number: input.attempt_number ?? attemptNumber,
    adapter: clone(input.adapter ?? {}),
    action: clone(input.action ?? {}),
    events: clone(input.events ?? []),
    exit: clone(input.exit ?? {}),
    status: input.status ?? (resultPackage ? "succeeded" : "failed"),
    result_package_id: resultPackage,
    created_at: input.created_at ?? nowIso(now)
  };
  validateAttempt(attempt);
  return attempt;
}

function scopeContains(scope, filePath) {
  return scope.some((entry) => {
    const pattern = typeof entry === "string" ? entry : entry.path;
    if (pattern === "**" || pattern === "*") return true;
    if (pattern.endsWith("/**")) { const prefix = pattern.slice(0, -3).replace(/\/$/, ""); return filePath === prefix || filePath.startsWith(`${prefix}/`); }
    return filePath === pattern;
  });
}

function assertAttemptResultInvariant(run, inputPackage, resultPackage) {
  assert(resultPackage.repository_id === inputPackage.repository_id, "result package repository must match the run input package", "ATTEMPT_REPOSITORY_MISMATCH");
  const inputFiles = new Map(inputPackage.files.map((file) => [file.path, file]));
  const changedPaths = resultPackage.files.filter((file) => {
    const before = inputFiles.get(file.path);
    return !before || canonicalJson(before) !== canonicalJson(file);
  }).map((file) => file.path);
  for (const file of inputPackage.files) if (!resultPackage.files.some((candidate) => candidate.path === file.path)) changedPaths.push(file.path);
  const outOfScope = [...new Set(changedPaths)].filter((filePath) => !scopeContains(run.scope, filePath));
  assert(outOfScope.length === 0, `result package contains changes outside run scope: ${outOfScope.join(", ")}`, "ATTEMPT_SCOPE_EXPANSION_REQUIRED");
}

function latestResultPackage(attempts) {
  return [...attempts]
    .filter((attempt) => attempt.status === "succeeded")
    .sort((left, right) => left.attempt_number - right.attempt_number || left.created_at.localeCompare(right.created_at))
    .reverse()
    .find((attempt) => attempt.result_package_id)?.result_package_id ?? null;
}

function outcomeNegative(outcome) {
  return ["unsatisfied", "fail", "blocked", "error"].includes(outcome);
}

function bindingMatches(requirement, observation, run, currentResultPackage) {
  if (requirement.package_binding === "any") return true;
  if (requirement.package_binding === "input") return observation.result_package_id === run.input_basis_package_id;
  return observation.result_package_id === currentResultPackage;
}

function requirementProjection(requirement, observations, run, currentResultPackage) {
  const kindMatches = observations.filter((observation) => observation.kind === requirement.kind);
  const claimMatches = requirement.claim_refs?.length
    ? kindMatches.filter((observation) => Array.isArray(observation.claim_refs) && requirement.claim_refs.every((ref) => observation.claim_refs.includes(ref)))
    : kindMatches;
  const bound = claimMatches.filter((observation) => bindingMatches(requirement, observation, run, currentResultPackage));
  const environmentMatches = requirement.environments?.length
    ? bound.filter((observation) => requirement.environments.includes(observation.environment))
    : bound;
  const positive = environmentMatches.filter((observation) => requirement.outcomes.includes(observation.outcome));
  const negative = environmentMatches.filter((observation) => outcomeNegative(observation.outcome));
  const stale = requirement.package_binding === "result" && currentResultPackage
    ? claimMatches.filter((observation) => observation.result_package_id !== currentResultPackage)
    : [];
  const receiptsMayBeConfirmedAfterAnEarlierReadback = RECEIPT_OBSERVATION_KINDS.has(requirement.kind);
  const state = receiptsMayBeConfirmedAfterAnEarlierReadback && positive.length >= requirement.min_count
    ? "satisfied"
    : negative.length > 0
      ? "unsatisfied"
      : positive.length >= requirement.min_count
        ? "satisfied"
        : stale.length > 0 && environmentMatches.length === 0
          ? "stale"
          : "not-verified";
  return {
    requirement_id: requirement.id ?? requirement.kind,
    required_claim_refs: clone(requirement.claim_refs ?? []),
    state,
    observation_ids: environmentMatches.map((observation) => observation.observation_id),
    stale_observation_ids: stale.map((observation) => observation.observation_id),
    positive_count: positive.length,
    negative_count: negative.length
  };
}

function projectPolicy(policy, run, observations) {
  const currentResultPackage = latestResultPackage(run.attempts);
  const eligibleObservations = observations.filter((observation) => observation.validation?.eligible === true);
  const predicates = {};
  for (const [name, predicate] of Object.entries(policy.predicates)) {
    if (!predicate.applicable) {
      predicates[name] = {
        state: "not-applicable",
        reasons: ["policy marks predicate not applicable"],
        observation_ids: [],
        requirement_results: []
      };
      continue;
    }
    const requirementResults = predicate.requirements.map((requirement) => requirementProjection(requirement, eligibleObservations, run, currentResultPackage));
    const states = requirementResults.map((result) => result.state);
    const negativeState = predicate.negative_state ?? policy.failure_behavior.negative;
    const staleState = predicate.stale_state ?? policy.failure_behavior.stale;
    const missingState = predicate.missing_state ?? policy.failure_behavior.missing;
    const state = predicate.mode === "any"
      ? states.includes("satisfied")
        ? "satisfied"
        : states.includes("unsatisfied")
          ? negativeState
          : states.includes("stale")
            ? staleState
            : missingState
      : states.every((item) => item === "satisfied")
        ? "satisfied"
        : states.includes("unsatisfied")
          ? negativeState
          : states.includes("stale")
            ? staleState
            : missingState;
    predicates[name] = {
      state,
      reasons: requirementResults.map((result) => `${result.requirement_id}:${result.state}`),
      observation_ids: [...new Set(requirementResults.flatMap((result) => result.observation_ids))],
      stale_observation_ids: [...new Set(requirementResults.flatMap((result) => result.stale_observation_ids))],
      requirement_results: requirementResults,
      result_package_id: currentResultPackage
    };
  }
  return {
    schema_version: "1.0",
    run_id: run.run_id,
    policy_ref: { policy_id: policy.policy_id, version: policy.version },
    input_basis_package_id: run.input_basis_package_id,
    result_package_id: currentResultPackage,
    predicates,
    projection_hash: sha256({ run_id: run.run_id, policy, predicates })
  };
}

const readOnlyStores = new WeakSet();
const readSnapshots = new WeakMap();
export const isReadOnlyDeliveryStore = store => readOnlyStores.has(store);

export class DeliveryStore {
  constructor({ filename = ":memory:", db, readOnly = false, copySnapshot = false, now = Date.now, authorizeObservation = () => ({ granted: false, receipt: "host:not-authorized" }), authorizeImportedObservation = () => false, authorizeReceipt = () => ({ granted: false, receipt: "host:receipt-not-authorized" }) } = {}) {
    let snapshot;
    if (readOnly) {
      assert(!db && copySnapshot === true, "read-only queries require explicit copySnapshot/--copy-snapshot permission", "DELIVERY_READ_ONLY_COPY_REQUIRED");
      snapshot = captureReadSnapshot(filename);
    } else ensureParent(filename);
    try { this.db = db ?? new DatabaseSync(snapshot?.filename ?? filename, { readOnly }); }
    catch (cause) { snapshot?.close(); throw cause; }
    if (snapshot) {
      readSnapshots.set(this, snapshot);
      Object.defineProperty(this, "read_snapshot_sha256", { value: snapshot.source_sha256 });
    }
    this.now = now;
    this.filename = filename;
    this.transactionDepth = 0;
    this.authorizeObservation = authorizeObservation;
    this.authorizeImportedObservation = authorizeImportedObservation;
    this.authorizeReceipt = authorizeReceipt;
    if (readOnly) {
      try {
        // A single read transaction pins the Graph snapshot across every lookup.
        // Never initialize, migrate, checkpoint or repair a caller's database.
        this.db.exec("BEGIN");
        for (const [table, column] of Object.entries({ events: "payload_json", packages: "manifest_json", policies: "policy_json", runs: "run_json", attempts: "attempt_json", observations: "observation_json", receipts: "receipt_json" })) {
          this.db.prepare(`SELECT ${column} FROM ${table} LIMIT 0`).all();
        }
      } catch (cause) { this.close(); throw cause; }
      readOnlyStores.add(this);
      return;
    }
    this.db.exec(`
      PRAGMA foreign_keys = ON;
      CREATE TABLE IF NOT EXISTS events (
        sequence INTEGER PRIMARY KEY AUTOINCREMENT,
        event_id TEXT NOT NULL UNIQUE,
        event_type TEXT NOT NULL,
        entity_type TEXT NOT NULL,
        entity_id TEXT NOT NULL,
        occurred_at TEXT NOT NULL,
        payload_json TEXT NOT NULL,
        payload_sha256 TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS packages (
        package_id TEXT PRIMARY KEY,
        aggregate_sha256 TEXT NOT NULL,
        manifest_json TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS policies (
        policy_key TEXT PRIMARY KEY,
        policy_id TEXT NOT NULL,
        version INTEGER NOT NULL,
        policy_json TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS runs (
        run_id TEXT PRIMARY KEY,
        policy_key TEXT NOT NULL,
        input_package_id TEXT NOT NULL,
        run_json TEXT NOT NULL,
        FOREIGN KEY(policy_key) REFERENCES policies(policy_key),
        FOREIGN KEY(input_package_id) REFERENCES packages(package_id)
      );
      CREATE TABLE IF NOT EXISTS attempts (
        attempt_id TEXT PRIMARY KEY,
        run_id TEXT NOT NULL,
        attempt_number INTEGER NOT NULL,
        result_package_id TEXT,
        attempt_json TEXT NOT NULL,
        UNIQUE(run_id, attempt_number),
        FOREIGN KEY(run_id) REFERENCES runs(run_id),
        FOREIGN KEY(result_package_id) REFERENCES packages(package_id)
      );
      CREATE TABLE IF NOT EXISTS observations (
        observation_id TEXT PRIMARY KEY,
        run_id TEXT NOT NULL,
        attempt_id TEXT NOT NULL,
        result_package_id TEXT NOT NULL,
        kind TEXT NOT NULL,
        environment TEXT NOT NULL,
        outcome TEXT NOT NULL,
        observation_json TEXT NOT NULL,
        FOREIGN KEY(run_id) REFERENCES runs(run_id),
        FOREIGN KEY(attempt_id) REFERENCES attempts(attempt_id),
        FOREIGN KEY(result_package_id) REFERENCES packages(package_id)
      );
      CREATE TABLE IF NOT EXISTS receipts (
        receipt_id TEXT PRIMARY KEY,
        run_id TEXT NOT NULL,
        attempt_id TEXT NOT NULL,
        result_package_id TEXT NOT NULL,
        receipt_json TEXT NOT NULL,
        FOREIGN KEY(run_id) REFERENCES runs(run_id),
        FOREIGN KEY(attempt_id) REFERENCES attempts(attempt_id),
        FOREIGN KEY(result_package_id) REFERENCES packages(package_id)
      );
      CREATE INDEX IF NOT EXISTS idx_events_entity ON events(entity_type, entity_id, sequence);
      CREATE INDEX IF NOT EXISTS idx_attempts_run ON attempts(run_id, attempt_number);
      CREATE INDEX IF NOT EXISTS idx_observations_run ON observations(run_id, kind, environment);
    `);
  }

  close() {
    if (this.db) this.db.close();
    this.db = null;
    readOnlyStores.delete(this);
    readSnapshots.get(this)?.close(); readSnapshots.delete(this);
  }

  _transaction(callback) {
    if (this.transactionDepth > 0) return callback();
    this.db.exec("BEGIN IMMEDIATE");
    this.transactionDepth = 1;
    try {
      const result = callback();
      this.db.exec("COMMIT");
      return result;
    } catch (cause) {
      this.db.exec("ROLLBACK");
      throw cause;
    } finally {
      this.transactionDepth = 0;
    }
  }

  appendEvent({ sequence, event_id, event_type, entity_type, entity_id, occurred_at, payload, payload_sha256 } = {}) {
    assert(this.db, "delivery store is closed", "DELIVERY_STORE_CLOSED");
    const event = {
      event_id: id("event", event_id),
      event_type,
      entity_type,
      entity_id,
      occurred_at: occurred_at ?? nowIso(this.now),
      payload: clone(payload ?? {})
    };
    assert(typeof event.event_type === "string" && event.event_type.length > 0, "event_type is required", "EVENT_TYPE_REQUIRED");
    assert(typeof event.entity_type === "string" && event.entity_type.length > 0, "entity_type is required", "EVENT_ENTITY_TYPE_REQUIRED");
    assert(typeof event.entity_id === "string" && event.entity_id.length > 0, "entity_id is required", "EVENT_ENTITY_ID_REQUIRED");
    assertKnownEvent(event.event_type, event.entity_type);
    const payloadJson = canonicalJson(event.payload);
    const payloadHash = sha256(payloadJson);
    if (payload_sha256 !== undefined) {
      assert(payload_sha256 === payloadHash, `event payload hash mismatch: ${event.event_id}`, "EVENT_HASH_MISMATCH");
    }
    const existing = this.db.prepare("SELECT sequence, event_id, event_type, entity_type, entity_id, occurred_at, payload_json FROM events WHERE event_id = ?").get(event.event_id);
    if (existing) {
      const existingPayload = fromSqlJson(existing.payload_json);
      assert(
        existing.event_type === event.event_type && existing.entity_type === event.entity_type && existing.entity_id === event.entity_id && existing.occurred_at === event.occurred_at && sameJson(existingPayload, event.payload),
        `event id already exists with different content: ${event.event_id}`,
        "EVENT_IMMUTABLE_CONFLICT"
      );
      if (sequence !== undefined) assert(existing.sequence === sequence, `event sequence differs for existing id: ${event.event_id}`, "EVENT_SEQUENCE_CONFLICT");
      return asPublic({ ...event, sequence: this.db.prepare("SELECT sequence FROM events WHERE event_id = ?").get(event.event_id).sequence, payload_sha256: payloadHash });
    }
    if (sequence !== undefined) {
      assert(Number.isInteger(sequence) && sequence > 0, "imported event sequence must be a positive integer", "EVENT_SEQUENCE_INVALID");
      const occupied = this.db.prepare("SELECT event_id FROM events WHERE sequence = ?").get(sequence);
      assert(!occupied, `event sequence already exists: ${sequence}`, "EVENT_SEQUENCE_CONFLICT");
    }
    const result = sequence === undefined
      ? this.db.prepare("INSERT INTO events (event_id, event_type, entity_type, entity_id, occurred_at, payload_json, payload_sha256) VALUES (?, ?, ?, ?, ?, ?, ?)")
        .run(event.event_id, event.event_type, event.entity_type, event.entity_id, event.occurred_at, payloadJson, payloadHash)
      : this.db.prepare("INSERT INTO events (sequence, event_id, event_type, entity_type, entity_id, occurred_at, payload_json, payload_sha256) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
        .run(sequence, event.event_id, event.event_type, event.entity_type, event.entity_id, event.occurred_at, payloadJson, payloadHash);
    return asPublic({ ...event, sequence: Number(result.lastInsertRowid), payload_sha256: payloadHash });
  }

  registerPackage(manifest) {
    validatePackageManifest(manifest);
    return this._transaction(() => {
      const existing = this.db.prepare("SELECT manifest_json FROM packages WHERE package_id = ?").get(manifest.package_id);
      if (existing) {
        const record = fromSqlJson(existing.manifest_json);
        assert(packageManifestCanonicalHash(record) === packageManifestCanonicalHash(manifest), `package id already exists with different content: ${manifest.package_id}`, "PACKAGE_IMMUTABLE_CONFLICT");
        return asPublic(record);
      }
      const occurredAt = nowIso(this.now);
      this.db.prepare("INSERT INTO packages (package_id, aggregate_sha256, manifest_json, created_at) VALUES (?, ?, ?, ?)")
        .run(manifest.package_id, manifest.aggregate_sha256, canonicalJson(manifest), occurredAt);
      this.appendEvent({ event_type: "package.created", entity_type: "package", entity_id: manifest.package_id, occurred_at: occurredAt, payload: manifest });
      return asPublic(manifest);
    });
  }

  createPackage(input) {
    const manifest = input?.files ? createPackageManifest(input) : input;
    return this.registerPackage(manifest);
  }

  getPackage(packageId) {
    const row = this.db.prepare("SELECT manifest_json FROM packages WHERE package_id = ?").get(packageId);
    return row ? asPublic(fromSqlJson(row.manifest_json)) : null;
  }

  registerGatePolicy(policy) {
    const value = normalisePolicy(policy);
    const key = `${value.policy_id}@${value.version}`;
    return this._transaction(() => {
      const existing = this.db.prepare("SELECT policy_json FROM policies WHERE policy_key = ?").get(key);
      if (existing) {
        const record = fromSqlJson(existing.policy_json);
        assert(sameJson(record, value), `policy version already exists with different content: ${key}`, "POLICY_IMMUTABLE_CONFLICT");
        return asPublic(record);
      }
      this.db.prepare("INSERT INTO policies (policy_key, policy_id, version, policy_json) VALUES (?, ?, ?, ?)")
        .run(key, value.policy_id, value.version, canonicalJson(value));
      this.appendEvent({ event_type: "policy.registered", entity_type: "policy", entity_id: key, payload: value });
      return asPublic(value);
    });
  }

  getGatePolicy(policyRef) {
    const reference = normalisePolicyRef(policyRef);
    const key = `${reference.policy_id}@${reference.version}`;
    const row = this.db.prepare("SELECT policy_json FROM policies WHERE policy_key = ?").get(key);
    return row ? asPublic(fromSqlJson(row.policy_json)) : null;
  }

  createRun(input = {}) {
    return this._transaction(() => {
      if (input.policy && !input.policy_ref) this.registerGatePolicy(input.policy);
      const run = normaliseRun(input, this.now);
      assert(this.getPackage(run.input_basis_package_id), `input basis package does not exist: ${run.input_basis_package_id}`, "RUN_INPUT_PACKAGE_UNKNOWN");
      assert(this.getGatePolicy(run.policy_ref), `gate policy does not exist: ${policyRefValue(run.policy_ref)}`, "RUN_POLICY_UNKNOWN");
      const existing = this.db.prepare("SELECT run_json FROM runs WHERE run_id = ?").get(run.run_id);
      if (existing) {
        const record = fromSqlJson(existing.run_json);
        assert(sameJson(record, run), `run id already exists with different content: ${run.run_id}`, "RUN_IMMUTABLE_CONFLICT");
        return asPublic(record);
      }
      this.db.prepare("INSERT INTO runs (run_id, policy_key, input_package_id, run_json) VALUES (?, ?, ?, ?)")
        .run(run.run_id, policyRefValue(run.policy_ref), run.input_basis_package_id, canonicalJson(run));
      this.appendEvent({ event_type: "run.created", entity_type: "run", entity_id: run.run_id, occurred_at: run.created_at, payload: run });
      return asPublic(run);
    });
  }

  getRun(runId, { include = true } = {}) {
    const row = this.db.prepare("SELECT run_json FROM runs WHERE run_id = ?").get(runId);
    if (!row) return null;
    const run = fromSqlJson(row.run_json);
    if (include) run.attempts = this.listAttempts(runId);
    return asPublic(run);
  }

  createAttempt(input = {}) {
    return this._transaction(() => {
      const run = this.getRun(input.run_id, { include: false });
      assert(run, `run does not exist: ${input.run_id}`, "ATTEMPT_RUN_UNKNOWN");
      if (input.result_package && typeof input.result_package === "object" && input.result_package.files) {
        this.registerPackage(input.result_package);
      }
      const last = this.db.prepare("SELECT MAX(attempt_number) AS attempt_number FROM attempts WHERE run_id = ?").get(run.run_id);
      const attempt = normaliseAttempt(input, run, (packageId) => Boolean(this.getPackage(packageId)), this.now, Number(last?.attempt_number ?? 0) + 1);
      if (attempt.status === "succeeded" && attempt.result_package_id) {
        const inputPackage = this.getPackage(run.input_basis_package_id);
        const resultPackage = this.getPackage(attempt.result_package_id);
        assertAttemptResultInvariant(run, inputPackage, resultPackage);
      }
      const occupiedNumber = this.db.prepare("SELECT attempt_id FROM attempts WHERE run_id = ? AND attempt_number = ?").get(run.run_id, attempt.attempt_number);
      assert(!occupiedNumber || occupiedNumber.attempt_id === attempt.attempt_id, `attempt number already exists for run: ${attempt.attempt_number}`, "ATTEMPT_NUMBER_CONFLICT");
      const existing = this.db.prepare("SELECT attempt_json FROM attempts WHERE attempt_id = ?").get(attempt.attempt_id);
      if (existing) {
        const record = fromSqlJson(existing.attempt_json);
        assert(sameJson(record, attempt), `attempt id already exists with different content: ${attempt.attempt_id}`, "ATTEMPT_IMMUTABLE_CONFLICT");
        return asPublic(record);
      }
      this.db.prepare("INSERT INTO attempts (attempt_id, run_id, attempt_number, result_package_id, attempt_json) VALUES (?, ?, ?, ?, ?)")
        .run(attempt.attempt_id, attempt.run_id, attempt.attempt_number, attempt.result_package_id, canonicalJson(attempt));
      this.appendEvent({ event_type: "attempt.created", entity_type: "attempt", entity_id: attempt.attempt_id, occurred_at: attempt.created_at, payload: attempt });
      return asPublic(attempt);
    });
  }

  getAttempt(attemptId) {
    const row = this.db.prepare("SELECT attempt_json FROM attempts WHERE attempt_id = ?").get(attemptId);
    return row ? asPublic(fromSqlJson(row.attempt_json)) : null;
  }

  listAttempts(runId) {
    return this.db.prepare("SELECT attempt_json FROM attempts WHERE run_id = ? ORDER BY attempt_number ASC").all(runId)
      .map((row) => fromSqlJson(row.attempt_json)).map(asPublic);
  }

  recordObservation(input = {}, internalAuthority) {
    return this._transaction(() => {
    const run = this.getRun(input.run_id, { include: false });
    assert(run, `run does not exist: ${input.run_id}`, "OBSERVATION_RUN_UNKNOWN");
    const attempt = this.getAttempt(input.attempt_id);
    assert(attempt, `attempt does not exist: ${input.attempt_id}`, "OBSERVATION_ATTEMPT_UNKNOWN");
    assert(attempt.run_id === run.run_id, "observation attempt does not belong to run", "OBSERVATION_RUN_MISMATCH");
    assert(attempt.result_package_id === input.result_package_id, "observation must bind the attempt result package exactly", "OBSERVATION_RESULT_PACKAGE_MISMATCH");
    const resultPackage = this.getPackage(input.result_package_id);
    assert(resultPackage, `observation result package does not exist: ${input.result_package_id}`, "OBSERVATION_RESULT_PACKAGE_UNKNOWN");
    if (RECEIPT_OBSERVATION_KINDS.has(input.kind)) {
      assert(internalAuthority === RECEIPT_OBSERVATION_AUTHORITY, "receipt observations can only be produced from a persisted receipt", "OBSERVATION_RECEIPT_REQUIRED");
      const receipt = this.db.prepare("SELECT receipt_json FROM receipts WHERE receipt_id = ?").get(input.payload?.receipt_id);
      assert(receipt, `receipt observation references an unknown receipt: ${input.payload?.receipt_id}`, "OBSERVATION_RECEIPT_REQUIRED");
      const record = fromSqlJson(receipt.receipt_json);
      assert(record.run_id === input.run_id && record.attempt_id === input.attempt_id && record.result_package_id === input.result_package_id && record.outcome === (input.outcome ?? input.result), "receipt observation does not bind its receipt exactly", "OBSERVATION_RECEIPT_MISMATCH");
      assert((record.receipt_type === "delivery" ? "delivery-receipt" : "deployment-receipt") === input.kind, "receipt observation kind does not match receipt type", "OBSERVATION_RECEIPT_MISMATCH");
    }
    assert(input.validation === undefined, "observation.validation is collector-produced and cannot be supplied", "OBSERVATION_VALIDATION_FORBIDDEN");
    const observation = {
      schema_version: "1.0",
      observation_id: id("obs", input.observation_id),
      run_id: run.run_id,
      attempt_id: attempt.attempt_id,
      result_package_id: input.result_package_id,
      kind: input.kind,
      environment: input.environment ?? "local",
      outcome: input.outcome ?? input.result,
      observed_at: input.observed_at ?? nowIso(this.now),
      claim_refs: clone(input.claim_refs ?? []),
      ...(input.artifact_hash ? { artifact_hash: input.artifact_hash } : {}),
      limitations: clone(input.limitations ?? []),
      producer: clone(input.producer ?? {}),
      collector: clone(input.collector ?? {}),
      permission: clone(input.permission ?? {}),
      payload: clone(input.payload ?? {})
    };
    assertTypedObservationPayload(observation.kind, observation.payload);
    const derivedOutcome = derivedObservationOutcome(observation.kind, observation.payload);
    assert(observation.outcome === undefined || observation.outcome === derivedOutcome, "observation outcome does not match typed payload", "OBSERVATION_OUTCOME_MISMATCH");
    observation.outcome = derivedOutcome;
    const authorization = internalAuthority === RECEIPT_OBSERVATION_AUTHORITY
      ? { granted: observation.permission.granted === true, receipt: `receipt:${observation.payload.receipt_id}` }
      : this.authorizeObservation(asPublic({ ...observation }), { run: asPublic(run), attempt: asPublic(attempt), result_package: resultPackage });
    assert(authorization && typeof authorization.granted === "boolean" && typeof authorization.receipt === "string" && authorization.receipt.length > 0, "host observation authorizer returned an invalid result", "OBSERVATION_AUTHORIZER_INVALID");
    observation.validation = {
      contract_id: observationContractId(observation.kind),
      contract_version: OBSERVATION_CONTRACT_VERSION,
      validator_id: OBSERVATION_VALIDATOR_ID,
      validated_at: observation.observed_at,
      payload_sha256: sha256(observation.payload),
      result_package_aggregate_sha256: resultPackage.aggregate_sha256,
      eligible: authorization.granted === true,
      authorization_receipt: authorization.receipt,
      ...(authorization.granted === true ? {} : { reason: "host-authorization-not-granted" })
    };
    validateObservation(observation, { resultPackage });
    const existing = this.db.prepare("SELECT observation_json FROM observations WHERE observation_id = ?").get(observation.observation_id);
    if (existing) {
      const record = fromSqlJson(existing.observation_json);
      assert(sameJson(record, observation), `observation id already exists with different content: ${observation.observation_id}`, "OBSERVATION_IMMUTABLE_CONFLICT");
      return asPublic(record);
    }
    this.db.prepare("INSERT INTO observations (observation_id, run_id, attempt_id, result_package_id, kind, environment, outcome, observation_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
      .run(observation.observation_id, observation.run_id, observation.attempt_id, observation.result_package_id, observation.kind, observation.environment, observation.outcome, canonicalJson(observation));
    this.appendEvent({ event_type: "observation.recorded", entity_type: "observation", entity_id: observation.observation_id, occurred_at: observation.observed_at, payload: observation });
    return asPublic(observation);
    });
  }

  getObservation(observationId) {
    const row = this.db.prepare("SELECT observation_json FROM observations WHERE observation_id = ?").get(observationId);
    return row ? asPublic(fromSqlJson(row.observation_json)) : null;
  }

  listObservations(runId) {
    return this.db.prepare("SELECT observation_json FROM observations WHERE run_id = ? ORDER BY rowid ASC").all(runId)
      .map((row) => fromSqlJson(row.observation_json)).map(asPublic);
  }

  createReceipt(input = {}) {
    return this._transaction(() => {
    const run = this.getRun(input.run_id, { include: false });
    assert(run, `run does not exist: ${input.run_id}`, "RECEIPT_RUN_UNKNOWN");
    const attempt = this.getAttempt(input.attempt_id);
    assert(attempt, `attempt does not exist: ${input.attempt_id}`, "RECEIPT_ATTEMPT_UNKNOWN");
    assert(attempt.run_id === run.run_id, "receipt attempt does not belong to run", "RECEIPT_RUN_MISMATCH");
    assert(attempt.result_package_id === input.result_package_id, "receipt must bind the attempt result package exactly", "RECEIPT_RESULT_PACKAGE_MISMATCH");
    assert(this.getPackage(input.result_package_id), `receipt result package does not exist: ${input.result_package_id}`, "RECEIPT_RESULT_PACKAGE_UNKNOWN");
    assert(["delivery", "deployment"].includes(input.receipt_type), "receipt_type must be delivery or deployment", "RECEIPT_TYPE_INVALID");
    const readback = clone(input.readback ?? { status: "not-verified" });
    assert(RECEIPT_READBACK.has(readback.status), "readback.status is invalid", "RECEIPT_READBACK_INVALID");
    if (readback.status === "confirmed") {
      readback.result_package_id ??= input.result_package_id;
    }
    const receipt = {
      schema_version: "1.0",
      receipt_id: id("receipt", input.receipt_id),
      receipt_type: input.receipt_type,
      run_id: run.run_id,
      attempt_id: attempt.attempt_id,
      result_package_id: input.result_package_id,
      target: clone(input.target ?? { kind: "unknown", identity: "unknown" }),
      authorization: clone(input.authorization ?? { granted: false, actor: "unknown" }),
      readback,
      outcome: RECEIPT_OUTCOME[readback.status],
      created_at: input.created_at ?? nowIso(this.now)
    };
    validateReceipt(receipt);
    const receiptAuthorization = this.authorizeReceipt(asPublic(receipt));
    assert(receiptAuthorization && typeof receiptAuthorization.granted === "boolean" && typeof receiptAuthorization.receipt === "string" && receiptAuthorization.receipt.length > 0, "host receipt authorizer returned an invalid result", "RECEIPT_AUTHORIZER_INVALID");
    if (receipt.outcome === "satisfied") assert(receiptAuthorization.granted === true, "confirmed receipt requires trusted host readback authorization", "RECEIPT_HOST_AUTHORIZATION_REQUIRED");
    const existing = this.db.prepare("SELECT receipt_json FROM receipts WHERE receipt_id = ?").get(receipt.receipt_id);
    if (existing) {
      const record = fromSqlJson(existing.receipt_json);
      assert(sameJson(record, receipt), `receipt id already exists with different content: ${receipt.receipt_id}`, "RECEIPT_IMMUTABLE_CONFLICT");
      return asPublic(record);
    }
    this.db.prepare("INSERT INTO receipts (receipt_id, run_id, attempt_id, result_package_id, receipt_json) VALUES (?, ?, ?, ?, ?)")
      .run(receipt.receipt_id, receipt.run_id, receipt.attempt_id, receipt.result_package_id, canonicalJson(receipt));
    this.appendEvent({ event_type: `${receipt.receipt_type}.receipt.created`, entity_type: "receipt", entity_id: receipt.receipt_id, occurred_at: receipt.created_at, payload: receipt });
    this.recordObservation({
      observation_id: `obs:${receipt.receipt_id.slice("receipt:".length)}`,
      run_id: receipt.run_id,
      attempt_id: receipt.attempt_id,
      result_package_id: receipt.result_package_id,
      kind: receipt.receipt_type === "delivery" ? "delivery-receipt" : "deployment-receipt",
      environment: input.environment ?? (receipt.receipt_type === "delivery" ? "target-like" : "deployed"),
      outcome: receipt.outcome,
      observed_at: receipt.created_at,
      payload: {
        receipt_id: receipt.receipt_id,
        target: receipt.target,
        authorization: receipt.authorization,
        readback: receipt.readback
      },
      producer: {
        capability_id: input.producer?.capability_id ?? "repo-delivery",
        capability_version: input.producer?.capability_version ?? "1.0.0",
        actor: input.producer?.actor ?? receipt.authorization.actor,
        session_id: input.producer?.session_id ?? receipt.receipt_id
      },
      collector: input.collector ?? { id: "forgeway.delivery.receipt", version: "1.0.0" },
      permission: input.permission ?? {
        mode: receipt.receipt_type === "delivery" ? "git-write" : "deploy",
        granted: receipt.authorization.granted === true,
        authorization_ref: receiptAuthorization.receipt
      },
      limitations: input.limitations ?? []
    }, RECEIPT_OBSERVATION_AUTHORITY);
    return asPublic(receipt);
    });
  }

  createDeliveryReceipt(input = {}) {
    return this.createReceipt({ ...input, receipt_type: "delivery" });
  }

  createDeploymentReceipt(input = {}) {
    return this.createReceipt({ ...input, receipt_type: "deployment" });
  }

  listReceipts(runId) {
    return this.db.prepare("SELECT receipt_json FROM receipts WHERE run_id = ? ORDER BY rowid ASC").all(runId)
      .map((row) => fromSqlJson(row.receipt_json)).map(asPublic);
  }

  projectPredicates({ run_id, policy_ref, report: _report } = {}) {
    const run = this.getRun(run_id, { include: true });
    assert(run, `run does not exist: ${run_id}`, "PROJECTION_RUN_UNKNOWN");
    const policy = this.getGatePolicy(policy_ref ?? run.policy_ref);
    assert(policy, `gate policy does not exist: ${policyRefValue(policy_ref ?? run.policy_ref)}`, "PROJECTION_POLICY_UNKNOWN");
    const observations = this.listObservations(run_id);
    // `report` is intentionally not read. Derived views cannot become gate
    // inputs; only immutable events and their typed observations are used.
    return asPublic(projectPolicy(policy, run, observations));
  }

  events({ entity_type, entity_id, after = 0 } = {}) {
    const filters = ["sequence > ?"];
    const args = [after];
    if (entity_type) { filters.push("entity_type = ?"); args.push(entity_type); }
    if (entity_id) { filters.push("entity_id = ?"); args.push(entity_id); }
    return this.db.prepare(`SELECT sequence, event_id, event_type, entity_type, entity_id, occurred_at, payload_json, payload_sha256 FROM events WHERE ${filters.join(" AND ")} ORDER BY sequence ASC`)
      .all(...args)
      .map((row) => asPublic({ sequence: row.sequence, event_id: row.event_id, event_type: row.event_type, entity_type: row.entity_type, entity_id: row.entity_id, occurred_at: row.occurred_at, payload: fromSqlJson(row.payload_json), payload_sha256: row.payload_sha256 }));
  }

  exportEvents() {
    return this.events();
  }

  importEvents(events = []) {
    assert(Array.isArray(events), "events must be an array", "EVENT_IMPORT_INVALID");
    let previousSequence = 0;
    return this._transaction(() => {
      for (const event of events) {
        assertKnownEvent(event.event_type, event.entity_type);
        assert(Number.isInteger(event.sequence) && event.sequence > previousSequence, "imported events must have strictly increasing positive sequences", "EVENT_SEQUENCE_INVALID");
        previousSequence = event.sequence;
        const payload = event.payload ?? eventPayload(event.event_type, event.entity);
        const entity = payload?.entity ?? payload;
        const expectedEntityId = eventEntityId(entity, event.event_type);
        if (expectedEntityId) assert(event.entity_id === expectedEntityId, `event entity id does not match payload: ${event.event_id} (${event.event_type}: ${event.entity_id} != ${expectedEntityId})`, "EVENT_ENTITY_MISMATCH");
        this._applyImportedEntity(event.event_type, entity, event.occurred_at);
        this.appendEvent({ ...event, payload });
      }
      return this.events();
    });
  }

  _applyImportedEntity(eventType, entity, occurredAt) {
    if (!entity || typeof entity !== "object") return;
    switch (eventType) {
      case "package.created": this._insertImportedPackage(entity, occurredAt); break;
      case "policy.registered": this._insertImportedPolicy(entity); break;
      case "run.created": this._insertImportedRun(entity); break;
      case "attempt.created": this._insertImportedAttempt(entity); break;
      case "observation.recorded": this._insertImportedObservation(entity); break;
      case "delivery.receipt.created":
      case "deployment.receipt.created": this._insertImportedReceipt(entity); break;
      default: break;
    }
  }

  _insertImportedPackage(manifest, occurredAt) {
    validatePackageManifest(manifest);
    const existing = this.db.prepare("SELECT manifest_json FROM packages WHERE package_id = ?").get(manifest.package_id);
    if (!existing) {
      this.db.prepare("INSERT INTO packages (package_id, aggregate_sha256, manifest_json, created_at) VALUES (?, ?, ?, ?)")
        .run(manifest.package_id, manifest.aggregate_sha256, canonicalJson(manifest), occurredAt ?? manifest.created_at ?? nowIso(this.now));
    } else {
      assert(packageManifestCanonicalHash(fromSqlJson(existing.manifest_json)) === packageManifestCanonicalHash(manifest), `import package conflict: ${manifest.package_id}`, "EVENT_IMPORT_CONFLICT");
    }
  }

  _insertImportedPolicy(policy) {
    const value = normalisePolicy(policy);
    const key = `${value.policy_id}@${value.version}`;
    const existing = this.db.prepare("SELECT policy_json FROM policies WHERE policy_key = ?").get(key);
    if (!existing) {
      this.db.prepare("INSERT INTO policies (policy_key, policy_id, version, policy_json) VALUES (?, ?, ?, ?)")
        .run(key, value.policy_id, value.version, canonicalJson(value));
    } else {
      assert(sameJson(fromSqlJson(existing.policy_json), value), `import policy conflict: ${key}`, "EVENT_IMPORT_CONFLICT");
    }
  }

  _insertImportedRun(run) {
    validateRun(run);
    assert(this.getPackage(run.input_basis_package_id), `import run input package missing: ${run.input_basis_package_id}`, "EVENT_IMPORT_REF_MISSING");
    assert(this.getGatePolicy(run.policy_ref), `import run policy missing: ${policyRefValue(run.policy_ref)}`, "EVENT_IMPORT_REF_MISSING");
    const existing = this.db.prepare("SELECT run_json FROM runs WHERE run_id = ?").get(run.run_id);
    if (!existing) this.db.prepare("INSERT INTO runs (run_id, policy_key, input_package_id, run_json) VALUES (?, ?, ?, ?)").run(run.run_id, policyRefValue(run.policy_ref), run.input_basis_package_id, canonicalJson(run));
    else assert(sameJson(fromSqlJson(existing.run_json), run), `import run conflict: ${run.run_id}`, "EVENT_IMPORT_CONFLICT");
  }

  _insertImportedAttempt(attempt) {
    validateAttempt(attempt);
    const run = this.getRun(attempt.run_id, { include: false });
    assert(run, `import attempt run missing: ${attempt.run_id}`, "EVENT_IMPORT_REF_MISSING");
    const resultPackage = attempt.result_package_id ? this.getPackage(attempt.result_package_id) : null;
    if (attempt.result_package_id) assert(resultPackage, `import attempt package missing: ${attempt.result_package_id}`, "EVENT_IMPORT_REF_MISSING");
    if (attempt.status === "succeeded" && resultPackage) {
      const inputPackage = this.getPackage(run.input_basis_package_id);
      assertAttemptResultInvariant(run, inputPackage, resultPackage);
    }
    const existing = this.db.prepare("SELECT attempt_json FROM attempts WHERE attempt_id = ?").get(attempt.attempt_id);
    if (!existing) this.db.prepare("INSERT INTO attempts (attempt_id, run_id, attempt_number, result_package_id, attempt_json) VALUES (?, ?, ?, ?, ?)").run(attempt.attempt_id, attempt.run_id, attempt.attempt_number, attempt.result_package_id, canonicalJson(attempt));
    else assert(sameJson(fromSqlJson(existing.attempt_json), attempt), `import attempt conflict: ${attempt.attempt_id}`, "EVENT_IMPORT_CONFLICT");
  }

  _insertImportedObservation(observation) {
    const resultPackage = this.getPackage(observation.result_package_id);
    assert(resultPackage, `import observation result package missing: ${observation.result_package_id}`, "EVENT_IMPORT_REF_MISSING");
    validateObservation(observation, { resultPackage });
    if (observation.validation.eligible) assert(this.authorizeImportedObservation(asPublic(observation)) === true, `imported eligible observation is not trusted by the host: ${observation.observation_id}`, "EVENT_IMPORT_OBSERVATION_UNTRUSTED");
    const attempt = this.getAttempt(observation.attempt_id);
    assert(attempt && attempt.run_id === observation.run_id && attempt.result_package_id === observation.result_package_id, `import observation references do not close: ${observation.observation_id}`, "EVENT_IMPORT_REF_MISSING");
    if (RECEIPT_OBSERVATION_KINDS.has(observation.kind)) {
      const receipt = this.db.prepare("SELECT receipt_json FROM receipts WHERE receipt_id = ?").get(observation.payload?.receipt_id);
      assert(receipt, `import receipt observation references an unknown receipt: ${observation.payload?.receipt_id}`, "EVENT_IMPORT_REF_MISSING");
      const record = fromSqlJson(receipt.receipt_json);
      assert(record.run_id === observation.run_id && record.attempt_id === observation.attempt_id && record.result_package_id === observation.result_package_id && record.outcome === observation.outcome, `import receipt observation does not bind receipt: ${observation.observation_id}`, "EVENT_IMPORT_REF_MISSING");
      assert((record.receipt_type === "delivery" ? "delivery-receipt" : "deployment-receipt") === observation.kind, `import receipt observation kind mismatch: ${observation.observation_id}`, "EVENT_IMPORT_REF_MISSING");
    }
    const existing = this.db.prepare("SELECT observation_json FROM observations WHERE observation_id = ?").get(observation.observation_id);
    if (!existing) this.db.prepare("INSERT INTO observations (observation_id, run_id, attempt_id, result_package_id, kind, environment, outcome, observation_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?)").run(observation.observation_id, observation.run_id, observation.attempt_id, observation.result_package_id, observation.kind, observation.environment, observation.outcome, canonicalJson(observation));
    else assert(sameJson(fromSqlJson(existing.observation_json), observation), `import observation conflict: ${observation.observation_id}`, "EVENT_IMPORT_CONFLICT");
  }

  _insertImportedReceipt(receipt) {
    validateReceipt(receipt);
    const attempt = this.getAttempt(receipt.attempt_id);
    assert(attempt && attempt.run_id === receipt.run_id && attempt.result_package_id === receipt.result_package_id, `import receipt references do not close: ${receipt.receipt_id}`, "EVENT_IMPORT_REF_MISSING");
    const existing = this.db.prepare("SELECT receipt_json FROM receipts WHERE receipt_id = ?").get(receipt.receipt_id);
    if (!existing) this.db.prepare("INSERT INTO receipts (receipt_id, run_id, attempt_id, result_package_id, receipt_json) VALUES (?, ?, ?, ?, ?)").run(receipt.receipt_id, receipt.run_id, receipt.attempt_id, receipt.result_package_id, canonicalJson(receipt));
    else assert(sameJson(fromSqlJson(existing.receipt_json), receipt), `import receipt conflict: ${receipt.receipt_id}`, "EVENT_IMPORT_CONFLICT");
  }

  snapshot() {
    return asPublic({
      packages: this.db.prepare("SELECT manifest_json FROM packages ORDER BY package_id").all().map((row) => fromSqlJson(row.manifest_json)),
      policies: this.db.prepare("SELECT policy_json FROM policies ORDER BY policy_id, version").all().map((row) => fromSqlJson(row.policy_json)),
      runs: this.db.prepare("SELECT run_json FROM runs ORDER BY run_id").all().map((row) => fromSqlJson(row.run_json)),
      attempts: this.db.prepare("SELECT attempt_json FROM attempts ORDER BY run_id, attempt_number").all().map((row) => fromSqlJson(row.attempt_json)),
      observations: this.db.prepare("SELECT observation_json FROM observations ORDER BY run_id, rowid").all().map((row) => fromSqlJson(row.observation_json)),
      receipts: this.db.prepare("SELECT receipt_json FROM receipts ORDER BY run_id, rowid").all().map((row) => fromSqlJson(row.receipt_json)),
      events: this.events()
    });
  }
}

export function createDeliveryStore(options) {
  return new DeliveryStore(options);
}

export { projectPolicy, validateGatePolicy };
