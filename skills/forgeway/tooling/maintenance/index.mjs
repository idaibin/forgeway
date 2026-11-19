export { planMaintenanceRetrospective, completeMaintenanceRetrospective } from "./retrospective.mjs";
export { createCodexEvidenceFeedbackReader } from "./codex-evidence.mjs";
export { createMaintenanceFeedbackReader, reviewMaintenanceFeedback } from "./feedback.mjs";
import YAML from "yaml";
import { readFile, lstat } from "node:fs/promises";
import { assert, VERSION } from "./common.mjs";
import { emptyUserConfig, readUserConfig } from "./config.mjs";
import { PROFILE_KINDS, createMetadataCollector } from "./profiles.mjs";
export { PROFILE_KINDS, createMetadataCollector } from "./profiles.mjs";
import { inspectMaintenance } from "./inspect.mjs";
import { inspectLocalForgeway, previewLocalMaintenance } from "./local.mjs";
export { inspectLocalForgeway, previewLocalMaintenance } from "./local.mjs";
export { inspectMaintenance } from "./inspect.mjs";
export { emptyUserConfig, validateUserConfig, readUserConfig, writeUserConfig } from "./config.mjs";

async function inputJson(filename, task = false) {
  try {
    const stat = await lstat(filename); assert(stat.isFile() && stat.size <= 1024 * 1024, "MAINTENANCE_INPUT_INVALID");
    const bytes = await readFile(filename, "utf8");
    if (!task || filename.endsWith(".json")) return JSON.parse(bytes);
    const document = YAML.parseDocument(bytes, { uniqueKeys: true, customTags: [] });
    assert(!document.errors.length && !document.warnings.length, "MAINTENANCE_INPUT_INVALID");
    return document.toJS({ maxAliasCount: 0 });
  } catch { assert(false, "MAINTENANCE_INPUT_INVALID"); }
}
export async function maintenanceCommand(action, flags, positionals) {
  const permitted = action === "config-template" ? ["compact"] : ["input", "config", "compact", "source-root", "installed-root", "source-id", "task", ...(action === "plan" ? ["project"] : [])];
  assert(positionals.length === 2, "MAINTENANCE_INPUT_INVALID");
  for (const [key, value] of Object.entries(flags)) assert(permitted.includes(key) && (key === "compact" ? value === true : Array.isArray(value) && value.length === 1), "MAINTENANCE_INPUT_INVALID");
  if (action === "config-template") return emptyUserConfig();
  assert(["doctor", "plan"].includes(action), "MAINTENANCE_HOST_REQUIRED");
  const configuration = await readUserConfig(flags.config?.[0]);
  const project = flags.project ? await inputJson(flags.project[0], true) : undefined;
  if (flags["source-root"] || flags["installed-root"] || flags["source-id"]) {
    assert(!flags.input && !(flags["source-root"] && flags["source-id"]), "MAINTENANCE_INPUT_INVALID");
    const hint = flags["source-id"] ? configuration.config.sources.find(item => item.id === flags["source-id"][0]) : null;
    assert(!flags["source-id"] || hint?.local_path, "MAINTENANCE_SOURCE_HINT_MISSING");
    if (hint && (hint.profile && hint.profile !== "forgeway-distribution" || hint.ownership === "external")) {
      const profile = hint.profile ?? "forgeway-distribution";
      assert(Object.hasOwn(PROFILE_KINDS, profile), "MAINTENANCE_PROFILE_INVALID");
      if (action === "plan" && profile === "skills-package" && hint.ownership !== "external" && !flags["installed-root"]) {
        assert(flags.task?.[0], "MAINTENANCE_TASK_REQUIRED");
        return previewLocalMaintenance({ task: await inputJson(flags.task[0], true), project, sourceId: hint.id, config: configuration.config, configSha256: configuration.sha256 });
      }
      assert(action === "doctor" && !flags.task && !flags["installed-root"], "MAINTENANCE_METADATA_READ_ONLY");
      const request = { schema_version: VERSION, operation: "inspect", problem: "Inspect explicitly registered metadata", scope: [hint.id], subjects: [{ id: hint.id, kind: PROFILE_KINDS[profile], profile, name: hint.id, source_id: hint.id }] };
      return inspectMaintenance(request, { collector: createMetadataCollector(configuration.config), config: configuration.config, configSha256: configuration.sha256 });
    }
    const options = { sourceRoot: flags["source-root"]?.[0] ?? hint?.local_path, installedRoot: flags["installed-root"]?.[0], entryPath: process.argv[1], config: configuration.config, configSha256: configuration.sha256 };
    if (action === "plan") {
      assert(flags.task?.[0], "MAINTENANCE_TASK_REQUIRED");
      return previewLocalMaintenance({ task: await inputJson(flags.task[0], true), project, ...options });
    }
    assert(!flags.task, "MAINTENANCE_INPUT_INVALID");
    return inspectLocalForgeway(options);
  }
  assert(action === "doctor" && !flags.task, "MAINTENANCE_INPUT_INVALID");
  assert(flags.input?.[0], "MAINTENANCE_INPUT_REQUIRED");
  const request = await inputJson(flags.input[0]);
  const collector = request.subjects?.some(subject => subject.source_id) ? createMetadataCollector(configuration.config) : undefined;
  const result = await inspectMaintenance(request, { collector, config: configuration.config, configSha256: configuration.sha256 });
  return { ...result, configuration: { status: configuration.status, sha256: configuration.sha256 }, execution: { status: "blocked", reason: "trusted-host-not-connected" }, schema_version: VERSION };
}
