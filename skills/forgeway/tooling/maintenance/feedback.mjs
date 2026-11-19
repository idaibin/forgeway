import { isReadOnlyDeliveryStore } from "../delivery/store.mjs";
import { validatePackageManifest } from "../delivery/package-manifest.mjs";
import { sha256 } from "../delivery/utils.mjs";
import { assert, exactKeys, freeze, hash, VERSION } from "./common.mjs";

const readers = new WeakMap();
const ref = value => typeof value === "string" && /^[A-Za-z0-9][A-Za-z0-9._:/@#-]{0,255}$/u.test(value);
const metrics = ["input_tokens", "cached_tokens", "output_tokens", "wall_time_seconds", "manual_rework_count", "cost_usd"];
// These functions are trusted HOST CODE ports, never values loaded from JSON,
// CLI module paths or collector-name declarations. No production bridge is implied.
export function createMaintenanceFeedbackReader({ store, qualifyRun, qualifyObservation }) {
  assert(isReadOnlyDeliveryStore(store) && typeof qualifyRun === "function" && typeof qualifyObservation === "function", "MAINTENANCE_FEEDBACK_HOST_READER_REQUIRED");
  const reader = Object.freeze({ kind: "host-qualified-read-only-feedback" });
  readers.set(reader, { store, qualifyRun, qualifyObservation });
  return reader;
}

export async function reviewMaintenanceFeedback(request, { reader } = {}) {
  exactKeys(request, ["run_ids", "observation_ids", "window", "timeout_ms"]);
  const ids = (items, max) => Array.isArray(items) && items.length <= max && items.every(ref);
  assert(ids(request.run_ids, 64) && request.run_ids.length && ids(request.observation_ids, 512), "MAINTENANCE_FEEDBACK_INPUT_INVALID");
  exactKeys(request.window, ["start", "end"]);
  const start = Date.parse(request.window.start), end = Date.parse(request.window.end);
  assert(typeof request.window.start === "string" && typeof request.window.end === "string" && request.window.start.endsWith("Z") && request.window.end.endsWith("Z") && Number.isFinite(start) && Number.isFinite(end) && start < end, "MAINTENANCE_FEEDBACK_WINDOW_INVALID");
  const timeout = request.timeout_ms ?? 2000;
  assert(Number.isInteger(timeout) && timeout > 0 && timeout <= 10000, "MAINTENANCE_FEEDBACK_BUDGET_INVALID");
  const port = readers.get(reader);
  assert(port && isReadOnlyDeliveryStore(port.store), "MAINTENANCE_FEEDBACK_HOST_READER_REQUIRED");
  const observationIds = [...request.observation_ids];
  const controller = new AbortController();
  let timer;
  const expired = new Promise((_, reject) => { timer = setTimeout(() => { controller.abort(); reject(new Error("budget")); }, timeout); });
  const result = { schema_version: VERSION, view: "feedback", status: "not-verified", authorizes_execution: false, window: { ...request.window }, coverage: "explicit selected references only", denominator: null, rates: null, graph_snapshot_sha256: port.store.read_snapshot_sha256, groups: [], attempts: [], accepted_feedback_refs: [], qualifications: [], rejected: [], gaps: [], duplicate_observation_count: observationIds.length - new Set(observationIds).size };
  const qualifiedRuns = new Map(), groups = new Map();
  const query = async () => {
    for (const id of new Set(request.run_ids)) {
      if (controller.signal.aborted) return;
      const run = port.store.getRun(id);
      if (!run) { result.rejected.push({ ref: id, reason: "run-missing" }); continue; }
      const qualification = await port.qualifyRun(run, { signal: controller.signal });
      if (controller.signal.aborted) return;
      if (!qualification || qualification.run_sha256 !== hash(run) || !ref(qualification.qualification_ref) || !["completed", "stable-checkpoint"].includes(qualification.state)) {
        result.rejected.push({ ref: id, reason: "completed-task-qualification-missing" }); continue;
      }
      qualifiedRuns.set(id, run);
      result.qualifications.push({ kind: "run", record_ref: id, record_sha256: qualification.run_sha256, qualification_ref: qualification.qualification_ref, ...(Array.isArray(qualification.evidence_refs) && qualification.evidence_refs.length <= 16 ? { evidence_refs: [...new Set(qualification.evidence_refs.filter(ref))].sort() } : {}) });
      for (const attempt of run.attempts) result.attempts.push({ run_id: id, attempt_id: attempt.attempt_id, status: attempt.status });
      const feedbackRefs = qualification.accepted_feedback_refs;
      if (Array.isArray(feedbackRefs)) {
        for (const feedback of feedbackRefs) if (ref(feedback)) result.accepted_feedback_refs.push(feedback);
      } else if (feedbackRefs != null) result.gaps.push("accepted-feedback-refs-invalid");
    }
    for (const id of new Set(observationIds)) {
      if (controller.signal.aborted) return;
      const observation = port.store.getObservation(id);
      const reject = reason => result.rejected.push({ ref: id, reason });
      if (!observation || !qualifiedRuns.has(observation.run_id)) { reject("run-or-observation-unqualified"); continue; }
      const attempt = port.store.getAttempt(observation.attempt_id), pkg = port.store.getPackage(observation.result_package_id);
      if (!attempt || attempt.run_id !== observation.run_id || attempt.result_package_id !== observation.result_package_id || attempt.status === "started") { reject("attempt-unstable-or-mismatched"); continue; }
      try { validatePackageManifest(pkg); } catch { reject("result-package-invalid"); continue; }
      if (observation.validation?.eligible !== true || observation.validation.payload_sha256 !== sha256(observation.payload) || observation.validation.result_package_aggregate_sha256 !== pkg.aggregate_sha256) { reject("observation-validation-invalid"); continue; }
      const time = Date.parse(observation.observed_at);
      if (!Number.isFinite(time) || time < start || time >= end) { reject("outside-window-or-invalid-time"); continue; }
      const q = await port.qualifyObservation(observation, { run: qualifiedRuns.get(observation.run_id), attempt, resultPackage: pkg, signal: controller.signal });
      if (controller.signal.aborted) return;
      if (!q || q.observation_sha256 !== hash(observation) || !ref(q.qualification_ref)) { reject("host-qualification-missing"); continue; }
      if (!ref(observation.producer?.capability_id) || !ref(observation.producer?.capability_version) || !["satisfied", "unsatisfied", "not-verified"].includes(observation.outcome)) { reject("record-metadata-invalid"); continue; }
      result.qualifications.push({ kind: "observation", record_ref: id, record_sha256: q.observation_sha256, qualification_ref: q.qualification_ref, ...(Array.isArray(q.evidence_refs) && q.evidence_refs.length <= 16 ? { evidence_refs: [...new Set(q.evidence_refs.filter(ref))].sort() } : {}) });
      // Whitelisted references/numbers only: never return commands, prompts, payload
      // text, exception messages or supplied extra metadata.
      const source = q.source && ref(q.source.id) && /^(?:[a-f0-9]{40}|snapshot:[a-f0-9]{64})$/u.test(q.source.revision ?? "") && /^[a-f0-9]{64}$/u.test(q.source.sha256 ?? "")
        ? { id: q.source.id, revision: q.source.revision, sha256: q.source.sha256 } : null;
      const binding = { capability_id: observation.producer.capability_id, contract_version: observation.producer.capability_version, source, task_ref: ref(q.task_ref) ? q.task_ref : null, acceptance_ref: ref(q.acceptance_ref) ? q.acceptance_ref : null, scenario_ref: ref(q.scenario_ref) ? q.scenario_ref : null, host_ref: ref(q.host_ref) ? q.host_ref : null, model_ref: ref(q.model_ref) ? q.model_ref : null, lane: ref(attempt.action?.stage_id) ? `stage:${attempt.action.stage_id}` : ref(q.lane) && q.lane.startsWith("standalone:") ? q.lane : null };
      const complete = source && [binding.task_ref, binding.acceptance_ref, binding.scenario_ref, binding.host_ref, binding.model_ref, binding.lane].every(Boolean);
      const key = hash({ ...binding, ...(complete ? {} : { ungrouped_observation_id: id }) });
      if (!groups.has(key)) groups.set(key, { group_ref: `feedback:${key}`, binding, observation_refs: [], attempt_refs: [], quality: "not-verified", outcomes: {}, measures: new Map(), gaps: complete ? [] : ["incomplete-comparison-binding"], next: "diagnose-with-existing-maintenance-owner" });
      const group = groups.get(key); group.observation_refs.push(id); group.attempt_refs.push(attempt.attempt_id);
      group.outcomes[observation.outcome] = (group.outcomes[observation.outcome] ?? 0) + 1;
      if (q.category === "quality" && observation.kind === "review-finding") {
        if (observation.outcome === "unsatisfied") group.quality = "unsatisfied";
        else if (observation.outcome === "satisfied" && group.quality !== "unsatisfied") group.quality = "satisfied";
      }
      for (const name of metrics) {
        const item = q.measurements?.[name];
        if (!item || !ref(item.measurement_ref) || !Number.isFinite(item.value) || item.value < 0 || (name !== "wall_time_seconds" && name !== "cost_usd" && !Number.isSafeInteger(item.value)) || (name === "cost_usd" && !ref(item.verified_charge_ref))) {
          group.gaps.push(`${name}-unknown`); continue;
        }
        const measurementKey = JSON.stringify([observation.run_id, attempt.attempt_id, name, item.measurement_ref]);
        const prior = group.measures.get(measurementKey);
        if (prior && prior.value !== item.value) { prior.conflict = true; group.gaps.push(`${name}-conflict`); }
        else if (!prior) group.measures.set(measurementKey, { name, value: item.value });
      }
    }
  };
  try { await Promise.race([query(), expired]); }
  catch { result.gaps.push(controller.signal.aborted ? "reader-timeout" : "reader-failed"); controller.abort(); }
  finally { clearTimeout(timer); }
  for (const group of groups.values()) {
    const measured = Object.fromEntries(metrics.map(name => {
      const values = [...group.measures.values()].filter(item => item.name === name);
      const total = values.reduce((sum, item) => sum + item.value, 0);
      if (!Number.isFinite(total) || (!["wall_time_seconds", "cost_usd"].includes(name) && !Number.isSafeInteger(total))) group.gaps.push(`${name}-overflow`);
      return [name, group.gaps.some(gap => gap.startsWith(`${name}-`)) || !values.length ? null : total];
    }));
    result.groups.push({ group_ref: group.group_ref, binding: group.binding, observation_refs: group.observation_refs.sort(), attempt_refs: [...new Set(group.attempt_refs)].sort(), quality: group.quality, outcomes: group.outcomes, measurements: measured, gaps: [...new Set(group.gaps)].sort(), next: group.next });
  }
  result.qualifications.sort((left, right) => left.kind.localeCompare(right.kind) || left.record_ref.localeCompare(right.record_ref));
  result.groups.sort((left, right) => left.group_ref.localeCompare(right.group_ref));
  result.accepted_feedback_refs = [...new Set(result.accepted_feedback_refs)].sort();
  if (result.groups.length) result.status = result.rejected.length || result.gaps.length || result.groups.some(group => group.gaps.length) ? "partial" : "observed";
  return freeze(result);
}
