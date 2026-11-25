// Bounded loopback benchmark. The only writable project is created by this process.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtemp, realpath, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { startDemo } from "../../skills/forgeway/tooling/demo-run.mjs";

const root = await mkdtemp(path.join(await realpath(tmpdir()), "forgeway-system-benchmark-"));
const project = path.join(root, "project");
const cli = fileURLToPath(new URL("../../skills/forgeway/tooling/forgeway.mjs", import.meta.url));
let demo;
async function request(route, { token, body, method = "GET", status = 200 } = {}) {
  const response = await fetch(new URL(route, demo.apiOrigin), {
    method, signal: AbortSignal.timeout(5000),
    headers: { Origin: demo.frontendOrigin, ...(token && { Authorization: `Bearer ${token}` }),
      ...(body && { "Content-Type": "application/json" }) },
    body: body && JSON.stringify(body),
  });
  if (response.status !== status) {
    const error = new Error(`Expected HTTP ${status}, received ${response.status}`);
    error.httpStatus = response.status;
    throw error;
  }
  const envelope = await response.json();
  const c = demo.convention.response;
  assert.equal(envelope[c.code_field], status < 400 ? c.success_code : -status);
  return envelope[c.data_field];
}
async function login() {
  const result = await request(demo.convention.auth.routes.login, {
    method: "POST", body: { username: "demo", password: "demo-only" },
  });
  assert.ok(result.accessToken);
  return result.accessToken;
}
async function checkList(token, query = "", ids = [1, 2, 3], total = 3) {
  const result = await request("/items" + query, { token });
  const p = demo.convention.pagination;
  assert.deepEqual(result[p.items_field].map(item => item.id), ids);
  assert.equal(result[p.total_field], total);
}
async function phase(token, round, concurrency) {
  const samples = [];
  const start = performance.now();
  for (let i = 0; i < 120; i += concurrency) {
    const wave = await Promise.all(Array.from({ length: concurrency }, async () => {
      const begin = performance.now();
      let status = "ok";
      let error;
      try {
        await checkList(token);
      } catch (cause) {
        if (cause.name === "TimeoutError") status = "timeout";
        else if (cause.httpStatus >= 400 && cause.httpStatus < 500) status = "rejected";
        else status = "error";
        error = cause.message;
      }
      return { milliseconds: performance.now() - begin, status, error };
    }));
    samples.push(...wave);
    if (wave.some(sample => sample.status !== "ok")) break;
  }
  const elapsed = performance.now() - start;
  const sorted = samples.map(sample => sample.milliseconds).sort((a, b) => a - b);
  const percentile = p => sorted[Math.ceil(sorted.length * p) - 1];
  const completed = samples.filter(sample => sample.status === "ok").length;
  const timeouts = samples.filter(sample => sample.status === "timeout").length;
  const rejected = samples.filter(sample => sample.status === "rejected").length;
  return { round, concurrency, attempted: samples.length, completed, errors: samples.length - completed,
    timeouts, rejected, timeout_rate: timeouts / samples.length, rejection_rate: rejected / samples.length,
    milliseconds: elapsed, requests_per_second: completed * 1000 / elapsed,
    p50_ms: percentile(.5), p95_ms: percentile(.95), p99_ms: percentile(.99), max_ms: sorted.at(-1),
    client_and_server_rss_bytes: process.memoryUsage().rss, samples };
}
try {
  execFileSync(process.execPath, [cli, "init", project, "--name", "System benchmark", "--starter", "http-demo"]);
  demo = await startDemo(project);
  const { auth, pagination: p } = demo.convention;
  await request(auth.routes.me, { status: 401 });
  const [a, b] = await Promise.all([login(), login()]);
  assert.notEqual(a, b);
  await checkList(a, `?${p.page_field}=1&${p.page_size_field}=2`, [1, 2]);
  await checkList(a, `?${p.page_field}=2&${p.page_size_field}=2`, [3]);
  await checkList(a, "?q=absent", [], 0);
  await checkList(a, `?${p.page_size_field}=${p.max_page_size}`);
  await request(`/items?${p.page_size_field}=${p.max_page_size + 1}`, { token: a, status: 400 });
  await checkList(a);
  await Promise.all([request(auth.routes.logout, { method: "POST", token: a }), checkList(b)]);
  await request(auth.routes.me, { token: a, status: 401 });
  await checkList(b);
  const revoked = await phase(a, 0, 1);
  assert.deepEqual([revoked.attempted, revoked.completed, revoked.errors, revoked.rejected], [1, 0, 1, 1]);
  for (let i = 0; i < 12; i++) await checkList(b);
  const phases = [];
  for (let round = 1; round <= 3; round++) {
    for (const concurrency of [1, 4, 12, 1]) {
      const metrics = await phase(b, round, concurrency);
      phases.push(metrics);
      if (metrics.errors) {
        console.error(JSON.stringify({ phases }));
        throw new Error("HTTP benchmark recorded failed requests");
      }
    }
  }
  await demo.close();
  demo = undefined;
  demo = await startDemo(project);
  await request(auth.routes.me, { token: b, status: 401 });
  await checkList(await login());
  console.log(JSON.stringify({ node: process.version, warmup_reads: 12, revoked_token_control: revoked, phases,
    session_isolation: true, pagination_boundaries: true, restart_readback: true }, null, 2));
} finally {
  try { if (demo) await demo.close(); } finally { await rm(root, { recursive: true, force: true }); }
}
