import http from 'node:http';
import https from 'node:https';
import { gunzipSync, inflateSync, brotliDecompressSync } from 'node:zlib';
import { timingSafeEqual } from 'node:crypto';
import './extension/core.js';
import { selectMock, semanticDigest } from './config.mjs';
import { fallbackNeeded, response } from './response.mjs';
const core = globalThis.TabMockCore;
const MAX = 16 * 1024 * 1024;
const CONTROL = '/__forgeway_mock/';
export const TOKEN_HEADER = 'x-forgeway-mock-token';
const cleanHeaders = headers => {
  const omit = new Set(['connection', 'keep-alive', 'proxy-authenticate', 'proxy-authorization', 'te', 'trailer', 'transfer-encoding', 'upgrade', TOKEN_HEADER, ...(String(headers.connection || '').toLowerCase().split(',').map(x => x.trim()))]);
  return Object.fromEntries(Object.entries(headers).filter(([key]) => !omit.has(key.toLowerCase())));
};
async function bodyOf(stream, maxBytes = MAX) {
  const chunks = []; let size = 0;
  for await (const bytes of stream) { size += bytes.length; if (size > maxBytes) throw Error('Body limit exceeded'); chunks.push(bytes); }
  return Buffer.concat(chunks);
}
function authorized(actual, expected) {
  if (typeof actual !== 'string') return false;
  const a = Buffer.from(actual), b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}
function selectedConfig(config, settings) {
  const validated = core.validateConfig(config), selected = selectMock(validated, settings);
  if (!selected.environment.apis.some(a => a.origin === settings.apiOrigin)) throw Error('API origin is outside environment');
  if (selected.scenario.rules.some(r => r.semantics === 'write' && r.action === 'pass')) throw Error('Proxy cannot permit real writes');
  return { environment: selected.environment, scenario: selected.scenario, hash: semanticDigest(validated) };
}
function upstreamResponse(url, incoming, body, signal) {
  return new Promise((resolve, reject) => {
    const headers = cleanHeaders(incoming.headers); headers.host = url.host;
    const upstream = (url.protocol === 'https:' ? https : http).request(url, { method: incoming.method, headers, signal }, async live => {
      try { resolve({ status: live.statusCode, headers: cleanHeaders(live.headers), body: await bodyOf(live) }); }
      catch (error) { live.destroy(); reject(error); }
    });
    upstream.setTimeout(10000, () => upstream.destroy(Object.assign(Error('Upstream timed out'), { code: 'FORGEWAY_UPSTREAM_TIMEOUT' })));
    upstream.on('error', reject); upstream.end(body);
  });
}
function decoded(live) {
  const encoding = live.headers['content-encoding'];
  try {
    const options = { maxOutputLength: MAX };
    const bytes = encoding === 'gzip' ? gunzipSync(live.body, options) : encoding === 'deflate' ? inflateSync(live.body, options) : encoding === 'br' ? brotliDecompressSync(live.body, options) : !encoding || encoding === 'identity' ? live.body : null;
    return bytes?.toString('utf8') || '';
  } catch { return ''; }
}
const delay = (ms, signal) => new Promise((resolve, reject) => {
  if (signal.aborted) { reject(Error('Cancelled')); return; }
  const abort = () => { clearTimeout(timer); reject(Error('Cancelled')); };
  const timer = setTimeout(() => { signal.removeEventListener('abort', abort); resolve(); }, ms);
  signal.addEventListener('abort', abort, { once: true });
});
export async function startProxy(settings, config) {
  const upstream = new URL(settings.upstream);
  if (!['http:', 'https:'].includes(upstream.protocol) || upstream.username || upstream.password || upstream.search || upstream.hash) throw Error('Invalid upstream URL');
  if (upstream.origin === settings.apiOrigin) throw Error('Upstream must be an explicit distinct origin');
  const prefix = settings.stripPrefix;
  if (typeof prefix !== 'string' || !prefix.startsWith('/') || new URL(prefix, 'http://valid.test').pathname !== prefix || /[?#\\]/.test(prefix)) throw Error('Invalid strip prefix');
  let snapshot = selectedConfig(config, settings), closing = false;
  const originalEnvironment = JSON.stringify(snapshot.environment);
  const controllers = new Set(), jobs = new Set(), counts = { mock: 0, pass: 0, block: 0, error: 0 }, logs = [];
  const log = (rule, outcome) => { counts[outcome]++; logs.push({ ruleId: rule.id || 'outside', outcome }); if (logs.length > 100) logs.shift(); };
  let stopPromise;
  const status = () => ({ instanceId: settings.instanceId, status: closing ? 'stopping' : 'active', config_sha256: snapshot.hash, projectId: settings.projectId, environmentId: settings.environmentId, scenarioId: settings.scenarioId, pending: controllers.size, counts: { ...counts }, logs: [...logs] });
  const json = (res, code, value) => { res.writeHead(code, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(value)); };
  const server = http.createServer((req, res) => {
    const job = handle(req, res).catch(error => { counts.error++; if (!res.headersSent) json(res, error.code === 'FORGEWAY_UPSTREAM_TIMEOUT' ? 504 : 502, { error: 'Mock proxy request failed' }); else res.destroy(); }).finally(() => jobs.delete(job)); jobs.add(job);
  });
  async function handle(req, res) {
    if (!authorized(req.headers[TOKEN_HEADER], settings.token) || req.headers.origin && req.url.startsWith(CONTROL)) { json(res, 403, { error: 'Proxy authorization required' }); return; }
    if (closing) { json(res, 503, { error: 'Proxy stopping' }); return; }
    if (req.url.startsWith(CONTROL)) {
      if (req.url === CONTROL + 'status' && req.method === 'GET') { json(res, 200, status()); return; }
      if (req.url === CONTROL + 'update' && req.method === 'POST') {
        try {
          const input = JSON.parse((await bodyOf(req, Infinity)).toString());
          if (Object.keys(input).length !== 1 || !Object.hasOwn(input, 'config')) throw Error('Expected config');
          const next = selectedConfig(input.config, settings);
          if (JSON.stringify(next.environment) !== originalEnvironment) throw Error('Update cannot change environment scope');
          snapshot = next; json(res, 200, status());
        } catch { json(res, 400, { error: 'Invalid proxy update; current configuration retained' }); }
        return;
      }
      if (req.url === CONTROL + 'stop' && req.method === 'POST') { json(res, 200, { instanceId: settings.instanceId, stopping: true }); setImmediate(() => stop()); return; }
      json(res, 404, { error: 'Unknown control operation' }); return;
    }
    if (!req.url.startsWith('/') || req.url.startsWith('//')) { json(res, 400, { error: 'Expected origin-form path' }); return; }
    const logical = new URL(req.url, settings.apiOrigin), current = snapshot;
    const scope = current.environment.apis.some(a => a.origin === logical.origin && core.within(logical.pathname, a.pathPrefix));
    if (!scope || !core.within(logical.pathname, prefix)) { log({ id: 'outside' }, 'block'); json(res, 403, { error: 'Outside proxy API scope' }); return; }
    const controller = new AbortController(); controllers.add(controller);
    const cancelled = () => { if (!res.writableEnded) controller.abort(); };
    req.on('aborted', cancelled); res.on('close', cancelled);
    const deadline = setTimeout(() => { controller.abort(); if (!res.headersSent) json(res, 504, { error: 'Proxy request timed out' }); else res.destroy(); }, 75000);
    try {
      const body = await bodyOf(req);
      const rule = core.select(current, { pageURL: settings.url, url: logical.href, method: req.method, body: core.parseBody(body.toString()) });
      if (rule.action === 'block') { log(rule, 'block'); json(res, 403, { error: 'Mock rule blocked request' }); return; }
      let live;
      if (rule.action === 'pass' || rule.fallback) {
        const destination = new URL(upstream.href);
        const suffix = prefix === '/' ? logical.pathname : logical.pathname.slice(prefix.length);
        destination.pathname = upstream.pathname.replace(/\/$/, '') + '/' + suffix.replace(/^\//, ''); destination.search = logical.search;
        live = await upstreamResponse(destination, req, body, controller.signal);
        if (controller.signal.aborted) throw Error('Cancelled');
        if (rule.action === 'pass' || !fallbackNeeded(rule, live.status, decoded(live))) {
          log(rule, 'pass'); res.writeHead(live.status, live.headers); res.end(live.body); return;
        }
      }
      await delay(rule.response.delayMs, controller.signal);
      const out = response(rule); log(rule, 'mock'); res.writeHead(out.status, out.headers); res.end(out.body);
    } finally { clearTimeout(deadline); controllers.delete(controller); req.off('aborted', cancelled); res.off('close', cancelled); }
  }
  server.headersTimeout = 10000; server.requestTimeout = 15000;
  server.on('connect', (req, socket) => socket.end('HTTP/1.1 405 Method Not Allowed\r\n\r\n'));
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(settings.port || 0, '127.0.0.1', resolve); });
  async function stop() {
    if (stopPromise) return stopPromise;
    closing = true;
    stopPromise = (async () => { const closed = new Promise(resolve => server.close(resolve)); for (const controller of controllers) controller.abort(); server.closeAllConnections(); await closed; await Promise.allSettled([...jobs]); await settings.onStopped?.(); })();
    return stopPromise;
  }
  return { endpoint: 'http://127.0.0.1:' + server.address().port, status, stop };
}
