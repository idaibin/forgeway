import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { createReadStream, constants, existsSync, accessSync } from "node:fs";
import { lstat, readdir, realpath, mkdtemp, mkdir, link, unlink, rm, writeFile, readFile } from "node:fs/promises";
import { basename, dirname, isAbsolute, join, relative, resolve, sep, delimiter } from "node:path";
import { homedir } from "node:os";

const VERSION = "forgeway-pack/1";
const TAG_ATTRIBUTE = "com.apple.metadata:_kMDItemUserTags";

function fail(message, code = "PACK_INPUT_INVALID", exitCode = 2) {
  const error = new Error(message);
  error.code = code;
  error.exitCode = exitCode;
  throw error;
}

function one(flags, key) {
  const value = flags[key];
  if (value === undefined) return undefined;
  if (value === true || value.length !== 1) fail(`--${key} requires exactly one value`);
  return value[0];
}

function bool(flags, key) {
  if (flags[key] === undefined) return false;
  if (flags[key] !== true) fail(`--${key} does not take a value`);
  return true;
}

function executable(name) {
  for (const directory of (process.env.PATH ?? "").split(delimiter)) {
    if (!directory) continue;
    const candidate = join(directory, name);
    try { accessSync(candidate, constants.X_OK); return candidate; } catch { /* keep searching */ }
  }
  return null;
}

function dependencies() {
  return { zip: executable("zip"), unzip: executable("unzip"), ...(process.platform === "darwin" ? { xattr: executable("xattr"), plutil: executable("plutil") } : {}) };
}

function run(binary, args, cwd) {
  const env = { ...process.env };
  for (const name of ["ZIPOPT", "ZIP", "UNZIP", "UNZIPOPT", "ZIPINFO", "ZIPINFOOPT"]) delete env[name];
  const result = spawnSync(binary, args, { cwd, env, encoding: "utf8", maxBuffer: 4_000_000, timeout: 300000 });
  if (result.error || result.status !== 0) fail(`${basename(binary)} failed: ${(result.stderr || result.stdout || result.error?.message || "").trim().slice(0, 800)}`, "PACK_ARCHIVE_FAILED", 3);
  return result.stdout;
}

function timestamp(date = new Date()) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(date).map(({ type, value }) => [type, value]));
  return `${parts.year}${parts.month}${parts.day}-${parts.hour}${parts.minute}`;
}

function projectPrefix(input) {
  const name = String(input ?? "").trim().replace(/\s+/gu, "-");
  if (!name || name === "." || name === ".." || /[\x00-\x1f\x7f/\\]/u.test(name)) fail("project name is invalid");
  const short = [...name].slice(0, 32).join("").replace(/[-_.]+$/u, "");
  if (!short) fail("project name is invalid");
  return short;
}

async function inventory(source, root) {
  const entries = [];
  async function visit(filename, member) {
    if (/[\x00-\x1f\x7f\\]/u.test(member)) fail("source entry name is unsupported", "PACK_SOURCE_INVALID", 3);
    const stat = await lstat(filename);
    if (!stat.isDirectory() && !stat.isFile()) fail("symbolic links and special files are unsupported", "PACK_SOURCE_INVALID", 3);
    entries.push({ name: member + (stat.isDirectory() ? "/" : ""), size: stat.size, mtime: stat.mtimeMs, mode: stat.mode });
    if (stat.isDirectory()) for (const child of (await readdir(filename)).sort()) await visit(join(filename, child), `${member}/${child}`);
  }
  await visit(source, root);
  return entries;
}

function outside(source, output) {
  const rel = relative(source, output);
  return rel === ".." || rel.startsWith(`..${sep}`) || isAbsolute(rel);
}

async function fileHash(filename) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(filename)) hash.update(chunk);
  return hash.digest("hex");
}

async function tagPurple(filename, staging, bins) {
  if (process.platform !== "darwin") return { name: "紫色", color: "purple", applied: false, reason: "unsupported-platform" };
  if (!bins.xattr || !bins.plutil) fail("Finder tag requires xattr and plutil", "PACK_DEPENDENCY_MISSING", 3);
  const xml = join(staging, "finder-tag.xml");
  const binary = join(staging, "finder-tag.plist");
  await writeFile(xml, '<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">\n<plist version="1.0"><array><string>紫色&#10;3</string></array></plist>\n');
  run(bins.plutil, ["-convert", "binary1", "-o", binary, "--", xml], staging);
  const hex = (await readFile(binary)).toString("hex");
  run(bins.xattr, ["-wx", TAG_ATTRIBUTE, hex, filename], staging);
  const readback = run(bins.xattr, ["-px", TAG_ATTRIBUTE, filename], staging)
    .replace(/^\s*[0-9a-f]{8}\s+/gim, "")
    .replace(/\|.*$/gm, "")
    .replace(/0x/gi, "")
    .replace(/\s+/g, "");
  if (!/^(?:[0-9a-f]{2})+$/i.test(readback) || readback.toLowerCase() !== hex) {
    fail("Finder tag readback does not match the requested tag", "PACK_TAG_VERIFICATION_FAILED", 3);
  }
  return { name: "紫色", color: "purple", applied: true, verified: true };
}

export async function packDirectory(input, { output, projectName, dryRun = false, tag = false, now = new Date() } = {}) {
  const requested = resolve(input);
  let sourceStat;
  try { sourceStat = await lstat(requested); } catch { fail("source directory does not exist", "PACK_SOURCE_INVALID", 3); }
  if (!sourceStat.isDirectory()) fail("source must be a real directory", "PACK_SOURCE_INVALID", 3);
  const source = await realpath(requested);
  if (source === dirname(source)) fail("filesystem root cannot be packed", "PACK_SOURCE_INVALID", 3);
  const root = basename(source);
  const project = projectPrefix(projectName ?? basename(process.cwd()));
  let destination;
  try { destination = await realpath(resolve(output ?? join(homedir(), "Desktop"))); } catch { fail("output directory does not exist", "PACK_OUTPUT_INVALID", 3); }
  if (!(await lstat(destination)).isDirectory() || !outside(source, destination)) fail("output must be an existing directory outside the source", "PACK_OUTPUT_INVALID", 3);
  const archive = join(destination, `${project}-${timestamp(now)}.zip`);
  if (existsSync(archive)) fail("archive already exists", "PACK_ALREADY_EXISTS", 3);
  const before = await inventory(source, root);
  const bins = dependencies();
  if (!bins.zip || !bins.unzip) fail("Info-ZIP zip and unzip are required", "PACK_DEPENDENCY_MISSING", 3);
  const result = { schema_version: VERSION, source, archive, project, root: `${root}/`, timezone: "Asia/Shanghai", entries: before.length, dry_run: dryRun, verified: false, tag: tag ? { name: "紫色", color: "purple", applied: false } : null };
  if (dryRun) return result;
  const staging = await mkdtemp(join(destination, ".forgeway-pack-"));
  try {
    const temporary = join(staging, "archive.zip");
    run(bins.zip, ["-q", "-r", "-X", "-y", "-MM", temporary, `./${root}`], dirname(source));
    run(bins.unzip, ["-tqq", temporary], destination);
    if (JSON.stringify(await inventory(source, root)) !== JSON.stringify(before)) fail("source changed during packaging", "PACK_SOURCE_CHANGED", 3);
    const extracted = join(staging, "extracted");
    await mkdir(extracted);
    run(bins.unzip, ["-qq", temporary, "-d", extracted], destination);
    const roots = await readdir(extracted);
    if (roots.length !== 1 || roots[0] !== root) fail("archive top-level directory differs from source", "PACK_VERIFICATION_FAILED", 3);
    const shape = (entries) => entries.map((entry) => [entry.name, entry.name.endsWith("/") ? null : entry.size]);
    if (JSON.stringify(shape(await inventory(join(extracted, root), root))) !== JSON.stringify(shape(before))) fail("archive contents differ from source", "PACK_VERIFICATION_FAILED", 3);
    const sha256 = await fileHash(temporary);
    const bytes = (await lstat(temporary)).size;
    const finderTag = tag ? await tagPurple(temporary, staging, bins) : null;
    try { await link(temporary, archive); } catch (error) { if (error.code === "EEXIST") fail("archive already exists", "PACK_ALREADY_EXISTS", 3); throw error; }
    await unlink(temporary);
    return { ...result, verified: true, bytes, sha256, tag: finderTag };
  } finally {
    await rm(staging, { recursive: true, force: true });
  }
}

export async function packCommand(action, flags, positionals) {
  for (const key of Object.keys(flags)) if (!["out", "project", "tag", "dry-run", "compact", "json"].includes(key)) fail(`unsupported pack option: --${key}`);
  if (action === "doctor") {
    if (positionals.length !== 2 || Object.keys(flags).some((key) => !["compact", "json"].includes(key))) fail("pack doctor takes no archive options");
    const bins = dependencies();
    const ready = ["darwin", "linux"].includes(process.platform) && !!(bins.zip && bins.unzip);
    return { schema_version: VERSION, action: "doctor", offline: true, auth_required: false, platform: process.platform, dependencies: bins, ready };
  }
  if (action !== "create" || positionals.length !== 3) fail("usage: forgeway pack create <directory>");
  if (!["darwin", "linux"].includes(process.platform)) fail("pack supports macOS and Linux", "PACK_PLATFORM_UNSUPPORTED", 3);
  return packDirectory(positionals[2], { output: one(flags, "out"), projectName: one(flags, "project"), tag: bool(flags, "tag"), dryRun: bool(flags, "dry-run") });
}
