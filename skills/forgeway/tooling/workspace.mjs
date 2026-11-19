import { randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { lstatSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import path from "node:path";
import { devNull } from "node:os";
import { fileURLToPath } from "node:url";
import Ajv2020 from "ajv/dist/2020.js";
import YAML from "yaml";
import { buildPackageManifest, validatePackageManifest } from "./delivery/package-manifest.mjs";
import { resolveHttpApiProfile } from "./http-api-profile.mjs";

const SOURCE_ROOT = fileURLToPath(new URL("../", import.meta.url));
const RECORD = ".forgeway/workspace.json";
const SOURCE_PACKAGE = ".forgeway/source-package.json";
const OVERRIDES = ".forgeway/http-api-overrides.json";
const SLOT = /^[a-z][a-z0-9-]{0,39}$/;
const RESERVED_SLOT = /^(con|prn|aux|nul|com[0-9]|lpt[0-9])$/i;
const AUTHORITY_REFS = ["standards/project-capabilities.md", "standards/interfaces-and-data.md", "standards/business-scenarios.md", "standards/security-and-privacy.md", "standards/code-design.md", "handbook/authority-model.md", "templates/project-capabilities.md", "templates/http-api-adoption.md"];
// Single mapping owner for profile composition and project-type compatibility.
const STACKS = {
  undecided: { refs: [], types: ["undecided"] },
  vue: { refs: ["standards/profiles/vue.md", "standards/frontend-css.md"], types: ["frontend", "fullstack", "library"] },
  react: { refs: ["standards/profiles/react.md", "standards/frontend-css.md"], types: ["frontend", "fullstack", "library"] },
  vanilla: { refs: ["standards/frontend-css.md"], types: ["frontend", "fullstack", "library"] },
  java: { refs: ["standards/profiles/java-fullstack.md"], types: ["backend", "fullstack", "cli", "library"] },
  rust: { refs: ["standards/profiles/rust-fullstack.md"], types: ["backend", "fullstack", "cli", "library"] },
  node: { refs: ["standards/profiles/node.md"], types: ["backend", "fullstack", "cli", "library"] }
};
const DEFAULT_APPS = { undecided: ["frontend", "backend"], frontend: ["frontend"], backend: ["backend"], fullstack: ["frontend", "backend"], cli: ["cli"], library: ["library"] };
const projectType = (record) => record.project_type ?? (record.starter === "http-demo" ? "fullstack" : "undecided");
const appStack = (record, app) => app.stack ?? (record.starter === "http-demo" ? (app.id === "frontend" ? "vanilla" : "node") : "undecided");
const authorityRefs = (record, apps = record.applications) => [...new Set([...AUTHORITY_REFS, ...apps.flatMap((app) => STACKS[appStack(record, app)].refs)])];
let validateRecord;

function fail(message, code = "WORKSPACE_INPUT_INVALID", exitCode = 2) {
  throw Object.assign(new Error(message), { code, exitCode });
}

function git(root, args, input) {
  // Do not let caller Git environment redirect a read or initialization to another repository.
  const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith("GIT_")));
  Object.assign(env, { GIT_OPTIONAL_LOCKS: "0", GIT_CONFIG_NOSYSTEM: "1", GIT_CONFIG_GLOBAL: devNull });
  return execFileSync("git", ["-C", root, ...args], { env, input, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"], timeout: 10000 });
}

function inspect(filename) {
  try { return lstatSync(filename); } catch (error) { if (error.code === "ENOENT") return null; throw error; }
}

function safePath(filename) {
  const absolute = path.resolve(filename);
  const parsed = path.parse(absolute);
  let current = parsed.root;
  for (const segment of absolute.slice(parsed.root.length).split(path.sep).filter(Boolean)) {
    current = path.join(current, segment);
    if (inspect(current)?.isSymbolicLink()) fail("symbolic links are not accepted in workspace paths", "WORKSPACE_PATH_UNSAFE");
  }
  return absolute;
}

function regular(root, relative, optional = false) {
  const filename = safePath(path.join(root, relative));
  const info = inspect(filename);
  if (optional && info === null) return null;
  if (!info?.isFile()) fail(`required regular file missing: ${relative}`, "WORKSPACE_FILE_INVALID");
  return filename;
}

function strictJson(filename) {
  const text = readFileSync(filename, "utf8");
  try {
    JSON.parse(text);
    const parsed = YAML.parseDocument(text, { schema: "json", uniqueKeys: true });
    if (parsed.errors.length) throw new Error("duplicate keys");
    return parsed.toJS();
  } catch { fail("workspace JSON must be strict JSON without duplicate keys", "WORKSPACE_JSON_INVALID"); }
}

function checkRecord(record) {
  validateRecord ??= new Ajv2020({ strict: true, allErrors: true }).compile(JSON.parse(readFileSync(new URL("../contracts/workspace.schema.json", import.meta.url), "utf8")));
  if (!validateRecord(record) || !record.name.trim()) fail("workspace descriptor does not match workspace v1", "WORKSPACE_RECORD_INVALID");
  const ids = new Set();
  for (const app of record.applications) {
    if (ids.has(app.id) || RESERVED_SLOT.test(app.id) || app.path !== `apps/${app.id}`) fail("application slots must be unique and match apps/<id>", "WORKSPACE_RECORD_INVALID");
    ids.add(app.id);
  }
  if (record.starter === "http-demo" && record.applications.map((app) => app.id).join(",") !== "frontend,backend") fail("HTTP demo slots must remain frontend/backend", "WORKSPACE_RECORD_INVALID");
  const type = projectType(record);
  for (const app of record.applications) {
    if (!STACKS[appStack(record, app)].types.includes(type)) fail("application stack does not match project type (explicit selection requires every stack)", "WORKSPACE_RECORD_INVALID");
  }
  if (type === "fullstack" && (!record.applications.some((app) => ["vue", "react", "vanilla"].includes(appStack(record, app))) || !record.applications.some((app) => ["java", "rust", "node"].includes(appStack(record, app))))) fail("fullstack requires frontend and backend stacks", "WORKSPACE_RECORD_INVALID");
  if (record.starter === "http-demo" && (type !== "fullstack" || record.applications.some((app) => appStack(record, app) !== (app.id === "frontend" ? "vanilla" : "node")))) fail("HTTP demo is vanilla frontend and Node backend only", "WORKSPACE_RECORD_INVALID");
}

function currentSource() {
  // Reuse the existing dirty/untracked-aware source identity, not just git HEAD.
  if (["GIT_DIR", "GIT_WORK_TREE", "GIT_COMMON_DIR", "GIT_INDEX_FILE"].some((key) => process.env[key])) fail("unset Git root/index overrides before binding Forgeway source", "WORKSPACE_GIT_ENV_UNSAFE");
  return buildPackageManifest({ root: SOURCE_ROOT, repository_id: "forgeway" });
}

function writeNew(root, relative, contents) {
  writeFileSync(path.join(root, relative), contents, { flag: "wx" });
}

export function initializeWorkspace({ target, name, applications, starter, project_type, stacks = [] }) {
  if (typeof target !== "string" || !target || typeof name !== "string" || !name.trim()) fail("init requires a target and --name");
  project_type ??= starter === "http-demo" ? "fullstack" : "undecided";
  if (!Object.hasOwn(DEFAULT_APPS, project_type)) fail("unknown project type");
  applications ??= DEFAULT_APPS[project_type];
  if (!Array.isArray(applications) || applications.some((id) => typeof id !== "string" || !SLOT.test(id))) fail("invalid application slot ID");
  if (starter !== undefined && (starter !== "http-demo" || applications.join(",") !== "frontend,backend")) fail("http-demo requires the default frontend/backend slots");
  const selected = new Map();
  if (!Array.isArray(stacks)) fail("stacks must be app-id=stack selections");
  for (const selection of stacks) {
    if (typeof selection !== "string") fail("invalid stack selection");
    const [id, stack, extra] = selection.split("=");
    if (extra !== undefined || !applications.includes(id) || !Object.hasOwn(STACKS, stack) || selected.has(id)) fail("unknown, duplicate or malformed application stack selection");
    selected.set(id, stack);
  }
  const root = safePath(target);
  if (inspect(root)) fail("target already exists; no files were changed", "WORKSPACE_TARGET_EXISTS");
  if (!inspect(path.dirname(root))?.isDirectory()) fail("target parent must already exist", "WORKSPACE_PARENT_MISSING");
  // Preflight Git without reading or mutating the target parent repository.
  git(path.dirname(root), ["--version"]);
  const source = currentSource();
  const record = { schema_version: "forgeway-workspace/1", workspace_id: `workspace:${randomUUID()}`, name: name.trim(), source_package_id: source.package_id, project_type, applications: applications.map((id) => ({ id, path: `apps/${id}`, stack: selected.get(id) ?? (starter === "http-demo" ? (id === "frontend" ? "vanilla" : "node") : "undecided") })) };
  if (starter) record.starter = starter;
  checkRecord(record);
  mkdirSync(root); // Exclusive creation; never merge with an existing directory.
  try {
    mkdirSync(path.join(root, ".forgeway"));
    mkdirSync(path.join(root, "apps"));
    writeNew(root, ".gitignore", "/apps/\n/.codex/\n");
    writeNew(root, RECORD, `${JSON.stringify(record, null, 2)}\n`);
    writeNew(root, SOURCE_PACKAGE, `${JSON.stringify(source, null, 2)}\n`);
    writeNew(root, "AGENTS.md", `# Project governance\n\nWorkspace identity: ${record.workspace_id}.\n\nRead .forgeway/workspace.json and validate this workspace using the matching Forgeway checkout:\n\n\`forgeway workspace check <workspace-root>\`\n\nResolve each application with \`forgeway workspace resolve <workspace-root> --app <id>\`. Read project_type and application.stack from that result, not a copied selection. Consume its shared_authority_refs: common business-scenarios/security/code-design plus only that application's selected profile. Record applicable rules and exceptions at the project's existing native authority. The source package binds shared standards without copying their bodies. Missing or drifted authority blocks adoption. External Skills require host discovery; this file does not activate them.\n\nUndecided means selection is still required, not a detected stack. Explicit selections describe planned standards, not installed frameworks. Actual scaffolding requires the user's scope and an available native capability. Existing applications retain their layout, toolchain and native rules; bootstrap never authorizes migration.\n\nNative Product, UI, API, database and source owners retain authority. No PRD, Task, Project delivery manifest, application commit or acceptance is generated or approved by bootstrap.\n`);
    for (const app of record.applications) {
      mkdirSync(path.join(root, app.path));
      writeNew(root, `${app.path}/AGENTS.md`, `# Application guidance\n\nApplication ID: ${app.id}. Governance workspace: ${record.workspace_id}.\n\nUse the matching Forgeway CLI: \`forgeway workspace resolve <workspace-root> --app ${app.id}\`. Read project_type and application.stack from that result. Read the returned shared_authority_refs before authorized implementation: common business-scenarios/security/code-design and only this application's profile. Record applicable rules and exceptions at the project's existing native authority. Bind the explicit host-local workspace root to that identity; do not assume instructions outside this application's Git root load automatically.\n\nShared standards remain external. Undecided requires user selection before framework scaffolding; a selected stack is planned, not runtime evidence. Existing source, manifests and native rules remain authoritative; do not rebuild or migrate automatically. Project Product/UI/role decisions live with their owners; source, API, migrations and native verification commands belong to this application. Do not infer execution permission or completed requirements from bootstrap.\n`);
    }
    if (starter === "http-demo") {
      const demoFiles = ["README.md", "backend/server.mjs", "backend/001-initial.sql", "frontend/server.mjs", "frontend/index.html", "frontend/client.js"];
      for (const file of demoFiles) writeNew(root, `apps/${file}`, readFileSync(new URL(`../templates/starters/http-demo/${file}`, import.meta.url)));
    }
    git(root, ["-c", "init.templateDir=", "init", "--quiet"]);
  } catch (cause) {
    fail(`initialization failed; partial target retained for inspection (${cause.code ?? "IO"})`, "WORKSPACE_INIT_FAILED");
  }
  return { schema_version: "forgeway-workspace-init/1", workspace_id: record.workspace_id, source_package_id: source.package_id, project_type: record.project_type, applications: record.applications, created: true, git_initialized: true, project_manifest_created: false, authorizes_execution: false, runtime_conformance_claim: false };
}

export function checkWorkspace(target) {
  if (typeof target !== "string" || !target) fail("workspace check requires a target");
  const root = safePath(target);
  if (!inspect(root)?.isDirectory()) fail("workspace root must exist", "WORKSPACE_ROOT_MISSING");
  const record = strictJson(regular(root, RECORD));
  checkRecord(record);
  const findings = [];
  const add = (code, message) => findings.push({ code, message });
  let source;
  try {
    source = strictJson(regular(root, SOURCE_PACKAGE));
    validatePackageManifest(source);
    if (source.repository_id !== "forgeway" || source.package_id !== record.source_package_id) add("WORKSPACE_SOURCE_INVALID", "source package identity does not match the descriptor");
    if (currentSource().package_id !== record.source_package_id) add("WORKSPACE_SOURCE_DRIFT", "invoke the matching Forgeway checkout; source contents or Git basis changed");
    for (const ref of authorityRefs(record)) if (!source.files.some((file) => file.path === ref && file.exists && file.mode !== "120000")) add("WORKSPACE_AUTHORITY_MISSING", `missing source authority: ${ref}`);
  } catch { add("WORKSPACE_SOURCE_INVALID", "source package missing or invalid"); }
  for (const relative of ["apps", ...record.applications.map((app) => app.path)]) {
    try {
      if (!inspect(safePath(path.join(root, relative)))?.isDirectory()) add("WORKSPACE_APP_MISSING", `missing application directory: ${relative}`);
    } catch { add("WORKSPACE_PATH_UNSAFE", `unsafe application directory: ${relative}`); }
  }
  for (const relative of ["AGENTS.md", ...record.applications.map((app) => `${app.path}/AGENTS.md`)]) {
    try {
      const contents = readFileSync(regular(root, relative), "utf8");
      if (!contents.includes(record.workspace_id)) add("WORKSPACE_GUIDANCE_INVALID", `guidance must bind workspace identity: ${relative}`);
      const application = record.applications.find((app) => `${app.path}/AGENTS.md` === relative);
      if (application && !contents.includes(`Application ID: ${application.id}.`)) add("WORKSPACE_GUIDANCE_INVALID", `application guidance ID is stale: ${relative}`);
    } catch { add("WORKSPACE_GUIDANCE_INVALID", `missing or unsafe guidance: ${relative}`); }
  }
  try {
    const ignore = readFileSync(regular(root, ".gitignore"), "utf8").split(/\r?\n/).map((line) => line.trim());
    if (!ignore.includes("/apps/") || !ignore.includes("/.codex/")) add("WORKSPACE_IGNORE_INVALID", "root .gitignore must explicitly ignore /apps/ and /.codex/");
    if (!inspect(safePath(path.join(root, ".git")))?.isDirectory() || realpathSync(git(root, ["rev-parse", "--show-toplevel"]).trim()) !== realpathSync(root)) throw new Error("not the governance Git root");
    const tracked = git(root, ["ls-files", "-z"]).split("\0");
    if (tracked.some((item) => /^(apps|\.codex)(\/|$)/.test(item))) add("WORKSPACE_IGNORED_TRACKED", "application or run-local evidence paths are tracked by the outer Git repository");
    const probes = ["apps/", ".codex/", "apps/.forgeway-ignore-probe", ".codex/.forgeway-ignore-probe", ...record.applications.map((app) => `${app.path}/AGENTS.md`)];
    const ignored = new Set(git(root, ["check-ignore", "--no-index", "-z", "--stdin"], probes.join("\0") + "\0").split("\0"));
    if (probes.some((probe) => !ignored.has(probe))) add("WORKSPACE_IGNORE_INVALID", "Git effective ignore rules do not cover the application/evidence probes");
  } catch { add("WORKSPACE_GIT_INVALID", "missing/unsafe root Git or effective ignore check failed"); }
  let convention = null;
  try {
    const override = regular(root, OVERRIDES, true);
    convention = resolveHttpApiProfile({ overrideBytes: override ? readFileSync(override) : undefined });
  } catch { add("WORKSPACE_HTTP_OVERRIDE_INVALID", "HTTP override is unsafe or invalid"); }
  return { schema_version: "forgeway-workspace-check/1", workspace_id: record.workspace_id, valid: findings.length === 0, source_package_id: record.source_package_id, project_type: projectType(record), applications: record.applications.map((app) => ({ ...app, stack: appStack(record, app) })), findings, http_convention: convention, project_delivery_readiness: "Not verified", authorizes_execution: false, runtime_conformance_claim: false };
}

export function resolveWorkspace(target, appId) {
  const result = checkWorkspace(target);
  if (!result.valid) fail("workspace has unresolved findings; run workspace check", "WORKSPACE_NOT_READY", 3);
  const app = result.applications.find((item) => item.id === appId);
  if (!app) fail("application ID is not declared", "WORKSPACE_APP_UNKNOWN");
  return { schema_version: "forgeway-workspace-resolution/1", workspace_id: result.workspace_id, project_type: result.project_type, application: app, source_package_id: result.source_package_id, shared_authority_refs: authorityRefs(result, [app]), http_convention: result.http_convention, project_decisions_ref: ".forgeway/workspace.json", authorizes_execution: false, runtime_conformance_claim: false };
}

export function workspaceCommand(positionals, flags) {
  const [area, action, target] = positionals;
  const init = area === "init";
  const resolve = !init && action === "resolve";
  const allowed = new Set(init ? ["name", "app", "starter", "project-type", "stack", "compact"] : resolve ? ["app", "compact"] : ["compact"]);
  for (const [key, value] of Object.entries(flags)) {
    if (!allowed.has(key) || (key === "compact" ? value !== true : !Array.isArray(value) || value.length < 1 || ((!init || !["app", "stack"].includes(key)) && value.length !== 1))) fail(`invalid workspace option: --${key}`);
  }
  if (init) {
    if (positionals.length !== 2) fail("usage: forgeway init <target> --name <name> [--app <id>]...");
    return initializeWorkspace({ target: action, name: flags.name?.[0], applications: flags.app, starter: flags.starter?.[0], project_type: flags["project-type"]?.[0], stacks: flags.stack });
  }
  if (positionals.length !== 3 || (!resolve && action !== "check")) fail("usage: forgeway workspace check|resolve <root>");
  if (resolve) return resolveWorkspace(target, flags.app?.[0]);
  const result = checkWorkspace(target);
  if (!result.valid) process.exitCode = 3;
  return result;
}
