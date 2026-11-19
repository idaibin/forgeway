import { assert, exactKeys, freeze, hash, text, VERSION } from "./common.mjs";
import { emptyUserConfig, validateUserConfig } from "./config.mjs";

import { PROFILE_KINDS, supportProjection } from "./profiles.mjs";
export const SUBJECT_KINDS = ["component", "configuration"];
const verifiedDiagnoses = new WeakSet();
export const isCollectedDiagnosis = diagnosis => verifiedDiagnoses.has(diagnosis);
const FACT_KEYS = ["source", "installed", "dependencies", "loaded", "invocation", "owners", "contract", "limitations", "metadata"];

function validateRequest(request) {
  exactKeys(request, ["schema_version", "problem", "subjects", "scope", "operation", "relations"]);
  assert(request.schema_version === VERSION, "MAINTENANCE_REQUEST_VERSION");
  assert(text(request.problem) && ["inspect", "diagnose"].includes(request.operation), "MAINTENANCE_INPUT_INVALID");
  assert(Array.isArray(request.scope) && request.scope.length && request.scope.every(text), "MAINTENANCE_INPUT_INVALID");
  assert(Array.isArray(request.subjects) && request.subjects.length, "MAINTENANCE_INPUT_INVALID");
  const ids = new Set();
  for (const subject of request.subjects) {
    exactKeys(subject, ["id", "kind", "profile", "name", "source_id", "owner_hint"]);
    assert(text(subject.id) && !ids.has(subject.id) && SUBJECT_KINDS.includes(subject.kind) && text(subject.name), "MAINTENANCE_INPUT_INVALID");
    assert(Object.hasOwn(PROFILE_KINDS, subject.profile) && PROFILE_KINDS[subject.profile] === subject.kind, "MAINTENANCE_PROFILE_INVALID");
    ids.add(subject.id);
    for (const key of ["source_id", "owner_hint"]) assert(subject[key] === undefined || text(subject[key]), "MAINTENANCE_INPUT_INVALID");
  }
  assert(request.relations === undefined || Array.isArray(request.relations), "MAINTENANCE_RELATION_UNKNOWN");
  const edges = new Set();
  for (const edge of request.relations ?? []) {
    exactKeys(edge, ["from", "to", "type"]);
    assert(edge.type === "requires-compatibility" && edge.from !== edge.to && ids.has(edge.from) && ids.has(edge.to), "MAINTENANCE_RELATION_UNKNOWN");
    assert(!edges.has(`${edge.from}:${edge.to}`), "MAINTENANCE_RELATION_UNKNOWN"); edges.add(`${edge.from}:${edge.to}`);
  }
}
function observation(value, layer) {
  if (!value) return { status: "Not verified" };
  exactKeys(value, ["identity", "revision", "sha256", "evidence_ref", "collector", "scope", "trusted", "session_id", "compatible", "limitations", "source_identity", "source_sha256", "installed_identity", "repository_id", "source_revision"]);
  assert(text(value.identity) && text(value.evidence_ref) && text(value.collector) && Array.isArray(value.scope) && value.scope.every(text), "MAINTENANCE_COLLECTOR_INVALID");
  if (value.sha256 !== undefined) assert(/^[a-f0-9]{64}$/u.test(value.sha256), "MAINTENANCE_COLLECTOR_INVALID");
  if (layer === "source") assert(text(value.revision) && value.sha256, "MAINTENANCE_COLLECTOR_INVALID");
  if (layer === "loaded") assert(text(value.session_id) && value.sha256, "MAINTENANCE_COLLECTOR_INVALID");
  return { ...structuredClone(value), status: layer === "source" && value.trusted !== true ? "Declared" : "observed" };
}

export async function inspectMaintenance(request, { collector, config = emptyUserConfig(), configSha256 = null } = {}) {
  validateRequest(request);
  // Collector awaits must not change the request whose evidence is projected.
  try { request = structuredClone(request); } catch { assert(false, "MAINTENANCE_INPUT_INVALID"); }
  validateRequest(request);
  config = validateUserConfig(config);
  assert(!collector || (typeof collector.collect === "function" && text(collector.id)), "MAINTENANCE_COLLECTOR_INVALID");
  const subjects = [];
  for (const declared of request.subjects) {
    const hints = config.sources.filter(item => item.id === declared.source_id);
    const collected = collector ? await collector.collect(freeze(structuredClone(declared)), freeze({ scope: [...request.scope], hints, exclude: [...config.exclude] })) : {};
    exactKeys(collected, FACT_KEYS);
    // Capture each completed response before another collector can reuse it.
    let facts;
    try { facts = structuredClone(collected); } catch { assert(false, "MAINTENANCE_COLLECTOR_INVALID"); }
    exactKeys(facts, FACT_KEYS);
    const layers = Object.fromEntries(["source", "installed", "dependencies", "loaded", "invocation"].map(layer => [layer, observation(facts[layer], layer)]));
    const owners = facts.owners ?? [];
    assert(Array.isArray(owners) && owners.every(owner => text(owner.id) && text(owner.evidence_ref) && text(owner.binding) && Array.isArray(owner.effects) && owner.effects.every(text)), "MAINTENANCE_COLLECTOR_INVALID");
    const axes = declared.kind === "configuration" || request.operation === "inspect" ? ["source"] : ["source", "installed", "dependencies", "invocation", "loaded"];
    const gaps = [];
    if (facts.metadata && facts.metadata.status !== "observed") gaps.push(facts.metadata.status === "unsupported" ? "reader-unsupported" : "metadata-unverified");
    for (const layer of ["installed", "dependencies"]) if (axes.includes(layer) && layers[layer].status !== "observed") gaps.push(`${layer}-unverified`);
    for (const [layer, observed] of Object.entries(layers)) {
      if (!axes.includes(layer) || observed.status === "Not verified") continue;
      if (observed.collector !== collector.id || !observed.scope.includes(declared.id)) gaps.push(`${layer}-evidence-binding-mismatch`);
    }
    if (axes.includes("installed") && layers.installed.status === "observed") {
      if (!layers.installed.source_identity || !layers.source.identity) gaps.push("installed-source-binding-unverified");
      else if (layers.installed.source_identity !== layers.source.identity) gaps.push("installed-source-identity-mismatch");
      else if (!text(layers.installed.source_revision) || !/^[a-f0-9]{64}$/u.test(layers.installed.source_sha256 ?? "")) gaps.push("installed-source-binding-unverified");
      else if (layers.installed.source_sha256 !== layers.source.sha256 || layers.installed.source_revision !== layers.source.revision) gaps.push("installed-version-drift");
    }
    for (const layer of ["loaded", "invocation"]) {
      if (axes.includes(layer) && layers[layer].status === "observed") {
        if (layers[layer].installed_identity !== layers.installed.identity) gaps.push(`${layer}-installation-identity-mismatch`);
        else if (layers[layer].sha256 !== layers.installed.sha256) gaps.push(`${layer}-version-drift`);
      }
    }
    if (layers.source.status !== "observed") gaps.push("source-unverified");

    if (owners.length !== 1) gaps.push(owners.length ? "owner-ambiguous" : "owner-unavailable");
    if (axes.includes("invocation") && layers.invocation.status !== "observed") gaps.push("invocation-unverified");
    if (axes.includes("loaded") && layers.loaded.status !== "observed") gaps.push("loaded-unverified");
    subjects.push({ id: declared.id, kind: declared.kind, profile: declared.profile, name: declared.name, applicable_axes: axes, metadata: facts.metadata ?? { status: "Not verified" }, support: supportProjection(declared.profile), declared: structuredClone(declared), ...layers, owners: structuredClone(owners), contract: facts.contract ?? null, gaps, limitations: facts.limitations ?? [] });
  }
  // Native collectors declare known peer constraints even when omitted from
  // the user's request. A boolean compatibility label is never evidence.
  const required = [...(request.relations ?? [])];
  for (const subject of subjects) {
    if (subject.contract === null) continue;
    const peers = subject.contract.required_peers;
    if (!Array.isArray(peers) || subject.contract.compatible !== undefined && !peers.length || new Set(peers).size !== peers.length || !peers.every(id => text(id) && id !== subject.id && subjects.some(peer => peer.id === id)) || subject.contract.compatible !== undefined && subject.contract.compatible !== true) {
      subject.gaps.push("contract-unverified-or-incompatible"); continue;
    }
    for (const id of peers) if (!required.some(edge => edge.from === subject.id && edge.to === id || edge.to === subject.id && edge.from === id)) required.push({ from: subject.id, to: id, type: "requires-compatibility" });
  }
  const relations = [];
  for (const edge of required) {
    const from = subjects.find(subject => subject.id === edge.from), to = subjects.find(subject => subject.id === edge.to), peers = [from, to];
    const binding = subject => ({ subject_id: subject.id, identity: subject.source.identity, revision: subject.source.revision, sha256: subject.source.sha256 });
    const sourceBound = peers.every(subject => subject.source.status === "observed" && subject.source.collector === collector?.id && subject.source.scope.includes(subject.id) && !subject.gaps.includes("source-evidence-binding-mismatch"));
    const basis = sourceBound ? { from: binding(from), to: binding(to) } : null;
    let evidence = null, compatible = false;
    if (basis && typeof collector?.collectCompatibility === "function") {
      try {
        evidence = await collector.collectCompatibility(freeze(structuredClone(edge)), freeze(structuredClone(basis)));
        exactKeys(evidence, ["status", "basis", "sha256", "evidence_ref", "collector", "scope"], "MAINTENANCE_COMPATIBILITY_EVIDENCE_INVALID");
        compatible = evidence.status === "compatible" && evidence.collector === collector.id && text(evidence.evidence_ref) && /^[a-f0-9]{64}$/u.test(evidence.sha256 ?? "") && Array.isArray(evidence.scope) && peers.every(subject => evidence.scope.includes(subject.id)) && hash(evidence.basis) === hash(basis);
      } catch { evidence = null; }
    }
    if (!compatible || peers.some(subject => subject.gaps.includes("contract-unverified-or-incompatible"))) {
      compatible = false;
      for (const subject of peers) if (!subject.gaps.includes("contract-unverified-or-incompatible")) subject.gaps.push("contract-unverified-or-incompatible");
    }
    relations.push({ ...edge, compatible, basis, evidence: evidence === null ? null : structuredClone(evidence), authorizes_execution: false });
  }
  const units = subjects.flatMap(subject => subject.metadata.components ?? []).map(component => component.unit_key).filter(Boolean);
  const body = { relations, coverage: { subjects: subjects.length, unresolved_subjects: subjects.filter(subject => subject.gaps.length).length, metadata_observed_subjects: subjects.filter(subject => subject.metadata.status === "observed").length, component_surfaces: units.length, distinct_component_units: new Set(units).size }, schema_version: VERSION, request: structuredClone(request), config_sha256: hash(config), config_file_sha256: configSha256, collector: collector?.id ?? null, authorizes_execution: false, subjects };
  const result = freeze({ ...body, snapshot_sha256: hash(body), status: subjects.some(subject => subject.gaps.length) ? "partial" : "resolved" });
  if (collector) verifiedDiagnoses.add(result);
  return result;
}
