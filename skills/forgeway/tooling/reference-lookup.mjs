import { readMetadataSnapshot } from "./maintenance/profiles.mjs";
import { digest } from "./maintenance/common.mjs";

const VERSION = "handbook-reference-index/1";
const OWNER = "idaibin/ai-handbook";
const KINDS = ["method", "interaction-pattern", "prompt-case", "audit-case", "design-candidate"];
const STATUSES = ["reference", "candidate", "historical"];
const LEVELS = ["source-read", "local-experiment", "not-verified"];
const INPUT = "REFERENCE_LOOKUP_INPUT_INVALID", INDEX = "REFERENCE_INDEX_INVALID";
const fail = code => { throw Object.assign(new Error(code), { code, exitCode: 2 }); };
const check = (value, code = INDEX) => { if (!value) fail(code); };
// Match the producer's Python str.strip nonblank test without normalizing values.
const text = value => typeof value === "string" && /[^\p{White_Space}\u001c-\u001f]/u.test(value);
const tag = text;
const revision = value => typeof value === "string" && /^[a-f0-9]{40}$/u.test(value);
function object(value, keys) {
  check(value && typeof value === "object" && !Array.isArray(value));
  check(Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key)));
}
function list(value, predicate = tag) {
  check(Array.isArray(value) && value.every(predicate) && new Set(value).size === value.length);
}

// Validate this consumer's v1 boundary; Handbook remains the index/schema owner.
export function validateReferenceIndex(index) {
  object(index, ["schema_version", "owner", "basis", "entries"]);
  check(index.schema_version === VERSION && index.owner === OWNER);
  object(index.basis, ["repository", "revision"]);
  check(index.basis.repository === OWNER && revision(index.basis.revision));
  check(Array.isArray(index.entries));
  const ids = new Set();
  for (const entry of index.entries) {
    object(entry, ["id", "kind", "title", "summary", "topics", "stages", "applies_to", "excludes", "source", "status", "evidence", "rights", "freshness"]);
    check(tag(entry.id) && !ids.has(entry.id)); ids.add(entry.id);
    check(KINDS.includes(entry.kind) && STATUSES.includes(entry.status) && text(entry.title) && text(entry.summary));
    for (const key of ["topics", "stages", "applies_to", "excludes"]) list(entry[key]);
    check(entry.topics.length > 0 && !entry.applies_to.some(tag => entry.excludes.includes(tag)));
    object(entry.source, ["repository", "path", "revision", "sha256"]);
    check(entry.source.repository === OWNER && entry.source.revision === index.basis.revision);
    check(text(entry.source.path) && !/[\u0000-\u001f\u007f\\]/u.test(entry.source.path) && !entry.source.path.startsWith("/") && entry.source.path.split("/").every(part => part && part !== "." && part !== ".."));
    check(typeof entry.source.sha256 === "string" && /^[a-f0-9]{64}$/u.test(entry.source.sha256));
    object(entry.evidence, ["level", "limitations"]);
    check(LEVELS.includes(entry.evidence.level)); list(entry.evidence.limitations, text); check(entry.evidence.limitations.length > 0);
    object(entry.rights, ["status", "allowed_use"]);
    check(["unknown", "reference-only", "licensed"].includes(entry.rights.status));
    list(entry.rights.allowed_use, value => ["reference", "adapt", "copy"].includes(value));
    check(entry.rights.allowed_use.length > 0);
    check(entry.rights.status === "licensed" || entry.rights.allowed_use.length === 1 && entry.rights.allowed_use[0] === "reference");
    object(entry.freshness, ["checked_at", "recheck_when"]);
    check(typeof entry.freshness.checked_at === "string" && /^\d{4}-\d{2}-\d{2}$/u.test(entry.freshness.checked_at) && Number(entry.freshness.checked_at.slice(0, 4)) > 0 && !Number.isNaN(Date.parse(entry.freshness.checked_at)) && new Date(entry.freshness.checked_at).toISOString().slice(0, 10) === entry.freshness.checked_at);
    list(entry.freshness.recheck_when, text); check(entry.freshness.recheck_when.length > 0);
  }
  return index;
}

function request(flags) {
  const allowed = ["need", "topic", "index", "revision", "stage", "constraint", "kind", "allow-status", "allow-evidence", "compact"];
  const repeated = ["topic", "constraint", "kind", "allow-status", "allow-evidence"];
  for (const [key, value] of Object.entries(flags)) {
    check(allowed.includes(key), INPUT);
    if (key === "compact") { check(value === true, INPUT); continue; }
    check(Array.isArray(value) && value.length > 0 && (repeated.includes(key) || value.length === 1), INPUT);
    check(value.every(item => typeof item === "string"), INPUT);
    check(new Set(value).size === value.length, INPUT);
  }
  const need = flags.need?.[0];
  const topics = flags.topic?.filter(text) ?? [];
  // Do not turn empty requests into a catalog dump or even an index read.
  if (!text(need)) return { skipped: "no-need" };
  if (topics.length === 0) return { skipped: "empty-query" };
  check(topics.every(tag) && new Set(topics).size === topics.length, INPUT);
  const constraints = flags.constraint ?? [], kinds = flags.kind ?? [];
  const statuses = flags["allow-status"] ?? ["reference"], levels = flags["allow-evidence"] ?? ["source-read"];
  check(text(flags.index?.[0]) && revision(flags.revision?.[0]), INPUT);
  check(flags.stage === undefined || tag(flags.stage[0]), INPUT);
  check(constraints.every(tag) && kinds.every(value => KINDS.includes(value)) && statuses.every(value => STATUSES.includes(value)) && levels.every(value => LEVELS.includes(value)), INPUT);
  return { need, topics, constraints: [...constraints], kinds: [...kinds],
    statuses: [...statuses], levels: [...levels], stage: flags.stage?.[0], filename: flags.index[0], revision: flags.revision[0] };
}

// No reference-body reader, execution hook, network client or fallback source.
export async function referenceLookup(flags, { loadSnapshot = readMetadataSnapshot } = {}) {
  const selected = request(flags);
  const report = { schema_version: "forgeway-reference-lookup/1", index_schema_version: VERSION,
    authorizes_execution: false, optional_reference_only: true, source_content_verified: false,
    project_authority_overridden: false, index_sha256: null, index_basis: null,
    status: "skipped", reason: selected.skipped ?? null, references: [] };
  if (selected.skipped) return report;
  let bytes;
  try { bytes = await loadSnapshot(selected.filename); }
  catch (error) {
    if (error.code === "MAINTENANCE_METADATA_LIMIT") fail("REFERENCE_INDEX_LIMIT");
    if (!["ENOENT", "ENOTDIR", "EACCES", "EPERM"].includes(error.code)) throw error;
    return { ...report, status: "unavailable", reason: error.code };
  }
  // Admission before parsing; an injected loader owns its own allocation bounds.
  check(Buffer.isBuffer(bytes));
  check(bytes.length <= 1024 * 1024, "REFERENCE_INDEX_LIMIT");
  let index;
  try { index = JSON.parse(new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(bytes)); } catch { fail(INDEX); }
  validateReferenceIndex(index);
  report.index_sha256 = digest(bytes); report.index_basis = { ...index.basis };
  if (index.basis.revision !== selected.revision) return { ...report, status: "stale", reason: "source-revision-mismatch" };
  const matches = index.entries.filter(entry => selected.topics.every(topic => entry.topics.includes(topic))
    && (!selected.stage || entry.stages.length === 0 || entry.stages.includes(selected.stage))
    && entry.applies_to.every(tag => selected.constraints.includes(tag))
    && !entry.excludes.some(tag => selected.constraints.includes(tag))
    && (selected.kinds.length === 0 || selected.kinds.includes(entry.kind))
    && entry.rights.allowed_use.includes("reference")
    && selected.statuses.includes(entry.status) && selected.levels.includes(entry.evidence.level));
  return { ...report, status: matches.length ? "matched" : "miss", reason: matches.length ? null : "no-applicable-reference",
    references: structuredClone(matches) };
}
