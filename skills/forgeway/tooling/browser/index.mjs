import { mockCommand } from './mock/index.mjs';
import { spawn, execFileSync } from "node:child_process";
import { createWriteStream, existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { link, unlink } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { constants as osConstants, tmpdir } from "node:os";
import path from "node:path";
import { finished } from "node:stream/promises";
import { CdpSession, delay, discoverTargets, endpointUrl, evaluate, executeStep } from "./cdp.mjs";
import { flowFingerprint, validateBrowserFlow } from "./flow.mjs";

function fail(message, code = "BROWSER_INPUT_INVALID", exitCode = 2) {
  const error = new Error(message);
  error.code = code;
  error.exitCode = exitCode;
  throw error;
}

function one(flags, key) {
  const value = flags[key];
  if (value === undefined) return undefined;
  if (value === true || value.length !== 1) fail(`--${key} requires exactly one value`);
  return value[0];
}

function allow(flags, names) {
  for (const key of Object.keys(flags)) if (!names.includes(key)) fail(`unsupported browser option: --${key}`);
}

function readFlow(file) {
  if (!file) fail("--flow is required");
  const bytes = readFileSync(file);
  return { flow: validateBrowserFlow(JSON.parse(bytes.toString("utf8"))), sha256: flowFingerprint(bytes) };
}

// Dependency overrides are an internal deterministic-fixture seam, never CLI options.
export async function launchHeadless(chrome, {
  spawnChild = spawn, targets = discoverTargets,
  connect = (url) => CdpSession.connect(url), cleanupWaitMs = 1000, pollWaitMs = 100,
  removeProfile = (profile) => rmSync(profile, { recursive: true, force: true })
} = {}) {
  if (!chrome || !existsSync(chrome)) fail("--chrome must name an installed Chrome executable");
  const tailLimit = 16 * 1024;
  const pollMs = Number.isInteger(pollWaitMs) ? Math.min(100, Math.max(1, pollWaitMs)) : 100;
  const cleanupMs = Number.isInteger(cleanupWaitMs) ? Math.min(1000, Math.max(1, cleanupWaitMs)) : 1000;
  const spawnCodes = new Set(["EACCES", "ENOENT", "EAGAIN", "ENOMEM", "EMFILE", "ENFILE", "ENOTDIR", "EISDIR", "EINVAL", "EPERM"]);
  const messages = {
    BROWSER_LAUNCH_FAILED: "isolated Chrome launch failed",
    BROWSER_TARGET_AMBIGUOUS: "isolated Chrome target identity is ambiguous",
    BROWSER_ENDPOINT_INVALID: "isolated Chrome endpoint is invalid",
    BROWSER_RUNTIME_FAILED: "isolated Chrome launch runtime failed",
    BROWSER_CDP_TIMEOUT: "isolated Chrome CDP connection timed out",
    BROWSER_CDP_ERROR: "isolated Chrome CDP connection failed"
  };
  let child, profile, pendingSession, failure, failureStage, spawnCode = null, exitCode = null, signal = null;
  let stage = "profile", spawned = false, exited = false, closed = false, timeout = false, drainIncomplete = false;
  let capturing = true, stderrBytes = 0, tail = Buffer.alloc(0);
  let resolveFailure, resolveClose;
  const failed = new Promise((resolve) => { resolveFailure = resolve; });
  const settled = new Promise((resolve) => { resolveClose = resolve; });
  const launchError = (message) => Object.assign(new Error(message), { code: "BROWSER_LAUNCH_FAILED", exitCode: 3 });
  const noteFailure = (cause, phase = stage) => {
    if (failure || !capturing) return;
    failure = cause; failureStage = phase; resolveFailure(cause);
  };
  const observe = (operation) => Promise.race([operation, failed.then((cause) => { throw cause; })]);
  const checkFailure = () => { if (failure) throw failure; };
  const closePendingSession = () => {
    const session = pendingSession;
    pendingSession = undefined;
    try { session?.close(); } catch {} // Cleanup must not replace the launch failure.
  };
  const stopCapture = () => { capturing = false; tail = Buffer.alloc(0); };
  const stats = (cleanupConfirmed) => ({
    stage: failureStage ?? stage, spawn_code: spawnCode, exit_code: exitCode, signal,
    timeout, stderr_bytes: stderrBytes, stderr_tail_bytes: tail.length,
    stderr_truncated: stderrBytes > tailLimit, cleanup_confirmed: cleanupConfirmed
  });
  const recordExit = (code, killedBy) => {
    exitCode = Number.isInteger(code) && code >= 0 && code <= 255 ? code : null;
    signal = killedBy == null ? null : Object.hasOwn(osConstants.signals, killedBy) ? killedBy : "UNKNOWN";
  };
  const boundedWait = async (event, milliseconds, fallback) => {
    let timer;
    try { return await Promise.race([event, new Promise((resolve) => { timer = setTimeout(() => resolve(fallback), milliseconds); })]); }
    finally { clearTimeout(timer); }
  };
  const waitForClose = () => closed ? Promise.resolve(true) : boundedWait(settled.then(() => true), cleanupMs, false);
  const knownLive = () => child && Number.isInteger(child.pid) && child.pid > 0 && child.exitCode === null && child.signalCode === null && !exited && !closed && spawnCode === null;
  try {
    profile = mkdtempSync(path.join(tmpdir(), "forgeway-browser-"));
    stage = "spawn";
    try {
      child = spawnChild(chrome, ["--headless=new", "--no-first-run", "--no-default-browser-check", "--disable-gpu", "--remote-debugging-port=0", `--user-data-dir=${profile}`, "about:blank"], { stdio: ["ignore", "ignore", "pipe"] });
    } catch (cause) {
      spawnCode = spawnCodes.has(cause.code) ? cause.code : "UNKNOWN";
      throw cause;
    }
    child.once("spawn", () => { spawned = true; });
    // Keep error handled even if the process emits a later cleanup error.
    child.on("error", (cause) => {
      if (!failure && !spawned) spawnCode = spawnCodes.has(cause.code) ? cause.code : "UNKNOWN";
      noteFailure(cause, spawned ? stage : "spawn");
    });
    child.once("exit", (code, killedBy) => {
      if (closed) return;
      exited = true; recordExit(code, killedBy);
      noteFailure(launchError("isolated Chrome exited before CDP was ready"));
    });
    child.once("close", (code, killedBy) => {
      closed = true;
      if (!exited) recordExit(code, killedBy);
      resolveClose();
      noteFailure(launchError("isolated Chrome closed before CDP was ready"));
    });
    child.stderr.on("error", (cause) => noteFailure(cause));
    child.stderr.on("data", (chunk) => {
      if (!capturing) return; // Continue consuming after launch; never capture page activity.
      const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      stderrBytes = Math.min(Number.MAX_SAFE_INTEGER, stderrBytes + bytes.length);
      if (bytes.length >= tailLimit) tail = Buffer.from(bytes.subarray(bytes.length - tailLimit));
      else tail = Buffer.concat([tail.subarray(Math.max(0, tail.length - (tailLimit - bytes.length))), bytes]);
    });
    stage = "port-file";
    const portFile = path.join(profile, "DevToolsActivePort");
    for (let index = 0; index < 100 && !existsSync(portFile); index += 1) {
      checkFailure();
      await boundedWait(failed.then((cause) => { throw cause; }), pollMs);
    }
    checkFailure();
    if (!existsSync(portFile)) { timeout = true; throw launchError("isolated Chrome did not expose CDP"); }
    const port = Number(readFileSync(portFile, "utf8").split("\n")[0]);
    const endpoint = `http://127.0.0.1:${port}`;
    stage = "target-discovery";
    const pages = await observe(targets(endpoint));
    checkFailure();
    if (pages.length !== 1) fail("isolated Chrome target identity is ambiguous", "BROWSER_TARGET_AMBIGUOUS", 3);
    stage = "cdp-connect";
    const opening = Promise.resolve(connect(pages[0].webSocketDebuggerUrl)).then((session) => {
      pendingSession = session;
      if (failure) { closePendingSession(); throw failure; }
      return session;
    });
    const session = await observe(opening);
    checkFailure();
    stage = "ready";
    stopCapture();
    pendingSession = undefined; // Transfer ownership only on successful return.
    return { endpoint, target: pages[0], session, child, profile, launchDiagnostics: stats(null) };
  } catch (cause) {
    noteFailure(cause);
    closePendingSession();
    if (child && !closed) {
      if (knownLive()) { try { child.kill("SIGTERM"); } catch {} }
      await waitForClose();
      if (knownLive()) { try { child.kill("SIGKILL"); } catch {} await waitForClose(); }
      // Exit without close is incomplete drain, not confirmed cleanup.
      if (exited && !closed) { drainIncomplete = true; child.stderr?.destroy(); }
    }
    let cleanupConfirmed = (!child || closed) && !drainIncomplete;
    if (cleanupConfirmed && profile) {
      try { removeProfile(profile); } catch { cleanupConfirmed = false; }
    }
    const diagnostic = Object.freeze(stats(cleanupConfirmed));
    stopCapture();
    const code = Object.hasOwn(messages, failure.code) ? failure.code : "BROWSER_LAUNCH_FAILED";
    const error = new Error(`${messages[code]} ${JSON.stringify(diagnostic)}`, { cause: failure });
    error.code = code; error.exitCode = 3; error.launchDiagnostics = diagnostic;
    throw error;
  }
}

async function nativeRecordingSupported(endpoint) {
  const response = await fetch(`${endpointUrl(endpoint)}/json/protocol`, { signal: AbortSignal.timeout(5000) });
  if (!response.ok) return false;
  const protocol = await response.json();
  const page = protocol.domains?.find((domain) => domain.domain === "Page");
  return !!page?.commands?.some((command) => command.name === "startScreenRecording") && !!page?.commands?.some((command) => command.name === "stopScreenRecording");
}

async function saveRecording(session, handle, file) {
  const output = createWriteStream(file, { flags: "wx", mode: 0o600 });
  let bytes = 0;
  try {
    for (let index = 0; index < 100000; index += 1) {
      const chunk = await session.send("IO.read", { handle, size: 1048576 });
      const data = chunk.base64Encoded ? Buffer.from(chunk.data, "base64") : Buffer.from(chunk.data ?? "", "utf8");
      bytes += data.length;
      if (bytes > 2_000_000_000) fail("recording exceeds 2 GB limit", "BROWSER_RECORDING_TOO_LARGE", 3);
      if (data.length && !output.write(data)) await new Promise((resolve) => output.once("drain", resolve));
      if (chunk.eof) break;
      if (index === 99999) fail("recording stream did not finish", "BROWSER_RECORDING_INCOMPLETE", 3);
    }
    output.end();
    await finished(output);
    await session.send("IO.close", { handle });
    return bytes;
  } catch (error) {
    output.destroy();
    await unlink(file).catch(() => {});
    throw error;
  }
}

function inspectVideo(file) {
  const raw = execFileSync("ffprobe", ["-v", "error", "-show_frames", "-show_entries", "format=duration,size:stream=codec_name,width,height:frame=best_effort_timestamp_time", "-of", "json", file], { encoding: "utf8", maxBuffer: 20_000_000 });
  const data = JSON.parse(raw);
  const video = data.streams?.find((stream) => stream.width && stream.height);
  const duration = Number(data.format?.duration);
  const times = data.frames?.map((frame) => Number(frame.best_effort_timestamp_time)).filter(Number.isFinite) ?? [];
  const frames = times.length;
  if (!video || !Number.isFinite(duration) || duration <= 0 || !Number.isInteger(frames) || frames < 2) fail("MP4 playback verification failed", "BROWSER_VIDEO_INVALID", 3);
  const gaps = times.slice(1).map((time, index) => (time - times[index]) * 1000).sort((a, b) => a - b);
  return { duration_seconds: duration, frames, measured_fps: Number((frames / duration).toFixed(2)), p95_frame_gap_ms: Number(gaps[Math.ceil(gaps.length * 0.95) - 1].toFixed(1)), max_frame_gap_ms: Number(gaps.at(-1).toFixed(1)), width: video.width, height: video.height, codec: video.codec_name, bytes: Number(data.format.size) };
}

async function record(flags) {
  allow(flags, ["flow", "out", "endpoint", "target-id", "launch-headless", "chrome", "compact", "json"]);
  const { flow, sha256 } = readFlow(one(flags, "flow"));
  const out = one(flags, "out");
  if (!out || path.extname(out).toLowerCase() !== ".mp4" || existsSync(out)) fail("--out must be a new MP4 path");
  if (!existsSync(path.dirname(path.resolve(out)))) fail("output parent directory does not exist");
  const launch = flags["launch-headless"] === true;
  if (launch === !!one(flags, "endpoint")) fail("choose exactly one of --endpoint or --launch-headless");
  if (launch && one(flags, "target-id")) fail("--target-id applies only to --endpoint");
  if (!launch && one(flags, "chrome")) fail("--chrome applies only to --launch-headless");
  let owned;
  let session;
  let target;
  let started = false;
  const temporary = path.resolve(out) + `.partial-${randomUUID()}`;
  try {
    if (launch) {
      owned = await launchHeadless(one(flags, "chrome"));
      ({ session, target } = owned);
    } else {
      const id = one(flags, "target-id");
      if (!id) fail("--target-id is required for an existing Chrome");
      const targets = await discoverTargets(one(flags, "endpoint"));
      target = targets.find((item) => item.id === id);
      if (!target) fail("target ID is not present in this Chrome", "BROWSER_TARGET_MISSING", 3);
      if (target.url !== flow.target_url) fail("target URL differs from the fixed flow", "BROWSER_TARGET_MISMATCH", 3);
      session = await CdpSession.connect(target.webSocketDebuggerUrl);
    }
    const endpoint = owned?.endpoint ?? one(flags, "endpoint");
    if (!await nativeRecordingSupported(endpoint)) fail("this Chrome does not expose native screen recording", "BROWSER_RECORDING_UNAVAILABLE", 3);
    await session.send("Page.enable");
    await session.send("Runtime.enable");
    if (owned) {
      await session.send("Page.navigate", { url: flow.target_url });
      const until = Date.now() + 10000;
      while (await evaluate(session, "location.href") !== flow.target_url) {
        if (Date.now() >= until) fail("page navigation did not reach the fixed URL", "BROWSER_TARGET_MISMATCH", 3);
        await delay(50);
      }
    }
    const actual = await evaluate(session, "location.href");
    if (actual !== flow.target_url) fail("page URL differs from the fixed flow", "BROWSER_TARGET_MISMATCH", 3);
    if (flow.expected_viewport) {
      const viewport = await evaluate(session, "({width:innerWidth,height:innerHeight})");
      if (viewport.width !== flow.expected_viewport.width || viewport.height !== flow.expected_viewport.height) fail("effective viewport differs from the fixed flow", "BROWSER_VIEWPORT_MISMATCH", 3);
    }
    const cursor = { x: null, y: null };
    for (const step of flow.preflight ?? []) await executeStep(session, step, cursor);
    const start = await session.send("Page.startScreenRecording", { audio: flow.capture.audio, maxWidth: flow.capture.max_width, maxHeight: flow.capture.max_height, frameRate: flow.capture.frame_rate });
    started = true;
    const startedAt = Date.now();
    const actions = [];
    let actionError;
    try {
      for (const [index, step] of flow.steps.entries()) {
        if (Date.now() - startedAt > flow.max_duration_ms) fail("flow exceeded max_duration_ms", "BROWSER_FLOW_TIMEOUT", 3);
        const actionStarted = Date.now();
        await executeStep(session, step, cursor);
        actions.push({ index, action: step.action, elapsed_ms: Date.now() - actionStarted });
      }
    } catch (error) { actionError = error; }
    const stop = await session.send("Page.stopScreenRecording");
    started = false;
    const handle = stop.stream ?? start.stream;
    if (!handle) fail("native recording returned no stream", "BROWSER_RECORDING_INCOMPLETE", 3);
    if (actionError) {
      await session.send("IO.close", { handle }).catch(() => {});
      throw actionError;
    }
    await saveRecording(session, handle, temporary);
    const video = inspectVideo(temporary);
    if (video.duration_seconds > flow.max_duration_ms / 1000 + 2) fail("recording duration exceeds the fixed flow", "BROWSER_VIDEO_INVALID", 3);
    await link(temporary, out);
    await unlink(temporary);
    const smooth = video.measured_fps >= flow.capture.min_fps && video.p95_frame_gap_ms <= 100 && video.max_frame_gap_ms <= 500;
    return { schema_version: "forgeway-browser-recording/1", status: smooth ? "pass" : "partial", target_id: target.id, target_url_sha256: flowFingerprint(Buffer.from(flow.target_url)), flow_sha256: sha256, action_count: actions.length, actions, video: { ...video, path: path.resolve(out), min_fps: flow.capture.min_fps, smoothness_verified: smooth }, authorizes_delivery: false };
  } finally {
    if (started) await session?.send("Page.stopScreenRecording").catch(() => {});
    session?.close();
    await unlink(temporary).catch(() => {});
    if (owned) {
      owned.child.kill("SIGTERM");
      await delay(300);
      rmSync(owned.profile, { recursive: true, force: true });
    }
  }
}

export async function browserCommand(action, flags, positionals) {
  if (action === "mock") return mockCommand(positionals[2], flags, positionals);
  if (positionals.length !== 2) fail("unexpected browser command arguments");
  if (action === "validate") {
    allow(flags, ["flow", "compact", "json"]);
    const { flow, sha256 } = readFlow(one(flags, "flow"));
    return { schema_version: "forgeway-browser-flow-check/1", valid: true, flow_sha256: sha256, preflight_count: flow.preflight?.length ?? 0, step_count: flow.steps.length };
  }
  if (action === "doctor") {
    allow(flags, ["endpoint", "chrome", "compact", "json"]);
    const endpoint = one(flags, "endpoint");
    const chrome = one(flags, "chrome");
    const ffprobe = (() => { try { return execFileSync("ffprobe", ["-version"], { encoding: "utf8" }).split("\n")[0]; } catch { return null; } })();
    const chromeVersion = chrome && existsSync(chrome) ? execFileSync(chrome, ["--version"], { encoding: "utf8" }).trim() : null;
    let connection = null;
    if (endpoint) {
      try { connection = { reachable: true, targets: (await discoverTargets(endpoint)).length, native_recording: await nativeRecordingSupported(endpoint) }; }
      catch { connection = { reachable: false, targets: 0, native_recording: false }; }
    }
    return { schema_version: "forgeway-browser-doctor/1", ffprobe, chrome: chromeVersion, connection, launch_prerequisites_present: !!(ffprobe && chromeVersion), ready_for_existing: !!(ffprobe && connection?.native_recording) };
  }
  if (action === "targets") {
    allow(flags, ["endpoint", "compact", "json"]);
    const endpoint = one(flags, "endpoint");
    if (!endpoint) fail("--endpoint is required");
    return { schema_version: "forgeway-browser-targets/1", targets: (await discoverTargets(endpoint)).map(({ id, title, url }) => ({ id, title, url })) };
  }
  if (action === "record") return record(flags);
  fail(`unknown browser command: ${action}`);
}
