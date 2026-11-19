import { createHash, randomUUID } from "node:crypto";

export const STATES = Object.freeze([
  "satisfied",
  "unsatisfied",
  "not-verified",
  "not-applicable",
  "stale"
]);

export const OBSERVATION_KINDS = Object.freeze([
  "source-assertion",
  "command-execution",
  "artifact-validation",
  "runtime-observation",
  "review-finding",
  "delivery-receipt",
  "deployment-receipt",
  "production-probe"
]);

export const ENVIRONMENTS = Object.freeze(["local", "target-like", "deployed", "production"]);

export function clone(value) {
  if (value === undefined) return undefined;
  return JSON.parse(JSON.stringify(value));
}

export function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

/**
 * JSON canonicalisation used by all immutable identities. Object keys are sorted;
 * array order remains meaningful. This deliberately does not coerce values.
 */
export function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value).sort().map((key) => [key, canonicalize(value[key])])
    );
  }
  return value;
}

export function canonicalJson(value) {
  return JSON.stringify(canonicalize(value));
}

export function sha256(value) {
  const input = Buffer.isBuffer(value) || value instanceof Uint8Array
    ? value
    : typeof value === "string"
      ? value
      : canonicalJson(value);
  return createHash("sha256").update(input).digest("hex");
}

export function id(prefix, supplied) {
  if (supplied !== undefined && supplied !== null) return String(supplied);
  return `${prefix}:${randomUUID()}`;
}

export function nowIso(now = Date.now) {
  const value = typeof now === "function" ? now() : now;
  return new Date(value).toISOString();
}

export function assert(condition, message, code = "DELIVERY_INVALID") {
  if (!condition) {
    const error = new Error(message);
    error.code = code;
    throw error;
  }
}

export function assertState(value, field = "state") {
  assert(STATES.includes(value), `${field} must be one of ${STATES.join(", ")}`);
  return value;
}

export function policyRefValue(policyRef) {
  if (typeof policyRef === "string") return policyRef;
  if (policyRef && typeof policyRef === "object") {
    return `${policyRef.policy_id}@${policyRef.version}`;
  }
  return "";
}

export function normalisePolicyRef(policyRef) {
  if (typeof policyRef === "string") {
    const at = policyRef.lastIndexOf("@");
    if (at > 0 && /^\d+$/.test(policyRef.slice(at + 1))) {
      return { policy_id: policyRef.slice(0, at), version: Number(policyRef.slice(at + 1)) };
    }
    return { policy_id: policyRef, version: 1 };
  }
  assert(policyRef && typeof policyRef === "object", "policy_ref is required");
  assert(typeof policyRef.policy_id === "string" && policyRef.policy_id.length > 0, "policy_ref.policy_id is required");
  assert(Number.isInteger(policyRef.version) && policyRef.version > 0, "policy_ref.version must be a positive integer");
  return { policy_id: policyRef.policy_id, version: policyRef.version };
}

export function packageIdentity(value) {
  return typeof value === "string" ? value : value?.package_id;
}

export function outcomeIsPositive(outcome, accepted = ["satisfied", "pass"]) {
  return accepted.includes(outcome);
}

export function outcomeIsNegative(outcome) {
  return ["unsatisfied", "fail", "blocked", "error"].includes(outcome);
}

export function toSqlJson(value) {
  return JSON.stringify(value === undefined ? null : value);
}

export function fromSqlJson(value) {
  if (value === null || value === undefined) return null;
  return JSON.parse(value);
}
