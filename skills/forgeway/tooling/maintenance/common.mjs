import { createHash } from "node:crypto";

export const VERSION = "forgeway-maintenance/2";
export const digest = value => createHash("sha256").update(value).digest("hex");
export function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`;
  return JSON.stringify(value);
}
export const hash = value => digest(canonical(value));
export function fail(code, message = code) { throw Object.assign(new Error(message), { code, exitCode: 2 }); }
export function assert(value, code) { if (!value) fail(code); }
export function exactKeys(value, keys, code = "MAINTENANCE_INPUT_INVALID") {
  assert(value && typeof value === "object" && !Array.isArray(value), code);
  assert(Object.keys(value).every(key => keys.includes(key)), code);
}
export function text(value) { return typeof value === "string" && value.length > 0 && value.length <= 4096 && !/[\u0000-\u001f]/u.test(value); }
export function relative(value) {
  return text(value) && !/^(?:\/|~|[A-Za-z]:)/u.test(value) && !value.includes("\\") && value.split("/").every(p => p && p !== "." && p !== "..");
}
export function freeze(value) {
  if (value && typeof value === "object") { for (const child of Object.values(value)) freeze(child); Object.freeze(value); }
  return value;
}
