import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import YAML from "yaml";

const profilePath = fileURLToPath(new URL("../standards/default-http-api-profile.v1.json", import.meta.url));
const defaultProfileBytes = readFileSync(profilePath);
let defaultProfile;
const PROFILE_VERSION = "1.0.0";
const PROFILE_SCHEMA_VERSION = "forgeway-http-api-profile/1";
const OVERRIDE_SCHEMA_VERSION = "forgeway-http-api-override/1";
const UNSAFE_KEYS = new Set(["__proto__", "constructor", "prototype"]);
const FIELD_NAME = /^[A-Za-z][A-Za-z0-9_]*$/;
const CORRELATION_HEADER = /^x-(?:[a-z0-9]+-)*(?:request-id|correlation-id)$/i;

function failure(message, code = "HTTP_API_PROFILE_INVALID") {
  const error = new Error(message);
  error.code = code;
  throw error;
}

function object(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) failure(`${label} must be a plain object`);
  for (const key of Object.keys(value)) if (UNSAFE_KEYS.has(key)) failure(`${label} has an unsafe key`);
  return value;
}

function exactKeys(value, allowed, label, required = []) {
  object(value, label);
  for (const key of Object.keys(value)) if (!allowed.has(key)) failure(`${label} has an unknown field: ${key}`);
  for (const key of required) if (!Object.hasOwn(value, key)) failure(`${label} is missing required field: ${key}`);
}

function string(value, label) {
  if (typeof value !== "string" || !value) failure(`${label} must be a non-empty string`);
  return value;
}

function field(value, label) {
  if (!FIELD_NAME.test(string(value, label))) failure(`${label} must be a safe field name`);
  if (UNSAFE_KEYS.has(value)) failure(`${label} must not use an unsafe field name`);
}

function header(value, label) {
  if (!CORRELATION_HEADER.test(string(value, label))) failure(`${label} must be X-Request-Id, X-Correlation-Id, or X-<project>-Request-Id/Correlation-Id`);
}

function parseStrictJson(bytes) {
  const source = Buffer.from(bytes).toString("utf8");
  try {
    JSON.parse(source);
    const document = YAML.parseDocument(source, { schema: "json", uniqueKeys: true });
    if (document.errors.length > 0) failure("invalid JSON input", "HTTP_API_JSON_INVALID");
    return document.toJS();
  } catch (cause) {
    if (cause.code === "HTTP_API_JSON_INVALID") throw cause;
    failure("invalid JSON input", "HTTP_API_JSON_INVALID");
  }
}

function route(value, label) {
  if (value === null) return;
  if (typeof value !== "string" || !/^\/[A-Za-z0-9._~!$&'()*+,;=:@/-]*$/.test(value) || value.includes("//") || value.split("/").some((segment) => segment === "." || segment === "..") || /%2e|%2f/i.test(value)) {
    failure(`${label} must be a safe absolute route path`);
  }
}

function integer(value, label, minimum, maximum) {
  if (!Number.isInteger(value) || value < minimum || value > maximum) failure(`${label} must be an integer from ${minimum} to ${maximum}`);
}

function validateConvention(convention) {
  exactKeys(convention, new Set(["response", "pagination", "auth", "request_id"]), "convention", ["response", "pagination", "auth", "request_id"]);
  const { response, pagination, auth, request_id: requestId } = convention;
  exactKeys(response, new Set(["code_field", "message_field", "data_field", "success_code"]), "response", ["code_field", "message_field", "data_field", "success_code"]);
  for (const key of ["code_field", "message_field", "data_field"]) field(response[key], `response.${key}`);
  if (new Set([response.code_field, response.message_field, response.data_field]).size !== 3) failure("response field names must be distinct");
  integer(response.success_code, "response.success_code", 0, 999999);

  exactKeys(pagination, new Set(["items_field", "total_field", "page_field", "page_size_field", "default_page_size", "max_page_size"]), "pagination", ["items_field", "total_field", "page_field", "page_size_field", "default_page_size", "max_page_size"]);
  const paginationNames = [pagination.items_field, pagination.total_field, pagination.page_field, pagination.page_size_field];
  paginationNames.forEach((name, index) => field(name, `pagination field ${index + 1}`));
  if (new Set(paginationNames).size !== paginationNames.length) failure("pagination field names must be distinct");
  integer(pagination.default_page_size, "pagination.default_page_size", 1, 1000);
  integer(pagination.max_page_size, "pagination.max_page_size", 1, 1000);
  if (pagination.default_page_size > pagination.max_page_size) failure("pagination.default_page_size must not exceed pagination.max_page_size");

  exactKeys(auth, new Set(["mode", "authorization_header", "token_scheme", "routes"]), "auth", ["mode", "authorization_header", "token_scheme", "routes"]);
  if (auth.mode !== "token" && auth.mode !== "external") failure("auth.mode must be token or external");
  exactKeys(auth.routes, new Set(["login", "me", "logout", "refresh"]), "auth.routes", ["login", "me", "logout", "refresh"]);
  Object.entries(auth.routes).forEach(([name, value]) => route(value, `auth.routes.${name}`));
  const routes = Object.values(auth.routes).filter((value) => value !== null);
  if (new Set(routes).size !== routes.length) failure("auth routes must be distinct");
  if (auth.mode === "token") {
    if (auth.authorization_header !== "Authorization" || auth.token_scheme !== "Bearer") failure("token mode requires Authorization Bearer");
    for (const [name, value] of Object.entries(auth.routes)) if (name !== "refresh" && value === null) failure("token mode requires login, me and logout routes");
  } else if (auth.authorization_header !== null || auth.token_scheme !== null || routes.length !== 0) {
    failure("external auth mode must not retain Bearer defaults or local auth routes");
  }

  exactKeys(requestId, new Set(["response_header"]), "request_id", ["response_header"]);
  if (requestId.response_header !== null) header(requestId.response_header, "request_id.response_header");
}

function validateProfile(profile) {
  exactKeys(profile, new Set(["schema_version", "profile_id", "profile_version", "lifecycle", "convention"]), "profile", ["schema_version", "profile_id", "profile_version", "lifecycle", "convention"]);
  if (profile.schema_version !== PROFILE_SCHEMA_VERSION || profile.profile_id !== "forgeway.default-http-api" || profile.profile_version !== PROFILE_VERSION) failure("unsupported HTTP API profile version");
  exactKeys(profile.lifecycle, new Set(["owner", "producer", "non_llm_consumer", "validator", "drift_policy", "retirement_rule"]), "profile.lifecycle", ["owner", "producer", "non_llm_consumer", "validator", "drift_policy", "retirement_rule"]);
  Object.entries(profile.lifecycle).forEach(([key, value]) => string(value, `profile.lifecycle.${key}`));
  validateConvention(profile.convention);
}

function applySection(target, source, allowed, label) {
  exactKeys(source, allowed, label);
  for (const [key, value] of Object.entries(source)) target[key] = value;
}

function applyOverrides(profile, overrides) {
  if (overrides === undefined) return false;
  exactKeys(overrides, new Set(["schema_version", "profile_id", "profile_version", "convention"]), "overrides", ["schema_version", "profile_id", "profile_version", "convention"]);
  if (overrides.schema_version !== OVERRIDE_SCHEMA_VERSION || overrides.profile_id !== profile.profile_id || overrides.profile_version !== profile.profile_version) failure("override must bind the exact supported profile version", "HTTP_API_OVERRIDE_VERSION_INVALID");
  exactKeys(overrides.convention, new Set(["response", "pagination", "auth", "request_id"]), "overrides.convention");
  const effective = profile.convention;
  if (Object.hasOwn(overrides.convention, "response")) applySection(effective.response, overrides.convention.response, new Set(["code_field", "message_field", "data_field", "success_code"]), "overrides.convention.response");
  if (Object.hasOwn(overrides.convention, "pagination")) applySection(effective.pagination, overrides.convention.pagination, new Set(["items_field", "total_field", "page_field", "page_size_field", "default_page_size", "max_page_size"]), "overrides.convention.pagination");
  if (Object.hasOwn(overrides.convention, "auth")) {
    const auth = overrides.convention.auth;
    exactKeys(auth, new Set(["mode", "authorization_header", "token_scheme", "routes"]), "overrides.convention.auth");
    for (const key of ["mode", "authorization_header", "token_scheme"]) if (Object.hasOwn(auth, key)) effective.auth[key] = auth[key];
    if (Object.hasOwn(auth, "routes")) applySection(effective.auth.routes, auth.routes, new Set(["login", "me", "logout", "refresh"]), "overrides.convention.auth.routes");
  }
  if (Object.hasOwn(overrides.convention, "request_id")) applySection(effective.request_id, overrides.convention.request_id, new Set(["response_header"]), "overrides.convention.request_id");
  return true;
}

function loadDefaultProfile() {
  if (!defaultProfile) {
    defaultProfile = parseStrictJson(defaultProfileBytes);
    validateProfile(defaultProfile);
  }
  return defaultProfile;
}

export function resolveHttpApiProfile({ overrideBytes } = {}) {
  const effectiveProfile = structuredClone(loadDefaultProfile());
  const overrides = overrideBytes === undefined ? undefined : parseStrictJson(overrideBytes);
  const overridesApplied = applyOverrides(effectiveProfile, overrides);
  validateConvention(effectiveProfile.convention);
  return {
    schema_version: "forgeway-http-api-resolution/1",
    profile_id: effectiveProfile.profile_id,
    profile_version: effectiveProfile.profile_version,
    default_profile_sha256: createHash("sha256").update(defaultProfileBytes).digest("hex"),
    default_profile_basis: "standards/default-http-api-profile.v1.json",
    source_overrides: overridesApplied ? "caller-supplied" : "none",
    overrides_sha256: overrideBytes === undefined ? null : createHash("sha256").update(overrideBytes).digest("hex"),
    authorizes_execution: false,
    runtime_conformance_claim: false,
    effective_convention: effectiveProfile.convention
  };
}

export const defaultHttpApiProfilePath = profilePath;
