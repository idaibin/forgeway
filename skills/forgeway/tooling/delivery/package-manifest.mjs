import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { lstatSync, readFileSync, readlinkSync, readdirSync, realpathSync } from "node:fs";
import path from "node:path";

import {
  assert,
  canonicalJson,
  deepFreeze,
  sha256
} from "./utils.mjs";
import { repositoryIdentity } from "../repository-identity.mjs";

// Explicit roots must not be redirected by inherited Git environment settings.
const GIT_ENV = { ...Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith("GIT_"))), GIT_OPTIONAL_LOCKS: "0" };

function runGit(root, args, { allowFailure = false } = {}) {
  try {
    return execFileSync("git", ["-c", "core.fsmonitor=false", "-C", root, ...args], {
      cwd: root,
      env: GIT_ENV,
      encoding: "utf8",
      stdio: ["ignore", "pipe", allowFailure ? "ignore" : "pipe"]
    });
  } catch (error) {
    // Missing optional metadata is compatible; process failure is not absence.
    if (allowFailure && Number.isInteger(error.status) && error.status !== 0 && !error.code && !error.signal) return "";
    const detail = String(error.stderr ?? "").trim() || error.message || "git command failed";
    const wrapped = new Error(`git ${args.join(" ")} failed: ${detail}`);
    wrapped.code = "PACKAGE_GIT_ERROR";
    wrapped.cause = error;
    throw wrapped;
  }
}

function gitRoot(root) {
  return runGit(root, ["rev-parse", "--show-toplevel"], { allowFailure: true }).trim() || null;
}

function gitHead(root) {
  return runGit(root, ["rev-parse", "HEAD"], { allowFailure: true }).trim() || null;
}

function parseNullList(output) {
  return output.split("\0").filter(Boolean);
}

// A maintenance preview must not ask Git to convert worktree bytes. `status`
// may run clean/process filters selected by attributes, even with fsmonitor off.
// This mode compares raw blobs/modes to HEAD and the index, using only plumbing
// commands that do not execute worktree filters, diff drivers or hooks. A checkout
// with line-ending/filter conversion is conservatively dirty in this raw view.
function boundReadOnlyPaths(root, paths) {
  const unique = new Set(paths);
  assert(unique.size <= 2048, "read-only package file limit", "PACKAGE_READ_ONLY_LIMIT");
  let total = 0;
  for (const filename of unique) {
    const { absolute } = safeRelative(root, filename);
    try {
      const stat = lstatSync(absolute);
      assert(!stat.isDirectory(), "submodule state requires native owner collection", "PACKAGE_READ_ONLY_UNSUPPORTED");
      total += stat.size;
      assert(total <= 32 * 1024 * 1024, "read-only package byte limit", "PACKAGE_READ_ONLY_LIMIT");
    } catch (error) { if (error.code !== "ENOENT") throw error; }
  }
}

function readOnlyChangedPaths(root) {
  const heads = new Map(), index = new Map(), changed = new Map();
  for (const entry of parseNullList(runGit(root, ["ls-tree", "-r", "-z", "HEAD", "--", "."]))) {
    const match = entry.match(/^(\d+) \w+ ([a-f0-9]+)\t([\s\S]+)$/);
    assert(match, "unsupported tree entry", "PACKAGE_READ_ONLY_UNSUPPORTED");
    heads.set(match[3], { mode: match[1], oid: match[2] });
  }
  for (const entry of parseNullList(runGit(root, ["ls-files", "-s", "-z"]))) {
    const match = entry.match(/^(\d+) ([a-f0-9]+) (\d+)\t([\s\S]+)$/);
    assert(match && match[3] === "0", "unmerged index requires owner review", "PACKAGE_READ_ONLY_UNSUPPORTED");
    index.set(match[4], { mode: match[1], oid: match[2] });
  }
  boundReadOnlyPaths(root, [...heads.keys(), ...index.keys()]);
  const algorithm = runGit(root, ["rev-parse", "--show-object-format"]).trim();
  assert(["sha1", "sha256"].includes(algorithm), "unsupported Git object format", "PACKAGE_READ_ONLY_UNSUPPORTED");
  for (const filename of new Set([...heads.keys(), ...index.keys()])) {
    const previous = heads.get(filename), staged = index.get(filename);
    const { absolute } = safeRelative(root, filename);
    let stat;
    try { stat = lstatSync(absolute); } catch (error) {
      if (error.code !== "ENOENT") throw error;
      changed.set(filename, "deleted"); continue;
    }
    assert(!stat.isDirectory(), "submodule state requires a native owner collector", "PACKAGE_READ_ONLY_UNSUPPORTED");
    const bytes = stat.isSymbolicLink() ? Buffer.from(readlinkSync(absolute)) : readFileSync(absolute);
    const oid = createHash(algorithm).update(`blob ${bytes.length}\0`).update(bytes).digest("hex");
    if (!previous || !staged || previous.oid !== staged.oid || previous.mode !== staged.mode || oid !== staged.oid || gitMode(stat) !== staged.mode) changed.set(filename, "dirty");
  }
  return changed;
}

function changedPaths(root) {
  const changed = new Map();
  const repositoryRoot = gitRoot(root);
  const prefix = repositoryRoot ? path.relative(repositoryRoot, root).replaceAll("\\", "/") : "";
  const scoped = (file) => {
    const normalised = file.replaceAll("\\", "/");
    if (!prefix) return normalised;
    return normalised.startsWith(`${prefix}/`) ? normalised.slice(prefix.length + 1) : null;
  };
  const status = runGit(root, ["status", "--porcelain=v1", "-z", "--untracked-files=all", "--", "."]);
  const entries = parseNullList(status);
  for (let index = 0; index < entries.length; index += 1) {
    const entry = entries[index];
    if (entry.length < 3) continue;
    const code = entry.slice(0, 2);
    const file = scoped(entry.slice(3));
    if (file === null) continue;
    // `??` paths are represented by untrackedPaths below. They are present in
    // porcelain output for completeness, but are not tracked modifications.
    if (code === "??") continue;
    // Rename/copy records contain the old path followed by the new path. The
    // new path is what should be represented in the package snapshot.
    if (code.includes("R") || code.includes("C")) {
      const oldPath = scoped(entries[index + 1] ?? "");
      index += 1;
      changed.set(file, "dirty");
      if (code.includes("R") && oldPath) changed.set(oldPath, "deleted");
      continue;
    }
    changed.set(file, code.includes("D") ? "deleted" : "dirty");
  }
  return changed;
}

function trackedPaths(root) {
  return parseNullList(runGit(root, ["ls-files", "-z"]))
    .map((file) => file.replaceAll("\\", "/"));
}

function untrackedPaths(root) {
  return parseNullList(runGit(root, ["ls-files", "--others", "--exclude-standard", "-z"]))
    .map((file) => file.replaceAll("\\", "/"));
}

function nonGitPaths(root) {
  const excluded = new Set([".git", ".codex", "node_modules", "coverage", "dist", "build"]);
  const paths = [];
  const visit = (directory, prefix = "") => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      if (!prefix && excluded.has(entry.name)) continue;
      const relative = path.posix.join(prefix, entry.name);
      if (entry.isDirectory()) visit(path.join(directory, entry.name), relative);
      else if (entry.isFile() || entry.isSymbolicLink()) paths.push(relative);
    }
  };
  visit(root);
  return paths.sort();
}

function gitMode(stat) {
  if (stat.isSymbolicLink()) return "120000";
  if (stat.isDirectory()) return "040000";
  return (stat.mode & 0o111) === 0 ? "100644" : "100755";
}

function safeRelative(root, relativePath) {
  const normalised = relativePath.replaceAll("\\", "/");
  assert(
    normalised && !normalised.startsWith("/") && !normalised.startsWith("~") &&
      !/^[A-Za-z]:\//.test(normalised) && !normalised.split("/").includes(".."),
    `package path escapes repository root: ${relativePath}`,
    "PACKAGE_PATH_ESCAPE"
  );
  const absolute = path.resolve(root, normalised);
  const relativeRoot = path.relative(root, absolute);
  assert(relativeRoot === normalised || relativeRoot === normalised.replaceAll("\\", "/"), `package path escapes repository root: ${relativePath}`, "PACKAGE_PATH_ESCAPE");
  let parent = root;
  for (const segment of normalised.split("/").slice(0, -1)) {
    parent = path.join(parent, segment);
    let resolved;
    try { resolved = realpathSync(parent); } catch (error) {
      if (error.code === "ENOENT") break;
      throw error;
    }
    const relative = path.relative(root, resolved);
    assert(relative !== ".." && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative),
      `package path escapes repository root: ${relativePath}`, "PACKAGE_PATH_ESCAPE");
  }
  return { normalised, absolute };
}

function fileRecord(root, relativePath, status) {
  const { normalised, absolute } = safeRelative(root, relativePath);
  let stat;
  try {
    stat = lstatSync(absolute);
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
    return {
      path: normalised,
      status,
      sha256: null,
      mode: "100644",
      bytes: 0,
      exists: false
    };
  }
  if (stat.isDirectory()) {
    const staged = runGit(root, ["ls-files", "-s", "--", normalised], { allowFailure: true }).trim().match(/^(160000) ([0-9a-f]{40}) /);
    assert(staged, `package path is a directory: ${normalised}`, "PACKAGE_DIRECTORY_ENTRY");
    const identity = Buffer.from(staged[2], "utf8");
    return { path: normalised, status, sha256: sha256(identity), mode: "160000", bytes: identity.byteLength, exists: true };
  }
  const bytes = stat.isSymbolicLink() ? Buffer.from(readlinkSync(absolute)) : readFileSync(absolute);
  return {
    path: normalised,
    status,
    sha256: sha256(bytes),
    mode: gitMode(stat),
    bytes: bytes.byteLength,
    exists: true
  };
}

function repositoryIdFor(root, supplied, resolvedRoot) {
  const remote = runGit(resolvedRoot, ["config", "--get", "remote.origin.url"], { allowFailure: true }).trim();
  return repositoryIdentity({ supplied, remote, root: resolvedRoot });
}

function assertRepositoryId(value) {
  assert(typeof value === "string" && value.length > 0, "repository_id is required", "PACKAGE_REPOSITORY_REQUIRED");
  assert(typeof value === "string" && /^[A-Za-z][A-Za-z0-9._:-]*$/.test(value), "repository_id must match the package manifest v1 identifier format", "PACKAGE_REPOSITORY_INVALID");
}

function assertCommitSha(value, field) {
  assert(value === null || (typeof value === "string" && /^[0-9a-f]{40}$/.test(value)), `${field} must be null or a 40-character lowercase SHA-1 commit ID; SHA-256 Git repositories are unsupported by package manifest v1`, "PACKAGE_BASIS_INVALID");
}

/**
 * Snapshot the current worktree as an immutable package identity. Tracked
 * clean files, tracked changes, and non-ignored untracked files are
 * explicitly represented as `tracked`, `dirty`, and `untracked`.
 * Callers may add exact repository-relative ignored files through `include`;
 * the builder never searches ignored directories implicitly.
 */
export function buildPackageManifest({
  root = process.cwd(),
  repository_id,
  package_id,
  include = [],
  read_only = false,
  created_at = new Date().toISOString()
} = {}) {
  const packageRoot = realpathSync(path.resolve(root));
  const repositoryRoot = gitRoot(packageRoot);
  const hasGit = Boolean(repositoryRoot);
  const headSha = repositoryRoot ? gitHead(repositoryRoot) : null;
  // Git path output is relative to -C, so a package nested inside a monorepo
  // retains package-relative paths instead of leaking the repository prefix.
  const tracked = hasGit ? trackedPaths(packageRoot) : nonGitPaths(packageRoot);
  const changed = hasGit ? (read_only ? readOnlyChangedPaths(packageRoot) : changedPaths(packageRoot)) : new Set();
  const untracked = hasGit ? untrackedPaths(packageRoot) : [];
  if (read_only) boundReadOnlyPaths(packageRoot, [...tracked, ...changed.keys(), ...untracked, ...include]);
  const filesByPath = new Map();
  for (const file of tracked) {
    filesByPath.set(file, fileRecord(packageRoot, file, hasGit ? (changed.get(file) ?? "tracked") : "untracked"));
  }
  for (const [file, status] of changed) {
    if (!filesByPath.has(file)) filesByPath.set(file, fileRecord(packageRoot, file, status));
  }
  for (const file of untracked) {
    // Git can report a path in both sets during a rename. A tracked record is
    // retained because it is the stronger identity; status still remains dirty.
    if (!filesByPath.has(file)) filesByPath.set(file, fileRecord(packageRoot, file, "untracked"));
  }
  assert(Array.isArray(include), "package include paths must be an array", "PACKAGE_INCLUDE_INVALID");
  for (const requestedPath of include) {
    assert(typeof requestedPath === "string", "package include paths must be strings", "PACKAGE_INCLUDE_INVALID");
    const { normalised } = safeRelative(packageRoot, requestedPath);
    const existing = filesByPath.get(normalised);
    if (existing) {
      assert(existing.exists === true, `explicit package include does not exist: ${normalised}`, "PACKAGE_INCLUDE_NOT_FOUND");
      continue;
    }
    const record = fileRecord(packageRoot, normalised, "untracked");
    assert(record.exists === true, `explicit package include does not exist: ${normalised}`, "PACKAGE_INCLUDE_NOT_FOUND");
    filesByPath.set(normalised, record);
  }
  const files = [...filesByPath.values()].sort((left, right) => left.path.localeCompare(right.path));
  const worktreeState = files.some((file) => file.status !== "tracked") ? "dirty" : "clean";
  const resolvedRepositoryId = repositoryIdFor(packageRoot, repository_id, repositoryRoot ?? packageRoot);
  assertRepositoryId(resolvedRepositoryId);
  assertCommitSha(headSha, "basis.head_sha");
  const basis = {
    repository_id: resolvedRepositoryId,
    worktree_state: worktreeState,
    head_sha: headSha,
    base_commit_sha: headSha,
    source_root: repositoryRoot ? (path.relative(repositoryRoot, packageRoot).replaceAll("\\", "/") || ".") : ".",
    git_status_sha256: sha256(JSON.stringify(files.map(({ path: filePath, status }) => ({ path: filePath, status }))))
  };
  const aggregate_sha256 = sha256({
    schema_version: "1.0",
    repository_id: basis.repository_id,
    basis,
    files
  });
  const derivedPackageId = `pkg:${aggregate_sha256}`;
  assert(package_id === undefined || package_id === derivedPackageId, "package_id must equal the content-derived package identity", "PACKAGE_ID_MISMATCH");
  const manifest = {
    schema_version: "1.0",
    package_id: derivedPackageId,
    repository_id: basis.repository_id,
    basis,
    files,
    aggregate_sha256,
    created_at
  };
  assert(/^pkg:[A-Za-z0-9._:-]+$/.test(manifest.package_id), "package_id must use the pkg: namespace", "PACKAGE_ID_INVALID");
  return deepFreeze(manifest);
}

/** Build a manifest from explicit records, useful for import and fixtures. */
export function createPackageManifest({
  repository_id,
  package_id,
  basis,
  files,
  created_at = new Date().toISOString()
} = {}) {
  assertRepositoryId(repository_id);
  assert(Array.isArray(files), "files must be an array", "PACKAGE_FILES_REQUIRED");
  if (basis?.repository_id !== undefined) {
    assert(basis.repository_id === repository_id, "basis.repository_id must match repository_id", "PACKAGE_REPOSITORY_MISMATCH");
  }
  const ordered = files.map((file) => ({ ...file })).sort((left, right) => String(left.path).localeCompare(String(right.path)));
  const seen = new Set();
  for (const file of ordered) {
    assert(typeof file.path === "string" && file.path.length > 0, "file.path is required", "PACKAGE_FILE_INVALID");
    assert(!path.isAbsolute(file.path) && !file.path.startsWith("~") && !/^[A-Za-z]:[\\/]/.test(file.path) && !file.path.includes("\\") && !file.path.split("/").includes(".."), `package path escapes repository root: ${file.path}`, "PACKAGE_PATH_ESCAPE");
    assert(!seen.has(file.path), `duplicate package path: ${file.path}`, "PACKAGE_FILE_DUPLICATE");
    seen.add(file.path);
    assert(["tracked", "dirty", "untracked", "deleted"].includes(file.status), `invalid package file status: ${file.status}`, "PACKAGE_FILE_STATUS_INVALID");
    assert(typeof file.mode === "string" && /^(?:[0-7]{6}|160000)$/.test(file.mode), `invalid mode for ${file.path}`, "PACKAGE_FILE_MODE_INVALID");
    assert(Number.isInteger(file.bytes) && file.bytes >= 0, `invalid byte count for ${file.path}`, "PACKAGE_FILE_BYTES_INVALID");
    assert(file.sha256 === null || /^[0-9a-f]{64}$/.test(file.sha256), `invalid hash for ${file.path}`, "PACKAGE_FILE_HASH_INVALID");
    if (file.status === "deleted") {
      assert(file.exists === false && file.sha256 === null && file.bytes === 0, `deleted package entry is inconsistent: ${file.path}`, "PACKAGE_DELETED_ENTRY_INVALID");
    } else {
      assert(file.exists !== false && file.sha256 !== null, `live package entry is inconsistent: ${file.path}`, "PACKAGE_LIVE_ENTRY_INVALID");
    }
  }
  const canonicalBasis = {
    repository_id,
    worktree_state: basis?.worktree_state ?? (ordered.some((file) => file.status !== "tracked") ? "dirty" : "clean"),
    head_sha: basis?.head_sha ?? null,
    base_commit_sha: basis?.base_commit_sha ?? basis?.head_sha ?? null,
    ...(basis?.source_root ? { source_root: basis.source_root } : {}),
    ...(basis?.git_status_sha256 ? { git_status_sha256: basis.git_status_sha256 } : {})
  };
  assertCommitSha(canonicalBasis.head_sha, "basis.head_sha");
  assertCommitSha(canonicalBasis.base_commit_sha, "basis.base_commit_sha");
  const aggregate_sha256 = sha256({ schema_version: "1.0", repository_id, basis: canonicalBasis, files: ordered });
  const derivedPackageId = `pkg:${aggregate_sha256}`;
  assert(package_id === undefined || package_id === derivedPackageId, "package_id must equal the content-derived package identity", "PACKAGE_ID_MISMATCH");
  const manifest = {
    schema_version: "1.0",
    package_id: derivedPackageId,
    repository_id,
    basis: canonicalBasis,
    files: ordered,
    aggregate_sha256,
    created_at
  };
  assert(/^pkg:[A-Za-z0-9._:-]+$/.test(manifest.package_id), "package_id must use the pkg: namespace", "PACKAGE_ID_INVALID");
  return deepFreeze(manifest);
}

export function packageManifestCanonicalHash(manifest) {
  assert(manifest && typeof manifest === "object", "manifest is required");
  const { created_at: _createdAt, package_id: _packageId, ...identity } = manifest;
  return sha256(identity);
}

export function validatePackageManifest(manifest) {
  assert(manifest?.schema_version === "1.0", "unsupported package manifest schema", "PACKAGE_SCHEMA_UNSUPPORTED");
  assert(Array.isArray(manifest.files), "manifest.files must be an array", "PACKAGE_FILES_REQUIRED");
  const expected = createPackageManifest({
    repository_id: manifest.repository_id,
    package_id: manifest.package_id,
    basis: manifest.basis,
    files: manifest.files,
    created_at: manifest.created_at
  });
  assert(expected.aggregate_sha256 === manifest.aggregate_sha256, "package aggregate hash mismatch", "PACKAGE_HASH_MISMATCH");
  assert(expected.package_id === manifest.package_id, "package_id does not match package identity", "PACKAGE_ID_MISMATCH");
  return true;
}
