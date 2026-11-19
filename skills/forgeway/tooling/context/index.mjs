import { createHash } from "node:crypto";

import { sha256 } from "../delivery/index.mjs";
import { typedArtifactValidation } from "../artifact-validation.mjs";

export const CONTEXT_PROJECTION_VERSION = "forgeway-context-projection/1";

const ARTIFACT_ID_FIELDS = Object.freeze({
  project: "project_id",
  requirement: "id",
  task: "id",
  change: "id",
  evidence: "id"
});

function error(message, code) {
  const cause = new Error(message);
  cause.code = code;
  cause.exitCode = 3;
  return cause;
}

function assert(condition, message, code) {
  if (!condition) throw error(message, code);
}

function unique(values) {
  return [...new Set(values.filter(Boolean))].sort();
}

function normalPath(value) {
  return String(value).replaceAll("\\", "/").replace(/^\.\//, "");
}

function artifactId(kind, value) {
  const field = ARTIFACT_ID_FIELDS[kind];
  assert(field, `unsupported typed artifact kind: ${kind}`, "CONTEXT_ARTIFACT_KIND_UNSUPPORTED");
  const id = value?.[field];
  assert(typeof id === "string" && id.length > 0, `typed artifact ${kind} is missing ${field}`, "CONTEXT_ARTIFACT_ID_REQUIRED");
  assert(typeof value.schema_version === "string" && value.schema_version.length > 0, `typed artifact ${kind}:${id} is missing schema_version`, "CONTEXT_ARTIFACT_VERSION_REQUIRED");
  return id;
}

function assertTypedArtifactValid(kind, value) {
  const validation = typedArtifactValidation(kind, value);
  assert(validation.schema_errors.length === 0,
    `typed artifact is invalid: ${kind} (${JSON.stringify(validation.schema_errors)})`,
    "CONTEXT_ARTIFACT_INVALID");
  assert(validation.semantic_errors.length === 0,
    `typed artifact semantics are invalid: ${kind} (${JSON.stringify(validation.semantic_errors)})`,
    "CONTEXT_ARTIFACT_SEMANTICS_INVALID");
}

function scopeEntryPath(entry) {
  if (typeof entry === "string") return entry;
  return entry?.path;
}

function scopeMatches(assetPath, rawPattern) {
  const pattern = normalPath(rawPattern);
  if (pattern === "**" || pattern === "*") return true;
  if (pattern.endsWith("/**")) {
    const prefix = pattern.slice(0, -3).replace(/\/$/, "");
    return assetPath === prefix || assetPath.startsWith(`${prefix}/`);
  }
  return assetPath === pattern;
}

function typedArtifactRefs(artifacts) {
  const refs = [];
  for (const artifact of artifacts) {
    const value = artifact.value;
    if (artifact.kind === "task") {
      for (const id of value.requirement_ids ?? []) refs.push({ from_kind: artifact.kind, from: artifact.id, kind: "requirement", id });
    }
    if (artifact.kind === "change") {
      for (const id of value.requirement_ids ?? []) refs.push({ from_kind: artifact.kind, from: artifact.id, kind: "requirement", id });
    }
    if (artifact.kind === "evidence") {
      for (const id of value.requirement_ids ?? []) refs.push({ from_kind: artifact.kind, from: artifact.id, kind: "requirement", id });
      for (const id of value.task_ids ?? []) refs.push({ from_kind: artifact.kind, from: artifact.id, kind: "task", id });
      for (const id of value.change_ids ?? []) refs.push({ from_kind: artifact.kind, from: artifact.id, kind: "change", id });
    }
  }
  return refs;
}

export function artifactRepositoryMap(artifacts) {
  const coordinateArtifacts = artifacts.filter(artifact => ["project", "task"].includes(artifact.kind));
  if (coordinateArtifacts.some(artifact => artifact.value.schema_version === "1.2")) assert(coordinateArtifacts.every(artifact => artifact.value.schema_version === "1.2"), "Project/Task 1.2 cannot mix coordinate versions", "CONTEXT_ARTIFACT_COORDINATE_VERSION_MISMATCH");
  const mapping = new Map();
  for (const artifact of artifacts) {
    if (artifact.kind !== "project" || !["1.1", "1.2"].includes(artifact.value.schema_version)) continue;
    for (const repository of artifact.value.repositories ?? []) {
      assert(!mapping.has(repository.id) || mapping.get(repository.id) === repository.repository,
        `typed project repository id is ambiguous: ${repository.id}`,
        "CONTEXT_ARTIFACT_AMBIGUOUS");
      mapping.set(repository.id, repository.repository);
    }
  }
  return mapping;
}

function artifactRepositoryBases(artifact, repositoryMap) {
  const value = artifact.value;
  if (artifact.kind === "project") {
    if (value.schema_version === "1.0") return [{ repository_id: value.repository, commit_sha: value.basis?.commit_sha }];
    return (value.repositories ?? []).map((repository) => ({ repository_id: repository.repository, commit_sha: repository.basis?.commit_sha }));
  }
  const entries = Array.isArray(value.basis) ? value.basis : value.basis ? [value.basis] : [];
  return entries.map((basis) => ({ repository_id: repositoryMap.get(basis.repository_id) ?? basis.repository_id ?? basis.repository, commit_sha: basis.commit_sha }));
}

function assertArtifactBasis(artifacts, graphRepositoryId, graphBasis) {
  if (!graphBasis.head_sha) return;
  const repositoryMap = artifactRepositoryMap(artifacts);
  for (const artifact of artifacts) {
    const repositoryBases = artifactRepositoryBases(artifact, repositoryMap);
    if (repositoryBases.length === 0) continue;
    const matching = repositoryBases.filter((basis) => basis.repository_id === graphRepositoryId);
    assert(matching.length === 1,
      `typed artifact basis does not identify graph repository: ${artifact.kind}:${artifact.id} -> ${graphRepositoryId}`,
      "CONTEXT_ARTIFACT_REPOSITORY_MISMATCH");
    assert(matching[0].commit_sha === graphBasis.head_sha,
      `typed artifact basis does not match graph head: ${artifact.kind}:${artifact.id}`,
      "CONTEXT_ARTIFACT_BASIS_MISMATCH");
  }
}

export function artifactTaskScope(artifacts, graphRepositoryId) {
  const include = [];
  const exclude = [];
  const repositoryMap = artifactRepositoryMap(artifacts);
  const componentRepositories = new Map();
  for (const artifact of artifacts) {
    if (artifact.kind !== "project" || !["1.1", "1.2"].includes(artifact.value.schema_version)) continue;
    for (const component of artifact.value.components ?? []) componentRepositories.set(component.id, repositoryMap.get(component.repository_id) ?? component.repository_id);
  }
  for (const artifact of artifacts) {
    if (artifact.kind === "task") {
      if (artifact.value.schema_version === "1.2") {
        const components = artifacts.filter(row => row.kind === "project" && row.value.schema_version === "1.2").flatMap(row => row.value.components);
        for (const ref of [...artifact.value.scope.include, ...artifact.value.scope.exclude, ...artifact.value.outputs, ...artifact.value.commands]) {
          const matches = components.filter(component => component.id === ref.component_id);
          assert(matches.length === 1, `Task 1.2 component is missing or ambiguous: ${ref.component_id}`, "CONTEXT_ARTIFACT_COMPONENT_AMBIGUOUS");
          const component = matches[0], value = ref.path ?? ref.cwd;
          assert(artifact.value.basis.some(row => row.repository_id === component.repository_id), `Task 1.2 component has no declared repository basis: ${ref.component_id}`, "CONTEXT_ARTIFACT_REPOSITORY_MISMATCH");
          assert(component.path === "." || value === component.path || value.startsWith(component.path + "/"), `Task 1.2 path leaves its component: ${value}`, "CONTEXT_ARTIFACT_COMPONENT_PATH_MISMATCH");
        }
      }
      for (const [target, entries] of [[include, artifact.value.scope?.include ?? []], [exclude, artifact.value.scope?.exclude ?? []]]) {
        for (const entry of entries) {
          if (typeof entry === "object") {
            const repository = componentRepositories.get(entry.component_id);
            assert(repository, `typed task scope component is unresolved: ${entry.component_id}`, "CONTEXT_ARTIFACT_REF_UNRESOLVED");
            if (repository !== graphRepositoryId) continue;
          }
          target.push(scopeEntryPath(entry));
        }
      }
    }
  }
  return {
    include: unique(include.map((value) => value && normalPath(value))),
    exclude: unique(exclude.map((value) => value && normalPath(value)))
  };
}

function scopePatternContains(parent, child) {
  const outer = normalPath(parent);
  const inner = normalPath(child);
  if (outer === "**" || outer === "*") return true;
  if (outer.endsWith("/**")) {
    const prefix = outer.slice(0, -3).replace(/\/$/, "");
    return inner === prefix || inner.startsWith(`${prefix}/`);
  }
  return outer === inner;
}

function scopedSeedAssetIds(scope, assets, graphCandidatePaths) {
  const assetsById = new Map(assets.map((asset) => [asset.asset_id, asset]));
  return unique(scope.map((entry) => {
    if (typeof entry !== "object" || !entry.asset_id) return null;
    const asset = assetsById.get(entry.asset_id);
    assert(asset, `scope asset is absent from selected graph: ${entry.asset_id}`, "CONTEXT_ASSET_REF_UNRESOLVED");
    assert(scopeMatches(asset.path, scopeEntryPath(entry)),
      `scope asset does not match its declared path: ${entry.asset_id} -> ${scopeEntryPath(entry)}`,
      "CONTEXT_SCOPE_ASSET_MISMATCH");
    return graphCandidatePaths.some((scopePath) => scopeMatches(asset.path, scopePath)) ? entry.asset_id : null;
  }));
}

function assertBasisClosure(graphSnapshot, inputPackage) {
  assert(graphSnapshot.repository_id === inputPackage.repository_id,
    `graph repository ${graphSnapshot.repository_id} does not match delivery repository ${inputPackage.repository_id}`,
    "CONTEXT_BASIS_REPOSITORY_MISMATCH");
  const graphBasis = graphSnapshot.scans.find((scan) => scan.scan_id === graphSnapshot.scan_id)?.basis;
  assert(graphBasis, `selected graph scan basis is missing: ${graphSnapshot.scan_id}`, "CONTEXT_GRAPH_BASIS_MISSING");
  if (graphBasis.head_sha || inputPackage.basis.head_sha) {
    assert(graphBasis.head_sha === inputPackage.basis.head_sha,
      `graph head ${graphBasis.head_sha ?? "null"} does not match delivery input head ${inputPackage.basis.head_sha ?? "null"}`,
      "CONTEXT_BASIS_HEAD_MISMATCH");
  }
  assert(graphBasis.worktree_state === inputPackage.basis.worktree_state,
    `graph worktree state ${graphBasis.worktree_state} does not match delivery input worktree state ${inputPackage.basis.worktree_state}`,
    "CONTEXT_BASIS_WORKTREE_MISMATCH");
  return graphBasis;
}

function assertCoordinatePackageRoots(artifacts, delivery) {
  if (!artifacts.some(artifact => ["project", "task"].includes(artifact.kind) && artifact.value.schema_version === "1.2")) return;
  const hasResult = delivery.result_basis != null || delivery.result_package_id != null || delivery.result_package_sha256 != null;
  assert(delivery.input_basis?.source_root === "." && (!hasResult || delivery.result_basis?.source_root === "."),
    "Project/Task 1.2 Context requires repository-root input and result Packages; nested package coordinates are not projected", "CONTEXT_COORDINATE_PACKAGE_ROOT_REQUIRED");
}

function selectGraphClosure(snapshot, seedAssetIds, graphCandidatePaths, excludedPaths, deliveryCandidatePaths, packagePaths, depth, limit) {
  const isExcluded = (assetPath) => excludedPaths.some((pattern) => scopeMatches(assetPath, pattern));
  const assetsById = new Map(snapshot.assets.filter((asset) => !isExcluded(asset.path)).map((asset) => [asset.asset_id, asset]));
  for (const assetId of seedAssetIds) {
    assert(assetsById.has(assetId), `scope asset is absent from selected scan: ${assetId}`, "CONTEXT_ASSET_REF_UNRESOLVED");
  }
  const selected = new Set(seedAssetIds);
  const unresolved = [];
  const graphScopePaths = [];
  const deliveryScopePaths = [];
  for (const scopePath of graphCandidatePaths) {
    const matched = snapshot.assets.filter((asset) => !isExcluded(asset.path) && scopeMatches(asset.path, scopePath));
    const packageMatched = deliveryCandidatePaths.includes(scopePath)
      && packagePaths.some((packagePath) => !isExcluded(packagePath) && scopeMatches(packagePath, scopePath));
    if (matched.length > 0) graphScopePaths.push(scopePath);
    if (matched.length === 0 && !packageMatched) unresolved.push({ code: "CONTEXT_SCOPE_NOT_FOUND", ref: scopePath, status: "unresolved" });
    for (const asset of matched) selected.add(asset.asset_id);
  }
  for (const scopePath of deliveryCandidatePaths) {
    if (packagePaths.some((packagePath) => !isExcluded(packagePath) && scopeMatches(packagePath, scopePath))) deliveryScopePaths.push(scopePath);
  }
  let frontier = [...selected];
  const selectedEdges = new Map();
  for (let level = 0; level < depth && frontier.length > 0; level += 1) {
    const next = [];
    for (const edge of snapshot.edges) {
      if (!frontier.includes(edge.from_asset_id) && !frontier.includes(edge.to_asset_id)) continue;
      selectedEdges.set(edge.edge_id, edge);
      for (const candidate of [edge.from_asset_id, edge.to_asset_id]) {
        if (candidate && assetsById.has(candidate) && !selected.has(candidate)) {
          selected.add(candidate);
          next.push(candidate);
        }
      }
      if (!edge.to_asset_id) unresolved.push({ code: "CONTEXT_EDGE_UNRESOLVED", ref: edge.edge_id, status: "unresolved" });
    }
    frontier = next;
  }
  assert(selected.size <= limit, `graph closure exceeds limit ${limit}`, "CONTEXT_CLOSURE_LIMIT_EXCEEDED");
  const assets = [...selected].map((id) => assetsById.get(id)).filter(Boolean)
    .sort((left, right) => left.kind.localeCompare(right.kind) || left.path.localeCompare(right.path) || left.asset_id.localeCompare(right.asset_id));
  const edges = [...selectedEdges.values()].filter((edge) => selected.has(edge.from_asset_id) && (!edge.to_asset_id || selected.has(edge.to_asset_id)))
    .sort((left, right) => left.relation.localeCompare(right.relation) || left.edge_id.localeCompare(right.edge_id));
  const paths = new Set(assets.map((asset) => asset.path));
  const issues = snapshot.issues.filter((issue) => !issue.path || paths.has(issue.path))
    .sort((left, right) => left.severity.localeCompare(right.severity) || left.issue_id.localeCompare(right.issue_id));
  for (const issue of issues) unresolved.push({ code: issue.issue_type, ref: issue.issue_id, severity: issue.severity, status: "unresolved" });
  return { assets, edges, issues, unresolved, graphScopePaths: unique(graphScopePaths), deliveryScopePaths: unique(deliveryScopePaths) };
}

function classifyAssets(assets, resultPackage) {
  const files = new Map((resultPackage?.files ?? []).map((file) => [file.path, file]));
  return assets.map((asset) => {
    const file = files.get(asset.path);
    const state = !resultPackage || !file || file.exists === false || file.sha256 !== asset.content_sha256 ? "stale" : "available";
    return { ...asset, projection_state: state };
  });
}

function actionProjection(gateProjection, unresolved) {
  const blocking = [];
  for (const [name, predicate] of Object.entries(gateProjection.predicates)) {
    if (["satisfied", "not-applicable"].includes(predicate.state)) continue;
    blocking.push({
      action_id: `gate:${name}:${predicate.state}`,
      kind: predicate.state === "stale" ? "refresh-observation" : predicate.state === "unsatisfied" ? "resolve-gate-failure" : "record-observation",
      reason: `${name}:${predicate.state}`,
      authorizes_execution: false
    });
  }
  if (unresolved.length > 0) {
    blocking.push({ action_id: "context:resolve-unresolved", kind: "resolve-unresolved", reason: `${unresolved.length} unresolved context reference(s)`, authorizes_execution: false });
  }
  const available = [...blocking];
  if (blocking.length === 0) available.push({ action_id: "context:review-ready", kind: "review-projection", reason: "all projected gates are satisfied or not applicable", authorizes_execution: false });
  return { blocking, available, recommended: available.slice(0, 1) };
}

function observationProjection(store, runId, gateProjection) {
  const staleIds = new Set(Object.values(gateProjection.predicates).flatMap((predicate) => predicate.stale_observation_ids ?? []));
  const consumedIds = new Set(Object.values(gateProjection.predicates).flatMap((predicate) => predicate.observation_ids ?? []));
  const observations = store.listObservations(runId);
  const isStale = (item) => item.validation.eligible === true && (staleIds.has(item.observation_id) || (gateProjection.result_package_id && item.result_package_id !== gateProjection.result_package_id && !consumedIds.has(item.observation_id)));
  return {
    eligible: observations.filter((item) => item.validation.eligible === true && !isStale(item)),
    ineligible: observations.filter((item) => item.validation.eligible !== true),
    stale: observations.filter(isStale)
  };
}

function observationArtifactHashes(observation) {
  return unique([
    observation.artifact_hash,
    observation.kind === "artifact-validation" ? observation.payload?.artifact_hash : null
  ]);
}

function observationArtifactClosure(store, observations) {
  const artifacts = new Map();
  const edges = [];
  for (const observation of observations) {
    for (const artifactHash of observationArtifactHashes(observation)) {
      const packageManifest = store.getPackage(observation.result_package_id);
      assert(packageManifest,
        `observation result package is missing: ${observation.observation_id} -> ${observation.result_package_id}`,
        "CONTEXT_OBSERVATION_PACKAGE_UNRESOLVED");
      const paths = unique(packageManifest.files
        .filter((file) => file.exists !== false && file.sha256 === artifactHash)
        .map((file) => file.path));
      assert(paths.length > 0,
        `observation artifact hash is absent from its result package: ${observation.observation_id} -> ${artifactHash}`,
        "CONTEXT_OBSERVATION_ARTIFACT_UNRESOLVED");
      const ref = `${packageManifest.package_id}:${artifactHash}`;
      artifacts.set(ref, { package_id: packageManifest.package_id, sha256: artifactHash, paths });
      edges.push({ observation_id: observation.observation_id, relation: "observes-package-artifact", package_artifact_ref: ref });
    }
  }
  return {
    artifacts: [...artifacts.entries()].map(([ref, artifact]) => ({ ref, ...artifact }))
      .sort((left, right) => left.ref.localeCompare(right.ref)),
    edges: edges.sort((left, right) => left.observation_id.localeCompare(right.observation_id) || left.package_artifact_ref.localeCompare(right.package_artifact_ref))
  };
}

export function buildContextProjection({ graphSnapshot, deliveryStore, runId, typedArtifacts, depth = 3, limit = 500, deliveryEventsSha256 }) {
  assert(graphSnapshot?.scan_id, "an exact graph scan snapshot is required", "CONTEXT_SCAN_REQUIRED");
  assert(Number.isInteger(depth) && depth >= 0 && depth <= 20, "context depth must be 0..20", "CONTEXT_DEPTH_INVALID");
  assert(Number.isInteger(limit) && limit > 0 && limit <= 5000, "context limit must be 1..5000", "CONTEXT_LIMIT_INVALID");
  const run = deliveryStore.getRun(runId, { include: true });
  assert(run, `delivery run does not exist: ${runId}`, "CONTEXT_RUN_NOT_FOUND");
  const inputPackage = deliveryStore.getPackage(run.input_basis_package_id);
  assert(inputPackage, `delivery input package is missing: ${run.input_basis_package_id}`, "CONTEXT_DELIVERY_PACKAGE_MISSING");
  const graphBasis = assertBasisClosure(graphSnapshot, inputPackage);
  const gateProjection = deliveryStore.projectPredicates({ run_id: runId });
  const resultPackage = gateProjection.result_package_id ? deliveryStore.getPackage(gateProjection.result_package_id) : null;
  if (resultPackage) {
    assert(resultPackage.repository_id === inputPackage.repository_id,
      "delivery result repository does not match input repository",
      "CONTEXT_RESULT_REPOSITORY_MISMATCH");
  }

  assert(Array.isArray(typedArtifacts), "typed artifacts must be an array", "CONTEXT_ARTIFACT_REQUIRED");
  const artifacts = typedArtifacts.map((artifact) => {
    assertTypedArtifactValid(artifact.kind, artifact.value);
    const id = artifactId(artifact.kind, artifact.value);
    return {
      kind: artifact.kind,
      id,
      schema_version: artifact.value.schema_version,
      source_sha256: artifact.source_sha256 ?? sha256(artifact.value),
      content_sha256: sha256(artifact.value),
      value: artifact.value
    };
  }).sort((left, right) => left.kind.localeCompare(right.kind) || left.id.localeCompare(right.id));
  assert(artifacts.length > 0, "at least one typed artifact is required", "CONTEXT_ARTIFACT_REQUIRED");
  const artifactKeys = artifacts.map((artifact) => `${artifact.kind}:${artifact.id}`);
  assertCoordinatePackageRoots(artifacts, { input_basis: inputPackage.basis, result_basis: resultPackage?.basis, result_package_id: resultPackage?.package_id, result_package_sha256: resultPackage?.aggregate_sha256 });
  assert(new Set(artifactKeys).size === artifactKeys.length, "typed artifact identity is ambiguous", "CONTEXT_ARTIFACT_AMBIGUOUS");
  const artifactsByKey = new Map(artifacts.map((artifact) => [`${artifact.kind}:${artifact.id}`, artifact]));
  assertArtifactBasis(artifacts, graphSnapshot.repository_id, graphBasis);
  const artifactEdges = typedArtifactRefs(artifacts).map((ref) => ({ from_kind: ref.from_kind, from: ref.from, relation: `references-${ref.kind}`, to_kind: ref.kind, to: ref.id }));
  const unresolved = [];
  for (const ref of typedArtifactRefs(artifacts)) {
    assert(artifactsByKey.has(`${ref.kind}:${ref.id}`),
      `typed artifact reference is unresolved: ${ref.from} -> ${ref.kind}:${ref.id}`,
      "CONTEXT_ARTIFACT_REF_UNRESOLVED");
  }
  for (const ref of run.input_refs) {
    if (typeof ref === "object" && ref?.kind && ref?.id) {
      assert(artifactsByKey.has(`${ref.kind}:${ref.id}`),
        `run input reference is unresolved: ${ref.kind}:${ref.id}`,
        "CONTEXT_RUN_INPUT_REF_UNRESOLVED");
    }
  }

  const runScopePaths = unique(run.scope.map(scopeEntryPath).map((value) => value && normalPath(value)));
  const taskScope = artifactTaskScope(artifacts, graphSnapshot.repository_id);
  for (const taskPath of taskScope.include) {
    assert(runScopePaths.some((runPath) => scopePatternContains(runPath, taskPath)),
      `typed task scope exceeds delivery run scope: ${taskPath}`,
      "CONTEXT_TASK_SCOPE_EXPANSION_REQUIRED");
  }
  const graphCandidatePaths = taskScope.include.length > 0 ? taskScope.include : runScopePaths;
  const seedAssetIds = scopedSeedAssetIds(run.scope, graphSnapshot.assets, graphCandidatePaths);
  const resultPackagePaths = unique((resultPackage?.files ?? []).filter((file) => file.exists !== false).map((file) => file.path));
  const closure = selectGraphClosure(graphSnapshot, seedAssetIds, graphCandidatePaths, taskScope.exclude, runScopePaths, resultPackagePaths, depth, limit);
  const scopePaths = unique([...graphCandidatePaths, ...closure.deliveryScopePaths]);
  unresolved.push(...closure.unresolved);
  const observations = observationProjection(deliveryStore, runId, gateProjection);
  const projectedObservations = [...observations.eligible, ...observations.ineligible, ...observations.stale];
  const observationArtifacts = observationArtifactClosure(deliveryStore, projectedObservations);
  const assets = classifyAssets(closure.assets, resultPackage);
  const attempts = deliveryStore.listAttempts(runId);
  const receipts = deliveryStore.listReceipts(runId);
  const actions = actionProjection(gateProjection, unresolved);
  const nonSatisfied = Object.entries(gateProjection.predicates).find(([, predicate]) => !["satisfied", "not-applicable"].includes(predicate.state));

  const envelope = {
    schema_version: CONTEXT_PROJECTION_VERSION,
    projection_kind: "project",
    authorizes_execution: false,
    basis: {
      graph: { scan_id: graphSnapshot.scan_id, repository_id: graphSnapshot.repository_id, snapshot_sha256: graphSnapshot.snapshot_sha256, basis: graphBasis },
      delivery: {
        events_sha256: deliveryEventsSha256,
        run_id: run.run_id,
        run_scope: run.scope,
        input_package_id: inputPackage.package_id,
        input_package_sha256: inputPackage.aggregate_sha256,
        input_basis: inputPackage.basis,
        result_package_id: resultPackage?.package_id ?? null,
        result_package_sha256: resultPackage?.aggregate_sha256 ?? null,
        result_basis: resultPackage?.basis ?? null
      }
    },
    current_stage: nonSatisfied?.[0] ?? "ready-for-review",
    ref_closure: {
      typed_artifact_refs: artifacts.map((artifact) => `${artifact.kind}:${artifact.id}`),
      typed_artifact_edges: artifactEdges,
      asset_refs: assets.map((asset) => asset.asset_id),
      edge_refs: closure.edges.map((edge) => edge.edge_id),
      attempt_refs: attempts.map((attempt) => attempt.attempt_id),
      observation_refs: projectedObservations.map((observation) => observation.observation_id).sort(),
      package_artifact_refs: observationArtifacts.artifacts.map((artifact) => artifact.ref),
      observation_artifact_edges: observationArtifacts.edges,
      receipt_refs: receipts.map((receipt) => receipt.receipt_id)
    },
    typed_artifacts: artifacts,
    scope: { paths: scopePaths, excluded_paths: taskScope.exclude, graph_paths: closure.graphScopePaths, delivery_paths: closure.deliveryScopePaths, seed_asset_ids: seedAssetIds, depth, limit },
    assets,
    relations: closure.edges,
    attempts,
    observations,
    package_artifacts: observationArtifacts.artifacts,
    receipts,
    gate_projection: gateProjection,
    unresolved,
    actions
  };
  return Object.freeze({ ...envelope, projection_hash: sha256(envelope) });
}

export function validateContextProjection(projection) {
  assert(projection?.schema_version === CONTEXT_PROJECTION_VERSION, "context projection version is unsupported", "CONTEXT_PROJECTION_VERSION_UNSUPPORTED");
  assert(projection.projection_kind === "project", "context projection kind must be project", "CONTEXT_PROJECTION_KIND_INVALID");
  assert(projection.authorizes_execution === false, "context projection must not authorize execution", "CONTEXT_PROJECTION_AUTHORIZATION_INVALID");
  const { projection_hash: actual, ...contents } = projection;
  assert(actual === sha256(contents), "context projection hash does not match contents", "CONTEXT_PROJECTION_HASH_MISMATCH");
  assert(projection.assets.length <= projection.scope.limit,
    `graph closure exceeds limit ${projection.scope.limit}`, "CONTEXT_CLOSURE_LIMIT_EXCEEDED");
  const assetIds = new Set(projection.assets.map((asset) => asset.asset_id));
  const sameRefs = (actualRefs, expectedRefs, label) => {
    assert(Array.isArray(actualRefs) && canonicalRefs(actualRefs) === canonicalRefs(expectedRefs), `${label} reference closure does not match contents`, "CONTEXT_REF_CLOSURE_INVALID");
  };
  const artifactsByKey = new Map(projection.typed_artifacts.map((artifact) => [`${artifact.kind}:${artifact.id}`, artifact]));
  assert(artifactsByKey.size === projection.typed_artifacts.length, "typed artifact identities are duplicated", "CONTEXT_ARTIFACT_AMBIGUOUS");
  for (const artifact of projection.typed_artifacts) {
    assertTypedArtifactValid(artifact.kind, artifact.value);
    assert(artifact.id === artifactId(artifact.kind, artifact.value),
      `typed artifact wrapper identity does not match value: ${artifact.kind}:${artifact.id}`,
      "CONTEXT_ARTIFACT_IDENTITY_MISMATCH");
    assert(artifact.schema_version === artifact.value.schema_version,
      `typed artifact wrapper version does not match value: ${artifact.kind}:${artifact.id}`,
      "CONTEXT_ARTIFACT_VERSION_MISMATCH");
    assert(artifact.content_sha256 === sha256(artifact.value), `typed artifact content hash mismatch: ${artifact.kind}:${artifact.id}`, "CONTEXT_ARTIFACT_HASH_MISMATCH");
  }
  assertCoordinatePackageRoots(projection.typed_artifacts, projection.basis.delivery);
  assertArtifactBasis(projection.typed_artifacts, projection.basis.graph.repository_id, projection.basis.graph.basis);
  const expectedTaskScope = artifactTaskScope(projection.typed_artifacts, projection.basis.graph.repository_id);
  assert(Array.isArray(projection.basis.delivery.run_scope), "projection delivery run scope is missing", "CONTEXT_REF_CLOSURE_INVALID");
  const runScopePaths = unique(projection.basis.delivery.run_scope.map(scopeEntryPath).map((value) => value && normalPath(value)));
  for (const taskPath of expectedTaskScope.include) {
    assert(runScopePaths.some((runPath) => scopePatternContains(runPath, taskPath)),
      `typed task scope exceeds delivery run scope: ${taskPath}`,
      "CONTEXT_TASK_SCOPE_EXPANSION_REQUIRED");
  }
  const graphCandidatePaths = expectedTaskScope.include.length > 0 ? expectedTaskScope.include : runScopePaths;
  sameRefs(projection.scope.paths, unique([...graphCandidatePaths, ...projection.scope.delivery_paths]), "scope path");
  sameRefs(projection.scope.excluded_paths, expectedTaskScope.exclude, "excluded scope path");
  for (const deliveryPath of projection.scope.delivery_paths) {
    assert(runScopePaths.includes(deliveryPath), `delivery scope is absent from Run scope: ${deliveryPath}`, "CONTEXT_REF_CLOSURE_INVALID");
  }
  for (const asset of projection.assets) {
    assert(!projection.scope.excluded_paths.some((pattern) => scopeMatches(asset.path, pattern)),
      `excluded asset remains in projection: ${asset.path}`,
      "CONTEXT_SCOPE_EXCLUSION_INVALID");
  }
  const expectedGraphPaths = graphCandidatePaths.filter((scopePath) => projection.assets.some((asset) => scopeMatches(asset.path, scopePath)));
  sameRefs(projection.scope.graph_paths, expectedGraphPaths, "graph scope path");
  assert(projection.scope.delivery_paths.every((entry) => projection.scope.paths.includes(entry)), "delivery scope path is outside projected scope", "CONTEXT_REF_CLOSURE_INVALID");
  assert(projection.basis.graph.repository_id === projection.basis.delivery.input_basis.repository_id,
    "projection graph and delivery repositories do not match", "CONTEXT_BASIS_REPOSITORY_MISMATCH");
  assert(projection.basis.graph.basis.head_sha === projection.basis.delivery.input_basis.head_sha,
    "projection graph and delivery heads do not match", "CONTEXT_BASIS_HEAD_MISMATCH");
  assert(projection.basis.graph.basis.worktree_state === projection.basis.delivery.input_basis.worktree_state,
    "projection graph and delivery worktree states do not match", "CONTEXT_BASIS_WORKTREE_MISMATCH");
  if (projection.basis.delivery.result_basis) {
    assert(projection.basis.delivery.result_basis.repository_id === projection.basis.delivery.input_basis.repository_id,
      "projection result and input repositories do not match", "CONTEXT_RESULT_REPOSITORY_MISMATCH");
  }
  sameRefs(projection.ref_closure.typed_artifact_refs, [...artifactsByKey.keys()], "typed artifact");
  const expectedArtifactEdges = typedArtifactRefs(projection.typed_artifacts).map((ref) => ({ from_kind: ref.from_kind, from: ref.from, relation: `references-${ref.kind}`, to_kind: ref.kind, to: ref.id }));
  sameRefs(projection.ref_closure.typed_artifact_edges, expectedArtifactEdges, "typed artifact edge");
  for (const edge of projection.ref_closure.typed_artifact_edges) {
    assert(artifactsByKey.has(`${edge.from_kind}:${edge.from}`), `typed artifact edge source is missing: ${edge.from_kind}:${edge.from}`, "CONTEXT_REF_CLOSURE_INVALID");
    assert(artifactsByKey.has(`${edge.to_kind}:${edge.to}`), `typed artifact edge target is missing: ${edge.to_kind}:${edge.to}`, "CONTEXT_REF_CLOSURE_INVALID");
  }
  sameRefs(projection.ref_closure.asset_refs, projection.assets.map((asset) => asset.asset_id), "asset");
  sameRefs(projection.ref_closure.edge_refs, projection.relations.map((edge) => edge.edge_id), "edge");
  sameRefs(projection.ref_closure.attempt_refs, projection.attempts.map((attempt) => attempt.attempt_id), "attempt");
  sameRefs(projection.ref_closure.receipt_refs, projection.receipts.map((receipt) => receipt.receipt_id), "receipt");
  for (const edge of projection.relations) {
    assert(assetIds.has(edge.from_asset_id), `context edge source is missing: ${edge.edge_id}`, "CONTEXT_REF_CLOSURE_INVALID");
    assert(!edge.to_asset_id || assetIds.has(edge.to_asset_id), `context edge target is missing: ${edge.edge_id}`, "CONTEXT_REF_CLOSURE_INVALID");
  }
  const expectedSeedAssetIds = scopedSeedAssetIds(projection.basis.delivery.run_scope, projection.assets, graphCandidatePaths);
  sameRefs(projection.scope.seed_asset_ids, expectedSeedAssetIds, "seed asset");
  const reachableAssetIds = new Set(expectedSeedAssetIds);
  for (const asset of projection.assets) {
    if (graphCandidatePaths.some((scopePath) => scopeMatches(asset.path, scopePath))) reachableAssetIds.add(asset.asset_id);
  }
  let frontier = [...reachableAssetIds];
  const reachableEdgeIds = new Set();
  for (let level = 0; level < projection.scope.depth && frontier.length > 0; level += 1) {
    const next = [];
    for (const edge of projection.relations) {
      if (!frontier.includes(edge.from_asset_id) && !frontier.includes(edge.to_asset_id)) continue;
      reachableEdgeIds.add(edge.edge_id);
      for (const candidate of [edge.from_asset_id, edge.to_asset_id]) {
        if (candidate && assetIds.has(candidate) && !reachableAssetIds.has(candidate)) {
          reachableAssetIds.add(candidate);
          next.push(candidate);
        }
      }
    }
    frontier = next;
  }
  sameRefs([...assetIds], [...reachableAssetIds], "reachable asset");
  sameRefs(projection.relations.map((edge) => edge.edge_id), [...reachableEdgeIds], "reachable edge");
  const observationGroups = [projection.observations.eligible, projection.observations.ineligible, projection.observations.stale];
  const observations = observationGroups.flat();
  const observationIds = observations.map((observation) => observation.observation_id);
  assert(new Set(observationIds).size === observationIds.length, "observation classifications overlap", "CONTEXT_OBSERVATION_CLASSIFICATION_INVALID");
  sameRefs(projection.ref_closure.observation_refs, observationIds, "observation");
  const packageArtifactsByRef = new Map(projection.package_artifacts.map((artifact) => [artifact.ref, artifact]));
  assert(packageArtifactsByRef.size === projection.package_artifacts.length, "package artifact references are duplicated", "CONTEXT_REF_CLOSURE_INVALID");
  sameRefs(projection.ref_closure.package_artifact_refs, [...packageArtifactsByRef.keys()], "package artifact");
  const expectedObservationArtifactEdges = [];
  for (const observation of observations) {
    for (const artifactHash of observationArtifactHashes(observation)) {
      const ref = `${observation.result_package_id}:${artifactHash}`;
      assert(packageArtifactsByRef.has(ref), `observation package artifact is missing: ${observation.observation_id} -> ${ref}`, "CONTEXT_REF_CLOSURE_INVALID");
      expectedObservationArtifactEdges.push({ observation_id: observation.observation_id, relation: "observes-package-artifact", package_artifact_ref: ref });
    }
  }
  sameRefs(projection.ref_closure.observation_artifact_edges, expectedObservationArtifactEdges, "observation artifact edge");
  for (const artifact of projection.package_artifacts) {
    assert(artifact.ref === `${artifact.package_id}:${artifact.sha256}`, `package artifact ref is invalid: ${artifact.ref}`, "CONTEXT_REF_CLOSURE_INVALID");
    assert(Array.isArray(artifact.paths) && artifact.paths.length > 0 && canonicalRefs(artifact.paths) === canonicalRefs(unique(artifact.paths)), `package artifact paths are invalid: ${artifact.ref}`, "CONTEXT_REF_CLOSURE_INVALID");
  }
  const staleIds = new Set(Object.values(projection.gate_projection.predicates).flatMap((predicate) => predicate.stale_observation_ids ?? []));
  const consumedIds = new Set(Object.values(projection.gate_projection.predicates).flatMap((predicate) => predicate.observation_ids ?? []));
  const expectedStale = observations.filter((observation) => observation.validation.eligible === true && (staleIds.has(observation.observation_id) || (projection.gate_projection.result_package_id && observation.result_package_id !== projection.gate_projection.result_package_id && !consumedIds.has(observation.observation_id))));
  const expectedIneligible = observations.filter((observation) => observation.validation.eligible !== true);
  const expectedEligible = observations.filter((observation) => observation.validation.eligible === true && !expectedStale.some((candidate) => candidate.observation_id === observation.observation_id));
  sameRefs(projection.observations.eligible.map((observation) => observation.observation_id), expectedEligible.map((observation) => observation.observation_id), "eligible observation");
  sameRefs(projection.observations.ineligible.map((observation) => observation.observation_id), expectedIneligible.map((observation) => observation.observation_id), "ineligible observation");
  sameRefs(projection.observations.stale.map((observation) => observation.observation_id), expectedStale.map((observation) => observation.observation_id), "stale observation");
  for (const predicate of Object.values(projection.gate_projection.predicates)) {
    for (const observationId of [...(predicate.observation_ids ?? []), ...(predicate.stale_observation_ids ?? [])]) {
      assert(observationIds.includes(observationId), `gate observation is absent from context: ${observationId}`, "CONTEXT_REF_CLOSURE_INVALID");
    }
  }
  for (const action of [...projection.actions.blocking, ...projection.actions.available, ...projection.actions.recommended]) {
    assert(action.authorizes_execution === false, `context action authorizes execution: ${action.action_id}`, "CONTEXT_PROJECTION_AUTHORIZATION_INVALID");
  }
  assert(sha256(projection.actions) === sha256(actionProjection(projection.gate_projection, projection.unresolved)), "context actions do not match the projection state", "CONTEXT_ACTION_PROJECTION_INVALID");
  return true;
}

function canonicalRefs(values) {
  return JSON.stringify([...values].sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right))));
}

export function renderContextMarkdown(projection) {
  validateContextProjection(projection);
  const lines = [
    "<!-- derived-view: forgeway context projection; never use as a gate input -->",
    "# Forgeway project context",
    "",
    `Projection: \`${projection.projection_hash}\``,
    `Graph scan: \`${projection.basis.graph.scan_id}\``,
    `Delivery run: \`${projection.basis.delivery.run_id}\``,
    `Authorizes execution: \`${projection.authorizes_execution}\``,
    "",
    "## Gates",
    "",
    ...Object.entries(projection.gate_projection.predicates).map(([name, predicate]) => `- \`${name}\`: ${predicate.state}`),
    "",
    "## Assets",
    "",
    ...projection.assets.map((asset) => `- \`${asset.asset_id}\` — \`${asset.path}\` (${asset.projection_state})`),
    "",
    "## Recommended actions",
    "",
    ...(projection.actions.recommended.length ? projection.actions.recommended.map((action) => `- \`${action.kind}\`: ${action.reason}`) : ["- None"]),
    ""
  ];
  return `${lines.join("\n")}\n`;
}

function dot(value) {
  return JSON.stringify(String(value));
}

export function renderContextDot(projection) {
  validateContextProjection(projection);
  const lines = [
    `// derived-view: forgeway context projection; projection_hash=${projection.projection_hash}; authorizes_execution=false`,
    "digraph forgeway_context {",
    "  rankdir=LR;"
  ];
  for (const asset of projection.assets) lines.push(`  ${dot(asset.asset_id)} [label=${dot(`${asset.kind}\\n${asset.path}\\n${asset.projection_state}`)}];`);
  for (const edge of projection.relations) if (edge.to_asset_id) lines.push(`  ${dot(edge.from_asset_id)} -> ${dot(edge.to_asset_id)} [label=${dot(edge.relation)}];`);
  for (const [name, predicate] of Object.entries(projection.gate_projection.predicates)) {
    const id = `gate:${name}`;
    lines.push(`  ${dot(id)} [shape=box,label=${dot(`${name}\\n${predicate.state}`)}];`);
    for (const observationId of predicate.observation_ids ?? []) lines.push(`  ${dot(observationId)} -> ${dot(id)} [label="projects"];`);
  }
  lines.push("}");
  return `${lines.join("\n")}\n`;
}

export function sha256Bytes(value) {
  return createHash("sha256").update(value).digest("hex");
}
