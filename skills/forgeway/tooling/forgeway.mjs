#!/usr/bin/env node
import { resolveCapability, validateAdapterManifest } from "./capability-core.mjs";
import { validateCapabilityRegistry } from "./capability-registry.mjs";
import { capabilityDirectory } from "./capability-directory.mjs";
import { referenceLookup } from "./reference-lookup.mjs";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import YAML from "yaml";

import { createDeliveryStore, buildPackageManifest, validatePackageManifest } from "./delivery/index.mjs";
import { createRepositoryGraph, preflightGraphImportJsonl, GRAPH_VERSION } from "./repo-graph/index.mjs";
import { buildContextProjection, renderContextDot, renderContextMarkdown, sha256Bytes, validateContextProjection } from "./context/index.mjs";
import { typedArtifactValidation } from "./artifact-validation.mjs";
import { resolveHttpApiProfile } from "./http-api-profile.mjs";
import { workspaceCommand } from "./workspace.mjs";
import { profileCommand } from "./project-profile.mjs";
import { packCommand } from "./pack.mjs";
import { artifactCommand } from "./artifact/index.mjs";
import { maintenanceCommand } from "./maintenance/index.mjs";

const CLI_VERSION = "forgeway-cli/1";
const TYPED_ARTIFACT_KINDS = new Set(["project", "requirement", "task", "change", "evidence"]);

function fail(message, code = "FORGEWAY_CLI_ERROR", exitCode = 2) {
  const error = new Error(message);
  error.code = code;
  error.exitCode = exitCode;
  throw error;
}

function parse(argv) {
  const positionals = [];
  const flags = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith("--")) { positionals.push(token); continue; }
    const key = token.slice(2);
    if (key === "read-only" && flags[key] !== undefined) fail("--read-only may be specified only once", "PACKAGE_READ_ONLY_INVALID");
    const next = argv[index + 1];
    if (!next || next.startsWith("--")) flags[key] = true;
    else { (flags[key] ??= []).push(next); index += 1; }
  }
  return { positionals, flags };
}

function one(flags, key, fallback) {
  const value = flags[key];
  if (value === undefined) return fallback;
  if (value === true) return true;
  return value[value.length - 1];
}

function many(flags, key, fallback = []) {
  const value = flags[key];
  if (value === undefined) return fallback;
  return value === true ? [] : value.flatMap((item) => item.split(",")).filter(Boolean);
}

function readJson(input) {
  return JSON.parse(readFileSync(input, "utf8"));
}

function emit(value, flags) {
  const contents = `${JSON.stringify(value, null, one(flags, "compact", false) ? 0 : 2)}\n`;
  const output = one(flags, "output");
  if (output) writeFileSync(output, contents);
  else process.stdout.write(contents);
}

function help() {
  return {
    schema_version: CLI_VERSION,
    usage: [
      "forgeway version",
      "forgeway maintenance doctor --input <bounded-request.json> [--config <private-user-config.json>]",
      "forgeway maintenance doctor --source-root <checkout> [--installed-root <installation>]",
      "forgeway maintenance doctor --config <private-config.json> --source-id <registered-id>",
      "forgeway maintenance plan --task <existing-task.json> --source-root <checkout>",
      "forgeway maintenance config-template",
      "maintenance/2: component|configuration + explicit profile; old requests require explicit migration",
      "forgeway init <target> --name <name> [--project-type frontend|backend|fullstack|cli|library] [--app <id>]... [--stack <app-id=vue|react|java|rust|node|vanilla>]... [--starter http-demo]",
      "forgeway workspace check <root>",
      "forgeway workspace resolve <root> --app <id>",
      "forgeway profile check <project-root>",
      "forgeway graph scan --db <file> --root <repo> [--repository-id <id>] [--scope <path/**>] [--exclude <path>]",
      "forgeway graph query --db <file> [--repository-id <id>] [--scan-id <id>] [--kind <kind>] [--path <text>] [--text <text>]",
      "forgeway graph impact --db <file> --asset-id <id> [--scan-id <id>] [--direction both] [--depth 3]",
      "forgeway graph export --db <file> [--scan-id <id>] --output <snapshot.jsonl>",
      "forgeway graph import --db <file> --input <snapshot.jsonl>",
      "forgeway graph status --db <file> --repository-id <id>",
      "forgeway graph validate --db <file> [--repository-id <id>] [--scan-id <id>]",
      "forgeway graph diff --db <file> --from-scan-id <id> --to-scan-id <id>",
      "forgeway graph render --db <file> --repository-id <id> [--output project-map.md]",
      "graph scan/query/impact/status/validate: optional --summary is lossy display, not portable data; reads require --scan-id",
      "forgeway delivery package --root <repo> [--repository-id <id>] [--include <relative-file>] [--read-only]",
      "forgeway delivery validate-package --input <manifest.json>",
      "forgeway delivery project --events <events.json> --run-id <id>",
      "forgeway context project --graph-db <file> --scan-id <id> --events <events.json> --run-id <id> --artifact <kind=file> [--format json|markdown|dot]",
      "forgeway capability inspect --registry <skills-index.json> [--capability-id <id>] [--capability-version <semver>]",
      "forgeway capability inspect --view directory --registry <skills-index.json> [--adapters <runtime-adapters.json>] [--capability-id <id>] [--result-ref <capability-id=reference>]",
      "forgeway reference lookup [--need <reason>] [--topic <exact-tag>] [--index <handbook-references.json> --revision <source-sha>] [--stage <index-stage>] [--constraint <tag>] [--kind <kind>] [--allow-status <status>] [--allow-evidence <level>]",
      "forgeway capability adapter",
      "forgeway capability resolve --registry <skills-index.json> --adapters <runtime-adapters.json> --capability-id <id> [--capability-version <semver>] [--adapter-id <id>]",
      "forgeway capability check --registry <skills-index.json> --adapters <runtime-adapters.json> --require <id@exact-version> [--require <id@exact-version>] [--optional <id@exact-version>] [--select <capability-id=adapter-id>]",
      "forgeway standards resolve [--overrides <http-api-overrides.json>]",
      "forgeway browser mock extension [--config <file> --project <id> --environment <id> --scenario <id> --url <url> --directory <new-directory>]",
      "forgeway browser mock native-init --directory <new-channel> --extension-directory <unpacked-artifact> --extension-id <id>",
      "forgeway browser mock native-register --directory <channel> --registration-directory <authorized-NativeMessagingHosts-directory>",
      "forgeway browser mock native-sync --directory <channel> --config <project-config> --project <id> --environment <id> --scenario <id> --url <scope-url> [--timeout-ms <milliseconds>]",
      "forgeway browser mock native-status --directory <channel> [--timeout-ms <milliseconds>]",
      "forgeway browser mock temporary --config <file> --project <id> --environment <id> --scenario <id> --url <url> --driver <playwright|cdp> --chrome <executable> --flow <project-module> --out <new-directory> [--timeout-ms <milliseconds>] [--viewport <WIDTHxHEIGHT>]",
      "forgeway browser mock validate --config <project-mock.json>",
      "forgeway browser mock proxy-start --config <file> --project <id> --environment <id> --scenario <id> --url <page-url> --api-origin <origin> --upstream <url> --strip-prefix <path> --session <new-directory> [--port <port>]",
      "forgeway browser mock proxy-update --session <directory> --config <file>",
      "forgeway browser mock proxy-status --session <directory>",
      "forgeway browser mock proxy-stop --session <directory>",
      "forgeway browser mock open --config <project-mock.json> --project <id> --environment <id> --scenario <id> --url <url> --chrome <executable> --session <new-directory> [--headless] [--viewport <WIDTHxHEIGHT>]",
      "forgeway browser mock apply --session <directory> --config <project-mock.json> --url <url>",
      "forgeway browser mock resume --session <directory> --config <project-mock.json> --url <url>",
      "forgeway browser mock status --session <directory>",
      "forgeway browser mock stop --session <directory>",
      "forgeway browser doctor [--chrome <executable> | --endpoint <loopback-url>]",
      "forgeway browser targets --endpoint <loopback-url>",
      "forgeway browser validate --flow <flow.json>",
      "forgeway browser record --flow <flow.json> --out <new.mp4> (--launch-headless --chrome <executable> | --endpoint <loopback-url> --target-id <id>)",
      "forgeway pack doctor",
      "forgeway pack create <directory> [--project <name>] [--out <existing-directory>] [--dry-run] [--tag]",
      "forgeway artifact doctor",
      "forgeway artifact inspect <path> [<path> ...] [--expected-arch <arch>] [--require-member <member>] [--max-members <count>]"
    ],
    output: "JSON unless graph render is selected; Markdown render is derived and never a gate input"
  };
}

function readTypedArtifact(specification) {
  const separator = specification.indexOf("=");
  if (separator <= 0 || separator === specification.length - 1) fail("--artifact must use kind=file", "CONTEXT_ARTIFACT_SPEC_INVALID");
  const kind = specification.slice(0, separator);
  if (!TYPED_ARTIFACT_KINDS.has(kind)) fail(`unsupported typed artifact kind: ${kind}`, "CONTEXT_ARTIFACT_KIND_UNSUPPORTED");
  const filename = specification.slice(separator + 1);
  const contents = readFileSync(filename);
  const value = YAML.parse(contents.toString("utf8"));
  const validation = typedArtifactValidation(kind, value);
  if (validation.schema_errors.length > 0) fail(`typed artifact is invalid: ${kind} (${JSON.stringify(validation.schema_errors)})`, "CONTEXT_ARTIFACT_INVALID");
  if (validation.semantic_errors.length > 0) fail(`typed artifact semantics are invalid: ${kind} (${JSON.stringify(validation.semantic_errors)})`, "CONTEXT_ARTIFACT_SEMANTICS_INVALID");
  return { kind, value, source_sha256: sha256Bytes(contents) };
}

function contextCommand(action, flags) {
  if (action !== "project") fail(`unknown context action: ${action}`, "FORGEWAY_COMMAND_UNKNOWN");
  const graphDb = one(flags, "graph-db");
  const scanId = one(flags, "scan-id");
  const eventsPath = one(flags, "events");
  const runId = one(flags, "run-id");
  const artifactSpecs = many(flags, "artifact");
  if (!graphDb || !scanId || !eventsPath || !runId || artifactSpecs.length === 0) {
    fail("--graph-db, --scan-id, --events, --run-id and at least one --artifact are required", "CONTEXT_INPUT_REQUIRED");
  }
  if (!existsSync(graphDb)) fail(`graph database not found: ${graphDb}`, "FORGEWAY_DB_NOT_FOUND", 4);
  const eventBytes = readFileSync(eventsPath);
  const events = JSON.parse(eventBytes.toString("utf8"));
  const trustedReceipts = new Set(many(flags, "trust-observation-receipt"));
  const store = createDeliveryStore({ authorizeImportedObservation: (observation) => trustedReceipts.has(observation.validation.authorization_receipt) });
  const graph = createRepositoryGraph({ filename: graphDb, readOnly: true });
  try {
    store.importEvents(events);
    const projection = buildContextProjection({
      graphSnapshot: graph.snapshot({ scan_id: scanId }),
      deliveryStore: store,
      runId,
      typedArtifacts: artifactSpecs.map(readTypedArtifact),
      depth: Number(one(flags, "depth", 3)),
      limit: Number(one(flags, "limit", 500)),
      deliveryEventsSha256: sha256Bytes(eventBytes)
    });
    validateContextProjection(projection);
    const format = one(flags, "format", "json");
    if (format === "json") return emit(projection, flags);
    const contents = format === "markdown" ? renderContextMarkdown(projection) : format === "dot" ? renderContextDot(projection) : null;
    if (contents === null) fail(`unsupported context format: ${format}`, "CONTEXT_FORMAT_UNSUPPORTED");
    const output = one(flags, "output");
    if (output) writeFileSync(output, contents);
    else process.stdout.write(contents);
  } finally {
    graph.close();
    store.close();
  }
}

function openGraph(flags, { create = false } = {}) {
  const filename = one(flags, "db");
  if (!filename) fail("--db is required", "FORGEWAY_DB_REQUIRED");
  if (!create && !existsSync(filename)) fail(`graph database not found: ${filename}`, "FORGEWAY_DB_NOT_FOUND", 4);
  return createRepositoryGraph({ filename, readOnly: !create });
}

// CLI-only, deliberately lossy display. No portable envelope or stored record changes.
function emitGraph(value, flags, action, graph) {
  if (flags.summary === undefined) return emit(value, flags);
  const snapshot = graph.snapshot({ scan_id: value.scan_id });
  const scan = graph.scans(snapshot.repository_id).find((item) => item.scan_id === value.scan_id);
  if (!scan) fail("summary cannot resolve the selected scan", "GRAPH_SNAPSHOT_INVALID");
  const countBy = (items, field) => {
    const counts = new Map();
    for (const item of items) { const key = item[field] ?? "unknown"; counts.set(key, (counts.get(key) ?? 0) + 1); }
    return Object.fromEntries([...counts].sort(([left], [right]) => left.localeCompare(right)));
  };
  const { file_classification = [], ...coverage } = scan.coverage;
  const issues = snapshot.issues.filter((issue) => issue.status === "active");
  const groups = new Map();
  for (const issue of issues) {
    const key = JSON.stringify([issue.severity, issue.issue_type]);
    const group = groups.get(key) ?? { issue_type: issue.issue_type, severity: issue.severity, count: 0, candidate_count: 0, paths: new Set() };
    group.count += 1;
    if (Number.isInteger(issue.detail?.candidate_count)) group.candidate_count += issue.detail.candidate_count;
    group.paths.add(issue.path);
    groups.set(key, group);
  }
  const validation = value.portable_result?.validation ?? ("valid" in value ? value : graph.validateGraph({ scan_id: value.scan_id }));
  const result = {};
  if (value.assets) {
    result.returned = value.assets.length;
    result.by_kind = countBy(value.assets, "kind");
    result.sample = value.assets.slice(0, 5).map(({ asset_id, kind, path, content_sha256, state }) => ({ asset_id, kind, path, content_sha256, state }));
    result.omitted_assets = value.assets.length - result.sample.length;
  }
  if (action === "query") {
    result.filters = { kinds: many(flags, "kind"), path: one(flags, "path", null), symbol: one(flags, "symbol", null), text: one(flags, "text", null), state: one(flags, "state", "active") };
    result.limit = Number(one(flags, "limit", 200));
    result.possibly_truncated = value.assets.length === result.limit;
    result.total_matching = result.possibly_truncated ? null : value.assets.length;
  }
  if (action === "impact") Object.assign(result, {
    ...value.portable_result.query, depth_bounded: true,
    edges_returned: value.edges.length, edges_unresolved: value.edges.filter((edge) => !edge.to_asset_id).length,
    edges_by_relation: countBy(value.edges, "relation"), omitted_edge_records: value.edges.length
  });
  if (action === "status") result.active_asset_count = value.active_asset_count;
  return emit({
    schema_version: CLI_VERSION, output_view: "summary", lossy: true, portable: false, action,
    storage_version: GRAPH_VERSION, repository_id: scan.repository_id, scan_id: scan.scan_id,
    snapshot_sha256: scan.snapshot_sha256, basis: scan.basis, status: scan.status, mode: scan.mode,
    extractor_versions: scan.extractor_versions,
    coverage: { ...coverage, file_classification: {
      total: file_classification.length, omitted_records: file_classification.length,
      by_state: countBy(file_classification, "state"), by_reason: countBy(file_classification.filter((item) => item.reason), "reason")
    } },
    validation: { valid: validation.valid, issues: validation.issues },
    issues: { total: issues.length, details_omitted: true, groups: [...groups.values()].map(({ paths, ...group }) => ({
      ...group, sample_paths: [...paths].sort().slice(0, 5), omitted_paths: Math.max(0, paths.size - 5)
    })).sort((left, right) => left.severity.localeCompare(right.severity) || left.issue_type.localeCompare(right.issue_type)) },
    result,
    limitations: "Lossy display only; use default JSON or graph export for complete records. Scope, extractor versions and query bounds still apply; absence of warnings is not complete coverage, and no edges does not prove no impact. Not runtime verification."
  }, flags);
}

function graphCommand(action, flags) {
  if (flags.summary !== undefined) {
    if (!["scan", "query", "impact", "status", "validate"].includes(action)) fail("--summary is only a display option for scan/query/impact/status/validate", "FORGEWAY_GRAPH_SUMMARY_UNSUPPORTED");
    if (flags.summary !== true) fail("--summary does not accept a value", "FORGEWAY_GRAPH_SUMMARY_INVALID");
    if (action !== "scan" && typeof one(flags, "scan-id") !== "string") fail("--summary reads require an explicit --scan-id", "FORGEWAY_SCAN_REQUIRED");
  }
  let importContents;
  if (action === "import") {
    // Reject unreadable or self-inconsistent input before opening a writable database. Keep
    // the existing required-database error ahead of input reads.
    if (!one(flags, "db")) fail("--db is required", "FORGEWAY_DB_REQUIRED");
    const input = one(flags, "input");
    if (typeof input !== "string" || !input) fail("--input is required", "FORGEWAY_INPUT_REQUIRED");
    importContents = readFileSync(input, "utf8");
    preflightGraphImportJsonl(importContents);
  }
  const graph = openGraph(flags, { create: action === "scan" || action === "import" });
  try {
    if (action === "scan") {
      const root = path.resolve(one(flags, "root", process.cwd()));
      const result = graph.scan({
        root,
        repository_id: one(flags, "repository-id"),
        mode: one(flags, "mode", "full"),
        scope: many(flags, "scope", ["**"]),
        exclusions: many(flags, "exclude", [".git", ".codex", "node_modules", "coverage", "dist", "build"]),
        authority_requirements: many(flags, "require-authority")
      });
      const validation = graph.validateGraph({ repository_id: result.repository_id, scan_id: result.scan_id });
      return emitGraph({ ...result, local_snapshot: {
        schema: "urn:skills:repository-asset-snapshot:v1", storage_version: GRAPH_VERSION,
        repository_id: result.repository_id, snapshot_ref: result.scan_id,
        snapshot_sha256: result.snapshot_sha256, basis: result.basis, scope: result.coverage.scope
      }, portable_result: {
        schema_version: "1.0", capability_id: "repository.asset.scan", capability_version: "2.0.0",
        repository_id: result.repository_id, snapshot_ref: result.scan_id, basis: result.basis,
        scope: result.coverage.scope, coverage: result.coverage, validation: { valid: validation.valid, issues: validation.issues }
      } }, flags, action, graph);
    }
    if (action === "query") {
      const repositoryId = one(flags, "repository-id");
      const selectedScanId = one(flags, "scan-id") ?? (repositoryId ? graph.scans(repositoryId).at(-1)?.scan_id : null);
      if (!selectedScanId) fail("query requires --scan-id or a repository with a completed scan", "FORGEWAY_SCAN_REQUIRED");
      const snapshot = graph.snapshot({ repository_id: repositoryId, scan_id: selectedScanId });
      const selectedScan = graph.scans(snapshot.repository_id).find((scan) => scan.scan_id === selectedScanId);
      if (!selectedScan) fail(`snapshot registry is missing selected scan: ${selectedScanId}`, "GRAPH_SNAPSHOT_INVALID");
      const assets = graph.query({ repository_id: repositoryId, scan_id: selectedScanId, kinds: many(flags, "kind"), path: one(flags, "path"), symbol: one(flags, "symbol"), text: one(flags, "text"), state: one(flags, "state", "active"), limit: Number(one(flags, "limit", 200)) });
      const validation = graph.validateGraph({ repository_id: repositoryId, scan_id: selectedScanId });
      return emitGraph({ schema_version: GRAPH_VERSION, scan_id: selectedScanId, assets, portable_result: {
        schema_version: "1.0", capability_id: "repository.asset.query", capability_version: "1.0.0",
        repository_id: snapshot.repository_id, snapshot_ref: selectedScanId, basis: selectedScan.basis,
        scope: selectedScan.coverage.scope, coverage: selectedScan.coverage,
        validation: { valid: validation.valid, issues: validation.issues }, assets
      } }, flags, action, graph);
    }
    if (action === "impact") {
      const assetId = one(flags, "asset-id");
      if (!assetId) fail("--asset-id is required", "FORGEWAY_ASSET_ID_REQUIRED");
      const requestedScanId = one(flags, "scan-id");
      const direction = one(flags, "direction", "both");
      const depth = Number(one(flags, "depth", 3));
      const relationFilters = many(flags, "relation");
      const result = graph.impact(assetId, { scan_id: requestedScanId, direction, depth, relations: relationFilters });
      const rootAsset = result.assets.find((asset) => asset.asset_id === assetId);
      const selectedScanId = requestedScanId ?? rootAsset?.last_seen_scan_id;
      if (!selectedScanId) fail("impact result cannot resolve a fixed graph snapshot", "FORGEWAY_SCAN_REQUIRED");
      const snapshot = graph.snapshot({ repository_id: rootAsset?.repository_id, scan_id: selectedScanId });
      const selectedScan = graph.scans(snapshot.repository_id).find((scan) => scan.scan_id === selectedScanId);
      if (!selectedScan) fail(`snapshot registry is missing selected scan: ${selectedScanId}`, "GRAPH_SNAPSHOT_INVALID");
      const validation = graph.validateGraph({ repository_id: snapshot.repository_id, scan_id: selectedScanId });
      return emitGraph({ ...result, scan_id: selectedScanId, portable_result: {
        schema_version: "1.0", capability_id: "repository.asset.query", capability_version: "1.0.0",
        repository_id: snapshot.repository_id, snapshot_ref: selectedScanId, basis: selectedScan.basis,
        scope: selectedScan.coverage.scope, coverage: selectedScan.coverage,
        query: { kind: "impact", root_asset_id: assetId, direction, depth, relation_filters: relationFilters },
        assets: result.assets, relations: result.edges,
        validation: { valid: validation.valid, issues: validation.issues }
      } }, flags, action, graph);
    }
    if (action === "export") {
      const jsonl = graph.exportJsonl({ repository_id: one(flags, "repository-id"), scan_id: one(flags, "scan-id") });
      const output = one(flags, "output");
      if (!output) process.stdout.write(jsonl);
      else writeFileSync(output, jsonl);
      return;
    }
    if (action === "import") {
      return emit({ schema_version: GRAPH_VERSION, imported_records: graph.importJsonl(importContents) }, flags);
    }
    if (action === "status") {
      const repositoryId = one(flags, "repository-id");
      if (!repositoryId) fail("--repository-id is required", "FORGEWAY_REPOSITORY_ID_REQUIRED");
      const scanId = one(flags, "scan-id");
      return emitGraph({ schema_version: GRAPH_VERSION, scan_id: scanId ?? null, scans: scanId ? graph.snapshot({ repository_id: repositoryId, scan_id: scanId }).scans : graph.scans(repositoryId), issues: graph.issues({ repository_id: repositoryId, scan_id: scanId }), active_asset_count: graph.activeAssetCount({ repository_id: repositoryId, scan_id: scanId }) }, flags, action, graph);
    }
    if (action === "validate") return emitGraph(graph.validateGraph({ repository_id: one(flags, "repository-id"), scan_id: one(flags, "scan-id") }), flags, action, graph);
    if (action === "diff") return emit(graph.diff({ from_scan_id: one(flags, "from-scan-id"), to_scan_id: one(flags, "to-scan-id") }), flags);
    if (action === "render") {
      const repositoryId = one(flags, "repository-id");
      if (!repositoryId) fail("--repository-id is required", "FORGEWAY_REPOSITORY_ID_REQUIRED");
      const scanId = one(flags, "scan-id");
      const total = graph.activeAssetCount({ repository_id: repositoryId, scan_id: scanId });
      const assets = graph.query({ repository_id: repositoryId, scan_id: scanId, limit: 5000 });
      const truncated = assets.length < total;
      const groups = Map.groupBy(assets, (asset) => asset.kind);
      const lines = ["<!-- derived-view: forgeway repo-graph; never use as a gate input -->", `# Repository map: ${repositoryId}`, "", `Snapshot: \`${scanId ?? "live"}\``, "", `Rendered active assets: ${assets.length} of ${total}; limit: 5000; truncated: ${truncated ? "yes" : "no"}.`, ""];
      if (truncated) lines.push("> Partial view: active assets were omitted by the render limit.", "");
      for (const [kind, records] of [...groups.entries()].sort(([left], [right]) => left.localeCompare(right))) {
        lines.push(`## ${kind}`, "", ...records.map((asset) => `- \`${asset.asset_id}\` — \`${asset.path}${asset.symbol ? `#${asset.symbol}` : ""}\``), "");
      }
      const contents = `${lines.join("\n")}\n`;
      const output = one(flags, "output");
      if (output) writeFileSync(output, contents);
      else process.stdout.write(contents);
      return;
    }
    fail(`unknown graph action: ${action}`, "FORGEWAY_COMMAND_UNKNOWN");
  } finally {
    graph.close();
  }
}

function deliveryCommand(action, flags) {
  if (action === "package") {
    if ((flags["read-only"] !== undefined && flags["read-only"] !== true) || Object.keys(flags).some(key => key.startsWith("read-only="))) {
      fail("--read-only does not accept a value", "PACKAGE_READ_ONLY_INVALID");
    }
    if (flags.include === true) fail("--include requires a repository-relative file", "PACKAGE_INCLUDE_INVALID");
    return emit(buildPackageManifest({ root: path.resolve(one(flags, "root", process.cwd())), repository_id: one(flags, "repository-id"), include: many(flags, "include"), read_only: flags["read-only"] === true }), flags);
  }
  if (action === "validate-package") {
    const input = one(flags, "input");
    if (!input) fail("--input is required", "FORGEWAY_INPUT_REQUIRED");
    const manifest = readJson(input);
    validatePackageManifest(manifest);
    return emit({ schema_version: CLI_VERSION, valid: true, package_id: manifest.package_id, aggregate_sha256: manifest.aggregate_sha256 }, flags);
  }
  if (action === "project") {
    const input = one(flags, "events");
    const runId = one(flags, "run-id");
    if (!input || !runId) fail("--events and --run-id are required", "FORGEWAY_DELIVERY_INPUT_REQUIRED");
    const store = createDeliveryStore();
    try {
      store.importEvents(readJson(input));
      return emit(store.projectPredicates({ run_id: runId }), flags);
    } finally { store.close(); }
  }
  fail(`unknown delivery action: ${action}`, "FORGEWAY_COMMAND_UNKNOWN");
}

function capabilityResult(action, flags, inputs = {}) {
  if (action === "adapter") {
    return {
      schema_version: "forgeway-runtime-adapters/1",
      static_manifest_authorizes: false,
      adapters: [{
        adapter_id: "forgeway.repository-asset-graph",
        adapter_version: "2.0.0",
        runtime_binding: "host-owned",
        capabilities: [
          {
            capability_id: "repository.asset.scan",
            capability_version: "2.0.0",
            accepts: ["urn:skills:repository-scope:v1"],
            produces: ["urn:skills:asset-map-result:v1", "urn:skills:repository-asset-snapshot:v1"],
            maximum_mutation_class: "artifact-write",
            authorization_needs: [],
            evidence_class: ["static"],
            terminal_states: ["pass", "partial", "capability-unavailable"]
          },
          {
            capability_id: "repository.asset.query",
            capability_version: "1.0.0",
            accepts: ["urn:skills:asset-map-result:v1"],
            produces: ["urn:skills:asset-map-result:v1"],
            maximum_mutation_class: "read-only",
            authorization_needs: [],
            evidence_class: ["static"],
            terminal_states: ["pass", "partial", "capability-unavailable"]
          }
        ]
      }]
    };
  }
  if (action !== "inspect" && action !== "resolve") fail(`unknown capability action: ${action}`, "FORGEWAY_COMMAND_UNKNOWN");
  const input = one(flags, "registry");
  if (!input) fail("--registry is required", "FORGEWAY_REGISTRY_REQUIRED");
  const registry = Object.hasOwn(inputs, "registry") ? inputs.registry : readJson(input);
  validateCapabilityRegistry(registry);
  const capabilityId = one(flags, "capability-id");
  const capabilities = capabilityId ? registry.capabilities.filter((capability) => capability.capability_id === capabilityId) : registry.capabilities;
  if (capabilityId && capabilities.length === 0) fail(`capability missing: ${capabilityId}`, "CAPABILITY_MISSING", 3);
  const requestedVersion = one(flags, "capability-version");
  if (requestedVersion && capabilities.some((capability) => capability.capability_version !== requestedVersion)) fail(`capability version is incompatible: ${capabilityId ?? "selection"}@${requestedVersion}`, "CAPABILITY_VERSION_UNSUPPORTED", 3);
  const packages = new Map(registry.packages.map((item) => [item.name, item]));
  if (action === "resolve") {
    if (!capabilityId) fail("--capability-id is required", "FORGEWAY_CAPABILITY_REQUIRED");
    const adaptersInput = one(flags, "adapters");
    if (!adaptersInput) fail("--adapters is required", "FORGEWAY_ADAPTERS_REQUIRED");
    const manifest = Object.hasOwn(inputs, "manifest") ? inputs.manifest : readJson(adaptersInput);
    const requested = capabilities[0];
    return resolveCapability(requested, manifest, { registryContract: registry.contract_version, adapterId: one(flags, "adapter-id") });
  }
  return {
    schema_version: "forgeway-capability-inspection/1",
    registry_contract: registry.contract_version,
    static_manifest_authorizes: false,
    capabilities: capabilities.map((capability) => ({
      ...capability,
      package_contract: packages.get(capability.package) ?? null,
      adapter_contract: capability.produces.some((item) => item.schema === "urn:skills:repository-asset-snapshot:v1")
        ? {
            local_schema: "urn:skills:repository-asset-snapshot:v1",
            storage_version: GRAPH_VERSION,
            portable_envelope: "urn:skills:asset-map-result:v1",
            mapping: {
              snapshot_ref: "scan_id",
              snapshot_sha256: "snapshot_sha256",
              basis: "basis",
              coverage: "coverage",
              validation: "issues"
            }
          }
        : null
    }))
  };
}

function capabilityCheck(flags) {
  const allowed = new Set(["registry", "adapters", "require", "optional", "select", "compact"]);
  for (const [key, value] of Object.entries(flags)) {
    if (!allowed.has(key) || (key !== "compact" && value === true)) fail(`invalid or missing capability check option: --${key}`, "FORGEWAY_CAPABILITY_CHECK_INPUT_INVALID");
    if (["registry", "adapters"].includes(key) && value.length !== 1) fail(`--${key} must be supplied exactly once`, "FORGEWAY_CAPABILITY_CHECK_INPUT_INVALID");
  }
  const requirements = [];
  const ids = new Set();
  for (const key of ["require", "optional"]) {
    for (const spec of flags[key] ?? []) {
      const match = /^([a-z][a-z0-9.-]*)@(\d+\.\d+\.\d+)$/.exec(spec);
      if (!match || ids.has(match[1])) fail("requirements must be unique capability-id@exact-version pairs", "FORGEWAY_CAPABILITY_CHECK_INPUT_INVALID");
      ids.add(match[1]);
      requirements.push({ capability_id: match[1], capability_version: match[2], required: key === "require" });
    }
  }
  if (requirements.length === 0) fail("at least one --require or --optional is required", "FORGEWAY_CAPABILITY_CHECK_INPUT_INVALID");
  const selections = new Map();
  for (const spec of flags.select ?? []) {
    const match = /^([^=\s]+)=([^=\s]+)$/.exec(spec);
    if (!match || !ids.has(match[1]) || selections.has(match[1])) fail("--select must name one requested capability and one adapter", "FORGEWAY_CAPABILITY_CHECK_INPUT_INVALID");
    selections.set(match[1], match[2]);
  }
  if (!one(flags, "registry") || !one(flags, "adapters")) fail("--registry and --adapters are required", "FORGEWAY_CAPABILITY_CHECK_INPUT_INVALID");
  // Freeze both caller-supplied snapshots once. No discovery, installation or invocation.
  const registryBytes = readFileSync(one(flags, "registry"));
  const adapterBytes = readFileSync(one(flags, "adapters"));
  const inputs = { registry: JSON.parse(registryBytes.toString("utf8")), manifest: JSON.parse(adapterBytes.toString("utf8")) };
  capabilityResult("inspect", { registry: flags.registry }, inputs);
  validateAdapterManifest(inputs.manifest);
  const statuses = {
    CAPABILITY_MISSING: "capability-missing",
    CAPABILITY_VERSION_UNSUPPORTED: "version-unsupported",
    CAPABILITY_ADAPTER_MISSING: "adapter-missing",
    CAPABILITY_ADAPTER_SELECTION_INVALID: "selection-invalid"
  };
  const results = requirements.map((requirement) => {
    const selected = selections.get(requirement.capability_id);
    const request = { registry: flags.registry, adapters: flags.adapters, "capability-id": [requirement.capability_id], "capability-version": [requirement.capability_version] };
    if (selected) request["adapter-id"] = [selected];
    try {
      const resolution = capabilityResult("resolve", request, inputs);
      return { ...requirement, status: resolution.selection_required ? "selection-required" : "compatible", code: resolution.selection_required ? "CAPABILITY_AMBIGUOUS" : null, selected_adapter: resolution.selected_adapter, compatible_adapters: resolution.compatible_adapters };
    } catch (cause) {
      // Broken contracts are fatal even for optional requirements; only absence/selection is reportable.
      if (!Object.hasOwn(statuses, cause.code)) throw cause;
      return { ...requirement, status: statuses[cause.code], code: cause.code, selected_adapter: null, compatible_adapters: [] };
    }
  });
  const blockingCount = results.filter((item) => item.required && item.status !== "compatible").length;
  return {
    schema_version: "forgeway-capability-check/1",
    registry_contract: inputs.registry.contract_version,
    registry_sha256: sha256Bytes(registryBytes),
    adapters_sha256: sha256Bytes(adapterBytes),
    authorizes_execution: false,
    compatibility_satisfied: blockingCount === 0,
    blocking_count: blockingCount,
    warning_count: results.filter((item) => !item.required && item.status !== "compatible").length,
    requirements: results
  };
}

function standardsCommand(action, flags, positionals) {
  if (action !== "resolve" || positionals.length !== 2) fail("standards resolve does not accept extra arguments", "HTTP_API_RESOLVE_INPUT_INVALID");
  const allowed = new Set(["overrides", "compact"]);
  for (const [key, value] of Object.entries(flags)) {
    if (!allowed.has(key) || (key !== "compact" && value === true) || (key === "overrides" && value.length !== 1)) {
      fail(`invalid standards resolve option: --${key}`, "HTTP_API_RESOLVE_INPUT_INVALID");
    }
  }
  const overridePath = one(flags, "overrides");
  return resolveHttpApiProfile({ overrideBytes: overridePath ? readFileSync(overridePath) : undefined });
}

async function main() {
  const { positionals, flags } = parse(process.argv.slice(2));
  const [area, action] = positionals;
  if ((flags["read-only"] !== undefined || Object.keys(flags).some(key => key.startsWith("read-only="))) && (area !== "delivery" || action !== "package")) {
    fail("--read-only is supported only for delivery package", "PACKAGE_READ_ONLY_INVALID");
  }
  if ((area === "init" || area === "workspace") && flags.output !== undefined) fail("workspace commands emit stdout only", "WORKSPACE_INPUT_INVALID");
  if (area === "profile" && flags.output !== undefined) fail("profile commands emit stdout only", "PROFILE_INPUT_INVALID");
  if (area === "capability" && action === "check" && flags.output !== undefined) fail("capability check emits stdout only", "FORGEWAY_CAPABILITY_CHECK_INPUT_INVALID");
  if (area === "standards" && action === "resolve" && flags.output !== undefined) fail("standards resolve emits stdout only", "HTTP_API_RESOLVE_INPUT_INVALID");
  if (area === "browser" && flags.output !== undefined) fail("browser commands emit stdout only", "BROWSER_INPUT_INVALID");
  if (area === "pack" && flags.output !== undefined) fail("pack commands emit stdout only", "PACK_INPUT_INVALID");
  if (area === "maintenance" && flags.output !== undefined) fail("maintenance emits stdout only", "MAINTENANCE_INPUT_INVALID");
  if (area === "reference" && flags.output !== undefined) fail("reference lookup emits stdout only", "REFERENCE_LOOKUP_INPUT_INVALID");
  if (area === "artifact" && flags.output !== undefined) fail("artifact commands emit stdout only", "ARTIFACT_INPUT_INVALID");
  if (!area || area === "help" || one(flags, "help")) return emit(help(), flags);
  if (area === "version") return emit({ schema_version: CLI_VERSION, graph_version: GRAPH_VERSION }, flags);
  if (area === "init" || area === "workspace") return emit(workspaceCommand(positionals, flags), flags);
  if (area === "profile") {
    const result = profileCommand(positionals, flags);
    emit(result, flags);
    if (result.status === "invalid") process.exitCode = 2;
    else if (result.status !== "ready") process.exitCode = 3;
    return;
  }
  if (area === "maintenance") {
    const result = await maintenanceCommand(action, flags, positionals);
    emit(result, flags);
    if (["partial", "proposed-host-handoff"].includes(result.status)) process.exitCode = 3;
    return;
  }
  if (area === "reference") {
    if (action !== "lookup" || positionals.length !== 2) fail("reference lookup requires exactly one action", "REFERENCE_LOOKUP_INPUT_INVALID");
    return emit(await referenceLookup(flags), flags);
  }
  if (area === "graph") return graphCommand(action, flags);
  if (area === "delivery") return deliveryCommand(action, flags);
  if (area === "context") return contextCommand(action, flags);
  if (area === "standards") return emit(standardsCommand(action, flags, positionals), flags);
  if (area === "browser") {
    const { browserCommand } = await import("./browser/index.mjs");
    const result = await browserCommand(action, flags, positionals);
    emit(result, flags);
    if (result.status === "partial") process.exitCode = 3;
    return;
  }
  if (area === "pack") {
    const result = await packCommand(action, flags, positionals);
    emit(result, flags);
    if (result.ready === false) process.exitCode = 3;
    return;
  }
  if (area === "artifact") {
    const { payload, exitCode } = artifactCommand(action, flags, positionals);
    emit(payload, flags);
    if (exitCode !== 0) process.exitCode = exitCode;
    return;
  }
  if (area === "capability") {
    if (flags.view !== undefined || flags["result-ref"] !== undefined) {
      if (action !== "inspect" || positionals.length !== 2) fail("directory view requires capability inspect", "FORGEWAY_CAPABILITY_DIRECTORY_INPUT_INVALID");
      const result = await capabilityDirectory(flags, { inspect: (request, inputs) => capabilityResult("inspect", request, inputs), resolve: (request, inputs) => capabilityResult("resolve", request, inputs), validateAdapters: validateAdapterManifest });
      emit(result, flags);
      return;
    }
    if (action === "check" && positionals.length !== 2) fail("unexpected capability check arguments", "FORGEWAY_CAPABILITY_CHECK_INPUT_INVALID");
    if (action === "inspect" || action === "resolve") {
      if (positionals.length !== 2) fail(`unexpected capability ${action} arguments`, "FORGEWAY_CAPABILITY_INPUT_INVALID");
      const allowed = new Set(["registry", "capability-id", "capability-version", "compact", "output"]);
      if (action === "resolve") { allowed.add("adapters"); allowed.add("adapter-id"); }
      for (const key of Object.keys(flags)) {
        if (!allowed.has(key)) fail(`unsupported capability ${action} flag --${key}`, "FORGEWAY_CAPABILITY_INPUT_INVALID");
      }
    }
    const result = action === "check" ? capabilityCheck(flags) : capabilityResult(action, flags);
    emit(result, flags);
    if (action === "check" && !result.compatibility_satisfied) process.exitCode = 3;
    return;
  }
  fail(`unknown command: ${area}`, "FORGEWAY_COMMAND_UNKNOWN");
}

try {
  await main();
} catch (cause) {
  process.stderr.write(`${JSON.stringify({ schema_version: CLI_VERSION, error: { code: cause.code ?? "FORGEWAY_CLI_ERROR", message: cause.message } })}\n`);
  process.exitCode = cause.exitCode ?? 2;
}
