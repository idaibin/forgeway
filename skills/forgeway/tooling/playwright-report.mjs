import { closeSync, constants, fstatSync, openSync, readSync, realpathSync } from "node:fs";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";

export const PLAYWRIGHT_REPORT_CONSUMER = "forgeway-playwright-report/1";
const MAX_BYTES = 8 * 1024 * 1024;
const MAX_ITEMS = 4096;
const CASE_ID = /^[A-Z][A-Z0-9_-]{1,63}$/;
const object = value => value !== null && typeof value === "object" && !Array.isArray(value);
// The native default project has an empty name and ID; it is not a missing field.
const name = (value, allowEmpty = false) => typeof value === "string" && (allowEmpty || value.length > 0) && value.length <= 160 && !/[\x00-\x1f]/u.test(value);
const key = (project, caseId) => JSON.stringify([project, caseId]);
const verdict = (valid, reason, expected, observed) => ({
  consumer_version: PLAYWRIGHT_REPORT_CONSUMER,
  valid,
  status: valid ? "satisfied" : "unsatisfied",
  reason,
  expected,
  observed,
  authorizes_execution: false
});

// Consistency/coverage only. A caller must separately bind the native report to
// the accepted plan, exact application/test basis, command, environment and Attempt.
export function validatePlaywrightReport(report, { required, runnerVersion } = {}) {
  if (!Array.isArray(required) || !required.length || required.length > MAX_ITEMS ||
      !required.every(item => object(item) && name(item.project, true) && typeof item.caseId === "string" && CASE_ID.test(item.caseId))) {
    throw new TypeError("a non-empty bounded inventory of project/caseId pairs is required");
  }
  if (typeof runnerVersion !== "string" || !/^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/.test(runnerVersion)) {
    throw new TypeError("an exact locked runnerVersion is required");
  }
  const expected = new Set(required.map(item => key(item.project, item.caseId)));
  if (expected.size !== required.length) throw new TypeError("duplicate required project/caseId pair");
  let observed = 0;
  const fail = reason => verdict(false, reason, expected.size, observed);
  if (!object(report) || !object(report.config) || report.config.version !== runnerVersion) return fail("runner-version-mismatch");
  if (!Array.isArray(report.errors) || report.errors.length) return fail("global-errors-or-missing-errors");
  const stats = report.stats;
  if (!object(stats) || !["expected", "unexpected", "flaky", "skipped"].every(field => Number.isSafeInteger(stats[field]) && stats[field] >= 0) ||
      stats.expected !== expected.size || stats.unexpected !== 0 || stats.flaky !== 0 || stats.skipped !== 0) return fail("nonpassing-or-inconsistent-stats");
  if (!Array.isArray(report.config.projects) || report.config.projects.length > MAX_ITEMS) return fail("invalid-projects");
  const projects = new Map();
  const projectIds = new Set();
  for (const project of report.config.projects) {
    if (!object(project) || !name(project.name, true) || !name(project.id, project.name === "") || projects.has(project.name) || projectIds.has(project.id)) return fail("ambiguous-project-identity");
    projects.set(project.name, project.id);
    projectIds.add(project.id);
  }
  if (required.some(item => !projects.has(item.project))) return fail("required-project-missing");
  if (!Array.isArray(report.suites) || !report.suites.length || report.suites.length > MAX_ITEMS) return fail("empty-or-invalid-suites");
  const queue = report.suites.map(suite => ({ suite, depth: 0 }));
  const seen = new Set();
  let budget = 0;
  for (let index = 0; index < queue.length; index++) {
    const { suite, depth } = queue[index];
    if (++budget > MAX_ITEMS || depth > 64 || !object(suite) || !Array.isArray(suite.specs) ||
        suite.specs.length > MAX_ITEMS || (suite.suites !== undefined && !Array.isArray(suite.suites))) return fail("invalid-or-unbounded-suite");
    const children = suite.suites ?? [];
    if (queue.length + children.length > MAX_ITEMS) return fail("suite-limit-exceeded");
    for (const child of children) queue.push({ suite: child, depth: depth + 1 });
    for (const spec of suite.specs) {
      if (++budget > MAX_ITEMS || !object(spec) || typeof spec.title !== "string") return fail("invalid-spec");
      const id = /^\[([A-Z][A-Z0-9_-]{1,63})\]\s+\S/.exec(spec.title)?.[1];
      if (!id || spec.ok !== true || !Array.isArray(spec.tests) || !spec.tests.length || spec.tests.length > MAX_ITEMS) return fail("unmapped-or-nonpassing-spec");
      for (const test of spec.tests) {
        if (++budget > MAX_ITEMS || !object(test) || !projects.has(test.projectName) || projects.get(test.projectName) !== test.projectId) return fail("invalid-test-project");
        const identity = key(test.projectName, id);
        if (!expected.has(identity) || seen.has(identity)) return fail("unexpected-or-duplicate-case");
        seen.add(identity);
        observed++;
        if (test.expectedStatus !== "passed" || test.status !== "expected" ||
            !Array.isArray(test.results) || test.results.length !== 1) return fail("skipped-expected-failure-flaky-or-unexecuted");
        const result = test.results[0];
        if (!object(result) || result.status !== "passed" || result.retry !== 0 || result.error != null ||
            !Array.isArray(result.errors) || result.errors.length !== 0) return fail("failed-interrupted-or-retried-result");
      }
    }
  }
  if (seen.size !== expected.size) return fail("required-case-missing");
  return verdict(true, "all-required-cases-passed-on-first-attempt", expected.size, observed);
}

function readBounded(filename) {
  // Opening a FIFO can block before fstat; nonblocking open lets us reject it.
  const fd = openSync(filename, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0) | (constants.O_NONBLOCK ?? 0));
  try {
    const stat = fstatSync(fd);
    if (!stat.isFile() || stat.size > MAX_BYTES) throw new Error("report must be a regular file no larger than 8 MiB");
    const data = Buffer.alloc(MAX_BYTES + 1);
    let length = 0;
    while (length < data.length) {
      const count = readSync(fd, data, length, data.length - length, null);
      if (!count) break;
      length += count;
    }
    if (length > MAX_BYTES) throw new Error("report grew beyond 8 MiB");
    return data.subarray(0, length);
  } finally { closeSync(fd); }
}

export function runPlaywrightReportCli(argv) {
  const required = [];
  const single = new Map();
  for (let index = 0; index < argv.length; index += 2) {
    const flag = argv[index], value = argv[index + 1];
    if (!["--report", "--runner-version", "--require"].includes(flag) || !value || value.startsWith("--")) throw new Error("expected --report FILE --runner-version VERSION --require PROJECT::CASE_ID (repeatable)");
    if (flag === "--require") {
      const split = value.lastIndexOf("::");
      if (split < 0) throw new Error("--require must be PROJECT::CASE_ID (use ::CASE_ID for the unnamed default project)");
      required.push({ project: value.slice(0, split), caseId: value.slice(split + 2) });
    } else {
      if (single.has(flag)) throw new Error(`duplicate ${flag}`);
      single.set(flag, value);
    }
  }
  if (!single.has("--report")) throw new Error("--report is required");
  const bytes = readBounded(single.get("--report"));
  const result = validatePlaywrightReport(JSON.parse(bytes.toString("utf8")), { required, runnerVersion: single.get("--runner-version") });
  return { ...result, report_sha256: createHash("sha256").update(bytes).digest("hex") };
}

let isMain = false;
try { isMain = Boolean(process.argv[1]) && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url)); } catch { /* Import does not require an executable entry. */ }
if (isMain) {
  try {
    const result = runPlaywrightReportCli(process.argv.slice(2));
    console.log(JSON.stringify(result));
    process.exitCode = result.valid ? 0 : 3;
  } catch (error) {
    console.error(JSON.stringify({ consumer_version: PLAYWRIGHT_REPORT_CONSUMER, valid: false, status: "invalid", reason: error.message, authorizes_execution: false }));
    process.exitCode = 2;
  }
}
