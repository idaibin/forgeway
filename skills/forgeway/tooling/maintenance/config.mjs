import { readFile, lstat, mkdir, open, rename, unlink } from "node:fs/promises";
import path from "node:path";
import { assert, digest, exactKeys, freeze, hash, relative, text } from "./common.mjs";

export const CONFIG_VERSION = "forgeway-maintenance-config/1";
const CONFIG_MAX_BYTES = 1024 * 1024;
export function validateUserConfig(value) {
  exactKeys(value, ["schema_version", "sources", "exclude", "language"], "MAINTENANCE_CONFIG_INVALID");
  assert(value.schema_version === CONFIG_VERSION, "MAINTENANCE_CONFIG_VERSION");
  assert(Array.isArray(value.sources) && Array.isArray(value.exclude), "MAINTENANCE_CONFIG_INVALID");
  const ids = new Set();
  for (const source of value.sources) {
    exactKeys(source, ["id", "locator", "local_path", "host", "channel", "profile", "metadata_path", "ownership"], "MAINTENANCE_CONFIG_INVALID");
    assert(text(source.id) && text(source.locator) && !ids.has(source.id), "MAINTENANCE_CONFIG_INVALID");
    ids.add(source.id);
    assert(source.ownership === undefined || ["self-owned", "adopted", "external"].includes(source.ownership), "MAINTENANCE_CONFIG_INVALID");
    assert(source.profile === undefined || text(source.profile), "MAINTENANCE_CONFIG_INVALID");
    assert(source.metadata_path === undefined || relative(source.metadata_path), "MAINTENANCE_CONFIG_INVALID");
    for (const key of ["local_path", "host", "channel"]) assert(source[key] === undefined || text(source[key]), "MAINTENANCE_CONFIG_INVALID");
    assert(!/:\/\/[^/]*@/u.test(source.locator) && !/[?&#]/u.test(source.locator), "MAINTENANCE_CONFIG_INVALID");
  }
  assert(value.exclude.every(text) && new Set(value.exclude).size === value.exclude.length, "MAINTENANCE_CONFIG_INVALID");
  assert(value.language === undefined || /^[A-Za-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/u.test(value.language), "MAINTENANCE_CONFIG_INVALID");
  return freeze(structuredClone(value));
}
export const emptyUserConfig = () => ({ schema_version: CONFIG_VERSION, sources: [], exclude: [] });
export async function safeConfigPath(filename) {
  assert(typeof filename === "string" && !filename.split(/[\\/]/u).includes(".."), "MAINTENANCE_CONFIG_PATH");
  let current = path.resolve(filename);
  while (true) {
    try { assert(!(await lstat(current)).isSymbolicLink(), "MAINTENANCE_CONFIG_SYMLINK"); }
    catch (error) { if (error.code !== "ENOENT") throw error; }
    const parent = path.dirname(current); if (parent === current) break; current = parent;
  }
  return path.resolve(filename);
}
export async function readUserConfig(filename) {
  if (!filename) return { config: emptyUserConfig(), sha256: null, status: "absent" };
  filename = await safeConfigPath(filename);
  let bytes;
  try { const info = await lstat(filename); assert(info.isFile() && info.size <= CONFIG_MAX_BYTES, "MAINTENANCE_CONFIG_INVALID"); bytes = await readFile(filename); }
  catch (error) { if (error.code === "ENOENT") return { config: emptyUserConfig(), sha256: null, status: "absent" }; throw error; }
  let value; try { value = JSON.parse(bytes); } catch { assert(false, "MAINTENANCE_CONFIG_INVALID"); }
  return { config: validateUserConfig(value), sha256: digest(bytes), status: "present" };
}

// Only a host-selected private path and an in-process authorizer can write.
// There is deliberately no grant-file/approved flag in the CLI.
export async function writeUserConfig({ filename, value, expectedSha256, host }) {
  assert(host && typeof host.authorize === "function" && typeof host.isPrivateConfigPath === "function" && typeof host.acquireLease === "function", "MAINTENANCE_HOST_REQUIRED");
  filename = await safeConfigPath(filename);
  assert(await host.isPrivateConfigPath(filename), "MAINTENANCE_CONFIG_LOCATION");
  const config = value === null ? null : validateUserConfig(value);
  const serialized = config === null ? null : JSON.stringify(config, null, 2) + "\n";
  assert(serialized === null || Buffer.byteLength(serialized, "utf8") <= CONFIG_MAX_BYTES, "MAINTENANCE_CONFIG_INVALID");
  const lease = await host.acquireLease({ target: filename, effect: "config-write" });
  assert(lease?.exclusive === true && typeof lease.release === "function" && typeof lease.isCurrent === "function", "MAINTENANCE_SINGLE_WRITER_REQUIRED");
  try {
  assert(await lease.isCurrent(), "MAINTENANCE_LEASE_LOST");
  const before = await readUserConfig(filename);
  assert(before.sha256 === expectedSha256, "MAINTENANCE_CONFIG_STALE");
  const binding = freeze({ effect: config === null ? "config-remove" : "config-write", target: filename, before_sha256: before.sha256, after_sha256: config === null ? null : hash(config) });
  const authorization = await host.authorize(binding);
  assert(authorization?.granted === true && authorization.binding_sha256 === hash(binding) && text(authorization.authorization_ref), "MAINTENANCE_AUTHORIZATION_REQUIRED");
  await safeConfigPath(filename);
  assert(await lease.isCurrent(), "MAINTENANCE_LEASE_LOST");
  assert((await readUserConfig(filename)).sha256 === before.sha256, "MAINTENANCE_CONFIG_STALE");
  if (config === null) { if (before.sha256 !== null) { assert(await lease.isCurrent(), "MAINTENANCE_LEASE_LOST"); await unlink(filename); } }
  else {
    await mkdir(path.dirname(filename), { recursive: true });
    const staged = `${filename}.forgeway-${process.pid}-${Date.now()}`;
    const handle = await open(staged, "wx", 0o600);
    try {
      await handle.writeFile(serialized); await handle.sync(); await handle.close();
      await safeConfigPath(filename);
      assert((await readUserConfig(filename)).sha256 === before.sha256, "MAINTENANCE_CONFIG_STALE");
      assert(await lease.isCurrent(), "MAINTENANCE_LEASE_LOST");
      await rename(staged, filename);
    } finally { await handle.close().catch(() => {}); await unlink(staged).catch(() => {}); }
  }
  const result = await readUserConfig(filename);
  assert(await lease.isCurrent(), "MAINTENANCE_CONFIG_COMMITTED_LEASE_LOST");
  assert(config === null ? result.status === "absent" : hash(result.config) === hash(config), "MAINTENANCE_CONFIG_READBACK_MISMATCH");
  return result;
  } finally { await lease.release(); }
}
