const FINGERPRINT = /^sha256:[0-9a-f]{64}$/;
const OBSERVATION_VALIDATOR_ID = "forgeway.delivery.observation";

function text(value) {
  return typeof value === "string" && value.length > 0;
}

function exitClaim(stageId, condition) {
  return `stage:${stageId}:exit:${condition}`;
}

function byId(records, field) {
  return new Map((records ?? []).map((record) => [record?.[field], record]));
}

function evidenceRule(stage, condition) {
  return stage.exit_evidence?.overrides?.[condition] ?? stage.exit_evidence?.default;
}

function schemas(records) {
  return new Set((records ?? []).map((record) => record?.schema).filter(text));
}

function targetKey(target) {
  return `${target?.kind ?? ""}:${target?.identity ?? ""}`;
}

function receiptMatchesTarget(receipt, target) {
  if (targetKey(receipt.target) !== targetKey(target)) return false;
  if (receipt.target?.kind !== "git-remote") return true;
  const readback = receipt.readback ?? {};
  if (target.commit_sha !== undefined && receipt.target.commit_sha !== undefined
    && receipt.target.commit_sha !== target.commit_sha) return false;
  for (const field of ["commit_sha", "ref"]) {
    if (target[field] === undefined) continue;
    // A failed operation need not have successful readback, but any supplied
    // identity must agree. Confirmed receipts must bind every declared field.
    if ((readback.status === "confirmed" || readback[field] !== undefined)
      && readback[field] !== target[field]) return false;
  }
  return true;
}

function hostAdapterValid(adapter) {
  return text(adapter?.contract_id)
    && text(adapter?.contract_version)
    && ["implemented", "external-required"].includes(adapter?.runtime_binding)
    && ((adapter.runtime_binding === "implemented" && adapter.implementation_status === "verified")
      || (adapter.runtime_binding === "external-required" && adapter.implementation_status === "not-verified"));
}

function observationTargetsExit(observation, stage, claim, resultPackageId) {
  const payload = observation.payload ?? {};
  if (payload.target_ref !== claim || payload.subject_package_id !== resultPackageId) return false;
  if (observation.kind === "artifact-validation") return payload.artifact_id === resultPackageId && stage.exit_evidence?.payload_validator_ids?.includes(payload.validator_id);
  if (observation.kind === "command-execution" || observation.kind === "runtime-observation") return payload.check_id === claim;
  if (observation.kind === "source-assertion") return payload.assertion_id === claim;
  if (observation.kind === "review-finding") return payload.reviewed_package_id === resultPackageId;
  return false;
}

const MUTATION_CLASSES_BY_EFFECT = Object.freeze({
  "read-only": new Set(["read-only"]),
  "artifact-write": new Set(["read-only", "artifact-write"]),
  "source-write": new Set(["read-only", "artifact-write", "source-write"]),
  "runtime-operation": new Set(["read-only"]),
  "delivery-write": new Set(["read-only", "artifact-write", "git-write"])
});

export function deliveryClosureFindings(state, registry, deliveryStore) {
  const findings = [];
  const completed = (state.stage_states ?? []).filter((record) => record?.status === "completed");
  const running = (state.stage_states ?? []).filter((record) => record?.status === "running");
  const closedInterrupts = (Array.isArray(state.interrupt_states) ? state.interrupt_states : []).filter((record) => record?.status === "completed");
  if (!deliveryStore) return completed.length + running.length + closedInterrupts.length === 0 ? findings : ["completed or running stage records and completed interrupts require a Delivery Graph store"];

  const run = deliveryStore.getRun(state.run_id, { include: true });
  if (!run) return [`Delivery Graph run does not exist: ${state.run_id}`];
  if (state.run_input_package_id !== run.input_basis_package_id) {
    findings.push("run_input_package_id must equal the Delivery Graph run input package");
  }
  if (!deliveryStore.getPackage(state.run_input_package_id)) {
    findings.push(`run input package does not exist: ${state.run_input_package_id}`);
  }
  for (const record of running) {
    const attempt = deliveryStore.getAttempt(record.attempt_ref);
    if (!attempt) {
      findings.push(`${record.stage_id} running attempt does not exist: ${record.attempt_ref}`);
      continue;
    }
    if (attempt.run_id !== state.run_id) findings.push(`${record.stage_id} running attempt belongs to another run`);
    if (attempt.action?.stage_id !== record.stage_id) findings.push(`${record.stage_id} running attempt is not owned by this stage`);
    if (attempt.status !== "started") findings.push(`${record.stage_id} running attempt is terminal; reconcile its outcome before resuming`);
    for (const field of ["stage_execution_id", "stage_input_package_id"]) {
      if (record[field] !== undefined && record[field] !== attempt.action?.[field]) findings.push(`${record.stage_id} ${field} does not match its running attempt`);
    }
    if (!text(attempt.action?.stage_input_package_id) || !deliveryStore.getPackage(attempt.action.stage_input_package_id)) findings.push(`${record.stage_id} running attempt input package does not exist`);
    if (record.run_input_package_id !== undefined && record.run_input_package_id !== state.run_input_package_id) findings.push(`${record.stage_id} running record binds another Run input package`);
    if (record.stage_result_package_id !== undefined && record.stage_result_package_id !== attempt.result_package_id) findings.push(`${record.stage_id} result package does not match its running attempt`);
  }
  for (const record of closedInterrupts) {
    const interrupt = registry.interrupts.find((candidate) => candidate.id === record.interrupt_id);
    if (!interrupt) continue;
    const prefix = `${interrupt.id} completed interrupt`;
    const observation = text(record.host_verification_ref) ? deliveryStore.getObservation(record.host_verification_ref) : null;
    const attempt = observation && deliveryStore.getAttempt(observation.attempt_id);
    const result = observation && deliveryStore.getPackage(observation.result_package_id);
    const input = deliveryStore.getPackage(state.run_input_package_id);
    const payload = observation?.payload ?? {};
    const expectedClaims = interrupt.exit_conditions.map((condition) => `interrupt:${interrupt.id}:exit:${condition}`);
    if (!observation || observation.run_id !== state.run_id || observation.kind !== "artifact-validation"
      || observation.outcome !== "satisfied" || observation.validation?.eligible !== true
      || observation.validation?.validator_id !== OBSERVATION_VALIDATOR_ID
      || observation.producer?.capability_id !== interrupt.host_adapter?.contract_id
      || observation.producer?.capability_version !== interrupt.host_adapter?.contract_version
      || !attempt || attempt.run_id !== state.run_id || attempt.status !== "succeeded"
      || attempt.action?.interrupt_id !== interrupt.id || attempt.result_package_id !== observation.result_package_id
      || !result || !input || result.repository_id !== input.repository_id
      || observation.validation?.result_package_aggregate_sha256 !== result.aggregate_sha256
      || payload.valid !== true || payload.validator_id !== "forgeway.change-control/1"
      || payload.artifact_id !== record.result_ref || payload.target_ref !== `workflow:interrupt:${interrupt.id}`
      || payload.basis_package_id !== state.run_input_package_id || payload.basis_fingerprint !== state.basis?.fingerprint
      || payload.interrupt_contract_version !== interrupt.contract_version
      || !Array.isArray(observation.claim_refs) || !expectedClaims.every((claim) => observation.claim_refs.includes(claim))) {
      findings.push(`${prefix} requires eligible current Run-local Host verification of its result, basis and every exit condition`);
      continue;
    }
    const invalidated = payload.invalidated_stage_states;
    if (!Array.isArray(invalidated) || new Set(invalidated.map((old) => old?.stage_id)).size !== invalidated.length) {
      findings.push(`${prefix} requires an explicit unique invalidated_stage_states list`);
      continue;
    }
    for (const old of invalidated) {
      const stage = registry.stages.find((candidate) => candidate.id === old?.stage_id);
      if (!stage || Number(text(old?.attempt_ref)) + Number(text(old?.decision_ref)) !== 1) {
        findings.push(`${prefix} invalidated identity requires a known Stage and one Attempt or decision ref`);
        continue;
      }
      const current = (state.stage_states ?? []).find((candidate) => candidate.stage_id === stage.id);
      if (text(old.attempt_ref)) {
        const previous = deliveryStore.getAttempt(old.attempt_ref);
        if (!previous || previous.run_id !== state.run_id || previous.action?.stage_id !== stage.id || previous.status === "started") findings.push(`${prefix} invalidated Attempt must be a reconciled Run-local Stage identity`);
        if (["completed", "running"].includes(current?.status) && current.attempt_ref === old.attempt_ref) findings.push(`${prefix} must not reuse an invalidated Stage Attempt as current`);
      } else {
        if (stage.applicability !== "conditional") findings.push(`${prefix} invalidated decision must belong to a conditional Stage`);
        if (current?.status === "skipped" && current.decision_ref === old.decision_ref) findings.push(`${prefix} must not reuse an invalidated skip decision as current`);
      }
    }
  }
  if (completed.length === 0) return findings;

  const observations = byId(deliveryStore.listObservations(state.run_id), "observation_id");
  const receipts = byId(deliveryStore.listReceipts(state.run_id), "receipt_id");
  const stageById = byId(registry.stages, "id");

  for (const record of completed) {
    const stage = stageById.get(record.stage_id);
    if (!stage) continue;
    const prefix = record.stage_id;
    const attempt = deliveryStore.getAttempt(record.attempt_ref);
    const inputPackage = deliveryStore.getPackage(record.stage_input_package_id);
    const resultPackage = deliveryStore.getPackage(record.stage_result_package_id);
    if (!inputPackage) findings.push(`${prefix} stage input package does not exist: ${record.stage_input_package_id}`);
    if (!resultPackage) findings.push(`${prefix} stage result package does not exist: ${record.stage_result_package_id}`);
    if (!attempt) findings.push(`${prefix} attempt does not exist: ${record.attempt_ref}`);
    else {
      if (attempt.run_id !== state.run_id) findings.push(`${prefix} attempt belongs to another run`);
      if (attempt.status !== "succeeded") findings.push(`${prefix} attempt is not succeeded`);
      if (attempt.action?.stage_id !== stage.id) findings.push(`${prefix} attempt is not owned by this stage`);
      if (attempt.action?.stage_execution_id !== record.stage_execution_id) findings.push(`${prefix} stage execution does not match its attempt`);
      if (attempt.action?.stage_input_package_id !== record.stage_input_package_id) findings.push(`${prefix} stage input package does not match its attempt`);
      if (attempt.result_package_id !== record.stage_result_package_id) findings.push(`${prefix} result package does not match its attempt`);
      const latestStageAttempt = (run.attempts ?? []).filter((candidate) => candidate.action?.stage_execution_id === record.stage_execution_id && candidate.status === "succeeded").at(-1);
      if (latestStageAttempt?.attempt_id !== attempt.attempt_id) findings.push(`${prefix} attempt is stale because a newer successful stage attempt exists`);
    }
    if (resultPackage && record.result_fingerprint !== `sha256:${resultPackage.aggregate_sha256}`) {
      findings.push(`${prefix} result fingerprint is stale or does not match the package aggregate`);
    }
    if (inputPackage && resultPackage && inputPackage.repository_id !== resultPackage.repository_id) {
      findings.push(`${prefix} input and result packages belong to different repositories`);
    }
    if (state.brownfield_admission && stage.id === "implementation") {
      if (record.stage_input_package_id !== state.run_input_package_id) findings.push(`${prefix} admitted Brownfield Implementation must consume the Run input package`);
    } else if (stage.input_from === "run-input") {
      if (record.stage_input_package_id !== state.run_input_package_id) findings.push(`${prefix} must consume the Run input package`);
    } else if (stage.input_from === "previous-terminal") {
      const previous = completed
        .filter((candidate) => (stageById.get(candidate.stage_id)?.order ?? -1) < stage.order)
        .sort((left, right) => stageById.get(right.stage_id).order - stageById.get(left.stage_id).order)[0];
      if (!previous || record.stage_input_package_id !== previous.stage_result_package_id) findings.push(`${prefix} must consume the nearest previous completed Stage result package`);
    }

    const eligible = [];
    for (const observationId of record.evidence_refs ?? []) {
      const observation = observations.get(observationId) ?? deliveryStore.getObservation(observationId);
      if (!observation) {
        findings.push(`${prefix} observation does not exist: ${observationId}`);
        continue;
      }
      if (observation.run_id !== state.run_id) findings.push(`${prefix} observation belongs to another run: ${observationId}`);
      if (observation.attempt_id !== record.attempt_ref) findings.push(`${prefix} observation belongs to another attempt: ${observationId}`);
      if (observation.result_package_id !== record.stage_result_package_id) findings.push(`${prefix} observation binds another result package: ${observationId}`);
      if (observation.validation?.eligible !== true) findings.push(`${prefix} observation is ineligible: ${observationId}`);
      if (observation.validation?.validator_id !== (stage.exit_evidence?.observation_validator_id ?? OBSERVATION_VALIDATOR_ID)) {
        findings.push(`${prefix} observation validator is not authorized for Stage exit: ${observationId}`);
      }
      if (resultPackage && observation.validation?.result_package_aggregate_sha256 !== resultPackage.aggregate_sha256) {
        findings.push(`${prefix} observation is stale for the result package: ${observationId}`);
      }
      if (observation.validation?.eligible === true
        && observation.run_id === state.run_id
        && observation.attempt_id === record.attempt_ref
        && observation.result_package_id === record.stage_result_package_id
        && resultPackage
        && observation.validation?.result_package_aggregate_sha256 === resultPackage.aggregate_sha256
        && observation.validation?.validator_id === (stage.exit_evidence?.observation_validator_id ?? OBSERVATION_VALIDATOR_ID)) eligible.push(observation);
    }
    for (const condition of stage.exit_conditions) {
      const claim = exitClaim(stage.id, condition);
      const rule = evidenceRule(stage, condition);
      if (!eligible.some((observation) => observation.claim_refs?.includes(claim)
        && rule?.kinds?.includes(observation.kind)
        && rule?.outcomes?.includes(observation.outcome)
        && stage.exit_evidence?.producer_capabilities?.includes(observation.producer?.capability_id)
        && observationTargetsExit(observation, stage, claim, record.stage_result_package_id))) {
        findings.push(`${prefix} exit condition has no eligible Observation claim: ${condition}`);
      }
    }
    if (stage.receipt_policy === "required-on-success") {
      const boundReceipts = [];
      const authorizedTargets = attempt?.action?.authorized_targets;
      const authorizedTargetKeys = new Set((authorizedTargets ?? []).map(targetKey));
      if (!Array.isArray(authorizedTargets) || authorizedTargets.length === 0 || authorizedTargetKeys.has(":")) {
        findings.push(`${prefix} delivery attempt requires explicit authorized_targets`);
      }
      if (!Array.isArray(record.receipt_refs) || record.receipt_refs.length === 0) findings.push(`${prefix} completed delivery requires receipt_refs`);
      for (const receiptId of record.receipt_refs ?? []) {
        const receipt = receipts.get(receiptId);
        if (!receipt) findings.push(`${prefix} receipt does not exist: ${receiptId}`);
        else if (receipt.run_id !== state.run_id || receipt.attempt_id !== record.attempt_ref || receipt.result_package_id !== record.stage_result_package_id) {
          findings.push(`${prefix} receipt does not bind the stage run, attempt, and result package: ${receiptId}`);
        } else if (!(authorizedTargets ?? []).some((target) => receiptMatchesTarget(receipt, target))) {
          findings.push(`${prefix} receipt target was not authorized by the Stage attempt: ${receiptId}`);
        } else boundReceipts.push(receipt);
      }
      for (const target of authorizedTargets ?? []) {
        if (!boundReceipts.some((receipt) => receiptMatchesTarget(receipt, target))) findings.push(`${prefix} authorized target has no bound receipt: ${targetKey(target)}`);
      }
      const positiveReceipts = boundReceipts.filter((receipt) => receipt.readback?.status === "confirmed" && receipt.outcome === "satisfied");
      const negativeReceipts = boundReceipts.filter((receipt) => receipt.readback?.status === "negative" && receipt.outcome === "unsatisfied");
      const derivedOutcome = boundReceipts.length > 0 && positiveReceipts.length === boundReceipts.length
        ? "succeeded"
        : boundReceipts.length > 0 && negativeReceipts.length === boundReceipts.length
          ? "failed"
          : null;
      if (record.delivery_outcome !== derivedOutcome) findings.push(`${prefix} delivery_outcome must be derived from bound Receipt readback`);
      if (record.delivery_outcome === "blocked" || record.delivery_outcome === "not-executed") findings.push(`${prefix} blocked or not-executed delivery cannot be completed`);
    }
  }
  return findings;
}

export function driftInvalidation(state, registry, deliveryStore) {
  const events = state.invalidation_events ?? [];
  if (!Array.isArray(events)) return { findings: ["invalidation_events must be an array"], stage_id: null };
  const owners = {
    "external-source-drift": "implementation",
    "product-authority-drift": "product-requirement",
    "solution-authority-drift": "solution-contracts",
    "ui-authority-drift": "ui-specification",
    "guidance-drift": "project-discovery",
    "task-drift": "task-planning"
  };
  const findings = [];
  let selected = null;
  const runInputPackage = deliveryStore?.getPackage(state.run_input_package_id);
  for (const event of events) {
    const owner = owners[event?.kind];
    if (!owner) { findings.push(`unsupported invalidation kind: ${event?.kind}`); continue; }
    if (!text(event.evidence_ref)) findings.push(`${event.kind} requires evidence_ref`);
    const previousPackage = text(event.previous_package_id) ? deliveryStore?.getPackage(event.previous_package_id) : null;
    const currentPackage = text(event.current_package_id) ? deliveryStore?.getPackage(event.current_package_id) : null;
    if (!previousPackage) {
      findings.push(`${event.kind} previous package does not exist: ${event.previous_package_id}`);
    }
    if (!currentPackage) {
      findings.push(`${event.kind} current package does not exist: ${event.current_package_id}`);
    }
    if (event.previous_package_id === event.current_package_id) findings.push(`${event.kind} does not identify package drift`);
    if (previousPackage && currentPackage && (previousPackage.repository_id !== currentPackage.repository_id || previousPackage.repository_id !== runInputPackage?.repository_id)) findings.push(`${event.kind} packages must belong to the Run input repository`);
    const stage = registry.stages.find((candidate) => candidate.id === owner);
    if (stage && (!selected || stage.order < selected.order)) selected = stage;
  }
  return { findings, stage_id: selected?.id ?? null };
}

export function validateCapabilityAlignment(registry, skillsIndex) {
  const findings = [];
  const records = skillsIndex?.capabilities ?? [];
  const grouped = new Map();
  for (const capability of records) grouped.set(capability.capability_id, [...(grouped.get(capability.capability_id) ?? []), capability]);
  const contracts = registry.capability_contracts ?? {};
  const validateCapability = (owner, capabilityId, conditional = false) => {
    const ownerId = owner.id;
    const label = conditional ? "conditional capability" : "capability";
    const matches = grouped.get(capabilityId) ?? [];
    if (matches.length === 0) { findings.push(`${ownerId} ${label} is unavailable: ${capabilityId}`); return; }
    const required = contracts[capabilityId];
    if (!required) { findings.push(`${ownerId} ${label} has no compatibility contract: ${capabilityId}`); return; }
    const compatibility = (actual) => {
      const candidateFindings = [];
      if (actual.capability_version !== required.version) candidateFindings.push(`version mismatch`);
      const accepted = schemas(actual.accepts); const produced = schemas(actual.produces);
      for (const schema of required.accepts ?? []) if (!accepted.has(schema)) candidateFindings.push(`missing accepted schema ${schema}`);
      for (const schema of required.produces ?? []) if (!produced.has(schema)) candidateFindings.push(`missing produced schema ${schema}`);
      if (actual.permission_contract?.maximum_mutation_class !== required.maximum_mutation_class) candidateFindings.push("mutation class mismatch");
      if (!MUTATION_CLASSES_BY_EFFECT[owner.maximum_effect]?.has(actual.permission_contract?.maximum_mutation_class)) candidateFindings.push("exceeds Stage maximum effect");
      for (const evidence of required.evidence_requirements ?? []) if (!actual.evidence_requirements?.includes(evidence)) candidateFindings.push(`missing evidence requirement ${evidence}`);
      if (actual.adapter_binding?.policy !== "runtime-only") candidateFindings.push("runtime adapter policy mismatch");
      return candidateFindings;
    };
    const results = matches.map(compatibility);
    if (results.some((candidateFindings) => candidateFindings.length === 0)) return;
    for (const finding of results[0]) findings.push(`${ownerId} ${label} ${finding}: ${capabilityId}`);
  };
  for (const owner of [...(registry.stages ?? []), ...(registry.interrupts ?? [])]) {
    if (owner.execution_kind === "kernel") {
      if (owner.capability_resolution !== undefined) findings.push(`${owner.id} kernel stage must not be Skills-resolved`);
      continue;
    }
    if (owner.execution_kind === "host") {
      if (!hostAdapterValid(owner.host_adapter)) findings.push(`${owner.id} host owner requires an explicit implemented or external-required host_adapter status`);
      continue;
    }
    if (owner.execution_kind !== "capability") { findings.push(`${owner.id} execution_kind is invalid`); continue; }
    const candidates = owner.capability_resolution?.candidates;
    if (!Array.isArray(candidates) || candidates.length === 0) { findings.push(`${owner.id} capability stage has no candidates`); continue; }
    for (const capabilityId of candidates) validateCapability(owner, capabilityId);
    if (candidates.length > 1 && !text(owner.capability_resolution?.selector)) findings.push(`${owner.id} capability candidates are ambiguous without a selector`);
    for (const adapter of owner.capability_resolution?.conditional_adapters ?? []) {
      if (typeof adapter === "string") {
        validateCapability(owner, adapter, true);
      } else if (!text(adapter?.action) || !hostAdapterValid(adapter)) {
        findings.push(`${owner.id} conditional host adapter is incomplete`);
      }
    }
  }
  return findings;
}

export function requiredExitClaims(stage) {
  return stage.exit_conditions.map((condition) => exitClaim(stage.id, condition));
}
