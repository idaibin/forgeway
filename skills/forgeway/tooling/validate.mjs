import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import YAML from "yaml";
import { validateContextProjection } from "./context/index.mjs";
import { typedArtifactSemanticFindings } from "./artifact-validation.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const errors = [];
const validated = [];

function readJson(relative) {
  return JSON.parse(fs.readFileSync(path.join(root, relative), "utf8"));
}

function readYaml(relative) {
  return YAML.parse(fs.readFileSync(path.join(root, relative), "utf8"));
}

function readExternalYaml(input) {
  const resolved = path.resolve(process.cwd(), input);
  return YAML.parse(fs.readFileSync(resolved, "utf8"));
}

function readExternalBytes(input) {
  return fs.readFileSync(path.resolve(process.cwd(), input));
}

const usage = `Usage:
  node tooling/validate.mjs --all
  node tooling/validate.mjs --artifact <project|requirement|task|change|evidence> <file.yaml>
  node tooling/validate.mjs --context-projection <projection.json>
  node tooling/validate.mjs --portfolio <portfolio.yaml>
  node tooling/validate.mjs --portfolio-result <result.yaml> --portfolio <portfolio.yaml>`;

const args = process.argv.slice(2).filter((arg) => arg !== "--all");
let externalCase = null;
if (args[0] === "--help") {
  console.log(usage);
  process.exit(0);
} else if (args[0] === "--artifact" && args.length === 3) {
  const allowed = new Set(["project", "requirement", "task", "change", "evidence"]);
  if (!allowed.has(args[1])) {
    console.error(`Unsupported artifact kind: ${args[1]}\n${usage}`);
    process.exit(2);
  }
  externalCase = { schemaId: `urn:forgeway:${args[1]}:v1`, input: args[2] };
} else if (args[0] === "--portfolio" && args.length === 2) {
  externalCase = { schemaId: "urn:forgeway:portfolio:v1", input: args[1] };
} else if (args[0] === "--context-projection" && args.length === 2) {
  externalCase = { schemaId: "urn:forgeway:context-projection:v1", input: args[1] };
} else if (args[0] === "--portfolio-result" && args[2] === "--portfolio" && args.length === 4) {
  externalCase = {
    schemaId: "urn:forgeway:portfolio-result:v1",
    input: args[1],
    portfolioInput: args[3]
  };
} else if (args.length > 0) {
  console.error(usage);
  process.exit(2);
}

const ajv = new Ajv2020({ allErrors: true, strict: true });
addFormats(ajv);

const schemaFiles = fs.readdirSync(path.join(root, "contracts"))
  .filter((name) => name.endsWith(".schema.json"))
  .sort();

const common = readJson("contracts/common.schema.json");
ajv.addSchema(common);
for (const file of schemaFiles.filter((name) => name !== "common.schema.json")) {
  ajv.addSchema(readJson(`contracts/${file}`));
}

function validate(schemaId, data, label, expectValid = true, semantic = true) {
  const validator = ajv.getSchema(schemaId);
  if (!validator) throw new Error(`schema not loaded: ${schemaId}`);
  const schemaValid = validator(data);
  const semanticErrors = schemaValid && semantic ? semantics(schemaId, data) : [];
  const actualValid = Boolean(schemaValid) && semanticErrors.length === 0;
  if (actualValid !== expectValid) {
    errors.push({
      label,
      expected: expectValid ? "valid" : "invalid",
      schema_errors: validator.errors ?? [],
      semantic_errors: semanticErrors
    });
  } else {
    validated.push(label);
  }
  return actualValid;
}

function sameSet(left, right) {
  return left.length === right.length && new Set(left).size === left.length && left.every((item) => right.includes(item));
}

function duplicateValues(values) {
  return [...new Set(values.filter((value, index) => values.indexOf(value) !== index))];
}

function topologyFindings(record, label) {
  const findings = [];
  const repositories = record.repositories ?? [];
  const components = record.components ?? [];
  if (["monolith", "monorepo"].includes(record.topology) && repositories.length !== 1) {
    findings.push(`${label}: ${record.topology} requires exactly one repository`);
  }
  if (record.topology === "polyrepo" && repositories.length < 2) {
    findings.push(`${label}: polyrepo requires at least two repositories`);
  }
  if (record.topology === "monorepo" && components.length < 2) {
    findings.push(`${label}: monorepo requires at least two components`);
  }
  for (const id of duplicateValues(repositories.map((repository) => repository.id))) {
    findings.push(`${label}: duplicate repository id: ${id}`);
  }
  for (const repository of duplicateValues(repositories.map((item) => item.repository).filter(Boolean))) {
    findings.push(`${label}: repository identity must be unique: ${repository}`);
  }
  for (const id of duplicateValues(components.map((component) => component.id ?? component.component_id))) {
    findings.push(`${label}: duplicate component id: ${id}`);
  }
  const repositoryIds = new Set(repositories.map((repository) => repository.id));
  for (const component of components) {
    if (!repositoryIds.has(component.repository_id)) {
      findings.push(`${label}: component references an unknown repository: ${component.repository_id}`);
    }
  }
  for (const repositoryId of repositoryIds) {
    if (!components.some((component) => component.repository_id === repositoryId)) {
      findings.push(`${label}: repository has no component: ${repositoryId}`);
    }
  }
  return findings;
}

function gateEvidenceReuseFindings(gateEvidence, label) {
  const findings = [];
  const seen = new Map();
  for (const [gate, evidenceIds] of Object.entries(gateEvidence)) {
    for (const evidenceId of evidenceIds) {
      const previousGate = seen.get(evidenceId);
      if (previousGate && previousGate !== gate) {
        findings.push(`${label}: evidence ${evidenceId} is reused across gates ${previousGate} and ${gate}`);
      } else {
        seen.set(evidenceId, gate);
      }
    }
  }
  return findings;
}

function aggregateGate(states) {
  if (states.every((state) => state === "pass")) return "pass";
  if (states.some((state) => state === "fail")) return "fail";
  if (states.every((state) => state === "blocked")) return "blocked";
  if (states.every((state) => state === "not-run")) return "not-run";
  if (states.every((state) => state === "not-applicable")) return "not-applicable";
  return "partial";
}

function portfolioBindingFindings(portfolio, result, portfolioBytes) {
  const findings = [];
  const actualHash = createHash("sha256").update(portfolioBytes).digest("hex");
  if (result.portfolio_sha256 !== actualHash) findings.push("portfolio_sha256 must match the input Portfolio bytes");
  for (const field of ["schema_version", "campaign_id", "system_commit_sha", "expected_projects"]) {
    if (result[field] !== portfolio[field]) findings.push(`${field} must match the input Portfolio`);
  }
  for (const field of ["required_profiles", "required_gates"]) {
    if (!sameSet(result[field], portfolio[field])) findings.push(`${field} must match the input Portfolio`);
  }

  const resultProjects = new Map(result.projects.map((project) => [project.project_id, project]));
  const portfolioIds = portfolio.projects.map((project) => project.project_id);
  if (!sameSet([...resultProjects.keys()], portfolioIds)) {
    findings.push("project_id values must match the input Portfolio");
    return findings;
  }
  for (const project of portfolio.projects) {
    const actual = resultProjects.get(project.project_id);
    const scalarFields = portfolio.schema_version === "1.1"
      ? ["topology", "mode", "profile", "manifest_source"]
      : ["commit_sha", "mode", "profile"];
    for (const field of scalarFields) {
      if (actual[field] !== project[field]) findings.push(`${project.project_id}: ${field} must match the input Portfolio`);
    }
    if (!sameSet(actual.requirement_ids, project.requirement_ids)) {
      findings.push(`${project.project_id}: requirement_ids must match the input Portfolio`);
    }
    if (portfolio.schema_version === "1.1") {
      const resultRepositories = new Map(actual.repositories.map((repository) => [repository.id, repository]));
      if (!sameSet([...resultRepositories.keys()], project.repositories.map((repository) => repository.id))) {
        findings.push(`${project.project_id}: repository ids must match the input Portfolio`);
      } else {
        for (const repository of project.repositories) {
          if (resultRepositories.get(repository.id).commit_sha !== repository.basis.commit_sha) {
            findings.push(`${project.project_id}: ${repository.id} commit_sha must match the input Portfolio`);
          }
        }
      }
      const resultComponents = new Map(actual.components.map((component) => [component.component_id, component]));
      if (!sameSet([...resultComponents.keys()], project.components.map((component) => component.id))) {
        findings.push(`${project.project_id}: component ids must match the input Portfolio`);
      } else {
        for (const component of project.components) {
          const resultComponent = resultComponents.get(component.id);
          if (resultComponent.repository_id !== component.repository_id) {
            findings.push(`${project.project_id}: ${component.id} repository_id must match the input Portfolio`);
          }
          if (!sameSet(resultComponent.required_gates, component.required_gates)) {
            findings.push(`${project.project_id}: ${component.id} required_gates must match the input Portfolio`);
          }
        }
      }
    }
  }
  return findings;
}

function validatePortfolioBinding(portfolio, result, portfolioBytes, label, expectValid = true) {
  const findings = portfolioBindingFindings(portfolio, result, portfolioBytes);
  const actualValid = findings.length === 0;
  if (actualValid !== expectValid) {
    errors.push({ label, expected: expectValid ? "valid" : "invalid", semantic_errors: findings });
  } else {
    validated.push(label);
  }
}

function semantics(schemaId, data) {
  const findings = [];
  const typedKind = ["project", "requirement", "task", "change", "evidence"].find((kind) => schemaId.endsWith(`:${kind}:v1`));
  if (typedKind) return typedArtifactSemanticFindings(typedKind, data);
  if (schemaId.endsWith(":context-projection:v1")) {
    try { validateContextProjection(data); } catch (cause) { findings.push(`${cause.code ?? "CONTEXT_PROJECTION_INVALID"}: ${cause.message}`); }
  }
  if (schemaId.endsWith(":portfolio:v1")) {
    if (data.projects.length !== data.expected_projects) findings.push("expected_projects must equal projects.length");
    const ids = data.projects.map((project) => project.project_id);
    if (new Set(ids).size !== ids.length) findings.push("project_id values must be unique");
    const profiles = new Set(data.projects.map((project) => project.profile));
    for (const required of data.required_profiles) {
      if (!profiles.has(required)) findings.push(`required profile is absent: ${required}`);
    }
    if (data.schema_version === "1.1") {
      for (const project of data.projects) {
        findings.push(...topologyFindings(project, project.project_id));
        for (const gate of data.required_gates) {
          if (!project.components.some((component) => component.required_gates.includes(gate))) {
            findings.push(`${project.project_id}: campaign required gate has no required component: ${gate}`);
          }
        }
        if (project.manifest_source === "project" && !project.repositories.some((repository) => repository.id === project.manifest_repository_id)) {
          findings.push(`${project.project_id}: manifest_repository_id must reference a declared repository`);
        }
        if (project.manifest_source === "campaign") {
          const expectedPrefix = `evaluation/campaigns/${data.campaign_id}/`;
          if (!project.project_manifest.startsWith(expectedPrefix)) {
            findings.push(`${project.project_id}: campaign manifest must start with ${expectedPrefix}`);
          }
        }
      }
    }
  }
  if (schemaId.endsWith(":portfolio-result:v1")) {
    if (data.projects.length !== data.expected_projects) findings.push("expected_projects must equal projects.length");
    const ids = data.projects.map((project) => project.project_id);
    if (new Set(ids).size !== ids.length) findings.push("project_id values must be unique");
    const profiles = new Set(data.projects.map((project) => project.profile));
    for (const required of data.required_profiles) {
      if (!profiles.has(required)) findings.push(`required profile is absent: ${required}`);
    }
    for (const project of data.projects) {
      if (data.schema_version === "1.0") {
        const requiredGatesPass = data.required_gates.every((gate) => project.gates[gate] === "pass");
        if (project.verdict === "Pass" && (project.mode !== "delivery" || !requiredGatesPass || project.evidence_ids.length === 0)) {
          findings.push(`${project.project_id}: Pass requires delivery mode, passing gates and evidence`);
        }
        continue;
      }
      findings.push(...topologyFindings(project, project.project_id));
      findings.push(...gateEvidenceReuseFindings(project.gate_evidence, project.project_id));
      for (const gate of data.required_gates) {
        if (!project.components.some((component) => component.required_gates.includes(gate))) {
          findings.push(`${project.project_id}: project required gate has no required component: ${gate}`);
        }
        const state = project.gates[gate];
        if (state === "not-applicable") {
          findings.push(`${project.project_id}: required project gate cannot be not-applicable: ${gate}`);
        }
        if (["pass", "fail", "partial", "blocked"].includes(state) && project.gate_evidence[gate].length === 0) {
          findings.push(`${project.project_id}: required project gate ${state} lacks gate_evidence: ${gate}`);
        }
      }
      for (const component of project.components) {
        findings.push(...gateEvidenceReuseFindings(component.gate_evidence, `${project.project_id}/${component.component_id}`));
        for (const gate of component.required_gates) {
          const state = component.gates[gate];
          if (state === "not-applicable") {
            findings.push(`${project.project_id}/${component.component_id}: required gate cannot be not-applicable: ${gate}`);
          }
          if (["pass", "fail", "partial", "blocked"].includes(state) && component.gate_evidence[gate].length === 0) {
            findings.push(`${project.project_id}/${component.component_id}: required gate ${state} lacks gate_evidence: ${gate}`);
          }
        }
      }
      for (const gate of ["source", "automated", "artifact", "runtime", "independent-review"]) {
        const requiredComponents = project.components.filter((component) => component.required_gates.includes(gate));
        if (requiredComponents.length === 0) continue;
        const expectedGate = aggregateGate(requiredComponents.map((component) => component.gates[gate]));
        if (project.gates[gate] !== expectedGate) {
          findings.push(`${project.project_id}: ${gate} must aggregate required component gates to ${expectedGate}`);
        }
      }
      const states = [
        ...data.required_gates.map((gate) => project.gates[gate]),
        ...project.components.flatMap((component) => component.required_gates.map((gate) => component.gates[gate]))
      ];
      if (states.includes("blocked") && project.next_action?.reason_code !== "ENVIRONMENT_BLOCKED") {
        findings.push(`${project.project_id}: blocked gates require ENVIRONMENT_BLOCKED`);
      }
      let expectedProjectVerdict;
      if (states.includes("fail")) expectedProjectVerdict = "Fail";
      else if (project.mode === "delivery" && states.every((state) => state === "pass")) expectedProjectVerdict = "Pass";
      else if (states.includes("partial") || states.includes("not-run") || states.includes("not-applicable") || project.mode !== "delivery") expectedProjectVerdict = "Partial";
      else expectedProjectVerdict = "Blocked";
      if (project.verdict !== expectedProjectVerdict) {
        findings.push(`${project.project_id}: project verdict must be ${expectedProjectVerdict}`);
      }
    }
    const hasFail = data.projects.some((project) => project.verdict === "Fail");
    const allPass = data.projects.every((project) => project.verdict === "Pass");
    const expectedVerdict = hasFail ? "Fail" : allPass ? "Pass" : "Partial";
    if (data.verdict !== expectedVerdict) findings.push(`portfolio verdict must be ${expectedVerdict}`);
  }
  scanUnsafe(data, "$", findings);
  return findings;
}

function scanUnsafe(value, location, findings) {
  if (Array.isArray(value)) {
    value.forEach((item, index) => scanUnsafe(item, `${location}[${index}]`, findings));
    return;
  }
  if (typeof value === "string") {
    if (/(?:^|[\s("'`])(?:\/(?!\/)|~(?:[\\/]|$)|[A-Za-z]:[\\/]|\\|\.\.(?:[\\/]|$))/.test(value)) {
      findings.push(`${location} contains a machine-local or escaping path`);
    }
    return;
  }
  if (!value || typeof value !== "object") return;
  for (const [key, child] of Object.entries(value)) {
    const childLocation = `${location}.${key}`;
    const authorizationMetadata = key.toLowerCase() === "authorization" && child && typeof child === "object" && !Array.isArray(child)
      && Object.keys(child).every((field) => ["granted", "actor"].includes(field))
      && typeof child.granted === "boolean"
      && (child.actor === undefined || typeof child.actor === "string");
    if (/^(?:password|token|secret|cookie|authorization|api_key)$/i.test(key) && !authorizationMetadata) {
      findings.push(`${childLocation} must reference an environment key, not store a value`);
    }
    scanUnsafe(child, childLocation, findings);
  }
}

function walk(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const resolved = path.join(directory, entry.name);
    if (entry.isDirectory() && ![".git", ".codex", "node_modules"].includes(entry.name)) return walk(resolved);
    return entry.isFile() ? [resolved] : [];
  });
}

function markdownLinkFindings(file) {
  const findings = [];
  const text = fs.readFileSync(file, "utf8");
  for (const match of text.matchAll(/\[[^\]]*\]\(([^)]+)\)/g)) {
    const target = match[1];
    if (/^(?:https?:|mailto:|#)/.test(target)) continue;
    const clean = target.split("#", 1)[0];
    if (!clean) continue;
    const resolved = path.resolve(path.dirname(file), clean);
    if (!resolved.startsWith(`${root}${path.sep}`) && resolved !== root) {
      findings.push({ label: path.relative(root, file), link: target, issue: "link leaves repository" });
    } else if (!fs.existsSync(resolved)) {
      findings.push({ label: path.relative(root, file), link: target, issue: "missing target" });
    }
  }
  return findings;
}

if (externalCase) {
  try {
    const data = readExternalYaml(externalCase.input);
    const resultValid = validate(externalCase.schemaId, data, path.basename(externalCase.input));
    if (externalCase.portfolioInput) {
      const portfolio = readExternalYaml(externalCase.portfolioInput);
      const portfolioValid = validate(
        "urn:forgeway:portfolio:v1",
        portfolio,
        path.basename(externalCase.portfolioInput)
      );
      if (resultValid && portfolioValid) {
        validatePortfolioBinding(
          portfolio,
          data,
          readExternalBytes(externalCase.portfolioInput),
          `${path.basename(externalCase.input)} -> ${path.basename(externalCase.portfolioInput)}`
        );
      }
    }
  } catch (error) {
    errors.push({ label: path.basename(externalCase.input), issue: error.code ?? error.name });
  }
} else {
  const templateCases = [
    ["urn:forgeway:project:v1", "templates/project.yaml"],
    ["urn:forgeway:requirement:v1", "templates/requirement.yaml"],
    ["urn:forgeway:task:v1", "templates/task.yaml"],
    ["urn:forgeway:change:v1", "templates/change.yaml"],
    ["urn:forgeway:evidence:v1", "templates/evidence.yaml"],
    ["urn:forgeway:portfolio:v1", "templates/portfolio.yaml"],
    ["urn:forgeway:portfolio-result:v1", "templates/portfolio-result.yaml"]
  ];
  for (const [schemaId, relative] of templateCases) validate(schemaId, readYaml(relative), relative);

  const systemCases = [
    ["urn:forgeway:requirement:v1", "product/features/REQ-FORGEWAY-001.yaml"]
  ];
  for (const [schemaId, relative] of systemCases) validate(schemaId, readYaml(relative), relative);

  for (const kind of ["project", "requirement", "task", "change", "evidence", "portfolio", "portfolio-result"]) {
    const schemaId = `urn:forgeway:${kind}:v1`;
    validate(schemaId, readYaml(`fixtures/valid/${kind}.yaml`), `fixtures/valid/${kind}.yaml`);
    validate(schemaId, readYaml(`fixtures/invalid/${kind}.yaml`), `fixtures/invalid/${kind}.yaml`, false);
  }

  validatePortfolioBinding(
    readYaml("fixtures/valid/portfolio.yaml"),
    readYaml("fixtures/valid/portfolio-result.yaml"),
    fs.readFileSync(path.join(root, "fixtures/valid/portfolio.yaml")),
    "fixtures/valid/portfolio-result-binding"
  );

  validate(
    "urn:forgeway:project:v1",
    readYaml("fixtures/valid/project-1.1-polyrepo.yaml"),
    "fixtures/valid/project-1.1-polyrepo.yaml"
  );
  validate(
    "urn:forgeway:portfolio:v1",
    readYaml("fixtures/valid/portfolio-1.1.yaml"),
    "fixtures/valid/portfolio-1.1.yaml"
  );
  validate(
    "urn:forgeway:portfolio-result:v1",
    readYaml("fixtures/valid/portfolio-result-1.1-partial.yaml"),
    "fixtures/valid/portfolio-result-1.1-partial.yaml"
  );
  validatePortfolioBinding(
    readYaml("fixtures/valid/portfolio-1.1.yaml"),
    readYaml("fixtures/valid/portfolio-result-1.1-partial.yaml"),
    fs.readFileSync(path.join(root, "fixtures/valid/portfolio-1.1.yaml")),
    "fixtures/valid/portfolio-result-1.1-binding"
  );

  for (const relative of [
    "fixtures/invalid/project-1.1-topology.yaml",
    "fixtures/invalid/project-1.1-component-ref.yaml",
    "fixtures/invalid/project-1.1-duplicates.yaml",
    "fixtures/invalid/project-1.1-repository-identity.yaml"
  ]) {
    validate("urn:forgeway:project:v1", readYaml(relative), relative, false);
  }
  validate(
    "urn:forgeway:portfolio:v1",
    readYaml("fixtures/invalid/portfolio-1.1-manifest-ref.yaml"),
    "fixtures/invalid/portfolio-1.1-manifest-ref.yaml",
    false
  );
  validate(
    "urn:forgeway:portfolio:v1",
    readYaml("fixtures/invalid/portfolio-1.1-campaign-path.yaml"),
    "fixtures/invalid/portfolio-1.1-campaign-path.yaml",
    false
  );
  validate(
    "urn:forgeway:portfolio:v1",
    readYaml("fixtures/invalid/portfolio-1.1-required-gate-unowned.yaml"),
    "fixtures/invalid/portfolio-1.1-required-gate-unowned.yaml",
    false
  );
  for (const relative of [
    "fixtures/invalid/portfolio-result-1.1-gate-evidence.yaml",
    "fixtures/invalid/portfolio-result-1.1-pass-partial.yaml",
    "fixtures/invalid/portfolio-result-1.1-pass-not-run.yaml",
    "fixtures/invalid/portfolio-result-1.1-evidence-reuse.yaml",
    "fixtures/invalid/portfolio-result-1.1-required-not-applicable.yaml",
    "fixtures/invalid/portfolio-result-1.1-partial-empty-evidence.yaml",
    "fixtures/invalid/portfolio-result-1.1-fail-empty-evidence.yaml",
    "fixtures/invalid/portfolio-result-1.1-blocked-empty-evidence.yaml"
  ]) {
    validate("urn:forgeway:portfolio-result:v1", readYaml(relative), relative, false);
  }
  const invalidComponentBinding = readYaml("fixtures/invalid/portfolio-result-1.1-binding-component.yaml");
  validate(
    "urn:forgeway:portfolio-result:v1",
    invalidComponentBinding,
    "fixtures/invalid/portfolio-result-1.1-binding-component.yaml:schema"
  );
  validatePortfolioBinding(
    readYaml("fixtures/valid/portfolio-1.1.yaml"),
    invalidComponentBinding,
    fs.readFileSync(path.join(root, "fixtures/valid/portfolio-1.1.yaml")),
    "fixtures/invalid/portfolio-result-1.1-binding-component.yaml",
    false
  );
  validate(
    "urn:forgeway:evidence:v1",
    readYaml("fixtures/invalid/evidence-1.0-reason-code.yaml"),
    "fixtures/invalid/evidence-1.0-reason-code.yaml",
    false
  );
  validate(
    "urn:forgeway:evidence:v1",
    readYaml("fixtures/invalid/evidence-artifact-absolute-path.yaml"),
    "fixtures/invalid/evidence-artifact-absolute-path.yaml",
    false
  );
  validate(
    "urn:forgeway:project:v1",
    readYaml("fixtures/invalid/project-home-path.yaml"),
    "fixtures/invalid/project-home-path.yaml",
    false
  );
  validate(
    "urn:forgeway:project:v1",
    readYaml("fixtures/invalid/project-parent-path.yaml"),
    "fixtures/invalid/project-parent-path.yaml",
    false
  );
  validate(
    "urn:forgeway:project:v1",
    readYaml("fixtures/invalid/project-backslash-path.yaml"),
    "fixtures/invalid/project-backslash-path.yaml",
    false
  );
  validate(
    "urn:forgeway:project:v1",
    readYaml("fixtures/invalid/project-windows-drive-path.yaml"),
    "fixtures/invalid/project-windows-drive-path.yaml",
    false
  );
  validate(
    "urn:forgeway:evidence:v1",
    readYaml("fixtures/invalid/evidence-unsafe-limitation-path.yaml"),
    "fixtures/invalid/evidence-unsafe-limitation-path.yaml",
    false
  );
  for (const relative of [
    "fixtures/invalid/evidence-unsafe-home-text.yaml",
    "fixtures/invalid/evidence-unsafe-parent-text.yaml",
    "fixtures/invalid/evidence-unsafe-windows-text.yaml",
    "fixtures/invalid/evidence-unsafe-unc-text.yaml"
  ]) {
    validate("urn:forgeway:evidence:v1", readYaml(relative), relative, false);
  }
  validate(
    "urn:forgeway:portfolio-result:v1",
    readYaml("fixtures/valid/portfolio-result-1.1-blocked.yaml"),
    "fixtures/valid/portfolio-result-1.1-blocked.yaml"
  );
  validatePortfolioBinding(
    readYaml("fixtures/valid/portfolio-1.1.yaml"),
    readYaml("fixtures/valid/portfolio-result-1.1-blocked.yaml"),
    fs.readFileSync(path.join(root, "fixtures/valid/portfolio-1.1.yaml")),
    "fixtures/valid/portfolio-result-1.1-blocked-binding"
  );

  for (const relative of ["fixtures/valid/evidence-artifact.yaml", "fixtures/valid/evidence-runtime.yaml", "fixtures/valid/evidence-runtime-blocked.yaml"]) {
    validate("urn:forgeway:evidence:v1", readYaml(relative), relative);
  }

  validate(
    "urn:forgeway:portfolio:v1",
    readYaml("fixtures/invalid/portfolio-duplicate.yaml"),
    "fixtures/invalid/portfolio-duplicate.yaml",
    false
  );

  validate(
    "urn:forgeway:portfolio:v1",
    readYaml("fixtures/invalid/portfolio-profile.yaml"),
    "fixtures/invalid/portfolio-profile.yaml",
    false
  );

  for (const relative of [
    "fixtures/invalid/portfolio-result-count.yaml",
    "fixtures/invalid/portfolio-result-duplicate.yaml",
    "fixtures/invalid/portfolio-result-profile.yaml"
  ]) {
    validate("urn:forgeway:portfolio-result:v1", readYaml(relative), relative, false);
  }

  for (const relative of [
    "fixtures/invalid/portfolio-result-binding-hash.yaml",
    "fixtures/invalid/portfolio-result-binding-system.yaml",
    "fixtures/invalid/portfolio-result-binding-project-id.yaml",
    "fixtures/invalid/portfolio-result-binding-project.yaml",
    "fixtures/invalid/portfolio-result-binding-gates.yaml",
    "fixtures/invalid/portfolio-result-binding-requirements.yaml"
  ]) {
    const result = readYaml(relative);
    validate("urn:forgeway:portfolio-result:v1", result, `${relative}:schema`);
    validatePortfolioBinding(
      readYaml("fixtures/valid/portfolio.yaml"),
      result,
      fs.readFileSync(path.join(root, "fixtures/valid/portfolio.yaml")),
      relative,
      false
    );
  }

  validate(
    "urn:forgeway:portfolio:v1",
    readYaml("evaluation/portfolio.example.yaml"),
    "evaluation/portfolio.example.yaml"
  );

  const brokenFixture = path.join(root, "fixtures/invalid/markdown-broken.md");
  if (markdownLinkFindings(brokenFixture).length === 0) {
    errors.push({ label: "fixtures/invalid/markdown-broken.md", issue: "negative link fixture unexpectedly passed" });
  } else {
    validated.push("fixtures/invalid/markdown-broken.md");
  }

  for (const file of walk(root).filter((name) => name.endsWith(".md") && name !== brokenFixture)) {
    errors.push(...markdownLinkFindings(file));
  }
}

const result = {
  ok: errors.length === 0,
  schemas: schemaFiles.length,
  validated_cases: validated.length,
  errors
};
console.log(JSON.stringify(result, null, 2));
if (errors.length) process.exit(1);
