import { createHash } from "node:crypto";

const ACTIONS = new Set(["wait", "assert", "click", "hover", "move", "scroll", "pause"]);
const STATES = new Set(["visible", "hidden"]);

function invalid(message) {
  const error = new Error(message);
  error.code = "BROWSER_FLOW_INVALID";
  error.exitCode = 2;
  throw error;
}

function integer(value, min, max, label) {
  if (!Number.isInteger(value) || value < min || value > max) invalid(`${label} must be an integer from ${min} to ${max}`);
  return value;
}

function exactKeys(value, keys, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) invalid(`${label} must be an object`);
  for (const key of Object.keys(value)) if (!keys.includes(key)) invalid(`${label} has unsupported key: ${key}`);
}

function steps(value, label, preflight = false) {
  if (!Array.isArray(value) || value.length > 100 || (!preflight && value.length === 0)) invalid(`${label} must contain 1–100 steps`);
  return value.map((step, index) => {
    const at = `${label}[${index}]`;
    exactKeys(step, ["action", "selector", "state", "timeout_ms", "duration_ms", "x", "y", "delta_y"], at);
    if (!ACTIONS.has(step.action) || (preflight && !["wait", "assert"].includes(step.action))) invalid(`${at} has unsupported action`);
    if (["wait", "assert", "click", "hover"].includes(step.action) && (typeof step.selector !== "string" || !step.selector.trim() || step.selector.length > 300)) invalid(`${at} requires a short CSS selector`);
    if (["wait", "assert"].includes(step.action)) {
      if (!STATES.has(step.state)) invalid(`${at} requires visible or hidden state`);
      if (step.action === "wait") integer(step.timeout_ms, 1, 30000, `${at}.timeout_ms`);
    }
    if (["hover", "move", "pause"].includes(step.action)) integer(step.duration_ms, 0, 2000, `${at}.duration_ms`);
    if (step.action === "move" || step.action === "scroll") {
      integer(step.x, 0, 10000, `${at}.x`);
      integer(step.y, 0, 10000, `${at}.y`);
    }
    if (step.action === "scroll") integer(step.delta_y, -3000, 3000, `${at}.delta_y`);
    return step;
  });
}

export function validateBrowserFlow(flow) {
  exactKeys(flow, ["schema_version", "target_url", "expected_viewport", "capture", "preflight", "steps", "max_duration_ms"], "flow");
  if (flow.schema_version !== "forgeway-browser-flow/1") invalid("unsupported flow schema_version");
  if (typeof flow.target_url !== "string" || !/^(https?:|data:text\/html,)/.test(flow.target_url)) invalid("target_url must be HTTP(S) or a test HTML data URL");
  if (flow.expected_viewport !== undefined) {
    exactKeys(flow.expected_viewport, ["width", "height"], "expected_viewport");
    integer(flow.expected_viewport.width, 1, 10000, "expected_viewport.width");
    integer(flow.expected_viewport.height, 1, 10000, "expected_viewport.height");
  }
  exactKeys(flow.capture, ["frame_rate", "min_fps", "max_width", "max_height", "audio"], "capture");
  integer(flow.capture.frame_rate, 1, 60, "capture.frame_rate");
  integer(flow.capture.min_fps, 1, flow.capture.frame_rate, "capture.min_fps");
  integer(flow.capture.max_width, 64, 10000, "capture.max_width");
  integer(flow.capture.max_height, 64, 10000, "capture.max_height");
  if (typeof flow.capture.audio !== "boolean") invalid("capture.audio must be boolean");
  integer(flow.max_duration_ms, 1000, 300000, "max_duration_ms");
  steps(flow.preflight ?? [], "preflight", true);
  steps(flow.steps, "steps");
  return flow;
}

export function flowFingerprint(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}
