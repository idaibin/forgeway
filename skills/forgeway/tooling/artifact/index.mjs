import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const INSPECTOR = fileURLToPath(new URL("./inspector.py", import.meta.url));

function fail(message, code = "ARTIFACT_INPUT_INVALID", exitCode = 2) {
  const error = new Error(message);
  error.code = code;
  error.exitCode = exitCode;
  throw error;
}

function repeated(flags, key) {
  const value = flags[key];
  if (value === undefined) return [];
  if (value === true || !Array.isArray(value) || value.some((item) => !item)) fail(`--${key} requires a value`);
  return value;
}

function run(args) {
  const version = spawnSync("python3", ["--version"], { encoding: "utf8", timeout: 5000 });
  const match = /^Python (\d+)\.(\d+)\./.exec((version.stdout || version.stderr || "").trim());
  if (version.error || !match || Number(match[1]) < 3 || (Number(match[1]) === 3 && Number(match[2]) < 10)) {
    fail("artifact inspection requires Python 3.10 or newer", "ARTIFACT_RUNTIME_UNAVAILABLE", 3);
  }
  const result = spawnSync("python3", ["-I", INSPECTOR, ...args, "--json"], {
    encoding: "utf8",
    timeout: 300000,
    maxBuffer: 32_000_000,
    env: { ...process.env, PYTHONDONTWRITEBYTECODE: "1" }
  });
  if (result.error) fail(`Python artifact inspector could not run: ${result.error.message}`, "ARTIFACT_RUNTIME_UNAVAILABLE", 3);
  if (result.status === 2) fail(`artifact arguments rejected: ${(result.stderr || "invalid arguments").trim().slice(0, 800)}`);
  let payload;
  try { payload = JSON.parse(result.stdout); } catch { fail("Python artifact inspector returned invalid JSON", "ARTIFACT_RUNTIME_INVALID", 3); }
  if (![0, 1].includes(result.status) || payload?.ok !== (result.status === 0) || !["doctor", "inspect"].includes(payload.command)) {
    fail("Python artifact inspector returned an inconsistent result", "ARTIFACT_RUNTIME_INVALID", 3);
  }
  return { payload, exitCode: result.status };
}

export function artifactCommand(action, flags, positionals) {
  const allowed = action === "doctor" ? ["compact", "json"] : ["expected-arch", "require-member", "max-members", "compact", "json"];
  for (const key of Object.keys(flags)) if (!allowed.includes(key)) fail(`unsupported artifact option: --${key}`);
  if (action === "doctor") {
    if (positionals.length !== 2) fail("artifact doctor takes no paths");
    return run(["doctor"]);
  }
  if (action !== "inspect" || positionals.length < 3) fail("usage: forgeway artifact inspect <path> [<path> ...]");
  const args = ["inspect"];
  for (const value of repeated(flags, "expected-arch")) args.push(`--expected-arch=${value}`);
  for (const value of repeated(flags, "require-member")) args.push(`--require-member=${value}`);
  const max = repeated(flags, "max-members");
  if (max.length > 1 || (max.length === 1 && (!/^[0-9]+$/u.test(max[0]) || !Number.isSafeInteger(Number(max[0])) || Number(max[0]) < 1))) fail("--max-members must be one positive decimal integer");
  if (max.length) args.push("--max-members", max[0]);
  args.push("--", ...positionals.slice(2));
  return run(args);
}
