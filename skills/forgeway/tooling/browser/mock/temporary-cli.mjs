import { readFileSync, mkdirSync, existsSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright-core';
import { readMockConfig, selectMock, semanticDigest } from './config.mjs';
import { withTemporaryMock, createPlaywrightCdpHost } from './temporary.mjs';
import { parseViewport } from './viewport.mjs';
const step = (work, timeout, signal) => new Promise((resolve, reject) => {
  const abort = () => { clearTimeout(timer); reject(Error('Temporary project preflight cancelled')); };
  const timer = setTimeout(() => { signal.removeEventListener('abort', abort); reject(Error('Temporary project preflight timed out')); }, timeout);
  signal.addEventListener('abort', abort, { once: true }); if (signal.aborted) abort();
  Promise.resolve(work).then(v => { clearTimeout(timer); signal.removeEventListener('abort', abort); resolve(v); }, e => { clearTimeout(timer); signal.removeEventListener('abort', abort); reject(e); });
});
const one = (flags, key) => { if (!Array.isArray(flags[key]) || flags[key].length !== 1) throw Error('--' + key + ' requires exactly one value'); return flags[key][0]; };
export async function temporaryCommand(flags) {
  const allowed = ['config', 'project', 'environment', 'scenario', 'url', 'driver', 'chrome', 'flow', 'out', 'timeout-ms', 'viewport', 'json', 'compact'];
  for (const key of Object.keys(flags)) if (!allowed.includes(key)) throw Error('Unsupported temporary option --' + key);
  const { config } = readMockConfig(one(flags, 'config'));
  const projectId = one(flags, 'project'), environmentId = one(flags, 'environment'), scenarioId = one(flags, 'scenario'), url = one(flags, 'url');
  const selected = selectMock(config, { projectId, environmentId, scenarioId, url });
  if (selected.scenario.rules.some(r => r.action === 'pass' && r.semantics === 'write')) throw Error('Temporary Mock cannot permit real writes');
  const driver = one(flags, 'driver'); if (!['playwright', 'cdp'].includes(driver)) throw Error('--driver must be playwright or cdp');
  const timeoutMs = flags['timeout-ms'] ? Number(one(flags, 'timeout-ms')) : 30000;
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 100 || timeoutMs > 60000) throw Error('Temporary timeout must be 100–60000 ms');
  const viewport = parseViewport(flags.viewport === undefined ? undefined : one(flags, 'viewport'));
  const chrome = path.resolve(one(flags, 'chrome')); if (!existsSync(chrome)) throw Error('Chrome executable not found');
  const flowFile = path.resolve(one(flags, 'flow')); readFileSync(flowFile);
  const flow = await import(pathToFileURL(flowFile).href);
  if (typeof flow.run !== 'function' || typeof flow.verifyRestored !== 'function') throw Error('Project flow requires run and verifyRestored exports');
  const out = path.resolve(one(flags, 'out')); if (existsSync(out)) throw Error('--out must be a new task-owned directory'); mkdirSync(out, { mode: 0o700 });
  let browser, context, host; let result;
  const controller = new AbortController(), interrupt = () => controller.abort();
  process.once('SIGINT', interrupt); process.once('SIGTERM', interrupt);
  try {
    browser = await chromium.launch({ executablePath: chrome, headless: true });
    context = await browser.newContext({ viewport, serviceWorkers: 'block' });
    const page = await context.newPage();
    const actualViewport = await page.evaluate(() => ({ width: innerWidth, height: innerHeight }));
    if (actualViewport.width !== viewport.width || actualViewport.height !== viewport.height) throw Error('Temporary viewport readback mismatch');
    await step(flow.prepare?.({ page, context }), timeoutMs, controller.signal);
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: timeoutMs });
    await step(flow.before?.({ page, context }), timeoutMs, controller.signal);
    if (driver === 'cdp') host = createPlaywrightCdpHost(page, await context.newCDPSession(page));
    result = await withTemporaryMock({ config, projectId, environmentId, scenarioId, url, driver, page, host, timeoutMs, ownership: 'disposable-task-target', signal: controller.signal,
      verifyRestored: () => flow.verifyRestored({ page, context }),
      dispose: async () => { await context.close(); await browser.close(); return { closed: !browser.isConnected() && browser.contexts().length === 0 }; }
    }, ({ signal }) => flow.run({ page, context, signal }));
  } catch (error) { result = { status: 'failed', errors: [error.message] }; }
  finally {
    await context?.close().catch(() => {}); await browser?.close().catch(() => {});
    process.removeListener('SIGINT', interrupt); process.removeListener('SIGTERM', interrupt);
  }
  result.driver = driver; result.config_sha256 = semanticDigest(config); result.headless = true; result.foreground_requested = false; result.viewport = viewport;
  result.browser_closed = !browser || !browser.isConnected();
  writeFileSync(path.join(out, 'result.json'), JSON.stringify(result, null, 2) + '\n', { mode: 0o600 });
  if (result.status !== 'passed' || !result.browser_closed) throw Error('Temporary Mock failed; inspect ' + path.join(out, 'result.json'));
  return result;
}
