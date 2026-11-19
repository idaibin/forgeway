import { readFile, readdir, lstat, mkdir, writeFile, unlink, realpath, rename, chmod, open } from "node:fs/promises";
import { execFileSync, spawnSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const MAINTENANCE_FILES = [
  "product/iteration-readiness.md",
  "product/iteration-plan.md",
  "product/iteration-tasks.md",
];

function contained(root, relative) {
  const result = path.resolve(root, relative);
  if (path.isAbsolute(relative) || result === root || !result.startsWith(root + path.sep)) {
    throw new Error(`Path leaves package: ${relative}`);
  }
  return result;
}

async function exists(filename) {
  try { return await lstat(filename); }
  catch (error) { if (error.code === "ENOENT") return null; throw error; }
}

export async function distributionFiles(root) {
  const manifest = JSON.parse(await readFile(path.join(root, "package.json"), "utf8"));
  const files = new Set(["package.json"]);
  async function visit(relative) {
    const filename = contained(root, relative);
    const info = await lstat(filename);
    if (info.isSymbolicLink()) throw new Error(`Distribution symlink: ${relative}`);
    if (info.isDirectory()) {
      for (const entry of await readdir(filename)) await visit(path.posix.join(relative, entry));
    } else if (info.isFile()) files.add(relative);
  }
  for (const entry of manifest.files) await visit(entry.replace(/\/$/, ""));
  for (const entry of ["LICENSE", "LICENSE.md"]) {
    if (await exists(path.join(root, entry))) await visit(entry);
  }
  for (const filename of files) {
    if (MAINTENANCE_FILES.includes(filename) || filename.split("/").some(part => part.startsWith("."))) {
      throw new Error(`Maintenance file in distribution: ${filename}`);
    }
  }
  return [...files].sort();
}

async function safeTargetPath(target, relative) {
  const filename = contained(target, relative);
  let current = filename;
  while (true) {
    const info = await exists(current);
    if (info?.isSymbolicLink()) throw new Error(`Target symlink: ${current}`);
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }
  return filename;
}

async function canonicalTarget(target) {
  if (typeof target !== "string" || target.split(/[\\/]/u).includes("..")) throw new Error("Target path alias is not permitted");
  // Inspect the original lexical ancestors before realpath can erase symlinks.
  await safeTargetPath(path.resolve(target), ".forgeway-path-check");
  let ancestor = path.resolve(target);
  const suffix = [];
  while (!(await exists(ancestor))) {
    suffix.unshift(path.basename(ancestor));
    ancestor = path.dirname(ancestor);
  }
  if (suffix.length === 0 && (await lstat(ancestor)).isSymbolicLink()) {
    throw new Error(`Target symlink: ${ancestor}`);
  }
  return path.resolve(await realpath(ancestor), ...suffix);
}

function cliContents(target) {
  const quoted = path.join(target, "tooling/forgeway.mjs").replaceAll("'", "'\\''");
  return `#!/bin/sh\nexec node '${quoted}' "$@"\n`;
}

function headBytes(source, relative) {
  try { return execFileSync("git", ["-C", source, "show", `HEAD:${relative}`], { stdio: ["ignore", "pipe", "ignore"], maxBuffer: 20_000_000 }); }
  catch { return null; }
}

const INSTALL_STATE = ".forgeway-install.json";
const digest = (data) => createHash("sha256").update(data).digest("hex");

const INSTALL_JOURNAL = ".forgeway-install-journal.json";
const INSTALL_LOCK = ".forgeway-install.lock";
const prepared = new WeakMap();
const snapshotHash = entries => digest(JSON.stringify(entries.map(entry => [entry.relative, digest(entry.data), entry.mode])));
const encoded = bytes => bytes === null ? null : bytes.toString("base64");
const decoded = bytes => bytes === null ? null : Buffer.from(bytes, "base64");

async function fileState(target, relative) {
  const filename = await safeTargetPath(target, relative), info = await exists(filename);
  if (!info) return { bytes: null, mode: null };
  if (!info.isFile()) throw new Error(`Target is not a file: ${relative}`);
  return { bytes: await readFile(filename), mode: info.mode & 0o777 };
}
function sameState(left, right) {
  return left.mode === right.mode && (left.bytes === null ? right.bytes === null : right.bytes !== null && left.bytes.equals(right.bytes));
}
async function captureSource(source) {
  const entries = [];
  for (const relative of await distributionFiles(source)) {
    if (relative !== path.posix.normalize(relative) || relative.includes("\\")) throw new Error(`Invalid source path: ${relative}`);
    const filename = contained(source, relative);
    entries.push({ relative, data: await readFile(filename), mode: (await lstat(filename)).mode & 0o777 });
  }
  return entries;
}
async function atomicWrite(target, relative, data, mode = 0o600, expected = undefined) {
  const destination = await safeTargetPath(target, relative);
  await mkdir(path.dirname(destination), { recursive: true });
  const staged = `${destination}.forgeway-${randomUUID()}`;
  try {
    const handle = await open(staged, "wx", mode);
    try { await handle.writeFile(data); await handle.sync(); } finally { await handle.close(); }
    await safeTargetPath(target, relative);
    if (expected !== undefined && !sameState(await fileState(target, relative), expected)) throw new Error(`Installed state changed: ${relative}`);
    await rename(staged, destination);
  } finally { await unlink(staged).catch(() => {}); }
}
async function acquireInstallLock(target) {
  await safeTargetPath(target, INSTALL_LOCK); await mkdir(target, { recursive: true });
  const filename = await safeTargetPath(target, INSTALL_LOCK);
  const token = randomUUID();
  const handle = await open(filename, "wx", 0o600).catch(error => { throw Object.assign(new Error("Install writer active or stale lock requires explicit reconciliation"), { code: error.code }); });
  await handle.writeFile(JSON.stringify({ token, pid: process.pid })); await handle.close();
  return async () => {
    await safeTargetPath(target, INSTALL_LOCK);
    if (JSON.parse(await readFile(filename, "utf8")).token !== token) throw new Error("Install lease changed");
    await unlink(filename);
  };
}

function validateExpectedInstalledFiles(expectedInstalledFiles) {
  if (!Array.isArray(expectedInstalledFiles)) throw new Error("Expected installed files must be an array");
  const expected = new Map();
  for (const entry of expectedInstalledFiles) {
    if (!entry || typeof entry.relative !== "string" || typeof entry.sha256 !== "string") throw new Error("Expected installed file must include relative path and SHA-256");
    const relative = entry.relative;
    if (path.isAbsolute(relative) || path.win32.isAbsolute(relative) || relative.includes("\\") || relative !== path.posix.normalize(relative) || relative.split("/").some(part => part === "" || part === "." || part === "..")) throw new Error(`Invalid expected installed path: ${relative}`);
    if (!/^[a-f0-9]{64}$/u.test(entry.sha256)) throw new Error(`Invalid expected installed SHA-256: ${relative}`);
    if (expected.has(relative)) throw new Error(`Duplicate expected installed path: ${relative}`);
    expected.set(relative, entry.sha256);
  }
  return expected;
}

export async function prepareInstall(source, target, { updateFromHead = false, expectedInstalledFiles = [], binDir = null, runtimeDependencies = false, runningRoot = null, sourceIdentity = null } = {}) {
  source = await realpath(source); target = await canonicalTarget(target);
  if (source === target || target.startsWith(source + path.sep) || source.startsWith(target + path.sep)) throw new Error("Source and target overlap");
  if (runningRoot) {
    const running = await realpath(runningRoot);
    if (running === target || running.startsWith(target + path.sep) || target.startsWith(running + path.sep)) throw new Error("Running installation cannot be overwritten; prepare a separate candidate");
  }
  if (await exists(await safeTargetPath(target, INSTALL_JOURNAL))) throw new Error("Partial installation requires reconciliation before retry");
  const entries = await captureSource(source), files = entries.map(entry => entry.relative), currentFiles = new Set(files);
  const expected = validateExpectedInstalledFiles(expectedInstalledFiles);
  const stateBefore = await fileState(target, INSTALL_STATE);
  const priorState = stateBefore.bytes ? JSON.parse(stateBefore.bytes) : null;
  if (priorState && (!["forgeway-install/1", "forgeway-install/2"].includes(priorState.schema_version) || !priorState.files || typeof priorState.files !== "object" || Array.isArray(priorState.files))) throw new Error("Installed state is invalid");
  for (const [relative, expectedHash] of expected) {
    if (!currentFiles.has(relative)) throw new Error(`Expected installed path is not in current distribution: ${relative}`);
    if (!Object.hasOwn(priorState?.files ?? {}, relative)) throw new Error(`Expected installed path is not owned by prior install: ${relative}`);
    const before = await fileState(target, relative);
    if (before.bytes === null) throw new Error(`Expected installed file is missing: ${relative}`);
    if (digest(before.bytes) !== expectedHash) throw new Error(`Expected installed SHA-256 differs: ${relative}`);
    const sourceEntry = entries.find(entry => entry.relative === relative);
    if (before.bytes.equals(sourceEntry.data)) throw new Error(`Expected installed file has no content drift: ${relative}`);
  }
  const operations = [], beforeFiles = [];
  const reconciled = [];
  for (const entry of entries) {
    const before = await fileState(target, entry.relative);
    beforeFiles.push({ relative: entry.relative, before });
    if (before.bytes !== null && !before.bytes.equals(entry.data)) {
      const oldHead = updateFromHead ? headBytes(source, entry.relative) : null;
      const beforeHash = digest(before.bytes);
      const expectedHash = expected.get(entry.relative);
      if (priorState?.files[entry.relative] !== beforeHash && (!oldHead || !before.bytes.equals(oldHead)) && expectedHash !== beforeHash) throw new Error(`Installed file differs: ${entry.relative}`);
      if (expectedHash === beforeHash) reconciled.push({ path: entry.relative, prior_sha256: beforeHash, source_sha256: digest(entry.data) });
    }
    if (before.bytes === null || !before.bytes.equals(entry.data) || before.mode !== entry.mode) operations.push({ relative: entry.relative, before, after: { bytes: entry.data, mode: entry.mode }, kind: before.bytes === null ? "new" : "replacement" });
  }
  const retiredFiles = new Set();
  for (const [relative, expected] of Object.entries(priorState?.files ?? {})) {
    // Validate all ownership paths, including records that currently remain distributed.
    contained(target, relative);
    if (relative !== path.posix.normalize(relative) || relative.includes("\\") || relative.endsWith("/")) throw new Error(`Invalid retired path: ${relative}`);
    if (typeof expected !== "string" || !/^[a-f0-9]{64}$/u.test(expected)) throw new Error(`Installed state is invalid: ${relative}`);
    if (currentFiles.has(relative)) continue;
    retiredFiles.add(relative);
    let before;
    try { before = await fileState(target, relative); } catch (error) { if (error.message.includes("Target is not a file")) throw new Error(`Retired file differs: ${relative}`); throw error; }
    if (before.bytes === null) continue;
    if (digest(before.bytes) !== expected) throw new Error(`Retired file differs: ${relative}`);
    operations.push({ relative, before, after: { bytes: null, mode: null }, kind: "retired" });
  }
  for (const relative of MAINTENANCE_FILES) {
    if (retiredFiles.has(relative)) continue;
    const before = await fileState(target, relative);
    if (before.bytes === null) continue;
    const data = await readFile(contained(source, relative));
    if (!before.bytes.equals(data)) throw new Error(`Installed maintenance record differs: ${relative}`);
    operations.push({ relative, before, after: { bytes: null, mode: null }, kind: "maintenance" });
  }
  let cli = null;
  if (binDir) {
    const directory = await canonicalTarget(binDir), before = await fileState(directory, "forgeway"), data = Buffer.from(cliContents(target));
    if (before.bytes && !before.bytes.equals(data)) throw new Error(`CLI command conflicts: ${path.join(directory, "forgeway")}`);
    cli = { directory, before, after: { bytes: data, mode: 0o755 }, missing: before.bytes === null };
  }
  const manifest = JSON.parse(entries.find(entry => entry.relative === "package.json").data);
  const runtimeNeeded = Boolean(cli || runtimeDependencies);
  const lock = entries.find(entry => entry.relative === "package-lock.json");
  const hasDependencies = Object.keys(manifest.dependencies ?? {}).length > 0;
  if (runtimeNeeded && hasDependencies && !lock) throw new Error("CLI runtime requires package-lock.json");
  const runtimeLock = runtimeNeeded && lock ? digest(lock.data) : null;
  const retainedRuntimeLock = !runtimeNeeded && lock && priorState?.runtime?.status === "verified" && priorState.runtime.lock_sha256 === digest(lock.data) ? digest(lock.data) : null;
  if (reconciled.length !== expected.size) throw new Error("Expected installed-file authorization was not consumed by a replacement");
  const summary = Object.freeze({ files: entries.length, missing: operations.filter(entry => entry.kind === "new").length, replacements: operations.filter(entry => entry.kind === "replacement").length, retired: operations.filter(entry => entry.kind === "retired").length, maintenance: operations.filter(entry => entry.kind === "maintenance").length, reconciled, snapshot_sha256: snapshotHash(entries), runtime_dependency_management: Boolean(runtimeLock), dependency_refresh: Boolean(runtimeLock && (priorState?.runtime?.lock_sha256 !== runtimeLock || priorState?.runtime?.status !== "verified")), source: sourceIdentity, target, cli: cli ? { path: path.join(cli.directory, "forgeway"), missing: cli.missing } : null });
  prepared.set(summary, { source, target, entries, operations, beforeFiles, stateBefore, cli, runtimeLock, retainedRuntimeLock, runtimeNeeded, sourceIdentity });
  return summary;
}

function npmCommand(target, args) {
  const result = spawnSync("npm", args, { cwd: target, encoding: "utf8", timeout: 300000, maxBuffer: 20_000_000 });
  if (result.error || result.status !== 0) throw Object.assign(new Error(`CLI runtime dependency ${args[0]} failed`), { output: result.stderr, exit_code: result.status });
  return result;
}
// npm ls accepts semver-compatible drift; it does not establish lock identity.
export async function verifyRuntimeLock(target) {
  const lock = JSON.parse(await readFile(await safeTargetPath(target, "package-lock.json")));
  if (![2, 3].includes(lock.lockfileVersion) || !lock.packages) throw new Error("Unsupported runtime lockfile");
  const manifest = JSON.parse(await readFile(await safeTargetPath(target, "package.json")));
  const root = lock.packages[""];
  if (!root || root.name !== manifest.name || root.version !== manifest.version) throw new Error("Runtime lock root identity mismatch");
  const entries = value => Object.entries(value ?? {}).sort(([a], [b]) => a.localeCompare(b));
  for (const field of ["dependencies", "optionalDependencies", "peerDependencies", "peerDependenciesMeta"]) {
    if (JSON.stringify(entries(root[field])) !== JSON.stringify(entries(manifest[field]))) throw new Error(`Runtime lock root dependency mismatch: ${field}`);
  }
  let installed = { packages: {} };
  const hidden = await fileState(target, "node_modules/.package-lock.json");
  if (hidden.bytes) installed = JSON.parse(hidden.bytes);
  if (!installed.packages) throw new Error("Runtime dependency inventory unavailable");
  const unverifiedSpecifications = [];
  // A self-consistent empty inventory is not evidence that declared runtime
  // dependencies exist. Validate required lock edges before checking inventory.
  for (const [location, entry] of Object.entries(lock.packages)) {
    if (entry.dev === true || (location && !installed.packages[location] && (entry.optional === true || entry.devOptional === true))) continue;
    // Peer placement and optional/platform semantics need the package manager's
    // tree validator; observing their files alone is not full dependency proof.
    for (const [name, request] of Object.entries(entry.peerDependencies ?? {})) unverifiedSpecifications.push({ location, dependency: name, request, kind: "peer" });
    for (const [name, request] of Object.entries(entry.optionalDependencies ?? {})) unverifiedSpecifications.push({ location, dependency: name, request, kind: "optional" });
    const required = [...Object.entries(entry.dependencies ?? {}), ...Object.entries(entry.peerDependencies ?? {}).filter(([name]) => entry.peerDependenciesMeta?.[name]?.optional !== true)];
    for (const [name, request] of required) {
      if (entry.optionalDependencies?.[name] !== undefined) continue;
      let parent = location, found = false;
      while (true) {
        const resolved = path.posix.join(parent, "node_modules", name), candidate = lock.packages[resolved];
        if (candidate && candidate.dev !== true && installed.packages[resolved]) {
          if (typeof request === "string" && /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/u.test(request)) {
            if (candidate.version !== request) throw new Error(`Runtime required dependency version mismatch: ${location}:${name}`);
          } else if (typeof request === "string" && request.startsWith("file:") && !candidate.link) {
            if (candidate.resolved !== request) throw new Error(`Runtime required dependency file identity mismatch: ${location}:${name}`);
          } else unverifiedSpecifications.push({ location, dependency: name, request });
          found = true; break;
        }
        if (!parent) break;
        parent = path.posix.dirname(parent); if (parent === ".") parent = "";
      }
      if (!found) throw new Error(`Runtime required dependency missing from lock/inventory: ${location}:${name}`);
    }
  }
  for (const [relative, actual] of Object.entries(installed.packages)) {
    if (!relative) continue;
    const expected = lock.packages[relative];
    if (!expected || expected.dev === true || expected.link || actual.link || !relative.startsWith("node_modules/")) throw new Error(`Runtime dependency outside lock: ${relative}`);
    for (const key of ["version", "resolved", "integrity"]) if ((actual[key] ?? null) !== (expected[key] ?? null)) throw new Error(`Runtime dependency lock mismatch: ${relative}:${key}`);
    const manifest = JSON.parse((await fileState(target, path.posix.join(relative, "package.json"))).bytes);
    if (manifest.version !== expected.version) throw new Error(`Runtime dependency version mismatch: ${relative}`);
    const expectedName = expected.name ?? relative.slice(relative.lastIndexOf("node_modules/") + "node_modules/".length);
    if (manifest.name !== expectedName) throw new Error(`Runtime dependency package identity mismatch: ${relative}`);
  }
  for (const [relative, expected] of Object.entries(lock.packages)) {
    if (!relative || expected.dev === true || expected.optional === true || expected.devOptional === true) continue;
    if (!installed.packages[relative]) throw new Error(`Runtime dependency missing: ${relative}`);
  }
  // npm ls supplies range/alias semantics during installation. A pure read-only
  // caller must retain Not verified for these unsupported specifications.
  return { unverified_specifications: unverifiedSpecifications };
}
export async function applyInstall(plan, { dependencyRunner = npmCommand, checkpoint = async () => {} } = {}) {
  const state = prepared.get(plan);
  if (!state) throw new Error("Installation must be prepared in this process");
  const { source, target, entries, operations, beforeFiles, stateBefore, cli, runtimeLock, retainedRuntimeLock, runtimeNeeded, sourceIdentity } = state;
  const assertSource = async () => { if (snapshotHash(await captureSource(source)) !== plan.snapshot_sha256) throw new Error("Source snapshot changed"); };
  await assertSource();
  await checkpoint("before-lock");
  const release = await acquireInstallLock(target);
  let mutationStarted = false, primaryError = null;
  const journal = { schema_version: "forgeway-install-journal/1", target, source_snapshot_sha256: plan.snapshot_sha256, phase: "applying", dependency_refresh_started: false, cli: cli ? { directory: cli.directory, before: { bytes: encoded(cli.before.bytes), mode: cli.before.mode }, after: { bytes: encoded(cli.after.bytes), mode: cli.after.mode } } : null, operations: [...operations, { relative: INSTALL_STATE, before: stateBefore, after: { bytes: null, mode: null }, kind: "state" }].map(entry => ({ relative: entry.relative, before: { bytes: encoded(entry.before.bytes), mode: entry.before.mode }, after: { bytes: encoded(entry.after.bytes), mode: entry.after.mode }, kind: entry.kind })) };
  const saveJournal = () => atomicWrite(target, INSTALL_JOURNAL, JSON.stringify(journal), 0o600);
  try {
    if (await exists(await safeTargetPath(target, INSTALL_JOURNAL))) throw new Error("Partial installation requires reconciliation before retry");
    await assertSource();
    for (const entry of [...beforeFiles, ...operations]) if (!sameState(await fileState(target, entry.relative), entry.before)) throw new Error(`Installed file changed: ${entry.relative}`);
    if (!sameState(await fileState(target, INSTALL_STATE), stateBefore)) throw new Error("Installed state changed");
    if (cli && !sameState(await fileState(cli.directory, "forgeway"), cli.before)) throw new Error("CLI command changed");
    // Retain old runtime evidence only after fresh readback; this branch never installs.
    if (retainedRuntimeLock) {
      await dependencyRunner(target, ["ls", "--omit=dev", "--all", "--json"]);
      await verifyRuntimeLock(target);
    }
    await saveJournal(); mutationStarted = true;
    for (let index = 0; index < operations.length; index++) {
      const entry = operations[index];
      await checkpoint("before-file", { index, relative: entry.relative });
      await assertSource();
      if (!sameState(await fileState(target, entry.relative), entry.before)) throw new Error(`Installed file changed: ${entry.relative}`);
      if (entry.after.bytes === null) await unlink(await safeTargetPath(target, entry.relative));
      else await atomicWrite(target, entry.relative, entry.after.bytes, entry.after.mode);
      await checkpoint("after-file", { index, relative: entry.relative });
    }
    if (runtimeLock) {
      let verified = false;
      if (!plan.dependency_refresh) { try { await dependencyRunner(target, ["ls", "--omit=dev", "--all", "--json"]); await verifyRuntimeLock(target); verified = true; } catch {} }
      if (!verified) {
        journal.dependency_refresh_started = true; await saveJournal();
        await checkpoint("before-dependencies");
        await dependencyRunner(target, ["ci", "--omit=dev", "--ignore-scripts"]);
        await dependencyRunner(target, ["ls", "--omit=dev", "--all", "--json"]);
        await verifyRuntimeLock(target);
      }
    }
    await checkpoint("before-state");
    await assertSource();
    const actualFiles = {};
    for (const entry of entries) {
      const actual = await fileState(target, entry.relative);
      if (!sameState(actual, { bytes: entry.data, mode: entry.mode })) throw new Error(`Installed readback differs: ${entry.relative}`);
      actualFiles[entry.relative] = digest(actual.bytes);
    }
    const installState = { schema_version: "forgeway-install/2", files: actualFiles, source: { declared_identity: sourceIdentity, snapshot_sha256: plan.snapshot_sha256, authentication: "host-verification-required" }, runtime: { status: runtimeNeeded || retainedRuntimeLock ? "verified" : "not-requested", lock_sha256: runtimeLock ?? retainedRuntimeLock }, loaded: "not-verified" };
    const finalBytes = Buffer.from(JSON.stringify(installState));
    journal.operations.at(-1).after = { bytes: encoded(finalBytes), mode: 0o600 };
    await saveJournal();
    await atomicWrite(target, INSTALL_STATE, finalBytes, 0o600, stateBefore);
    // Publishing a new wrapper is the last step; replacing an active wrapper is
    // a separate host-owned activation, never part of in-place installation.
    if (cli?.missing) {
      await checkpoint("before-wrapper");
      if (!sameState(await fileState(cli.directory, "forgeway"), cli.before)) throw new Error("CLI command changed");
      await mkdir(cli.directory, { recursive: true });
      await writeFile(await safeTargetPath(cli.directory, "forgeway"), cli.after.bytes, { flag: "wx", mode: 0o755 });
      await chmod(path.join(cli.directory, "forgeway"), 0o755);
      if (!sameState(await fileState(cli.directory, "forgeway"), cli.after)) throw new Error("CLI command readback differs");
    }
    await checkpoint("after-wrapper");
    await assertSource();
    for (const entry of entries) if (!sameState(await fileState(target, entry.relative), { bytes: entry.data, mode: entry.mode })) throw new Error(`Installed readback differs: ${entry.relative}`);
    if (!sameState(await fileState(target, INSTALL_STATE), { bytes: finalBytes, mode: 0o600 })) throw new Error("Installed state readback differs");
    await unlink(await safeTargetPath(target, INSTALL_JOURNAL));
    return { ...plan, copied: plan.missing, updated: plan.replacements, removed: plan.retired + plan.maintenance, check: false, status: "prepared", cli: plan.cli ? { ...plan.cli, installed: cli.missing } : null };
  } catch (error) {
    primaryError = error;
    if (mutationStarted) {
      error.code = "FORGEWAY_INSTALL_PARTIAL";
      error.installation = { status: "partial", target, snapshot_sha256: plan.snapshot_sha256, reconciliation_required: true };
    }
    throw error;
  } finally {
    try { await release(); } catch (cleanupError) {
      if (primaryError) primaryError.cleanup_error = cleanupError.message;
      else throw Object.assign(cleanupError, { code: "FORGEWAY_INSTALL_PARTIAL", installation: { status: "partial", target, reconciliation_required: true } });
    }
  }
}

export async function verifyPreparedInstall(plan, { dependencyRunner = npmCommand } = {}) {
  const state = prepared.get(plan);
  if (!state) throw new Error("Installation must be prepared in this process");
  for (const entry of state.entries) {
    if (!sameState(await fileState(state.target, entry.relative), { bytes: entry.data, mode: entry.mode })) throw new Error(`Installed readback differs: ${entry.relative}`);
  }
  if (state.runtimeLock || state.retainedRuntimeLock) { await dependencyRunner(state.target, ["ls", "--omit=dev", "--all", "--json"]); await verifyRuntimeLock(state.target); }
  return { snapshot_sha256: plan.snapshot_sha256, target: state.target, runtime: state.runtimeNeeded || state.retainedRuntimeLock ? "verified" : "not-requested" };
}

export async function reconcileInstall(target) {
  target = await canonicalTarget(target);
  const filename = await safeTargetPath(target, INSTALL_JOURNAL);
  if (!(await exists(filename))) return { status: "no-pending-install", target, operations: [] };
  const raw = await readFile(filename), journal = JSON.parse(raw);
  if (journal.schema_version !== "forgeway-install-journal/1" || journal.target !== target || !Array.isArray(journal.operations)) throw new Error("Invalid install journal");
  const operations = [];
  for (const entry of journal.operations) {
    if (entry.relative !== path.posix.normalize(entry.relative) || entry.relative.includes("\\") || [INSTALL_JOURNAL, INSTALL_LOCK].includes(entry.relative)) throw new Error("Invalid recovery path");
    const current = await fileState(target, entry.relative);
    const before = { bytes: decoded(entry.before.bytes), mode: entry.before.mode }, after = { bytes: decoded(entry.after.bytes), mode: entry.after.mode };
    operations.push({ relative: entry.relative, state: sameState(current, before) ? "before" : sameState(current, after) ? "after" : entry.recovered && sameState(current, { bytes: decoded(entry.recovered.bytes), mode: entry.recovered.mode }) ? "recovered" : "conflict" });
  }
  let cli = null;
  if (journal.cli) {
    if (typeof journal.cli.directory !== "string" || !path.isAbsolute(journal.cli.directory)) throw new Error("Invalid recovery CLI path");
    const actual = await fileState(journal.cli.directory, "forgeway");
    const previous = { bytes: decoded(journal.cli.before.bytes), mode: journal.cli.before.mode }, next = { bytes: decoded(journal.cli.after.bytes), mode: journal.cli.after.mode };
    cli = { directory: journal.cli.directory, state: sameState(actual, previous) ? "before" : sameState(actual, next) ? "after" : "conflict" };
  }
  return { status: operations.some(entry => entry.state === "conflict") || cli?.state === "conflict" ? "conflict" : "partial", target, cli, journal_sha256: digest(raw), dependency_refresh_started: journal.dependency_refresh_started, operations };
}

export async function recoverInstall(target, { authorize } = {}) {
  if (typeof authorize !== "function") throw new Error("Trusted recovery authorization required");
  const before = await reconcileInstall(target);
  if (before.status === "no-pending-install") return before;
  if (before.status === "conflict") throw new Error("Recovery conflict; preserve user modifications");
  if ((await authorize(before)) !== true) throw new Error("Recovery authorization required");
  const release = await acquireInstallLock(before.target);
  try {
    const current = await reconcileInstall(before.target);
    if (current.journal_sha256 !== before.journal_sha256 || current.status === "conflict") throw new Error("Recovery changed; preserve user modifications");
    const journal = JSON.parse(await readFile(await safeTargetPath(before.target, INSTALL_JOURNAL), "utf8"));
    if (current.cli?.state === "after") {
      const actual = await fileState(journal.cli.directory, "forgeway");
      if (!sameState(actual, { bytes: decoded(journal.cli.after.bytes), mode: journal.cli.after.mode })) throw new Error("Recovery CLI conflict; preserve user modifications");
      if (journal.cli.before.bytes === null) await unlink(await safeTargetPath(journal.cli.directory, "forgeway"));
      else await atomicWrite(journal.cli.directory, "forgeway", decoded(journal.cli.before.bytes), journal.cli.before.mode);
    }
    for (const entry of [...journal.operations].reverse()) {
      const observed = current.operations.find(item => item.relative === entry.relative);
      if (observed.state !== "after") continue;
      const now = await fileState(before.target, entry.relative);
      if (!sameState(now, { bytes: decoded(entry.after.bytes), mode: entry.after.mode })) throw new Error("Recovery conflict; preserve user modifications");
      if (entry.before.bytes === null) await unlink(await safeTargetPath(before.target, entry.relative));
      else await atomicWrite(before.target, entry.relative, decoded(entry.before.bytes), entry.before.mode);
    }
    if (journal.dependency_refresh_started) {
      const restored = await fileState(before.target, INSTALL_STATE);
      if (restored.bytes) {
        const ledger = JSON.parse(restored.bytes);
        ledger.runtime = { status: "not-verified", lock_sha256: null, reason: "dependency-tree-not-rolled-back" };
        ledger.loaded = "not-verified";
        const recoveryBytes = Buffer.from(JSON.stringify(ledger));
        const stateEntry = journal.operations.find(entry => entry.relative === INSTALL_STATE);
        // Write ahead the recovery state, so interruption before journal removal
        // does not turn our own invalidated dependency ledger into a user conflict.
        stateEntry.recovered = { bytes: encoded(recoveryBytes), mode: 0o600 };
        await atomicWrite(before.target, INSTALL_JOURNAL, JSON.stringify(journal), 0o600);
        await atomicWrite(before.target, INSTALL_STATE, recoveryBytes, 0o600, restored);
      }
    }
    await unlink(await safeTargetPath(before.target, INSTALL_JOURNAL));
    return { status: journal.dependency_refresh_started ? "files-restored-dependencies-unverified" : "restored", dependency_verification_required: journal.dependency_refresh_started };
  } finally { await release(); }
}

export async function installSkill(source, target, { check = false, ...options } = {}) {
  const plan = await prepareInstall(source, target, options);
  if (check) return { ...plan, copied: 0, updated: 0, removed: 0, check: true, cli: plan.cli ? { ...plan.cli, installed: false } : null };
  return applyInstall(plan, options);
}


// Explicit native installer command, not a maintenance SDK grant or executor.
// The caller owns the approved consumer window; this never activates a host.
export async function updateSkillFromGit(source, target, { backupDirectory, remote = "origin", branch = "main", runningRoot = ROOT } = {}) {
  source = await realpath(source); target = await canonicalTarget(target);
  const running = await realpath(runningRoot);
  const overlaps = (a, b) => a === b || a.startsWith(b + path.sep) || b.startsWith(a + path.sep);
  if (overlaps(running, target)) throw new Error("Running installation cannot be overwritten; run from independent source");
  if (overlaps(source, target)) throw new Error("Source and target overlap");
  if (typeof backupDirectory !== "string") throw new Error("A new private backup directory is required");
  const backup = await canonicalTarget(backupDirectory);
  if (overlaps(backup, source) || overlaps(backup, target) || await exists(backup)) throw new Error("Backup must be a new directory outside source and installation");
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/u.test(remote) || !/^[A-Za-z0-9][A-Za-z0-9._/-]{0,255}$/u.test(branch)) throw new Error("Invalid Git remote or branch");
  if (Object.keys(process.env).some(key => key.startsWith("GIT_") && !["GIT_CONFIG_NOSYSTEM", "GIT_CONFIG_GLOBAL", "GIT_TERMINAL_PROMPT"].includes(key) && !(key === "GIT_PAGER" && process.env[key] === "cat"))) throw new Error("Git environment overrides require separate review");
  const git = (args, allowed = [0], input) => {
    const result = spawnSync("git", ["--no-pager", "-C", source, ...args], { encoding: "utf8", input, timeout: 120000, maxBuffer: 32 * 1024 * 1024 });
    if (result.error || !allowed.includes(result.status)) throw Object.assign(new Error(`Git ${args[0]} failed; no automatic retry`), { exit_code: result.status, signal: result.signal });
    return result;
  };
  const value = args => git(args).stdout.trim();
  if (await realpath(value(["rev-parse", "--show-toplevel"])) !== source) throw new Error("Source must be its own Git root");
  if (value(["rev-parse", "--is-shallow-repository"]) === "true") throw new Error("Complete Git history is required; shallow source cannot provide a restorable backup");
  git(["check-ref-format", `refs/heads/${branch}`]);
  // Do not silently disable hooks/filters or run unreviewed checkout extensions.
  const extensions = git(["config", "--null", "--get-regexp", "^(filter\\.|diff\\..*\\.(command|textconv)|merge\\..*\\.driver|core\\.(fsmonitor|sshcommand|hookspath|sparsecheckout)|submodule\\.)"], [0, 1]);
  const inactiveLfs = new Set(["filter.lfs.clean\ngit-lfs clean -- %f", "filter.lfs.smudge\ngit-lfs smudge -- %f", "filter.lfs.process\ngit-lfs filter-process", "filter.lfs.required\ntrue"]);
  if (extensions.status === 0 && (!extensions.stdout.endsWith("\0") || extensions.stdout.slice(0, -1).split("\0").some(entry => !inactiveLfs.has(entry)))) throw new Error("Git execution configuration requires separate review");
  // Definitions alone do not execute a filter. Check Git's effective attributes,
  // including info/global files, before any status/diff and before checkout.
  const requireInactiveFilters = (paths, view = []) => {
    if (!paths.length) return;
    const output = git(["check-attr", ...view, "-z", "--stdin", "filter"], [0], paths.join("\0") + "\0").stdout;
    const fields = output.split("\0");
    if (fields.pop() !== "" || fields.length !== paths.length * 3 || paths.some((name, index) => fields[index * 3] !== name || fields[index * 3 + 1] !== "filter")) throw new Error("Git filter attribute readback is incomplete");
    if (paths.some((_, index) => !["unspecified", "unset"].includes(fields[index * 3 + 2]))) throw new Error("Git filter attributes require separate review");
  };
  const sourcePaths = [...new Set(git(["ls-files", "-z", "--cached", "--others", "--exclude-standard"]).stdout.split("\0").filter(Boolean))].sort();
  requireInactiveFilters(sourcePaths); requireInactiveFilters(sourcePaths, ["--cached"]);
  const hooks = value(["rev-parse", "--git-path", "hooks"]);
  const hooksPath = path.resolve(source, hooks);
  if (await exists(hooksPath)) for (const name of await readdir(hooksPath)) {
    if (!name.endsWith(".sample") && (await lstat(path.join(hooksPath, name))).mode & 0o111) throw new Error("Git hook requires separate review");
  }
  if (/^160000 /mu.test(value(["ls-files", "--stage"]))) throw new Error("Git submodules require separate review");
  for (const name of ["MERGE_HEAD", "CHERRY_PICK_HEAD", "REVERT_HEAD", "rebase-merge", "rebase-apply"]) {
    if (await exists(path.resolve(source, value(["rev-parse", "--git-path", name])))) throw new Error("Git operation already in progress");
  }
  const normalize = locator => typeof locator === "string" ? locator.replace(/^git\+/u, "").replace(/^git@github\.com:/u, "https://github.com/").replace(/\/$/u, "") : "";
  const before = value(["rev-parse", "HEAD"]);
  const manifest = JSON.parse(value(["show", `${before}:package.json`]));
  const origin = value(["remote", "get-url", "--all", remote]);
  const expected = normalize(typeof manifest.repository === "string" ? manifest.repository : manifest.repository?.url);
  if (manifest.name !== "forgeway" || !expected || normalize(origin) !== expected || origin.includes("\n")) throw new Error("Git remote does not match the selected Forgeway source");
  if (!path.isAbsolute(origin) && !/^git@github\.com:[A-Za-z0-9._/-]+$/u.test(origin)) {
    const url = new URL(origin.replace(/^git\+/u, ""));
    if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash) throw new Error("Unsupported Git source locator");
  }
  if (value(["for-each-ref", "--format=%(refname)", "refs/replace/"]) || await exists(path.resolve(source, value(["rev-parse", "--git-path", "info/grafts"])))) throw new Error("Git replacement history requires separate review");
  const updaterHead = spawnSync("git", ["-C", ROOT, "rev-parse", "HEAD"], { encoding: "utf8", timeout: 10000 });
  const loadedUpdater = { root: ROOT, source_basis: updaterHead.status === 0 ? updaterHead.stdout.trim() : null, entry_file_sha256: digest(await readFile(fileURLToPath(import.meta.url))), observation: "entry file read before sync; no newly fetched code is imported" };
  const remoteResult = value(["ls-remote", "--exit-code", remote, `refs/heads/${branch}`]).split(/\s+/u);
  if (remoteResult.length !== 2 || !/^[a-f0-9]{40}$/u.test(remoteResult[0]) || remoteResult[1] !== `refs/heads/${branch}`) throw new Error("Remote branch identity is ambiguous");
  const fixed = remoteResult[0];
  const stateBefore = await fileState(target, INSTALL_STATE);
  const prior = stateBefore.bytes ? JSON.parse(stateBefore.bytes) : null;
  if (prior?.schema_version !== "forgeway-install/2" || !prior.files || typeof prior.files !== "object" || Array.isArray(prior.files)) throw new Error("Existing managed installation required");
  if (await exists(path.join(target, INSTALL_JOURNAL)) || await exists(path.join(target, INSTALL_LOCK))) throw new Error("Installation requires reconciliation before update");
  await mkdir(backup, { mode: 0o700 });
  let phase = "backup", synced = false;
  const evidence = { source, target, remote, branch, source_before: before, pinned_source: fixed, loaded_updater: loadedUpdater, source_files: [], installed_files: [] };
  const save = async () => atomicWrite(backup, "receipt.json", JSON.stringify({ ...evidence, phase, source_synced: synced }), 0o600);
  const saveFile = async (root, prefix, relative, records) => {
    const info = await exists(await safeTargetPath(root, relative));
    if (info && (!info.isFile() || info.size > 32 * 1024 * 1024)) throw new Error("Backup input is not a bounded ordinary file");
    const state = await fileState(root, relative);
    const total = evidence.source_files.concat(evidence.installed_files).reduce((sum, item) => sum + item.bytes, 0);
    if (evidence.source_files.length + evidence.installed_files.length >= 4096 || total + (state.bytes?.length ?? 0) > 64 * 1024 * 1024) throw new Error("Backup resource limit exceeded");
    if (state.bytes) {
      await atomicWrite(backup, `${prefix}/${relative}`, state.bytes, state.mode);
      if (!sameState(await fileState(backup, `${prefix}/${relative}`), state)) throw new Error("Backup readback differs");
    }
    records.push({ path: relative, sha256: state.bytes === null ? null : digest(state.bytes), bytes: state.bytes?.length ?? 0, mode: state.mode });
    return state;
  };
  try {
    const sourceBefore = [];
    for (const relative of sourcePaths) sourceBefore.push([relative, await saveFile(source, "source", relative, evidence.source_files)]);
    await atomicWrite(backup, "staged.patch", git(["diff", "--cached", "--binary", "--no-ext-diff", "--no-textconv"]).stdout);
    await atomicWrite(backup, "unstaged.patch", git(["diff", "--binary", "--no-ext-diff", "--no-textconv"]).stdout);
    git(["bundle", "create", path.join(backup, "source.bundle"), "HEAD"]);
    git(["bundle", "verify", path.join(backup, "source.bundle")]);
    evidence.source_bundle_sha256 = digest(await readFile(path.join(backup, "source.bundle")));
    const installedPaths = new Set([...Object.keys(prior.files), INSTALL_STATE]), installedBefore = [];
    for (const relative of installedPaths) installedBefore.push([relative, await saveFile(target, "installed", relative, evidence.installed_files)]);
    await save();
    if (git(["status", "--porcelain=v1", "-z", "--untracked-files=all"]).stdout) throw new Error("Source has local changes; backup retained, no stash/reset or installation");
    phase = "fetch"; await save();
    git(["fetch", "--no-tags", "--no-recurse-submodules", remote, `refs/heads/${branch}`]);
    if (value(["rev-parse", "FETCH_HEAD"]) !== fixed) throw new Error("Remote branch changed during fetch; recollect without automatic retry");
    if (git(["merge-base", "--is-ancestor", before, fixed], [0, 1]).status !== 0) throw new Error("Source is not a fast-forward; unique local commits preserved");
    const affectedPaths = [...new Set([...sourcePaths, ...git(["ls-tree", "-r", "--name-only", "-z", fixed]).stdout.split("\0").filter(Boolean)])].sort();
    requireInactiveFilters(affectedPaths); requireInactiveFilters(affectedPaths, ["--cached"]); requireInactiveFilters(affectedPaths, [`--source=${fixed}`]);
    const nextManifest = JSON.parse(value(["show", `${fixed}:package.json`]));
    if (nextManifest.name !== "forgeway" || normalize(typeof nextManifest.repository === "string" ? nextManifest.repository : nextManifest.repository?.url) !== expected) throw new Error("Updated source ownership differs");
    const nextLock = git(["show", `${fixed}:package-lock.json`], [0, 128]);
    if (Object.keys(nextManifest.dependencies ?? {}).length && (nextLock.status !== 0 || prior.runtime?.status !== "verified" || prior.runtime.lock_sha256 !== digest(Buffer.from(nextLock.stdout)))) throw new Error("Runtime dependencies require separate preparation; no refresh performed");
    if (value(["rev-parse", "HEAD"]) !== before) throw new Error("Source HEAD changed during backup");
    for (const [relative, state] of sourceBefore) if (!sameState(await fileState(source, relative), state)) throw new Error("Source changed during backup");
    if (git(["status", "--porcelain=v1", "-z", "--untracked-files=all"]).stdout) throw new Error("Source changed during backup");
    phase = "sync"; synced = null; await save();
    git(["merge", "--ff-only", "--no-edit", "--no-overwrite-ignore", fixed]);
    if (value(["rev-parse", "HEAD"]) !== fixed || git(["status", "--porcelain=v1", "-z", "--untracked-files=all"]).stdout) throw new Error("Source sync readback differs");
    synced = true;
    const tracked = new Map(git(["ls-tree", "-r", "-z", fixed]).stdout.split("\0").filter(Boolean).map(line => { const [meta, name] = line.split("\t"); return [name, meta.split(" ")]; }));
    for (const entry of await captureSource(source)) {
      const expectedEntry = tracked.get(entry.relative);
      const blob = createHash("sha1").update(`blob ${entry.data.length}\0`).update(entry.data).digest("hex");
      // Git records only the owner executable bit for ordinary files, not the
      // read/write permissions left by umask. Preserve the full captured mode
      // for installation and recovery; do not widen private 0600/0700 files.
      const gitMode = entry.mode & 0o100 ? "100755" : "100644";
      if (!expectedEntry || expectedEntry[1] !== "blob" || expectedEntry[2] !== blob || expectedEntry[0] !== gitMode) throw new Error("Distribution differs from fixed Git source");
    }
    for (const relative of [...await distributionFiles(source), ...MAINTENANCE_FILES]) if (!installedPaths.has(relative) && await exists(await safeTargetPath(target, relative))) {
      installedBefore.push([relative, await saveFile(target, "installed", relative, evidence.installed_files)]); installedPaths.add(relative);
    }
    for (const [relative, state] of installedBefore) if (!sameState(await fileState(target, relative), state)) throw new Error("Installation changed during backup");
    phase = "prepare"; await save();
    const plan = await prepareInstall(source, target, { runningRoot: running, binDir: null, runtimeDependencies: false, sourceIdentity: { repository: expected, commit_sha: fixed } });
    const dependencyRunner = (cwd, args) => {
      if (JSON.stringify(args) !== JSON.stringify(["ls", "--omit=dev", "--all", "--json"])) throw new Error("Dependency refresh is not permitted by update");
      const result = spawnSync("npm", [...args, "--offline", "--ignore-scripts"], { cwd, encoding: "utf8", timeout: 120000, maxBuffer: 20_000_000, env: { ...process.env, npm_config_offline: "true", npm_config_audit: "false", npm_config_fund: "false", npm_config_update_notifier: "false" } });
      if (result.error || result.status !== 0) throw new Error("Retained dependency verification failed; no refresh performed");
      return result;
    };
    phase = "install"; await save();
    const install = await applyInstall(plan, { dependencyRunner });
    const verified = await verifyPreparedInstall(plan, { dependencyRunner });
    const finalState = JSON.parse((await fileState(target, INSTALL_STATE)).bytes);
    if (finalState.source?.snapshot_sha256 !== plan.snapshot_sha256 || finalState.source?.declared_identity?.commit_sha !== fixed || value(["rev-parse", "HEAD"]) !== fixed || git(["status", "--porcelain=v1", "-z", "--untracked-files=all"]).stdout) throw new Error("Final source or install ledger readback differs");
    phase = "verified-files"; await save();
    return { status: "prepared", source_before: before, source_after: fixed, source_tree: value(["rev-parse", "HEAD^{tree}"]), loaded_updater: loadedUpdater, backup, install, verified, loaded: "not-verified", activation: "not-requested" };
  } catch (error) {
    error.update = { phase, source_synced: synced, source_before: before, pinned_source: fixed, backup, installation: error.installation ?? "not-verified", automatic_retry: false };
    await save().catch(() => {}); throw error;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const args = process.argv.slice(2);
    const usage = "Usage: node scripts/install-skill.mjs --target <directory> [--check] [--runtime-dependencies] [--update-from-head] [--expected-installed-file <relative-path>=<sha256>]... [--bin-dir <directory>]";
    if (args.includes("--help")) console.log(`${usage}\nOr: node scripts/install-skill.mjs --sync --target <installation> --backup-dir <new-private-directory> [--source-root <checkout>] [--remote origin] [--branch main]\nExpected installed-file hashes permit replacement only for matching, ledger-owned files in the current distribution.`);
    else if (args.includes("--sync")) {
      const options = {};
      for (let index = 0; index < args.length; index++) {
        const key = args[index];
        if (key === "--sync") { if (options.sync) throw new Error("Duplicate --sync"); options.sync = true; continue; }
        if (!["--target", "--backup-dir", "--source-root", "--remote", "--branch"].includes(key) || options[key] || !args[index + 1] || args[index + 1].startsWith("--")) throw new Error("Invalid explicit update arguments");
        options[key] = args[++index];
      }
      if (!options["--target"] || !options["--backup-dir"]) throw new Error("Update requires --target and a new --backup-dir");
      console.log(JSON.stringify(await updateSkillFromGit(options["--source-root"] ?? ROOT, options["--target"], { backupDirectory: options["--backup-dir"], remote: options["--remote"] ?? "origin", branch: options["--branch"] ?? "main", runningRoot: ROOT }), null, 2));
    }
    else {
      const position = args.indexOf("--target");
      const binPosition = args.indexOf("--bin-dir");
      const expectedPositions = args.flatMap((arg, index) => arg === "--expected-installed-file" ? [index] : []);
      const valueIndexes = new Set([position + 1, ...(binPosition < 0 ? [] : [binPosition + 1]), ...expectedPositions.map(index => index + 1)]);
      const expectedInstalledFiles = expectedPositions.map(index => {
        const value = args[index + 1];
        const separator = typeof value === "string" ? value.indexOf("=") : -1;
        if (separator <= 0 || separator === value.length - 1) throw new Error("Expected --expected-installed-file <relative-path>=<sha256>");
        return { relative: value.slice(0, separator), sha256: value.slice(separator + 1) };
      });
      if (position < 0 || !args[position + 1] || args[position + 1].startsWith("--") ||
          (binPosition >= 0 && (!args[binPosition + 1] || args[binPosition + 1].startsWith("--"))) ||
          expectedPositions.some(index => !args[index + 1] || args[index + 1].startsWith("--")) ||
          args.some((arg, index) => !valueIndexes.has(index) && !["--target", "--check", "--runtime-dependencies", "--update-from-head", "--bin-dir", "--expected-installed-file"].includes(arg)) ||
          args.filter(arg => arg === "--target").length !== 1 || args.filter(arg => arg === "--bin-dir").length > 1) throw new Error(usage);
      console.log(JSON.stringify(await installSkill(ROOT, args[position + 1], {
        check: args.includes("--check"),
        updateFromHead: args.includes("--update-from-head"),
        expectedInstalledFiles,
        runtimeDependencies: args.includes("--runtime-dependencies"),
        binDir: binPosition >= 0 ? args[binPosition + 1] : null,
      }), null, 2));
    }
  } catch (error) { console.error(error.message); if (error.update) console.error(JSON.stringify(error.update)); process.exitCode = 1; }
}
