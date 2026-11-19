export function validateCapabilityRegistry(registry) {
  const fail = (message, code) => { throw Object.assign(new Error(message), { code, exitCode: 2 }); };
  if (!registry || registry.version !== 3 || registry.contract_version !== "capability-registry/3" || !Array.isArray(registry.packages) || !Array.isArray(registry.capabilities) || !registry.schema_refs || !registry.categories) fail("unsupported capability registry", "FORGEWAY_REGISTRY_INVALID");
  const packageNames = registry.packages.map((item) => item?.name);
  const capabilityIds = registry.capabilities.map((item) => item?.capability_id);
  if (packageNames.some((name) => typeof name !== "string" || !name) || new Set(packageNames).size !== packageNames.length) fail("capability registry package identities are invalid or duplicated", "FORGEWAY_REGISTRY_INVALID");
  if (capabilityIds.some((id) => typeof id !== "string" || !id) || new Set(capabilityIds).size !== capabilityIds.length) fail("capability registry capability identities are invalid or duplicated", "FORGEWAY_REGISTRY_INVALID");
  if (registry.capabilities.some((capability) => !packageNames.includes(capability.package))) fail("capability registry contains an unknown package reference", "FORGEWAY_REGISTRY_REF_INVALID");
  const declaredByPackage = new Map(registry.packages.map((item) => [item.name, new Set(item.capability_ids ?? [])]));
  if (registry.capabilities.some((capability) => !declaredByPackage.get(capability.package)?.has(capability.capability_id))) fail("capability registry package/capability closure is inconsistent", "FORGEWAY_REGISTRY_REF_INVALID");
  const declaredCapabilities = new Set(registry.packages.flatMap((item) => item.capability_ids ?? []));
  if ([...declaredCapabilities].some((id) => !capabilityIds.includes(id))) fail("capability registry package declares a missing capability", "FORGEWAY_REGISTRY_REF_INVALID");
  const schemaRefs = new Set([...(registry.schema_refs.declared_portable ?? []), ...(registry.schema_refs.known_local ?? [])]);
  const requiredCapabilityFields = ["capability_version", "description", "accepts", "produces", "preconditions", "postconditions", "permission_contract", "failure_codes", "evidence_requirements", "adapter_binding"];
  for (const capability of registry.capabilities) {
    if (requiredCapabilityFields.some((field) => capability[field] === undefined)) fail(`capability contract is incomplete: ${capability.capability_id}`, "FORGEWAY_REGISTRY_INVALID");
    if (!/^\d+\.\d+\.\d+$/.test(capability.capability_version) || !Array.isArray(capability.accepts) || !Array.isArray(capability.produces) || capability.accepts.length === 0 || capability.produces.length === 0) fail(`capability IO/version contract is invalid: ${capability.capability_id}`, "FORGEWAY_REGISTRY_INVALID");
    for (const item of [...capability.accepts, ...capability.produces]) {
      if (!item?.schema || !["portable", "local"].includes(item.kind) || !schemaRefs.has(item.schema)) fail(`capability schema reference is not registered: ${capability.capability_id}`, "FORGEWAY_REGISTRY_REF_INVALID");
    }
    if (!capability.permission_contract?.maximum_mutation_class || !Array.isArray(capability.permission_contract.maximum_effects) || capability.adapter_binding?.policy !== "runtime-only") fail(`capability permission/adapter contract is invalid: ${capability.capability_id}`, "FORGEWAY_REGISTRY_INVALID");
  }
  return registry;
}
