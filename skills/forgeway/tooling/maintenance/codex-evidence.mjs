import { createMaintenanceFeedbackReader } from "./feedback.mjs";
import { assert, hash } from "./common.mjs";

const sha = value => typeof value === "string" && /^[a-f0-9]{64}$/u.test(value);
const ref = value => typeof value === "string" && /^[A-Za-z0-9][A-Za-z0-9._:/@#+-]{0,255}$/u.test(value);
/**
 * Explicit post-task adapter for canonical codex-evidence sessions snapshot v1.
 * Both functions are trusted HOST CODE ports, never JSON/module-path declarations.
 * The host qualifies existing Run/Observation-to-native-turn mappings separately.
 * This adapter proves local-log linkage only, not business/provider acceptance.
 */
export function createCodexEvidenceFeedbackReader({ store, captureSnapshot, qualifyNativeBinding, collectorSourceSha256 } = {}) {
  assert(typeof captureSnapshot === "function" && typeof qualifyNativeBinding === "function" && sha(collectorSourceSha256), "MAINTENANCE_CODEX_HOST_PORT_REQUIRED");
  const qualified = new WeakMap();
  return createMaintenanceFeedbackReader({ store,
    qualifyRun: async (run, { signal }) => {
      const binding = await qualifyNativeBinding(run, { signal });
      if (signal.aborted) return null;
      if (!binding || binding.run_sha256 !== hash(run) || !ref(binding.qualification_ref) || !ref(binding.session_id) || !ref(binding.turn_id) || !sha(binding.snapshot_sha256) || (!(binding.observations instanceof Map) || binding.observations.size > 512)) return null;
      const envelope = await captureSnapshot({ session_id: binding.session_id, turn_id: binding.turn_id }, { signal });
      if (signal.aborted) return null;
      const snapshot = envelope?.ok === true ? envelope.data : null;
      if (snapshot?.schema_version !== "codex-evidence/session-snapshot/1" || snapshot.collector?.id !== "codex-evidence" || snapshot.collector.version !== "0.4.0" || snapshot.collector.source_sha256 !== collectorSourceSha256 || snapshot.source?.sha256 !== binding.snapshot_sha256 || !Number.isInteger(snapshot.source.bytes) || snapshot.source.bytes <= 0 || snapshot.source.bytes > 16 * 1024 * 1024 || !Number.isInteger(snapshot.source.record_count) || snapshot.source.record_count <= 0 || snapshot.source.record_count > 20000 || snapshot.session_id !== binding.session_id || snapshot.turn_id !== binding.turn_id || !["completed", "cancelled"].includes(snapshot.turn_state) || snapshot.business_acceptance !== "not-verified" || snapshot.usage?.scope !== "session-cumulative-local-counter" || snapshot.usage.billing_data !== false || !Array.isArray(snapshot.terminal_record_refs) || snapshot.terminal_record_refs.length !== 1 || snapshot.terminal_record_refs.some(item => !Number.isInteger(item.line) || item.line <= 0 || item.line > snapshot.source.record_count || !sha(item.sha256) || item.event !== (snapshot.turn_state === "completed" ? "task_complete" : "turn_aborted"))) return null;
      // Copy the host map, so later changes cannot rebind this snapshot silently.
      if (!qualified.has(signal)) qualified.set(signal, new Map());
      const evidence_refs = [`native-log:${snapshot.source.sha256}`, `collector:codex-evidence@0.4.0#${collectorSourceSha256}`];
      qualified.get(signal).set(run.run_id, { evidence_refs, session_id: binding.session_id, turn_id: binding.turn_id, observations: new Map([...binding.observations].map(([id, value]) => [id, {
        observation_sha256: value?.observation_sha256, attempt_id: value?.attempt_id,
        native_turn_id: value?.native_turn_id, qualification_ref: value?.qualification_ref,
        source: value?.source ? { id: value.source.id, revision: value.source.revision, sha256: value.source.sha256 } : null,
        task_ref: value?.task_ref, scenario_ref: value?.scenario_ref,
        acceptance_ref: value?.acceptance_ref, host_ref: value?.host_ref
      }])) });
      return { run_sha256: hash(run), qualification_ref: binding.qualification_ref, state: "stable-checkpoint", accepted_feedback_refs: [], evidence_refs };
    },
    qualifyObservation: (observation, { attempt, signal }) => {
      const run = qualified.get(signal)?.get(observation.run_id), binding = run?.observations.get(observation.observation_id);
      if (!binding || observation.producer?.session_id !== run.session_id || binding.observation_sha256 !== hash(observation) || binding.attempt_id !== attempt.attempt_id || binding.native_turn_id !== run.turn_id || !ref(binding.qualification_ref)) return null;
      // Requested model and whole-session counters cannot be promoted to actual
      // provider attribution, per-Attempt usage, cost or independent quality.
      return { ...binding, observation_sha256: hash(observation), source: binding.source ?? null, model_ref: null, category: "process", measurements: {}, evidence_refs: run.evidence_refs };
    }
  });
}
