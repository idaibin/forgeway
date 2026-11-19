import { assert, exactKeys, freeze, hash, VERSION } from "./common.mjs";

const plans = new WeakMap();
const CONTRACT = "maintenance-retrospective-checkpoint/1";
const ref = value => typeof value === "string" && /^[A-Za-z][A-Za-z0-9._-]*:[A-Za-z0-9._@#-]{1,200}$/u.test(value);
const sha = value => typeof value === "string" && /^[a-f0-9]{64}$/u.test(value);
const cursor = value => value === null || ref(value);
const fields = (value, allowed) => value && typeof value === "object" && !Array.isArray(value) &&
  [Object.prototype, null].includes(Object.getPrototypeOf(value)) && Object.keys(value).every(key => allowed.includes(key));
const anchorValid = value => fields(value, ["record_ref", "sha256", "cursor"]) && ref(value.record_ref) && sha(value.sha256) && ref(value.cursor);
const anchor = value => value ? { record_ref: value.record_ref, sha256: value.sha256, cursor: value.cursor } : null;
const equal = (a, b) => hash(a) === hash(b);
const bindingKeys = ["task_ref", "ledger_ref", "batch_ref", "acceptance_ref", "basis_sha256", "scope_sha256"];
const binding = value => Object.fromEntries(bindingKeys.map(key => [key, value[key]]));
const validBinding = value => value && bindingKeys.every(key => key.endsWith("sha256") ? sha(value[key]) : ref(value[key]));
const copySource = source => ({ source_ref: source.source_ref, lineage: source.lineage, revision: source.revision,
  anchor: anchor(source.anchor), resume_token: source.resume_token ?? null, resume_through: source.resume_through ?? null });
function checkpointValid(value, expected) {
  if (!fields(value, ["format_version", "binding", "review_key", "sources", "result_ref", "result_sha256"]) || !fields(value.binding, bindingKeys) || value.format_version !== CONTRACT || !equal(value.binding, expected) || !sha(value.review_key) || !ref(value.result_ref) || !sha(value.result_sha256) || !Array.isArray(value.sources) || value.sources.length > 8) return false;
  const ids = new Set();
  return value.sources.every(source => {
    if (!fields(source, ["source_ref", "lineage", "revision", "anchor", "resume_token", "resume_through"]) || !ref(source.source_ref) || !ref(source.lineage) || !ref(source.revision) || !anchorValid(source.anchor) || ids.has(source.source_ref)) return false;
    const emptyResume = source.resume_token == null && source.resume_through == null;
    if (!emptyResume && !(ref(source.resume_token) && ref(source.resume_through) && source.resume_through !== source.anchor.cursor)) return false;
    ids.add(source.source_ref); return true;
  });
}

// CODE ports only: qualification, source cursors and persisted Result verification
// belong to the host. JSON labels never supply a port or prove authorization.
// No filesystem, Graph scan, body export, model, Task writer or timer is installed.
export async function planMaintenanceRetrospective(request, { qualifyBatch, resolveSourceWindow, verifyCheckpoint } = {}) {
  exactKeys(request, ["task_ref", "ledger_ref", "batch_ref", "source_refs", "window", "previous_result_ref", "max_sources", "max_records", "max_bytes", "timeout_ms"]);
  assert([request.task_ref, request.ledger_ref, request.batch_ref].every(ref), "MAINTENANCE_RETROSPECTIVE_INPUT_INVALID");
  const requestedSources = request.source_refs;
  assert(Array.isArray(requestedSources) && requestedSources.length > 0 && requestedSources.length <= 8 && requestedSources.every(ref) && new Set(requestedSources).size === requestedSources.length, "MAINTENANCE_RETROSPECTIVE_INPUT_INVALID");
  const limits = { max_sources: request.max_sources ?? 8, max_records: request.max_records ?? 256, max_bytes: request.max_bytes ?? 262144, timeout_ms: request.timeout_ms ?? 2000 };
  for (const [key, max] of Object.entries({ max_sources: 8, max_records: 256, max_bytes: 262144, timeout_ms: 10000 })) assert(Number.isSafeInteger(limits[key]) && limits[key] > 0 && limits[key] <= max, "MAINTENANCE_RETROSPECTIVE_BUDGET_INVALID");
  assert(requestedSources.length <= limits.max_sources, "MAINTENANCE_RETROSPECTIVE_BUDGET_INVALID");
  exactKeys(request.window, ["start", "end"]);
  const start = Date.parse(request.window.start), end = Date.parse(request.window.end);
  assert([request.window.start, request.window.end].every(value => typeof value === "string" && value.endsWith("Z")) && Number.isFinite(start) && start < end, "MAINTENANCE_RETROSPECTIVE_WINDOW_INVALID");
  assert(request.previous_result_ref === undefined || ref(request.previous_result_ref), "MAINTENANCE_RETROSPECTIVE_INPUT_INVALID");
  assert(typeof qualifyBatch === "function", "MAINTENANCE_RETROSPECTIVE_HOST_REQUIRED");
  // Keep the validated selection stable across host awaits without freezing caller objects.
  const sourceRefs = [...requestedSources];
  request = { ...request, source_refs: sourceRefs, window: { ...request.window } };
  const controller = new AbortController(); let timer;
  const view = { schema_version: VERSION, view: "retrospective-read-plan", status: "not-verified", authorizes_execution: false, review_key: null, read_set_sha256: null, binding: null, sources: [], gaps: [], proposed_checkpoint: null, reused_result_ref: null };
  const work = async () => {
    const qualified = await qualifyBatch({ task_ref: request.task_ref, ledger_ref: request.ledger_ref, batch_ref: request.batch_ref }, { signal: controller.signal });
    if (controller.signal.aborted) return;
    if (!validBinding(qualified) || !ref(qualified.qualification_ref) || !["completed", "failed", "cancelled", "stable-blocked"].includes(qualified.state) || qualified.external_effects !== "reconciled" || !["task_ref", "ledger_ref", "batch_ref"].every(key => qualified[key] === request[key])) {
      view.status = "defer"; view.gaps.push("batch-terminal-or-authority-qualification-missing"); return;
    }
    const bound = binding(qualified); view.binding = { ...bound, qualification_ref: qualified.qualification_ref };
    let prior = null;
    if (request.previous_result_ref) {
      assert(typeof verifyCheckpoint === "function", "MAINTENANCE_RETROSPECTIVE_CHECKPOINT_READER_REQUIRED");
      prior = await verifyCheckpoint(request.previous_result_ref, { binding: bound, signal: controller.signal });
      if (controller.signal.aborted) return;
      if (!checkpointValid(prior, bound) || prior.result_ref !== request.previous_result_ref) { view.status = "stale"; view.gaps.push("checkpoint-or-authority-drift"); return; }
      prior = { ...prior, binding: { ...prior.binding }, sources: prior.sources.map(copySource) };
    }
    let count = 0, bytes = 0;
    for (const sourceRef of [...sourceRefs].sort()) {
      if (controller.signal.aborted) return;
      const previous = prior?.sources.find(source => source.source_ref === sourceRef) ?? null;
      if (typeof resolveSourceWindow !== "function") { view.sources.push({ source_ref: sourceRef, status: "unsupported" }); view.gaps.push("supported-source-reader-missing"); continue; }
      if (count >= limits.max_records || bytes >= limits.max_bytes) { view.sources.push({ source_ref: sourceRef, status: "deferred-budget" }); view.gaps.push("read-budget-exhausted"); continue; }
      const window = await resolveSourceWindow(sourceRef, { binding: bound, previous: previous ? copySource(previous) : null, window: { ...request.window }, max_records: limits.max_records - count, max_bytes: limits.max_bytes - bytes, signal: controller.signal });
      if (controller.signal.aborted) return;
      if (!window || window.status === "unsupported") { view.sources.push({ source_ref: sourceRef, status: "unsupported" }); view.gaps.push("supported-source-reader-missing"); continue; }
      const source = { source_ref: sourceRef, status: "not-verified" };
      view.sources.push(source);
      if (window.source_ref !== sourceRef || !ref(window.lineage) || !ref(window.revision) || !ref(window.owner_ref) || !["cli", "skill", "plugin", "hook", "agent", "session", "project", "graph"].includes(window.subject_kind) || !cursor(window.after) || !cursor(window.through) || !Array.isArray(window.records) || window.records.length > limits.max_records - count || !["complete", "partial"].includes(window.completeness)) {
        source.status = "invalid"; view.gaps.push("source-window-invalid"); continue;
      }
      const base = anchor(window.base_anchor);
      if (previous && (window.lineage !== previous.lineage || !equal(base, previous.anchor) || window.after !== previous.anchor.cursor) || !previous && (window.after !== null || base !== null)) {
        source.status = "stale"; view.gaps.push("source-lineage-or-anchor-drift"); continue;
      }
      if (previous?.resume_token && window.through !== previous.resume_through) {
        source.status = "stale"; view.gaps.push("source-resume-range-drift"); continue;
      }
      if (window.completeness === "partial" && !ref(window.through)) {
        source.status = "invalid"; view.gaps.push("source-prefix-invalid"); continue;
      }
      let position = window.after, valid = true, sourceBytes = 0; const seen = new Set(), records = [];
      for (const record of window.records) {
        if (position === window.through || !record || !ref(record.record_ref) || !sha(record.sha256) || !ref(record.cursor) || record.after !== position || seen.has(record.record_ref) || !Number.isSafeInteger(record.bytes) || record.bytes < 0) { valid = false; break; }
        sourceBytes += record.bytes; if (!Number.isSafeInteger(sourceBytes) || sourceBytes > limits.max_bytes - bytes) { valid = false; break; }
        seen.add(record.record_ref); position = record.cursor;
        records.push({ record_ref: record.record_ref, sha256: record.sha256, cursor: record.cursor, after: record.after, bytes: record.bytes });
      }
      if (!valid || window.completeness === "complete" && position !== window.through || window.completeness === "partial" && position === window.through) { source.status = "invalid"; view.gaps.push("source-prefix-invalid"); continue; }
      count += records.length; bytes += sourceBytes;
      Object.assign(source, { status: window.completeness, lineage: window.lineage, revision: window.revision, owner_ref: window.owner_ref, subject_kind: window.subject_kind, after: window.after, through: window.through, records, resume_token: ref(window.resume_token) ? window.resume_token : null });
      const last = records.at(-1), stable = window.cursor_semantics === "stable-native-prefix" && (window.completeness === "complete" || ref(window.resume_token));
      source.checkpoint_anchor = stable && last ? { record_ref: last.record_ref, sha256: last.sha256, cursor: last.cursor } : previous?.anchor ?? null;
      source.checkpoint_resume_token = stable && last ? (window.completeness === "partial" ? window.resume_token : null) : previous?.resume_token ?? null;
      source.checkpoint_resume_through = stable && last ? (window.completeness === "partial" ? window.through : null) : previous?.resume_through ?? null;
      if (window.completeness === "partial") view.gaps.push(stable ? "source-partial" : "stable-resume-token-missing");
      if (!stable && records.length) view.gaps.push("source-cursor-not-committable");
    }
    view.review_key = hash({ contract: CONTRACT, binding: bound, sources: view.sources.map(({ source_ref, status, lineage, revision, after, through, records }) => ({ source_ref, status, lineage: lineage ?? null, revision: revision ?? null, after: after ?? null, through: through ?? null, records: records ?? [] })) });
    view.read_set_sha256 = hash(view.sources.map(source => ({ source_ref: source.source_ref, records: (source.records ?? []).map(({ record_ref, sha256 }) => ({ record_ref, sha256 })) })));
    const noOp = prior && !view.gaps.length && view.sources.every(source => source.status === "complete" && source.records.length === 0) && sourceRefs.length === prior.sources.length && sourceRefs.every(id => prior.sources.some(source => source.source_ref === id));
    if (noOp) { view.status = "no-op"; view.review_key = prior.review_key; view.reused_result_ref = prior.result_ref; return; }
    view.status = view.sources.some(source => source.status === "stale") ? "stale" : view.gaps.length || view.sources.some(source => source.status === "invalid") ? "partial" : "planned";
    if (view.status !== "stale") {
      // An unread/unsupported source never loses its previously committed prefix.
      const retained = new Map((prior?.sources ?? []).filter(source => sourceRefs.includes(source.source_ref)).map(source => [source.source_ref, copySource(source)]));
      for (const source of view.sources) if (source.checkpoint_anchor) retained.set(source.source_ref, copySource({ source_ref: source.source_ref, lineage: source.lineage, revision: source.revision, anchor: source.checkpoint_anchor, resume_token: source.checkpoint_resume_token, resume_through: source.checkpoint_resume_through }));
      const sources = [...retained.values()].sort((a, b) => a.source_ref.localeCompare(b.source_ref));
      view.proposed_checkpoint = { format_version: CONTRACT, binding: bound, review_key: view.review_key, sources };
      plans.set(view, { checkpoint: structuredClone(view.proposed_checkpoint), timeout_ms: limits.timeout_ms, read_set_sha256: view.read_set_sha256 });
    }
  };
  try { await Promise.race([work(), new Promise((_, reject) => { timer = setTimeout(() => { controller.abort(); reject(new Error("budget")); }, limits.timeout_ms); })]); }
  catch { controller.abort(); view.status = "not-verified"; view.proposed_checkpoint = null; plans.delete(view); view.gaps.push(timer && controller.signal.aborted ? "reader-failed-or-timeout" : "reader-failed"); }
  finally { clearTimeout(timer); }
  return freeze(view);
}

export async function completeMaintenanceRetrospective(plan, { persistedResultRef, verifyResult } = {}) {
  const state = plans.get(plan);
  assert(state && ref(persistedResultRef) && typeof verifyResult === "function", "MAINTENANCE_RETROSPECTIVE_RESULT_REQUIRED");
  const controller = new AbortController(); let timer;
  try {
    const result = await Promise.race([verifyResult(persistedResultRef, { review_key: plan.review_key, signal: controller.signal }), new Promise((_, reject) => { timer = setTimeout(() => { controller.abort(); reject(new Error("result readback timeout")); }, state.timeout_ms); })]);
    assert(result && result.result_ref === persistedResultRef && result.review_key === plan.review_key && result.read_set_sha256 === state.read_set_sha256 && sha(result.result_sha256), "MAINTENANCE_RETROSPECTIVE_RESULT_MISMATCH");
    return freeze({ ...structuredClone(state.checkpoint), result_ref: result.result_ref, result_sha256: result.result_sha256 });
  } finally { clearTimeout(timer); }
}
