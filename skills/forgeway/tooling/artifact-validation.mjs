import { readFileSync } from "node:fs";
import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";

const TYPED_ARTIFACT_KINDS = new Set(["project", "requirement", "task", "change", "evidence"]);
const artifactValidators = new Map();

function duplicateValues(values) {
  return [...new Set(values.filter((value, index) => values.indexOf(value) !== index))];
}

function topologyFindings(record, label) {
  const findings = [];
  const repositories = record.repositories ?? [];
  const components = record.components ?? [];
  if (["monolith", "monorepo"].includes(record.topology) && repositories.length !== 1) findings.push(`${label}: ${record.topology} requires exactly one repository`);
  if (record.topology === "polyrepo" && repositories.length < 2) findings.push(`${label}: polyrepo requires at least two repositories`);
  if (record.topology === "monorepo" && components.length < 2) findings.push(`${label}: monorepo requires at least two components`);
  for (const id of duplicateValues(repositories.map((repository) => repository.id))) findings.push(`${label}: duplicate repository id: ${id}`);
  for (const repository of duplicateValues(repositories.map((item) => item.repository).filter(Boolean))) findings.push(`${label}: repository identity must be unique: ${repository}`);
  for (const id of duplicateValues(components.map((component) => component.id ?? component.component_id))) findings.push(`${label}: duplicate component id: ${id}`);
  const repositoryIds = new Set(repositories.map((repository) => repository.id));
  for (const component of components) if (!repositoryIds.has(component.repository_id)) findings.push(`${label}: component references an unknown repository: ${component.repository_id}`);
  for (const repositoryId of repositoryIds) if (!components.some((component) => component.repository_id === repositoryId)) findings.push(`${label}: repository has no component: ${repositoryId}`);
  return findings;
}

function scanUnsafe(value, location, findings) {
  if (Array.isArray(value)) { value.forEach((item, index) => scanUnsafe(item, `${location}[${index}]`, findings)); return; }
  if (typeof value === "string") {
    if (/(?:^|[\s("'`])(?:\/(?!\/)|~(?:[\\/]|$)|[A-Za-z]:[\\/]|\\|\.\.(?:[\\/]|$))/.test(value)) findings.push(`${location} contains a machine-local or escaping path`);
    return;
  }
  if (!value || typeof value !== "object") return;
  for (const [key, child] of Object.entries(value)) {
    const childLocation = `${location}.${key}`;
    const authorizationMetadata = key.toLowerCase() === "authorization" && child && typeof child === "object" && !Array.isArray(child)
      && Object.keys(child).every((field) => ["granted", "actor"].includes(field))
      && typeof child.granted === "boolean"
      && (child.actor === undefined || typeof child.actor === "string");
    if (/^(?:password|token|secret|cookie|authorization|api_key)$/i.test(key) && !authorizationMetadata) findings.push(`${childLocation} must reference an environment key, not store a value`);
    scanUnsafe(child, childLocation, findings);
  }
}

export function typedArtifactSemanticFindings(kind, data) {
  const findings = [];
  if (["1.1", "1.2"].includes(data.schema_version)) {
    for (const field of ["basis", "previous_basis"]) {
      if (!Array.isArray(data[field])) continue;
      for (const id of duplicateValues(data[field].map((basis) => basis.repository_id))) findings.push(`${field} contains duplicate repository_id: ${id}`);
    }
  }
  if (kind === "project" && ["1.1", "1.2"].includes(data.schema_version)) {
    findings.push(...topologyFindings(data, data.project_id));
    const componentIds = new Set(data.components.map((component) => component.id));
    for (const artifact of data.artifacts) if (!componentIds.has(artifact.component_id)) findings.push(`artifact references an unknown component: ${artifact.component_id}`);
    for (const command of data.commands) if (!componentIds.has(command.component_id)) findings.push(`command references an unknown component: ${command.component_id}`);
  }
  if (["project", "task"].includes(kind) && data.schema_version === "1.2") {
    const paths = [...(data.components ?? []).map(row => row.path), ...(data.artifacts ?? []).map(row => row.path), ...(data.outputs ?? []).map(row => row.path), ...data.commands.map(row => row.cwd), ...(data.scope?.include ?? []).map(row => row.path), ...(data.scope?.exclude ?? []).map(row => row.path)];
    for (const value of paths) if (value !== "." && value.split("/").some(part => part === "" || part === ".")) findings.push(`1.2 paths must use canonical repository coordinates: ${value}`);
    for (const ref of [...(data.scope?.include ?? []), ...(data.scope?.exclude ?? [])]) if (ref.path.includes("*") && !["*", "**"].includes(ref.path) && !/^[^*]+\/\*\*$/u.test(ref.path)) findings.push(`1.2 scope supports exact paths, * / ** or a literal prefix/** only: ${ref.path}`);
  }
  if (kind === "evidence") {
    if (data.result === "not-run" && data.status !== "Not verified") findings.push("not-run evidence must remain Not verified");
    if (data.status === "Runtime-resolved" && (data.category !== "runtime" || data.result !== "pass")) findings.push("Runtime-resolved requires a passing runtime attempt");
    if (Date.parse(data.finished_at) < Date.parse(data.started_at)) findings.push("finished_at must not be earlier than started_at");
  }
  scanUnsafe(data, "$", findings);
  return findings;
}

function typedArtifactValidator(kind) {
  if (!TYPED_ARTIFACT_KINDS.has(kind)) return null;
  let validator = artifactValidators.get(kind);
  if (!validator) {
    const ajv = new Ajv2020({ allErrors: true, strict: true });
    addFormats(ajv);
    ajv.addSchema(JSON.parse(readFileSync(new URL("../contracts/common.schema.json", import.meta.url), "utf8")));
    ajv.addSchema(JSON.parse(readFileSync(new URL(`../contracts/${kind}.schema.json`, import.meta.url), "utf8")));
    validator = ajv.getSchema(`urn:forgeway:${kind}:v1`);
    artifactValidators.set(kind, validator);
  }
  return validator;
}

export function typedArtifactValidation(kind, data) {
  const validator = typedArtifactValidator(kind);
  if (!validator) return { schema_errors: [{ message: `unsupported typed artifact kind: ${kind}` }], semantic_errors: [] };
  const schemaValid = validator(data);
  return {
    schema_errors: schemaValid ? [] : structuredClone(validator.errors ?? []),
    semantic_errors: schemaValid ? typedArtifactSemanticFindings(kind, data) : []
  };
}
