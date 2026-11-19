function browserError(message, code = "BROWSER_RUNTIME_FAILED") {
  const error = new Error(message);
  error.code = code;
  error.exitCode = 3;
  return error;
}

export class CdpSession {
  constructor(socket) {
    this.socket = socket;
    this.nextId = 0;
    this.pending = new Map();
    socket.addEventListener("message", (event) => {
      const message = JSON.parse(event.data);
      if (!message.id || !this.pending.has(message.id)) return;
      const pending = this.pending.get(message.id);
      this.pending.delete(message.id);
      clearTimeout(pending.timer);
      if (message.error) pending.reject(browserError(`${pending.method}: ${message.error.message}`, "BROWSER_CDP_ERROR"));
      else pending.resolve(message.result ?? {});
    });
    socket.addEventListener("close", () => {
      for (const pending of this.pending.values()) {
        clearTimeout(pending.timer);
        pending.reject(browserError("CDP connection closed"));
      }
      this.pending.clear();
    });
  }

  static async connect(url) {
    let address;
    try { address = new URL(url); } catch { throw browserError("invalid CDP WebSocket URL", "BROWSER_ENDPOINT_INVALID"); }
    if (address.protocol !== "ws:" || !["127.0.0.1", "localhost", "[::1]"].includes(address.hostname) || address.username || address.password) throw browserError("CDP WebSocket must use loopback", "BROWSER_ENDPOINT_INVALID");
    const socket = new WebSocket(url);
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => { socket.close(); reject(browserError("CDP WebSocket connection timed out", "BROWSER_CDP_TIMEOUT")); }, 5000);
      socket.addEventListener("open", () => { clearTimeout(timer); resolve(); }, { once: true });
      socket.addEventListener("error", () => { clearTimeout(timer); reject(browserError("CDP WebSocket connection failed")); }, { once: true });
    });
    return new CdpSession(socket);
  }

  send(method, params = {}, timeoutMs = 30000) {
    if (this.socket.readyState !== WebSocket.OPEN) throw browserError("CDP connection is not open");
    return new Promise((resolve, reject) => {
      const id = ++this.nextId;
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(browserError(`${method} timed out`, "BROWSER_CDP_TIMEOUT"));
      }, timeoutMs);
      this.pending.set(id, { resolve, reject, timer, method });
      this.socket.send(JSON.stringify({ id, method, params }));
    });
  }

  close() { this.socket.close(); }
}

export function endpointUrl(input) {
  let url;
  try { url = new URL(input); } catch { throw browserError("invalid CDP endpoint", "BROWSER_ENDPOINT_INVALID"); }
  if (url.protocol !== "http:" || !["127.0.0.1", "localhost", "[::1]"].includes(url.hostname) || url.username || url.password || url.search || url.hash) {
    throw browserError("CDP endpoint must be a plain loopback HTTP URL", "BROWSER_ENDPOINT_INVALID");
  }
  return url.origin;
}

export async function discoverTargets(endpoint) {
  const base = endpointUrl(endpoint);
  const response = await fetch(`${base}/json/list`, { signal: AbortSignal.timeout(5000) });
  if (!response.ok) throw browserError(`CDP target listing returned HTTP ${response.status}`);
  const targets = await response.json();
  if (!Array.isArray(targets)) throw browserError("CDP target listing is invalid");
  return targets.filter((target) => target.type === "page" && typeof target.id === "string" && typeof target.webSocketDebuggerUrl === "string");
}

export async function evaluate(session, expression) {
  const result = await session.send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
  if (result.exceptionDetails) throw browserError("page evaluation failed", "BROWSER_PAGE_EVALUATION_FAILED");
  return result.result?.value;
}

export const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export async function elementState(session, selector) {
  return evaluate(session, `(() => { const el = document.querySelector(${JSON.stringify(selector)}); if (!el) return { found: false, visible: false }; const r = el.getBoundingClientRect(); const s = getComputedStyle(el); return { found: true, visible: !!(r.width && r.height && s.visibility !== 'hidden' && s.display !== 'none'), x: r.x + r.width / 2, y: r.y + r.height / 2, disabled: el.matches(':disabled,[aria-disabled="true"]') }; })()`);
}

export async function waitForState(session, selector, state, timeoutMs) {
  const until = Date.now() + timeoutMs;
  while (true) {
    const result = await elementState(session, selector);
    if (result.visible === (state === "visible")) return result;
    if (Date.now() >= until) throw browserError(`expected ${state} state timed out`, "BROWSER_STEP_TIMEOUT");
    await delay(50);
  }
}

export async function executeStep(session, step, cursor) {
  if (step.action === "wait") return waitForState(session, step.selector, step.state, step.timeout_ms);
  if (step.action === "assert") {
    const state = await elementState(session, step.selector);
    if (state.visible !== (step.state === "visible")) throw browserError(`expected ${step.state} state`, "BROWSER_ASSERTION_FAILED");
    return state;
  }
  if (step.action === "pause") return delay(step.duration_ms);
  if (step.action === "scroll") return session.send("Input.dispatchMouseEvent", { type: "mouseWheel", x: step.x, y: step.y, deltaX: 0, deltaY: step.delta_y });
  let target;
  if (step.action === "move") target = { x: step.x, y: step.y };
  else {
    const state = await elementState(session, step.selector);
    if (!state.visible || state.disabled) throw browserError("action target is not visible or enabled", "BROWSER_TARGET_NOT_ACTIONABLE");
    target = { x: state.x, y: state.y };
  }
  const duration = step.action === "click" ? 0 : step.duration_ms;
  const count = Math.max(1, Math.ceil(duration / 16));
  const from = cursor.x === null ? target : cursor;
  for (let index = 1; index <= count; index += 1) {
    const part = index / count;
    const x = Math.round(from.x + (target.x - from.x) * part);
    const y = Math.round(from.y + (target.y - from.y) * part);
    await session.send("Input.dispatchMouseEvent", { type: "mouseMoved", x, y });
    if (index < count) await delay(duration / count);
  }
  cursor.x = target.x;
  cursor.y = target.y;
  if (step.action === "click") {
    await session.send("Input.dispatchMouseEvent", { type: "mousePressed", x: target.x, y: target.y, button: "left", clickCount: 1 });
    await session.send("Input.dispatchMouseEvent", { type: "mouseReleased", x: target.x, y: target.y, button: "left", clickCount: 1 });
  }
}
