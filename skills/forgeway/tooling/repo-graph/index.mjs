import { execFileSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { lstatSync, mkdirSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { repositoryIdentity as sharedRepositoryIdentity } from "../repository-identity.mjs";
import { extractVueRouterRoutes } from "./vue-router.mjs";

const GRAPH_VERSION = "repo-graph/1";
const ASSET_KINDS = new Set([
  "repository", "component", "page", "route", "ui-component", "api-endpoint",
  "dto", "schema", "domain-entity", "database-object", "workflow", "test",
  "contract", "runtime-target", "deployment-target", "artifact"
]);
const EDGE_KINDS = new Set([
  "defines", "exports", "imports", "registers", "renders", "calls", "consumes",
  "implements", "persists-to", "verifies", "depends-on", "owned-by", "derived-from"
]);
const DEFAULT_EXCLUSIONS = [".git", ".codex", ".external", "node_modules", "coverage", "dist", "build"];

function error(message, code) {
  const value = new Error(message);
  value.code = code;
  return value;
}

function assert(condition, message, code = "REPO_GRAPH_INVALID") {
  if (!condition) throw error(message, code);
}

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]));
  }
  return value;
}

function canonicalJson(value) {
  return JSON.stringify(canonical(value));
}

function hash(value) {
  return createHash("sha256").update(Buffer.isBuffer(value) ? value : canonicalJson(value)).digest("hex");
}

function id(namespace, identity) {
  return `${namespace}:${hash(identity).slice(0, 24)}`;
}

function nowIso(now) {
  return new Date(now()).toISOString();
}

function normalPath(value) {
  return value.replaceAll("\\", "/").replace(/^\.\//, "");
}

function safeRelative(root, relative) {
  const value = normalPath(relative);
  assert(value && !path.isAbsolute(value) && !value.split("/").includes(".."), `path escapes repository: ${relative}`, "GRAPH_PATH_ESCAPE");
  const absolute = path.resolve(root, value);
  assert(path.relative(root, absolute) === value, `path escapes repository: ${relative}`, "GRAPH_PATH_ESCAPE");
  return { value, absolute };
}

function git(root, args, allowFailure = false) {
  try {
    return execFileSync("git", ["-C", root, ...args], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", allowFailure ? "ignore" : "pipe"],
      env: { ...process.env, GIT_OPTIONAL_LOCKS: "0" }
    });
  } catch (cause) {
    // Optional metadata may be absent, but a spawn/buffer/signal failure is
    // never evidence that a repository or its contents are absent.
    if (allowFailure && Number.isInteger(cause.status) && cause.status !== 0 && !cause.code && !cause.signal) return "";
    const detail = String(cause.stderr ?? "").trim() || cause.message;
    const wrapped = error(`git ${args.join(" ")} failed: ${detail}`, "GRAPH_GIT_ERROR");
    wrapped.cause = cause;
    throw wrapped;
  }
}

function repositoryGitRoot(root) {
  return git(root, ["rev-parse", "--show-toplevel"], true).trim() || null;
}

function basis(root, hasGit) {
  const head = hasGit ? git(root, ["rev-parse", "HEAD"], true).trim() || null : null;
  const status = hasGit ? git(root, ["status", "--porcelain=v1", "-z", "--untracked-files=all"]) : "";
  return {
    head_sha: head,
    worktree_state: status ? "dirty" : "clean",
    status_sha256: hash(status),
    package_identity: hash({ head, status })
  };
}

function repositoryIdentity(root, supplied) {
  const remote = git(root, ["config", "--get", "remote.origin.url"], true).trim();
  return sharedRepositoryIdentity({ supplied, remote, root });
}

function walk(root, exclusions) {
  const output = [];
  const visit = (directory, prefix = "") => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const relative = normalPath(path.posix.join(prefix, entry.name));
      if (exclusions.some((excluded) => relative === excluded || relative.startsWith(`${excluded}/`))) continue;
      if (entry.isSymbolicLink()) {
        output.push({ path: relative, issue: "SYMLINK_SKIPPED" });
      } else if (entry.isDirectory()) {
        visit(path.join(directory, entry.name), relative);
      } else if (entry.isFile()) {
        output.push({ path: relative });
      }
    }
  };
  visit(root);
  return output;
}

function trackedFiles(root, exclusions) {
  const gitRootPath = repositoryGitRoot(root);
  if (!gitRootPath) return null;
  const output = [];
  const indexed = git(gitRootPath, ["ls-files", "-z", "--cached"]).split("\0").filter(Boolean).map((path) => ({ path, source: "tracked" }));
  const untracked = git(gitRootPath, ["ls-files", "-z", "--others", "--exclude-standard"]).split("\0").filter(Boolean).map((path) => ({ path, source: "untracked" }));
  const seen = new Set();
  for (const candidate of [...indexed, ...untracked]) {
    const raw = candidate.path;
    const relative = normalPath(raw);
    if (seen.has(relative)) continue;
    seen.add(relative);
    if (exclusions.some((excluded) => relative === excluded || relative.startsWith(`${excluded}/`))) continue;
    const { absolute } = safeRelative(gitRootPath, relative);
    try {
      const stats = lstatSync(absolute);
      output.push(stats.isSymbolicLink()
        ? { path: relative, source: candidate.source, issue: "SYMLINK_SKIPPED" }
        : stats.isDirectory()
          ? { path: relative, source: candidate.source, issue: "GITLINK_SKIPPED" }
          : { path: relative, source: candidate.source });
    } catch (cause) {
      if (cause.code === "ENOENT") output.push({ path: relative, source: candidate.source, issue: "TRACKED_FILE_MISSING" });
      else output.push({ path: relative, source: candidate.source, issue: "FILE_STAT_ERROR", detail: String(cause.message || cause) });
    }
  }
  return output;
}

function scopeMatches(relative, scope) {
  return scope.some((rawPattern) => {
    const pattern = normalPath(rawPattern);
    if (pattern === "**" || pattern === "*") return true;
    if (pattern.endsWith("/**")) {
      const prefix = pattern.slice(0, -3).replace(/\/$/, "");
      return relative === prefix || relative.startsWith(`${prefix}/`);
    }
    return relative === pattern;
  });
}

function isTextFile(relative) {
  return /\.(?:astro|[cm]?[jt]sx?|java|json|ya?ml|mdx?|sql|graphql|proto|toml|xml|properties|gradle|rs)$/i.test(relative) || ["Dockerfile", "DESIGN.md"].includes(path.basename(relative));
}

function fileKind(relative) {
  const lower = relative.toLowerCase();
  const base = path.basename(lower);
  if (/^(?:test|tests|spec|specs)\//.test(lower) || /(?:\.|_)(?:test|spec)\.[^.]+$/.test(lower)) return "test";
  if (lower.includes("/migrations/") || /\.(?:sql)$/.test(lower)) return "database-object";
  if (base === "design.md" || /(?:openapi|asyncapi|schema|contract)/.test(lower) || /\.(?:proto|graphql)$/.test(lower)) return "contract";
  if (lower.includes(".github/workflows/") || /(?:workflow|pipeline)/.test(base)) return "workflow";
  if (/^(?:dockerfile|compose\.ya?ml)$/.test(base) || lower.includes("/deploy")) return "deployment-target";
  return "artifact";
}

function routeFromPath(relative) {
  const pagesMatch = relative.match(/(?:^|\/)src\/pages\/(.+)\.(?:astro|[cm]?[jt]sx?)$/i);
  const reactRouterMatch = relative.match(/(?:^|\/)app\/routes\/(.+)\.(?:[cm]?[jt]sx?)$/i);
  if (!pagesMatch && !reactRouterMatch) return null;
  let route = pagesMatch
    ? pagesMatch[1]
    : reactRouterMatch[1]
        .split("/")
        .filter((segment) => !segment.startsWith("_") && segment.toLowerCase() !== "index")
        .join("/")
        .replace(/\[\.\]/g, ".")
        .replace(/^\$$|\/\$$/g, "/*")
        .replace(/(^|\/)\$([A-Za-z0-9_]+)/g, "$1:$2");
  route = route.replace(/(?:^|\/)index$/i, "").replace(/\[\.\.\.([^\]]+)\]/g, "*$1").replace(/\[([^\]]+)\]/g, ":$1");
  return `/${route}`.replace(/\/$/, "") || "/";
}

function maskNonCodeForSymbols(contents) {
  let result = "";
  let state = "code";
  let escaped = false;
  for (let index = 0; index < contents.length; index += 1) {
    const current = contents[index];
    const next = contents[index + 1];
    if (state === "code") {
      if (current === "/" && next === "/") {
        result += "  ";
        index += 1;
        state = "line-comment";
      } else if (current === "/" && next === "*") {
        result += "  ";
        index += 1;
        state = "block-comment";
      } else if (current === "'" || current === '"' || current === "`") {
        result += " ";
        state = current === "'" ? "single-quote" : current === '"' ? "double-quote" : "template";
        escaped = false;
      } else result += current;
      continue;
    }
    if (state === "line-comment") {
      if (current === "\n") {
        result += "\n";
        state = "code";
      } else result += " ";
      continue;
    }
    if (state === "block-comment") {
      if (current === "*" && next === "/") {
        result += "  ";
        index += 1;
        state = "code";
      } else result += current === "\n" ? "\n" : " ";
      continue;
    }
    result += current === "\n" ? "\n" : " ";
    if (escaped) {
      escaped = false;
      continue;
    }
    if (current === "\\") {
      escaped = true;
      continue;
    }
    if ((state === "single-quote" && current === "'") ||
        (state === "double-quote" && current === '"') ||
        (state === "template" && current === "`")) state = "code";
  }
  return result;
}

// Count raw candidates, not executable imports. In particular, do not promote
// strings, regexp/template contents or computed arguments to resolved edges.
// Advance across trivia once so unterminated comments cannot cause rescanning.
function dynamicImportCandidateCount(contents) {
  const keywords = /\bimport\b/g;
  let count = 0;
  while (keywords.exec(contents)) {
    let cursor = keywords.lastIndex;
    while (cursor < contents.length) {
      if (/\s/.test(contents[cursor])) cursor += 1;
      else if (contents.startsWith("/*", cursor)) {
        const end = contents.indexOf("*/", cursor + 2);
        cursor = end < 0 ? contents.length : end + 2;
      } else if (contents.startsWith("//", cursor)) {
        cursor += 2;
        while (cursor < contents.length && !/[\r\n\u2028\u2029]/.test(contents[cursor])) cursor += 1;
      } else break;
    }
    if (contents[cursor] === "(") count += 1;
    keywords.lastIndex = cursor;
  }
  return count;
}

function symbolAssets(repositoryId, relative, contents, contentHash, issues) {
  const records = [];
  const add = (kind, logicalKey, symbol, confidence = 0.8, extractor = "regex-symbol/1") => {
    records.push({ kind, logical_key: logicalKey, path: relative, symbol, content_sha256: contentHash, confidence, extractor });
  };
  const route = routeFromPath(relative);
  if (route) {
    add("page", `page:${relative}`, route, 1, "path-route/2");
    add("route", `route:${relative}`, route, 1, "path-route/2");
  }
  if (/\.(?:astro|[jt]sx)$/i.test(relative) && /(?:^|\/)components?\//i.test(relative)) {
    add("ui-component", `ui:${relative}`, path.basename(relative).replace(/\.[^.]+$/, ""), 0.95, "path-component/1");
  }
  const sourceSemanticsEnabled = /\.(?:[cm]?[jt]sx?|java|rs)$/i.test(relative) &&
    fileKind(relative) !== "test" && !/(?:^|\/)fixtures?\//i.test(relative);
  const sourceContents = sourceSemanticsEnabled ? contents : "";
  for (const record of extractVueRouterRoutes(sourceContents, { onUnresolved: (detail) => issues.push({
    issue_type: "VUE_ROUTER_BINDING_UNRESOLVED", severity: "warning", path: relative,
    detail: { extractor: "vue-router-static/3", ...detail }
  }) })) {
    add("route", `vue-route:${relative}#${record.key}`, record.path, 0.95, "vue-router-static/3");
  }
  const symbolContents = maskNonCodeForSymbols(sourceContents);
  for (const match of symbolContents.matchAll(/\b(?:interface|type|class)\s+([A-Z][A-Za-z0-9_]*)/g)) {
    const name = match[1];
    if (/(?:Dto|DTO|Request|Response|Schema)$/.test(name)) {
      add("dto", `dto:${relative}#${name}`, name, 0.8, "regex-symbol/2");
    } else if (/(?:^|\/)(?:domain|entities|aggregates|value-objects|events)(?:\/|$)/i.test(relative) || /(?:Entity|Aggregate|ValueObject|DomainEvent)$/.test(name)) {
      add("domain-entity", `domain-entity:${relative}#${name}`, name, 0.7, "regex-symbol/2");
    }
  }
  // Removing dead \b(?:GET... generic extractor (intentionally unsupported inside arbitrary strings due to false-positive risk).
  for (const match of sourceContents.matchAll(/(?:app|router)\.(get|post|put|patch|delete)\s*\(\s*["'`]([^"'`]+)["'`]/g)) {
    if (symbolContents[match.index] !== " ") {
      const endpoint = `${match[1].toUpperCase()} ${match[2]}`;
      add("api-endpoint", `api:${relative}#${endpoint}`, endpoint, 0.9, "regex-endpoint/1");
    }
  }
  const controllerMatch = Array.from(sourceContents.matchAll(/@Controller\s*\(\s*(?:["'`]([^"'`]*)["'`])?\s*\)/g)).find((m) => symbolContents[m.index] !== " ");
  if (controllerMatch) {
    const base = controllerMatch[1] ?? "";
    for (const match of sourceContents.matchAll(/@(Get|Post|Put|Patch|Delete)\s*\(\s*(?:["'`]([^"'`]*)["'`])?\s*\)/g)) {
      if (symbolContents[match.index] !== " ") {
        const joined = `/${[base, match[2] ?? ""].filter(Boolean).join("/")}`.replace(/\/{2,}/g, "/");
        const endpoint = `${match[1].toUpperCase()} ${joined}`;
        add("api-endpoint", `api:${relative}#${endpoint}`, endpoint, 0.9, "regex-endpoint/2");
      }
    }
  }
  if (sourceSemanticsEnabled && /\.java$/i.test(relative)) {
    const firstString = (argumentsText = "") => argumentsText.match(/["']([^"']*)["']/)?.[1] ?? "";
    let basePath = "";
    for (const classDeclaration of contents.matchAll(/((?:@[A-Za-z][\w.]*(?:\s*\([^)]*\))?\s*)*)\b(?:public\s+)?(?:abstract\s+|final\s+)?class\s+([A-Z][A-Za-z0-9_]*)/g)) {
      if (symbolContents[classDeclaration.index] !== " ") {
        const classAnnotations = classDeclaration[1] ?? "";
        const className = classDeclaration[2] ?? null;
        if (!basePath) basePath = firstString(classAnnotations.match(/@RequestMapping\s*\(([^)]*)\)/s)?.[1]);
        if (className && /@(?:jakarta\.persistence\.)?Entity\b/.test(classAnnotations)) {
          add("domain-entity", `domain-entity:${relative}#${className}`, className, 0.95, "regex-java/1");
        }
      }
    }
    for (const match of contents.matchAll(/@(Get|Post|Put|Patch|Delete)Mapping\s*(?:\(([^)]*)\))?/g)) {
      if (symbolContents[match.index] !== " ") {
        const localPath = firstString(match[2]);
        const joined = `/${[basePath, localPath].filter(Boolean).map((part) => part.replace(/^\/+|\/+$/g, "")).join("/")}`.replace(/\/{2,}/g, "/");
        const endpoint = `${match[1].toUpperCase()} ${joined}`;
        add("api-endpoint", `api:${relative}#${endpoint}`, endpoint, 0.9, "regex-java/1");
      }
    }
    for (const match of contents.matchAll(/@RequestMapping\s*\(([^)]*\bmethod\s*=\s*RequestMethod\.(GET|POST|PUT|PATCH|DELETE)[^)]*)\)/g)) {
      if (symbolContents[match.index] !== " ") {
        const localPath = firstString(match[1]);
        const joined = `/${[basePath, localPath].filter(Boolean).map((part) => part.replace(/^\/+|\/+$/g, "")).join("/")}`.replace(/\/{2,}/g, "/");
        const endpoint = `${match[2]} ${joined}`;
        add("api-endpoint", `api:${relative}#${endpoint}`, endpoint, 0.85, "regex-java/1");
      }
    }
  }
  return records.map((record) => ({ ...record, repository_id: repositoryId }));
}

function resolveImport(fromPath, source, paths) {
  if (!source.startsWith(".")) return null;
  const base = normalPath(path.posix.normalize(path.posix.join(path.posix.dirname(fromPath), source)));
  const candidates = [
    base,
    `${base}.js`, `${base}.jsx`, `${base}.ts`, `${base}.tsx`, `${base}.astro`, `${base}.json`,
    `${base}.css`, `${base}.scss`, `${base}.sass`, `${base}.less`,
    `${base}/index.js`, `${base}/index.ts`, `${base}/index.tsx`, `${base}/index.astro`,
    `${base}/index.css`, `${base}/index.scss`, `${base}/index.sass`, `${base}/index.less`
  ];
  return candidates.find((candidate) => paths.has(candidate)) ?? null;
}

function asAsset(row) {
  return {
    schema_version: GRAPH_VERSION,
    asset_id: row.asset_id,
    repository_id: row.repository_id,
    component_id: row.component_id,
    kind: row.kind,
    logical_key: row.logical_key,
    path: row.path,
    symbol: row.symbol,
    content_sha256: row.content_sha256,
    basis_package_identity: row.basis_package_identity,
    extractor: row.extractor,
    confidence: row.confidence,
    evidence_status: row.evidence_status,
    first_seen_scan_id: row.first_seen_scan_id,
    last_seen_scan_id: row.last_seen_scan_id,
    state: row.state
  };
}

function asEdge(row) {
  return {
    schema_version: GRAPH_VERSION,
    edge_id: row.edge_id,
    repository_id: row.repository_id,
    from_asset_id: row.from_asset_id,
    relation: row.relation,
    to_asset_id: row.to_asset_id,
    qualifier: JSON.parse(row.qualifier_json),
    source_path: row.source_path,
    extractor: row.extractor,
    confidence: row.confidence,
    evidence_status: row.evidence_status,
    first_seen_scan_id: row.first_seen_scan_id,
    last_seen_scan_id: row.last_seen_scan_id,
    state: row.state
  };
}

function asScan(row) {
  return {
    schema_version: GRAPH_VERSION,
    scan_id: row.scan_id,
    repository_id: row.repository_id,
    root: row.root,
    mode: row.mode,
    basis: JSON.parse(row.basis_json),
    scope: JSON.parse(row.scope_json),
    exclusions: JSON.parse(row.exclusions_json),
    extractor_versions: JSON.parse(row.extractor_versions_json),
    status: row.status,
    started_at: row.started_at,
    completed_at: row.completed_at,
    coverage: row.coverage_json ? JSON.parse(row.coverage_json) : null,
    snapshot_sha256: row.snapshot_sha256
  };
}

function asIssue(row) {
  return {
    schema_version: GRAPH_VERSION,
    issue_id: row.issue_id,
    repository_id: row.repository_id,
    scan_id: row.scan_id,
    issue_type: row.issue_type,
    severity: row.severity,
    path: row.path,
    detail: JSON.parse(row.detail_json),
    status: row.status
  };
}

function snapshotHashContent(records) {
  return {
    assets: records.assets.map(({ first_seen_scan_id, last_seen_scan_id, ...asset }) => asset),
    edges: records.edges.map(({ first_seen_scan_id, last_seen_scan_id, ...edge }) => edge),
    issues: records.issues.map(({ issue_id, scan_id, ...issue }) => issue),
    tombstones: records.tombstones.map(({ deleted_scan_id, ...tombstone }) => tombstone),
    authority_claims: records.authority_claims.map(({ scan_id, ...claim }) => claim)
    ,authority_approvals: (records.authority_approvals ?? []).map((approval) => approval)
  };
}

function snapshotRefs(records) {
  const scanIds = new Set();
  for (const asset of records.assets) { scanIds.add(asset.first_seen_scan_id); scanIds.add(asset.last_seen_scan_id); }
  for (const edge of records.edges) { scanIds.add(edge.first_seen_scan_id); scanIds.add(edge.last_seen_scan_id); }
  for (const issue of records.issues) scanIds.add(issue.scan_id);
  for (const tombstone of records.tombstones) scanIds.add(tombstone.deleted_scan_id);
  for (const claim of records.authority_claims) scanIds.add(claim.scan_id);
  return {
    scan_ids: [...scanIds].filter(Boolean).sort(),
    assets: records.assets.map((record) => record.asset_id).sort(),
    edges: records.edges.map((record) => record.edge_id).sort(),
    issues: records.issues.map((record) => record.issue_id).sort(),
    tombstones: records.tombstones.map((record) => record.asset_id).sort(),
    authority_claims: records.authority_claims.map((record) => record.claim_id).sort()
    ,authority_approvals: (records.authority_approvals ?? []).map((record) => record.approval_id).sort()
  };
}

function prepareImportJsonl(contents) {
  const records = String(contents).split(/\r?\n/).filter(Boolean).map((line, index) => {
    let record;
    try { record = JSON.parse(line); } catch { throw error(`invalid JSONL at line ${index + 1}`, "GRAPH_IMPORT_JSON_INVALID"); }
    assert(record.schema_version === GRAPH_VERSION, `unsupported record version at line ${index + 1}`, "GRAPH_IMPORT_VERSION_INVALID");
    assert(record.payload_sha256 === hash(record.payload), `payload hash mismatch at line ${index + 1}`, "GRAPH_IMPORT_HASH_MISMATCH");
    return record.payload;
  });
  const manifests = records.filter((record) => record.record_type === "snapshot_manifest").map((record) => record.value);
  const historical = manifests.find((manifest) => manifest.scan_id);
  const scans = records.filter((record) => record.record_type === "scan");
  if (historical) {
    assert(manifests.length === 1, "historical JSONL must contain exactly one snapshot manifest", "GRAPH_SNAPSHOT_MANIFEST_INVALID");
    assert(scans.some((record) => record.value.scan_id === historical.scan_id), `snapshot scan record missing: ${historical.scan_id}`, "GRAPH_SNAPSHOT_REF_MISSING");
  }
  return { records, manifests, historical, scans };
}

function validateImportSnapshotManifest(manifest, records, authorizeApproval) {
  assert(manifest && typeof manifest === "object", "snapshot manifest is required", "GRAPH_SNAPSHOT_MANIFEST_INVALID");
  const values = Object.fromEntries(["scan", "asset", "edge", "issue", "tombstone", "authority_claim", "authority_approval"].map((type) => [type, records.filter((record) => record.record_type === type).map((record) => record.value)]));
  const recordsForSnapshot = {
    assets: values.asset,
    edges: values.edge,
    issues: values.issue,
    tombstones: values.tombstone,
    authority_claims: values.authority_claim
    ,authority_approvals: values.authority_approval
  };
  if (authorizeApproval) for (const approval of recordsForSnapshot.authority_approvals ?? []) assert(authorizeApproval(approval) === true, `imported authority approval is not trusted by the host: ${approval.approval_id}`, "GRAPH_IMPORT_AUTHORITY_APPROVAL_UNTRUSTED");
  assert(manifest.snapshot_sha256 === hash(snapshotHashContent(recordsForSnapshot)), "snapshot manifest hash mismatch", "GRAPH_SNAPSHOT_HASH_MISMATCH");
  assert(canonicalJson(manifest.refs) === canonicalJson(snapshotRefs(recordsForSnapshot)), "snapshot manifest references mismatch", "GRAPH_SNAPSHOT_REFS_MISMATCH");
  for (const [key, count] of Object.entries(manifest.record_counts ?? {})) assert(count === (recordsForSnapshot[key]?.length ?? 0), `snapshot manifest count mismatch: ${key}`, "GRAPH_SNAPSHOT_REFS_MISMATCH");
  if (!manifest.scan_id) return { recordsForSnapshot };
  const scan = values.scan.find((value) => value.scan_id === manifest.scan_id);
  assert(scan, `snapshot scan record missing: ${manifest.scan_id}`, "GRAPH_SNAPSHOT_REF_MISSING");
  assert(scan.repository_id === manifest.repository_id, `snapshot repository mismatch: ${manifest.scan_id}`, "GRAPH_SNAPSHOT_REPOSITORY_MISMATCH");
  for (const scanId of manifest.refs.scan_ids ?? []) assert(values.scan.some((value) => value.scan_id === scanId), `snapshot lineage scan missing: ${scanId}`, "GRAPH_SNAPSHOT_REF_MISSING");
  return { recordsForSnapshot, scan };
}

// Input-only preflight. Destination references/conflicts and host authorization
// still belong to the actual import transaction, not to this read-only check.
export function preflightGraphImportJsonl(contents) {
  const { records, manifests } = prepareImportJsonl(contents);
  for (const manifest of manifests) validateImportSnapshotManifest(manifest, records);
}

export class RepositoryGraphStore {
  constructor({ filename = ":memory:", db, now = Date.now, readOnly = false, authorizeAuthorityApproval = () => ({ granted: false, receipt: "host:not-authorized" }), authorizeImportedAuthorityApproval = () => false } = {}) {
    if (filename !== ":memory:" && !filename.startsWith("file:")) mkdirSync(path.dirname(path.resolve(filename)), { recursive: true });
    this.db = db ?? new DatabaseSync(filename, { readOnly });
    this.now = now;
    this.readOnly = readOnly;
    this.filename = filename;
    this.authorizeAuthorityApproval = authorizeAuthorityApproval;
    this.authorizeImportedAuthorityApproval = authorizeImportedAuthorityApproval;
    if (readOnly) {
      const required = new Set(["scans", "scan_snapshots", "assets", "edges", "issues", "tombstones", "authority_claims"]);
      const present = new Set(this.db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all().map((row) => row.name));
      assert([...required].every((table) => present.has(table)), "file is not a valid Repository Asset Graph database", "GRAPH_DB_INVALID");
      this.db.exec("PRAGMA foreign_keys = ON;");
      return;
    }
    this.db.exec(`
      PRAGMA foreign_keys = ON;
      CREATE TABLE IF NOT EXISTS scans (
        scan_id TEXT PRIMARY KEY, repository_id TEXT NOT NULL, root TEXT NOT NULL,
        mode TEXT NOT NULL, basis_json TEXT NOT NULL, scope_json TEXT NOT NULL,
        exclusions_json TEXT NOT NULL, extractor_versions_json TEXT NOT NULL,
        status TEXT NOT NULL, started_at TEXT NOT NULL, completed_at TEXT,
        coverage_json TEXT, snapshot_sha256 TEXT
      );
      CREATE TABLE IF NOT EXISTS scan_snapshots (
        scan_id TEXT PRIMARY KEY,
        repository_id TEXT NOT NULL,
        snapshot_sha256 TEXT NOT NULL,
        refs_json TEXT NOT NULL,
        package_json TEXT NOT NULL,
        FOREIGN KEY(scan_id) REFERENCES scans(scan_id)
      );
      CREATE TABLE IF NOT EXISTS assets (
        asset_id TEXT PRIMARY KEY, repository_id TEXT NOT NULL, component_id TEXT,
        kind TEXT NOT NULL, logical_key TEXT NOT NULL, path TEXT NOT NULL, symbol TEXT,
        content_sha256 TEXT NOT NULL, basis_package_identity TEXT NOT NULL,
        extractor TEXT NOT NULL, confidence REAL NOT NULL, evidence_status TEXT NOT NULL,
        first_seen_scan_id TEXT NOT NULL, last_seen_scan_id TEXT NOT NULL,
        state TEXT NOT NULL, UNIQUE(repository_id, kind, logical_key)
      );
      CREATE TABLE IF NOT EXISTS edges (
        edge_id TEXT PRIMARY KEY, repository_id TEXT NOT NULL, from_asset_id TEXT NOT NULL,
        relation TEXT NOT NULL, to_asset_id TEXT, qualifier_json TEXT NOT NULL,
        source_path TEXT NOT NULL, extractor TEXT NOT NULL, confidence REAL NOT NULL,
        evidence_status TEXT NOT NULL, first_seen_scan_id TEXT NOT NULL,
        last_seen_scan_id TEXT NOT NULL, state TEXT NOT NULL,
        FOREIGN KEY(from_asset_id) REFERENCES assets(asset_id),
        FOREIGN KEY(to_asset_id) REFERENCES assets(asset_id)
      );
      CREATE TABLE IF NOT EXISTS issues (
        issue_id TEXT PRIMARY KEY, repository_id TEXT NOT NULL, scan_id TEXT NOT NULL,
        issue_type TEXT NOT NULL, severity TEXT NOT NULL, path TEXT,
        detail_json TEXT NOT NULL, status TEXT NOT NULL,
        FOREIGN KEY(scan_id) REFERENCES scans(scan_id)
      );
      CREATE TABLE IF NOT EXISTS tombstones (
        asset_id TEXT PRIMARY KEY, repository_id TEXT NOT NULL, deleted_scan_id TEXT NOT NULL,
        last_record_json TEXT NOT NULL, reason TEXT NOT NULL,
        FOREIGN KEY(asset_id) REFERENCES assets(asset_id),
        FOREIGN KEY(deleted_scan_id) REFERENCES scans(scan_id)
      );
      CREATE TABLE IF NOT EXISTS authority_claims (
        claim_id TEXT PRIMARY KEY, repository_id TEXT NOT NULL, semantic_scope TEXT NOT NULL,
        authority_kind TEXT NOT NULL, asset_id TEXT NOT NULL, role TEXT NOT NULL,
        content_sha256 TEXT NOT NULL, scan_id TEXT NOT NULL, state TEXT NOT NULL,
        UNIQUE(repository_id, semantic_scope, authority_kind, asset_id),
        FOREIGN KEY(asset_id) REFERENCES assets(asset_id),
        FOREIGN KEY(scan_id) REFERENCES scans(scan_id)
      );
      CREATE TABLE IF NOT EXISTS authority_approvals (
        approval_id TEXT PRIMARY KEY, repository_id TEXT NOT NULL, authority_kind TEXT NOT NULL,
        content_sha256 TEXT NOT NULL, approver_id TEXT NOT NULL, approver_role TEXT NOT NULL,
        approved_at TEXT NOT NULL, authorization_receipt TEXT NOT NULL, UNIQUE(repository_id, authority_kind, content_sha256)
      );
      CREATE INDEX IF NOT EXISTS idx_assets_query ON assets(repository_id, kind, state, path);
      CREATE INDEX IF NOT EXISTS idx_edges_from ON edges(from_asset_id, relation, state);
      CREATE INDEX IF NOT EXISTS idx_edges_to ON edges(to_asset_id, relation, state);
      CREATE INDEX IF NOT EXISTS idx_issues_scan ON issues(scan_id, status);
      CREATE INDEX IF NOT EXISTS idx_scan_snapshots_repository ON scan_snapshots(repository_id, scan_id);
    `);
  }

  close() {
    this.db.close();
  }

  _transaction(callback) {
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const result = callback();
      this.db.exec("COMMIT");
      return result;
    } catch (cause) {
      this.db.exec("ROLLBACK");
      throw cause;
    }
  }

  registerAuthorityApproval({ repository_id, authority_kind, content_sha256, approver_id, approver_role = "authority-owner", approved_at = nowIso(this.now) } = {}) {
    assert(repository_id && authority_kind && /^[0-9a-f]{64}$/.test(content_sha256 ?? "") && approver_id, "authority approval fields are required", "GRAPH_AUTHORITY_APPROVAL_INVALID");
    const authorization = this.authorizeAuthorityApproval({ repository_id, authority_kind, content_sha256, approver_id, approver_role });
    assert(authorization?.granted === true && typeof authorization.receipt === "string" && authorization.receipt.length > 0, "authority approval requires a host-authorized human decision receipt", "GRAPH_AUTHORITY_APPROVAL_UNAUTHORIZED");
    const approvalId = id("approval", { repository_id, authority_kind, content_sha256, approver_id });
    this.db.prepare("INSERT INTO authority_approvals VALUES (?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(repository_id, authority_kind, content_sha256) DO UPDATE SET approver_id=excluded.approver_id, approver_role=excluded.approver_role, approved_at=excluded.approved_at, authorization_receipt=excluded.authorization_receipt")
      .run(approvalId, repository_id, authority_kind, content_sha256, approver_id, approver_role, approved_at, authorization.receipt);
    return { approval_id: approvalId, repository_id, authority_kind, content_sha256, approver_id, approver_role, approved_at, authorization_receipt: authorization.receipt };
  }

  scan({ root = process.cwd(), repository_id, component_id = null, scope = ["**"], exclusions = DEFAULT_EXCLUSIONS, mode = "full", authority_requirements = [] } = {}) {
    assert(["full", "incremental"].includes(mode), `unsupported scan mode: ${mode}`, "GRAPH_SCAN_MODE_INVALID");
    const gitRootPath = repositoryGitRoot(root);
    const resolvedRoot = gitRootPath ?? path.resolve(root);
    const repositoryId = repositoryIdentity(resolvedRoot, repository_id);
    const scanBasis = basis(resolvedRoot, gitRootPath !== null);
    assert(Array.isArray(scope) && scope.length > 0, "scan scope must be a non-empty array", "GRAPH_SCAN_SCOPE_INVALID");
    const validatePattern = (value, label) => assert(typeof value === "string" && value.length > 0 && !path.isAbsolute(value) && !value.startsWith("~") && !/^[A-Za-z]:[\\/]/.test(value) && !value.includes("\\") && !value.split("/").includes(".."), `${label} escapes repository root: ${value}`, "GRAPH_SCAN_SCOPE_ESCAPE");
    for (const value of scope) validatePattern(value, "scan scope");
    assert(Array.isArray(exclusions), "scan exclusions must be an array", "GRAPH_SCAN_SCOPE_INVALID");
    for (const value of exclusions) validatePattern(value, "scan exclusion");
    const storeExclusions = [...exclusions.map(normalPath)];
    if (this.filename !== ":memory:" && !this.filename.startsWith("file:")) {
      const storeRelative = normalPath(path.relative(resolvedRoot, path.resolve(this.filename)));
      if (storeRelative && !storeRelative.startsWith("../") && !path.isAbsolute(storeRelative)) {
        storeExclusions.push(storeRelative, `${storeRelative}-wal`, `${storeRelative}-shm`);
      }
    }
    // In a Git repository, only the index's tracked files are graph inputs.
    // Non-Git fixtures retain the deterministic filesystem fallback.
    const rawEnumerated = trackedFiles(resolvedRoot, storeExclusions) ?? walk(resolvedRoot, storeExclusions);
    const enumerated = rawEnumerated.map((entry) => ({ ...entry, excluded: storeExclusions.some((excluded) => entry.path === excluded || entry.path.startsWith(`${excluded}/`)) }));
    const files = enumerated.filter((entry) => !entry.excluded && scopeMatches(entry.path, scope));
    const readableFiles = files.filter((entry) => !entry.issue);
    const filePaths = new Set(readableFiles.map((entry) => entry.path));
    const fileInputs = readableFiles.map((entry) => {
      const { absolute } = safeRelative(resolvedRoot, entry.path);
      const bytes = readFileSync(absolute);
      return { entry, bytes, contentHash: hash(bytes) };
    });
    scanBasis.scope_content_sha256 = hash(fileInputs.map(({ entry, contentHash }) => ({ path: entry.path, sha256: contentHash })));
    scanBasis.package_identity = hash({ ...scanBasis, scope, exclusions });
    const extractorVersions = ["file-inventory/1", "path-route/2", "vue-router-static/3", "path-component/1", "regex-symbol/2", "regex-endpoint/2", "regex-java/1", "regex-edge/1", "dynamic-import-coverage/1"];
    const scanId = id("scan", { repositoryId, scanBasis, scope, exclusions, extractorVersions, occurrence: randomUUID() });
    const startedAt = nowIso(this.now);
    const allExisting = this.db.prepare("SELECT * FROM assets WHERE repository_id = ?").all(repositoryId);
    const existing = allExisting.filter((asset) => asset.state === "active");
    const knownPaths = new Set([...filePaths, ...existing.map((asset) => asset.path)]);
    const existingByIdentity = new Map(allExisting.map((row) => [`${row.kind}\0${row.logical_key}`, row]));
    const renameCandidates = new Map();
    const renameCandidatesByContent = new Map();
    for (const row of existing) {
      const key = `${row.kind}\0${row.content_sha256}\0${row.symbol ?? ""}`;
      const values = renameCandidates.get(key) ?? [];
      values.push(row);
      renameCandidates.set(key, values);
      const contentKey = `${row.kind}\0${row.content_sha256}`;
      const contentValues = renameCandidatesByContent.get(contentKey) ?? [];
      contentValues.push(row);
      renameCandidatesByContent.set(contentKey, contentValues);
    }
    const assetRecords = [];
    const assetRecordIdentities = new Set();
    const pendingIssues = [];
    const contentsByPath = new Map();
    const addAsset = (record) => {
      assert(ASSET_KINDS.has(record.kind), `unsupported asset kind: ${record.kind}`, "GRAPH_ASSET_KIND_INVALID");
      const identity = `${record.kind}\0${record.logical_key}`;
      if (assetRecordIdentities.has(identity)) {
        pendingIssues.push({ issue_type: "DUPLICATE_LOGICAL_ASSET", severity: "error", path: record.path, detail: { kind: record.kind, logical_key: record.logical_key } });
        return;
      }
      assetRecordIdentities.add(identity);
      const current = existingByIdentity.get(identity);
      let assetId = current?.asset_id;
      let matchedRename = false;
      if (!assetId) {
        let candidates = renameCandidates.get(`${record.kind}\0${record.content_sha256}\0${record.symbol ?? ""}`)?.filter((candidate) => scopeMatches(candidate.path, scope) && !filePaths.has(candidate.path)) ?? [];
        if (candidates.length !== 1) candidates = renameCandidatesByContent.get(`${record.kind}\0${record.content_sha256}`)?.filter((candidate) => scopeMatches(candidate.path, scope) && !filePaths.has(candidate.path)) ?? [];
        if (candidates.length === 1) { assetId = candidates[0].asset_id; matchedRename = true; }
      }
      assetId ??= id("asset", { repositoryId, kind: record.kind, logicalKey: record.logical_key, firstContent: record.content_sha256 });
      const occupied = this.db.prepare("SELECT kind, logical_key FROM assets WHERE asset_id = ?").get(assetId);
      if (!matchedRename && occupied && (occupied.kind !== record.kind || occupied.logical_key !== record.logical_key)) {
        assetId = id("asset", { repositoryId, kind: record.kind, logicalKey: record.logical_key, firstContent: record.content_sha256, firstScan: scanId });
      }
      assetRecords.push({
        schema_version: GRAPH_VERSION, asset_id: assetId, repository_id: repositoryId,
        component_id: record.component_id ?? component_id, kind: record.kind,
        logical_key: record.logical_key, path: record.path, symbol: record.symbol ?? null,
        content_sha256: record.content_sha256, basis_package_identity: scanBasis.package_identity,
        extractor: record.extractor, confidence: record.confidence,
        evidence_status: record.evidence_status ?? "source-resolved",
        first_seen_scan_id: current?.first_seen_scan_id ?? scanId,
        last_seen_scan_id: scanId, state: "active"
      });
    };

    for (const { entry, bytes, contentHash } of fileInputs) {
      let contents = "";
      if (isTextFile(entry.path) && bytes.byteLength <= 2_000_000) {
        contents = bytes.toString("utf8");
        contentsByPath.set(entry.path, contents);
      }
      addAsset({ kind: fileKind(entry.path), logical_key: `file:${entry.path}`, path: entry.path, content_sha256: contentHash, extractor: "file-inventory/1", confidence: 1 });
      for (const record of symbolAssets(repositoryId, entry.path, contents, contentHash, pendingIssues)) addAsset(record);
    }

    return this._transaction(() => {
      this.db.prepare("INSERT INTO scans (scan_id, repository_id, root, mode, basis_json, scope_json, exclusions_json, extractor_versions_json, status, started_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'running', ?)")
        .run(scanId, repositoryId, ".", mode, canonicalJson(scanBasis), canonicalJson(scope), canonicalJson(exclusions), canonicalJson(extractorVersions), startedAt);
      for (const row of existing.filter((asset) => scopeMatches(asset.path, scope))) {
        this.db.prepare("UPDATE assets SET state = 'stale' WHERE asset_id = ?").run(row.asset_id);
      }
      for (const row of this.db.prepare("SELECT edge_id, source_path FROM edges WHERE repository_id = ? AND state = 'active'").all(repositoryId).filter((edge) => scopeMatches(edge.source_path, scope))) {
        this.db.prepare("UPDATE edges SET state = 'stale' WHERE edge_id = ?").run(row.edge_id);
      }
      for (const row of this.db.prepare("SELECT claim_id, asset_id FROM authority_claims WHERE repository_id = ? AND state = 'active'").all(repositoryId)) {
        const asset = this.db.prepare("SELECT path FROM assets WHERE asset_id = ?").get(row.asset_id);
        if (asset && scopeMatches(asset.path, scope)) this.db.prepare("UPDATE authority_claims SET state = 'stale' WHERE claim_id = ?").run(row.claim_id);
      }
      for (const row of this.db.prepare("SELECT issue_id, issue_type, path FROM issues WHERE repository_id = ? AND status = 'active'").all(repositoryId)) {
        if ((row.path && scopeMatches(row.path, scope)) || (row.issue_type === "AUTHORITY_CONFLICT" && scopeMatches("DESIGN.md", scope))) {
          this.db.prepare("DELETE FROM issues WHERE issue_id = ?").run(row.issue_id);
        }
      }

      const upsertAsset = this.db.prepare(`INSERT INTO assets
        (asset_id, repository_id, component_id, kind, logical_key, path, symbol, content_sha256,
         basis_package_identity, extractor, confidence, evidence_status, first_seen_scan_id, last_seen_scan_id, state)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(asset_id) DO UPDATE SET component_id=excluded.component_id, kind=excluded.kind,
        logical_key=excluded.logical_key, path=excluded.path, symbol=excluded.symbol,
        content_sha256=excluded.content_sha256, basis_package_identity=excluded.basis_package_identity,
        extractor=excluded.extractor, confidence=excluded.confidence,
        evidence_status=excluded.evidence_status, last_seen_scan_id=excluded.last_seen_scan_id, state='active'`);
      for (const asset of assetRecords) {
        const identityCollision = this.db.prepare("SELECT asset_id FROM assets WHERE repository_id = ? AND kind = ? AND logical_key = ? AND asset_id != ?").get(repositoryId, asset.kind, asset.logical_key, asset.asset_id);
        assert(!identityCollision, `asset logical identity collision: ${asset.kind}:${asset.logical_key}`, "GRAPH_ASSET_IDENTITY_CONFLICT");
        upsertAsset.run(asset.asset_id, asset.repository_id, asset.component_id, asset.kind, asset.logical_key, asset.path, asset.symbol, asset.content_sha256, asset.basis_package_identity, asset.extractor, asset.confidence, asset.evidence_status, asset.first_seen_scan_id, asset.last_seen_scan_id, asset.state);
      }

      const activeByPath = new Map();
      for (const row of this.db.prepare("SELECT * FROM assets WHERE repository_id = ? AND state = 'active'").all(repositoryId)) {
        const values = activeByPath.get(row.path) ?? [];
        values.push(row);
        activeByPath.set(row.path, values);
      }
      const edgeRecords = [];
      const addEdge = ({ from, relation, to = null, qualifier = {}, sourcePath, confidence = 0.8, extractor = "regex-edge/1", evidenceStatus = "source-resolved" }) => {
        assert(EDGE_KINDS.has(relation), `unsupported edge kind: ${relation}`, "GRAPH_EDGE_KIND_INVALID");
        const edgeId = id("edge", { repositoryId, from, relation, to, qualifier, sourcePath });
        edgeRecords.push({ edge_id: edgeId, repository_id: repositoryId, from_asset_id: from, relation, to_asset_id: to, qualifier_json: canonicalJson(qualifier), source_path: sourcePath, extractor, confidence, evidence_status: evidenceStatus, first_seen_scan_id: scanId, last_seen_scan_id: scanId, state: "active" });
      };
      for (const [relative, contents] of contentsByPath) {
        const fileAsset = activeByPath.get(relative)?.find((row) => row.logical_key === `file:${relative}`);
        if (!fileAsset) continue;
        const dynamicCandidates = /\.[cm]?[jt]sx?$/i.test(relative) ? dynamicImportCandidateCount(contents) : 0;
        if (dynamicCandidates) pendingIssues.push({
          issue_type: "DYNAMIC_IMPORT_COVERAGE_UNKNOWN", severity: "warning", path: relative,
          detail: { extractor: "dynamic-import-coverage/1", candidate_count: dynamicCandidates,
            reason: "raw dynamic-import candidates are not parsed; executable, computed and text-only occurrences remain unknown" }
        });
        for (const record of extractVueRouterRoutes(contents)) {
          const routeAsset = activeByPath.get(relative)?.find((row) => row.logical_key === `vue-route:${relative}#${record.key}`);
          if (!routeAsset) continue;
          const parent = record.parent_key === null ? fileAsset : activeByPath.get(relative)?.find((row) => row.logical_key === `vue-route:${relative}#${record.parent_key}`);
          if (parent) addEdge({ from: parent.asset_id, relation: "registers", to: routeAsset.asset_id, sourcePath: relative, confidence: 0.95, extractor: "vue-router-static/3" });
          if (record.component_source) {
            const source = record.component_source;
            const srcMarker = relative.lastIndexOf("/src/");
            const srcRoot = srcMarker >= 0 ? relative.slice(0, srcMarker + 4) : relative.startsWith("src/") ? "src" : null;
            const aliasTarget = source.startsWith("@/") && srcRoot
              ? normalPath(`${srcRoot}/${source.slice(2)}`)
              : null;
            const targetPath = aliasTarget && filePaths.has(aliasTarget) ? aliasTarget : resolveImport(relative, source, knownPaths);
            const target = targetPath ? activeByPath.get(targetPath)?.find((row) => row.logical_key === `file:${targetPath}`) : null;
            addEdge({ from: routeAsset.asset_id, relation: "imports", to: target?.asset_id ?? null,
              qualifier: { source }, sourcePath: relative, confidence: target ? 0.95 : 0.4,
              extractor: "vue-router-static/3", evidenceStatus: target ? "source-resolved" : "unresolved" });
          }
        }
        const importNames = new Map();
        for (const match of contents.matchAll(/import\s+(?:([^;]+?)\s+from\s+)?["'`]([^"'`]+)["'`]/g)) {
          const targetPath = resolveImport(relative, match[2], knownPaths);
          if (match[1] && targetPath) {
            for (const name of match[1].match(/[A-Z][A-Za-z0-9_]*/g) ?? []) importNames.set(name, targetPath);
          }
          if (targetPath) {
            const target = activeByPath.get(targetPath)?.find((row) => row.logical_key === `file:${targetPath}`);
            if (target) addEdge({ from: fileAsset.asset_id, relation: "imports", to: target.asset_id, qualifier: { source: match[2] }, sourcePath: relative });
          } else if (match[2].startsWith(".")) {
            addEdge({ from: fileAsset.asset_id, relation: "imports", qualifier: { source: match[2] }, sourcePath: relative, confidence: 0.4, evidenceStatus: "unresolved" });
          }
        }
        const page = activeByPath.get(relative)?.find((row) => row.kind === "page");
        if (page) {
          const route = activeByPath.get(relative)?.find((row) => row.kind === "route");
          if (route) addEdge({ from: page.asset_id, relation: "registers", to: route.asset_id, sourcePath: relative, confidence: 1, extractor: "path-route/1" });
          for (const name of contents.matchAll(/<([A-Z][A-Za-z0-9_]*)\b/g)) {
            const targetPath = importNames.get(name[1]);
            const target = targetPath ? activeByPath.get(targetPath)?.find((row) => row.kind === "ui-component") : null;
            if (target) addEdge({ from: page.asset_id, relation: "renders", to: target.asset_id, qualifier: { symbol: name[1] }, sourcePath: relative, confidence: 0.9 });
          }
        }
      }
      const upsertEdge = this.db.prepare(`INSERT INTO edges
        (edge_id, repository_id, from_asset_id, relation, to_asset_id, qualifier_json, source_path,
         extractor, confidence, evidence_status, first_seen_scan_id, last_seen_scan_id, state)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(edge_id) DO UPDATE SET to_asset_id=excluded.to_asset_id,
        qualifier_json=excluded.qualifier_json, confidence=excluded.confidence,
        evidence_status=excluded.evidence_status, last_seen_scan_id=excluded.last_seen_scan_id, state='active'`);
      for (const edge of edgeRecords) upsertEdge.run(...Object.values(edge));

      for (const entry of files.filter((item) => item.issue)) {
        const reasons = {
          SYMLINK_SKIPPED: "symbolic links are excluded from scans",
          GITLINK_SKIPPED: "gitlinks are recorded as coverage gaps and are not traversed",
          TRACKED_FILE_MISSING: "tracked file is missing from worktree",
          FILE_STAT_ERROR: "file metadata could not be read"
        };
        const issue = { issue_type: entry.issue, severity: "warning", path: entry.path, detail: { reason: reasons[entry.issue] ?? "file was not scanned", ...(entry.detail ? { error: entry.detail } : {}) } };
        this._insertIssue(repositoryId, scanId, issue);
      }
      for (const edge of edgeRecords.filter((record) => !record.to_asset_id)) {
        this._insertIssue(repositoryId, scanId, { issue_type: "UNRESOLVED_EDGE", severity: "warning", path: edge.source_path, detail: { edge_id: edge.edge_id, relation: edge.relation, qualifier: JSON.parse(edge.qualifier_json) } });
      }
      for (const issue of pendingIssues) this._insertIssue(repositoryId, scanId, issue);

      for (const row of this.db.prepare("SELECT * FROM assets WHERE repository_id = ? AND state = 'stale'").all(repositoryId)) {
        const record = asAsset(row);
        this.db.prepare("INSERT INTO tombstones (asset_id, repository_id, deleted_scan_id, last_record_json, reason) VALUES (?, ?, ?, ?, 'not seen in current scan') ON CONFLICT(asset_id) DO UPDATE SET deleted_scan_id=excluded.deleted_scan_id, last_record_json=excluded.last_record_json")
          .run(row.asset_id, repositoryId, scanId, canonicalJson(record));
        this.db.prepare("UPDATE assets SET state = 'tombstoned', last_seen_scan_id = ? WHERE asset_id = ?").run(scanId, row.asset_id);
      }
      this.db.prepare("UPDATE edges SET state = 'tombstoned', last_seen_scan_id = ? WHERE repository_id = ? AND state = 'stale'").run(scanId, repositoryId);

      const designAssets = this.db.prepare("SELECT * FROM assets WHERE repository_id = ? AND state = 'active' AND lower(path) = 'design.md'").all(repositoryId);
      for (const design of designAssets) {
        const claimId = id("claim", { repositoryId, scope: "repository", kind: "shared-design", asset: design.asset_id });
        this.db.prepare("INSERT INTO authority_claims (claim_id, repository_id, semantic_scope, authority_kind, asset_id, role, content_sha256, scan_id, state) VALUES (?, ?, 'repository', 'shared-design', ?, 'candidate', ?, ?, 'active') ON CONFLICT(claim_id) DO UPDATE SET content_sha256=excluded.content_sha256, scan_id=excluded.scan_id, state='active'")
          .run(claimId, repositoryId, design.asset_id, design.content_sha256, scanId);
      }
      if (designAssets.length > 1) this._insertIssue(repositoryId, scanId, { issue_type: "AUTHORITY_CONFLICT", severity: "error", path: null, detail: { semantic_scope: "repository", authority_kind: "shared-design", asset_ids: designAssets.map((item) => item.asset_id) } });
      if (authority_requirements.includes("shared-design")) {
        if (designAssets.length === 0) this._insertIssue(repositoryId, scanId, { issue_type: "AUTHORITY_MISSING", severity: "error", path: "DESIGN.md", detail: { authority_kind: "shared-design" } });
        for (const design of designAssets) {
          const approval = this.db.prepare("SELECT * FROM authority_approvals WHERE repository_id = ? AND authority_kind = 'shared-design' AND content_sha256 = ?").get(repositoryId, design.content_sha256);
          if (!approval) this._insertIssue(repositoryId, scanId, { issue_type: "AUTHORITY_APPROVAL_MISSING", severity: "error", path: design.path, detail: { authority_kind: "shared-design", content_sha256: design.content_sha256 } });
          else this.db.prepare("UPDATE authority_claims SET role='approved' WHERE repository_id = ? AND authority_kind='shared-design' AND asset_id = ?").run(repositoryId, design.asset_id);
        }
      }

      const counts = this.db.prepare(`SELECT
        COUNT(*) AS discovered,
        SUM(CASE WHEN state='active' THEN 1 ELSE 0 END) AS active,
        SUM(CASE WHEN state='tombstoned' THEN 1 ELSE 0 END) AS tombstoned
        FROM assets WHERE repository_id = ?`).get(repositoryId);
      const unresolved = this.db.prepare("SELECT COUNT(*) AS count FROM issues WHERE scan_id = ? AND status = 'active'").get(scanId).count;
      const previousCompleted = this.db.prepare("SELECT scan_id, snapshot_sha256 FROM scans WHERE repository_id = ? AND status = 'completed' ORDER BY completed_at DESC, scan_id DESC LIMIT 1").get(repositoryId);
      const classifications = enumerated.map((entry) => {
        const state = entry.excluded ? "excluded" : !scopeMatches(entry.path, scope) ? "outside-scope" : entry.issue ? "error" : contentsByPath.has(entry.path) ? "parsed" : "inventory-only";
        return {
          path: entry.path,
          source: entry.source ?? "filesystem",
          state,
          ...(entry.issue ? { reason: entry.issue } : state === "inventory-only" && isTextFile(entry.path) ? { reason: "TEXT_SIZE_LIMIT_EXCEEDED" } : {})
        };
      });
      const coverage = {
        scope: { includes: scope, exclusions },
        files_discovered: enumerated.length,
        files_scanned: readableFiles.length,
        files_skipped: files.length - readableFiles.length,
        files_excluded: classifications.filter((entry) => entry.state === "excluded").length,
        files_outside_scope: classifications.filter((entry) => entry.state === "outside-scope").length,
        tracked_files: classifications.filter((entry) => entry.source === "tracked").length,
        untracked_files: classifications.filter((entry) => entry.source === "untracked").length,
        file_classification: classifications,
        parsed: contentsByPath.size,
        skipped: files.filter((entry) => entry.issue || !contentsByPath.has(entry.path)).length,
        error: files.filter((entry) => Boolean(entry.issue)).length,
        assets_seen: assetRecords.length,
        assets_active: Number(counts.active || 0),
        assets_tombstoned: Number(counts.tombstoned || 0),
        edges_active: Number(this.db.prepare("SELECT COUNT(*) AS count FROM edges WHERE repository_id = ? AND state = 'active'").get(repositoryId).count),
        edges_resolved: edgeRecords.filter((edge) => edge.to_asset_id).length,
        edges_unresolved: edgeRecords.filter((edge) => !edge.to_asset_id).length,
        edges_conflict: pendingIssues.filter((issue) => issue.issue_type.includes("CONFLICT") || issue.issue_type.includes("DUPLICATE")).length,
        issues_active: Number(unresolved),
        supported_extractors: extractorVersions,
        supported_asset_kinds: [...ASSET_KINDS].sort(),
        dynamic_behavior_gaps: ["runtime-only calls", "reflection", "generated code", "framework registrations not covered by active extractors"],
        previous_complete_scan_id: previousCompleted?.scan_id ?? null,
        completeness_claim: "scope-and-extractor-bounded"
      };
      const snapshotContent = this._liveRecords(repositoryId);
      const snapshotHash = hash(snapshotHashContent(snapshotContent));
      coverage.current_snapshot_matches_previous = previousCompleted ? previousCompleted.snapshot_sha256 === snapshotHash : null;
      const completedAt = nowIso(this.now);
      this.db.prepare("UPDATE scans SET status='completed', completed_at=?, coverage_json=?, snapshot_sha256=? WHERE scan_id=?")
        .run(completedAt, canonicalJson(coverage), snapshotHash, scanId);
      const scanRecord = asScan(this.db.prepare("SELECT * FROM scans WHERE scan_id = ?").get(scanId));
      const snapshotPackage = {
        schema_version: GRAPH_VERSION,
        scan: scanRecord,
        scan_id: scanId,
        repository_id: repositoryId,
        snapshot_sha256: snapshotHash,
        refs: snapshotRefs(snapshotContent),
        records: snapshotContent
      };
      this.db.prepare("INSERT INTO scan_snapshots (scan_id, repository_id, snapshot_sha256, refs_json, package_json) VALUES (?, ?, ?, ?, ?)")
        .run(scanId, repositoryId, snapshotHash, canonicalJson(snapshotPackage.refs), canonicalJson(snapshotPackage));
      return { scan_id: scanId, repository_id: repositoryId, root: ".", basis: scanBasis, coverage, snapshot_sha256: snapshotHash };
    });
  }

  _liveRecords(repository_id) {
    const where = repository_id ? " WHERE repository_id = ?" : "";
    const args = repository_id ? [repository_id] : [];
    return {
      assets: this.db.prepare(`SELECT * FROM assets${where} ORDER BY asset_id`).all(...args).map(asAsset),
      edges: this.db.prepare(`SELECT * FROM edges${where} ORDER BY edge_id`).all(...args).map(asEdge),
      issues: this.db.prepare(`SELECT * FROM issues${where} ORDER BY issue_id`).all(...args).map(asIssue),
      tombstones: this.db.prepare(`SELECT * FROM tombstones${where} ORDER BY asset_id`).all(...args).map((row) => ({
        asset_id: row.asset_id,
        repository_id: row.repository_id,
        deleted_scan_id: row.deleted_scan_id,
        last_record: JSON.parse(row.last_record_json),
        reason: row.reason
      })),
      authority_claims: this.db.prepare(`SELECT * FROM authority_claims${where} ORDER BY claim_id`).all(...args).map((row) => ({ ...row }))
      ,authority_approvals: this.db.prepare(`SELECT * FROM authority_approvals${where} ORDER BY approval_id`).all(...args).map((row) => ({ ...row }))
    };
  }

  _snapshotPackage(scan_id) {
    const row = this.db.prepare("SELECT repository_id, snapshot_sha256, refs_json, package_json FROM scan_snapshots WHERE scan_id = ?").get(scan_id);
    assert(row, `snapshot not found: ${scan_id}`, "GRAPH_SNAPSHOT_NOT_FOUND");
    const packageValue = JSON.parse(row.package_json);
    assert(packageValue.repository_id === row.repository_id && packageValue.snapshot_sha256 === row.snapshot_sha256, `snapshot hash metadata mismatch: ${scan_id}`, "GRAPH_SNAPSHOT_HASH_MISMATCH");
    assert(canonicalJson(packageValue.refs) === row.refs_json, `snapshot reference metadata mismatch: ${scan_id}`, "GRAPH_SNAPSHOT_REFS_MISMATCH");
    assert(hash(snapshotHashContent(packageValue.records)) === packageValue.snapshot_sha256, `snapshot content hash mismatch: ${scan_id}`, "GRAPH_SNAPSHOT_HASH_MISMATCH");
    assert(canonicalJson(snapshotRefs(packageValue.records)) === canonicalJson(packageValue.refs), `snapshot references mismatch: ${scan_id}`, "GRAPH_SNAPSHOT_REFS_MISMATCH");
    return packageValue;
  }

  _snapshotView(scan_id) {
    const packageValue = this._snapshotPackage(scan_id);
    const lineage = (packageValue.refs.scan_ids ?? [packageValue.scan_id]).map((id) => this.db.prepare("SELECT * FROM scans WHERE scan_id = ?").get(id)).filter(Boolean).map(asScan);
    return {
      schema_version: GRAPH_VERSION,
      scan_id: packageValue.scan_id,
      repository_id: packageValue.repository_id,
      snapshot_sha256: packageValue.snapshot_sha256,
      scans: lineage,
      ...packageValue.records
    };
  }

  _insertIssue(repositoryId, scanId, issue) {
    const issueId = id("issue", { repositoryId, scanId, type: issue.issue_type, path: issue.path, detail: issue.detail });
    const detailJson = canonicalJson(issue.detail);
    const existing = this.db.prepare("SELECT * FROM issues WHERE issue_id = ?").get(issueId);
    if (existing) {
      assert(existing.repository_id === repositoryId && existing.scan_id === scanId && existing.issue_type === issue.issue_type && existing.severity === issue.severity && existing.path === issue.path && existing.detail_json === detailJson, `issue identity collision: ${issueId}`, "GRAPH_ISSUE_ID_CONFLICT");
      return issueId;
    }
    this.db.prepare("INSERT INTO issues (issue_id, repository_id, scan_id, issue_type, severity, path, detail_json, status) VALUES (?, ?, ?, ?, ?, ?, ?, 'active')")
      .run(issueId, repositoryId, scanId, issue.issue_type, issue.severity, issue.path, detailJson);
    return issueId;
  }

  activeAssetCount({ repository_id, scan_id } = {}) {
    if (scan_id) {
      return this.snapshot({ repository_id, scan_id }).assets.reduce((count, asset) =>
        count + Number(asset.state === "active" && (!repository_id || asset.repository_id === repository_id)), 0);
    }
    const repositoryFilter = repository_id ? " AND repository_id = ?" : "";
    const args = repository_id ? [repository_id] : [];
    return this.db.prepare(`SELECT COUNT(*) AS count FROM assets WHERE state = 'active'${repositoryFilter}`).get(...args).count;
  }

  query({ repository_id, scan_id, kinds, path: pathFilter, symbol, text, state = "active", limit = 200 } = {}) {
    assert(Number.isInteger(limit) && limit > 0 && limit <= 5000, "query limit must be 1..5000", "GRAPH_QUERY_LIMIT_INVALID");
    if (scan_id) {
      const records = this._snapshotView(scan_id).assets;
      return records.filter((asset) =>
        (!repository_id || asset.repository_id === repository_id) &&
        (!kinds?.length || kinds.includes(asset.kind)) &&
        (!pathFilter || asset.path.includes(pathFilter)) &&
        (!symbol || asset.symbol === symbol) &&
        (!text || asset.path.includes(text) || asset.logical_key.includes(text) || String(asset.symbol ?? "").includes(text)) &&
        asset.state === state
      ).sort((left, right) => left.kind.localeCompare(right.kind) || left.path.localeCompare(right.path) || left.logical_key.localeCompare(right.logical_key)).slice(0, limit);
    }
    const filters = ["state = ?"];
    const args = [state];
    if (repository_id) { filters.push("repository_id = ?"); args.push(repository_id); }
    if (kinds?.length) { filters.push(`kind IN (${kinds.map(() => "?").join(",")})`); args.push(...kinds); }
    if (pathFilter) { filters.push("instr(path, ?) > 0"); args.push(String(pathFilter)); }
    if (symbol) { filters.push("symbol = ?"); args.push(symbol); }
    if (text) { filters.push("(instr(path, ?) > 0 OR instr(logical_key, ?) > 0 OR instr(COALESCE(symbol, ''), ?) > 0)"); args.push(...Array(3).fill(String(text))); }
    return this.db.prepare(`SELECT * FROM assets WHERE ${filters.join(" AND ")} ORDER BY kind, path, logical_key LIMIT ?`).all(...args, limit).map(asAsset);
  }

  edges({ repository_id, scan_id, from_asset_id, to_asset_id, relations, state = "active", limit = 1000 } = {}) {
    assert(Number.isInteger(limit) && limit > 0 && limit <= 10000, "edge limit must be 1..10000", "GRAPH_EDGE_LIMIT_INVALID");
    if (scan_id) {
      const records = this._snapshotView(scan_id).edges;
      return records.filter((edge) =>
        (!repository_id || edge.repository_id === repository_id) &&
        (!from_asset_id || edge.from_asset_id === from_asset_id) &&
        (!to_asset_id || edge.to_asset_id === to_asset_id) &&
        (!relations?.length || relations.includes(edge.relation)) &&
        edge.state === state
      ).sort((left, right) => left.relation.localeCompare(right.relation) || left.source_path.localeCompare(right.source_path)).slice(0, limit);
    }
    const filters = ["state = ?"];
    const args = [state];
    if (repository_id) { filters.push("repository_id = ?"); args.push(repository_id); }
    if (from_asset_id) { filters.push("from_asset_id = ?"); args.push(from_asset_id); }
    if (to_asset_id) { filters.push("to_asset_id = ?"); args.push(to_asset_id); }
    if (relations?.length) { filters.push(`relation IN (${relations.map(() => "?").join(",")})`); args.push(...relations); }
    return this.db.prepare(`SELECT * FROM edges WHERE ${filters.join(" AND ")} ORDER BY relation, source_path LIMIT ?`).all(...args, limit).map(asEdge);
  }

  impact(assetId, { scan_id, direction = "both", depth = 3, relations } = {}) {
    assert(["outbound", "inbound", "both"].includes(direction), "invalid impact direction", "GRAPH_IMPACT_DIRECTION_INVALID");
    assert(Number.isInteger(depth) && depth >= 0 && depth <= 20, "impact depth must be 0..20", "GRAPH_IMPACT_DEPTH_INVALID");
    const expansionEdges = (filter) => {
      const edges = this.edges({ scan_id, relations, ...filter, limit: 1001 });
      assert(edges.length <= 1000, "impact expansion exceeds 1000 edges per asset and direction; narrow relation filters or depth", "GRAPH_IMPACT_EDGE_LIMIT_EXCEEDED");
      return edges;
    };
    const historical = scan_id ? this._snapshotView(scan_id) : null;
    const root = historical
      ? historical.assets.find((asset) => asset.asset_id === assetId)
      : this.db.prepare("SELECT * FROM assets WHERE asset_id = ?").get(assetId);
    assert(root, `asset not found: ${assetId}`, "GRAPH_ASSET_NOT_FOUND");
    const visited = new Set([assetId]);
    let frontier = [assetId];
    const foundEdges = new Map();
    for (let level = 0; level < depth && frontier.length; level += 1) {
      const next = [];
      for (const current of frontier) {
        const candidates = [
          ...(direction !== "inbound" ? expansionEdges({ from_asset_id: current }) : []),
          ...(direction !== "outbound" ? expansionEdges({ to_asset_id: current }) : [])
        ];
        for (const edge of candidates) {
          foundEdges.set(edge.edge_id, edge);
          const neighbour = edge.from_asset_id === current ? edge.to_asset_id : edge.from_asset_id;
          if (neighbour && !visited.has(neighbour)) { visited.add(neighbour); next.push(neighbour); }
        }
      }
      frontier = next;
    }
    const assets = [...visited].map((current) => historical
      ? historical.assets.find((asset) => asset.asset_id === current)
      : this.db.prepare("SELECT * FROM assets WHERE asset_id = ?").get(current)).filter(Boolean).map((asset) => asset.asset_id ? (asset.schema_version ? asset : asAsset(asset)) : asset);
    return { schema_version: GRAPH_VERSION, root_asset_id: assetId, direction, depth, assets, edges: [...foundEdges.values()] };
  }

  issues({ repository_id, scan_id, status = "active" } = {}) {
    if (scan_id) return this._snapshotView(scan_id).issues.filter((issue) => (!repository_id || issue.repository_id === repository_id) && issue.status === status);
    const filters = ["status = ?"];
    const args = [status];
    if (repository_id) { filters.push("repository_id = ?"); args.push(repository_id); }
    if (scan_id) { filters.push("scan_id = ?"); args.push(scan_id); }
    return this.db.prepare(`SELECT * FROM issues WHERE ${filters.join(" AND ")} ORDER BY severity, issue_type, path`).all(...args)
      .map(asIssue);
  }

  scans(repositoryId) {
    return this.db.prepare("SELECT * FROM scans WHERE repository_id = ? ORDER BY started_at, scan_id").all(repositoryId).map(asScan);
  }

  snapshot({ repository_id, scan_id } = {}) {
    if (scan_id) {
      const packageValue = this._snapshotView(scan_id);
      assert(!repository_id || packageValue.repository_id === repository_id, `snapshot repository mismatch: ${scan_id}`, "GRAPH_SNAPSHOT_REPOSITORY_MISMATCH");
      return packageValue;
    }
    const where = repository_id ? " WHERE repository_id = ?" : "";
    const args = repository_id ? [repository_id] : [];
    return {
      schema_version: GRAPH_VERSION,
      scans: this.db.prepare(`SELECT * FROM scans${where} ORDER BY scan_id`).all(...args).map(asScan),
      assets: this.db.prepare(`SELECT * FROM assets${where} ORDER BY asset_id`).all(...args).map(asAsset),
      edges: this.db.prepare(`SELECT * FROM edges${where} ORDER BY edge_id`).all(...args).map(asEdge),
      issues: this.db.prepare(`SELECT * FROM issues${where} ORDER BY issue_id`).all(...args).map(asIssue),
      tombstones: this.db.prepare(`SELECT * FROM tombstones${where} ORDER BY asset_id`).all(...args).map((row) => ({ asset_id: row.asset_id, repository_id: row.repository_id, deleted_scan_id: row.deleted_scan_id, last_record: JSON.parse(row.last_record_json), reason: row.reason })),
      authority_claims: this.db.prepare(`SELECT * FROM authority_claims${where} ORDER BY claim_id`).all(...args).map((row) => ({ ...row }))
      ,authority_approvals: this.db.prepare(`SELECT * FROM authority_approvals${where} ORDER BY approval_id`).all(...args).map((row) => ({ ...row }))
    };
  }

  exportJsonl({ repository_id, scan_id } = {}) {
    const snapshot = this.snapshot({ repository_id, scan_id });
    const recordEntries = Object.entries(snapshot).filter(([key, value]) => key !== "schema_version" && key !== "scan_id" && key !== "repository_id" && key !== "snapshot_sha256" && Array.isArray(value));
    const records = [];
    for (const [type, values] of recordEntries) {
      for (const value of values) {
        const payload = { record_type: type.slice(0, -1), value };
        records.push(canonicalJson({ schema_version: GRAPH_VERSION, payload, payload_sha256: hash(payload) }));
      }
    }
    const recordValues = {
      assets: snapshot.assets,
      edges: snapshot.edges,
      issues: snapshot.issues,
      tombstones: snapshot.tombstones,
      authority_claims: snapshot.authority_claims
      ,authority_approvals: snapshot.authority_approvals
    };
    const manifest = {
      scan_id: scan_id ?? null,
      repository_id: repository_id ?? snapshot.repository_id ?? null,
      snapshot_sha256: scan_id ? snapshot.snapshot_sha256 : hash(snapshotHashContent(recordValues)),
      refs: snapshotRefs(recordValues),
      record_counts: Object.fromEntries(Object.entries(recordValues).map(([key, values]) => [key, values.length]))
    };
    const manifestPayload = { record_type: "snapshot_manifest", value: manifest };
    records.push(canonicalJson({ schema_version: GRAPH_VERSION, payload: manifestPayload, payload_sha256: hash(manifestPayload) }));
    return `${records.join("\n")}${records.length ? "\n" : ""}`;
  }

  importJsonl(contents) {
    const { records, manifests, historical, scans } = prepareImportJsonl(contents);
    return this._transaction(() => {
      if (historical) {
        for (const scan of scans) this._importRecord("scan", scan.value);
        this._importSnapshotManifest(historical, records);
        return records.length;
      }
      for (const { record_type: type, value } of records) {
        if (type !== "snapshot_manifest") this._importRecord(type, value);
      }
      for (const manifest of manifests) this._importSnapshotManifest(manifest, records);
      return records.length;
    });
  }

  _importSnapshotManifest(manifest, records) {
    const { recordsForSnapshot, scan } = validateImportSnapshotManifest(manifest, records, (approval) => this.authorizeImportedAuthorityApproval(approval));
    if (!manifest.scan_id) return;
    const packageValue = {
      schema_version: GRAPH_VERSION,
      scan,
      scan_id: manifest.scan_id,
      repository_id: manifest.repository_id,
      snapshot_sha256: manifest.snapshot_sha256,
      refs: manifest.refs,
      records: recordsForSnapshot
    };
    const existing = this.db.prepare("SELECT package_json FROM scan_snapshots WHERE scan_id = ?").get(manifest.scan_id);
    if (existing) {
      assert(canonicalJson(JSON.parse(existing.package_json)) === canonicalJson(packageValue), `snapshot import conflict: ${manifest.scan_id}`, "GRAPH_IMPORT_CONFLICT");
      return;
    }
    this.db.prepare("INSERT INTO scan_snapshots (scan_id, repository_id, snapshot_sha256, refs_json, package_json) VALUES (?, ?, ?, ?, ?)")
      .run(manifest.scan_id, manifest.repository_id, manifest.snapshot_sha256, canonicalJson(manifest.refs), canonicalJson(packageValue));
  }

  _importRecord(type, value) {
    const immutable = (table, idField, jsonRecord, insert) => {
      const existing = this.db.prepare(`SELECT * FROM ${table} WHERE ${idField} = ?`).get(value[idField]);
      if (existing) {
        assert(canonicalJson(jsonRecord(existing)) === canonicalJson(value), `import conflict: ${type}:${value[idField]}`, "GRAPH_IMPORT_CONFLICT");
      } else insert();
    };
    if (type === "scan") {
      assert(["full", "incremental"].includes(value.mode), `invalid imported scan mode: ${value.mode}`, "GRAPH_IMPORT_SCAN_INVALID");
      immutable("scans", "scan_id", asScan, () => this.db.prepare("INSERT INTO scans VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").run(value.scan_id, value.repository_id, value.root, value.mode, canonicalJson(value.basis), canonicalJson(value.scope), canonicalJson(value.exclusions), canonicalJson(value.extractor_versions), value.status, value.started_at, value.completed_at, value.coverage ? canonicalJson(value.coverage) : null, value.snapshot_sha256));
    } else if (type === "asset") {
      assert(ASSET_KINDS.has(value.kind), `invalid imported asset kind: ${value.kind}`, "GRAPH_IMPORT_ASSET_INVALID");
      assert(typeof value.path === "string" && value.path.length > 0 && !path.isAbsolute(value.path) && !value.path.startsWith("~") && !/^[A-Za-z]:[\\/]/.test(value.path) && !value.path.includes("\\") && !value.path.split("/").includes(".."), `imported asset path escapes repository: ${value.path}`, "GRAPH_IMPORT_PATH_ESCAPE");
      for (const scanId of [value.first_seen_scan_id, value.last_seen_scan_id]) {
        const scan = this.db.prepare("SELECT repository_id FROM scans WHERE scan_id = ?").get(scanId);
        assert(scan?.repository_id === value.repository_id, `asset scan reference does not close: ${value.asset_id}`, "GRAPH_IMPORT_REF_MISSING");
      }
      assert(/^[0-9a-f]{64}$/.test(value.content_sha256) && /^[0-9a-f]{64}$/.test(value.basis_package_identity), `asset hashes are invalid: ${value.asset_id}`, "GRAPH_IMPORT_ASSET_INVALID");
      assert(Number.isFinite(value.confidence) && value.confidence >= 0 && value.confidence <= 1 && ["active", "stale", "tombstoned"].includes(value.state), `asset status is invalid: ${value.asset_id}`, "GRAPH_IMPORT_ASSET_INVALID");
      immutable("assets", "asset_id", asAsset, () => this.db.prepare("INSERT INTO assets VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").run(value.asset_id, value.repository_id, value.component_id, value.kind, value.logical_key, value.path, value.symbol, value.content_sha256, value.basis_package_identity, value.extractor, value.confidence, value.evidence_status, value.first_seen_scan_id, value.last_seen_scan_id, value.state));
    } else if (type === "edge") {
      assert(EDGE_KINDS.has(value.relation), `invalid imported edge relation: ${value.relation}`, "GRAPH_IMPORT_EDGE_INVALID");
      assert(this.db.prepare("SELECT 1 FROM assets WHERE asset_id = ?").get(value.from_asset_id), `edge source missing: ${value.from_asset_id}`, "GRAPH_IMPORT_REF_MISSING");
      if (value.to_asset_id) assert(this.db.prepare("SELECT 1 FROM assets WHERE asset_id = ?").get(value.to_asset_id), `edge target missing: ${value.to_asset_id}`, "GRAPH_IMPORT_REF_MISSING");
      const endpointRepositories = [value.from_asset_id, value.to_asset_id].filter(Boolean).map((assetId) => this.db.prepare("SELECT repository_id FROM assets WHERE asset_id = ?").get(assetId)?.repository_id);
      assert(endpointRepositories.every((repositoryId) => repositoryId === value.repository_id), `edge crosses repository identity without a scoped reference: ${value.edge_id}`, "GRAPH_IMPORT_REPOSITORY_MISMATCH");
      for (const scanId of [value.first_seen_scan_id, value.last_seen_scan_id]) assert(this.db.prepare("SELECT repository_id FROM scans WHERE scan_id = ?").get(scanId)?.repository_id === value.repository_id, `edge scan reference does not close: ${value.edge_id}`, "GRAPH_IMPORT_REF_MISSING");
      assert(Number.isFinite(value.confidence) && value.confidence >= 0 && value.confidence <= 1 && ["active", "stale", "tombstoned"].includes(value.state), `edge status is invalid: ${value.edge_id}`, "GRAPH_IMPORT_EDGE_INVALID");
      immutable("edges", "edge_id", asEdge, () => this.db.prepare("INSERT INTO edges VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").run(value.edge_id, value.repository_id, value.from_asset_id, value.relation, value.to_asset_id, canonicalJson(value.qualifier), value.source_path, value.extractor, value.confidence, value.evidence_status, value.first_seen_scan_id, value.last_seen_scan_id, value.state));
    } else if (type === "issue") {
      assert(this.db.prepare("SELECT repository_id FROM scans WHERE scan_id = ?").get(value.scan_id)?.repository_id === value.repository_id, `issue scan reference does not close: ${value.issue_id}`, "GRAPH_IMPORT_REF_MISSING");
      immutable("issues", "issue_id", (row) => ({ issue_id: row.issue_id, repository_id: row.repository_id, scan_id: row.scan_id, issue_type: row.issue_type, severity: row.severity, path: row.path, detail: JSON.parse(row.detail_json), status: row.status }), () => this.db.prepare("INSERT INTO issues VALUES (?, ?, ?, ?, ?, ?, ?, ?)").run(value.issue_id, value.repository_id, value.scan_id, value.issue_type, value.severity, value.path, canonicalJson(value.detail), value.status));
    } else if (type === "tombstone") {
      assert(this.db.prepare("SELECT repository_id FROM assets WHERE asset_id = ?").get(value.asset_id)?.repository_id === value.repository_id, `tombstone asset reference does not close: ${value.asset_id}`, "GRAPH_IMPORT_REF_MISSING");
      assert(this.db.prepare("SELECT repository_id FROM scans WHERE scan_id = ?").get(value.deleted_scan_id)?.repository_id === value.repository_id, `tombstone scan reference does not close: ${value.asset_id}`, "GRAPH_IMPORT_REF_MISSING");
      immutable("tombstones", "asset_id", (row) => ({ asset_id: row.asset_id, repository_id: row.repository_id, deleted_scan_id: row.deleted_scan_id, last_record: JSON.parse(row.last_record_json), reason: row.reason }), () => this.db.prepare("INSERT INTO tombstones VALUES (?, ?, ?, ?, ?)").run(value.asset_id, value.repository_id, value.deleted_scan_id, canonicalJson(value.last_record), value.reason));
    } else if (type === "authority_claim") {
      assert(this.db.prepare("SELECT repository_id FROM assets WHERE asset_id = ?").get(value.asset_id)?.repository_id === value.repository_id, `authority asset reference does not close: ${value.claim_id}`, "GRAPH_IMPORT_REF_MISSING");
      assert(this.db.prepare("SELECT repository_id FROM scans WHERE scan_id = ?").get(value.scan_id)?.repository_id === value.repository_id, `authority scan reference does not close: ${value.claim_id}`, "GRAPH_IMPORT_REF_MISSING");
      immutable("authority_claims", "claim_id", (row) => ({ ...row }), () => this.db.prepare("INSERT INTO authority_claims VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)").run(value.claim_id, value.repository_id, value.semantic_scope, value.authority_kind, value.asset_id, value.role, value.content_sha256, value.scan_id, value.state));
    } else if (type === "authority_approval") {
      assert(typeof value.authorization_receipt === "string" && value.authorization_receipt.length > 0, `authority approval receipt missing: ${value.approval_id}`, "GRAPH_IMPORT_AUTHORITY_APPROVAL_INVALID");
      assert(this.authorizeImportedAuthorityApproval(value) === true, `imported authority approval is not trusted by the host: ${value.approval_id}`, "GRAPH_IMPORT_AUTHORITY_APPROVAL_UNTRUSTED");
      immutable("authority_approvals", "approval_id", (row) => ({ ...row }), () => this.db.prepare("INSERT INTO authority_approvals VALUES (?, ?, ?, ?, ?, ?, ?, ?)").run(value.approval_id, value.repository_id, value.authority_kind, value.content_sha256, value.approver_id, value.approver_role, value.approved_at, value.authorization_receipt));
    } else {
      throw error(`unsupported record type: ${type}`, "GRAPH_IMPORT_TYPE_INVALID");
    }
  }

  validateGraph({ repository_id, scan_id } = {}) {
    const records = scan_id ? this._snapshotView(scan_id) : this.snapshot({ repository_id });
    const assets = new Map(records.assets.map((asset) => [asset.asset_id, asset]));
    const issues = records.issues.filter((issue) => issue.status === "active" && issue.severity === "error").map((issue) => ({ code: issue.issue_type, issue_id: issue.issue_id, path: issue.path }));
    for (const edge of records.edges) {
      const from = assets.get(edge.from_asset_id);
      const to = edge.to_asset_id ? assets.get(edge.to_asset_id) : null;
      if (!from) issues.push({ code: "EDGE_SOURCE_MISSING", edge_id: edge.edge_id });
      if (edge.to_asset_id && !to) issues.push({ code: "EDGE_TARGET_MISSING", edge_id: edge.edge_id });
      if (from && from.repository_id !== edge.repository_id) issues.push({ code: "EDGE_SOURCE_REPOSITORY_MISMATCH", edge_id: edge.edge_id });
      if (to && to.repository_id !== edge.repository_id) issues.push({ code: "EDGE_TARGET_REPOSITORY_MISMATCH", edge_id: edge.edge_id });
    }
    for (const claim of records.authority_claims.filter((claim) => claim.role === "approved")) {
      const approval = records.authority_approvals?.find((candidate) => candidate.repository_id === claim.repository_id && candidate.authority_kind === claim.authority_kind && candidate.content_sha256 === claim.content_sha256 && candidate.authorization_receipt);
      if (!approval) issues.push({ code: "AUTHORITY_APPROVAL_REF_MISSING", claim_id: claim.claim_id });
    }
    if (scan_id) {
      const packageValue = this._snapshotPackage(scan_id);
      if (hash(snapshotHashContent(packageValue.records)) !== packageValue.snapshot_sha256) issues.push({ code: "SNAPSHOT_HASH_MISMATCH", scan_id });
      if (canonicalJson(snapshotRefs(packageValue.records)) !== canonicalJson(packageValue.refs)) issues.push({ code: "SNAPSHOT_REFS_MISMATCH", scan_id });
      for (const provenanceScanId of packageValue.refs.scan_ids ?? []) if (!this.db.prepare("SELECT 1 FROM scans WHERE scan_id = ?").get(provenanceScanId)) issues.push({ code: "SNAPSHOT_SCAN_REF_MISSING", scan_id: provenanceScanId });
    }
    return {
      schema_version: GRAPH_VERSION,
      valid: issues.length === 0,
      scan_id: scan_id ?? null,
      repository_id: repository_id ?? records.repository_id ?? null,
      issues
    };
  }

  diff({ from_scan_id, to_scan_id } = {}) {
    assert(from_scan_id && to_scan_id, "from_scan_id and to_scan_id are required", "GRAPH_DIFF_INPUT_REQUIRED");
    const from = this._snapshotView(from_scan_id);
    const to = this._snapshotView(to_scan_id);
    assert(from.repository_id === to.repository_id, "scan repositories do not match", "GRAPH_DIFF_REPOSITORY_MISMATCH");
    const assetProjection = ({ schema_version, basis_package_identity, first_seen_scan_id, last_seen_scan_id, ...record }) => record;
    const edgeProjection = ({ schema_version, first_seen_scan_id, last_seen_scan_id, ...record }) => record;
    const compare = (kind, idField, project) => {
      const left = new Map(from[kind].map((record) => [record[idField], record]));
      const right = new Map(to[kind].map((record) => [record[idField], record]));
      return {
        added: [...right.keys()].filter((id) => !left.has(id)),
        removed: [...left.keys()].filter((id) => !right.has(id)),
        changed: [...right.keys()].filter((id) => left.has(id) && canonicalJson(project(left.get(id))) !== canonicalJson(project(right.get(id))))
      };
    };
    return {
      schema_version: GRAPH_VERSION,
      semantic_projection_version: "repo-graph-diff/1",
      repository_id: from.repository_id,
      from_scan_id,
      to_scan_id,
      assets: compare("assets", "asset_id", assetProjection),
      edges: compare("edges", "edge_id", edgeProjection)
    };
  }
}

export function createRepositoryGraph(options) {
  return new RepositoryGraphStore(options);
}

// Stable function-level API for adapters that should not depend on the class
// name. The class methods remain available for existing consumers.
export function createGraphStore(options) {
  return createRepositoryGraph(options);
}

export function scanRepository(store, options) {
  assert(store?.scan, "graph store is required", "GRAPH_STORE_REQUIRED");
  return store.scan(options);
}

export function queryAssets(store, options) {
  assert(store?.query, "graph store is required", "GRAPH_STORE_REQUIRED");
  return store.query(options);
}

export function impactAnalysis(store, assetId, options) {
  assert(store?.impact, "graph store is required", "GRAPH_STORE_REQUIRED");
  return store.impact(assetId, options);
}

export function exportSnapshotJsonl(store, options) {
  assert(store?.exportJsonl, "graph store is required", "GRAPH_STORE_REQUIRED");
  return store.exportJsonl(options);
}

export function importSnapshotJsonl(store, contents) {
  assert(store?.importJsonl, "graph store is required", "GRAPH_STORE_REQUIRED");
  return store.importJsonl(contents);
}

export function validateGraph(store, options) {
  assert(store?.validateGraph, "graph store is required", "GRAPH_STORE_REQUIRED");
  return store.validateGraph(options);
}

export function close(store) {
  assert(store?.close, "graph store is required", "GRAPH_STORE_REQUIRED");
  return store.close();
}

export { ASSET_KINDS, EDGE_KINDS, GRAPH_VERSION, hash as graphHash };
