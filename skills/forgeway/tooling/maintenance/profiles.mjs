import path from "node:path";
import { lstat, open, realpath } from "node:fs/promises";
import { constants } from "node:fs";
import YAML from "yaml";
import { validateCapabilityRegistry } from "../capability-registry.mjs";
import { assert, digest, hash, relative, text } from "./common.mjs";
import { validateUserConfig } from "./config.mjs";
import { inspectLocalForgeway } from "./local.mjs";

export const PROFILE_KINDS = Object.freeze({
  "forgeway-distribution": "component", "skills-registry-v3": "component",
  "skills-package": "component", "node-cli-package": "component", "chrome-mv3": "component",
  "maintenance-config": "configuration", "native-messaging-host": "component",
  "native-host-registration": "configuration"
});
const ID = /^[a-z0-9][a-z0-9._-]{0,127}$/u;
const packageName = value => typeof value === "string" && /^(?:@[a-z0-9._-]+\/)?[a-z0-9][a-z0-9._-]*$/u.test(value) && value.length <= 128;
const OPERATIONS = ["inspect", "diagnose", "source-write", "config-write", "install", "activate", "loaded-readback", "usage-report"];
export function supportProjection(profile) {
  return OPERATIONS.map(operation => ({ operation, host: ["inspect", "diagnose"].includes(operation) ? "local-filesystem" : "native-owner-host", handler_available: Object.hasOwn(READERS, profile) && (operation === "inspect" || operation === "diagnose" && profile === "forgeway-distribution"), authorizes_execution: false, fixture_tested: "Not verified", live_qualified: "Not verified" }));
}
async function safePath(filename) {
  assert(typeof filename === "string" && !filename.split(/[\\/]/u).includes(".."), "MAINTENANCE_METADATA_PATH");
  const selected = path.resolve(filename);
  for (let current = selected;; current = path.dirname(current)) {
    assert(!(await lstat(current)).isSymbolicLink(), "MAINTENANCE_METADATA_SYMLINK");
    if (path.dirname(current) === current) break;
  }
  return selected;
}
function entryPath(value) {
  assert(typeof value === "string", "MAINTENANCE_METADATA_ENTRY");
  const clean = value.replace(/^\.\//u, "");
  assert(relative(clean) && !clean.split("/").some(part => part.startsWith(".")), "MAINTENANCE_METADATA_ENTRY");
  assert(/\.(?:[cm]?js|html)$/u.test(clean), "MAINTENANCE_METADATA_ENTRY_UNSUPPORTED");
  return clean;
}
async function readerContext(source, exclusions) {
  assert(source.local_path, "MAINTENANCE_SOURCE_HINT_MISSING");
  const root = await safePath(source.local_path); assert((await lstat(root)).isDirectory(), "MAINTENANCE_METADATA_ROOT");
  const files = new Map(); let total = 0;
  const read = async filename => {
    assert(relative(filename), "MAINTENANCE_METADATA_PATH");
    assert(!exclusions.some(rule => { const bound = rule.replace(/\/\*\*$/u, "").replace(/\/$/u, ""); const candidate = path.isAbsolute(bound) ? path.join(root, filename) : filename; return candidate === bound || candidate.startsWith(bound + "/"); }), "MAINTENANCE_METADATA_EXCLUDED");
    assert(files.has(filename) || files.size < 256, "MAINTENANCE_METADATA_LIMIT");
    const selected = await safePath(path.join(root, filename));
    const before = await lstat(selected);
    assert(before.isFile(), "MAINTENANCE_METADATA_REGULAR_FILE");
    // NONBLOCK also covers replacement by a FIFO between lstat and open.
    const handle = await open(selected, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
    try {
      const stat = await handle.stat();
      assert(stat.isFile() && stat.dev === before.dev && stat.ino === before.ino, "MAINTENANCE_METADATA_DRIFT");
      assert(stat.size <= 1024 * 1024 && stat.size < 8 * 1024 * 1024 - total, "MAINTENANCE_METADATA_LIMIT");
      // At most the observed size plus one overflow probe. Count actual bytes,
      // including probes and finish() re-reads, against the same 8 MiB budget.
      const data = Buffer.alloc(stat.size + 1); let length = 0;
      while (length < data.length) {
        const result = await handle.read(data, length, data.length - length, null);
        total += result.bytesRead; length += result.bytesRead;
        if (!result.bytesRead) break;
      }
      const after = await handle.stat(), named = await lstat(selected);
      assert(length === stat.size && after.size === stat.size && after.mtimeMs === stat.mtimeMs && after.ctimeMs === stat.ctimeMs && named.isFile() && named.dev === stat.dev && named.ino === stat.ino && await realpath(selected) === selected, "MAINTENANCE_METADATA_DRIFT");
      const bytes = data.subarray(0, length); files.set(filename, digest(bytes)); return bytes;
    } finally { await handle.close(); }
  };
  return { root, files, read, async finish() { const before = [...files]; for (const [file, sha] of before) assert(digest(await read(file)) === sha, "MAINTENANCE_METADATA_DRIFT"); return Object.fromEntries([...files].sort()); } };
}
// Shared explicit-file boundary; no discovery, source authentication or execution.
export async function readMetadataSnapshot(filename) {
  const selected = await safePath(filename);
  const ctx = await readerContext({ local_path: path.dirname(selected) }, []);
  const bytes = await ctx.read(path.basename(selected));
  await ctx.finish();
  return bytes;
}
const unit = (root, metadata, extra = {}) => ({ unit_key: hash(path.dirname(path.join(root, metadata))), status: "observed", presence: "physically-observed", ...extra });
const json = bytes => { try { return JSON.parse(bytes); } catch { assert(false, "MAINTENANCE_METADATA_JSON"); } };
async function skillsRegistry(ctx, filename) {
  assert(path.basename(filename) === "skills-index.json", "MAINTENANCE_METADATA_PATH");
  const catalogBytes = await ctx.read(filename), catalog = json(catalogBytes);
  assert(catalog.version === 3 && catalog.contract_version === "capability-registry/3" && Array.isArray(catalog.packages) && catalog.packages.length <= 512 && Array.isArray(catalog.capabilities) && catalog.capabilities.length <= 2048, "MAINTENANCE_REGISTRY_VERSION");
  let closure = false;
  try { validateCapabilityRegistry(catalog); closure = true; } catch { /* Every declared package remains in the failed denominator. */ }
  const components = catalog.packages.map((pkg, index) => {
    const valid = closure && typeof pkg?.name === "string" && ID.test(pkg.name) && typeof pkg?.owner === "string" && ID.test(pkg.owner) && Array.isArray(pkg?.capability_ids) && pkg.capability_ids.every(id => typeof id === "string" && /^[a-z0-9][a-z0-9.-]{0,127}$/u.test(id));
    return { unit_key: typeof pkg?.name === "string" && ID.test(pkg.name) ? hash(path.join(ctx.root, path.dirname(filename), "skills", pkg.name)) : hash({ catalog: path.join(ctx.root, filename), invalid_index: index }), presence: "declared", declared_index: index, status: valid ? "observed" : "invalid", ...(valid ? { name: pkg.name, declared_owner: pkg.owner, capability_ids: pkg.capability_ids } : { error: "MAINTENANCE_REGISTRY_ENTRY" }) };
  });
  return { catalog_sha256: digest(catalogBytes), contract_version: catalog.contract_version, components, status: closure && components.every(row => row.status === "observed") ? "observed" : "invalid", validation_scope: "v3 package identity and bidirectional capability reference closure; declarations are not source authentication" };
}
async function skillPackage(ctx, filename) {
  assert(path.basename(filename) === "SKILL.md", "MAINTENANCE_METADATA_PATH");
  const content = (await ctx.read(filename)).toString("utf8"), front = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/u.exec(content);
  assert(front, "MAINTENANCE_SKILL_METADATA");
  const doc = YAML.parseDocument(front[1], { uniqueKeys: true, customTags: [] });
  assert(!doc.errors.length && !doc.warnings.length, "MAINTENANCE_SKILL_METADATA");
  const fields = doc.toJS({ maxAliasCount: 0 }); assert(typeof fields?.name === "string" && ID.test(fields.name) && text(fields.description), "MAINTENANCE_SKILL_METADATA");
  return { components: [unit(ctx.root, filename, { name: fields.name, description_present: true })] };
}
async function nodeCli(ctx, filename) {
  assert(path.basename(filename) === "package.json", "MAINTENANCE_METADATA_PATH");
  const pkg = json(await ctx.read(filename)); assert(packageName(pkg.name) && pkg.bin && (typeof pkg.bin === "string" || typeof pkg.bin === "object" && !Array.isArray(pkg.bin)), "MAINTENANCE_CLI_METADATA");
  const bins = typeof pkg.bin === "string" ? { [pkg.name.split("/").at(-1)]: pkg.bin } : pkg.bin;
  assert(Object.keys(bins).length > 0 && Object.keys(bins).length <= 32, "MAINTENANCE_CLI_METADATA");
  const entries = [];
  for (const [command, target] of Object.entries(bins)) { assert(ID.test(command), "MAINTENANCE_METADATA_ENTRY"); const file = path.posix.join(path.posix.dirname(filename), entryPath(target)); await ctx.read(file); entries.push({ command, path: file }); }
  const validVersion = value => {
    if (typeof value !== "string") return false;
    const match = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z.-]+))?(?:\+([0-9A-Za-z.-]+))?$/u.exec(value);
    return !!match && [match[4], match[5]].every(part => part === undefined || part.split(".").every(id => id.length > 0)) && (match[4] === undefined || match[4].split(".").every(id => !/^\d+$/u.test(id) || id === "0" || !id.startsWith("0")));
  };
  assert(pkg.version === undefined || validVersion(pkg.version), "MAINTENANCE_CLI_METADATA");
  return { components: [unit(ctx.root, filename, { name: pkg.name, version: pkg.version ?? null, version_status: pkg.version ? "declared" : "unknown", entries, scripts_executed: false })] };
}
async function chromeMv3(ctx, filename) {
  assert(path.basename(filename) === "manifest.json", "MAINTENANCE_METADATA_PATH");
  const manifest = json(await ctx.read(filename)); assert(manifest.manifest_version === 3 && text(manifest.name) && typeof manifest.version === "string" && /^\d+(?:\.\d+){0,3}$/u.test(manifest.version), "MAINTENANCE_MV3_METADATA");
  const entries = [manifest.background?.service_worker, manifest.action?.default_popup, manifest.options_page, ...(manifest.content_scripts ?? []).flatMap(row => row.js ?? [])].filter(value => value !== undefined);
  assert(entries.length > 0 && entries.length <= 64, "MAINTENANCE_METADATA_ENTRY");
  for (const entry of entries) await ctx.read(path.posix.join(path.posix.dirname(filename), entryPath(entry)));
  return { components: [unit(ctx.root, filename, { name: manifest.name, version: manifest.version, manifest_version: 3, entries, permissions_status: "declaration-only", loaded: "Not verified" })] };
}
async function configuration(ctx, filename) {
  const config = validateUserConfig(json(await ctx.read(filename)));
  return { components: [], configuration: { source_hint_count: config.sources.length, exclusion_count: config.exclude.length, language_present: config.language !== undefined } };
}
const READERS = Object.freeze({ "skills-registry-v3": skillsRegistry, "skills-package": skillPackage, "node-cli-package": nodeCli, "chrome-mv3": chromeMv3, "maintenance-config": configuration, "forgeway-distribution": inspectLocalForgeway });

export function createMetadataCollector(config) {
  config = validateUserConfig(config);
  return { id: "forgeway-explicit-metadata/2", async collect(subject) {
    const source = config.sources.find(item => item.id === subject.source_id);
    if (source?.ownership === "external") return { metadata: { status: "external-reference", components: [], managed_eligibility: false }, limitations: ["External dependency is not a self-owned maintenance target"] };
    if (!Object.hasOwn(READERS, subject.profile)) return { metadata: { status: "unsupported", components: [] }, limitations: ["No native reader for the selected profile"] };
    try {
      assert(source?.local_path && source.metadata_path, "MAINTENANCE_SOURCE_HINT_MISSING");
      assert(!source.profile || source.profile === subject.profile, "MAINTENANCE_PROFILE_SOURCE_MISMATCH");
      if (subject.profile === "forgeway-distribution") {
        assert(source.metadata_path === "package.json", "MAINTENANCE_METADATA_PATH");
        const result = await inspectLocalForgeway({ sourceRoot: source.local_path, config }); const observed = result.local_readback.source;
        return { source: { identity: `registered:${source.id}`, revision: `snapshot:${observed.snapshot_sha256}`, sha256: observed.snapshot_sha256, trusted: false, evidence_ref: `metadata:${observed.snapshot_sha256}`, collector: "forgeway-explicit-metadata/2", scope: [subject.id] }, metadata: { status: "observed", root: observed.root, files: observed.files, components: [unit(observed.root, "package.json", { name: "forgeway" })] } };
      }
      const ctx = await readerContext(source, config.exclude), metadata = await READERS[subject.profile](ctx, source.metadata_path), files = await ctx.finish(), sha = hash(files);
      const components = (metadata.components ?? []).map(component => ({ ...component, support: supportProjection(subject.profile) }));
      return { source: { identity: `registered:${source.id}`, revision: `snapshot:${sha}`, sha256: sha, trusted: false, evidence_ref: `metadata:${sha}`, collector: "forgeway-explicit-metadata/2", scope: [subject.id] }, metadata: { ...metadata, components, status: metadata.status ?? "observed", source_id: source.id, root: ctx.root, files, source_authentication: "Not verified", installed: "Not verified", loaded: "Not verified", usage: "unknown" } };
    } catch (error) { return { metadata: { status: error.code === "MAINTENANCE_METADATA_ENTRY_UNSUPPORTED" ? "unsupported" : "invalid", components: [], error: /^MAINTENANCE_[A-Z_]+$/u.test(error.code ?? "") ? error.code : "MAINTENANCE_METADATA_UNREADABLE" } }; }
  } };
}
