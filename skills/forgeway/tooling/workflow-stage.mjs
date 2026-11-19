#!/usr/bin/env node
import fs from "node:fs";
import { projectDispatch, parseDispatchSnapshot } from "./workflow-dispatch.mjs";
import { readMetadataSnapshot } from "./maintenance/profiles.mjs";
import { createHash } from "node:crypto";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { createDeliveryStore, OBSERVATION_KINDS } from "./delivery/index.mjs";
import {
  deliveryClosureFindings,
  driftInvalidation,
  validateCapabilityAlignment
} from "./workflow-delivery-closure.mjs";

export const WORKFLOW_CLI_PROTOCOL_VERSION = "forgeway-workflow-cli/2";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DEFAULT_REGISTRY = path.join(ROOT, "runtime", "stages.json");
const REGISTRY_SCHEMA_VERSION = "forgeway-stage-registry/1";
const STATE_SCHEMA_VERSION = "forgeway-workflow-state/1";
const PROJECTION_SCHEMA_VERSION = "forgeway-next-action/1";
const VALID_EFFECTS = new Set([
  "read-only",
  "artifact-write",
  "source-write",
  "runtime-operation",
  "delivery-write"
]);
const VALID_STAGE_APPLICABILITY = new Set(["required", "conditional"]);
const VALID_EXECUTION_KINDS = new Set(["kernel", "host", "capability"]);
const VALID_INPUT_SOURCES = new Set(["run-input", "previous-terminal"]);
const VALID_OBSERVATION_OUTCOMES = new Set(["satisfied", "unsatisfied", "not-verified"]);
const VALID_DELIVERY_OUTCOMES = new Set(["succeeded", "failed", "blocked", "not-executed"]);
const VALID_STAGE_STATUSES = new Set([
  "pending",
  "ready",
  "running",
  "blocked",
  "completed",
  "skipped",
  "stale"
]);
const VALID_INTERRUPT_STATUSES = new Set([
  "required",
  "running",
  "blocked",
  "completed"
]);
const REQUIRED_WORKFLOW_HEADINGS = [
  "## Stage contract",
  "## Purpose",
  "## Entry contract",
  "## Procedure",
  "## Exit contract",
  "## Stop states",
  "## Resume and invalidation",
  "## Brownfield behavior",
  "## Validation"
];
const BROWNFIELD_UNCHANGED_AUTHORITIES = ["product", "interface", "data", "ui", "architecture"];

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function hasText(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function isSha256Fingerprint(value) {
  return typeof value === "string" && /^sha256:[0-9a-f]{64}$/.test(value);
}

function duplicates(values) {
  const seen = new Set();
  const found = new Set();
  for (const value of values) {
    if (seen.has(value)) found.add(value);
    else seen.add(value);
  }
  return [...found];
}

function containsAll(values, required) {
  const set = new Set(values ?? []);
  return required.every((value) => set.has(value));
}

function hostAdapterValid(adapter) {
  return hasText(adapter?.contract_id)
    && hasText(adapter?.contract_version)
    && ["implemented", "external-required"].includes(adapter?.runtime_binding)
    && ((adapter.runtime_binding === "implemented" && adapter.implementation_status === "verified")
      || (adapter.runtime_binding === "external-required" && adapter.implementation_status === "not-verified"));
}

function parseArguments(argv) {
  const positionals = [];
  const flags = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith("--")) {
      positionals.push(token);
      continue;
    }
    const key = token.slice(2);
    const next = argv[index + 1];
    if (!next || next.startsWith("--")) flags[key] = true;
    else {
      flags[key] = next;
      index += 1;
    }
  }
  return { positionals, flags };
}

function emit(value, flags = {}) {
  const contents = `${JSON.stringify(value, null, flags.compact ? 0 : 2)}\n`;
  if (hasText(flags.output)) fs.writeFileSync(path.resolve(flags.output), contents);
  else process.stdout.write(contents);
}

function usage() {
  return {
    schema_version: "forgeway-workflow-cli-help/2",
    cli_protocol_version: WORKFLOW_CLI_PROTOCOL_VERSION,
    usage: [
      "node tooling/workflow-stage.mjs validate [--registry runtime/stages.json] [--skills-index <skills-index.json>]",
      "node tooling/workflow-stage.mjs next --view dispatch --copy-snapshot --state <workflow-state.json> --delivery-db <delivery.sqlite> [--skills-index <skills-index.json> --adapters <adapters.json>] [--capability-id <id>] [--adapter-id <id>]",
      "node tooling/workflow-stage.mjs next --copy-snapshot --state <workflow-state.json> --delivery-db <delivery.sqlite> [--registry runtime/stages.json] [--output <file>]"
    ],
    notes: [
      "CLI v2 requires explicit --copy-snapshot for both next views; existing next-action/1 projection fields are unchanged after admission.",
      "Migrate a completed stable rollback-journal database invocation by adding --copy-snapshot; WAL/live DBs require a separately prepared host snapshot. No implicit copying.",
      "The next-action projection is derived guidance and always sets authorizes_execution=false.",
      "A host must still resolve a live capability, effective scope, confirmation, and environment before invoking a stage owner."
    ]
  };
}

export function readStageRegistry(filename = DEFAULT_REGISTRY) {
  return JSON.parse(fs.readFileSync(filename, "utf8"));
}

export function readWorkflowState(filename) {
  return JSON.parse(fs.readFileSync(filename, "utf8"));
}

export function validateStageRegistry(registry, { root = ROOT } = {}) {
  const findings = [];
  if (!isObject(registry)) return ["registry must be an object"];
  if (registry.schema_version !== REGISTRY_SCHEMA_VERSION) {
    findings.push(`schema_version must be ${REGISTRY_SCHEMA_VERSION}`);
  }
  for (const field of ["registry_id", "registry_version"]) {
    if (!hasText(registry[field])) findings.push(`${field} must be non-empty`);
  }

  const lifecycle = registry.lifecycle;
  if (!isObject(lifecycle)) findings.push("lifecycle must be an object");
  else {
    for (const field of ["owner", "producer", "validator", "drift_policy", "retirement_rule"]) {
      if (!hasText(lifecycle[field])) findings.push(`lifecycle.${field} must be non-empty`);
    }
    if (!Array.isArray(lifecycle.non_llm_consumers) || lifecycle.non_llm_consumers.length === 0 || lifecycle.non_llm_consumers.some((value) => !hasText(value))) {
      findings.push("lifecycle.non_llm_consumers must contain at least one named consumer");
    }
  }

  if (!isObject(registry.capability_contracts) || Object.keys(registry.capability_contracts).length === 0) findings.push("capability_contracts must be a non-empty object");
  else for (const [capabilityId, contract] of Object.entries(registry.capability_contracts)) {
    if (!hasText(contract?.version) || !hasText(contract?.maximum_mutation_class)) findings.push(`capability contract ${capabilityId} requires version and maximum_mutation_class`);
    if (contract?.owner !== undefined || contract?.package !== undefined || contract?.provider !== undefined) findings.push(`capability contract ${capabilityId} must not select a package, owner, or provider`);
    for (const field of ["accepts", "produces", "evidence_requirements"]) if (!Array.isArray(contract?.[field]) || contract[field].length === 0 || contract[field].some((value) => !hasText(value))) findings.push(`capability contract ${capabilityId}.${field} must be a non-empty string array`);
  }

  const stages = registry.stages;
  if (!Array.isArray(stages) || stages.length === 0) return [...findings, "stages must be a non-empty array"];
  const stageIds = stages.map((stage) => stage?.id);
  for (const duplicate of duplicates(stageIds)) findings.push(`duplicate stage id: ${duplicate}`);
  const stageById = new Map(stages.map((stage) => [stage.id, stage]));

  stages.forEach((stage, index) => {
    const label = hasText(stage?.id) ? stage.id : `stages[${index}]`;
    if (!isObject(stage)) {
      findings.push(`${label} must be an object`);
      return;
    }
    for (const field of ["id", "contract_version", "workflow_ref"]) {
      if (!hasText(stage[field])) findings.push(`${label}.${field} must be non-empty`);
    }
    if (!VALID_EXECUTION_KINDS.has(stage.execution_kind)) findings.push(`${label}.execution_kind must be kernel, host, or capability`);
    if (stage.execution_kind === "kernel" && stage.capability_resolution !== undefined) findings.push(`${label} kernel stage must not define capability_resolution`);
    if (stage.execution_kind === "host" && !hostAdapterValid(stage.host_adapter)) findings.push(`${label} host stage requires an explicit implemented or external-required host_adapter status`);
    if (stage.execution_kind === "capability") {
      const candidates = stage.capability_resolution?.candidates;
      if (!Array.isArray(candidates) || candidates.length === 0 || candidates.some((value) => !hasText(value))) findings.push(`${label} capability stage requires capability_resolution.candidates`);
      if (Array.isArray(candidates) && candidates.length > 1 && !hasText(stage.capability_resolution?.selector)) findings.push(`${label} multiple capability candidates require a selector`);
      for (const capabilityId of candidates ?? []) if (!registry.capability_contracts?.[capabilityId]) findings.push(`${label} capability has no compatibility contract: ${capabilityId}`);
      for (const adapter of stage.capability_resolution?.conditional_adapters ?? []) {
        if (typeof adapter === "string" && !registry.capability_contracts?.[adapter]) findings.push(`${label} conditional capability has no compatibility contract: ${adapter}`);
        if (isObject(adapter) && (!hasText(adapter.action) || !hostAdapterValid(adapter))) findings.push(`${label} conditional host adapter must declare an implemented or external-required status`);
      }
    }
    if (stage.order !== index) findings.push(`${label}.order must be contiguous and equal ${index}`);
    if (!VALID_INPUT_SOURCES.has(stage.input_from)) findings.push(`${label}.input_from must be run-input or previous-terminal`);
    const defaultEvidence = stage.exit_evidence?.default;
    if (!Array.isArray(stage.exit_evidence?.producer_capabilities) || stage.exit_evidence.producer_capabilities.length === 0 || stage.exit_evidence.producer_capabilities.some((value) => !hasText(value))) findings.push(`${label}.exit_evidence.producer_capabilities must be a non-empty string array`);
    if (stage.exit_evidence?.observation_validator_id !== "forgeway.delivery.observation") findings.push(`${label}.exit_evidence.observation_validator_id is unsupported`);
    if (!Array.isArray(stage.exit_evidence?.payload_validator_ids) || stage.exit_evidence.payload_validator_ids.length === 0 || stage.exit_evidence.payload_validator_ids.some((value) => !hasText(value))) findings.push(`${label}.exit_evidence.payload_validator_ids must be a non-empty string array`);
    if (stage.exit_evidence?.target_binding !== "result-package-and-exit-condition") findings.push(`${label}.exit_evidence.target_binding is unsupported`);
    if (!isObject(defaultEvidence) || !Array.isArray(defaultEvidence.kinds) || defaultEvidence.kinds.length === 0 || defaultEvidence.kinds.some((kind) => !OBSERVATION_KINDS.includes(kind)) || !Array.isArray(defaultEvidence.outcomes) || defaultEvidence.outcomes.length === 0 || defaultEvidence.outcomes.some((outcome) => !VALID_OBSERVATION_OUTCOMES.has(outcome))) {
      findings.push(`${label}.exit_evidence.default must declare supported kinds and outcomes`);
    }
    for (const [condition, rule] of Object.entries(stage.exit_evidence?.overrides ?? {})) {
      if (!stage.exit_conditions?.includes(condition)) findings.push(`${label}.exit_evidence override references unknown condition: ${condition}`);
      if (!Array.isArray(rule?.kinds) || rule.kinds.length === 0 || rule.kinds.some((kind) => !OBSERVATION_KINDS.includes(kind)) || !Array.isArray(rule?.outcomes) || rule.outcomes.length === 0 || rule.outcomes.some((outcome) => !VALID_OBSERVATION_OUTCOMES.has(outcome))) findings.push(`${label}.exit_evidence override is invalid: ${condition}`);
    }
    if (!VALID_STAGE_APPLICABILITY.has(stage.applicability)) {
      findings.push(`${label}.applicability must be required or conditional`);
    }
    if (!VALID_EFFECTS.has(stage.maximum_effect)) {
      findings.push(`${label}.maximum_effect is unsupported: ${stage.maximum_effect}`);
    }
    for (const field of ["entry_conditions", "exit_conditions", "stop_states", "invalidation_triggers"]) {
      if (!Array.isArray(stage[field]) || stage[field].length === 0 || stage[field].some((value) => !hasText(value))) {
        findings.push(`${label}.${field} must be a non-empty string array`);
      }
      for (const duplicate of duplicates(stage[field] ?? [])) findings.push(`${label}.${field} contains duplicate: ${duplicate}`);
    }
    if (!Array.isArray(stage.support_capability_requests) || stage.support_capability_requests.some((value) => !hasText(value))) {
      findings.push(`${label}.support_capability_requests must be a string array`);
    }
    if (hasText(stage.workflow_ref)) {
      if (path.isAbsolute(stage.workflow_ref) || stage.workflow_ref.split(/[\\/]/).includes("..")) {
        findings.push(`${label}.workflow_ref must be repository-relative without parent traversal`);
      } else {
        const workflowPath = path.join(root, stage.workflow_ref);
        if (!fs.existsSync(workflowPath)) findings.push(`${label}.workflow_ref does not exist: ${stage.workflow_ref}`);
        else {
          const contents = fs.readFileSync(workflowPath, "utf8");
          for (const heading of REQUIRED_WORKFLOW_HEADINGS) {
            if (!contents.includes(heading)) findings.push(`${label} workflow is missing heading: ${heading}`);
          }
          if (!contents.includes(`- Stage ID: \`${stage.id}\``)) {
            findings.push(`${label} workflow must bind the exact stage id`);
          }
          if (!contents.includes(`- Contract version: \`${stage.contract_version}\``)) {
            findings.push(`${label} workflow must bind the exact contract version`);
          }
        }
      }
    }
  });

  const goals = registry.goals;
  if (!isObject(goals) || Object.keys(goals).length === 0) findings.push("goals must be a non-empty object");
  else {
    for (const [goalId, goal] of Object.entries(goals)) {
      if (!isObject(goal)) {
        findings.push(`goal ${goalId} must be an object`);
        continue;
      }
      if (!stageById.has(goal.terminal_stage)) findings.push(`goal ${goalId} references unknown terminal_stage: ${goal.terminal_stage}`);
      if (!hasText(goal.description)) findings.push(`goal ${goalId}.description must be non-empty`);
    }
  }

  const interrupts = registry.interrupts;
  if (!Array.isArray(interrupts)) findings.push("interrupts must be an array");
  else {
    const interruptIds = interrupts.map((interrupt) => interrupt?.id);
    for (const duplicate of duplicates(interruptIds)) findings.push(`duplicate interrupt id: ${duplicate}`);
    for (const interrupt of interrupts) {
      const label = `interrupt ${interrupt?.id ?? "unknown"}`;
      for (const field of ["id", "contract_version", "workflow_ref", "capability_request", "trigger"]) {
        if (!hasText(interrupt?.[field])) findings.push(`${label}.${field} must be non-empty`);
      }
      if (!VALID_EXECUTION_KINDS.has(interrupt?.execution_kind)) findings.push(`${label}.execution_kind must be kernel, host, or capability`);
      if (interrupt?.execution_kind === "kernel" && interrupt.capability_resolution !== undefined) findings.push(`${label} kernel interrupt must not define capability_resolution`);
      if (interrupt?.execution_kind === "host" && !hostAdapterValid(interrupt.host_adapter)) findings.push(`${label} host interrupt requires an explicit implemented or external-required host_adapter status`);
      if (!VALID_EFFECTS.has(interrupt?.maximum_effect)) findings.push(`${label}.maximum_effect is unsupported`);
      for (const field of ["exit_conditions", "stop_states"]) {
        if (!Array.isArray(interrupt?.[field]) || interrupt[field].length === 0 || interrupt[field].some((value) => !hasText(value))) {
          findings.push(`${label}.${field} must be a non-empty string array`);
        }
      }
      if (hasText(interrupt?.workflow_ref)) {
        const interruptPath = path.join(root, interrupt.workflow_ref);
        if (!fs.existsSync(interruptPath)) findings.push(`${label}.workflow_ref does not exist: ${interrupt.workflow_ref}`);
      }
    }
  }

  return findings;
}

export function validateWorkflowState(state, registry, { deliveryStore } = {}) {
  const findings = [];
  if (!isObject(state)) return ["workflow state must be an object"];
  if (state.schema_version !== STATE_SCHEMA_VERSION) findings.push(`schema_version must be ${STATE_SCHEMA_VERSION}`);
  if (!hasText(state.run_id)) findings.push("run_id must be non-empty");
  if (!hasText(state.run_input_package_id)) findings.push("run_input_package_id must be non-empty");
  if (!isObject(registry.goals) || !Object.hasOwn(registry.goals, state.goal)) findings.push(`unknown goal: ${state.goal}`);
  if (!isObject(state.basis) || !isSha256Fingerprint(state.basis.fingerprint)) {
    findings.push("basis.fingerprint must use sha256:<64 lowercase hex>");
  }
  if (!Array.isArray(state.stage_states)) findings.push("stage_states must be an array");
  if (state.interrupt_states !== undefined && !Array.isArray(state.interrupt_states)) findings.push("interrupt_states must be an array when present");

  const stageById = new Map(registry.stages.map((stage) => [stage.id, stage]));
  const stageStates = Array.isArray(state.stage_states) ? state.stage_states : [];
  if (state.brownfield_admission !== undefined) {
    const admission = state.brownfield_admission;
    if (!isObject(admission)
      || admission.contract_version !== "1.0.0"
      || admission.kind !== "simple-bug"
      || admission.verification_status !== "host-verified"
      || !hasText(admission.host_verification_ref)
      || !hasText(admission.task_ref)
      || !hasText(admission.failing_check_ref)
      || !hasText(admission.expected_behavior_ref)
      || admission.basis_package_id !== state.run_input_package_id
      || !["implementation", "verification"].includes(admission.entry_stage)
      || !containsAll(admission.unchanged_authorities, BROWNFIELD_UNCHANGED_AUTHORITIES)) {
      findings.push("brownfield_admission must be a host-verified simple Bug bound to the Run input, Task, failing check, expected behavior, and unchanged Product/API/Data/UI/Architecture authorities");
    } else {
      const verification = deliveryStore?.getObservation(admission.host_verification_ref);
      if (!verification
        || verification.run_id !== state.run_id
        || verification.result_package_id !== state.run_input_package_id
        || verification.validation?.eligible !== true
        || verification.producer?.capability_id !== "forgeway.host.brownfield-admission"
        || verification.kind !== "artifact-validation"
        || verification.payload?.validator_id !== "forgeway.brownfield-admission/1"
        || verification.payload?.artifact_id !== admission.task_ref
        || verification.payload?.target_ref !== `workflow:brownfield-admission:${admission.entry_stage}`
        || verification.payload?.basis_package_id !== admission.basis_package_id
        || verification.payload?.failing_check_ref !== admission.failing_check_ref
        || verification.payload?.expected_behavior_ref !== admission.expected_behavior_ref
        || !containsAll(verification.payload?.unchanged_authorities, BROWNFIELD_UNCHANGED_AUTHORITIES)) findings.push("brownfield_admission host_verification_ref must resolve to eligible Run-local Host evidence bound to the same Task, basis, failing check, expected behavior, authorities, and entry Stage");
      const entryOrder = stageById.get(admission.entry_stage)?.order;
      if (stageStates.some((record) => (stageById.get(record.stage_id)?.order ?? entryOrder) < entryOrder && !(admission.entry_stage === "verification" && record.stage_id === "implementation"))) findings.push("brownfield_admission must not duplicate pre-entry Stage records");
      if (admission.entry_stage === "verification" && !stageStates.some((record) => record.stage_id === "implementation" && record.status === "completed")) findings.push("verification brownfield_admission requires a completed Implementation result");
    }
  }
  for (const duplicate of duplicates(stageStates.map((record) => record?.stage_id))) findings.push(`duplicate stage state: ${duplicate}`);

  for (const record of stageStates) {
    if (!isObject(record)) {
      findings.push("each stage state must be an object");
      continue;
    }
    const stage = stageById.get(record.stage_id);
    if (!stage) {
      findings.push(`stage state references unknown stage: ${record.stage_id}`);
      continue;
    }
    if (!VALID_STAGE_STATUSES.has(record.status)) findings.push(`${stage.id}.status is unsupported: ${record.status}`);
    if (record.contract_version !== undefined && record.contract_version !== stage.contract_version) {
      if (record.status !== "completed" && record.status !== "skipped" && record.status !== "stale") {
        findings.push(`${stage.id}.contract_version may differ only for a terminal or stale record`);
      }
    }
    if (record.basis_fingerprint !== undefined && !isSha256Fingerprint(record.basis_fingerprint)) {
      findings.push(`${stage.id}.basis_fingerprint must use sha256:<64 lowercase hex>`);
    }
    if (record.status === "completed") {
      if (!hasText(record.contract_version)) findings.push(`${stage.id} completed record requires contract_version`);
      if (!isSha256Fingerprint(record.basis_fingerprint)) findings.push(`${stage.id} completed record requires basis_fingerprint`);
      for (const field of ["attempt_ref", "stage_execution_id", "run_input_package_id", "stage_input_package_id", "stage_result_package_id"]) {
        if (!hasText(record[field])) findings.push(`${stage.id} completed record requires ${field}`);
      }
      if (record.run_input_package_id !== state.run_input_package_id) findings.push(`${stage.id} run_input_package_id must match the workflow state`);
      if (!isSha256Fingerprint(record.result_fingerprint)) findings.push(`${stage.id} completed record requires result_fingerprint`);
      if (!Array.isArray(record.evidence_refs) || record.evidence_refs.length === 0 || record.evidence_refs.some((value) => !hasText(value))) {
        findings.push(`${stage.id} completed record requires evidence_refs`);
      }
      if (stage.receipt_policy === "required-on-success" && !VALID_DELIVERY_OUTCOMES.has(record.delivery_outcome)) findings.push(`${stage.id} completed record requires an explicit delivery_outcome`);
    }
    if (record.status === "skipped") {
      if (stage.applicability !== "conditional") findings.push(`${stage.id} is required and cannot be skipped`);
      if (record.applicability !== "not-applicable") findings.push(`${stage.id} skipped record requires applicability=not-applicable`);
      if (!hasText(record.decision_ref) || !hasText(record.reason)) findings.push(`${stage.id} skipped record requires decision_ref and reason`);
      if (!isSha256Fingerprint(record.basis_fingerprint)) findings.push(`${stage.id} skipped record requires basis_fingerprint`);
      if (record.contract_version !== stage.contract_version) findings.push(`${stage.id} skipped record requires the current contract_version`);
    }
    if (stage.applicability === "conditional" && record.status !== "skipped" && record.applicability !== undefined && record.applicability !== "applicable") {
      findings.push(`${stage.id}.applicability must be applicable unless the stage is skipped`);
    }
    if (record.status === "blocked") {
      if (!hasText(record.stop_state) || !stage.stop_states.includes(record.stop_state)) findings.push(`${stage.id} blocked record requires a declared stop_state`);
      if (!hasText(record.reason)) findings.push(`${stage.id} blocked record requires reason`);
    }
    if (record.status === "running" && !hasText(record.attempt_ref)) findings.push(`${stage.id} running record requires attempt_ref`);
    if (record.status === "stale" && !hasText(record.reason)) findings.push(`${stage.id} stale record requires reason`);
  }

  const interruptById = new Map((registry.interrupts ?? []).map((interrupt) => [interrupt.id, interrupt]));
  const interruptStates = Array.isArray(state.interrupt_states) ? state.interrupt_states : [];
  for (const duplicate of duplicates(interruptStates.map((record) => record?.interrupt_id))) findings.push(`duplicate interrupt state: ${duplicate}`);
  for (const record of interruptStates) {
    if (!isObject(record)) {
      findings.push("each interrupt state must be an object");
      continue;
    }
    const interrupt = interruptById.get(record.interrupt_id);
    if (!interrupt) {
      findings.push(`interrupt state references unknown interrupt: ${record.interrupt_id}`);
      continue;
    }
    if (!VALID_INTERRUPT_STATUSES.has(record.status)) findings.push(`${interrupt.id}.status is unsupported: ${record.status}`);
    if (record.status === "completed") {
      if (!hasText(record.result_ref)) findings.push(`${interrupt.id} completed record requires result_ref`);
      if (!Array.isArray(record.satisfied_exit_conditions) || !containsAll(record.satisfied_exit_conditions, interrupt.exit_conditions)) {
        findings.push(`${interrupt.id} completed record must satisfy every exit condition`);
      }
    } else {
      if (!hasText(record.reason)) findings.push(`${interrupt.id} active record requires reason`);
      if (record.status === "blocked" && (!hasText(record.stop_state) || !interrupt.stop_states.includes(record.stop_state))) {
        findings.push(`${interrupt.id} blocked record requires a declared stop_state`);
      }
    }
  }

  return [...findings, ...deliveryClosureFindings(state, registry, deliveryStore)];
}

function stageStateMap(state) {
  return new Map((state.stage_states ?? []).map((record) => [record.stage_id, record]));
}

function terminalStagesForGoal(registry, goalId) {
  const terminalId = registry.goals[goalId].terminal_stage;
  const terminal = registry.stages.find((stage) => stage.id === terminalId);
  return registry.stages.filter((stage) => stage.order <= terminal.order);
}

function isCurrentCompleted(stage, record, basisFingerprint) {
  return record?.status === "completed"
    && record.contract_version === stage.contract_version
    && record.basis_fingerprint === basisFingerprint
    && hasText(record.attempt_ref)
    && hasText(record.stage_input_package_id)
    && hasText(record.stage_result_package_id)
    && isSha256Fingerprint(record.result_fingerprint)
    && Array.isArray(record.evidence_refs)
    && record.evidence_refs.length > 0;
}

function isCurrentSkipped(stage, record, basisFingerprint) {
  return stage.applicability === "conditional"
    && record?.status === "skipped"
    && record.applicability === "not-applicable"
    && record.contract_version === stage.contract_version
    && record.basis_fingerprint === basisFingerprint
    && hasText(record.decision_ref)
    && hasText(record.reason);
}

function invalidateFrom(stages, stageId) {
  const selected = stages.find((stage) => stage.id === stageId);
  if (!selected) return [];
  return stages.filter((stage) => stage.order >= selected.order).map((stage) => stage.id);
}

function selectedStageProjection(stage, record, reason, invalidated = []) {
  return {
    stage_id: stage.id,
    contract_version: stage.contract_version,
    workflow_ref: stage.workflow_ref,
    capability_request: stage.capability_request,
    execution_kind: stage.execution_kind,
    capability_resolution: stage.capability_resolution ?? null,
    host_adapter: stage.host_adapter ?? null,
    input_from: stage.input_from,
    exit_evidence: stage.exit_evidence,
    support_capability_requests: stage.support_capability_requests,
    maximum_effect: stage.maximum_effect,
    entry_conditions: stage.entry_conditions,
    exit_conditions: stage.exit_conditions,
    stop_states: stage.stop_states,
    current_status: record?.status ?? "pending",
    reason,
    invalidate_stage_ids: invalidated
  };
}

export function projectNextAction(registry, state, { root = ROOT, deliveryStore } = {}) {
  const registryFindings = validateStageRegistry(registry, { root });
  const stateFindings = registryFindings.length === 0 ? validateWorkflowState(state, registry, { deliveryStore }) : [];
  if (registryFindings.length > 0 || stateFindings.length > 0) {
    return {
      schema_version: PROJECTION_SCHEMA_VERSION,
      status: "state-invalid",
      run_id: state?.run_id ?? null,
      goal: state?.goal ?? null,
      registry_version: registry?.registry_version ?? null,
      findings: [...registryFindings, ...stateFindings],
      authorizes_execution: false
    };
  }

  const activeInterrupt = (state.interrupt_states ?? []).find((record) => record.status !== "completed");
  if (activeInterrupt) {
    const interrupt = registry.interrupts.find((candidate) => candidate.id === activeInterrupt.interrupt_id);
    return {
      schema_version: PROJECTION_SCHEMA_VERSION,
      status: activeInterrupt.status === "blocked" ? "blocked" : "interrupt-required",
      run_id: state.run_id,
      goal: state.goal,
      basis_fingerprint: state.basis.fingerprint,
      registry_version: registry.registry_version,
      selected_interrupt: {
        interrupt_id: interrupt.id,
        contract_version: interrupt.contract_version,
        workflow_ref: interrupt.workflow_ref,
        capability_request: interrupt.capability_request,
        execution_kind: interrupt.execution_kind,
        host_adapter: interrupt.host_adapter ?? null,
        maximum_effect: interrupt.maximum_effect,
        exit_conditions: interrupt.exit_conditions,
        stop_states: interrupt.stop_states,
        current_status: activeInterrupt.status,
        reason: activeInterrupt.reason,
        stop_state: activeInterrupt.stop_state ?? null
      },
      completed_stage_ids: [],
      skipped_stage_ids: [],
      authorizes_execution: false
    };
  }

  const stages = terminalStagesForGoal(registry, state.goal);
  const drift = driftInvalidation(state, registry, deliveryStore);
  if (drift.findings.length > 0) {
    return { schema_version: PROJECTION_SCHEMA_VERSION, status: "state-invalid", run_id: state.run_id, goal: state.goal, registry_version: registry.registry_version, findings: drift.findings, authorizes_execution: false };
  }
  const records = stageStateMap(state);
  const completed = [];
  const skipped = [];
  const admitted = [];
  const admissionEntryOrder = state.brownfield_admission ? registry.stages.find((stage) => stage.id === state.brownfield_admission.entry_stage)?.order : null;

  if (drift.stage_id) {
    const stage = stages.find((candidate) => candidate.id === drift.stage_id);
    if (stage) return {
      schema_version: PROJECTION_SCHEMA_VERSION,
      status: "resume-stale-stage",
      run_id: state.run_id,
      goal: state.goal,
      basis_fingerprint: state.basis.fingerprint,
      registry_version: registry.registry_version,
      selected_stage: selectedStageProjection(stage, records.get(stage.id), "typed external drift invalidates the earliest owning stage", invalidateFrom(stages, stage.id)),
      completed_stage_ids: [], skipped_stage_ids: [], authorizes_execution: false
    };
  }

  for (const stage of stages) {
    const record = records.get(stage.id);
    if (admissionEntryOrder !== null && stage.order < admissionEntryOrder && !record) {
      admitted.push(stage.id);
      continue;
    }
    if (record?.status === "completed" && !isCurrentCompleted(stage, record, state.basis.fingerprint)) {
      const invalidated = invalidateFrom(stages, stage.id);
      return {
        schema_version: PROJECTION_SCHEMA_VERSION,
        status: "resume-stale-stage",
        run_id: state.run_id,
        goal: state.goal,
        basis_fingerprint: state.basis.fingerprint,
        registry_version: registry.registry_version,
        selected_stage: selectedStageProjection(stage, record, "completed stage no longer matches the current basis, contract version, result identity, evidence, or exit conditions", invalidated),
        completed_stage_ids: completed,
        admitted_stage_ids: admitted,
        skipped_stage_ids: skipped,
        authorizes_execution: false
      };
    }
    if (record?.status === "skipped" && !isCurrentSkipped(stage, record, state.basis.fingerprint)) {
      const invalidated = invalidateFrom(stages, stage.id);
      return {
        schema_version: PROJECTION_SCHEMA_VERSION,
        status: "resume-stale-stage",
        run_id: state.run_id,
        goal: state.goal,
        basis_fingerprint: state.basis.fingerprint,
        registry_version: registry.registry_version,
        selected_stage: selectedStageProjection(stage, record, "skip decision no longer matches the current basis or stage contract", invalidated),
        completed_stage_ids: completed,
        admitted_stage_ids: admitted,
        skipped_stage_ids: skipped,
        authorizes_execution: false
      };
    }
    if (isCurrentCompleted(stage, record, state.basis.fingerprint)) {
      completed.push(stage.id);
      continue;
    }
    if (isCurrentSkipped(stage, record, state.basis.fingerprint)) {
      skipped.push(stage.id);
      continue;
    }
    if (stage.applicability === "conditional" && (!record || record.applicability === undefined)) {
      return {
        schema_version: PROJECTION_SCHEMA_VERSION,
        status: "applicability-decision-required",
        run_id: state.run_id,
        goal: state.goal,
        basis_fingerprint: state.basis.fingerprint,
        registry_version: registry.registry_version,
        selected_stage: selectedStageProjection(stage, record, "conditional stage has no explicit applicable or not-applicable decision"),
        completed_stage_ids: completed,
        admitted_stage_ids: admitted,
        skipped_stage_ids: skipped,
        authorizes_execution: false
      };
    }
    if (record?.status === "blocked") {
      return {
        schema_version: PROJECTION_SCHEMA_VERSION,
        status: "blocked",
        run_id: state.run_id,
        goal: state.goal,
        basis_fingerprint: state.basis.fingerprint,
        registry_version: registry.registry_version,
        selected_stage: {
          ...selectedStageProjection(stage, record, record.reason),
          stop_state: record.stop_state
        },
        completed_stage_ids: completed,
        admitted_stage_ids: admitted,
        skipped_stage_ids: skipped,
        authorizes_execution: false
      };
    }
    if (record?.status === "running") {
      return {
        schema_version: PROJECTION_SCHEMA_VERSION,
        status: "resume-running-stage",
        run_id: state.run_id,
        goal: state.goal,
        basis_fingerprint: state.basis.fingerprint,
        registry_version: registry.registry_version,
        selected_stage: {
          ...selectedStageProjection(stage, record, "resume the current immutable attempt before creating a new stage attempt"),
          attempt_ref: record.attempt_ref
        },
        completed_stage_ids: completed,
        admitted_stage_ids: admitted,
        skipped_stage_ids: skipped,
        authorizes_execution: false
      };
    }
    if (record?.status === "stale") {
      const invalidated = invalidateFrom(stages, stage.id);
      return {
        schema_version: PROJECTION_SCHEMA_VERSION,
        status: "resume-stale-stage",
        run_id: state.run_id,
        goal: state.goal,
        basis_fingerprint: state.basis.fingerprint,
        registry_version: registry.registry_version,
        selected_stage: selectedStageProjection(stage, record, record.reason, invalidated),
        completed_stage_ids: completed,
        admitted_stage_ids: admitted,
        skipped_stage_ids: skipped,
        authorizes_execution: false
      };
    }
    return {
      schema_version: PROJECTION_SCHEMA_VERSION,
      status: "next-stage",
      run_id: state.run_id,
      goal: state.goal,
      basis_fingerprint: state.basis.fingerprint,
      registry_version: registry.registry_version,
      selected_stage: selectedStageProjection(stage, record, "first stage whose current contract is not completed or explicitly skipped"),
      completed_stage_ids: completed,
      admitted_stage_ids: admitted,
      skipped_stage_ids: skipped,
      authorizes_execution: false
    };
  }

  return {
    schema_version: PROJECTION_SCHEMA_VERSION,
    status: "goal-complete",
    run_id: state.run_id,
    goal: state.goal,
    basis_fingerprint: state.basis.fingerprint,
    registry_version: registry.registry_version,
    terminal_stage: registry.goals[state.goal].terminal_stage,
    completed_stage_ids: completed,
    admitted_stage_ids: admitted,
    skipped_stage_ids: skipped,
    authorizes_execution: false
  };
}

async function main() {
  const { positionals, flags } = parseArguments(process.argv.slice(2));
  const command = positionals[0] ?? "validate";
  if (flags.view !== undefined) {
    if (flags.view !== "dispatch") throw new Error("unsupported workflow view");
    if (positionals.length !== 1 || command !== "next") throw new Error("dispatch requires next without extra positional arguments");
      const seen = new Set();
      for (const token of process.argv.slice(2).filter(value => value.startsWith("--"))) {
        if (seen.has(token)) throw new Error(`repeated dispatch option: ${token}`);
        seen.add(token);
      }
      if (flags.compact !== undefined && flags.compact !== true) throw new Error("--compact takes no value");
      const allowed = new Set(["state", "delivery-db", "registry", "view", "skills-index", "adapters", "capability-id", "adapter-id", "copy-snapshot", "compact", "help"]);
      for (const [key, value] of Object.entries(flags)) {
        if (!allowed.has(key) || (!["compact", "help", "copy-snapshot"].includes(key) && typeof value !== "string") || (["compact", "help", "copy-snapshot"].includes(key) && value !== true)) throw new Error(`invalid dispatch option: --${key}`);
      }
    }

  if (command === "help" || flags.help) {
    emit(usage(), flags);
    return;
  }
  const registryPath = path.resolve(flags.registry || DEFAULT_REGISTRY);
  const registry = readStageRegistry(registryPath);
  if (command === "validate") {
    const findings = validateStageRegistry(registry, { root: ROOT });
    if (hasText(flags["skills-index"])) {
      findings.push(...validateCapabilityAlignment(registry, JSON.parse(fs.readFileSync(path.resolve(flags["skills-index"]), "utf8"))));
    }
    emit({
      schema_version: "forgeway-stage-registry-validation/1",
      valid: findings.length === 0,
      registry_id: registry.registry_id ?? null,
      registry_version: registry.registry_version ?? null,
      stage_count: Array.isArray(registry.stages) ? registry.stages.length : 0,
      goal_count: isObject(registry.goals) ? Object.keys(registry.goals).length : 0,
      findings
    }, flags);
    if (findings.length > 0) process.exitCode = 3;
    return;
  }
  if (command === "next") {
    if (!hasText(flags.state)) {
      emit({ ...usage(), error: "--state is required" }, flags);
      process.exitCode = 2;
      return;
    }
    if (!hasText(flags["delivery-db"])) {
      emit({ ...usage(), error: "--delivery-db is required so Stage state can be verified against the persistent Delivery Graph" }, flags);
      process.exitCode = 2;
      return;
    }
    if (flags["copy-snapshot"] !== true || process.argv.slice(2).filter(value => value === "--copy-snapshot").length !== 1) {
      const error = new Error("workflow CLI v2 requires one explicit --copy-snapshot flag for next; use a stable completed rollback-journal input (at most 64 MiB), or prepare a separate host snapshot for WAL/live data. No implicit copy is performed.");
      error.code = "DELIVERY_READ_ONLY_COPY_REQUIRED";
      throw error;
    }
    const deliveryDbPath = path.resolve(flags["delivery-db"]);
    if (!fs.existsSync(deliveryDbPath)) {
      emit({ ...usage(), error: `Delivery Graph database does not exist: ${deliveryDbPath}` }, flags);
      process.exitCode = 3;
      return;
    }
    const dispatch = flags.view === "dispatch";
    if (flags.view !== undefined && !dispatch) throw new Error("unsupported workflow view");
    const state = readWorkflowState(path.resolve(flags.state));
    const deliveryStore = createDeliveryStore({ filename: deliveryDbPath, readOnly: true, copySnapshot: flags["copy-snapshot"] === true });
    try {
      const next = projectNextAction(registry, state, { root: ROOT, deliveryStore });
      let projection = next;
      if (dispatch) {
        const inputs = { capabilityId: flags["capability-id"], adapterId: flags["adapter-id"], snapshotHashes: {} };
        // Stops, running attempts and non-capability owners never consume a catalog.
        if (next.status === "next-stage" && next.selected_stage.execution_kind === "capability") {
          for (const [flag, field] of [["skills-index", "catalog"], ["adapters", "manifest"]]) if (flags[flag]) {
            const bytes = await readMetadataSnapshot(flags[flag]);
            inputs[field] = parseDispatchSnapshot(bytes);
            inputs.snapshotHashes[field] = createHash("sha256").update(bytes).digest("hex");
          }
        }
        projection = projectDispatch(next, registry, state, deliveryStore, inputs);
      }
      emit(projection, flags);
      if (next.status === "state-invalid" || (dispatch && projection.dispatch.status !== "contract-compatible" && projection.dispatch.status !== "kernel-owned" && next.status !== "goal-complete")) process.exitCode = 3;
    } finally { deliveryStore.close(); }
    return;
  }
  emit({ ...usage(), error: `unknown command: ${command}` }, flags);
  process.exitCode = 2;
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : null;
if (invokedPath === fileURLToPath(import.meta.url)) main().catch(cause => {
  process.stderr.write(`${JSON.stringify({ error: { code: cause.code ?? "WORKFLOW_INPUT_INVALID", message: cause.message } })}\n`);
  process.exitCode = 2;
});
