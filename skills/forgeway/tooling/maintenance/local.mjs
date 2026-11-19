import { lstat, readdir, realpath, open } from "node:fs/promises";
import { constants } from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { validateUserConfig, emptyUserConfig } from "./config.mjs";
import { typedArtifactValidation } from "../artifact-validation.mjs";
import { buildPackageManifest } from "../delivery/package-manifest.mjs";
import { artifactRepositoryMap, artifactTaskScope } from "../context/index.mjs";
import { repositoryIdentity } from "../repository-identity.mjs";
import { inspectMaintenance } from "./inspect.mjs";
import { assert, digest, fail, hash, relative, VERSION } from "./common.mjs";
import { verifyRuntimeLock } from "../../scripts/install-skill.mjs";

const COLLECTOR = "forgeway-local-readback/1";
const MAX_FILES = 2048, MAX_BYTES = 32 * 1024 * 1024;
async function safePath(filename) {
  assert(!filename.split(/[\\/]/u).includes(".."), "MAINTENANCE_LOCAL_PATH_INVALID");
  const resolved = path.resolve(filename);
  for (let current = resolved;; current = path.dirname(current)) {
    const stat = await lstat(current);
    assert(!stat.isSymbolicLink(), "MAINTENANCE_LOCAL_SYMLINK");
    if (path.dirname(current) === current) break;
  }
  return resolved;
}
async function bytes(root, filename, budget) {
  assert(relative(filename), "MAINTENANCE_LOCAL_PATH_INVALID");
  const selected = await safePath(path.join(root, filename));
  const handle = await open(selected, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const stat = await handle.stat();
    assert(stat.isFile() && stat.size <= MAX_BYTES && budget.count++ < MAX_FILES && (budget.bytes += stat.size) <= MAX_BYTES, "MAINTENANCE_LOCAL_LIMIT");
    const data = await handle.readFile();
    assert(data.length === stat.size && await realpath(selected) === selected, "MAINTENANCE_LOCAL_DRIFT");
    return { data, mode: stat.mode & 0o777 };
  } finally { await handle.close(); }
}
function excluded(root, filename, rules) {
  return rules.some(rule => {
    const bounded = rule.replace(/\/\*\*$/u, "").replace(/\/$/u, "");
    const candidate = path.isAbsolute(bounded) ? path.join(root, filename) : filename;
    return candidate === bounded || candidate.startsWith(bounded + path.sep);
  });
}
async function distribution(root, exclude = []) {
  root = await safePath(root);
  const permitted = filename => assert(!excluded(root, filename, exclude), "MAINTENANCE_LOCAL_EXCLUDED");
  permitted("package.json");
  const budget = { count: 0, bytes: 0 }, packageFile = await bytes(root, "package.json", budget);
  const manifest = JSON.parse(packageFile.data);
  assert(manifest.name === "forgeway" && Array.isArray(manifest.files), "MAINTENANCE_LOCAL_NOT_FORGEWAY");
  const files = new Map([["package.json", { sha256: digest(packageFile.data), mode: packageFile.mode }]]);
  const visit = async filename => {
    filename = filename.replace(/\/$/u, "");
    permitted(filename);
    assert(relative(filename) && !filename.split("/").some(part => part.startsWith(".")), "MAINTENANCE_LOCAL_PATH_INVALID");
    if (files.has(filename)) return;
    const selected = await safePath(path.join(root, filename)), stat = await lstat(selected);
    if (stat.isDirectory()) {
      assert(budget.count++ < MAX_FILES, "MAINTENANCE_LOCAL_LIMIT");
      for (const name of await readdir(selected)) await visit(`${filename}/${name}`);
    } else {
      const read = await bytes(root, filename, budget); files.set(filename, { sha256: digest(read.data), mode: read.mode });
    }
  };
  for (const name of manifest.files) await visit(name);
  for (const name of ["LICENSE", "LICENSE.md"]) {
    try { await lstat(path.join(root, name)); await visit(name); } catch (error) { if (error.code !== "ENOENT") throw error; }
  }
  const entries = [...files].sort(([a], [b]) => a.localeCompare(b));
  return { root, manifest, files: Object.fromEntries(entries), sha256: hash(entries), bytes_read: budget.bytes };
}
function revision(root, version) {
  const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith("GIT_")));
  try { return execFileSync("git", ["-C", root, "rev-parse", "HEAD"], { env: { ...env, GIT_OPTIONAL_LOCKS: "0" }, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], timeout: 5000 }).trim(); }
  catch { return `package:${version ?? "unknown"}`; }
}

// Roots select read scope only. No CLI option or package JSON authenticates the
// publisher, registers a writer, or grants install/activation authority.
export async function inspectLocalForgeway({ sourceRoot, installedRoot, entryPath, config, configSha256 } = {}) {
  assert(sourceRoot || installedRoot, "MAINTENANCE_LOCAL_ROOT_REQUIRED");
  config = validateUserConfig(config ?? emptyUserConfig());
  const source = sourceRoot ? await distribution(sourceRoot, config.exclude) : null;
  const installed = installedRoot ? await distribution(installedRoot, config.exclude) : null;
  const readback = { source: source ? { status: "observed", root: source.root, files: source.files, snapshot_sha256: source.sha256, authentication: "Not verified" } : null, installed: null, dependencies: { status: "Not verified" }, invocation: { status: "Not verified" }, loaded: { status: "Not verified" } };
  let ledgerMatches = false;
  if (installed) {
    try {
      assert(!excluded(installed.root, ".forgeway-install.json", config.exclude), "MAINTENANCE_LOCAL_EXCLUDED");
      const raw = await bytes(installed.root, ".forgeway-install.json", { count: 0, bytes: 0 });
      const ledger = JSON.parse(raw.data);
      assert(["forgeway-install/1", "forgeway-install/2"].includes(ledger.schema_version) && ledger.files && typeof ledger.files === "object", "MAINTENANCE_LOCAL_LEDGER_INVALID");
      ledgerMatches = Object.keys(installed.files).every(filename => ledger.files[filename] === installed.files[filename].sha256) && Object.keys(ledger.files).every(filename => installed.files[filename] && ledger.files[filename] === installed.files[filename].sha256);
      readback.installed = { status: ledgerMatches ? "observed-matching-ledger" : "observed-drift", root: installed.root, snapshot_sha256: installed.sha256, ledger_sha256: digest(raw.data), files: installed.files };
    } catch { readback.installed = { status: "observed-ledger-unverified", root: installed.root, snapshot_sha256: installed.sha256, files: installed.files }; }
    try {
      // Dependency evidence must bind a lock captured in this distribution.
      assert(Object.hasOwn(installed.files, "package-lock.json"), "MAINTENANCE_LOCAL_LOCK_UNBOUND");
      // A private dependency subtree must not be read indirectly by the shared
      // inventory verifier. With exclusions, leave this layer unverified.
      assert(config.exclude.length === 0, "MAINTENANCE_LOCAL_EXCLUDED"); const inventory = await verifyRuntimeLock(installed.root);
      readback.dependencies = { status: inventory.unverified_specifications.length ? "Not verified" : "observed-lock-inventory-match", inventory_status: "observed-lock-inventory-match", unverified_specifications: inventory.unverified_specifications, limits: "Exact/file required specs and lock identity/package versions read; ranges/aliases/peer/optional semantics and installed module content/behavior are not authenticated by this collector" }; } catch { /* Distinct missing/unverified dependency claim remains visible. */ }
    if (entryPath) {
      try {
        const actual = await realpath(entryPath);
        if (actual === path.join(installed.root, "tooling/forgeway.mjs")) readback.invocation = { status: "observed", entry: actual, sha256: installed.files["tooling/forgeway.mjs"].sha256 };
      } catch { /* No guessed invocation binding. */ }
    }
  }
  const collector = { id: COLLECTOR, collect: async subject => {
    const observed = (identity, sha256) => ({ identity, sha256, collector: COLLECTOR, scope: [subject.id], evidence_ref: `local-readback:${sha256}` });
    const sourceFact = source ? { ...observed(`local-source:${hash(source.root)}`, source.sha256), revision: revision(source.root, source.manifest.version), trusted: false, limitations: ["Actual bounded file readback; publisher/source authority has not been authenticated"] } : undefined;
    const sameContent = source && installed && source.sha256 === installed.sha256;
    return {
      ...(sourceFact ? { source: sourceFact } : {}),
      ...(installed ? { installed: { ...observed(`local-install:${hash(installed.root)}`, installed.sha256), ...(sameContent ? { source_identity: sourceFact.identity, source_revision: sourceFact.revision, source_sha256: sourceFact.sha256 } : {}), limitations: [ledgerMatches ? "Actual bytes match local ledger; ledger is not publisher proof" : "Local install ledger differs or is unavailable"] } } : {}),
      ...(readback.dependencies.status === "observed-lock-inventory-match" ? { dependencies: observed(`local-lock:${hash(installed.root)}`, installed.files["package-lock.json"].sha256) } : {}),
      ...(readback.invocation.status === "observed" ? { invocation: { ...observed(readback.invocation.entry, installed.sha256), installed_identity: `local-install:${hash(installed.root)}` } } : {}),
      owners: [], limitations: ["Read-only built-in collector. Native source writer, source authentication and host loaded-session API are not connected."]
    };
  } };
  const diagnosis = await inspectMaintenance({ schema_version: VERSION, operation: "diagnose", problem: "Inspect explicitly selected local Forgeway source/installation", scope: ["explicit-local-distribution"], subjects: [{ id: "forgeway", kind: "component", profile: "forgeway-distribution", name: "Forgeway" }] }, { collector, config, configSha256 });
  return { ...diagnosis, local_readback: readback, execution: { status: "blocked", reason: "trusted-writer-not-connected" } };
}

function captureHandoffInput(kind, value, code) {
  const validate = input => {
    const checked = typedArtifactValidation(kind, input);
    assert(!checked.schema_errors.length && !checked.semantic_errors.length, code);
  };
  validate(value); // Preserve original rejection before copying non-JSON input.
  let captured;
  try { captured = structuredClone(value); } catch { fail(code); }
  validate(captured); // Validation and later hashes must describe the same copy.
  return captured;
}

// Read-only handoff projection of an existing Task, not executable authority.
export async function previewLocalMaintenance({ task, project, sourceId, ...options }) {
  task = captureHandoffInput("task", task, "MAINTENANCE_TASK_INVALID");
  if (project !== undefined) {
    project = captureHandoffInput("project", project, "MAINTENANCE_PROJECT_INVALID");
    assert(["1.1", "1.2"].includes(project.schema_version), "MAINTENANCE_PROJECT_INVALID");
    assert(task.schema_version === project.schema_version, "MAINTENANCE_PROJECT_TASK_VERSION_REQUIRED");
  }
  if (["1.1", "1.2"].includes(task.schema_version) && project === undefined) fail("MAINTENANCE_PROJECT_REQUIRED", `Task ${task.schema_version} requires an explicit current Project ${task.schema_version} repository/component mapping; no mapping is inferred from the source path`);
  assert(sourceId || options.sourceRoot, "MAINTENANCE_LOCAL_ROOT_REQUIRED");
  // The existing Package builder snapshots the full selected checkout. Do not
  // silently bypass a private exclusion while constructing that input.
  assert(!(options.config?.exclude?.length), "MAINTENANCE_LOCAL_PLAN_EXCLUSIONS_REQUIRE_HOST");
  let diagnosis, root, skill = null;
  if (sourceId) {
    const config = validateUserConfig(options.config ?? emptyUserConfig());
    const source = config.sources.find(item => item.id === sourceId);
    assert(source?.profile === "skills-package" && ["self-owned", "adopted"].includes(source.ownership), "MAINTENANCE_SKILL_PLAN_SOURCE_REQUIRED");
    assert(!options.sourceRoot && !options.installedRoot && source.metadata_path === "SKILL.md", "MAINTENANCE_SKILL_PLAN_ROOT_REQUIRED");
    const { createMetadataCollector } = await import("./profiles.mjs");
    diagnosis = await inspectMaintenance({ schema_version: VERSION, operation: "inspect", problem: "Preview explicitly selected Skill Task", scope: [sourceId], subjects: [{ id: sourceId, name: sourceId, kind: "component", profile: "skills-package", source_id: sourceId }] }, { collector: createMetadataCollector(config), config, configSha256: options.configSha256 });
    skill = diagnosis.subjects[0].metadata;
    assert(skill.status === "observed", "MAINTENANCE_SKILL_METADATA_UNVERIFIED");
    root = skill.root;
  } else {
    diagnosis = await inspectLocalForgeway(options);
    root = diagnosis.local_readback.source.root;
  }
  const input = buildPackageManifest({ root, read_only: true });
  if (skill) {
    assert(/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/u.test(input.basis.head_sha ?? ""), "MAINTENANCE_SKILL_PLAN_GIT_REQUIRED");
    assert(Object.entries(skill.files).every(([filename, sha256]) => input.files.find(file => file.path === filename)?.sha256 === sha256), "MAINTENANCE_LOCAL_DRIFT");
  } else assert(diagnosis.subjects[0].source.revision === input.basis.head_sha && Object.entries(diagnosis.local_readback.source.files).every(([filename, observed]) => {
    const captured = input.files.find(file => file.path === filename);
    return captured?.sha256 === observed.sha256 && captured.mode === ((observed.mode & 0o111) ? "100755" : "100644");
  }), "MAINTENANCE_LOCAL_DRIFT");
  const basis = Array.isArray(task.basis) ? task.basis : [{ repository_id: input.repository_id, commit_sha: task.basis.commit_sha }];
  if (project) assert(basis.length === 1, "MAINTENANCE_ONE_REPOSITORY_REQUIRED");
  assert(basis.length === 1 && basis[0].commit_sha === input.basis.head_sha, "MAINTENANCE_BASIS_MISMATCH");
  let projectScope = null, packagePath = null;
  if (project) {
    const artifacts = [{ kind: "project", value: project }, { kind: "task", value: task }];
    const repositories = artifactRepositoryMap(artifacts);
    const matches = project.repositories.filter(row => repositories.get(row.id) === input.repository_id || repositoryIdentity({ remote: repositories.get(row.id) }) === input.repository_id);
    assert(matches.length <= 1, "MAINTENANCE_PROJECT_REPOSITORY_AMBIGUOUS");
    const repository = matches[0];
    assert(repository?.id === basis[0].repository_id, "MAINTENANCE_PROJECT_REPOSITORY_MISMATCH");
    assert(repository.basis.commit_sha === input.basis.head_sha, "MAINTENANCE_PROJECT_BASIS_MISMATCH");
    const refs = [...task.scope.include, ...task.scope.exclude, ...task.outputs, ...task.commands];
    const components = refs.map(ref => project.components.find(component => component.id === ref.component_id));
    assert(components.every(Boolean), "MAINTENANCE_PROJECT_COMPONENT_UNRESOLVED");
    assert(components.every(component => component.repository_id === repository.id), "MAINTENANCE_ONE_REPOSITORY_REQUIRED");
    if (task.schema_version === "1.2") {
      assert(new Set(components.map(component => component.id)).size === 1, "MAINTENANCE_ONE_COMPONENT_REQUIRED");
      const prefix = input.basis.source_root;
      assert(components[0].path === prefix, "MAINTENANCE_PROJECT_PACKAGE_ROOT_MISMATCH");
      packagePath = value => {
        assert(prefix === "." || value === prefix || value.startsWith(prefix + "/"), "MAINTENANCE_PROJECT_SCOPE_COORDINATES_REQUIRED");
        return prefix === "." ? value : value === prefix ? "." : value.slice(prefix.length + 1);
      };
    } else if (input.basis.source_root !== "." || !components.every(component => component.path === ".")) fail("MAINTENANCE_PROJECT_ROOT_COORDINATES_REQUIRED", "This read-only route requires repository-root Package and component paths '.'; nested coordinates need an owner-accepted path contract and affected-consumer validation");
    projectScope = artifactTaskScope(artifacts, repository.repository);
    for (const field of ["include", "exclude"]) assert(hash([...new Set(task.scope[field].map(ref => ref.path))].sort()) === hash(projectScope[field]), "MAINTENANCE_PROJECT_SCOPE_COORDINATES_REQUIRED");
  } else if (Array.isArray(task.basis)) assert(basis[0].repository_id === input.repository_id, "MAINTENANCE_TASK_REPOSITORY_MISMATCH");
  const paths = items => items.map(item => {
    if (typeof item === "string") return item;
    if (packagePath) return packagePath(item.path);
    if (projectScope) return item.path;
    assert(item.repository_id === basis[0].repository_id, "MAINTENANCE_ONE_REPOSITORY_REQUIRED");
    return item.path;
  });
  const include = paths(task.scope.include), exclude = paths(task.scope.exclude);
  const matches = (file, rule) => packagePath
    ? ["*", "**"].includes(rule) || (rule.endsWith("/**") ? file === rule.slice(0, -3) || file.startsWith(rule.slice(0, -3) + "/") : file === rule)
    : ["*", "**", "**/*"].includes(rule) ? true : file === rule || file.startsWith(rule.replace(/\/\*\*$/u, "") + "/");
  const selected = input.files.filter(file => include.some(rule => matches(file.path, rule)) && !exclude.some(rule => matches(file.path, rule)));
  if (skill || projectScope) assert(include.every(rule => selected.some(file => file.exists && matches(file.path, rule))), "MAINTENANCE_LOCAL_PLAN_SCOPE_UNOBSERVED");
  const body = { schema_version: VERSION, status: "proposed-host-handoff", authorizes_execution: false, task_id: task.id, selected_source_root: root, requested_effect: "source-write", task_sha256: hash(task), declared_owner: task.owner, declared_task_basis: task.basis, repository_binding: Array.isArray(task.basis) ? "observed-local-id" : "Not verified: legacy repository locator requires host resolution", source_authentication: "Not verified", diagnosis_sha256: diagnosis.snapshot_sha256, input_package_id: input.package_id, input_basis: input.basis, include, exclude, before: selected.map(file => ({ path: file.path, sha256: file.sha256, mode: file.mode })), expected_outputs: task.outputs, stop_conditions: task.stop_conditions, validation_commands: task.commands, dependencies: task.dependencies, required_host_steps: ["Authenticate this source and resolve its actual owner", "Recollect exact source/input/guidance before native Task continuation; SDK integrations create a fresh trusted planMaintenance", "Confirm current user/host permissions and sole writer; SDK integrations acquire a durable exclusive owner fence", "Execute through the actual source owner; record independent Result observations"], unavailable: ["Production source-owner bridge", "Native installation activation/loaded-session bridge"] };
  if (skill) {
    Object.assign(body, { source_profile: "skills-package", source_id: sourceId, installed: "Not verified", loaded: "Not verified" });
    body.required_host_steps[1] = "Recollect exact source/input/guidance before native Task continuation; this profile has no executable SDK plan";
    body.required_host_steps[2] = "Confirm current user/host permissions and sole writer";
    body.unavailable.push("Executable skills-package SDK profile");
  }
  if (projectScope) {
    Object.assign(body, { project_id: project.project_id, project_sha256: hash(project), repository_binding: "observed-project-mapping" });
    body.required_host_steps[1] = "Recollect exact Task/Project/source/guidance before native continuation; this read-only mapping does not enable an executable SDK plan";
    body.required_host_steps[2] = "Confirm current user/host permissions and sole writer";
    body.unavailable.push(`Executable Project/Task ${task.schema_version} mapping`);
  }
  if (packagePath) {
    body.expected_outputs = task.outputs.map(output => ({ ...output, path: packagePath(output.path) }));
    body.validation_commands = task.commands.map(command => ({ ...command, cwd: packagePath(command.cwd) }));
  }
  return { ...body, handoff_sha256: hash(body) };
}
