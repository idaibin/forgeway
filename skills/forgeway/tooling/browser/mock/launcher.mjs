/** Detached browser owner. IPC carries startup inputs; URLs never enter argv/state. */
import { chromium } from 'playwright-core';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { semanticDigest } from './config.mjs';
import { applyScenario } from './control.mjs';
import { SESSION_VERSION, sessionFile } from './session.mjs';
const root = process.argv[2];
let ownedContext;
process.once('SIGTERM', async () => {
  await ownedContext?.close().catch(() => {});
  process.exit(1);
});
process.once('message', async input => {
  let context;
  let phase = 'launch';
  try {
    context = await chromium.launchPersistentContext(path.join(root, 'profile'), {
      executablePath: input.chrome, headless: input.headless,
      viewport: input.viewport,
      ignoreDefaultArgs: ['--disable-extensions'],
      args: ['--enable-automation', '--remote-debugging-port=0', `--window-size=${input.viewport.width},${input.viewport.height + 80}`, '--disable-extensions-except=' + path.join(root, 'extension'), '--load-extension=' + path.join(root, 'extension')]
    });
    ownedContext = context;
    phase = 'extension';
    const worker = context.serviceWorkers().find(w => w.url().endsWith('/background.js')) || await context.waitForEvent('serviceworker', { timeout: 10000 });
    const identity = await worker.evaluate(() => ({ id: chrome.runtime.id, version: chrome.runtime.getManifest().version_name }));
    if (identity.version !== input.launchIdentity) throw new Error('Extension identity mismatch');
    const manager = await context.newPage();
    await manager.goto(`chrome-extension://${identity.id}/manager.html`);
    await manager.waitForFunction(() => !!document.getElementById('project-title'), { timeout: 10000 });
    const send = async message => {
      const result = await manager.evaluate(message => chrome.runtime.sendMessage(message), message);
      if (!result?.ok) throw new Error(result?.error || 'Extension operation failed');
      return result.value;
    };
    phase = 'prepare';
        const target = await context.newPage();
    const marker = 'Forgeway Mock ' + input.launchIdentity;
    await target.evaluate(marker => { document.title = marker; }, marker);
    const tabId = await manager.evaluate(async marker => {
      const matches = (await chrome.tabs.query({})).filter(t => t.title === marker && t.url === 'about:blank');
      return matches.length === 1 ? matches[0].id : null;
    }, marker);
    if (!Number.isInteger(tabId)) throw new Error('Target tab identity mismatch');
    const project = input.config.projects.find(p => p.id === input.projectId);
    const selected = { project, environment: project.environments.find(e => e.id === input.environmentId), scenario: project.scenarios.find(s => s.id === input.scenarioId), target: new URL(input.url) };
    phase = 'activate';
    const checks = await applyScenario({ config: input.config, selected, tabId,
      send: (type, data = {}) => send({ type, ...data }),
      navigate: url => target.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 }),
      readPage: async () => {
        await target.locator('#__tab_mock_indicator').waitFor({ state: 'attached', timeout: 10000 });
        return target.evaluate(() => ({ url: location.origin + location.pathname, indicator: !!document.getElementById('__tab_mock_indicator') }));
      }
    });
    const actualPage = await target.evaluate(() => ({ origin: location.origin, path: location.pathname, viewport: { width: innerWidth, height: innerHeight } }));
    if (actualPage.viewport.width !== input.viewport.width || actualPage.viewport.height !== input.viewport.height) throw new Error('Owned target viewport readback mismatch');
    const port = Number(readFileSync(path.join(root, 'profile', 'DevToolsActivePort'), 'utf8').split('\n')[0]);
    if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid browser endpoint');
    const targetSession = await context.newCDPSession(target), managerSession = await context.newCDPSession(manager);
    const targetId = (await targetSession.send('Target.getTargetInfo')).targetInfo.targetId;
    const managerId = (await managerSession.send('Target.getTargetInfo')).targetInfo.targetId;
    await targetSession.detach(); await managerSession.detach();
    const state = { schema_version: SESSION_VERSION, session_root: root, endpoint: 'http://127.0.0.1:' + port, launcher_pid: process.pid, extension_id: identity.id, target_id: targetId, manager_target_id: managerId, tab_id: tabId, config_sha256: input.sha256, config_semantic_sha256: semanticDigest(input.config), project_id: input.projectId, environment_id: input.environmentId, scenario_id: input.scenarioId, page_origin: input.pageOrigin, page_path: input.pagePath };
    writeFileSync(sessionFile(root), JSON.stringify(state, null, 2) + '\n', { mode: 0o600 });
    process.send?.({ ok: true, value: { schema_version: SESSION_VERSION, status: 'active', checks, actual_page: actualPage, navigation_error: false, session: root, endpoint: state.endpoint, target_id: targetId, config_sha256: input.sha256, browser_retained: true, authorizes_delivery: false } });
    process.disconnect?.();
    await new Promise(resolve => context.once('close', resolve));
    process.exit(0);
  } catch (error) {
    process.send?.({ ok: false, error: `Mock ${phase} failed: ${String(error.message).split('\n')[0].replace(/https?:\/\/\S+/g, '<url>')}` });
    await context?.close().catch(() => {});
    process.exit(1);
  }
});
