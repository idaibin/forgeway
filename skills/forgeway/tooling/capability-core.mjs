// Canonical static adapter contract, shared by the CLI and workflow dispatch view.
// Parsed inputs only: no discovery, storage, host binding or invocation.
function fail(message, code, exitCode = 2) {
  throw Object.assign(new Error(message), { code, exitCode });
}

function hasForbiddenAdapterIdentity(value) {
  if (Array.isArray(value)) return value.some(hasForbiddenAdapterIdentity);
  if (!value || typeof value !== "object") return false;
  const forbidden = new Set(["executable", "cli_path", "command", "provider", "model"]);
  return Object.entries(value).some(([key, child]) => forbidden.has(key) || hasForbiddenAdapterIdentity(child));
}

export function validateAdapterManifest(manifest) {
  if (!manifest || manifest.schema_version !== "forgeway-runtime-adapters/1" || manifest.static_manifest_authorizes !== false || !Array.isArray(manifest.adapters) || hasForbiddenAdapterIdentity(manifest)) fail("unsupported runtime adapter manifest", "FORGEWAY_ADAPTER_MANIFEST_INVALID");
  const ids = new Set();
  const strings = (items, nonempty = true) => Array.isArray(items) && (!nonempty || items.length > 0) && items.every((item) => typeof item === "string" && item.trim().length > 0);
  for (const adapter of manifest.adapters) {
    if (!adapter || typeof adapter.adapter_id !== "string" || !adapter.adapter_id.trim() || ids.has(adapter.adapter_id) || !/^\d+\.\d+\.\d+$/.test(adapter.adapter_version ?? "") || adapter.runtime_binding !== "host-owned" || !Array.isArray(adapter.capabilities)) fail("runtime adapter contract is invalid or duplicated", "FORGEWAY_ADAPTER_MANIFEST_INVALID");
    ids.add(adapter.adapter_id);
    const capabilities = new Set();
    for (const candidate of adapter.capabilities) {
      if (!candidate || typeof candidate.capability_id !== "string" || !candidate.capability_id.trim() || !/^\d+\.\d+\.\d+$/.test(candidate.capability_version ?? "")) fail("runtime adapter capability identity is invalid", "FORGEWAY_ADAPTER_MANIFEST_INVALID");
      const identity = `${candidate.capability_id}@${candidate.capability_version}`;
      if (capabilities.has(identity)) fail("runtime adapter capability is duplicated", "FORGEWAY_ADAPTER_MANIFEST_INVALID");
      capabilities.add(identity);
      if (!strings(candidate.accepts) || !strings(candidate.produces) || [...candidate.accepts, ...candidate.produces].some((schema) => !schema.startsWith("urn:"))) fail("runtime adapter capability IO is invalid", "FORGEWAY_ADAPTER_MANIFEST_INVALID");
      if (typeof candidate.maximum_mutation_class !== "string" || !candidate.maximum_mutation_class.trim() || !strings(candidate.authorization_needs, false) || !strings(candidate.evidence_class) || !strings(candidate.terminal_states)) fail("runtime adapter capability boundary is incomplete", "FORGEWAY_ADAPTER_MANIFEST_INVALID");
    }
  }
}

export function resolveCapability(requested, manifest, { registryContract, adapterId } = {}) {
  validateAdapterManifest(manifest);
    const requestedAccepts = new Set(requested.accepts.map((item) => item.schema));
    const requestedProduces = new Set(requested.produces.map((item) => item.schema));
    const compatible = [];
    const selectedAdapterId = adapterId;
    for (const adapter of manifest.adapters) {
      for (const candidate of adapter.capabilities) {
        if (candidate?.capability_id !== requested.capability_id || candidate.capability_version !== requested.capability_version) continue;
        if (candidate.maximum_mutation_class !== requested.permission_contract.maximum_mutation_class) fail("runtime adapter mutation boundary is incompatible", "FORGEWAY_ADAPTER_MANIFEST_INVALID");
        const accepts = new Set(candidate.accepts);
        const produces = new Set(candidate.produces);
        if ([...requestedAccepts].every((schema) => accepts.has(schema)) && [...requestedProduces].every((schema) => produces.has(schema))) compatible.push({ adapter_id: adapter.adapter_id, adapter_version: adapter.adapter_version, capability: candidate });
      }
    }
    if (compatible.length === 0) fail(`compatible runtime adapter missing: ${requested.capability_id}@${requested.capability_version}`, "CAPABILITY_ADAPTER_MISSING", 3);
    if (selectedAdapterId && !compatible.some((candidate) => candidate.adapter_id === selectedAdapterId)) {
      fail(`selected runtime adapter is not compatible: ${selectedAdapterId}`, "CAPABILITY_ADAPTER_SELECTION_INVALID", 3);
    }
    compatible.sort((left, right) => left.adapter_id.localeCompare(right.adapter_id) || left.adapter_version.localeCompare(right.adapter_version));
    const selectedAdapter = selectedAdapterId
      ? compatible.find((candidate) => candidate.adapter_id === selectedAdapterId)
      : compatible.length === 1 ? compatible[0] : null;
    return {
      schema_version: "forgeway-capability-resolution/1",
      registry_contract: registryContract,
      capability_id: requested.capability_id,
      capability_version: requested.capability_version,
      static_manifest_authorizes: false,
      runtime_adapter_authorizes: false,
      compatible_adapters: compatible,
      selected_adapter: selectedAdapter ?? null,
      selection_required: !selectedAdapter && compatible.length > 1,
      effective_scope: "user-scope ∩ host-scope ∩ capability-maximum"
    };
}
