import { readFileSync, lstatSync, realpathSync } from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { devNull } from "node:os";
import { fileURLToPath } from "node:url";
import Ajv2020 from "ajv/dist/2020.js";
import YAML from "yaml";

const PROFILE = "project-docs/collaboration/profile.local.json";
const schema = JSON.parse(readFileSync(new URL("../contracts/project-profile.schema.json", import.meta.url), "utf8"));
const validate = new Ajv2020({ strict: true, allErrors: true }).compile(schema);

function failure(message, code) {
  throw Object.assign(new Error(message), { code, exitCode: 2 });
}

function safeRoot(target) {
  const root = path.resolve(target);
  try {
    const info = lstatSync(root);
    if (!info.isDirectory()) failure("profile root must be a directory", "PROFILE_ROOT_INVALID");
    if (info.isSymbolicLink()) failure("profile root must not be a symbolic link", "PROFILE_PATH_UNSAFE");
    return realpathSync(root);
  } catch (error) {
    if (error.code === "ENOENT") failure("profile root does not exist", "PROFILE_ROOT_MISSING");
    throw error;
  }
}

function git(root, args) {
  const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith("GIT_")));
  Object.assign(env, { GIT_OPTIONAL_LOCKS: "0", GIT_CONFIG_NOSYSTEM: "1", GIT_CONFIG_GLOBAL: devNull });
  return execFileSync("git", ["-C", root, ...args], { env, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], timeout: 10000 }).trim();
}

function personalFileIsPrivate(root) {
  const docs = path.join(root, "project-docs");
  const filename = path.join(docs, "collaboration/profile.local.json");
  try {
    if (!lstatSync(docs).isDirectory() || lstatSync(docs).isSymbolicLink() ||
        !lstatSync(path.dirname(filename)).isDirectory() || lstatSync(path.dirname(filename)).isSymbolicLink()) return false;
    if (realpathSync(git(docs, ["rev-parse", "--show-toplevel"])) !== realpathSync(docs)) return false;
    if (git(docs, ["ls-files", "--cached", "--", "collaboration/profile.local.json"])) return false;
    return git(docs, ["check-ignore", "--no-index", "--", "collaboration/profile.local.json"]) === "collaboration/profile.local.json";
  } catch { return false; }
}

export function checkProjectProfile(target) {
  const root = safeRoot(target);
  const filename = path.join(root, PROFILE);
  let bytes;
  try {
    const info = lstatSync(filename);
    if (!info.isFile() || info.isSymbolicLink()) failure("personal profile must be a regular file", "PROFILE_PATH_UNSAFE");
    bytes = readFileSync(filename);
  }
  catch (error) {
    if (error.code === "ENOENT") return { schema_version: "forgeway-project-profile-check/1", status: "missing", path: PROFILE, missing_fields: ["roles", "preferences"], authorizes_execution: false };
    if (error.code === "PROFILE_PATH_UNSAFE") throw error;
    failure("personal profile cannot be read", "PROFILE_READ_FAILED");
  }
  let profile;
  try {
    profile = JSON.parse(bytes.toString("utf8"));
    const document = YAML.parseDocument(bytes.toString("utf8"), { schema: "json", uniqueKeys: true });
    if (document.errors.length) throw new Error("duplicate keys");
  } catch { return { schema_version: "forgeway-project-profile-check/1", status: "invalid", path: PROFILE, errors: ["profile must be strict JSON without duplicate keys"], authorizes_execution: false }; }
  if (!validate(profile)) return { schema_version: "forgeway-project-profile-check/1", status: "invalid", path: PROFILE, errors: validate.errors.map((item) => `${item.instancePath || "/"} ${item.message}`), authorizes_execution: false };
  if (profile.roles.length === 0) return { schema_version: "forgeway-project-profile-check/1", status: "incomplete", path: PROFILE, profile, missing_fields: ["roles"], authorizes_execution: false };
  if (!personalFileIsPrivate(root)) return { schema_version: "forgeway-project-profile-check/1", status: "invalid", path: PROFILE, errors: ["personal profile must be untracked and ignored by the project-docs Git repository"], authorizes_execution: false };
  return { schema_version: "forgeway-project-profile-check/1", status: "ready", path: PROFILE, profile, authorizes_execution: false };
}

export function profileCommand(positionals, flags) {
  if (positionals.length !== 3 || positionals[0] !== "profile" || positionals[1] !== "check") failure("usage: forgeway profile check <project-root>", "PROFILE_INPUT_INVALID");
  const allowed = new Set(["compact"]);
  if (Object.keys(flags).some((key) => !allowed.has(key))) failure("profile check accepts only --compact", "PROFILE_INPUT_INVALID");
  return checkProjectProfile(positionals[2]);
}
