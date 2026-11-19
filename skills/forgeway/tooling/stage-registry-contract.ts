export type MutationClass =
  | "read-only"
  | "artifact-write"
  | "source-write"
  | "runtime-operation"
  | "delivery-write";

export type ExecutionKind = "kernel" | "host" | "capability";

export interface CapabilityContract {
  version: string;
  accepts: string[];
  produces: string[];
  maximum_mutation_class: MutationClass | "git-write";
  evidence_requirements: string[];
}

export interface CapabilityResolution {
  candidates: string[];
  conditional_adapters?: string[];
  selector?: string;
}

export interface StageRegistryStage {
  id: string;
  order: number;
  contract_version: string;
  workflow_ref: string;
  applicability: "required" | "conditional";
  input_from: "run-input" | "previous-terminal";
  execution_kind: ExecutionKind;
  capability_resolution?: CapabilityResolution;
  capability_request: string;
  support_capability_requests: string[];
  maximum_effect: MutationClass;
  entry_conditions: string[];
  exit_conditions: string[];
  stop_states: string[];
  invalidation_triggers: string[];
}

export interface StageRegistry {
  schema_version: "forgeway-stage-registry/1";
  registry_id: string;
  registry_version: string;
  capability_contracts: Record<string, CapabilityContract>;
  stages: StageRegistryStage[];
}

const mutationClasses = new Set<string>([
  "read-only",
  "artifact-write",
  "source-write",
  "runtime-operation",
  "delivery-write",
]);
const capabilityMutationClasses = new Set<string>([...mutationClasses, "git-write"]);
const executionKinds = new Set<string>(["kernel", "host", "capability"]);
const applicabilityKinds = new Set<string>(["required", "conditional"]);
const inputSources = new Set<string>(["run-input", "previous-terminal"]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.length > 0 && value.every(isNonEmptyString);
}

function isPossiblyEmptyStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every(isNonEmptyString);
}

export function typedStageRegistryFindings(value: unknown): string[] {
  const findings: string[] = [];
  if (!isRecord(value)) return ["registry must be an object"];
  if (value.schema_version !== "forgeway-stage-registry/1") {
    findings.push("schema_version must be forgeway-stage-registry/1");
  }
  for (const field of ["registry_id", "registry_version"] as const) {
    if (!isNonEmptyString(value[field])) findings.push(`${field} must be non-empty`);
  }

  if (!isRecord(value.capability_contracts)) {
    findings.push("capability_contracts must be an object");
  } else {
    for (const [id, rawContract] of Object.entries(value.capability_contracts)) {
      if (!isRecord(rawContract)) {
        findings.push(`capability ${id} must be an object`);
        continue;
      }
      if (!isNonEmptyString(rawContract.version)) findings.push(`capability ${id}.version must be non-empty`);
      if (!isStringArray(rawContract.accepts)) findings.push(`capability ${id}.accepts must be a non-empty string array`);
      if (!isStringArray(rawContract.produces)) findings.push(`capability ${id}.produces must be a non-empty string array`);
      if (!isStringArray(rawContract.evidence_requirements)) findings.push(`capability ${id}.evidence_requirements must be a non-empty string array`);
      if (!capabilityMutationClasses.has(String(rawContract.maximum_mutation_class))) findings.push(`capability ${id}.maximum_mutation_class is invalid`);
    }
  }

  if (!Array.isArray(value.stages) || value.stages.length === 0) {
    findings.push("stages must be a non-empty array");
    return findings;
  }
  for (const [index, rawStage] of value.stages.entries()) {
    const label = isRecord(rawStage) && isNonEmptyString(rawStage.id) ? rawStage.id : `stages[${index}]`;
    if (!isRecord(rawStage)) {
      findings.push(`${label} must be an object`);
      continue;
    }
    if (!isNonEmptyString(rawStage.id)) findings.push(`${label}.id must be non-empty`);
    if (!Number.isInteger(rawStage.order)) findings.push(`${label}.order must be an integer`);
    if (!isNonEmptyString(rawStage.contract_version)) findings.push(`${label}.contract_version must be non-empty`);
    if (!isNonEmptyString(rawStage.workflow_ref)) findings.push(`${label}.workflow_ref must be non-empty`);
    if (!applicabilityKinds.has(String(rawStage.applicability))) findings.push(`${label}.applicability is invalid`);
    if (!inputSources.has(String(rawStage.input_from))) findings.push(`${label}.input_from is invalid`);
    if (!executionKinds.has(String(rawStage.execution_kind))) findings.push(`${label}.execution_kind is invalid`);
    if (!isNonEmptyString(rawStage.capability_request)) findings.push(`${label}.capability_request must be non-empty`);
    if (!mutationClasses.has(String(rawStage.maximum_effect))) findings.push(`${label}.maximum_effect is invalid`);
    if (!isPossiblyEmptyStringArray(rawStage.support_capability_requests)) {
      findings.push(`${label}.support_capability_requests must be a string array`);
    }
    for (const field of ["entry_conditions", "exit_conditions", "stop_states", "invalidation_triggers"] as const) {
      if (!isStringArray(rawStage[field])) findings.push(`${label}.${field} must be a non-empty string array`);
    }
    if (rawStage.execution_kind === "capability") {
      const resolution = rawStage.capability_resolution;
      if (!isRecord(resolution) || !isStringArray(resolution.candidates)) {
        findings.push(`${label}.capability_resolution.candidates must be a non-empty string array`);
      } else if (isRecord(value.capability_contracts)) {
        for (const candidate of resolution.candidates) {
          if (!(candidate in value.capability_contracts)) findings.push(`${label} references unknown capability ${candidate}`);
        }
      }
    } else if (rawStage.capability_resolution !== undefined) {
      findings.push(`${label}.capability_resolution is only valid for capability stages`);
    }
  }
  return findings;
}

export function assertStageRegistry(value: unknown): asserts value is StageRegistry {
  const findings = typedStageRegistryFindings(value);
  if (findings.length > 0) throw new Error(findings.join("\n"));
}
