import { validateCapabilityRegistry } from "./capability-registry.mjs";
import { readMetadataSnapshot } from "./maintenance/profiles.mjs";
import { digest, relative } from "./maintenance/common.mjs";

const fail = (code = "FORGEWAY_CAPABILITY_DIRECTORY_INPUT_INVALID") => { throw Object.assign(new Error(code), { code, exitCode: 2 }); };
const assert = (value, code) => { if (!value) fail(code); };
const string = value => typeof value === "string" && value.length > 0 && value.length <= 4096 && !/[\u0000-\u001f]/u.test(value);
function boundedShape(value) {
  const pending = [[value, 0]]; let nodes = 0;
  while (pending.length) {
    const [item, depth] = pending.pop();
    assert(++nodes <= 20000 && depth <= 24, "FORGEWAY_CAPABILITY_DIRECTORY_LIMIT");
    if (typeof item === "string") assert(item.length <= 4096, "FORGEWAY_CAPABILITY_DIRECTORY_LIMIT");
    if (item && typeof item === "object") for (const child of Object.values(item)) pending.push([child, depth + 1]);
  }
}
function resultReference(ref) {
  if (!string(ref) || ref.length > 2048 || /\s/u.test(ref)) return false;
  if (ref.startsWith("https://")) {
    try { const url = new URL(ref); return !url.username && !url.password && !!url.hostname; } catch { return false; }
  }
  if (/^(?:urn|run|attempt|obs|pkg|observation|package):[A-Za-z0-9._:/#?=&%+-]+$/u.test(ref)) return true;
  return !ref.includes(":") && relative(ref.split("#")[0]);
}

// A disposable view of inspection/1, never an inventory, catalog or authorization.
export async function capabilityDirectory(flags, { inspect, resolve, validateAdapters }) {
  const allowed = new Set(["registry", "adapters", "capability-id", "capability-version", "view", "result-ref", "compact"]);
  for (const [key, value] of Object.entries(flags)) {
    assert(allowed.has(key));
    if (key === "compact") { assert(value === true); continue; }
    assert(Array.isArray(value) && value.every(string));
    assert(value.length <= (key === "result-ref" ? 64 : 1));
  }
  assert(flags.view?.[0] === "directory" && flags.registry?.length === 1);
  const registryBytes = await readMetadataSnapshot(flags.registry[0]);
  const registry = JSON.parse(registryBytes.toString("utf8")); boundedShape(registry);
  assert(Array.isArray(registry?.packages) && registry.packages.length <= 512 && Array.isArray(registry?.capabilities) && registry.capabilities.length <= 2048, "FORGEWAY_CAPABILITY_DIRECTORY_LIMIT");
  validateCapabilityRegistry(registry);
  let manifest = null, adapterBytes = null;
  if (flags.adapters) {
    adapterBytes = await readMetadataSnapshot(flags.adapters[0]); manifest = JSON.parse(adapterBytes.toString("utf8")); boundedShape(manifest);
    assert(Array.isArray(manifest?.adapters) && manifest.adapters.length <= 128 && manifest.adapters.reduce((sum, row) => sum + (Array.isArray(row?.capabilities) ? row.capabilities.length : 4097), 0) <= 4096, "FORGEWAY_CAPABILITY_DIRECTORY_LIMIT");
    validateAdapters(manifest);
  }
  const inputs = { registry, manifest };
  // Selection and contract validation use the original inspection and resolver.
  const inspected = inspect(flags, inputs), selectedIds = new Set(inspected.capabilities.map(row => row.capability_id));
  const links = new Map();
  for (const spec of flags["result-ref"] ?? []) {
    const at = spec.indexOf("="), id = spec.slice(0, at), ref = spec.slice(at + 1);
    assert(at > 0 && selectedIds.has(id) && resultReference(ref));
    const values = links.get(id) ?? []; assert(!values.some(row => row.ref === ref));
    values.push({ ref, binding: "caller-declared", verification: "unknown", participation: "unknown" }); links.set(id, values);
  }
  const implementations = new Map(), capabilities = [], unresolvedOffers = [];
  const registryIds = new Set(registry.capabilities.map(row => row.capability_id));
  for (const adapter of manifest?.adapters ?? []) {
    const ref = `adapter:${adapter.adapter_id}@${adapter.adapter_version}`;
    implementations.set(ref, { implementation_ref: ref, native_identity: adapter.adapter_id, adapter_version: adapter.adapter_version, surface: "runtime-adapter-snapshot", component_binding: "unknown", implementation_form: "unknown", role: "declares the capability IO/permission boundary; invocation remains host-owned" });
    for (const offer of adapter.capabilities) if (!registryIds.has(offer.capability_id)) unresolvedOffers.push({ implementation_ref: ref, capability_id: offer.capability_id, capability_version: offer.capability_version, gap: "capability-not-in-registry", binding: "unknown" });
  }
  const absenceCodes = new Set(["CAPABILITY_ADAPTER_MISSING", "CAPABILITY_ADAPTER_SELECTION_INVALID"]);
  for (const capability of inspected.capabilities) {
    const packageRef = `package:${capability.package}`;
    if (!implementations.has(packageRef)) implementations.set(packageRef, { implementation_ref: packageRef, native_identity: capability.package, surface: "registry-package", declared_owner: capability.package_contract?.owner ?? null, component_binding: "unknown", implementation_form: "unknown" });
    let resolution = null, compatibility = "unknown", code = null;
    if (manifest) {
      try { resolution = resolve({ registry: flags.registry, adapters: flags.adapters, "capability-id": [capability.capability_id], "capability-version": [capability.capability_version] }, inputs); compatibility = resolution.selection_required ? "selection-required" : "compatible"; }
      catch (error) { if (!absenceCodes.has(error.code)) throw error; compatibility = "no-compatible-candidate"; code = error.code; }
    }
    const compatibleIds = new Set((resolution?.compatible_adapters ?? []).map(row => row.adapter_id)), candidates = [];
    for (const adapter of manifest?.adapters ?? []) {
      const offers = adapter.capabilities.filter(row => row.capability_id === capability.capability_id); if (!offers.length) continue;
      const ref = `adapter:${adapter.adapter_id}@${adapter.adapter_version}`;
      candidates.push({ implementation_ref: ref, offered_versions: offers.map(row => row.capability_version).sort(), contract_compatibility: compatibleIds.has(adapter.adapter_id) ? "compatible" : "not-compatible" });
    }
    capabilities.push({ capability_id: capability.capability_id, capability_version: capability.capability_version, declared_task: capability.description,
      invocation_contract: { accepts: capability.accepts, preconditions: capability.preconditions, binding: "host-owned; current binding unknown" },
      expected_effect: { produces: capability.produces, postconditions: capability.postconditions }, permission_contract: capability.permission_contract, evidence_requirements: capability.evidence_requirements,
      implementation_refs: [packageRef], candidates: candidates.sort((a, b) => a.implementation_ref.localeCompare(b.implementation_ref)),
      contract_compatibility: compatibility, compatibility_code: code, selection_required: resolution?.selection_required ?? null,
      readiness: "unknown", actual_execution: "unknown", effect_verification: "unknown", efficiency: "unknown",
      gaps: [...(!manifest ? ["adapter-snapshot-not-provided"] : compatibility === "selection-required" ? ["candidate-selection-required"] : compatibility === "no-compatible-candidate" ? ["compatible-candidate-unavailable"] : []), "current-host-callability-not-verified", "implementation-component-binding-unknown", "execution-and-effect-not-verified", "efficiency-evidence-unavailable"],
      result_refs: links.get(capability.capability_id) ?? [] });
  }
  return { schema_version: "forgeway-capability-inspection/1", view: "directory", registry_contract: registry.contract_version, registry_sha256: digest(registryBytes), adapters_sha256: adapterBytes ? digest(adapterBytes) : null,
    authorizes_execution: false, static_manifest_authorizes: false, unresolved_offers: unresolvedOffers, capabilities: capabilities.sort((a, b) => a.capability_id.localeCompare(b.capability_id)), implementations: [...implementations.values()].sort((a, b) => a.implementation_ref.localeCompare(b.implementation_ref)) };
}
