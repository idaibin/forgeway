import { fallbackNeeded, response } from './response.mjs';
import './extension/core.js';
const core = globalThis.TabMockCore;
const abortError = () => new Error('Temporary Mock cancelled');
const bounded = (promise, ms, label) => new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error(label + ' timed out')), ms);
  Promise.resolve(promise).then(value => { clearTimeout(timer); resolve(value); }, error => { clearTimeout(timer); reject(error); });
});
function selection(options) {
  const config = core.validateConfig(options.config);
  const project = config.projects.find(p => p.id === options.projectId);
  const environment = project?.environments.find(e => e.id === options.environmentId);
  const scenario = project?.scenarios.find(s => s.id === options.scenarioId);
  const target = new URL(options.url);
  if (target.username || target.password) throw Error('Temporary target URL must not include credentials');
  if (!project || !environment || !scenario || !core.inPage(options.url, environment)) throw Error('Temporary Mock selection or URL is invalid');
  if (scenario.rules.some(r => r.action === 'pass' && r.semantics === 'write')) throw Error('Temporary Mock cannot permit real writes');
  if (options.ownership !== 'disposable-task-target') throw Error('Temporary Mock requires a disposable task-owned target');
  return { environment, scenario };
}
class Lifecycle {
  constructor(snapshot, signal) { this.snapshot = snapshot; this.signal = signal; this.pending = new Map(); this.jobs = new Set(); this.timers = new Map(); this.logs = []; this.errors = []; this.active = false; }
  log(rule, outcome) { this.logs.push({ ruleId: rule.id || 'outside', outcome }); if (this.logs.length > 1000) this.logs.shift(); }
  async wait(ms) {
    if (this.signal.aborted || !this.active) throw abortError();
    if (!ms) return;
    await new Promise((resolve, reject) => { const timer = setTimeout(() => { this.timers.delete(timer); resolve(); }, ms); this.timers.set(timer, reject); });
    if (this.signal.aborted || !this.active) throw abortError();
  }
  cancelTimers() { for (const [timer, reject] of this.timers) { clearTimeout(timer); reject(abortError()); } this.timers.clear(); }
  track(job) { const watched = Promise.resolve(job).catch(error => this.errors.push(error.message)).finally(() => this.jobs.delete(watched)); this.jobs.add(watched); }
  summary() { return { active: this.active, pending: this.pending.size, timers: this.timers.size, errors: [...this.errors], logs: [...this.logs] }; }
}
class PlaywrightTemporary extends Lifecycle {
  constructor(snapshot, signal, page) { super(snapshot, signal); this.page = page; this.pattern = '**/*'; this.handler = route => this.handle(route); }
  async start() { this.active = true; await this.page.route(this.pattern, this.handler); }
  async handle(route) {
    const request = route.request();
    if (!['fetch', 'xhr'].includes(request.resourceType()) || request.frame() !== this.page.mainFrame()) return route.fallback();
    const rule = core.select(this.snapshot, { pageURL: this.page.url(), url: request.url(), method: request.method(), body: core.parseBody(request.postData()) });
    if (rule.action === 'pass') { this.log(rule, 'pass'); return route.fallback(); }
    const id = route; this.pending.set(id, route);
    const job = (async () => {
      let live;
      try {
        if (!this.active || this.signal.aborted) throw abortError();
        if (rule.action === 'block') { this.log(rule, 'block'); await route.abort('blockedbyclient'); return; }
        if (rule.fallback) {
          try { live = await route.fetch({ maxRedirects: 0, maxRetries: 0, timeout: 10000 }); }
          catch { this.log(rule, 'network-error'); await route.abort('failed').catch(() => {}); return; }
          if (!fallbackNeeded(rule, live.status(), await live.text())) { this.log(rule, 'pass'); await route.fulfill({ response: live }); return; }
        }
        await this.wait(rule.response.delayMs); const out = response(rule);
        await route.fulfill(out); this.log(rule, 'mock');
      } catch (error) { await route.abort('aborted').catch(() => {}); if (!this.signal.aborted && this.active) this.errors.push(error.message); }
      finally { this.pending.delete(id); await live?.dispose(); }
    })();
    this.track(job); await job;
  }
  async close() {
    this.active = false; this.cancelTimers();
    await Promise.allSettled([...this.pending.values()].map(route => route.abort('aborted')));
    await bounded(Promise.allSettled([...this.jobs]), 12000, 'Playwright request cleanup');
    await this.page.unroute(this.pattern, this.handler);
    return this.summary();
  }
}
class CdpTemporary extends Lifecycle {
  constructor(snapshot, signal, host) { super(snapshot, signal); this.host = host; this.cursor = 0; this.seen = new Set(); this.responseRules = new Map(); this.unsafeToRelease = false; }
  async start() {
    const state = await this.host.pageState();
    if (!core.inPage(state.url, this.snapshot.environment) || !state.frameId) throw Error('CDP target scope/frame not verified');
    this.frameId = state.frameId;
    this.cursor = (await this.host.readEvents({ methods: ['Fetch.requestPaused'] })).cursor;
    const patterns = this.snapshot.environment.apis.flatMap(api => ['Fetch', 'XHR'].flatMap(resourceType => ['Request', 'Response'].map(requestStage => ({ urlPattern: api.origin + api.pathPrefix + '*', resourceType, requestStage }))));
    this.active = true;
    try { await this.host.send('Fetch.enable', { patterns }); } catch (error) { this.active = false; throw error; }
    this.loop = this.pump();
  }
  async pump() {
    while (this.active) {
      try {
        const page = await this.host.readEvents({ methods: ['Fetch.requestPaused'], afterSequence: this.cursor, limit: 100, timeoutMs: 100 });
        if (page.truncated) throw Error('CDP interception events were truncated');
        this.cursor = page.cursor;
        for (const event of page.events) {
          const p = event.params, stage = p.responseStatusCode !== undefined || p.responseErrorReason ? 'response' : 'request', key = p.requestId + ':' + stage;
          if (this.seen.has(key)) continue;
          this.seen.add(key); if (this.seen.size > 10000) throw Error('Temporary request limit exceeded');
          const record = { paused: p, claimed: false }; this.pending.set(key, record);
          this.track(this.handle(p, stage, record));
        }
      } catch (error) { if (this.active) { this.errors.push(error.message); this.unsafeToRelease = true; } this.active = false; }
    }
  }
  async terminal(record, method, params) {
    if (record.claimed) return; record.claimed = true;
    try { return await this.host.send(method, params); } catch (error) { this.unsafeToRelease = true; throw error; }
  }
  async handle(p, stage, record) {
    const id = p.requestId;
    try {
      if (!this.active || this.signal.aborted) { await this.terminal(record, 'Fetch.failRequest', { requestId: id, errorReason: 'Aborted' }); return; }
      if (p.frameId !== this.frameId) { await this.terminal(record, 'Fetch.continueRequest', { requestId: id }); return; }
      let rule;
      if (stage === 'response') rule = this.responseRules.get(id);
      else { const state = await this.host.pageState(); rule = core.select(this.snapshot, { pageURL: state.url, url: p.request.url, method: p.request.method, body: core.parseBody(p.request.postData) }); }
      if (!rule || rule.action === 'pass') { if (rule) this.log(rule, 'pass'); await this.terminal(record, 'Fetch.continueRequest', { requestId: id }); return; }
      if (rule.action === 'block') { this.log(rule, 'block'); await this.terminal(record, 'Fetch.failRequest', { requestId: id, errorReason: 'BlockedByClient' }); return; }
      if (stage === 'request' && rule.fallback) { this.responseRules.set(id, rule); await this.terminal(record, 'Fetch.continueRequest', { requestId: id }); return; }
      if (stage === 'response' && rule.fallback) {
        if (p.responseErrorReason) { this.log(rule, 'network-error'); await this.terminal(record, 'Fetch.continueRequest', { requestId: id }); return; }
        let text = '';
        if (!rule.fallback.statuses.includes(p.responseStatusCode) && p.responseStatusCode >= 200 && p.responseStatusCode < 300) { const body = await this.host.send('Fetch.getResponseBody', { requestId: id }); text = body.base64Encoded ? Buffer.from(body.body, 'base64').toString('utf8') : body.body; }
        if (!fallbackNeeded(rule, p.responseStatusCode, text)) { this.log(rule, 'pass'); await this.terminal(record, 'Fetch.continueRequest', { requestId: id }); return; }
      }
      await this.wait(rule.response.delayMs); const out = response(rule);
      await this.terminal(record, 'Fetch.fulfillRequest', { requestId: id, responseCode: out.status, responseHeaders: Object.entries(out.headers).map(([name, value]) => ({ name, value })), body: out.body.toString('base64') }); this.log(rule, 'mock');
    } catch (error) { await this.terminal(record, 'Fetch.failRequest', { requestId: id, errorReason: 'Aborted' }).catch(() => {}); if (this.active && !this.signal.aborted) this.errors.push(error.message); }
    finally { this.pending.delete(id + ':' + stage); if (stage === 'response' || !this.responseRules.has(id)) this.responseRules.delete(id); }
  }
  async close() {
    this.active = false; this.cancelTimers();
    await bounded(this.loop, 3000, 'CDP event loop cleanup');
    await Promise.allSettled([...this.pending.values()].map(record => this.terminal(record, 'Fetch.failRequest', { requestId: record.paused.requestId, errorReason: 'Aborted' })));
    await bounded(Promise.allSettled([...this.jobs]), 12000, 'CDP request cleanup');
    if (this.unsafeToRelease) throw Error('CDP request acknowledgement or event capture lost; dispose target with protection active');
    await this.host.clearInterception(); this.responseRules.clear();
    return this.summary();
  }
}
export function createBrowserUseCdpHost(capability) {
  if (typeof capability?.send !== 'function' || typeof capability?.readEvents !== 'function') throw Error('Browser Use CDP capability is required');
  return {
    send: (method, params) => capability.send(method, params),
    readEvents: options => capability.readEvents(options),
    pageState: async () => { const result = await capability.send('Page.getFrameTree', {}); return { url: result.frameTree.frame.url, frameId: result.frameTree.frame.id }; },
    clearInterception: () => capability.send('Fetch.enable', { patterns: [] })
  };
}
export function createPlaywrightCdpHost(page, session) {
  let sequence = 0; const events = []; let cursor = 0;
  const listener = params => { events.push({ method: 'Fetch.requestPaused', params, sequence: ++sequence }); if (events.length > 10000) events.shift(); };
  session.on('Fetch.requestPaused', listener);
  return {
    send: (method, params) => session.send(method, params),
    pageState: async () => ({ url: page.url(), frameId: (await session.send('Page.getFrameTree')).frameTree.frame.id }),
    readEvents: async ({ afterSequence = sequence, timeoutMs = 0 } = {}) => { if (afterSequence >= sequence && timeoutMs) await new Promise(resolve => setTimeout(resolve, timeoutMs)); cursor = sequence; return { cursor, events: events.filter(e => e.sequence > afterSequence), truncated: events.length > 0 && afterSequence < events[0].sequence - 1 }; },
    clearInterception: () => session.send('Fetch.disable'),
    detach: async () => { session.off('Fetch.requestPaused', listener); await session.detach(); }
  };
}
export async function withTemporaryMock(options, run) {
  const snapshot = selection(options);
  if (typeof run !== 'function' || typeof options.verifyRestored !== 'function' || typeof options.dispose !== 'function') throw Error('Temporary Mock requires run, verifyRestored and dispose callbacks');
  const timeout = options.timeoutMs ?? 30000;
  if (!Number.isSafeInteger(timeout) || timeout < 100 || timeout > 60000) throw Error('Temporary timeout must be 100–60000 ms');
  if (!['playwright', 'cdp'].includes(options.driver)) throw Error('Temporary driver must be playwright or cdp');
  const controller = new AbortController(); const abort = () => controller.abort(); options.signal?.addEventListener('abort', abort, { once: true }); if (options.signal?.aborted) abort();
  const engine = options.driver === 'playwright' ? new PlaywrightTemporary(snapshot, controller.signal, options.page) : new CdpTemporary(snapshot, controller.signal, options.host);
  const result = { status: 'failed', cleanup: null, restoration: null, disposal: null, errors: [] }; let value, startup;
  try {
    if (controller.signal.aborted) throw abortError();
    startup = engine.start(); await bounded(startup, timeout, 'Temporary startup');
    const cancelled = new Promise((_, reject) => controller.signal.addEventListener('abort', () => reject(abortError()), { once: true }));
    value = await bounded(Promise.race([Promise.resolve().then(() => run({ signal: controller.signal })), cancelled]), timeout, 'Temporary execution');
  } catch (error) { result.errors.push(error.message); }
  finally {
    controller.abort();
    if (startup) { try { await bounded(startup, 12000, 'Startup settlement'); } catch (error) { result.errors.push(error.message); } }
    try { result.cleanup = await engine.close(); if (result.cleanup.pending || result.cleanup.timers || result.cleanup.errors.length) throw Error('Temporary request cleanup not verified'); } catch (error) { result.errors.push(error.message); }
    if (result.cleanup && !result.cleanup.pending && !result.cleanup.timers) {
      try { result.restoration = await bounded(options.verifyRestored(), timeout, 'Original response verification'); if (result.restoration?.restored !== true) throw Error('Original response restoration not verified'); } catch (error) { result.errors.push(error.message); }
    }
    try { result.disposal = await bounded(options.dispose(), 10000, 'Target disposal'); if (result.disposal?.closed !== true) throw Error('Temporary target closure not verified'); } catch (error) { result.errors.push(error.message); }
    options.signal?.removeEventListener('abort', abort);
  }
  if (!result.errors.length) { result.status = 'passed'; result.value = value; }
  return result;
}
